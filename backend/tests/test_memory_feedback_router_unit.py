"""Memory feedback router unit tests.

Tests the agent-runtime feedback branch without network or database writes.
"""

from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

from app.features.memory.models import FeedbackInput


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/feedback",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


@pytest.mark.asyncio
async def test_post_feedback_routes_runtime_answer_to_agent_session_event(monkeypatch):
    """research_agent_answer feedback updates the runtime assistant message row."""
    from app.features.memory import router as memory_router
    from app.shared import agent_runtime_feedback

    update_mock = AsyncMock(return_value={"id": "event-1"})
    save_mock = AsyncMock(return_value="feedback-1")
    monkeypatch.setattr(agent_runtime_feedback, "update_agent_message_feedback", update_mock)
    monkeypatch.setattr(memory_router.memory_db, "save_feedback", save_mock)
    monkeypatch.setattr(memory_router.posthog, "posthog_client", None)

    body = FeedbackInput(
        target_type="research_agent_answer",
        target_id="research:session-1:message-1",
        sentiment=-1,
        reason="不相关",
        snapshot={"text": "answer text", "conversation_id": "session-1"},
        agent_id="research_agent",
        session_id="session-1",
        turn_id="turn-1",
        client_event_id="turn-1:assistant_message",
        message_event_id="event-1",
    )

    result = await memory_router.post_feedback(
        request=_request(),
        body=body,
        user_id="user-1",
    )

    assert result == {"success": True, "id": "event-1"}
    save_mock.assert_not_awaited()
    update_mock.assert_awaited_once_with(
        user_id="user-1",
        agent_id="research_agent",
        session_id="session-1",
        message_event_id="event-1",
        client_event_id="turn-1:assistant_message",
        turn_id="turn-1",
        sentiment=-1,
        reason="不相关",
        feedback_payload={
            "text": "answer text",
            "conversation_id": "session-1",
            "target_id": "research:session-1:message-1",
        },
    )


@pytest.mark.asyncio
async def test_post_feedback_falls_back_to_memory_store_without_runtime_identifiers(monkeypatch):
    """Missing runtime identifiers should not call the runtime feedback writer."""
    from app.features.memory import router as memory_router
    from app.shared import agent_runtime_feedback

    update_mock = AsyncMock(return_value={"id": "event-1"})
    save_mock = AsyncMock(return_value="feedback-1")
    monkeypatch.setattr(agent_runtime_feedback, "update_agent_message_feedback", update_mock)
    monkeypatch.setattr(memory_router.memory_db, "save_feedback", save_mock)
    monkeypatch.setattr(memory_router.posthog, "posthog_client", None)

    body = FeedbackInput(
        target_type="research_agent_answer",
        target_id="research:draft:message-1",
        sentiment=1,
        agent_id="research_agent",
        session_id="session-1",
    )

    result = await memory_router.post_feedback(
        request=_request(),
        body=body,
        user_id="user-1",
    )

    assert result == {"success": True, "id": "feedback-1"}
    update_mock.assert_not_awaited()
    save_mock.assert_awaited_once_with(
        "user-1",
        {
            "target_type": "research_agent_answer",
            "target_id": "research:draft:message-1",
            "sentiment": 1,
            "reason": None,
            "snapshot": None,
        },
    )


def test_feedback_input_accepts_runtime_clear_sentiment():
    """sentiment=0 is valid for clearing existing runtime feedback."""
    body = FeedbackInput(
        target_type="research_agent_answer",
        target_id="research:session-1:message-1",
        sentiment=0,
        agent_id="kol_research_agent",
        session_id="session-1",
        turn_id="turn-1",
    )

    assert body.sentiment == 0
    assert body.agent_id == "kol_research_agent"
