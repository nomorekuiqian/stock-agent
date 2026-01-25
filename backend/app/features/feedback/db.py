"""
Feedback database operations - Insforge Edge Function calls for email feedback.
"""

import traceback
from typing import Any, Dict, Optional

import httpx

from app.core.database import get_insforge_service


async def save_email_feedback(
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
        service = get_insforge_service()
        feedback_url = f"{service.base_url}/functions/email-feedback"

        db_feedback = {
            "report_date": report_date,
            "email": email,
            "rating": rating,
        }
        if report_id:
            db_feedback["report_id"] = report_id

        print(f"[InsforgeService] Saving email feedback: {email} -> {rating} for {report_date}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{feedback_url}?action=upsert",
                headers=service.headers,
                json=db_feedback,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    is_duplicate = data.get("isDuplicate", False)
                    print(f"[InsforgeService] Feedback saved (duplicate: {is_duplicate})")
                    return {
                        "success": True,
                        "is_duplicate": is_duplicate,
                        "data": data.get("data"),
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    print(f"[InsforgeService] Feedback save failed: {error_msg}")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                print(f"[InsforgeService] Feedback save failed: {response.status_code} - {error_msg}")
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        print(f"[InsforgeService] Exception saving email feedback: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def get_feedback_stats(
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
        service = get_insforge_service()
        feedback_url = f"{service.base_url}/functions/email-feedback"

        print(f"[InsforgeService] Getting feedback stats: {start_date} to {end_date}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{feedback_url}?action=stats",
                headers=service.headers,
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
        print(f"[InsforgeService] Exception getting feedback stats: {e}")
        return {"success": False, "error": str(e)}
