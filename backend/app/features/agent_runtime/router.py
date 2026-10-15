"""HTTP entry points for durable agent runtime sessions.

Currently exposes a single read API used by the frontend to restore a
conversation when the user reloads the page or switches devices. Writes are
still routed through the per-feature agents (research / kol_research) and the
shared `events.append_turn_events` helper; this router does NOT accept
client-side event inserts.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.feature_pause import paused_conversation, require_active
from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.features.agent_runtime import db

logger = get_logger(__name__)

router = APIRouter(prefix="/api/agent-runtime", tags=["agent-runtime"])

# Agents that are allowed to be queried through this endpoint. New agents must
# be added explicitly so a random caller can't fish for events from arbitrary
# feature agents that happen to share the runtime.
_ALLOWED_AGENT_IDS = {"research_agent", "kol_research_agent"}


def _public_session_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {
            "session": None,
            "entries": [],
            "events": [],
            "cursor": None,
            "messages_cursor": None,
            "ui_state": None,
            "summary": None,
            "title": None,
            "metadata": {},
        }

    raw_session = payload.get("session")
    # Normalize "session not found" to a null on the wire. Edge Function may
    # return either `null` (no row) or an empty object; the frontend's
    # `if (!data.session) fallback` only sees the null shape correctly because
    # `!{}` is false in JS — so we collapse both here.
    session = raw_session if isinstance(raw_session, dict) and raw_session else None
    metadata = session.get("metadata") if isinstance(session, dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "session": session,
        "entries": payload.get("entries") or [],
        "events": payload.get("events") or [],
        "cursor": payload.get("cursor"),
        "messages_cursor": payload.get("messages_cursor"),
        "ui_state": metadata.get("ui_state"),
        "summary": metadata.get("summary"),
        "title": metadata.get("title") or (session.get("title") if isinstance(session, dict) else None),
        "metadata": metadata,
    }


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    agent_id: str = Query(..., description="Runtime agent id, e.g. research_agent"),
    limit: int | None = Query(default=None, ge=1, le=500),
    after_created_at: str | None = Query(default=None),
    after_id: str | None = Query(default=None),
    user_id: str = Depends(verify_user_token),
) -> dict[str, Any]:
    """Restore a durable agent session.

    Returns the session row, ordered events, message-only `entries`, the latest
    UI snapshot (right-panel state) and two paginate-cursor variants:

    - `cursor` — advances on ANY event; use for full timeline pagination.
    - `messages_cursor` — advances only on user/assistant messages; use when the
      frontend is paginating the visible chat transcript.

    A missing session returns 200 with an empty shape (not 404) so the
    frontend can fall through to the picker_conversations compatibility path
    without needing to interpret HTTP status codes.
    """
    if agent_id == "kol_research_agent":
        require_active("kol_chat")
    if agent_id not in _ALLOWED_AGENT_IDS:
        raise HTTPException(status_code=400, detail="unsupported agent_id")
    # The (after_created_at, after_id) cursor must be supplied together. Edge
    # function silently ignores a lone after_created_at; mirror that here so
    # malformed pagination from the client fails fast instead of silently
    # restarting from the head.
    if bool(after_created_at) != bool(after_id):
        raise HTTPException(
            status_code=400,
            detail="after_created_at and after_id must be supplied together",
        )

    try:
        payload = await db.get_session(
            user_id=user_id,
            agent_id=agent_id,
            session_id=session_id,
            limit=limit,
            after_created_at=after_created_at,
            after_id=after_id,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "agent runtime restore failed user=%s session=%s",
            user_id[:12], session_id[:24],
        )
        raise HTTPException(status_code=502, detail="runtime store unavailable")

    if paused_conversation((payload or {}).get("session") or {}):
        require_active("kol_research")
    return _public_session_payload(payload)
