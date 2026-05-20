"""
E2E Tests for Research-KB Chat Endpoint -- generated from git diff

Covers:
  - POST /api/research-kb/chat (requires verify_user_token Bearer token)

Tests via httpx.AsyncClient + ASGITransport. The actual LlmAgent call is
mocked so the test doesn't depend on Google ADK / Gemini availability.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_research_kb_e2e.py -v
"""

import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.deps import verify_user_token
from app.features.research_kb.models import (
    ResearchKBResponse,
    RetrievedChunk,
)


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_override():
    """Bypass JWT verification by replacing the dependency."""
    app.dependency_overrides[verify_user_token] = lambda: "test-user-id"
    yield
    app.dependency_overrides.pop(verify_user_token, None)


@pytest.mark.e2e
class TestResearchKbChat:
    """Tests for POST /api/research-kb/chat."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        """Request without Authorization header returns 401."""
        resp = await client.post(
            "/api/research-kb/chat",
            json={"message": "hi"},
            timeout=30,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_success(self, client, auth_override):
        """Happy path: auth bypassed + agent mocked returns shaped response."""
        chunk = RetrievedChunk(
            content="片段",
            title="@qinbafrank tweet",
            source_type="kol_tweet",
            source_id="42",
            url=None,
            similarity=0.5,
        )
        fake_resp = ResearchKBResponse(answer="测试答复", chunks_used=[chunk])

        with patch(
            "app.features.research_kb.router.answer",
            new=AsyncMock(return_value=fake_resp),
        ) as mock_answer:
            resp = await client.post(
                "/api/research-kb/chat",
                json={"message": "qinbafrank 怎么看 AI？"},
                timeout=30,
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"] == "测试答复"
        assert len(body["chunks_used"]) == 1
        assert body["chunks_used"][0]["source_id"] == "42"
        assert body["chunks_used"][0]["similarity"] == pytest.approx(0.5)

        mock_answer.assert_awaited_once()
        call_args = mock_answer.await_args
        assert call_args.args[0] == "qinbafrank 怎么看 AI？"
        # second arg is parsed `history` (defaults to [])
        assert call_args.args[1] == []

    @pytest.mark.asyncio
    async def test_history_passed_through(self, client, auth_override):
        """History from the request is forwarded to answer()."""
        fake_resp = ResearchKBResponse(answer="ok", chunks_used=[])
        with patch(
            "app.features.research_kb.router.answer",
            new=AsyncMock(return_value=fake_resp),
        ) as mock_answer:
            await client.post(
                "/api/research-kb/chat",
                json={
                    "message": "继续",
                    "history": [
                        {"role": "user", "content": "之前的问题"},
                        {"role": "assistant", "content": "之前的回答"},
                    ],
                },
                timeout=30,
            )

        forwarded_history = mock_answer.await_args.args[1]
        assert len(forwarded_history) == 2
        assert forwarded_history[0].role == "user"
        assert forwarded_history[1].content == "之前的回答"

    @pytest.mark.asyncio
    async def test_missing_message_returns_422(self, client, auth_override):
        """Pydantic validation fails when `message` is missing."""
        resp = await client.post(
            "/api/research-kb/chat",
            json={"history": []},
            timeout=10,
        )
        assert resp.status_code == 422
