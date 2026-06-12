"""Agent runtime feedback helper unit tests."""

import importlib
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_update_agent_message_feedback_calls_edge_function(monkeypatch):
    """Helper forwards message identity and feedback payload to agent-sessions."""
    from app.shared import agent_runtime_feedback as feedback_module

    agent_runtime_feedback = importlib.reload(feedback_module)

    captured: dict = {}

    async def fake_call_function(name, *, method, params, json_body, timeout, extra_headers=None):
        captured.update(
            {
                "name": name,
                "method": method,
                "params": params,
                "json_body": json_body,
                "timeout": timeout,
                "extra_headers": extra_headers,
            }
        )
        return {
            "status_code": 200,
            "data": {"success": True, "data": {"id": "event-1", "feedback_sentiment": 1}},
        }

    service = type("Service", (), {"call_function": AsyncMock(side_effect=fake_call_function)})()
    monkeypatch.setattr(agent_runtime_feedback, "get_insforge_service", lambda: service)
    monkeypatch.setattr(agent_runtime_feedback, "EDGE_FUNCTION_SECRET", "secret-1")

    result = await agent_runtime_feedback.update_agent_message_feedback(
        user_id="user-1",
        agent_id="research_agent",
        session_id="session-1",
        sentiment=1,
        reason="useful",
        feedback_payload={"target_id": "research:session-1:message-1"},
        turn_id="turn-1",
        client_event_id="turn-1:assistant_message",
        message_event_id="event-1",
    )

    assert result == {"id": "event-1", "feedback_sentiment": 1}
    assert captured["name"] == "agent-sessions"
    assert captured["method"] == "POST"
    assert captured["params"] == {"action": "update_feedback"}
    assert captured["timeout"] == 10.0
    assert captured["extra_headers"] == {"X-Internal-Secret": "secret-1"}
    assert captured["json_body"] == {
        "user_id": "user-1",
        "agent_id": "research_agent",
        "session_id": "session-1",
        "message_event_id": "event-1",
        "client_event_id": "turn-1:assistant_message",
        "turn_id": "turn-1",
        "sentiment": 1,
        "reason": "useful",
        "feedback_payload": {"target_id": "research:session-1:message-1"},
    }


@pytest.mark.asyncio
async def test_update_agent_message_feedback_returns_none_on_edge_failure(monkeypatch):
    """Failed edge function calls degrade to None."""
    from app.shared import agent_runtime_feedback as feedback_module

    agent_runtime_feedback = importlib.reload(feedback_module)

    service = type(
        "Service",
        (),
        {
            "call_function": AsyncMock(
                return_value={
                    "status_code": 404,
                    "data": {"success": False, "error": "assistant_message not found"},
                    "text": "not found",
                }
            )
        },
    )()
    monkeypatch.setattr(agent_runtime_feedback, "get_insforge_service", lambda: service)
    monkeypatch.setattr(agent_runtime_feedback, "EDGE_FUNCTION_SECRET", None)

    result = await agent_runtime_feedback.update_agent_message_feedback(
        user_id="user-1",
        agent_id="research_agent",
        session_id="missing-session",
        sentiment=-1,
        message_event_id="missing-event",
    )

    assert result is None
