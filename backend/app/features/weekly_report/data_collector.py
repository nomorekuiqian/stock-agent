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
)
from app.features.liquidity.fred_service import get_all_liquidity_metrics
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar
from app.features.weekly_report.models import (
    WeeklyRawData,
    MarketPerformance,
)


# =============================================================================
# Market Performance - Weekly Change Calculation
# =============================================================================

# ETF symbols for weekly market performance
MARKET_INDICES = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq 100",
    "DIA": "Dow Jones",
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
    """
    Fetch weekly price change for indices, sectors, and style ETFs.
    Uses yf.download(period='5d') and calculates week-over-week change.

    This is a synchronous function (yfinance is sync).
    """
    all_symbols = list(MARKET_INDICES) + list(SECTOR_ETFS) + list(STYLE_ETFS)

    try:
        # Batch download 5 days of data for all symbols
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
            """Calculate weekly change for a single symbol."""
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


# =============================================================================
# Main Data Collection
# =============================================================================


async def collect_weekly_data() -> WeeklyRawData:
    """
    Collect all data needed for the weekly macro report.

    Calls existing services in parallel, plus fetches weekly market performance.
    Returns a WeeklyRawData object ready to be passed to the AI Agent.
    """
    print("[WeeklyCollector] Starting weekly data collection...")

    # Step 1: Fetch async data in parallel
    dashboard_task = get_macro_risk_dashboard()
    economy_task = get_economic_fundamentals()
    inflation_task = get_inflation_rates()
    liquidity_task = get_all_liquidity_metrics()

    # Step 2: Run sync functions in executor (yfinance, FMP calendar)
    loop = asyncio.get_event_loop()
    market_perf_task = loop.run_in_executor(None, _fetch_weekly_performance)
    econ_cal_task = loop.run_in_executor(None, get_economic_calendar, 14)
    earn_cal_task = loop.run_in_executor(None, get_earnings_calendar, 14)

    # Step 3: Await all results
    results = await asyncio.gather(
        dashboard_task,
        economy_task,
        inflation_task,
        liquidity_task,
        econ_cal_task,
        earn_cal_task,
        market_perf_task,
        return_exceptions=True,
    )

    dashboard, economy, inflation, liquidity, econ_cal, earn_cal, market_perf = results

    # Step 4: Handle errors gracefully - convert exceptions to None
    def _safe_dump(result, label: str):
        if isinstance(result, Exception):
            print(f"[WeeklyCollector] Error fetching {label}: {result}")
            return None
        if hasattr(result, "model_dump"):
            return result.model_dump()
        return result

    raw_data = WeeklyRawData(
        week_label=market_week_label(),
        collected_at=utc_now_iso(),
        macro_risk=_safe_dump(dashboard, "macro_risk"),
        economy=_safe_dump(economy, "economy"),
        inflation_rates=_safe_dump(inflation, "inflation_rates"),
        liquidity=_safe_dump(liquidity, "liquidity"),
        market_performance=(
            market_perf if isinstance(market_perf, MarketPerformance)
            else MarketPerformance()
        ),
        economic_calendar=(
            econ_cal.get("events", [])
            if isinstance(econ_cal, dict)
            else (econ_cal if not isinstance(econ_cal, Exception) else [])
        ),
        earnings_calendar=(
            earn_cal.get("earnings", [])
            if isinstance(earn_cal, dict)
            else (earn_cal if not isinstance(earn_cal, Exception) else [])
        ),
    )

    print(f"[WeeklyCollector] Data collection complete for {raw_data.week_label}")
    return raw_data
