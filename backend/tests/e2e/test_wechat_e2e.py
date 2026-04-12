"""
E2E tests for WeChat Mini Program endpoints.

Tests via httpx.AsyncClient + ASGITransport.
WeChat API calls are mocked since we can't get real codes in tests.

Usage:
    cd backend
    pytest tests/e2e/test_wechat_e2e.py -v
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
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
class TestWechatLoginEndpoint:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.code2session")
    @patch("app.features.wechat.service.db")
    async def test_login_new_user(self, mock_db, mock_c2s, client):
        mock_c2s.return_value = {"openid": "o_e2e_new", "session_key": "sk_e2e"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {"openid": "o_e2e_new", "user_id": None},
        })

        resp = await client.post("/api/wechat/login", json={"code": "test_code"}, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["is_bound"] is False
        assert data["openid"] == "o_e2e_new"

    @pytest.mark.asyncio
    async def test_login_missing_code(self, client):
        resp = await client.post("/api/wechat/login", json={}, timeout=10)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.code2session")
    @patch("app.features.wechat.service.db")
    async def test_login_bound_user(self, mock_db, mock_c2s, client):
        mock_c2s.return_value = {"openid": "o_e2e_bound", "session_key": "sk_e2e2"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {"openid": "o_e2e_bound", "user_id": "uid_bound"},
        })

        resp = await client.post("/api/wechat/login", json={"code": "bound_code"}, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["is_bound"] is True


@pytest.mark.e2e
class TestWechatBindEndpoint:

    @pytest.mark.asyncio
    async def test_bind_missing_fields(self, client):
        resp = await client.post("/api/wechat/bind", json={"openid": "o_test"}, timeout=10)
        assert resp.status_code == 422


@pytest.mark.e2e
class TestHomeCardsEndpoint:

    @pytest.mark.asyncio
    async def test_returns_cards(self, client):
        resp = await client.get("/api/wechat/home-cards", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["cards"]) >= 3

    @pytest.mark.asyncio
    async def test_cards_have_required_fields(self, client):
        resp = await client.get("/api/wechat/home-cards", timeout=10)
        for card in resp.json()["cards"]:
            assert "id" in card
            assert "title" in card
            assert "url" in card
            assert "icon" in card
            assert "order" in card

    @pytest.mark.asyncio
    async def test_cards_are_ordered(self, client):
        resp = await client.get("/api/wechat/home-cards", timeout=10)
        orders = [c["order"] for c in resp.json()["cards"]]
        assert orders == sorted(orders)
