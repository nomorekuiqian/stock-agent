"""
Morning report database operations using Insforge Edge Functions.

Provides save and retrieve operations for morning reports (morning_reports table).
Each function is standalone async, using the shared InsforgeService for base URL/headers.
"""

from typing import Optional, Dict, Any

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str, now_iso

logger = get_logger(__name__)


# Edge function name for morning reports
_FUNCTION_NAME = "morning-reports"


def _function_url() -> str:
    """Get the full URL for the morning-reports Edge Function."""
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    """Get request headers from the shared service."""
    service = get_insforge_service()
    return service.headers


async def save_morning_report(report_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a morning report to the database via Edge Function.
    Uses upsert by report_date to avoid duplicates for the same day.

    Args:
        report_data: Dictionary containing report data

    Returns:
        dict with success status and saved report data or error
    """
    try:
        report_date = today_str()

        db_report = {
            "report_date": report_date,
            "timestamp": report_data.get("timestamp", now_iso()),
            "title": report_data.get("title", ""),
            "market_pulse": report_data.get("market_pulse", ""),
            "futures": report_data.get("futures"),
            "futures_analysis": report_data.get("futures_analysis", ""),
            "global_markets": report_data.get("global_markets"),
            "global_markets_analysis": report_data.get("global_markets_analysis", ""),
            "overnight_news": report_data.get("overnight_news"),
            "today_focus": report_data.get("today_focus"),
            "summary": report_data.get("summary"),
            "market_data": report_data.get("market_data", {}),
        }

        logger.info("Saving morning report for date: %s", report_date)

        async with httpx.AsyncClient() as client:
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
                    logger.info("Morning report saved, ID: %s", report_id)
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
        logger.exception("Exception saving morning report")
        return {"success": False, "error": str(e)}


async def get_latest_morning_report() -> Optional[Dict[str, Any]]:
    """
    Get the latest morning report from the database.

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
        logger.error("Exception getting latest morning report: %s", e)
        return None


async def get_morning_report_by_id(report_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a morning report by ID via Edge Function.

    Args:
        report_id: UUID of the report

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?id={report_id}"
        logger.info("get_morning_report_by_id: %s", report_id)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success") and result.get("data"):
                    return result["data"]
            return None

    except Exception as e:
        logger.exception("Exception getting morning report by ID")
        return None


async def get_morning_report_by_date(date: str) -> Optional[Dict[str, Any]]:
    """
    Get a morning report by date.

    Args:
        date: Date in YYYY-MM-DD format

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?date={date}"
        logger.info("get_morning_report_by_date: %s", date)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        logger.exception("Exception getting morning report by date")
        return None


async def list_morning_reports(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """
    List historical morning reports, ordered by report_date DESC.

    Args:
        limit: Maximum number of reports to return
        offset: Number of reports to skip (for pagination)

    Returns:
        Dict with 'data' (list of report summaries) and 'total' (total count)
    """
    try:
        url = f"{_function_url()}?limit={limit}&offset={offset}"
        logger.info("list_morning_reports: limit=%d, offset=%d", limit, offset)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "data": data.get("data", []),
                        "total": data.get("total", 0),
                    }
            return {"data": [], "total": 0}

    except Exception as e:
        logger.exception("Exception listing morning reports")
        return {"data": [], "total": 0}
