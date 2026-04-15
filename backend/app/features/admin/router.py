"""
Admin dashboard API - user stats and subscription overview.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends

from app.core.database import get_insforge_service
from app.core.config import ENVIRONMENT
from app.core.deps import verify_cron_secret
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])



def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _categorize_users(users: list[dict[str, Any]]) -> dict[str, Any]:
    """Categorize users into status buckets and return summary + annotated list."""
    now = datetime.now(timezone.utc)
    expiring_threshold = now + timedelta(days=3)

    summary = {
        "total": len(users),
        "paid": 0,
        "active_trial": 0,
        "expiring_soon": 0,
        "trial_expired": 0,
        "never_trialed": 0,
    }

    annotated: list[dict[str, Any]] = []

    for user in users:
        access_expires_at = user.get("access_expires_at")
        plan = user.get("plan")
        status = user.get("status")

        if plan in ("pro", "max") and status == "active" and not access_expires_at:
            category = "paid"
        elif access_expires_at:
            expires = _parse_dt(access_expires_at)
            if expires and expires > now:
                if expires <= expiring_threshold:
                    category = "expiring_soon"
                else:
                    category = "active_trial"
            else:
                category = "trial_expired"
        else:
            # No subscription record or free plan with no trial history
            category = "never_trialed"

        summary[category] += 1
        annotated.append({**user, "category": category})

    return {"summary": summary, "users": annotated}


def _require_dev():
    """Block admin endpoints in production."""
    from fastapi import HTTPException
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/dashboard", dependencies=[Depends(_require_dev)])
async def get_dashboard(
    _secret: str = Depends(verify_cron_secret),
):
    """Return user overview for the admin dashboard."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to fetch subscriptions for admin dashboard: %s", data)
        return {"summary": {}, "users": [], "error": "Failed to fetch data"}

    users = data.get("data", [])

    # Merge CRM profile data + feedback data in parallel
    crm_task = service.call_function(
        "crm",
        method="GET",
        params={"action": "list_profiles"},
    )
    contact_fb_task = service.call_function(
        "user-feedback",
        method="POST",
        params={"action": "aggregate"},
        json_body={},
    )
    questionnaire_task = service.call_function(
        "access-requests",
        method="POST",
        params={"action": "aggregate"},
        json_body={},
    )

    crm_result, contact_fb_result, questionnaire_result = await asyncio.gather(
        crm_task, contact_fb_task, questionnaire_task,
    )

    # CRM profiles
    crm_data = crm_result.get("data", {})
    profiles_list = crm_data.get("data", []) if crm_data.get("success") else []
    profile_map = {p["user_id"]: p for p in profiles_list}

    # Contact page feedback aggregated by email
    cf_data = contact_fb_result.get("data", {})
    contact_fb_map = cf_data.get("data", {}) if cf_data.get("success") else {}

    # Questionnaire submissions aggregated by email
    q_data = questionnaire_result.get("data", {})
    questionnaire_map = q_data.get("data", {}) if q_data.get("success") else {}

    for user in users:
        profile = profile_map.get(user["user_id"])
        user["ops_status"] = profile.get("ops_status") if profile else None
        user["ops_priority"] = profile.get("priority") if profile else None
        user["ops_name"] = profile.get("name") if profile else None
        user["ops_next_followup"] = profile.get("next_followup") if profile else None

        email = user.get("email")
        # Contact page feedback
        cf = contact_fb_map.get(email) if email else None
        user["contact_feedback_count"] = cf["count"] if cf else 0
        user["contact_feedback_rating"] = cf["latest_rating"] if cf else None
        # Questionnaire
        q = questionnaire_map.get(email) if email else None
        user["has_questionnaire"] = bool(q)
        user["questionnaire_background"] = q["background"] if q else None

    return _categorize_users(users)
