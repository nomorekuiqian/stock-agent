"""Isolated publication safety tests. No network, real database or model calls."""
import json
from datetime import datetime,timedelta,timezone
from unittest.mock import AsyncMock,patch
import pytest
from app.features.seo import policy,content_store,generation,service
from app.features.seo.digest_projection import digest_rows,discussion

@pytest.fixture(autouse=True)
def isolated_content(tmp_path,monkeypatch):
    monkeypatch.setenv('SEO_CONTENT_DB',str(tmp_path/'seo.sqlite'))
    service._cache.clear()
    with content_store.connection() as db:
        db.execute('CREATE TABLE companies (symbol TEXT PRIMARY KEY,about TEXT,source_url TEXT,source_hash TEXT,updated_at TEXT)')
        db.execute("INSERT INTO companies VALUES ('NVDA','公司业务','https://example.test','a','2026-10-01')")


def test_rejected_copy_preserves_previous_and_queues_review():
    args=('test','价格 {price} 美元',{'price':123.45},['source'],['source'],'mock','v1','2026-10-18',0,80)
    assert policy.publish(*args)
    assert not policy.publish('test','价格 999 美元',{},['source'],['source'],'mock','v1','2026-10-18')
    assert policy.published('test')['content']=='价格 123.45 美元'
    with content_store.connection() as db: assert db.execute('SELECT count(*) FROM content_review_queue').fetchone()[0]==1

def test_persistent_storage_seeds_once_and_preserves_published_content(tmp_path, monkeypatch):
    target = tmp_path / 'volume' / 'content.sqlite'
    monkeypatch.setenv('SEO_CONTENT_DB', str(target))
    content_store.initialize_storage()
    with content_store.connection() as db:
        assert db.execute('SELECT count(*) FROM companies').fetchone()[0] == 70
        db.execute("UPDATE companies SET about='preserved' WHERE symbol='NVDA'")
    content_store.initialize_storage()
    assert content_store.get_company('NVDA')['about'] == 'preserved'

def test_production_requires_persistent_content_path(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'production')
    monkeypatch.delenv('SEO_CONTENT_DB', raising=False)
    with pytest.raises(RuntimeError, match='persistent'):
        content_store.initialize_storage()

@pytest.mark.asyncio
async def test_calendar_projection_uses_the_production_fmp_contract():
    from app.shared.fmp_service import FMPService
    provider = object.__new__(FMPService)
    with patch.object(provider, '_request', return_value=[]) as request, patch('app.shared.fmp_service.get_fmp_service', return_value=provider):
        upcoming = await service.earnings_calendar()
        reported = await service.reported_earnings()
    assert upcoming['status'] == 'success' and upcoming['earnings'] == []
    assert reported == []
    assert request.call_count == 2
    assert all(call.args[0] == '/stable/earnings-calendar' for call in request.call_args_list)

@pytest.mark.parametrize('template,facts,ids',[('收益一定增加',{},['s']),('价格 {missing}',{},['s']),('价格 {x}',{'x':None},['s']),('价格 {x}',{'x':float('nan')},['s']),('价格 {x}',{'x':1},['wrong']),('价格 {x.__class__}',{'x':1},['s'])])
def test_source_and_numeric_guards(template,facts,ids):
    with pytest.raises(ValueError):policy.render_generated(template,facts,ids,['s'])


def test_license_filter_and_two_author_threshold():
    def digest(author,url):return {'date':'2026-10-16','ticker_theses':[{'ticker':'NVDA','buy_arguments':[{'kol':author,'point_zh':'这是有来源的观点摘要。'*20,'tweet_url':url}]}]}
    rows=digest_rows([digest('a','https://x.com/a/status/1'),digest('b','https://x.com/b/status/2')])
    assert len(discussion(rows,'NVDA')['rows'])==2
    assert all(len(r['summary'])<=60 for r in rows)
    with content_store.connection() as db:db.execute("INSERT INTO kol_licenses VALUES ('b','prohibited')")
    rows=digest_rows([digest('a','https://x.com/a/status/1'),digest('b','https://x.com/b/status/2')])
    assert not discussion(rows,'NVDA')['rows']


def test_title_cooldown():
    now=datetime(2026,10,18,tzinfo=timezone.utc)
    assert content_store.title_direction('PLTR',-4,now)['direction']=='跌'
    assert content_store.title_direction('PLTR',5,now+timedelta(days=6))['direction']=='跌'
    assert content_store.title_direction('PLTR',5,now+timedelta(days=7))['direction']=='涨'

@pytest.mark.asyncio
async def test_worker_idempotency_and_rejection_without_model():
    generation.enqueue('why:NVDA:2026-10-16',{'price':123},'reason',0,60)
    async def mock(prompt):
        source=prompt.split('"source_ids":["')[1].split('"')[0]
        return {'template':'记录价格 {fact_0} 美元。','source_ids':[source]}
    generator=AsyncMock(side_effect=mock)
    await generation.run_pending(generator)
    assert policy.published('why:NVDA:2026-10-16')['content']=='记录价格 123 美元。'
    generation.enqueue('why:NVDA:2026-10-16',{'price':123},'reason',0,60)
    await generation.run_pending(generator)
    assert generator.await_count==2  # One reason and its follow-up interval summary.
    await generation.run_pending(generator)
    assert generator.await_count==2

