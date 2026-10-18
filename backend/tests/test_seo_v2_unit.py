import json
from unittest.mock import AsyncMock,patch
import pytest
from app.features.seo import service,indexnow,content_store

@pytest.mark.asyncio
async def test_indexnow_skips_development(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT','development')
    with patch('httpx.AsyncClient.post',new_callable=AsyncMock) as post:
        assert not await indexnow.notify(['/today'])
        post.assert_not_called()

@pytest.mark.asyncio
async def test_indexnow_acceptance_and_scope(monkeypatch,caplog):
    import httpx
    monkeypatch.setenv('ENVIRONMENT','production')
    with patch('httpx.AsyncClient.post',new=AsyncMock(return_value=httpx.Response(202))) as post:
        assert await indexnow.notify(['/today','/today','//evil.test','/today?private=1'])
        payload=post.call_args.kwargs['json']
        assert payload['urlList']==['https://www.themarketbrew.com/today']
        assert payload['keyLocation'].endswith('/indexnow-key.txt')


def test_lastmod_only_changes_with_content(tmp_path,monkeypatch):
    monkeypatch.setenv('SEO_CONTENT_DB',str(tmp_path/'content.sqlite'))
    first=content_store.modification_time('NVDA','a','2026-10-01T00:00:00Z')
    assert content_store.modification_time('NVDA','a','2026-10-18T00:00:00Z')==first
    assert content_store.modification_time('NVDA','b','2026-10-18T00:00:00Z')!=first

@pytest.mark.asyncio
async def test_kol_uses_stored_summaries_not_raw_tweets(monkeypatch,tmp_path):
    monkeypatch.setenv('SEO_CONTENT_DB',str(tmp_path/'kol.sqlite'))
    service._cache.clear()
    digest={'date':'2026-10-16','ticker_theses':[{'ticker':'NVDA','buy_arguments':[{'kol':'qinbafrank','point_zh':'公司披露新的产品与客户进展。','tweet_url':'https://x.com/qinbafrank/status/1'}]}]}
    with patch.object(service,'recent_digests',new=AsyncMock(return_value=[digest])),patch('app.features.twitter.db.get_tweets',new=AsyncMock()) as raw:
        result=await service.kol_document('qinbafrank')
    assert result['total']==1
    assert result['timeline'][0]['id']=='1'
    assert result['license_status']=='summary_only'
    raw.assert_not_called()

@pytest.mark.asyncio
async def test_stock_projection_uses_actual_returns_and_only_public_ai(tmp_path,monkeypatch):
    from unittest.mock import MagicMock
    monkeypatch.setenv('SEO_CONTENT_DB',str(tmp_path/'projection.sqlite'))
    service._cache.clear()
    stock=MagicMock();stock.get_stock_data=AsyncMock(return_value={'quote':{'price':103},'fundamentals':{}})
    analysis={'content':{'investment_summary':'公开第一段\n\nPRIVATE','financial_health':'PRIVATE'}}
    reports=[{'report_date':'2026-10-16','news':{'headlines':[{'title':'NVDA 新产品','fact_summary':'新品消息和市场反馈，不从这里猜测涨跌百分比。'}]}}]
    with patch('app.features.stock.db.get_stock_profile',new=AsyncMock(return_value={'company_name':'NVIDIA'})), \
         patch('app.features.stock.db.get_stock_analysis',new=AsyncMock(return_value=analysis)), \
         patch('app.features.stock.service.get_stock_service',return_value=stock), \
         patch('app.features.stock.router.get_earnings_data_endpoint',new=AsyncMock(return_value={})), \
         patch('app.features.stock.router.get_stock_price_history',new=AsyncMock(return_value={'data':[{'date':'2026-10-15','close':100},{'date':'2026-10-16','close':104}]})), \
         patch.object(service,'recent_reports',new=AsyncMock(return_value=reports)), \
         patch.object(service,'kol_document',new=AsyncMock(return_value={'timeline':[]})), \
         patch.object(service,'earnings_calendar',new=AsyncMock(return_value={'earnings':[]})), \
         patch.object(service,'reported_earnings',new=AsyncMock(return_value=[])), \
         patch.object(service,'ticker_discussion',new=AsyncMock(return_value={'rows':[],'stats':{}})), \
         patch.object(content_store,'get_company',return_value=None):
        result=await service.stock_document('NVDA')
    assert result['ai_summary']=='公开第一段'
    assert 'PRIVATE' not in json.dumps(result)
    assert result['why'][0]['change_percent']==4

@pytest.mark.asyncio
async def test_indexnow_retries_transient_failure(monkeypatch,caplog):
    import httpx,logging
    monkeypatch.setenv('ENVIRONMENT','production')
    caplog.set_level(logging.INFO)
    with patch('httpx.AsyncClient.post',new=AsyncMock(side_effect=[httpx.Response(503),httpx.Response(202)])) as post,patch.object(indexnow.asyncio,'sleep',new=AsyncMock()):
        assert await indexnow.notify(['/stock/NVDA'])
        assert post.await_count==2
    assert 'status=202' in caplog.text
