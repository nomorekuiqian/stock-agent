"""
Memory DB access — suggestion_tracking via Insforge EF.

Edge Function source: backend/app/edge_functions/memory.js
Schema:               backend/migrations/u1c_memory_schema.sql

Until tables/EF are deployed, all operations return None/empty gracefully.
"""

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.memory.models import SuggestionRow

logger = get_logger(__name__)

_FUNCTION = "memory"
_TIMEOUT = 10.0


async def _call(
    action: str,
    *,
    method: str = "POST",
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Invoke the memory edge function. Returns parsed JSON dict."""
    try:
        service = get_insforge_service()
        url = f"{service.base_url}/functions/{_FUNCTION}"
        qs = dict(params or {})
        qs["action"] = action
        headers = dict(service.headers)
        if EDGE_FUNCTION_SECRET:
            headers["X-Internal-Secret"] = EDGE_FUNCTION_SECRET

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if method == "GET":
                resp = await client.get(url, params=qs, headers=headers)
            else:
                resp = await client.post(
                    url, params=qs, headers=headers, json=body or {}
                )

        if resp.status_code >= 400:
            logger.warning("memory EF %s status=%s", action, resp.status_code)
            return {"success": False, "error": "HTTP %s" % resp.status_code}

        return resp.json()
    except Exception as e:
        logger.warning("memory EF %s error: %s", action, e)
        return {"success": False, "error": str(e)}


# =============================================================================
# Suggestion tracking
# =============================================================================


async def insert_suggestion(user_id: str, suggestion: dict) -> Optional[str]:
    """Insert a suggestion tracking entry. Returns ID or None on failure."""
    data = await _call(
        "insert_suggestion", body={"user_id": user_id, **suggestion}
    )
    if data.get("success"):
        return data.get("data", {}).get("id")
    return None


async def get_pending_and_recent(
    user_id: str, days: int = 14
) -> List[SuggestionRow]:
    """Get pending and recently evaluated suggestions."""
    data = await _call(
        "recent_suggestions",
        method="GET",
        params={"user_id": user_id, "days": str(days)},
    )
    if not data.get("success"):
        return []
    return [SuggestionRow(**r) for r in (data.get("data") or [])]


async def fetch_due_today() -> List[SuggestionRow]:
    """Fetch all suggestions due for evaluation today (cron use)."""
    data = await _call("due_today", method="GET")
    if not data.get("success"):
        return []
    return [SuggestionRow(**r) for r in (data.get("data") or [])]


async def update_outcome(suggestion_id: str, outcome: dict) -> bool:
    """Update a suggestion's outcome after T+7 evaluation."""
    data = await _call(
        "update_outcome", body={"id": suggestion_id, "outcome": outcome}
    )
    return data.get("success", False)
