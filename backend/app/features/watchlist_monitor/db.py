"""Database access for watchlist monitor via Insforge Edge Functions."""

from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.watchlist_monitor.models import TickerDailyBrief

logger = get_logger(__name__)

_FUNCTION_NAME = "watchlist-monitor"
_LATEST_BRIEFS_BATCH_SIZE = 50


def _internal_headers() -> dict[str, str] | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


def _brief_from_row(row: dict[str, Any]) -> TickerDailyBrief | None:
    if not row:
        return None
    try:
        return TickerDailyBrief.model_validate(row)
    except Exception:
        logger.warning(
            "Failed to parse ticker brief row for symbol=%s",
            row.get("symbol", "?"),
            exc_info=True,
        )
        return None


async def upsert_ticker_brief(brief: TickerDailyBrief) -> TickerDailyBrief:
    """Persist one ticker daily brief."""
    db = get_insforge_service()
    payload = brief.model_dump(mode="json", exclude_none=True)
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_brief"},
        json_body=payload,
        timeout=30.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            "upsert_ticker_brief failed: HTTP %s %s"
            % (result["status_code"], (result.get("text") or "")[:200])
        )

    data = result.get("data") or {}
    if not data.get("success"):
        raise RuntimeError("upsert_ticker_brief returned error: %s" % data.get("error"))

    saved = _brief_from_row(data.get("data") or {})
    if saved is None:
        raise RuntimeError("upsert_ticker_brief returned invalid row")
    return saved


async def get_latest_briefs(symbols: list[str]) -> dict[str, TickerDailyBrief]:
    """Fetch latest available brief for each symbol."""
    normalized = []
    seen: set[str] = set()
    for raw in symbols:
        symbol = (raw or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        normalized.append(symbol)

    if not normalized:
        return {}

    out: dict[str, TickerDailyBrief] = {}
    db = get_insforge_service()

    for start in range(0, len(normalized), _LATEST_BRIEFS_BATCH_SIZE):
        batch = normalized[start : start + _LATEST_BRIEFS_BATCH_SIZE]
        result = await db.call_function(
            _FUNCTION_NAME,
            method="GET",
            params={"action": "latest_briefs", "symbols": ",".join(batch)},
            timeout=15.0,
            extra_headers=_internal_headers(),
        )

        if result["status_code"] != 200:
            raise RuntimeError(
                "get_latest_briefs failed: HTTP %s %s"
                % (result["status_code"], (result.get("text") or "")[:200])
            )

        payload = result.get("data") or {}
        if not payload.get("success"):
            raise RuntimeError("get_latest_briefs returned error: %s" % payload.get("error"))

        rows = payload.get("data") or {}
        if isinstance(rows, dict):
            for symbol, row in rows.items():
                parsed = _brief_from_row(row)
                if parsed:
                    out[symbol.upper()] = parsed
    return out
