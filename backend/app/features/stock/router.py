"""
Stock feature router - All stock-related API endpoints.

Endpoints:
- GET  /api/stocks/search           - Search stocks by symbol or name
- GET  /api/stocks/quotes           - Get batch stock quotes
- GET  /api/stock/{symbol}          - Get comprehensive stock data
- GET  /api/stock/{symbol}/history  - Get historical price data
- POST /api/stock/{symbol}/analysis - Generate AI stock analysis
"""

from __future__ import annotations

import re
import threading
import traceback
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.shared.fmp_service import get_fmp_service
from app.shared.yfinance_service import get_yfinance_service
from app.features.stock.service import get_stock_service
from app.features.stock.agent import get_stock_analysis_agent
from app.features.stock.db import get_stock_analysis, save_stock_analysis

router = APIRouter(prefix="/api", tags=["stock"])


# =============================================================================
# In-memory cache for historical prices (avoids repeated FMP calls)
# =============================================================================

_price_history_cache: dict = {}  # key: (symbol, days) -> {"data": ..., "expires": datetime}
_price_history_lock = threading.Lock()
PRICE_HISTORY_TTL_MINUTES = 30


def _get_cached_history(symbol: str, days: int):
    """Get cached price history if fresh."""
    key = (symbol.upper(), days)
    with _price_history_lock:
        entry = _price_history_cache.get(key)
        if entry and datetime.now() < entry["expires"]:
            return entry["data"]
    return None


def _set_cached_history(symbol: str, days: int, data: dict):
    """Cache price history with TTL."""
    key = (symbol.upper(), days)
    with _price_history_lock:
        _price_history_cache[key] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=PRICE_HISTORY_TTL_MINUTES),
        }


# =============================================================================
# Stock Search API (using FMP for faster response)
# =============================================================================


@router.get("/stocks/search")
async def search_stocks(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    """
    Search stocks by symbol or company name using FMP API.

    Returns list of matching stocks with symbol, name, type, and exchange.
    """
    try:
        fmp = get_fmp_service()
        result = fmp.search_stocks(query=q, limit=limit)

        if result.get("status") == "error":
            return {"stocks": []}

        return {"stocks": result.get("stocks", [])}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stocks/quotes")
async def get_stock_quotes_api(symbols: str = Query(..., description="Comma-separated stock symbols")):
    """
    Get current quotes for multiple stocks using yfinance batch API with 10-minute caching.

    Uses yfinance for efficient batch fetching (1 request for 70+ stocks in ~2 seconds).

    Args:
        symbols: Comma-separated stock symbols (e.g., "AAPL,MSFT,NVDA")

    Returns:
        Stock quotes with price and daily change percentage.
    """
    try:
        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

        if not symbol_list:
            raise HTTPException(status_code=400, detail="No symbols provided")

        # Allow up to 100 symbols for sector pages
        if len(symbol_list) > 100:
            symbol_list = symbol_list[:100]

        # Use yfinance for efficient batch fetching (1 request vs 73 FMP calls)
        yf_service = get_yfinance_service()
        result = yf_service.get_stock_quotes(symbol_list, use_cache=True)

        # Transform to frontend format
        quotes = []
        for quote in result.get("quotes", []):
            quotes.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("name", ""),
                "price": quote.get("price", 0),
                "daily_change": quote.get("daily_change", 0),
            })

        print(f"[API] get_stock_quotes (yfinance): {len(quotes)} quotes, {result.get('from_cache', 0)} from cache")

        return {"success": True, "quotes": quotes}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Individual Stock Research API (OpenBB)
# =============================================================================


@router.get("/stock/{symbol}/profile")
async def get_stock_profile_quick(symbol: str):
    """
    Get stock profile from cache (fast endpoint for progressive loading).

    Returns cached profile instantly without fetching quote or financials.
    Used as first layer of progressive loading UI.

    Response time: <50ms (memory cache) or <300ms (DB cache)
    """
    # Validate symbol format
    upper_symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", upper_symbol):
        return {"success": False, "profile": None, "source": "invalid_symbol"}

    try:
        from app.features.stock.service import _get_cached_profile
        from app.features.stock.db import get_stock_profile as db_get_profile

        # 1. Check in-memory cache first (instant)
        cached = _get_cached_profile(upper_symbol)
        if cached:
            print(f"[API] Profile quick: memory cache HIT for {upper_symbol}")
            return {
                "success": True,
                "profile": cached,
                "source": "memory_cache",
            }

        # 2. Check DB cache (fast)
        db_cached = await db_get_profile(upper_symbol)
        if db_cached:
            print(f"[API] Profile quick: DB cache HIT for {upper_symbol}")
            # Also warm up memory cache
            from app.features.stock.service import _set_cached_profile
            _set_cached_profile(upper_symbol, db_cached)
            return {
                "success": True,
                "profile": db_cached,
                "source": "db_cache",
            }

        # 3. No cache - return minimal placeholder
        print(f"[API] Profile quick: cache MISS for {upper_symbol}")
        return {
            "success": True,
            "profile": None,
            "source": "none",
        }

    except Exception:
        traceback.print_exc()
        return {"success": False, "profile": None, "source": "error"}


