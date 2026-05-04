"""
Twitter KOL Digest - Database operations via Insforge Edge Functions.

Backed by the `kol_daily_digests` table; reuses the existing `kol-tweets`
edge function (actions: upsert_digest, get_digest, get_latest_digest).

V2 schema rename note: at the application layer fields are now
macro_picks / industry_picks / stock_picks. The Insforge table column
names are still bullish_picks / bearish_picks / neutral_analyses (legacy
from V1.5). The edge function does the alias mapping in both directions
so the migration cost stays at zero. When/if the table is renamed, the
shim in `backend/app/edge_functions/kol-tweets.js` can be removed.
"""

from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.twitter_digest.models import CuratedTweet, DailyDigest

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"


def _internal_headers() -> Optional[dict]:
    """Header set required by kol-tweets edge function for write actions."""
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


def _row_to_digest(row: dict) -> DailyDigest:
    """Convert a kol_daily_digests row (with JSONB list fields) into a DailyDigest."""
    def _curated_list(raw: object) -> list[CuratedTweet]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [CuratedTweet.model_validate(item) for item in items]

    raw_takeaway = row.get("takeaway") or []
    takeaway = [str(x) for x in raw_takeaway] if isinstance(raw_takeaway, list) else []

    # Edge function returns the new field names if its alias-shim is in place;
    # fall back to legacy V1.5 names so we degrade gracefully if the function
    # is on an older revision.
    macro = row.get("macro_picks")
    industry = row.get("industry_picks")
    stock = row.get("stock_picks")
    if macro is None and industry is None and stock is None:
        macro = row.get("bullish_picks")
        industry = row.get("bearish_picks")
        stock = row.get("neutral_analyses")

    return DailyDigest(
        generated_at=row["generated_at"],
        window_hours=int(row["window_hours"]),
        input_tweet_count=int(row["input_tweet_count"]),
        tracked_kols=list(row.get("tracked_kols") or []),
        takeaway=takeaway,
        macro_picks=_curated_list(macro),
        industry_picks=_curated_list(industry),
        stock_picks=_curated_list(stock),
        model_version=row["model_version"],
    )


async def save_digest(digest: DailyDigest, date: str) -> None:
    """
    Persist (upsert) a generated digest. `date` is ISO YYYY-MM-DD; conflicts
    on `date` overwrite the prior row.
    """
    db = get_insforge_service()
    body = {
        "date": date,
        "macro_picks": [t.model_dump() for t in digest.macro_picks],
        "industry_picks": [t.model_dump() for t in digest.industry_picks],
        "stock_picks": [t.model_dump() for t in digest.stock_picks],
        "tracked_kols": list(digest.tracked_kols),
        "takeaway": list(digest.takeaway),
        "window_hours": digest.window_hours,
        "input_tweet_count": digest.input_tweet_count,
        "generated_at": digest.generated_at,
        "model_version": digest.model_version,
    }

    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_digest"},
        json_body=body,
        timeout=30.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200 and result.get("data", {}).get("success"):
        logger.info("Saved digest for date=%s", date)
        return

    raise RuntimeError(
        f"upsert_digest failed: HTTP {result['status_code']} {result.get('text', '')[:200]}"
    )


async def get_digest_by_date(date: str) -> Optional[DailyDigest]:
    """
    Fetch the digest for a specific ISO date.

    Returns None ONLY when the row truly does not exist. Backend / parse errors
    raise RuntimeError so callers (and ultimately the API client) can distinguish
    "no digest" (404) from "Insforge outage / corrupted row" (5xx). Per codex
    review: silently swallowing operational failures as 404 is misleading.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_digest", "date": date},
        timeout=15.0,
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"get_digest backend error for date={date}: "
            f"HTTP {result['status_code']} {result.get('text', '')[:200]}"
        )

    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(
            f"get_digest returned error for date={date}: {payload.get('error')}"
        )

    row = payload.get("data")
    if not row:
        return None

    try:
        return _row_to_digest(row)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to parse digest row for date=%s", date)
        raise RuntimeError(f"get_digest row parse failed for date={date}: {exc}") from exc


async def get_latest_digest() -> Optional[DailyDigest]:
    """
    Fetch the most recent digest (by `date` DESC).

    Returns None ONLY when the table has no rows. Backend / parse errors raise
    RuntimeError; see `get_digest_by_date` for rationale.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_latest_digest"},
        timeout=15.0,
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"get_latest_digest backend error: "
            f"HTTP {result['status_code']} {result.get('text', '')[:200]}"
        )

    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"get_latest_digest returned error: {payload.get('error')}")

    row = payload.get("data")
    if not row:
        return None

    try:
        return _row_to_digest(row)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to parse latest digest row")
        raise RuntimeError(f"get_latest_digest row parse failed: {exc}") from exc
