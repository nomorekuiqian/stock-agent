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
# Company Profile
# =============================================================================


async def get_company_profile(symbol: str) -> str:
    """Get company overview: what the company does, its industry, CEO, and size.

    Use when the user asks "what does this company do", wants to understand the business, or needs sector/industry info.
    Returns: company name, sector, industry, CEO, employee count, business description.
    """
    from app.shared.data_tools.fundamentals import (
        get_company_profile as _get_profile,
    )

    symbol = symbol.upper().strip()
    if not symbol:
        return _safe_json_dumps({"error": "No symbol provided"})

    logger.info("research_tool: get_company_profile(%s)", symbol)
    try:
        data = await asyncio.to_thread(_get_profile, symbol)
        if not data:
            return _safe_json_dumps({
                "symbol": symbol,
                "error": "No profile data available",
            })

        # FMP returns: {company_name, exchange, classification: {sector, industry},
        #   description: {en}, company_details: {ceo, employees, website, ipo_date, ...}}
        classification = data.get("classification", {})
        details = data.get("company_details", {})
        desc = data.get("description", {})
        summary = {
            "symbol": symbol,
            "name": data.get("company_name", ""),
            "sector": classification.get("sector", ""),
            "industry": classification.get("industry", ""),
            "ceo": details.get("ceo", ""),
            "employees": details.get("employees"),
            "country": details.get("country", ""),
            "exchange": data.get("exchange", ""),
            "description": ((desc.get("en") or "") if isinstance(desc, dict) else str(desc))[:500],
        }
        return _safe_json_dumps(summary)
    except Exception as e:
        logger.error("get_company_profile failed: %s", e)
        return _safe_json_dumps({"symbol": symbol, "error": str(e)})


# =============================================================================
# Peer Comparison
# =============================================================================


async def get_peer_comparison(symbol: str) -> str:
    """Compare a stock's valuation and profitability against its industry peers.

    Use when the user asks "how does X compare to competitors", "is X expensive vs peers", or wants relative valuation.
    Returns: target company metrics vs up to 5 peers (PE, PB, PS, ROE, profit margin, etc).
    """
    from app.shared.data_tools.peers import get_peer_companies, get_peer_valuation

    symbol = symbol.upper().strip()
    if not symbol:
        return _safe_json_dumps({"error": "No symbol provided"})

    logger.info("research_tool: get_peer_comparison(%s)", symbol)
    try:
        # Step 1: find peers
        peers_result = await asyncio.to_thread(get_peer_companies, symbol)
        if not peers_result or peers_result.get("status") != "success":
            return _safe_json_dumps({
                "symbol": symbol,
                "message": "No peer data available for this stock",
            })

        peer_list = peers_result.get("peers", [])
        peer_symbols = [p["symbol"] for p in peer_list if p.get("symbol")][:5]

        if not peer_symbols:
            return _safe_json_dumps({
                "symbol": symbol,
                "message": "No peers found for comparison",
            })

        # Step 2: get valuation comparison
        val_result = await asyncio.to_thread(
            get_peer_valuation, symbol, peer_symbols
        )
        if not val_result or val_result.get("status") != "success":
            return _safe_json_dumps({
                "symbol": symbol,
                "peers": peer_symbols,
                "message": "Could not fetch valuation metrics",
            })

        # Trim metrics to core fields only
        _keep = {
            "pe_ratio", "pb_ratio", "ps_ratio", "peg_ratio",
            "ev_to_ebitda", "roe", "roa", "net_profit_margin",
            "revenue_growth", "market_cap",
        }

        def _trim_metrics(metrics: dict) -> dict:
            return {k: v for k, v in metrics.items() if k in _keep and v is not None}

        company = val_result.get("company", {})
        peers = val_result.get("peers", [])

        return _safe_json_dumps({
            "symbol": symbol,
            "company_metrics": _trim_metrics(company.get("metrics", {})),
            "peers": [
                {
                    "symbol": p.get("symbol", ""),
                    "metrics": _trim_metrics(p.get("metrics", {})),
                }
                for p in peers
            ],
        })
    except Exception as e:
        logger.error("get_peer_comparison failed: %s", e)
        return _safe_json_dumps({"symbol": symbol, "error": str(e)})


