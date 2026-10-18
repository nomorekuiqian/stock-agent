import re
from fastapi import APIRouter, HTTPException
from app.core.logging import get_logger
from .service import stock_document, kol_document, earnings_calendar
logger=get_logger(__name__)
router=APIRouter(prefix='/api/seo',tags=['seo'])
@router.get('/stock/{symbol}')
async def stock(symbol: str):
    symbol=symbol.upper()
    if not re.fullmatch(r'[A-Z0-9.\-]{1,10}',symbol): raise HTTPException(404,'Unknown stock')
    try: result=await stock_document(symbol)
    except Exception:
        logger.exception('SEO stock source unavailable: %s',symbol)
        raise HTTPException(503,'SEO source temporarily unavailable')
    if result is None: raise HTTPException(404,'Unknown stock')
    return result
@router.get('/kol/{username}')
async def kol(username: str):
    if username not in ('qinbafrank','aleabitoreddit'): raise HTTPException(404,'Unknown author')
    try: return await kol_document(username)
    except Exception:
        logger.exception('SEO KOL source unavailable: %s',username)
        raise HTTPException(503,'SEO source temporarily unavailable')
@router.get('/earnings-calendar')
async def calendar():
    try: return await earnings_calendar()
    except Exception:
        logger.exception('SEO earnings calendar unavailable')
        raise HTTPException(503,'Calendar temporarily unavailable')

from fastapi import Depends
from app.core.deps import verify_cron_secret
@router.post('/refresh',dependencies=[Depends(verify_cron_secret)])
async def refresh():
    from .service import _cache
    from .content_store import connection,changed,acknowledge
    from .indexnow import notify
    _cache.clear()
    with connection() as db:
        symbols=[row[0] for row in db.execute('SELECT symbol FROM companies')]
    submitted=[]
    for symbol in symbols:
        doc=await stock_document(symbol)
        if not doc: continue
        path=f'/stock/{symbol}'
        different,digest=changed(path,doc['content_hash'])
        if different and await notify([path]):
            acknowledge(path,digest);submitted.append(path)
    for username,slug in [('qinbafrank','qinbafrank'),('aleabitoreddit','serenity')]:
        doc=await kol_document(username);path=f'/kol/{slug}'
        different,digest=changed(path,doc)
        if different and await notify(['/kol',path]):
            acknowledge(path,digest);submitted.append(path)
    return {'submitted':submitted}

@router.get('/ticker-discussion/{symbol}')
async def public_ticker_discussion(symbol: str):
    from .service import ticker_discussion
    if not re.fullmatch(r'[A-Z0-9.\-]{1,10}',symbol.upper()):
        raise HTTPException(404,'Unknown stock')
    return await ticker_discussion(symbol.upper())

@router.get('/sentiment')
async def public_sentiment():
    """No CNN fetch or cached CNN payload unless permission flag is explicitly enabled."""
    import os
    from .service import cached
    async def load():
        from app.features.macro.risk.service import _fetch_sentiment_market_data
        from app.features.macro.risk.router import _get_yf_history, ALLOWED_SENTIMENT_SYMBOLS
        import asyncio
        groups, history = await asyncio.gather(_fetch_sentiment_market_data(),_get_yf_history('VIX',365,ALLOWED_SENTIMENT_SYMBOLS))
        indicators=[item.model_dump() for item in groups.get('volatility',[]) if item.value is not None]
        result={'indicators':indicators,'history':history.get('data',[]),'source':'CBOE / Yahoo Finance','cnn_enabled':False}
        if os.getenv('SENTIMENT_USE_CNN','false').lower()=='true':
            from app.features.macro.risk.service import _fetch_cnn_fear_greed, _CNN_COMPONENTS, _CNN_COMPONENT_NAMES_ZH
            raw=await _fetch_cnn_fear_greed()
            score=(raw or {}).get('fear_and_greed',{}).get('score')
            result['cnn_enabled']=True
            if score is not None:
                components=[{'series_id':key,'name':_CNN_COMPONENT_NAMES_ZH.get(key,key),'value':raw[key]['score']} for key in _CNN_COMPONENTS if (raw.get(key) or {}).get('score') is not None]
                result['cnn']={'overall_score':score,'sub_dimensions':[{'name':'cnn_indicators','indicators':components}]}
        return result
    return await cached('public-sentiment',load,ttl=600)

@router.get('/report-timeline')
async def public_report_timeline():
    from .service import recent_reports
    from .policy import public_text
    output=[]
    for report in (await recent_reports())[:10]:
        news=report.get('news') or {}
        if not isinstance(news,dict): news={}
        first=next(iter(news.get('headlines') or []),{})
        output.append({'date':report.get('report_date'),'timestamp':report.get('timestamp'),'indices':report.get('indices') or [],'summary':public_text(first.get('fact_summary') or report.get('summary'),60)})
    return output
