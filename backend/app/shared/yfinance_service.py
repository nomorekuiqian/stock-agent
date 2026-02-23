"""
Yahoo Finance API Service - Batch Stock Quotes

Uses yfinance library for efficient batch stock data fetching.
One API request can fetch 70+ stocks in ~2 seconds.
"""

import warnings
import time
import threading
from typing import Optional

import yfinance as yf

# =============================================================================
# Cache for Stock Quotes
# =============================================================================


class YFQuoteCache:
    """
    Thread-safe in-memory cache with TTL for yfinance quotes.

    Features:
    - TTL-based expiration (default 10 minutes)
    - Thread-safe operations with locks
    - Batch get/set operations
    """

    def __init__(self, ttl_seconds: int = 600):  # 10 minutes default
        self._cache: dict[str, tuple[dict, float]] = {}
        self._ttl = ttl_seconds
        self._lock = threading.Lock()

    def get(self, key: str) -> dict | None:
        """Get cached value if not expired (thread-safe)"""
        with self._lock:
            if key in self._cache:
                value, timestamp = self._cache[key]
                if time.time() - timestamp < self._ttl:
                    return value
                else:
                    del self._cache[key]
            return None

    def get_many(self, keys: list[str]) -> tuple[dict[str, dict], list[str]]:
        """
        Get multiple cached values at once.
        Returns: (cached_results, missing_keys)
        """
        cached = {}
        missing = []
        with self._lock:
            current_time = time.time()
            for key in keys:
                if key in self._cache:
                    value, timestamp = self._cache[key]
                    if current_time - timestamp < self._ttl:
                        cached[key] = value
                    else:
                        del self._cache[key]
                        missing.append(key)
                else:
                    missing.append(key)
        return cached, missing

    def set(self, key: str, value: dict) -> None:
        """Set cache value with current timestamp (thread-safe)"""
        with self._lock:
            self._cache[key] = (value, time.time())

    def set_many(self, items: dict[str, dict]) -> None:
        """Set multiple cache values at once (thread-safe)"""
        with self._lock:
            current_time = time.time()
            for key, value in items.items():
                self._cache[key] = (value, current_time)

    def clear(self) -> None:
        """Clear all cached values"""
        with self._lock:
            self._cache.clear()

    def stats(self) -> dict:
        """Return cache statistics"""
        with self._lock:
            current_time = time.time()
            total = len(self._cache)
            valid = sum(
                1 for _, ts in self._cache.values() if current_time - ts < self._ttl
            )
            return {
                "total_entries": total,
                "valid_entries": valid,
                "expired_entries": total - valid,
                "ttl_seconds": self._ttl,
            }


# Global cache instances
_yf_quote_cache = YFQuoteCache(ttl_seconds=600)  # 10 minutes
_yf_ticker_info_cache = YFQuoteCache(ttl_seconds=600)  # 10 minutes for Ticker.info


