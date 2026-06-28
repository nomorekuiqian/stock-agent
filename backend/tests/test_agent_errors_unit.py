import asyncio

import pytest

from app.features.screener.research_agent import ResearchAgent
from app.shared.agent_errors import agent_error_message, classify_agent_error


def test_classifies_gemini_503_high_demand_as_provider_unavailable():
    err = RuntimeError(
        "503 UNAVAILABLE. {'error': {'message': 'This model is currently "
        "experiencing high demand. Please try again later.'}}"
    )

    assert classify_agent_error(err) == "provider_unavailable"
    assert "模型服务暂时繁忙" in agent_error_message("provider_unavailable")


def test_classifies_rate_limit_as_provider_unavailable():
    err = RuntimeError("429 RESOURCE_EXHAUSTED: rate limit exceeded")

    assert classify_agent_error(err) == "provider_unavailable"


def test_classifies_context_and_schema_errors():
    assert classify_agent_error(RuntimeError("input token context is too long")) == (
        "context_too_long"
    )
    assert classify_agent_error(RuntimeError("JSON schema validation failed")) == (
        "model_schema_error"
    )


def test_classifies_timeout_and_auth_errors():
    assert classify_agent_error(asyncio.TimeoutError()) == "agent_timeout"
    assert classify_agent_error(RuntimeError("403 PERMISSION_DENIED: bad API key")) == (
        "provider_auth_error"
    )


@pytest.mark.asyncio
async def test_research_stream_surfaces_provider_unavailable():
    class FakeSession:
        id = "session-provider-503"

    class FakeSessionService:
        async def create_session(self, **_kwargs):
            return FakeSession()

        async def get_session(self, **_kwargs):
            return None

        async def delete_session(self, **_kwargs):
            return None

    class FakeRunner:
        session_service = FakeSessionService()

        async def run_async(self, **_kwargs):
            raise RuntimeError(
                "503 UNAVAILABLE. This model is currently experiencing high demand. "
                "Please try again later."
            )
            yield None

    agent = object.__new__(ResearchAgent)
    agent.runner = FakeRunner()

    events = [event async for event in agent.run_stream("debug prompt")]

    assert events == [
        {
            "type": "error",
            "code": "provider_unavailable",
            "message": "模型服务暂时繁忙或限流，请稍后再试一次。",
        }
    ]
