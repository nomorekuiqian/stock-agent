"""Publication checks shared by offline generation and public projections."""
import math
import re
from string import Formatter
from .content_store import connection

BANNED = re.compile(r'必涨|推荐买入|稳赚|保证收益|喊单|目标价必达|抄底|闭眼买|翻倍|建议(?:买入|卖出|加仓|减仓)|目标价将达|一定|必然')


def public_text(value, limit=None):
    value = re.sub(r'<[^>]*>', '', value if isinstance(value, str) else '').strip()
    if BANNED.search(value):
        return ''
    return value[:limit] if limit else value


def license_status(username):
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS kol_licenses (username TEXT PRIMARY KEY, license_status TEXT NOT NULL CHECK (license_status IN ("authorized","summary_only","prohibited")))')
        row = db.execute('SELECT license_status FROM kol_licenses WHERE username=?', (username.lower(),)).fetchone()
    return row[0] if row else 'summary_only'


def render_generated(template, facts, source_ids, allowed_sources):
    """LLM output cannot contain numeric literals; only validated fact placeholders."""
    if not source_ids or not set(source_ids).issubset(allowed_sources):
        raise ValueError('Untraceable source ids')
    if BANNED.search(template):
        raise ValueError('Prohibited language')
    parts = list(Formatter().parse(template))
    for literal, field, spec, conversion in parts:
        if re.search(r'\d', literal):
            raise ValueError('Numeric literal must be a source placeholder')
        if field is not None and (field not in facts or spec or conversion):
            raise ValueError('Unknown or formatted placeholder')
        if field is not None:
            value = facts[field]
            if value is None or isinstance(value, float) and not math.isfinite(value):
                raise ValueError('Missing fact')
    return template.format_map(facts)


def publish(key, template, facts, source_ids, allowed_sources, model, prompt_version, generated_at, minimum=0, maximum=300, expected_revision=None):
    """Rejected candidates enter review queue; previous published copy is retained."""
    import json
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        if expected_revision:
            current=db.execute('SELECT revision FROM seo_jobs WHERE key=?',(key,)).fetchone()
            if not current or current[0]!=expected_revision:return False
        db.execute('CREATE TABLE IF NOT EXISTS generated_content (key TEXT PRIMARY KEY, content TEXT NOT NULL, generated_at TEXT NOT NULL, source_ids TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS content_review_queue (id INTEGER PRIMARY KEY, key TEXT, candidate TEXT, reason TEXT, created_at TEXT)')
        try:
            result = render_generated(template, facts, source_ids, allowed_sources)
            if not minimum <= len(re.findall(r'[\u4e00-\u9fff]', result)) <= maximum:
                raise ValueError('Content length outside publication bounds')
            if key.startswith(('today-answer:','morning-answer:')) and len(result)>140:
                raise ValueError('Answer exceeds 140 characters')
            if BANNED.search(result):
                raise ValueError('Prohibited rendered fact')
        except ValueError as exc:
            db.execute('INSERT INTO content_review_queue(key,candidate,reason,created_at) VALUES (?,?,?,?)', (key,template,str(exc),generated_at))
            return False
        db.execute('INSERT OR REPLACE INTO generated_content VALUES (?,?,?,?,?,?)', (key,result,generated_at,json.dumps(source_ids),model,prompt_version))
    return True


def published(key):
    with connection() as db:
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='generated_content'").fetchone()
        row = db.execute('SELECT content,generated_at,source_ids,model,prompt_version FROM generated_content WHERE key=?', (key,)).fetchone() if exists else None
    return dict(zip(('content','generated_at','source_ids','model','prompt_version'),row)) if row else None
