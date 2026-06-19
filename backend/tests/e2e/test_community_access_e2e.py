"""E2E tests for community access API endpoints."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.deps import verify_admin_user
from app.features.community_access.router import _require_panda_access
from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.e2e
class TestCommunityPandaEndpoints:
    """Tests for Panda community facade endpoints."""

    @pytest.mark.asyncio
    async def test_panda_conversations_list_returns_filtered_shape(self, client, monkeypatch):
        async def allow_panda_access():
            return {"user_id": "u1", "email": "member@example.com"}

        async def fake_list_conversations(*_args, **_kwargs):
            return {
                "items": [
                    {"id": "p1", "title": "Panda", "persona_username": "pandacircle"},
                    {"id": "other", "title": "Other", "persona_username": "qinbafrank"},
                ]
            }

        app.dependency_overrides[_require_panda_access] = allow_panda_access
        monkeypatch.setattr(
            "app.features.community_access.router.list_conversations",
            fake_list_conversations,
        )

        resp = await client.get("/api/community/panda/conversations", timeout=10)

        assert resp.status_code == 200
        data = resp.json()
        assert data["conversations"] == [
            {"id": "p1", "title": "Panda", "persona_username": "pandacircle"}
        ]
        assert data["has_more"] is False

    @pytest.mark.asyncio
    async def test_panda_conversation_create_stamps_partner_metadata(self, client, monkeypatch):
        async def allow_panda_access():
            return {"user_id": "u1", "email": "member@example.com"}

        captured: dict[str, object] = {}

        async def fake_create_conversation(**kwargs):
            captured.update(kwargs)
            return {"id": kwargs["conversation_id"], "title": kwargs["title"]}

        async def fake_sync(*_args, **_kwargs):
            return None

        app.dependency_overrides[_require_panda_access] = allow_panda_access
        monkeypatch.setattr(
            "app.features.community_access.router.create_conversation",
            fake_create_conversation,
        )
        monkeypatch.setattr(
            "app.features.community_access.router._sync_panda_runtime_ui_state",
            fake_sync,
        )

        resp = await client.post(
            "/api/community/panda/conversations",
            json={"id": "c1", "title": "Panda chat", "data": {}, "message_count": 1},
            timeout=10,
        )

        assert resp.status_code == 201
        assert resp.json()["id"] == "c1"
        assert captured["data"] == {
            "agent_kind": "kol_research",
            "persona_username": "pandacircle",
            "partner_id": "panda",
        }


@pytest.mark.e2e
class TestAdminPandaGrantEndpoints:
    """Tests for Admin Panda grant endpoints."""

    @pytest.mark.asyncio
    async def test_admin_panda_grants_dry_run_response_shape(self, client, monkeypatch):
        async def allow_admin():
            return {"user_id": "admin-1", "email": "admin@example.com"}

        async def fake_get_grant_by_email(*_args, **_kwargs):
            return None

        app.dependency_overrides[verify_admin_user] = allow_admin
        monkeypatch.setattr(
            "app.features.community_access.router.db.get_grant_by_email",
            fake_get_grant_by_email,
        )

        resp = await client.post(
            "/api/admin/community/panda/grants/dry-run",
            json={"emails_text": "Member@Example.com", "emails": ["not-an-email"]},
            timeout=10,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["partner_id"] == "panda"
        assert data["valid_count"] == 1
        assert data["to_create"] == ["member@example.com"]
        assert data["invalid"] == ["not-an-email"]
