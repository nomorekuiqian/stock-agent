"""
Index KOL tweets into the generic vector pipeline.

Usage:
    conda run --no-capture-output -n stock_agent python scripts/index_kol_tweets.py --window-hours 72 --limit 100

The script intentionally lives outside feature packages so it can compose the
twitter data source with the generic vector feature without creating a
cross-feature dependency in application code.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


SOURCE_TYPE = "kol_tweet"
# Current production rows may contain either the current quality bands
# (high/medium/low) or an older keep/drop label. Keep both good paths indexable.
DEFAULT_QUALITIES = ("keep", "high", "medium")
DEFAULT_TWEET_TYPES = ("original", "quote", "thread", "article")


def _load_env() -> Path:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / ".env", override=False)
    return root


def _enrichment_of(tweet: dict[str, Any]) -> dict[str, Any]:
    symbols = tweet.get("symbols")
    return symbols if isinstance(symbols, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _string_list(value: Any) -> list[str]:
    return [str(item).strip() for item in _as_list(value) if str(item).strip()]


def _iso_date(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    if len(value) >= 10 and value[4:5] == "-" and value[7:8] == "-":
        return value[:10]
    try:
        return datetime.strptime(
            value,
            "%a %b %d %H:%M:%S %z %Y",
        ).date().isoformat()
    except (TypeError, ValueError):
        return None


def _join(values: list[str]) -> str:
    return ", ".join(values) if values else "N/A"


def _tweet_passes_filters(
    tweet: dict[str, Any],
    *,
    qualities: set[str],
    tweet_types: set[str],
    include_unenriched: bool,
) -> bool:
    tweet_type = str(tweet.get("tweet_type") or "").strip().lower()
    if tweet_types and tweet_type not in tweet_types:
        return False

    enrichment = _enrichment_of(tweet)
    quality = enrichment.get("quality")
    if isinstance(quality, str) and quality:
        return not qualities or quality.strip().lower() in qualities
    return include_unenriched


def _quality_label(tweet: dict[str, Any]) -> str:
    quality = _enrichment_of(tweet).get("quality")
    if isinstance(quality, str) and quality.strip():
        return quality.strip().lower()
    return "unenriched"


def _type_quality_breakdown(tweets: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(
        "%s/%s" % (
            str(tweet.get("tweet_type") or "unknown").strip().lower(),
            _quality_label(tweet),
        )
        for tweet in tweets
    )
    return dict(sorted(counts.items()))


def _metadata_for_tweet(tweet: dict[str, Any]) -> dict[str, Any]:
    enrichment = _enrichment_of(tweet)
    tickers = [item.upper() for item in _string_list(enrichment.get("tickers"))]
    media = _as_list(tweet.get("media"))
    content_parts = _as_list(tweet.get("content_parts"))

    metadata: dict[str, Any] = {
        "author_username": tweet.get("author_username"),
        "tweet_type": tweet.get("tweet_type"),
        "conversation_id": tweet.get("conversation_id"),
        "in_reply_to_username": tweet.get("in_reply_to_username"),
        "created_at": tweet.get("created_at"),
        "category": tweet.get("category"),
        "like_count": tweet.get("like_count") or 0,
        "retweet_count": tweet.get("retweet_count") or 0,
        "reply_count": tweet.get("reply_count") or 0,
        "view_count": tweet.get("view_count") or 0,
        "media_count": len(media),
        "content_part_types": [
            str(part.get("type"))
            for part in content_parts
            if isinstance(part, dict) and part.get("type")
        ],
        "canonical_status": tweet.get("canonical_status"),
        "canonical_hash": tweet.get("canonical_hash"),
        "canonical_extracted_at": tweet.get("canonical_extracted_at"),
        "canonical_extracted_model": tweet.get("canonical_extracted_model"),
        "quality": enrichment.get("quality"),
        "quality_features": _string_list(enrichment.get("quality_features")),
        "content_summary_zh": enrichment.get("content_summary_zh") or "",
        "content_type": enrichment.get("content_type"),
        "key_claim": enrichment.get("key_claim") or "",
        "stance": enrichment.get("stance"),
        "tickers": tickers,
        "sectors": _string_list(enrichment.get("sectors")),
        "events": _string_list(enrichment.get("events")),
        "persona_username": enrichment.get("persona_username"),
        "source_author_username": enrichment.get("source_author_username"),
        "source_kind": enrichment.get("source_kind"),
        "source_tweet_id": enrichment.get("source_tweet_id"),
        "source_url": enrichment.get("source_url"),
        "article_id": enrichment.get("article_id"),
        "article_title": enrichment.get("article_title"),
        "enriched_at": enrichment.get("enriched_at"),
        "enriched_model": enrichment.get("enriched_model"),
    }
    return {key: value for key, value in metadata.items() if value not in (None, "", [])}


def _content_for_tweet(tweet: dict[str, Any], metadata: dict[str, Any]) -> str:
    author = tweet.get("author_username") or "unknown"
    source_author = metadata.get("source_author_username")
    persona = metadata.get("persona_username")
    original = (tweet.get("text") or "").strip()
    quoted = (tweet.get("quoted_tweet_text") or "").strip()
    canonical = (tweet.get("canonical_text") or "").strip()
    summary = metadata.get("content_summary_zh") or metadata.get("key_claim") or "N/A"

    parts = [
        f"Author: @{author}",
        f"Date: {tweet.get('created_at') or 'N/A'}",
        f"Tweet type: {tweet.get('tweet_type') or 'N/A'}",
        f"Quality: {metadata.get('quality') or 'N/A'}",
        f"Content type: {metadata.get('content_type') or 'N/A'}",
        f"Tickers: {_join(metadata.get('tickers') or [])}",
        f"Sectors: {_join(metadata.get('sectors') or [])}",
        f"Events: {_join(metadata.get('events') or [])}",
        f"Summary: {summary}",
    ]
    if persona:
        parts.append(f"Persona: @{persona}")
    if source_author and source_author != author:
        parts.append(f"Source author: @{source_author}")
    if metadata.get("article_title"):
        parts.append(f"Article title: {metadata.get('article_title')}")
    if canonical:
        parts.extend(["", "Canonical tweet content:", canonical])
    else:
        parts.extend(["", "Original tweet:", original])
        if quoted:
            parts.extend(["", "Quoted tweet:", quoted])
    return "\n".join(parts).strip()


def _normalize_cli_values(values: list[str] | None) -> list[str]:
    if not values:
        return []
    normalized: list[str] = []
    for value in values:
        for part in str(value).split(","):
            item = part.strip()
            if item:
                normalized.append(item)
    return normalized


async def _resolve_usernames(author_usernames: list[str]) -> list[str]:
    if author_usernames:
        return [username.lstrip("@") for username in author_usernames]

    from app.features.twitter.service import get_enabled_kols

    return [kol["username"] for kol in await get_enabled_kols()]


async def _pull_kol_tweets(
    *,
    author_usernames: list[str],
    window_hours: int,
    limit: int,
    page_size: int,
) -> list[dict[str, Any]]:
    from app.core.config import EDGE_FUNCTION_SECRET
    from app.core.database import get_insforge_service

    usernames = await _resolve_usernames(author_usernames)
    if not usernames:
        return []

    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    until: str | None = None
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    db = get_insforge_service()
    headers = {"X-Internal-Secret": EDGE_FUNCTION_SECRET} if EDGE_FUNCTION_SECRET else None
    max_page_size = max(1, min(page_size, 1000))

    while len(rows) < limit:
        request_limit = min(max_page_size, limit - len(rows))
        result = await db.call_function(
            "kol-tweets",
            method="POST",
            params={"action": "list_batch"},
            json_body={
                "usernames": usernames,
                "since": since,
                "until": until,
                "limit": request_limit,
            },
            timeout=60.0,
            extra_headers=headers,
        )
        payload = result.get("data") or {}
        if result["status_code"] != 200 or not payload.get("success"):
            raise RuntimeError(
                "list_batch failed: HTTP %s %s"
                % (result["status_code"], result.get("text", "")[:500])
            )

        page = list(payload.get("data") or [])
        if not page:
            break

        for tweet in page:
            tweet_id = str(tweet.get("id") or "")
            if tweet_id and tweet_id not in seen_ids:
                seen_ids.add(tweet_id)
                rows.append(tweet)
                if len(rows) >= limit:
                    break

        # `list_batch` sorts newest first. Move the next request's upper bound
        # to the oldest row we saw. This works around the platform's 1000-row
        # single-response cap without requiring offset support in the function.
        created_values = [
            str(tweet.get("created_at"))
            for tweet in page
            if tweet.get("created_at")
        ]
        next_until = min(created_values) if created_values else None
        if not next_until or next_until == until or len(page) < request_limit:
            break
        until = next_until

    return rows[:limit]


async def _index_one(tweet: dict[str, Any], *, force: bool):
    from app.features.vector.models import VectorDocumentInput, VectorIndexRequest
    from app.features.vector.service import index_document

    metadata = _metadata_for_tweet(tweet)
    tickers = metadata.get("tickers") or []
    author = tweet.get("author_username") or "unknown"
    title = f"@{author} tweet {tweet.get('created_at') or ''}".strip()

    return await index_document(
        VectorIndexRequest(
            document=VectorDocumentInput(
                source_type=SOURCE_TYPE,
                source_id=str(tweet["id"]),
                title=title,
                url=tweet.get("url"),
                symbol=tickers[0] if tickers else None,
                report_date=_iso_date(tweet.get("created_at")),
                visibility="public",
                content=_content_for_tweet(tweet, metadata),
                metadata=metadata,
            ),
            force=force,
        )
    )


async def run(args: argparse.Namespace) -> None:
    author_usernames = _normalize_cli_values(args.author_usernames)
    tweet_types = {item.lower() for item in _normalize_cli_values(args.tweet_types)}
    qualities = {item.lower() for item in _normalize_cli_values(args.qualities)}

    raw_tweets = await _pull_kol_tweets(
        author_usernames=author_usernames,
        window_hours=args.window_hours,
        limit=args.limit,
        page_size=args.page_size,
    )
    eligible = [
        tweet
        for tweet in raw_tweets
        if _tweet_passes_filters(
            tweet,
            qualities=qualities,
            tweet_types=tweet_types,
            include_unenriched=args.include_unenriched,
        )
    ]

    print(
        "PULLED",
        {
            "raw": len(raw_tweets),
            "eligible": len(eligible),
            "author_usernames": author_usernames or "all_enabled_kols",
            "tweet_types": sorted(tweet_types) or "any",
            "window_hours": args.window_hours,
            "limit": args.limit,
            "page_size": args.page_size,
            "qualities": sorted(qualities) or "any",
            "include_unenriched": args.include_unenriched,
            "raw_breakdown": _type_quality_breakdown(raw_tweets),
            "eligible_breakdown": _type_quality_breakdown(eligible),
        },
    )

    if args.dry_run:
        for tweet in eligible[: min(5, len(eligible))]:
            metadata = _metadata_for_tweet(tweet)
            print(
                "DRY_RUN",
                {
                    "source_type": SOURCE_TYPE,
                    "source_id": tweet.get("id"),
                    "author": tweet.get("author_username"),
                    "tweet_type": tweet.get("tweet_type"),
                    "quality": metadata.get("quality"),
                    "tickers": metadata.get("tickers", []),
                    "title": f"@{tweet.get('author_username')} tweet {tweet.get('created_at')}",
                },
            )
        return

    indexed = 0
    skipped = 0
    failed = 0
    for tweet in eligible:
        try:
            response = await _index_one(tweet, force=args.force)
        except Exception as exc:  # noqa: BLE001 - keep backfill moving
            failed += 1
            print("ERROR", {"source_id": tweet.get("id"), "error": str(exc)[:500]})
            continue

        if response.skipped:
            skipped += 1
        elif response.success:
            indexed += 1
        else:
            failed += 1
            print("ERROR", response.model_dump())

    print(
        "SUMMARY",
        {
            "raw": len(raw_tweets),
            "eligible": len(eligible),
            "indexed": indexed,
            "skipped": skipped,
            "failed": failed,
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Index KOL tweets into vector storage.")
    parser.add_argument("--window-hours", type=int, default=72)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument(
        "--page-size",
        type=int,
        default=1000,
        help="Rows to request per list_batch call. Kept at 1000 by default to avoid platform single-response caps.",
    )
    parser.add_argument(
        "--author-usernames",
        "--authors",
        nargs="*",
        default=[],
        help="Only pull these author_username values. Accepts space or comma separated handles.",
    )
    parser.add_argument(
        "--tweet-types",
        nargs="*",
        default=list(DEFAULT_TWEET_TYPES),
        help="Only index these tweet_type values. Pass no values after the flag to disable this filter.",
    )
    parser.add_argument("--qualities", nargs="*", default=list(DEFAULT_QUALITIES))
    parser.add_argument(
        "--include-unenriched",
        action="store_true",
        help="Also index tweets without enrichment metadata.",
    )
    parser.add_argument("--force", action="store_true", help="Reindex even if content hash matches.")
    parser.add_argument("--dry-run", action="store_true", help="Preview selected tweets without indexing.")
    return parser.parse_args()


if __name__ == "__main__":
    _load_env()
    asyncio.run(run(parse_args()))