# =============================================================================
# Historical Valuation
# =============================================================================


async def get_historical_valuation(symbol: str) -> str:
    """Get historical valuation trends for a stock (last 5 years, annual).

    Use when the user asks "is this stock expensive", "historical PE trend", or wants to judge current valuation vs history.
    Returns: annual PE, PB, PS, PEG, EV/EBITDA, ROE for the past 5 years.
    """
    from app.shared.data_tools.fundamentals import get_historical_metrics

    symbol = symbol.upper().strip()
    if not symbol:
        return _safe_json_dumps({"error": "No symbol provided"})

    logger.info("research_tool: get_historical_valuation(%s)", symbol)
    try:
        data = await asyncio.to_thread(
            get_historical_metrics, symbol, "annual", 5
        )
        if not data or data.get("status") != "success":
            return _safe_json_dumps({
                "symbol": symbol,
                "error": "No historical valuation data available",
            })

        _keep = {
            "date", "pe_ratio", "pb_ratio", "ps_ratio",
            "peg_ratio", "ev_to_ebitda", "roe",
        }
        metrics = data.get("metrics", [])
        trimmed = []
        for m in metrics:
            row = {}
            for k in _keep:
                v = m.get(k)
                if k == "date":
                    row[k] = v
                elif v is not None:
                    row[k] = round(float(v), 2) if isinstance(v, (int, float)) else v
            trimmed.append(row)

        return _safe_json_dumps({"symbol": symbol, "annual_metrics": trimmed})
    except Exception as e:
        logger.error("get_historical_valuation failed: %s", e)
        return _safe_json_dumps({"symbol": symbol, "error": str(e)})


# =============================================================================
# Macro Risk Summary
# =============================================================================


