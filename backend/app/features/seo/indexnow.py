"""Notify changed public URLs; never submit from development or tests."""
import asyncio
import os
from pathlib import Path
import httpx
from app.core.logging import get_logger
logger=get_logger(__name__)
HOST='www.themarketbrew.com'
async def notify(paths):
    if os.getenv('ENVIRONMENT')!='production':
        return False
    try:
        key=os.getenv('INDEXNOW_KEY') or Path(__file__).with_name('indexnow-public-key.txt').read_text().strip()
    except OSError:
        logger.exception('IndexNow ownership key unavailable')
        return False
    if not key:
        logger.info('IndexNow skipped: production/key not configured')
        return False
    urls=[f'https://{HOST}{p}' for p in dict.fromkeys(paths) if p.startswith('/') and not p.startswith('//') and '?' not in p]
    if not urls: return False
    payload={'host':HOST,'key':key,'keyLocation':f'https://{HOST}/indexnow-key.txt','urlList':urls[:10000]}
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response=await client.post('https://api.indexnow.org/indexnow',json=payload)
            logger.info('IndexNow submitted count=%s status=%s attempt=%s',len(urls),response.status_code,attempt+1)
            if response.status_code in (200,202): return True
            if response.status_code not in (429,500,502,503,504): return False
        except httpx.HTTPError:
            logger.exception('IndexNow submission failed attempt=%s',attempt+1)
        if attempt<2: await asyncio.sleep(attempt+1)
    return False
