"""
Stock database operations - Insforge Edge Function calls for stock data.

Handles:
- Stock profile caching (stock_profiles table)
- Stock financials caching (stock_financials table)
- Stock AI analysis caching (stock_analyses table)

Uses InsforgeService for connection pooling and proper error handling.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.config import STOCK_ANALYSIS_CACHE_HOURS
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)


def _parse_jsonb_fields(data: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    """Parse JSONB fields that may be returned as strings from the database."""
    if not data:
        return data
    for field in fields:
        value = data.get(field)
        if isinstance(value, str):
            try:
                data[field] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                pass
    return data


async def get_stock_profile(symbol: str) -> Optional[dict[str, Any]]:
    """
    Get stock profile from cache (stock_profiles table).

    Args:
        symbol: Stock ticker symbol

    Returns:
        Profile data or None if not found
    """
    try:
        db = get_insforge_service()
        result = await db.call_function(
            "stock-data",
            method="GET",
            params={"action": "get_profile", "symbol": symbol},
            timeout=30.0,
        )

        if result["status_code"] == 200:
            data = result.get("data", {})
            if data.get("success"):
                profile = data.get("data")
                # Parse JSONB fields that may be returned as strings
                return _parse_jsonb_fields(profile, ["classification", "description", "company_details"])
        return None

    except Exception as e:
        logger.error("Exception getting stock profile: %s: %s", type(e).__name__, e)
        return None


async def upsert_stock_profile(symbol: str, profile_data: dict[str, Any]) -> dict[str, Any]:
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

        logger.info("Upserting stock profile for %s", symbol)

        result = await db.call_function(
            "stock-data",
            method="POST",
            params={"action": "upsert_profile"},
            json_body=db_profile,
            timeout=30.0,
        )

        if result["status_code"] in (200, 201):
            data = result.get("data", {})
            if data.get("success"):
                logger.info("Stock profile saved for %s", symbol)
                return {"success": True, "data": data.get("data")}
            else:
                error_msg = data.get("error", "Unknown error")
                logger.error("Profile save failed: %s", error_msg)
                return {"success": False, "error": error_msg}
        else:
            error_msg = result.get("text", "")
            logger.error("Profile save failed: %s", result['status_code'])
            return {"success": False, "error": f"HTTP {result['status_code']}: {error_msg}"}

    except Exception as e:
        logger.error("Exception upserting stock profile: %s: %s", type(e).__name__, e)
        return {"success": False, "error": str(e)}


async def get_stock_financials(symbol: str, limit: int = 8) -> list[dict[str, Any]]:
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
        result = await db.call_function(
            "stock-data",
            method="GET",
            params={"action": "get_financials", "symbol": symbol, "limit": str(limit)},
            timeout=30.0,
        )

        if result["status_code"] == 200:
            data = result.get("data", {})
            if data.get("success"):
                financials = data.get("data", [])
                # Parse JSON string fields to dicts
                import json
                for item in financials:
                    for field in ["income_statement", "balance_sheet", "cash_flow", "derived_metrics"]:
                        if field in item and isinstance(item[field], str):
                            try:
                                item[field] = json.loads(item[field])
                            except (json.JSONDecodeError, TypeError):
                                item[field] = {}
                return financials
        return []

    except Exception as e:
        logger.error("Exception getting stock financials: %s: %s", type(e).__name__, e)
        return []


async def upsert_stock_financial(symbol: str, financial_data: dict[str, Any]) -> dict[str, Any]:
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

        result = await db.call_function(
            "stock-data",
            method="POST",
            params={"action": "upsert_financial"},
            json_body=db_financial,
            timeout=30.0,
        )

        if result["status_code"] in (200, 201):
            data = result.get("data", {})
            if data.get("success"):
                return {"success": True, "data": data.get("data")}
            else:
                return {"success": False, "error": data.get("error", "Unknown error")}
        else:
            return {"success": False, "error": f"HTTP {result['status_code']}"}

    except Exception as e:
        logger.error("Exception upserting stock financial: %s: %s", type(e).__name__, e)
        return {"success": False, "error": str(e)}


async def get_stock_analysis(
    symbol: str, analysis_type: str = "comprehensive"
) -> Optional[dict[str, Any]]:
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
        result = await db.call_function(
            "stock-analyses",
            method="GET",
            params={"symbol": symbol.upper(), "type": analysis_type},
            timeout=30.0,
        )

        if result["status_code"] == 200:
            data = result.get("data", {})
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
        logger.error("Exception getting stock analysis: %s: %s", type(e).__name__, e)
        return None


async def save_stock_analysis(
    symbol: str,
    analysis_type: str,
    content: Any,
    data_snapshot: Optional[dict[str, Any]] = None,
    model: str = "gemini-3-pro-preview",
    expires_hours: int = STOCK_ANALYSIS_CACHE_HOURS,
) -> dict[str, Any]:
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

        logger.info("Saving stock analysis for %s (%s)", symbol, analysis_type)

        result = await db.call_function(
            "stock-analyses",
            method="POST",
            json_body=request_body,
            timeout=30.0,
        )

        if result["status_code"] in (200, 201):
            data = result.get("data", {})
            if data.get("success") and data.get("data"):
                analysis_id = data["data"].get("id")
                logger.info("Stock analysis saved, ID: %s", analysis_id)
                return {"success": True, "analysis_id": analysis_id}
            else:
                error_msg = data.get("error", "Unknown error")
                logger.error("Analysis save failed: %s", error_msg)
                return {"success": False, "error": error_msg}
        else:
            error_msg = result.get("text", "")
            logger.error("Analysis save failed: %s - %s", result['status_code'], error_msg)
            return {"success": False, "error": f"HTTP {result['status_code']}: {error_msg}"}

    except Exception as e:
        logger.error("Exception saving stock analysis: %s: %s", type(e).__name__, e)
        return {"success": False, "error": str(e)}
