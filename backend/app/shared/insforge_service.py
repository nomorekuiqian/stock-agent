"""
Insforge Service for saving market reports to the database.
Uses Insforge Edge Functions API to interact with the database.
"""

import os
from typing import Optional, Dict, Any, List
import httpx

from app.core.logging import get_logger
from app.utils.timezone import today_str, now_iso

logger = get_logger(__name__)

# Cache TTL constants (hours)
STOCK_ANALYSIS_CACHE_HOURS = 168  # 7 days

# Insforge configuration
INSFORGE_BASE_URL = os.getenv(
    "INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app"
)


class InsforgeService:
    """Service for interacting with Insforge database via Edge Functions."""

    def __init__(self):
        self.base_url = INSFORGE_BASE_URL
        self.function_url = f"{self.base_url}/functions/market-reports"
        self.headers = {
            "Content-Type": "application/json",
        }

    async def save_market_report(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a market report to the database via Edge Function.

        Args:
            report_data: Dictionary containing report data

        Returns:
            dict with success status and saved report data or error
        """
        try:
            report_date = today_str()  # Pacific timezone

            # Prepare the report for database insertion
            # Field names match Agent output and DB schema directly
            db_report = {
                "report_date": report_date,
                "timestamp": report_data.get("timestamp", now_iso()),
                "title": report_data.get("title", ""),
                "summary": report_data.get("summary", ""),
                "intro": report_data.get("intro", ""),
                "macro": report_data.get("macro"),
                "news": report_data.get("news"),
                "report_summary": report_data.get("report_summary", ""),
                "calendar": report_data.get("calendar", []),
                "indices": report_data.get("indices", []),
                "market_data": report_data.get("market_data", {}),
            }

            logger.info("Saving report for date: %s", report_date)

            async with httpx.AsyncClient() as client:
                # Use upsert to avoid duplicates for same date
                response = await client.post(
                    f"{self.function_url}?action=upsert",
                    headers=self.headers,
                    json=db_report,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        report_id = data.get("data", {}).get("id")
                        logger.info("Report saved successfully, ID: %s", report_id)
                        return {
                            "success": True,
                            "report_id": report_id,
                            "report_date": report_date,
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        logger.error("Save failed: %s", error_msg)
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    logger.error("Save failed: %s - %s", response.status_code, error_msg)
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.exception("Exception saving report: %s", e)
            return {"success": False, "error": str(e)}

    async def get_latest_report(self) -> Optional[Dict[str, Any]]:
        """
        Get the latest market report from the database.

        Returns:
            Report data or None if not found
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.function_url}?latest=true",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            logger.error("Exception getting latest report: %s", e)
            return None

    async def get_report_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a market report by ID via Edge Function.

        Args:
            report_id: UUID of the report

        Returns:
            Report data or None if not found
        """
        try:
            url = f"{self.function_url}?id={report_id}"
            logger.info("get_report_by_id: %s", report_id)

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self.headers,
                    timeout=30.0,
                )

                logger.info("Response status: %s", response.status_code)

                if response.status_code == 200:
                    result = response.json()
                    if result.get("success") and result.get("data"):
                        report = result["data"]
                        logger.info("Found report: %s", report.get('title', 'No title')[:50])
                        return report
                    logger.info("No report found with ID: %s", report_id)
                else:
                    logger.error("Error response: %s", response.text)
                return None

        except Exception as e:
            logger.exception("Exception getting report by ID: %s", e)
            return None

    async def get_report_by_date(self, date: str) -> Optional[Dict[str, Any]]:
        """
        Get a market report by date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            Report data or None if not found
        """
        try:
            url = f"{self.function_url}?date={date}"
            logger.info("get_report_by_date: %s", date)
            logger.info("Fetching from: %s", url)

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self.headers,
                    timeout=30.0,
                )

                logger.info("Response status: %s", response.status_code)

                if response.status_code == 200:
                    data = response.json()
                    logger.info("Success: %s, Data: %s", data.get('success'), data.get('data') is not None)
                    if data.get("success"):
                        return data.get("data")
                else:
                    logger.error("Error: %s", response.text)
                return None

        except Exception as e:
            logger.exception("Exception getting report by date: %s", e)
            return None

    # =========================================================================
    # User Watchlist Methods
    # =========================================================================

    async def get_user_watchlist(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a user's watchlist from the database via Edge Function.

        Args:
            user_id: User UUID

        Returns:
            Watchlist data with symbols array, or None if not found
        """
        try:
            watchlist_url = f"{self.base_url}/functions/user-watchlists"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{watchlist_url}?user_id={user_id}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            logger.error("Exception getting user watchlist: %s", e)
            return None

    # =========================================================================
    # User Digest Methods (PersonalDigest)
    # =========================================================================

    async def save_user_digest(self, digest_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a personal digest to the database (always creates new record).

        Args:
            digest_data: Dictionary containing digest data including user_id

        Returns:
            dict with success status and saved digest ID
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            # Get summary content for legacy fields
            summary_data = digest_data.get("summary", {})
            summary_content = summary_data.get("content", "") if isinstance(summary_data, dict) else ""

            db_digest = {
                "user_id": digest_data.get("user_id"),
                "digest_date": digest_data.get("digest_date", today_str()),
                "symbols": digest_data.get("symbols", []),
                # Header fields
                "greeting": digest_data.get("greeting", ""),
                "one_line_summary": digest_data.get("one_line_summary", ""),
                "bottom_line": summary_content,
                # Legacy field
                "analysis": summary_content,
                # Full structured data
                "digest_data": {
                    "stocks": digest_data.get("stocks", []),
                    "news": digest_data.get("news", {}),
                    "events": digest_data.get("events", []),
                    "summary": digest_data.get("summary", {}),
                },
            }

            logger.info("Saving user digest for user: %s, date: %s", db_digest.get('user_id'), db_digest.get('digest_date'))

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{digest_url}?action=insert",
                    headers=self.headers,
                    json=db_digest,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        digest_id = data.get("data", {}).get("id")
                        action = data.get("action", "saved")
                        logger.info("User digest %s, ID: %s", action, digest_id)
                        return {
                            "success": True,
                            "digest_id": digest_id,
                            "action": action,
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        logger.error("Save failed: %s", error_msg)
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    logger.error("Save failed: %s - %s", response.status_code, error_msg)
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.exception("Exception saving user digest: %s", e)
            return {"success": False, "error": str(e)}

    async def get_user_digest(self, user_id: str, digest_date: str) -> Optional[Dict[str, Any]]:
        """
        Get a user digest by user_id and date.

        Args:
            user_id: User UUID
            digest_date: Date in YYYY-MM-DD format

        Returns:
            Digest data or None if not found
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{digest_url}?user_id={user_id}&date={digest_date}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            logger.error("Exception getting user digest: %s", e)
            return None

    async def list_user_digests(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        List digests for a user.

        Args:
            user_id: User UUID
            limit: Maximum number of digests to return

        Returns:
            List of digest summaries
        """
        try:
            digest_url = f"{self.base_url}/functions/user-digests"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{digest_url}?user_id={user_id}&limit={limit}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data", [])
                return []

        except Exception as e:
            logger.error("Exception listing user digests: %s", e)
            return []

    # =========================================================================
    # Email Feedback Methods
    # =========================================================================

    async def save_email_feedback(
        self,
        report_date: str,
        email: str,
        rating: str,
        report_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save email feedback to the database.

        Args:
            report_date: Date in YYYY-MM-DD format
            email: User email
            rating: One of 'satisfied', 'neutral', 'dissatisfied'
            report_id: Optional report UUID

        Returns:
            dict with success status and feedback data
        """
        try:
            feedback_url = f"{self.base_url}/functions/email-feedback"

            db_feedback = {
                "report_date": report_date,
                "email": email,
                "rating": rating,
            }
            if report_id:
                db_feedback["report_id"] = report_id

            masked_email = email[:2] + "***" + email[email.index("@"):] if "@" in email else "***"
            logger.info("Saving email feedback: %s -> %s for %s", masked_email, rating, report_date)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{feedback_url}?action=upsert",
                    headers=self.headers,
                    json=db_feedback,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        is_duplicate = data.get("isDuplicate", False)
                        logger.info("Feedback saved (duplicate: %s)", is_duplicate)
                        return {
                            "success": True,
                            "is_duplicate": is_duplicate,
                            "data": data.get("data"),
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        logger.error("Feedback save failed: %s", error_msg)
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    logger.error("Feedback save failed: %s - %s", response.status_code, error_msg)
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.exception("Exception saving email feedback: %s", e)
            return {"success": False, "error": str(e)}

    async def get_feedback_stats(
        self,
        start_date: str,
        end_date: str,
    ) -> Dict[str, Any]:
        """
        Get feedback statistics for a date range.

        Args:
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format

        Returns:
            dict with statistics data
        """
        try:
            feedback_url = f"{self.base_url}/functions/email-feedback"

            logger.info("Getting feedback stats: %s to %s", start_date, end_date)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{feedback_url}?action=stats",
                    headers=self.headers,
                    json={
                        "start_date": start_date,
                        "end_date": end_date,
                    },
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return {
                            "success": True,
                            "period": data.get("period"),
                            "total": data.get("total", 0),
                            "breakdown": data.get("breakdown", {}),
                            "satisfaction_rate": data.get("satisfaction_rate", 0),
                            "daily": data.get("daily", []),
                        }
                    else:
                        error_msg = data.get("error", "Unknown error")
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.error("Exception getting feedback stats: %s", e)
            return {"success": False, "error": str(e)}

    # =========================================================================
    # Stock Research Methods (Individual Stock Data)
    # =========================================================================

    async def get_stock_profile(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get stock profile from cache (stock_profiles table).

        Args:
            symbol: Stock ticker symbol

        Returns:
            Profile data or None if not found
        """
        try:
            function_url = f"{self.base_url}/functions/stock-data"
            query_url = f"{function_url}?action=get_profile&symbol={symbol}"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    query_url,
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data")
                return None

        except Exception as e:
            logger.error("Exception getting stock profile: %s", e)
            return None

    async def upsert_stock_profile(self, symbol: str, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Insert or update stock profile in cache.

        Args:
            symbol: Stock ticker symbol
            profile_data: Profile data to store

        Returns:
            dict with success status
        """
        try:
            function_url = f"{self.base_url}/functions/stock-data"

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

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{function_url}?action=upsert_profile",
                    headers=self.headers,
                    json=db_profile,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success"):
                        logger.info("Stock profile saved for %s", symbol)
                        return {"success": True, "data": data.get("data")}
                    else:
                        error_msg = data.get("error", "Unknown error")
                        logger.error("Profile save failed: %s", error_msg)
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    logger.error("Profile save failed: %s", response.status_code)
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.error("Exception upserting stock profile: %s", e)
            return {"success": False, "error": str(e)}

    async def get_stock_financials(self, symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Get stock financials from cache (stock_financials table).

        Args:
            symbol: Stock ticker symbol
            limit: Number of quarters to retrieve

        Returns:
            List of financial data dicts, ordered by period_end_date DESC
        """
        try:
            function_url = f"{self.base_url}/functions/stock-data"
            query_url = f"{function_url}?action=get_financials&symbol={symbol}&limit={limit}"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    query_url,
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("data", [])
                return []

        except Exception as e:
            logger.error("Exception getting stock financials: %s", e)
            return []

    async def upsert_stock_financial(self, symbol: str, financial_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Insert or update a single quarter's financial data.

        Args:
            symbol: Stock ticker symbol
            financial_data: Financial data for a single quarter

        Returns:
            dict with success status
        """
        try:
            function_url = f"{self.base_url}/functions/stock-data"

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
                    headers=self.headers,
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
            logger.error("Exception upserting stock financial: %s", e)
            return {"success": False, "error": str(e)}

    async def get_stock_analysis(
        self, symbol: str, analysis_type: str = "comprehensive"
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
            # Use Edge Function to get cached analysis
            function_url = (
                f"{self.base_url}/functions/stock-analyses"
                f"?symbol={symbol.upper()}"
                f"&type={analysis_type}"
            )

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    function_url,
                    headers=self.headers,
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
            logger.error("Exception getting stock analysis: %s", e)
            return None

    async def save_stock_analysis(
        self,
        symbol: str,
        analysis_type: str,
        content: Any,
        data_snapshot: Optional[Dict[str, Any]] = None,
        model: str = "gemini-3.1-flash-lite-preview",
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
            from datetime import datetime, timezone, timedelta

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

            # Use Edge Function to save analysis
            function_url = f"{self.base_url}/functions/stock-analyses"

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    function_url,
                    headers=self.headers,
                    json=request_body,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    if data.get("success") and data.get("data"):
                        analysis_id = data["data"].get("id")
                        logger.info("Stock analysis saved, ID: %s", analysis_id)
                        return {"success": True, "analysis_id": analysis_id}
                    else:
                        error_msg = data.get("error", "Unknown error")
                        logger.error("Analysis save failed: %s", error_msg)
                        return {"success": False, "error": error_msg}
                else:
                    error_msg = response.text
                    logger.error("Analysis save failed: %s - %s", response.status_code, error_msg)
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

        except Exception as e:
            logger.error("Exception saving stock analysis: %s", e)
            return {"success": False, "error": str(e)}


# Singleton instance
_insforge_service: Optional[InsforgeService] = None


def get_insforge_service() -> InsforgeService:
    """Get or create the Insforge service singleton."""
    global _insforge_service
    if _insforge_service is None:
        _insforge_service = InsforgeService()
    return _insforge_service
