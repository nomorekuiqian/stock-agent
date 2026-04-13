# WeChat OTP 邮箱验证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现微信小程序注册流程的邮箱 OTP 验证——用户登录后输入邮箱，后端发送验证邮件，用户点击邮件链接，前端 `/wechat-verify` 页面调用后端完成确认，再返回小程序刷新 token。

**Architecture:** 后端 `/api/wechat/register/request` 和 `/api/wechat/register/confirm` 已实现（含 OTP 签发/验证/邮件发送）。本次需要：① 新建 Next.js `/wechat-verify` 页面处理邮件链接；② 改造小程序登录页，把旧的密码绑定 UI 替换为 OTP 注册状态机。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind CSS 4 · WeChat Mini Program TypeScript · FastAPI (backend 已完成，本次只加测试) · itsdangerous OTP token

---

## 文件地图

| 文件 | 动作 | 职责 |
|------|------|------|
| `frontend/src/app/(wechat)/wechat-verify/page.tsx` | **新建** | OTP 验证落地页，读 `?t=` token，调后端 confirm，展示结果，WeChat 环境下导回小程序 |
| `miniprogram/services/auth.ts` | **修改** | 新增 `registerRequest(email)` 和 `refreshLogin()` |
| `miniprogram/pages/login/login.ts` | **修改** | 用 `view` 状态机替换 `showBind` 布尔值，支持 `login / register / pending` 三态 |
| `miniprogram/pages/login/login.wxml` | **修改** | 新增 register 和 pending 视图 |
| `miniprogram/pages/login/login.scss` | **修改** | 新增 pending 态样式 |
| `backend/tests/test_wechat_unit.py` | **修改** | 新增 `TestRegisterService` 和 `TestRegisterRouter` |

---

## Task 1: 后端测试 — register/request 和 register/confirm

**Files:**
- Modify: `backend/tests/test_wechat_unit.py`

背景：`service.register_request` 调用 `_lookup_insforge_user_by_email` 决定 action，再调 `generate_otp_token` + `_send_otp_email`。`service.register_confirm` 调用 `verify_otp_token`，然后按 action 调 `db.bind_insforge_user` 或 `db.update_email_verified`。

- [ ] **Step 1: 在 `test_wechat_unit.py` 末尾追加测试类**

