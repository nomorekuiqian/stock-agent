"""Durable, event-driven SEO copy jobs. Generation never runs on public GETs."""
import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from app.core.logging import get_logger
from .content_store import connection
from .policy import publish, license_status

logger = get_logger(__name__)
PROMPT_VERSION = 'seo-public-v2-2026-10-18'


def _schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS seo_jobs (key TEXT PRIMARY KEY, payload TEXT NOT NULL, revision TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, error TEXT)')


def enqueue(key, source, kind, minimum, maximum):
    """Idempotent source revisions; a worker consumes only successful saved inputs."""
    payload=json.dumps({'source':source,'kind':kind,'minimum':minimum,'maximum':maximum},ensure_ascii=False,sort_keys=True)
    revision=hashlib.sha256(payload.encode()).hexdigest()
    with connection() as db:
        _schema(db)
        old=db.execute('SELECT revision FROM seo_jobs WHERE key=?',(key,)).fetchone()
        if old and old[0]==revision:return
        db.execute('INSERT OR REPLACE INTO seo_jobs VALUES (?,?,?,?,?,?,?)',(key,payload,revision,'pending',0,datetime.now(timezone.utc).isoformat(),None))


def enqueue_report(kind, report):
    date=report.get('report_date')
    if not date:return
    enqueue(f'{kind}-answer:{date}',report,f'{kind} answer',40,80)
    if kind=='morning':
        enqueue(f'morning-excerpt:{date}',report,'morning public futures paragraph; never include full global analysis',150,250)
        for i,row in enumerate((report.get('overnight_news') or [])[:3]):
            enqueue(f'morning-point:{date}:{i}',row,'event then affected company or sector; no price change bullet',0,50)
    else:
        with connection() as db:
            symbols=[r[0] for r in db.execute('SELECT symbol FROM companies')]
        from .company_names import COMPANY_NAMES
        news=report.get('news') or {}
        if isinstance(news,str):
            try:news=json.loads(news)
            except ValueError:news={}
        paragraphs=(news.get('headlines',[])+news.get('briefs',[])) if isinstance(news,dict) else []
        paragraphs=paragraphs+[{'summary':report.get('summary'),'report_summary':report.get('report_summary')}]
        aliases={'CRWV':['CoreWeave'],'SOFI':['SoFi'],'NBIS':['Nebius'],'PLTR':['Palantir'],'NVDA':['英伟达','NVIDIA'],'GOOGL':['谷歌','Alphabet'],'MSFT':['微软','Microsoft'],'AMZN':['亚马逊','Amazon'],'SMR':['NuScale']}
        for symbol in symbols:
            names=[symbol,COMPANY_NAMES.get(symbol,symbol),*aliases.get(symbol,[])]
            pattern=re.compile(r'(?<![A-Za-z0-9])(?:'+'|'.join(re.escape(n) for n in names)+r')(?![A-Za-z0-9])',re.I)
            matched=[p for p in paragraphs if pattern.search(json.dumps(p,ensure_ascii=False))]
            if matched:
                enqueue(f'why:{symbol}:{date}',{'symbol':symbol,'date':date,'matched_paragraphs':matched},'company event reason; attribute only explicitly stated causes',0,60)


def enqueue_digest(digest):
    from .digest_projection import digest_rows
    from datetime import timedelta
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS seo_digest_sources (date TEXT PRIMARY KEY, payload TEXT NOT NULL)')
        db.execute('INSERT OR REPLACE INTO seo_digest_sources VALUES (?,?)',(digest['date'],json.dumps(digest,ensure_ascii=False)))
        cutoff=(datetime.fromisoformat(digest['date']).date()-timedelta(days=29)).isoformat()
        records=db.execute('SELECT payload FROM seo_digest_sources WHERE date BETWEEN ? AND ?',(cutoff,digest['date'])).fetchall()
    rows=digest_rows([json.loads(row[0]) for row in records])
    for symbol in {t for r in rows for t in r['tickers']}:
        selected=[r for r in rows if symbol in r['tickers']]
        if len({r['username'] for r in selected})>=2:
            enqueue(f'kol-conclusion:{symbol}',{'date':digest['date'],'rows':selected},'neutral stock discussion conclusion; identify opposing arguments only when present',40,60)


def queue_weekly(now):
    from datetime import timedelta
    from zoneinfo import ZoneInfo
    from .digest_projection import digest_rows
    et=now.astimezone(ZoneInfo('America/New_York'))
    if et.hour<7:return
    with connection() as db:
        _schema(db)
        exists=db.execute("SELECT 1 FROM sqlite_master WHERE name='seo_digest_sources'").fetchone()
        if not exists:return
        records=db.execute('SELECT payload FROM seo_digest_sources WHERE date BETWEEN ? AND ? ORDER BY date DESC',((et.date()-timedelta(days=6)).isoformat(),et.date().isoformat())).fetchall()
    rows=digest_rows([json.loads(r[0]) for r in records])
    for name in ('qinbafrank','aleabitoreddit'):
        selected=[r for r in rows if r['username']==name]
        with connection() as db:
            queued=db.execute('SELECT payload FROM seo_jobs WHERE key=?',('kol-weekly:'+name,)).fetchone()
        if queued and json.loads(queued[0])['source'].get('date')==et.date().isoformat():continue
        if selected and license_status(name)!='prohibited':
            enqueue('kol-weekly:'+name,{'date':et.date().isoformat(),'rows':selected},'weekly KOL summary: themes and mentioned stocks; no unsupported week-over-week comparison',150,250)


