"""Session store abstractions for durable agent conversations."""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from typing import Any, Protocol
from uuid import uuid4

from app.core.feature_pause import paused_conversation, require_active
from app.core.config import (
    AGENT_RUNTIME_INMEMORY_MAX_SESSIONS,
    AGENT_RUNTIME_INMEMORY_MAX_TRANSCRIPT,
)
from app.core.logging import get_logger
from app.features.agent_runtime.models import (
    AgentRunRequest,
    Role,
    SessionSnapshot,
    TranscriptEntry,
)

logger = get_logger(__name__)

_INTERNAL_SESSION_METADATA_KEYS = {"source", "session", "persistable", "session_exists"}


def _ui_state_from_picker_data(data: dict[str, Any] | None) -> dict[str, Any] | None:
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


class SessionStore(Protocol):
    async def load_session(self, request: AgentRunRequest) -> SessionSnapshot:
        ...

    async def append_entries(
        self,
        session: SessionSnapshot,
        entries: list[TranscriptEntry],
    ) -> bool | None:
        """Persist entries. Truthy = durable write succeeded; falsy = caller should fall back."""
        ...


def _normalize_history(
    raw_messages: list[dict[str, Any]] | None,
) -> list[TranscriptEntry]:
    entries: list[TranscriptEntry] = []
    for msg in raw_messages or []:
        role = str(msg.get("role") or "").strip()
        if role not in {"user", "assistant"}:
            continue
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        entries.append(
            TranscriptEntry(
                role=role,  # type: ignore[arg-type]
                content=content,
                metadata={
                    "source_id": msg.get("id"),
                    "source": "conversation_history",
                },
                turn_id=msg.get("turn_id"),
                client_event_id=msg.get("client_event_id"),
                client_ts=msg.get("client_ts"),
            )
        )
    return entries


def _events_to_history(raw_events: list[dict[str, Any]] | None) -> list[TranscriptEntry]:
    entries: list[TranscriptEntry] = []
    for event in raw_events or []:
        event_type = str(event.get("event_type") or "").strip()
        if event_type not in {"user_message", "assistant_message"}:
            continue
        role = str(event.get("role") or "").strip()
        if role not in {"user", "assistant"}:
            role = "user" if event_type == "user_message" else "assistant"
        content = str(event.get("content") or "").strip()
        if not content:
            continue
        kwargs: dict[str, Any] = {
            "role": role,
            "content": content,
            "metadata": event.get("payload") or {},
            "turn_id": event.get("turn_id"),
            "client_event_id": event.get("client_event_id"),
            "client_ts": event.get("client_ts"),
        }
        if event.get("created_at"):
            kwargs["created_at"] = event["created_at"]
        entries.append(TranscriptEntry(**kwargs))  # type: ignore[arg-type]
    return entries


def _message_event_type(role: Role) -> str:
    if role == "user":
        return "user_message"
    if role == "assistant":
        return "assistant_message"
    if role == "tool":
        return "tool_event"
    return "session_event"


def _metadata_for_persistence(session: SessionSnapshot) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    source_session = session.metadata.get("session")
    if isinstance(source_session, dict):
        stored_metadata = source_session.get("metadata")
        if isinstance(stored_metadata, dict):
            metadata.update(stored_metadata)
    for key, value in session.metadata.items():
        if key in _INTERNAL_SESSION_METADATA_KEYS:
            continue
        metadata[key] = value
    return metadata


def _session_id_for(request: AgentRunRequest) -> str:
    if request.session_id:
        return request.session_id
    return "runtime-%s" % uuid4()