```python
# ---------------------------------------------------------------------------
# register_request (service)
# ---------------------------------------------------------------------------

class TestRegisterService:

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._send_otp_email")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_request_new_user(self, mock_lookup, mock_email):
        """新邮箱 → action=create_new，发一封邮件。"""
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_request

        mock_lookup.return_value = None          # 邮箱不存在
        mock_email.return_value = None           # 不真实发送

        result = await register_request(openid="o_new", email="new@example.com")

        assert result["success"] is True
        assert result["action"] == "create_new"
        mock_email.assert_called_once()
        args, kwargs = mock_email.call_args
        assert args[0] == "new@example.com"      # first positional arg is email

    @pytest.mark.asyncio
    @patch("app.features.wechat.service._send_otp_email")
    @patch("app.features.wechat.service._lookup_insforge_user_by_email")
    async def test_register_request_existing_user(self, mock_lookup, mock_email):
        """已有 Insforge 账号 → action=bind_existing。"""
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
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
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
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
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
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
        """过期 token → success=False, error 含"过期"。"""
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_confirm
        from app.features.wechat.jwt_utils import _used_otp_tokens

        # 用一个格式正确但签名过期的假 token（itsdangerous 不接受非法格式）
        # 改用 mock verify_otp_token
        with patch("app.features.wechat.service.verify_otp_token") as mock_verify:
            mock_verify.return_value = {"valid": False, "reason": "expired"}
            result = await register_confirm(otp_token="fake.expired.token")

        assert result["success"] is False
        assert "过期" in result["error"]

    @pytest.mark.asyncio
    async def test_register_confirm_already_used_token(self):
        """已使用 token → success=False, error 含"已使用"。"""
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.service import register_confirm

        with patch("app.features.wechat.service.verify_otp_token") as mock_verify:
            mock_verify.return_value = {"valid": False, "reason": "already_used"}
            result = await register_confirm(otp_token="fake.used.token")

        assert result["success"] is False
        assert "已使用" in result["error"]


# ---------------------------------------------------------------------------
# register router
# ---------------------------------------------------------------------------

class TestRegisterRouter:

    def _make_wechat_jwt(self, typ="wechat_unbound", openid="o_test"):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from app.features.wechat.jwt_utils import sign_wechat_jwt
        return sign_wechat_jwt(sub=openid, typ=typ, exp_days=1)

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.register_request")
    async def test_register_request_endpoint_requires_auth(self, mock_svc):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        resp = client.post("/api/wechat/register/request", json={"email": "a@b.com"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.register_request")
    async def test_register_request_endpoint_success(self, mock_svc):
        import os
        os.environ.setdefault("WECHAT_JWT_SECRET", "test_secret_32_chars_padding_xxx")
        from fastapi.testclient import TestClient
        from app.main import app
        mock_svc.return_value = {"success": True, "action": "create_new"}

        token = self._make_wechat_jwt()
        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/request",
            json={"email": "new@example.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "create_new"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.register_confirm")
    async def test_register_confirm_endpoint_success(self, mock_svc):
        from fastapi.testclient import TestClient
        from app.main import app
        mock_svc.return_value = {"success": True, "account_state": "email_only"}

        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/confirm",
            json={"otp_token": "valid.token.here"},
        )
        assert resp.status_code == 200
        assert resp.json()["account_state"] == "email_only"

    @pytest.mark.asyncio
    @patch("app.features.wechat.service.register_confirm")
    async def test_register_confirm_endpoint_error(self, mock_svc):
        from fastapi.testclient import TestClient
        from app.main import app
        mock_svc.return_value = {"success": False, "error": "验证链接已过期，请重新发送"}

        client = TestClient(app)
        resp = client.post(
            "/api/wechat/register/confirm",
            json={"otp_token": "expired.token"},
        )
        assert resp.status_code == 400
        assert "过期" in resp.json()["detail"]
```

- [ ] **Step 2: 运行测试，确认全部通过**

```bash
cd backend && source venv/bin/activate
pytest tests/test_wechat_unit.py::TestRegisterService tests/test_wechat_unit.py::TestRegisterRouter -v
```

期望输出：所有新测试 PASS（旧的也应该全部继续通过）。

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_wechat_unit.py
git commit -m "test(wechat): add register/request and register/confirm unit + router tests"
```

---

## Task 2: 前端 `/wechat-verify` 页面

**Files:**
- Create: `frontend/src/app/(wechat)/wechat-verify/page.tsx`

这是纯客户端页面（`'use client'`）。URL 形如 `https://themarketbrew.com/wechat-verify?t=<otp_token>`，从邮件链接打开，可能在普通浏览器或微信内置浏览器中。

**设计：**
- 页面加载 → 立即从 `searchParams.get('t')` 读 token，POST 到后端 confirm
- 三个状态：`'verifying'` (loading spinner) → `'success'` | `'error'`
- 成功时：若在微信小程序 WebView 中（`__wxjs_environment === 'miniprogram'`），调 `wx.miniProgram.redirectTo({url: '/pages/login/login?verified=1'})`；否则展示"请返回小程序，点击"我已完成验证""
- 失败时：展示具体错误文案（过期/已使用/无效）
- 无 token 时：立即展示"链接无效"

