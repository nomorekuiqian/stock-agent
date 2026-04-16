"""
Unit tests for WeChat Mini Program service and router.

Tests mock the WeChat API and database layer to verify:
- code2Session parsing
- Login flow (new user, existing bound user)
- OTP send/verify flow
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

import os

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
# TestSendOtp
# ---------------------------------------------------------------------------

class TestSendOtp:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._lookup_insforge_user_by_email", new_callable=AsyncMock)
    @patch("app.features.wechat.service._send_otp_code_email", new_callable=AsyncMock)
    @patch("app.shared.otp_utils.generate_numeric_otp")
    async def test_send_otp_new_user(self, mock_gen, mock_email, mock_lookup):
        from app.features.wechat.service import send_otp
        mock_lookup.return_value = None
        mock_gen.return_value = "123456"
        result = await send_otp(openid="o_new", email="new@test.com")
        assert result["success"] is True
        assert result["action"] == "create_new"
        mock_gen.assert_called_once_with(email="new@test.com", action="create_new", openid="o_new")
        mock_email.assert_called_once_with(email="new@test.com", code="123456")

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._lookup_insforge_user_by_email", new_callable=AsyncMock)
    @patch("app.features.wechat.service._send_otp_code_email", new_callable=AsyncMock)
    @patch("app.shared.otp_utils.generate_numeric_otp")
    async def test_send_otp_existing_user(self, mock_gen, mock_email, mock_lookup):
        from app.features.wechat.service import send_otp
        mock_lookup.return_value = "insforge-uid-999"
        mock_gen.return_value = "654321"
        result = await send_otp(openid="o_existing", email="existing@test.com")
        assert result["success"] is True
        assert result["action"] == "bind_existing"
        mock_gen.assert_called_once_with(email="existing@test.com", action="bind_existing", openid="o_existing")


# ---------------------------------------------------------------------------
# TestVerifyOtp
# ---------------------------------------------------------------------------

class TestVerifyOtp:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.shared.otp_utils.verify_numeric_otp")
    async def test_verify_create_new(self, mock_verify, mock_db):
        import os; os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import verify_otp
        from app.features.wechat.jwt_utils import decode_wechat_jwt

        mock_verify.return_value = {
            "valid": True, "email": "new@test.com", "openid": "o_new", "action": "create_new"
        }
        mock_db.update_email_verified = AsyncMock(return_value={"success": True})
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True, "data": {"id": "row-uuid-001", "email": "new@test.com"}
        })

        result = await verify_otp(email="new@test.com", code="123456")
        assert result["success"] is True
        assert result["account_state"] == "email_only"
        payload = decode_wechat_jwt(result["token"])
        assert payload["typ"] == "wechat_email_only"
        assert payload["sub"] == "row-uuid-001"
        assert payload["openid"] == "o_new"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email", new_callable=AsyncMock)
    @patch("app.shared.otp_utils.verify_numeric_otp")
    async def test_verify_bind_existing(self, mock_verify, mock_lookup, mock_db):
        import os; os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import verify_otp
        from app.features.wechat.jwt_utils import decode_wechat_jwt

        mock_verify.return_value = {
            "valid": True, "email": "ex@test.com", "openid": "o_ex", "action": "bind_existing"
        }
        mock_lookup.return_value = "insforge-uid-555"
        mock_db.bind_insforge_user = AsyncMock(return_value={"success": True})

        result = await verify_otp(email="ex@test.com", code="654321")
        assert result["success"] is True
        assert result["account_state"] == "bound"
        payload = decode_wechat_jwt(result["token"])
        assert payload["typ"] == "wechat_bound"
        assert payload["sub"] == "insforge-uid-555"

    @pytest.mark.asyncio
    @patch("app.shared.otp_utils.verify_numeric_otp")
    async def test_verify_invalid_code(self, mock_verify):
        from app.features.wechat.service import verify_otp
        mock_verify.return_value = {"valid": False, "reason": "invalid_code"}
        result = await verify_otp(email="x@test.com", code="000000")
        assert result["success"] is False
        assert "错误" in result["error"]


# ---------------------------------------------------------------------------
# TestOtpRouter
# ---------------------------------------------------------------------------

class TestOtpRouter:

    def _make_unbound_token(self) -> str:
        import os; os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        return sign_wechat_jwt(sub="o_test", typ="wechat_unbound", exp_days=1)

    @pytest.mark.asyncio
    @patch("app.features.wechat.router.service.send_otp", new_callable=AsyncMock)
    async def test_otp_send_requires_wechat_token(self, mock_send):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post("/api/wechat/otp/send", json={"email": "x@x.com"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    @patch("app.features.wechat.router.service.send_otp", new_callable=AsyncMock)
    async def test_otp_send_accepts_unbound_token(self, mock_send):
        from fastapi.testclient import TestClient
        from app.main import app
        mock_send.return_value = {"success": True, "action": "create_new"}
        token = self._make_unbound_token()
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/otp/send",
            json={"email": "new@test.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "create_new"

    @pytest.mark.asyncio
    @patch("app.features.wechat.router.service.verify_otp", new_callable=AsyncMock)
    async def test_otp_verify_wrong_code_returns_400(self, mock_verify):
        from fastapi.testclient import TestClient
        from app.main import app
        mock_verify.return_value = {"success": False, "error": "验证码错误，请重试"}
        token = self._make_unbound_token()
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/otp/verify",
            json={"email": "x@test.com", "code": "000000"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# TestWechatMe
# ---------------------------------------------------------------------------

class TestWechatMe:

    def _make_email_only_token(self) -> str:
        import os; os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        return sign_wechat_jwt(sub="row-uuid-001", typ="wechat_email_only", exp_days=7, openid="o_test")

    @pytest.mark.asyncio
    @patch("app.features.wechat.router.db")
    async def test_me_returns_email_for_email_only(self, mock_db):
        from fastapi.testclient import TestClient
        from app.main import app
        mock_db.get_by_openid = AsyncMock(return_value={
            "success": True, "data": {"id": "row-uuid-001", "email": "user@test.com"}
        })
        token = self._make_email_only_token()
        client = TestClient(app)
        resp = client.get("/api/wechat/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["account_state"] == "email_only"
        assert data["email"] == "user@test.com"
