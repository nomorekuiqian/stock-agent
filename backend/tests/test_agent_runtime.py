from __future__ import annotations

from pathlib import Path

import pytest

from app.features.agent_runtime import (
    AgentRunRequest,
    AgentRuntimeService,
    AgentSessionsSessionStore,
    BudgetPlan,
    ContextAssemblyRequest,
    DefaultContextEngine,
    HybridSessionStore,
    InMemorySessionStore,
    PickerConversationSessionStore,
    SessionSnapshot,
    TranscriptEntry,
)
from app.features.agent_runtime.events import (
    context_snapshot_event,
    sync_ui_state,
    tool_call_events,
    ui_state_from_conversation_data,
)
from app.features.agent_runtime.models import AgentRuntimeTurn


@pytest.mark.asyncio
async def test_context_engine_assembles_prompt_with_budgeted_history():
    engine = DefaultContextEngine()
    history = [
        {"role": "user", "content": "old user " + ("x" * 100)},
        {"role": "assistant", "content": "old assistant " + ("x" * 100)},
        {"role": "user", "content": "recent user"},
        {"role": "assistant", "content": "recent assistant"},
        {"role": "user", "content": "latest user"},
    ]

    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="怎么看 NVDA?",
            history=history,
            content_context={"type": "stock", "symbol": "NVDA"},
            input_guard_section="## Prefetched Data\n{}",
            history_keep=5,
            char_soft_limit=80,
            minimum_history_keep=2,
        )
    )

    assert "old user" not in assembled.prompt
    assert "old assistant" not in assembled.prompt
    assert "recent user" in assembled.prompt
    assert "recent assistant" in assembled.prompt
    assert "latest user" in assembled.prompt
    assert "NVDA Stock Research" in assembled.prompt
    assert "## Prefetched Data" in assembled.prompt
    assert assembled.kept_history == 3
    assert assembled.dropped_history == 2


@pytest.mark.asyncio
async def test_context_engine_prefers_session_history_over_request_history():
    engine = DefaultContextEngine()
    session = SessionSnapshot(
        session_id="s1",
        agent_id="research_agent",
        user_id="u1",
        transcript=[
            TranscriptEntry(role="user", content="server side first turn"),
            TranscriptEntry(role="assistant", content="server side answer"),
        ],
    )

    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="continue",
            history=[{"role": "user", "content": "client fallback only"}],
            session=session,
        )
    )

    assert "server side first turn" in assembled.prompt
    assert "server side answer" in assembled.prompt
    assert "client fallback only" not in assembled.prompt


@pytest.mark.asyncio
async def test_context_engine_budget_plan_limits_history_section():
    engine = DefaultContextEngine()
    history = [
        {"role": "user", "content": "old " + ("x" * 80)},
        {"role": "assistant", "content": "recent answer"},
        {"role": "user", "content": "latest question"},
    ]

    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="continue",
            history=history,
            history_keep=3,
            minimum_history_keep=1,
            budget_plan=BudgetPlan(
                total_chars=500,
                allocations={"history": 60, "input_guard": 100, "content_context": 100},
            ),
        )
    )

    assert "old " not in assembled.prompt
    assert "latest question" in assembled.prompt


@pytest.mark.asyncio
async def test_in_memory_session_store_appends_chat_entries():
    store = InMemorySessionStore()
    request = AgentRunRequest(
        agent_id="kol_research_agent",
        user_id="u1",
        session_id="s1",
        message="继续",
        history=[{"role": "user", "content": "上一轮"}],
    )

    session = await store.load_session(request)
    await store.append_entries(
        session,
        [TranscriptEntry(role="assistant", content="回答")],
    )
    reloaded = await store.load_session(request)

    assert [entry.content for entry in reloaded.transcript] == ["上一轮", "回答"]


def test_tool_call_events_use_payload_for_tool_details():
    events = tool_call_events([
        {
            "name": "get_stock_brief",
            "args_summary": '{"symbol":"NVDA"}',
            "duration_ms": 42,
            "ok": True,
        }
    ])

    assert events == [
        {
            "event_type": "tool_call_completed",
            "role": "tool",
            "content": "get_stock_brief",
            "payload": {
                "name": "get_stock_brief",
                "tool_name": "get_stock_brief",
                "args_summary": '{"symbol":"NVDA"}',
                "duration_ms": 42,
                "ok": True,
            },
        }
    ]


