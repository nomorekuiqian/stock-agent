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
