"""holdings_sync DB access — thin.

- user_portfolios writes go ONLY through app.features.portfolio.db
  (portfolio EF single-owner invariant; geba). We re-export the call, never
  open our own user_portfolios EF connection.
- symbol-cache EF (L2 resolution cache) get/put thin wrappers (design §4.0).
"""

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

# Re-export: holdings_sync writes user_portfolios exclusively via this.
from app.features.portfolio.db import reconcile_portfolio  # noqa: F401

logger = get_logger(__name__)

_SYMBOL_CACHE_FN = "symbol-cache"
_TIMEOUT = 10.0


async def _cache_call(action: str, *, method: str = "POST",
                      params: Optional[Dict[str, Any]] = None,
                      body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Invoke the symbol-cache EF. fail-open: any failure -> {success: False}."""
    service = get_insforge_service()
    url = f"{service.base_url}/functions/{_SYMBOL_CACHE_FN}"
    qs = dict(params or {})
    qs["action"] = action
    headers = dict(service.headers)
    if EDGE_FUNCTION_SECRET:
        headers["X-Internal-Secret"] = EDGE_FUNCTION_SECRET
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if method == "GET":
                resp = await client.get(url, params=qs, headers=headers)
            else:
                resp = await client.post(url, params=qs, headers=headers, json=body or {})
    except httpx.HTTPError as exc:
        logger.warning("symbol-cache EF %s transport error: %s", action, exc)
        return {"success": False, "error": "transport"}
    if resp.status_code >= 500:
        logger.warning("symbol-cache EF %s status=%s", action, resp.status_code)
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    try:
        return resp.json()
    except ValueError:
        return {"success": False, "error": "non-JSON"}


async def cache_get(query_norm: str) -> Optional[Dict[str, Any]]:
    """L2 lookup. Returns {resolved_json, status} or None (miss / EF down)."""
    data = await _cache_call("get", method="GET", params={"query_norm": query_norm})
    if not data.get("success"):
        return None
    return data.get("data") or None


async def cache_put(query_norm: str, resolved_json: Any, status: str, ttl_days: int) -> bool:
    """L2 write (best-effort, non-blocking caller responsibility). True if stored."""
    data = await _cache_call("put", body={
        "query_norm": query_norm,
        "resolved_json": resolved_json,
        "status": status,
        "ttl_days": ttl_days,
    })
    return bool(data.get("success"))
