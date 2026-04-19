"""
Research quota persistence -- DB layer via Insforge Edge Functions.
"""

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "research-quota"


async def get_usage(identifier: str, usage_date: str) -> int:
    """Get the current usage count for an identifier on a given date."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "get_usage",
            "identifier": identifier,
            "usage_date": usage_date,
        },
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data", {}).get("count", 0)
    logger.error("get_usage failed: %s", data.get("error"))
    return 0


async def increment_usage(
    identifier: str,
    identifier_type: str,
    usage_date: str,
) -> int:
    """Increment usage count. Returns the new count."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "increment"},
        json_body={
            "identifier": identifier,
            "identifier_type": identifier_type,
            "usage_date": usage_date,
        },
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("count", 0)
    logger.error("increment_usage failed: %s", data.get("error"))
    return -1
