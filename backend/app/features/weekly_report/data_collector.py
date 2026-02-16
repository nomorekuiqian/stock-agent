"""
Weekly Report - Data Collector

Aggregates data from all existing services into a single WeeklyRawData object.
This is the input for the AI Agent (M2) to generate the weekly macro report.
"""

import asyncio
import traceback

import yfinance as yf

from app.utils.timezone import utc_now_iso, market_week_label
from app.features.macro_risk.service import (
    get_macro_risk_dashboard,
    get_economic_fundamentals,
    get_inflation_rates,
    get_market_sentiment,
    get_cpi_breakdown,
)
from app.features.liquidity.fred_service import get_all_liquidity_metrics
from app.features.macro_cache.db import try_db_cache
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar
from app.features.weekly_report.models import (
    WeeklyRawData,
    MarketPerformance,
)


MARKET_INDICES = {
    "^GSPC": "S&P 500",
    "^IXIC": "Nasdaq Composite",
    "^VIX": "VIX",
    "GC=F": "Gold",
    "DX-Y.NYB": "US Dollar Index",
    "^TNX": "10Y Treasury",
}

SECTOR_ETFS = {
    "XLK": "Technology",
    "XLC": "Communication",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLE": "Energy",
    "XLF": "Financials",
    "XLV": "Health Care",
    "XLI": "Industrials",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLU": "Utilities",
}

STYLE_ETFS = {
    "IWF": "Growth (Russell 1000)",
    "IWD": "Value (Russell 1000)",
    "IWM": "Small Cap (Russell 2000)",
}


def _fetch_weekly_performance() -> MarketPerformance:
    """Fetch weekly price change for indices, sectors, and style ETFs via yfinance."""
    all_symbols = list(MARKET_INDICES) + list(SECTOR_ETFS) + list(STYLE_ETFS)

    try:
        data = yf.download(
            all_symbols,
            period="5d",
            auto_adjust=True,
            progress=False,
            threads=True,
        )

        if data.empty:
            print("[WeeklyCollector] yf.download returned empty data")
            return MarketPerformance()

        def _calc_change(symbol: str) -> dict | None:
            try:
                if len(all_symbols) == 1:
                    close = data["Close"]
                else:
                    close = data["Close"][symbol]

                close = close.dropna()
                if len(close) < 2:
                    return None

                first_close = close.iloc[0]
                last_close = close.iloc[-1]
                weekly_change = ((last_close - first_close) / first_close) * 100

                return {
                    "symbol": symbol,
                    "weekly_change": round(float(weekly_change), 2),
                    "weekly_change_abs": round(float(last_close - first_close), 4),
                    "last_close": round(float(last_close), 2),
                }
            except Exception:
                return None

        def _build_list(symbol_map: dict) -> list[dict]:
            results = []
            for symbol, name in symbol_map.items():
                item = _calc_change(symbol)
                if item:
                    item["name"] = name
                    results.append(item)
            return results

        return MarketPerformance(
            indices=_build_list(MARKET_INDICES),
            sectors=_build_list(SECTOR_ETFS),
            style=_build_list(STYLE_ETFS),
        )

    except Exception as e:
        print(f"[WeeklyCollector] Error fetching weekly performance: {e}")
        traceback.print_exc()
        return MarketPerformance()


def _safe_calendar(result, key: str) -> list:
    """Extract calendar list from result, handling exceptions and dict/list formats."""
    if isinstance(result, Exception):
        return []
    if isinstance(result, dict):
        return result.get(key, [])
    return result if isinstance(result, list) else []


async def collect_weekly_data() -> WeeklyRawData:
    """Collect all data needed for the weekly macro report in parallel."""
    print("[WeeklyCollector] Starting weekly data collection...")

    dashboard_task = get_macro_risk_dashboard()
    economy_task = get_economic_fundamentals()
    inflation_task = get_inflation_rates()
    liquidity_task = get_all_liquidity_metrics()
    sentiment_task = get_market_sentiment()
    cpi_task = get_cpi_breakdown()

    loop = asyncio.get_event_loop()
    market_perf_task = loop.run_in_executor(None, _fetch_weekly_performance)
    econ_cal_task = loop.run_in_executor(None, get_economic_calendar, 14)
    earn_cal_task = loop.run_in_executor(None, get_earnings_calendar, 14)

    results = await asyncio.gather(
        dashboard_task,
        economy_task,
        inflation_task,
        liquidity_task,
        sentiment_task,
        cpi_task,
        econ_cal_task,
        earn_cal_task,
        market_perf_task,
        try_db_cache("macro:liquidity_percentiles"),
        return_exceptions=True,
    )

    (dashboard, economy, inflation, liquidity, sentiment, cpi_data,
     econ_cal, earn_cal, market_perf, liq_cache_result) = results

    def _safe_dump(result, label: str):
        if isinstance(result, Exception):
            print(f"[WeeklyCollector] Error fetching {label}: {result}")
            return None
        if hasattr(result, "model_dump"):
            return result.model_dump()
        return result

    liq_context = None
    if isinstance(liq_cache_result, Exception):
        print(f"[WeeklyCollector] Error reading liquidity percentiles cache: {liq_cache_result}")
    elif isinstance(liq_cache_result, tuple):
        cached_data, is_valid = liq_cache_result
        if cached_data:
            liq_context = cached_data
            status = "valid" if is_valid else "stale"
            print(f"[WeeklyCollector] Liquidity percentiles from cache ({status}): {list(liq_context.keys())}")
        else:
            print("[WeeklyCollector] No liquidity percentiles in cache")

    raw_data = WeeklyRawData(
        week_label=market_week_label(),
        collected_at=utc_now_iso(),
        macro_risk=_safe_dump(dashboard, "macro_risk"),
        economy=_safe_dump(economy, "economy"),
        inflation_rates=_safe_dump(inflation, "inflation_rates"),
        liquidity=_safe_dump(liquidity, "liquidity"),
        sentiment=_safe_dump(sentiment, "sentiment"),
        cpi_breakdown=_safe_dump(cpi_data, "cpi_breakdown"),
        liquidity_historical=liq_context,
        market_performance=(
            market_perf if isinstance(market_perf, MarketPerformance)
            else MarketPerformance()
        ),
        economic_calendar=_safe_calendar(econ_cal, "events"),
        earnings_calendar=_safe_calendar(earn_cal, "earnings"),
    )

    print(f"[WeeklyCollector] Data collection complete for {raw_data.week_label}")
    return raw_data
