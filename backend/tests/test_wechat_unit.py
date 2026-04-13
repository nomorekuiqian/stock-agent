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


# ---------------------------------------------------------------------------
# TestVerifyUserTokenWechat
# ---------------------------------------------------------------------------

class TestVerifyUserTokenWechat:

    @pytest.mark.asyncio
    async def test_wechat_bound_accepted(self):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        from app.core.deps import verify_user_token

        token = sign_wechat_jwt(sub="insforge-uid-001", typ="wechat_bound", exp_days=7)
        user_id = await verify_user_token(authorization=f"Bearer {token}")
        assert user_id == "insforge-uid-001"

    @pytest.mark.asyncio
    async def test_wechat_email_only_accepted(self):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        from app.core.deps import verify_user_token

        token = sign_wechat_jwt(sub="wechat-row-uuid-002", typ="wechat_email_only", exp_days=7)
        user_id = await verify_user_token(authorization=f"Bearer {token}")
        assert user_id == "wechat-row-uuid-002"

    @pytest.mark.asyncio
    async def test_wechat_unbound_returns_403(self):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        from app.core.deps import verify_user_token
        from fastapi import HTTPException

        token = sign_wechat_jwt(sub="o_openid_xyz", typ="wechat_unbound", exp_days=1)
        with pytest.raises(HTTPException) as exc:
            await verify_user_token(authorization=f"Bearer {token}")
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_missing_auth_returns_401(self):
        from app.core.deps import verify_user_token
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await verify_user_token(authorization=None)
        assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# TestRegisterRequest
# ---------------------------------------------------------------------------

class TestRegisterRequest:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    @patch("app.features.wechat.service._send_otp_email")
    async def test_existing_user_sends_bind_email(self, mock_send, mock_lookup, mock_db):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_request

        mock_lookup.return_value = "uid_existing"
        mock_send.return_value = None

        result = await register_request(openid="o_test", email="user@example.com")
        assert result["success"] is True
        assert result["action"] == "bind_existing"
        mock_send.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    @patch("app.features.wechat.service._send_otp_email")
    async def test_new_email_sends_create_email(self, mock_send, mock_lookup, mock_db):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_request

        mock_lookup.return_value = None
        mock_send.return_value = None

        result = await register_request(openid="o_new", email="new@example.com")
        assert result["success"] is True
        assert result["action"] == "create_new"


# ---------------------------------------------------------------------------
# TestRegisterConfirm
# ---------------------------------------------------------------------------

class TestRegisterConfirm:

    def setup_method(self):
        import os
        os.environ["WECHAT_JWT_SECRET"] = "test_secret_32_chars_padding_xxx"
        from app.features.wechat import jwt_utils
        jwt_utils._used_otp_tokens.clear()

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_valid_bind_token_returns_bound_state(self, mock_lookup, mock_db):
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token

        token = generate_otp_token(email="u@test.com", openid="o_test", action="bind_existing")
        mock_lookup.return_value = "uid_abc"
        mock_db.bind_insforge_user = AsyncMock(return_value={"success": True})

        result = await register_confirm(otp_token=token)
        assert result["success"] is True
        assert result["account_state"] == "bound"

    @pytest.mark.asyncio
    async def test_invalid_token_returns_error(self):
        from app.features.wechat.service import register_confirm

        result = await register_confirm(otp_token="not.a.valid.token")
        assert result["success"] is False
        assert result.get("error") is not None

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_replay_rejected(self, mock_lookup, mock_db):
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token

        token = generate_otp_token(email="u@test.com", openid="o_test", action="bind_existing")
        mock_lookup.return_value = "uid_abc"
        mock_db.bind_insforge_user = AsyncMock(return_value={"success": True})

        r1 = await register_confirm(otp_token=token)
        assert r1["success"] is True
        r2 = await register_confirm(otp_token=token)
        assert r2["success"] is False

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    async def test_create_new_updates_email_verified(self, mock_db):
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token

        token = generate_otp_token(email="new@test.com", openid="o_new", action="create_new")
        mock_db.update_email_verified = AsyncMock(return_value={"success": True})

        result = await register_confirm(otp_token=token)
        assert result["success"] is True
        assert result["account_state"] == "email_only"
        mock_db.update_email_verified.assert_called_once_with(openid="o_new", email="new@test.com")


# ---------------------------------------------------------------------------
# TestRegisterService — additional service-level tests
# ---------------------------------------------------------------------------

