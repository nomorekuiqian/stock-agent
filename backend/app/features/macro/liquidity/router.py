"""Liquidity Monitor API Router."""

from fastapi import APIRouter, HTTPException, Query

from app.core.logging import get_logger
from app.utils.timezone import now_iso, today_str, days_ago
from app.features.macro.liquidity.fred_service import (
    get_all_liquidity_metrics,
    get_liquidity_history,
    fetch_fred_series,
)
from app.features.macro.liquidity.global_service import (
    get_global_liquidity_metrics,
    get_global_liquidity_history,
)

router = APIRouter(prefix="/api/liquidity", tags=["liquidity"])
logger = get_logger(__name__)

ALLOWED_SERIES = {
    "WALCL", "WDTGAL", "RRPONTSYD", "WRESBAL",
    "SOFR", "EFFR", "NFCI",
}


@router.get("/metrics")
async def get_liquidity_metrics():
    """Get all key liquidity metrics including calculated net liquidity."""
    try:
        metrics = await get_all_liquidity_metrics()
        return {
            "success": True,
            "timestamp": now_iso(),
            "metrics": metrics
        }
    except Exception as e:
        logger.exception("Failed to fetch liquidity metrics")
        return {
            "success": True,
            "timestamp": now_iso(),
            "metrics": {},
            "error": str(e),
        }


@router.get("/history")
async def get_liquidity_history_endpoint(
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """Get historical net liquidity data for charting."""
    try:
        history = await get_liquidity_history(days=days)
        has_data = bool(history.get("observations"))
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": history,
            "partial": not has_data,
        }
    except Exception as e:
        logger.exception("Failed to fetch liquidity history")
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": {
                "series_id": "NET_LIQUIDITY",
                "title": "Net Liquidity",
                "units": "Billions of Dollars",
                "formula": "WALCL - TGA - RRP",
                "observations": [],
                "metrics": None,
            },
            "partial": True,
            "error": str(e),
        }


@router.get("/global")
async def get_global_liquidity():
    """Get global liquidity metrics (Global M2, ECB/BOJ assets) in USD Billions."""
    try:
        metrics = await get_global_liquidity_metrics()
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": metrics,
        }
    except Exception as e:
        logger.exception("Failed to fetch global liquidity metrics")
        return {
            "success": False,
            "timestamp": now_iso(),
            "data": {},
            "error": str(e),
        }


@router.get("/global/history")
async def get_global_liquidity_history_endpoint(
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history"),
):
    """Get historical Global Liquidity Index data for charting."""
    try:
        history = await get_global_liquidity_history(days=days)
        has_data = bool(history.get("observations"))
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": history,
            "partial": not has_data,
        }
    except Exception as e:
        logger.exception("Failed to fetch global liquidity history")
        return {
            "success": False,
            "timestamp": now_iso(),
            "data": {
                "series_id": "GLOBAL_LIQUIDITY_INDEX",
                "title": "Global Liquidity Index",
                "units": "Billions of U.S. Dollars",
                "observations": [],
            },
            "partial": True,
            "error": str(e),
        }


@router.get("/series/{series_id}")
async def get_fred_series_endpoint(
    series_id: str,
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """Get raw FRED series data for an allowed series ID."""
    if series_id not in ALLOWED_SERIES:
        raise HTTPException(status_code=400, detail=f"Series '{series_id}' is not allowed")

    try:
        start_date = days_ago(days)
        end_date = today_str()

        data = await fetch_fred_series(series_id, start_date, end_date, limit=500)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": data
        }
    except Exception as e:
        logger.exception("Failed to fetch liquidity series history for %s", series_id)
        raise HTTPException(status_code=503, detail="Failed to fetch series history")
