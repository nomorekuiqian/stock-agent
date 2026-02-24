"""
Stock feature router - All stock-related API endpoints.
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
from app.features.stock.agent import get_stock_analysis_agent, get_technical_analysis_agent
from app.features.stock.db import get_stock_analysis, save_stock_analysis

router = APIRouter(prefix="/api/stocks", tags=["stocks"])

_price_history_cache: dict = {}
_price_history_lock = threading.Lock()
PRICE_HISTORY_TTL_MINUTES = 30


def _get_cached_history(symbol: str, days: int):
    key = (symbol.upper(), days)
    with _price_history_lock:
        entry = _price_history_cache.get(key)
        if entry and datetime.now() < entry["expires"]:
            return entry["data"]
    return None


def _set_cached_history(symbol: str, days: int, data: dict):
    key = (symbol.upper(), days)
    with _price_history_lock:
        _price_history_cache[key] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=PRICE_HISTORY_TTL_MINUTES),
        }



@router.get("/search")
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


@router.get("/quotes")
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



@router.get("/{symbol}/profile")
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


@router.get("/{symbol}")
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


@router.get("/{symbol}/history")
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


@router.get("/{symbol}/valuation")
async def get_stock_valuation_comparison(symbol: str):
    """
    Get valuation comparison data for a stock.

    Includes:
    1. Peer comparison - Compare with same-industry companies
    2. Industry valuation - Industry and sector average P/E
    3. Historical valuation - 5-year historical valuation metrics

    Args:
        symbol: Stock ticker symbol (e.g., 'NVDA', 'AAPL')

    Returns:
        ValuationComparisonResponse with peer, industry, and historical data
    """
    # Validate symbol format
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        service = get_stock_service()

        # First get the stock profile to know industry/sector
        stock_data = await service.get_stock_data(symbol, include_financials=False)
        profile = stock_data.get("profile", {})
        classification = profile.get("classification", {})

        industry = classification.get("industry")
        sector = classification.get("sector")

        # Get valuation comparison data
        valuation_data = await service.get_valuation_comparison(
            symbol=symbol,
            industry=industry,
            sector=sector,
        )

        return {
            "success": True,
            "symbol": symbol,
            "industry": industry,
            "sector": sector,
            **valuation_data,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{symbol}/analysis")
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

        # Fetch stock data and valuation comparison
        print(f"[StockAnalysis] Fetching data for {symbol}")
        stock_service = get_stock_service()

        # Get stock data first to know industry/sector for valuation comparison
        stock_data = await stock_service.get_stock_data(
            symbol=symbol,
            include_financials=True,
        )
        profile = stock_data.get("profile", {})
        classification = profile.get("classification", {})
        industry = classification.get("industry")
        sector = classification.get("sector")

        # Now fetch valuation comparison data
        try:
            valuation_comparison = await stock_service.get_valuation_comparison(
                symbol=symbol,
                industry=industry,
                sector=sector,
            )
            stock_data["valuation_comparison"] = valuation_comparison
            print(f"[StockAnalysis] Valuation comparison data added for {symbol}")
        except Exception as e:
            print(f"[StockAnalysis] Failed to get valuation comparison: {e}")
            stock_data["valuation_comparison"] = {}

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



@router.get("/{symbol}/technical-snapshot")
async def get_technical_snapshot_endpoint(symbol: str):
    """
    Get pre-computed technical indicator snapshot for instant signal display.

    Returns TradingView ratings, key oscillators, support/resistance,
    and Bollinger bands. Served from 15-minute in-memory cache.

    Response time: <100ms (cache hit) or <2s (cache miss)
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        from app.shared.data_tools.technical import get_technical_snapshot, get_technical_trends

        snapshot = get_technical_snapshot(symbol)

        if snapshot.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch technical snapshot: {snapshot.get('error')}",
            )

        # Also fetch support/resistance from pandas-ta trends (cached 30min)
        trends = get_technical_trends(symbol)
        support_resistance = trends.get("support_resistance", {}) if "error" not in trends else {}

        osc = snapshot.get("oscillators", {})
        trend_data = snapshot.get("trend", {})
        derived = snapshot.get("derived", {})

        # Extract pandas-ta trend context and pattern signals
        trends_ok = "error" not in trends
        trends_data = trends.get("trends", {}) if trends_ok else {}
        pattern_sigs = trends.get("pattern_signals", {}) if trends_ok else {}

        macd_trend = trends_data.get("macd", {})
        rsi_trend = trends_data.get("rsi_14", {})
        volume_data = trends_data.get("volume", {})

        return {
            "success": True,
            "symbol": symbol,
            "ratings": snapshot.get("ratings", {}),
            "oscillators": {
                "rsi_14": osc.get("rsi_14"),
                "macd_histogram": osc.get("macd_histogram"),
                "rsi_14_weekly": osc.get("rsi_14_weekly"),
                "macd_histogram_weekly": osc.get("macd_histogram_weekly"),
                "macd_level": osc.get("macd_level"),
                "macd_signal": osc.get("macd_signal"),
            },
            "trend": {
                "adx_14": trend_data.get("adx_14"),
                "adx_14_weekly": trend_data.get("adx_14_weekly"),
                "adx_plus_di": trend_data.get("adx_plus_di"),
                "adx_minus_di": trend_data.get("adx_minus_di"),
            },
            "moving_averages": snapshot.get("moving_averages", {}),
            "volatility": snapshot.get("volatility", {}),
            "price_volume": snapshot.get("price_volume", {}),
            "support_resistance": support_resistance,
            "trend_context": {
                "macd_cross": macd_trend.get("cross"),
                "macd_histogram_direction": macd_trend.get("histogram_direction"),
                "rsi_direction": rsi_trend.get("direction"),
                "rsi_recently_overbought": rsi_trend.get("recently_overbought"),
                "rsi_recently_oversold": rsi_trend.get("recently_oversold"),
                "volume_ratio": volume_data.get("ratio"),
                "volume_trend": volume_data.get("trend"),
            },
            "pattern_signals": {
                "bb_squeeze": pattern_sigs.get("bb_squeeze"),
                "bb_position": pattern_sigs.get("bb_position"),
                "volume_confirmation": pattern_sigs.get("volume_confirmation"),
                "ma_alignment": pattern_sigs.get("ma_alignment"),
                "sma_cross": pattern_sigs.get("sma_cross"),
            },
            "derived": {
                "above_sma_20": derived.get("above_sma_20"),
                "rsi_zone": derived.get("rsi_zone"),
            },
            "fetched_at": datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch technical snapshot.",
        )



