"""Paused products fail closed before data, models, embeddings or payments."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import json
from pathlib import Path
import subprocess

import httpx
import pytest
from fastapi import HTTPException

from app.core.feature_pause import FeaturePauseMiddleware, model_pause_guard, paused_conversation

PAUSED_URLS = [
    '/api/portfolio-health/latest', '/api/portfolio-health/generate',
    '/api/research-kb/chat', '/api/kol_research/personas/qinbafrank/profile',
    '/api/kol_research/personas/aleabitoreddit/tickers',
    '/api/kol_research/personas/qinbafrank/mcp/context', '/api/kol_research/mcp/auth/start',
    '/api/community/panda/chat', '/api/zsxq/ingest',
    '/api/watchlist-monitor/for-you', '/api/admin/watchlist-monitor/start-paid-universe',
    '/frank/mcp', '/mcp', '/api/mcp/auth/exchange', '/api/okx-mcp/persona-context',
    '/api/user/onboarding-status', '/api/user/onboarding/complete',
    '/api/cron/onboarding-emails', '/api/vector/index-kol-tweets',
    '/api/vector/search', '/api/vector/context',
    '/api/twitter/extract-methodology', '/api/twitter/ticker-discussion/AAPL',
]

@pytest.mark.asyncio
@pytest.mark.parametrize('url', PAUSED_URLS)
@pytest.mark.parametrize('method', ['GET', 'POST'])
async def test_no_request_reaches_application(url, method):
    downstream = AsyncMock()
    transport = httpx.ASGITransport(app=FeaturePauseMiddleware(downstream))
    async with httpx.AsyncClient(transport=transport, base_url='http://unit') as client:
        response = await client.request(method, url, headers={
            'Authorization': 'Bearer old-paid-or-mcp-token', 'X-Cron-Secret': 'cron',
            'X-PAYMENT': 'existing-payment',
        })
    assert response.status_code == 403
    assert response.json()['detail']['code'] == 'feature_paused'
    assert response.headers['cache-control'] == 'no-store'
    downstream.assert_not_called()

@pytest.mark.asyncio
@pytest.mark.parametrize('url', [
    '/health', '/api/research/chat', '/api/brew/latest', '/api/user/watchlist', '/api/portfolio',
    '/api/kol_research/personas', '/api/kol_research/chat', '/api/kol_research/chat/stream',
    '/api/kol_research/conversations', '/api/kol_research/conversations/old',
    '/api/agent-runtime/sessions/old?agent_id=kol_research_agent',
])
async def test_core_paths_still_reach_application(url):
    async def app(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 204, 'headers': []})
        await send({'type': 'http.response.body', 'body': b''})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=FeaturePauseMiddleware(app)), base_url='http://unit') as client:
        assert (await client.post(url)).status_code == 204

@pytest.mark.asyncio
@pytest.mark.parametrize('app_module', ['app.main', 'app.okx_main'])
async def test_actual_apps_deny_mcp_before_auth_or_payment(app_module):
    import importlib
    app = importlib.import_module(app_module).app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://unit') as client:
        for url in ['/frank/mcp', '/api/mcp/auth/exchange', '/api/okx-mcp/persona-context']:
            assert (await client.post(url, json={})).status_code == 403

@pytest.mark.asyncio
async def test_direct_generators_and_embeddings_have_no_outbound_calls(monkeypatch):
    from google import genai
    from app.features.research_kb import agent as kb, service as kb_service
    from app.features.kol_research import agent as kol
    from app.features.vector import kol_tweets, service as vector
    from app.features.vector.models import VectorIndexRequest, VectorDocumentInput
    from app.shared.llm_clients import structured

    model = Mock(side_effect=AssertionError('unexpected model call'))
    network = AsyncMock(side_effect=AssertionError('unexpected network call'))
    embedding = AsyncMock(side_effect=AssertionError('unexpected embedding call'))
    monkeypatch.setattr(genai, 'Client', model)
    monkeypatch.setattr(httpx.AsyncClient, 'send', network)
    monkeypatch.setattr(vector, 'embed_texts', embedding)
    monkeypatch.setattr(structured, 'create_chat_completion', network)
    calls = [
        lambda: kb.answer('test', []), lambda: kb_service.retrieve('test'),
        lambda: kol.answer_kol_research(message='test', persona_username='pandacircle'),
        lambda: anext(kol.stream_kol_research(message='test', persona_username='pandacircle')),
        lambda: kol.generate_kol_follow_up_options(
            user_message='test', assistant_message='test', persona_username='pandacircle',
        ),
        lambda: kol_tweets.index_kol_tweets(None),
    ]
    for source in ['kol_tweet', 'zsxq_thread', 'zsxq_article', 'zsxq_qa']:
        req = VectorIndexRequest(document=VectorDocumentInput(source_type=source, source_id='id', content='test'))
        calls.append(lambda req=req: vector.index_document(req))
    for call in calls:
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == 403
    model.assert_not_called()
    network.assert_not_called()
    embedding.assert_not_called()


def test_existing_agent_callback_and_history_are_paused():
    for feature in ['kol_research', 'research_kb']:
        with pytest.raises(HTTPException):
            model_pause_guard(feature)(None, None)
    assert paused_conversation({'metadata': {'agent_id': 'kol_research_agent'}})
    assert paused_conversation({'data': {'persona_username': 'panda'}})
    assert not paused_conversation({'data': {'agent_kind': 'research'}})

@pytest.mark.asyncio
async def test_standalone_mcp_never_calls_tool():
    from app.frank_mcp.middleware import AccessGateMiddleware
    from fastmcp.exceptions import ToolError
    next_handler = AsyncMock()
    with pytest.raises(ToolError):
        await AccessGateMiddleware().on_request(None, next_handler)
    next_handler.assert_not_called()

@pytest.mark.asyncio
async def test_old_kol_history_cannot_be_read_or_deleted(monkeypatch):
    from app.features.screener import router, conversation_db
    get = AsyncMock(return_value={'data': {'persona_username': 'panda'}})
    delete = AsyncMock()
    monkeypatch.setattr(conversation_db, 'get_conversation', get)
    monkeypatch.setattr(conversation_db, 'delete_conversation', delete)
    for fn in [router.get_conversation, router.delete_conversation]:
        with pytest.raises(HTTPException) as exc:
            await fn('old-kol', 'user')
        assert exc.value.status_code == 403
    delete.assert_not_called()


def test_dispatcher_disabled_jobs_do_not_fetch_backend():
    source = Path(__file__).parents[1] / 'app/edge_functions/cron-trigger.js'
    script = r"""
