"""
Stock feature router - All stock-related API endpoints.
"""

from __future__ import annotations

import re
import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.shared.data_tools.quotes import get_batch_quotes, get_realtime_quote
from app.shared.data_tools.search import search_stocks as dt_search_stocks
from app.shared.data_tools.peers import get_peer_companies
from app.features.stock.service import get_stock_service
from app.features.stock.agent import get_stock_analysis_agent, get_technical_analysis_agent
from app.features.stock.db import get_stock_analysis, save_stock_analysis

logger = get_logger(__name__)

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
@limiter.limit("20/minute")
async def search_stocks(request: Request, q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    """
    Search stocks by symbol or company name using FMP API.

    Returns list of matching stocks with symbol, name, type, and exchange.
    """
    try:
        result = dt_search_stocks(query=q, limit=limit)

        if result.get("status") == "error":
            return {"stocks": []}

        return {"stocks": result.get("stocks", [])}

    except Exception as e:
        logger.exception("Error searching stocks")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quotes")
@limiter.limit("30/minute")
async def get_stock_quotes_api(request: Request, symbols: str = Query(..., description="Comma-separated stock symbols")):
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

        result = get_batch_quotes(symbol_list)

        # Transform to frontend format
        quotes = []
        for quote in result.get("quotes", []):
            quotes.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("name", ""),
                "price": quote.get("price", 0),
                "daily_change": quote.get("daily_change", 0),
            })

        logger.info("get_stock_quotes (yfinance): %d quotes, %s from cache", len(quotes), result.get('from_cache', 0))

        return {"success": True, "quotes": quotes}

    except Exception as e:
        logger.exception("Error getting stock quotes")
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
            logger.info("Profile quick: memory cache HIT for %s", upper_symbol)
            return {
                "success": True,
                "profile": cached,
                "source": "memory_cache",
            }

        # 2. Check DB cache (fast)
        db_cached = await db_get_profile(upper_symbol)
        if db_cached:
            logger.info("Profile quick: DB cache HIT for %s", upper_symbol)
            # Also warm up memory cache
            from app.features.stock.service import _set_cached_profile
            _set_cached_profile(upper_symbol, db_cached)
            return {
                "success": True,
                "profile": db_cached,
                "source": "db_cache",
            }

        # 3. No cache - return minimal placeholder
        logger.info("Profile quick: cache MISS for %s", upper_symbol)
        return {
            "success": True,
            "profile": None,
            "source": "none",
        }

    except Exception:
        logger.exception("Error getting stock profile quick")
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
        logger.exception("Error getting stock data for %s", symbol)
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
            logger.info("Price history cache HIT for %s (%dd)", upper_symbol, days)
            return cached

        import asyncio
        from app.shared.fmp_service import get_fmp_service

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        def _fetch_history():
            fmp = get_fmp_service()
            data = fmp._request(
                "/stable/historical-price-eod/full",
                {"symbol": upper_symbol, "from": start_date, "to": end_date},
            )
            if not data or not isinstance(data, list):
                return []
            # FMP returns newest-first; reverse to chronological order
            items = sorted(data, key=lambda x: x.get("date", ""))
            return [
                {
                    "date": item["date"],
                    "open": float(item.get("open", 0)),
                    "high": float(item.get("high", 0)),
                    "low": float(item.get("low", 0)),
                    "close": float(item.get("close", 0)),
                    "volume": int(item.get("volume", 0)),
                }
                for item in items
                if "date" in item
            ]

        history = await asyncio.to_thread(_fetch_history)

        result = {
            "success": True,
            "symbol": upper_symbol,
            "days": days,
            "count": len(history),
            "data": history,
        }

        # Cache for subsequent requests
        _set_cached_history(upper_symbol, days, result)
        logger.info("Price history fetched and cached for %s (%dd, %d points)", upper_symbol, days, len(history))

        return result

    except Exception as e:
        logger.exception("Error getting price history for %s", symbol)
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
        logger.exception("Error getting valuation comparison for %s", symbol)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/analysis/cache")
async def get_stock_analysis_cache(symbol: str):
    """Return cached AI analysis if available, without triggering generation."""
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        cached = await get_stock_analysis(symbol, analysis_type="comprehensive")
        if cached:
            return {
                "success": True,
                "analysis": cached.get("content"),
                "meta": {
                    "symbol": symbol,
                    "generated_at": cached.get("generated_at"),
                    "from_cache": True,
                },
            }
        return {"success": True, "analysis": None}
    except Exception as e:
        logger.exception("Error checking analysis cache for %s", symbol)
        return {"success": True, "analysis": None}


