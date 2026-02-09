"""
Macro Data Cache - API Router

Endpoints:
  POST /api/macro-cache/refresh?tier=1|2|3|all  (cron, protected)
  GET  /api/macro-cache/status                  (monitoring)
"""

import traceback

from fastapi import APIRouter, Depends, Query

from app.core.deps import verify_cron_secret
from app.utils.timezone import now_iso
from app.features.macro_cache.db import get_all_status

router = APIRouter(prefix="/api/macro-cache", tags=["macro-cache"])


@router.post("/refresh")
async def refresh_cache(
    tier: str = Query(default="all", pattern="^(1|2|3|all)$"),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Trigger cache refresh for a specific tier or all tiers.
    Protected by X-Cron-Secret header.

    Tiers:
      1 - High-frequency (4h): liquidity metrics, treasury, sentiment
      2 - Medium-frequency (12h): dashboards, economy, inflation, CPI
      3 - Low-frequency (24h): liquidity history
      all - All tiers sequentially
    """
    from app.features.macro_cache.refresher import (
        refresh_tier1,
        refresh_tier2,
        refresh_tier3,
        refresh_all,
    )

    try:
        if tier == "1":
            results = await refresh_tier1()
        elif tier == "2":
            results = await refresh_tier2()
        elif tier == "3":
            results = await refresh_tier3()
        else:
            results = await refresh_all()

        success_count = sum(
            1 for v in _flatten_results(results) if v is True
        )
        total_count = len(list(_flatten_results(results)))

        return {
            "success": True,
            "timestamp": now_iso(),
            "tier": tier,
            "results": results,
            "summary": f"{success_count}/{total_count} keys refreshed",
        }
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "timestamp": now_iso(),
            "tier": tier,
            "error": str(e),
        }


@router.get("/status")
async def cache_status():
    """Get status of all cached entries (no auth required)."""
    try:
        entries = await get_all_status()
        return {
            "success": True,
            "timestamp": now_iso(),
            "entries": entries,
            "count": len(entries),
        }
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "timestamp": now_iso(),
            "error": str(e),
        }


def _flatten_results(results: dict):
    """Yield all boolean values from a possibly nested results dict."""
    for v in results.values():
        if isinstance(v, dict):
            yield from _flatten_results(v)
        else:
            yield v
