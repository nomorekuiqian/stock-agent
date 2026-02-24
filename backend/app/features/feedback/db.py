"""
Feedback database operations - Insforge Edge Function calls for feedback.

Includes:
- Email feedback: Feedback on daily market reports
- User feedback: General feedback from contact page
"""

from typing import Any, Dict, Optional

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)


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

        logger.info("Saving email feedback: %s -> %s for %s", email, rating, report_date)

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
        logger.exception("Exception saving email feedback")
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

        logger.info("Getting feedback stats: %s to %s", start_date, end_date)

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
        logger.exception("Exception getting feedback stats")
        return {"success": False, "error": str(e)}


# =============================================================================
# User Feedback (Contact Page)
# =============================================================================


async def save_user_feedback(
    rating: str,
    email: str,
    message: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Save user feedback from contact page to the database.

    Args:
        rating: One of 'helpful', 'neutral', 'not_helpful'
        email: User email (required for follow-up)
        message: Optional feedback message

    Returns:
        dict with success status and feedback data
    """
    try:
        service = get_insforge_service()
        feedback_url = f"{service.base_url}/functions/user-feedback"

        db_feedback = {
            "rating": rating,
            "email": email,
        }
        if message:
            db_feedback["message"] = message

        logger.info("Saving user feedback: %s -> %s", email, rating)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{feedback_url}?action=submit",
                headers=service.headers,
                json=db_feedback,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    logger.info("User feedback saved successfully")
                    return {
                        "success": True,
                        "data": data.get("data"),
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    logger.error("User feedback save failed: %s", error_msg)
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                logger.error("User feedback save failed: %s - %s", response.status_code, error_msg)
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.exception("Exception saving user feedback")
        return {"success": False, "error": str(e)}


async def get_user_feedback_list(
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Get paginated list of user feedback.

    Args:
        page: Page number (1-indexed)
        page_size: Number of items per page

    Returns:
        dict with feedback list and pagination info
    """
    try:
        service = get_insforge_service()
        feedback_url = f"{service.base_url}/functions/user-feedback"

        logger.info("Getting user feedback list: page=%d, size=%d", page, page_size)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{feedback_url}?action=list",
                headers=service.headers,
                json={
                    "page": page,
                    "page_size": page_size,
                },
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "data": data.get("data", []),
                        "total": data.get("total", 0),
                        "page": data.get("page", page),
                        "page_size": data.get("page_size", page_size),
                        "total_pages": data.get("total_pages", 0),
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.exception("Exception getting user feedback list")
        return {"success": False, "error": str(e)}
