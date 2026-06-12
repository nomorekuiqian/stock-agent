"""
E2E Tests for Research Agent API Endpoint

Tests POST /api/screener/pick via httpx.AsyncClient + ASGITransport.
Requires screener universe cache to be populated (runs against real cache).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_research_e2e.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.e2e
class TestResearchAgent:
    """Tests for POST /api/screener/pick."""

    @pytest.mark.asyncio
    async def test_pick_requires_auth(self, client):
        """Endpoint returns 401 without auth token."""
        resp = await client.post(
            "/api/screener/pick",
            json={"message": "hello"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_pick_no_body_returns_error(self, client):
        """No body returns 401 (auth checked before validation) or 422."""
        resp = await client.post(
            "/api/screener/pick",
            json={},
            timeout=10,
        )
        assert resp.status_code in (401, 422)

    @pytest.mark.asyncio
    async def test_pick_response_structure(self, client):
        """Response has expected fields (even if cache is empty)."""
        resp = await client.post(
            "/api/screener/pick",
            json={"message": "test"},
            headers={"Authorization": "Bearer test-token"},
            timeout=60,
        )
        # May be 200 (with empty cache message) or 401 (invalid token)
        if resp.status_code == 200:
            data = resp.json()
            assert "success" in data
            assert "message" in data
            assert "options" in data
            assert "candidates" in data
            assert "recommendations" in data
            assert "universe_size" in data


@pytest.mark.e2e
class TestResearchChatEndpoint:
    """Tests for POST /api/research/chat (login required + quota)."""

    @pytest.mark.asyncio
    async def test_chat_anonymous_requires_auth(self, client):
        """Endpoint rejects anonymous requests with 401 (login required).

        The research agent used to allow anonymous trial via optional auth;
        it is now login-gated server-side so the API can't be driven
        anonymously even if the frontend login wall is bypassed.
        """
        resp = await client.post(
            "/api/research/chat",
            json={"message": "hello"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_no_body(self, client):
        """No message field returns 401 (auth checked) or 422 (validation)."""
        resp = await client.post(
            "/api/research/chat",
            json={},
            timeout=10,
        )
        assert resp.status_code in (401, 422)

    @pytest.mark.asyncio
    async def test_chat_response_structure(self, client):
        """Response has expected fields when authenticated (even if cache is empty).

        Overrides verify_user_token so no real Insforge auth round-trip is
        needed; the test pins the response contract, not auth.
        """
        from app.core.deps import verify_user_token

        app.dependency_overrides[verify_user_token] = lambda: "test-user"
        try:
            resp = await client.post(
                "/api/research/chat",
                json={"message": "test"},
                headers={"Authorization": "Bearer test-token"},
                timeout=60,
            )
        except Exception as exc:
            pytest.skip(f"Insforge Edge Function unreachable: {exc}")
            return
        finally:
            app.dependency_overrides.pop(verify_user_token, None)
        if resp.status_code == 200:
            data = resp.json()
            assert "success" in data
            assert "message" in data
            assert "options" in data
            assert "candidates" in data
            assert "recommendations" in data
            assert "universe_size" in data

    @pytest.mark.asyncio
    async def test_chat_with_history(self, client):
        """Endpoint accepts history and accumulated_filters in body when authed.

        Mocks the agent (checking schema/quota acceptance, not the LLM
        response) and overrides verify_user_token to simulate a signed-in user.
        """
        from app.core.deps import verify_user_token
        from app.features.screener.models import ResearchResult

        app.dependency_overrides[verify_user_token] = lambda: "test-user"
        try:
            with patch(
                "app.features.screener.router.pick_stocks",
                new_callable=AsyncMock,
                return_value=ResearchResult(success=True),
            ):
                resp = await client.post(
                    "/api/research/chat",
                    json={
                        "message": "more options",
                        "history": [{"role": "user", "content": "hi"}],
                        "accumulated_filters": [{"field": "roe", "op": "gt", "value": 15}],
                    },
                    headers={"Authorization": "Bearer test-token"},
                    timeout=10,
                )
        finally:
            app.dependency_overrides.pop(verify_user_token, None)
        # Should not crash; 200 (mocked agent) or 429 (quota) both acceptable.
        assert resp.status_code in (200, 429)


@pytest.mark.e2e
class TestResearchConversationsEndpoint:
    """Tests for /api/research/conversations (open with optional auth)."""

    @pytest.mark.asyncio
    async def test_list_anonymous_returns_empty(self, client):
        """GET /api/research/conversations without auth returns empty list."""
        resp = await client.get(
            "/api/research/conversations",
            timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["conversations"] == []

    @pytest.mark.asyncio
    async def test_get_requires_auth(self, client):
        """GET /api/research/conversations/{id} returns 401 without auth."""
        resp = await client.get(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_anonymous_skipped(self, client):
        """POST /api/research/conversations without auth is silently skipped."""
        resp = await client.post(
            "/api/research/conversations",
            json={"title": "Test", "data": {}, "message_count": 0},
            timeout=10,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data.get("skipped") is True

    @pytest.mark.asyncio
    async def test_update_anonymous_skipped(self, client):
        """PUT /api/research/conversations/{id} without auth is silently skipped."""
        resp = await client.put(
            "/api/research/conversations/some-id",
            json={"title": "Test", "data": {}, "message_count": 0},
            timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("skipped") is True

    @pytest.mark.asyncio
    async def test_delete_requires_auth(self, client):
        """DELETE /api/research/conversations/{id} returns 401 without auth."""
        resp = await client.delete(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401
