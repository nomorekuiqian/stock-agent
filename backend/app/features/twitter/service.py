"""
Twitter KOL - TwitterAPI.io client and tweet fetching logic.

List-only ingestion: tweets come exclusively from Twitter lists synced into
the `kol_accounts` catalog (source = "list:<id>"). The legacy per-KOL
`user/last_tweets` path was removed because it billed for 20 tweets/KOL/hour
regardless of activity; list/tweets bills only for tweets actually published
inside the lookback window.
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

from app.core.config import TWITTER_API_KEY
from app.core.logging import get_logger
from app.features.twitter import db
from app.shared.twitter_kol_config import KolAccount

logger = get_logger(__name__)

_BASE_URL = "https://api.twitterapi.io/twitter"
_RATE_LIMIT_DELAY = 6  # Free tier: 1 request per 5 seconds

# In-memory cache for the kol_accounts catalog so the hourly cron doesn't hit
# Insforge on every iteration. 5-minute TTL is short enough that admin edits
# show up quickly in the next cron run.
_CATALOG_CACHE: dict = {"value": None, "expires_at": 0.0}
_CATALOG_TTL_SECONDS = 300

_LIST_SOURCE_PREFIX = "list:"


async def get_enabled_kols() -> list[KolAccount]:
    """
    Active KOL catalog from `kol_accounts` DB. Returns empty list when DB is
    empty — there is no longer a hardcoded fallback (the seed list was retired
    after migrating every KOL to Twitter-list ingestion).
    """
    import time
    now = time.time()
    cached = _CATALOG_CACHE.get("value")
    if cached is not None and now < _CATALOG_CACHE.get("expires_at", 0.0):
        return cached

    rows = await db.list_kol_accounts(enabled_only=True)
    catalog: list[KolAccount] = [
        {
            "username": r["username"],
            "display_name": r.get("display_name") or r["username"],
            "source": r.get("source", ""),  # type: ignore[typeddict-item]
        }
        for r in rows
        if r.get("username")
    ]

    if not catalog:
        logger.warning("kol_accounts returned empty — no KOLs will be ingested this run")

    _CATALOG_CACHE["value"] = catalog
    _CATALOG_CACHE["expires_at"] = now + _CATALOG_TTL_SECONDS
    return catalog


def invalidate_catalog_cache() -> None:
    """Force the next get_enabled_kols() call to re-read DB."""
    _CATALOG_CACHE["value"] = None
    _CATALOG_CACHE["expires_at"] = 0.0


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


def _parse_tweet(tweet: dict) -> Optional[dict]:
    """
    Parse a raw tweet from TwitterAPI.io into our storage format.
    Returns None for pure retweets (no commentary) to filter them out.
    """
    tweet_type = _classify_tweet_type(tweet)

    if tweet_type == "retweet":
        return None

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


def _parse_tweet_created_at(value: Optional[str]) -> Optional[datetime]:
    """Parse TwitterAPI.io createdAt (`Mon Apr 21 12:00:00 +0000 2025`) to UTC datetime."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%a %b %d %H:%M:%S %z %Y").astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


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


# ---------------------------------------------------------------------------
# List-timeline ingestion (the only ingestion path)
# ---------------------------------------------------------------------------


def _group_by_list(catalog: list[KolAccount]) -> tuple[dict[str, list[KolAccount]], list[KolAccount]]:
    """
    Group catalog entries by Twitter list id.

    Returns (list_groups, orphans). Orphans are rows whose `source` is not a
    `list:<id>` — they should not exist in normal operation but are surfaced
    here so callers can warn instead of silently dropping them.
    """
    list_groups: dict[str, list[KolAccount]] = {}
    orphans: list[KolAccount] = []
    for kol in catalog:
        src = kol.get("source", "")  # type: ignore[typeddict-item]
        if isinstance(src, str) and src.startswith(_LIST_SOURCE_PREFIX):
            list_id = src[len(_LIST_SOURCE_PREFIX):]
            list_groups.setdefault(list_id, []).append(kol)
        else:
            orphans.append(kol)
    return list_groups, orphans


