"""
Portfolio health DB access via Insforge Edge Functions.

Tables: portfolio_health_reports, portfolio_insights
Edge Function: portfolio-health (to be deployed)

Until tables/EF are deployed, all operations return None/empty gracefully.
"""

from typing import Any, Dict, Optional

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION = "portfolio-health"
_TIMEOUT = 10.0


async def _call(
    action: str,
    *,
    method: str = "POST",
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Invoke the portfolio-health edge function. Returns parsed JSON dict."""
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
            logger.warning("health EF %s status=%s", action, resp.status_code)
            return {"success": False, "error": "HTTP %s" % resp.status_code}

        return resp.json()
    except Exception as e:
        logger.warning("health EF %s error: %s", action, e)
        return {"success": False, "error": str(e)}


async def save_report(user_id: str, report_data: dict) -> Optional[str]:
    """Save a health report. Returns report ID or None on failure."""
    data = await _call("save_report", body={"user_id": user_id, **report_data})
    if data.get("success"):
        return data.get("data", {}).get("id")
    return None


async def get_cached_report(user_id: str, cache_key: str) -> Optional[dict]:
    """Get a cached report by cache_key. Returns None if not found."""
    data = await _call(
        "get_cached",
        method="GET",
        params={"user_id": user_id, "cache_key": cache_key},
    )
    if data.get("success") and data.get("data"):
        return data["data"]
    return None


async def get_latest_insights(user_id: str) -> Optional[dict]:
    """Get the latest portfolio insights for a user. Returns None if never generated."""
    data = await _call(
        "get_insights", method="GET", params={"user_id": user_id}
    )
    if data.get("success") and data.get("data"):
        return data["data"]
    return None


async def upsert_insights(user_id: str, insights_data: dict) -> bool:
    """Upsert portfolio insights (one row per user, overwrite latest)."""
    data = await _call(
        "upsert_insights", body={"user_id": user_id, **insights_data}
    )
    return data.get("success", False)


async def check_is_first_report(user_id: str) -> bool:
    """Check if this user has any existing health reports."""
    data = await _call(
        "check_first", method="GET", params={"user_id": user_id}
    )
    if data.get("success"):
        return data.get("data", {}).get("is_first", True)
    return True  # assume first on error
