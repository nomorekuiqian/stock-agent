"""
Market Data Tools for Macro Agent
Provides unified data fetching functions and ticker configurations.
"""

import math
from datetime import datetime
import yfinance as yf
import pandas as pd

from app.services.fmp_service import get_fmp_service


# =============================================================================
# Ticker Configuration - All market data sources
# =============================================================================

EQUITY_TICKERS = {
    "S&P 500": "^GSPC",
    "Nasdaq": "^IXIC",
    "Dow Jones": "^DJI",
    "Russell 2000": "^RUT",  # Small-cap index
    "S&P 400": "^MID",  # Mid-cap index
}

VOLATILITY_TICKERS = {
    "VIX": "^VIX",
}

YIELD_TICKERS = {
    "3M": "^IRX",   # 3-Month Treasury Bill
    "5Y": "^FVX",   # 5-Year Treasury
    "10Y": "^TNX",  # 10-Year Treasury
    "30Y": "^TYX",  # 30-Year Treasury
}

CREDIT_TICKERS = {
    "HYG": "HYG",   # High Yield Corporate Bond ETF
    "LQD": "LQD",   # Investment Grade Corporate Bond ETF
}

FINANCIAL_TICKERS = {
    "XLF": "XLF",   # Financial Select Sector SPDR
    "KRE": "KRE",   # Regional Banking ETF
}

COMMODITY_TICKERS = {
    "Gold": "GLD",
    "Oil": "USO",
}

CURRENCY_TICKERS = {
    "US Dollar": "DX-Y.NYB",
}

# Combined for single download
ALL_TICKERS = {
    **EQUITY_TICKERS,
    **VOLATILITY_TICKERS,
    **YIELD_TICKERS,
    **CREDIT_TICKERS,
    **FINANCIAL_TICKERS,
    **COMMODITY_TICKERS,
    **CURRENCY_TICKERS,
}


# =============================================================================
# Helper Functions
# =============================================================================


def safe_float(value, default=0.0):
    """Convert to float, handling NaN and None"""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    try:
        result = float(value)
        return default if math.isnan(result) else result
    except (ValueError, TypeError):
        return default


def _extract_asset_data(data: pd.DataFrame, name: str, symbol: str) -> dict | None:
    """Helper to extract price data for a single asset. Pure data, no interpretation."""
    try:
        if isinstance(data.columns, pd.MultiIndex):
            if symbol not in data["Close"].columns:
                return None
            series = data["Close"][symbol].dropna()
        else:
            series = data["Close"].dropna()

        if len(series) < 5:
            return None

        current = safe_float(series.iloc[-1])
        prev = safe_float(series.iloc[-2]) if len(series) > 1 else current
        week_ago = safe_float(series.iloc[-5]) if len(series) >= 5 else current
        month_ago = safe_float(series.iloc[0])

        if current <= 0:
            return None

        daily_change = ((current - prev) / prev) * 100 if prev != 0 else 0
        week_change = ((current - week_ago) / week_ago) * 100 if week_ago != 0 else 0
        month_change = ((current - month_ago) / month_ago) * 100 if month_ago != 0 else 0

        return {
            "value": round(current, 2),
            "daily_change": round(daily_change, 2),
            "week_change": round(week_change, 2),
            "month_change": round(month_change, 2),
        }
    except Exception as e:
        print(f"Error extracting {name}: {e}")
        return None


# =============================================================================
# Unified Data Fetching Tool
# =============================================================================


