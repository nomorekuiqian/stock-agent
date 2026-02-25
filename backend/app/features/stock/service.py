"""
Stock Service - Individual stock data aggregation and caching.

Responsibilities:
1. Aggregate data from OpenBB Service
2. Manage database cache (profile: 30 days, financials: quarterly)
3. Calculate derived metrics (TTM, valuation multiples)
4. Provide unified data access interface

Cache Strategy:
- Profile: In-memory 30min -> Insforge 30 days -> OpenBB API
- Financials: In-memory 30min -> Insforge -> OpenBB API
- Quote: Always fetch real-time (no cache)
- Analysis: 24 hours TTL (AI-generated content)
"""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.logging import get_logger
from app.shared.openbb_service import get_openbb_service
from app.shared.fmp_service import get_fmp_service
from app.shared.yfinance_service import get_yfinance_service
from app.features.stock.db import (
    get_stock_profile,
    upsert_stock_profile,
    get_stock_financials,
    upsert_stock_financial,
)

logger = get_logger(__name__)


# =============================================================================
# In-memory cache for hot data (reduces Insforge calls)
# =============================================================================

_profile_cache: dict[str, dict[str, Any]] = {}
_financials_cache: dict[str, dict[str, Any]] = {}
_industry_pe_cache: dict[str, dict[str, Any]] = {}  # Industry/sector P/E cache
_cache_lock = threading.Lock()

MEMORY_CACHE_TTL_MINUTES = 30  # Hot cache TTL
MEMORY_CACHE_MAX_SIZE = 500  # Max entries per cache (LRU eviction)
INDUSTRY_PE_CACHE_TTL_HOURS = 6  # Industry P/E rarely changes


def _evict_expired_entries(cache: dict[str, dict[str, Any]]) -> None:
    """Remove expired entries and enforce size limit (LRU)."""
    now = datetime.now()
    # Remove expired entries
    expired_keys = [k for k, v in cache.items() if now >= v["expires"]]
    for k in expired_keys:
        del cache[k]
    # Enforce size limit - remove oldest entries
    if len(cache) > MEMORY_CACHE_MAX_SIZE:
        sorted_keys = sorted(cache.keys(), key=lambda k: cache[k]["expires"])
        for k in sorted_keys[: len(cache) - MEMORY_CACHE_MAX_SIZE]:
            del cache[k]


def _get_cached_profile(symbol: str) -> Optional[dict[str, Any]]:
    """Get profile from in-memory cache if fresh. Returns a copy to prevent mutation."""
    with _cache_lock:
        entry = _profile_cache.get(symbol.upper())
        if entry and datetime.now() < entry["expires"]:
            # Return a shallow copy to prevent cache mutation
            return {**entry["data"]}
    return None


def _set_cached_profile(symbol: str, data: dict[str, Any]) -> None:
    """Cache profile in memory with LRU eviction."""
    with _cache_lock:
        _evict_expired_entries(_profile_cache)
        _profile_cache[symbol.upper()] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=MEMORY_CACHE_TTL_MINUTES),
        }


def _get_cached_financials(symbol: str) -> Optional[list[dict[str, Any]]]:
    """Get financials from in-memory cache if fresh. Returns a copy to prevent mutation."""
    with _cache_lock:
        entry = _financials_cache.get(symbol.upper())
        if entry and datetime.now() < entry["expires"]:
            # Return a shallow copy of the list with shallow copies of each item
            return [{**item} for item in entry["data"]]
    return None


def _set_cached_financials(symbol: str, data: list[dict[str, Any]]) -> None:
    """Cache financials in memory with LRU eviction."""
    with _cache_lock:
        _evict_expired_entries(_financials_cache)
        _financials_cache[symbol.upper()] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=MEMORY_CACHE_TTL_MINUTES),
        }


def _get_cached_industry_pe(cache_key: str) -> Optional[dict[str, Any]]:
    """Get industry/sector P/E from cache if fresh."""
    with _cache_lock:
        entry = _industry_pe_cache.get(cache_key)
        if entry and datetime.now() < entry["expires"]:
            return {**entry["data"]}
    return None


def _set_cached_industry_pe(cache_key: str, data: dict[str, Any]) -> None:
    """Cache industry/sector P/E data with longer TTL (6 hours)."""
    with _cache_lock:
        _industry_pe_cache[cache_key] = {
            "data": data,
            "expires": datetime.now() + timedelta(hours=INDUSTRY_PE_CACHE_TTL_HOURS),
        }