async def get_macro_risk_summary() -> str:
    """Get macro risk dashboard: 4-dimension risk scores (economy, credit, employment, AI health).

    Use when the user asks about macro risk, economic outlook, recession risk, or overall market safety.
    Returns: composite score (0-10), risk level, and 4 category scores with headlines.
    """
    from app.features.macro.risk.service import get_macro_risk_dashboard

    logger.info("research_tool: get_macro_risk_summary()")
    try:
        dashboard = await get_macro_risk_dashboard()
        # Trim: keep scores and headlines, drop indicators detail and ai_stocks
        categories = []
        for cat in dashboard.categories:
            categories.append({
                "name": cat.category_name,
                "score": cat.risk_score,
                "level": cat.risk_level,
                "headline": cat.headline,
            })

        summary = {
            "composite_score": dashboard.composite_score,
            "composite_level": dashboard.composite_level,
            "categories": categories,
        }

        # Include liquidity summary if available
        if dashboard.liquidity_summary:
            summary["liquidity_summary"] = dashboard.liquidity_summary

        return _safe_json_dumps(summary)
    except Exception as e:
        logger.error("get_macro_risk_summary failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Liquidity Overview
# =============================================================================


async def get_liquidity_overview() -> str:
    """Get Fed liquidity metrics: net liquidity, Fed assets, TGA, RRP, reserves, SOFR, EFFR.

    Use when the user asks about liquidity conditions, Fed balance sheet, or monetary environment.
    Returns: each metric with current value, date, and change from previous reading.
    """
    from app.features.macro.liquidity.fred_service import get_all_liquidity_metrics

    logger.info("research_tool: get_liquidity_overview()")
    try:
        data = await get_all_liquidity_metrics()
        # Trim each metric to essentials
        trimmed = {}
        for key, metric in data.items():
            if not isinstance(metric, dict):
                continue
            trimmed[key] = {
                "title": metric.get("title", key),
                "value": metric.get("value"),
                "date": metric.get("date", ""),
                "change": metric.get("change"),
            }
        return _safe_json_dumps(trimmed)
    except Exception as e:
        logger.error("get_liquidity_overview failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Market Sentiment
# =============================================================================


async def get_market_sentiment() -> str:
    """Get market sentiment indicators: CNN Fear & Greed Index, VIX, put/call ratio.

    Use when the user asks about market sentiment, fear/greed, whether market is overbought/oversold.
    Returns: overall sentiment score (0-100), level (Extreme Fear to Extreme Greed), sub-dimension details.
    """
    from app.features.macro.risk.service import (
        get_market_sentiment as _get_sentiment,
    )

    logger.info("research_tool: get_market_sentiment()")
    try:
        data = await _get_sentiment()
        # Trim: keep overall + sub_dimension summaries, drop raw indicators
        sub_dims = []
        for dim in data.sub_dimensions:
            sub_dims.append({
                "name_zh": dim.name_zh,
                "score": dim.score,
                "risk_level": dim.risk_level,
                "headline": dim.headline,
            })

        return _safe_json_dumps({
            "overall_score": data.overall_score,
            "overall_level": data.overall_level,
            "overall_headline": data.overall_headline,
            "sub_dimensions": sub_dims,
        })
    except Exception as e:
        logger.error("get_market_sentiment failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Economic Calendar
# =============================================================================


async def get_economic_calendar(days: int = 14) -> str:
    """Get upcoming high-impact US economic events (CPI, Non-Farm Payrolls, FOMC, GDP, etc).

    Use when the user asks about upcoming economic events, Fed meetings, or key data releases.
    Args:
        days: Number of days to look ahead (default: 14, max: 30)
    Returns: list of events with date, name, previous/estimate/actual values.
    """
    from app.shared.data_tools.calendar import (
        get_economic_calendar as _get_calendar,
    )

    days = min(max(days, 1), 30)

    logger.info("research_tool: get_economic_calendar(days=%d)", days)
    try:
        data = await asyncio.to_thread(_get_calendar, days)
        if not data or data.get("status") != "success":
            return _safe_json_dumps({
                "error": data.get("error", "Failed to fetch economic calendar"),
            })

        # Trim each event to essentials
        events = []
        for evt in data.get("events", []):
            events.append({
                "date": evt.get("date", ""),
                "event": evt.get("event", ""),
                "previous": evt.get("previous"),
                "estimate": evt.get("estimate"),
                "actual": evt.get("actual"),
                "is_key_event": evt.get("is_key_event", False),
            })

        return _safe_json_dumps({
            "events_count": len(events),
            "events": events,
        })
    except Exception as e:
        logger.error("get_economic_calendar failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Morning Report
# =============================================================================


async def get_morning_report() -> str:
    """Get today's pre-market morning report: futures, global markets, overnight news, today's focus.

    Use when the user asks about pre-market conditions, "what happened overnight", or wants today's morning briefing.
    Returns: futures data, global market snapshot, overnight news headlines, today's key focus items.
    """
    from app.features.morning_report.db import get_latest_morning_report

    logger.info("research_tool: get_morning_report()")
    try:
        report = await get_latest_morning_report()
        if not report:
            return _safe_json_dumps({"message": "No morning report available yet today"})

        # Trim futures — FuturesQuote schema: {name, value, daily_change}
        futures_raw = report.get("futures")
        futures = []
        if futures_raw and isinstance(futures_raw, list):
            for f in futures_raw[:8]:
                if isinstance(f, dict):
                    futures.append({
                        "name": f.get("name", ""),
                        "value": f.get("value"),
                        "daily_change": f.get("daily_change"),
                    })

        # Trim global markets — GlobalSnapshot: {asia, europe, other} each list of MarketQuote {name, value, daily_change}
        global_raw = report.get("global_markets", {})
        global_markets = {}
        if isinstance(global_raw, dict):
            for region in ("asia", "europe", "other"):
                items = global_raw.get(region, [])
                if isinstance(items, list):
                    global_markets[region] = [
                        {"name": m.get("name", ""), "daily_change": m.get("daily_change")}
                        for m in items[:4]
                        if isinstance(m, dict)
                    ]

        # Trim news and focus — OvernightItem: {title, analysis}, TodayFocusItem: {title, analysis, time}
        def _trim_news(items, limit=5):
            if not items or not isinstance(items, list):
                return []
            return [
                {"title": item.get("title", ""), "analysis": item.get("analysis", "")}
                if isinstance(item, dict) else str(item)
                for item in items[:limit]
            ]

        def _trim_focus(items, limit=5):
            if not items or not isinstance(items, list):
                return []
            return [
                {"title": item.get("title", ""), "analysis": item.get("analysis", ""), "time": item.get("time", "")}
                if isinstance(item, dict) else str(item)
                for item in items[:limit]
            ]

        return _safe_json_dumps({
            "report_date": report.get("report_date", ""),
            "title": report.get("title", ""),
            "market_pulse": report.get("market_pulse", ""),
            "futures": futures,
            "futures_analysis": report.get("futures_analysis", ""),
            "global_markets": global_markets,
            "overnight_news": _trim_news(report.get("overnight_news"), 5),
            "today_focus": _trim_focus(report.get("today_focus"), 5),
            "summary": report.get("summary", ""),
        })
    except Exception as e:
        logger.error("get_morning_report failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Weekly Report
# =============================================================================


async def get_weekly_report() -> str:
    """Get the latest weekly macro analysis report: verdict, signal lights, 4-dimension analysis, investment takeaway.

    Use when the user asks about weekly market summary, macro outlook, or "what happened this week".
    Returns: week label, verdict, signal lights (liquidity/economy/inflation/sentiment), key takeaway, week-ahead events.
    """
    from app.features.macro.weekly.db import get_latest_report

    logger.info("research_tool: get_weekly_report()")
    try:
        report = await get_latest_report()
        if not report:
            return _safe_json_dumps({"message": "No weekly report available yet"})

        # Trim analysis sections — SectionAnalysis: {summary, data_changes, trend_interpretation, market_implication}
        # Keep summary + market_implication (most valuable), drop data_changes and trend_interpretation (too verbose)
        def _trim_analysis(section):
            if not section or not isinstance(section, dict):
                return None
            return {
                "summary": section.get("summary", ""),
                "market_implication": section.get("market_implication", ""),
            }

        # Trim week_ahead — WeekAheadEvent: {date, event, if_above, if_below}
        week_ahead = report.get("week_ahead", [])
        if isinstance(week_ahead, list):
            week_ahead = [
                {
                    "date": e.get("date", ""),
                    "event": e.get("event", ""),
                    "if_above": e.get("if_above", ""),
                    "if_below": e.get("if_below", ""),
                }
                if isinstance(e, dict) else str(e)
                for e in week_ahead[:6]
            ]

        return _safe_json_dumps({
            "week_label": report.get("week_label", ""),
            "title": report.get("title", ""),
            "verdict": report.get("verdict", ""),
            "signal_lights": report.get("signal_lights", {}),
            "takeaway": report.get("takeaway", ""),
            "liquidity_analysis": _trim_analysis(report.get("liquidity_analysis")),
            "economy_analysis": _trim_analysis(report.get("economy_analysis")),
            "inflation_analysis": _trim_analysis(report.get("inflation_analysis")),
            "sentiment_analysis": _trim_analysis(report.get("sentiment_analysis")),
            "week_ahead": week_ahead,
        })
    except Exception as e:
        logger.error("get_weekly_report failed: %s", e)
        return _safe_json_dumps({"error": str(e)})


# =============================================================================
# Twitter Digest (KOL aggregation)
# =============================================================================


async def get_twitter_digest() -> str:
    """Get today's KOL Twitter digest — what tracked Twitter/X finance KOLs are saying right now.

    CALL THIS TOOL (do not fall back to web search) whenever the user asks about:
      - "KOL" / "博主" / "推特" / "Twitter" 圈在说 / 在聊什么
      - 今天 / 最近 KOL 对某只 ticker 的看法
      - KOL 圈对某个赛道 (AI 算力 / 加密 / Fed) 的多空分歧
      - 推特日报内容、watchpoints、博主热议

    Example triggering queries (must trigger this tool, not tavily_search):
      "今天 KOL 都在聊什么"
      "推特圈对 NVDA 怎么看"
      "博主们对 AI 算力的最新观点"
      "最近 KOL 圈有什么热议"
      "今日推特日报"

    Returns: { date, headline, hot_tickers, hot_sectors, ticker_theses (with bull/bear
    stance summaries + synthesis), macro_threads, watchpoints }. Returns
    {"message": "No twitter digest available yet today"} if no digest is published yet.
    """
    from app.features.twitter_digest.db import get_latest_digest

    logger.info("research_tool: get_twitter_digest()")
    try:
        digest = await get_latest_digest()
        if not digest:
            return _safe_json_dumps({"message": "No twitter digest available yet today"})

        d = digest.model_dump()

        # Hot lists — top items only
        def _trim_hot(items, limit):
            if not items or not isinstance(items, list):
                return []
            out = []
            for it in items[:limit]:
                if isinstance(it, dict):
                    out.append({
                        "label": it.get("label", ""),
                        "count": it.get("count", 0),
                        "kols": it.get("kols", 0),
                    })
            return out

        # Ticker theses — keep stance / synthesis / counts, drop full argument arrays
        theses = []
        for t in (d.get("ticker_theses") or [])[:8]:
            if not isinstance(t, dict):
                continue
            theses.append({
                "ticker": t.get("ticker", ""),
                "side": t.get("side", ""),
                "primary_kols": (t.get("primary_kols") or [])[:4],
                "tweet_count": t.get("tweet_count", 0),
                "stance_summary": t.get("stance_summary", ""),
                "synthesis_zh": t.get("synthesis_zh", ""),
                "buy_count": t.get("buy_count", 0),
                "sell_count": t.get("sell_count", 0),
                "observation_count": t.get("observation_count", 0),
            })

        # Macro threads — synthesis only, drop key_points
        threads = []
        for m in (d.get("macro_threads") or [])[:4]:
            if not isinstance(m, dict):
                continue
            threads.append({
                "title": m.get("title", ""),
                "layer": m.get("layer", "macro"),
                "primary_kols": (m.get("primary_kols") or [])[:4],
                "synthesis_zh": m.get("synthesis_zh", ""),
            })

        # Watchpoints — title + date + why, drop evidence arguments
        watchpoints = []
        for w in (d.get("watchpoints") or [])[:5]:
            if not isinstance(w, dict):
                continue
            watchpoints.append({
                "title": w.get("title", ""),
                "date_hint": w.get("date_hint", ""),
                "why_it_matters_zh": w.get("why_it_matters_zh", ""),
                "related_tickers": (w.get("related_tickers") or [])[:6],
            })

        return _safe_json_dumps({
            "date": d.get("date", ""),
            "headline": d.get("headline", ""),
            "tracked_kols": (d.get("tracked_kols") or [])[:20],
            "input_tweet_count": d.get("input_tweet_count", 0),
            "hot_tickers": _trim_hot(d.get("hot_tickers"), 10),
            "hot_sectors": _trim_hot(d.get("hot_sectors"), 5),
            "ticker_theses": theses,
            "macro_threads": threads,
            "watchpoints": watchpoints,
        })
    except Exception as e:
        logger.error("get_twitter_digest failed: %s", e)
        return _safe_json_dumps({"error": str(e)[:200]})


# =============================================================================
# Tool registry for import
# =============================================================================

research_data_tools = [
    # V1: market & stock data
    get_market_overview,
    get_stock_quote,
    get_stock_news,
    get_technical_analysis,
    get_stock_fundamentals,
    get_earnings_calendar,
    # V2: deep stock research
    get_company_profile,
    get_peer_comparison,
    get_historical_valuation,
    # V2: macro & sentiment
    get_macro_risk_summary,
    get_liquidity_overview,
    get_market_sentiment,
    # V2: economic calendar
    get_economic_calendar,
    # V2: reports
    get_morning_report,
    get_weekly_report,
    get_twitter_digest,
]