class InMemorySessionStore:
    """Process-local session store used as a last-resort fallback.

    LRU-bounded: caps total sessions and per-session transcript length so a
    long-running uvicorn worker cannot grow without bound. The persistent
    Edge Function store is the source of truth in production; this exists
    only to keep multi-turn behavior sane when that store is unavailable.
    """

    def __init__(
        self,
        *,
        max_sessions: int | None = None,
        max_transcript: int | None = None,
    ) -> None:
        self._sessions: OrderedDict[str, SessionSnapshot] = OrderedDict()
        self._max_sessions = max_sessions or AGENT_RUNTIME_INMEMORY_MAX_SESSIONS
        self._max_transcript = max_transcript or AGENT_RUNTIME_INMEMORY_MAX_TRANSCRIPT

    def _touch(self, session_id: str) -> None:
        self._sessions.move_to_end(session_id)

    def _trim_transcript(self, snapshot: SessionSnapshot) -> None:
        if len(snapshot.transcript) > self._max_transcript:
            snapshot.transcript = snapshot.transcript[-self._max_transcript :]

    def _evict_if_needed(self) -> None:
        while len(self._sessions) > self._max_sessions:
            self._sessions.popitem(last=False)

    async def load_session(self, request: AgentRunRequest) -> SessionSnapshot:
        session_id = _session_id_for(request)
        snapshot = self._sessions.get(session_id)
        if snapshot is None:
            snapshot = SessionSnapshot(
                session_id=session_id,
                agent_id=request.agent_id,
                user_id=request.user_id,
                transcript=_normalize_history(request.history),
                metadata={
                    **request.metadata,
                    "source": "memory",
                    "persistable": bool(request.user_id and request.session_id),
                },
                ui_state=request.content_context,
            )
            self._sessions[session_id] = snapshot
            self._evict_if_needed()
        else:
            self._touch(session_id)
            if request.history and not snapshot.transcript:
                snapshot.transcript = _normalize_history(request.history)
        if request.metadata:
            snapshot.metadata.update(request.metadata)
        snapshot.metadata["persistable"] = bool(request.user_id and request.session_id)
        self._trim_transcript(snapshot)
        return deepcopy(snapshot)

    async def append_entries(
        self,
        session: SessionSnapshot,
        entries: list[TranscriptEntry],
    ) -> None:
        stored = self._sessions.get(session.session_id)
        if stored is None:
            stored = SessionSnapshot(
                session_id=session.session_id,
                agent_id=session.agent_id,
                user_id=session.user_id,
                metadata=dict(session.metadata),
            )
            self._sessions[session.session_id] = stored
        else:
            self._touch(session.session_id)
        stored.transcript.extend(entries)
        self._trim_transcript(stored)
        self._evict_if_needed()


class PickerConversationSessionStore:
    """Read-compatible store backed by existing picker_conversations rows."""

    async def load_session(self, request: AgentRunRequest) -> SessionSnapshot:
        session_id = _session_id_for(request)
        if not request.session_id or not request.user_id:
            return SessionSnapshot(
                session_id=session_id,
                agent_id=request.agent_id,
                user_id=request.user_id,
                transcript=_normalize_history(request.history),
                metadata={
                    **request.metadata,
                    "source": "request_history",
                    "persistable": bool(request.user_id and request.session_id),
                },
                ui_state=request.content_context,
            )

        try:
            from app.features.screener.conversation_db import get_conversation

            conversation = await get_conversation(request.session_id, request.user_id)
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent runtime failed to load picker conversation session_id=%s",
                request.session_id,
            )
            conversation = None

        if paused_conversation(conversation or {}):
            require_active("kol_research")
        data = (conversation or {}).get("data") or {}
        messages = data.get("messages") if isinstance(data, dict) else None
        transcript = _normalize_history(messages)
        source = "picker_conversations" if transcript else "request_history"
        if not transcript:
            transcript = _normalize_history(request.history)

        return SessionSnapshot(
            session_id=session_id,
            agent_id=request.agent_id,
            user_id=request.user_id,
            transcript=transcript,
            metadata={
                **request.metadata,
                "source": source,
                "conversation_id": request.session_id,
                "persistable": bool(request.user_id and request.session_id),
            },
            ui_state=_ui_state_from_picker_data(data) or request.content_context,
        )

    async def append_entries(
        self,
        session: SessionSnapshot,  # noqa: ARG002 — protocol arg, store is read-only
        entries: list[TranscriptEntry],  # noqa: ARG002
    ) -> bool | None:
        # Existing /research UI owns writes to picker_conversations today. The
        # runtime keeps this store read-only to avoid racing with frontend
        # save/update calls.
        return None


