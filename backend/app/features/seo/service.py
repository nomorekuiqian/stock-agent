"""Read-only SEO projections. Never invokes generation or unpauses studio APIs."""
import asyncio
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from time import monotonic
from zoneinfo import ZoneInfo
from app.core.logging import get_logger

logger = get_logger(__name__)
_cache = {}
_locks = {}

async def cached(key, loader, ttl=3600):
    async with _locks.setdefault(key, asyncio.Lock()):
        hit = _cache.get(key)
        if hit and hit[0] > monotonic():
            return hit[1]
        result = await loader()
        _cache[key] = (monotonic()+ttl, result)
        return result

def text(value):
    return value if isinstance(value, str) else ''

def content_object(record):
    value = (record or {}).get('content') or {}
    if isinstance(value, str):
        try: value = json.loads(value)
        except ValueError: return {}
    return value if isinstance(value, dict) else {}

def excerpt(value, limit=300):
    value = re.sub(r'<[^>]+>', '', text(value)).strip()
    return value[:limit]

async def recent_digests():
    from app.features.twitter_digest.db import list_digests, get_digest_by_date
    async def load():
        listing, _ = await list_digests(limit=50)
        cutoff = (datetime.now(ZoneInfo('America/New_York'))-timedelta(days=29)).date().isoformat()
        semaphore = asyncio.Semaphore(4)
        async def detail(date):
            async with semaphore:
                result = await get_digest_by_date(date)
                return result.model_dump() if result else None
        docs = await asyncio.gather(*(detail(row.date) for row in listing if row.date >= cutoff))
        return [doc for doc in docs if doc]
    return await cached('digests',load)


async def kol_document(username):
    from .digest_projection import digest_rows
    from .policy import license_status, published
    async def load():
        status = license_status(username)
        rows = [row for row in digest_rows(await recent_digests()) if row['username']==username] if status != 'prohibited' else []
        counts = Counter(ticker for row in rows for ticker in row['tickers'])
        weekly = published('kol-weekly:'+username)
        return {'username':username, 'license_status':status, 'timeline':rows[:10], 'total':len({r['url'] for r in rows}), 'top_tickers':[{'symbol':symbol,'count':count,'stance':next(r['stances'][0]['stance'] for r in rows if symbol in r['tickers'])} for symbol,count in counts.most_common(10)], 'weekly_summary':weekly['content'] if weekly and status != 'prohibited' else '', 'updated_at':max([r['date'] for r in rows]+([weekly['generated_at']] if weekly else []),default=None), 'source':'kol_daily_digests', 'refresh_frequency':'跟随已启用的推文与简报任务更新'}
    return await cached('kol:'+username,load)


async def ticker_discussion(symbol):
    from .digest_projection import digest_rows, discussion
    return discussion(digest_rows(await recent_digests()),symbol)

async def recent_reports():
    from app.features.daily_report.db import list_reports, get_report_by_id
    async def load():
        listing=await list_reports(limit=30)
        semaphore=asyncio.Semaphore(4)
        async def detail(row):
            async with semaphore: return await get_report_by_id(row['id'])
        rows=await asyncio.gather(*(detail(row) for row in listing['data']))
        return [r for r in rows if r]
    return await cached('reports',load)

async def earnings_calendar():
    from app.shared.fmp_service import get_fmp_service
    from zoneinfo import ZoneInfo
    async def load():
        today=datetime.now(ZoneInfo('America/New_York')).date()
        monday=today-timedelta(days=today.weekday())
        result=await asyncio.to_thread(get_fmp_service().get_earnings_calendar_range,monday.isoformat(),(monday+timedelta(days=13)).isoformat())
        if result.get('status')!='success': raise RuntimeError('Earnings source unavailable')
        return {**result,'week_start':monday.isoformat(),'updated_at':datetime.now(timezone.utc).isoformat()}
    return await cached('earnings',load)

async def reported_earnings():
    from app.shared.fmp_service import get_fmp_service
    async def load():
        today = datetime.now(timezone.utc).date()
        result = await asyncio.to_thread(get_fmp_service().get_earnings_calendar_range, (today-timedelta(days=120)).isoformat(), today.isoformat())
        if result.get('status') != 'success':
            raise RuntimeError('Reported earnings source unavailable')
        return result['earnings']
    return await cached('reported_earnings', load)

