"""
Macro Risk Dashboard - API Router
"""

import traceback

from fastapi import APIRouter, HTTPException, Query

from app.utils.timezone import now_iso, days_ago, today_str
from app.features.liquidity.fred_service import fetch_fred_series, LIQUIDITY_SERIES
from app.features.macro_risk.service import (
    get_macro_risk_dashboard,
    get_economic_fundamentals,
    get_inflation_rates,
    MACRO_RISK_FRED_SERIES,
)

router = APIRouter(prefix="/api/macro-risk", tags=["macro-risk"])

# Whitelist: only allow FRED series used by the dashboard
ALLOWED_SERIES_IDS = set(MACRO_RISK_FRED_SERIES.values()) | set(LIQUIDITY_SERIES.values())


@router.get("/dashboard")
async def get_dashboard():
    """
    Get the full macro risk dashboard with composite score,
    4 category scores, AI stock basket, and liquidity summary.
    """
    try:
        dashboard = await get_macro_risk_dashboard()
        return {
            "success": True,
            "timestamp": dashboard.timestamp,
            "composite_score": dashboard.composite_score,
            "composite_level": dashboard.composite_level,
            "categories": [c.model_dump() for c in dashboard.categories],
            "ai_stocks": [s.model_dump() for s in dashboard.ai_stocks],
            "liquidity_summary": dashboard.liquidity_summary,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch macro risk dashboard")


@router.get("/economy")
async def get_economy():
    """
    Get economic fundamentals with 4 sub-dimensions:
    growth, employment, inflation, and credit risk scores.
    """
    try:
        data = await get_economic_fundamentals()
        return {
            "success": True,
            "timestamp": data.timestamp,
            "data": data.model_dump(),
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch economic fundamentals")


@router.get("/inflation-rates")
async def get_inflation_rates_endpoint():
    """
    Get inflation & rates with 2 sub-dimensions:
    inflation (CPI, PCE, expectations) and rates (Fed Funds, 10Y, TIPS).
    """
    try:
        data = await get_inflation_rates()
        return {
            "success": True,
            "timestamp": data.timestamp,
            "data": data.model_dump(),
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch inflation & rates data")


@router.get("/history/{series_id}")
async def get_series_history(
    series_id: str,
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history"),
):
    """
    Get raw FRED series history for charting.
    Only supports FRED series IDs used in the macro risk dashboard.
    """
    if series_id not in ALLOWED_SERIES_IDS:
        raise HTTPException(status_code=400, detail="Unsupported series ID")

    try:
        start_date = days_ago(days)
        end_date = today_str()
        data = await fetch_fred_series(series_id, start_date, end_date, limit=500)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": data,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch series history")
