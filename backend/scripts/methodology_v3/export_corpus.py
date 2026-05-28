"""
Export qinbafrank's full tweet corpus from Insforge DB for v3 skill distillation.

Pulls all qinbafrank tweets via the kol-tweets edge function, applies the
v3 filter (`symbols.quality in {high, medium}` and `content_type != noise`),
then writes:

  _drafts/qinbafrank-skill-v3/evidence/all-tweets.jsonl     one tweet per line
  _drafts/qinbafrank-skill-v3/evidence/corpus-manifest.json distribution stats

Usage:
    cd backend
    source venv/bin/activate
    python -m app.features.twitter.methodology_v3.export_corpus
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


def _bootstrap() -> Path:
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


BACKEND_ROOT = _bootstrap()

from app.core.database import get_insforge_service  # noqa: E402
from app.core.config import EDGE_FUNCTION_SECRET  # noqa: E402
from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

USERNAME = "qinbafrank"

# Small JSON metadata stays in production-tracked dir (corpus-manifest.json).
OUTPUT_DIR = (
    BACKEND_ROOT
    / "app" / "features" / "twitter"
    / "methodologies" / "_drafts"
    / "qinbafrank-skill-v3" / "evidence"
)
# The large all-tweets.jsonl goes to the gitignored artifacts dir.
ARTIFACTS_EVIDENCE_DIR = (
    BACKEND_ROOT
    / "app" / "features" / "twitter"
    / "_distillation_artifacts"
    / "qinbafrank-skill-v3" / "evidence"
)

# Pull a wide window — qinbafrank's first hourly fetch was 2025-10. The
# upper bound is intentionally past "today" so any future re-runs pick up
# newer tweets without code changes.
MONTH_RANGES: list[tuple[str, str]] = [
    ("2025-09-01T00:00:00Z", "2025-09-30T23:59:59Z"),
    ("2025-10-01T00:00:00Z", "2025-10-31T23:59:59Z"),
    ("2025-11-01T00:00:00Z", "2025-11-30T23:59:59Z"),
    ("2025-12-01T00:00:00Z", "2025-12-31T23:59:59Z"),
    ("2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z"),
    ("2026-02-01T00:00:00Z", "2026-02-28T23:59:59Z"),
    ("2026-03-01T00:00:00Z", "2026-03-31T23:59:59Z"),
    ("2026-04-01T00:00:00Z", "2026-04-30T23:59:59Z"),
    ("2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"),
    ("2026-06-01T00:00:00Z", "2026-06-30T23:59:59Z"),
]

EXCLUDED_CONTENT_TYPES = {"noise"}

# Note on quality field: v1 lens docs mention "high/medium/low quality" but
# the current enrichment (claude-sonnet-4-6, enriched_at 2026-05-25) does
# NOT populate a `quality` field. Quality signal is now carried by
# `content_type` ∈ {catalyst, thesis, macro_view, trade_action,
#  sector_framework, risk_flag, noise}. We drop only `noise`.


def passes_filter(tweet: dict) -> tuple[bool, str | None]:
    symbols = tweet.get("symbols")
    if not isinstance(symbols, dict):
        return False, "symbols_missing"
    content_type = symbols.get("content_type")
    if not content_type:
        return False, "content_type_missing"
    if content_type in EXCLUDED_CONTENT_TYPES:
        return False, f"content_type={content_type!r}"
    return True, None


async def fetch_tweets(db, since: str, until: str) -> list:
    result = await db.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "list_batch"},
        json_body={
            "usernames": [USERNAME],
            "since": since,
            "until": until,
            "limit": 5000,
        },
        timeout=60.0,
        extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    tweets = data.get("data", []) or data.get("tweets", [])
    return tweets or []


def normalize_tweet(t: dict) -> dict:
    symbols = t.get("symbols") or {}
    return {
        "tweet_id": str(t.get("id")),
        "created_at": t.get("created_at"),
        "text": t.get("text") or "",
        "quoted_tweet_text": t.get("quoted_tweet_text"),
        "tweet_type": t.get("tweet_type"),
        "in_reply_to_username": t.get("in_reply_to_username"),
        "url": t.get("url"),
        "category": t.get("category"),
        "symbols": {
            "tickers": symbols.get("tickers") or [],
            "sectors": symbols.get("sectors") or [],
            "content_type": symbols.get("content_type"),
            "key_claim": symbols.get("key_claim"),
            "ticker_stances": symbols.get("ticker_stances") or [],
            "enriched_model": symbols.get("enriched_model"),
        },
        "metrics": {
            "likes": t.get("like_count") or 0,
            "retweets": t.get("retweet_count") or 0,
            "replies": t.get("reply_count") or 0,
            "views": t.get("view_count") or 0,
        },
    }


async def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    db = get_insforge_service()

    kept: list[dict] = []
    raw_total = 0
    seen_ids: set[str] = set()
    rejected = Counter()

    for since, until in MONTH_RANGES:
        label = since[:7]
        try:
            tweets = await fetch_tweets(db, since, until)
        except Exception as exc:
            logger.error("fetch failed for %s: %s", label, exc)
            print(f"  {label}: ERROR {exc}", flush=True)
            continue

        raw_total += len(tweets)
        kept_this_month = 0
        for t in tweets:
            tid = str(t.get("id") or "")
            if not tid or tid in seen_ids:
                continue
            seen_ids.add(tid)
            ok, reason = passes_filter(t)
            if not ok:
                rejected[reason or "unknown"] += 1
                continue
            kept.append(normalize_tweet(t))
            kept_this_month += 1

        print(
            f"  {label}: fetched={len(tweets)} kept={kept_this_month} "
            f"running_total={len(kept)}",
            flush=True,
        )

    kept.sort(key=lambda r: r.get("created_at") or "")

    ARTIFACTS_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    jsonl_path = ARTIFACTS_EVIDENCE_DIR / "all-tweets.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as f:
        for row in kept:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    content_type_dist = Counter(r["symbols"].get("content_type") for r in kept)
    category_dist = Counter(r.get("category") for r in kept)

    ticker_counter: Counter = Counter()
    sector_counter: Counter = Counter()
    for r in kept:
        sym = r.get("symbols") or {}
        for tk in sym.get("tickers") or []:
            ticker_counter[tk] += 1
        for sec in sym.get("sectors") or []:
            sector_counter[sec] += 1

    earliest = kept[0]["created_at"] if kept else None
    latest = kept[-1]["created_at"] if kept else None

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "username": USERNAME,
        "source": "insforge_db_via_kol-tweets_edge_function",
        "filter": {
            "exclude_content_type": sorted(EXCLUDED_CONTENT_TYPES),
            "note": "quality field is not populated by current enrichment; signal is content_type",
        },
        "month_ranges": [{"since": s, "until": u} for s, u in MONTH_RANGES],
        "stats": {
            "raw_fetched": raw_total,
            "unique_after_dedupe": len(seen_ids),
            "total_kept": len(kept),
            "rejected": dict(rejected),
            "earliest": earliest,
            "latest": latest,
            "content_type_distribution": dict(content_type_dist),
            "category_distribution": dict(category_dist),
            "top_50_tickers": ticker_counter.most_common(50),
            "top_30_sectors": sector_counter.most_common(30),
        },
    }
    manifest_path = OUTPUT_DIR / "corpus-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print()
    print(f"Wrote {len(kept)} tweets to {jsonl_path.relative_to(BACKEND_ROOT)}")
    print(f"Manifest: {manifest_path.relative_to(BACKEND_ROOT)}")
    print(f"Content type distribution: {dict(content_type_dist)}")
    print(f"Rejected: {dict(rejected)}")


if __name__ == "__main__":
    asyncio.run(main())
