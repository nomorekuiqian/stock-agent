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
from app.shared.data_tools.fundamentals import (
    get_company_profile,
    get_income_statements,
    get_balance_sheets,
    get_cash_flows,
    get_key_metrics_ttm,
    get_historical_metrics,
    get_ticker_snapshot,
)
from app.shared.data_tools.quotes import get_realtime_quote
from app.shared.data_tools.peers import get_peer_companies, get_industry_valuation
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
            asyncio.to_thread(get_realtime_quote, symbol),
        ]

        if include_financials:
            task_names.append("financials")
            tasks.append(self._get_or_fetch_financials(symbol))

        task_names.append("yf_metrics")
        tasks.append(asyncio.to_thread(get_ticker_snapshot, symbol))

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
                "balance_sheet": yf_metrics.get("balance_sheet", {}),
                "market_data": yf_metrics.get("market_data", {}),
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

        # 3. Fetch from FMP API (via data_tools)
        logger.info("Fetching profile from FMP for %s", symbol)
        profile = await asyncio.to_thread(get_company_profile, symbol)

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

        # 3. Fetch from FMP API via data_tools (parallel for speed)
        logger.info("Fetching financials from FMP for %s", symbol)
        income, balance, cash = await asyncio.gather(
            asyncio.to_thread(get_income_statements, symbol),
            asyncio.to_thread(get_balance_sheets, symbol),
            asyncio.to_thread(get_cash_flows, symbol),
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
        peers_result = await asyncio.to_thread(
            get_peer_companies, symbol, industry, 6
        )

        if peers_result.get("status") != "success" or not peers_result.get("peers"):
            return {"peers": [], "error": "No peer data available"}

        peers_data = peers_result["peers"][:5]  # Limit to 5 peers

        # Get current company's metrics
        company_metrics = await asyncio.to_thread(get_key_metrics_ttm, symbol)

        # Get peer metrics in parallel with semaphore to limit concurrency
        async def fetch_peer_metrics(peer_info):
            peer_symbol = peer_info.get("symbol") if isinstance(peer_info, dict) else peer_info
            if not peer_symbol:
                return None
            try:
                metrics = await asyncio.to_thread(get_key_metrics_ttm, peer_symbol)
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
                from app.shared.fmp_service import get_fmp_service
                industry_data = await asyncio.to_thread(get_fmp_service().get_industry_pe)
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
                from app.shared.fmp_service import get_fmp_service
                sector_data = await asyncio.to_thread(get_fmp_service().get_sector_pe)
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
            get_historical_metrics, symbol, "annual", 5
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

    async def get_earnings_data(self, symbol: str) -> dict[str, Any]:
        """
        Aggregate earnings data from multiple sources for the earnings tab.

        Fetches in parallel:
        - yfinance earnings history (EPS actual vs estimate)
        - FMP quarterly analyst estimates
        - FMP revenue segmentation (by product)
        - FMP revenue geographic segmentation
        - FMP financial growth metrics
        - FMP DCF valuation
        - Next earnings date from yfinance info

        Returns:
            Dict matching EarningsDataResponse shape.
        """
        symbol = symbol.upper()
        logger.info("Fetching earnings data for %s", symbol)

        fmp = get_fmp_service()
        yf_svc = get_yfinance_service()

        # Parallel fetch all data sources
        # NOTE: We fetch raw income statements instead of FMP financial-growth
        # because FMP's pre-computed growth metrics use non-standard QoQ methodology,
        # not true YoY. We compute YoY ourselves from raw quarterly data.
        tasks = [
            asyncio.to_thread(yf_svc.get_earnings_history, symbol),
            asyncio.to_thread(fmp.get_quarterly_analyst_estimates, symbol),
            asyncio.to_thread(fmp.get_revenue_segmentation, symbol),
            asyncio.to_thread(fmp.get_revenue_geo_segmentation, symbol),
            asyncio.to_thread(fmp.get_income_statement, symbol, "quarter", 12),
            asyncio.to_thread(fmp.get_dcf_valuation, symbol),
            asyncio.to_thread(self._get_next_earnings_date, symbol),
            asyncio.to_thread(fmp.get_cash_flow_statement, symbol, "quarter", 12),
            asyncio.to_thread(fmp.get_balance_sheet, symbol, "quarter", 12),
        ]

        task_names = [
            "earnings_history", "analyst_estimates", "revenue_segments",
            "revenue_geo_segments", "income_statements", "dcf", "next_earnings",
            "cashflow_statements", "balance_sheets",
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Build result map with error logging
        result_map: dict[str, Any] = {}
        for i, name in enumerate(task_names):
            if isinstance(results[i], Exception):
                logger.error("Error fetching %s for %s: %s", name, symbol, results[i])
                result_map[name] = None
            else:
                result_map[name] = results[i]

        # Extract data from result dicts
        earnings_history_result = result_map.get("earnings_history") or {}
        analyst_result = result_map.get("analyst_estimates") or {}
        rev_seg_result = result_map.get("revenue_segments") or {}
        rev_geo_result = result_map.get("revenue_geo_segments") or {}
        income_stmts = result_map.get("income_statements") or []
        cashflow_stmts = result_map.get("cashflow_statements") or []
        balance_sheets = result_map.get("balance_sheets") or []
        dcf_result = result_map.get("dcf") or {}
        next_earnings = result_map.get("next_earnings")

        # Compute TRUE YoY growth from raw quarterly income statements
        financial_growth = self._compute_yoy_growth(income_stmts)

        return {
            "symbol": symbol,
            "earnings_history": earnings_history_result.get("history", []),
            "analyst_estimates": analyst_result.get("estimates", []),
            "revenue_segments": rev_seg_result.get("segments", []),
            "revenue_geo_segments": rev_geo_result.get("segments", []),
            "financial_growth": financial_growth,
            "next_earnings_date": next_earnings,
            "dcf_value": dcf_result.get("dcf"),
            "stock_price": dcf_result.get("stock_price"),
            "income_statements": income_stmts if isinstance(income_stmts, list) else [],
            "cashflow_statements": cashflow_stmts if isinstance(cashflow_stmts, list) else [],
            "balance_sheets": balance_sheets if isinstance(balance_sheets, list) else [],
        }

    @staticmethod
    def _compute_yoy_growth(income_stmts: list) -> list:
        """Compute true YoY growth by comparing each quarter to the same quarter last year.

        FMP's financial-growth endpoint uses non-standard methodology (appears to be QoQ),
        so we compute YoY ourselves from raw quarterly income statements.
        """
        if not income_stmts or not isinstance(income_stmts, list):
            return []

        growth = []
        for q in income_stmts:
            q_date = q.get("date", "")
            if not q_date or len(q_date) < 10:
                continue

            # Find same quarter from prior year
            try:
                prior_year = str(int(q_date[:4]) - 1)
                target_date = prior_year + q_date[4:]
                prior = next((p for p in income_stmts if p.get("date") == target_date), None)
            except (ValueError, IndexError):
                prior = None

            if not prior:
                continue

            def safe_growth(current_val, prior_val):
                if prior_val is None or prior_val == 0 or current_val is None:
                    return None
                return (current_val - prior_val) / abs(prior_val)

            entry = {
                "date": q_date,
                "period": q.get("fiscal_period", q.get("period", "")),
                "revenueGrowth": safe_growth(q.get("revenue"), prior.get("revenue")),
                "grossProfitGrowth": safe_growth(q.get("gross_profit"), prior.get("gross_profit")),
                "operatingIncomeGrowth": safe_growth(q.get("operating_income"), prior.get("operating_income")),
                "netIncomeGrowth": safe_growth(q.get("net_income"), prior.get("net_income")),
                "epsdilutedGrowth": safe_growth(q.get("eps_diluted"), prior.get("eps_diluted")),
                "freeCashFlowGrowth": None,  # Not in income statement
            }

            # Only include if we have at least revenue growth
            if entry["revenueGrowth"] is not None:
                growth.append(entry)

        return growth

    @staticmethod
    def _get_next_earnings_date(symbol: str) -> Optional[str]:
        """Get next earnings date from yfinance ticker info."""
        try:
            import yfinance as yf
            import warnings

            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                info = yf.Ticker(symbol).info

            timestamp = info.get("earningsTimestamp")
            if timestamp:
                dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
                return dt.strftime("%Y-%m-%d")
        except Exception as e:
            logger.warning("Failed to get next earnings date for %s: %s", symbol, e)
        return None

    def calculate_financial_health_score(self, fundamentals: dict[str, Any]) -> dict[str, Any]:
        """
        Calculate a simplified Piotroski-style F-Score (0-10) from fundamentals data.

        Uses currently available data from get_stock_data() fundamentals dict.
        No YoY comparison needed -- uses threshold-based checks.

        Args:
            fundamentals: The fundamentals dict from get_stock_data
                          (ttm, growth, profitability, balance_sheet)

        Returns:
            {"score": int, "max_score": 10, "details": [{"label": str, "passed": bool}, ...]}
        """
        ttm = fundamentals.get("ttm", {})
        profitability = fundamentals.get("profitability", {})
        balance_sheet = fundamentals.get("balance_sheet", {})
        growth = fundamentals.get("growth", {})

        details = []

        # 1. Net Income > 0
        net_income = ttm.get("net_income")
        passed = net_income is not None and net_income > 0
        details.append({"label": "Net Income > 0", "passed": passed})

        # 2. Operating Cash Flow > 0
        ocf = ttm.get("operating_cash_flow")
        passed = ocf is not None and ocf > 0
        details.append({"label": "Operating Cash Flow > 0", "passed": passed})

        # 3. ROA improvement (proxy: ROE > 0)
        roe = profitability.get("roe")
        passed = roe is not None and roe > 0
        details.append({"label": "ROE > 0 (ROA proxy)", "passed": passed})

        # 4. Earnings quality: OCF > Net Income
        passed = (
            ocf is not None
            and net_income is not None
            and ocf > net_income
        )
        details.append({"label": "OCF > Net Income (Earnings Quality)", "passed": passed})

        # 5. Debt/Equity < 1
        debt_to_equity = balance_sheet.get("debt_to_equity")
        passed = debt_to_equity is not None and debt_to_equity < 1
        details.append({"label": "Debt/Equity < 1", "passed": passed})

        # 6. Current Ratio > 1
        current_ratio = balance_sheet.get("current_ratio")
        passed = current_ratio is not None and current_ratio > 1
        details.append({"label": "Current Ratio > 1", "passed": passed})

        # 7. Revenue Growth > 0
        rev_yoy = growth.get("revenue_yoy")
        passed = rev_yoy is not None and rev_yoy > 0
        details.append({"label": "Revenue Growth > 0", "passed": passed})

        # 8. Gross Margin > 20%
        gross_margin = profitability.get("gross_margin")
        passed = gross_margin is not None and gross_margin > 0.20
        details.append({"label": "Gross Margin > 20%", "passed": passed})

        # 9. Asset Turnover (proxy: revenue > 0)
        revenue = ttm.get("revenue")
        passed = revenue is not None and revenue > 0
        details.append({"label": "Revenue > 0 (Asset Turnover proxy)", "passed": passed})

        # 10. Net Margin > 0
        net_margin = profitability.get("net_margin")
        passed = net_margin is not None and net_margin > 0
        details.append({"label": "Net Margin > 0", "passed": passed})

        score = sum(1 for d in details if d["passed"])

        return {
            "score": score,
            "max_score": 10,
            "details": details,
        }


# Singleton instance
_stock_service: Optional[StockService] = None


def get_stock_service() -> StockService:
    """Get or create the Stock service singleton."""
    global _stock_service
    if _stock_service is None:
        _stock_service = StockService()
    return _stock_service
