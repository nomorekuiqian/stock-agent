"""Read-only full cached-universe audit; exits nonzero for anomalies or incomplete data."""
import asyncio,json,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT/'backend/.env')
from app.features.screener.db import get_cached,get_cache_data
from app.core.logging import get_logger
logger=get_logger(__name__)
async def main():
    meta=get_cache_data(await get_cached('screener:meta')) or {}
    rows=[];complete=bool(meta.get('chunk_count'))
    for i in range(meta.get('chunk_count',0)):
        chunk=get_cache_data(await get_cached(f'screener:universe:{i}'))
        if chunk is None:complete=False
        else:rows.extend(chunk)
    anomalies=[{'symbol':r.get('symbol'),'dividend_yield':r.get('dividend_yield')} for r in rows if isinstance(r.get('dividend_yield'),(int,float)) and r['dividend_yield']>25]
    import httpx
    benchmark={}
    async with httpx.AsyncClient(timeout=30) as client:
        for symbol in ['NVDA','AAPL','MSFT','KO']:
            response=await client.get(f'https://stock-agent-production.up.railway.app/api/stocks/{symbol}')
            response.raise_for_status();value=response.json()['fundamentals']['valuation'].get('dividend_yield')
            benchmark[symbol]={'api_percent':value,'display':f'{value:.2f}%' if value is not None else None}
    import yfinance as yf
    async def source_check(symbol):
        info=await asyncio.to_thread(lambda: yf.Ticker(symbol.split(':')[-1]).get_info())
        raw=info.get('trailingAnnualDividendYield')
        return {'source':'Yahoo Finance trailingAnnualDividendYield','raw_decimal':raw,'normalized_percent':raw*100 if raw is not None else None}
    for symbol in benchmark:
        benchmark[symbol]['independent_source']=await source_check(symbol)
    for row in anomalies:
        row['cross_check']=await source_check(row['symbol'])
    result={'checked_at':datetime.now(timezone.utc).isoformat(),'complete':complete,'universe_count':len(rows),'missing_yield':sum(r.get('dividend_yield') is None for r in rows),'anomalies':anomalies,'benchmark':benchmark}
    (ROOT/'docs/seo/2026-10-18/dividend-audit.json').write_text(json.dumps(result,indent=2)+'\n')
    logger.info('Dividend audit count=%s complete=%s anomalies=%s',len(rows),complete,len(anomalies))
    return 0 if complete and not anomalies else 1
sys.exit(asyncio.run(main()))
