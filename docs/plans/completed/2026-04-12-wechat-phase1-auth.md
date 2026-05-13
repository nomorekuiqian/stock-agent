# WeChat Phase 1 — itsdangerous 无状态 OTP 认证方案

> **替代计划**：废弃 `docs/superpowers/plans/2026-04-12-wechat-phase1-auth.md` 中的数据库 6 位码方案（Task 5-7 对应的 `wechat-register-codes` Edge Function + SQL 表 + db CRUD）。其余 Task（1-4, 8-10）结构保留，OTP 层全部换用 `itsdangerous URLSafeTimedSerializer`。

---

## Context

**问题**：原计划用数据库表 `wechat_register_codes` 存储 6 位 OTP 验证码，需要新建 Edge Function + SQL 表 + db.py CRUD helper，总计约 3 个 Task 的工作量。

**解法**：`itsdangerous 2.2.0`（已在 venv）可以把 `{email, openid, action}` 签入 HMAC token，token 携带时间戳，服务端无需存储任何状态。重放防御用 in-process dict（与 `deps.py` 的 `_token_cache` 同模式）。

**UX 变化**：邮件不再包含 6 位数字，改为一个点击链接。用户点链接 → 浏览器自动完成验证 → 返回小程序点"完成验证"按钮 → 小程序重新调 `wx.login()` → 后端从 DB 读更新后的账号状态，签发对应 JWT。

**消除内容（vs 原计划）**：
- ~~Task 5: wechat-register-codes Edge Function~~
- ~~Task 6: wechat_register_codes SQL 表~~
- ~~Task 7: OTP CRUD helpers in db.py~~
- ~~`_generate_otp()`, `upsert_otp_code`, `verify_otp_code`, `consume_otp_code`~~

**前置依赖（前端，不在本计划内）**：
- Next.js 新页面 `/wechat-verify?t=TOKEN`：自动调用 `/api/wechat/register/confirm`，展示成功/失败 UI，Phase 2 一起实现

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/core/config.py` | Modify | Add `WECHAT_JWT_SECRET` + `INSFORGE_SERVICE_KEY` |
| `backend/requirements.txt` | Modify | Ensure `itsdangerous` + `PyJWT` present |
| `backend/app/features/wechat/jwt_utils.py` | Create | JWT sign/decode + OTP generate/verify/replay-guard |
| `backend/app/features/wechat/service.py` | Modify | Three-state login; register_request/confirm with OTP token |
| `backend/app/features/wechat/models.py` | Modify | Add new request/response models |
| `backend/app/features/wechat/router.py` | Modify | Add register/request, register/confirm, me endpoints |
| `backend/app/features/wechat/db.py` | Modify | Add `update_email_verified` + `bind_insforge_user` (2 helpers only) |
| `backend/app/edge_functions/wechat-users.js` | Modify | Add `update_email_verified` + `bind_insforge_user` actions |
| `backend/app/core/deps.py` | Modify | Three-branch verify_user_token |
| `backend/tests/test_wechat_unit.py` | Modify | TDD: jwt_utils, login_with_code, register_request/confirm |
| `backend/tests/e2e/test_wechat_e2e.py` | Modify | TDD: endpoint 401/200 checks |

---

## Task 1: Add `WECHAT_JWT_SECRET` to config

**Files:** `backend/app/core/config.py`, `backend/.env`, `backend/requirements.txt`

- [ ] **Step 1**: Add after `WECHAT_APP_SECRET` in `config.py`:

```python
# WeChat JWT signing (also used as itsdangerous salt master key)
WECHAT_JWT_SECRET = os.getenv("WECHAT_JWT_SECRET", "")
# Insforge service-role key — required for admin API (e.g. /api/auth/admin/users)
# INSFORGE_ANON_KEY does NOT have admin scope; use SERVICE_KEY for backend-to-backend calls
INSFORGE_SERVICE_KEY = os.getenv("INSFORGE_SERVICE_KEY", "")
```

- [ ] **Step 2**: Generate secrets and add to `backend/.env`:

```bash
echo "WECHAT_JWT_SECRET=$(openssl rand -hex 16)" >> backend/.env
# Add INSFORGE_SERVICE_KEY from Insforge dashboard → Settings → API → service_role key
echo "INSFORGE_SERVICE_KEY=<paste_service_role_key_here>" >> backend/.env
```

- [ ] **Step 3**: Ensure `itsdangerous` and `PyJWT` are in `requirements.txt`:

```bash
cd backend && source venv/bin/activate
pip install itsdangerous PyJWT
pip freeze | grep -E "itsdangerous|PyJWT" >> requirements.txt
# Or if already present, verify versions:
pip freeze | grep -E "itsdangerous|PyJWT"
```

Expected: `itsdangerous==2.2.0` and `PyJWT==2.x.x` appear in output.

- [ ] **Step 4**: Verify config:

```bash
python -c "from app.core.config import WECHAT_JWT_SECRET, INSFORGE_SERVICE_KEY; print(bool(WECHAT_JWT_SECRET), bool(INSFORGE_SERVICE_KEY))"
```

Expected: `True True`

- [ ] **Step 5**: Commit.

```bash
git add backend/app/core/config.py backend/requirements.txt
git commit -m "feat(wechat): add WECHAT_JWT_SECRET + INSFORGE_SERVICE_KEY to config, update requirements"
```

---

## Task 2: Create `jwt_utils.py` — JWT + OTP utilities

**Files:**
- Create: `backend/app/features/wechat/jwt_utils.py`
- Test: `backend/tests/test_wechat_unit.py` (add `TestJwtUtils`, `TestOtpToken`)

### OTP Design

`URLSafeTimedSerializer` 将 `{email, openid, action}` 签入 URL-safe 字符串，max_age=300s 在 `loads()` 时自动验证。重放防御用 `_used_otp_tokens: dict[str, float]`（token → used_at），TTL 后自动清理。

- [ ] **Step 1**: Write failing tests

```python
# tests/test_wechat_unit.py — append these classes

