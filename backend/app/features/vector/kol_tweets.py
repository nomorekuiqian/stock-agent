"""KOL tweet adapter for vector indexing."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.vector.models import (
    KolTweetIndexPreview,
    KolTweetIndexRequest,
    KolTweetIndexResponse,
    VectorDocumentInput,
    VectorIndexRequest,
)
from app.features.vector.service import index_document

logger = get_logger(__name__)

SOURCE_TYPE = "kol_tweet"


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
    return value[:10]


def _join(values: list[str]) -> str:
    return ", ".join(values) if values else "N/A"


def _normalize_values(values: list[str]) -> list[str]:
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

    from app.shared.twitter_kol_config import enabled_kols

    return [kol["username"] for kol in enabled_kols()]


async def _pull_kol_tweets(
    *,
    author_usernames: list[str],
    window_hours: int,
    limit: int,
    page_size: int,
) -> list[dict[str, Any]]:
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
        "%s/%s"
        % (
            str(tweet.get("tweet_type") or "unknown").strip().lower(),
            _quality_label(tweet),
        )
        for tweet in tweets
    )
    return dict(sorted(counts.items()))


def _metadata_for_tweet(tweet: dict[str, Any]) -> dict[str, Any]:
    enrichment = _enrichment_of(tweet)
    tickers = [item.upper() for item in _string_list(enrichment.get("tickers"))]

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
        "quality": enrichment.get("quality"),
        "quality_features": _string_list(enrichment.get("quality_features")),
        "content_summary_zh": enrichment.get("content_summary_zh") or "",
        "tickers": tickers,
        "sectors": _string_list(enrichment.get("sectors")),
        "events": _string_list(enrichment.get("events")),
        "enriched_at": enrichment.get("enriched_at"),
        "enriched_model": enrichment.get("enriched_model"),
    }
    return {key: value for key, value in metadata.items() if value not in (None, "", [])}


def _content_for_tweet(tweet: dict[str, Any], metadata: dict[str, Any]) -> str:
    author = tweet.get("author_username") or "unknown"
    original = (tweet.get("text") or "").strip()
    quoted = (tweet.get("quoted_tweet_text") or "").strip()
    summary = metadata.get("content_summary_zh") or "N/A"

    parts = [
        f"Author: @{author}",
        f"Date: {tweet.get('created_at') or 'N/A'}",
        f"Tweet type: {tweet.get('tweet_type') or 'N/A'}",
        f"Quality: {metadata.get('quality') or 'N/A'}",
        f"Tickers: {_join(metadata.get('tickers') or [])}",
        f"Sectors: {_join(metadata.get('sectors') or [])}",
        f"Events: {_join(metadata.get('events') or [])}",
        f"Summary: {summary}",
        "",
        "Original tweet:",
        original,
    ]
    if quoted:
        parts.extend(["", "Quoted tweet:", quoted])
    return "\n".join(parts).strip()


async def _index_one(tweet: dict[str, Any], *, force: bool):
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


def _preview(tweet: dict[str, Any]) -> KolTweetIndexPreview:
    metadata = _metadata_for_tweet(tweet)
    author = tweet.get("author_username")
    return KolTweetIndexPreview(
        source_type=SOURCE_TYPE,
        source_id=str(tweet.get("id") or ""),
        author=author,
        tweet_type=tweet.get("tweet_type"),
        quality=metadata.get("quality"),
        tickers=metadata.get("tickers", []),
        title=f"@{author} tweet {tweet.get('created_at') or ''}".strip(),
    )


async def index_kol_tweets(request: KolTweetIndexRequest) -> KolTweetIndexResponse:
    author_usernames = _normalize_values(request.author_usernames)
    tweet_types = {item.lower() for item in _normalize_values(request.tweet_types)}
    qualities = {item.lower() for item in _normalize_values(request.qualities)}

    raw_tweets = await _pull_kol_tweets(
        author_usernames=author_usernames,
        window_hours=request.window_hours,
        limit=request.limit,
        page_size=request.page_size,
    )
    eligible = [
        tweet
        for tweet in raw_tweets
        if _tweet_passes_filters(
            tweet,
            qualities=qualities,
            tweet_types=tweet_types,
            include_unenriched=request.include_unenriched,
        )
    ]

    response = KolTweetIndexResponse(
        success=True,
        raw=len(raw_tweets),
        eligible=len(eligible),
        author_usernames=author_usernames,
        tweet_types=sorted(tweet_types),
        qualities=sorted(qualities),
        include_unenriched=request.include_unenriched,
        window_hours=request.window_hours,
        limit=request.limit,
        raw_breakdown=_type_quality_breakdown(raw_tweets),
        eligible_breakdown=_type_quality_breakdown(eligible),
        previews=[_preview(tweet) for tweet in eligible[:5]] if request.dry_run else [],
    )

    if request.dry_run:
        return response

    for tweet in eligible:
        try:
            index_response = await _index_one(tweet, force=request.force)
        except Exception as exc:  # noqa: BLE001 - keep cron batch moving
            logger.exception("KOL tweet vector index failed for tweet=%s", tweet.get("id"))
            response.failed += 1
            response.errors.append(
                {"source_id": str(tweet.get("id") or ""), "error": str(exc)[:500]}
            )
            continue

        if index_response.skipped:
            response.skipped += 1
        elif index_response.success:
            response.indexed += 1
        else:
            response.failed += 1
            response.errors.append(
                {
                    "source_id": str(tweet.get("id") or ""),
                    "error": index_response.reason or "index failed",
                }
            )

    response.success = response.failed == 0
    return response
