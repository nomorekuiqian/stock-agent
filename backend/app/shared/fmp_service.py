"""
FMP (Financial Modeling Prep) API Service
"""

import os
import re
import httpx
import time
from typing import Optional
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor

from app.core.logging import get_logger
from app.utils.timezone import now_pacific, today_str, days_from_now

logger = get_logger(__name__)


# =============================================================================
# Simple Memory Cache for Stock Quotes with Concurrency Control
# =============================================================================
import threading

class QuoteCache:
    """
    Thread-safe in-memory cache with TTL and request coalescing for stock quotes.

    Features:
    - TTL-based expiration (default 10 minutes for market hours)
    - Request coalescing: concurrent requests for same symbols share one API call
    - Thread-safe operations with locks
    """

    def __init__(self, ttl_seconds: int = 600):  # 10 minutes default
        self._cache: dict[str, tuple[dict, float]] = {}
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        # Track in-flight requests to coalesce concurrent calls
        self._pending: dict[str, threading.Event] = {}
        self._pending_lock = threading.Lock()

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

    def cleanup(self) -> None:
        """Remove expired entries"""
        with self._lock:
            current_time = time.time()
            expired_keys = [
                k for k, (_, ts) in self._cache.items()
                if current_time - ts >= self._ttl
            ]
            for key in expired_keys:
                del self._cache[key]

    def acquire_fetch_lock(self, batch_key: str) -> tuple[bool, threading.Event]:
        """
        Try to acquire lock for fetching a batch of symbols.
        Returns: (is_leader, event)
        - is_leader=True: this request should fetch data, then signal event
        - is_leader=False: another request is fetching, wait on event
        """
        with self._pending_lock:
            if batch_key in self._pending:
                # Another request is already fetching
                return False, self._pending[batch_key]
            else:
                # This request becomes the leader
                event = threading.Event()
                self._pending[batch_key] = event
                return True, event

    def release_fetch_lock(self, batch_key: str) -> None:
        """Release fetch lock and signal waiting requests"""
        with self._pending_lock:
            if batch_key in self._pending:
                event = self._pending.pop(batch_key)
                event.set()  # Signal all waiting threads

    def stats(self) -> dict:
        """Return cache statistics"""
        with self._lock:
            current_time = time.time()
            total = len(self._cache)
            valid = sum(1 for _, ts in self._cache.values() if current_time - ts < self._ttl)
            return {
                "total_entries": total,
                "valid_entries": valid,
                "expired_entries": total - valid,
                "ttl_seconds": self._ttl,
            }


# Global cache instances
# TTL: 10 minutes - balances freshness vs API usage
# During market hours (9:30 AM - 4 PM ET), prices update frequently
# Outside market hours, prices are static
_quote_cache = QuoteCache(ttl_seconds=600)  # 10 minutes for quotes

# Stock list cache (for search) - longer TTL since it rarely changes
_stock_list_cache: dict[str, tuple[list, float]] = {}
_STOCK_LIST_TTL = 86400  # 24 hours


# =============================================================================
# Stock search: symbol-shape classification helpers
#
# FMP's /stable/stock-list carries NO exchange field (exchange/exchangeShortName
# are null for every row), so primary-vs-foreign must be inferred from the
# symbol shape, which IS reliable in FMP's symbology:
#   - dotless ticker (BRK-A, RY, AAPL, BAC-PA) -> US-traded (NYSE/NASDAQ/AMEX/OTC)
#   - dot suffix in _PRIMARY_SUFFIXES (.KS/.T/.HK ...) -> home-market primary
#   - any other dot suffix (.NE/.SW/.DE/.L/.SA/.TO ...) -> thin foreign cross-listing
# =============================================================================

# Symbol dot-suffixes that denote a PRIMARY home-market listing (not a thin ADR/GDR).
_PRIMARY_SUFFIXES = frozenset({".KS", ".KQ", ".T", ".SS", ".SZ", ".HK"})

# US class shares use a HYPHEN with a single-letter class in FMP (BRK-A, BRK-B),
# confirmed against live /stable/stock-list. Multi-char hyphen suffixes are
# preferred/warrant/unit series (BAC-PA, XYZ-WT) and fold into the common row.
_HYPHEN_CLASS_RE = re.compile(r"^[A-Z0-9]+-([A-Z])$")


def _symbol_kind(symbol: str) -> str:
    """Classify a symbol by shape: ``"us"``, ``"primary"``, or ``"foreign"``.

    - ``"us"``       -> no dot suffix (US-traded; the listing we prioritize)
    - ``"primary"``  -> dot suffix in _PRIMARY_SUFFIXES (legit home market)
    - ``"foreign"``  -> any other dot suffix (thin cross-listing, suppressible)
    """
    s = (symbol or "").upper().strip()
    dot = s.rfind(".")
    if dot <= 0:
        return "us"
    return "primary" if s[dot:] in _PRIMARY_SUFFIXES else "foreign"


def _symbol_root(symbol: str) -> str:
    """Ticker root with any class/exchange suffix stripped.

    ``BRK-A`` -> ``BRK``  ``BRK.NE`` -> ``BRK``  ``RY`` -> ``RY``  ``BRKC`` -> ``BRKC``
    Lets a query like ``BRK`` rank the real Berkshire class shares above
    incidental ``BRK*`` tickers (BRKC, BRKH ...).
    """
    s = (symbol or "").upper().strip()
    if "." in s:
        s = s[:s.rfind(".")]
    if "-" in s:
        s = s[:s.rfind("-")]
    return s


def _dedup_rank(symbol: str) -> int:
    """Tie-break rank within an equal score tier (lower = preferred).

    0 = plain common or a real single-letter class share (RY, BRK-A)
    1 = preferred/warrant/unit hyphen series (RY-PT, BAC-PA)
    2 = dotted listing (foreign / home-market)
    Keeps class shares prominent while demoting preferred siblings so the
    clean common ticker wins its dedup key.
    """
    if _share_class_token(symbol):
        return 0
    if "." in symbol:
        return 2
    if "-" in symbol:
        return 1
    return 0


def _norm_company_name(name: str) -> str:
    """Normalize a company name for dedup/grouping (lowercase, strip legal suffixes).

    Centralizes the normalization so the primary-listing pre-scan and the dedup
    pass use an identical key.
    """
    norm = (name or "").lower().strip()
    for suffix in (", ltd.", " ltd.", ", inc.", " inc.", " co., ltd.", " corp.",
                   " corporation", " plc", " sa", " ag", " se"):
        norm = norm.removesuffix(suffix)
    return norm.strip()


def _share_class_token(symbol: str) -> str:
    """Return a single-letter A/B/C-style common-share class token, else "".

    FMP uses a HYPHEN for US class shares (``BRK-A`` -> ``"A"``, confirmed against
    live data). Multi-char hyphen suffixes (``-PA``, ``-WT``, ``-U``, ``-RT``) are
    preferred/warrant/unit series and fold into the common row (return ``""``).
    Dot-suffixed symbols are exchange/country listings, never a share class.
    """
    if not symbol:
        return ""
    s = symbol.upper().strip()
    if "." in s:
        return ""
    m = _HYPHEN_CLASS_RE.match(s)
    return m.group(1) if m else ""


# Core tickers for FMP news - Tech worker focused
FMP_NEWS_SYMBOLS = [
    # === Market Indices ===
    "SPY",   # S&P 500 ETF
    "QQQ",   # Nasdaq 100 ETF

    # === Mag 7 ===
    "AAPL",  # Apple
    "MSFT",  # Microsoft
    "NVDA",  # NVIDIA
    "AMZN",  # Amazon
    "GOOGL", # Alphabet
    "META",  # Meta
    "TSLA",  # Tesla

    # === AI Chips ===
    "AMD",   # AMD
    "AVGO",  # Broadcom (AI networking)
    "ARM",   # ARM Holdings
    "SMCI",  # Super Micro (AI servers)
    "MRVL",  # Marvell (custom AI chips)

    # === Storage (HBM/Memory) ===
    "MU",    # Micron (HBM memory, AI hot)
    "WDC",   # Western Digital
    "STX",   # Seagate

    # === Semiconductor Equipment ===
    "TSM",   # TSMC
    "ASML",  # ASML

    # === AI/Cloud Software ===
    "CRM",   # Salesforce
    "SNOW",  # Snowflake
    "PLTR",  # Palantir
    "NOW",   # ServiceNow
    "NET",   # Cloudflare
    "DDOG",  # Datadog
    "CRWD",  # CrowdStrike

    # === China Tech ===
    "BABA",  # Alibaba
    "PDD",   # Pinduoduo/Temu
    "NIO",   # NIO

    # === Crypto/Fintech ===
    "COIN",  # Coinbase
    "MSTR",  # MicroStrategy (BTC proxy)
    "SQ",    # Block/Square

    # === Consumer Tech ===
    "UBER",  # Uber
    "ABNB",  # Airbnb
    "NFLX",  # Netflix

    # === 2024-2025 Hot ===
    "LLY",   # Eli Lilly (GLP-1)
    "RDDT",  # Reddit
]


# Default technical indicator configurations for get_technical_indicators()
DEFAULT_TECHNICAL_INDICATORS = [
    {"type": "rsi", "period": 14, "key": "rsi_14"},
    {"type": "sma", "period": 20, "key": "sma_20"},
    {"type": "sma", "period": 50, "key": "sma_50"},
    {"type": "sma", "period": 200, "key": "sma_200"},
    {"type": "ema", "period": 12, "key": "ema_12"},
    {"type": "ema", "period": 26, "key": "ema_26"},
    {"type": "adx", "period": 14, "key": "adx_14"},
    {"type": "williams", "period": 14, "key": "williams_r"},
]