@router.post("/{symbol}/technical")
async def generate_technical_analysis_endpoint(
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
    timeframe: str = Query(default="daily", pattern="^(daily|weekly)$", description="Analysis timeframe"),
):
    """
    Generate AI technical analysis for a stock.

    Returns structured technical analysis covering trend, signals,
    patterns, and outlook based on technical indicators.

    Args:
        symbol: Stock ticker symbol (e.g., 'NVDA', 'AAPL')
        force: If True, regenerate analysis even if cached version exists
        timeframe: 'daily' or 'weekly' - determines which indicators to analyze

    Returns:
        Structured technical analysis with trend, signals, patterns, summary
    """
    symbol = symbol.upper()
    analysis_type = f"technical_{timeframe}"

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        # Check cache first (unless force=True)
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type=analysis_type)
            if cached:
                print(f"[TechnicalAnalysis] Using cached {timeframe} analysis for {symbol}")
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3-pro-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                        "timeframe": timeframe,
                    },
                }

        # Fetch technical data
        print(f"[TechnicalAnalysis] Fetching technical data for {symbol} ({timeframe})")
        from app.shared.data_tools.technical import get_technical_data

        technical_data = get_technical_data(symbol)

        if technical_data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch technical data: {technical_data.get('error')}",
            )

        # Generate analysis
        print(f"[TechnicalAnalysis] Generating AI {timeframe} analysis for {symbol}")
        agent = get_technical_analysis_agent()
        result = await agent.analyze(symbol, technical_data, timeframe=timeframe)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            print(f"[TechnicalAnalysis] Agent returned error for {symbol}: {meta['error']}")
            raise HTTPException(
                status_code=500,
                detail="Technical analysis generation failed. Please try again later.",
            )

        # Save to cache with timeframe-specific key (8h TTL for technical analysis)
        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type=analysis_type,
            content=analysis,
            data_snapshot=technical_data,
            model=meta.get("model", "gemini-3-pro-preview"),
            expires_hours=8,
        )
        print(f"[TechnicalAnalysis] Save result: {save_result}")

        return {
            "success": True,
            "analysis": analysis,
            "meta": {
                **meta,
                "from_cache": False,
                "timeframe": timeframe,
                "sources": technical_data.get("sources", []),
            },
        }

    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to generate technical analysis. Please try again later.",
        )


# =============================================================================
# Legacy routes: redirect /api/stock/* -> /api/stocks/*
# =============================================================================

from fastapi.responses import RedirectResponse

legacy_router = APIRouter(prefix="/api/stock", tags=["stock-legacy"], include_in_schema=False)


@legacy_router.get("/{symbol}/profile")
async def legacy_profile(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/profile", status_code=307)


@legacy_router.get("/{symbol}")
async def legacy_stock(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}", status_code=307)


@legacy_router.get("/{symbol}/history")
async def legacy_history(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/history", status_code=307)


@legacy_router.get("/{symbol}/valuation")
async def legacy_valuation(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/valuation", status_code=307)


@legacy_router.post("/{symbol}/analysis")
async def legacy_analysis(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/analysis", status_code=307)


@legacy_router.get("/{symbol}/technical-snapshot")
async def legacy_technical_snapshot(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/technical-snapshot", status_code=307)


@legacy_router.post("/{symbol}/technical")
async def legacy_technical(symbol: str):
    return RedirectResponse(url=f"/api/stocks/{symbol}/technical", status_code=307)
