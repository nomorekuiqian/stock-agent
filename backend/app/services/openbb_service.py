"""
OpenBB Service - Financial data fetching layer using OpenBB SDK.

Responsibilities:
1. Wrap OpenBB SDK calls
2. Standardize data formats
3. Error handling and retries

Note: OpenBB SDK is synchronous, so we run in executor for async compatibility.
"""

import os
import asyncio
from typing import Optional, List, Dict, Any
from functools import partial
from google import genai

# Fix SSL certificate issue on macOS by using certifi
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass  # certifi not installed, use system certs


class OpenBBService:
    """Service for fetching financial data via OpenBB SDK."""

    _instance = None
    _initialized = False
    _obb = None
    _genai_client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if OpenBBService._initialized:
            return

        try:
            from openbb import obb

            # Configure FMP API Key
            fmp_key = os.getenv("FMP_API_KEY")
            if fmp_key:
                obb.user.credentials.fmp_api_key = fmp_key
                print("[OpenBBService] FMP API key configured")

            # Configure Gemini for translation
            google_api_key = os.getenv("GOOGLE_API_KEY")
            if google_api_key:
                OpenBBService._genai_client = genai.Client(api_key=google_api_key)
                print("[OpenBBService] Gemini configured for translation")

            OpenBBService._obb = obb
            OpenBBService._initialized = True
            print("[OpenBBService] Initialized successfully")
        except ImportError as e:
            print(f"[OpenBBService] Warning: OpenBB not installed - {e}")
        except Exception as e:
            print(f"[OpenBBService] Warning: Failed to initialize - {e}")

    def _run_sync(self, func, *args, **kwargs):
        """Run a synchronous OpenBB call."""
        return func(*args, **kwargs)

    async def _run_async(self, func, *args, **kwargs):
        """Run a synchronous OpenBB call in executor for async compatibility."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    async def _translate_to_chinese(self, text: str, company_name: str) -> Optional[str]:
        """
        Translate company description to Chinese using Gemini.

        Args:
            text: English text to translate
            company_name: Company name for context

        Returns:
            Chinese translation or None if failed
        """
        if not text or len(text) < 50:
            return None

        try:
            if not self._genai_client:
                return None

            prompt = f"""Please translate the following company description to Simplified Chinese.
Keep it professional and concise. Only output the translated text, no explanations.

Company: {company_name}