def test_ui_state_from_conversation_data_extracts_restore_snapshot():
    state = ui_state_from_conversation_data({
        "active_content": {"type": "stock", "params": {"symbol": "NVDA"}},
        "content_stack": [{"type": "screener"}],
        "messages": [],
    })

    assert state == {
        "active_content": {"type": "stock", "params": {"symbol": "NVDA"}},
        "content_stack": [{"type": "screener"}],
    }


def test_agent_sessions_edge_function_preserves_batch_event_order():
    """Same-batch events must not share the exact same restore sort key.

    The DB id is a random UUID, so ordering by `(created_at, id)` would restore
    user/assistant rows in arbitrary order if all rows in one append batch had
    the same `created_at`.
    """

    edge_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "edge_functions"
        / "agent-sessions.js"
    )
    source = edge_path.read_text()

    assert ".map((e, idx)" in source
    assert "created_at: new Date(nowMs + idx).toISOString()" in source


def test_agent_sessions_edge_function_supports_message_feedback_updates():
    """Feedback updates must target one assistant message and support clearing."""
    edge_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "edge_functions"
        / "agent-sessions.js"
    )
    source = edge_path.read_text()

    assert 'action === "update_feedback"' in source
    assert "message_event_id, client_event_id, or turn_id required" in source
    assert ".eq(\"event_type\", \"assistant_message\")" in source
    assert "feedback_sentiment: sentiment === 0 ? null : sentiment" in source
    assert ".select(\"id, feedback_sentiment, feedback_reason, feedback_at, feedback_payload\")" in source


@pytest.mark.asyncio
async def test_picker_conversation_store_reads_existing_messages(monkeypatch):
    async def fake_get_conversation(conversation_id: str, user_id: str):
        assert conversation_id == "conv1"
        assert user_id == "u1"
        return {
            "data": {
                "messages": [
                    {"id": "m1", "role": "user", "content": "昨天聊 NVDA"},
                    {"id": "m2", "role": "assistant", "content": "昨天结论"},
                ]
            }
        }

    from app.features.screener import conversation_db

    monkeypatch.setattr(conversation_db, "get_conversation", fake_get_conversation)

    store = PickerConversationSessionStore()
    session = await store.load_session(
        AgentRunRequest(
            agent_id="kol_research_agent",
            user_id="u1",
            session_id="conv1",
            message="接着说",
            history=[{"role": "user", "content": "fallback"}],
        )
    )

    assert session.metadata["source"] == "picker_conversations"
    assert session.chat_history() == [
        {"role": "user", "content": "昨天聊 NVDA"},
        {"role": "assistant", "content": "昨天结论"},
    ]


@pytest.mark.asyncio
async def test_agent_sessions_store_reads_persistent_events(monkeypatch):
    async def fake_get_session(*, user_id: str, agent_id: str, session_id: str, limit: int = 80):
        assert user_id == "u1"
        assert agent_id == "kol_research_agent"
        assert session_id == "conv1"
        assert limit == 80
        return {
            "session": {
                "session_id": "conv1",
                "metadata": {
                    "agent_kind": "kol_research",
                    "persona_username": "old_persona",
                },
            },
            "events": [
                {
                    "event_type": "user_message",
                    "role": "user",
                    "content": "持久用户消息",
                    "payload": {},
                },
                {
                    "event_type": "tool_event",
                    "role": "tool",
                    "content": "ignored",
                    "payload": {},
                },
                {
                    "event_type": "assistant_message",
                    "role": "assistant",
                    "content": "持久助手消息",
                    "payload": {},
                },
            ],
        }

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "get_session", fake_get_session)

    store = AgentSessionsSessionStore()
    session = await store.load_session(
        AgentRunRequest(
            agent_id="kol_research_agent",
            user_id="u1",
            session_id="conv1",
            message="继续",
            history=[{"role": "user", "content": "fallback"}],
            metadata={"persona_username": "qinbafrank"},
        )
    )

    assert session.metadata["source"] == "agent_sessions"
    assert session.metadata["agent_kind"] == "kol_research"
    assert session.metadata["persona_username"] == "qinbafrank"
    assert session.chat_history() == [
        {"role": "user", "content": "持久用户消息"},
        {"role": "assistant", "content": "持久助手消息"},
    ]


