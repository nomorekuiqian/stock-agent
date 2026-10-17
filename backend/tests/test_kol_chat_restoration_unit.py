"""Research persona chat works while the KOL studio and Panda stay paused."""

from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions import InMemorySessionService
from google.adk.tools.skill_toolset import SkillToolset
from google.adk.tools.tool_context import ToolContext

from app.core.feature_pause import (
    FeaturePauseMiddleware,
    paused_conversation,
    persona_chat_model_guard,
)
from app.features.kol_research import router as kol_router
from app.features.kol_research.agent import get_agent
from app.shared.kol_persona import get_persona

PERSONAS = ['qinbafrank', 'aleabitoreddit']


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(kol_router.router)
    app.add_middleware(FeaturePauseMiddleware)
    app.dependency_overrides[kol_router.require_kol_research_flag] = lambda: {
        'user_id': 'unit-user', 'email': 'unit@example.com',
    }
    monkeypatch.setattr(kol_router, '_caller_flags', AsyncMock(return_value={'pandacircle_persona'}))
    monkeypatch.setattr(kol_router.posthog, 'posthog_client', None)
    return TestClient(app)


@pytest.mark.parametrize('scope', ['research', 'all', 'community_panda'])
def test_selector_only_lists_restored_personas(client, scope):
    response = client.get('/api/kol_research/personas', params={'scope': scope})
    assert response.status_code == 200
    usernames = {item['username'] for item in response.json()['personas']}
    assert usernames == (set() if scope == 'community_panda' else set(PERSONAS))


@pytest.mark.asyncio
@pytest.mark.parametrize('persona', PERSONAS)
async def test_each_persona_can_load_its_own_distilled_skill(persona):
    agent = get_agent(persona)
    assert agent.before_model_callback(None, None) is None
    bundle = get_persona(persona)
    toolset = next(tool for tool in agent.tools if isinstance(tool, SkillToolset))
    tools = await toolset.get_tools()
    loader = next(tool for tool in tools if tool.name == 'load_skill')
    service = InMemorySessionService()
    session = await service.create_session(app_name='persona_test', user_id='unit-user')
    context = ToolContext(InvocationContext(
        agent=agent, session=session, session_service=service, invocation_id='persona_test',
    ))
    result = await loader.run_async(
        args={'skill_name': 'ticker-nvda'},
        tool_context=context,
    )
    assert bundle.lenses['ticker-nvda'].body == result['instructions']
    other = get_persona('aleabitoreddit' if persona == 'qinbafrank' else 'qinbafrank')
    assert other.lenses['ticker-nvda'].body != result['instructions']


@pytest.mark.parametrize('persona', PERSONAS)
def test_stream_preserves_persona_and_skill_events(client, monkeypatch, persona):
    quota = AsyncMock(return_value={'allowed': True})
    monkeypatch.setattr(kol_router, 'consume_quota', quota)
    calls = []

    async def stream(**kwargs):
        calls.append(kwargs)
        yield {'type': 'skill_activated', 'skill_name': 'ticker-nvda'}
        yield {'type': 'final', 'data': {'message': 'unit answer', 'persona_username': persona}}

    monkeypatch.setattr(kol_router, 'stream_kol_research', stream)
    response = client.post('/api/kol_research/chat/stream', json={
        'message': '分析 NVDA', 'persona_username': persona,
    })
    assert response.status_code == 200
    assert 'skill_activated' in response.text and persona in response.text
    assert calls[0]['persona_username'] == persona
    quota.assert_awaited_once()


@pytest.mark.parametrize('persona', ['pandacircle', 'unknown'])
@pytest.mark.parametrize('endpoint', ['chat', 'chat/stream'])
def test_other_personas_stop_before_quota_or_model(client, monkeypatch, persona, endpoint):
    quota = AsyncMock()
    model = Mock()
    monkeypatch.setattr(kol_router, 'consume_quota', quota)
    monkeypatch.setattr(kol_router, 'answer_kol_research', model)
    monkeypatch.setattr(kol_router, 'stream_kol_research', model)
    response = client.post(f'/api/kol_research/{endpoint}', json={
        'message': 'unit', 'persona_username': persona,
    })
    assert response.status_code == 403
    quota.assert_not_awaited()
    model.assert_not_called()


