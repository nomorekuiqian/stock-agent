"""
Twitter KOL - TwitterAPI.io client and tweet fetching logic.

Fetches tweets from TwitterAPI.io and stores them in the database.
Only needs to run once per KOL — results are persisted for distillation.
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

from app.core.config import TWITTER_API_KEY
from app.core.logging import get_logger
from app.features.twitter import db
from app.shared.twitter_kol_config import KolAccount, enabled_kols

logger = get_logger(__name__)

_BASE_URL = "https://api.twitterapi.io/twitter"


def _api_headers() -> dict:
    return {
        "x-api-key": TWITTER_API_KEY,
        "Content-Type": "application/json",
    }


def _classify_tweet_type(tweet: dict) -> str:
    """Determine the tweet type from raw API data."""
    if tweet.get("retweeted_tweet") and not tweet.get("text", "").strip():
        return "retweet"
    if tweet.get("quoted_tweet"):
        return "quote"
    if tweet.get("isReply"):
        return "reply"
    return "original"


def _is_within_one_year(created_at: Optional[str]) -> bool:
    """Check if a tweet's created_at is within the last year."""
    if not created_at:
        return True  # Keep tweets without dates
    try:
        # TwitterAPI.io format: "Mon Apr 21 12:00:00 +0000 2025"
        tweet_date = datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y")
        one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)
        return tweet_date >= one_year_ago
    except (ValueError, TypeError):
        return True


def _parse_tweet(tweet: dict) -> Optional[dict]:
    """
    Parse a raw tweet from TwitterAPI.io into our storage format.
    Returns None for pure retweets (no commentary) to filter them out.
    """
    tweet_type = _classify_tweet_type(tweet)

    # Skip pure retweets — no analytical value
    if tweet_type == "retweet":
        return None

    # Extract quoted tweet text if present
    quoted_text = None
    qt = tweet.get("quoted_tweet")
    if qt and isinstance(qt, dict):
        quoted_text = qt.get("text")

    return {
        "id": tweet.get("id", ""),
        "author_username": tweet.get("author", {}).get("userName", ""),
        "text": tweet.get("text", ""),
        "tweet_type": tweet_type,
        "conversation_id": tweet.get("conversationId"),
        "quoted_tweet_text": quoted_text,
        "in_reply_to_username": tweet.get("inReplyToUsername"),
        "created_at": tweet.get("createdAt"),
        "like_count": tweet.get("likeCount", 0) or 0,
        "retweet_count": tweet.get("retweetCount", 0) or 0,
        "reply_count": tweet.get("replyCount", 0) or 0,
        "view_count": tweet.get("viewCount", 0) or 0,
        "url": tweet.get("url"),
    }


_RATE_LIMIT_DELAY = 6  # Free tier: 1 request per 5 seconds


async def fetch_tweets_by_search(
    username: str,
    months_back: int = 6,
) -> dict:
    """
    Fetch older tweets using advanced_search with daily time windows.

    TwitterAPI.io docs warn that pagination is unreliable for advanced_search,
    so we use since_time/until_time in daily windows (each returns up to 20).
    """
    if not TWITTER_API_KEY:
        return {"success": False, "error": "TWITTER_API_KEY not configured"}

    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=30 * months_back)

    total_fetched = 0
    total_stored = 0
    total_skipped = 0
    days_processed = 0
    empty_days = 0
    truncated_days: list[str] = []

    current = start_date

    async with httpx.AsyncClient(timeout=30.0) as client:
        while current < now:
            next_day = current + timedelta(days=1)
            since_ts = int(current.timestamp())
            until_ts = int(next_day.timestamp())

            query = f"from:{username} since_time:{since_ts} until_time:{until_ts}"

            await asyncio.sleep(_RATE_LIMIT_DELAY)

            resp_json = await _fetch_page(
                client,
                "tweet/advanced_search",
                {"query": query, "queryType": "Latest"},
            )

            days_processed += 1

            if not resp_json:
                logger.warning(
                    "Failed to fetch day %s", current.strftime("%Y-%m-%d")
                )
                current = next_day
                continue

            raw_tweets = resp_json.get("tweets", [])
            total_fetched += len(raw_tweets)

            if not raw_tweets:
                empty_days += 1
                current = next_day
                continue

            batch = []
            for raw in raw_tweets:
                parsed = _parse_tweet(raw)
                if parsed:
                    batch.append(parsed)
                else:
                    total_skipped += 1

            if batch:
                total_stored += await db.upsert_tweets_batch(batch)

            day_str = current.strftime("%Y-%m-%d")
            if len(raw_tweets) >= 20:
                truncated_days.append(day_str)
                logger.warning(
                    "Day %s returned 20 tweets - may have missed some", day_str
                )

            if days_processed % 30 == 0:
                logger.info(
                    "Progress: %d days processed, %d fetched, %d stored",
                    days_processed,
                    total_fetched,
                    total_stored,
                )

            current = next_day

    result = {
        "success": True,
        "username": username,
        "months_back": months_back,
        "days_processed": days_processed,
        "empty_days": empty_days,
        "total_fetched": total_fetched,
        "total_stored": total_stored,
        "total_skipped_retweets": total_skipped,
        "truncated_days": truncated_days,
    }

    logger.info("Search fetch complete for @%s: %s", username, result)
    return result


