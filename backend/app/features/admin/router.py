"""
Admin dashboard API - user stats and subscription overview.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import ADMIN_EMAILS, EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.deps import verify_admin_user, verify_user_token_with_email
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


def _empty_activity(days: int = 30) -> dict[str, Any]:
    return {
        "days": days,
        "daily": [],
        "summary": {
            "today": 0,
            "yesterday": 0,
            "avg_7d": 0.0,
            "avg_30d": 0.0,
            "max_30d": 0,
            "events_30d": 0,
            "api_calls_30d": 0,
        },
    }


def _empty_email_metrics(days: int = 30) -> dict[str, Any]:
    return {
        "days": days,
        "daily": [],
        "by_channel": [],
        "summary": {
            "delivered": 0,
            "opened": 0,
            "clicked": 0,
            "bounced": 0,
            "complained": 0,
            "failed": 0,
            "open_rate": 0.0,
            "click_rate": 0.0,
        },
    }


def _shape_activity_dashboard(payload: dict[str, Any], days: int = 30) -> dict[str, Any]:
    if not payload.get("success"):
        return _empty_activity(days)

    rows = payload.get("data", []) or []
    daily = [
        {
            "day": str(row.get("day") or ""),
            "active_users": int(row.get("active_users") or 0),
            "event_count": int(row.get("event_count") or 0),
            "api_calls": int(row.get("api_calls") or 0),
        }
        for row in rows
    ]

    active_values = [row["active_users"] for row in daily]
    today = active_values[-1] if active_values else 0
    yesterday = active_values[-2] if len(active_values) >= 2 else 0
    last_7 = active_values[-7:]

    return {
        "days": int(payload.get("days") or days),
        "daily": daily,
        "summary": {
            "today": today,
            "yesterday": yesterday,
            "avg_7d": round(sum(last_7) / len(last_7), 1) if last_7 else 0.0,
            "avg_30d": round(sum(active_values) / len(active_values), 1) if active_values else 0.0,
            "max_30d": max(active_values) if active_values else 0,
            "events_30d": sum(row["event_count"] for row in daily),
            "api_calls_30d": sum(row["api_calls"] for row in daily),
        },
    }


def _shape_email_metrics(payload: dict[str, Any], days: int = 30) -> dict[str, Any]:
    if not payload.get("success"):
        return _empty_email_metrics(days)

    daily = [
        {
            "day": str(row.get("day") or ""),
            "delivered": int(row.get("delivered") or 0),
            "opened": int(row.get("opened") or 0),
            "clicked": int(row.get("clicked") or 0),
            "bounced": int(row.get("bounced") or 0),
            "complained": int(row.get("complained") or 0),
            "failed": int(row.get("failed") or 0),
            "open_rate": float(row.get("open_rate") or 0),
            "click_rate": float(row.get("click_rate") or 0),
        }
        for row in (payload.get("daily", []) or [])
    ]
    by_channel = [
        {
            "channel": str(row.get("channel") or "unknown"),
            "delivered": int(row.get("delivered") or 0),
            "opened": int(row.get("opened") or 0),
            "clicked": int(row.get("clicked") or 0),
            "bounced": int(row.get("bounced") or 0),
            "complained": int(row.get("complained") or 0),
            "failed": int(row.get("failed") or 0),
            "open_rate": float(row.get("open_rate") or 0),
            "click_rate": float(row.get("click_rate") or 0),
        }
        for row in (payload.get("by_channel", []) or [])
    ]

    delivered = sum(row["delivered"] for row in daily)
    opened = sum(row["opened"] for row in daily)
    clicked = sum(row["clicked"] for row in daily)
    bounced = sum(row["bounced"] for row in daily)
    complained = sum(row["complained"] for row in daily)
    failed = sum(row["failed"] for row in daily)

    return {
        "days": int(payload.get("days") or days),
        "daily": daily,
        "by_channel": by_channel,
        "summary": {
            "delivered": delivered,
            "opened": opened,
            "clicked": clicked,
            "bounced": bounced,
            "complained": complained,
            "failed": failed,
            "open_rate": round((opened / delivered) * 100, 2) if delivered else 0.0,
            "click_rate": round((clicked / delivered) * 100, 2) if delivered else 0.0,
        },
    }


async def _fetch_activity(days: int) -> dict[str, Any]:
    service = get_insforge_service()
    result = await service.call_function(
        "admin-activity",
        method="GET",
        params={"action": "daily", "days": days},
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=30.0,
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    return _shape_activity_dashboard(data, days=days)


async def _fetch_email_metrics(days: int) -> dict[str, Any]:
    service = get_insforge_service()
    result = await service.call_function(
        "email-events",
        method="GET",
        params={"action": "summary", "days": days},
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=30.0,
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    return _shape_email_metrics(data, days=days)


@router.get("/whoami")
async def get_admin_status(
    user_info: dict = Depends(verify_user_token_with_email),
):
    """Return whether the current authenticated user is an admin. Used by the frontend to gate admin UI."""
    email = (user_info.get("email") or "").lower()
    return {"is_admin": email in ADMIN_EMAILS}


@router.get("/activity")
async def get_activity(
    days: int = Query(60, ge=14, le=90),
    _admin: dict = Depends(verify_admin_user),
):
    """Return daily activity for admin trend comparisons."""
    activity, email_metrics = await asyncio.gather(
        _fetch_activity(days),
        _fetch_email_metrics(days),
        return_exceptions=True,
    )
    if not isinstance(activity, dict):
        activity = _empty_activity(days)
    if not isinstance(email_metrics, dict):
        email_metrics = _empty_email_metrics(days)
    return {**activity, "email_metrics": email_metrics}


@router.get("/dashboard")
async def get_dashboard(
    _admin: dict = Depends(verify_admin_user),
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
    activity_task = _fetch_activity(30)

    crm_result, contact_fb_result, questionnaire_result, activity_result = await asyncio.gather(
        crm_task, contact_fb_task, questionnaire_task, activity_task,
        return_exceptions=True,
    )

    # CRM profiles
    crm_data = crm_result.get("data", {}) if isinstance(crm_result, dict) else {}
    profiles_list = crm_data.get("data", []) if crm_data.get("success") else []
    profile_map = {p["user_id"]: p for p in profiles_list}

    # Contact page feedback aggregated by email
    cf_data = contact_fb_result.get("data", {}) if isinstance(contact_fb_result, dict) else {}
    contact_fb_map = cf_data.get("data", {}) if cf_data.get("success") else {}

    # Questionnaire submissions aggregated by email
    q_data = questionnaire_result.get("data", {}) if isinstance(questionnaire_result, dict) else {}
    questionnaire_map = q_data.get("data", {}) if q_data.get("success") else {}

    activity = activity_result if isinstance(activity_result, dict) else _empty_activity(30)

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
        # Email subscriptions — derived from entitlements (real broadcast trigger).
        # broadcast_personal_digests calls list_entitled_users("personal_digest_email"),
        # so a user is "subscribed" iff that entitlement is present.
        user["personal_digest_subscribed"] = (
            "personal_digest_email" in (user.get("entitlements") or [])
        )

    dashboard = _categorize_users(users)
    dashboard["activity"] = activity
    return dashboard


def _estimate_usd(model: str | None, prompt_tokens: int, output_tokens: int) -> float:
    """Rough USD estimate from token counts. Update when Google pricing changes."""
    m = (model or "").lower()
    if "flash-lite" in m:
        in_rate, out_rate = 0.10, 0.40
    elif "flash" in m:
        in_rate, out_rate = 0.30, 2.50
    else:
        in_rate, out_rate = 1.25, 5.00
    return prompt_tokens / 1_000_000 * in_rate + output_tokens / 1_000_000 * out_rate


@router.get("/llm-usage")
async def get_llm_usage(
    days: int = Query(14, ge=1, le=90),
    _admin: dict = Depends(verify_admin_user),
):
    """Return per-day, per-feature LLM usage with USD estimates for the admin dashboard."""
    if not EDGE_FUNCTION_SECRET:
        raise HTTPException(500, "EDGE_FUNCTION_SECRET not configured")

    service = get_insforge_service()
    result = await service.call_function(
        "llm-usage",
        method="GET",
        params={"action": "daily", "days": days},
        extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
        timeout=30.0,
    )

    if result.get("status_code") != 200:
        logger.error("llm-usage edge function failed: status=%s text=%s",
                     result.get("status_code"), result.get("text"))
        raise HTTPException(502, "Failed to fetch llm-usage data")

    data = result.get("data", {})
    if not data.get("success"):
        raise HTTPException(502, f"Edge function error: {data.get('error', 'unknown')}")

    rows = data.get("summary", []) or []
    enriched = [
        {**r, "est_usd": round(_estimate_usd(r.get("model"), r.get("prompt_tokens", 0), r.get("output_tokens", 0)), 4)}
        for r in rows
    ]

    days_set: set[str] = set()
    features_set: set[str] = set()
    feature_totals: dict[str, dict[str, Any]] = {}
    day_totals: dict[str, float] = {}
    total_usd = 0.0

    for r in enriched:
        d = r.get("day") or ""
        f = r.get("feature") or "unknown"
        usd = r["est_usd"]
        days_set.add(d)
        features_set.add(f)
        day_totals[d] = day_totals.get(d, 0.0) + usd
        total_usd += usd
        ft = feature_totals.setdefault(f, {
            "feature": f, "calls": 0, "prompt_tokens": 0, "output_tokens": 0,
            "total_tokens": 0, "est_usd": 0.0,
        })
        ft["calls"] += r.get("calls", 0)
        ft["prompt_tokens"] += r.get("prompt_tokens", 0)
        ft["output_tokens"] += r.get("output_tokens", 0)
        ft["total_tokens"] += r.get("total_tokens", 0)
        ft["est_usd"] += usd

    feature_breakdown = sorted(
        ({**v, "est_usd": round(v["est_usd"], 4)} for v in feature_totals.values()),
        key=lambda x: -x["est_usd"],
    )

    return {
        "days": days,
        "rows": enriched,
        "feature_breakdown": feature_breakdown,
        "day_totals": [{"day": d, "est_usd": round(day_totals[d], 4)} for d in sorted(day_totals)],
        "all_days": sorted(days_set),
        "all_features": sorted(features_set),
        "total_usd": round(total_usd, 4),
    }
