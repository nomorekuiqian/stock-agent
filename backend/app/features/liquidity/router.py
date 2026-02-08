"""
Liquidity Monitor API Router

Endpoints for fetching liquidity metrics, historical data,
and FRED series.
"""

import traceback

from fastapi import APIRouter, HTTPException, Query

from app.utils.timezone import now_iso, today_str, days_ago
from app.features.liquidity.fred_service import (
    get_all_liquidity_metrics,
    get_liquidity_history,
    fetch_fred_series,
)

router = APIRouter(prefix="/api/liquidity", tags=["liquidity"])

# Allowlist of FRED series IDs that this endpoint may serve
ALLOWED_SERIES = {
    "WALCL", "WDTGAL", "RRPONTSYD", "WRESBAL",
    "SOFR", "EFFR", "NFCI",
}


@router.get("/metrics")
async def get_liquidity_metrics():
    """
    Get all key liquidity metrics including calculated net liquidity.

    Returns:
        - fed_assets: Fed Total Assets (WALCL)
        - tga: Treasury General Account (WDTGAL)
        - rrp: Overnight Reverse Repo (RRPONTSYD)
        - reserves: Bank Reserves (WRESBAL)
        - sofr: SOFR Rate
        - effr: Effective Fed Funds Rate
        - nfci: Financial Conditions Index
        - net_liquidity: Calculated (WALCL - TGA - RRP)
    """
    try:
        metrics = await get_all_liquidity_metrics()
        return {
            "success": True,
            "timestamp": now_iso(),
            "metrics": metrics
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_liquidity_history_endpoint(
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """
    Get historical net liquidity data for charting.

    Args:
        days: Number of days of history (default: 365, max: 1825 = 5 years)

    Returns:
        Historical net liquidity with component breakdown
    """
    try:
        history = await get_liquidity_history(days=days)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": history
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/series/{series_id}")
async def get_fred_series_endpoint(
    series_id: str,
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """
    Get raw FRED series data.

    Args:
        series_id: FRED series ID (e.g., WALCL, WDTGAL, RRPONTSYD, NFCI)
        days: Number of days of history

    Returns:
        Raw series data with observations
    """
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


