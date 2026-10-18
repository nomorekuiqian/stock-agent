"""Versioned company content and durable public-page revision metadata."""
import json
import os
import sqlite3
from pathlib import Path
DEFAULT_PATH=Path(__file__).parent/'company_content.sqlite'

def initialize_storage():
    """Seed the persistent volume once; never replace an existing content database."""
    configured = os.getenv("SEO_CONTENT_DB")
    if os.getenv("ENVIRONMENT") == "production" and not configured:
        raise RuntimeError("SEO_CONTENT_DB must point to persistent storage in production")
    path = Path(configured) if configured else DEFAULT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix(".initializing")
        try:
            with sqlite3.connect(DEFAULT_PATH) as source, sqlite3.connect(temporary) as destination:
                source.backup(destination)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    with sqlite3.connect(path) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("SEO content storage integrity check failed")
        db.execute("SELECT symbol FROM companies LIMIT 1")

def connection():
    path=Path(os.getenv('SEO_CONTENT_DB',str(DEFAULT_PATH)))
    return sqlite3.connect(path)
def get_company(symbol):
    if not Path(os.getenv('SEO_CONTENT_DB',str(DEFAULT_PATH))).exists(): return None
    with connection() as db:
        row=db.execute('SELECT about, source_url, source_hash, updated_at FROM companies WHERE symbol=?',(symbol,)).fetchone()
    return dict(zip(('about','source_url','source_hash','updated_at'),row)) if row else None

def changed(key, content):
    import hashlib
    digest=hashlib.sha256(json.dumps(content,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS revisions (key TEXT PRIMARY KEY, digest TEXT NOT NULL)')
        old=db.execute('SELECT digest FROM revisions WHERE key=?',(key,)).fetchone()
    return not old or old[0]!=digest,digest

def acknowledge(key,digest):
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO revisions VALUES (?,?)',(key,digest))

def get_profile(symbol):
    if not Path(os.getenv('SEO_CONTENT_DB',str(DEFAULT_PATH))).exists(): return None
    with connection() as db:
        exists=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='profiles'").fetchone()
        if not exists:return None
        row=db.execute('SELECT payload FROM profiles WHERE symbol=?',(symbol,)).fetchone()
    return json.loads(row[0]) if row else None

def modification_time(symbol,digest,initial):
    from datetime import datetime,timezone
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS document_versions (symbol TEXT PRIMARY KEY, digest TEXT NOT NULL, updated_at TEXT NOT NULL)')
        old=db.execute('SELECT digest,updated_at FROM document_versions WHERE symbol=?',(symbol,)).fetchone()
        if old and old[0]==digest:return old[1]
        stamp=datetime.now(timezone.utc).isoformat() if old else (initial or datetime.now(timezone.utc).isoformat())
        db.execute('INSERT OR REPLACE INTO document_versions VALUES (?,?,?)',(symbol,digest,stamp))
    return stamp


def title_direction(symbol, change, now):
    """Persist direction, allowing at most one title change in seven days."""
    from datetime import datetime, timedelta
    if change is None:
        return None
    direction = '涨' if change >= 0 else '跌'
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS title_variants (symbol TEXT PRIMARY KEY, direction TEXT, title_variant_changed_at TEXT)')
        row = db.execute('SELECT direction,title_variant_changed_at FROM title_variants WHERE symbol=?',(symbol,)).fetchone()
        if row and (row[0] == direction or now-datetime.fromisoformat(row[1]) < timedelta(days=7)):
            return {'direction':row[0],'title_variant_changed_at':row[1]}
        db.execute('INSERT OR REPLACE INTO title_variants VALUES (?,?,?)',(symbol,direction,now.isoformat()))
    return {'direction':direction,'title_variant_changed_at':now.isoformat()}
