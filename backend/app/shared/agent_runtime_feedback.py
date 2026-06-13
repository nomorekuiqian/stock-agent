"""Shared helpers for writing feedback onto agent runtime message rows."""

from __future__ import annotations

from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "agent-sessions"


def _headers() -> dict[str, str] | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def update_agent_message_feedback(
    *,
    user_id: str,
    agent_id: str,
    session_id: str,
    sentiment: int,
    reason: str | None = None,
    feedback_payload: dict[str, Any] | None = None,
    turn_id: str | None = None,
    client_event_id: str | None = None,
    message_event_id: str | None = None,
) -> dict[str, Any] | None:
    """Update thumbs feedback on one runtime assistant_message row."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_feedback"},
        json_body={
            "user_id": user_id,
            "agent_id": agent_id,
            "session_id": session_id,
            "message_event_id": message_event_id,
            "client_event_id": client_event_id,
            "turn_id": turn_id,
            "sentiment": sentiment,
            "reason": reason,
            "feedback_payload": feedback_payload or {},
        },
        timeout=10.0,
        extra_headers=_headers(),
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data") or {}
    logger.warning(
        "agent runtime update_message_feedback failed: status=%s error=%s",
        result.get("status_code"),
        data.get("error") or result.get("text"),
    )
    return None
