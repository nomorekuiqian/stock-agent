"""
Admin CRM API - user profiles and interaction tracking.
Dev-only: blocked in production.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_insforge_service
from app.core.config import ENVIRONMENT
from app.core.deps import verify_cron_secret
from app.core.logging import get_logger

logger = get_logger(__name__)


def _require_dev():
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not found")


router = APIRouter(
    prefix="/api/admin/crm",
    tags=["admin-crm"],
    dependencies=[Depends(_require_dev)],
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
    _secret: str = Depends(verify_cron_secret),
) -> dict[str, Any]:
    """Get full user detail: subscription data + CRM profile + recent interactions."""
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

    # 2) CRM profile
    profile_result = await service.call_function(
        "crm",
        method="GET",
        params={"action": "get_profile", "user_id": user_id},
    )
    profile = profile_result.get("data", {}).get("data")

    # 3) Interactions
    interactions_result = await service.call_function(
        "crm",
        method="GET",
        params={"action": "list_interactions", "user_id": user_id},
    )
    interactions = interactions_result.get("data", {}).get("data", [])

    return {
        "user_id": user_id,
        "email": user_record.get("email") if user_record else None,
        "subscription": user_record,
        "profile": profile,
        "interactions": interactions,
    }


# ---------------------------------------------------------------------------
# CRM Profiles
# ---------------------------------------------------------------------------

@router.get("/profiles")
async def list_profiles(
    _secret: str = Depends(verify_cron_secret),
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
    _secret: str = Depends(verify_cron_secret),
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


# ---------------------------------------------------------------------------
# Interactions
# ---------------------------------------------------------------------------

@router.get("/interactions/{user_id}")
async def list_interactions(
    user_id: str,
    _secret: str = Depends(verify_cron_secret),
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
    _secret: str = Depends(verify_cron_secret),
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
    _secret: str = Depends(verify_cron_secret),
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


@router.delete("/interactions/{interaction_id}")
async def delete_interaction(
    interaction_id: str,
    _secret: str = Depends(verify_cron_secret),
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
