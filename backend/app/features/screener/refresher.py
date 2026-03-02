"""
Screener universe refresher - fetches all US stocks via tvscreener.

Single API call fetches ~5,800 stocks x 65 fields in ~1.5 seconds.
Computes derived fields (52w position, analyst upside, market cap tier, etc.)
and stores everything in the screener_universe_cache.
"""

import asyncio
import math
from typing import Any

import pandas as pd

from app.core.logging import get_logger
from app.features.screener.db import set_cached, get_cached
from app.utils.timezone import utc_now_iso

logger = get_logger(__name__)

# TTL: 26 hours (refreshed daily, generous buffer for weekends)
TTL_HOURS = 26.0

# ---------------------------------------------------------------------------
# tvscreener column name -> snake_case mapping
# ---------------------------------------------------------------------------
COLUMN_MAPPING = {
    # "Symbol" is handled separately (reset_index + OTC filter)
    "Description": "name",
    "Sector": "sector",
    "Industry": "industry",
    "1-Year Beta": "beta_1y",
    # Price & Performance
    "Price": "price",
    "Change %": "daily_change",
    "Weekly Performance": "weekly_change",
    "Monthly Performance": "monthly_change",
    "3-Month Performance": "change_3m",
    "6-Month Performance": "change_6m",
    "YTD Performance": "ytd_change",
    "Yearly Performance": "yearly_change",
    "52 Week High": "high_52w",
    "52 Week Low": "low_52w",
    # Valuation
    "Market Capitalization": "market_cap",
    "Price to Earnings Ratio (TTM)": "pe_ttm",
    "Price to Book (MRQ)": "pb_mrq",
    "Price to Sales (FY)": "ps_fy",
    "Enterprise Value/EBITDA (TTM)": "ev_ebitda_ttm",
    "Enterprise Value (MRQ)": "ev_mrq",
    "PEG Ratio (TTM)": "peg_ttm",
    # Profitability
    "Gross Margin (TTM)": "gross_margin",
    "Operating Margin (TTM)": "operating_margin",
    "Net Margin (TTM)": "net_margin",
    "Return on Equity (TTM)": "roe",
    "Return on Assets (TTM)": "roa",
    "Return on Invested Capital (TTM)": "roic",
    # Growth
    "Revenue (TTM YoY Growth)": "revenue_growth_ttm",
    "Revenue (Quarterly YoY Growth)": "revenue_growth_quarterly",
    "EPS Diluted (TTM YoY Growth)": "eps_growth_ttm",
    "EPS Diluted (Quarterly YoY Growth)": "eps_growth_quarterly",
    "EBITDA (TTM YoY Growth)": "ebitda_growth_ttm",
    "Free Cash Flow (TTM YoY Growth)": "fcf_growth_ttm",
    "Total Revenue 5y Growth FY": "revenue_growth_5y",
    "Earnings per Share Diluted 5y Growth FY": "eps_growth_5y",
    # Dividends
    "Dividend Yield %": "dividend_yield",
    "Dividend Payout Ratio (TTM)": "payout_ratio",
    "Continuous Dividend Growth": "dividend_growth_years",
    "Continuous Dividend Payout": "dividend_payout_years",
    # Earnings & Cash Flow
    "EPS Diluted (TTM)": "eps_ttm",
    "Net Income (FY)": "net_income_fy",
    "Gross Profit (FY)": "gross_profit_fy",
    "Free Cash Flow Margin (TTM)": "fcf_margin",
    # Balance Sheet
    "Debt to Equity Ratio (MRQ)": "debt_to_equity",
    "Current Ratio (MRQ)": "current_ratio",
    "Cash & Equivalents (MRQ)": "cash_equivalents",
    # Volume
    "Volume": "volume",
    "Average Volume (30 day)": "avg_volume_30d",
    "Relative Volume": "relative_volume",
    # Shares
    "Total Shares Outstanding": "shares_outstanding",
    "Shares Float": "shares_float",
    "Free Float %": "float_pct",
    # Analyst
    "Target Price (Average)": "target_price_avg",
    "Price Target Median": "target_price_median",
    "Price Target High": "target_price_high",
    "Price Target Low": "target_price_low",
    "Analyst Rating": "analyst_rating",
    # Technical
    "Relative Strength Index (14)": "rsi",
    "MACD Level (12, 26)": "macd",
    "MACD Signal (12, 26)": "macd_signal",
    "Simple Moving Average (20)": "sma20",
    "Simple Moving Average (50)": "sma50",
    "Simple Moving Average (200)": "sma200",
    "Exponential Moving Average (20)": "ema20",
    "Exponential Moving Average (50)": "ema50",
    "Average True Range (14)": "atr",
    "Bollinger Upper Band (20)": "bb_upper",
    "Bollinger Lower Band (20)": "bb_lower",
    "Average Directional Index (14)": "adx",
    "Chaikin Money Flow (20)": "cmf",
    "Stochastic %K (14, 3, 3)": "stoch_k",
}