async def fetch_list_timeline(
    list_id: str,
    *,
    lookback_hours: float = 1.5,
    safety_max_pages: int = 50,
    enabled_usernames: Optional[set[str]] = None,
) -> dict:
    """
    Pull tweets from a Twitter list timeline, stopping based on a TIME WINDOW.

    The list/tweets endpoint returns reverse-chronological pages of ~20 tweets.
    We walk pages until either:

      a) the OLDEST tweet on the current page is older than (now - lookback_hours)
         — primary stop condition; means we've fully covered the requested window.
      b) `has_next_page=false` — list end reached.
      c) `safety_max_pages` reached — defensive cap to prevent runaway loops if
         the upstream API misbehaves (returns same cursor forever, etc.).

    Args:
        list_id: Twitter list ID
        lookback_hours: how far back to fetch. Default 1.5h gives the hourly
            cron a comfortable buffer. Set to 20+ for one-off backfills.
        safety_max_pages: hard cap on pages walked. Should not normally bite.
        enabled_usernames: optional case-insensitive whitelist. Tweets from
            authors not in the set are dropped, honoring soft-deleted accounts
            that may still show up in the list timeline.

    Returns counts suitable for run records / cron logging. Includes
    `stopped_reason` ∈ {"time_window", "list_end", "safety_cap", "api_error"}.
    """
    if not TWITTER_API_KEY:
        return {"success": False, "error": "TWITTER_API_KEY not configured"}
    if not list_id:
        return {"success": False, "error": "list_id required"}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    total_fetched = 0
    total_stored = 0
    total_skipped = 0
    total_filtered = 0
    pages_fetched = 0
    oldest_seen: Optional[datetime] = None
    cursor: Optional[str] = None
    stopped_reason = "list_end"

    async with httpx.AsyncClient(timeout=30.0) as client:
        while pages_fetched < safety_max_pages:
            params: dict = {"listId": list_id}
            if cursor:
                params["cursor"] = cursor

            resp_json = await _fetch_page(client, "list/tweets", params)
            if not resp_json:
                stopped_reason = "api_error"
                break
            if resp_json.get("status") == "error":
                logger.warning(
                    "list/tweets API error for list_id=%s: %s",
                    list_id, resp_json.get("msg"),
                )
                stopped_reason = "api_error"
                break

            raw_tweets = resp_json.get("tweets", [])
            pages_fetched += 1
            total_fetched += len(raw_tweets)

            batch = []
            page_oldest: Optional[datetime] = None
            for raw in raw_tweets:
                parsed = _parse_tweet(raw)
                if not parsed:
                    total_skipped += 1
                    continue
                ca = _parse_tweet_created_at(parsed.get("created_at"))
                if ca and (page_oldest is None or ca < page_oldest):
                    page_oldest = ca
                if enabled_usernames is not None:
                    author = (parsed.get("author_username") or "").lower()
                    if author not in enabled_usernames:
                        total_filtered += 1
                        continue
                batch.append(parsed)

            if batch:
                total_stored += await db.upsert_tweets_batch(batch)
            if page_oldest and (oldest_seen is None or page_oldest < oldest_seen):
                oldest_seen = page_oldest

            logger.info(
                "list/tweets page %d: fetched=%d stored=%d filtered=%d "
                "page_oldest=%s (list_id=%s)",
                pages_fetched, len(raw_tweets), len(batch), total_filtered,
                page_oldest.isoformat() if page_oldest else "?", list_id,
            )

            if page_oldest is not None and page_oldest < cutoff:
                stopped_reason = "time_window"
                break

            if not resp_json.get("has_next_page"):
                stopped_reason = "list_end"
                break
            cursor = resp_json.get("next_cursor")
            if not cursor:
                stopped_reason = "list_end"
                break
        else:
            stopped_reason = "safety_cap"
            logger.warning(
                "list/tweets hit safety_max_pages=%d for list_id=%s — window may be incomplete",
                safety_max_pages, list_id,
            )

    return {
        "success": True,
        "list_id": list_id,
        "lookback_hours": lookback_hours,
        "pages_fetched": pages_fetched,
        "total_fetched": total_fetched,
        "total_stored": total_stored,
        "total_skipped_retweets": total_skipped,
        "total_filtered_disabled": total_filtered,
        "oldest_tweet_seen": oldest_seen.isoformat() if oldest_seen else None,
        "stopped_reason": stopped_reason,
    }


async def fetch_list_members(list_id: str) -> list[dict]:
    """
    Pull all members of a Twitter list (paginated). Returns raw user records.
    """
    if not TWITTER_API_KEY:
        return []
    members: list[dict] = []
    cursor: Optional[str] = None
    pages = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while pages < 30:  # safety cap; a list usually < 600 members
            params: dict = {"list_id": list_id}
            if cursor:
                params["cursor"] = cursor
            resp_json = await _fetch_page(client, "list/members", params)
            if not resp_json:
                break
            page_members = resp_json.get("members", [])
            members.extend(page_members)
            pages += 1
            if not resp_json.get("has_next_page"):
                break
            cursor = resp_json.get("next_cursor")
            if not cursor:
                break
    logger.info("Fetched %d members from list_id=%s in %d pages", len(members), list_id, pages)
    return members