async def refetch_truncated_days(
    username: str,
    truncated_days: list[str],
) -> dict:
    """
    Re-fetch truncated days using half-day windows (12h each).
    Called after fetch_tweets_by_search to recover tweets from days
    that hit the 20-tweet API cap.
    """
    if not TWITTER_API_KEY:
        return {"success": False, "error": "TWITTER_API_KEY not configured"}

    total_fetched = 0
    total_stored = 0
    total_skipped = 0
    still_truncated: list[str] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for day_str in truncated_days:
            day_start = datetime.strptime(day_str, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            day_mid = day_start + timedelta(hours=12)
            day_end = day_start + timedelta(days=1)

            for window_start, window_end in [
                (day_start, day_mid),
                (day_mid, day_end),
            ]:
                since_ts = int(window_start.timestamp())
                until_ts = int(window_end.timestamp())
                query = f"from:{username} since_time:{since_ts} until_time:{until_ts}"

                await asyncio.sleep(_RATE_LIMIT_DELAY)

                resp_json = await _fetch_page(
                    client,
                    "tweet/advanced_search",
                    {"query": query, "queryType": "Latest"},
                )
                if not resp_json:
                    continue

                raw_tweets = resp_json.get("tweets", [])
                total_fetched += len(raw_tweets)

                batch = []
                for raw in raw_tweets:
                    parsed = _parse_tweet(raw)
                    if parsed:
                        batch.append(parsed)
                    else:
                        total_skipped += 1

                if batch:
                    total_stored += await db.upsert_tweets_batch(batch)

                if len(raw_tweets) >= 20:
                    half = "AM" if window_start == day_start else "PM"
                    still_truncated.append(f"{day_str} {half}")
                    logger.warning(
                        "Half-day %s %s still returned 20 tweets", day_str, half
                    )

            logger.info("Refetched day %s", day_str)

    result = {
        "success": True,
        "username": username,
        "days_refetched": len(truncated_days),
        "total_fetched": total_fetched,
        "total_stored": total_stored,
        "total_skipped_retweets": total_skipped,
        "still_truncated": still_truncated,
    }
    logger.info("Refetch complete for @%s: %s", username, result)
    return result


async def fetch_article(tweet_id: str) -> Optional[dict]:
    """
    Fetch a Twitter article by tweet ID.
    Returns dict with title and full text content, or None.
    Docs: https://docs.twitterapi.io/api-reference/endpoint/get_article
    """
    if not TWITTER_API_KEY:
        return None

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{_BASE_URL}/article",
                headers=_api_headers(),
                params={"tweet_id": tweet_id},
            )
        except httpx.TimeoutException:
            logger.warning("Timeout fetching article for tweet %s", tweet_id)
            return None

    if resp.status_code != 200:
        logger.error("Failed to fetch article %s: HTTP %d", tweet_id, resp.status_code)
        return None

    resp_json = resp.json()
    data = resp_json.get("data", resp_json)
    article = data.get("article")
    if not article:
        return None

    # Concatenate content blocks into plain text
    title = article.get("title", "")
    parts = []
    if title:
        parts.append(f"# {title}\n")

    for block in article.get("contents", []):
        btype = block.get("type", "")
        text = block.get("text", "")
        if btype in ("header-one", "header-two", "header-three"):
            level = {"header-one": "##", "header-two": "###", "header-three": "####"}[btype]
            parts.append(f"{level} {text}")
        elif btype in ("unstyled", "markdown"):
            parts.append(text)
        elif btype in ("unordered-list-item",):
            parts.append(f"- {text}")
        elif btype in ("ordered-list-item",):
            parts.append(f"1. {text}")
        elif btype == "divider":
            parts.append("---")

    full_text = "\n\n".join(parts)

    return {
        "title": title,
        "text": full_text,
        "view_count": article.get("viewCount", 0),
        "like_count": article.get("likeCount", 0),
        "reply_count": article.get("replyCount", 0),
        "raw_article": article,
    }


