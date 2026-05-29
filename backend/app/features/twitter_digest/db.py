"""
Twitter KOL Digest — Database operations via Insforge Edge Functions.

Backed by the `kol_daily_digests` table; reuses the `kol-tweets` edge
function (actions: upsert_digest, get_digest, get_latest_digest).
"""

from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.twitter_digest.models import (
    DailyDigest,
    DailyDigestListItem,
    HotItem,
    MacroThread,
    OtherTickerMention,
    TickerThesis,
    WatchpointItem,
)

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"


def _internal_headers() -> Optional[dict]:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


def _row_to_digest(row: dict) -> DailyDigest:
    """Convert a kol_daily_digests row into a DailyDigest."""

    def _ticker_thesis_list(raw: object) -> list[TickerThesis]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [TickerThesis.model_validate(item) for item in items]

    def _macro_thread_list(raw: object) -> list[MacroThread]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [MacroThread.model_validate(item) for item in items]

    def _other_tickers_list(raw: object) -> list[OtherTickerMention]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [OtherTickerMention.model_validate(item) for item in items]

    def _watchpoints_list(raw: object) -> list[WatchpointItem]:
        items = raw or []
        if not isinstance(items, list):
            return []
        return [WatchpointItem.model_validate(item) for item in items]

    def _hot_list(raw) -> list[HotItem]:
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

    return DailyDigest(
        date=str(row.get("date") or ""),
        generated_at=row["generated_at"],
        window_hours=int(row["window_hours"]),
        input_tweet_count=int(row["input_tweet_count"]),
        tracked_kols=list(row.get("tracked_kols") or []),
        model_version=row["model_version"],
        headline=str(row.get("headline") or ""),
        intro=str(row.get("intro") or ""),
        hot_sectors=_hot_list(row.get("hot_sectors")),
        hot_tickers=_hot_list(row.get("hot_tickers")),
        hot_events=_hot_list(row.get("hot_events")),
        ticker_theses=_ticker_thesis_list(row.get("ticker_theses")),
        macro_threads=_macro_thread_list(row.get("macro_threads")),
        other_tickers=_other_tickers_list(row.get("other_tickers")),
        watchpoints=_watchpoints_list(row.get("watchpoints")),
    )


def _row_to_list_item(row: dict) -> DailyDigestListItem:
    """Convert a kol_daily_digests row into a lightweight archive item."""

    def _hot_list(raw) -> list[HotItem]:
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

    tracked_kols = row.get("tracked_kols") or []
    intro = str(row.get("intro") or "").strip()
    return DailyDigestListItem(
        date=str(row.get("date") or ""),
        generated_at=str(row.get("generated_at") or ""),
        headline=str(row.get("headline") or ""),
        input_tweet_count=int(row.get("input_tweet_count") or 0),
        tracked_kol_count=len(tracked_kols) if isinstance(tracked_kols, list) else 0,
        hot_tickers=_hot_list(row.get("hot_tickers")),
        hot_sectors=_hot_list(row.get("hot_sectors")),
        hot_events=_hot_list(row.get("hot_events")),
        intro_preview=intro[:180],
    )


def digest_to_list_item(digest: DailyDigest) -> DailyDigestListItem:
    """Build a public teaser/list item from a full DailyDigest object."""
    return DailyDigestListItem(
        date=digest.date,
        generated_at=digest.generated_at,
        headline=digest.headline,
        input_tweet_count=digest.input_tweet_count,
        tracked_kol_count=len(digest.tracked_kols),
        hot_tickers=digest.hot_tickers,
        hot_sectors=digest.hot_sectors,
        hot_events=digest.hot_events,
        intro_preview=(digest.intro or "")[:180],
    )


async def save_digest(digest: DailyDigest, date: str) -> None:
    """Persist (upsert) a generated digest. Date is ISO YYYY-MM-DD."""
    db = get_insforge_service()
    body = {
        "date": date,
        "generated_at": digest.generated_at,
        "window_hours": digest.window_hours,
        "input_tweet_count": digest.input_tweet_count,
        "tracked_kols": list(digest.tracked_kols),
        "model_version": digest.model_version,
        "headline": digest.headline,
        "intro": digest.intro,
        "hot_sectors": [h.model_dump() for h in digest.hot_sectors],
        "hot_tickers": [h.model_dump() for h in digest.hot_tickers],
        "hot_events": [h.model_dump() for h in digest.hot_events],
        "ticker_theses": [t.model_dump() for t in digest.ticker_theses],
        "macro_threads": [t.model_dump() for t in digest.macro_threads],
        "other_tickers": [t.model_dump() for t in digest.other_tickers],
        "watchpoints": [w.model_dump() for w in digest.watchpoints],
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


async def list_digests(limit: int = 12, offset: int = 0) -> tuple[list[DailyDigestListItem], int]:
    """Fetch lightweight digest archive rows."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "list_digests",
            "limit": str(limit),
            "offset": str(offset),
        },
        timeout=15.0,
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"list_digests backend error: "
            f"HTTP {result['status_code']} {result.get('text', '')[:200]}"
        )

    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_digests returned error: {payload.get('error')}")

    rows = payload.get("data") or []
    if not isinstance(rows, list):
        rows = []

    try:
        return [_row_to_list_item(row) for row in rows], int(payload.get("total") or 0)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to parse digest archive rows")
        raise RuntimeError(f"list_digests row parse failed: {exc}") from exc
