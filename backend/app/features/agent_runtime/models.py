"""Internal models for the shared agent runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

Role = Literal["user", "assistant", "system", "tool"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class TranscriptEntry:
    """One durable transcript entry.

    The contract is intentionally broader than chat messages so future tool
    calls and summaries can share the same session timeline.
    """

    role: Role
    content: str
    created_at: str = field(default_factory=utc_now_iso)
    metadata: dict[str, Any] = field(default_factory=dict)
    turn_id: str | None = None
    client_event_id: str | None = None
    client_ts: str | None = None


@dataclass
class SessionSnapshot:
    """Current server-side view of an agent session."""

    session_id: str
    agent_id: str
    user_id: str | None = None
    transcript: list[TranscriptEntry] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    ui_state: dict[str, Any] | None = None
    summary: str | None = None

    def chat_history(self) -> list[dict[str, str]]:
        history: list[dict[str, str]] = []
        for entry in self.transcript:
            if entry.role not in {"user", "assistant"}:
                continue
            if not entry.content:
                continue
            history.append({"role": entry.role, "content": entry.content})
        return history


@dataclass(frozen=True)
class AgentRunRequest:
    """Runtime-level request shared by feature agents."""

    agent_id: str
    message: str
    user_id: str | None = None
    session_id: str | None = None
    history: list[dict[str, str]] = field(default_factory=list)
    content_context: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    turn_id: str | None = None


@dataclass(frozen=True)
class RuntimeEvent:
    """Structured runtime event for future centralized SSE/logging."""

    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now_iso)


@dataclass
class AgentRuntimeTurn:
    """Prepared turn: durable session snapshot + assembled context."""

    request: AgentRunRequest
    session: SessionSnapshot
    assembled_context: Any