import os, time, pytest
from unittest.mock import patch, AsyncMock, MagicMock

# ---------------------------------------------------------------------------
# TestJwtUtils
# ---------------------------------------------------------------------------

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
        from app.features.wechat import jwt_utils
        jwt_utils._used_otp_tokens.clear()

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
        """Simulate expiry by using max_age=0 in a patched call."""
        from itsdangerous import URLSafeTimedSerializer
        from app.features.wechat.jwt_utils import verify_otp_token, _get_signer

        signer = _get_signer()
        # Dump a token, then monkey-patch max_age to 0 to force expiry
        token = signer.dumps({"email": "e@test.com", "openid": "o_x", "action": "bind_existing"})

        with patch("app.features.wechat.jwt_utils._OTP_MAX_AGE", 0):
            time.sleep(0.01)
            result = verify_otp_token(token)

        assert result["valid"] is False
        assert result["reason"] == "expired"
```

- [ ] **Step 2**: Run failing tests:

```bash
cd backend && source venv/bin/activate
pytest tests/test_wechat_unit.py::TestJwtUtils tests/test_wechat_unit.py::TestOtpToken -v
```

Expected: `FAILED` — module doesn't exist yet.

- [ ] **Step 3**: Create `backend/app/features/wechat/jwt_utils.py`:

```python
"""
WeChat JWT utilities — sign/decode account JWTs + stateless OTP token generation.

JWT token types:
  wechat_unbound    sub=openid,           exp=1d  → unbound guest
  wechat_email_only sub=wechat_users.id,  exp=7d  → OTP-verified, no Insforge account
                    openid=<actual openid> (explicit claim)
  wechat_bound      sub=insforge_user_id, exp=7d  → fully bound account
                    openid=<actual openid> (explicit claim)

OTP token:
  URLSafeTimedSerializer({email, openid, action}, max_age=300s)
  Replay prevention: _used_otp_tokens in-process dict (same pattern as _token_cache in deps.py)
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt as pyjwt
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature

from app.core.config import WECHAT_JWT_SECRET
from app.core.logging import get_logger

logger = get_logger(__name__)

_ALGORITHM = "HS256"
_OTP_SALT = "wechat-otp-v1"
_OTP_MAX_AGE = 300  # seconds (5 minutes)

WECHAT_TOKEN_TYPES = {"wechat_unbound", "wechat_email_only", "wechat_bound"}

# Replay guard: token_string → timestamp_used
# ⚠️ SINGLE-INSTANCE ONLY: This in-process dict is NOT shared across multiple uvicorn
# workers (--workers > 1) or multiple containers. In that case a token consumed in
# worker A can still be replayed in worker B within the 5-minute OTP window.
# Risk is LOW (operations are idempotent and the window is short), but document
# deployment constraint: run with a single worker, OR replace with Redis setnx.
_used_otp_tokens: dict[str, float] = {}


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def sign_wechat_jwt(
    sub: str,
    typ: str,
    exp_days: int,
    openid: Optional[str] = None,
) -> str:
    """
    Sign a WeChat JWT.

    Args:
        sub: subject — openid for unbound; wechat_users.id for email_only; insforge_user_id for bound
        typ: one of WECHAT_TOKEN_TYPES
        exp_days: lifetime in days
        openid: explicit openid claim for email_only/bound tokens (so helpers can always extract openid)

    Returns:
        Signed JWT string
    """
    if not WECHAT_JWT_SECRET:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    if typ not in WECHAT_TOKEN_TYPES:
        raise ValueError("Invalid typ: %s" % typ)

    now = datetime.now(tz=timezone.utc)
    payload: Dict[str, Any] = {
        "sub": sub,
        "typ": typ,
        "iat": now,
        "exp": now + timedelta(days=exp_days),
    }
    if openid:
        payload["openid"] = openid  # explicit for email_only / bound
    return pyjwt.encode(payload, WECHAT_JWT_SECRET, algorithm=_ALGORITHM)


def decode_wechat_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and verify a WeChat JWT.

    Raises:
        jwt.ExpiredSignatureError, jwt.InvalidTokenError, RuntimeError
    """
    if not WECHAT_JWT_SECRET:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    return pyjwt.decode(token, WECHAT_JWT_SECRET, algorithms=[_ALGORITHM])


def extract_openid_from_jwt(payload: Dict[str, Any]) -> str:
    """
    Extract the actual wechat openid from a decoded JWT payload.
    - wechat_unbound: sub IS the openid
    - wechat_email_only / wechat_bound: openid is an explicit claim (sub is an internal UUID)
    """
    return payload.get("openid") or payload["sub"]


# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------

def _get_signer() -> URLSafeTimedSerializer:
    if not WECHAT_JWT_SECRET:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    return URLSafeTimedSerializer(WECHAT_JWT_SECRET, salt=_OTP_SALT)