@pytest.mark.parametrize('persona', PERSONAS)
@pytest.mark.parametrize('envelope', ['data', 'metadata'])
def test_restored_history_is_readable(persona, envelope):
    assert not paused_conversation({envelope: {
        'agent_kind': 'kol_research', 'persona_username': persona,
    }})


def test_unknown_and_conflicting_history_stays_paused():
    assert paused_conversation({'agent_id': 'kol_research_agent'})
    assert paused_conversation({'data': {'persona_username': 'pandacircle'}})
    assert paused_conversation({'data': {'persona_username': ['qinbafrank']}})
    assert paused_conversation({
        'data': {'persona_username': 'qinbafrank'},
        'metadata': {'persona_username': 'pandacircle'},
    })
    with pytest.raises(HTTPException):
        persona_chat_model_guard('pandacircle')(None, None)


@pytest.mark.parametrize('persona', PERSONAS)
def test_conversation_save_and_restore(client, monkeypatch, persona):
    stored = {'id': 'unit-chat', 'data': {'agent_kind': 'kol_research', 'persona_username': persona}}
    create = AsyncMock(return_value=stored)
    monkeypatch.setattr(kol_router, 'create_conversation', create)
    monkeypatch.setattr(kol_router, 'get_conversation', AsyncMock(return_value=stored))
    monkeypatch.setattr(kol_router, '_sync_kol_runtime_ui_state', AsyncMock())
    response = client.post('/api/kol_research/conversations', json={
        'title': 'unit', 'persona_username': persona, 'data': {'messages': []},
    })
    assert response.status_code == 201
    assert create.call_args.kwargs['data']['persona_username'] == persona
    assert client.get('/api/kol_research/conversations/unit-chat').json() == stored


@pytest.mark.parametrize('method', ['get', 'put', 'delete'])
def test_panda_history_cannot_be_accessed_through_restored_routes(client, monkeypatch, method):
    monkeypatch.setattr(kol_router, 'get_conversation', AsyncMock(return_value={
        'data': {'persona_username': 'pandacircle'},
    }))
    update = AsyncMock()
    delete = AsyncMock()
    monkeypatch.setattr(kol_router, 'update_conversation', update)
    monkeypatch.setattr(kol_router, 'delete_conversation', delete)
    kwargs = {'json': {'title': 'unit', 'persona_username': 'qinbafrank'}} if method == 'put' else {}
    response = getattr(client, method)('/api/kol_research/conversations/panda-history', **kwargs)
    assert response.status_code == 403
    update.assert_not_awaited()
    delete.assert_not_awaited()


@pytest.mark.parametrize('method,path', [
    ('get', '/api/kol_research/personas'),
    ('post', '/api/kol_research/chat'),
    ('post', '/api/kol_research/chat/stream'),
    ('get', '/api/kol_research/conversations'),
])
def test_restored_routes_still_require_login(method, path):
    app = FastAPI()
    app.include_router(kol_router.router)
    app.add_middleware(FeaturePauseMiddleware)
    response = getattr(TestClient(app), method)(path)
    assert response.status_code in {401, 403}
    assert 'feature_paused' not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize('persona', PERSONAS)
async def test_durable_persona_history_can_be_restored(monkeypatch, persona):
    from app.features.agent_runtime import router as runtime_router

    monkeypatch.setattr(runtime_router.db, 'get_session', AsyncMock(return_value={
        'session': {'id': 'unit-chat', 'agent_id': 'kol_research_agent', 'metadata': {
            'agent_kind': 'kol_research', 'persona_username': persona,
        }},
        'events': [],
    }))
    result = await runtime_router.get_session(
        'unit-chat', agent_id='kol_research_agent', limit=10,
        after_created_at=None, after_id=None, user_id='unit-user',
    )
    assert result['session']['metadata']['persona_username'] == persona