async def fetch_and_store_articles(username: str) -> dict:
    """
    Find tweets that are likely articles (short text with t.co link)
    and fetch their full article content, updating the database.
    Scans all pages to find candidates.
    """
    # Paginate through all tweets to find article candidates
    candidates: list[dict] = []
    page = 1
    while True:
        tweets = await db.get_tweets(username=username, page=page, limit=100)
        if not tweets:
            break
        for t in tweets:
            if (
                t.get("tweet_type") == "original"
                and t.get("text", "").startswith("https://t.co/")
                and len(t.get("text", "")) < 30
            ):
                candidates.append(t)
        if len(tweets) < 100:
            break
        page += 1

    total = len(candidates)
    fetched = 0
    failed = 0

    for t in candidates:
        tweet_id = t["id"]
        await asyncio.sleep(_RATE_LIMIT_DELAY)

        article = await fetch_article(tweet_id)
        if not article:
            logger.warning("No article found for tweet %s", tweet_id)
            failed += 1
            continue

        # Include author_username to avoid NOT NULL constraint on upsert
        update = {
            "id": tweet_id,
            "author_username": t["author_username"],
            "text": article["text"],
            "tweet_type": "article",
            "like_count": article["like_count"],
            "view_count": article["view_count"],
            "reply_count": article["reply_count"],
        }
        await db.upsert_tweets_batch([update])
        fetched += 1
        logger.info("Stored article: %s (%s)", article["title"], tweet_id)

    return {
        "success": True,
        "username": username,
        "candidates": total,
        "articles_fetched": fetched,
        "failed": failed,
    }


async def _fetch_page(
    client: httpx.AsyncClient,
    endpoint: str,
    params: dict,
) -> Optional[dict]:
    """Fetch a single page from TwitterAPI.io with rate limit handling."""
    try:
        resp = await client.get(
            f"{_BASE_URL}/{endpoint}",
            headers=_api_headers(),
            params=params,
        )
    except httpx.TimeoutException:
        logger.warning("Timeout calling %s with params %s", endpoint, params)
        return None

    if resp.status_code == 429:
        logger.warning("Rate limited, waiting %ds", _RATE_LIMIT_DELAY * 2)
        await asyncio.sleep(_RATE_LIMIT_DELAY * 2)
        try:
            resp = await client.get(
                f"{_BASE_URL}/{endpoint}",
                headers=_api_headers(),
                params=params,
            )
        except httpx.TimeoutException:
            return None

    if resp.status_code != 200:
        logger.error("HTTP %d from %s: %s", resp.status_code, endpoint, resp.text[:200])
        return None

    return resp.json()