def generate_otp_token(email: str, openid: str, action: str) -> str:
    """
    Generate a stateless OTP token embedding {email, openid, action}.
    The token is URL-safe and carries a timestamp (verified server-side).
    """
    return _get_signer().dumps({"email": email, "openid": openid, "action": action})


def verify_otp_token(token: str) -> Dict[str, Any]:
    """
    Verify an OTP token.

    Returns:
        {"valid": True,  "email": ..., "openid": ..., "action": ...}
        {"valid": False, "reason": "expired" | "invalid" | "already_used"}
    """
    # Replay check first (cheap)
    if token in _used_otp_tokens:
        return {"valid": False, "reason": "already_used"}

    try:
        data = _get_signer().loads(token, max_age=_OTP_MAX_AGE)
    except SignatureExpired:
        return {"valid": False, "reason": "expired"}
    except BadSignature:
        return {"valid": False, "reason": "invalid"}

    return {
        "valid": True,
        "email": data["email"],
        "openid": data["openid"],
        "action": data["action"],
    }


def mark_otp_used(token: str) -> None:
    """Mark an OTP token as consumed. Call immediately after successful verify."""
    _used_otp_tokens[token] = time.time()
    # Evict tokens older than OTP TTL (can't be replayed anyway after expiry)
    if len(_used_otp_tokens) > 500:
        cutoff = time.time() - _OTP_MAX_AGE
        expired = [k for k, t in _used_otp_tokens.items() if t < cutoff]
        for k in expired:
            del _used_otp_tokens[k]
```

- [ ] **Step 4**: Run tests — expect all PASSED:

```bash
cd backend && source venv/bin/activate
pytest tests/test_wechat_unit.py::TestJwtUtils tests/test_wechat_unit.py::TestOtpToken -v
```

- [ ] **Step 5**: Commit.

```bash
git add backend/app/features/wechat/jwt_utils.py backend/tests/test_wechat_unit.py
git commit -m "feat(wechat): add jwt_utils with JWT sign/decode and itsdangerous OTP"
```

---

## Task 3: Update `wechat-users.js` Edge Function

**Files:** `backend/app/edge_functions/wechat-users.js`

Add two new actions before the final fallback block:

- [ ] **Step 0**: Check whether the existing file already defines a `json()` helper. If it uses `new Response(JSON.stringify(...), {...})` directly, add a helper at the top of the handler function (right after `const action = url.searchParams.get("action")`):

```javascript
// Convenience helper — add only if not already present in the file
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
```

- [ ] **Step 1**: Add `update_email_verified` and `bind_insforge_user` actions:

```javascript
    // POST ?action=update_email_verified
    // Body: { openid, email }
    if (request.method === "POST" && action === "update_email_verified") {
      const { openid, email } = await request.json();
      if (!openid || !email) {
        return json({ success: false, error: "openid and email required" }, 400);
      }
      const { data, error } = await client.database
        .from("wechat_users")
        .update({
          email,
          email_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("openid", openid)
        .select()
        .single();
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, data });
    }

    // POST ?action=bind_insforge_user
    // Body: { openid, insforge_user_id }
    if (request.method === "POST" && action === "bind_insforge_user") {
      const { openid, insforge_user_id } = await request.json();
      if (!openid || !insforge_user_id) {
        return json({ success: false, error: "openid and insforge_user_id required" }, 400);
      }
      const { data, error } = await client.database
        .from("wechat_users")
        .update({
          insforge_user_id,
          bound_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("openid", openid)
        .select()
        .single();
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, data });
    }
```

- [ ] **Step 2**: Deploy the updated Edge Function to Insforge before running E2E tests.

- [ ] **Step 3**: Commit.

```bash
git add backend/app/edge_functions/wechat-users.js
git commit -m "feat(wechat): add update_email_verified and bind_insforge_user actions to Edge Function"
```

---

## Task 4: SQL schema — update `wechat_users` table

> Run in Insforge SQL Editor (dashboard → SQL Editor).

- [ ] **Step 1**: Add new columns:

```sql
alter table wechat_users
  add column if not exists insforge_user_id uuid,
  add column if not exists bound_at         timestamptz,
  add column if not exists email            text,
  add column if not exists email_verified_at timestamptz;

create index if not exists idx_wechat_users_insforge_user_id
  on wechat_users (insforge_user_id)
  where insforge_user_id is not null;

create index if not exists idx_wechat_users_email
  on wechat_users (email)
  where email is not null;
```

> **No `wechat_register_codes` table needed** — OTP state is stateless.

- [ ] **Step 2**: Verify:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'wechat_users'
order by ordinal_position;
```

Expected: includes `insforge_user_id`, `bound_at`, `email`, `email_verified_at`.

---

## Task 5: Add db.py helpers — `update_email_verified` + `bind_insforge_user`

**Files:** `backend/app/features/wechat/db.py`

