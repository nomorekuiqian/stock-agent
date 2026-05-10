"""
Twitter KOL - Database operations via Insforge Edge Functions.
"""

from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"


def _internal_headers() -> Optional[dict]:
    """
    Header set required to authenticate write actions on the kol-tweets edge
    function. The edge function rejects POSTs without this header to prevent
    the public internet from poisoning the tweet / digest tables.
    """
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def upsert_tweets_batch(tweets: list[dict]) -> int:
    """
    Bulk upsert tweets into the database.
    Returns the number of successfully upserted tweets.
    """
    if not tweets:
        return 0

    db = get_insforge_service()

    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_batch"},
        json_body={"tweets": tweets},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            count = data.get("count", 0)
            logger.info("Upserted %d tweets", count)
            return count

    logger.error("Failed to upsert tweets: %s", result.get("text", ""))
    return 0


async def get_tweets(
    username: str,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> list[dict]:
    """Get tweets for a username, optionally filtered by category."""
    db = get_insforge_service()
    params = {
        "action": "list",
        "username": username,
        "page": str(page),
        "limit": str(limit),
    }
    if category:
        params["category"] = category

    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])

    logger.error("Failed to get tweets: %s", result.get("text", ""))
    return []


async def get_tweet_stats(username: str) -> Optional[dict]:
    """Get tweet statistics for a username."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "stats", "username": username},
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data")

    logger.error("Failed to get tweet stats: %s", result.get("text", ""))
    return None


async def update_categories_batch(updates: list[dict]) -> dict:
    """
    Batch update tweet categories.
    updates: list of {"id": "...", "category": "..."}
    """
    if not updates:
        return {"updated": 0, "errors": 0}

    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_categories_batch"},
        json_body={"updates": updates},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return {"updated": data.get("updated", 0), "errors": data.get("errors", 0)}

    logger.error("Failed to update categories: %s", result.get("text", ""))
    return {"updated": 0, "errors": 0}


# ---------------------------------------------------------------------------
# Fetch run records (twitter_fetch_runs)
# ---------------------------------------------------------------------------

async def start_fetch_run(run_id: str, username: str) -> Optional[str]:
    """
    Record the start of a per-KOL fetch attempt.
    Returns the row id (UUID) on success, or None on failure.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "start_run"},
        json_body={"run_id": run_id, "username": username},
        timeout=15.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            row = data.get("data") or {}
            return row.get("id")

    logger.error("Failed to start fetch run for @%s: %s", username, result.get("text", ""))
    return None


async def finish_fetch_run(
    row_id: str,
    *,
    status: str,
    pages_fetched: int = 0,
    tweets_fetched: int = 0,
    tweets_stored: int = 0,
    tweets_skipped: int = 0,
    reached_safety_window: bool = False,
    error: Optional[str] = None,
) -> bool:
    """Update an in-flight run with final counts and status."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "finish_run"},
        json_body={
            "id": row_id,
            "status": status,
            "pages_fetched": pages_fetched,
            "tweets_fetched": tweets_fetched,
            "tweets_stored": tweets_stored,
            "tweets_skipped": tweets_skipped,
            "reached_safety_window": reached_safety_window,
            "error": error,
        },
        timeout=15.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200 and result.get("data", {}).get("success"):
        return True

    logger.error("Failed to finish fetch run %s: %s", row_id, result.get("text", ""))
    return False


async def list_fetch_runs(
    *,
    run_id: Optional[str] = None,
    username: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """List recent fetch runs, optionally filtered by run_id or username."""
    db = get_insforge_service()
    params: dict[str, str] = {"action": "list_runs", "limit": str(limit)}
    if run_id:
        params["run_id"] = run_id
    if username:
        params["username"] = username

    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])

    logger.error("Failed to list fetch runs: %s", result.get("text", ""))
    return []


# ---------------------------------------------------------------------------
# KOL accounts catalog (kol_accounts) — single source of truth for who we ingest.
# ---------------------------------------------------------------------------

async def list_kol_accounts(*, enabled_only: bool = True) -> list[dict]:
    """All KOL accounts. Each row: {username, display_name, source, enabled, followers, bio, ...}."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "list_accounts",
            "enabled_only": "true" if enabled_only else "false",
        },
        timeout=15.0,
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])
    logger.error("Failed to list_kol_accounts: %s", result.get("text", ""))
    return []


async def upsert_kol_accounts(accounts: list[dict]) -> int:
    """
    Bulk upsert KOL accounts by username.
    accounts: list of {username, display_name, source, enabled?, followers?, bio?}
    """
    if not accounts:
        return 0
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_accounts"},
        json_body={"accounts": accounts},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return int(data.get("upserted", 0))
    logger.error("Failed to upsert_kol_accounts: %s", result.get("text", ""))
    return 0


async def update_kol_account(username: str, **patch) -> bool:
    """Patch a single KOL account. Allowed keys: display_name, source, enabled, followers, bio."""
    if not username or not patch:
        return False
    db = get_insforge_service()
    body = {"username": username, **patch}
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_account"},
        json_body=body,
        timeout=15.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200 and result.get("data", {}).get("success"):
        return True
    logger.error("Failed to update_kol_account @%s: %s", username, result.get("text", ""))
    return False


async def disable_kol_accounts_missing_from(
    *, source: str, current_usernames: list[str]
) -> int:
    """
    Soft-delete: any account with the given `source` whose username is NOT in
    current_usernames gets enabled=false. Used after syncing a Twitter list.
    Returns count disabled.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "disable_missing"},
        json_body={"source": source, "current_usernames": current_usernames},
        timeout=30.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return int(data.get("disabled", 0))
    logger.error("Failed to disable_missing for source=%s: %s", source, result.get("text", ""))
    return 0