const fs = require('node:fs'); const vm = require('node:vm'); const assert = require('node:assert/strict');
let calls=0;
const sandbox={module:{exports:{}},Response,Request,URL,Set,console,
 Deno:{env:{get:()=> 'unit-secret'}},fetch:async()=>{calls++;throw new Error('unexpected fetch');}};
vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);
(async()=>{
 for(const job of ['watchlist_monitor_paid_universe','zsxq_panda_ingestion','onboarding_drip']){
  const result=await sandbox.module.exports(new Request('https://unit.test/cron-trigger',{method:'POST',headers:{'X-Internal-Secret':'unit-secret','Content-Type':'application/json'},body:JSON.stringify({job})}));
  assert.equal(result.status,200); assert.equal((await result.json()).disabled,true);
 }
 assert.equal(calls,0); process.stdout.write(JSON.stringify({success:true}));
})().catch(e=>{console.error(e);process.exit(1)});
"""
    result = subprocess.run(['node', '-e', script, str(source)], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)['success']

@pytest.mark.asyncio
async def test_legacy_picker_cannot_be_restored_as_neutral_research(monkeypatch):
    from app.features.agent_runtime.models import AgentRunRequest
    from app.features.agent_runtime.session_store import PickerConversationSessionStore
    from app.features.screener import conversation_db
    monkeypatch.setattr(conversation_db, 'get_conversation', AsyncMock(return_value={
        'data': {'persona_username': 'panda', 'messages': [{'role': 'user', 'content': 'old'}]},
    }))
    with pytest.raises(HTTPException) as exc:
        await PickerConversationSessionStore().load_session(AgentRunRequest(
            agent_id='research_agent', user_id='u', session_id='old', message='resume',
        ))
    assert exc.value.status_code == 403

@pytest.mark.asyncio
async def test_structured_paused_features_stop_before_provider(monkeypatch):
    from app.shared.llm_clients import structured
    from pydantic import BaseModel
    class Output(BaseModel):
        answer: str
    provider = AsyncMock()
    monkeypatch.setattr(structured, 'create_chat_completion', provider)
    for feature in ['watchlist_monitor.ticker_brief', 'twitter.ticker_discussion_summary', 'kol_research.followup']:
        with pytest.raises(HTTPException):
            await structured.generate_structured_json(feature=feature, agent_name='paused',
                model='gemini-3.8-flash', system_prompt='test', user_payload={}, output_model=Output, max_tokens=10)
    provider.assert_not_called()
