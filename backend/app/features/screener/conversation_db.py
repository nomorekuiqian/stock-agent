"""
Research conversation persistence — DB layer via Insforge Edge Functions.
"""

from typing import Any, Optional

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "picker-conversations"


def _function_url() -> str:
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    service = get_insforge_service()
    return service.headers


async def list_conversations(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """List conversations for a user (lightweight, no data field).

    Returns ``{"items": [...], "has_more": bool}``. ``has_more`` is true when
    the underlying page is exactly ``limit`` rows long — caller uses this to
    decide whether to render a "load more" affordance.
    """
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "list",
            "user_id": user_id,
            "limit": str(limit),
            "offset": str(offset),
        },
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return {
            "items": data.get("data", []),
            "has_more": bool(data.get("has_more", False)),
        }
    logger.error("list_conversations failed: %s", data.get("error"))
    return {"items": [], "has_more": False}


async def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    """Get a single conversation with full data."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get", "id": conversation_id, "user_id": user_id},
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data")
    return None


async def create_conversation(
    user_id: str,
    title: str,
    data: dict[str, Any],
    message_count: int,
) -> Optional[dict]:
    """Create a new conversation. Returns the created row (with id)."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "create"},
        json_body={
            "user_id": user_id,
            "title": title,
            "data": data,
            "message_count": message_count,
        },
        timeout=10.0,
    )
    data_resp = result.get("data", {})
    if data_resp.get("success"):
        return data_resp.get("data")
    logger.error("create_conversation failed: %s", data_resp.get("error"))
    return None


async def update_conversation(
    conversation_id: str,
    user_id: str,
    title: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
    message_count: Optional[int] = None,
) -> bool:
    """Update an existing conversation. Returns True on success."""
    body: dict[str, Any] = {"user_id": user_id}
    if title is not None:
        body["title"] = title
    if data is not None:
        body["data"] = data
    if message_count is not None:
        body["message_count"] = message_count

    service = get_insforge_service()
    # Use call_function — but it only supports GET/POST/DELETE, not PUT.
    # Fall back to direct httpx call.
    import httpx

    url = _function_url()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                params={"action": "update", "id": conversation_id},
                json=body,
                headers=_headers(),
                timeout=10.0,
            )
            if response.status_code == 200:
                resp = response.json()
                if resp.get("success"):
                    return True
            logger.error(
                "update_conversation failed: status=%s",
                response.status_code,
            )
    except Exception:
        logger.exception("update_conversation error for id=%s", conversation_id)
    return False


async def delete_conversation(conversation_id: str, user_id: str) -> bool:
    """Delete a conversation. Returns True on success."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="DELETE",
        params={"action": "delete", "id": conversation_id, "user_id": user_id},
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return True
    logger.error("delete_conversation failed: %s", data.get("error"))
    return False
