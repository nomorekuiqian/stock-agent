"""
Unit tests for WeChat Mini Program service and router.

Tests mock the WeChat API and database layer to verify:
- code2Session parsing
- Login flow (new user, existing bound user)
- Account binding flow
- Home cards response
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


# ---------------------------------------------------------------------------
# code2session
# ---------------------------------------------------------------------------

class TestCode2Session:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.httpx.AsyncClient")
    async def test_success(self, mock_client_cls):
        from app.features.wechat.service import code2session

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"openid": "o_test123", "session_key": "sk_abc"}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await code2session("test_code")
        assert result["openid"] == "o_test123"
        assert result["session_key"] == "sk_abc"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.httpx.AsyncClient")
    async def test_invalid_code(self, mock_client_cls):
        from app.features.wechat.service import code2session

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"errcode": 40029, "errmsg": "invalid code"}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await code2session("bad_code")
        assert "error" in result
        assert result["errcode"] == 40029


# ---------------------------------------------------------------------------
# login_with_code
# ---------------------------------------------------------------------------

class TestLoginWithCode:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_new_user_not_bound(self, mock_c2s, mock_db):
        from app.features.wechat.service import login_with_code

        mock_c2s.return_value = {"openid": "o_new", "session_key": "sk_1"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={"success": True, "data": {"openid": "o_new", "user_id": None}})

        result = await login_with_code("code_new")
        assert result["success"] is True
        assert result["is_bound"] is False
        assert result["openid"] == "o_new"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_existing_bound_user(self, mock_c2s, mock_db):
        from app.features.wechat.service import login_with_code

        mock_c2s.return_value = {"openid": "o_bound", "session_key": "sk_2"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {"openid": "o_bound", "user_id": "uid_123"},
        })

        result = await login_with_code("code_bound")
        assert result["success"] is True
        assert result["is_bound"] is True
        assert result["user_id"] == "uid_123"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.code2session")
    async def test_code2session_error(self, mock_c2s):
        from app.features.wechat.service import login_with_code

        mock_c2s.return_value = {"error": "invalid code", "errcode": 40029}

        result = await login_with_code("bad_code")
        assert result["success"] is False
        assert "invalid code" in result["error"]


# ---------------------------------------------------------------------------
# bind_account
# ---------------------------------------------------------------------------

class TestBindAccount:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.httpx.AsyncClient")
    async def test_bind_success(self, mock_client_cls, mock_db):
        from app.features.wechat.service import bind_account

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "access_token": "jwt_token_123",
            "user": {"id": "uid_456"},
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        mock_db.bind_user = AsyncMock(return_value={"success": True})

        result = await bind_account("o_test", "user@test.com", "password123")
        assert result["success"] is True
        assert result["token"] == "jwt_token_123"
        assert result["user_id"] == "uid_456"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.httpx.AsyncClient")
    async def test_bind_wrong_password(self, mock_client_cls):
        from app.features.wechat.service import bind_account

        mock_resp = MagicMock()
        mock_resp.status_code = 401

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await bind_account("o_test", "user@test.com", "wrong")
        assert result["success"] is False
        assert "Invalid email or password" in result["error"]


# ---------------------------------------------------------------------------
# Home cards
# ---------------------------------------------------------------------------

class TestHomeCards:

    def test_home_cards_list(self):
        from app.features.wechat.router import HOME_CARDS
        assert len(HOME_CARDS) >= 3
        ids = [c.id for c in HOME_CARDS]
        assert "today" in ids
        assert "morning" in ids
        assert "for-you" in ids

    def test_home_cards_ordered(self):
        from app.features.wechat.router import HOME_CARDS
        orders = [c.order for c in HOME_CARDS]
        assert orders == sorted(orders)