@router.post("/{symbol}/analysis")
@limiter.limit("5/minute")
async def generate_stock_analysis_endpoint(
    request: Request,
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
                logger.info("Using cached analysis for %s", symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        # Fetch stock data and valuation comparison
        logger.info("Fetching data for %s", symbol)
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
            logger.info("Valuation comparison data added for %s", symbol)
        except Exception as e:
            logger.warning("Failed to get valuation comparison: %s", e)
            stock_data["valuation_comparison"] = {}

        # Generate analysis
        logger.info("Generating AI analysis for %s", symbol)
        agent = get_stock_analysis_agent()
        result = await agent.analyze(stock_data)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        # Check if analysis generation failed (agent returns empty fields with error)
        if meta.get("error"):
            logger.error("Agent returned error for %s: %s", symbol, meta['error'])
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
            model=meta.get("model", "gemini-3.1-flash-lite-preview"),
        )
        logger.info("Save result: %s", save_result)

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
        logger.exception("Failed to generate stock analysis for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate stock analysis. Please try again later.",
        )



@router.get("/{symbol}/technical-data")
async def get_technical_data_endpoint(
    symbol: str,
    timeframe: str = Query(default="daily", pattern="^(daily|weekly)$"),
):
    """
    Get complete technical data for chart rendering and analysis.

    Returns OHLCV history, indicator series, current snapshot, derived signals,
    support/resistance, and trend summary. Used by the frontend technical chart
    and AI analysis.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        from app.shared.data_tools.technical import get_technical_data

        data = get_technical_data(symbol, timeframe=timeframe)

        if data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch technical data: {data.get('error')}",
            )

        return {
            "success": True,
            "symbol": symbol,
            "timeframe": timeframe,
            "ohlcv": data.get("ohlcv", []),
            "indicators": data.get("indicators", {}),
            "current": data.get("current", {}),
            "derived": data.get("derived", {}),
            "support_resistance": data.get("support_resistance", {}),
            "trend_summary": data.get("trend_summary", {}),
            "fetched_at": datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch technical data for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch technical data.",
        )


@router.post("/{symbol}/technical")
@limiter.limit("5/minute")
async def generate_technical_analysis_endpoint(
    request: Request,
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
                logger.info("Using cached %s analysis for %s", timeframe, symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                        "timeframe": timeframe,
                    },
                }

        # Fetch technical data
        logger.info("Fetching technical data for %s (%s)", symbol, timeframe)
        from app.shared.data_tools.technical import get_technical_data

        technical_data = get_technical_data(symbol, timeframe=timeframe)

        if technical_data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch technical data: {technical_data.get('error')}",
            )

        # Generate analysis
        logger.info("Generating AI %s analysis for %s", timeframe, symbol)
        agent = get_technical_analysis_agent()
        result = await agent.analyze(symbol, technical_data, timeframe=timeframe)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            logger.error("Agent returned error for %s: %s", symbol, meta['error'])
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
            model=meta.get("model", "gemini-3.1-flash-lite-preview"),
            expires_hours=8,
        )
        logger.info("Save result: %s", save_result)

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
        logger.exception("Failed to generate technical analysis for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate technical analysis. Please try again later.",
        )


# =============================================================================
# News Context Analysis
# =============================================================================


def _get_peer_symbols(symbol: str) -> list[str]:
    """Get top peer symbols for competitor news analysis."""
    try:
        result = get_peer_companies(symbol)
        if result.get("status") == "success":
            peers = result.get("peers", [])
            return [p["symbol"] for p in peers[:5] if p.get("symbol")]
    except Exception as e:
        logger.warning("Failed to get peers for %s: %s", symbol, e)
    return []


@router.post("/{symbol}/news")
@limiter.limit("5/minute")
async def generate_news_analysis_endpoint(
    request: Request,
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI news context analysis for a stock.

    Analyzes recent news, analyst activity, upcoming catalysts,
    and overall sentiment for the given stock.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        # Check cache first (unless force=True)
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type="news_context")
            if cached:
                logger.info("Using cached news analysis for %s", symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        # Parallel fetch: news, earnings, stock data, peers
        import asyncio
        from app.shared.data_tools.news import get_fmp_news
        from app.shared.data_tools.earnings import get_earnings_calendar
        from app.features.stock.agent import _prepare_news_context, get_news_context_agent

        stock_service = get_stock_service()

        news_task = asyncio.to_thread(get_fmp_news, days=7, symbols=[symbol])
        earnings_task = asyncio.to_thread(get_earnings_calendar, days=60)
        stock_task = stock_service.get_stock_data(symbol, include_financials=False)
        peers_task = asyncio.to_thread(_get_peer_symbols, symbol)

        news_data, earnings_data, stock_data, peer_symbols = await asyncio.gather(
            news_task, earnings_task, stock_task, peers_task,
            return_exceptions=True,
        )

        # Handle exceptions from gather
        if isinstance(news_data, Exception):
            logger.warning("News fetch failed for %s: %s", symbol, news_data)
            news_data = {"status": "error", "news": []}
        if isinstance(earnings_data, Exception):
            logger.warning("Earnings fetch failed for %s: %s", symbol, earnings_data)
            earnings_data = {"status": "error", "earnings": []}
        if isinstance(stock_data, Exception):
            logger.error("Stock data fetch failed for %s: %s", symbol, stock_data)
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch stock data for news analysis.",
            )
        if isinstance(peer_symbols, Exception):
            logger.warning("Peers fetch failed for %s: %s", symbol, peer_symbols)
            peer_symbols = []

        # Fetch competitor news (top 3 peers, non-blocking)
        peer_news_data = {"status": "error", "news": []}
        if peer_symbols:
            try:
                peer_news_data = await asyncio.to_thread(
                    get_fmp_news, days=7, symbols=peer_symbols[:3]
                )
            except Exception as e:
                logger.warning("Peer news fetch failed: %s", e)

        # Extract analyst targets and quote from stock data
        fundamentals = stock_data.get("fundamentals", {})
        analyst_targets = fundamentals.get("analyst_targets", {})
        quote = stock_data.get("quote", {})

        # Prepare context
        news_context = _prepare_news_context(
            news_data, earnings_data, analyst_targets, symbol,
            peer_news=peer_news_data, peer_symbols=peer_symbols[:3],
        )
        if not news_context:
            news_context = {"symbol": symbol}  # Agent can still produce basic output

        quote_snapshot = {
            "price": quote.get("price"),
            "change_percent": quote.get("change_percent"),
            "market_cap": quote.get("market_cap"),
        }

        # Run agent
        logger.info("Generating AI news analysis for %s", symbol)
        agent = get_news_context_agent()
        result = await agent.analyze(symbol, news_context, quote_snapshot)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            logger.error("News agent returned error for %s: %s", symbol, meta["error"])
            raise HTTPException(
                status_code=500,
                detail="News analysis generation failed. Please try again later.",
            )

        # Save to cache (8h TTL)
        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type="news_context",
            content=analysis,
            data_snapshot={"quote": quote_snapshot},
            model=meta.get("model", "gemini-3.1-flash-lite-preview"),
            expires_hours=8,
        )
        logger.info("News analysis save result: %s", save_result)

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
        logger.exception("Failed to generate news analysis for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate news analysis. Please try again later.",
        )


# =============================================================================
# Macro-Sector Analysis
# =============================================================================



@router.post("/{symbol}/macro")
@limiter.limit("5/minute")
async def generate_macro_analysis_endpoint(
    request: Request,
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI macro-sector analysis for a stock.

    Analyzes macro environment impact, sector positioning,
    market regime, and macro outlook for the given stock.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        # Check cache first (unless force=True)
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type="macro_sector")
            if cached:
                logger.info("Using cached macro analysis for %s", symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        # Get stock data first (for profile + quote)
        import asyncio
        from app.features.macro.risk.service import (
            get_macro_risk_dashboard,
            get_market_sentiment,
            get_inflation_rates,
            get_treasury_and_commodities,
        )
        from app.features.stock.agent import (
            _prepare_macro_sector_context,
            get_macro_sector_agent,
        )

        stock_service = get_stock_service()
        stock_data = await stock_service.get_stock_data(symbol, include_financials=False)
        profile = stock_data.get("profile", {})
        quote = stock_data.get("quote", {})

        # Parallel fetch: macro dashboard, sentiment, inflation/rates, treasury/commodities
        macro_task = get_macro_risk_dashboard()
        sentiment_task = get_market_sentiment()
        inflation_task = get_inflation_rates()
        treasury_task = get_treasury_and_commodities()

        results = await asyncio.gather(
            macro_task, sentiment_task,
            inflation_task, treasury_task,
            return_exceptions=True,
        )

        macro_dashboard = results[0] if not isinstance(results[0], Exception) else None
        market_sentiment = results[1] if not isinstance(results[1], Exception) else None
        inflation_rates = results[2] if not isinstance(results[2], Exception) else None
        treasury_commodities = results[3] if not isinstance(results[3], Exception) else None

        for i, name in enumerate(["Macro dashboard", "Market sentiment",
                                   "Inflation rates", "Treasury commodities"]):
            if isinstance(results[i], Exception):
                logger.warning("%s fetch failed: %s", name, results[i])

        # Prepare context
        macro_context = _prepare_macro_sector_context(
            macro_dashboard, market_sentiment, None, profile,
            inflation_rates=inflation_rates,
            treasury_commodities=treasury_commodities,
        )
        if not macro_context:
            macro_context = {
                "company_profile": {
                    "sector": profile.get("classification", {}).get("sector"),
                    "industry": profile.get("classification", {}).get("industry"),
                },
            }

        quote_snapshot = {
            "price": quote.get("price"),
            "change_percent": quote.get("change_percent"),
            "market_cap": quote.get("market_cap"),
        }

        # Run agent
        logger.info("Generating AI macro analysis for %s", symbol)
        agent = get_macro_sector_agent()
        result = await agent.analyze(symbol, macro_context, quote_snapshot)

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            logger.error("Macro agent returned error for %s: %s", symbol, meta["error"])
            raise HTTPException(
                status_code=500,
                detail="Macro analysis generation failed. Please try again later.",
            )

        # Save to cache (24h TTL)
        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type="macro_sector",
            content=analysis,
            data_snapshot={"quote": quote_snapshot},
            model=meta.get("model", "gemini-3.1-flash-lite-preview"),
            expires_hours=24,
        )
        logger.info("Macro analysis save result: %s", save_result)

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
        logger.exception("Failed to generate macro analysis for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate macro analysis. Please try again later.",
        )


# =============================================================================
# Market Overview AI Analysis (Phase 2 of market-tab-revamp)
# =============================================================================


@router.get("/{symbol}/market-analysis")
async def get_market_analysis_cache_endpoint(symbol: str):
    """Return cached market-overview AI analysis if present; empty 200 otherwise."""
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    cached = await get_stock_analysis(symbol, analysis_type="market_overview")
    if cached:
        return {
            "success": True,
            "analysis": cached.get("content"),
            "meta": {
                "symbol": symbol,
                "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                "generated_at": cached.get("generated_at"),
                "from_cache": True,
            },
        }
    return {"success": False, "analysis": None, "meta": {"symbol": symbol}}


@router.post("/{symbol}/market-analysis")
@limiter.limit("5/minute")
async def generate_market_analysis_endpoint(
    request: Request,
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI cross-dimensional market overview for a stock.

    Synthesises 12 data sources (news, press releases, analyst grades, price
    targets, insider activity, peers, market heat, sector perf, earnings
    calendar, macro snapshot) into a 6-section Chinese briefing.
    """
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type="market_overview")
            if cached:
                logger.info("Using cached market overview for %s", symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        import asyncio
        from app.shared.data_tools.news import get_fmp_news
        from app.shared.fmp_service import get_fmp_service
        from app.features.stock.agent import (
            _prepare_market_overview_context, get_market_overview_agent,
        )

        fmp = get_fmp_service()

        # Fetch: call the 3 aggregate endpoints we already built + any extras
        async def _fetch_analyst():
            g = await asyncio.to_thread(fmp.get_stock_grades, symbol, 30)
            gc = await asyncio.to_thread(fmp.get_stock_grades_consensus, symbol)
            gh = await asyncio.to_thread(fmp.get_stock_grades_historical, symbol, 24)
            pt = await asyncio.to_thread(fmp.get_price_target_consensus, symbol)
            return {
                "grades_recent": [
                    {
                        "date": x.get("date"),
                        "firm": x.get("gradingCompany"),
                        "previous_grade": x.get("previousGrade"),
                        "new_grade": x.get("newGrade"),
                        "action": (x.get("action") or "").lower(),
                    }
                    for x in (g.get("grades") or [])[:15]
                ],
                "grades_summary": gc.get("consensus") or {},
                "grades_historical": [
                    {
                        "date": h.get("date"),
                        "strong_buy": h.get("analystRatingsStrongBuy"),
                        "buy": h.get("analystRatingsBuy"),
                        "hold": h.get("analystRatingsHold"),
                        "sell": h.get("analystRatingsSell"),
                        "strong_sell": h.get("analystRatingsStrongSell"),
                    }
                    for h in (gh.get("timeline") or [])
                ],
                "price_target": pt.get("consensus") or {},
            }

        news_task = asyncio.to_thread(get_fmp_news, days=7, symbols=[symbol])
        press_task = asyncio.to_thread(fmp.get_press_releases, symbol, 10)
        analyst_task = _fetch_analyst()
        insider_task = asyncio.to_thread(fmp.get_insider_trading_search, symbol, 10)
        insider_stats_task = asyncio.to_thread(fmp.get_insider_trading_statistics, symbol)
        quote_task = asyncio.to_thread(fmp.get_stock_quotes, [symbol], True)
        profile_task = asyncio.to_thread(fmp.get_company_profile_detail, symbol)

        # Reuse market-overview shared cache for heat + peers + sector perf
        heat_task = _fetch_market_heat()
        overview_task = get_market_overview_endpoint(symbol)  # cached helper

        (news_r, press_r, analyst_r, insider_r, insider_stats_r,
         quote_r, profile_r, heat, overview) = await asyncio.gather(
            news_task, press_task, analyst_task, insider_task, insider_stats_task,
            quote_task, profile_task, heat_task, overview_task,
            return_exceptions=True,
        )

        def _safe_dict(v, fallback=None):
            if isinstance(v, Exception) or not isinstance(v, dict):
                return fallback if fallback is not None else {}
            return v

        news_list = (_safe_dict(news_r, {}).get("news") or [])
        press_list = (_safe_dict(press_r, {}).get("releases") or [])
        analyst = _safe_dict(analyst_r, {})
        insider_trades = (_safe_dict(insider_r, {}).get("trades") or [])
        insider_stats = (_safe_dict(insider_stats_r, {}).get("statistics") or [])
        quote_raw = _safe_dict(quote_r, {})
        quotes_list = quote_raw.get("quotes") or []
        quote_obj = None
        if isinstance(quotes_list, list):
            for item in quotes_list:
                if isinstance(item, dict) and item.get("symbol", "").upper() == symbol:
                    quote_obj = item
                    break
        profile = _safe_dict(profile_r, {})
        overview_dict = _safe_dict(overview, {})
        market_heat = overview_dict.get("market_heat") or {}
        peers_comparison = overview_dict.get("peers_comparison") or []
        next_earnings = (overview_dict.get("header") or {}).get("next_earnings")
        sector_perf = (overview_dict.get("market_heat") or {}).get("sector_perf") or {}

        context = _prepare_market_overview_context(
            symbol=symbol,
            quote=quote_obj,
            news=news_list,
            press_releases=press_list,
            grades_summary=analyst.get("grades_summary") or {},
            grades_recent=analyst.get("grades_recent") or [],
            grades_historical=analyst.get("grades_historical") or [],
            price_target=analyst.get("price_target") or {},
            insider_stats=insider_stats,
            insider_trades=insider_trades,
            peers_comparison=peers_comparison,
            market_heat=market_heat,
            sector_perf=sector_perf,
            next_earnings=next_earnings,
            macro_snapshot={
                "sector": (profile.get("classification") or {}).get("sector"),
                "industry": (profile.get("classification") or {}).get("industry"),
            },
        )

        # Run agent
        logger.info("Generating AI market overview for %s", symbol)
        agent = get_market_overview_agent()
        result = await agent.analyze(symbol, context)
        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            logger.error("Market overview agent error for %s: %s", symbol, meta["error"])
            raise HTTPException(
                status_code=500,
                detail="Market overview generation failed. Please try again later.",
            )

        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type="market_overview",
            content=analysis,
            data_snapshot={
                "news_count": len(news_list),
                "press_count": len(press_list),
                "grade_changes_count": len(analyst.get("grades_recent") or []),
                "peers_count": len(peers_comparison),
            },
            model=meta.get("model", "gemini-3.1-flash-lite-preview"),
            expires_hours=8,
        )
        logger.info("Market overview save result: %s", save_result)

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
        logger.exception("Failed to generate market overview for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate market overview. Please try again later.",
        )


