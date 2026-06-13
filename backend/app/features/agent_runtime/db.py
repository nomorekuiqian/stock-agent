"""Database helpers for durable agent runtime sessions."""

from __future__ import annotations

from typing import Any

from app.core.config import (
    AGENT_RUNTIME_HISTORY_FETCH_LIMIT,
    EDGE_FUNCTION_SECRET,
)
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "agent-sessions"


def _headers() -> dict[str, str] | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def get_session(
    *,
    user_id: str,
    agent_id: str,
    session_id: str,
    limit: int | None = None,
    after_created_at: str | None = None,
    after_id: str | None = None,
    all_events: bool = False,
) -> dict[str, Any] | None:
    """Read durable session snapshot + events.

    Pagination contract:
      - Both `after_created_at` and `after_id` must be supplied together; passing
        one without the other is treated as no cursor. This keeps the Edge
        Function from re-delivering the boundary event on the next page.
    """
    if limit is None:
        limit = AGENT_RUNTIME_HISTORY_FETCH_LIMIT
    service = get_insforge_service()
    params: dict[str, str] = {
        "action": "get",
        "user_id": user_id,
        "agent_id": agent_id,
        "session_id": session_id,
        "limit": str(limit),
    }
    if all_events:
        params["all"] = "true"
    if after_created_at and after_id:
        params["after_created_at"] = after_created_at
        params["after_id"] = after_id
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=10.0,
        extra_headers=_headers(),
    )
    data = result.get("data", {})
    if result.get("status_code") == 404:
        return None
    if data.get("success"):
        return data.get("data") or {}
    if result.get("status_code") not in (404,):
        logger.warning(
            "agent runtime get_session failed: status=%s error=%s",
            result.get("status_code"),
            data.get("error") or result.get("text"),
        )
    return None


async def list_user_sessions(*, user_id: str) -> dict[str, Any]:
    """List all runtime sessions with visible messages for one user."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "list_user_sessions", "user_id": user_id},
        timeout=30.0,
        extra_headers=_headers(),
    )
    data = result.get("data", {})
    if data.get("success"):
        payload = data.get("data") or {}
        return {
            "conversations": payload.get("conversations", []),
            "total": int(payload.get("total") or 0),
        }
    logger.warning(
        "agent runtime list_user_sessions failed: status=%s error=%s",
        result.get("status_code"),
        data.get("error") or result.get("text"),
    )
    return {"conversations": [], "total": 0}


async def get_user_conversation_stats() -> list[dict[str, Any]]:
    """Return per-user runtime conversation stats for admin dashboards."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "stats_by_user"},
        timeout=30.0,
        extra_headers=_headers(),
    )
    data = result.get("data", {})
    if data.get("success"):
        payload = data.get("data") or {}
        rows = payload.get("stats", [])
        return rows if isinstance(rows, list) else []
    logger.warning(
        "agent runtime stats_by_user failed: status=%s error=%s",
        result.get("status_code"),
        data.get("error") or result.get("text"),
    )
    return []


async def append_entries(
    *,
    user_id: str,
    agent_id: str,
    session_id: str,
    entries: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> bool:
    if not entries:
        return True

    events: list[dict[str, Any]] = []
    for entry in entries:
        role = entry.get("role")
        event_type = "session_event"
        if role == "user":
            event_type = "user_message"
        elif role == "assistant":
            event_type = "assistant_message"
        elif role == "tool":
            event_type = "tool_event"
        events.append({
            "event_type": event_type,
            "role": role,
            "content": entry.get("content"),
            "payload": entry.get("payload") or entry.get("metadata") or {},
            "token_estimate": entry.get("token_estimate"),
            "created_at": entry.get("created_at"),
            "turn_id": entry.get("turn_id"),
            "client_event_id": entry.get("client_event_id"),
            "client_ts": entry.get("client_ts"),
        })

    return await append_events(
        user_id=user_id,
        agent_id=agent_id,
        session_id=session_id,
        events=events,
        metadata=metadata,
    )


async def append_events(
    *,
    user_id: str,
    agent_id: str,
    session_id: str,
    events: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> bool:
    if not events and metadata is None:
        return True

    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "append_events"},
        json_body={
            "user_id": user_id,
            "agent_id": agent_id,
            "session_id": session_id,
            "metadata": metadata or {},
            "events": events,
        },
        timeout=10.0,
        extra_headers=_headers(),
    )
    data = result.get("data", {})
    if data.get("success"):
        return True
    logger.warning(
        "agent runtime append_events failed: status=%s error=%s",
        result.get("status_code"),
        data.get("error") or result.get("text"),
    )
    return False


async def update_message_feedback(
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
    """Update thumbs feedback on one assistant_message event row."""
    from app.shared.agent_runtime_feedback import update_agent_message_feedback

    return await update_agent_message_feedback(
        user_id=user_id,
        agent_id=agent_id,
        session_id=session_id,
        sentiment=sentiment,
        reason=reason,
        feedback_payload=feedback_payload,
        turn_id=turn_id,
        client_event_id=client_event_id,
        message_event_id=message_event_id,
    )