- [ ] **Step 1: 新建文件 `frontend/src/app/(wechat)/wechat-verify/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type VerifyState = 'verifying' | 'success' | 'error_expired' | 'error_used' | 'error_invalid' | 'error_no_token';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function confirmOtp(token: string): Promise<{ success: boolean; account_state?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/wechat/register/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp_token: token }),
  });
  if (res.ok) {
    return res.json();
  }
  // 400: backend returned error detail
  const body = await res.json().catch(() => ({}));
  return { success: false, error: body.detail ?? '验证失败' };
}

function tryRedirectToMiniProgram() {
  if (typeof window === 'undefined') return false;
  if ((window as any).__wxjs_environment !== 'miniprogram') return false;
  const wx = (window as any).wx;
  if (!wx?.miniProgram) return false;
  wx.miniProgram.redirectTo({ url: '/pages/login/login?verified=1' });
  return true;
}

export default function WechatVerifyPage() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerifyState>('verifying');
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) {
      setState('error_no_token');
      return;
    }

    confirmOtp(token).then((result) => {
      if (result.success) {
        setState('success');
        const didRedirect = tryRedirectToMiniProgram();
        setRedirected(didRedirect);
      } else {
        const err = result.error ?? '';
        if (err.includes('过期')) setState('error_expired');
        else if (err.includes('已使用')) setState('error_used');
        else setState('error_invalid');
      }
    }).catch(() => {
      setState('error_invalid');
    });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center gap-1.5 items-end h-10 mb-2">
          <div className="w-1.5 h-6 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-10 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-4 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-7 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
        </div>
        <p className="text-xs tracking-widest text-emerald-500 font-medium uppercase">TheMarketBrew</p>

        {state === 'verifying' && (
          <>
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white text-lg font-medium">正在验证邮箱...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">验证成功</p>
              <p className="text-gray-400 text-sm mt-2">
                {redirected
                  ? '正在返回小程序...'
                  : '请返回小程序，点击"我已完成验证"继续'}
              </p>
            </div>
          </>
        )}

        {state === 'error_expired' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接已过期</p>
              <p className="text-gray-400 text-sm mt-2">验证链接仅 5 分钟有效，请返回小程序重新发送</p>
            </div>
          </>
        )}

        {state === 'error_used' && (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接已使用</p>
              <p className="text-gray-400 text-sm mt-2">此验证链接已完成过验证，请返回小程序</p>
            </div>
          </>
        )}

        {(state === 'error_invalid' || state === 'error_no_token') && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接无效</p>
              <p className="text-gray-400 text-sm mt-2">请确认邮件链接完整，或返回小程序重新发送</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 本地验证页面可以访问**

```bash
# 后端开启（需要 ngrok / localtunnel，或直接用 localhost 测试）
cd frontend && npm run dev
# 浏览器访问: http://localhost:3000/wechat-verify?t=invalid_token
# 期望: 页面显示"链接无效"（因为 token 无法验证）

# 访问: http://localhost:3000/wechat-verify
# 期望: 页面显示"链接无效"（无 token）
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(wechat)/wechat-verify/page.tsx
git commit -m "feat(wechat): add /wechat-verify OTP confirmation landing page"
```

---

## Task 3: 小程序 `auth.ts` — 新增 `registerRequest` 和 `refreshLogin`

**Files:**
- Modify: `miniprogram/services/auth.ts`

- [ ] **Step 1: 在 `auth.ts` 末尾追加两个函数**

```typescript
interface RegisterRequestResult {
  success: boolean;
  action?: string;  // "create_new" | "bind_existing"
  error?: string;
}

/**
 * Step 1 of OTP registration: POST email to backend, triggers verification email.
 * Requires a valid WeChat JWT (any type) to be stored via setToken().
 */