@pytest.mark.asyncio
async def test_agent_sessions_store_appends_entries(monkeypatch):
    calls = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)

    store = AgentSessionsSessionStore()
    await store.append_entries(
        session=await InMemorySessionStore().load_session(
            AgentRunRequest(
                agent_id="kol_research_agent",
                user_id="u1",
                session_id="conv1",
                message="继续",
                metadata={
                    "agent_kind": "kol_research",
                    "persona_username": "qinbafrank",
                },
            )
        ),
        entries=[TranscriptEntry(role="assistant", content="回答")],
    )

    assert calls
    assert calls[0]["user_id"] == "u1"
    assert calls[0]["agent_id"] == "kol_research_agent"
    assert calls[0]["session_id"] == "conv1"
    assert calls[0]["metadata"] == {
        "agent_kind": "kol_research",
        "persona_username": "qinbafrank",
    }
    assert calls[0]["events"][0]["event_type"] == "assistant_message"
    assert calls[0]["events"][0]["role"] == "assistant"
    assert calls[0]["events"][0]["content"] == "回答"


@pytest.mark.asyncio
async def test_runtime_complete_turn_writes_idempotent_turn_events(monkeypatch):
    calls = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    async def fake_get_session(**_kwargs):
        return {"session": None, "events": []}

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)
    monkeypatch.setattr(db, "get_session", fake_get_session)

    runtime = AgentRuntimeService(session_store=AgentSessionsSessionStore())
    request = AgentRunRequest(
        agent_id="research_agent",
        user_id="u1",
        session_id="conv1",
        message="第一轮",
        turn_id="turn-1",
    )
    session = await runtime.load_session(request)
    await runtime.complete_turn(
        turn=type("Turn", (), {"request": request, "session": session})(),
        assistant_text="回答",
        metadata={"agent_kind": "research"},
    )

    assert calls
    events = calls[0]["events"]
    assert events[0]["event_type"] == "user_message"
    assert events[0]["turn_id"] == "turn-1"
    assert events[0]["client_event_id"] == "turn-1:user_message"
    assert events[1]["event_type"] == "assistant_message"
    assert events[1]["turn_id"] == "turn-1"
    assert events[1]["client_event_id"] == "turn-1:assistant_message"


@pytest.mark.asyncio
async def test_agent_sessions_store_skips_unstable_runtime_session(monkeypatch):
    calls = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)

    store = AgentSessionsSessionStore()
    session = await store.load_session(
        AgentRunRequest(
            agent_id="kol_research_agent",
            user_id="u1",
            message="第一轮没有 conversation id",
            metadata={
                "agent_kind": "kol_research",
                "persona_username": "qinbafrank",
            },
        )
    )
    await store.append_entries(
        session=session,
        entries=[TranscriptEntry(role="assistant", content="回答")],
    )

    assert calls == []


@pytest.mark.asyncio
async def test_sync_ui_state_writes_snapshot_metadata_and_navigation_event(monkeypatch):
    calls = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)

    await sync_ui_state(
        user_id="u1",
        agent_id="research_agent",
        session_id="conv1",
        agent_kind="research",
        title="研究对话",
        data={
            "active_content": {"type": "stock", "params": {"symbol": "NVDA"}},
            "content_stack": [{"type": "screener"}],
        },
        source="conversation_update",
    )

    assert calls
    assert calls[0]["metadata"]["agent_kind"] == "research"
    assert calls[0]["metadata"]["title"] == "研究对话"
    assert calls[0]["metadata"]["ui_state"]["active_content"]["type"] == "stock"
    assert calls[0]["events"][0]["event_type"] == "ui_navigation"
    assert calls[0]["events"][0]["payload"]["source"] == "conversation_update"