class TestRegisterService:

    def setup_method(self):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        try:
            from app.features.wechat import jwt_utils
            jwt_utils._used_otp_tokens.clear()
        except Exception:
            pass

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._send_otp_email")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_request_new_user(self, mock_lookup, mock_email):
        """新邮箱 → action=create_new，发一封邮件。"""
        from app.features.wechat.service import register_request

        mock_lookup.return_value = None
        mock_email.return_value = None

        result = await register_request(openid="o_new", email="new@example.com")

        assert result["success"] is True
        assert result["action"] == "create_new"
        mock_email.assert_called_once()
        _args, kwargs = mock_email.call_args
        assert kwargs.get("email") == "new@example.com"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._send_otp_email")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_request_existing_user(self, mock_lookup, mock_email):
        """已有 Insforge 账号 → action=bind_existing。"""
        from app.features.wechat.service import register_request

        mock_lookup.return_value = "uid_existing_123"
        mock_email.return_value = None

        result = await register_request(openid="o_ex", email="existing@example.com")

        assert result["success"] is True
        assert result["action"] == "bind_existing"
        mock_email.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_confirm_create_new(self, mock_lookup, mock_db):
        """有效 create_new token → update_email_verified 被调用。"""
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token

        token = generate_otp_token(email="new@example.com", openid="o_cn", action="create_new")
        mock_db.update_email_verified = AsyncMock(return_value={"success": True})

        result = await register_confirm(otp_token=token)

        assert result["success"] is True
        assert result["account_state"] == "email_only"
        mock_db.update_email_verified.assert_called_once_with(
            openid="o_cn", email="new@example.com"
        )

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_confirm_bind_existing(self, mock_lookup, mock_db):
        """有效 bind_existing token → bind_insforge_user 被调用。"""
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token

        token = generate_otp_token(email="ex@example.com", openid="o_be", action="bind_existing")
        mock_lookup.return_value = "uid_insforge_456"
        mock_db.bind_insforge_user = AsyncMock(return_value={"success": True})

        result = await register_confirm(otp_token=token)

        assert result["success"] is True
        assert result["account_state"] == "bound"
        mock_db.bind_insforge_user.assert_called_once_with(
            openid="o_be", insforge_user_id="uid_insforge_456"
        )

    @pytest.mark.asyncio
    async def test_register_confirm_expired_token(self):
        """过期 token → success=False, error 含 "过期"。"""
        from app.features.wechat.service import register_confirm

        with patch("app.features.wechat.service.verify_otp_token") as mock_verify:
            mock_verify.return_value = {"valid": False, "reason": "expired"}
            result = await register_confirm(otp_token="fake.expired.token")

        assert result["success"] is False
        assert "过期" in result["error"]

    @pytest.mark.asyncio
    async def test_register_confirm_already_used_token(self):
        """已使用 token → success=False, error 含 "已使用"。"""
        from app.features.wechat.service import register_confirm

        with patch("app.features.wechat.service.verify_otp_token") as mock_verify:
            mock_verify.return_value = {"valid": False, "reason": "already_used"}
            result = await register_confirm(otp_token="fake.used.token")

        assert result["success"] is False
        assert "已使用" in result["error"]


# ---------------------------------------------------------------------------
# TestRegisterRouter — HTTP endpoint tests
# ---------------------------------------------------------------------------

class TestRegisterRouter:

    def setup_method(self):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")

    def _make_wechat_jwt(self, typ="wechat_unbound", openid="o_test"):
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        return sign_wechat_jwt(sub=openid, typ=typ, exp_days=1)

    def test_register_request_requires_auth(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post("/api/wechat/register/request", json={"email": "a@b.com"})
        assert resp.status_code == 401

    @patch("app.features.wechat.router.service.register_request")
    def test_register_request_success(self, mock_svc):
        mock_svc.return_value = {"success": True, "action": "create_new"}

        from fastapi.testclient import TestClient
        from app.main import app
        token = self._make_wechat_jwt()
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/request",
            json={"email": "new@example.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "create_new"

    @patch("app.features.wechat.router.service.register_confirm")
    def test_register_confirm_success(self, mock_svc):
        mock_svc.return_value = {"success": True, "account_state": "email_only"}

        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/confirm",
            json={"otp_token": "valid.token"},
        )
        assert resp.status_code == 200
        assert resp.json()["account_state"] == "email_only"

    @patch("app.features.wechat.router.service.register_confirm")
    def test_register_confirm_error_returns_400(self, mock_svc):
        mock_svc.return_value = {"success": False, "error": "验证链接已过期，请重新发送"}

        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/confirm",
            json={"otp_token": "expired.token"},
        )
        assert resp.status_code == 400
        assert "过期" in resp.json()["detail"]
