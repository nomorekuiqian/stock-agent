"""Community-scoped Agent access and Panda Agent facade."""

from __future__ import annotations

import asyncio
import json as _json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.deps import verify_admin_user, verify_user_token_with_email
from app.core.logging import get_logger
from app.core.sse import with_heartbeat
from app.features.community_access import db
from app.features.community_access.models import (
    GrantApplyRequest,
    GrantApplyResponse,
    GrantDryRunRequest,
    GrantDryRunResponse,
    PANDA_PERSONA_USERNAME,
    PARTNER_PANDA,
    PandaAccessStatus,
)
from app.features.community_access.service import build_grant_plan, normalize_email
from app.features.kol_research.agent import APP_NAME as KOL_APP_NAME
from app.features.kol_research.agent import stream_kol_research
from app.features.kol_research.models import KolResearchRequest
from app.features.screener.conversation_db import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/community", tags=["community-access"])
admin_router = APIRouter(
    prefix="/api/admin/community",
    tags=["admin-community-access"],
    dependencies=[Depends(verify_admin_user)],
)


class PandaConversationSaveRequest(BaseModel):
    id: str | None = Field(default=None, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    data: dict[str, Any] = Field(default_factory=dict)
    message_count: int = Field(default=0, ge=0)
    touch: bool = True


class PandaConversationPinRequest(BaseModel):
    is_pinned: bool = Field(description="Whether this Panda conversation should be pinned.")


def _stamp_panda_metadata(data: dict[str, Any] | None) -> dict[str, Any]:
    out = dict(data or {})
    out["agent_kind"] = "kol_research"
    out["persona_username"] = PANDA_PERSONA_USERNAME
    out["partner_id"] = PARTNER_PANDA
    return out


async def _sync_panda_runtime_ui_state(
    *,
    user_id: str,
    conversation_id: str | None,
    title: str | None,
    data: dict[str, Any] | None,
    source: str,
) -> None:
    if not conversation_id:
        return
    try:
        from app.features.agent_runtime.events import sync_ui_state

        await sync_ui_state(
            user_id=user_id,
            agent_id=KOL_APP_NAME,
            session_id=conversation_id,
            agent_kind="kol_research",
            title=title,
            data=_stamp_panda_metadata(data),
            persona_username=PANDA_PERSONA_USERNAME,
            source=source,
        )
    except Exception:
        logger.exception("panda runtime ui sync failed conversation_id=%s", conversation_id)


async def _require_panda_access(
    user_info: dict = Depends(verify_user_token_with_email),
) -> dict:
    email = normalize_email(user_info.get("email"))
    if not email:
        raise HTTPException(status_code=403, detail="当前账号没有可用于授权的邮箱")
    grant = await db.get_active_grant_by_email(PARTNER_PANDA, email)
    if not grant:
        raise HTTPException(status_code=403, detail="当前账号没有 Panda Agent 访问权限")
    await db.mark_grant_seen(PARTNER_PANDA, email, user_info["user_id"])
    return {**user_info, "community_grant": grant}


async def _build_dry_run(req: GrantDryRunRequest) -> GrantDryRunResponse:
    plan = build_grant_plan(emails_text=req.emails_text, emails=req.emails)
    existing_active: list[str] = []
    existing_revoked: list[str] = []
    to_create: list[str] = []

    semaphore = asyncio.Semaphore(20)

    async def load(email: str) -> tuple[str, dict[str, Any] | None]:
        async with semaphore:
            return email, await db.get_grant_by_email(PARTNER_PANDA, email)

    existing = await asyncio.gather(*(load(email) for email in plan.valid))
    for email, grant in existing:
        if not grant:
            to_create.append(email)
        elif grant.get("status") == "active":
            existing_active.append(email)
        else:
            existing_revoked.append(email)

    return GrantDryRunResponse(
        total_input=plan.total_input,
        valid_count=len(plan.valid),
        invalid=plan.invalid,
        duplicates=plan.duplicates,
        existing_active=existing_active,
        existing_revoked=existing_revoked,
        to_create=to_create,
        to_reactivate=existing_revoked,
    )


@router.get("/panda/me", response_model=PandaAccessStatus)
async def panda_access_status(
    user_info: dict = Depends(verify_user_token_with_email),
):
    email = normalize_email(user_info.get("email"))
    grant = await db.get_active_grant_by_email(PARTNER_PANDA, email) if email else None
    if grant:
        await db.mark_grant_seen(PARTNER_PANDA, email, user_info["user_id"])
    return PandaAccessStatus(
        has_access=bool(grant),
        email=email or None,
        grant=grant,
    )


@router.post("/panda/chat/stream")
async def panda_chat_stream(
    req: KolResearchRequest,
    user_info: dict = Depends(_require_panda_access),
):
    """Panda-only streaming chat facade.

    The request's persona field is ignored; this endpoint is permanently scoped
    to `pandacircle` and can only be reached by emails with active Panda grants.
    """

    async def event_generator():
        async for event in stream_kol_research(
            message=req.message,
            history=[m.model_dump() for m in req.history],
            persona_username=PANDA_PERSONA_USERNAME,
            content_context=req.content_context,
            conversation_id=req.session_id or req.conversation_id,
            user_id=user_info["user_id"],
            turn_id=req.turn_id,
        ):
            yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)

    return StreamingResponse(
        with_heartbeat(event_generator(), stream_name="panda_chat"),
        media_type="text/event-stream",
    )