@router.get("/stock/{symbol}")
async def get_stock_data(
    symbol: str,
    include_financials: bool = Query(True, description="Include historical financials"),
):
    """
    Get comprehensive individual stock data using OpenBB SDK.

    Returns company profile, real-time quote, fundamental metrics (TTM, valuation,
    growth, profitability), and optionally historical financial statements.

    Args:
        symbol: Stock ticker symbol (e.g., 'NVDA', 'AAPL')
        include_financials: Whether to include quarterly financial statements

    Returns:
        StockDataResponse with profile, quote, fundamentals, and financials
    """
    try:
        service = get_stock_service()
        data = await service.get_stock_data(
            symbol=symbol.upper(),
            include_financials=include_financials,
        )

        return data

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stock/{symbol}/history")
async def get_stock_price_history(
    symbol: str,
    days: int = Query(default=365, ge=7, le=1825, description="Number of days of history"),
):
    """
    Get historical price data for a stock.

    Args:
        symbol: Stock ticker symbol (e.g., 'NVDA', 'AAPL')
        days: Number of days of history (default: 365, max: 1825 = 5 years)

    Returns:
        Historical OHLCV price data for charting
    """
    try:
        upper_symbol = symbol.upper()

        # Check in-memory cache first
        cached = _get_cached_history(upper_symbol, days)
        if cached:
            print(f"[API] Price history cache HIT for {upper_symbol} ({days}d)")
            return cached

        from app.shared.openbb_service import get_openbb_service

        service = get_openbb_service()

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        history = await service.get_historical_prices(
            symbol=upper_symbol,
            start_date=start_date,
            end_date=end_date,
        )

        result = {
            "success": True,
            "symbol": upper_symbol,
            "days": days,
            "count": len(history),
            "data": history,
        }

        # Cache for subsequent requests
        _set_cached_history(upper_symbol, days, result)
        print(f"[API] Price history fetched and cached for {upper_symbol} ({days}d, {len(history)} points)")

        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stock/{symbol}/analysis")
async def generate_stock_analysis_endpoint(
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI analysis for an individual stock.

    This endpoint fetches stock data and generates a comprehensive AI analysis
    covering business overview, valuation, earnings highlights, risks, and outlook.

    Args:
        symbol: Stock ticker symbol (e.g., 'NVDA', 'AAPL')
        force: If True, regenerate analysis even if cached version exists

    Returns:
        Structured analysis with title, business, valuation, earnings, risks, outlook
    """
    symbol = symbol.upper()

    # Validate symbol format
    if not re.match(r'^[A-Z0-9.\-]{1,10}$', symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        # Check cache first (unless force=True)
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type="comprehensive")
            if cached:
                print(f"[StockAnalysis] Using cached analysis for {symbol}")
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3-pro-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        # Fetch stock data
        print(f"[StockAnalysis] Fetching data for {symbol}")
        stock_service = get_stock_service()
        stock_data = await stock_service.get_stock_data(
            symbol=symbol,
            include_financials=True,
        )

        # Generate analysis
        print(f"[StockAnalysis] Generating AI analysis for {symbol}")
        agent = get_stock_analysis_agent()
        result = await agent.analyze(stock_data)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        # Check if analysis generation failed (agent returns empty fields with error)
        if meta.get("error"):
            print(f"[StockAnalysis] Agent returned error for {symbol}: {meta['error']}")
            raise HTTPException(
                status_code=500,
                detail="Analysis generation failed. Please try again later.",
            )

        # Save to cache
        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type="comprehensive",
            content=analysis,
            data_snapshot={
                "quote": stock_data.get("quote", {}),
                "fundamentals": stock_data.get("fundamentals", {}),
            },
            model=meta.get("model", "gemini-3-pro-preview"),
        )
        print(f"[StockAnalysis] Save result: {save_result}")

        return {
            "success": True,
            "analysis": analysis,
            "meta": {
                **meta,
                "from_cache": False,
            },
        }

    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to generate stock analysis. Please try again later.",
        )