class YFinanceService:
    """
    Yahoo Finance service for batch stock quotes.

    Key advantage: One request can fetch 70+ stocks in ~2 seconds,
    compared to 73 individual FMP API calls.
    """

    def __init__(self):
        pass

    def get_stock_quotes(
        self, symbols: list[str], use_cache: bool = True
    ) -> dict:
        """
        Get real-time quotes for multiple stocks using yfinance batch download.

        Args:
            symbols: List of stock symbols (e.g., ["AAPL", "MSFT", "NVDA"])
            use_cache: Whether to use cached values (default: True)

        Returns:
            {
                "status": "success|error",
                "quotes": [
                    {
                        "symbol": "AAPL",
                        "name": "Apple Inc.",
                        "price": 195.50,
                        "daily_change": 1.27,  # percentage
                        "previous_close": 193.05,
                        "day_high": 196.20,
                        "day_low": 194.10,
                        "cached": true/false
                    },
                    ...
                ],
                "from_cache": int (count of cached results),
                "source": "yfinance"
            }
        """
        if not symbols:
            return {"status": "success", "quotes": [], "from_cache": 0, "source": "yfinance"}

        symbols_upper = [s.upper() for s in symbols]
        print(f"[YFinance] get_stock_quotes({len(symbols_upper)} symbols, use_cache={use_cache})")

        # Step 1: Check cache for existing quotes
        quotes_dict: dict[str, dict] = {}
        symbols_to_fetch: list[str] = []

        if use_cache:
            cached_results, missing = _yf_quote_cache.get_many(symbols_upper)
            for symbol, quote in cached_results.items():
                quote_copy = quote.copy()
                quote_copy["cached"] = True
                quotes_dict[symbol] = quote_copy
            symbols_to_fetch = missing
        else:
            symbols_to_fetch = symbols_upper

        cached_count = len(quotes_dict)

        # Step 2: Fetch missing quotes using yfinance batch download
        if symbols_to_fetch:
            fetched_quotes = self._fetch_quotes_batch(symbols_to_fetch)

            # Cache all fetched results
            if use_cache and fetched_quotes:
                cache_items = {}
                for quote in fetched_quotes:
                    cache_copy = quote.copy()
                    cache_copy["cached"] = False
                    cache_items[quote["symbol"]] = cache_copy
                _yf_quote_cache.set_many(cache_items)

            # Add to results
            for quote in fetched_quotes:
                quotes_dict[quote["symbol"]] = quote

        # Step 3: Build result in original order
        quotes = []
        for symbol in symbols_upper:
            if symbol in quotes_dict:
                quotes.append(quotes_dict[symbol])

        return {
            "status": "success",
            "quotes": quotes,
            "from_cache": cached_count,
            "source": "yfinance",
        }

    def _fetch_quotes_batch(self, symbols: list[str]) -> list[dict]:
        """
        Internal method to fetch quotes using yfinance batch download.

        Uses yf.download() to fetch all symbols in ONE request.
        Much more efficient than individual API calls.
        """
        if not symbols:
            return []

        print(f"[YFinance] Batch fetching {len(symbols)} symbols...")
        start_time = time.time()

        fetched_quotes = []

        try:
            # Suppress yfinance warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")

                # Fetch 2 days of data to calculate daily change
                # period='2d' gives us yesterday's close and today's data
                df = yf.download(
                    symbols,
                    period="2d",
                    progress=False,
                    threads=True,
                    ignore_tz=True,
                )

            if df.empty:
                print("[YFinance] No data returned from yfinance")
                return []

            # Handle both single and multiple symbols
            # yfinance returns different DataFrame structures
            if len(symbols) == 1:
                # Single symbol: columns are just ['Open', 'High', 'Low', 'Close', ...]
                symbol = symbols[0]
                if len(df) >= 1:
                    today = df.iloc[-1]
                    yesterday = df.iloc[-2] if len(df) >= 2 else df.iloc[-1]

                    price = float(today["Close"]) if not self._is_nan(today["Close"]) else 0
                    prev_close = float(yesterday["Close"]) if not self._is_nan(yesterday["Close"]) else 0

                    # Calculate daily change percentage
                    if prev_close > 0:
                        daily_change = ((price - prev_close) / prev_close) * 100
                    else:
                        daily_change = 0

                    fetched_quotes.append({
                        "symbol": symbol,
                        "name": "",  # yfinance doesn't provide company name in download
                        "price": round(price, 2),
                        "daily_change": round(daily_change, 2),
                        "previous_close": round(prev_close, 2),
                        "day_high": round(float(today["High"]), 2) if not self._is_nan(today["High"]) else 0,
                        "day_low": round(float(today["Low"]), 2) if not self._is_nan(today["Low"]) else 0,
                        "cached": False,
                    })
            else:
                # Multiple symbols: MultiIndex columns like ('Close', 'AAPL'), ('Close', 'MSFT')
                for symbol in symbols:
                    try:
                        if ("Close", symbol) not in df.columns:
                            print(f"[YFinance] No data for {symbol}")
                            continue

                        close_series = df[("Close", symbol)]

                        if len(close_series) >= 1:
                            today_close = close_series.iloc[-1]
                            yesterday_close = close_series.iloc[-2] if len(close_series) >= 2 else close_series.iloc[-1]

                            if self._is_nan(today_close):
                                print(f"[YFinance] No close price for {symbol}")
                                continue

                            price = float(today_close)
                            prev_close = float(yesterday_close) if not self._is_nan(yesterday_close) else 0

                            # Calculate daily change percentage
                            if prev_close > 0:
                                daily_change = ((price - prev_close) / prev_close) * 100
                            else:
                                daily_change = 0

                            # Get high/low for today
                            day_high = 0
                            day_low = 0
                            if ("High", symbol) in df.columns:
                                h = df[("High", symbol)].iloc[-1]
                                day_high = round(float(h), 2) if not self._is_nan(h) else 0
                            if ("Low", symbol) in df.columns:
                                l = df[("Low", symbol)].iloc[-1]
                                day_low = round(float(l), 2) if not self._is_nan(l) else 0

                            fetched_quotes.append({
                                "symbol": symbol,
                                "name": "",
                                "price": round(price, 2),
                                "daily_change": round(daily_change, 2),
                                "previous_close": round(prev_close, 2),
                                "day_high": day_high,
                                "day_low": day_low,
                                "cached": False,
                            })

                    except (KeyError, IndexError) as e:
                        print(f"[YFinance] Error processing {symbol}: {e}")
                        continue

        except Exception as e:
            print(f"[YFinance] Batch download error: {e}")
            return []

        elapsed = time.time() - start_time
        print(f"[YFinance] Fetched {len(fetched_quotes)} quotes in {elapsed:.2f}s (1 request)")

        return fetched_quotes

    def _is_nan(self, value) -> bool:
        """Check if value is NaN"""
        try:
            return value != value  # NaN is not equal to itself
        except (TypeError, ValueError):
            return True

    def get_ticker_metrics(self, symbol: str) -> dict:
        """
        Get all fundamental metrics from yf.Ticker(symbol).info in one call.

        Replaces FMP TTM API + manual calculations. Data matches Yahoo Finance page.
        Results cached for 10 minutes.

        Returns:
            {
                "ttm": { revenue, net_income, eps, ebitda, operating_cash_flow, free_cash_flow },
                "valuation": { pe, ps, pb, ev_to_ebitda, dividend_yield, peg },
                "forward": { forward_pe, forward_eps, trailing_eps },
                "profitability": { gross_margin, operating_margin, net_margin, roe, roa },
                "growth": { revenue_yoy, earnings_yoy },
                "source": "yfinance"
            }
        """
        symbol = symbol.upper()

        cached = _yf_ticker_info_cache.get(symbol)
        if cached is not None:
            print(f"[YFinance] get_ticker_metrics({symbol}) - cache hit")
            return cached

        print(f"[YFinance] get_ticker_metrics({symbol}) - fetching")

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                info = yf.Ticker(symbol).info
        except Exception as e:
            print(f"[YFinance] Error fetching ticker info for {symbol}: {e}")
            return {"ttm": {}, "valuation": {}, "forward": {}, "profitability": {}, "growth": {}, "source": "yfinance"}

        def _get(key):
            return info.get(key)

        def _positive_or_none(val):
            """Return val only if positive, else None."""
            if val is not None and val > 0:
                return val
            return None

        def _round(val, decimals=4):
            return round(val, decimals) if val is not None else None

        # TTM metrics
        ttm = {
            "revenue": _get("totalRevenue"),
            "net_income": _get("netIncomeToCommon"),
            "eps": _round(_get("trailingEps")),
            "ebitda": _get("ebitda"),
            "operating_cash_flow": _get("operatingCashflow"),
            "free_cash_flow": _get("freeCashflow"),
        }

        # Valuation
        valuation = {}
        pe = _positive_or_none(_get("trailingPE"))
        if pe is not None:
            valuation["pe"] = _round(pe, 2)
        ps = _get("priceToSalesTrailing12Months")
        if ps is not None:
            valuation["ps"] = _round(ps, 2)
        pb = _get("priceToBook")
        if pb is not None:
            valuation["pb"] = _round(pb, 2)
        ev_to_ebitda = _positive_or_none(_get("enterpriseToEbitda"))
        if ev_to_ebitda is not None:
            valuation["ev_to_ebitda"] = _round(ev_to_ebitda, 2)
        dividend_yield = _get("dividendYield")
        if dividend_yield is not None:
            valuation["dividend_yield"] = _round(dividend_yield * 100, 4)
        peg = _positive_or_none(_get("trailingPegRatio"))
        if peg is not None:
            valuation["peg"] = _round(peg, 2)

        # Forward
        forward_pe = _positive_or_none(_get("forwardPE"))
        forward = {
            "forward_pe": _round(forward_pe, 2),
            "forward_eps": _round(_get("forwardEps"), 4),
            "trailing_eps": _round(_get("trailingEps"), 4),
        }

        # Profitability
        profitability = {}
        for key, yf_key in [
            ("gross_margin", "grossMargins"),
            ("operating_margin", "operatingMargins"),
            ("net_margin", "profitMargins"),
            ("roe", "returnOnEquity"),
            ("roa", "returnOnAssets"),
        ]:
            val = _get(yf_key)
            if val is not None:
                profitability[key] = _round(val)

        # Growth
        growth = {}
        rev_growth = _get("revenueGrowth")
        if rev_growth is not None:
            growth["revenue_yoy"] = _round(rev_growth)
        earnings_growth = _get("earningsQuarterlyGrowth")
        if earnings_growth is not None:
            growth["earnings_yoy"] = _round(earnings_growth)

        result = {
            "ttm": ttm,
            "valuation": valuation,
            "forward": forward,
            "profitability": profitability,
            "growth": growth,
            "source": "yfinance",
        }

        _yf_ticker_info_cache.set(symbol, result)
        return result

    def clear_cache(self) -> None:
        """Clear all caches"""
        _yf_quote_cache.clear()
        _yf_ticker_info_cache.clear()
        print("[YFinance] All caches cleared")

    def cache_stats(self) -> dict:
        """Get cache statistics"""
        return {
            "quotes": _yf_quote_cache.stats(),
            "ticker_info": _yf_ticker_info_cache.stats(),
        }


# Singleton instance
_yfinance_service_instance: Optional[YFinanceService] = None


def get_yfinance_service() -> YFinanceService:
    """Get YFinance Service singleton"""
    global _yfinance_service_instance
    if _yfinance_service_instance is None:
        _yfinance_service_instance = YFinanceService()
    return _yfinance_service_instance