class FMPService:
    """Financial Modeling Prep API"""

    BASE_URL = "https://financialmodelingprep.com"

    # Max concurrent FMP API requests to avoid hitting rate limits
    _api_semaphore = threading.Semaphore(5)

    def __init__(self):
        self.api_key = os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise ValueError("FMP_API_KEY environment variable is required")
        self._client = httpx.Client(timeout=30.0)

    def _request(self, endpoint: str, params: dict = None) -> dict | list | None:
        """Send synchronous API request with concurrency limit (max 5 parallel)"""
        params = params or {}
        params["apikey"] = self.api_key

        with self._api_semaphore:
            try:
                response = self._client.get(f"{self.BASE_URL}{endpoint}", params=params)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error("FMP API HTTP error: %s - %s", e.response.status_code, e.response.text)
                return None
            except httpx.RequestError as e:
                logger.error("FMP API request error: %s", e)
                return None
            except Exception as e:
                logger.error("FMP API unexpected error: %s", e)
                return None

    # =========================================================================
    # Technical Indicators & Historical Price
    # =========================================================================

    def get_technical_indicators(
        self,
        symbol: str,
        indicators: list[dict] | None = None,
        timeframe: str = "1day",
        limit: int = 200,
    ) -> dict:
        """
        Fetch multiple technical indicator series from FMP stable API in parallel.

        Args:
            symbol: Stock symbol (e.g. "AAPL")
            indicators: List of indicator configs, each with keys:
                - type: indicator name (rsi, sma, ema, adx, williams, standarddeviation)
                - period: period length (e.g. 14, 20, 50)
                - key: output key name (e.g. "sma_20", "rsi_14")
                Default set covers core technical analysis needs.
            timeframe: "1day" (FMP does not support weekly)
            limit: Number of data points (default 200)

        Returns:
            {
                "status": "success",
                "symbol": "AAPL",
                "indicators": {
                    "rsi_14": [{"date": "...", "value": 62.2}, ...],
                    "sma_20": [{"date": "...", "value": 254.6}, ...],
                    ...
                },
                "source": "fmp"
            }
        """
        indicators = indicators or DEFAULT_TECHNICAL_INDICATORS

        # Field name mapping: most indicator types use their own name as the
        # response field, except "standarddeviation" which maps to "standardDeviation"
        field_name_map = {
            "standarddeviation": "standardDeviation",
        }

        def _fetch_one(ind: dict) -> tuple[str, list[dict]]:
            """Fetch a single indicator series and return (key, parsed_data)."""
            ind_type = ind["type"]
            ind_key = ind["key"]
            params = {
                "symbol": symbol,
                "periodLength": ind["period"],
                "timeframe": timeframe,
            }
            data = self._request(
                "/stable/technical-indicators/%s" % ind_type, params=params
            )
            if not data or not isinstance(data, list):
                return ind_key, []

            field = field_name_map.get(ind_type, ind_type)
            parsed = []
            for item in data:
                val = self._safe_float(item.get(field))
                if val is not None:
                    parsed.append({
                        "date": str(item.get("date", ""))[:10],
                        "value": val,
                    })

            # FMP returns newest-first; reverse to oldest-first, then limit
            parsed.reverse()
            parsed = parsed[-limit:] if len(parsed) > limit else parsed
            return ind_key, parsed

        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                executor.submit(_fetch_one, ind): ind["key"]
                for ind in indicators
            }
            for future in futures:
                key, data = future.result()
                results[key] = data

        logger.info(
            "get_technical_indicators(%s): fetched %d indicators",
            symbol, len(results),
        )

        return {
            "status": "success",
            "symbol": symbol,
            "indicators": results,
            "source": "fmp",
        }

    def get_historical_price(self, symbol: str, limit: int = 200) -> dict:
        """
        Fetch historical daily OHLCV data for chart rendering.

        Returns:
            {
                "status": "success",
                "symbol": "AAPL",
                "data": [
                    {"date": "2025-10-01", "open": 150.0, "high": 155.0, "low": 149.0, "close": 153.0, "volume": 50000000},
                    ...
                ],
                "source": "fmp"
            }
        """
        logger.info("get_historical_price(symbol=%s, limit=%d)", symbol, limit)

        data = self._request(
            "/stable/historical-price-eod/full", params={"symbol": symbol}
        )

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "symbol": symbol,
                "data": [],
                "source": "fmp",
                "error": "No historical price data returned",
            }

        # Parse, limit, and sort oldest-first (FMP returns newest-first)
        parsed = []
        for item in data[:limit]:
            parsed.append({
                "date": item.get("date", ""),
                "open": self._safe_float(item.get("open")),
                "high": self._safe_float(item.get("high")),
                "low": self._safe_float(item.get("low")),
                "close": self._safe_float(item.get("close")),
                "volume": item.get("volume"),
            })

        parsed.reverse()

        return {
            "status": "success",
            "symbol": symbol,
            "data": parsed,
            "source": "fmp",
        }

    def get_treasury_rates(self, date: Optional[str] = None) -> dict:
        """
        Get complete treasury yield curve (12 maturities)

        Args:
            date: Optional, specify date (YYYY-MM-DD), defaults to latest

        Returns:
            {
                "date": "2024-02-29",
                "rates": {
                    "1M": 5.53, "2M": 5.5, "3M": 5.45, "6M": 5.3,
                    "1Y": 5.01, "2Y": 4.64, "3Y": 4.43,
                    "5Y": 4.26, "7Y": 4.28,
                    "10Y": 4.25, "20Y": 4.51, "30Y": 4.38
                },
                "spreads": {
                    "10y_3m": -0.2,
                    "10y_2y": -0.39,
                    "30y_10y": 0.13
                },
                "yield_curve_shape": "inverted",
                "source": "fmp"
            }
        """
        logger.info("get_treasury_rates()")

        params = {}
        if date:
            params["date"] = date

        data = self._request("/stable/treasury-rates", params)

        if not data or not isinstance(data, list) or len(data) == 0:
            logger.warning("FMP Treasury Rates API returned empty data")
            return self._empty_treasury_response()

        raw = data[0]

        rates = {
            "1M": self._safe_float(raw.get("month1")),
            "2M": self._safe_float(raw.get("month2")),
            "3M": self._safe_float(raw.get("month3")),
            "6M": self._safe_float(raw.get("month6")),
            "1Y": self._safe_float(raw.get("year1")),
            "2Y": self._safe_float(raw.get("year2")),
            "3Y": self._safe_float(raw.get("year3")),
            "5Y": self._safe_float(raw.get("year5")),
            "7Y": self._safe_float(raw.get("year7")),
            "10Y": self._safe_float(raw.get("year10")),
            "20Y": self._safe_float(raw.get("year20")),
            "30Y": self._safe_float(raw.get("year30")),
        }

        spreads = self._calculate_spreads(rates)
        yield_curve_shape = self._analyze_yield_curve_shape(rates)

        return {
            "date": raw.get("date", today_str()),
            "rates": rates,
            "spreads": spreads,
            "yield_curve_shape": yield_curve_shape,
            "source": "fmp",
        }

    def _calculate_spreads(self, rates: dict) -> dict:
        """Calculate key spreads"""
        spreads = {}

        # 10Y - 3M (most important recession indicator)
        if rates.get("10Y") and rates.get("3M"):
            spreads["10y_3m"] = round(rates["10Y"] - rates["3M"], 3)

        # 10Y - 2Y (another important recession indicator)
        if rates.get("10Y") and rates.get("2Y"):
            spreads["10y_2y"] = round(rates["10Y"] - rates["2Y"], 3)

        # 30Y - 10Y (long-end slope)
        if rates.get("30Y") and rates.get("10Y"):
            spreads["30y_10y"] = round(rates["30Y"] - rates["10Y"], 3)

        # 5Y - 3M (mid-short end)
        if rates.get("5Y") and rates.get("3M"):
            spreads["5y_3m"] = round(rates["5Y"] - rates["3M"], 3)

        return spreads

    def _analyze_yield_curve_shape(self, rates: dict) -> str:
        """
        Analyze yield curve shape

        Returns:
            "normal": Normal (short < long)
            "flat": Flat (short ~ long)
            "inverted": Inverted (short > long)
        """
        short = rates.get("3M", 0) or 0
        long = rates.get("10Y", 0) or 0

        if short == 0 or long == 0:
            return "unknown"

        diff = long - short

        if diff < -0.1:  # 10Y more than 10bp below 3M
            return "inverted"
        elif diff < 0.5:  # Spread less than 50bp
            return "flat"
        else:
            return "normal"

    def _safe_float(self, value, default=None) -> float | None:
        """Safely convert to float"""
        if value is None:
            return default
        try:
            result = float(value)
            return result if result == result else default  # NaN check
        except (ValueError, TypeError):
            return default

    def _empty_treasury_response(self) -> dict:
        """Return empty treasury response structure"""
        return {
            "date": None,
            "rates": {},
            "spreads": {},
            "yield_curve_shape": "unknown",
            "source": "fmp",
            "error": "No data available",
        }

    def get_treasury_rates_with_change(self) -> dict:
        """
        Get treasury rates with daily change in basis points (bps).

        FMP API returns multiple days of historical data by default.
        We use data[0] for today and data[1] for previous trading day.
        1 basis point = 0.01%

        Returns:
            Same structure as get_treasury_rates, but rates dict contains:
            {
                "10Y": {
                    "rate": 4.25,
                    "daily_change_bps": 5.0  # +5 bps means rate went from 4.20% to 4.25%
                },
                ...
            }
        """
        logger.info("get_treasury_rates_with_change()")

        # Fetch treasury rates - API returns multiple days by default
        data = self._request("/stable/treasury-rates", {})

        if not data or not isinstance(data, list) or len(data) == 0:
            logger.warning("FMP Treasury Rates API returned empty data")
            return self._empty_treasury_response()

        # data[0] is today (or most recent), data[1] is previous trading day
        today_raw = data[0]
        prev_raw = data[1] if len(data) > 1 else None

        today_date = today_raw.get("date")
        prev_date = prev_raw.get("date") if prev_raw else None

        # Define tenor mapping
        tenor_mapping = {
            "1M": "month1", "2M": "month2", "3M": "month3", "6M": "month6",
            "1Y": "year1", "2Y": "year2", "3Y": "year3",
            "5Y": "year5", "7Y": "year7",
            "10Y": "year10", "20Y": "year20", "30Y": "year30",
        }

        # Build rates with daily change
        rates_with_change = {}
        raw_rates = {}  # For spread calculation

        for tenor, field in tenor_mapping.items():
            today_rate = self._safe_float(today_raw.get(field))
            prev_rate = self._safe_float(prev_raw.get(field)) if prev_raw else None

            if today_rate is not None:
                raw_rates[tenor] = today_rate
                daily_change_bps = None
                if prev_rate is not None:
                    # Change in bps: (today - yesterday) * 100
                    # e.g., 4.25% - 4.20% = 0.05, * 100 = 5 bps
                    daily_change_bps = round((today_rate - prev_rate) * 100, 1)

                rates_with_change[tenor] = {
                    "rate": today_rate,
                    "daily_change_bps": daily_change_bps,
                }

        # Calculate spreads and yield curve shape using raw rates
        spreads = self._calculate_spreads(raw_rates)
        yield_curve_shape = self._analyze_yield_curve_shape(raw_rates)

        result = {
            "date": today_date,
            "prev_date": prev_date,
            "rates": rates_with_change,
            "spreads": spreads,
            "yield_curve_shape": yield_curve_shape,
            "source": "fmp",
        }

        logger.info("Treasury rates with change: today=%s, prev=%s", today_date, prev_date)
        return result

    def get_stock_news(self, symbols: list[str] | None = None, limit: int = 80, from_date: str | None = None) -> dict:
        """
        Get news for specific stock symbols from FMP API.
        Batches requests in groups of 20 (API limit per request).

        Args:
            symbols: List of ticker symbols (defaults to FMP_NEWS_SYMBOLS)
            limit: Maximum news items per batch (default: 80)
            from_date: Only include news from this date onwards (YYYY-MM-DD)

        Returns:
            {
                "status": "success|error",
                "news_count": int,
                "news": [...],
                "source": "fmp",
                "symbols_queried": [...]
            }
        """
        symbols = symbols or FMP_NEWS_SYMBOLS

        # Batch into groups of 20 (FMP API limit per request)
        batches = [symbols[i:i + 20] for i in range(0, len(symbols), 20)]
        logger.info("get_stock_news(symbols=%d, batches=%d, limit=%d, from=%s)", len(symbols), len(batches), limit, from_date)

        all_news = []
        for batch in batches:
            symbols_str = ",".join(batch)
            params = {"symbols": symbols_str, "limit": limit}
            if from_date:
                params["from"] = from_date
            data = self._request("/stable/news/stock", params)

            if data and isinstance(data, list):
                all_news.extend(self._parse_fmp_news(data))

        return {
            "status": "success",
            "news_count": len(all_news),
            "news": all_news,
            "source": "fmp",
            "symbols_queried": symbols,
        }

    def get_latest_news(self, limit: int = 50, from_date: str = None) -> dict:
        """
        Get latest general stock market news (no ticker required).

        Args:
            limit: Maximum news items to return (default: 50)
            from_date: Only include news from this date onwards (YYYY-MM-DD)

        Returns:
            Standardized news response dict
        """
        logger.info("get_latest_news(limit=%d, from=%s)", limit, from_date)

        params = {"limit": limit}
        if from_date:
            params["from"] = from_date
        data = self._request("/stable/news/stock-latest", params)

        if not data or not isinstance(data, list):
            return self._empty_news_response("No news data returned")

        news = self._parse_fmp_news(data)

        return {
            "status": "success",
            "news_count": len(news),
            "news": news,
            "source": "fmp",
        }

    def get_general_news(self, limit: int = 50, from_date: str = None) -> dict:
        """
        Get general market news (macro, policy, economy) without ticker requirement.

        This endpoint provides broader market coverage including:
        - Fed/central bank policy news
        - Economic data releases
        - Geopolitical events affecting markets
        - Sector-wide trends

        Args:
            limit: Maximum news items to return (default: 30)
            from_date: Only include news from this date onwards (YYYY-MM-DD)

        Returns:
            Standardized news response dict
        """
        logger.info("get_general_news(limit=%d, from=%s)", limit, from_date)

        params = {"limit": limit}
        if from_date:
            params["from"] = from_date
        data = self._request("/stable/news/general-latest", params)

        if not data or not isinstance(data, list):
            return self._empty_news_response("No general news data returned")

        news = self._parse_fmp_news(data)

        # Mark as general/macro news
        for item in news:
            item["type"] = "general"

        return {
            "status": "success",
            "news_count": len(news),
            "news": news,
            "source": "fmp_general",
        }

    def _parse_fmp_news(self, raw_news: list) -> list[dict]:
        """
        Parse FMP news items to standard format.

        FMP format: symbol, publishedDate, publisher, title, image, site, text, url
        Output format: title, text, source, publishedDate, url, image, symbol, type
        """
        parsed = []
        for item in raw_news:
            if not item.get("title"):
                continue

            parsed.append({
                "title": item.get("title", ""),
                "text": (item.get("text", "") or "")[:500],
                "source": item.get("publisher", "") or item.get("site", "FMP"),
                "publishedDate": item.get("publishedDate", ""),
                "url": item.get("url", ""),
                "image": item.get("image", ""),
                "symbol": item.get("symbol", ""),
                "type": "macro",
            })

        return parsed

    def _empty_news_response(self, error: str = None) -> dict:
        """Return empty news response structure"""
        return {
            "status": "error" if error else "success",
            "news_count": 0,
            "news": [],
            "source": "fmp",
            "error": error,
        }

    def get_economic_calendar(self, days: int = 14, country: str = None) -> dict:
        """
        Get upcoming economic events for the next N days.

        Args:
            days: Number of days to look ahead (default: 14, max: 90)
            country: Filter by country code (e.g., "US", "CN", "EU")

        Returns:
            {
                "status": "success|error",
                "events_count": int,
                "events": [
                    {
                        "date": "2024-03-01 08:30:00",
                        "country": "US",
                        "event": "Non-Farm Payrolls",
                        "currency": "USD",
                        "previous": 353000,
                        "estimate": 200000,
                        "actual": null,
                        "impact": "High",
                        "change": null,
                        "changePercentage": null
                    }
                ],
                "date_range": {"from": "...", "to": "..."},
                "source": "fmp"
            }
        """
        logger.info("get_economic_calendar(days=%d, country=%s)", days, country)

        from_date = today_str()  # Pacific timezone
        to_date = days_from_now(min(days, 90))

        params = {"from": from_date, "to": to_date}
        data = self._request("/stable/economic-calendar", params)

        if not data or not isinstance(data, list):
            return self._empty_calendar_response("No calendar data returned")

        events = self._parse_economic_events(data, country)

        # Sort by date and impact
        impact_order = {"High": 0, "Medium": 1, "Low": 2}
        events.sort(key=lambda x: (x["date"], impact_order.get(x["impact"], 3)))

        return {
            "status": "success",
            "events_count": len(events),
            "events": events,
            "date_range": {"from": from_date, "to": to_date},
            "source": "fmp",
        }

    def _parse_economic_events(self, raw_events: list, country: str = None) -> list[dict]:
        """
        Parse FMP economic calendar events.

        Args:
            raw_events: Raw API response
            country: Optional country filter (e.g., "US")

        Returns:
            List of parsed event dicts
        """
        parsed = []
        for item in raw_events:
            if not item.get("event"):
                continue

            event_country = item.get("country", "")

            # Filter by country if specified
            if country and event_country.upper() != country.upper():
                continue

            parsed.append({
                "date": item.get("date", ""),
                "country": event_country,
                "event": item.get("event", ""),
                "currency": item.get("currency", ""),
                "previous": self._safe_float(item.get("previous")),
                "estimate": self._safe_float(item.get("estimate")),
                "actual": self._safe_float(item.get("actual")),
                "impact": item.get("impact", "Low"),
                "change": self._safe_float(item.get("change")),
                "changePercentage": self._safe_float(item.get("changePercentage")),
            })

        return parsed

    def get_high_impact_events(self, days: int = 14, countries: list[str] = None) -> dict:
        """
        Get only high-impact economic events for the next N days.
        Focuses on US and major economies by default.

        Args:
            days: Number of days to look ahead (default: 14)
            countries: List of country codes to include (default: ["US", "EU", "CN", "JP", "GB"])

        Returns:
            Filtered calendar with only High and Medium impact events
        """
        logger.info("get_high_impact_events(days=%d)", days)

        countries = countries or ["US", "EU", "CN", "JP", "GB"]
        calendar = self.get_economic_calendar(days=days)

        if calendar.get("status") != "success":
            return calendar

        # Filter for high/medium impact and specified countries
        high_impact_events = [
            event for event in calendar["events"]
            if event["impact"] in ["High", "Medium"]
            and event["country"].upper() in [c.upper() for c in countries]
        ]

        # Key events to always highlight
        key_event_keywords = [
            "Fed", "FOMC", "Interest Rate", "CPI", "Inflation",
            "GDP", "Non-Farm", "Payroll", "Unemployment", "Retail Sales",
            "PMI", "Consumer Confidence", "Housing", "Trade Balance",
            "Central Bank", "ECB", "BOJ", "PBOC", "BOE"
        ]

        # Mark key events
        for event in high_impact_events:
            event["is_key_event"] = any(
                keyword.lower() in event["event"].lower()
                for keyword in key_event_keywords
            )

        return {
            "status": "success",
            "events_count": len(high_impact_events),
            "events": high_impact_events,
            "date_range": calendar["date_range"],
            "countries_filtered": countries,
            "source": "fmp",
        }

    def _empty_calendar_response(self, error: str = None) -> dict:
        """Return empty calendar response structure"""
        return {
            "status": "error" if error else "success",
            "events_count": 0,
            "events": [],
            "date_range": None,
            "source": "fmp",
            "error": error,
        }

    # =========================================================================
    # Earnings Calendar
    # =========================================================================

    def get_earnings_calendar(self, days: int = 14) -> dict:
        """
        Get upcoming earnings announcements for the next N days.

        Args:
            days: Number of days to look ahead (default: 7, max: 90)

        Returns:
            {
                "status": "success|error",
                "earnings_count": int,
                "earnings": [
                    {
                        "symbol": "AAPL",
                        "date": "2024-07-25",
                        "epsEstimated": 1.51,
                        "epsActual": null,
                        "revenueEstimated": 84000000000,
                        "revenueActual": null,
                        "time": "AMC"
                    }
                ],
                "date_range": {"from": "...", "to": "..."},
                "source": "fmp"
            }
        """
        logger.info("get_earnings_calendar(days=%d)", days)

        from_date = today_str()  # Pacific timezone
        to_date = days_from_now(min(days, 90))

        params = {"from": from_date, "to": to_date}
        data = self._request("/stable/earnings-calendar", params)

        if not data or not isinstance(data, list):
            return self._empty_earnings_response("No earnings data returned")

        earnings = self._parse_earnings(data)

        # Sort by date
        earnings.sort(key=lambda x: x["date"])

        return {
            "status": "success",
            "earnings_count": len(earnings),
            "earnings": earnings,
            "date_range": {"from": from_date, "to": to_date},
            "source": "fmp",
        }

    def get_recent_earnings_for_symbol(
        self, symbol: str, days_back: int = 3, days_forward: int = 1
    ) -> dict | None:
        """
        Get the most recent earnings calendar entry for a single symbol.

        Checks a window around today to find earnings that have already been
        reported (epsActual populated) but whose full income statement may not
        yet be available in FMP.

        Returns:
            Single earnings entry dict with epsActual/revenueActual, or None.
        """
        symbol = symbol.upper()
        logger.info("get_recent_earnings_for_symbol(%s, back=%d, fwd=%d)", symbol, days_back, days_forward)

        from_date = days_from_now(-days_back)
        to_date = days_from_now(days_forward)

        params = {"from": from_date, "to": to_date}
        data = self._request("/stable/earnings-calendar", params)

        if not data or not isinstance(data, list):
            return None

        entries = self._parse_earnings(data)
        # Filter by symbol and find the entry with actual results
        for entry in entries:
            if entry.get("symbol") == symbol and entry.get("epsActual") is not None:
                return entry
        return None

    def _parse_earnings(self, raw_earnings: list) -> list[dict]:
        """Parse FMP earnings calendar data."""
        parsed = []
        for item in raw_earnings:
            if not item.get("symbol"):
                continue

            parsed.append({
                "symbol": item.get("symbol", ""),
                "date": item.get("date", ""),
                "epsEstimated": self._safe_float(item.get("epsEstimated")),
                "epsActual": self._safe_float(item.get("epsActual")),
                "revenueEstimated": self._safe_float(item.get("revenueEstimated")),
                "revenueActual": self._safe_float(item.get("revenueActual")),
                "time": item.get("time", ""),
                "lastUpdated": item.get("lastUpdated", ""),
            })

        return parsed

    def get_major_earnings(self, days: int = 14, min_market_cap: float = 10e9) -> dict:
        """
        Get upcoming earnings for major companies (large cap).

        Filters for well-known tickers and large market cap companies.

        Args:
            days: Number of days to look ahead (default: 7)
            min_market_cap: Minimum market cap filter (not used directly, but filters known tickers)

        Returns:
            Filtered earnings with only major companies
        """
        logger.info("get_major_earnings(days=%d)", days)

        # Major tickers - Tech worker focused
        major_tickers = {
            # Mag 7
            "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
            # AI Chips
            "AMD", "AVGO", "ARM", "SMCI", "MRVL", "QCOM", "INTC",
            # Storage (HBM/Memory)
            "MU", "WDC", "STX",
            # Semiconductor Equipment
            "TSM", "ASML", "AMAT", "LRCX",
            # AI/Cloud Software
            "CRM", "ORCL", "NOW", "SNOW", "PLTR", "NET", "DDOG", "CRWD", "PANW",
            # China Tech
            "BABA", "PDD", "JD", "BIDU", "NIO", "LI",
            # Consumer Tech
            "UBER", "ABNB", "NFLX", "DIS",
            # Fintech/Crypto
            "COIN", "SQ", "PYPL", "V", "MA",
            # Financials (major only)
            "JPM", "GS",
            # 2024-2025 Hot
            "LLY", "RDDT",
            # ETFs
            "SPY", "QQQ",
        }

        calendar = self.get_earnings_calendar(days=days)

        if calendar.get("status") != "success":
            return calendar

        # Filter for major tickers only
        major_earnings = [
            earning for earning in calendar["earnings"]
            if earning["symbol"] in major_tickers
        ]

        # Mark AI-related companies
        ai_tickers = {"NVDA", "AMD", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "TSM", "SMCI", "AVGO", "ARM", "PLTR", "SNOW", "MU", "MRVL", "ASML", "AMAT", "LRCX", "NET", "DDOG", "CRWD"}
        for earning in major_earnings:
            earning["is_ai_related"] = earning["symbol"] in ai_tickers

        return {
            "status": "success",
            "earnings_count": len(major_earnings),
            "earnings": major_earnings,
            "date_range": calendar["date_range"],
            "filter": "Major companies only",
            "source": "fmp",
        }

    def _empty_earnings_response(self, error: str = None) -> dict:
        """Return empty earnings response structure"""
        return {
            "status": "error" if error else "success",
            "earnings_count": 0,
            "earnings": [],
            "date_range": None,
            "source": "fmp",
            "error": error,
        }

    # =========================================================================
    # Commodities Quotes
    # =========================================================================

    def get_commodity_quotes(self, symbols: list[str] = None) -> dict:
        """
        Get real-time commodity quotes from FMP.

        Args:
            symbols: List of commodity symbols (default: ["GCUSD", "BZUSD"])
                    GCUSD = Gold, BZUSD = Brent Crude Oil (CLUSD requires higher tier)

        Returns:
            {
                "status": "success|error",
                "commodities": {
                    "Gold": {"price": 4330.5, "change": -7.2, "changePercent": -0.17, ...},
                    "Oil": {"price": 72.5, "change": 0.8, "changePercent": 1.1, ...}
                },
                "source": "fmp"
            }
        """
        # Use BZUSD (Brent Crude) instead of CLUSD (WTI) - CLUSD requires higher subscription
        symbols = symbols or ["GCUSD", "BZUSD"]

        logger.info("get_commodity_quotes(symbols=%s)", symbols)

        # Fetch each symbol individually (stable API may not support comma-separated)
        all_data = []
        for symbol in symbols:
            data = self._request("/stable/quote", {"symbol": symbol})
            if data and isinstance(data, list):
                all_data.extend(data)

        if not all_data:
            return self._empty_commodity_response("No commodity data returned")

        # Map FMP symbols to friendly names
        symbol_names = {
            "XAUUSD": "Gold",    # Gold Spot
            "GCUSD": "Gold",     # Gold Futures (legacy)
            "BZUSD": "Oil",      # Brent Crude (CLUSD/WTI requires higher tier)
            "CLUSD": "Oil",      # WTI Crude (fallback if available)
            "SIUSD": "Silver",
            "NGUSD": "Natural Gas",
            "HGUSD": "Copper",
        }

        commodities = {}
        for item in all_data:
            symbol = item.get("symbol", "")
            name = symbol_names.get(symbol, symbol)

            commodities[name] = {
                "price": self._safe_float(item.get("price")),
                "change": self._safe_float(item.get("change")),
                "changePercent": self._safe_float(item.get("changePercentage")),
                "dayLow": self._safe_float(item.get("dayLow")),
                "dayHigh": self._safe_float(item.get("dayHigh")),
                "previousClose": self._safe_float(item.get("previousClose")),
                "open": self._safe_float(item.get("open")),
                "volume": item.get("volume"),
                "timestamp": item.get("timestamp"),
                "symbol": symbol,
            }

        return {
            "status": "success",
            "commodities": commodities,
            "source": "fmp",
        }

    def _empty_commodity_response(self, error: str = None) -> dict:
        """Return empty commodity response structure"""
        return {
            "status": "error" if error else "success",
            "commodities": {},
            "source": "fmp",
            "error": error,
        }

    def get_commodity_historical(self, symbol: str = "GCUSD", days: int = 30) -> dict:
        """
        Get historical daily price data for a commodity.

        Args:
            symbol: Commodity symbol (e.g., "GCUSD" for Gold, "BZUSD" for Brent Oil)
            days: Number of days of historical data to fetch (default: 30)

        Returns:
            {
                "status": "success|error",
                "symbol": "GCUSD",
                "historical": [
                    {"date": "2024-01-15", "open": 2650.0, "high": 2660.0, "low": 2640.0, "close": 2655.0},
                    ...
                ],
                "source": "fmp"
            }
        """
        logger.info("get_commodity_historical(symbol=%s, days=%d)", symbol, days)

        # FMP stable API endpoint (migrated from legacy v3)
        data = self._request(f"/stable/historical-price-eod/full", params={"symbol": symbol})

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "symbol": symbol,
                "historical": [],
                "source": "fmp",
                "error": "No historical data returned",
            }

        historical = data
        if not historical:
            return {
                "status": "error",
                "symbol": symbol,
                "historical": [],
                "source": "fmp",
                "error": "Empty historical data",
            }

        # Limit to requested days and parse
        parsed = []
        for item in historical[:days]:
            parsed.append({
                "date": item.get("date", ""),
                "open": self._safe_float(item.get("open")),
                "high": self._safe_float(item.get("high")),
                "low": self._safe_float(item.get("low")),
                "close": self._safe_float(item.get("close")),
                "volume": item.get("volume"),
            })

        return {
            "status": "success",
            "symbol": symbol,
            "historical": parsed,
            "source": "fmp",
        }

    def get_index_quote(self, symbol: str) -> dict:
        """
        Get real-time quote for an index (VIX, etc.)

        Args:
            symbol: Index symbol (e.g., "^VIX")

        Returns:
            Quote data or None
        """
        logger.info("get_index_quote(symbol=%s)", symbol)

        # Use stable API endpoint with symbol parameter
        data = self._request("/stable/quote", {"symbol": symbol})

        if not data or not isinstance(data, list) or len(data) == 0:
            return None

        item = data[0]
        return {
            "price": self._safe_float(item.get("price")),
            "change": self._safe_float(item.get("change")),
            "changePercent": self._safe_float(item.get("changePercentage")),
            "dayLow": self._safe_float(item.get("dayLow")),
            "dayHigh": self._safe_float(item.get("dayHigh")),
            "previousClose": self._safe_float(item.get("previousClose")),
            "symbol": item.get("symbol"),
        }

    # =========================================================================
    # Stock Search (for Watchlist)
    # =========================================================================

    def _get_stock_list(self) -> list:
        """
        Get cached stock list or fetch from FMP.
        Uses /stable/stock-list endpoint with 24-hour cache.
        """
        global _stock_list_cache

        # Check cache
        if "list" in _stock_list_cache:
            data, timestamp = _stock_list_cache["list"]
            if time.time() - timestamp < _STOCK_LIST_TTL:
                return data

        # Fetch from FMP stable endpoint
        logger.info("Fetching stock list from /stable/stock-list...")
        data = self._request("/stable/stock-list")

        if data and isinstance(data, list):
            _stock_list_cache["list"] = (data, time.time())
            logger.info("Cached %d stocks", len(data))
            return data

        return []

    def search_stocks(self, query: str, limit: int = 15) -> dict:
        """
        Search for stocks by symbol or company name.
        Combines cached stock list + FMP search APIs, with dedup and ranking.
        """
        logger.info("search_stocks(query=%s, limit=%d)", query, limit)

        # 1. Local search from cached stock list
        stock_list = self._get_stock_list()
        if not stock_list:
            return {"status": "error", "stocks": [], "error": "Failed to fetch stock list"}

        query_upper = query.upper().strip()
        query_lower = query.lower().strip()
        raw_results = []

        for stock in stock_list:
            symbol = stock.get("symbol", "")
            name = stock.get("companyName", "") or stock.get("name", "")
            if not symbol:
                continue

            symbol_upper = symbol.upper()
            name_lower = name.lower()

            score = 0
            if symbol_upper == query_upper:
                score = 100
            elif _symbol_root(symbol_upper) == query_upper:
                score = 90
            elif symbol_upper.startswith(query_upper):
                score = 80
            elif query_upper in symbol_upper:
                score = 60
            elif query_lower in name_lower:
                score = 40
            else:
                continue

            # /stable/stock-list has no exchange field; keep whatever is present
            # for the output row but rank by symbol shape (see _symbol_kind).
            exchange = stock.get("exchangeShortName") or stock.get("exchange") or stock.get("stockExchange") or ""
            kind = _symbol_kind(symbol)

            # Boost 1: US-traded listing (NYSE/NASDAQ/AMEX/OTC -> dotless symbol)
            if kind == "us":
                score += 5
            # Boost 2: home-market primary listing (.KS/.T/.HK ... )
            elif kind == "primary":
                score += 6

            # Boost 3: parent company (query matches start + generic suffix)
            # "Samsung" -> "Samsung Electronics" gets +8, "Samsung Card" doesn't
            name_words = name_lower.split()
            if name_words and name_words[0] == query_lower:
                generic = {"electronics", "motor", "group", "corp", "corporation",
                           "inc", "ltd", "holdings", "co", "plc", "financial"}
                if len(name_words) > 1 and name_words[1].rstrip(".,") in generic:
                    score += 8

            raw_results.append({
                "symbol": symbol,
                "name": name,
                "type": "ETF" if "ETF" in name.upper() else "Equity",
                "exchange": exchange,
                "_score": score,
                "_norm": _norm_company_name(name),
            })

        # 2. Supplement with FMP search APIs (finds stocks not in stock list)
        seen_symbols = {r["symbol"] for r in raw_results}
        for endpoint in ["/stable/search-name", "/stable/search-symbol"]:
            try:
                data = self._request(endpoint, {"query": query, "limit": 10})
                if not data or not isinstance(data, list):
                    continue
                for item in data:
                    sym = item.get("symbol", "")
                    if not sym or sym in seen_symbols:
                        continue
                    seen_symbols.add(sym)
                    exchange = item.get("exchangeShortName") or item.get("exchange", "")
                    name = item.get("name", "")
                    score = 35
                    kind = _symbol_kind(sym)
                    if kind == "us":
                        score += 5
                    elif kind == "primary":
                        score += 6
                    raw_results.append({
                        "symbol": sym,
                        "name": name,
                        "type": "Equity",
                        "exchange": exchange,
                        "_score": score,
                        "_norm": _norm_company_name(name),
                    })
            except Exception:
                logger.debug("FMP search API %s failed for query=%s", endpoint, query)

        # 3. Sort by score, then a minimal tie-break that prefers the common US
        #    ticker over preferred/dotted siblings WITHOUT demoting class shares
        #    (BRK-A/BRK-B). Stable sort preserves stock-list order otherwise.
        raw_results.sort(key=lambda x: (-x["_score"], _dedup_rank(x["symbol"])))

        # 4. Dedup. Distinct share classes (BRK-A vs BRK-B) stay separate rows;
        #    same-name + same-class listings collapse to the highest score
        #    (first due to the sort). When a company has a US/home-market
        #    listing, its thin foreign cross-listings are dropped entirely.
        primary_names = {r["_norm"] for r in raw_results
                         if _symbol_kind(r["symbol"]) in ("us", "primary")}

        deduped = []
        seen_keys: set[tuple[str, str]] = set()
        for r in raw_results:
            norm = r["_norm"]

            # Suppress thin foreign cross-listings when a primary listing exists.
            if _symbol_kind(r["symbol"]) == "foreign" and norm in primary_names:
                continue

            key = (norm, _share_class_token(r["symbol"]))
            if key in seen_keys:
                # Already have this company+class - skip (first one scored higher)
                continue
            seen_keys.add(key)
            deduped.append(r)

            if len(deduped) >= limit:
                break

        # Remove internal fields
        for r in deduped:
            r.pop("_score", None)
            r.pop("_norm", None)

        return {
            "status": "success",
            "stocks": deduped,
        }

    # =========================================================================
    # Stock Quotes (for Watchlist) - with Caching
    # =========================================================================

    def get_stock_quotes(self, symbols: list[str], use_cache: bool = True) -> dict:
        """
        Get real-time quotes for multiple stocks with caching.
        Uses /stable/quote endpoint (one symbol at a time).

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
                        "daily_change": 1.27,
                        "previous_close": 193.05,
                        "day_high": 196.20,
                        "day_low": 194.10,
                        "cached": true/false
                    },
                    ...
                ],
                "from_cache": int (count of cached results)
            }
        """
        if not symbols:
            return {"status": "success", "quotes": [], "from_cache": 0}

        symbols_upper = [s.upper() for s in symbols]
        logger.info("get_stock_quotes(symbols=%d symbols, use_cache=%s)", len(symbols_upper), use_cache)

        # Step 1: Check cache for existing quotes
        quotes_dict: dict[str, dict] = {}
        symbols_to_fetch: list[str] = []

        if use_cache:
            cached_results, missing = _quote_cache.get_many(symbols_upper)
            for symbol, quote in cached_results.items():
                quote_copy = quote.copy()
                quote_copy["cached"] = True
                quotes_dict[symbol] = quote_copy
            symbols_to_fetch = missing
        else:
            symbols_to_fetch = symbols_upper

        cached_count = len(quotes_dict)

        # Step 2: Fetch missing quotes with request coalescing
        if symbols_to_fetch:
            # Create a batch key for request coalescing
            # Sort symbols to ensure same batch regardless of order
            batch_key = ",".join(sorted(symbols_to_fetch[:100]))

            # Try to acquire fetch lock (request coalescing)
            is_leader, event = _quote_cache.acquire_fetch_lock(batch_key)

            if is_leader:
                # This request is the leader - actually fetch data
                try:
                    fetched_quotes = self._fetch_quotes_from_api(symbols_to_fetch[:100])

                    # Cache all fetched results
                    if use_cache and fetched_quotes:
                        cache_items = {}
                        for quote in fetched_quotes:
                            cache_copy = quote.copy()
                            cache_copy["cached"] = False
                            cache_items[quote["symbol"]] = cache_copy
                        _quote_cache.set_many(cache_items)

                    # Add to results
                    for quote in fetched_quotes:
                        quotes_dict[quote["symbol"]] = quote

                finally:
                    # Always release lock to unblock waiting requests
                    _quote_cache.release_fetch_lock(batch_key)
            else:
                # Another request is fetching - wait for it
                logger.info("Waiting for concurrent request to complete...")
                event.wait(timeout=30)  # Wait up to 30 seconds

                # Now get from cache (the leader should have populated it)
                for symbol in symbols_to_fetch:
                    cached = _quote_cache.get(symbol)
                    if cached:
                        quote_copy = cached.copy()
                        quote_copy["cached"] = True
                        quotes_dict[symbol] = quote_copy

        # Step 3: Build result in original order
        quotes = []
        for symbol in symbols_upper:
            if symbol in quotes_dict:
                quotes.append(quotes_dict[symbol])

        return {
            "status": "success",
            "quotes": quotes,
            "from_cache": cached_count,
        }

    def _fetch_quotes_from_api(self, symbols: list[str]) -> list[dict]:
        """
        Internal method to fetch quotes from FMP API.
        Tries batch endpoint first, falls back to individual requests.
        """
        fetched_quotes = []

        # Try batch endpoint first (more efficient, but requires higher plan)
        symbols_str = ",".join(symbols)
        data = self._request(f"/stable/batch-quote", {"symbols": symbols_str})

        if data and isinstance(data, list):
            # Batch API succeeded
            for item in data:
                quote = {
                    "symbol": item.get("symbol", ""),
                    "name": item.get("name", ""),
                    "price": self._safe_float(item.get("price"), 0),
                    "daily_change": self._safe_float(item.get("changePercentage"), 0),
                    "previous_close": self._safe_float(item.get("previousClose"), 0),
                    "day_high": self._safe_float(item.get("dayHigh"), 0),
                    "day_low": self._safe_float(item.get("dayLow"), 0),
                    "cached": False,
                }
                fetched_quotes.append(quote)
            logger.info("Batch fetched %d quotes in one request", len(fetched_quotes))
        else:
            # Fallback: fetch individually (for lower-tier API plans)
            logger.info("Batch API unavailable, fetching %d quotes individually", len(symbols))
            for symbol in symbols:
                item = self._request(f"/stable/quote", {"symbol": symbol})
                if item and isinstance(item, list) and len(item) > 0:
                    item = item[0]
                    quote = {
                        "symbol": item.get("symbol", symbol),
                        "name": item.get("name", ""),
                        "price": self._safe_float(item.get("price"), 0),
                        "daily_change": self._safe_float(item.get("changePercentage"), 0),
                        "previous_close": self._safe_float(item.get("previousClose"), 0),
                        "day_high": self._safe_float(item.get("dayHigh"), 0),
                        "day_low": self._safe_float(item.get("dayLow"), 0),
                        "cached": False,
                    }
                    fetched_quotes.append(quote)
            logger.info("Fetched %d quotes individually", len(fetched_quotes))

        return fetched_quotes

    def clear_quote_cache(self) -> None:
        """Clear the quote cache"""
        _quote_cache.clear()
        logger.info("Quote cache cleared")

    # =========================================================================
    # Peer Comparison & Industry Valuation
    # =========================================================================

    def get_stock_peers(self, symbol: str) -> dict:
        """
        Get peer companies in the same industry and market cap range.

        Args:
            symbol: Stock ticker symbol (e.g., "AAPL")

        Returns:
            {
                "status": "success|error",
                "symbol": "AAPL",
                "peers": [{"symbol": "MSFT", "name": "...", "price": ..., "market_cap": ...}, ...],
                "source": "fmp"
            }
        """
        logger.info("get_stock_peers(symbol=%s)", symbol)

        data = self._request("/stable/stock-peers", {"symbol": symbol})

        if not data or not isinstance(data, list) or len(data) == 0:
            return {
                "status": "error",
                "symbol": symbol,
                "peers": [],
                "source": "fmp",
                "error": "No peer data returned",
            }

        # API returns: [{"symbol": "AAPL", "companyName": "...", "price": ..., "mktCap": ...}, ...]
        # Extract peer symbols and basic info
        peers = []
        for item in data[:10]:  # Limit to 10 peers
            peer_symbol = item.get("symbol")
            if peer_symbol and peer_symbol.upper() != symbol.upper():
                peers.append({
                    "symbol": peer_symbol,
                    "name": item.get("companyName", ""),
                    "price": self._safe_float(item.get("price")),
                    "market_cap": self._safe_float(item.get("mktCap")),
                })

        return {
            "status": "success",
            "symbol": symbol,
            "peers": peers,
            "source": "fmp",
        }

    def get_industry_peers(self, industry: str, exclude_symbol: str = None, limit: int = 10) -> dict:
        """
        Get peer companies in the same industry using company screener.
        This is more accurate than stock-peers endpoint.

        Args:
            industry: Industry name (e.g., "Internet Content & Information")
            exclude_symbol: Symbol to exclude from results (usually the target company)
            limit: Maximum number of peers to return

        Returns:
            {
                "status": "success|error",
                "industry": "Internet Content & Information",
                "peers": [{"symbol": "GOOGL", "name": "...", "market_cap": ...}, ...],
                "source": "fmp"
            }
        """
        logger.info("get_industry_peers(industry=%s, exclude=%s)", industry, exclude_symbol)

        # Use company screener with industry filter and minimum market cap
        params = {
            "industry": industry,
            "marketCapMoreThan": 1000000000,  # $1B minimum market cap
            "limit": limit + 5,  # Fetch extra in case we need to filter
            "isActivelyTrading": "true",
        }

        data = self._request("/stable/company-screener", params)

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "industry": industry,
                "peers": [],
                "source": "fmp",
                "error": "No data returned from company screener",
            }

        # Filter and format results
        peers = []
        exclude_upper = exclude_symbol.upper() if exclude_symbol else None

        for item in data:
            symbol = item.get("symbol", "")
            # Skip the target company and inactive stocks
            if exclude_upper and symbol.upper() == exclude_upper:
                continue
            if not item.get("isActivelyTrading", True):
                continue
            # Skip duplicate class shares (e.g., GOOG vs GOOGL, Z vs ZG)
            if symbol in ["GOOG", "ZG"]:
                continue

            peers.append({
                "symbol": symbol,
                "name": item.get("companyName", ""),
                "market_cap": self._safe_float(item.get("marketCap")),
                "price": self._safe_float(item.get("price")),
                "sector": item.get("sector", ""),
            })

            if len(peers) >= limit:
                break

        return {
            "status": "success",
            "industry": industry,
            "peers": peers,
            "source": "fmp",
        }

    def get_industry_pe(self, date: str = None) -> dict:
        """
        Get P/E ratios for all industries.

        Args:
            date: Optional date (YYYY-MM-DD), defaults to latest

        Returns:
            {
                "status": "success|error",
                "date": "2024-02-01",
                "industries": {
                    "Semiconductors": 45.2,
                    "Software - Application": 38.5,
                    ...
                },
                "source": "fmp"
            }
        """
        # Default to yesterday if no date provided (API requires date)
        if not date:
            from datetime import datetime, timedelta
            date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        logger.info("get_industry_pe(date=%s)", date)

        params = {"date": date}

        data = self._request("/stable/industry-pe-snapshot", params)

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "date": date,
                "industries": {},
                "source": "fmp",
                "error": "No industry P/E data returned",
            }

        # Build industry -> PE mapping
        industries = {}
        for item in data:
            industry = item.get("industry")
            pe = self._safe_float(item.get("pe"))
            if industry and pe:
                industries[industry] = pe

        return {
            "status": "success",
            "date": data[0].get("date") if data else date,
            "industries": industries,
            "source": "fmp",
        }

    def get_sector_pe(self, date: str = None) -> dict:
        """
        Get P/E ratios for all sectors.

        Args:
            date: Optional date (YYYY-MM-DD), defaults to latest

        Returns:
            {
                "status": "success|error",
                "date": "2024-02-01",
                "sectors": {
                    "Technology": 35.2,
                    "Healthcare": 22.5,
                    ...
                },
                "source": "fmp"
            }
        """
        # Default to yesterday if no date provided (API requires date)
        if not date:
            from datetime import datetime, timedelta
            date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        logger.info("get_sector_pe(date=%s)", date)

        params = {"date": date}

        data = self._request("/stable/sector-pe-snapshot", params)

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "date": date,
                "sectors": {},
                "source": "fmp",
                "error": "No sector P/E data returned",
            }

        # Build sector -> PE mapping
        sectors = {}
        for item in data:
            sector = item.get("sector")
            pe = self._safe_float(item.get("pe"))
            if sector and pe:
                sectors[sector] = pe

        return {
            "status": "success",
            "date": data[0].get("date") if data else date,
            "sectors": sectors,
            "source": "fmp",
        }

    def get_key_metrics_ttm(self, symbol: str) -> dict:
        """
        Get TTM key metrics for a stock using stable API.
        Uses /stable/ratios-ttm and /stable/key-metrics-ttm for real-time TTM data.
        Falls back to annual endpoints if TTM data is unavailable.

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "symbol": "AAPL",
                "metrics": {
                    "pe_ratio": 28.5,
                    "pb_ratio": 45.2,
                    "ps_ratio": 7.5,
                    "peg_ratio": 2.1,
                    "ev_to_ebitda": 22.3,
                    "roe": 0.85,
                    "roa": 0.25,
                    "dividend_yield": 0.005,
                    ...
                },
                "source": "fmp_ttm" | "fmp_annual"
            }
        """
        logger.info("get_key_metrics_ttm(symbol=%s)", symbol)

        # Try TTM endpoints first (real-time trailing 12 months)
        ratios_data = self._request("/stable/ratios-ttm", {"symbol": symbol})
        metrics_data = self._request("/stable/key-metrics-ttm", {"symbol": symbol})

        def _extract_first(data):
            if not data:
                return {}
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            if isinstance(data, dict):
                return data
            return {}

        ratios = _extract_first(ratios_data)
        metrics_raw = _extract_first(metrics_data)

        # If TTM endpoints returned data, use TTM field names
        if ratios or metrics_raw:
            metrics = {
                # From ratios-ttm
                "pe_ratio": self._safe_float(ratios.get("priceToEarningsRatioTTM")),
                "pb_ratio": self._safe_float(ratios.get("priceToBookRatioTTM")),
                "ps_ratio": self._safe_float(ratios.get("priceToSalesRatioTTM")),
                "peg_ratio": self._safe_float(ratios.get("priceToEarningsGrowthRatioTTM")),
                "gross_margin": self._safe_float(ratios.get("grossProfitMarginTTM")),
                "operating_margin": self._safe_float(ratios.get("operatingProfitMarginTTM")),
                "net_margin": self._safe_float(ratios.get("netProfitMarginTTM")),
                "current_ratio": self._safe_float(ratios.get("currentRatioTTM")),
                "quick_ratio": self._safe_float(ratios.get("quickRatioTTM")),
                "dividend_yield": self._safe_float(ratios.get("dividendYieldTTM")),
                # From key-metrics-ttm
                "ev_to_ebitda": self._safe_float(metrics_raw.get("evToEBITDATTM")),
                "ev_to_revenue": self._safe_float(metrics_raw.get("evToSalesTTM")),
                "roe": self._safe_float(metrics_raw.get("returnOnEquityTTM")),
                "roa": self._safe_float(metrics_raw.get("returnOnAssetsTTM")),
                "roic": self._safe_float(metrics_raw.get("returnOnInvestedCapitalTTM")),
            }
            # dividendYieldTTM is a decimal (e.g. 0.0002), convert to percentage to match annual format
            if metrics["dividend_yield"] is not None:
                metrics["dividend_yield"] = round(metrics["dividend_yield"] * 100, 4)

            return {
                "status": "success",
                "symbol": symbol,
                "metrics": metrics,
                "source": "fmp_ttm",
            }

        # Fallback: annual endpoints
        logger.info("TTM endpoints empty for %s, falling back to annual", symbol)
        ratios_data = self._request("/stable/ratios", {"symbol": symbol})
        metrics_data = self._request("/stable/key-metrics", {"symbol": symbol})

        ratios = _extract_first(ratios_data)
        metrics_raw = _extract_first(metrics_data)

        if not ratios and not metrics_raw:
            return {
                "status": "error",
                "symbol": symbol,
                "metrics": {},
                "source": "fmp",
                "error": "No key metrics data returned",
            }

        metrics = {
            # From ratios (annual)
            "pe_ratio": self._safe_float(ratios.get("priceToEarningsRatio")),
            "pb_ratio": self._safe_float(ratios.get("priceToBookRatio")),
            "ps_ratio": self._safe_float(ratios.get("priceToSalesRatio")),
            "peg_ratio": self._safe_float(ratios.get("priceToEarningsGrowthRatio")),
            "gross_margin": self._safe_float(ratios.get("grossProfitMargin")),
            "operating_margin": self._safe_float(ratios.get("operatingProfitMargin")),
            "net_margin": self._safe_float(ratios.get("netProfitMargin")),
            "current_ratio": self._safe_float(ratios.get("currentRatio")),
            "quick_ratio": self._safe_float(ratios.get("quickRatio")),
            "dividend_yield": self._safe_float(ratios.get("dividendYieldPercentage")),
            # From key-metrics (annual)
            "ev_to_ebitda": self._safe_float(metrics_raw.get("evToEBITDA")),
            "ev_to_revenue": self._safe_float(metrics_raw.get("evToSales")),
            "roe": self._safe_float(metrics_raw.get("returnOnEquity")),
            "roa": self._safe_float(metrics_raw.get("returnOnAssets")),
            "roic": self._safe_float(metrics_raw.get("returnOnInvestedCapital")),
        }

        return {
            "status": "success",
            "symbol": symbol,
            "metrics": metrics,
            "source": "fmp_annual",
        }

    def get_historical_key_metrics(self, symbol: str, period: str = "annual", limit: int = 20) -> dict:
        """
        Get historical key metrics for a stock (for historical valuation comparison).
        Uses stable API endpoints.

        Args:
            symbol: Stock ticker symbol
            period: "quarter" or "annual" (note: quarter may require premium)
            limit: Number of periods to fetch

        Returns:
            {
                "status": "success|error",
                "symbol": "AAPL",
                "period": "annual",
                "metrics": [
                    {
                        "date": "2024-09-30",
                        "pe_ratio": 28.5,
                        "pb_ratio": 45.2,
                        ...
                    },
                    ...
                ],
                "source": "fmp"
            }
        """
        logger.info("get_historical_key_metrics(symbol=%s, period=%s, limit=%d)", symbol, period, limit)

        # Use stable/ratios endpoint (returns historical data by default)
        data = self._request("/stable/ratios", {"symbol": symbol})

        if not data or not isinstance(data, list):
            return {
                "status": "error",
                "symbol": symbol,
                "period": period,
                "metrics": [],
                "source": "fmp",
                "error": "No historical metrics data returned",
            }

        metrics = []
        for item in data[:limit]:
            metrics.append({
                "date": item.get("date"),
                "fiscal_year": item.get("fiscalYear"),
                "period": item.get("period"),
                "pe_ratio": self._safe_float(item.get("priceToEarningsRatio")),
                "pb_ratio": self._safe_float(item.get("priceToBookRatio")),
                "ps_ratio": self._safe_float(item.get("priceToSalesRatio")),
                "peg_ratio": self._safe_float(item.get("priceToEarningsGrowthRatio")),
                "ev_to_ebitda": self._safe_float(item.get("enterpriseValueMultiple")),
                "gross_margin": self._safe_float(item.get("grossProfitMargin")),
                "net_margin": self._safe_float(item.get("netProfitMargin")),
            })

        return {
            "status": "success",
            "symbol": symbol,
            "period": period,
            "metrics": metrics,
            "source": "fmp",
        }

    # =========================================================================
    # Financial Statement Methods (replacing OpenBB)
    # Serialization logic copied from openbb_service.py, adapted for FMP JSON
    # =========================================================================

    def get_company_profile_detail(self, symbol: str) -> dict:
        """
        Get company profile from FMP /stable/profile.
        Replaces openbb.get_company_profile().
        """
        logger.info("get_company_profile_detail(symbol=%s)", symbol)

        data = self._request("/stable/profile", {"symbol": symbol})

        if not data or not isinstance(data, list) or len(data) == 0:
            return {}

        raw = data[0]
        company_name = raw.get("companyName") or symbol
        description_en = raw.get("description")

        return {
            "company_name": company_name,
            "exchange": raw.get("exchangeShortName") or raw.get("exchange"),
            "currency": raw.get("currency") or "USD",
            "country": raw.get("country"),
            "classification": {
                "sector": raw.get("sector"),
                "industry": raw.get("industry"),
            },
            "description": {
                "en": description_en,
            },
            "company_details": {
                "ceo": raw.get("ceo"),
                "employees": raw.get("fullTimeEmployees"),
                "website": raw.get("website"),
                "ipo_date": raw.get("ipoDate"),
                "country": raw.get("country"),
                "city": raw.get("city"),
                "address": raw.get("address"),
                "phone": raw.get("phone"),
                "image": raw.get("image"),
                "state": raw.get("state"),
                "postal_code": raw.get("zip"),
            },
        }

    def get_income_statement(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
        """
        Get income statements from FMP /stable/income-statement.
        Replaces openbb.get_income_statements().
        Serialization format matches OpenBB output exactly.
        """
        logger.info("get_income_statement(symbol=%s, period=%s, limit=%d)", symbol, period, limit)

        data = self._request("/stable/income-statement", {
            "symbol": symbol,
            "period": period,
            "limit": limit,
        })

        if not data or not isinstance(data, list):
            return []

        items = [self._serialize_income_stmt(item) for item in data]
        items.sort(key=lambda x: x.get("date") or "", reverse=True)
        return items

    def get_balance_sheet(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
        """
        Get balance sheets from FMP /stable/balance-sheet-statement.
        Replaces openbb.get_balance_sheets().
        Serialization format matches OpenBB output exactly.
        """
        logger.info("get_balance_sheet(symbol=%s, period=%s, limit=%d)", symbol, period, limit)

        data = self._request("/stable/balance-sheet-statement", {
            "symbol": symbol,
            "period": period,
            "limit": limit,
        })

        if not data or not isinstance(data, list):
            return []

        items = [self._serialize_balance_stmt(item) for item in data]
        items.sort(key=lambda x: x.get("date") or "", reverse=True)
        return items

    def get_cash_flow_statement(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
        """
        Get cash flow statements from FMP /stable/cash-flow-statement.
        Replaces openbb.get_cash_flows().
        Serialization format matches OpenBB output exactly.
        """
        logger.info("get_cash_flow_statement(symbol=%s, period=%s, limit=%d)", symbol, period, limit)

        data = self._request("/stable/cash-flow-statement", {
            "symbol": symbol,
            "period": period,
            "limit": limit,
        })

        if not data or not isinstance(data, list):
            return []

        items = [self._serialize_cash_flow_stmt(item) for item in data]
        items.sort(key=lambda x: x.get("date") or "", reverse=True)
        return items

    # =========================================================================
    # Serialization helpers (adapted from openbb_service.py)
    # Field mappings handle FMP's camelCase JSON fields
    # =========================================================================

    def _serialize_income_stmt(self, item: dict) -> dict:
        """Serialize FMP income statement JSON — comprehensive field set."""
        revenue = item.get("revenue")
        gross_profit = item.get("grossProfit")
        operating_income = item.get("operatingIncome")
        net_income = item.get("netIncome")

        return {
            "date": item.get("date") or "",
            "fiscal_year": item.get("calendarYear") or item.get("fiscalYear"),
            "fiscal_period": item.get("period"),
            # Revenue & Cost
            "revenue": revenue,
            "cost_of_revenue": item.get("costOfRevenue"),
            "gross_profit": gross_profit,
            "gross_profit_margin": self._safe_divide_val(gross_profit, revenue),
            # Expenses breakdown
            "research_and_development": item.get("researchAndDevelopmentExpenses"),
            "selling_and_marketing": item.get("sellingAndMarketingExpenses"),
            "general_and_administrative": item.get("generalAndAdministrativeExpenses"),
            "sga_expenses": item.get("sellingGeneralAndAdministrativeExpenses"),
            "operating_expenses": item.get("operatingExpenses"),
            "total_costs_and_expenses": item.get("costAndExpenses"),
            # Operating & Net
            "operating_income": operating_income,
            "operating_income_margin": self._safe_divide_val(operating_income, revenue),
            "interest_income": item.get("interestIncome"),
            "interest_expense": item.get("interestExpense"),
            "income_before_tax": item.get("incomeBeforeTax"),
            "income_tax_expense": item.get("incomeTaxExpense"),
            "net_income": net_income,
            "net_income_margin": self._safe_divide_val(net_income, revenue),
            # Per-share
            "eps": item.get("eps"),
            "eps_diluted": item.get("epsdiluted") or item.get("epsDiluted"),
            "weighted_avg_shares": item.get("weightedAverageShsOut"),
            "weighted_avg_shares_diluted": item.get("weightedAverageShsOutDil"),
            # Other
            "ebitda": item.get("ebitda"),
            "depreciation_and_amortization": item.get("depreciationAndAmortization"),
        }

    def _serialize_balance_stmt(self, item: dict) -> dict:
        """Serialize FMP balance sheet JSON — comprehensive field set."""
        return {
            "date": item.get("date") or "",
            "fiscal_year": item.get("calendarYear") or item.get("fiscalYear"),
            "fiscal_period": item.get("period"),
            # Assets
            "cash_and_equivalents": item.get("cashAndCashEquivalents"),
            "short_term_investments": item.get("shortTermInvestments"),
            "cash_and_short_term_investments": item.get("cashAndShortTermInvestments"),
            "net_receivables": item.get("netReceivables"),
            "inventory": item.get("inventory"),
            "total_current_assets": item.get("totalCurrentAssets"),
            "property_plant_equipment": item.get("propertyPlantEquipmentNet"),
            "goodwill": item.get("goodwill"),
            "intangible_assets": item.get("goodwillAndIntangibleAssets"),
            "long_term_investments": item.get("longTermInvestments"),
            "total_non_current_assets": item.get("totalNonCurrentAssets"),
            "total_assets": item.get("totalAssets"),
            # Liabilities
            "accounts_payable": item.get("accountPayables"),
            "total_current_liabilities": item.get("totalCurrentLiabilities"),
            "long_term_debt": item.get("longTermDebt"),
            "total_non_current_liabilities": item.get("totalNonCurrentLiabilities"),
            "total_liabilities": item.get("totalLiabilities"),
            "total_debt": item.get("totalDebt"),
            "net_debt": item.get("netDebt"),
            # Equity
            "total_equity": item.get("totalEquity") or item.get("totalStockholdersEquity"),
            "retained_earnings": item.get("retainedEarnings"),
            "additional_paid_in_capital": item.get("additionalPaidInCapital"),
            # Shares
            "shares_outstanding": item.get("weightedAverageShsOut") or item.get("commonStock"),
        }

    def _serialize_cash_flow_stmt(self, item: dict) -> dict:
        """Serialize FMP cash flow JSON — comprehensive field set."""
        return {
            "date": item.get("date") or "",
            "fiscal_year": item.get("calendarYear") or item.get("fiscalYear"),
            "fiscal_period": item.get("period"),
            # Operating activities
            "net_income": item.get("netIncome"),
            "depreciation_and_amortization": item.get("depreciationAndAmortization"),
            "stock_based_compensation": item.get("stockBasedCompensation"),
            "deferred_income_tax": item.get("deferredIncomeTax"),
            "change_in_working_capital": item.get("changeInWorkingCapital"),
            "accounts_receivables": item.get("accountsReceivables"),
            "accounts_payables": item.get("accountsPayables"),
            "operating_cash_flow": item.get("operatingCashFlow") or item.get("netCashProvidedByOperatingActivities"),
            # Investing activities
            "capital_expenditure": item.get("capitalExpenditure") or item.get("investmentsInPropertyPlantAndEquipment"),
            "acquisitions": item.get("acquisitionsNet"),
            "purchases_of_investments": item.get("purchasesOfInvestments"),
            "sales_of_investments": item.get("salesMaturitiesOfInvestments"),
            "net_cash_from_investing": item.get("netCashProvidedByInvestingActivities") or item.get("netCashUsedForInvestingActivites"),
            # Financing activities
            "net_debt_issuance": item.get("netDebtIssuance") or item.get("longTermNetDebtIssuance"),
            "stock_repurchase": item.get("commonStockRepurchased"),
            "dividends_paid": item.get("commonDividendsPaid") or item.get("dividendsPaid") or item.get("netDividendsPaid"),
            "net_cash_from_financing": item.get("netCashProvidedByFinancingActivities") or item.get("netCashUsedProvidedByFinancingActivities"),
            # Summary
            "net_change_in_cash": item.get("netChangeInCash"),
            "free_cash_flow": item.get("freeCashFlow"),
            "cash_at_end": item.get("cashAtEndOfPeriod"),
            # Tax & Interest paid
            "income_taxes_paid": item.get("incomeTaxesPaid"),
            "interest_paid": item.get("interestPaid"),
        }

    def _safe_divide_val(self, numerator, denominator):
        """Safe division returning None on error. Used by serialization methods."""
        try:
            if numerator is None or denominator is None or denominator == 0:
                return None
            return round(numerator / denominator, 4)
        except (TypeError, ZeroDivisionError):
            return None

    # =========================================================================
    # Analyst Estimates & Segmentation
    # =========================================================================

    def get_quarterly_analyst_estimates(self, symbol: str, limit: int = 4) -> dict:
        """
        Get quarterly analyst estimates (revenue, EPS, EBITDA, net income).

        Args:
            symbol: Stock ticker symbol
            limit: Number of quarters to return (default: 4)

        Returns:
            {
                "status": "success|error",
                "estimates": [...],
                "source": "fmp"
            }
        """
        logger.info("get_quarterly_analyst_estimates(symbol=%s, limit=%d)", symbol, limit)

        try:
            params = {"symbol": symbol, "period": "quarter", "limit": limit}
            data = self._request("/stable/analyst-estimates", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "estimates": [],
                    "source": "fmp",
                    "error": "No analyst estimates data returned",
                }

            estimates = []
            for item in data:
                estimates.append({
                    "date": item.get("date", ""),
                    "eps_avg": item.get("epsAvg"),
                    "eps_low": item.get("epsLow"),
                    "eps_high": item.get("epsHigh"),
                    "revenue_avg": item.get("revenueAvg"),
                    "revenue_low": item.get("revenueLow"),
                    "revenue_high": item.get("revenueHigh"),
                    "ebitda_avg": item.get("ebitdaAvg"),
                    "ebitda_low": item.get("ebitdaLow"),
                    "ebitda_high": item.get("ebitdaHigh"),
                    "net_income_avg": item.get("netIncomeAvg"),
                    "net_income_low": item.get("netIncomeLow"),
                    "net_income_high": item.get("netIncomeHigh"),
                    "num_analysts_eps": item.get("numAnalystsEps"),
                    "num_analysts_revenue": item.get("numAnalystsRevenue"),
                })

            return {
                "status": "success",
                "estimates": estimates,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching analyst estimates for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_revenue_segmentation(self, symbol: str, period: str = "quarter") -> dict:
        """
        Get revenue segmentation by product/business line.

        Args:
            symbol: Stock ticker symbol
            period: "quarter" or "annual" (default: "quarter")

        Returns:
            {
                "status": "success|error",
                "segments": [...],
                "source": "fmp"
            }
        """
        logger.info("get_revenue_segmentation(symbol=%s, period=%s)", symbol, period)

        try:
            params = {"symbol": symbol, "period": period}
            data = self._request("/stable/revenue-product-segmentation", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "segments": [],
                    "source": "fmp",
                    "error": "No revenue segmentation data returned",
                }

            return {
                "status": "success",
                "segments": data,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching revenue segmentation for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_revenue_geo_segmentation(self, symbol: str) -> dict:
        """
        Get revenue segmentation by geographic region.

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "segments": [...],
                "source": "fmp"
            }
        """
        logger.info("get_revenue_geo_segmentation(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/revenue-geographic-segmentation", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "segments": [],
                    "source": "fmp",
                    "error": "No geographic segmentation data returned",
                }

            return {
                "status": "success",
                "segments": data,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching geo segmentation for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_financial_growth(self, symbol: str, period: str = "quarter", limit: int = 8) -> dict:
        """
        Get financial growth metrics (revenue, profit, EPS growth rates).

        Args:
            symbol: Stock ticker symbol
            period: "quarter" or "annual" (default: "quarter")
            limit: Number of periods to return (default: 8)

        Returns:
            {
                "status": "success|error",
                "growth": [...],
                "source": "fmp"
            }
        """
        logger.info("get_financial_growth(symbol=%s, period=%s, limit=%d)", symbol, period, limit)

        try:
            params = {"symbol": symbol, "period": period, "limit": limit}
            data = self._request("/stable/financial-growth", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "growth": [],
                    "source": "fmp",
                    "error": "No financial growth data returned",
                }

            return {
                "status": "success",
                "growth": data,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching financial growth for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    # =========================================================================
    # Insider Trading
    # =========================================================================

    def get_insider_trading_search(self, symbol: str, limit: int = 20) -> dict:
        """
        Get recent insider trading transactions for a stock.

        Args:
            symbol: Stock ticker symbol
            limit: Maximum number of trades to return (default: 20)

        Returns:
            {
                "status": "success|error",
                "trades": [...],
                "source": "fmp"
            }
        """
        logger.info("get_insider_trading_search(symbol=%s, limit=%d)", symbol, limit)

        try:
            params = {"symbol": symbol, "limit": limit}
            data = self._request("/stable/insider-trading/search", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "trades": [],
                    "source": "fmp",
                    "error": "No insider trading data returned",
                }

            return {
                "status": "success",
                "trades": data,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching insider trading for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_insider_trading_statistics(self, symbol: str) -> dict:
        """
        Get insider trading statistics (aggregate buy/sell counts and totals).

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "statistics": [...],
                "source": "fmp"
            }
        """
        logger.info("get_insider_trading_statistics(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/insider-trading/statistics", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "statistics": [],
                    "source": "fmp",
                    "error": "No insider trading statistics returned",
                }

            return {
                "status": "success",
                "statistics": data,
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching insider trading statistics for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    # =========================================================================
    # Valuation & Price Targets
    # =========================================================================

    def get_dcf_valuation(self, symbol: str) -> dict:
        """
        Get discounted cash flow (DCF) valuation for a stock.

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "dcf": float,
                "stock_price": float,
                "source": "fmp"
            }
        """
        logger.info("get_dcf_valuation(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/discounted-cash-flow", params)

            if not data or not isinstance(data, list) or len(data) == 0:
                return {
                    "status": "error",
                    "dcf": None,
                    "stock_price": None,
                    "source": "fmp",
                    "error": "No DCF data returned",
                }

            item = data[0]
            return {
                "status": "success",
                "dcf": self._safe_float(item.get("dcf")),
                "stock_price": self._safe_float(item.get("Stock Price")),
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching DCF valuation for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_price_target_consensus(self, symbol: str) -> dict:
        """
        Get analyst price target consensus (high, low, consensus, median).

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "consensus": {...},
                "source": "fmp"
            }
        """
        logger.info("get_price_target_consensus(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/price-target-consensus", params)

            if not data or not isinstance(data, list) or len(data) == 0:
                return {
                    "status": "error",
                    "consensus": {},
                    "source": "fmp",
                    "error": "No price target consensus data returned",
                }

            return {
                "status": "success",
                "consensus": data[0],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching price target consensus for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    def get_price_target_summary(self, symbol: str) -> dict:
        """
        Get price target summary (counts and averages by time period).

        Args:
            symbol: Stock ticker symbol

        Returns:
            {
                "status": "success|error",
                "summary": {...},
                "source": "fmp"
            }
        """
        logger.info("get_price_target_summary(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/price-target-summary", params)

            if not data or not isinstance(data, list) or len(data) == 0:
                return {
                    "status": "error",
                    "summary": {},
                    "source": "fmp",
                    "error": "No price target summary data returned",
                }

            return {
                "status": "success",
                "summary": data[0],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching price target summary for %s: %s", symbol, e)
            return {"status": "error", "error": str(e)}

    # =========================================================================
    # Analyst Grades (评级)
    # =========================================================================

    def get_stock_grades(self, symbol: str, limit: int = 30) -> dict:
        """
        Get recent analyst grade changes for a stock.

        FMP endpoint: /stable/grades?symbol={symbol}
        Returns list of {date, gradingCompany, previousGrade, newGrade, action}.
        Note: action values observed = "maintain" | "upgrade" | "downgrade" | "initialise"
        """
        logger.info("get_stock_grades(symbol=%s, limit=%d)", symbol, limit)

        try:
            params = {"symbol": symbol, "limit": limit}
            data = self._request("/stable/grades", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "grades": [],
                    "source": "fmp",
                    "error": "No grades data returned",
                }

            return {
                "status": "success",
                "grades": data[:limit],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching stock grades for %s: %s", symbol, e)
            return {"status": "error", "grades": [], "error": str(e)}

    def get_stock_grades_consensus(self, symbol: str) -> dict:
        """
        Get analyst grade consensus summary.

        FMP endpoint: /stable/grades-consensus?symbol={symbol}
        Returns {strongBuy, buy, hold, sell, strongSell, consensus}.
        """
        logger.info("get_stock_grades_consensus(symbol=%s)", symbol)

        try:
            params = {"symbol": symbol}
            data = self._request("/stable/grades-consensus", params)

            if not data or not isinstance(data, list) or len(data) == 0:
                return {
                    "status": "error",
                    "consensus": {},
                    "source": "fmp",
                    "error": "No grades consensus data returned",
                }

            return {
                "status": "success",
                "consensus": data[0],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching grades consensus for %s: %s", symbol, e)
            return {"status": "error", "consensus": {}, "error": str(e)}

    def get_stock_grades_historical(self, symbol: str, limit: int = 24) -> dict:
        """
        Get historical monthly grade distribution for a stock.

        FMP endpoint: /stable/grades-historical?symbol={symbol}
        Returns list of {date, analystRatingsStrongBuy, analystRatingsBuy,
        analystRatingsHold, analystRatingsSell, analystRatingsStrongSell}.
        Data is aggregated by month.
        """
        logger.info("get_stock_grades_historical(symbol=%s, limit=%d)", symbol, limit)

        try:
            params = {"symbol": symbol, "limit": limit}
            data = self._request("/stable/grades-historical", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "timeline": [],
                    "source": "fmp",
                    "error": "No historical grades data returned",
                }

            # FMP returns newest first; keep as-is so UI can decide ordering
            return {
                "status": "success",
                "timeline": data[:limit],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching historical grades for %s: %s", symbol, e)
            return {"status": "error", "timeline": [], "error": str(e)}

    # =========================================================================
    # Press Releases
    # =========================================================================

    def get_press_releases(self, symbol: str, limit: int = 30) -> dict:
        """
        Get official company press releases.

        FMP endpoint: /stable/news/press-releases?symbols={symbol}
        Returns list of {symbol, publishedDate, publisher, title, image, site, text, url}.
        """
        logger.info("get_press_releases(symbol=%s, limit=%d)", symbol, limit)

        try:
            params = {"symbols": symbol, "limit": limit}
            data = self._request("/stable/news/press-releases", params)

            if not data or not isinstance(data, list):
                return {
                    "status": "error",
                    "releases": [],
                    "source": "fmp",
                    "error": "No press releases data returned",
                }

            return {
                "status": "success",
                "releases": data[:limit],
                "source": "fmp",
            }
        except Exception as e:
            logger.error("Error fetching press releases for %s: %s", symbol, e)
            return {"status": "error", "releases": [], "error": str(e)}

    # =========================================================================
    # Market Heat (gainers/losers/most-actives + sector/industry perf)
    # =========================================================================

    def _last_trading_date(self) -> str:
        """Return yyyy-mm-dd of the most recent US trading day (weekday fallback)."""
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        # Rough: weekday 5=Sat, 6=Sun. Roll back to Friday.
        if now.weekday() == 5:
            now = now - timedelta(days=1)
        elif now.weekday() == 6:
            now = now - timedelta(days=2)
        return now.strftime("%Y-%m-%d")

    def get_biggest_gainers(self) -> dict:
        """
        Get today's biggest stock gainers (top ~50 by % change).

        FMP endpoint: /stable/biggest-gainers
        Returns {symbol, price, name, change, changesPercentage, exchange}.
        """
        logger.info("get_biggest_gainers()")
        try:
            data = self._request("/stable/biggest-gainers", {})
            if not data or not isinstance(data, list):
                return {"status": "error", "stocks": [], "source": "fmp"}
            return {"status": "success", "stocks": data, "source": "fmp"}
        except Exception as e:
            logger.error("Error fetching biggest gainers: %s", e)
            return {"status": "error", "stocks": [], "error": str(e)}

    def get_biggest_losers(self) -> dict:
        """Get today's biggest stock losers."""
        logger.info("get_biggest_losers()")
        try:
            data = self._request("/stable/biggest-losers", {})
            if not data or not isinstance(data, list):
                return {"status": "error", "stocks": [], "source": "fmp"}
            return {"status": "success", "stocks": data, "source": "fmp"}
        except Exception as e:
            logger.error("Error fetching biggest losers: %s", e)
            return {"status": "error", "stocks": [], "error": str(e)}

    def get_most_actives(self) -> dict:
        """Get today's most actively traded stocks (by volume)."""
        logger.info("get_most_actives()")
        try:
            data = self._request("/stable/most-actives", {})
            if not data or not isinstance(data, list):
                return {"status": "error", "stocks": [], "source": "fmp"}
            return {"status": "success", "stocks": data, "source": "fmp"}
        except Exception as e:
            logger.error("Error fetching most actives: %s", e)
            return {"status": "error", "stocks": [], "error": str(e)}

    def get_sector_performance_snapshot(self, date: str = None) -> dict:
        """
        Get sector average performance snapshot for a date.

        FMP endpoint: /stable/sector-performance-snapshot?date=YYYY-MM-DD
        If date omitted, uses the most recent trading day.
        Returns list of {date, sector, exchange, averageChange}.
        """
        date = date or self._last_trading_date()
        logger.info("get_sector_performance_snapshot(date=%s)", date)
        try:
            data = self._request("/stable/sector-performance-snapshot", {"date": date})
            if not data or not isinstance(data, list):
                return {"status": "error", "sectors": [], "source": "fmp"}
            return {"status": "success", "sectors": data, "source": "fmp", "date": date}
        except Exception as e:
            logger.error("Error fetching sector perf snapshot: %s", e)
            return {"status": "error", "sectors": [], "error": str(e)}

    def get_industry_performance_snapshot(self, date: str = None) -> dict:
        """
        Get industry average performance snapshot for a date.

        FMP endpoint: /stable/industry-performance-snapshot?date=YYYY-MM-DD
        Returns list of {date, industry, exchange, averageChange}.
        """
        date = date or self._last_trading_date()
        logger.info("get_industry_performance_snapshot(date=%s)", date)
        try:
            data = self._request("/stable/industry-performance-snapshot", {"date": date})
            if not data or not isinstance(data, list):
                return {"status": "error", "industries": [], "source": "fmp"}
            return {"status": "success", "industries": data, "source": "fmp", "date": date}
        except Exception as e:
            logger.error("Error fetching industry perf snapshot: %s", e)
            return {"status": "error", "industries": [], "error": str(e)}

    # =========================================================================
    # Earnings Transcript
    # =========================================================================

    def get_earning_call_transcript(
        self, symbol: str, year: int, quarter: int
    ) -> dict:
        """
        Get full earnings call transcript for a specific company and period.

        Args:
            symbol: Stock ticker symbol
            year: Fiscal year
            quarter: Fiscal quarter (1-4)

        Returns:
            {
                "status": "success|error",
                "symbol": str,
                "year": int,
                "quarter": int,
                "date": str,
                "content": str,   # Full transcript text
                "source": "fmp"
            }
        """
        logger.info(
            "get_earning_call_transcript(%s, year=%d, quarter=%d)",
            symbol, year, quarter,
        )

        params = {"symbol": symbol.upper(), "year": year, "quarter": quarter}
        data = self._request("/stable/earning-call-transcript", params)

        if not data or not isinstance(data, list) or len(data) == 0:
            return {
                "status": "error",
                "symbol": symbol,
                "year": year,
                "quarter": quarter,
                "content": "",
                "source": "fmp",
                "error": "No transcript data available",
            }

        item = data[0]
        return {
            "status": "success",
            "symbol": item.get("symbol", symbol),
            "year": item.get("year", year),
            "quarter": quarter,
            "date": item.get("date", ""),
            "content": item.get("content", ""),
            "source": "fmp",
        }

_fmp_service_instance = None


def get_fmp_service() -> FMPService:
    """Get FMP Service singleton"""
    global _fmp_service_instance
    if _fmp_service_instance is None:
        _fmp_service_instance = FMPService()
    return _fmp_service_instance
