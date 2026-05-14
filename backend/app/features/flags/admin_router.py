"""Admin write API for per-user feature flag assignments.

All routes require `verify_admin_user` (email must be in `ADMIN_EMAILS`).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.database import get_insforge_service
from app.core.deps import verify_admin_user
from app.core.logging import get_logger
from app.features.flags.db import (
    delete_assignment,
    list_all_assignments,
    upsert_assignment,
)
from app.features.flags.registry import KNOWN_FLAGS, is_known_flag

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/admin/flags",
    tags=["admin-flags"],
    dependencies=[Depends(verify_admin_user)],
)


class UpsertBody(BaseModel):
    user_id: str
    flag: str
    enabled: bool = True


async def _load_subscriptions() -> list[dict[str, Any]]:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("subscriptions.list_all failed: %s", result)
        raise HTTPException(status_code=502, detail="Failed to load user roster")
    return list(data.get("data") or [])


@router.get("")
async def list_flags(
    email: str | None = Query(None, description="Case-insensitive email substring filter"),
    flag: str | None = Query(None, description="Limit to users who have this flag"),
):
    if flag and not is_known_flag(flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{flag}'")

    users = await _load_subscriptions()
    assignments = await list_all_assignments()  # always fetch all; filter in-memory

    by_user: dict[str, list[dict[str, Any]]] = {}
    for a in assignments:
        if not a.get("enabled"):
            continue
        by_user.setdefault(a["user_id"], []).append({
            "flag": a["flag"],
            "created_at": a.get("created_at"),
        })

    rows: list[dict[str, Any]] = []
    for u in users:
        rows.append({
            "user_id": u.get("user_id"),
            "email": u.get("email"),
            "name": u.get("name"),
            "plan": u.get("plan"),
            "flags": by_user.get(u.get("user_id"), []),
        })

    if email:
        needle = email.lower()
        rows = [r for r in rows if needle in (r.get("email") or "").lower()]
    if flag:
        rows = [r for r in rows if any(f["flag"] == flag for f in r["flags"])]

    return {
        "known_flags": [{"key": f.key, "description": f.description} for f in KNOWN_FLAGS],
        "assignments": rows,
    }


@router.post("")
async def grant_flag(body: UpsertBody):
    if not is_known_flag(body.flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{body.flag}'")
    record = await upsert_assignment(body.user_id, body.flag, body.enabled)
    return {"ok": True, "record": record}


@router.delete("")
async def revoke_flag(
    user_id: str = Query(..., min_length=1),
    flag: str = Query(..., min_length=1),
):
    if not is_known_flag(flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{flag}'")
    await delete_assignment(user_id, flag)
    return {"ok": True}
