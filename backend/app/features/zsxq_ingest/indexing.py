"""
Reusable indexing service for 知识星球 (zsxq) thread exports.

Pure functions extracted verbatim from scripts/index_zsxq_threads.py so that
both the CLI and future async endpoints share the same eligibility / enrichment
logic without duplication.

Public API:
    prepare_records(records, *, min_chars, persona_key, persona_name)
        -> (list[PreparedRecord], Counter[str])
    audit_distribution(records, prepared, drop_reasons) -> dict
    index_prepared(rec, *, force) -> VectorIndexResponse   (async)

Internal helpers (_eligible, extract_tickers, etc.) are also exported so the
CLI can import them directly if needed, but callers should prefer the public API.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_SOURCE_TYPE = "zsxq_thread"
DEFAULT_PERSONA_KEY = "pandacircle"
DEFAULT_PERSONA_NAME = "潘大的科技交流圈"

# Compact fallback used only if the maintained cockpit dict cannot be imported.
_FALLBACK_TICKER_ALIASES: dict[str, list[str]] = {
    "NVDA": ["英伟达", "Nvidia", "NVDA"],
    "TSM": ["台积电", "台积", "TSMC", "TSM"],
    "AVGO": ["博通", "Broadcom", "AVGO"],
    "AMD": ["超微", "AMD"],
    "ASML": ["阿斯麦", "ASML"],
    "MU": ["美光", "Micron", "MU"],
    "GOOGL": ["谷歌", "Alphabet", "GOOGL", "GOOG"],
    "MSFT": ["微软", "Microsoft", "MSFT"],
    "META": ["脸书", "Meta", "META"],
    "AMZN": ["亚马逊", "Amazon", "AMZN"],
    "AAPL": ["苹果", "Apple", "AAPL"],
    "TSLA": ["特斯拉", "Tesla", "TSLA"],
}

# This circle is 美股科技 + 区块链; cockpit's dict is AI/semis-heavy, so always
# augment with crypto-adjacent names regardless of which base dict is used.
_CRYPTO_TICKER_ALIASES: dict[str, list[str]] = {
    "COIN": ["Coinbase", "COIN"],
    "MSTR": ["MicroStrategy", "微策略", "Strategy", "MSTR"],
    "CRCL": ["Circle", "CRCL"],
    "HOOD": ["Robinhood", "HOOD"],
    "MARA": ["Marathon", "MARA"],
    "RIOT": ["Riot", "RIOT"],
    "BTC": ["比特币", "Bitcoin", "BTC"],
    "ETH": ["以太坊", "Ethereum", "ETH"],
}

_TICKER_ALIASES_CACHE: dict[str, list[str]] | None = None


# ---------------------------------------------------------------------------
# Internal helpers (copied verbatim from index_zsxq_threads.py)
# ---------------------------------------------------------------------------

def _get_ticker_aliases() -> dict[str, list[str]]:
    global _TICKER_ALIASES_CACHE
    if _TICKER_ALIASES_CACHE is not None:
        return _TICKER_ALIASES_CACHE
    try:
        from app.features.kol_research.cockpit import TICKER_ALIASES

        aliases: dict[str, list[str]] = {k: list(v) for k, v in TICKER_ALIASES.items()}
    except Exception as exc:  # noqa: BLE001 - degrade to fallback dict
        print("WARN", {"ticker_aliases_import_failed": str(exc)[:200]})
        aliases = {k: list(v) for k, v in _FALLBACK_TICKER_ALIASES.items()}
    for ticker, names in _CRYPTO_TICKER_ALIASES.items():
        aliases.setdefault(ticker, names)
    _TICKER_ALIASES_CACHE = aliases
    return aliases


def _has_cjk(text: str) -> bool:
    return any(ord(ch) > 0x2E80 for ch in text)


def extract_tickers(text: str, aliases: dict[str, list[str]]) -> list[str]:
    """Deterministic ticker tagging.

    CJK aliases match by substring. ASCII aliases match on word boundaries;
    short all-caps tickers (ON / ARM / MU) match case-sensitively so they don't
    fire on ordinary prose ("on", "arm"), while proper names (Nvidia) match
    case-insensitively.
    """
    found: list[str] = []
    for ticker, names in aliases.items():
        for name in names:
            name = (name or "").strip()
            if not name:
                continue
            if _has_cjk(name):
                if name in text:
                    found.append(ticker)
                    break
            else:
                flags = 0 if (name.isupper() and len(name) <= 4) else re.IGNORECASE
                if re.search(rf"(?<![A-Za-z0-9]){re.escape(name)}(?![A-Za-z0-9])", text, flags):
                    found.append(ticker)
                    break
    return found


def _main_parts(rec: dict[str, Any]) -> tuple[str | None, str]:
    """Return (question_or_None, body). For q&a the answer is the substance."""
    if rec.get("type") == "q&a":
        question = ((rec.get("question") or {}).get("text") or "").strip()
        answer = ((rec.get("answer") or {}).get("text") or "").strip()
        body = answer or (rec.get("text") or "").strip()
        return (question or None), body
    return None, (rec.get("text") or "").strip()


def _content_type(rec: dict[str, Any], body: str) -> str:
    if rec.get("type") == "q&a":
        return "qa"
    n = len(body)
    if n < 150:
        return "fragment"
    if n >= 800:
        return "analysis"
    return "note"


def _clean_title(rec: dict[str, Any], body: str) -> str:
    raw = (rec.get("title") or "").strip().lstrip("#").strip()
    raw = re.sub(r"[.．…\s]+$", "", raw)  # exporter truncates titles with …/...
    if len(raw) >= 6:
        return raw[:80]
    first_line = next((ln for ln in body.splitlines() if ln.strip()), "")
    return first_line[:80].strip() or "无标题动态"


def _metadata(
    rec: dict[str, Any], *, persona_key: str, content_type: str, tickers: list[str]
) -> dict[str, Any]:
    author = rec.get("author") or {}
    name = author.get("name") or "unknown"
    md: dict[str, Any] = {
        "persona_username": persona_key,
        "author_username": persona_key,            # retrieval pin (matches search_kol_tweets)
        "source_author_username": name,            # real sub-author -> provenance citation
        "author_role": author.get("role"),
        "is_research_assistant": "研究助理" in name,
        "created_at": rec.get("create_time"),
        "topic_type": rec.get("type"),
        "content_type": content_type,
        "tags": [str(t).strip() for t in (rec.get("tags") or []) if str(t).strip()],
        "tickers": tickers,
        "digested": bool(rec.get("digested")),
        "likes_count": rec.get("likes_count") or 0,
        "group_name": rec.get("group_name"),
    }
    return {k: v for k, v in md.items() if v not in (None, "", [])}


def _compose_content(
    rec: dict[str, Any], *, question: str | None, body: str, content_type: str,
    persona_name: str, md: dict[str, Any],
) -> str:
    """Embedded text = Chinese header (Tier 0 signal) + full body."""
    name = md.get("source_author_username", "unknown")
    role = md.get("author_role", "")
    date = (md.get("created_at") or "")[:10] or "N/A"
    tags = md.get("tags") or []
    tickers = md.get("tickers") or []

    lines = [
        f"来源: {persona_name}（知识星球动态）",
        f"作者: {name}（{role}）",
        f"日期: {date}",
        f"类型: {content_type} · 动态类型: {md.get('topic_type', '')}",
    ]
    if tags:
        lines.append("标签: " + " ".join(f"#{t}#" for t in tags))
    if tickers:
        lines.append("标的: " + ", ".join(tickers))
    lines.append(f"标题: {_clean_title(rec, body)}")
    lines.append("")
    if question:
        lines += [f"提问: {question}", "", "回答:"]
    lines.append(body)
    return "\n".join(lines).strip()


def _eligible(rec: dict[str, Any], min_chars: int) -> tuple[bool, str]:
    role = (rec.get("author") or {}).get("role")
    if role not in ("owner", "creator"):
        return False, "non_authored"  # members only comment/ask; skip
    _, body = _main_parts(rec)
    body = body.strip()
    if not body:
        return False, "empty"
    if "欢迎加入" in body and "知识星球" in body:
        return False, "boilerplate"
    if len(body) < min_chars:
        return False, "too_short"
    return True, "ok"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class PreparedRecord:
    source_id: str
    title: str
    url: str | None
    content: str
    content_type: str
    tickers: list[str]
    report_date: str | None
    metadata: dict[str, Any]
    raw: dict[str, Any]


def prepare_records(
    records: list[dict[str, Any]],
    *,
    min_chars: int = 0,
    persona_key: str = DEFAULT_PERSONA_KEY,
    persona_name: str = DEFAULT_PERSONA_NAME,
) -> tuple[list[PreparedRecord], Counter]:
    """Filter and enrich eligible records.

    Returns a tuple of (prepared_records, drop_reasons_counter).
    """
    aliases = _get_ticker_aliases()
    out: list[PreparedRecord] = []
    drop_reasons: Counter[str] = Counter()

    for rec in records:
        ok, reason = _eligible(rec, min_chars)
        if not ok:
            drop_reasons[reason] += 1
            continue
        question, body = _main_parts(rec)
        ctype = _content_type(rec, body)
        tickers = extract_tickers(f"{question or ''}\n{body}", aliases)
        md = _metadata(rec, persona_key=persona_key, content_type=ctype, tickers=tickers)
        content = _compose_content(
            rec, question=question, body=body,
            content_type=ctype, persona_name=persona_name, md=md,
        )
        date = (rec.get("create_time") or "")[:10]
        out.append(PreparedRecord(
            source_id=str(rec["topic_id"]),
            title=_clean_title(rec, body),
            url=rec.get("url"),
            content=content,
            content_type=ctype,
            tickers=tickers,
            report_date=date if len(date) == 10 else None,
            metadata=md,
            raw=rec,
        ))
    return out, drop_reasons


def audit_distribution(
    records: list[dict[str, Any]],
    prepared: list[PreparedRecord],
    drop_reasons: Counter,
) -> dict[str, Any]:
    """Build a distribution summary dict for logging/printing."""
    with_ticker = sum(1 for p in prepared if p.tickers)
    return {
        "total": len(records),
        "selected": len(prepared),
        "dropped": dict(drop_reasons),
        "content_type": dict(Counter(p.content_type for p in prepared)),
        "ticker_coverage": round(with_ticker / max(1, len(prepared)), 2),
        "top_tickers": dict(Counter(t for p in prepared for t in p.tickers).most_common(15)),
        "multi_chunk_docs": sum(1 for p in prepared if len(p.content) > 3200),
    }


async def index_prepared(rec: PreparedRecord, *, force: bool = False):
    """Index a single PreparedRecord via the generic vector pipeline."""
    from app.features.vector.models import VectorDocumentInput, VectorIndexRequest
    from app.features.vector.service import index_document

    return await index_document(VectorIndexRequest(
        document=VectorDocumentInput(
            source_type=DEFAULT_SOURCE_TYPE,
            source_id=rec.source_id,
            title=rec.title,
            url=rec.url,
            symbol=rec.tickers[0] if rec.tickers else None,
            report_date=rec.report_date,
            visibility="public",
            content=rec.content,
            metadata=rec.metadata,
        ),
        force=force,
    ))