@pytest.mark.asyncio
async def test_hybrid_session_store_falls_back_when_primary_empty():
    class EmptyPrimary:
        async def load_session(self, request: AgentRunRequest):
            return await InMemorySessionStore().load_session(
                AgentRunRequest(
                    agent_id=request.agent_id,
                    user_id=request.user_id,
                    session_id=request.session_id,
                    message=request.message,
                    history=[],
                )
            )

        async def append_entries(self, session, entries):
            return None

    store = HybridSessionStore(
        primary=EmptyPrimary(),
        picker=EmptyPrimary(),
        fallback=InMemorySessionStore(),
    )
    request = AgentRunRequest(
        agent_id="kol_research_agent",
        user_id="u1",
        session_id="s1",
        message="继续",
        history=[{"role": "user", "content": "fallback history"}],
    )

    session = await store.load_session(request)

    assert session.chat_history() == [{"role": "user", "content": "fallback history"}]


# ---------------------------------------------------------------------------
# Phase 1 plan acceptance — the test cases below codify the verification
# bullets in docs/plans/active/agent-runtime-next-3-phases.md so a future
# regression in any of these guarantees fails fast in CI.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_exists_short_circuits_picker_lookup():
    """primary 行 metadata.session_exists=True 时不应再回退 picker (避免 ghost history)."""

    class ExistsButEmptyPrimary:
        async def load_session(self, request: AgentRunRequest):
            return SessionSnapshot(
                session_id=request.session_id or "s",
                agent_id=request.agent_id,
                user_id=request.user_id,
                transcript=[],
                metadata={
                    "session_exists": True,
                    "source": "agent_sessions_empty",
                    "persistable": True,
                },
            )

        async def append_entries(self, session, entries):
            return True

    class PickerWithGhost:
        async def load_session(self, request: AgentRunRequest):
            return SessionSnapshot(
                session_id=request.session_id or "s",
                agent_id=request.agent_id,
                user_id=request.user_id,
                transcript=[TranscriptEntry(role="user", content="GHOST")],
                metadata={"source": "picker_conversations"},
            )

        async def append_entries(self, session, entries):
            return None

    store = HybridSessionStore(
        primary=ExistsButEmptyPrimary(),
        picker=PickerWithGhost(),
        fallback=InMemorySessionStore(),
    )
    snap = await store.load_session(
        AgentRunRequest(
            agent_id="research_agent",
            user_id="u1",
            session_id="s1",
            message="hello",
        )
    )
    assert snap.metadata["source"] == "agent_sessions_empty"
    assert snap.chat_history() == []


@pytest.mark.asyncio
async def test_runtime_complete_turn_is_idempotent_under_retry(monkeypatch):
    """Same turn_id replayed twice must surface to the Edge Function as the
    same client_event_id — the unique index then dedups on the DB side."""

    calls: list[dict] = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    async def fake_get_session(**_kwargs):
        return {"session": None, "events": []}

    from app.features.agent_runtime import db
    monkeypatch.setattr(db, "append_events", fake_append_events)
    monkeypatch.setattr(db, "get_session", fake_get_session)

    runtime = AgentRuntimeService(session_store=AgentSessionsSessionStore())
    request = AgentRunRequest(
        agent_id="research_agent",
        user_id="u1",
        session_id="s1",
        message="去 NVDA",
        turn_id="turn-abc",
    )
    session = await runtime.load_session(request)
    turn_stub = type("Turn", (), {"request": request, "session": session})()
    await runtime.complete_turn(turn=turn_stub, assistant_text="A1")
    await runtime.complete_turn(turn=turn_stub, assistant_text="A1")  # retry

    assert len(calls) == 2
    for call in calls:
        # Both writes carry the same turn_id and client_event_id strings so
        # the on-conflict-do-nothing path in the Edge Function collapses them.
        assert call["events"][0]["client_event_id"] == "turn-abc:user_message"
        assert call["events"][1]["client_event_id"] == "turn-abc:assistant_message"
        assert call["events"][0]["turn_id"] == "turn-abc"
        assert call["events"][1]["turn_id"] == "turn-abc"


