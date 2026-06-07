"""
Admin CRM API - user profiles and interaction tracking.
Protected by admin email whitelist.
"""

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from datetime import datetime, timezone, timedelta

from app.core.database import get_insforge_service
from app.core.deps import verify_admin_user
from app.core.logging import get_logger
from app.features.payment.db import get_subscription, upsert_subscription
from app.features.payment.entitlements import MAX_FEATURES, PRO_FEATURES

logger = get_logger(__name__)


router = APIRouter(
    prefix="/api/admin/crm",
    tags=["admin-crm"],
    dependencies=[Depends(verify_admin_user)],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ProfileUpsert(BaseModel):
    user_id: str
    name: str | None = None
    wechat: str | None = None
    channel: str | None = None
    ops_status: str | None = None
    priority: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    next_followup: str | None = None


class BulkProfileUpdate(BaseModel):
    user_ids: list[str]
    ops_status: str | None = None
    priority: str | None = None
    tags: list[str] | None = None


class GrantSubscription(BaseModel):
    user_id: str
    days: int = Field(ge=1, le=365, default=30)
    plan: Literal["pro", "max"] = "max"


class InteractionCreate(BaseModel):
    user_id: str
    date: str | None = None
    type: str | None = None
    summary: str | None = None
    content: str | None = None
    key_feedback: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    sentiment: str | None = None


class InteractionUpdate(BaseModel):
    id: str
    date: str | None = None
    type: str | None = None
    summary: str | None = None
    content: str | None = None
    key_feedback: list[str] | None = None
    action_items: list[str] | None = None
    sentiment: str | None = None


# ---------------------------------------------------------------------------
# User detail: merged subscription + CRM profile + interactions
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
) -> dict[str, Any]:
    """Get full user detail: subscription + CRM profile + interactions + feedback +
    email subscriptions + personal digest summary + recent agent conversations."""

    service = get_insforge_service()

    # 1) Get email + subscription via list_all (already merges auth.users + subscriptions)
    all_result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    all_users = all_result.get("data", {}).get("data", [])
    user_record = next((u for u in all_users if u.get("user_id") == user_id), None)
    email = user_record.get("email") if user_record else None

    # 2) Parallel: CRM profile, interactions, conversations, watchlist, portfolio
    profile_task = service.call_function(
        "crm",
        method="GET",
        params={"action": "get_profile", "user_id": user_id},
    )
    interactions_task = service.call_function(
        "crm",
        method="GET",
        params={"action": "list_interactions", "user_id": user_id},
    )
    conversations_task = service.call_function(
        "picker-conversations",
        method="GET",
        params={"action": "list", "user_id": user_id},
    )
    watchlist_task = service.call_function(
        "user-holdings",
        method="GET",
        params={"action": "get_watchlist", "user_id": user_id},
    )
    portfolio_task = service.call_function(
        "user-holdings",
        method="GET",
        params={"action": "get_portfolio", "user_id": user_id},
    )

    (
        profile_result, interactions_result, conversations_result,
        watchlist_result, portfolio_result,
    ) = await asyncio.gather(
        profile_task, interactions_task, conversations_task,
        watchlist_task, portfolio_task,
        return_exceptions=True,
    )

    profile = (
        profile_result.get("data", {}).get("data")
        if isinstance(profile_result, dict) else None
    )
    interactions = (
        interactions_result.get("data", {}).get("data", [])
        if isinstance(interactions_result, dict) else []
    )
    conversations_full = (
        conversations_result.get("data", {}).get("data", [])
        if isinstance(conversations_result, dict) else []
    )
    watchlist = (
        watchlist_result.get("data", {}).get("data")
        if isinstance(watchlist_result, dict) else None
    )
    portfolio = (
        portfolio_result.get("data", {}).get("data", [])
        if isinstance(portfolio_result, dict) else []
    )
    # Edge function already orders by updated_at desc and limits to 20; trim to 10 for the page.
    conversations = conversations_full[:10]
    conversations_total = len(conversations_full)

    # 3) Personal digest summary — reuse aggregates carried by list_all
    personal_digest = {
        "count_30d": user_record.get("personal_digest_count_30d", 0) if user_record else 0,
        "last_date": user_record.get("personal_digest_last_date") if user_record else None,
    }

    # 4) Email subscriptions
    # - morning/daily/weekly come from Resend ContactSegments (one email lookup)
    # - personal_digest reflects the actual broadcast trigger:
    #   broadcast_personal_digests iterates list_entitled_users("personal_digest_email"),
    #   so subscription is determined by entitlements, not by Resend audience.
    email_subscriptions: dict[str, bool] | None = None
    if email:
        try:
            from app.features.subscription.service import get_subscription_service
            sub_svc = get_subscription_service()
            prefs = await asyncio.to_thread(sub_svc.get_email_preferences, email)
            ents = (user_record.get("entitlements") if user_record else None) or []
            email_subscriptions = {
                "morning_report": bool(prefs.get("morning_report")),
                "daily_report": bool(prefs.get("daily_report")),
                "weekly_report": bool(prefs.get("weekly_report")),
                "personal_digest": "personal_digest_email" in ents,
            }
        except Exception as e:
            logger.warning("email_subscriptions lookup failed for %s: %s", email, e)

    # 5) Feedback data (needs email)
    contact_feedbacks: list[dict[str, Any]] = []
    questionnaires: list[dict[str, Any]] = []

    if email:
        cf_task = service.call_function(
            "user-feedback",
            method="POST",
            params={"action": "list_by_email"},
            json_body={"email": email},
        )
        q_task = service.call_function(
            "access-requests",
            method="POST",
            params={"action": "list_by_email"},
            json_body={"email": email},
        )
        cf_result, q_result = await asyncio.gather(
            cf_task, q_task, return_exceptions=True,
        )

        if isinstance(cf_result, dict):
            cf_data = cf_result.get("data", {})
            contact_feedbacks = cf_data.get("data", []) if cf_data.get("success") else []

        if isinstance(q_result, dict):
            q_data = q_result.get("data", {})
            questionnaires = q_data.get("data", []) if q_data.get("success") else []

    return {
        "user_id": user_id,
        "email": email,
        "subscription": user_record,
        "profile": profile,
        "interactions": interactions,
        "contact_feedbacks": contact_feedbacks,
        "questionnaires": questionnaires,
        "email_subscriptions": email_subscriptions,
        "personal_digest": personal_digest,
        "conversations": conversations,
        "conversations_total": conversations_total,
        "watchlist": watchlist,
        "portfolio": portfolio,
    }


