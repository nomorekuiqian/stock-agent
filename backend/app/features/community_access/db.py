"""Community access database helpers via Insforge Edge Function."""

from __future__ import annotations

from typing import Any

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.community_access.models import PARTNER_PANDA

logger = get_logger(__name__)

_FUNCTION = "community-access"


def _data_or_raise(result: dict[str, Any], *, op: str) -> Any:
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data")
    logger.error("community-access %s failed: %s", op, result)
    raise RuntimeError(data.get("error") or f"community-access {op} failed")


async def list_grants(
    partner_id: str = PARTNER_PANDA,
    *,
    email: str | None = None,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    service = get_insforge_service()
    params: dict[str, str] = {
        "action": "list",
        "partner_id": partner_id,
        "limit": str(limit),
        "offset": str(offset),
    }
    if email:
        params["email"] = email
    if status:
        params["status"] = status
    result = await service.call_function(_FUNCTION, method="GET", params=params, timeout=10.0)
    return list(_data_or_raise(result, op="list") or [])


async def get_grant_by_email(partner_id: str, email_normalized: str) -> dict[str, Any] | None:
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="GET",
        params={"action": "get_by_email", "partner_id": partner_id, "email": email_normalized},
        timeout=10.0,
    )
    return _data_or_raise(result, op="get_by_email")


async def get_active_grant_by_email(partner_id: str, email_normalized: str) -> dict[str, Any] | None:
    grant = await get_grant_by_email(partner_id, email_normalized)
    if not grant or grant.get("status") != "active":
        return None
    return grant


async def bulk_upsert_grants(
    *,
    partner_id: str,
    emails: list[str],
    granted_by: str,
    notes: str | None = None,
    grant_source: str = "zsxq_comment",
) -> list[dict[str, Any]]:
    if not emails:
        return []
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="POST",
        params={"action": "bulk_upsert"},
        json_body={
            "partner_id": partner_id,
            "emails": emails,
            "granted_by": granted_by,
            "notes": notes,
            "grant_source": grant_source,
        },
        timeout=20.0,
    )
    return list(_data_or_raise(result, op="bulk_upsert") or [])


async def revoke_grant(
    *,
    grant_id: str,
    revoked_by: str,
    partner_id: str = PARTNER_PANDA,
) -> dict[str, Any]:
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="DELETE",
        params={
            "action": "revoke",
            "id": grant_id,
            "partner_id": partner_id,
            "revoked_by": revoked_by,
        },
        timeout=10.0,
    )
    return dict(_data_or_raise(result, op="revoke") or {})


async def mark_grant_seen(partner_id: str, email_normalized: str, user_id: str) -> dict[str, Any] | None:
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="POST",
        params={"action": "mark_seen"},
        json_body={
            "partner_id": partner_id,
            "email": email_normalized,
            "user_id": user_id,
        },
        timeout=5.0,
    )
    try:
        return _data_or_raise(result, op="mark_seen")
    except RuntimeError:
        logger.warning("community-access mark_seen failed for user=%s", user_id)
        return None
