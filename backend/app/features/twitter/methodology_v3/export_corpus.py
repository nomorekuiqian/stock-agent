"""
Export a KOL's full tweet corpus from Insforge DB for v3 skill distillation.

Pulls all tweets for a persona via the kol-tweets edge function, applies the
v3 filter (`content_type != noise`), then writes:

  <artifact-root>/evidence/all-tweets.jsonl     one tweet per line
  <artifact-root>/evidence/corpus-manifest.json distribution stats

Usage:
    cd backend
    source venv/bin/activate
    # Default = qinbafrank
    python -m app.features.twitter.methodology_v3.export_corpus
    # Other persona
    python -m app.features.twitter.methodology_v3.export_corpus --persona-key serenity-skill-v1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


def _bootstrap() -> Path:
    root = Path(__file__).resolve().parents[4]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


BACKEND_ROOT = _bootstrap()

from app.core.database import get_insforge_service  # noqa: E402
from app.core.config import EDGE_FUNCTION_SECRET  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.twitter.methodology_v3.personas import evidence_dir, get_persona  # noqa: E402

logger = get_logger(__name__)

# Pull a wide window — first hourly fetch was around 2025-09 for most
# personas. The upper bound is past "today" so future re-runs pick up
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


async def fetch_tweets(db, username: str, since: str, until: str) -> list:
    result = await db.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "list_batch"},
        json_body={
            "usernames": [username],
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


async def run(persona_key: str) -> None:
    cfg = get_persona(persona_key)
    username = cfg["username"]
    output_dir = evidence_dir(cfg)
    output_dir.mkdir(parents=True, exist_ok=True)
    db = get_insforge_service()

    kept: list[dict] = []
    raw_total = 0
    seen_ids: set[str] = set()
    rejected: Counter = Counter()

    for since, until in MONTH_RANGES:
        label = since[:7]
        try:
            tweets = await fetch_tweets(db, username, since, until)
        except Exception as exc:
            logger.error("fetch failed for %s: %s", label, exc)
            logger.error("  %s: ERROR %s", label, exc)
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

        logger.info(
            "  %s: fetched=%s kept=%s running_total=%s",
            label,
            len(tweets),
            kept_this_month,
            len(kept),
        )

    kept.sort(key=lambda r: r.get("created_at") or "")

    jsonl_path = output_dir / "all-tweets.jsonl"
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
        "persona_key": persona_key,
        "username": username,
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
    manifest_path = output_dir / "corpus-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    logger.info("")
    logger.info(
        "Wrote %s tweets to %s",
        len(kept),
        jsonl_path.relative_to(BACKEND_ROOT),
    )
    logger.info("Manifest: %s", manifest_path.relative_to(BACKEND_ROOT))
    logger.info("Content type distribution: %s", dict(content_type_dist))
    logger.info("Rejected: %s", dict(rejected))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--persona-key",
        default="qinbafrank-skill-v3",
        help="Persona key from methodology_v3/personas.py "
             "(default: qinbafrank-skill-v3)",
    )
    args = parser.parse_args()
    asyncio.run(run(args.persona_key))


if __name__ == "__main__":
    main()
