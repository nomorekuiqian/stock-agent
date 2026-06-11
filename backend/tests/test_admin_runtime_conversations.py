from app.features.admin.crm_router import (
    _runtime_conversation_payload,
    _split_runtime_conversation_id,
)


def test_split_runtime_conversation_id_requires_agent_prefix():
    assert _split_runtime_conversation_id("research_agent:session-1") == (
        "research_agent",
        "session-1",
    )
    assert _split_runtime_conversation_id("session-1") == (None, None)


def test_runtime_conversation_payload_uses_visible_runtime_messages():
    payload = {
        "session": {
            "metadata": {"agent_kind": "research", "title": "Runtime title"},
            "created_at": "2026-06-11T01:00:00Z",
            "updated_at": "2026-06-11T01:00:05Z",
        },
        "events": [
            {
                "event_type": "user_message",
                "role": "user",
                "content": "hello",
                "created_at": "2026-06-11T01:00:01Z",
                "turn_id": "turn-1",
            },
            {
                "event_type": "context_snapshot",
                "role": "system",
                "content": "internal context",
                "created_at": "2026-06-11T01:00:02Z",
            },
            {
                "event_type": "assistant_message",
                "role": "assistant",
                "content": "answer",
                "created_at": "2026-06-11T01:00:03Z",
                "turn_id": "turn-1",
            },
            {
                "event_type": "error",
                "role": "system",
                "content": "tool failed",
                "created_at": "2026-06-11T01:00:04Z",
            },
        ],
    }

    conversation = _runtime_conversation_payload(
        user_id="user-1",
        agent_id="research_agent",
        session_id="session-1",
        payload=payload,
    )

    assert conversation["id"] == "research_agent:session-1"
    assert conversation["title"] == "Runtime title"
    assert conversation["message_count"] == 2
    assert [m["role"] for m in conversation["data"]["messages"]] == [
        "user",
        "assistant",
        "system",
    ]
    assert [m["content"] for m in conversation["data"]["messages"]] == [
        "hello",
        "answer",
        "tool failed",
    ]