@pytest.mark.asyncio
async def test_cnn_disabled_never_fetches_cnn(monkeypatch):
    monkeypatch.delenv('SENTIMENT_USE_CNN',raising=False)
    from app.features.seo.router import public_sentiment
    with patch('app.features.macro.risk.service._fetch_sentiment_market_data',new=AsyncMock(return_value={'volatility':[]})),patch('app.features.macro.risk.router._get_yf_history',new=AsyncMock(return_value={'data':[]})),patch('app.features.macro.risk.service.get_market_sentiment',new=AsyncMock()) as cnn:
        result=await public_sentiment()
    assert not result['cnn_enabled']
    assert 'cnn' not in result
    cnn.assert_not_called()

@pytest.mark.asyncio
async def test_paid_cockpit_requires_max_and_blocks_prohibited_author():
    from fastapi import HTTPException
    from app.features.kol_research.router import require_public_studio_access
    with patch('app.features.payment.entitlements.has_entitlement',new=AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as denied:await require_public_studio_access('qinbafrank','user')
        assert denied.value.status_code==403
    with patch('app.features.payment.entitlements.has_entitlement',new=AsyncMock(return_value=True)):
        assert await require_public_studio_access('qinbafrank','user')=='user'
        with pytest.raises(HTTPException):await require_public_studio_access('pandacircle','user')

@pytest.mark.asyncio
async def test_cockpit_route_has_server_auth_before_provider_calls():
    from fastapi import FastAPI
    from httpx import ASGITransport,AsyncClient
    from app.core.feature_pause import FeaturePauseMiddleware
    from app.features.kol_research.router import router
    app=FastAPI();app.include_router(router);app.add_middleware(FeaturePauseMiddleware)
    with patch('app.features.kol_research.router.cockpit_v3.get_profile',create=True) as provider:
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
            assert (await client.get('/api/kol_research/personas/qinbafrank/profile')).status_code==401
            assert (await client.get('/api/kol_research/personas/pandacircle/profile')).status_code==403
        provider.assert_not_called()


def test_stale_generation_cannot_replace_new_revision():
    generation.enqueue('x',{'value':1},'test',0,60)
    with content_store.connection() as db:old=db.execute('SELECT revision FROM seo_jobs').fetchone()[0]
    generation.enqueue('x',{'value':2},'test',0,60)
    assert not policy.publish('x','旧版',{},['s'],['s'],'mock','v','2026-10-18',expected_revision=old)
    assert policy.published('x') is None


def test_weekly_summary_queues_once_per_et_day():
    source={'date':'2026-10-16','ticker_theses':[{'ticker':'NVDA','buy_arguments':[{'kol':'qinbafrank','point_zh':'芯片交付进展','tweet_url':'https://x.com/qinbafrank/status/1'}]}]}
    generation.enqueue_digest(source)
    now=datetime(2026,10,18,12,tzinfo=timezone.utc)
    generation.queue_weekly(now)
    with content_store.connection() as db:before=db.execute("SELECT revision FROM seo_jobs WHERE key='kol-weekly:qinbafrank'").fetchone()[0]
    source['ticker_theses'][0]['buy_arguments'][0]['point_zh']='后续公开数据更新'
    generation.enqueue_digest(source)
    generation.queue_weekly(now+timedelta(hours=2))
    with content_store.connection() as db:after=db.execute("SELECT revision FROM seo_jobs WHERE key='kol-weekly:qinbafrank'").fetchone()[0]
    assert after==before

@pytest.mark.asyncio
async def test_cnn_unavailable_is_not_fabricated_neutral(monkeypatch):
    monkeypatch.setenv('SENTIMENT_USE_CNN','true')
    from app.features.seo.router import public_sentiment
    with patch('app.features.macro.risk.service._fetch_sentiment_market_data',new=AsyncMock(return_value={'volatility':[]})),patch('app.features.macro.risk.router._get_yf_history',new=AsyncMock(return_value={'data':[]})),patch('app.features.macro.risk.service._fetch_cnn_fear_greed',new=AsyncMock(return_value=None)):
        result=await public_sentiment()
    assert result['cnn_enabled'] and 'cnn' not in result


def test_morning_movers_only_render_saved_finite_facts():
    from app.features.morning_report.router import _public_movers
    assert _public_movers({})==[]
    for value in ('legacy JSON string', [], None):
        assert _public_movers({'market_data': value}) == []
        assert _public_movers({'market_data': {'premarket': value}}) == []
    rows=[{'symbol':'NVDA','price':100,'change_percent':4},{'symbol':'BAD','price':0,'change_percent':5},{'symbol':'AAPL','price':100,'change_percent':float('nan')},{'symbol':'BAD','price':True,'change_percent':5}]
    assert _public_movers({'market_data':{'premarket':{'movers':rows}}})==[rows[0]]
