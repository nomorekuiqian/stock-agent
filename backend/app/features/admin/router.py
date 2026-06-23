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
from app.features.admin.cache import get_list_all
from app.features.feedback.db import (
    get_email_feedback_list,
    get_feedback_stats,
    get_user_feedback_list,
)
from app.utils.timezone import days_ago, today_str

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_SORT_KEYS = {
    "email",
    "conversations",
    "messages",
    "feedback_count",
    "api_calls",
    "last_active_at",
    "created_at",
}
ADMIN_CATEGORIES = {
    "all",
    "paid",
    "active_trial",
    "expiring_soon",
    "trial_expired",
    "never_trialed",
}
ADMIN_FILTER_TAGS = (
    "m:digest",
    "m:no_digest",
    "m:morning",
    "m:weekly",
    "e:conv",
    "e:email_fb",
    "e:api",
    "e:none",
    "f:quest",
    "f:contact",
    "o:待联系",
    "o:已联系",
    "o:跟进中",
    "o:已反馈",
    "o:活跃",
    "o:流失",
)



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
        is_lifetime = bool(user.get("is_lifetime"))
        has_stripe_subscription = bool(user.get("stripe_subscription_id"))

        if is_lifetime:
            category = "paid"
        elif (
            plan in ("pro", "max", "ultra")
            and status == "active"
            and not access_expires_at
            and has_stripe_subscription
        ):
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


def _has_entitlement(user: dict[str, Any], feature: str) -> bool:
    return feature in (user.get("entitlements") or [])


def _tag_matches(user: dict[str, Any], tag: str) -> bool:
    if tag == "m:digest":
        return bool(user.get("personal_digest_subscribed"))
    if tag == "m:no_digest":
        return not bool(user.get("personal_digest_subscribed"))
    if tag == "m:morning":
        return _has_entitlement(user, "morning_report_email")
    if tag == "m:weekly":
        return _has_entitlement(user, "weekly_report_email")
    if tag == "e:conv":
        return int(user.get("conversations") or 0) > 0
    if tag == "e:email_fb":
        return int(user.get("feedback_count") or 0) > 0
    if tag == "e:api":
        return int(user.get("api_calls") or 0) > 0
    if tag == "e:none":
        return (
            int(user.get("conversations") or 0) == 0
            and int(user.get("feedback_count") or 0) == 0
            and int(user.get("api_calls") or 0) == 0
        )
    if tag == "f:quest":
        return bool(user.get("has_questionnaire"))
    if tag == "f:contact":
        return int(user.get("contact_feedback_count") or 0) > 0
    if tag.startswith("o:"):
        return (user.get("ops_status") or "待联系") == tag.removeprefix("o:")
    return True


def _chip_counts(users: list[dict[str, Any]]) -> dict[str, int]:
    return {
        tag: sum(1 for user in users if _tag_matches(user, tag))
        for tag in ADMIN_FILTER_TAGS
    }


def _engagement_summary(users: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "with_conversations": sum(1 for u in users if int(u.get("conversations") or 0) > 0),
        "with_feedback": sum(1 for u in users if int(u.get("feedback_count") or 0) > 0),
        "total_conversations": sum(int(u.get("conversations") or 0) for u in users),
        "total_messages": sum(int(u.get("messages") or 0) for u in users),
        "personal_digest_subscribers": sum(
            1 for u in users if bool(u.get("personal_digest_subscribed"))
        ),
    }


def _tag_filters_match(user: dict[str, Any], tags: list[str]) -> bool:
    grouped: dict[str, list[str]] = {}
    for tag in tags:
        prefix = tag.split(":", 1)[0]
        grouped.setdefault(prefix, []).append(tag)
    return all(any(_tag_matches(user, tag) for tag in group) for group in grouped.values())


def _search_matches(user: dict[str, Any], query: str) -> bool:
    if not query:
        return True
    haystack = (
        user.get("email"),
        user.get("name"),
        user.get("user_id"),
        user.get("invite_code"),
    )
    return any(query in str(value or "").lower() for value in haystack)


def _sort_dashboard_users(
    users: list[dict[str, Any]],
    sort_key: str,
    sort_dir: str,
) -> list[dict[str, Any]]:
    reverse = sort_dir != "asc"

    def sort_value(user: dict[str, Any]) -> Any:
        value = user.get(sort_key)
        if sort_key in {"last_active_at", "created_at"}:
            return _parse_dt(value) or datetime.min.replace(tzinfo=timezone.utc)
        if sort_key in {"conversations", "messages", "feedback_count", "api_calls"}:
            return int(value or 0)
        return str(value or "").lower()

    return sorted(users, key=lambda user: (sort_value(user), user.get("user_id") or ""), reverse=reverse)


