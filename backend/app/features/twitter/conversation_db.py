"""
KOL methodology conversation persistence via Insforge Edge Functions.
"""

from typing import Any, Optional

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-methodology-conversations"


def _function_url() -> str:
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    service = get_insforge_service()
    return service.headers


async def get_latest_conversation(user_id: str, username: str) -> Optional[dict]:
    """Get the user's most recently updated KOL methodology conversation."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "latest", "user_id": user_id, "username": username},
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data")
    logger.error("get_latest_conversation failed: %s", data.get("error"))
    return None


async def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    """Get one KOL methodology conversation owned by the user."""
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
    username: str,
    title: str,
    data: dict[str, Any],
    message_count: int,
) -> Optional[dict]:
    """Create a KOL methodology conversation. Returns the created row."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "create"},
        json_body={
            "user_id": user_id,
            "username": username,
            "title": title,
            "data": data,
            "message_count": message_count,
        },
        timeout=10.0,
    )
    data_resp = result.get("data", {})
    if data_resp.get("success"):
        return data_resp.get("data")
    logger.error("create KOL methodology conversation failed: %s", data_resp.get("error"))
    return None


async def update_conversation(
    conversation_id: str,
    user_id: str,
    title: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
    message_count: Optional[int] = None,
) -> bool:
    """Update a KOL methodology conversation. Returns True on success."""
    body: dict[str, Any] = {"user_id": user_id}
    if title is not None:
        body["title"] = title
    if data is not None:
        body["data"] = data
    if message_count is not None:
        body["message_count"] = message_count

    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                _function_url(),
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
                "update KOL methodology conversation failed: status=%s",
                response.status_code,
            )
    except Exception:
        logger.exception(
            "update KOL methodology conversation error for id=%s",
            conversation_id,
        )
    return False
