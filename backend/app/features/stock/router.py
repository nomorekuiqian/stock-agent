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
from app.shared.data_tools.quotes import get_batch_quotes
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

        def _fetch_history():
            import yfinance as yf
            df = yf.download(upper_symbol, start=start_date, end=end_date, progress=False)
            result = []
            if df is not None and not df.empty:
                for date_idx, row in df.iterrows():
                    result.append({
                        "date": str(date_idx.date()),
                        "open": float(row.iloc[0] if hasattr(row.get("Open", 0), 'iloc') else row.get("Open", 0)),
                        "high": float(row.iloc[0] if hasattr(row.get("High", 0), 'iloc') else row.get("High", 0)),
                        "low": float(row.iloc[0] if hasattr(row.get("Low", 0), 'iloc') else row.get("Low", 0)),
                        "close": float(row.iloc[0] if hasattr(row.get("Close", 0), 'iloc') else row.get("Close", 0)),
                        "volume": int(row.iloc[0] if hasattr(row.get("Volume", 0), 'iloc') else row.get("Volume", 0)),
                    })
            return result

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

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
        logger.exception("Failed to fetch technical snapshot for %s", symbol)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch technical snapshot.",
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

        technical_data = get_technical_data(symbol)

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


@legacy_router.get("/{symbol}/technical-snapshot")
async def legacy_technical_snapshot(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/technical-snapshot", request)


@legacy_router.post("/{symbol}/technical")
async def legacy_technical(symbol: str, request: Request):
    return _legacy_redirect(f"/api/stocks/{symbol}/technical", request)