@pytest.mark.asyncio
async def test_db_get_session_requires_both_cursor_fields(monkeypatch):
    """A lone after_created_at must be ignored — both fields are required for
    pagination, matching the Edge Function's `useCursor` contract."""

    captured: dict = {}

    async def fake_call_function(name, *, method, params, timeout, extra_headers=None):
        captured.update({"name": name, "params": dict(params)})
        return {"status_code": 200, "data": {"success": True, "data": {}}}

    from app.features.agent_runtime import db as runtime_db
    from app.core.database import get_insforge_service

    service = get_insforge_service()
    monkeypatch.setattr(service, "call_function", fake_call_function)

    # Single argument — must NOT be forwarded.
    await runtime_db.get_session(
        user_id="u1",
        agent_id="research_agent",
        session_id="s1",
        after_created_at="2026-01-01T00:00:00Z",
        after_id=None,
    )
    assert "after_created_at" not in captured["params"]

    # Both — should be forwarded.
    await runtime_db.get_session(
        user_id="u1",
        agent_id="research_agent",
        session_id="s1",
        after_created_at="2026-01-01T00:00:00Z",
        after_id="evt-42",
    )
    assert captured["params"]["after_created_at"] == "2026-01-01T00:00:00Z"
    assert captured["params"]["after_id"] == "evt-42"


@pytest.mark.asyncio
async def test_budget_plan_records_section_truncations_in_metadata():
    """ContextEngine 必须把超额信息暴露在 metadata.truncated_sections，
    使 router/agent 可以基于它发 context_budget_truncated event."""

    engine = DefaultContextEngine()
    # input_guard / content_context 都强制压缩到极小预算，触发 truncation。
    bp = BudgetPlan(
        total_chars=1000,
        allocations={
            "input_guard": 32,
            "content_context": 32,
            "history": 200,
        },
    )
    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="问题",
            history=[{"role": "user", "content": "x" * 800}],
            content_context={"type": "stock", "symbol": "NVDA"},
            input_guard_section="## guard\n" + ("g" * 500),
            budget_plan=bp,
            history_keep=4,
            minimum_history_keep=1,
        )
    )
    truncations = assembled.metadata.get("truncated_sections") or {}
    # 至少 input_guard 被裁了。
    assert "input_guard" in truncations
    assert truncations["input_guard"]["actual"] > truncations["input_guard"]["limit"]


@pytest.mark.asyncio
async def test_context_budget_truncated_event_emitted_when_truncated():
    from app.features.agent_runtime.events import context_budget_truncated_event

    engine = DefaultContextEngine()
    bp = BudgetPlan(total_chars=200, allocations={"input_guard": 16})
    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="m",
            input_guard_section="g" * 5000,
            budget_plan=bp,
        )
    )
    # 构造一个最小 turn 桩。
    turn = type(
        "Turn",
        (),
        {
            "request": AgentRunRequest(agent_id="x", message="m"),
            "session": SessionSnapshot(session_id="s", agent_id="x"),
            "assembled_context": assembled,
        },
    )()
    ev = context_budget_truncated_event(turn)
    assert ev is not None
    assert ev["event_type"] == "context_budget_truncated"
    assert "input_guard" in ev["payload"]["sections"]


@pytest.mark.asyncio
async def test_request_history_flag_primary_drops_request_history(monkeypatch):
    """AGENT_RUNTIME_REQUEST_HISTORY=primary 时 session 空也不退回 request.history。
    fallback 维持回退行为。"""
    from app.features.screener import router as screener_router
    from app.features.screener.models import ResearchRequest

    req = ResearchRequest(
        message="m",
        history=[{"role": "user", "content": "client-side"}],
        session_id="s1",
        conversation_id="s1",
        turn_id="t",
    )

    class EmptySession:
        def chat_history(self):
            return []

    class StubTurn:
        session = EmptySession()

    monkeypatch.setattr(screener_router, "AGENT_RUNTIME_REQUEST_HISTORY", "primary")
    assert screener_router._effective_research_history(StubTurn(), req) is None

    monkeypatch.setattr(screener_router, "AGENT_RUNTIME_REQUEST_HISTORY", "fallback")
    assert screener_router._effective_research_history(StubTurn(), req) == req.history


