"""
Weekly macro report database operations using Insforge Edge Functions.

Provides save and retrieve operations for weekly reports (weekly_macro_reports table).
Each function is standalone async, using the shared InsforgeService for base URL/headers.
"""

from typing import Optional, Dict, Any, List

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import market_week_label, utc_now_iso

logger = get_logger(__name__)


# Edge function name for weekly macro reports
_FUNCTION_NAME = "weekly-macro-reports"


def _function_url() -> str:
    """Get the full URL for the weekly-macro-reports Edge Function."""
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    """Get request headers from the shared service."""
    service = get_insforge_service()
    return service.headers


async def save_weekly_report(report_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a weekly macro report to the database via Edge Function.
    Uses upsert by week_label to avoid duplicates for the same week.

    Args:
        report_data: Dictionary containing report data

    Returns:
        dict with success status and saved report data or error
    """
    try:
        week_label = report_data.get("week_label", market_week_label())

        db_report = {
            "week_label": week_label,
            "generated_at": report_data.get("generated_at", utc_now_iso()),
            "title": report_data.get("title", ""),
            "verdict": report_data.get("verdict", ""),
            "signal_lights": report_data.get("signal_lights"),
            "landscape": report_data.get("landscape", ""),
            "narrative": report_data.get("narrative", ""),
            "takeaway": report_data.get("takeaway", ""),
            "liquidity_analysis": report_data.get("liquidity_analysis"),
            "economy_analysis": report_data.get("economy_analysis"),
            "inflation_analysis": report_data.get("inflation_analysis"),
            "sentiment_analysis": report_data.get("sentiment_analysis"),
            "week_ahead": report_data.get("week_ahead", []),
            "raw_data": report_data.get("raw_data"),
        }

        logger.info("Saving report for week: %s", week_label)

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
                    logger.info("Report saved successfully, ID: %s", report_id)
                    return {
                        "success": True,
                        "report_id": report_id,
                        "week_label": week_label,
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
    Get the latest weekly macro report from the database.

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?latest=true"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            logger.info("get_latest_report: status=%s", response.status_code)

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    report = data.get("data")
                    if report:
                        logger.info("Got latest report: week=%s", report.get('week_label'))
                    else:
                        logger.warning("get_latest_report: success=true but data is None")
                    return report
                else:
                    logger.error("get_latest_report failed: %s", data.get('error'))
            else:
                logger.error("get_latest_report HTTP %s: %s", response.status_code, response.text[:200])
            return None

    except Exception as e:
        logger.exception("Exception getting latest report: %s", type(e).__name__)
        return None


async def get_report_by_week(week: str) -> Optional[Dict[str, Any]]:
    """
    Get a weekly macro report by week label.

    Args:
        week: Week label like '2025.W06'

    Returns:
        Report data or None if not found
    """
    try:
        url = f"{_function_url()}?week={week}"
        logger.info("get_report_by_week: %s", week)

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
        logger.exception("Exception getting report by week")
        return None


async def list_reports(limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    """
    List historical weekly macro reports, ordered by week_label DESC.

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
