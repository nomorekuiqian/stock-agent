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
    async def test_new_user_gets_unbound_token(self, mock_c2s, mock_db):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import login_with_code
        from app.features.wechat.jwt_utils import decode_wechat_jwt

        mock_c2s.return_value = {"openid": "o_new", "session_key": "sk_1"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {"openid": "o_new", "insforge_user_id": None, "email_verified_at": None},
        })

        result = await login_with_code("code_new")
        assert result["account_state"] == "unbound"
        assert result["token"] is not None
        assert decode_wechat_jwt(result["token"])["typ"] == "wechat_unbound"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_email_only_user_gets_email_only_token(self, mock_c2s, mock_db):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import login_with_code
        from app.features.wechat.jwt_utils import decode_wechat_jwt

        mock_c2s.return_value = {"openid": "o_eo", "session_key": "sk_2"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {
                "id": "wechat-row-uuid-001",
                "openid": "o_eo",
                "insforge_user_id": None,
                "email_verified_at": "2026-04-12T00:00:00Z",
            },
        })

        result = await login_with_code("code_eo")
        assert result["account_state"] == "email_only"
        payload = decode_wechat_jwt(result["token"])
        assert payload["typ"] == "wechat_email_only"
        assert payload["sub"] == "wechat-row-uuid-001"
        assert payload["openid"] == "o_eo"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_bound_user_gets_bound_token(self, mock_c2s, mock_db):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import login_with_code
        from app.features.wechat.jwt_utils import decode_wechat_jwt

        mock_c2s.return_value = {"openid": "o_b", "session_key": "sk_3"}
        mock_db.upsert_wechat_user = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True,
            "data": {"openid": "o_b", "insforge_user_id": "uid_insforge_123"},
        })

        result = await login_with_code("code_b")
        assert result["account_state"] == "bound"
        payload = decode_wechat_jwt(result["token"])
        assert payload["typ"] == "wechat_bound"
        assert payload["sub"] == "uid_insforge_123"
        assert payload["openid"] == "o_b"

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


# ---------------------------------------------------------------------------
# TestJwtUtils
# ---------------------------------------------------------------------------

import os, time

class TestJwtUtils:

    def setup_method(self):
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")

    def test_sign_and_decode_wechat_bound(self):
        from app.features.wechat.jwt_utils import sign_wechat_jwt, decode_wechat_jwt

        token = sign_wechat_jwt(sub="user-uuid-123", typ="wechat_bound", exp_days=7)
        assert isinstance(token, str)

        payload = decode_wechat_jwt(token)
        assert payload["sub"] == "user-uuid-123"
        assert payload["typ"] == "wechat_bound"

    def test_sign_includes_openid_claim(self):
        from app.features.wechat.jwt_utils import sign_wechat_jwt, decode_wechat_jwt

        token = sign_wechat_jwt(sub="wechat-row-id", typ="wechat_email_only", exp_days=7, openid="o_abc")
        payload = decode_wechat_jwt(token)
        assert payload["openid"] == "o_abc"
        assert payload["sub"] == "wechat-row-id"

    def test_decode_invalid_raises(self):
        from app.features.wechat.jwt_utils import decode_wechat_jwt
        with pytest.raises(Exception):
            decode_wechat_jwt("not.a.valid.token")

    def test_wrong_typ_value_rejected_by_sign(self):
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        with pytest.raises(ValueError):
            sign_wechat_jwt(sub="x", typ="invalid_type", exp_days=1)


# ---------------------------------------------------------------------------
# TestOtpToken
# ---------------------------------------------------------------------------

class TestOtpToken:

    def setup_method(self):
        os.environ["WECHAT_JWT_SECRET"] = "test_secret_32_chars_padding_xxx"
        # Clear used tokens between tests
        try:
            from app.features.wechat import jwt_utils
            jwt_utils._used_otp_tokens.clear()
        except Exception:
            pass

    def test_generate_and_verify_roundtrip(self):
        from app.features.wechat.jwt_utils import generate_otp_token, verify_otp_token

        token = generate_otp_token(email="u@test.com", openid="o_1", action="bind_existing")
        result = verify_otp_token(token)
        assert result["valid"] is True
        assert result["email"] == "u@test.com"
        assert result["openid"] == "o_1"
        assert result["action"] == "bind_existing"

    def test_tampered_token_invalid(self):
        from app.features.wechat.jwt_utils import generate_otp_token, verify_otp_token

        token = generate_otp_token(email="u@test.com", openid="o_1", action="bind_existing")
        result = verify_otp_token(token + "TAMPER")
        assert result["valid"] is False
        assert result["reason"] == "invalid"

    def test_replay_rejected(self):
        from app.features.wechat.jwt_utils import generate_otp_token, verify_otp_token, mark_otp_used

        token = generate_otp_token(email="u@test.com", openid="o_1", action="bind_existing")
        mark_otp_used(token)

        result = verify_otp_token(token)
        assert result["valid"] is False
        assert result["reason"] == "already_used"

    def test_expired_token_rejected(self):
        from unittest.mock import patch
        from app.features.wechat.jwt_utils import verify_otp_token, _get_signer

        signer = _get_signer()
        token = signer.dumps({"email": "e@test.com", "openid": "o_x", "action": "bind_existing"})

        with patch("app.features.wechat.jwt_utils._OTP_MAX_AGE", -1):
            time.sleep(0.01)
            result = verify_otp_token(token)

        assert result["valid"] is False
        assert result["reason"] == "expired"