async def fetch_and_store_tweets(
    username: str,
    max_pages: int = 50,
) -> dict:
    """
    Fetch tweets from a user's timeline and store them in the database.

    Strategy:
    1. Use /twitter/user/last_tweets (accepts userName) to get first page + userId
    2. Switch to /twitter/user/tweet_timeline (accepts userId) for deep pagination
    3. Rate limit: 6s delay between requests (free tier = 1 req/5s)

    Args:
        username: Twitter username (without @)
        max_pages: Maximum number of pages to fetch (20 tweets/page)

    Returns:
        dict with fetch results summary
    """
    if not TWITTER_API_KEY:
        return {"success": False, "error": "TWITTER_API_KEY not configured"}

    total_fetched = 0
    total_stored = 0
    total_skipped = 0
    pages_fetched = 0
    reached_time_limit = False
    user_id: Optional[str] = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        # --- Page 1: use last_tweets to get userId ---
        resp_json = await _fetch_page(client, "user/last_tweets", {"userName": username})
        if not resp_json:
            return {"success": False, "error": f"Failed to fetch first page for @{username}"}

        if resp_json.get("status") == "error":
            return {"success": False, "error": resp_json.get("msg", "API error")}

        data = resp_json.get("data", resp_json)
        raw_tweets = data.get("tweets", [])
        pages_fetched = 1
        total_fetched = len(raw_tweets)

        # Extract userId from first tweet's author
        if raw_tweets:
            author = raw_tweets[0].get("author", {})
            user_id = author.get("id")
            logger.info("Resolved @%s -> userId=%s", username, user_id)

        # Process first page
        batch = []
        for raw in raw_tweets:
            if not _is_within_one_year(raw.get("createdAt")):
                reached_time_limit = True
                continue
            parsed = _parse_tweet(raw)
            if parsed:
                batch.append(parsed)
            else:
                total_skipped += 1

        if batch:
            total_stored += await db.upsert_tweets_batch(batch)

        logger.info("Page 1: fetched %d, stored %d for @%s", len(raw_tweets), len(batch), username)

        if reached_time_limit or not user_id:
            return {
                "success": True,
                "username": username,
                "pages_fetched": pages_fetched,
                "total_fetched": total_fetched,
                "total_stored": total_stored,
                "total_skipped_retweets": total_skipped,
                "reached_time_limit": reached_time_limit,
            }

        # --- Page 2+: use tweet_timeline with userId for deep pagination ---
        cursor: Optional[str] = resp_json.get("next_cursor")
        has_next = resp_json.get("has_next_page", False)

        while has_next and cursor and pages_fetched < max_pages:
            await asyncio.sleep(_RATE_LIMIT_DELAY)

            resp_json = await _fetch_page(
                client,
                "user/tweet_timeline",
                {"userId": user_id, "cursor": cursor},
            )
            if not resp_json:
                logger.warning("Failed to fetch page %d, stopping", pages_fetched + 1)
                break

            data = resp_json.get("data", resp_json)
            raw_tweets = data.get("tweets", [])
            pages_fetched += 1
            total_fetched += len(raw_tweets)

            if not raw_tweets:
                logger.info("Empty page %d for @%s, stopping", pages_fetched, username)
                break

            batch = []
            for raw in raw_tweets:
                if not _is_within_one_year(raw.get("createdAt")):
                    reached_time_limit = True
                    continue
                parsed = _parse_tweet(raw)
                if parsed:
                    batch.append(parsed)
                else:
                    total_skipped += 1

            if batch:
                total_stored += await db.upsert_tweets_batch(batch)

            logger.info(
                "Page %d: fetched %d, stored %d for @%s",
                pages_fetched, len(raw_tweets), len(batch), username,
            )

            if reached_time_limit:
                logger.info("Reached 1-year time limit for @%s, stopping", username)
                break

            has_next = resp_json.get("has_next_page", False)
            cursor = resp_json.get("next_cursor")

    result = {
        "success": True,
        "username": username,
        "pages_fetched": pages_fetched,
        "total_fetched": total_fetched,
        "total_stored": total_stored,
        "total_skipped_retweets": total_skipped,
        "reached_time_limit": reached_time_limit,
    }

    logger.info("Fetch complete for @%s: %s", username, result)
    return result


# ---------------------------------------------------------------------------
# Batch fetch across configured KOL catalog
# ---------------------------------------------------------------------------