def _page_legacy_dashboard(
    dashboard: dict[str, Any],
    *,
    page: int,
    page_size: int,
    category: str,
    tags: list[str],
    search: str,
    sort_key: str,
    sort_dir: str,
) -> dict[str, Any]:
    """Fallback shape for deployments that have not applied the DB-side query yet."""
    users = dashboard.get("users", []) or []
    query = search.strip().lower()
    filtered = [
        user for user in users
        if (category == "all" or user.get("category") == category)
        and _search_matches(user, query)
        and _tag_filters_match(user, tags)
    ]
    sorted_users = _sort_dashboard_users(filtered, sort_key, sort_dir)
    start = (page - 1) * page_size
    page_users = sorted_users[start:start + page_size]
    total = len(filtered)

    return {
        **dashboard,
        "users": page_users,
        "engagement": _engagement_summary(users),
        "chip_counts": _chip_counts(users),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        },
    }


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
        "growth_metrics": _empty_growth_metrics(days),
    }


def _empty_email_metrics(
    days: int = 30,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    return {
        "days": days,
        "start_date": start_date,
        "end_date": end_date,
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


def _empty_growth_metrics(days: int = 30) -> dict[str, Any]:
    return {
        "days": days,
        "current": {"start_date": None, "end_date": None},
        "previous": {"start_date": None, "end_date": None},
        "metrics": [],
    }


def _shape_metric_period(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"value": None, "numerator": 0, "denominator": 0}
    raw_value = value.get("value")
    return {
        "value": float(raw_value) if raw_value is not None else None,
        "numerator": int(float(value.get("numerator") or 0)),
        "denominator": int(float(value.get("denominator") or 0)),
    }


def _shape_growth_metrics(payload: Any, days: int = 30) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return _empty_growth_metrics(days)

    metrics = []
    for row in payload.get("metrics", []) or []:
        if not isinstance(row, dict):
            continue
        metrics.append({
            "key": str(row.get("key") or ""),
            "category": str(row.get("category") or "Other"),
            "priority": str(row.get("priority") or ""),
            "label": str(row.get("label") or ""),
            "format": str(row.get("format") or "percent"),
            "description": str(row.get("description") or ""),
            "current": _shape_metric_period(row.get("current")),
            "previous": _shape_metric_period(row.get("previous")),
        })

    return {
        "days": int(payload.get("days") or days),
        "current": payload.get("current") if isinstance(payload.get("current"), dict) else {
            "start_date": None,
            "end_date": None,
        },
        "previous": payload.get("previous") if isinstance(payload.get("previous"), dict) else {
            "start_date": None,
            "end_date": None,
        },
        "metrics": metrics,
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
        "growth_metrics": _shape_growth_metrics(
            payload.get("growth_metrics"),
            days=int(payload.get("days") or days),
        ),
    }


def _shape_email_metrics(
    payload: dict[str, Any],
    days: int = 30,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    if not payload.get("success"):
        return _empty_email_metrics(days, start_date=start_date, end_date=end_date)

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
        "start_date": payload.get("start_date") or start_date,
        "end_date": payload.get("end_date") or end_date,
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


async def _fetch_activity(
    days: int,
    *,
    include_growth: bool = True,
    growth_start: str | None = None,
    growth_end: str | None = None,
) -> dict[str, Any]:
    service = get_insforge_service()
    params: dict[str, Any] = {
        "action": "daily",
        "days": days,
        "include_growth": "true" if include_growth else "false",
    }
    if include_growth and growth_start and growth_end:
        params["growth_start"] = growth_start
        params["growth_end"] = growth_end
    result = await service.call_function(
        "admin-activity",
        method="GET",
        params=params,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=30.0,
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    return _shape_activity_dashboard(data, days=days)


async def _fetch_email_metrics(
    days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    service = get_insforge_service()
    params: dict[str, Any] = {"action": "summary", "days": days}
    if start_date and end_date:
        params["start_date"] = start_date
        params["end_date"] = end_date
    result = await service.call_function(
        "email-events",
        method="GET",
        params=params,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=30.0,
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    return _shape_email_metrics(
        data,
        days=days,
        start_date=start_date,
        end_date=end_date,
    )


async def _fetch_dashboard_page(
    *,
    service: Any,
    page: int,
    page_size: int,
    category: str,
    tags: list[str],
    search: str,
    sort_key: str,
    sort_dir: str,
) -> dict[str, Any] | None:
    params: dict[str, Any] = {
        "action": "list_dashboard",
        "page": page,
        "page_size": page_size,
        "category": category,
        "search": search,
        "sort_key": sort_key,
        "sort_dir": sort_dir,
    }
    if tags:
        params["tag"] = tags

    result = await service.call_function(
        "subscriptions",
        method="GET",
        params=params,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=30.0,
    )
    data = result.get("data", {}) if isinstance(result, dict) else {}
    if result.get("status_code") != 200 or not data.get("success"):
        logger.warning(
            "admin dashboard page query unavailable: status=%s error=%s",
            result.get("status_code"),
            data.get("error") or result.get("text"),
        )
        return None
    payload = data.get("data")
    return payload if isinstance(payload, dict) else None


async def _load_legacy_dashboard(service: Any) -> dict[str, Any]:
    # Shared, coalesced cache: the user-detail page's fallback hits the same
    # list_all, so repeat admin navigation reuses one upstream fetch.
    result = await get_list_all(lambda: service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    ))
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to fetch subscriptions for admin dashboard: %s", data)
        return {"summary": {}, "users": [], "error": "Failed to fetch data"}

    users = data.get("data", [])

    # Merge CRM profile data + feedback data in parallel. Slow aggregates
    # degrade to partial data in 10s instead of hanging the whole page.
    crm_task = service.call_function(
        "crm",
        method="GET",
        params={"action": "list_profiles"},
        timeout=10.0,
    )
    contact_fb_task = service.call_function(
        "user-feedback",
        method="POST",
        params={"action": "aggregate"},
        json_body={},
        timeout=10.0,
    )
    questionnaire_task = service.call_function(
        "access-requests",
        method="POST",
        params={"action": "aggregate"},
        json_body={},
        timeout=10.0,
    )

    crm_result, contact_fb_result, questionnaire_result = await asyncio.gather(
        crm_task, contact_fb_task, questionnaire_task,
        return_exceptions=True,
    )

    crm_data = crm_result.get("data", {}) if isinstance(crm_result, dict) else {}
    profiles_list = crm_data.get("data", []) if crm_data.get("success") else []
    profile_map = {p["user_id"]: p for p in profiles_list}

    cf_data = contact_fb_result.get("data", {}) if isinstance(contact_fb_result, dict) else {}
    contact_fb_map = cf_data.get("data", {}) if cf_data.get("success") else {}

    q_data = questionnaire_result.get("data", {}) if isinstance(questionnaire_result, dict) else {}
    questionnaire_map = q_data.get("data", {}) if q_data.get("success") else {}

    for user in users:
        profile = profile_map.get(user["user_id"])
        user["ops_status"] = profile.get("ops_status") if profile else None
        user["ops_priority"] = profile.get("priority") if profile else None
        user["ops_name"] = profile.get("name") if profile else None
        user["ops_next_followup"] = profile.get("next_followup") if profile else None

        email = user.get("email")
        cf = contact_fb_map.get(email) if email else None
        user["contact_feedback_count"] = cf["count"] if cf else 0
        user["contact_feedback_rating"] = cf["latest_rating"] if cf else None

        q = questionnaire_map.get(email) if email else None
        user["has_questionnaire"] = bool(q)
        user["questionnaire_background"] = q["background"] if q else None
        user["personal_digest_subscribed"] = (
            "personal_digest_email" in (user.get("entitlements") or [])
        )

    return _categorize_users(users)


@router.get("/whoami")
async def get_admin_status(
    user_info: dict = Depends(verify_user_token_with_email),
):
    """Return whether the current authenticated user is an admin. Used by the frontend to gate admin UI."""
    email = (user_info.get("email") or "").lower()
    return {"is_admin": email in ADMIN_EMAILS}


@router.get("/feedback")
async def get_feedback_dashboard(
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD), defaults to 30 days ago"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD), defaults to today"),
    page: int = Query(1, ge=1, description="Contact feedback page number"),
    page_size: int = Query(20, ge=1, le=100, description="Contact feedback page size"),
    _admin: dict = Depends(verify_admin_user),
):
    """Return email and contact feedback data for the admin dashboard."""
    if not end_date:
        end_date = today_str()
    if not start_date:
        start_date = days_ago(30)

    stats_result, user_result, email_list_result = await asyncio.gather(
        get_feedback_stats(start_date=start_date, end_date=end_date),
        get_user_feedback_list(page=page, page_size=page_size),
        get_email_feedback_list(start_date=start_date, end_date=end_date),
        return_exceptions=True,
    )

    if not isinstance(stats_result, dict) or not stats_result.get("success"):
        detail = (
            stats_result.get("error", "Failed to get email feedback stats")
            if isinstance(stats_result, dict)
            else "Failed to get email feedback stats"
        )
        raise HTTPException(status_code=502, detail=detail)

    if not isinstance(user_result, dict) or not user_result.get("success"):
        detail = (
            user_result.get("error", "Failed to get contact feedback list")
            if isinstance(user_result, dict)
            else "Failed to get contact feedback list"
        )
        raise HTTPException(status_code=502, detail=detail)

    if isinstance(email_list_result, dict) and email_list_result.get("success"):
        email_list = {
            "data": email_list_result.get("data", []),
            "total_records": email_list_result.get("total_records", 0),
            "_error": None,
        }
    else:
        email_list = {
            "data": [],
            "total_records": 0,
            "_error": (
                email_list_result.get("error", "Failed to get email feedback records")
                if isinstance(email_list_result, dict)
                else "Failed to get email feedback records"
            ),
        }

    return {
        "date_range": {"start_date": start_date, "end_date": end_date},
        "stats": {
            "total": stats_result.get("total", 0),
            "breakdown": stats_result.get("breakdown", {}),
            "satisfaction_rate": stats_result.get("satisfaction_rate", 0),
            "daily": stats_result.get("daily", []),
        },
        "userFeedback": {
            "data": user_result.get("data", []),
            "total": user_result.get("total", 0),
            "page": user_result.get("page", page),
            "page_size": user_result.get("page_size", page_size),
            "total_pages": user_result.get("total_pages", 0),
        },
        "emailList": email_list,
    }


@router.get("/activity")
async def get_activity(
    days: int = Query(60, ge=1, le=90),
    growth_start: str | None = Query(None),
    growth_end: str | None = Query(None),
    email_start: str | None = Query(None),
    email_end: str | None = Query(None),
    _admin: dict = Depends(verify_admin_user),
):
    """Return daily activity for admin trend comparisons."""
    activity, email_metrics = await asyncio.gather(
        _fetch_activity(
            days,
            include_growth=True,
            growth_start=growth_start,
            growth_end=growth_end,
        ),
        _fetch_email_metrics(days, start_date=email_start, end_date=email_end),
        return_exceptions=True,
    )
    if not isinstance(activity, dict):
        activity = _empty_activity(days)
    if not isinstance(email_metrics, dict):
        email_metrics = _empty_email_metrics(
            days,
            start_date=email_start,
            end_date=email_end,
        )
    return {**activity, "email_metrics": email_metrics}


@router.get("/dashboard")
async def get_dashboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    category: str = Query("all"),
    tag: list[str] | None = Query(None),
    search: str = Query(""),
    sort_key: str = Query("last_active_at"),
    sort_dir: str = Query("desc"),
    include_activity: bool = Query(True),
    _admin: dict = Depends(verify_admin_user),
):
    """Return user overview for the admin dashboard."""
    service = get_insforge_service()
    clean_category = category if category in ADMIN_CATEGORIES else "all"
    clean_tags = [value for value in (tag or []) if value in ADMIN_FILTER_TAGS]
    clean_sort_key = sort_key if sort_key in ADMIN_SORT_KEYS else "last_active_at"
    clean_sort_dir = "asc" if sort_dir == "asc" else "desc"

    dashboard_task = _fetch_dashboard_page(
        service=service,
        page=page,
        page_size=page_size,
        category=clean_category,
        tags=clean_tags,
        search=search,
        sort_key=clean_sort_key,
        sort_dir=clean_sort_dir,
    )
    if include_activity:
        dashboard_result, activity_result = await asyncio.gather(
            dashboard_task,
            _fetch_activity(30, include_growth=False),
            return_exceptions=True,
        )
        activity = activity_result if isinstance(activity_result, dict) else _empty_activity(30)
    else:
        (dashboard_result,) = await asyncio.gather(dashboard_task, return_exceptions=True)
        activity = None

    if isinstance(dashboard_result, dict):
        if activity is not None:
            dashboard_result["activity"] = activity
        return dashboard_result

    legacy = await _load_legacy_dashboard(service)
    if legacy.get("error"):
        if activity is not None:
            legacy["activity"] = activity
        return legacy

    dashboard = _page_legacy_dashboard(
        legacy,
        page=page,
        page_size=page_size,
        category=clean_category,
        tags=clean_tags,
        search=search,
        sort_key=clean_sort_key,
        sort_dir=clean_sort_dir,
    )
    if activity is not None:
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