class AgentSessionsSessionStore:
    """Persistent store backed by agent_sessions edge function."""

    async def load_session(self, request: AgentRunRequest) -> SessionSnapshot:
        session_id = _session_id_for(request)
        if not request.session_id or not request.user_id:
            return SessionSnapshot(
                session_id=session_id,
                agent_id=request.agent_id,
                user_id=request.user_id,
                transcript=[],
                metadata={
                    **request.metadata,
                    "source": "agent_sessions_unavailable",
                    "persistable": False,
                },
            )

        try:
            from app.features.agent_runtime import db

            payload = await db.get_session(
                user_id=request.user_id,
                agent_id=request.agent_id,
                session_id=request.session_id,
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent runtime failed to load durable session session_id=%s",
                request.session_id,
            )
            payload = None

        raw_events = (payload or {}).get("events") or []
        transcript = _events_to_history(raw_events)
        if not transcript:
            raw_entries = (payload or {}).get("entries") or []
            transcript = _normalize_history(raw_entries)
        stored_session = (payload or {}).get("session")
        if paused_conversation(stored_session or {}):
            require_active("kol_research")
        stored_metadata = {}
        if isinstance(stored_session, dict) and isinstance(stored_session.get("metadata"), dict):
            stored_metadata = stored_session["metadata"]
        ui_state = stored_metadata.get("ui_state") if isinstance(stored_metadata, dict) else None
        summary = stored_metadata.get("summary") if isinstance(stored_metadata, dict) else None
        # A session row that exists but has no message events yet should NOT
        # silently fall through to picker_conversations — that would import a
        # legacy conversation's transcript into what is actually a brand-new
        # runtime session (the "ghost history" failure mode).
        session_exists = isinstance(stored_session, dict)
        return SessionSnapshot(
            session_id=session_id,
            agent_id=request.agent_id,
            user_id=request.user_id,
            transcript=transcript,
            metadata={
                **stored_metadata,
                **request.metadata,
                "source": "agent_sessions" if transcript else (
                    "agent_sessions_empty" if session_exists else "agent_sessions_missing"
                ),
                "session": stored_session,
                "session_exists": session_exists,
                "persistable": True,
            },
            ui_state=ui_state if isinstance(ui_state, dict) else request.content_context,
            summary=summary if isinstance(summary, str) else None,
        )

    async def append_entries(
        self,
        session: SessionSnapshot,
        entries: list[TranscriptEntry],
    ) -> bool:
        """Persist entries to the durable store.

        Returns True on a successful round-trip to the Edge Function, False on
        any failure (network, 5xx, validation). Hybrid uses the return value
        to decide whether to spill into the in-memory fallback.
        """
        if (
            not session.user_id
            or not session.session_id
            or not entries
            or session.metadata.get("persistable") is False
        ):
            return False
        try:
            from app.features.agent_runtime import db

            return await db.append_events(
                user_id=session.user_id,
                agent_id=session.agent_id,
                session_id=session.session_id,
                metadata=_metadata_for_persistence(session),
                events=[
                    {
                        "event_type": _message_event_type(entry.role),
                        "role": entry.role,
                        "content": entry.content,
                        "payload": entry.metadata,
                        "created_at": entry.created_at,
                        "turn_id": entry.turn_id,
                        "client_event_id": entry.client_event_id,
                        "client_ts": entry.client_ts,
                    }
                    for entry in entries
                ],
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent runtime failed to append durable entries session_id=%s",
                session.session_id,
            )
            return False


class HybridSessionStore:
    """Prefer persistent reads, with a strictly-fallback in-memory tail.

    Reads:
      1. agent_sessions (primary) - the source of truth.
      2. picker_conversations (migration compatibility) - only consulted when
         the primary row doesn't exist yet. Existing-but-empty rows skip this
         step to avoid importing legacy history into a new runtime session.
      3. in-memory - last-resort if both above are unavailable.

    Writes:
      - Always try primary first.
      - Only spill to the in-memory fallback if primary actually failed; on
        the happy path the fallback stays empty so a long-running worker can't
        grow without bound.
    """

    def __init__(
        self,
        primary: SessionStore | None = None,
        picker: SessionStore | None = None,
        fallback: InMemorySessionStore | None = None,
    ) -> None:
        self.primary = primary or AgentSessionsSessionStore()
        self.picker = picker or PickerConversationSessionStore()
        self.fallback = fallback or InMemorySessionStore()

    async def load_session(self, request: AgentRunRequest) -> SessionSnapshot:
        snapshot = await self.primary.load_session(request)
        if snapshot.transcript:
            return snapshot
        # An empty row that exists in agent_sessions is a brand-new runtime
        # session; do NOT fall through to picker_conversations, which would
        # import a legacy conversation's messages as ghost history.
        if snapshot.metadata.get("session_exists"):
            return snapshot
        picker_snapshot = await self.picker.load_session(request)
        if picker_snapshot.transcript:
            return picker_snapshot
        return await self.fallback.load_session(request)

    async def append_entries(
        self,
        session: SessionSnapshot,
        entries: list[TranscriptEntry],
    ) -> None:
        primary_ok = False
        try:
            result = await self.primary.append_entries(session, entries)
            primary_ok = bool(result)
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent runtime primary session append failed session_id=%s",
                session.session_id,
            )
        if not primary_ok:
            await self.fallback.append_entries(session, entries)