@pytest.mark.asyncio
async def test_runtime_restore_router_returns_normalized_session(monkeypatch):
    """GET /api/agent-runtime/sessions/{id} 必须把 edge function payload
    映射成 frontend 友好的形状 (entries / ui_state / cursor 分开)。"""
    from app.features.agent_runtime import router as runtime_router

    async def fake_get_session(**kwargs):
        return {
            "session": {
                "session_id": kwargs["session_id"],
                "user_id": kwargs["user_id"],
                "agent_id": kwargs["agent_id"],
                "title": "保存的标题",
                "metadata": {
                    "agent_kind": "research",
                    "ui_state": {
                        "active_content": {"type": "stock", "params": {"symbol": "NVDA"}},
                        "content_stack": [],
                    },
                    "summary": "session summary",
                },
            },
            "events": [
                {"id": "e1", "event_type": "user_message", "role": "user", "content": "hi",
                 "payload": {}, "created_at": "2026-01-01T00:00:00Z"},
                {"id": "e2", "event_type": "assistant_message", "role": "assistant", "content": "hello",
                 "payload": {}, "created_at": "2026-01-01T00:00:01Z"},
            ],
            "entries": [
                {"role": "user", "content": "hi", "metadata": {}, "turn_id": "t1",
                 "client_event_id": "t1:user_message", "client_ts": None,
                 "created_at": "2026-01-01T00:00:00Z", "id": "e1"},
                {"role": "assistant", "content": "hello", "metadata": {}, "turn_id": "t1",
                 "client_event_id": "t1:assistant_message", "client_ts": None,
                 "created_at": "2026-01-01T00:00:01Z", "id": "e2"},
            ],
            "cursor": {"created_at": "2026-01-01T00:00:01Z", "id": "e2"},
            "messages_cursor": {"created_at": "2026-01-01T00:00:01Z", "id": "e2"},
        }

    from app.features.agent_runtime import db
    monkeypatch.setattr(db, "get_session", fake_get_session)

    payload = await runtime_router.get_session(
        session_id="conv-1",
        agent_id="research_agent",
        limit=None,
        after_created_at=None,
        after_id=None,
        user_id="user-123",
    )

    assert payload["title"] == "保存的标题"
    assert payload["summary"] == "session summary"
    assert payload["ui_state"]["active_content"]["type"] == "stock"
    assert payload["cursor"]["id"] == "e2"
    assert payload["messages_cursor"]["id"] == "e2"
    assert len(payload["entries"]) == 2


@pytest.mark.asyncio
async def test_runtime_restore_router_rejects_partial_cursor():
    """after_created_at 不带 after_id 时必须 400，避免 boundary 事件重发。"""
    from fastapi import HTTPException
    from app.features.agent_runtime import router as runtime_router

    with pytest.raises(HTTPException) as exc:
        await runtime_router.get_session(
            session_id="s",
            agent_id="research_agent",
            limit=None,
            after_created_at="2026-01-01T00:00:00Z",
            after_id=None,
            user_id="u",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_runtime_restore_router_rejects_unknown_agent_id():
    from fastapi import HTTPException
    from app.features.agent_runtime import router as runtime_router

    with pytest.raises(HTTPException) as exc:
        await runtime_router.get_session(
            session_id="s",
            agent_id="some_random_agent",
            limit=None,
            after_created_at=None,
            after_id=None,
            user_id="u",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_runtime_restore_router_empty_session_returns_empty_payload(monkeypatch):
    """No agent_sessions row should return 200 + empty shape so frontend can
    cleanly fall through to picker_conversations."""
    from app.features.agent_runtime import router as runtime_router

    async def fake_get_session(**_kwargs):
        return None  # 404 from edge function or no row yet

    from app.features.agent_runtime import db
    monkeypatch.setattr(db, "get_session", fake_get_session)

    payload = await runtime_router.get_session(
        session_id="conv-x",
        agent_id="kol_research_agent",
        limit=None,
        after_created_at=None,
        after_id=None,
        user_id="u",
    )
    assert payload["session"] is None
    assert payload["entries"] == []
    assert payload["cursor"] is None


# --- history_source observability (Phase 1 grayscale monitoring) ------------


@pytest.mark.asyncio
async def test_context_engine_marks_history_source_session_when_session_has_transcript():
    engine = DefaultContextEngine()
    session = SessionSnapshot(
        user_id="u1",
        agent_id="research_agent",
        session_id="s1",
        transcript=[
            TranscriptEntry(role="user", content="过去问的"),
            TranscriptEntry(role="assistant", content="过去答的"),
        ],
    )
    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="第二轮",
            history=[{"role": "user", "content": "stale request history"}],
            session=session,
        )
    )
    assert assembled.metadata["history_source"] == "session"
    assert "过去答的" in assembled.prompt
    assert "stale request history" not in assembled.prompt


