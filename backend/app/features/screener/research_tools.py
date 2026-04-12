"""
Research Agent Tools - Data access tools for the Research Agent.

Wraps existing data_tools and shared services as Agent-callable functions.
Each tool returns a JSON string for LLM consumption with trimmed output
to stay within context limits.
"""

import asyncio
import json

from app.core.logging import get_logger

logger = get_logger(__name__)


def _safe_json_dumps(data, **kwargs) -> str:
    """JSON serialize with fallback for non-serializable types."""
    return json.dumps(data, ensure_ascii=False, default=str, **kwargs)


# =============================================================================
# Market Overview
# =============================================================================


async def get_market_overview() -> str:
    """Get current market overview including major indices, VIX, treasury rates, commodities, and currencies.

    Use when the user asks about the overall market, macro environment, or "how's the market today".
    Returns: S&P 500, Nasdaq, Dow, VIX, key treasury yields (2Y/5Y/10Y/30Y), gold, oil, USD index.
    """
    from app.shared.data_tools.market_data import get_all_market_data

    logger.info("research_tool: get_market_overview()")
    try:
        data = await asyncio.to_thread(get_all_market_data)
        if data.get("status") != "success":
            return _safe_json_dumps({"error": "Failed to fetch market data"})

        # Trim yield_curve to key maturities only
        rates = data.get("rates", {})
        if "yield_curve" in rates:
            yc = rates["yield_curve"]
            rates["yield_curve"] = {
                k: v for k, v in yc.items() if k in ("2Y", "5Y", "10Y", "30Y")
            }

        return _safe_json_dumps(data)
    except Exception as e:
        logger.error("get_market_overview failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Stock Quotes
# =============================================================================


async def get_stock_quote(symbols: list[str]) -> str:
    """Get real-time price quotes for stocks. Max 20 symbols per call.

    Use when the user asks about current prices, daily performance, or wants a quick overview of specific stocks.
    Returns: price, daily/weekly/monthly change %, PE ratio, market cap, 52-week high/low for each symbol.
    """
    from app.shared.data_tools.market_data import get_stock_quotes

    symbols = [s.upper().strip() for s in symbols[:20] if s.strip()]
    if not symbols:
        return _safe_json_dumps({"error": "No valid symbols provided"})

    logger.info("research_tool: get_stock_quote(%s)", symbols)
    try:
        result = await asyncio.to_thread(get_stock_quotes, symbols)
        return _safe_json_dumps(result)
    except Exception as e:
        logger.error("get_stock_quote failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Stock News
# =============================================================================


async def get_stock_news(symbols: list[str], days: int = 1) -> str:
    """Fetch recent news for specific stock symbols. Returns top 12 articles.

    Use when the user asks about news, recent events, or what's happening with specific stocks.
    Args:
        symbols: List of ticker symbols (e.g. ["NVDA", "AAPL"])
        days: Number of days to look back (default: 1, max: 7)
    """
    from app.shared.data_tools.news import get_fmp_news

    symbols = [s.upper().strip() for s in symbols[:10] if s.strip()]
    days = min(max(days, 1), 7)

    logger.info("research_tool: get_stock_news(%s, days=%d)", symbols, days)
    try:
        result = await asyncio.to_thread(get_fmp_news, days, symbols if symbols else None)
        if result.get("status") != "success":
            return _safe_json_dumps(
                {"error": result.get("error", "Failed to fetch news")}
            )

        # Trim to top 12 articles, keep only essential fields
        news = result.get("news", [])
        trimmed = []
        for article in news[:12]:
            trimmed.append({
                "title": article.get("title", ""),
                "symbol": article.get("symbol", ""),
                "publishedDate": article.get("publishedDate", ""),
                "url": article.get("url", ""),
            })

        return _safe_json_dumps({
            "news_count": len(trimmed),
            "news": trimmed,
        })
    except Exception as e:
        logger.error("get_stock_news failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Technical Analysis
# =============================================================================


async def get_technical_analysis(symbol: str) -> str:
    """Get technical analysis summary for a single stock.

    Use when the user asks about technicals, chart signals, support/resistance, RSI, MACD, or whether to buy/sell from a technical perspective.
    Returns: daily rating (buy/sell/neutral), RSI, MACD, SMA 50/200, support/resistance levels, pattern signals.
    """
    from app.shared.data_tools.technical import get_technical_data

    symbol = symbol.upper().strip()
    if not symbol:
        return _safe_json_dumps({"error": "No symbol provided"})

    logger.info("research_tool: get_technical_analysis(%s)", symbol)
    try:
        data = await asyncio.to_thread(get_technical_data, symbol)
        if not data or data.get("error"):
            return _safe_json_dumps({
                "symbol": symbol,
                "error": data.get("error", "No data available"),
            })

        # Extract only key fields (~20 instead of 100+)
        summary = {
            "symbol": symbol,
            "ratings": data.get("ratings", {}).get("daily", {}),
            "weekly_rating": data.get("ratings", {}).get("weekly", {}).get(
                "overall", None
            ),
            "oscillators": {
                "rsi_14": data.get("oscillators", {}).get("rsi_14"),
                "macd": data.get("oscillators", {}).get("macd"),
                "macd_signal": data.get("oscillators", {}).get("macd_signal"),
                "macd_histogram": data.get("oscillators", {}).get(
                    "macd_histogram"
                ),
            },
            "moving_averages": {
                "sma_20": data.get("moving_averages", {}).get("sma_20"),
                "sma_50": data.get("moving_averages", {}).get("sma_50"),
                "sma_200": data.get("moving_averages", {}).get("sma_200"),
            },
            "price": data.get("price_volume", {}).get("price"),
            "derived": data.get("derived", {}),
            "support_resistance": data.get("support_resistance", {}),
            "pattern_signals": data.get("pattern_signals", {}),
        }

        return _safe_json_dumps(summary)
    except Exception as e:
        logger.error("get_technical_analysis failed: %s", e)
        return _safe_json_dumps({"symbol": symbol, "error": str(e)})


# =============================================================================
# Fundamentals
# =============================================================================


async def get_stock_fundamentals(symbol: str) -> str:
    """Get fundamental metrics for a single stock.

    Use when the user asks about valuation (PE, PS), profitability (margins, ROE), growth rates, debt levels, or analyst targets.
    Returns: valuation ratios, profitability metrics, growth rates, balance sheet health, analyst price targets.
    """
    from app.shared.data_tools.fundamentals import get_ticker_snapshot

    symbol = symbol.upper().strip()
    if not symbol:
        return _safe_json_dumps({"error": "No symbol provided"})

    logger.info("research_tool: get_stock_fundamentals(%s)", symbol)
    try:
        data = await asyncio.to_thread(get_ticker_snapshot, symbol)

        if not data:
            return _safe_json_dumps({
                "symbol": symbol,
                "error": "No fundamental data available",
            })

        # Keep key categories, drop raw TTM and less useful fields
        # Convert decimal ratios to percentages for consistency with agent instruction
        # (agent expects: 15% = 15, not 0.15)
        profitability = data.get("profitability", {})
        profitability_pct = {}
        for k, v in profitability.items():
            if isinstance(v, (int, float)) and v is not None:
                profitability_pct[k] = round(v * 100, 2)
            else:
                profitability_pct[k] = v

        growth = data.get("growth", {})
        growth_pct = {}
        for k, v in growth.items():
            if isinstance(v, (int, float)) and v is not None:
                growth_pct[k] = round(v * 100, 2)
            else:
                growth_pct[k] = v

        summary = {
            "symbol": symbol,
            "valuation": data.get("valuation", {}),
            "profitability": profitability_pct,
            "growth": growth_pct,
            "balance_sheet": {
                "current_ratio": data.get("balance_sheet", {}).get(
                    "current_ratio"
                ),
                "debt_to_equity": data.get("balance_sheet", {}).get(
                    "debt_to_equity"
                ),
                "total_debt": data.get("balance_sheet", {}).get("total_debt"),
                "total_cash": data.get("balance_sheet", {}).get("total_cash"),
            },
            "analyst_targets": data.get("analyst_targets", {}),
        }

        return _safe_json_dumps(summary)
    except Exception as e:
        logger.error("get_stock_fundamentals failed: %s", e)
        return _safe_json_dumps({"symbol": symbol, "error": str(e)})


# =============================================================================
# Earnings Calendar
# =============================================================================


async def get_earnings_calendar(days: int = 14) -> str:
    """Get upcoming earnings announcements for major companies.

    Use when the user asks about upcoming earnings, reporting season, or wants to know which companies report soon.
    Args:
        days: Number of days to look ahead (default: 14, max: 30)
    Returns: list of upcoming earnings with symbol, date, EPS/revenue estimates.
    """
    from app.shared.data_tools.earnings import (
        get_earnings_calendar as _get_earnings,
    )

    days = min(max(days, 1), 30)

    logger.info("research_tool: get_earnings_calendar(days=%d)", days)
    try:
        result = await asyncio.to_thread(_get_earnings, days)
        return _safe_json_dumps(result)
    except Exception as e:
        logger.error("get_earnings_calendar failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Tool registry for import
# =============================================================================

research_data_tools = [
    get_market_overview,
    get_stock_quote,
    get_stock_news,
    get_technical_analysis,
    get_stock_fundamentals,
    get_earnings_calendar,
]