async def sync_kol_list(list_id: str) -> dict:
    """
    Sync a Twitter list's membership into kol_accounts.

    - New members → upsert with source="list:<list_id>", enabled=true
    - Members already in DB → updated (followers / bio / display_name refreshed)
    - Members no longer in list (with this source) → enabled=false (soft delete)
    """
    members = await fetch_list_members(list_id)
    if not members:
        return {"success": False, "error": "list returned 0 members", "list_id": list_id}

    source = f"{_LIST_SOURCE_PREFIX}{list_id}"
    accounts: list[dict] = []
    current_usernames: list[str] = []
    for m in members:
        username = (m.get("userName") or "").strip().lower()
        if not username:
            continue
        current_usernames.append(username)
        accounts.append({
            "username": username,
            "display_name": m.get("name") or username,
            "source": source,
            "enabled": True,
            "followers": m.get("followers"),
            "bio": (m.get("description") or "")[:500] or None,
        })

    upserted = await db.upsert_kol_accounts(accounts)
    disabled = await db.disable_kol_accounts_missing_from(
        source=source, current_usernames=current_usernames,
    )
    invalidate_catalog_cache()

    return {
        "success": True,
        "list_id": list_id,
        "members_fetched": len(members),
        "upserted": upserted,
        "disabled_missing": disabled,
    }


async def fetch_configured_kols(
    *,
    list_lookback_hours: float = 1.5,
    list_safety_max_pages: int = 50,
) -> dict:
    """
    Iterate enabled KOL catalog and fetch via Twitter lists.

    Each list gets ONE list/tweets call covering all its members. Each list is
    wrapped in try/catch — one failure never blocks the rest. Each list gets
    an aggregated `_list:<id>` row in `twitter_fetch_runs` sharing a run_id.

    Orphan rows (source not `list:<id>`) are dropped with a warning — they
    indicate stale data from the deprecated manual-ingest path.
    """
    catalog = await get_enabled_kols()
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

    list_groups, orphans = _group_by_list(catalog)
    if orphans:
        logger.warning(
            "Skipping %d KOL row(s) with non-list source (manual path removed): %s",
            len(orphans),
            [k.get("username") for k in orphans[:10]],
        )

    results: list[dict] = []
    for list_id, members_in_list in list_groups.items():
        enabled_set = {m["username"].lower() for m in members_in_list}
        synthetic_username = f"_list:{list_id}"
        row_id = await db.start_fetch_run(run_id=run_id, username=synthetic_username)
        try:
            r = await fetch_list_timeline(
                list_id,
                lookback_hours=list_lookback_hours,
                safety_max_pages=list_safety_max_pages,
                enabled_usernames=enabled_set,
            )
            if row_id:
                await db.finish_fetch_run(
                    row_id,
                    status="success" if r.get("success") else "failed",
                    pages_fetched=int(r.get("pages_fetched", 0)),
                    tweets_fetched=int(r.get("total_fetched", 0)),
                    tweets_stored=int(r.get("total_stored", 0)),
                    tweets_skipped=int(r.get("total_skipped_retweets", 0)),
                    error=r.get("error"),
                )
            results.append({
                "source": f"list:{list_id}",
                "members_count": len(members_in_list),
                **r,
            })
        except Exception as exc:
            logger.exception("list-timeline fetch failed for list_id=%s", list_id)
            if row_id:
                await db.finish_fetch_run(row_id, status="failed", error=str(exc))
            results.append({
                "source": f"list:{list_id}",
                "status": "failed",
                "error": str(exc),
            })

    summary = {
        "success": True,
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "kol_count": len(catalog),
        "list_groups": len(list_groups),
        "orphan_count": len(orphans),
        "succeeded": sum(1 for r in results if r.get("status") == "success" or r.get("success")),
        "failed": sum(1 for r in results if r.get("status") == "failed" or r.get("success") is False),
        "results": results,
    }
    logger.info(
        "fetch_configured_kols complete: run_id=%s lists=%d orphans=%d ok=%d fail=%d",
        run_id, summary["list_groups"], summary["orphan_count"],
        summary["succeeded"], summary["failed"],
    )
    return summary
