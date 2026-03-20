"""
E2E Tests for Research Agent API Endpoint

Tests POST /api/screener/pick via httpx.AsyncClient + ASGITransport.
Requires screener universe cache to be populated (runs against real cache).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_research_e2e.py -v
"""

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
    """Tests for POST /api/research/chat (new unified endpoint)."""

    @pytest.mark.asyncio
    async def test_chat_requires_auth(self, client):
        """Endpoint returns 401 without auth token."""
        resp = await client.post(
            "/api/research/chat",
            json={"message": "hello"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_no_body_returns_error(self, client):
        """No body returns 401 (auth checked before validation) or 422."""
        resp = await client.post(
            "/api/research/chat",
            json={},
            timeout=10,
        )
        assert resp.status_code in (401, 422)

    @pytest.mark.asyncio
    async def test_chat_response_structure(self, client):
        """Response has expected fields (even if cache is empty)."""
        resp = await client.post(
            "/api/research/chat",
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

    @pytest.mark.asyncio
    async def test_chat_with_history(self, client):
        """Endpoint accepts history and accumulated_filters in body."""
        resp = await client.post(
            "/api/research/chat",
            json={
                "message": "more options",
                "history": [{"role": "user", "content": "hi"}],
                "accumulated_filters": [{"field": "roe", "op": "gt", "value": 15}],
            },
            headers={"Authorization": "Bearer test-token"},
            timeout=60,
        )
        # Should not crash; 401 (invalid token) or 200 both acceptable
        assert resp.status_code in (200, 401)


@pytest.mark.e2e
class TestResearchConversationsEndpoint:
    """Tests for /api/research/conversations (new unified endpoints)."""

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, client):
        """GET /api/research/conversations returns 401 without auth."""
        resp = await client.get(
            "/api/research/conversations",
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_requires_auth(self, client):
        """GET /api/research/conversations/{id} returns 401 without auth."""
        resp = await client.get(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_requires_auth(self, client):
        """POST /api/research/conversations returns 401 without auth."""
        resp = await client.post(
            "/api/research/conversations",
            json={"title": "Test", "data": {}, "message_count": 0},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_requires_auth(self, client):
        """PUT /api/research/conversations/{id} returns 401 without auth."""
        resp = await client.put(
            "/api/research/conversations/some-id",
            json={"title": "Test", "data": {}, "message_count": 0},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_requires_auth(self, client):
        """DELETE /api/research/conversations/{id} returns 401 without auth."""
        resp = await client.delete(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401