@pytest.mark.asyncio
async def test_context_engine_marks_history_source_request_when_only_request_history():
    engine = DefaultContextEngine()
    assembled = await engine.assemble(
        ContextAssemblyRequest(
            message="无 session 的第二轮",
            history=[{"role": "user", "content": "客户端兜底历史"}],
            session=None,
        )
    )
    assert assembled.metadata["history_source"] == "request"
    assert "客户端兜底历史" in assembled.prompt


@pytest.mark.asyncio
async def test_context_engine_marks_history_source_empty_when_no_history_anywhere():
    engine = DefaultContextEngine()
    assembled = await engine.assemble(
        ContextAssemblyRequest(message="全新对话第一轮")
    )
    assert assembled.metadata["history_source"] == "empty"
    assert assembled.kept_history == 0


@pytest.mark.asyncio
async def test_context_snapshot_event_surfaces_history_source_in_payload():
    engine = DefaultContextEngine()
    session = SessionSnapshot(
        user_id="u1",
        agent_id="research_agent",
        session_id="s1",
        transcript=[TranscriptEntry(role="user", content="x")],
    )
    assembled = await engine.assemble(
        ContextAssemblyRequest(message="m", session=session)
    )
    turn = AgentRuntimeTurn(
        request=AgentRunRequest(
            agent_id="research_agent",
            user_id="u1",
            session_id="s1",
            message="m",
        ),
        session=session,
        assembled_context=assembled,
    )
    event = context_snapshot_event(turn)
    assert event["event_type"] == "context_snapshot"
    assert event["payload"]["history_source"] == "session"
    assert event["payload"]["history_count"] == 1


# --- sync_ui_state stable client_event_id dedupe ----------------------------


@pytest.mark.asyncio
async def test_sync_ui_state_emits_stable_client_event_id_for_same_state(monkeypatch):
    calls: list[dict] = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)

    data = {
        "active_content": {"type": "stock", "params": {"symbol": "NVDA"}},
        "content_stack": [{"type": "screener"}],
    }
    for _ in range(2):
        await sync_ui_state(
            user_id="u1",
            agent_id="research_agent",
            session_id="conv-abc",
            agent_kind="research",
            data=data,
            source="page_refresh",
        )

    assert len(calls) == 2
    cid_1 = calls[0]["events"][0]["client_event_id"]
    cid_2 = calls[1]["events"][0]["client_event_id"]
    # Same UI state -> same client_event_id so the edge function upsert dedupes.
    assert cid_1 == cid_2
    assert cid_1.startswith("ui_state:conv-abc:")


@pytest.mark.asyncio
async def test_sync_ui_state_changes_client_event_id_when_ui_state_changes(monkeypatch):
    calls: list[dict] = []

    async def fake_append_events(**kwargs):
        calls.append(kwargs)
        return True

    from app.features.agent_runtime import db

    monkeypatch.setattr(db, "append_events", fake_append_events)

    await sync_ui_state(
        user_id="u1",
        agent_id="research_agent",
        session_id="conv-abc",
        agent_kind="research",
        data={"active_content": {"type": "stock", "params": {"symbol": "NVDA"}}},
        source="conversation_update",
    )
    await sync_ui_state(
        user_id="u1",
        agent_id="research_agent",
        session_id="conv-abc",
        agent_kind="research",
        data={"active_content": {"type": "stock", "params": {"symbol": "AAPL"}}},
        source="conversation_update",
    )

    assert len(calls) == 2
    cid_1 = calls[0]["events"][0]["client_event_id"]
    cid_2 = calls[1]["events"][0]["client_event_id"]
    assert cid_1 != cid_2
    assert cid_1.startswith("ui_state:conv-abc:")
    assert cid_2.startswith("ui_state:conv-abc:")
