"""
Market report database operations using Insforge Edge Functions.

Provides save and retrieve operations for market reports (market_reports table).
Each function is standalone async, using the shared InsforgeService for base URL/headers.
"""

import traceback
from typing import Optional, Dict, Any, List

import httpx

from app.core.database import get_insforge_service
from app.utils.timezone import today_str, now_iso


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

        print(f"[InsforgeService] Saving report for date: {report_date}")

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
                    print(f"[InsforgeService] Report saved successfully, ID: {report_id}")
                    return {
                        "success": True,
                        "report_id": report_id,
                        "report_date": report_date,
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    print(f"[InsforgeService] Save failed: {error_msg}")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                print(f"[InsforgeService] Save failed: {response.status_code} - {error_msg}")
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        print(f"[InsforgeService] Exception saving report: {e}")
        traceback.print_exc()
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
        print(f"[InsforgeService] Exception getting latest report: {e}")
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
        print(f"[InsforgeService] get_report_by_id: {report_id}")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            print(f"[InsforgeService] Response status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                if result.get("success") and result.get("data"):
                    report = result["data"]
                    print(f"[InsforgeService] Found report: {report.get('title', 'No title')[:50]}")
                    return report
                print(f"[InsforgeService] No report found with ID: {report_id}")
            else:
                print(f"[InsforgeService] Error response: {response.text}")
            return None

    except Exception as e:
        print(f"[InsforgeService] Exception getting report by ID: {e}")
        traceback.print_exc()
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
        print(f"[InsforgeService] get_report_by_date: {date}")
        print(f"[InsforgeService] Fetching from: {url}")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=_headers(),
                timeout=30.0,
            )

            print(f"[InsforgeService] Response status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                print(f"[InsforgeService] Success: {data.get('success')}, Data: {data.get('data') is not None}")
                if data.get("success"):
                    return data.get("data")
            else:
                print(f"[InsforgeService] Error: {response.text}")
            return None

    except Exception as e:
        print(f"[InsforgeService] Exception getting report by date: {e}")
        traceback.print_exc()
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
        print(f"[InsforgeService] list_reports: limit={limit}, offset={offset}")

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
        print(f"[InsforgeService] Exception listing reports: {e}")
        traceback.print_exc()
        return []