# =============================================================================
# Earnings Analysis
# =============================================================================


@router.post("/{symbol}/earnings")
@limiter.limit("5/minute")
async def generate_earnings_analysis_endpoint(
    request: Request,
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI-powered earnings analysis for a stock.

    Analyzes earnings history, revenue breakdown, growth trends,
    and provides an overall earnings verdict.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        # Check cache first (unless force=True)
        if not force:
            cached = await get_stock_analysis(symbol, analysis_type="earnings")
            if cached:
                logger.info("Using cached earnings analysis for %s", symbol)
                return {
                    "success": True,
                    "analysis": cached.get("content"),
                    "meta": {
                        "symbol": symbol,
                        "model": cached.get("model", "gemini-3.1-flash-lite-preview"),
                        "generated_at": cached.get("generated_at"),
                        "from_cache": True,
                    },
                }

        # Fetch earnings data and quote snapshot in parallel
        import asyncio
        from app.features.stock.agent import get_earnings_agent

        stock_service = get_stock_service()

        earnings_task = stock_service.get_earnings_data(symbol)
        quote_task = asyncio.to_thread(get_realtime_quote, symbol)

        earnings_data, quote_raw = await asyncio.gather(
            earnings_task, quote_task,
            return_exceptions=True,
        )

        if isinstance(earnings_data, Exception):
            logger.error("Earnings data fetch failed for %s: %s", symbol, earnings_data)
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch earnings data.",
            )
        if isinstance(quote_raw, Exception):
            logger.warning("Quote fetch failed for %s: %s", symbol, quote_raw)
            quote_raw = {}

        quote_snapshot = {
            "price": quote_raw.get("price"),
            "change_percent": quote_raw.get("change_percent"),
            "market_cap": quote_raw.get("market_cap"),
        }

        # Enrich with fundamentals for deeper analysis
        try:
            stock_data = await stock_service.get_stock_data(symbol)
            if stock_data and stock_data.get("fundamentals"):
                fund = stock_data["fundamentals"]
                # Valuation
                quote_snapshot["pe"] = fund.get("valuation", {}).get("pe")
                # Profitability
                quote_snapshot["gross_margin"] = fund.get("profitability", {}).get("gross_margin")
                quote_snapshot["operating_margin"] = fund.get("profitability", {}).get("operating_margin")
                quote_snapshot["net_margin"] = fund.get("profitability", {}).get("net_margin")
                quote_snapshot["roe"] = fund.get("profitability", {}).get("roe")
                quote_snapshot["roa"] = fund.get("profitability", {}).get("roa")
                # Growth
                quote_snapshot["revenue_yoy"] = fund.get("growth", {}).get("revenue_yoy")
                # TTM cash flow
                ttm = fund.get("ttm", {})
                quote_snapshot["revenue"] = ttm.get("revenue")
                quote_snapshot["net_income"] = ttm.get("net_income")
                quote_snapshot["ebitda"] = ttm.get("ebitda")
                quote_snapshot["operating_cash_flow"] = ttm.get("operating_cash_flow")
                quote_snapshot["free_cash_flow"] = ttm.get("free_cash_flow")
                # Balance sheet
                bs = fund.get("balance_sheet", {})
                quote_snapshot["current_ratio"] = bs.get("current_ratio")
                quote_snapshot["debt_to_equity"] = bs.get("debt_to_equity")
                # Industry context
                quote_snapshot["industry"] = stock_data.get("profile", {}).get("industry")
                quote_snapshot["sector"] = stock_data.get("profile", {}).get("sector")
        except Exception as e:
            logger.warning("Could not enrich earnings context for %s: %s", symbol, e)

        # Fetch transcript for the most recent quarter (if available).
        # Priority: pending quarter (just reported) > latest income statement.
        transcript_text = None
        try:
            pending = earnings_data.get("pending_quarter")
            income_stmts = earnings_data.get("income_statements", [])

            # Determine which quarter to fetch transcript for
            target_fy = None
            target_q = None

            if pending and pending.get("fiscal_year") and pending.get("fiscal_period"):
                target_fy = pending["fiscal_year"]
                fp = pending["fiscal_period"]
                target_q = int(fp.replace("Q", "")) if fp.startswith("Q") else None

            if target_fy is None or target_q is None:
                # Fall back to latest non-pending income statement
                latest = next(
                    (s for s in income_stmts if not s.get("is_pending")), None
                ) if income_stmts else None
                if latest:
                    fp = latest.get("fiscal_period", "")
                    target_fy = latest.get("fiscal_year")
                    target_q = int(fp.replace("Q", "")) if fp.startswith("Q") else None

            if target_fy and target_q:
                transcript_result = await stock_service.get_transcript(
                    symbol, target_fy, target_q
                )
                if transcript_result.get("available"):
                    transcript_text = transcript_result["content"]
                    logger.info(
                        "Transcript available for %s Q%d FY%d (%d chars)",
                        symbol, target_q, target_fy,
                        len(transcript_text),
                    )
        except Exception as e:
            logger.warning("Could not fetch transcript for %s: %s", symbol, e)

        # Prepare data and run agent
        logger.info("Generating AI earnings analysis for %s", symbol)
        agent = get_earnings_agent()
        result = await agent.analyze(
            symbol, earnings_data, quote_snapshot, transcript_text
        )

        analysis = result.get("analysis", {})
        meta = result.get("meta", {})

        if meta.get("error"):
            logger.error("Earnings agent returned error for %s: %s", symbol, meta["error"])
            raise HTTPException(
                status_code=500,
                detail="Earnings analysis generation failed. Please try again later.",
            )

        # Save to cache (7d if transcript-based, 24h if data-only)
        cache_hours = 168 if meta.get("has_transcript") else 24
        save_result = await save_stock_analysis(
            symbol=symbol,
            analysis_type="earnings",
            content=analysis,
            data_snapshot={"quote": quote_snapshot},
            model=meta.get("model", "gemini-3.1-pro-preview"),
            expires_hours=cache_hours,
        )
        logger.info("Earnings analysis save result: %s", save_result)

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
        logger.exception("Failed to generate earnings analysis for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate earnings analysis. Please try again later.",
        )


