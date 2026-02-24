"""
Market report database operations using Insforge Edge Functions.

Provides save and retrieve operations for market reports (market_reports table).
Each function is standalone async, using the shared InsforgeService for base URL/headers.
"""

from typing import Optional, Dict, Any, List

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str, now_iso

logger = get_logger(__name__)


# Edge function name for market reports
_FUNCTION_NAME = "market-reports"


def _function_url() -> str:
    """Get the full URL for the market-reports Edge Function."""
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    """Get request headers from the shared service."""
    service = get_insforge_service()
    return service.headers


async def save_market_report(report_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a market report to the database via Edge Function.
    Uses upsert by report_date to avoid duplicates for the same day.

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
            "news": report_data.get("news"),
            "report_summary": report_data.get("report_summary", []),
            "calendar": report_data.get("calendar", []),
            "indices": report_data.get("indices", []),
            "market_data": report_data.get("market_data", {}),
        }

        logger.info("Saving report for date: %s", report_date)

        async with httpx.AsyncClient() as client:
            # Use upsert to avoid duplicates for same date
            response = await client.post(
                f"{_function_url()}?action=upsert",
                headers=_headers(),
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
        logger.exception("Exception saving report")
        return {"success": False, "error": str(e)}


async def get_latest_report() -> Optional[Dict[str, Any]]:
    """
    Get the latest market report from the database.

    Returns:
        Report data or None if not found
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_function_url()}?latest=true",
                headers=_headers(),
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


async def get_report_by_id(report_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a market report by ID via Edge Function.

    Args:
        report_id: UUID of the report

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?id={report_id}"
        logger.info("get_report_by_id: %s", report_id)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
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
        logger.exception("Exception getting report by ID")
        return None


async def get_report_by_date(date: str) -> Optional[Dict[str, Any]]:
    """
    Get a market report by date.

    Args:
        date: Date in YYYY-MM-DD format

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?date={date}"
        logger.info("get_report_by_date: %s", date)
        logger.info("Fetching from: %s", url)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
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
        logger.exception("Exception getting report by date")
        return None


async def list_reports(limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    """
    List historical market reports, ordered by report_date DESC.

    Args:
        limit: Maximum number of reports to return
        offset: Number of reports to skip (for pagination)

    Returns:
        List of report summary dicts
    """
    try:
        url = f"{_function_url()}?limit={limit}&offset={offset}"
        logger.info("list_reports: limit=%d, offset=%d", limit, offset)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data", [])
            return []

    except Exception as e:
        logger.exception("Exception listing reports")
        return []