export async function registerRequest(email: string): Promise<RegisterRequestResult> {
  try {
    return await request<RegisterRequestResult>('/wechat/register/request', {
      method: 'POST',
      data: { email },
      needAuth: true,
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Re-run wx.login() to exchange a fresh code for an updated JWT.
 * Call after user confirms email verification to upgrade unbound → email_only/bound.
 */
export async function refreshLogin(): Promise<LoginResult> {
  return wechatLogin();
}
```

- [ ] **Step 2: 编译确认无 TypeScript 错误**

在微信开发者工具中点击"编译"，确认无报错（或在 terminal 运行 `cd miniprogram && npx tsc --noEmit` 如果有配置）。

- [ ] **Step 3: Commit**

```bash
git add miniprogram/services/auth.ts
git commit -m "feat(wechat): add registerRequest and refreshLogin to auth service"
```

---

## Task 4: 小程序登录页状态机重构

**Files:**
- Modify: `miniprogram/pages/login/login.ts`
- Modify: `miniprogram/pages/login/login.wxml`
- Modify: `miniprogram/pages/login/login.scss`

**状态机设计：**
```
view: 'login'    → 初始态：显示"微信一键登录"按钮
view: 'register' → 微信登录成功但 unbound：显示邮箱输入框 + "发送验证邮件" + "跳过"
view: 'pending'  → 邮件已发送：显示等待提示 + "我已完成验证" + "重新发送" + "跳过"
```

`email_only` 和 `bound` 账号在 `wechatLogin()` 成功后直接跳转 home，不进入注册态。

- [ ] **Step 1: 替换 `login.ts`**

```typescript
import { wechatLogin, registerRequest, refreshLogin, bindAccount } from '../../services/auth';
import { buildWebViewUrl } from '../../services/api';
import { setToken } from '../../utils/storage';

type LoginView = 'login' | 'register' | 'pending';

Page({
  data: {
    view: 'login' as LoginView,
    loading: false,
    registerEmail: '',
    registerError: '',
  },

  onLoad(options: Record<string, string>) {
    // Token callback from WebView email login
    if (options.token) {
      setToken(options.token);
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    // Redirected back from /wechat-verify in WeChat browser
    if (options.verified) {
      this.doRefreshLogin();
    }
  },

  // ------------------------------------------------------------------
  // WeChat 一键登录
  // ------------------------------------------------------------------
  async onWechatLogin() {
    this.setData({ loading: true });
    const result = await wechatLogin();

    if (!result.success) {
      wx.showToast({ title: result.error || '登录失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    // bound or email_only → can use the app
    if (result.account_state === 'bound' || result.account_state === 'email_only') {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }

    // unbound → show OTP registration form
    this.setData({ loading: false, view: 'register' });
  },

  // ------------------------------------------------------------------
  // 邮箱注册 (register view)
  // ------------------------------------------------------------------
  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ registerEmail: e.detail.value, registerError: '' });
  },

  async onSendVerification() {
    const email = this.data.registerEmail.trim();
    if (!email || !email.includes('@')) {
      this.setData({ registerError: '请输入有效的邮箱地址' });
      return;
    }

    this.setData({ loading: true, registerError: '' });
    const result = await registerRequest(email);

    if (result.success) {
      this.setData({ loading: false, view: 'pending' });
    } else {
      const msg = result.error || '发送失败，请稍后重试';
      const friendlyMsg = msg.includes('1/minute') ? '发送太频繁，请 1 分钟后重试' : msg;
      this.setData({ loading: false, registerError: friendlyMsg });
    }
  },

  onSkip() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // ------------------------------------------------------------------
  // 等待验证 (pending view)
  // ------------------------------------------------------------------
  async onVerifiedTap() {
    this.setData({ loading: true });
    await this.doRefreshLogin();
  },

  async doRefreshLogin() {
    const result = await refreshLogin();

    if (!result.success) {
      this.setData({ loading: false });
      wx.showToast({ title: '刷新登录失败，请重试', icon: 'none' });
      return;
    }

    if (result.account_state === 'bound' || result.account_state === 'email_only') {
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      // Still unbound — user hasn't verified yet
      this.setData({ loading: false });
      wx.showToast({ title: '验证尚未完成，请检查邮箱', icon: 'none' });
    }
  },

  async onResendVerification() {
    this.setData({ view: 'register', registerError: '' });
  },

  // ------------------------------------------------------------------
  // 邮箱登录 (WebView fallback)
  // ------------------------------------------------------------------
  onEmailLogin() {
    const url = buildWebViewUrl('/wechat-login-callback');
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },
});
```

- [ ] **Step 2: 替换 `login.wxml`**

```xml
<nav-bar title="" />

<view class="container login-page">
  <!-- Brand Section -->
  <view class="brand-section">
    <view class="brand-logo">
      <view class="brand-bar brand-bar-1"></view>
      <view class="brand-bar brand-bar-2"></view>
      <view class="brand-bar brand-bar-3"></view>
      <view class="brand-bar brand-bar-4"></view>
    </view>
    <view class="brand-name">TheMarketBrew</view>
    <view class="editorial-label" style="justify-content: center;">
      <view class="editorial-line"></view>
      <text class="text-label">MARKET INTELLIGENCE</text>
      <view class="editorial-line" style="transform: scaleX(-1);"></view>
    </view>
  </view>

  <!-- view: login — 初始登录按钮 -->
  <view class="login-actions" wx:if="{{view === 'login'}}">
    <view class="btn-primary" bind:tap="onWechatLogin">
      <text wx:if="{{loading}}">登录中...</text>
      <text wx:else>微信一键登录</text>
    </view>
    <view class="btn-secondary" bind:tap="onEmailLogin" style="margin-top: 24rpx;">
      使用邮箱登录
    </view>
    <view class="login-hint">登录即表示同意我们的服务条款</view>
  </view>

  <!-- view: register — 邮箱输入 -->
  <view class="register-section" wx:if="{{view === 'register'}}">
    <view class="section-header">
      <view class="section-icon-wrap">
        <text class="section-icon-text">✓</text>
      </view>
      <view class="section-title">微信登录成功</view>
      <view class="section-desc">输入邮箱以接收验证链接，或跳过直接使用</view>
    </view>

    <view class="register-form">
      <input
        class="input-field"
        type="email"
        placeholder="请输入邮箱"
        placeholder-class="input-field-placeholder"
        value="{{registerEmail}}"
        bindinput="onEmailInput"
      />
      <view class="register-error" wx:if="{{registerError}}">{{registerError}}</view>
      <view class="btn-primary" bind:tap="onSendVerification">
        <text wx:if="{{loading}}">发送中...</text>
        <text wx:else>发送验证邮件</text>
      </view>
      <view class="btn-ghost" bind:tap="onSkip">跳过，直接使用</view>
    </view>
  </view>

  <!-- view: pending — 等待验证 -->
  <view class="pending-section" wx:if="{{view === 'pending'}}">
    <view class="pending-icon-wrap">
      <text class="pending-icon">✉</text>
    </view>
    <view class="section-title">验证邮件已发送</view>
    <view class="section-desc">请在 5 分钟内点击邮件中的验证链接，然后返回点击下方按钮</view>

    <view class="pending-actions">
      <view class="btn-primary" bind:tap="onVerifiedTap">
        <text wx:if="{{loading}}">验证中...</text>
        <text wx:else>我已完成验证</text>
      </view>
      <view class="btn-secondary" bind:tap="onResendVerification" style="margin-top: 24rpx;">
        重新发送
      </view>
      <view class="btn-ghost" bind:tap="onSkip">跳过，直接使用</view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 在 `login.scss` 追加 register/pending 样式**

```scss
/* --- Register Section --- */
.register-section,
.pending-section {
  width: 100%;
  padding: 0 48rpx;
}

.section-header {
  text-align: center;
  margin-bottom: 48rpx;
}

.section-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: var(--emerald-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24rpx;
}

.section-icon-text {
  font-size: 36rpx;
  color: var(--emerald);
  font-weight: 700;
}

.section-title {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 12rpx;
}

.section-desc {
  font-size: 26rpx;
  color: var(--fg-muted);
  line-height: 1.6;
}

.register-form,
.pending-actions {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.register-error {
  color: var(--red);
  font-size: 26rpx;
  text-align: center;
}

/* Pending icon */
.pending-icon-wrap {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--emerald-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 32rpx;
}

.pending-icon {
  font-size: 56rpx;
  color: var(--emerald);
}
```

注意：同时删除 `login.scss` 中现有的 `.bind-section`、`.bind-header`、`.bind-icon-wrap`、`.bind-icon-check`、`.bind-title`、`.bind-desc`、`.bind-form`、`.bind-error` 这些不再使用的旧样式。

- [ ] **Step 4: 微信开发者工具编译，确认无报错**

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/login/login.ts miniprogram/pages/login/login.wxml miniprogram/pages/login/login.scss
git commit -m "feat(wechat): replace password-bind UI with OTP register state machine"
```

---

## Task 5: 手动 QA 测试清单

这是在真机上完成的验收测试，没有自动化，但每个 case 必须亲手跑过。

- [ ] **Case 1: 初始登录页正常**
  - 打开小程序 → 显示"微信一键登录"和"使用邮箱登录"两个按钮

- [ ] **Case 2: 无 token → 登录失败时显示 toast**
  - 断网情况下点"微信一键登录" → 显示 toast 提示

- [ ] **Case 3: 注册流程 — 新邮箱**
  - 微信一键登录（unbound 状态）→ 显示 register view
  - 输入新邮箱 → 点"发送验证邮件" → 切换到 pending view
  - 检查邮箱 → 收到验证邮件
  - 点击邮件链接（浏览器打开）→ 显示"验证成功，请返回小程序"
  - 返回小程序 → 点"我已完成验证" → 跳转 home

- [ ] **Case 4: 注册流程 — 已有 Insforge 账号的邮箱**
  - 同 Case 3，但使用已有账号邮箱 `voya.technologies@gmail.com`
  - 验证成功后 → account_state 应为 `bound` → 进入 home

- [ ] **Case 5: 过期链接**
  - 发送验证邮件后，等待超过 5 分钟再点链接
  - 页面显示"链接已过期"

- [ ] **Case 6: 链接已使用**
  - 正常验证成功后，再次点击同一链接
  - 页面显示"链接已使用"

- [ ] **Case 7: 跳过注册**
  - unbound 登录后点"跳过" → 进入 home（匿名使用）

- [ ] **Case 8: 重新发送**
  - 在 pending view 点"重新发送" → 回到 register view
  - 再次发送邮件 → pending view（注意：1 分钟限速，需等待）

- [ ] **Case 9: 邮件在微信内打开（WeChat 内置浏览器）**
  - 从微信聊天中打开验证邮件链接
  - 验证成功后自动跳回小程序登录页并刷新 token

- [ ] **Case 10: 无效邮箱格式**
  - register view 输入"notanemail" → 点发送 → 显示"请输入有效的邮箱地址"（本地校验，不调接口）

---

## Self-Review

**Spec 覆盖检查：**
- ✅ `/wechat-verify` 页面：Task 2
- ✅ OTP 验证落地逻辑（expired/used/invalid）：Task 2
- ✅ 微信内置浏览器自动跳回：Task 2 `tryRedirectToMiniProgram`
- ✅ 小程序注册入口（email input + 发送）：Task 4
- ✅ 等待态 + "我已完成验证" 刷新 token：Task 4 `onVerifiedTap`
- ✅ 跳过注册：Task 4 `onSkip`
- ✅ 重新发送：Task 4 `onResendVerification`
- ✅ 限速错误友好提示：Task 4 `onSendVerification`
- ✅ 后端测试：Task 1
- ✅ 手动 QA：Task 5

**潜在风险：**
- `_used_otp_tokens` 是进程内 dict，多 worker 部署下 replay guard 不跨 worker。文档里已有说明，生产多 worker 时须换 Redis setnx。本计划不处理。
- 邮件链接 5 分钟 TTL 较短。用户从收邮件到点击如果慢可能过期。这是有意设计，不改。
- `email_only` 用户可以跳过不绑定 Insforge，直接用小程序。这是产品期望行为。
