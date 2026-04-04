"""
Macro Risk Dashboard - API Router
"""

import asyncio
import time as _time
import traceback
import warnings as _warnings

from fastapi import APIRouter, HTTPException, Query

from app.utils.timezone import now_iso, days_ago, today_str
from app.features.macro.liquidity.fred_service import fetch_fred_series, LIQUIDITY_SERIES
from app.features.macro.risk.service import (
    get_macro_risk_dashboard,
    get_economic_fundamentals,
    get_inflation_rates,
    get_market_sentiment,
    get_cpi_breakdown,
    get_treasury_and_commodities,
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


@router.get("/sentiment")
async def get_sentiment():
    """
    Get market sentiment from CNN Fear & Greed Index + real-time market data.
    CNN composite score (0-100), 7 CNN components, and 4 market indicators.
    """
    try:
        data = await get_market_sentiment()
        return {
            "success": True,
            "timestamp": data.timestamp,
            "data": data.model_dump(),
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch market sentiment data")


@router.get("/cpi-breakdown")
async def get_cpi_breakdown_endpoint():
    """
    Get CPI breakdown with YoY% and MoM% for key components:
    All Items, Core CPI, Shelter, Food, Energy.
    """
    try:
        data = await get_cpi_breakdown()
        return {
            "success": True,
            "timestamp": data.timestamp,
            "components": [c.model_dump() for c in data.components],
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch CPI breakdown")


@router.get("/treasury-commodities")
async def get_treasury_commodities():
    """
    Get treasury yield curve (12 tenors with daily change in bps),
    key spreads, commodity quotes (Gold/Oil), and US Dollar Index.
    """
    try:
        data = await get_treasury_and_commodities()
        return {
            "success": True,
            "timestamp": data["timestamp"],
            "treasury": data["treasury"],
            "commodities": data["commodities"],
            "dollar": data["dollar"],
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch treasury & commodities data")


@router.get("/history/{series_id}")
async def get_series_history(
    series_id: str,
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history"),
    units: str | None = Query(default=None, description="FRED units transform: pc1=YoY%, pch=MoM%"),
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
        data = await fetch_fred_series(series_id, start_date, end_date, limit=500, units=units)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": data,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch series history")


# ============================================================================
# YFinance History (shared by sentiment + commodity endpoints)
# ============================================================================

_yf_history_cache: dict[str, tuple[list, float]] = {}
_YF_HISTORY_TTL = 600

ALLOWED_SENTIMENT_SYMBOLS = {
    "VIX": "^VIX",
    "VVIX": "^VVIX",
    "SKEW": "^SKEW",
}

ALLOWED_COMMODITY_SYMBOLS = {
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "OIL": "BZ=F",
    "DXY": "DX-Y.NYB",
    "COPPER": "HG=F",
}


def _fetch_yf_history(yf_symbol: str, days: int) -> list[dict]:
    """Synchronous yfinance fetch -- runs in thread pool via asyncio.to_thread."""
    import yfinance as yf
    from datetime import datetime, timedelta

    end = datetime.now()
    start = end - timedelta(days=days)

    with _warnings.catch_warnings():
        _warnings.simplefilter("ignore")
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
        )

    if df.empty:
        return []

    data = []
    for idx, row in df.iterrows():
        close = float(row["Close"])
        if close != close:
            continue
        open_v = float(row["Open"]) if row["Open"] == row["Open"] else close
        high_v = float(row["High"]) if row["High"] == row["High"] else close
        low_v = float(row["Low"]) if row["Low"] == row["Low"] else close
        vol = int(row["Volume"]) if row["Volume"] == row["Volume"] else 0

        data.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": round(open_v, 2),
            "high": round(high_v, 2),
            "low": round(low_v, 2),
            "close": round(close, 2),
            "volume": vol,
        })

    return data


async def _get_yf_history(
    symbol: str,
    days: int,
    allowed_symbols: dict[str, str],
) -> dict:
    """Shared handler for yfinance history endpoints with caching."""
    symbol_upper = symbol.upper()
    yf_symbol = allowed_symbols.get(symbol_upper)
    if not yf_symbol:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported symbol: {symbol}. Allowed: {', '.join(allowed_symbols)}",
        )

    cache_key = f"{symbol_upper}_{days}"
    now = _time.time()

    cached = _yf_history_cache.get(cache_key)
    if cached and now - cached[1] < _YF_HISTORY_TTL:
        return {
            "success": True,
            "symbol": symbol_upper,
            "count": len(cached[0]),
            "data": cached[0],
        }

    try:
        data = await asyncio.to_thread(_fetch_yf_history, yf_symbol, days)
        _yf_history_cache[cache_key] = (data, now)
        return {
            "success": True,
            "symbol": symbol_upper,
            "count": len(data),
            "data": data,
        }
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch history for {symbol}")


@router.get("/sentiment/history/{symbol}")
async def get_sentiment_symbol_history(
    symbol: str,
    days: int = Query(default=730, ge=30, le=1825, description="Days of history"),
):
    """Get historical OHLCV data for VIX / VVIX / SKEW via yfinance."""
    return await _get_yf_history(symbol, days, ALLOWED_SENTIMENT_SYMBOLS)


@router.get("/commodity/history/{symbol}")
async def get_commodity_history(
    symbol: str,
    days: int = Query(default=730, ge=30, le=1825, description="Days of history"),
):
    """Get historical OHLCV data for Gold / Silver / Oil / Copper / DXY via yfinance."""
    return await _get_yf_history(symbol, days, ALLOWED_COMMODITY_SYMBOLS)
