"""Offline checks for provider migration, billing and model retry behavior."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from google.genai import errors, types

from app.core.ai_models import GENERATIVE_MODEL
from app.shared.llm_clients import gemini
from app.shared.llm_pricing import estimate_usd


def fake_client(monkeypatch, results):
    calls = []

    class Client:
        def __init__(self, **kwargs):
            self.aio = self
            self.models = self
            self.options = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def generate_content(self, **kwargs):
            calls.append(kwargs)
            result = results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

    monkeypatch.setattr(gemini.genai, "Client", Client)
    monkeypatch.setattr(gemini, "GOOGLE_API_KEY", "unit-key")
    monkeypatch.setattr(gemini.asyncio, "sleep", AsyncMock())
    return calls


def response():
    return SimpleNamespace(text='{"answer":"ok"}', usage_metadata=SimpleNamespace(
        prompt_token_count=100, candidates_token_count=20,
        cached_content_token_count=40, thoughts_token_count=30, total_token_count=150,
    ))


async def generate(**kwargs):
    return await gemini.create_chat_completion(
        model=GENERATIVE_MODEL,
        messages=[{"role": "system", "content": "JSON only"},
                  {"role": "user", "content": "test"},
                  {"role": "assistant", "content": "{}"},
                  {"role": "user", "content": "repair"}],
        max_tokens=2400, temperature=0.2,
        response_format={"type": "json_object"}, **kwargs,
    )


@pytest.mark.asyncio
async def test_native_gemini_schema_repair_roles_and_full_usage(monkeypatch):
    calls = fake_client(monkeypatch, [response()])
    result = await generate()
    assert calls[0]["model"] == "gemini-3.8-flash"
    assert [c.role for c in calls[0]["contents"]] == ["user", "model", "user"]
    config = calls[0]["config"]
    assert config.system_instruction == "JSON only"
    assert config.thinking_config.thinking_level == types.ThinkingLevel.LOW
    assert config.response_mime_type == "application/json"
    assert result["usage"] == dict(prompt_tokens=100, completion_tokens=20,
                                   cached_tokens=40, thoughts_tokens=30, total_tokens=150)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [
    errors.ServerError(503, {"error": {"message": "busy"}}),
    errors.ClientError(429, {"error": {"message": "rate limit"}}),
    httpx.ConnectError("temporary connection failure"),
])
async def test_native_retryable_failures(monkeypatch, failure):
    calls = fake_client(monkeypatch, [failure, response()])
    assert (await generate())["choices"][0]["message"]["content"]
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_native_bad_request_is_not_retried(monkeypatch):
    calls = fake_client(monkeypatch, [errors.ClientError(400, {"error": {"message": "bad schema"}})])
    with pytest.raises(errors.ClientError):
        await generate()
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_native_retry_cap(monkeypatch):
    calls = fake_client(monkeypatch, [errors.ServerError(503, {}) for _ in range(3)])
    with pytest.raises(errors.ServerError):
        await generate(retries=2)
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_stock_overload_keeps_model_and_retries_once(monkeypatch):
    from app.features.stock.agent import _base

    run = AsyncMock(side_effect=[errors.ServerError(503, {}), {"answer": "ok"}])
    monkeypatch.setattr(_base, "_run_single_session", run)
    runner = SimpleNamespace(agent=SimpleNamespace(model=GENERATIVE_MODEL))
    assert await _base.run_agent_session(runner, "test", "prompt", "output") == {"answer": "ok"}
    assert runner.agent.model == GENERATIVE_MODEL
    assert run.await_count == 2


@pytest.mark.parametrize("day,multiplier", [("2026-12-31", 1), ("2027-01-01", 2)])
def test_pricing_includes_thinking_and_discounts_only_cached_input(day, multiplier):
    # 1M input contains 0.2M cached input, plus 0.1M answer and 0.3M thoughts.
    value = estimate_usd(GENERATIVE_MODEL, 1_000_000, 100_000,
                         thoughts_tokens=300_000, cached_tokens=200_000, usage_day=day)
    assert value == pytest.approx((0.8 * 0.75 + 0.2 * 0.075 + 0.4 * 3.75) * multiplier)


def test_monitor_uses_current_model_and_cache_namespace():
    from app.core.config import WATCHLIST_MONITOR_LLM_MODEL, WATCHLIST_MONITOR_MODEL_VERSION

    assert WATCHLIST_MONITOR_LLM_MODEL == GENERATIVE_MODEL
    assert WATCHLIST_MONITOR_MODEL_VERSION == "watchlist-monitor-v2-gemini-3.8-flash"
