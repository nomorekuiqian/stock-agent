"""
Market Data Tools for Market Agent
Provides unified data fetching functions and ticker configurations.
"""

import math
import yfinance as yf
import pandas as pd

from app.core.logging import get_logger
from app.shared.fmp_service import get_fmp_service
from app.utils.timezone import now_pacific, format_date, format_date_chinese

logger = get_logger(__name__)


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

# Commodities now fetched from FMP for spot prices (not ETFs)
# GCUSD = Gold spot, BZUSD = Brent Crude Oil (CLUSD/WTI requires higher FMP tier)
COMMODITY_TICKERS = {}  # Empty - commodities fetched separately via FMP

CURRENCY_TICKERS = {
    "US Dollar": "DX-Y.NYB",
}

# Pre-market / global market tickers for morning report
FUTURES_TICKERS = {
    "S&P 500 Futures": "ES=F",
    "Nasdaq Futures": "NQ=F",
    "Dow Futures": "YM=F",
}

ASIA_TICKERS = {
    "Nikkei 225": "^N225",
    "Hang Seng": "^HSI",
    "Shanghai Composite": "000001.SS",
}

EUROPE_TICKERS = {
    "DAX": "^GDAXI",
    "FTSE 100": "^FTSE",
}

CRYPTO_TICKERS_PREMARKET = {
    "BTC": "BTC-USD",
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
    """
    Helper to extract price data for a single asset with historical context.
    Provides current value, historical values, changes, and trend indicators.
    """
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

        # Calculate percentage changes
        daily_change = ((current - prev) / prev) * 100 if prev != 0 else 0
        week_change = ((current - week_ago) / week_ago) * 100 if week_ago != 0 else 0
        month_change = ((current - month_ago) / month_ago) * 100 if month_ago != 0 else 0

        # Calculate 1-month high/low for context
        high_1mo = safe_float(series.max())
        low_1mo = safe_float(series.min())

        # Determine trend based on recent price action
        # Compare current vs week_ago and week_ago vs 2 weeks ago (if available)
        two_weeks_ago = safe_float(series.iloc[-10]) if len(series) >= 10 else week_ago
        recent_trend = current - week_ago
        prior_trend = week_ago - two_weeks_ago

        if week_change > 2:
            trend = "up"
        elif week_change < -2:
            trend = "down"
        else:
            trend = "flat"

        # Calculate position in 1-month range (0-100%)
        range_size = high_1mo - low_1mo
        if range_size > 0:
            position_in_range = round(((current - low_1mo) / range_size) * 100, 1)
        else:
            position_in_range = 50.0

        return {
            "value": round(current, 2),
            "previous_close": round(prev, 2),
            "week_ago": round(week_ago, 2),
            "high_1mo": round(high_1mo, 2),
            "low_1mo": round(low_1mo, 2),
            "daily_change": round(daily_change, 2),
            "week_change": round(week_change, 2),
            "month_change": round(month_change, 2),
            "trend": trend,
            "position_in_range": position_in_range,
        }
    except Exception as e:
        logger.error("Error extracting %s: %s", name, e)
        return None


# =============================================================================
# Standalone Data Methods (for consumers that need partial data)
# =============================================================================


def get_treasury_rates() -> dict:
    """
    Get treasury yield curve with daily changes.
    Delegates to fmp_service.get_treasury_rates_with_change().
    """
    fmp = get_fmp_service()
    return fmp.get_treasury_rates_with_change()


def get_commodity_quotes(symbols: list[str] | None = None) -> dict:
    """
    Get commodity spot prices (default: gold + oil).
    Delegates to fmp_service.get_commodity_quotes().
    """
    fmp = get_fmp_service()
    return fmp.get_commodity_quotes(symbols)


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
    logger.info("get_all_market_data()")

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
            # Use the new method that calculates daily change in basis points
            fmp_rates = fmp.get_treasury_rates_with_change()

            if fmp_rates and fmp_rates.get("rates") and not fmp_rates.get("error"):
                # FMP success - use full 12-point yield curve with daily changes
                rates_source = "fmp"
                result["rates"]["yield_curve"] = {}
                result["rates"]["date"] = fmp_rates.get("date")
                result["rates"]["prev_date"] = fmp_rates.get("prev_date")
                result["rates"]["source"] = "fmp"
                result["rates"]["yield_curve_shape"] = fmp_rates.get("yield_curve_shape", "unknown")

                for tenor, rate_data in fmp_rates["rates"].items():
                    if rate_data is not None:
                        result["rates"]["yield_curve"][tenor] = {
                            "rate": rate_data.get("rate"),
                            "daily_change_bps": rate_data.get("daily_change_bps"),
                        }

                # Use FMP's pre-calculated spreads
                result["rates"]["spreads"] = fmp_rates.get("spreads", {})
                logger.info("Treasury rates loaded: %d maturities, prev_date=%s", len(fmp_rates['rates']), fmp_rates.get('prev_date'))
            else:
                raise ValueError("FMP returned empty or error response")

        except Exception as e:
            logger.warning("FMP Treasury rates failed, falling back to yfinance: %s", e)
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
        # Strategy: FMP real-time spot price + yfinance historical for week/month changes
        # FMP provides accurate daily change (price vs previousClose)
        # yfinance provides historical data for trend analysis
        try:
            fmp = get_fmp_service()
            # XAUUSD = Gold Spot, BZUSD = Brent Oil
            fmp_symbols = {"Gold": "XAUUSD", "Oil": "BZUSD"}
            yf_symbols = {"Gold": "GC=F", "Oil": "BZ=F"}

            # 1. Get FMP real-time quotes for spot price and daily change
            quotes_result = fmp.get_commodity_quotes(list(fmp_symbols.values()))
            fmp_data = {}
            if quotes_result.get("status") == "success":
                fmp_data = quotes_result.get("commodities", {})

            # 2. Get yfinance historical data for week/month changes
            yf_historical = {}
            try:
                commodity_data = yf.download(
                    list(yf_symbols.values()),
                    period="1mo",
                    progress=False
                )
                for name, symbol in yf_symbols.items():
                    asset_data = _extract_asset_data(commodity_data, name, symbol)
                    if asset_data:
                        yf_historical[name] = asset_data
            except Exception as yf_err:
                logger.error("Commodity historical error: %s", yf_err)

            # 3. Combine FMP spot price with yfinance historical data
            for name in ["Gold", "Oil"]:
                fmp_quote = fmp_data.get(name)
                yf_data = yf_historical.get(name)

                # Prefer FMP for current price and daily change
                if fmp_quote and fmp_quote.get("price"):
                    current_price = safe_float(fmp_quote.get("price"))
                    prev_close = safe_float(fmp_quote.get("previousClose"))

                    if current_price <= 0:
                        continue

                    # Calculate daily change (FMP spot price vs previousClose)
                    daily_change = 0.0
                    if prev_close and prev_close > 0:
                        daily_change = ((current_price - prev_close) / prev_close) * 100

                    # Use yfinance for week/month changes (futures track spot closely)
                    week_change = yf_data.get("week_change", 0.0) if yf_data else 0.0
                    month_change = yf_data.get("month_change", 0.0) if yf_data else 0.0
                    week_ago = yf_data.get("week_ago") if yf_data else None
                    high_1mo = yf_data.get("high_1mo", current_price) if yf_data else current_price
                    low_1mo = yf_data.get("low_1mo", current_price) if yf_data else current_price
                    trend = yf_data.get("trend", "flat") if yf_data else "flat"
                    position_in_range = yf_data.get("position_in_range", 50.0) if yf_data else 50.0

                    result["commodities"][name] = {
                        "value": round(current_price, 2),
                        "previous_close": round(prev_close, 2) if prev_close else None,
                        "week_ago": round(week_ago, 2) if week_ago else None,
                        "high_1mo": round(high_1mo, 2),
                        "low_1mo": round(low_1mo, 2),
                        "daily_change": round(daily_change, 2),
                        "week_change": round(week_change, 2),
                        "month_change": round(month_change, 2),
                        "trend": trend,
                        "position_in_range": position_in_range,
                        "source": "fmp_spot",
                    }
                elif yf_data:
                    # Fallback to yfinance only
                    yf_data["source"] = "yfinance_futures"
                    result["commodities"][name] = yf_data

            logger.info("Commodities loaded: %s", list(result['commodities'].keys()))

        except Exception as e:
            logger.error("Commodities error: %s", e)
            # Full fallback to yfinance futures
            try:
                yf_commodities = {"Gold": "GC=F", "Oil": "BZ=F"}
                commodity_data = yf.download(
                    list(yf_commodities.values()),
                    period="1mo",
                    progress=False
                )
                for name, symbol in yf_commodities.items():
                    asset_data = _extract_asset_data(commodity_data, name, symbol)
                    if asset_data:
                        asset_data["source"] = "yfinance_futures_fallback"
                        result["commodities"][name] = asset_data
                logger.info("yfinance fallback commodities loaded: %s", list(result['commodities'].keys()))
            except Exception as yf_err:
                logger.error("yfinance fallback commodities error: %s", yf_err)

        # === Currencies ===
        for name, symbol in CURRENCY_TICKERS.items():
            asset_data = _extract_asset_data(data, name, symbol)
            if asset_data:
                result["currencies"][name] = asset_data

        # Add date/time context for the analyst (Pacific timezone)
        now = now_pacific()
        result["report_date"] = {
            "date": format_date(now, "%Y-%m-%d"),
            "weekday": format_date(now, "%A"),
            "time": format_date(now, "%H:%M"),
            "formatted": format_date_chinese(now),
        }

        result["status"] = "success"
        return result

    except Exception as e:
        logger.exception("Error fetching market data: %s", e)
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


# =============================================================================
# Stock Quotes for User Watchlist (PersonalDigest)
# =============================================================================


def get_stock_quotes(symbols: list[str]) -> dict:
    """
    Fetch real-time quotes for user's watchlist stocks.

    Args:
        symbols: List of ticker symbols (e.g., ["AAPL", "MSFT", "NVDA"])

    Returns:
        {
            "status": "success",
            "stocks": {
                "AAPL": {
                    "name": "Apple Inc.",
                    "price": 195.50,
                    "previous_close": 193.05,
                    "daily_change": 1.27,
                    "week_change": 3.50,
                    "month_change": -2.10,
                    "day_high": 196.20,
                    "day_low": 194.10,
                    "week_high": 198.00,
                    "week_low": 190.50,
                    "pe_ratio": 29.5,
                    "market_cap": 3000000000000,
                    "avg_volume": 54500000,
                    "52_week_high": 199.62,
                    "52_week_low": 164.08,
                },
                ...
            }
        }
    """
    logger.info("get_stock_quotes(%s)", symbols)

    if not symbols:
        return {"status": "error", "error": "No symbols provided", "stocks": {}}

    # Limit to 20 stocks max
    symbols = symbols[:20]

    try:
        # Download 1 month of data for trend analysis
        data = yf.download(
            symbols,
            period="1mo",
            progress=False,
            group_by="ticker" if len(symbols) > 1 else None,
        )

        # Get ticker info for names and fundamentals
        tickers = yf.Tickers(" ".join(symbols))

        result = {"status": "success", "stocks": {}}

        for symbol in symbols:
            try:
                # Extract price data
                if len(symbols) == 1:
                    # Single ticker - data is not grouped
                    series = data["Close"].dropna()
                else:
                    # Multiple tickers - data is grouped by ticker
                    if symbol not in data.columns.get_level_values(0):
                        continue
                    series = data[symbol]["Close"].dropna()

                if len(series) < 5:
                    continue

                current = safe_float(series.iloc[-1])
                prev = safe_float(series.iloc[-2]) if len(series) > 1 else current
                week_ago = safe_float(series.iloc[-5]) if len(series) >= 5 else current
                month_ago = safe_float(series.iloc[0])

                if current <= 0:
                    continue

                # Calculate changes
                daily_change = ((current - prev) / prev) * 100 if prev != 0 else 0
                week_change = ((current - week_ago) / week_ago) * 100 if week_ago != 0 else 0
                month_change = ((current - month_ago) / month_ago) * 100 if month_ago != 0 else 0

                # Get high/low from series
                if len(symbols) == 1:
                    high_series = data["High"].dropna()
                    low_series = data["Low"].dropna()
                else:
                    high_series = data[symbol]["High"].dropna()
                    low_series = data[symbol]["Low"].dropna()

                day_high = safe_float(high_series.iloc[-1]) if len(high_series) > 0 else current
                day_low = safe_float(low_series.iloc[-1]) if len(low_series) > 0 else current

                # Week high/low (last 5 days)
                week_high = safe_float(high_series.iloc[-5:].max()) if len(high_series) >= 5 else day_high
                week_low = safe_float(low_series.iloc[-5:].min()) if len(low_series) >= 5 else day_low

                # Get ticker info for name and fundamentals
                ticker_info = {}
                try:
                    ticker = tickers.tickers.get(symbol)
                    if ticker:
                        ticker_info = ticker.info or {}
                except Exception:
                    pass

                result["stocks"][symbol] = {
                    "name": ticker_info.get("shortName", ticker_info.get("longName", symbol)),
                    "price": round(current, 2),
                    "previous_close": round(prev, 2),
                    "daily_change": round(daily_change, 2),
                    "week_change": round(week_change, 2),
                    "month_change": round(month_change, 2),
                    "day_high": round(day_high, 2),
                    "day_low": round(day_low, 2),
                    "week_high": round(week_high, 2),
                    "week_low": round(week_low, 2),
                    "pe_ratio": safe_float(ticker_info.get("trailingPE"), None),
                    "market_cap": ticker_info.get("marketCap"),
                    "avg_volume": ticker_info.get("averageVolume"),
                    "52_week_high": safe_float(ticker_info.get("fiftyTwoWeekHigh"), None),
                    "52_week_low": safe_float(ticker_info.get("fiftyTwoWeekLow"), None),
                }

            except Exception as e:
                logger.error("Error processing %s: %s", symbol, e)
                continue

        logger.info("Loaded %d stocks: %s", len(result['stocks']), list(result['stocks'].keys()))
        return result

    except Exception as e:
        logger.exception("Error fetching stock quotes: %s", e)
        return {"status": "error", "error": str(e), "stocks": {}}


# =============================================================================
# Pre-market Data for Morning Report
# =============================================================================


def get_premarket_data() -> dict:
    """
    Fetch pre-market data for the morning report: futures, global markets, and key assets.
    Uses yf.download() with 5-day period and reuses _extract_asset_data().

    Returns:
        {
            "futures": {"S&P 500 Futures": {...}, ...},
            "global_markets": {
                "asia": {"Nikkei 225": {...}, ...},
                "europe": {"DAX": {...}, ...},
                "other": {"Gold": {...}, "US Dollar": {...}, "BTC": {...}, "VIX": {...}},
            },
            "status": "success",
        }
    """
    logger.info("get_premarket_data()")

    try:
        # Combine all tickers for a single download
        all_premarket = {
            **FUTURES_TICKERS,
            **ASIA_TICKERS,
            **EUROPE_TICKERS,
            **VOLATILITY_TICKERS,
            **CURRENCY_TICKERS,
            **CRYPTO_TICKERS_PREMARKET,
        }

        data = yf.download(
            list(all_premarket.values()),
            period="1mo",
            progress=False,
        )

        result = {
            "futures": {},
            "global_markets": {
                "asia": {},
                "europe": {},
                "other": {},
            },
        }

        # Futures
        for name, symbol in FUTURES_TICKERS.items():
            asset = _extract_asset_data(data, name, symbol)
            if asset:
                result["futures"][name] = {
                    "value": asset["value"],
                    "daily_change": asset["daily_change"],
                }

        # Asia
        for name, symbol in ASIA_TICKERS.items():
            asset = _extract_asset_data(data, name, symbol)
            if asset:
                result["global_markets"]["asia"][name] = {
                    "value": asset["value"],
                    "daily_change": asset["daily_change"],
                }

        # Europe
        for name, symbol in EUROPE_TICKERS.items():
            asset = _extract_asset_data(data, name, symbol)
            if asset:
                result["global_markets"]["europe"][name] = {
                    "value": asset["value"],
                    "daily_change": asset["daily_change"],
                }

        # Other key assets: Gold, Oil, USD, BTC, VIX
        # Gold and Oil via FMP spot (same pattern as get_all_market_data)
        fmp = get_fmp_service()
        try:
            gold_result = fmp.get_commodity_quotes(["XAUUSD"])
            gold_data = gold_result.get("commodities", {}).get("Gold")
            if gold_data and gold_data.get("price"):
                price = safe_float(gold_data["price"])
                prev = safe_float(gold_data.get("previousClose"))
                change = ((price - prev) / prev * 100) if prev > 0 else 0.0
                result["global_markets"]["other"]["Gold"] = {
                    "value": round(price, 2),
                    "daily_change": round(change, 2),
                }
        except Exception as e:
            logger.warning("FMP gold fetch failed for premarket: %s", e)

        # Oil via FMP spot (Brent Crude, same pattern as Gold)
        try:
            oil_result = fmp.get_commodity_quotes(["BZUSD"])
            oil_data = oil_result.get("commodities", {}).get("Oil")
            if oil_data and oil_data.get("price"):
                price = safe_float(oil_data["price"])
                prev = safe_float(oil_data.get("previousClose"))
                change = ((price - prev) / prev * 100) if prev > 0 else 0.0
                result["global_markets"]["other"]["Crude Oil"] = {
                    "value": round(price, 2),
                    "daily_change": round(change, 2),
                }
        except Exception as e:
            logger.warning("FMP oil fetch failed for premarket: %s", e)

        # USD, VIX from yf data
        for name, symbol in {**CURRENCY_TICKERS, **VOLATILITY_TICKERS}.items():
            asset = _extract_asset_data(data, name, symbol)
            if asset:
                result["global_markets"]["other"][name] = {
                    "value": asset["value"],
                    "daily_change": asset["daily_change"],
                }

        # BTC
        for name, symbol in CRYPTO_TICKERS_PREMARKET.items():
            asset = _extract_asset_data(data, name, symbol)
            if asset:
                result["global_markets"]["other"][name] = {
                    "value": asset["value"],
                    "daily_change": asset["daily_change"],
                }

        result["status"] = "success"
        logger.info(
            "Premarket data: futures=%d, asia=%d, europe=%d, other=%d",
            len(result["futures"]),
            len(result["global_markets"]["asia"]),
            len(result["global_markets"]["europe"]),
            len(result["global_markets"]["other"]),
        )
        return result

    except Exception as e:
        logger.exception("Error fetching premarket data: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "futures": {},
            "global_markets": {"asia": {}, "europe": {}, "other": {}},
        }
