"""Publish offline company copy from explicitly supplied, sourced input.
Input JSON: [{symbol, template, facts, source_ids, source_url, model, prompt_version}].
Numbers must use source placeholders. No network/model/provider calls.
Existing copy survives rejected input; use generation.enqueue for authored jobs.
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from app.features.seo.policy import publish,published
from app.features.seo.content_store import connection
from app.core.logging import get_logger
logger=get_logger(__name__)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path)
    args=parser.parse_args()
    samples={r['symbol'] for r in json.loads((ROOT/'frontend/src/lib/seo-samples.json').read_text())}
    for row in json.loads(args.input.read_text()):
        symbol=row['symbol']
        if symbol not in samples:raise ValueError('Symbol outside approved sample')
        source=row['source_url']
        if not source.startswith('https://'):raise ValueError('HTTPS provenance required')
        key='about:'+symbol;stamp=datetime.now(timezone.utc).isoformat()
        if publish(key,row['template'],row['facts'],row['source_ids'],[source],row['model'],row['prompt_version'],stamp,150,300):
            content=published(key)['content'];digest=hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()
            with connection() as db:
                db.execute('CREATE TABLE IF NOT EXISTS companies (symbol TEXT PRIMARY KEY, about TEXT NOT NULL, source_url TEXT NOT NULL, source_hash TEXT NOT NULL, updated_at TEXT NOT NULL)')
                db.execute('INSERT OR REPLACE INTO companies VALUES (?,?,?,?,?)',(symbol,content,source,digest,stamp))
            logger.info('Published company %s',symbol)
        else:logger.warning('Company %s retained previous copy; candidate awaits review',symbol)
if __name__=='__main__':main()
