"""Helpers for writing structured agent runtime events."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.config import AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS
from app.core.logging import get_logger
from app.features.agent_runtime import db
from app.features.agent_runtime.models import AgentRuntimeTurn, SessionSnapshot

logger = get_logger(__name__)

_INTERNAL_METADATA_KEYS = {"source", "session", "persistable", "session_exists"}


def summarize_tool_result(tool_response: Any) -> dict[str, Any]:
    """Return a small dict that captures the *gist* of a tool response.

    Tool responses can be large (think 50KB of FMP financial data); we don't
    want to store the whole thing in agent_session_events.payload. Keep a
    truncated string preview plus the sha256 of the canonical serialization
    so audits can detect tampering or drift.
    """
    if tool_response is None:
        return {"preview": None, "hash": None, "truncated": False}
    try:
        if isinstance(tool_response, (dict, list)):
            serialized = json.dumps(
                tool_response, ensure_ascii=False, default=str, sort_keys=True
            )
        else:
            serialized = str(tool_response)
    except Exception:  # noqa: BLE001
        serialized = str(tool_response)
    digest = hashlib.sha256(serialized.encode("utf-8", errors="ignore")).hexdigest()
    cap = max(0, AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS)
    truncated = len(serialized) > cap
    preview = serialized if not truncated else serialized[:cap].rstrip() + "..."
    return {"preview": preview, "hash": digest, "truncated": truncated}


def _public_metadata(
    session: SessionSnapshot | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    if session is not None:
        source_session = session.metadata.get("session")
        if isinstance(source_session, dict) and isinstance(source_session.get("metadata"), dict):
            merged.update(source_session["metadata"])
        for key, value in session.metadata.items():
            if key not in _INTERNAL_METADATA_KEYS:
                merged[key] = value
    if metadata:
        merged.update(metadata)
    return merged


def ui_state_from_conversation_data(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    active_content = data.get("active_content")
    content_stack = data.get("content_stack")
    if active_content is None and content_stack is None:
        return None
    return {
        "active_content": active_content,
        "content_stack": content_stack if isinstance(content_stack, list) else [],
    }


def tool_call_events(tool_calls: list[Any] | None) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for call in tool_calls or []:
        if hasattr(call, "model_dump"):
            payload = call.model_dump()
        elif isinstance(call, dict):
            payload = dict(call)
        else:
            continue
        name = payload.get("name") or payload.get("tool") or payload.get("tool_name")
        if not name:
            continue
        payload["tool_name"] = name
        events.append(
            {
                "event_type": "tool_call_completed",
                "role": "tool",
                "content": str(name),
                "payload": payload,
            }
        )
    return events


def _events_with_turn_identity(
    *,
    events: list[dict[str, Any]],
    turn_id: str | None,
) -> list[dict[str, Any]]:
    if not turn_id:
        return events
    counters: dict[str, int] = {}
    enriched: list[dict[str, Any]] = []
    for event in events:
        next_event = dict(event)
        next_event.setdefault("turn_id", turn_id)
        if not next_event.get("client_event_id"):
            event_type = str(next_event.get("event_type") or "event")
            counters[event_type] = counters.get(event_type, 0) + 1
            next_event["client_event_id"] = "%s:%s:%d" % (
                turn_id,
                event_type,
                counters[event_type],
            )
        payload = dict(next_event.get("payload") or {})
        payload.setdefault("turn_id", turn_id)
        next_event["payload"] = payload
        enriched.append(next_event)
    return enriched


def context_snapshot_event(turn: AgentRuntimeTurn) -> dict[str, Any]:
    assembled = turn.assembled_context
    content_context = turn.request.content_context or {}
    payload = {
        "history_count": len(turn.session.chat_history()),
        "request_history_count": len(turn.request.history or []),
        "content_context_type": content_context.get("type") if isinstance(content_context, dict) else None,
    }
    for attr in ("kept_history", "dropped_history", "char_count"):
        if hasattr(assembled, attr):
            payload[attr] = getattr(assembled, attr)
    meta = getattr(assembled, "metadata", None) or {}
    truncated = meta.get("truncated_sections") if isinstance(meta, dict) else None
    if truncated:
        payload["truncated_sections"] = truncated
    if isinstance(meta, dict) and meta.get("history_source"):
        payload["history_source"] = meta["history_source"]
    return {
        "event_type": "context_snapshot",
        "role": "system",
        "content": "Context assembled for turn",
        "payload": payload,
    }


def context_budget_truncated_event(turn: AgentRuntimeTurn) -> dict[str, Any] | None:
    """Emit a dedicated audit event when BudgetPlan had to cut a section.

    Returns None when nothing was truncated so callers can `.extend([...])`
    unconditionally and filter at the end:
        events = [context_snapshot_event(turn)]
        ev = context_budget_truncated_event(turn)
        if ev: events.append(ev)
    """
    assembled = turn.assembled_context
    meta = getattr(assembled, "metadata", None) or {}
    truncated = meta.get("truncated_sections") if isinstance(meta, dict) else None
    if not truncated:
        return None
    payload = {
        "sections": truncated,
        "budget_total_chars": meta.get("budget_total_chars"),
        "budget_allocations": meta.get("budget_allocations"),
        "char_count": getattr(assembled, "char_count", None),
    }
    return {
        "event_type": "context_budget_truncated",
        "role": "system",
        "content": "Context budget truncated for turn",
        "payload": payload,
    }


def error_event(*, code: str, stage: str, message: str) -> dict[str, Any]:
    return {
        "event_type": "error",
        "role": "system",
        "content": message,
        "payload": {
            "code": code,
            "stage": stage,
            "message": message,
        },
    }


async def append_turn_events(
    turn: AgentRuntimeTurn,
    *,
    events: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> None:
    if (
        not events
        or not turn.session.user_id
        or not turn.session.session_id
        or turn.session.metadata.get("persistable") is False
    ):
        return
    try:
        await db.append_events(
            user_id=turn.session.user_id,
            agent_id=turn.session.agent_id,
            session_id=turn.session.session_id,
            metadata=_public_metadata(turn.session, metadata),
            events=_events_with_turn_identity(
                events=events,
                turn_id=turn.request.turn_id,
            ),
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "agent runtime append_turn_events failed session_id=%s",
            turn.session.session_id,
        )


async def sync_ui_state(
    *,
    user_id: str,
    agent_id: str,
    session_id: str,
    agent_kind: str,
    data: dict[str, Any] | None,
    title: str | None = None,
    persona_username: str | None = None,
    source: str,
) -> None:
    ui_state = ui_state_from_conversation_data(data)
    metadata: dict[str, Any] = {
        "agent_kind": agent_kind,
        "restore_version": 1,
    }
    if title:
        metadata["title"] = title
    if persona_username:
        metadata["persona_username"] = persona_username
    if ui_state:
        metadata["ui_state"] = ui_state

    events: list[dict[str, Any]] = []
    if ui_state:
        active_content = ui_state.get("active_content") or {}
        active_type = active_content.get("type") if isinstance(active_content, dict) else None
        # Stable client_event_id so repeated sync_ui_state calls for the same
        # UI state collapse via the edge function's upsert dedupe instead of
        # piling up identical ui_navigation rows on every page refresh / panel
        # toggle. ui_state changes -> hash changes -> new row.
        try:
            ui_state_hash = hashlib.sha1(
                json.dumps(ui_state, sort_keys=True, default=str).encode("utf-8"),
                usedforsecurity=False,
            ).hexdigest()[:16]
        except Exception:  # noqa: BLE001
            ui_state_hash = "unhashable"
        client_event_id = "ui_state:%s:%s" % (session_id, ui_state_hash)
        events.append(
            {
                "event_type": "ui_navigation",
                "role": "system",
                "content": "UI state changed%s" % (f" to {active_type}" if active_type else ""),
                "payload": {
                    "source": source,
                    "ui_state": ui_state,
                },
                "client_event_id": client_event_id,
            }
        )

    try:
        await db.append_events(
            user_id=user_id,
            agent_id=agent_id,
            session_id=session_id,
            metadata=metadata,
            events=events,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "agent runtime sync_ui_state failed session_id=%s source=%s",
            session_id,
            source,
        )
