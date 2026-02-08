"""
Stock Service - Individual stock data aggregation and caching.

Responsibilities:
1. Aggregate data from OpenBB Service
2. Manage database cache (profile: 30 days, financials: quarterly)
3. Calculate derived metrics (TTM, valuation multiples)
4. Provide unified data access interface

Cache Strategy:
- Profile: 30 days TTL (company info changes rarely)
- Financials: Check for latest quarter (refresh when new data available)
- Quote: Always fetch real-time (no cache)
- Analysis: 24 hours TTL (AI-generated content)
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.services.openbb_service import get_openbb_service
from app.services.insforge_service import get_insforge_service


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
        self.openbb = get_openbb_service()
        self.db = get_insforge_service()

    async def get_stock_data(self, symbol: str, include_financials: bool = True) -> Dict[str, Any]:
        """
        Get complete stock data for a symbol.

        Args:
            symbol: Stock ticker symbol (e.g., 'NVDA')
            include_financials: Whether to include historical financial statements

        Returns:
            Dict with profile, quote, fundamentals, financials, and meta
        """
        symbol = symbol.upper()
        print(f"[StockService] Fetching data for {symbol}")

        # Parallel fetch: profile (cached), quote (real-time), financials (cached)
        tasks = [
            self._get_or_fetch_profile(symbol),
            self.openbb.get_realtime_quote(symbol),
        ]

        if include_financials:
            tasks.append(self._get_or_fetch_financials(symbol))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Extract results
        profile = results[0] if not isinstance(results[0], Exception) else {}
        quote = results[1] if not isinstance(results[1], Exception) else {}
        financials = results[2] if len(results) > 2 and not isinstance(results[2], Exception) else []

        # Log any errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"[StockService] Error in task {i} for {symbol}: {result}")

        # Calculate derived metrics
        ttm = self._calculate_ttm_metrics(financials) if financials else {}
        valuation = self._calculate_valuation(quote, ttm, financials) if quote else {}
        growth = self._calculate_growth(financials) if financials else {}
        profitability = self._calculate_profitability(financials) if financials else {}

        return {
            "profile": profile,
            "quote": quote,
            "fundamentals": {
                "ttm": ttm,
                "valuation": valuation,
                "growth": growth,
                "profitability": profitability,
            },
            "financials": {
                "latest_quarter": financials[0].get("period") if financials else None,
                "quarters": financials[:4] if include_financials else [],  # Recent 4 quarters
            },
            "meta": {
                "symbol": symbol,
                "quote_fetched_at": datetime.utcnow().isoformat(),
                "profile_from_cache": bool(profile.get("_from_cache")),
                "financials_from_cache": bool(financials and financials[0].get("_from_cache") if financials else False),
            }
        }

    async def _get_or_fetch_profile(self, symbol: str) -> Dict[str, Any]:
        """
        Get company profile with 30-day caching.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Profile data dict
        """
        # 1. Check cache
        cached = await self.db.get_stock_profile(symbol)
        if cached and self._is_profile_fresh(cached):
            cached["_from_cache"] = True
            print(f"[StockService] Using cached profile for {symbol}")
            return cached

        # 2. Fetch from OpenBB
        print(f"[StockService] Fetching profile from OpenBB for {symbol}")
        profile = await self.openbb.get_company_profile(symbol)

        if profile:
            # 3. Save to cache (async, don't wait)
            asyncio.create_task(self.db.upsert_stock_profile(symbol, profile))
            profile["_from_cache"] = False

        return profile

    async def _get_or_fetch_financials(self, symbol: str) -> List[Dict[str, Any]]:
        """
        Get financial statements with smart caching.

        Checks if cached data has the latest quarter, otherwise fetches fresh data.

        Args:
            symbol: Stock ticker symbol

        Returns:
            List of quarterly financial data
        """
        # 1. Check cache
        cached = await self.db.get_stock_financials(symbol)

        # 2. Validate cache freshness
        if cached and self._has_recent_quarter(cached):
            for item in cached:
                item["_from_cache"] = True
            print(f"[StockService] Using cached financials for {symbol}")
            return cached

        # 3. Fetch from OpenBB
        print(f"[StockService] Fetching financials from OpenBB for {symbol}")
        income = await self.openbb.get_income_statements(symbol)
        balance = await self.openbb.get_balance_sheets(symbol)
        cash = await self.openbb.get_cash_flows(symbol)

        if not income:
            print(f"[StockService] No income statement data for {symbol}")
            return cached or []

        # 4. Merge financial statements
        financials = self._merge_financials(income, balance, cash)

        # 5. Save to cache (async)
        for f in financials:
            asyncio.create_task(self.db.upsert_stock_financial(symbol, f))

        for item in financials:
            item["_from_cache"] = False

        return financials

    def _is_profile_fresh(self, cached: Dict[str, Any]) -> bool:
        """
        Check if cached profile is still fresh (within 30 days).

        Args:
            cached: Cached profile data

        Returns:
            True if cache is fresh
        """
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
            print(f"[StockService] Error parsing updated_at: {e}")
            return False

    def _has_recent_quarter(self, cached: List[Dict[str, Any]]) -> bool:
        """
        Check if cached financials have reasonably recent data.

        We consider data fresh if the latest quarter is within 45 days.
        This accounts for reporting lag (companies report ~30-45 days after quarter end).

        Args:
            cached: List of cached financial data

        Returns:
            True if cache has recent data
        """
        if not cached:
            return False

        latest = cached[0]
        period_end = latest.get("period_end_date") or latest.get("period")

        if not period_end:
            return False

        try:
            # Parse date
            if isinstance(period_end, str):
                period_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
            else:
                return False

            # Check freshness
            cutoff = datetime.now(period_dt.tzinfo) if period_dt.tzinfo else datetime.utcnow()
            cutoff = cutoff - timedelta(days=self.FINANCIALS_FRESHNESS_DAYS)
            return period_dt > cutoff

        except (ValueError, TypeError) as e:
            print(f"[StockService] Error parsing period_end_date: {e}")
            return False

    def _merge_financials(
        self,
        income: List[Dict[str, Any]],
        balance: List[Dict[str, Any]],
        cash: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Merge income statement, balance sheet, and cash flow data by date.

        Args:
            income: Income statement data
            balance: Balance sheet data
            cash: Cash flow data

        Returns:
            List of merged financial data
        """
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

        return result

    def _calculate_ttm_metrics(self, financials: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate Trailing Twelve Months (TTM) metrics.

        Sums the last 4 quarters of income statement items.

        Args:
            financials: List of quarterly financial data

        Returns:
            Dict with TTM metrics
        """
        if len(financials) < 4:
            # Not enough data for TTM, use available
            quarters = financials
        else:
            quarters = financials[:4]

        def safe_sum(items, key):
            """Safely sum a key across items."""
            total = 0
            for item in items:
                inc = item.get("income_statement", {})
                cf = item.get("cash_flow", {})
                val = inc.get(key) or cf.get(key)
                if val is not None:
                    total += val
            return total if total else None

        return {
            "revenue": safe_sum(quarters, "revenue"),
            "net_income": safe_sum(quarters, "net_income"),
            "eps": safe_sum(quarters, "eps"),
            "ebitda": safe_sum(quarters, "ebitda"),
            "operating_cash_flow": safe_sum(quarters, "operating_cash_flow"),
            "free_cash_flow": safe_sum(quarters, "free_cash_flow"),
        }

    def _calculate_valuation(
        self,
        quote: Dict[str, Any],
        ttm: Dict[str, Any],
        financials: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calculate valuation multiples using current price and TTM metrics.

        Args:
            quote: Real-time quote data
            ttm: TTM metrics
            financials: Financial data for book value

        Returns:
            Dict with valuation metrics
        """
        price = quote.get("price")
        market_cap = quote.get("market_cap")

        if not price:
            return {}

        valuation = {}

        # P/E ratio
        eps = ttm.get("eps")
        if eps and eps > 0:
            valuation["pe"] = round(price / eps, 2)

        # Use market cap for other ratios
        if market_cap:
            # P/S ratio
            revenue = ttm.get("revenue")
            if revenue and revenue > 0:
                valuation["ps"] = round(market_cap / revenue, 2)

            # EV/EBITDA (simplified, ignoring debt for now)
            ebitda = ttm.get("ebitda")
            if ebitda and ebitda > 0:
                valuation["ev_to_ebitda"] = round(market_cap / ebitda, 2)

        # P/B ratio (using latest balance sheet)
        if financials and market_cap:
            latest_bs = financials[0].get("balance_sheet", {})
            equity = latest_bs.get("total_equity")
            if equity and equity > 0:
                valuation["pb"] = round(market_cap / equity, 2)

        return valuation

    def _calculate_growth(self, financials: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate year-over-year and quarter-over-quarter growth rates.

        Args:
            financials: List of quarterly financial data

        Returns:
            Dict with growth metrics
        """
        if len(financials) < 2:
            return {}

        growth = {}

        # Current quarter
        current = financials[0].get("income_statement", {})
        current_rev = current.get("revenue")
        current_ni = current.get("net_income")
        current_eps = current.get("eps")

        # QoQ (previous quarter)
        if len(financials) >= 2:
            prev_q = financials[1].get("income_statement", {})
            prev_rev = prev_q.get("revenue")
            if current_rev and prev_rev and prev_rev != 0:
                growth["revenue_qoq"] = round((current_rev - prev_rev) / abs(prev_rev), 4)

        # YoY (4 quarters ago)
        if len(financials) >= 5:
            yoy = financials[4].get("income_statement", {})
            yoy_rev = yoy.get("revenue")
            yoy_ni = yoy.get("net_income")
            yoy_eps = yoy.get("eps")

            if current_rev and yoy_rev and yoy_rev != 0:
                growth["revenue_yoy"] = round((current_rev - yoy_rev) / abs(yoy_rev), 4)

            if current_ni and yoy_ni and yoy_ni != 0:
                growth["net_income_yoy"] = round((current_ni - yoy_ni) / abs(yoy_ni), 4)

            if current_eps and yoy_eps and yoy_eps != 0:
                growth["eps_yoy"] = round((current_eps - yoy_eps) / abs(yoy_eps), 4)

        return growth

    def _calculate_profitability(self, financials: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate profitability metrics from latest quarter.

        Args:
            financials: List of quarterly financial data

        Returns:
            Dict with profitability metrics
        """
        if not financials:
            return {}

        latest = financials[0].get("income_statement", {})
        revenue = latest.get("revenue")

        if not revenue or revenue == 0:
            return {}

        def safe_margin(value):
            """Calculate margin percentage."""
            if value is None:
                return None
            return round(value / revenue, 4)

        profitability = {
            "gross_margin": safe_margin(latest.get("gross_profit")),
            "operating_margin": safe_margin(latest.get("operating_income")),
            "net_margin": safe_margin(latest.get("net_income")),
        }

        # ROE and ROA require balance sheet
        if financials:
            bs = financials[0].get("balance_sheet", {})
            net_income = latest.get("net_income")

            if net_income:
                equity = bs.get("total_equity")
                assets = bs.get("total_assets")

                if equity and equity != 0:
                    profitability["roe"] = round(net_income / equity, 4)
                if assets and assets != 0:
                    profitability["roa"] = round(net_income / assets, 4)

        return profitability


# Singleton instance
_stock_service: Optional[StockService] = None


def get_stock_service() -> StockService:
    """Get or create the Stock service singleton."""
    global _stock_service
    if _stock_service is None:
        _stock_service = StockService()
    return _stock_service