Description:
{text}"""

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._genai_client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                ),
            )

            if response and response.text:
                return response.text.strip()
            return None

        except Exception as e:
            print(f"[OpenBBService] Translation error: {e}")
            return None

    async def get_company_profile(self, symbol: str) -> Dict[str, Any]:
        """
        Get company profile information.

        Args:
            symbol: Stock ticker symbol (e.g., 'NVDA')

        Returns:
            Dict with company profile data
        """
        if not self._obb:
            return {}

        try:
            result = await self._run_async(
                self._obb.equity.profile, symbol=symbol, provider="fmp"
            )

            if result.results and len(result.results) > 0:
                data = result.results[0]
                # Extract IPO date
                ipo_date = getattr(data, "first_stock_price_date", None) or getattr(data, "ipo_date", None)
                company_name = getattr(data, "name", None) or symbol
                description_en = getattr(data, "long_description", None) or getattr(data, "description", None)

                # Translate description to Chinese
                description_zh = None
                if description_en:
                    description_zh = await self._translate_to_chinese(description_en, company_name)

                return {
                    "company_name": company_name,
                    "exchange": getattr(data, "stock_exchange", None) or getattr(data, "exchange", None),
                    "classification": {
                        "sector": getattr(data, "sector", None),
                        "industry": getattr(data, "industry_category", None) or getattr(data, "industry", None),
                    },
                    "description": {
                        "en": description_en,
                        "zh": description_zh,
                    },
                    "company_details": {
                        "ceo": getattr(data, "ceo", None),
                        "employees": getattr(data, "employees", None) or getattr(data, "full_time_employees", None),
                        "website": getattr(data, "company_url", None) or getattr(data, "website", None),
                        "ipo_date": str(ipo_date) if ipo_date else None,
                        "country": getattr(data, "hq_country", None) or getattr(data, "country", None),
                        "city": getattr(data, "hq_address_city", None) or getattr(data, "city", None),
                        "address": getattr(data, "hq_address1", None) or getattr(data, "address", None),
                        "phone": getattr(data, "business_phone_no", None) or getattr(data, "phone", None),
                        "image": getattr(data, "image", None),
                        "state": getattr(data, "hq_state", None),
                        "postal_code": getattr(data, "hq_address_postal_code", None),
                    },
                }
            return {}

        except Exception as e:
            print(f"[OpenBBService] Error fetching profile for {symbol}: {e}")
            return {}

    async def get_income_statements(self, symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Get income statements (quarterly).

        Args:
            symbol: Stock ticker symbol
            limit: Number of periods to fetch

        Returns:
            List of income statement data dicts
        """
        if not self._obb:
            return []

        try:
            result = await self._run_async(
                self._obb.equity.fundamental.income,
                symbol=symbol,
                period="quarter",
                limit=limit,
                provider="fmp",
            )

            return [self._serialize_income(item) for item in result.results]

        except Exception as e:
            print(f"[OpenBBService] Error fetching income statements for {symbol}: {e}")
            return []

    async def get_balance_sheets(self, symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Get balance sheets (quarterly).

        Args:
            symbol: Stock ticker symbol
            limit: Number of periods to fetch

        Returns:
            List of balance sheet data dicts
        """
        if not self._obb:
            return []

        try:
            result = await self._run_async(
                self._obb.equity.fundamental.balance,
                symbol=symbol,
                period="quarter",
                limit=limit,
                provider="fmp",
            )

            return [self._serialize_balance(item) for item in result.results]

        except Exception as e:
            print(f"[OpenBBService] Error fetching balance sheets for {symbol}: {e}")
            return []

    async def get_cash_flows(self, symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Get cash flow statements (quarterly).

        Args:
            symbol: Stock ticker symbol
            limit: Number of periods to fetch

        Returns:
            List of cash flow data dicts
        """
        if not self._obb:
            return []

        try:
            result = await self._run_async(
                self._obb.equity.fundamental.cash,
                symbol=symbol,
                period="quarter",
                limit=limit,
                provider="fmp",
            )

            return [self._serialize_cash_flow(item) for item in result.results]

        except Exception as e:
            print(f"[OpenBBService] Error fetching cash flows for {symbol}: {e}")
            return []

    async def get_key_metrics(self, symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Get key financial metrics/ratios (PE, PB, ROE, etc.).

        Args:
            symbol: Stock ticker symbol
            limit: Number of periods to fetch

        Returns:
            List of metrics data dicts
        """
        if not self._obb:
            return []

        try:
            result = await self._run_async(
                self._obb.equity.fundamental.ratios,
                symbol=symbol,
                period="quarter",
                limit=limit,
                provider="fmp",
            )

            return [self._serialize_ratios(item) for item in result.results]

        except Exception as e:
            print(f"[OpenBBService] Error fetching key metrics for {symbol}: {e}")
            return []

    async def get_realtime_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time stock quote.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Dict with price and quote data
        """
        if not self._obb:
            return {}

        try:
            result = await self._run_async(
                self._obb.equity.price.quote, symbol=symbol, provider="fmp"
            )

            if result.results and len(result.results) > 0:
                data = result.results[0]
                return {
                    "price": getattr(data, "last_price", None) or getattr(data, "price", None),
                    "open": getattr(data, "open", None),
                    "high": getattr(data, "high", None),
                    "low": getattr(data, "low", None),
                    "close": getattr(data, "previous_close", None),
                    "change": getattr(data, "change", None),
                    "change_percent": getattr(data, "change_percent", None),
                    "market_cap": getattr(data, "market_cap", None),
                    "volume": getattr(data, "volume", None),
                    "avg_volume": getattr(data, "avg_volume", None),
                    "pe_ratio": getattr(data, "pe", None),
                    "eps": getattr(data, "eps", None),
                    "week_52_high": getattr(data, "year_high", None),
                    "week_52_low": getattr(data, "year_low", None),
                }
            return {}

        except Exception as e:
            print(f"[OpenBBService] Error fetching quote for {symbol}: {e}")
            return {}

    async def get_historical_prices(
        self, symbol: str, start_date: str, end_date: str
    ) -> List[Dict[str, Any]]:
        """
        Get historical price data.

        Args:
            symbol: Stock ticker symbol
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            List of price data dicts
        """
        if not self._obb:
            return []

        try:
            result = await self._run_async(
                self._obb.equity.price.historical,
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                provider="fmp",
            )

            return [
                {
                    "date": str(item.date),
                    "open": item.open,
                    "high": item.high,
                    "low": item.low,
                    "close": item.close,
                    "volume": item.volume,
                }
                for item in result.results
            ]

        except Exception as e:
            print(f"[OpenBBService] Error fetching historical prices for {symbol}: {e}")
            return []

    # =========================================================================
    # Serialization helpers
    # =========================================================================

    def _serialize_income(self, item) -> Dict[str, Any]:
        """Serialize income statement data."""
        revenue = getattr(item, "revenue", None)
        gross_profit = getattr(item, "gross_profit", None)
        # Operating income: try multiple field names
        operating_income = (
            getattr(item, "total_operating_income", None) or
            getattr(item, "operating_income", None)
        )
        # Net income: try multiple field names
        net_income = (
            getattr(item, "consolidated_net_income", None) or
            getattr(item, "bottom_line_net_income", None) or
            getattr(item, "net_income", None)
        )
        # Operating expenses
        operating_expenses = (
            getattr(item, "total_operating_expenses", None) or
            getattr(item, "operating_expenses", None)
        )
        # EPS: try multiple field names
        eps = (
            getattr(item, "basic_earnings_per_share", None) or
            getattr(item, "eps", None) or
            getattr(item, "basic_eps", None)
        )
        eps_diluted = (
            getattr(item, "diluted_earnings_per_share", None) or
            getattr(item, "eps_diluted", None) or
            getattr(item, "diluted_eps", None)
        )
        # R&D
        research_and_development = (
            getattr(item, "research_and_development_expense", None) or
            getattr(item, "research_and_development_expenses", None)
        )

        return {
            "date": str(item.period_ending) if getattr(item, "period_ending", None) else str(getattr(item, "date", "")),
            "fiscal_year": getattr(item, "fiscal_year", None),
            "fiscal_period": getattr(item, "fiscal_period", None),
            "revenue": revenue,
            "cost_of_revenue": getattr(item, "cost_of_revenue", None),
            "gross_profit": gross_profit,
            "gross_profit_margin": self._safe_divide(gross_profit, revenue),
            "operating_expenses": operating_expenses,
            "operating_income": operating_income,
            "operating_income_margin": self._safe_divide(operating_income, revenue),
            "net_income": net_income,
            "net_income_margin": self._safe_divide(net_income, revenue),
            "eps": eps,
            "eps_diluted": eps_diluted,
            "ebitda": getattr(item, "ebitda", None),
            "research_and_development": research_and_development,
        }

    def _serialize_balance(self, item) -> Dict[str, Any]:
        """Serialize balance sheet data."""
        # Total equity: try multiple field names
        total_equity = (
            getattr(item, "total_common_equity", None) or
            getattr(item, "total_equity_non_controlling_interests", None) or
            getattr(item, "total_equity", None) or
            getattr(item, "total_stockholders_equity", None)
        )
        # Shares outstanding: try multiple field names
        shares_outstanding = (
            getattr(item, "weighted_average_basic_shares_outstanding", None) or
            getattr(item, "common_stock_shares_outstanding", None)
        )

        return {
            "date": str(item.period_ending) if getattr(item, "period_ending", None) else str(getattr(item, "date", "")),
            "fiscal_year": getattr(item, "fiscal_year", None),
            "fiscal_period": getattr(item, "fiscal_period", None),
            "total_assets": getattr(item, "total_assets", None),
            "total_liabilities": getattr(item, "total_liabilities", None),
            "total_equity": total_equity,
            "cash_and_equivalents": getattr(item, "cash_and_cash_equivalents", None),
            "short_term_investments": getattr(item, "short_term_investments", None),
            "total_current_assets": getattr(item, "total_current_assets", None),
            "total_current_liabilities": getattr(item, "total_current_liabilities", None),
            "long_term_debt": getattr(item, "long_term_debt", None),
            "total_debt": getattr(item, "total_debt", None),
            "retained_earnings": getattr(item, "retained_earnings", None),
            "shares_outstanding": shares_outstanding,
        }

    def _serialize_cash_flow(self, item) -> Dict[str, Any]:
        """Serialize cash flow statement data."""
        return {
            "date": str(item.period_ending) if getattr(item, "period_ending", None) else str(getattr(item, "date", "")),
            "fiscal_year": getattr(item, "fiscal_year", None),
            "fiscal_period": getattr(item, "fiscal_period", None),
            "operating_cash_flow": getattr(item, "operating_cash_flow", None) or getattr(item, "net_cash_from_operating_activities", None),
            "capital_expenditure": getattr(item, "capital_expenditure", None),
            "free_cash_flow": getattr(item, "free_cash_flow", None),
            "dividends_paid": getattr(item, "dividends_paid", None) or getattr(item, "payment_of_dividends", None),
            "stock_repurchase": getattr(item, "common_stock_repurchased", None),
            "net_cash_from_investing": getattr(item, "net_cash_from_investing_activities", None),
            "net_cash_from_financing": getattr(item, "net_cash_from_financing_activities", None),
            "depreciation": getattr(item, "depreciation_and_amortization", None),
        }

    def _serialize_ratios(self, item) -> Dict[str, Any]:
        """Serialize key financial ratios."""
        return {
            "date": str(item.period_ending) if getattr(item, "period_ending", None) else str(getattr(item, "date", "")),
            "fiscal_year": getattr(item, "fiscal_year", None),
            "fiscal_period": getattr(item, "fiscal_period", None),
            # Valuation
            "pe_ratio": getattr(item, "price_earnings_ratio", None) or getattr(item, "pe_ratio", None),
            "pb_ratio": getattr(item, "price_to_book_ratio", None) or getattr(item, "pb_ratio", None),
            "ps_ratio": getattr(item, "price_sales_ratio", None) or getattr(item, "ps_ratio", None),
            "peg_ratio": getattr(item, "peg_ratio", None),
            "ev_to_ebitda": getattr(item, "enterprise_value_over_ebitda", None),
            # Profitability
            "roe": getattr(item, "return_on_equity", None),
            "roa": getattr(item, "return_on_assets", None),
            "roic": getattr(item, "return_on_invested_capital", None),
            "gross_margin": getattr(item, "gross_profit_margin", None),
            "operating_margin": getattr(item, "operating_profit_margin", None),
            "net_margin": getattr(item, "net_profit_margin", None),
            # Liquidity
            "current_ratio": getattr(item, "current_ratio", None),
            "quick_ratio": getattr(item, "quick_ratio", None),
            # Leverage
            "debt_to_equity": getattr(item, "debt_to_equity", None),
            "debt_to_assets": getattr(item, "debt_to_assets", None),
            # Efficiency
            "asset_turnover": getattr(item, "asset_turnover", None),
            "inventory_turnover": getattr(item, "inventory_turnover", None),
        }

    def _safe_divide(self, numerator, denominator) -> Optional[float]:
        """Safe division that returns None on error."""
        try:
            if numerator is None or denominator is None or denominator == 0:
                return None
            return round(numerator / denominator, 4)
        except (TypeError, ZeroDivisionError):
            return None


# Singleton instance
_openbb_service: Optional[OpenBBService] = None


def get_openbb_service() -> OpenBBService:
    """Get or create the OpenBB service singleton."""
    global _openbb_service
    if _openbb_service is None:
        _openbb_service = OpenBBService()
    return _openbb_service
