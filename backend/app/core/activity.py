"""
Lightweight user activity tracker.

Accumulates API call events in memory and flushes to the
user_activities table via the user-activities edge function
every FLUSH_INTERVAL seconds.
"""

import asyncio
from collections import deque
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

_queue: deque[dict[str, Any]] = deque(maxlen=5000)

FLUSH_INTERVAL = 30  # seconds

# Paths to skip tracking
SKIP_PATHS = frozenset({
    "/health", "/ready", "/favicon.ico", "/",
    "/api/admin/dashboard",
    "/api/payment/webhook",
})

# Map API paths to human-readable feature names
FEATURE_MAP = {
    "/api/research/chat": "ai_research",
    "/api/research/conversations": "ai_research",
    "/api/stock/": "stock_research",
    "/api/market/": "daily_report",
    "/api/morning/": "morning_report",
    "/api/macro/": "macro_dashboard",
    "/api/screener/": "screener",
    "/api/payment/subscription-status": "subscription_check",
    "/api/payment/me/entitlements": "entitlements_check",
    "/api/subscriptions/": "email_preferences",
}


def _resolve_feature(path: str) -> str:
    """Map an API path to a feature name."""
    for prefix, feature in FEATURE_MAP.items():
        if path.startswith(prefix):
            return feature
    return "other"


def track(user_id: str, event_type: str, event_name: str = "", metadata: dict | None = None):
    """Queue an activity event (non-blocking, in-memory only)."""
    _queue.append({
        "user_id": user_id,
        "event_type": event_type,
        "event_name": event_name,
        "metadata": metadata or {},
    })


def track_api_call(user_id: str, path: str, method: str, status_code: int):
    """Track an authenticated API call."""
    feature = _resolve_feature(path)
    track(
        user_id=user_id,
        event_type="api_call",
        event_name=feature,
        metadata={"path": path, "method": method, "status": status_code},
    )


async def flush():
    """Flush accumulated events to the database."""
    if not _queue:
        return

    batch = list(_queue)
    _queue.clear()

    try:
        from app.core.database import get_insforge_service
        service = get_insforge_service()
        result = await service.call_function(
            "user-activities",
            method="POST",
            params={"action": "batch_insert"},
            json_body={"events": batch},
            timeout=15.0,
        )
        data = result.get("data", {})
        if data.get("success"):
            logger.debug("Flushed %d activity events", len(batch))
        else:
            logger.warning("Activity flush failed: %s", data.get("error"))
    except Exception:
        logger.warning("Activity flush error", exc_info=True)


async def start_flush_loop():
    """Background task: flush events periodically."""
    while True:
        await asyncio.sleep(FLUSH_INTERVAL)
        await flush()