def _clean_nan(val):
    """Convert NaN/inf to None for JSON serialization."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def _fetch_universe_df() -> pd.DataFrame:
    """
    Fetch full US stock universe from tvscreener.
    Returns DataFrame with ~5,800 rows x 65+ columns.
    """
    from tvscreener import StockScreener
    from tvscreener.field.stock import StockField
    from tvscreener.core.stock import Market, SymbolType
    from tvscreener.filter import FilterOperator

    screener = StockScreener()
    screener.set_markets(Market.AMERICA)
    screener.set_symbol_types(SymbolType.COMMON_STOCK)
    screener.add_filter(
        StockField.MARKET_CAPITALIZATION,
        FilterOperator.ABOVE,
        100_000_000,
    )
    screener.select(
        # Identity
        StockField.DESCRIPTION,
        StockField.SECTOR,
        StockField.INDUSTRY,
        StockField.YEAR_BETA_1,
        # Price & Performance
        StockField.PRICE,
        StockField.CHANGE_PERCENT,
        StockField.WEEKLY_PERFORMANCE,
        StockField.MONTHLY_PERFORMANCE,
        StockField.MONTH_PERFORMANCE_3,
        StockField.MONTH_PERFORMANCE_6,
        StockField.YTD_PERFORMANCE,
        StockField.YEARLY_PERFORMANCE,
        StockField.WEEK_HIGH_52,
        StockField.WEEK_LOW_52,
        # Valuation
        StockField.MARKET_CAPITALIZATION,
        StockField.PRICE_TO_EARNINGS_RATIO_TTM,
        StockField.PRICE_TO_BOOK_MRQ,
        StockField.PRICE_TO_SALES_FY,
        StockField.ENTERPRISE_VALUEEBITDA_TTM,
        StockField.ENTERPRISE_VALUE_MRQ,
        StockField.PRICE_EARNINGS_GROWTH_TTM,
        # Profitability
        StockField.GROSS_MARGIN_TTM,
        StockField.OPERATING_MARGIN_TTM,
        StockField.NET_MARGIN_TTM,
        StockField.RETURN_ON_EQUITY_TTM,
        StockField.RETURN_ON_ASSETS_TTM,
        StockField.RETURN_ON_INVESTED_CAPITAL_TTM,
        # Growth
        StockField.REVENUE_TTM_YOY_GROWTH,
        StockField.REVENUE_QUARTERLY_YOY_GROWTH,
        StockField.EPS_DILUTED_TTM_YOY_GROWTH,
        StockField.EPS_DILUTED_QUARTERLY_YOY_GROWTH,
        StockField.EBITDA_TTM_YOY_GROWTH,
        StockField.FREE_CASH_FLOW_TTM_YOY_GROWTH,
        StockField.TOTAL_REVENUE_5Y_GROWTH_FY,
        StockField.EARNINGS_PER_SHARE_DILUTED_5Y_GROWTH_FY,
        # Dividends
        StockField.DIVIDENDS_YIELD,
        StockField.DIVIDEND_PAYOUT_RATIO_TTM,
        StockField.CONTINUOUS_DIVIDEND_GROWTH,
        StockField.CONTINUOUS_DIVIDEND_PAYOUT,
        # Earnings & Cash Flow
        StockField.EPS_DILUTED_TTM,
        StockField.NET_INCOME_FY,
        StockField.GROSS_PROFIT_FY,
        StockField.FREE_CASH_FLOW_MARGIN_TTM,
        # Balance Sheet
        StockField.DEBT_TO_EQUITY_RATIO_MRQ,
        StockField.CURRENT_RATIO_MRQ,
        StockField.CASH_AND_EQUIVALENTS_MRQ,
        # Volume
        StockField.VOLUME,
        StockField.AVERAGE_VOLUME_30_DAY,
        StockField.RELATIVE_VOLUME,
        # Shares
        StockField.TOTAL_SHARES_OUTSTANDING,
        StockField.SHARES_FLOAT,
        StockField.FLOAT_SHARES_PERCENT_CURRENT,
        # Analyst
        StockField.PRICE_TARGET_AVERAGE,
        StockField.PRICE_TARGET_MEDIAN,
        StockField.PRICE_TARGET_HIGH,
        StockField.PRICE_TARGET_LOW,
        StockField.RECOMMENDATION_MARK,
        # Technical
        StockField.RELATIVE_STRENGTH_INDEX_14,
        StockField.MACD_LEVEL_12_26,
        StockField.MACD_SIGNAL_12_26,
        StockField.SIMPLE_MOVING_AVERAGE_20,
        StockField.SIMPLE_MOVING_AVERAGE_50,
        StockField.SIMPLE_MOVING_AVERAGE_200,
        StockField.EXPONENTIAL_MOVING_AVERAGE_20,
        StockField.EXPONENTIAL_MOVING_AVERAGE_50,
        StockField.AVERAGE_TRUE_RANGE_14,
        StockField.BOLLINGER_UPPER_BAND_20,
        StockField.BOLLINGER_LOWER_BAND_20,
        StockField.AVERAGE_DIRECTIONAL_INDEX_14,
        StockField.CHAIKIN_MONEY_FLOW_20,
        StockField.STOCHASTIC_PERCENTK_14_3_3,
    )
    screener.set_range(0, 10000)

    return screener.get()


def _add_derived_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Add computed derived columns to the DataFrame."""
    # Distance from 52-week high (%)
    high_low_range = df["high_52w"] - df["low_52w"]
    df["pct_from_52w_high"] = (
        (df["price"] - df["high_52w"]) / df["high_52w"] * 100
    ).where(df["high_52w"].notna() & (df["high_52w"] != 0))

    # 52-week position (0 = at low, 1 = at high)
    df["position_52w"] = (
        (df["price"] - df["low_52w"]) / high_low_range
    ).where(high_low_range.notna() & (high_low_range != 0))

    # Above key moving averages
    df["above_sma200"] = df["price"] > df["sma200"]
    df["above_sma50"] = df["price"] > df["sma50"]

    # Analyst upside (%)
    df["analyst_upside"] = (
        (df["target_price_avg"] - df["price"]) / df["price"] * 100
    ).where(df["price"].notna() & (df["price"] != 0) & df["target_price_avg"].notna())

    # Market cap tier
    df["market_cap_tier"] = pd.cut(
        df["market_cap"],
        bins=[0, 2e9, 10e9, 200e9, float("inf")],
        labels=["small", "mid", "large", "mega"],
    )

    return df