@router.get("/users/{user_id}/conversations")
async def list_user_conversations(
    user_id: str,
) -> dict[str, Any]:
    """List all (up to 20, edge function limit) Agent conversations for a user."""
    service = get_insforge_service()
    result = await service.call_function(
        "picker-conversations",
        method="GET",
        params={"action": "list", "user_id": user_id},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to list conversations for %s: %s", user_id[:8], data)
        return {"conversations": [], "error": "Failed to fetch conversations"}
    return {"conversations": data.get("data", [])}


@router.get("/users/{user_id}/conversations/{conversation_id}")
async def get_user_conversation(
    user_id: str,
    conversation_id: str,
) -> dict[str, Any]:
    """Get full conversation including messages."""
    service = get_insforge_service()
    result = await service.call_function(
        "picker-conversations",
        method="GET",
        params={"action": "get", "id": conversation_id, "user_id": user_id},
    )
    data = result.get("data", {})
    if not data.get("success"):
        return {"conversation": None, "error": data.get("error", "Failed to fetch conversation")}
    return {"conversation": data.get("data")}


# ---------------------------------------------------------------------------
# CRM Profiles
# ---------------------------------------------------------------------------

@router.get("/profiles")
async def list_profiles(
) -> dict[str, Any]:
    """List all CRM profiles."""
    service = get_insforge_service()
    result = await service.call_function(
        "crm",
        method="GET",
        params={"action": "list_profiles"},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to list CRM profiles: %s", data)
        return {"profiles": [], "error": "Failed to fetch data"}
    return {"profiles": data.get("data", [])}


@router.post("/profiles")
async def upsert_profile(
    body: ProfileUpsert,
) -> dict[str, Any]:
    """Create or update a user CRM profile."""
    service = get_insforge_service()
    payload = body.model_dump(exclude_none=True)
    result = await service.call_function(
        "crm",
        method="POST",
        params={"action": "upsert_profile"},
        json_body=payload,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to upsert CRM profile: %s", data)
        return {"error": data.get("error", "Failed to save profile")}
    return {"profile": data.get("data")}


@router.post("/profiles/bulk")
async def bulk_update_profiles(
    body: BulkProfileUpdate,
) -> dict[str, Any]:
    """Bulk update ops_status / priority / tags for multiple users."""
    if not body.user_ids:
        return {"updated": 0}

    service = get_insforge_service()
    fields: dict[str, Any] = {}
    if body.ops_status is not None:
        fields["ops_status"] = body.ops_status
    if body.priority is not None:
        fields["priority"] = body.priority
    if body.tags is not None:
        fields["tags"] = body.tags

    if not fields:
        return {"updated": 0}

    # Upsert each profile in parallel
    tasks = []
    for uid in body.user_ids:
        tasks.append(service.call_function(
            "crm",
            method="POST",
            params={"action": "upsert_profile"},
            json_body={"user_id": uid, **fields},
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    updated = sum(
        1 for r in results
        if isinstance(r, dict) and r.get("data", {}).get("success")
    )
    logger.info("Bulk profile update: %d/%d updated, fields=%s", updated, len(body.user_ids), list(fields.keys()))
    return {"updated": updated, "total": len(body.user_ids)}


# ---------------------------------------------------------------------------
# Interactions
# ---------------------------------------------------------------------------

@router.get("/interactions/{user_id}")
async def list_interactions(
    user_id: str,
) -> dict[str, Any]:
    """List all interactions for a user, newest first."""
    service = get_insforge_service()
    result = await service.call_function(
        "crm",
        method="GET",
        params={"action": "list_interactions", "user_id": user_id},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to list interactions for %s: %s", user_id, data)
        return {"interactions": [], "error": "Failed to fetch data"}
    return {"interactions": data.get("data", [])}


@router.post("/interactions")
async def add_interaction(
    body: InteractionCreate,
) -> dict[str, Any]:
    """Add a new interaction record."""
    service = get_insforge_service()
    payload = body.model_dump(exclude_none=True)
    result = await service.call_function(
        "crm",
        method="POST",
        params={"action": "add_interaction"},
        json_body=payload,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to add interaction: %s", data)
        return {"error": data.get("error", "Failed to save interaction")}
    return {"interaction": data.get("data")}


@router.put("/interactions")
async def update_interaction(
    body: InteractionUpdate,
) -> dict[str, Any]:
    """Update an existing interaction."""
    service = get_insforge_service()
    payload = body.model_dump(exclude_none=True)
    result = await service.call_function(
        "crm",
        method="POST",
        params={"action": "update_interaction"},
        json_body=payload,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to update interaction: %s", data)
        return {"error": data.get("error", "Failed to update interaction")}
    return {"interaction": data.get("data")}


# ---------------------------------------------------------------------------
# Grant subscription (admin gift)
# ---------------------------------------------------------------------------

@router.post("/users/{user_id}/grant-subscription")
async def grant_subscription(
    user_id: str,
    body: GrantSubscription,
) -> dict[str, Any]:
    """Admin grants a subscription to a user (gift / trial extension).

    If the user already has an active subscription with a future expiry,
    the granted days are added on top of that date.
    """
    now = datetime.now(timezone.utc)
    base = now

    existing = await get_subscription(user_id)
    if existing and existing.get("access_expires_at"):
        try:
            existing_expiry = datetime.fromisoformat(existing["access_expires_at"])
            if existing_expiry > now:
                base = existing_expiry
        except (ValueError, TypeError):
            pass

    access_expires_at = (base + timedelta(days=body.days)).isoformat()
    grant_entitlements = MAX_FEATURES if body.plan == "max" else PRO_FEATURES

    success = await upsert_subscription(
        user_id=user_id,
        plan=body.plan,
        status="active",
        invite_code="ADMIN_GRANT",
        access_expires_at=access_expires_at,
        current_period_end=access_expires_at,
        entitlements=sorted(grant_entitlements),
    )

    if not success:
        logger.error("Failed to grant subscription for user %s", user_id[:8])
        return {"success": False, "error": "Failed to grant subscription"}

    logger.info(
        "Admin granted %s subscription: user=%s days=%d expires=%s",
        body.plan, user_id[:8], body.days, access_expires_at[:10],
    )
    return {
        "success": True,
        "plan": body.plan,
        "days": body.days,
        "access_expires_at": access_expires_at,
    }


@router.delete("/interactions/{interaction_id}")
async def delete_interaction(
    interaction_id: str,
) -> dict[str, Any]:
    """Delete an interaction."""
    service = get_insforge_service()
    result = await service.call_function(
        "crm",
        method="DELETE",
        params={"action": "delete_interaction", "id": interaction_id},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("Failed to delete interaction %s: %s", interaction_id, data)
        return {"error": data.get("error", "Failed to delete interaction")}
    return {"deleted": interaction_id}
