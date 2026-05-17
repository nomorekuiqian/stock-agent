"""Feature flags database access via Edge Function."""

from typing import Set

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION = "feature-flags"


async def get_user_flags(user_id: str) -> Set[str]:
    """Fetch all enabled flags for a user."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="GET",
        params={"action": "list", "user_id": user_id},
    )
    data = result.get("data", {})
    if data.get("success"):
        return set(data.get("data") or [])
    logger.warning("feature-flags EF failed for user %s: %s", user_id, result)
    return set()


# ─── Admin write helpers ────────────────────────────────────────────────────


async def list_all_assignments(flag: str | None = None) -> list[dict]:
    """List every enabled (user_id, flag) row, optionally filtered by flag key."""
    service = get_insforge_service()
    params: dict[str, str] = {"action": "list_all"}
    if flag:
        params["flag"] = flag
    result = await service.call_function(_FUNCTION, method="GET", params=params)
    data = result.get("data", {})
    if data.get("success"):
        return list(data.get("data") or [])
    logger.warning("feature-flags list_all failed (flag=%s): %s", flag, result)
    return []


async def upsert_assignment(user_id: str, flag: str, enabled: bool = True) -> dict:
    """Insert or update a flag assignment. Idempotent on (user_id, flag)."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="POST",
        params={"action": "upsert"},
        json_body={"user_id": user_id, "flag": flag, "enabled": enabled},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("feature-flags upsert failed user=%s flag=%s: %s", user_id, flag, result)
        raise RuntimeError(data.get("error") or "upsert_assignment failed")
    return data.get("data") or {}


async def delete_assignment(user_id: str, flag: str) -> bool:
    """Delete a flag assignment. Idempotent — returns True even if row was absent."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="DELETE",
        params={"action": "delete", "user_id": user_id, "flag": flag},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("feature-flags delete failed user=%s flag=%s: %s", user_id, flag, result)
        raise RuntimeError(data.get("error") or "delete_assignment failed")
    return True