def get_all_market_data() -> dict:
    """
    Fetch all market data in a single call for efficiency.
    Only fetches and formats data - NO interpretation logic.

    Returns structured data covering:
    - equities: S&P 500, Nasdaq, Dow Jones
    - volatility: VIX
    - rates: Treasury yield curve (3M, 5Y, 10Y, 30Y) with spreads
    - credit: HYG, LQD
    - financials: XLF, KRE
    - commodities: Gold, Oil
    - currencies: US Dollar Index
    """
    print("🔧 [TOOL CALLED] get_all_market_data()")

    try:
        # Single download for all tickers - 1 month for trend analysis
        data = yf.download(
            list(ALL_TICKERS.values()),
            period="1mo",
            progress=False
        )

        result = {
            "equities": {},
            "volatility": {},
            "rates": {"yield_curve": {}, "spreads": {}},
            "credit": {},
            "financials": {},
            "commodities": {},
            "currencies": {},
        }

        # === Equities ===
        for name, symbol in EQUITY_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["equities"][name] = asset_data

        # === Volatility (VIX) ===
        for name, symbol in VOLATILITY_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["volatility"][name] = asset_data

        # === Rates (Yield Curve) - FMP primary, yfinance fallback ===
        rates_source = "yfinance"  # default
        try:
            fmp = get_fmp_service()
            fmp_rates = fmp.get_treasury_rates()

            if fmp_rates and fmp_rates.get("rates") and not fmp_rates.get("error"):
                # FMP success - use full 12-point yield curve
                rates_source = "fmp"
                result["rates"]["yield_curve"] = {}
                result["rates"]["date"] = fmp_rates.get("date")
                result["rates"]["source"] = "fmp"
                result["rates"]["yield_curve_shape"] = fmp_rates.get("yield_curve_shape", "unknown")

                for tenor, rate in fmp_rates["rates"].items():
                    if rate is not None:
                        result["rates"]["yield_curve"][tenor] = {
                            "rate": rate,
                            "daily_change": None,  # FMP doesn't provide daily change
                        }

                # Use FMP's pre-calculated spreads
                result["rates"]["spreads"] = fmp_rates.get("spreads", {})
                print(f"✅ [FMP] Treasury rates loaded: {len(fmp_rates['rates'])} maturities")
            else:
                raise ValueError("FMP returned empty or error response")

        except Exception as e:
            print(f"⚠️ FMP Treasury rates failed, falling back to yfinance: {e}")
            # Fallback to yfinance
            rates = {}
            for name, symbol in YIELD_TICKERS.items():
                asset_data = _extract_asset_data(data, name, symbol)
                if asset_data:
                    rates[name] = asset_data["value"]
                    result["rates"]["yield_curve"][name] = {
                        "rate": asset_data["value"],
                        "daily_change": asset_data["daily_change"],
                    }

            # Calculate spreads (pure math, no interpretation)
            spread_10y_3m = None
            spread_10y_5y = None
            spread_30y_10y = None
            if "10Y" in rates and "3M" in rates:
                spread_10y_3m = round(rates["10Y"] - rates["3M"], 3)
            if "10Y" in rates and "5Y" in rates:
                spread_10y_5y = round(rates["10Y"] - rates["5Y"], 3)
            if "30Y" in rates and "10Y" in rates:
                spread_30y_10y = round(rates["30Y"] - rates["10Y"], 3)

            result["rates"]["spreads"] = {
                "10y_3m": spread_10y_3m,
                "10y_5y": spread_10y_5y,
                "30y_10y": spread_30y_10y,
            }
            result["rates"]["source"] = "yfinance"
            result["rates"]["yield_curve_shape"] = "unknown"  # yfinance doesn't have enough data points

        # === Credit (HYG, LQD) ===
        for name, symbol in CREDIT_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["credit"][name] = asset_data

        # Calculate HYG-LQD spread (pure math)
        if "HYG" in result["credit"] and "LQD" in result["credit"]:
            hyg_perf = result["credit"]["HYG"]["week_change"]
            lqd_perf = result["credit"]["LQD"]["week_change"]
            result["credit"]["hyg_lqd_spread"] = round(hyg_perf - lqd_perf, 2)

        # === Financials (XLF, KRE) ===
        for name, symbol in FINANCIAL_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["financials"][name] = asset_data

        # === Commodities ===
        for name, symbol in COMMODITY_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["commodities"][name] = asset_data

        # === Currencies ===
        for name, symbol in CURRENCY_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["currencies"][name] = asset_data

        # Add date/time context for the analyst
        now = datetime.now()
        result["report_date"] = {
            "date": now.strftime("%Y-%m-%d"),
            "weekday": now.strftime("%A"),
            "time": now.strftime("%H:%M"),
            "formatted": now.strftime("%Y年%m月%d日 %A"),
        }

        result["status"] = "success"
        return result

    except Exception as e:
        print(f"Error fetching market data: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "equities": {},
            "volatility": {},
            "rates": {"yield_curve": {}, "spreads": {}},
            "credit": {},
            "financials": {},
            "commodities": {},
            "currencies": {},
        }
