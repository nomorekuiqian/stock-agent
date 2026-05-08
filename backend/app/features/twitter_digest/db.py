"""
Twitter KOL Digest - Database operations via Insforge Edge Functions.

Backed by the `kol_daily_digests` table; reuses the existing `kol-tweets`
edge function (actions: upsert_digest, get_digest, get_latest_digest).

V3 (2026-05-04): Persisted rows include both V2 columns (macro_picks /
industry_picks / stock_picks / takeaway) and V3 columns (headline / intro /
topics / briefs / solo_voices / crosscut / watch_next / schema_version).
`schema_version` selects the rendering path for callers — v2 rows leave
V3 columns empty and vice versa.
"""

from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.twitter_digest.models import (
    Brief,
    CuratedTweet,
    DailyDigest,
    SoloVoice,
    Topic,
)

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"


def _internal_headers() -> Optional[dict]:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


def _row_to_digest(row: dict) -> DailyDigest:
    """Convert a kol_daily_digests row into a DailyDigest, handling both V2 and V3 shapes."""

    def _curated_list(raw: object) -> list[CuratedTweet]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [CuratedTweet.model_validate(item) for item in items]

    def _topic_list(raw: object) -> list[Topic]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [Topic.model_validate(item) for item in items]

    def _brief_list(raw: object) -> list[Brief]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [Brief.model_validate(item) for item in items]

    def _solo_list(raw: object) -> list[SoloVoice]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [SoloVoice.model_validate(item) for item in items]

    raw_takeaway = row.get("takeaway") or []
    takeaway = [str(x) for x in raw_takeaway] if isinstance(raw_takeaway, list) else []

    raw_watch = row.get("watch_next") or []
    watch_next = [str(x) for x in raw_watch] if isinstance(raw_watch, list) else []

    def _hot_list(raw) -> list:
        from app.features.twitter_digest.models import HotItem
        items = raw or []
        if not isinstance(items, list):
            return []
        out: list[HotItem] = []
        for item in items:
            if isinstance(item, dict) and "label" in item and "count" in item:
                try:
                    out.append(HotItem.model_validate(item))
                except Exception:  # noqa: BLE001
                    continue
        return out

    schema_version = row.get("schema_version") or "v2"
    if schema_version not in ("v2", "v3"):
        # Forward compat: unknown versions default back to v2 path so we
        # render whatever V2 columns the row carries instead of crashing.
        schema_version = "v2"

    return DailyDigest(
        generated_at=row["generated_at"],
        window_hours=int(row["window_hours"]),
        input_tweet_count=int(row["input_tweet_count"]),
        tracked_kols=list(row.get("tracked_kols") or []),
        model_version=row["model_version"],
        schema_version=schema_version,
        takeaway=takeaway,
        # V2
        macro_picks=_curated_list(row.get("macro_picks")),
        industry_picks=_curated_list(row.get("industry_picks")),
        stock_picks=_curated_list(row.get("stock_picks")),
        # V3
        headline=str(row.get("headline") or ""),
        intro=str(row.get("intro") or ""),
        topics=_topic_list(row.get("topics")),
        briefs=_brief_list(row.get("briefs")),
        solo_voices=_solo_list(row.get("solo_voices")),
        crosscut=str(row.get("crosscut") or ""),
        watch_next=watch_next,
        hot_sectors=_hot_list(row.get("hot_sectors")),
        hot_tickers=_hot_list(row.get("hot_tickers")),
        hot_events=_hot_list(row.get("hot_events")),
    )


async def save_digest(digest: DailyDigest, date: str) -> None:
    """Persist (upsert) a generated digest. Date is ISO YYYY-MM-DD."""
    db = get_insforge_service()
    body = {
        "date": date,
        # V2 (kept empty for V3 digests, populated for V2 digests)
        "macro_picks": [t.model_dump() for t in digest.macro_picks],
        "industry_picks": [t.model_dump() for t in digest.industry_picks],
        "stock_picks": [t.model_dump() for t in digest.stock_picks],
        "tracked_kols": list(digest.tracked_kols),
        "takeaway": list(digest.takeaway),
        "window_hours": digest.window_hours,
        "input_tweet_count": digest.input_tweet_count,
        "generated_at": digest.generated_at,
        "model_version": digest.model_version,
        # V3 (kept empty for V2 digests)
        "schema_version": digest.schema_version,
        "headline": digest.headline,
        "intro": digest.intro,
        "topics": [t.model_dump() for t in digest.topics],
        "briefs": [b.model_dump() for b in digest.briefs],
        "solo_voices": [s.model_dump() for s in digest.solo_voices],
        "crosscut": digest.crosscut,
        "watch_next": list(digest.watch_next),
        "hot_sectors": [h.model_dump() for h in digest.hot_sectors],
        "hot_tickers": [h.model_dump() for h in digest.hot_tickers],
        "hot_events": [h.model_dump() for h in digest.hot_events],
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
        logger.info("Saved digest for date=%s schema=%s", date, digest.schema_version)
        return

    raise RuntimeError(
        f"upsert_digest failed: HTTP {result['status_code']} {result.get('text', '')[:200]}"
    )


async def get_digest_by_date(date: str) -> Optional[DailyDigest]:
    """Fetch the digest for a specific ISO date."""
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
    """Fetch the most recent digest (by `date` DESC)."""
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