def _parse_tweet_created_at(value: Optional[str]) -> Optional[datetime]:
    """Parse TwitterAPI.io createdAt (`Mon Apr 21 12:00:00 +0000 2025`) to UTC datetime."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%a %b %d %H:%M:%S %z %Y").astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


async def _fetch_one_kol(
    kol: KolAccount,
    *,
    run_id: str,
    default_max_pages: int,
    safety_window_hours: int,
    include_articles: bool,
) -> dict:
    """Fetch tweets for a single configured KOL with run tracking and per-KOL isolation."""
    username = kol["username"]
    max_pages = default_max_pages
    started_at = datetime.now(timezone.utc)

    row_id = await db.start_fetch_run(run_id=run_id, username=username)

    try:
        result = await fetch_and_store_tweets(username=username, max_pages=max_pages)

        if not result.get("success"):
            error_msg = result.get("error") or "fetch_and_store_tweets reported failure"
            logger.warning("Fetch failed for @%s: %s", username, error_msg)
            if row_id:
                await db.finish_fetch_run(
                    row_id,
                    status="failed",
                    error=error_msg,
                )
            return {"username": username, "status": "failed", "error": error_msg}

        articles_result: Optional[dict] = None
        if include_articles:
            try:
                articles_result = await fetch_and_store_articles(username)
            except Exception as exc:
                logger.warning("Article fetch failed for @%s: %s", username, exc)
                articles_result = {"success": False, "error": str(exc)}

        latest_tweets = await db.get_tweets(username=username, page=1, limit=1)
        last_created_at = _parse_tweet_created_at(
            (latest_tweets[0] or {}).get("created_at") if latest_tweets else None
        )
        reached_window = bool(
            last_created_at
            and last_created_at <= started_at - timedelta(hours=safety_window_hours)
        )

        if row_id:
            await db.finish_fetch_run(
                row_id,
                status="success",
                pages_fetched=int(result.get("pages_fetched", 0)),
                tweets_fetched=int(result.get("total_fetched", 0)),
                tweets_stored=int(result.get("total_stored", 0)),
                tweets_skipped=int(result.get("total_skipped_retweets", 0)),
                reached_safety_window=reached_window,
            )

        return {
            "username": username,
            "status": "success",
            "pages_fetched": result.get("pages_fetched", 0),
            "tweets_fetched": result.get("total_fetched", 0),
            "tweets_stored": result.get("total_stored", 0),
            "tweets_skipped": result.get("total_skipped_retweets", 0),
            "reached_safety_window": reached_window,
            "articles": articles_result,
        }

    except Exception as exc:
        logger.exception("Unexpected error fetching @%s", username)
        if row_id:
            await db.finish_fetch_run(
                row_id,
                status="failed",
                error=str(exc),
            )
        return {"username": username, "status": "failed", "error": str(exc)}


async def fetch_configured_kols(
    *,
    max_pages_per_kol: int = 1,
    safety_window_hours: int = 3,
    include_articles: bool = False,
) -> dict:
    """
    Iterate the enabled KOL catalog and fetch each timeline.

    - Each KOL is wrapped in try/catch — one failure never blocks the rest.
    - Each KOL gets its own row in `twitter_fetch_runs`, sharing a `run_id`.
    - `safety_window_hours` is observability only: we record whether the most
      recent stored tweet falls within (now - window), so we can spot KOLs
      where a single page is no longer enough to cover the cron interval.
    - `include_articles` defaults False to keep cron cost bounded; can be
      promoted later per-KOL.
    """
    catalog = enabled_kols()
    run_id = uuid.uuid4().hex
    started_at = datetime.now(timezone.utc).isoformat()

    if not catalog:
        logger.info("fetch_configured_kols: no enabled KOLs in catalog")
        return {
            "success": True,
            "run_id": run_id,
            "started_at": started_at,
            "kol_count": 0,
            "results": [],
        }

    results: list[dict] = []
    for kol in catalog:
        result = await _fetch_one_kol(
            kol,
            run_id=run_id,
            default_max_pages=max_pages_per_kol,
            safety_window_hours=safety_window_hours,
            include_articles=include_articles,
        )
        results.append(result)

    summary = {
        "success": True,
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "kol_count": len(catalog),
        "succeeded": sum(1 for r in results if r["status"] == "success"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "results": results,
    }
    logger.info(
        "fetch_configured_kols complete: run_id=%s kols=%d succeeded=%d failed=%d",
        run_id, summary["kol_count"], summary["succeeded"], summary["failed"],
    )
    return summary