def _compute_sector_stats(df: pd.DataFrame) -> list[dict]:
    """Compute aggregate statistics per sector."""
    if "sector" not in df.columns or df["sector"].isna().all():
        return []

    stats = []
    for sector, group in df.groupby("sector", dropna=True):
        stat = {
            "sector": sector,
            "stock_count": len(group),
            "avg_daily_change": _clean_nan(group["daily_change"].mean()),
            "avg_weekly_change": _clean_nan(group["weekly_change"].mean()),
            "avg_monthly_change": _clean_nan(group["monthly_change"].mean()),
            "avg_ytd_change": _clean_nan(group["ytd_change"].mean()),
            "avg_pe": _clean_nan(group["pe_ttm"].median()),
            "avg_roe": _clean_nan(group["roe"].median()),
            "avg_revenue_growth": _clean_nan(group["revenue_growth_ttm"].median()),
            "total_market_cap": _clean_nan(group["market_cap"].sum()),
            "avg_rsi": _clean_nan(group["rsi"].mean()),
        }
        stats.append(stat)

    # Sort by average daily change descending
    stats.sort(key=lambda s: s.get("avg_daily_change") or -999, reverse=True)
    return stats


async def _safe_set(key: str, data: Any, source: str, ttl: float) -> bool:
    """Write to DB cache, log errors but don't raise."""
    try:
        ok = await set_cached(key, data, source, ttl)
        if ok:
            logger.info("Cached %s", key)
        else:
            logger.error("FAILED to cache %s", key)
        return ok
    except Exception as e:
        logger.error("Error caching %s: %s", key, e)
        return False