Only 2 new helpers (vs old plan's 5). No OTP CRUD needed.

- [ ] **Step 1**: Add to `db.py`:

```python
async def update_email_verified(openid: str, email: str) -> Dict[str, Any]:
    """Mark email as OTP-verified on the wechat_users row (creates email_only state)."""
    service = get_insforge_service()
    url = service.function_url(_FUNCTION_NAME)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"action": "update_email_verified"},
                json={"openid": openid, "email": email},
                headers=_headers(),
                timeout=10.0,
            )
            return resp.json()
    except Exception as e:
        logger.error("update_email_verified failed: %s", e)
        return {"success": False, "error": str(e)}


async def bind_insforge_user(openid: str, insforge_user_id: str) -> Dict[str, Any]:
    """Link openid to an existing Insforge user (creates bound state)."""
    service = get_insforge_service()
    url = service.function_url(_FUNCTION_NAME)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"action": "bind_insforge_user"},
                json={"openid": openid, "insforge_user_id": insforge_user_id},
                headers=_headers(),
                timeout=10.0,
            )
            return resp.json()
    except Exception as e:
        logger.error("bind_insforge_user failed: %s", e)
        return {"success": False, "error": str(e)}
```

- [ ] **Step 2**: Commit.

```bash
git add backend/app/features/wechat/db.py
git commit -m "feat(wechat): add update_email_verified and bind_insforge_user db helpers"
```

---

## Task 6: Update `login_with_code` to issue three-state JWTs

**Files:** `backend/app/features/wechat/service.py`, `backend/app/features/wechat/models.py`

Three states read from DB:
- `insforge_user_id IS NOT NULL` → `wechat_bound`
- `email_verified_at IS NOT NULL` (but no insforge_user_id) → `wechat_email_only`
- Neither → `wechat_unbound`

- [ ] **Step 1**: Update `WechatLoginResponse` in `models.py`:

```python
class WechatLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user_id: Optional[str] = None
    openid: Optional[str] = None
    is_bound: bool = False
    account_state: Optional[str] = None   # "unbound" | "email_only" | "bound"
    error: Optional[str] = None
```

- [ ] **Step 2**: Write failing tests:

```python
class TestLoginWithCode:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_new_user_gets_unbound_token(self, mock_c2s, mock_db):
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
        assert payload["openid"] == "o_eo"   # explicit openid claim

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service.code2session")
    async def test_bound_user_gets_bound_token(self, mock_c2s, mock_db):
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
```

- [ ] **Step 3**: Run failing:

```bash
pytest tests/test_wechat_unit.py::TestLoginWithCode -v
```

- [ ] **Step 4**: Replace `login_with_code` in `service.py`:

```python
from app.features.wechat.jwt_utils import sign_wechat_jwt

async def login_with_code(code: str) -> Dict[str, Any]:
    session_data = await code2session(code)
    if "error" in session_data:
        return {"success": False, "error": session_data["error"]}

    openid = session_data["openid"]
    session_key = session_data["session_key"]

    await db.upsert_wechat_user(openid=openid, session_key=session_key)

    lookup = await db.get_by_openid(openid)
    wechat_user = lookup.get("data") or {}

    insforge_user_id = wechat_user.get("insforge_user_id") or wechat_user.get("user_id")
    email_verified_at = wechat_user.get("email_verified_at")

    if insforge_user_id:
        token = sign_wechat_jwt(
            sub=insforge_user_id, typ="wechat_bound", exp_days=7, openid=openid
        )
        return {
            "success": True, "openid": openid, "user_id": insforge_user_id,
            "is_bound": True, "account_state": "bound", "token": token,
        }

    if email_verified_at:
        wechat_row_id = wechat_user.get("id", openid)
        token = sign_wechat_jwt(
            sub=wechat_row_id, typ="wechat_email_only", exp_days=7, openid=openid
        )
        return {
            "success": True, "openid": openid, "user_id": wechat_row_id,
            "is_bound": False, "account_state": "email_only", "token": token,
        }

    token = sign_wechat_jwt(sub=openid, typ="wechat_unbound", exp_days=1)
    return {
        "success": True, "openid": openid, "user_id": None,
        "is_bound": False, "account_state": "unbound", "token": token,
    }
```

- [ ] **Step 5**: Run passing:

```bash
pytest tests/test_wechat_unit.py::TestLoginWithCode -v
```

- [ ] **Step 6**: Commit.

```bash
git add backend/app/features/wechat/service.py backend/app/features/wechat/models.py backend/tests/test_wechat_unit.py
git commit -m "feat(wechat): three-state JWT dispatch in login_with_code"
```

---

## Task 7: Update `verify_user_token` — three-branch dispatch

**Files:** `backend/app/core/deps.py`

Same design as original plan (unchanged by OTP swap). WeChat JWT detected by HMAC decode, falling through to Insforge path on failure.

- [ ] **Step 1**: Write failing tests:

```python
class TestVerifyUserTokenWechat:

    @pytest.mark.asyncio
    async def test_wechat_bound_accepted(self):
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        from app.core.deps import verify_user_token

        token = sign_wechat_jwt(sub="insforge-uid-001", typ="wechat_bound", exp_days=7)
        user_id = await verify_user_token(authorization=f"Bearer {token}")
        assert user_id == "insforge-uid-001"

    @pytest.mark.asyncio
    async def test_wechat_email_only_accepted(self):
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        from app.core.deps import verify_user_token

        token = sign_wechat_jwt(sub="wechat-row-uuid-002", typ="wechat_email_only", exp_days=7)
        user_id = await verify_user_token(authorization=f"Bearer {token}")
        assert user_id == "wechat-row-uuid-002"

    @pytest.mark.asyncio
    async def test_wechat_unbound_returns_403(self):
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
```

- [ ] **Step 2**: Run failing:

```bash
pytest tests/test_wechat_unit.py::TestVerifyUserTokenWechat -v
```

- [ ] **Step 3**: Replace `verify_user_token` in `deps.py`:

```python
async def verify_user_token(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Verify Bearer token. Two token families:
    1. WeChat JWT (HS256, WECHAT_JWT_SECRET) — decoded locally
       wechat_bound / wechat_email_only → return sub (user_id)
       wechat_unbound → 403
    2. Insforge accessToken — verified via Insforge API (existing path)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]

    # --- Try WeChat JWT first (local, cheap) ---
    try:
        import jwt as pyjwt
        from app.core.config import WECHAT_JWT_SECRET
        if WECHAT_JWT_SECRET:
            payload = pyjwt.decode(token, WECHAT_JWT_SECRET, algorithms=["HS256"])
            typ = payload.get("typ", "")
            if typ in ("wechat_bound", "wechat_email_only"):
                return payload["sub"]
            elif typ == "wechat_unbound":
                raise HTTPException(status_code=403, detail="请先验证邮箱后再访问此功能")
            # Unknown typ — fall through to Insforge
    except HTTPException:
        raise
    except Exception:
        pass  # Not a WeChat JWT — try Insforge path

    # --- Insforge path (unchanged) ---
    cached = _token_cache.get(token)
    if cached:
        user_id, _email, expiry = cached
        if time.time() < expiry:
            return user_id
        else:
            del _token_cache[token]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSFORGE_BASE_URL}/api/auth/sessions/current",
                headers={"Authorization": f"Bearer {token}", "apikey": INSFORGE_ANON_KEY},
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Auth service unavailable")

    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail="Auth service error")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        data = resp.json()
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Auth service returned invalid response")

    user_obj = data.get("user", data)
    user_id = user_obj.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    email = user_obj.get("email", "")
    _token_cache[token] = (user_id, email, time.time() + _CACHE_TTL)

    if len(_token_cache) > 100:
        now = time.time()
        expired = [k for k, (_, _, exp) in _token_cache.items() if now >= exp]
        for k in expired:
            del _token_cache[k]

    return user_id
```

- [ ] **Step 4**: Run passing + regression check:

```bash
pytest tests/test_wechat_unit.py::TestVerifyUserTokenWechat -v
pytest tests/test_wechat_unit.py tests/e2e/test_wechat_e2e.py -v
```

- [ ] **Step 5**: Commit.

```bash
git add backend/app/core/deps.py backend/tests/test_wechat_unit.py
git commit -m "feat(wechat): three-branch verify_user_token (wechat JWT + Insforge)"
```

---

## Task 8: Implement `register_request` + `register_confirm` in `service.py`

**Files:** `backend/app/features/wechat/service.py`, `backend/app/features/wechat/models.py`

### Key Design Differences from Old Plan

| Aspect | Old (DB 6-digit) | New (itsdangerous) |
|--------|-----------------|---------------------|
| request sends | 6-digit code via email | Signed token via email link |
| confirm receives | `{ email, code }` from mini program | `{ otp_token }` from web page |
| confirm caller | Mini program | Next.js `/wechat-verify` page |
| mini program after verify | Types code | Taps "完成验证" → re-calls wx.login() |
| DB state tracking | `consumed_at` column | In-process `_used_otp_tokens` |
| `_lookup_insforge_user_by_email` | Uses INSFORGE_ANON_KEY | Uses INSFORGE_SERVICE_KEY (service_role) |

- [ ] **Step 1**: Add models to `models.py`:

```python
class WechatRegisterRequestBody(BaseModel):
    email: str

class WechatRegisterRequestResponse(BaseModel):
    success: bool
    action: Optional[str] = None   # "bind_existing" | "create_new"
    error: Optional[str] = None

class WechatRegisterConfirmBody(BaseModel):
    otp_token: str   # full itsdangerous token (not a 6-digit code)

class WechatRegisterConfirmResponse(BaseModel):
    success: bool
    account_state: Optional[str] = None
    error: Optional[str] = None

class WechatMeResponse(BaseModel):
    success: bool
    account_state: str
    email: Optional[str] = None
    user_id: Optional[str] = None
    error: Optional[str] = None
```

- [ ] **Step 2**: Write failing tests:

```python
class TestRegisterRequest:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    @patch("app.features.wechat.service._send_otp_email")
    async def test_existing_user_sends_bind_email(self, mock_send, mock_lookup, mock_db):
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_request

        mock_lookup.return_value = "uid_existing"
        mock_send.return_value = None

        result = await register_request(openid="o_test", email="user@example.com")
        assert result["success"] is True
        assert result["action"] == "bind_existing"
        mock_send.assert_called_once()
        # Verify the email contains an OTP token (not a 6-digit code)
        call_kwargs = mock_send.call_args
        assert "otp_token" in call_kwargs.kwargs or len(call_kwargs.args) >= 3

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    @patch("app.features.wechat.service._send_otp_email")
    async def test_new_email_sends_create_email(self, mock_send, mock_lookup, mock_db):
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_request

        mock_lookup.return_value = None  # email not found in Insforge
        mock_send.return_value = None

        result = await register_request(openid="o_new", email="new@example.com")
        assert result["success"] is True
        assert result["action"] == "create_new"


class TestRegisterConfirm:

    def setup_method(self):
        os.environ["WECHAT_JWT_SECRET"] = "test_secret_32_chars_padding_xxx"
        from app.features.wechat import jwt_utils
        jwt_utils._used_otp_tokens.clear()

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.db")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_valid_bind_token_returns_bound_state(self, mock_lookup, mock_db):
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import generate_otp_token, decode_wechat_jwt

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
        assert "invalid" in result["error"] or "无效" in result["error"]

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
        assert "already_used" in r2["error"] or "已使用" in r2["error"]
```

- [ ] **Step 3**: Run failing:

```bash
pytest tests/test_wechat_unit.py::TestRegisterRequest tests/test_wechat_unit.py::TestRegisterConfirm -v
```

- [ ] **Step 4**: Implement in `service.py`:

```python
from app.features.wechat.jwt_utils import (
    generate_otp_token, verify_otp_token, mark_otp_used
)

async def _lookup_insforge_user_by_email(email: str) -> Optional[str]:
    """
    Query Insforge admin API for user by email. Returns user_id or None.

    Uses INSFORGE_SERVICE_KEY (service_role), NOT INSFORGE_ANON_KEY.
    The anon key has no admin scope and will return 401/403 on /api/auth/admin/users.
    """
    from app.core.config import INSFORGE_SERVICE_KEY, INSFORGE_BASE_URL
    if not INSFORGE_SERVICE_KEY:
        logger.error("_lookup_insforge_user_by_email: INSFORGE_SERVICE_KEY not configured")
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSFORGE_BASE_URL}/api/auth/admin/users",
                params={"email": email},
                headers={
                    "apikey": INSFORGE_SERVICE_KEY,
                    "Authorization": f"Bearer {INSFORGE_SERVICE_KEY}",
                },
            )
        if resp.status_code == 200:
            users = resp.json().get("users", [])
            if users:
                return users[0].get("id")
        else:
            logger.warning("_lookup_insforge_user_by_email: status=%s", resp.status_code)
    except Exception as e:
        logger.warning("_lookup_insforge_user_by_email failed: %s", e)
    return None


async def _send_otp_email(email: str, otp_token: str) -> None:
    """Send verification link email via Resend."""
    import resend
    from app.core.config import RESEND_API_KEY, FRONTEND_URL
    if not RESEND_API_KEY:
        logger.warning("_send_otp_email: RESEND_API_KEY not set, skipping")
        return
    import urllib.parse
    verify_url = f"{FRONTEND_URL}/wechat-verify?t={urllib.parse.quote(otp_token)}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #059669;">TheMarketBrew 邮箱验证</h2>
      <p>点击下方按钮完成微信小程序账号绑定：</p>
      <a href="{verify_url}" style="
        display: inline-block; padding: 12px 24px;
        background: #059669; color: white; border-radius: 6px;
        text-decoration: none; font-size: 16px;">
        完成验证
      </a>
      <p style="color: #6b7280; margin-top: 16px;">链接 5 分钟内有效。如非本人操作请忽略。</p>
    </div>
    """
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": "TheMarketBrew <hello@themarketbrew.com>",
            "to": [email],
            "subject": "【TheMarketBrew】验证您的邮箱",
            "html": html,
        })
        logger.info("OTP verification email sent to %s", email)
    except Exception as e:
        logger.error("_send_otp_email failed: %s", e)


async def register_request(openid: str, email: str) -> Dict[str, Any]:
    """
    Step 1: Determine bind_existing vs create_new, generate OTP token, send email link.
    """
    existing_user_id = await _lookup_insforge_user_by_email(email)
    action = "bind_existing" if existing_user_id else "create_new"

    otp_token = generate_otp_token(email=email, openid=openid, action=action)
    await _send_otp_email(email=email, otp_token=otp_token)

    logger.info("register_request: openid=%s email=%s action=%s", openid, email, action)
    return {"success": True, "action": action}


async def register_confirm(otp_token: str) -> Dict[str, Any]:
    """
    Step 2: Verify OTP token (called from web /wechat-verify page, not mini program).
    Openid and email are embedded in the token — no JWT auth needed here.
    """
    result = verify_otp_token(otp_token)
    if not result["valid"]:
        reason_map = {
            "expired": "验证链接已过期，请重新发送",
            "already_used": "验证链接已使用，请重新发送",
            "invalid": "验证链接无效",
        }
        return {"success": False, "error": reason_map.get(result["reason"], "验证失败")}

    email = result["email"]
    openid = result["openid"]
    action = result["action"]

    # Consume immediately to prevent replay
    mark_otp_used(otp_token)

    if action == "bind_existing":
        insforge_user_id = await _lookup_insforge_user_by_email(email)
        if not insforge_user_id:
            return {"success": False, "error": "找不到该邮箱对应的账号"}
        bind_result = await db.bind_insforge_user(openid=openid, insforge_user_id=insforge_user_id)
        if not bind_result.get("success"):
            return {"success": False, "error": "账号绑定失败，请重试"}
        logger.info("register_confirm: bound openid=%s to insforge_user_id=%s", openid, insforge_user_id)
        return {"success": True, "account_state": "bound"}

    # create_new: verify email, create email_only state
    verify_result = await db.update_email_verified(openid=openid, email=email)
    if not verify_result.get("success"):
        return {"success": False, "error": "账号状态更新失败"}
    logger.info("register_confirm: email_only openid=%s email=%s", openid, email)
    return {"success": True, "account_state": "email_only"}
```

> **Note:** `register_confirm` does NOT return a JWT token. The mini program re-calls `wx.login()` + `POST /api/wechat/login` to get the updated JWT from DB state. This eliminates the need to pass tokens from browser back to mini program.

- [ ] **Step 5**: Run passing:

```bash
pytest tests/test_wechat_unit.py::TestRegisterRequest tests/test_wechat_unit.py::TestRegisterConfirm -v
```

- [ ] **Step 6**: Commit.

```bash
git add backend/app/features/wechat/service.py backend/app/features/wechat/models.py backend/tests/test_wechat_unit.py
git commit -m "feat(wechat): register_request/confirm with itsdangerous OTP tokens"
```

---

## Task 9: Add router endpoints

**Files:** `backend/app/features/wechat/router.py`

- [ ] **Step 1**: Write failing E2E tests:

```python
class TestWechatRegisterEndpoints:

    @pytest.mark.asyncio
    async def test_register_request_requires_bearer(self, client):
        resp = await client.post("/api/wechat/register/request", json={"email": "u@test.com"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_register_request_invalid_token_returns_401(self, client):
        resp = await client.post(
            "/api/wechat/register/request",
            json={"email": "u@test.com"},
            headers={"Authorization": "Bearer not.a.jwt"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    @patch("app.features.wechat.service._send_otp_email")
    async def test_register_request_with_unbound_token_succeeds(
        self, mock_send, mock_lookup, client
    ):
        """wechat_unbound JWT is accepted by /register/request."""
        import os; os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt

        mock_lookup.return_value = "uid_existing"
        mock_send.return_value = None
        token = sign_wechat_jwt(sub="o_e2e", typ="wechat_unbound", exp_days=1)
        resp = await client.post(
            "/api/wechat/register/request",
            json={"email": "u@test.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_register_confirm_no_auth_required(self, client):
        """confirm takes otp_token in body, no Bearer needed."""
        resp = await client.post(
            "/api/wechat/register/confirm",
            json={"otp_token": "not.a.valid.token"},
        )
        # Invalid token → 400 (not 401)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_me_requires_auth(self, client):
        resp = await client.get("/api/wechat/me")
        assert resp.status_code == 401
```

- [ ] **Step 2**: Run failing:

```bash
pytest tests/e2e/test_wechat_e2e.py::TestWechatRegisterEndpoints -v
```

- [ ] **Step 3**: Replace `router.py`:

```python
"""
WeChat Mini Program router — login, OTP registration/binding, profile, and home cards.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from app.core.logging import get_logger
from app.core.deps import verify_user_token
from app.core.rate_limit import limiter
from app.features.wechat.models import (
    WechatLoginRequest, WechatLoginResponse,
    WechatBindRequest, WechatBindResponse,
    WechatRegisterRequestBody, WechatRegisterRequestResponse,
    WechatRegisterConfirmBody, WechatRegisterConfirmResponse,
    WechatMeResponse, HomeCard, HomeCardsResponse,
)
from app.features.wechat import service
from app.features.wechat.jwt_utils import decode_wechat_jwt, extract_openid_from_jwt

logger = get_logger(__name__)
router = APIRouter(prefix="/api/wechat", tags=["wechat"])

HOME_CARDS = [
    HomeCard(id="today",  title="今日市场日报", subtitle="AI 驱动的每日行情分析", url="/today",   icon="chart",  order=1),
    HomeCard(id="morning",title="盘前早报",     subtitle="开盘前必看要闻",         url="/morning", icon="sun",    order=2),
    HomeCard(id="for-you",title="专属 Brew",    subtitle="个性化投资摘要",         url="/for-you", icon="brew",   order=3),
    HomeCard(id="stock",  title="个股投研",     subtitle="深度个股分析",           url="/stock",   icon="search", order=4),
    HomeCard(id="macro",  title="宏观仪表盘",   subtitle="流动性、风险、周报",     url="/macro",   icon="globe",  order=5),
]


def _require_wechat_token(authorization: str | None) -> dict:
    """
    Extract and decode any WeChat JWT (including wechat_unbound).
    Used for endpoints that must accept unbound users (verify_user_token rejects them).
    Returns decoded payload. Raises 401 on missing/invalid token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        payload = decode_wechat_jwt(authorization[7:])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired WeChat token")
    if payload.get("typ") not in ("wechat_unbound", "wechat_email_only", "wechat_bound"):
        raise HTTPException(status_code=401, detail="Not a WeChat token")
    return payload


@router.post("/login", response_model=WechatLoginResponse)
async def wechat_login(request: WechatLoginRequest):
    try:
        result = await service.login_with_code(request.code)
        return WechatLoginResponse(**result)
    except Exception:
        logger.exception("wechat_login failed")
        raise HTTPException(status_code=500, detail="Login failed")


@router.post("/bind", response_model=WechatBindResponse)
async def wechat_bind(request: WechatBindRequest):
    """Legacy password-based bind. Kept for backwards compatibility."""
    try:
        result = await service.bind_account(openid=request.openid, email=request.email, password=request.password)
        return WechatBindResponse(**result)
    except Exception:
        logger.exception("wechat_bind failed")
        raise HTTPException(status_code=500, detail="Bind failed")


@router.post("/register/request", response_model=WechatRegisterRequestResponse)
@limiter.limit("1/minute")
async def wechat_register_request(
    fastapi_request: Request,
    body: WechatRegisterRequestBody,
):
    """
    Step 1: Send OTP verification email.
    Accepts any WeChat JWT (including wechat_unbound).
    Rate-limited 1/min per IP to prevent email abuse.
    """
    auth_header = fastapi_request.headers.get("Authorization")
    payload = _require_wechat_token(auth_header)
    openid = extract_openid_from_jwt(payload)

    try:
        result = await service.register_request(openid=openid, email=body.email)
        return WechatRegisterRequestResponse(**result)
    except Exception:
        logger.exception("wechat_register_request failed")
        raise HTTPException(status_code=500, detail="Request failed")


@router.post("/register/confirm", response_model=WechatRegisterConfirmResponse)
async def wechat_register_confirm(body: WechatRegisterConfirmBody):
    """
    Step 2: Verify OTP token.
    Called by the Next.js /wechat-verify web page (no Bearer auth — otp_token IS the credential).
    On success the DB state is updated; mini program re-calls wx.login() to get updated JWT.
    """
    result = await service.register_confirm(otp_token=body.otp_token)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return WechatRegisterConfirmResponse(**result)


@router.get("/me", response_model=WechatMeResponse)
async def wechat_me(
    fastapi_request: Request,
    user_id: str = Depends(verify_user_token),
):
    """Return account state. Accepts wechat_bound / wechat_email_only (wechat_unbound → 403)."""
    auth_header = fastapi_request.headers.get("Authorization")
    token = auth_header[7:] if auth_header and auth_header.startswith("Bearer ") else ""
    try:
        payload = decode_wechat_jwt(token)
        return WechatMeResponse(
            success=True,
            account_state=payload.get("typ", "").replace("wechat_", ""),
            user_id=user_id,
        )
    except Exception:
        return WechatMeResponse(success=True, account_state="bound", user_id=user_id)


@router.get("/home-cards", response_model=HomeCardsResponse)
async def get_home_cards():
    return HomeCardsResponse(success=True, cards=sorted(HOME_CARDS, key=lambda c: c.order))
```

- [ ] **Step 4**: Run passing:

```bash
pytest tests/e2e/test_wechat_e2e.py -v
pytest tests/test_wechat_unit.py tests/e2e/test_wechat_e2e.py -v
```

- [ ] **Step 5**: Commit.

```bash
git add backend/app/features/wechat/router.py
git commit -m "feat(wechat): add register/request, register/confirm, me endpoints"
```

---

## Task 10: Architecture + import cleanliness check

- [ ] **Step 1**: No dead-code imports:

```bash
cd backend
grep -r "from app\.services\|from app\.models\|import app\.services\|import app\.models" \
  app/features/wechat/ app/core/
```

Expected: no output.

- [ ] **Step 2**: Full wechat test suite green:

```bash
source venv/bin/activate
pytest tests/test_wechat_unit.py tests/e2e/test_wechat_e2e.py -v --tb=short 2>&1 | tail -30
```

Expected: all PASSED, no failures.

- [ ] **Step 3**: Confirm `itsdangerous` and `PyJWT` in requirements:

```bash
pip freeze | grep -E "itsdangerous|PyJWT"
```

Expected: `itsdangerous==2.2.0`, `PyJWT==2.12.1`

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| WECHAT_JWT_SECRET | Task 1 |
| jwt_utils sign/decode | Task 2 |
| OTP generate/verify/replay-guard | Task 2 |
| wechat_users schema update | Tasks 3, 4 |
| db helpers (2 only) | Task 5 |
| login_with_code three-state JWT | Task 6 |
| verify_user_token three-branch | Task 7 |
| register_request (OTP send) | Task 8 |
| register_confirm (OTP verify) | Task 8 |
| POST /register/request endpoint | Task 9 |
| POST /register/confirm endpoint | Task 9 |
| GET /me endpoint | Task 9 |
| Rate limiting | Task 9 |
| Unit tests | Tasks 2, 6, 7, 8 |
| E2E tests | Task 9 |

**Not in scope (Phase 2):**
- Next.js `/wechat-verify?t=TOKEN` page (required for confirm to work end-to-end)
- Mini program `storage.ts`, `auth.ts`, login page UI refactor
- `/profile` three-state split

**Key invariants:**
- `register_confirm` has no Bearer auth — the otp_token is the credential
- Mini program gets updated JWT by re-calling `wx.login()` after browser verification, not by receiving a token from the web page
- `extract_openid_from_jwt(payload)` always returns the actual wx openid, regardless of JWT type (solves the sub-field semantics bug from original plan)
- `mark_otp_used()` is called immediately on successful verification, before any DB writes, so a partial DB failure cannot re-enable the token

**Resolved issues (from expert review):**
- ✅ **Admin key**: `_lookup_insforge_user_by_email` now uses `INSFORGE_SERVICE_KEY` (service_role), not `INSFORGE_ANON_KEY`. Config added in Task 1.
- ✅ **requirements.txt**: Task 1 now has an explicit step to install and pin `itsdangerous` + `PyJWT`.
- ✅ **Edge Function json()**: Task 3 Step 0 checks for and adds `json()` helper before using it.
- ✅ **Multi-process replay guard**: Documented in `_used_otp_tokens` comment. **Deployment constraint**: run with a single uvicorn worker, or upgrade to Redis `setnx` before multi-worker/multi-container deploy.

**Remaining open items:**
- Obtain `INSFORGE_SERVICE_KEY` from Insforge dashboard before executing Task 1 Step 2.
- Confirm `FRONTEND_URL` in production `.env` resolves to the Next.js deployment (needed for `/wechat-verify?t=TOKEN` link in emails).