@router.get("/{symbol}/earnings-data")
async def get_earnings_data_endpoint(symbol: str):
    """
    Pure data endpoint: earnings history, analyst estimates, revenue segments, growth.

    Returns raw aggregated earnings data without AI analysis.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        stock_service = get_stock_service()
        data = await stock_service.get_earnings_data(symbol)

        return {
            "success": True,
            **data,
        }

    except Exception:
        logger.exception("Failed to get earnings data for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch earnings data.",
        )


# =============================================================================
# Earnings Transcript
# =============================================================================


@router.get("/{symbol}/transcript")
async def get_transcript_endpoint(
    symbol: str,
    year: int = Query(..., description="Fiscal year"),
    quarter: int = Query(..., ge=1, le=4, description="Fiscal quarter (1-4)"),
):
    """
    Get earnings call transcript for a specific quarter.

    Returns the full text of the earnings call (prepared remarks + analyst Q&A).
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        stock_service = get_stock_service()
        data = await stock_service.get_transcript(symbol, year, quarter)

        return {
            "success": True,
            **data,
        }

    except Exception:
        logger.exception(
            "Failed to get transcript for %s Y%d Q%d", symbol, year, quarter
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch transcript.",
        )



# =============================================================================
# News Feed (raw data)
# =============================================================================


