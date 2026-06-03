"""Shared runtime orchestration for feature agents."""

from __future__ import annotations

from app.features.agent_runtime.context import (
    AssembledContext,
    ContextAssemblyRequest,
    DefaultContextEngine,
)
from app.features.agent_runtime.models import (
    AgentRunRequest,
    AgentRuntimeTurn,
    TranscriptEntry,
)
from app.features.agent_runtime.session_store import HybridSessionStore, SessionStore


class AgentRuntimeService:
    """Coordinates session loading and context assembly for one agent turn."""

    def __init__(
        self,
        *,
        session_store: SessionStore | None = None,
        context_engine: DefaultContextEngine | None = None,
    ) -> None:
        self.session_store = session_store or HybridSessionStore()
        self.context_engine = context_engine or DefaultContextEngine()

    async def load_session(self, request: AgentRunRequest):
        return await self.session_store.load_session(request)

    async def prepare_turn(
        self,
        request: AgentRunRequest,
        context_request: ContextAssemblyRequest,
    ) -> AgentRuntimeTurn:
        session = await self.session_store.load_session(request)
        if context_request.session is None:
            context_request = ContextAssemblyRequest(
                message=context_request.message,
                history=context_request.history,
                content_context=context_request.content_context,
                input_guard_section=context_request.input_guard_section,
                session_summary=context_request.session_summary,
                session=session,
                budget_plan=context_request.budget_plan,
                history_keep=context_request.history_keep,
                char_soft_limit=context_request.char_soft_limit,
                minimum_history_keep=context_request.minimum_history_keep,
                prefix_sections=context_request.prefix_sections,
                content_renderer=context_request.content_renderer,
            )
        assembled = await self.context_engine.assemble(context_request)
        return AgentRuntimeTurn(
            request=request,
            session=session,
            assembled_context=assembled,
        )

    async def assemble_context(
        self,
        context_request: ContextAssemblyRequest,
    ) -> AssembledContext:
        return await self.context_engine.assemble(context_request)

    async def complete_turn(
        self,
        turn: AgentRuntimeTurn,
        *,
        assistant_text: str,
        metadata: dict | None = None,
    ) -> None:
        turn_id = turn.request.turn_id
        entries = [
            TranscriptEntry(
                role="user",
                content=turn.request.message,
                metadata={"source": "agent_runtime", "turn_id": turn_id},
                turn_id=turn_id,
                client_event_id="%s:user_message" % turn_id if turn_id else None,
            ),
            TranscriptEntry(
                role="assistant",
                content=assistant_text,
                metadata={**(metadata or {}), "turn_id": turn_id},
                turn_id=turn_id,
                client_event_id="%s:assistant_message" % turn_id if turn_id else None,
            ),
        ]
        await self.session_store.append_entries(turn.session, entries)


_runtime = AgentRuntimeService()


def get_agent_runtime() -> AgentRuntimeService:
    return _runtime
