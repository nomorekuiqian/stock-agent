"""
Shared LLM client unit tests.

Tests provider-neutral structured JSON generation and LLM metering helpers.
No network access; provider calls and persistence are mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_llm_clients_unit.py -v
"""

from pydantic import BaseModel
import pytest

from app.shared import llm_metering
from app.shared.llm_clients import structured


class _StructuredSample(BaseModel):
    answer: str


@pytest.mark.asyncio
async def test_generate_structured_json_retries_invalid_json_and_records_usage(monkeypatch):
    calls = []
    usage_records = []
    responses = [
        {
            "choices": [{"message": {"content": "not json"}}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 1,
                "prompt_cache_hit_tokens": 2,
                "prompt_cache_miss_tokens": 8,
                "total_tokens": 11,
            },
        },
        {
            "choices": [{"message": {"content": '{"answer":"ok"}'}}],
            "usage": {
                "prompt_tokens": 12,
                "completion_tokens": 3,
                "prompt_cache_hit_tokens": 4,
                "prompt_cache_miss_tokens": 8,
                "total_tokens": 15,
            },
        },
    ]

    async def fake_create_chat_completion(**kwargs):
        calls.append(kwargs)
        return responses.pop(0)

    def fake_record_usage(**kwargs):
        usage_records.append(kwargs)

    monkeypatch.setattr(structured, "create_chat_completion", fake_create_chat_completion)
    monkeypatch.setattr(structured, "record_usage", fake_record_usage)

    parsed = await structured.generate_structured_json(
        feature="watchlist_monitor.test",
        agent_name="unit_test_agent",
        model="deepseek-test",
        system_prompt="Return an answer.",
        user_payload={"symbol": "AAPL"},
        output_model=_StructuredSample,
        max_tokens=200,
        retries=1,
        temperature=0.1,
    )

    assert parsed.answer == "ok"
    assert len(calls) == 2
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert calls[0]["messages"][0]["role"] == "system"
    assert "Return only one valid json object" in calls[0]["messages"][0]["content"]
    assert "failed validation" in calls[1]["messages"][-1]["content"]
    assert [record["extra"]["outcome"] for record in usage_records] == [
        "invalid_json",
        "ok",
    ]
    assert usage_records[1]["prompt_tokens"] == 12
    assert usage_records[1]["output_tokens"] == 3
    assert usage_records[1]["cached_tokens"] == 4


def test_record_usage_builds_provider_neutral_record(monkeypatch):
    persisted_records = []
    scheduled = []

    def fake_persist(record):
        persisted_records.append(record)
        return "fake-coro"

    def fake_fire_and_forget(coro):
        scheduled.append(coro)

    monkeypatch.setattr(llm_metering, "_persist", fake_persist)
    monkeypatch.setattr(llm_metering, "_fire_and_forget", fake_fire_and_forget)

    llm_metering.record_usage(
        feature="watchlist_monitor.final_brief",
        agent_name="brief_agent",
        model="deepseek-v4-pro",
        prompt_tokens="10",
        output_tokens="bad",
        cached_tokens=3.0,
        thoughts_tokens=None,
        total_tokens=13,
        extra={"provider": "deepseek"},
    )

    assert scheduled == ["fake-coro"]
    assert len(persisted_records) == 1
    record = persisted_records[0]
    assert record["feature"] == "watchlist_monitor.final_brief"
    assert record["agent_name"] == "brief_agent"
    assert record["model"] == "deepseek-v4-pro"
    assert record["prompt_tokens"] == 10
    assert record["output_tokens"] is None
    assert record["cached_tokens"] == 3
    assert record["total_tokens"] == 13
    assert record["extra"] == {"provider": "deepseek"}


@pytest.mark.asyncio
async def test_meter_callback_delegates_adk_usage_to_record_usage(monkeypatch):
    records = []

    class _Usage:
        prompt_token_count = 11
        candidates_token_count = 22
        cached_content_token_count = 3
        thoughts_token_count = 4
        total_token_count = 40

    class _Response:
        usage_metadata = _Usage()

    class _Context:
        agent_name = "adk_agent"

    monkeypatch.setattr(llm_metering, "record_usage", lambda **kwargs: records.append(kwargs))

    callback = llm_metering.meter(
        "twitter.ticker_discussion_summary",
        model="gemini-3.5-flash",
        extra={"surface": "monitor"},
    )

    assert await callback(_Context(), _Response()) is None
    assert records == [
        {
            "feature": "twitter.ticker_discussion_summary",
            "agent_name": "adk_agent",
            "model": "gemini-3.5-flash",
            "prompt_tokens": 11,
            "output_tokens": 22,
            "cached_tokens": 3,
            "thoughts_tokens": 4,
            "total_tokens": 40,
            "extra": {"surface": "monitor"},
        }
    ]