async def _safe_set_with_error(key: str, source: str, ttl: float, error: str) -> None:
    """Record a fetch failure in DB - keep old data, update error field."""
    try:
        existing = await get_cached(key)
        old_data = existing.get("data") if existing else None
        await set_cached(key, old_data, source, min(ttl, 1.0), error=error)
    except Exception:
        pass


async def refresh_universe() -> dict:
    """
    Fetch full US stock universe from tvscreener and cache results.

    Returns dict with refresh results summary.
    """
    results = {}

    try:
        logger.info("Starting screener universe refresh via tvscreener...")

        # Fetch data in thread (tvscreener is synchronous)
        df = await asyncio.to_thread(_fetch_universe_df)
        logger.info("tvscreener returned %d stocks x %d columns", len(df), len(df.columns))

        if df.empty:
            await _safe_set_with_error(
                "screener:universe", "tvscreener", TTL_HOURS, "Empty result"
            )
            return {"success": False, "error": "tvscreener returned empty DataFrame"}

        # Extract symbol from index (format: "EXCHANGE:TICKER")
        df = df.reset_index()
        df = df.rename(columns={"Symbol": "symbol"})

        # Filter out OTC stocks - not tradeable for most retail users
        # Symbol format: "OTC:XXXX", "NASDAQ:AAPL", "NYSE:MSFT", etc.
        otc_mask = df["symbol"].str.startswith("OTC:")
        otc_count = otc_mask.sum()
        df = df[~otc_mask].copy()
        logger.info(
            "Filtered out %d OTC stocks, %d tradeable stocks remaining",
            otc_count, len(df),
        )

        # Rename columns to snake_case
        df = df.rename(columns=COLUMN_MAPPING)

        # Add derived fields
        df = _add_derived_fields(df)

        # Convert market_cap_tier from Categorical to string for JSON
        if "market_cap_tier" in df.columns:
            df["market_cap_tier"] = df["market_cap_tier"].astype(str)
            df.loc[df["market_cap_tier"] == "nan", "market_cap_tier"] = None

        # Convert to JSON-safe list of dicts
        # Use pandas .to_json() roundtrip to properly convert NaN/NaT to None
        import json
        universe = json.loads(df.to_json(orient="records", default_handler=str))

        # Compute sector statistics
        sector_stats = _compute_sector_stats(df)

        # Split universe into chunks (~500 stocks each, ~1.1MB per chunk)
        # to stay within Edge Function / JSONB size limits
        chunk_size = 500
        chunks = [
            universe[i:i + chunk_size]
            for i in range(0, len(universe), chunk_size)
        ]
        num_chunks = len(chunks)

        # Write chunks to cache with small delay to avoid overloading
        chunk_results = {}
        for idx, chunk in enumerate(chunks):
            key = f"screener:universe:{idx}"
            ok = await _safe_set(key, chunk, "tvscreener", TTL_HOURS)
            chunk_results[key] = ok
            if idx < num_chunks - 1:
                await asyncio.sleep(0.5)

        all_chunks_ok = all(chunk_results.values())

        # Meta info (includes chunk count for reader)
        meta = {
            "stock_count": len(universe),
            "field_count": len(df.columns),
            "sectors": len(sector_stats),
            "chunk_count": num_chunks,
            "chunk_size": chunk_size,
            "refreshed_at": utc_now_iso(),
        }

        ok_sectors = await _safe_set(
            "screener:sector_stats", sector_stats, "computed", TTL_HOURS
        )
        ok_meta = await _safe_set(
            "screener:meta", meta, "computed", TTL_HOURS
        )

        results = {
            "success": all_chunks_ok,
            "stock_count": len(universe),
            "field_count": len(df.columns),
            "sector_count": len(sector_stats),
            "chunk_count": num_chunks,
            "cache_writes": {
                **chunk_results,
                "screener:sector_stats": ok_sectors,
                "screener:meta": ok_meta,
            },
        }

    except Exception as e:
        logger.exception("Screener universe refresh failed")
        await _safe_set_with_error(
            "screener:universe", "tvscreener", TTL_HOURS, str(e)
        )
        results = {"success": False, "error": str(e)}

    return results
