"""Push a single batch of Claude-classified enrichments back to kol_tweets.

Reads `_work/enrichments/<username>-<stamp>-batchNN.jsonl` (one classification
per line — see SCHEMA.md), validates each row, derives the storage-side fields
(quality / ticker_stances / enriched_at / enriched_model), and writes via the
`kol-tweets` edge function's `upsert_enrichment` action.

Usage:
    cd backend && source venv/bin/activate
    python scripts/claude_enrich/push_enrichments.py \\
        scripts/claude_enrich/_work/enrichments/qinbafrank-20260531-batch01.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _bootstrap() -> Path:
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from dotenv import load_dotenv
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


ENRICHED_MODEL = "codex-gpt-5-in-session"

VALID_CONTENT_TYPES = {
    "thesis", "trade_action", "catalyst", "sector_framework",
    "risk_flag", "macro_view", "noise",
}

VALID_SECTORS = {
    "CPO", "photonics", "AI_infra", "substrates", "optical_transceiver",
    "defense", "space", "power_semi", "macro", "neocloud",
    "crypto", "stablecoin", "rwa",
}

VALID_STANCES = {"bull", "bear", "neutral"}

# Acronyms commonly mistaken for tickers — see SCHEMA.md
TICKER_DENYLIST = {
    "AI", "ETF", "CEO", "CFO", "CTO", "COO", "IPO", "GDP", "CPI", "FED",
    "CPU", "GPU", "RAM", "SSD", "API", "SDK", "LLM", "RAG", "AGI", "ML",
    "DL", "NLP", "CV", "RL", "VR", "AR", "XR", "IOT", "CRM", "ERP",
    "HTTP", "HTML", "CSS", "US", "EU", "UK", "CN", "JP", "KR", "DE", "FR",
    "USD", "EUR", "JPY", "BTC", "ETH", "SOL", "DOGE", "CPO", "PCB", "SIC",
    "GAN", "NATO", "OPEC", "BRICS", "SEC", "FDA", "EPA", "NSA", "FBI",
    "DHS", "DOE", "DOJ", "WTO", "IMF", "WHO", "UN", "WB", "ECB", "BOJ",
}

_TICKER_US_RE = re.compile(r"^[A-Z]{2,5}$")
_TICKER_CN_RE = re.compile(r"^\d{6}$")

KEY_CLAIM_PREFIX = {
    "thesis": "投资逻辑:",
    "trade_action": "交易操作:",
    "catalyst": "催化剂:",
    "sector_framework": "板块框架:",
    "risk_flag": "风险提示:",
    "macro_view": "宏观分析:",
    "noise": "非投资内容",
}


def _clean_tickers(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        t = item.strip().upper().lstrip("$")
        if not t or t in seen or t in TICKER_DENYLIST:
            continue
        if not (_TICKER_US_RE.match(t) or _TICKER_CN_RE.match(t)):
            continue
        seen.add(t)
        out.append(t)
    return out


def _clean_sectors(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        s = item.strip()
        if s in VALID_SECTORS and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _normalize_key_claim(raw: Any, content_type: str) -> str:
    expected_prefix = KEY_CLAIM_PREFIX.get(content_type, "")
    if not isinstance(raw, str):
        raw = ""
    raw = raw.strip()
    if content_type == "noise":
        return "非投资内容"
    if not raw:
        return f"{expected_prefix} (missing)"
    if expected_prefix and not raw.startswith(expected_prefix):
        # auto-add prefix if Claude forgot it
        raw = f"{expected_prefix} {raw}"
    if len(raw) > 80:
        raw = raw[:79] + "…"
    return raw


def _build_symbols(row: object, now_iso: str) -> tuple[dict | None, str | None]:
    """Returns (symbols, error_reason). symbols is None when row is invalid."""
    if not isinstance(row, dict):
        return None, "not a dict"

    tweet_id = row.get("id")
    if not isinstance(tweet_id, str) or not tweet_id.strip():
        return None, "missing id"

    content_type = row.get("content_type")
    if content_type not in VALID_CONTENT_TYPES:
        return None, f"bad content_type={content_type!r}"

    tickers = _clean_tickers(row.get("tickers"))
    sectors = _clean_sectors(row.get("sectors"))

    stance = row.get("stance")
    if stance not in VALID_STANCES:
        stance = "neutral"

    quality = "drop" if content_type == "noise" else "keep"
    if quality == "drop":
        tickers = []  # noise can't have tickers

    ticker_stances = [{"ticker": t, "stance": stance} for t in tickers]
    key_claim = _normalize_key_claim(row.get("key_claim"), content_type)

    symbols = {
        "quality": quality,
        "ticker_stances": ticker_stances,
        "sectors": sectors,
        "content_type": content_type,
        "tickers": tickers,
        "stance": stance,
        "key_claim": key_claim,
        "enriched_at": now_iso,
        "enriched_model": ENRICHED_MODEL,
    }
    return symbols, None


async def _push(updates: list[dict]) -> dict:
    from app.core.database import get_insforge_service
    from app.core.config import EDGE_FUNCTION_SECRET

    db = get_insforge_service()
    r = await db.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "upsert_enrichment"},
        json_body={"updates": updates},
        timeout=120.0,
        extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
    )
    payload = json.loads(r["text"]) if r.get("text") else {}
    if r.get("status_code") != 200 or not payload.get("success"):
        raise RuntimeError(
            f"upsert_enrichment failed: status={r.get('status_code')} body={r.get('text')!r}"
        )
    return payload


async def _run(path: Path) -> None:
    if not path.exists():
        print(f"ERROR  file not found: {path}")
        sys.exit(1)

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    updates: list[dict] = []
    bad: list[tuple[int, str]] = []
    total_attempted = 0

    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            total_attempted += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                bad.append((lineno, f"json error: {e}"))
                continue
            symbols, err = _build_symbols(row, now_iso)
            if symbols is None:
                bad.append((lineno, err or "unknown"))
                continue
            updates.append({"id": row["id"], "symbols": symbols})

    print(
        f"INFO  {path.name}  attempted={total_attempted}  "
        f"prepared={len(updates)}  bad={len(bad)}"
    )
    if bad:
        for lineno, reason in bad[:10]:
            print(f"  bad line {lineno}: {reason}")
        if len(bad) > 10:
            print(f"  ... ({len(bad) - 10} more)")

    if not updates:
        print("ERROR  no valid rows to push")
        sys.exit(1)

    print(f"INFO  pushing {len(updates)} rows via upsert_enrichment...")
    result = await _push(updates)
    updated = result.get("updated", 0)
    errors = result.get("errors", 0)
    samples = result.get("error_samples") or []

    print(
        f"SUMMARY  total_attempted={total_attempted} "
        f"prepared={len(updates)} total_updated={updated} "
        f"db_errors={errors} bad={len(bad)}"
    )
    for s in samples[:5]:
        print(f"  db error sample: id={s.get('id')} {s.get('error')}")

    # Non-zero exit if anything went wrong, so caller doesn't silently move on.
    if updated != len(updates) or errors or bad:
        sys.exit(2)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Push a Claude-classified enrichment JSONL batch to kol_tweets."
    )
    p.add_argument("path", help="Path to the enrichment JSONL file to push")
    return p.parse_args()


if __name__ == "__main__":
    _bootstrap()
    args = _parse_args()
    asyncio.run(_run(Path(args.path)))
