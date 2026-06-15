"""
Index a 知识星球 (zsxq) thread export into the generic vector pipeline as a
single KOL persona corpus (RAG-only; no cockpit, no separate domain table).

Design decisions (see the design discussion that produced this script):

- One stage: cleaned `threads.jsonl` -> `index_document()` -> Insforge pgvector
  (`vector_documents` + `vector_chunks`). The JSONL committed alongside the data
  pack is the source of truth; re-running is idempotent via `content_hash`.

- New `source_type = "zsxq_thread"`, kept cleanly separate from `kol_tweet`.

- Persona pin: every chunk gets `metadata.author_username = <persona_key>` AND
  `metadata.persona_username = <persona_key>`. This circle has ~147 sub-authors
  but is ONE persona, so the real sub-author goes to
  `metadata.source_author_username`. That triggers the existing
  provenance-aware citation in `shared/kol_persona/tools._format_chunks_for_llm`
  (renders `@<sub-author> / persona @<persona>`). Setting `author_username` to
  the persona key means `search_kol_tweets` retrieves this corpus once the
  persona is registered and the source_type pin is added (a separate ~10-line
  retrieval-side change; this script only produces the data).

- Tier 0 enrichment only (deterministic, no LLM), baked INTO the embedded text
  so it actually helps recall (metadata alone does not help pure semantic RAG):
    * content_type  : qa / fragment / note / analysis  (by type + length)
    * tags          : reused verbatim from the export (444 posts already tagged)
    * tickers       : dictionary match via kol_research.cockpit.TICKER_ALIASES
                      (中文名/英文名 -> ticker), augmented with crypto names
  LLM enrichment (summary / key_claim / stance) is intentionally skipped for v1.

- Chunking caveat: `features.vector.chunking` prepends its own per-chunk header
  and splits docs > ~3200 chars. The Chinese header below therefore only lands
  in chunk 0 of multi-chunk docs (~34 long posts/columns). This is acceptable:
  tickers/author/date also live in per-chunk metadata, so citations stay correct
  on every chunk; only the embedded-token boost is lost on later chunks of long
  posts, which already repeat the names in their analytical body.

Usage:
    conda run --no-capture-output -n stock_agent \
        python scripts/index_zsxq_threads.py --dry-run            # inspect distribution
    conda run --no-capture-output -n stock_agent \
        python scripts/index_zsxq_threads.py                      # embed for real
    python scripts/index_zsxq_threads.py --input /path/threads.jsonl --limit 20 --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

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


def _load_env() -> Path:
    root = Path(__file__).resolve().parents[1]  # backend/
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


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


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


async def _index_one(
    rec: dict[str, Any], question: str | None, body: str, content_type: str,
    tickers: list[str], args: argparse.Namespace,
):
    from app.features.vector.models import VectorDocumentInput, VectorIndexRequest
    from app.features.vector.service import index_document

    md = _metadata(rec, persona_key=args.persona_key, content_type=content_type, tickers=tickers)
    content = _compose_content(
        rec, question=question, body=body, content_type=content_type,
        persona_name=args.persona_name, md=md,
    )
    date = (rec.get("create_time") or "")[:10]
    return await index_document(
        VectorIndexRequest(
            document=VectorDocumentInput(
                source_type=args.source_type,
                source_id=str(rec["topic_id"]),
                title=_clean_title(rec, body),
                url=rec.get("url"),
                symbol=tickers[0] if tickers else None,
                report_date=date if len(date) == 10 else None,
                visibility="public",
                content=content,
                metadata=md,
            ),
            force=args.force,
        )
    )


async def run(args: argparse.Namespace) -> None:
    records = _read_jsonl(args.input)

    selected: list[dict[str, Any]] = []
    drop_reasons: Counter[str] = Counter()
    for rec in records:
        ok, reason = _eligible(rec, args.min_chars)
        (selected.append(rec) if ok else drop_reasons.update([reason]))
    if args.limit:
        selected = selected[: args.limit]

    aliases = _get_ticker_aliases()
    prepared = []
    for rec in selected:
        question, body = _main_parts(rec)
        ctype = _content_type(rec, body)
        tickers = extract_tickers(f"{question or ''}\n{body}", aliases)
        prepared.append((rec, question, body, ctype, tickers))

    # --- distribution report (always printed) ---
    print("INPUT", {"path": str(args.input), "total": len(records),
                    "selected": len(selected), "dropped": dict(drop_reasons)})
    print("CONTENT_TYPE", dict(Counter(p[3] for p in prepared)))
    print("ROLE", dict(Counter((p[0].get("author") or {}).get("role") for p in prepared)))
    print("ASSISTANT_POSTS",
          sum(1 for p in prepared if "研究助理" in ((p[0].get("author") or {}).get("name") or "")))
    with_ticker = sum(1 for p in prepared if p[4])
    print("TICKER_COVERAGE",
          {"with_ticker": with_ticker, "ratio": round(with_ticker / max(1, len(prepared)), 2)})
    print("TOP_TICKERS", dict(Counter(t for p in prepared for t in p[4]).most_common(15)))
    print("CHUNKING", {"docs": len(prepared),
                       "multi_chunk_docs(>3200chars)": sum(1 for p in prepared if len(p[2]) > 3200)})

    if args.dry_run:
        for rec, question, body, ctype, tickers in prepared[:4]:
            md = _metadata(rec, persona_key=args.persona_key, content_type=ctype, tickers=tickers)
            content = _compose_content(
                rec, question=question, body=body, content_type=ctype,
                persona_name=args.persona_name, md=md,
            )
            print("-" * 64)
            print("SAMPLE", {"source_id": rec.get("topic_id"), "type": ctype, "tickers": tickers})
            print(content[:600] + ("…" if len(content) > 600 else ""))
        return

    total = len(prepared)
    indexed = skipped = failed = 0
    for i, (rec, question, body, ctype, tickers) in enumerate(prepared, 1):
        try:
            resp = await _index_one(rec, question, body, ctype, tickers, args)
        except Exception as exc:  # noqa: BLE001 - keep the batch moving
            failed += 1
            print("ERROR", {"source_id": rec.get("topic_id"), "error": str(exc)[:300]}, flush=True)
            continue
        if resp.skipped:
            skipped += 1
        elif resp.success:
            indexed += 1
        else:
            failed += 1
            print("ERROR", resp.model_dump(), flush=True)
        if i % 50 == 0 or i == total:
            print("PROGRESS", {"done": i, "total": total, "indexed": indexed,
                              "skipped": skipped, "failed": failed}, flush=True)

    print("SUMMARY", {"selected": total, "indexed": indexed,
                      "skipped": skipped, "failed": failed}, flush=True)


def parse_args() -> argparse.Namespace:
    default_input = os.getenv("ZSXQ_THREADS") or str(
        Path(__file__).resolve().parents[3] / "zsxq" / "threads.jsonl"
    )
    parser = argparse.ArgumentParser(description="Index a zsxq thread export into vector storage.")
    parser.add_argument("--input", default=default_input, help="Path to threads.jsonl")
    parser.add_argument("--persona-key", default=DEFAULT_PERSONA_KEY,
                        help="Persona username pin written to metadata.author_username/persona_username")
    parser.add_argument("--persona-name", default=DEFAULT_PERSONA_NAME, help="Display name for the content header")
    parser.add_argument("--source-type", default=DEFAULT_SOURCE_TYPE)
    parser.add_argument("--min-chars", type=int, default=0,
                        help="Drop posts whose body is shorter than this (0 = keep all; inspect dry-run first)")
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N eligible records (0 = all)")
    parser.add_argument("--force", action="store_true", help="Reindex even if content hash matches.")
    parser.add_argument("--dry-run", action="store_true", help="Report distribution + samples without embedding.")
    return parser.parse_args()


if __name__ == "__main__":
    _load_env()
    asyncio.run(run(parse_args()))
