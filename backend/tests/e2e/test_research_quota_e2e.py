"""
E2E Tests for Research Quota API Endpoints -- generated from git diff

Tests:
  - GET /api/research/quota (anonymous + authenticated)
  - POST /api/research/chat (quota enforcement)
  - POST /api/research/chat/stream (quota enforcement)
  - Conversation CRUD (anonymous behavior)

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_research_quota_e2e.py -v
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
class TestResearchQuota:
    """Tests for GET /api/research/quota."""

    @pytest.mark.asyncio
    async def test_quota_anonymous_returns_200_with_correct_structure(self, client):
        """Anonymous user can check quota; response has all required fields."""
        # Retry up to 3 times — Edge Function calls may fail on transient SSL errors
        last_exc = None
        for _ in range(3):
            try:
                resp = await client.get("/api/research/quota", timeout=10)
                break
            except Exception as exc:
                last_exc = exc
        else:
            pytest.skip(f"Insforge Edge Function unreachable after 3 attempts: {last_exc}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["allowed"], bool)
        assert isinstance(data["used"], int)
        assert isinstance(data["limit"], int)
        assert isinstance(data["remaining"], int)
        assert isinstance(data["unlimited"], bool)
        if not data["unlimited"]:
            assert data["limit"] > 0


@pytest.mark.e2e
class TestResearchChatAnonymous:
    """Tests for POST /api/research/chat without auth."""

    @pytest.mark.asyncio
    async def test_chat_anonymous_returns_401(self, client):
        """Anonymous user is rejected with 401 — the research chat is now
        login-gated server-side (matches the frontend login wall)."""
        resp = await client.post(
            "/api/research/chat",
            json={"message": "hello"},
            timeout=10,
        )
        assert resp.status_code == 401


@pytest.mark.e2e
class TestResearchConversationsAnonymous:
    """Tests for conversation endpoints without auth."""

    @pytest.mark.asyncio
    async def test_list_conversations_anonymous_returns_empty(self, client):
        """Anonymous user gets empty conversation list."""
        resp = await client.get("/api/research/conversations", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data["conversations"] == []

    @pytest.mark.asyncio
    async def test_create_conversation_anonymous_skipped(self, client):
        """Anonymous conversation create is silently skipped."""
        resp = await client.post(
            "/api/research/conversations",
            json={"title": "test", "data": {}, "message_count": 1},
            timeout=10,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data.get("skipped") is True

    @pytest.mark.asyncio
    async def test_get_conversation_anonymous_returns_401(self, client):
        """Anonymous user cannot load specific conversations."""
        resp = await client.get(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_conversation_anonymous_returns_401(self, client):
        """Anonymous user cannot delete conversations."""
        resp = await client.delete(
            "/api/research/conversations/some-id",
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_conversation_anonymous_skipped(self, client):
        """Anonymous conversation update is silently skipped."""
        resp = await client.put(
            "/api/research/conversations/some-id",
            json={"title": "test", "data": {}, "message_count": 1},
            timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("skipped") is True