async def stock_document(symbol):
    from app.features.stock.db import get_stock_profile, get_stock_analysis
    from app.features.stock.service import get_stock_service
    from app.features.stock.router import get_earnings_data_endpoint, get_stock_price_history
    async def load():
        profile=await get_stock_profile(symbol,strict=True)
        if not profile:
            from .content_store import get_profile
            profile=get_profile(symbol)
        if not profile: return None
        from .company_names import COMPANY_NAMES
        profile={**profile,'company_name_zh':profile.get('company_name_zh') or COMPANY_NAMES.get(symbol)}
        data_symbol=symbol.replace('.','-')
        stock,analysis,earnings_analysis,reports,earnings,calendar,history,actuals=await asyncio.gather(
            get_stock_service().get_stock_data(data_symbol),get_stock_analysis(symbol),get_stock_analysis(symbol,'earnings'),recent_reports(),get_earnings_data_endpoint(data_symbol),earnings_calendar(),get_stock_price_history(data_symbol, days=60),reported_earnings())
        ai=content_object(analysis)
        from .content_store import get_company
        stored=get_company(symbol)
        about=excerpt(ai.get('company_profile') or ai.get('company_overview') or (profile.get('description') or {}).get('zh'),300)
        bars=sorted((history or {}).get('data') or [],key=lambda r:r.get('date',''))
        changes={bars[i]['date']:round((bars[i]['close']/bars[i-1]['close']-1)*100,4) for i in range(1,len(bars)) if bars[i-1].get('close') and bars[i].get('close')}
        if stored: about=stored['about']
        mentions=[]
        names = [symbol, profile.get('company_name'), profile.get('company_name_zh')]
        names += {'CRWV':['CoreWeave'], 'NBIS':['Nebius'], 'SOFI':['SoFi'], 'NVDA':['英伟达','NVIDIA','輝達'], 'PLTR':['Palantir'], 'MSFT':['微软','Microsoft'], 'GOOGL':['谷歌','Google','Alphabet'], 'AMZN':['亚马逊','Amazon']}.get(symbol,[])
        pattern=re.compile(r'(?<![A-Za-z0-9])(?:'+'|'.join(re.escape(name) for name in names if name)+r')(?![A-Za-z0-9])',re.I)
        from .policy import public_text, published
        for report in reports:
            news=report.get('news') or {}
            if isinstance(news,str):
                try: news=json.loads(news)
                except ValueError: news={}
            for row in (news.get('headlines',[])+news.get('briefs',[])+[{'summary':text(report.get('summary'))+' '+text(report.get('report_summary'))}]) if isinstance(news,dict) else []:
                body=' '.join(text(row.get(key)) for key in ('title','fact_summary','summary','deep_analysis','analysis'))
                if pattern.search(body):
                    date=str(report.get('report_date') or report.get('timestamp',''))[:10]
                    change=changes.get(date)
                    generated=published(f'why:{symbol}:{date}')
                    reason=generated['content'] if generated else public_text(body,60)
                    if reason:
                        mentions.append({'date':date,'summary':reason,'url':f'/today/{date}-market-report','change_percent':change if change is not None and abs(change)<=60 else None,'source':'daily_report','source_ids':[str(report.get('id') or date)],'confidence':'high'})
                    break
        discussion = await ticker_discussion(symbol)
        kol = discussion['rows']
        mentioned_dates = {row['date'] for row in mentions}
        why = list(mentions)
        for date,change in sorted(changes.items(),reverse=True):
            if 3<=abs(change)<=60 and date not in mentioned_dates:
                why.append({'date':date,'summary':'当日未见可核对的公司特定消息，现有资料不足以确认波动原因。','url':f'/stock/{symbol}?view=workspace','change_percent':change,'source':'none','source_ids':[],'confidence':'low'})
        why=sorted(why,key=lambda r:r['date'],reverse=True)[:10]
        change_20d=round((bars[-1]['close']/bars[-21]['close']-1)*100,2) if len(bars)>=21 and bars[-21].get('close') else None
        from .content_store import title_direction
        variant=title_direction(symbol,change_20d,datetime.now(timezone.utc)) if symbol in ('CRWV','PLTR') else None
        fundamental=stock.get('fundamentals') or {}
        dividend=(fundamental.get('valuation') or {}).get('dividend_yield')
        if isinstance(dividend,(int,float)) and dividend>25:
            logger.warning('SEO dividend yield anomaly symbol=%s percent=%s',symbol,dividend)
            dividend=None
        next_earnings=next((r for r in sorted(calendar['earnings'],key=lambda r:r.get('date','')) if r.get('symbol')==symbol and r.get('date','')>=datetime.now(timezone.utc).date().isoformat()),None)
        if not next_earnings and earnings.get('next_earnings_date'):
            next_earnings={'symbol':symbol,'date':earnings['next_earnings_date']}
        if next_earnings and earnings.get('next_earnings_date') and next_earnings['date']!=earnings['next_earnings_date']:
            logger.warning('SEO earnings date conflict symbol=%s calendar=%s stored=%s',symbol,next_earnings['date'],earnings['next_earnings_date'])
        if next_earnings:
            next_earnings={**next_earnings,'confirmation':'estimated'}
        segments=[]
        for period in (earnings.get('revenue_segments') or [])[:1]:
            for name,revenue in (period.get('data') or {}).items():
                if isinstance(revenue,(float,int)):
                    segments.append({'period':str(period.get('fiscalYear') or '')+' '+str(period.get('period') or period.get('date') or ''),'name':name,'revenue':revenue})
        transcript=published('transcript-points:'+symbol)
        points=[public_text(line,50) for line in transcript['content'].splitlines() if public_text(line,50)][:3] if transcript else []
        earnings={**earnings,'segments':segments,'transcript_points':points}
        generated_earnings=published('earnings:'+symbol)
        quote=stock.get('quote') or {}
        high=quote.get('week_52_high')
        drawdown=round((quote['price']/high-1)*100,2) if high and quote.get('price') else None
        conclusion=published('kol-conclusion:'+symbol)
        interval=published('why-summary:'+symbol)
        result={'why_summary':interval['content'] if interval else '', 'kol_conclusion':conclusion['content'] if conclusion else '', 'module_dates':{'about':(stored or {}).get('updated_at'),'earnings':(generated_earnings or {}).get('generated_at') or (earnings_analysis or {}).get('generated_at'),'kol':max((r['date'] for r in kol),default=None),'why':max((r['date'] for r in mentions),default=None)},'drawdown_from_high':drawdown,'symbol':symbol,'profile':profile,'stock':stock,'about':about,'about_source':(stored or {}).get('source_url'),'ai_summary':public_text(text(ai.get('investment_summary')).strip().split('\n\n')[0],250),'reports':mentions[:5],'why':why,'change_20d':change_20d,'title_variant':variant,'kol_stats':discussion['stats'],'kol':kol[:12],'earnings':earnings,'latest_actuals':next((r for r in sorted(actuals,key=lambda r:r.get('date',''),reverse=True) if r.get('symbol') in (symbol,data_symbol) and r.get('epsActual') is not None),None),'earnings_analysis':generated_earnings['content'] if generated_earnings else public_text(text(content_object(earnings_analysis).get('earnings_overview')).split('\n\n')[0],250),'earnings_notes':'','next_earnings':next_earnings,'analyst':fundamental.get('analyst_targets') or {},'dividend_yield':dividend}
        from pathlib import Path
        facts=json.loads((Path(__file__).parent/'company_facts.json').read_text()).get(symbol,[])
        result['company_faq']=[{'q':row['q'],'a':row['a'].format_map(row['facts']),'source':row['source']} for row in facts]
        # Source revisions only. Quote retrieval time is not content modification time.
        dates=[(stored or {}).get('updated_at'),(analysis or {}).get('generated_at'),(earnings_analysis or {}).get('generated_at'),(generated_earnings or {}).get('generated_at')]+[r['date'] for r in mentions]+[r['date'] for r in kol]
        result['updated_at']=max((d for d in dates if d),default=None)
        result['content_hash']=hashlib.sha256(json.dumps({k:result[k] for k in ('about','ai_summary','reports','why','kol','earnings_analysis','earnings_notes','next_earnings','earnings','latest_actuals') },sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        # Publication date comes from source revisions, never from quote refreshes.
        result['updated_at']=max((d for d in dates if d),default=None)
        return result
    return await cached('stock:'+symbol,load)

async def notify_tweet_updates(tweets):
    """Use successful existing ingestion, without enabling paused schedules."""
    from .content_store import changed, acknowledge
    from .indexnow import notify
    names = {str(row.get('author_username') or '').lower() for row in tweets}
    for name, slug in [('qinbafrank','qinbafrank'), ('aleabitoreddit','serenity')]:
        if name not in names:
            continue
        _cache.pop('kol:'+name, None)
        doc = await kol_document(name)
        path = '/kol/'+slug
        different, digest = changed(path, doc)
        if different:
            symbols = {ticker for row in doc['timeline'] for ticker in row['tickers']}
            for symbol in symbols:
                _cache.pop('stock:'+symbol, None)
            if await notify(['/kol',path]+['/stock/'+symbol for symbol in sorted(symbols)]):
                acknowledge(path,digest)