class StockService:
    """Service for fetching and managing individual stock data."""

    _instance = None

    # Cache TTL settings
    PROFILE_TTL_DAYS = 30
    FINANCIALS_FRESHNESS_DAYS = 45  # Consider stale if latest quarter > 45 days old

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        self.openbb = get_openbb_service()
        self.fmp = get_fmp_service()
        self.yfinance = get_yfinance_service()

    async def get_stock_data(self, symbol: str, include_financials: bool = True) -> dict[str, Any]:
        """
        Get complete stock data for a symbol.

        Args:
            symbol: Stock ticker symbol (e.g., 'NVDA')
            include_financials: Whether to include historical financial statements

        Returns:
            Dict with profile, quote, fundamentals, financials, and meta
        """
        symbol = symbol.upper()
        logger.info("Fetching data for %s", symbol)

        # Parallel fetch: profile (cached), quote (real-time), financials (cached),
        # yfinance ticker metrics (TTM + valuation + forward + profitability + growth)
        task_names = ["profile", "quote"]
        tasks = [
            self._get_or_fetch_profile(symbol),
            self.openbb.get_realtime_quote(symbol),
        ]

        if include_financials:
            task_names.append("financials")
            tasks.append(self._get_or_fetch_financials(symbol))

        # One call replaces FMP TTM + old forward metrics
        task_names.append("yf_metrics")
        tasks.append(asyncio.to_thread(self.yfinance.get_ticker_metrics, symbol))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Extract results by name using index mapping
        result_map = {}
        for i, name in enumerate(task_names):
            result_map[name] = results[i] if not isinstance(results[i], Exception) else None

        profile = result_map.get("profile") or {}
        quote = result_map.get("quote") or {}
        financials = result_map.get("financials") or []
        yf_metrics = result_map.get("yf_metrics") or {}

        # Log any errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Error in task %d (%s) for %s: %s", i, task_names[i], symbol, result)

        # Extract metrics directly from yfinance
        ttm = yf_metrics.get("ttm", {})
        valuation = yf_metrics.get("valuation", {})
        forward_data = yf_metrics.get("forward", {})
        profitability = yf_metrics.get("profitability", {})
        growth = self._build_growth(yf_metrics.get("growth", {}), financials)

        return {
            "profile": profile,
            "quote": quote,
            "fundamentals": {
                "ttm": ttm,
                "valuation": valuation,
                "growth": growth,
                "profitability": profitability,
                "analyst_targets": yf_metrics.get("analyst_targets", {}),
                "forward_eps": forward_data.get("forward_eps"),
            },
            "financials": {
                "latest_quarter": financials[0].get("period") if financials else None,
                "quarters": financials[:4] if include_financials else [],  # Recent 4 quarters
            },
            "meta": {
                "symbol": symbol,
                "quote_fetched_at": datetime.now(timezone.utc).isoformat(),
                "profile_from_cache": bool(profile.get("_from_cache")),
                "financials_from_cache": bool(financials and financials[0].get("_from_cache") if financials else False),
                "latest_quarter": financials[0].get("period") if financials else None,
            }
        }

    async def _get_or_fetch_profile(self, symbol: str) -> dict[str, Any]:
        """Get company profile with 3-tier caching: memory -> DB -> API."""
        # 1. Check in-memory cache first (fastest)
        memory_cached = _get_cached_profile(symbol)
        if memory_cached:
            memory_cached["_from_cache"] = True
            logger.info("Using in-memory cached profile for %s", symbol)
            return memory_cached

        # 2. Check Insforge DB cache
        db_cached = await get_stock_profile(symbol)
        if db_cached and self._is_profile_fresh(db_cached):
            db_cached["_from_cache"] = True
            # Store in memory for faster subsequent access
            _set_cached_profile(symbol, db_cached)
            logger.info("Using DB cached profile for %s", symbol)
            return db_cached

        # 3. Fetch from OpenBB API
        logger.info("Fetching profile from OpenBB for %s", symbol)
        profile = await self.openbb.get_company_profile(symbol)

        if profile:
            # Store in both caches (DB async, memory sync)
            _set_cached_profile(symbol, profile)
            task = asyncio.create_task(upsert_stock_profile(symbol, profile))
            task.add_done_callback(
                lambda t: logger.error("DB write error: %s", t.exception())
                if t.exception() else None
            )
            profile["_from_cache"] = False

        return profile if profile else {}

    async def _get_or_fetch_financials(self, symbol: str) -> list[dict[str, Any]]:
        """Get financial statements with 3-tier caching: memory -> DB -> API."""
        # 1. Check in-memory cache first (fastest)
        memory_cached = _get_cached_financials(symbol)
        if memory_cached:
            for item in memory_cached:
                item["_from_cache"] = True
            # Ensure sorted by date descending (newest first)
            memory_cached.sort(key=lambda x: x.get("period") or "", reverse=True)
            logger.info("Using in-memory cached financials for %s", symbol)
            return memory_cached

        # 2. Check Insforge DB cache
        db_cached = await get_stock_financials(symbol)
        if db_cached and self._has_recent_quarter(db_cached):
            for item in db_cached:
                item["_from_cache"] = True
                # Normalize: ensure 'period' field exists (DB stores as 'period_end_date')
                if not item.get("period") and item.get("period_end_date"):
                    item["period"] = item["period_end_date"]
            # Ensure sorted by date descending (newest first)
            db_cached.sort(key=lambda x: x.get("period") or x.get("period_end_date") or "", reverse=True)
            # Store in memory for faster subsequent access
            _set_cached_financials(symbol, db_cached)
            logger.info("Using DB cached financials for %s", symbol)
            return db_cached

        # 3. Fetch from OpenBB API (parallel for speed)
        logger.info("Fetching financials from OpenBB for %s", symbol)
        income, balance, cash = await asyncio.gather(
            self.openbb.get_income_statements(symbol),
            self.openbb.get_balance_sheets(symbol),
            self.openbb.get_cash_flows(symbol),
        )

        if not income:
            logger.warning("No income statement data for %s", symbol)
            return db_cached or []

        # 4. Merge financial statements
        financials = self._merge_financials(income, balance, cash)

        # 5. Store in both caches (memory sync, DB async)
        _set_cached_financials(symbol, financials)
        for f in financials:
            task = asyncio.create_task(upsert_stock_financial(symbol, f))
            task.add_done_callback(
                lambda t: logger.error("DB write error: %s", t.exception())
                if t.exception() else None
            )

        for item in financials:
            item["_from_cache"] = False

        return financials

    def _is_profile_fresh(self, cached: dict[str, Any]) -> bool:
        """Check if cached profile is still fresh (within 30 days)."""
        updated_at = cached.get("updated_at")
        if not updated_at:
            return False

        try:
            # Parse ISO timestamp
            if isinstance(updated_at, str):
                # Handle various ISO formats
                updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            else:
                return False

            # Check if within TTL
            cutoff = datetime.now(updated_dt.tzinfo) - timedelta(days=self.PROFILE_TTL_DAYS)
            return updated_dt > cutoff

        except (ValueError, TypeError) as e:
            logger.warning("Error parsing updated_at: %s", e)
            return False

    def _has_recent_quarter(self, cached: list[dict[str, Any]]) -> bool:
        """Check if cached financials are fresh (latest quarter within 45 days)."""
        if not cached:
            return False

        latest = cached[0]
        period_end = latest.get("period_end_date") or latest.get("period")

        if not period_end:
            return False

        try:
            # Parse date
            if isinstance(period_end, str):
                # Handle dates without timezone (e.g., "2024-09-30")
                if "T" not in period_end and "+" not in period_end:
                    period_dt = datetime.fromisoformat(period_end).replace(tzinfo=timezone.utc)
                else:
                    period_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
            else:
                return False

            # Check freshness - ensure both are timezone-aware
            if period_dt.tzinfo is None:
                period_dt = period_dt.replace(tzinfo=timezone.utc)
            cutoff = datetime.now(timezone.utc) - timedelta(days=self.FINANCIALS_FRESHNESS_DAYS)
            return period_dt > cutoff

        except (ValueError, TypeError) as e:
            logger.warning("Error parsing period_end_date: %s", e)
            return False

    def _merge_financials(
        self,
        income: list[dict[str, Any]],
        balance: list[dict[str, Any]],
        cash: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Merge income statement, balance sheet, and cash flow data by date."""
        # Index by date for O(1) lookup
        balance_by_date = {b.get("date"): b for b in balance}
        cash_by_date = {c.get("date"): c for c in cash}

        result = []
        for inc in income:
            date = inc.get("date")
            result.append({
                "period": date,
                "period_end_date": date,
                "fiscal_year": inc.get("fiscal_year"),
                "fiscal_quarter": inc.get("fiscal_period"),
                "income_statement": inc,
                "balance_sheet": balance_by_date.get(date, {}),
                "cash_flow": cash_by_date.get(date, {}),
            })

        # Sort by date descending (newest first) to ensure consistent order
        result.sort(key=lambda x: x.get("period") or "", reverse=True)

        return result

    def _build_growth(
        self,
        yf_growth: dict[str, Any],
        financials: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Build growth metrics: YoY from yfinance + QoQ from financials.

        yfinance provides revenueGrowth and earningsQuarterlyGrowth (YoY).
        QoQ is still calculated from financial statements (yfinance lacks QoQ).
        """
        growth: dict[str, Any] = {}

        # YoY from yfinance
        rev_yoy = yf_growth.get("revenue_yoy")
        if rev_yoy is not None:
            growth["revenue_yoy"] = rev_yoy

        earnings_yoy = yf_growth.get("earnings_yoy")
        if earnings_yoy is not None:
            growth["net_income_yoy"] = earnings_yoy

        # QoQ from financials (need at least 2 quarters)
        if financials and len(financials) >= 2:
            current = financials[0].get("income_statement", {})
            prev_q = financials[1].get("income_statement", {})
            current_rev = current.get("revenue")
            prev_rev = prev_q.get("revenue")
            if current_rev and prev_rev and prev_rev != 0:
                growth["revenue_qoq"] = round(
                    (current_rev - prev_rev) / abs(prev_rev), 4
                )

        return growth

    async def get_valuation_comparison(self, symbol: str, industry: str = None, sector: str = None) -> dict[str, Any]:
        """
        Get comprehensive valuation comparison data.

        Includes:
        1. Peer comparison (same industry companies)
        2. Industry average P/E
        3. Historical valuation (5-year history)

        Args:
            symbol: Stock ticker symbol
            industry: Company's industry (from profile)
            sector: Company's sector (from profile)

        Returns:
            Dict with peer_comparison, industry_valuation, and historical_valuation
        """
        symbol = symbol.upper()
        logger.info("Getting valuation comparison for %s", symbol)

        # Parallel fetch all valuation data
        tasks = [
            self._get_peer_comparison(symbol, industry),
            self._get_industry_valuation(industry, sector),
            self._get_historical_valuation(symbol),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        peer_comparison = results[0] if not isinstance(results[0], Exception) else {}
        industry_valuation = results[1] if not isinstance(results[1], Exception) else {}
        historical_valuation = results[2] if not isinstance(results[2], Exception) else {}

        # Log errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Error in valuation task %d for %s: %s", i, symbol, result)

        return {
            "peer_comparison": peer_comparison,
            "industry_valuation": industry_valuation,
            "historical_valuation": historical_valuation,
        }

    async def _get_peer_comparison(self, symbol: str, industry: str = None) -> dict[str, Any]:
        """Get peer companies and their key metrics for comparison.

        Uses industry-based filtering for more accurate peer selection.
        """
        # Get peer list using industry-based filtering (run in thread to avoid blocking)
        if industry:
            peers_result = await asyncio.to_thread(
                self.fmp.get_industry_peers, industry, symbol, 6
            )
        else:
            # Fallback to stock-peers if no industry provided
            peers_result = await asyncio.to_thread(self.fmp.get_stock_peers, symbol)

        if peers_result.get("status") != "success" or not peers_result.get("peers"):
            return {"peers": [], "error": "No peer data available"}

        peers_data = peers_result["peers"][:5]  # Limit to 5 peers

        # Get current company's metrics
        company_metrics = await asyncio.to_thread(self.fmp.get_key_metrics_ttm, symbol)

        # Get peer metrics in parallel with semaphore to limit concurrency
        async def fetch_peer_metrics(peer_info):
            peer_symbol = peer_info.get("symbol") if isinstance(peer_info, dict) else peer_info
            if not peer_symbol:
                return None
            try:
                metrics = await asyncio.to_thread(self.fmp.get_key_metrics_ttm, peer_symbol)
                if metrics.get("status") == "success":
                    return {
                        "symbol": peer_symbol,
                        "name": peer_info.get("name", "") if isinstance(peer_info, dict) else "",
                        "metrics": metrics.get("metrics", {}),
                    }
            except Exception as e:
                logger.error("Error fetching metrics for peer %s: %s", peer_symbol, e)
            return None

        # Fetch all peer metrics concurrently (limited by asyncio.to_thread's thread pool)
        peer_results = await asyncio.gather(*[fetch_peer_metrics(p) for p in peers_data])
        peer_metrics = [p for p in peer_results if p is not None]

        return {
            "symbol": symbol,
            "company_metrics": company_metrics.get("metrics", {}) if company_metrics.get("status") == "success" else {},
            "peers": peer_metrics,
        }

    async def _get_industry_valuation(self, industry: str = None, sector: str = None) -> dict[str, Any]:
        """Get industry and sector average P/E ratios with caching."""
        result = {
            "industry": industry,
            "industry_pe": None,
            "sector": sector,
            "sector_pe": None,
        }

        # Check cache for industry P/E
        industry_pe = None
        if industry:
            cache_key = f"industry:{industry}"
            cached = _get_cached_industry_pe(cache_key)
            if cached:
                industry_pe = cached.get("pe")
                logger.info("Using cached industry P/E for %s", industry)
            else:
                industry_data = await asyncio.to_thread(self.fmp.get_industry_pe)
                if industry_data.get("status") == "success":
                    industries = industry_data.get("industries", {})
                    industry_pe = industries.get(industry)
                    if industry_pe:
                        _set_cached_industry_pe(cache_key, {"pe": industry_pe})

        # Check cache for sector P/E
        sector_pe = None
        if sector:
            cache_key = f"sector:{sector}"
            cached = _get_cached_industry_pe(cache_key)
            if cached:
                sector_pe = cached.get("pe")
                logger.info("Using cached sector P/E for %s", sector)
            else:
                sector_data = await asyncio.to_thread(self.fmp.get_sector_pe)
                if sector_data.get("status") == "success":
                    sectors = sector_data.get("sectors", {})
                    sector_pe = sectors.get(sector)
                    if sector_pe:
                        _set_cached_industry_pe(cache_key, {"pe": sector_pe})

        result["industry_pe"] = industry_pe
        result["sector_pe"] = sector_pe

        return result

    async def _get_historical_valuation(self, symbol: str) -> dict[str, Any]:
        """
        Get historical valuation metrics by fiscal year.

        Returns:
            {
                "years": [
                    { "year": "2025", "pe": 28.5, "pb": 45.2, ... },
                    { "year": "2024", "pe": 25.0, "pb": 40.0, ... },
                    ...
                ]
            }
        """
        # Get historical metrics (annual data for 5 years, run in thread to avoid blocking)
        historical = await asyncio.to_thread(
            self.fmp.get_historical_key_metrics, symbol, "annual", 5
        )

        if historical.get("status") != "success" or not historical.get("metrics"):
            return {"error": "No historical data available", "years": []}

        metrics_list = historical.get("metrics", [])
        if not metrics_list:
            return {"error": "Empty historical data", "years": []}

        # Helper to safely round values (handles None and 0 correctly)
        def safe_round(value, decimals=1):
            return round(value, decimals) if value is not None else None

        # Format by year for cleaner display
        years_data = []
        for m in metrics_list:
            fiscal_year = m.get("fiscal_year", "")
            if not fiscal_year and m.get("date"):
                # Extract year from date if fiscal_year not available
                fiscal_year = m.get("date", "")[:4]

            years_data.append({
                "year": fiscal_year,
                "date": m.get("date"),
                "pe": safe_round(m.get("pe_ratio")),
                "pb": safe_round(m.get("pb_ratio")),
                "ps": safe_round(m.get("ps_ratio")),
                "ev_to_ebitda": safe_round(m.get("ev_to_ebitda")),
                "gross_margin": safe_round(m.get("gross_margin") * 100 if m.get("gross_margin") is not None else None),
                "net_margin": safe_round(m.get("net_margin") * 100 if m.get("net_margin") is not None else None),
            })

        return {
            "years": years_data,
        }


# Singleton instance
_stock_service: Optional[StockService] = None


def get_stock_service() -> StockService:
    """Get or create the Stock service singleton."""
    global _stock_service
    if _stock_service is None:
        _stock_service = StockService()
    return _stock_service
