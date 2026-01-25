"""
Feedback router - Email feedback endpoints for daily reports.
"""

import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.core.config import FRONTEND_URL
from app.core.deps import verify_cron_secret
from app.features.feedback.db import (
    save_email_feedback,
    get_feedback_stats,
)
from app.utils.timezone import today_str, days_ago

router = APIRouter(prefix="/api", tags=["feedback"])


# =============================================================================
# Helper
# =============================================================================


def _feedback_html_page(status: str, rating: str = None, message: str = None) -> str:
    """Generate a simple HTML page for feedback response."""
    rating_display = {
        "satisfied": ("&#128077;", "helpful", "#10b981"),
        "dissatisfied": ("&#128078;", "not helpful", "#ef4444"),
    }

    if status == "success":
        emoji, text, color = rating_display.get(rating, ("&#128522;", "", "#10b981"))
        title = "Thanks for your feedback!"
        subtitle = "Your opinion helps us improve."
        icon_bg = "#d1fae5"
        icon_color = "#10b981"
    elif status == "duplicate":
        emoji, text, color = rating_display.get(rating, ("", "", "#3b82f6"))
        title = "Already received!"
        subtitle = "You've already submitted feedback for this report."
        icon_bg = "#dbeafe"
        icon_color = "#3b82f6"
    else:
        title = "Something went wrong"
        subtitle = message or "Please try again later."
        emoji, text, color = "", "", "#ef4444"
        icon_bg = "#fee2e2"
        icon_color = "#ef4444"

    rating_badge = ""
    if rating and text:
        rating_badge = f'<div style="margin-top: 16px;"><span style="display: inline-block; padding: 6px 12px; background: {icon_bg}; color: {color}; border-radius: 20px; font-size: 14px;">{emoji} {text}</span></div>'

    # Simple feedback confirmation page (no auto-close)
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f9fafb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
        }}
        .container {{
            text-align: center;
            padding: 32px;
            max-width: 320px;
        }}
        .icon {{
            width: 64px;
            height: 64px;
            background: {icon_bg};
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 28px;
            color: {icon_color};
        }}
        h1 {{
            margin: 0 0 8px;
            font-size: 20px;
            font-weight: 600;
            color: #111827;
        }}
        p {{
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }}
        .close-hint {{
            margin-top: 24px;
            font-size: 12px;
            color: #9ca3af;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">{"&#10003;" if status in ["success", "duplicate"] else "&#9888;"}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {rating_badge}
        <p class="close-hint">You can close this tab.</p>
    </div>
</body>
</html>"""


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/feedback")
async def record_email_feedback(
    report_date: str = Query(None, description="Report date in YYYY-MM-DD format"),
    email: str = Query(None, description="User email"),
    rating: str = Query(None, description="Rating: satisfied or dissatisfied"),
    report_id: str = Query(None, description="Optional report UUID"),
):
    """
    Record email feedback from daily report.
    Called when user clicks feedback button in email.
    Redirects to frontend feedback page after recording.
    """
    # Validate required parameters
    if not report_date or not email or not rating:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=missing_params",
            status_code=302,
        )

    # Validate rating value
    valid_ratings = ["satisfied", "dissatisfied"]
    if rating not in valid_ratings:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=invalid_rating",
            status_code=302,
        )

    try:
        result = await save_email_feedback(
            report_date=report_date,
            email=email,
            rating=rating,
            report_id=report_id,
        )

        if result.get("success"):
            is_duplicate = result.get("is_duplicate", False)
            status = "duplicate" if is_duplicate else "success"
            return RedirectResponse(
                url=f"{FRONTEND_URL}/feedback?status={status}&rating={rating}",
                status_code=302,
            )
        else:
            error = result.get("error", "server_error")
            return RedirectResponse(
                url=f"{FRONTEND_URL}/feedback?status=error&error={error}",
                status_code=302,
            )

    except Exception as e:
        print(f"[Feedback] Exception: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=server_error",
            status_code=302,
        )


@router.post("/feedback/submit")
async def submit_email_feedback(
    report_date: str = Query(..., description="Report date in YYYY-MM-DD format"),
    email: str = Query(..., description="User email"),
    rating: str = Query(..., description="Rating: satisfied or dissatisfied"),
    report_id: str = Query(None, description="Optional report UUID"),
):
    """
    Submit email feedback from frontend (async).
    Called by frontend after page loads to save feedback without blocking UX.

    Returns JSON response instead of redirect.
    """
    # Validate rating value
    valid_ratings = ["satisfied", "dissatisfied"]
    if rating not in valid_ratings:
        return {"success": False, "error": "invalid_rating"}

    try:
        result = await save_email_feedback(
            report_date=report_date,
            email=email,
            rating=rating,
            report_id=report_id,
        )

        if result.get("success"):
            is_duplicate = result.get("is_duplicate", False)
            return {
                "success": True,
                "is_duplicate": is_duplicate,
                "rating": rating,
            }
        else:
            return {"success": False, "error": result.get("error", "save_failed")}

    except Exception as e:
        print(f"[Feedback Submit] Exception: {e}")
        return {"success": False, "error": "server_error"}


@router.get("/feedback/stats")
async def get_feedback_stats_endpoint(
    start_date: str = Query(None, description="Start date (YYYY-MM-DD), defaults to 7 days ago"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD), defaults to today"),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Get email feedback statistics for a date range.
    Protected by CRON_SECRET for admin access.

    Returns:
        Statistics including total count, breakdown by rating, satisfaction rate, and daily data.
    """

    try:
        # Default date range: last 7 days
        if not end_date:
            end_date = today_str()
        if not start_date:
            start_date = days_ago(7)

        result = await get_feedback_stats(
            start_date=start_date,
            end_date=end_date,
        )

        if result.get("success"):
            return {
                "success": True,
                "period": result.get("period"),
                "total": result.get("total", 0),
                "breakdown": result.get("breakdown", {}),
                "satisfaction_rate": result.get("satisfaction_rate", 0),
                "daily": result.get("daily", []),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to get feedback stats"),
            )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