def prepared_source(source):
    """All prose numbers become typed placeholders before model access."""
    facts={}
    def walk(value):
        if isinstance(value,dict):return {k:walk(v) for k,v in value.items()}
        if isinstance(value,list):return [walk(v) for v in value]
        if isinstance(value,(int,float)) and not isinstance(value,bool):
            key=f'fact_{len(facts)}';facts[key]=value;return '{'+key+'}'
        if isinstance(value,str):
            def replace(match):
                key=f'fact_{len(facts)}';facts[key]=match.group();return '{'+key+'}'
            return re.sub(r'[-+−]?\d+(?:[,.]\d+)*%?',replace,value)
        return value
    return walk(source),facts


async def generate_one(job, generate=None):
    key,payload,revision=job
    data=json.loads(payload)
    source,facts=prepared_source(data['source'])
    from app.core.ai_models import GENERATIVE_MODEL
    source_id='saved:'+revision
    prompt=(f'Write neutral simplified Chinese {data["kind"]}. Chinese character length {data["minimum"]} to {data["maximum"]}. '
            'Use only supplied facts and source paragraphs. No new causes, recommendations, predictions or raw tweet quotations. '
            'Every numeric value must remain an exact {fact_N} placeholder copied from the source. Do not write numeric literals. '
            'Return JSON {"template":"...","source_ids":["'+source_id+'"]}. Source: '+json.dumps(source,ensure_ascii=False))
    if generate is None:
        from google import genai
        async with genai.Client().aio as client:
            response=await client.models.generate_content(model=GENERATIVE_MODEL,contents=prompt,config={'response_mime_type':'application/json'})
            output=json.loads(response.text)
    else:output=await generate(prompt)
    with connection() as db:
        latest=db.execute('SELECT revision FROM seo_jobs WHERE key=?',(key,)).fetchone()
    if not latest or latest[0]!=revision:
        return False
    accepted=publish(key,output['template'],facts,output['source_ids'],[source_id],GENERATIVE_MODEL,PROMPT_VERSION,datetime.now(timezone.utc).isoformat(),data['minimum'],data['maximum'],expected_revision=revision)
    return accepted


async def run_pending(generate=None):
    """Transactional lease avoids duplicate processing across workers; retry is bounded."""
    from datetime import timedelta
    now=datetime.now(timezone.utc)
    with connection() as db:
        _schema(db)
        db.execute('BEGIN IMMEDIATE')
        db.execute("UPDATE seo_jobs SET status='pending' WHERE status='running' AND updated_at<?",((now-timedelta(minutes=10)).isoformat(),))
        jobs=db.execute("SELECT key,payload,revision FROM seo_jobs WHERE status='pending' AND attempts<3 ORDER BY updated_at LIMIT 4").fetchall()
        for key,_,revision in jobs:db.execute("UPDATE seo_jobs SET status='running',attempts=attempts+1,updated_at=? WHERE key=? AND revision=?",(now.isoformat(),key,revision))
    for job in jobs:
        try:
            accepted=await asyncio.wait_for(generate_one(job,generate),timeout=120)
            state='published' if accepted else 'review'
            error=None
        except Exception as exc:
            state='pending';error=type(exc).__name__
            logger.exception('SEO generation failed key=%s',job[0])
        with connection() as db:
            db.execute('UPDATE seo_jobs SET status=?,error=?,updated_at=? WHERE key=? AND revision=?',(state,error,datetime.now(timezone.utc).isoformat(),job[0],job[2]))
        with connection() as db:
            db.execute("UPDATE seo_jobs SET status='review' WHERE key=? AND status='pending' AND attempts>=3",(job[0],))
        if state=='published' and job[0].startswith('why:'):
            symbol=job[0].split(':')[1]
            with connection() as db:
                events=db.execute('SELECT content,generated_at,source_ids FROM generated_content WHERE key LIKE ? ORDER BY key DESC LIMIT 10',('why:'+symbol+':%',)).fetchall()
            enqueue('why-summary:'+symbol,{'symbol':symbol,'events':[{'reason':r[0],'date':r[1],'source_ids':json.loads(r[2])} for r in events]},'one sentence summary of these recorded events; no added causal claims',0,60)
        if state=='published':
            from .service import _cache
            _cache.clear()


async def worker():
    while True:
        try:
            queue_weekly(datetime.now(timezone.utc))
            await run_pending()
        except Exception:
            logger.exception('SEO publication worker failed')
        await asyncio.sleep(60)