@router.get("/{symbol}/news-feed")
async def get_news_feed_endpoint(
    symbol: str,
    days: int = Query(default=7, ge=1, le=30, description="Number of days of news"),
):
    """
    Raw news articles for a stock.

    Returns recent news articles with title, date, source, URL, and summary.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        import asyncio
        from app.shared.data_tools.news import get_fmp_news

        news_data = await asyncio.to_thread(get_fmp_news, days=days, symbols=[symbol])

        articles = []
        for item in news_data.get("news", []):
            articles.append({
                "title": item.get("title", ""),
                "publishedDate": item.get("publishedDate", ""),
                "source": item.get("source", ""),
                "url": item.get("url", ""),
                "summary": item.get("text", item.get("summary", "")),
            })

        return {
            "success": True,
            "symbol": symbol,
            "days": days,
            "count": len(articles),
            "news": articles,
        }

    except Exception:
        logger.exception("Failed to get news feed for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch news feed.",
        )


# =============================================================================
# Insider Trading
# =============================================================================


@router.get("/{symbol}/insider-trading")
async def get_insider_trading_endpoint(symbol: str):
    """
    Insider trading data for a stock.

    Returns recent insider trades and aggregate statistics.
    """
    symbol = symbol.upper()

    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        import asyncio
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()

        trades_task = asyncio.to_thread(fmp.get_insider_trading_search, symbol)
        stats_task = asyncio.to_thread(fmp.get_insider_trading_statistics, symbol)

        trades_result, stats_result = await asyncio.gather(
            trades_task, stats_task,
            return_exceptions=True,
        )

        if isinstance(trades_result, Exception):
            logger.warning("Insider trades fetch failed for %s: %s", symbol, trades_result)
            trades_result = {"trades": []}
        if isinstance(stats_result, Exception):
            logger.warning("Insider stats fetch failed for %s: %s", symbol, stats_result)
            stats_result = {"statistics": []}

        return {
            "success": True,
            "symbol": symbol,
            "trades": trades_result.get("trades", []),
            "statistics": stats_result.get("statistics", []),
        }

    except Exception:
        logger.exception("Failed to get insider trading data for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch insider trading data.",
        )


# =============================================================================
# Analyst Activity (Phase 1 of market-tab-revamp)
# =============================================================================


_analyst_activity_cache: dict = {}
_analyst_activity_lock = threading.Lock()
ANALYST_ACTIVITY_TTL_MINUTES = 60  # grades change slowly, 1h is fine


def _safe_float_or_none(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


@router.get("/{symbol}/analyst-activity")
async def get_analyst_activity_endpoint(symbol: str):
    """
    Aggregated analyst activity for a stock.

    Combines 5 FMP endpoints in parallel:
    - grades (recent rating changes)
    - grades-consensus (strongBuy/buy/hold/sell/strongSell summary)
    - grades-historical (monthly rating distribution, 12+ months)
    - price-target-consensus (low/avg/high target + current)
    - price-target-summary (coverage by time window)

    Returns a unified shape consumed by AnalystRatingsCard (Phase 1 UI).
    """
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    # Cache check
    with _analyst_activity_lock:
        entry = _analyst_activity_cache.get(symbol)
        if entry and datetime.now() < entry["expires"]:
            return entry["data"]

    try:
        import asyncio
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()

        grades_task = asyncio.to_thread(fmp.get_stock_grades, symbol, 30)
        consensus_task = asyncio.to_thread(fmp.get_stock_grades_consensus, symbol)
        historical_task = asyncio.to_thread(fmp.get_stock_grades_historical, symbol, 24)
        pt_consensus_task = asyncio.to_thread(fmp.get_price_target_consensus, symbol)
        pt_summary_task = asyncio.to_thread(fmp.get_price_target_summary, symbol)

        grades_r, consensus_r, historical_r, pt_consensus_r, pt_summary_r = await asyncio.gather(
            grades_task, consensus_task, historical_task, pt_consensus_task, pt_summary_task,
            return_exceptions=True,
        )

        def _unwrap(r, key, default):
            if isinstance(r, Exception):
                logger.warning("analyst-activity sub-call failed: %s", r)
                return default
            return r.get(key, default) if isinstance(r, dict) else default

        grades = _unwrap(grades_r, "grades", [])
        consensus = _unwrap(consensus_r, "consensus", {})
        historical = _unwrap(historical_r, "timeline", [])
        pt_consensus = _unwrap(pt_consensus_r, "consensus", {})
        pt_summary = _unwrap(pt_summary_r, "summary", {})

        # Normalize consensus (grades-consensus → 5-bucket summary)
        summary_out = {
            "strong_buy": int(consensus.get("strongBuy", 0) or 0),
            "buy": int(consensus.get("buy", 0) or 0),
            "hold": int(consensus.get("hold", 0) or 0),
            "sell": int(consensus.get("sell", 0) or 0),
            "strong_sell": int(consensus.get("strongSell", 0) or 0),
            "consensus": consensus.get("consensus", ""),  # e.g. "Buy"
        }
        summary_out["total"] = (
            summary_out["strong_buy"] + summary_out["buy"] + summary_out["hold"]
            + summary_out["sell"] + summary_out["strong_sell"]
        )

        # Price target: merge consensus + summary
        price_target_out = {
            "low": _safe_float_or_none(pt_consensus.get("targetLow")),
            "average": _safe_float_or_none(pt_consensus.get("targetConsensus")),
            "median": _safe_float_or_none(pt_consensus.get("targetMedian")),
            "high": _safe_float_or_none(pt_consensus.get("targetHigh")),
            # price-target-summary has lastMonthAvgPriceTarget etc & analyst counts
            "last_month_avg": _safe_float_or_none(pt_summary.get("lastMonthAvgPriceTarget")),
            "last_month_count": int(pt_summary.get("lastMonthCount", 0) or 0),
            "last_quarter_avg": _safe_float_or_none(pt_summary.get("lastQuarterAvgPriceTarget")),
            "last_quarter_count": int(pt_summary.get("lastQuarterCount", 0) or 0),
            "last_year_avg": _safe_float_or_none(pt_summary.get("lastYearAvgPriceTarget")),
            "last_year_count": int(pt_summary.get("lastYearCount", 0) or 0),
            "all_time_avg": _safe_float_or_none(pt_summary.get("allTimeAvgPriceTarget")),
            "all_time_count": int(pt_summary.get("allTimeCount", 0) or 0),
        }

        # Grade changes: normalize for UI
        grade_changes_out = []
        for g in grades[:20]:
            grade_changes_out.append({
                "date": g.get("date", ""),
                "firm": g.get("gradingCompany", ""),
                "previous_grade": g.get("previousGrade") or None,
                "new_grade": g.get("newGrade", ""),
                "action": (g.get("action") or "").lower(),
            })

        # Historical timeline: normalize to ascending by date for charting
        historical_out = []
        for h in historical:
            historical_out.append({
                "date": h.get("date", ""),
                "strong_buy": int(h.get("analystRatingsStrongBuy", 0) or 0),
                "buy": int(h.get("analystRatingsBuy", 0) or 0),
                "hold": int(h.get("analystRatingsHold", 0) or 0),
                "sell": int(h.get("analystRatingsSell", 0) or 0),
                "strong_sell": int(h.get("analystRatingsStrongSell", 0) or 0),
            })
        # Sort ascending by date so charting libs are happy
        historical_out.sort(key=lambda x: x["date"])

        response = {
            "success": True,
            "symbol": symbol,
            "summary": summary_out,
            "price_target": price_target_out,
            "grade_changes": grade_changes_out,
            "historical_timeline": historical_out,
        }

        with _analyst_activity_lock:
            _analyst_activity_cache[symbol] = {
                "data": response,
                "expires": datetime.now() + timedelta(minutes=ANALYST_ACTIVITY_TTL_MINUTES),
            }

        return response

    except Exception:
        logger.exception("Failed to get analyst activity for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch analyst activity.",
        )


# =============================================================================
# Press Releases (Phase 2 of market-tab-revamp)
# =============================================================================


@router.get("/{symbol}/press-releases")
async def get_press_releases_endpoint(
    symbol: str,
    limit: int = Query(default=30, ge=1, le=100, description="Max number of releases"),
):
    """Official company press releases from FMP."""
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    try:
        import asyncio
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = await asyncio.to_thread(fmp.get_press_releases, symbol, limit)

        releases = []
        for r in result.get("releases", []):
            text = r.get("text") or ""
            preview = text[:300] + ("..." if len(text) > 300 else "")
            releases.append({
                "symbol": r.get("symbol", symbol),
                "published_date": r.get("publishedDate", ""),
                "publisher": r.get("publisher", ""),
                "title": r.get("title", ""),
                "image": r.get("image", ""),
                "site": r.get("site", ""),
                "url": r.get("url", ""),
                "preview": preview,
            })

        return {
            "success": True,
            "symbol": symbol,
            "count": len(releases),
            "releases": releases,
        }

    except Exception:
        logger.exception("Failed to get press releases for %s", symbol)
        raise HTTPException(status_code=500, detail="Failed to fetch press releases.")


# =============================================================================
# Market Overview (Phase 2 of market-tab-revamp)
# =============================================================================


_market_overview_cache: dict = {}
_market_overview_lock = threading.Lock()
MARKET_OVERVIEW_TTL_MINUTES = 10
_market_heat_cache: dict = {"data": None, "expires": None}
_market_heat_lock = threading.Lock()
MARKET_HEAT_TTL_MINUTES = 5


def _get_market_heat_cached():
    """Shared cache of gainers/losers/most-actives/sector/industry snapshots.

    These are market-wide (symbol-independent), so we cache once and let all
    /market-overview calls share it.
    """
    with _market_heat_lock:
        if _market_heat_cache["data"] and _market_heat_cache["expires"] and datetime.now() < _market_heat_cache["expires"]:
            return _market_heat_cache["data"]
    return None


def _set_market_heat_cached(data):
    with _market_heat_lock:
        _market_heat_cache["data"] = data
        _market_heat_cache["expires"] = datetime.now() + timedelta(minutes=MARKET_HEAT_TTL_MINUTES)


async def _fetch_market_heat():
    import asyncio
    from app.shared.fmp_service import get_fmp_service

    cached = _get_market_heat_cached()
    if cached is not None:
        return cached

    fmp = get_fmp_service()
    gainers_t = asyncio.to_thread(fmp.get_biggest_gainers)
    losers_t = asyncio.to_thread(fmp.get_biggest_losers)
    actives_t = asyncio.to_thread(fmp.get_most_actives)
    sector_t = asyncio.to_thread(fmp.get_sector_performance_snapshot)
    industry_t = asyncio.to_thread(fmp.get_industry_performance_snapshot)

    gainers_r, losers_r, actives_r, sector_r, industry_r = await asyncio.gather(
        gainers_t, losers_t, actives_t, sector_t, industry_t,
        return_exceptions=True,
    )

    def _stocks(r):
        if isinstance(r, Exception):
            return []
        return r.get("stocks", []) if isinstance(r, dict) else []

    def _sectors(r):
        if isinstance(r, Exception):
            return []
        return r.get("sectors", []) if isinstance(r, dict) else []

    def _industries(r):
        if isinstance(r, Exception):
            return []
        return r.get("industries", []) if isinstance(r, dict) else []

    data = {
        "gainers": _stocks(gainers_r),
        "losers": _stocks(losers_r),
        "actives": _stocks(actives_r),
        "sectors": _sectors(sector_r),
        "industries": _industries(industry_r),
    }
    _set_market_heat_cached(data)
    return data


def _rank_in_list(stocks: list, symbol: str, top_n: int = 50):
    for idx, s in enumerate(stocks[:top_n]):
        if s.get("symbol", "").upper() == symbol:
            return idx + 1
    return None


@router.get("/{symbol}/market-overview")
async def get_market_overview_endpoint(symbol: str):
    """
    Aggregated market overview for the Market Tab header + KPI row + heat card + peers.

    Returns header (earnings countdown + market badges), kpis (5 numbers),
    market_heat (rankings + sector perf), peers_comparison.
    """
    symbol = symbol.upper()
    if not re.match(r"^[A-Z0-9.\-]{1,10}$", symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    with _market_overview_lock:
        entry = _market_overview_cache.get(symbol)
        if entry and datetime.now() < entry["expires"]:
            return entry["data"]

    try:
        import asyncio
        from app.shared.fmp_service import get_fmp_service
        from app.shared.data_tools.news import get_fmp_news
        from app.shared.data_tools.peers import get_peer_companies
        from app.shared.data_tools.quotes import get_batch_quotes

        fmp = get_fmp_service()

        # Parallel root fetches
        heat_task = _fetch_market_heat()
        earnings_task = asyncio.to_thread(fmp.get_recent_earnings_for_symbol, symbol, 1, 30)
        quote_task = asyncio.to_thread(fmp.get_stock_quotes, [symbol], True)
        profile_task = asyncio.to_thread(fmp.get_company_profile_detail, symbol)
        peers_task = asyncio.to_thread(get_peer_companies, symbol, 3)
        news_task = asyncio.to_thread(get_fmp_news, 1, [symbol])  # last 24h
        grades_task = asyncio.to_thread(fmp.get_stock_grades, symbol, 30)
        pt_consensus_task = asyncio.to_thread(fmp.get_price_target_consensus, symbol)
        insider_stats_task = asyncio.to_thread(fmp.get_insider_trading_statistics, symbol)

        heat, earnings_r, quote_r, profile_r, peers_r, news_r, grades_r, pt_r, insider_r = await asyncio.gather(
            heat_task, earnings_task, quote_task, profile_task, peers_task,
            news_task, grades_task, pt_consensus_task, insider_stats_task,
            return_exceptions=True,
        )

        # --- Header: next earnings ---
        next_earnings = None
        if not isinstance(earnings_r, Exception) and isinstance(earnings_r, dict):
            items = earnings_r.get("earnings") or []
            # Find the first upcoming
            today_str = datetime.now().strftime("%Y-%m-%d")
            for e in items:
                d = e.get("date", "")
                if d >= today_str:
                    try:
                        days_until = (datetime.strptime(d, "%Y-%m-%d") - datetime.now()).days
                    except ValueError:
                        days_until = None
                    next_earnings = {
                        "date": d,
                        "days_until": days_until,
                        "eps_estimate": _safe_float_or_none(e.get("epsEstimated") or e.get("eps_estimate")),
                    }
                    break

        # --- Header: market badges (is this stock on any top list?) ---
        badges = {
            "gainers_rank": _rank_in_list(heat.get("gainers", []), symbol),
            "losers_rank": _rank_in_list(heat.get("losers", []), symbol),
            "most_active_rank": _rank_in_list(heat.get("actives", []), symbol),
        }

        # --- KPIs ---
        # news_24h count
        news_24h = 0
        if not isinstance(news_r, Exception) and isinstance(news_r, dict):
            news_24h = len(news_r.get("news", []))

        # 7d grade changes (count non-maintain actions in last 7 days)
        grade_changes_7d = 0
        if not isinstance(grades_r, Exception) and isinstance(grades_r, dict):
            cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            for g in grades_r.get("grades", []):
                if g.get("date", "") >= cutoff and (g.get("action") or "").lower() != "maintain":
                    grade_changes_7d += 1

        # target consensus
        target_consensus = None
        if not isinstance(pt_r, Exception) and isinstance(pt_r, dict):
            target_consensus = _safe_float_or_none(pt_r.get("consensus", {}).get("targetConsensus"))

        # Current price — quotes is a list
        current_price = None
        q = None
        if not isinstance(quote_r, Exception) and isinstance(quote_r, dict):
            quotes_list = quote_r.get("quotes") or []
            if isinstance(quotes_list, list):
                for item in quotes_list:
                    if isinstance(item, dict) and item.get("symbol", "").upper() == symbol:
                        q = item
                        break
            if q:
                current_price = _safe_float_or_none(q.get("price"))

        # NOTE: insider_net_30d KPI removed — FMP data too sparse for most
        # liquid names; retained in context for AI analysis but not surfaced to UI.

        # sector relative perf: profile → find in heat.sectors, compare to stock's today's change
        sector_relative_perf_1m = None
        stock_sector = None
        if not isinstance(profile_r, Exception) and isinstance(profile_r, dict):
            # profile shape: top-level has 'classification' dict with 'sector' (see get_company_profile_detail)
            classification = profile_r.get("classification") or {}
            stock_sector = (
                classification.get("sector")
                or (profile_r.get("profile") or {}).get("sector")
                or profile_r.get("sector")
            )
        sector_avg_today = None
        stock_exchange = None
        if not isinstance(profile_r, Exception) and isinstance(profile_r, dict):
            stock_exchange = (profile_r.get("exchange") or "").upper()
        if stock_sector:
            # Prefer the same-exchange sector row; fall back to any exchange.
            same_exchange_match = None
            any_match = None
            for s in heat.get("sectors", []):
                if s.get("sector") == stock_sector:
                    any_match = s
                    if stock_exchange and s.get("exchange", "").upper() == stock_exchange:
                        same_exchange_match = s
                        break
            chosen = same_exchange_match or any_match
            if chosen:
                sector_avg_today = _safe_float_or_none(chosen.get("averageChange"))
        # Stock's own 1-day change (we compare today's change vs sector today's avg)
        stock_change_today_pct = None
        if q:
            stock_change_today_pct = _safe_float_or_none(
                q.get("daily_change") or q.get("changesPercentage") or q.get("changePercentage")
            )
        if stock_change_today_pct is not None and sector_avg_today is not None:
            sector_relative_perf_1m = stock_change_today_pct - sector_avg_today

        kpis = {
            "news_24h": news_24h,
            "grade_changes_7d": grade_changes_7d,
            "target_consensus": target_consensus,
            "current_price": current_price,
            "target_upside_pct": (
                ((target_consensus - current_price) / current_price * 100)
                if target_consensus and current_price else None
            ),
            "sector_relative_perf_today": sector_relative_perf_1m,
            "stock_sector": stock_sector,
        }

        # --- market heat card ---
        market_heat_out = {
            "rankings": badges,
            "sector_perf": {
                "sector_name": stock_sector,
                "stock_change_today_pct": stock_change_today_pct,
                "sector_avg_today_pct": sector_avg_today,
            },
        }

        # --- peers comparison ---
        peers_out = []
        if not isinstance(peers_r, Exception):
            peer_list = peers_r if isinstance(peers_r, list) else (peers_r.get("peers", []) if isinstance(peers_r, dict) else [])
            peer_symbols = [p.get("symbol") if isinstance(p, dict) else p for p in peer_list][:3]
            if peer_symbols:
                peer_quotes_r = await asyncio.to_thread(fmp.get_stock_quotes, peer_symbols, True)
                peer_quotes_list = (peer_quotes_r or {}).get("quotes") if isinstance(peer_quotes_r, dict) else []
                peer_by_sym = {}
                if isinstance(peer_quotes_list, list):
                    for item in peer_quotes_list:
                        if isinstance(item, dict) and item.get("symbol"):
                            peer_by_sym[item["symbol"].upper()] = item
                for p_sym in peer_symbols:
                    pq = peer_by_sym.get(p_sym.upper(), {})
                    peers_out.append({
                        "symbol": p_sym,
                        "name": pq.get("name", ""),
                        "price": _safe_float_or_none(pq.get("price")),
                        "change_pct_today": _safe_float_or_none(
                            pq.get("daily_change") or pq.get("changesPercentage") or pq.get("changePercentage")
                        ),
                    })

        response = {
            "success": True,
            "symbol": symbol,
            "header": {
                "next_earnings": next_earnings,
                "market_badges": badges,
            },
            "kpis": kpis,
            "market_heat": market_heat_out,
            "peers_comparison": peers_out,
        }

        with _market_overview_lock:
            _market_overview_cache[symbol] = {
                "data": response,
                "expires": datetime.now() + timedelta(minutes=MARKET_OVERVIEW_TTL_MINUTES),
            }

        return response

    except Exception:
        logger.exception("Failed to get market overview for %s", symbol)
        raise HTTPException(status_code=500, detail="Failed to fetch market overview.")


# =============================================================================
# Legacy routes: redirect /api/stock/* -> /api/stocks/*
# =============================================================================

from fastapi.responses import RedirectResponse

legacy_router = APIRouter(prefix="/api/stock", tags=["stock-legacy"], include_in_schema=False)


def _legacy_redirect(path: str, request: Request, status_code: int = 307):
    qs = f"?{request.query_params}" if request.query_params else ""
    return RedirectResponse(url=f"{path}{qs}", status_code=status_code)


@legacy_router.get("/{symbol}/profile")
async def legacy_profile(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/profile", request)


@legacy_router.get("/{symbol}")
async def legacy_stock(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}", request)


@legacy_router.get("/{symbol}/history")
async def legacy_history(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/history", request)


@legacy_router.get("/{symbol}/valuation")
async def legacy_valuation(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/valuation", request)


@legacy_router.post("/{symbol}/analysis")
async def legacy_analysis(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/analysis", request)


@legacy_router.post("/{symbol}/technical")
async def legacy_technical(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/technical", request)