@router.get("/panda/conversations")
async def panda_list_conversations(
    user_info: dict = Depends(_require_panda_access),
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
):
    result = await list_conversations(user_info["user_id"], limit=100, offset=0, search=search)
    all_items = result.get("items", [])
    panda_items = [
        item for item in all_items
        if item.get("partner_id") == PARTNER_PANDA
        or item.get("persona_username") == PANDA_PERSONA_USERNAME
    ]
    page = panda_items[max(0, offset):max(0, offset) + min(100, max(1, limit))]
    return {
        "conversations": page,
        "has_more": len(panda_items) > max(0, offset) + len(page),
    }


@router.get("/panda/conversations/{conversation_id}")
async def panda_get_conversation(
    conversation_id: str,
    user_info: dict = Depends(_require_panda_access),
):
    conv = await get_conversation(conversation_id, user_info["user_id"])
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    data = conv.get("data") if isinstance(conv.get("data"), dict) else {}
    if data.get("partner_id") != PARTNER_PANDA and data.get("persona_username") != PANDA_PERSONA_USERNAME:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/panda/conversations", status_code=201)
async def panda_create_conversation(
    req: PandaConversationSaveRequest,
    user_info: dict = Depends(_require_panda_access),
):
    stamped = _stamp_panda_metadata(req.data)
    created = await create_conversation(
        user_id=user_info["user_id"],
        title=req.title,
        data=stamped,
        message_count=req.message_count,
        conversation_id=req.id,
    )
    if created is None:
        raise HTTPException(status_code=500, detail="create_conversation failed")
    await _sync_panda_runtime_ui_state(
        user_id=user_info["user_id"],
        conversation_id=created.get("id"),
        title=req.title,
        data=stamped,
        source="panda_conversation_create",
    )
    return created


@router.put("/panda/conversations/{conversation_id}")
async def panda_update_conversation(
    conversation_id: str,
    req: PandaConversationSaveRequest,
    user_info: dict = Depends(_require_panda_access),
):
    stamped = _stamp_panda_metadata(req.data)
    ok = await update_conversation(
        conversation_id=conversation_id,
        user_id=user_info["user_id"],
        title=req.title,
        data=stamped,
        message_count=req.message_count,
        touch=req.touch,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="update_conversation failed")
    await _sync_panda_runtime_ui_state(
        user_id=user_info["user_id"],
        conversation_id=conversation_id,
        title=req.title,
        data=stamped,
        source="panda_conversation_update",
    )
    return {"success": True}


@router.delete("/panda/conversations/{conversation_id}")
async def panda_delete_conversation(
    conversation_id: str,
    user_info: dict = Depends(_require_panda_access),
):
    ok = await delete_conversation(conversation_id, user_info["user_id"])
    if not ok:
        raise HTTPException(status_code=500, detail="delete_conversation failed")
    return {"success": True}


@router.patch("/panda/conversations/{conversation_id}/pin")
async def panda_pin_conversation(
    conversation_id: str,
    req: PandaConversationPinRequest,
    user_info: dict = Depends(_require_panda_access),
):
    conv = await get_conversation(conversation_id, user_info["user_id"])
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    data = conv.get("data") if isinstance(conv.get("data"), dict) else {}
    if data.get("partner_id") != PARTNER_PANDA and data.get("persona_username") != PANDA_PERSONA_USERNAME:
        raise HTTPException(status_code=404, detail="Conversation not found")

    from app.features.agent_runtime import db as agent_runtime_db

    result = await agent_runtime_db.pin_session(
        user_id=user_info["user_id"],
        agent_id=KOL_APP_NAME,
        session_id=conversation_id,
        is_pinned=req.is_pinned,
        create_if_missing=req.is_pinned,
        title=conv.get("title") or "Panda Agent",
        metadata=_stamp_panda_metadata(data),
        created_at=conv.get("created_at"),
        updated_at=conv.get("updated_at"),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Runtime session not found")
    return {
        "success": True,
        "id": conversation_id,
        "agent_id": result.get("agent_id"),
        "is_pinned": bool(result.get("is_pinned")),
        "pinned_at": result.get("pinned_at"),
        "updated_at": result.get("updated_at"),
    }


@admin_router.post("/panda/grants/dry-run", response_model=GrantDryRunResponse)
async def panda_grants_dry_run(req: GrantDryRunRequest):
    return await _build_dry_run(req)


@admin_router.post("/panda/grants/apply", response_model=GrantApplyResponse)
async def panda_grants_apply(
    req: GrantApplyRequest,
    admin: dict = Depends(verify_admin_user),
):
    dry_run = await _build_dry_run(req)
    emails_to_upsert = [*dry_run.to_create, *dry_run.to_reactivate]
    records = await db.bulk_upsert_grants(
        partner_id=PARTNER_PANDA,
        emails=emails_to_upsert,
        granted_by=admin["email"],
        notes=req.notes,
    )
    return GrantApplyResponse(
        ok=True,
        dry_run=dry_run,
        created=len([r for r in records if r.get("email_normalized") in set(dry_run.to_create)]),
        reactivated=len([r for r in records if r.get("email_normalized") in set(dry_run.to_reactivate)]),
        unchanged=len(dry_run.existing_active),
    )


@admin_router.get("/panda/grants")
async def panda_grants_list(
    email: str | None = None,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
):
    grants = await db.list_grants(
        PARTNER_PANDA,
        email=normalize_email(email) if email else None,
        status=status,
        limit=limit,
        offset=offset,
    )
    return {"grants": grants}


@admin_router.delete("/panda/grants/{grant_id}")
async def panda_grant_revoke(
    grant_id: str,
    admin: dict = Depends(verify_admin_user),
):
    record = await db.revoke_grant(grant_id=grant_id, revoked_by=admin["email"])
    return {"ok": True, "record": record}
