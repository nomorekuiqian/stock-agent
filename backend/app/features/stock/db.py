"""
Stock database operations - Insforge Edge Function calls for stock data.

Handles:
- Stock profile caching (stock_profiles table)
- Stock financials caching (stock_financials table)
- Stock AI analysis caching (stock_analyses table)
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import httpx

from app.core.config import STOCK_ANALYSIS_CACHE_HOURS
from app.core.database import get_insforge_service


async def get_stock_profile(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Get stock profile from cache (stock_profiles table).

    Args:
        symbol: Stock ticker symbol

    Returns:
        Profile data or None if not found
    """
    try:
        db = get_insforge_service()
        function_url = f"{db.base_url}/functions/stock-data"
        query_url = f"{function_url}?action=get_profile&symbol={symbol}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers=db.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        print(f"[StockDB] Exception getting stock profile: {e}")
        return None


async def upsert_stock_profile(symbol: str, profile_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Insert or update stock profile in cache.

    Args:
        symbol: Stock ticker symbol
        profile_data: Profile data to store

    Returns:
        dict with success status
    """
    try:
        db = get_insforge_service()
        function_url = f"{db.base_url}/functions/stock-data"

        db_profile = {
            "symbol": symbol.upper(),
            "company_name": profile_data.get("company_name", ""),
            "company_name_zh": profile_data.get("company_name_zh"),
            "exchange": profile_data.get("exchange"),
            "classification": profile_data.get("classification"),
            "description": profile_data.get("description"),
            "company_details": profile_data.get("company_details"),
            "data_source": profile_data.get("data_source", "openbb_fmp"),
        }

        print(f"[StockDB] Upserting stock profile for {symbol}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{function_url}?action=upsert_profile",
                headers=db.headers,
                json=db_profile,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    print(f"[StockDB] Stock profile saved for {symbol}")
                    return {"success": True, "data": data.get("data")}
                else:
                    error_msg = data.get("error", "Unknown error")
                    print(f"[StockDB] Profile save failed: {error_msg}")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                print(f"[StockDB] Profile save failed: {response.status_code}")
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        print(f"[StockDB] Exception upserting stock profile: {e}")
        return {"success": False, "error": str(e)}


async def get_stock_financials(symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
    """
    Get stock financials from cache (stock_financials table).

    Args:
        symbol: Stock ticker symbol
        limit: Number of quarters to retrieve

    Returns:
        List of financial data dicts, ordered by period_end_date DESC
    """
    try:
        db = get_insforge_service()
        function_url = f"{db.base_url}/functions/stock-data"
        query_url = f"{function_url}?action=get_financials&symbol={symbol}&limit={limit}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers=db.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data", [])
            return []

    except Exception as e:
        print(f"[StockDB] Exception getting stock financials: {e}")
        return []


async def upsert_stock_financial(symbol: str, financial_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Insert or update a single quarter's financial data.

    Args:
        symbol: Stock ticker symbol
        financial_data: Financial data for a single quarter

    Returns:
        dict with success status
    """
    try:
        db = get_insforge_service()
        function_url = f"{db.base_url}/functions/stock-data"

        # Extract period info for unique key
        income = financial_data.get("income_statement", {})
        period_date = financial_data.get("period") or income.get("date", "")
        fiscal_year = income.get("fiscal_year")
        fiscal_period = income.get("fiscal_period")

        # Determine fiscal quarter from period
        fiscal_quarter = None
        if fiscal_period:
            fiscal_quarter = fiscal_period  # Q1, Q2, Q3, Q4
        elif period_date:
            # Extract quarter from date if not provided
            month = int(period_date.split("-")[1]) if "-" in period_date else None
            if month:
                fiscal_quarter = f"Q{(month - 1) // 3 + 1}"

        db_financial = {
            "symbol": symbol.upper(),
            "fiscal_year": fiscal_year,
            "fiscal_quarter": fiscal_quarter,
            "period_type": "quarterly",
            "period_end_date": period_date,
            "income_statement": financial_data.get("income_statement"),
            "balance_sheet": financial_data.get("balance_sheet"),
            "cash_flow": financial_data.get("cash_flow"),
            "currency": "USD",
            "data_source": "openbb_fmp",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{function_url}?action=upsert_financial",
                headers=db.headers,
                json=db_financial,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    return {"success": True, "data": data.get("data")}
                else:
                    return {"success": False, "error": data.get("error", "Unknown error")}
            else:
                return {"success": False, "error": f"HTTP {response.status_code}"}

    except Exception as e:
        print(f"[StockDB] Exception upserting stock financial: {e}")
        return {"success": False, "error": str(e)}


async def get_stock_analysis(
    symbol: str, analysis_type: str = "comprehensive"
) -> Optional[Dict[str, Any]]:
    """
    Get cached AI analysis for a stock using Edge Function.

    Args:
        symbol: Stock ticker symbol
        analysis_type: Type of analysis (comprehensive, earnings, valuation, etc.)

    Returns:
        Analysis data or None if not found/expired
    """
    try:
        db = get_insforge_service()
        # Use Edge Function to get cached analysis
        function_url = (
            f"{db.base_url}/functions/stock-analyses"
            f"?symbol={symbol.upper()}"
            f"&type={analysis_type}"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                function_url,
                headers=db.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("data"):
                    record = data["data"]
                    return {
                        "id": record.get("id"),
                        "symbol": record.get("symbol"),
                        "analysis_type": record.get("analysis_type"),
                        "content": record.get("content"),
                        "model": record.get("model"),
                        "generated_at": record.get("generated_at"),
                        "expires_at": record.get("expires_at"),
                    }
            return None

    except Exception as e:
        print(f"[StockDB] Exception getting stock analysis: {e}")
        return None


async def save_stock_analysis(
    symbol: str,
    analysis_type: str,
    content: Any,
    data_snapshot: Optional[Dict[str, Any]] = None,
    model: str = "gemini-3-pro-preview",
    expires_hours: int = STOCK_ANALYSIS_CACHE_HOURS,
) -> Dict[str, Any]:
    """
    Save AI-generated analysis to cache using Edge Function.

    Args:
        symbol: Stock ticker symbol
        analysis_type: Type of analysis
        content: Analysis content (string or dict)
        data_snapshot: Data used to generate analysis
        model: Model used for generation
        expires_hours: Hours until expiration

    Returns:
        dict with success status and analysis ID
    """
    try:
        db = get_insforge_service()

        now_utc = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(hours=expires_hours)

        # Prepare request body for Edge Function
        request_body = {
            "symbol": symbol.upper(),
            "analysis_type": analysis_type,
            "content": content,  # Edge function handles JSON serialization
            "data_snapshot": data_snapshot,
            "model": model,
            "generated_at": now_utc.isoformat(),
            "expires_at": expires_at.isoformat(),
        }

        print(f"[StockDB] Saving stock analysis for {symbol} ({analysis_type})")

        # Use Edge Function to save analysis
        function_url = f"{db.base_url}/functions/stock-analyses"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                function_url,
                headers=db.headers,
                json=request_body,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success") and data.get("data"):
                    analysis_id = data["data"].get("id")
                    print(f"[StockDB] Stock analysis saved, ID: {analysis_id}")
                    return {"success": True, "analysis_id": analysis_id}
                else:
                    error_msg = data.get("error", "Unknown error")
                    print(f"[StockDB] Analysis save failed: {error_msg}")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                print(f"[StockDB] Analysis save failed: {response.status_code} - {error_msg}")
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        print(f"[StockDB] Exception saving stock analysis: {e}")
        return {"success": False, "error": str(e)}
