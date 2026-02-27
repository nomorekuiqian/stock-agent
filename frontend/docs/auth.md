# 认证流程

## 概述

使用 Insforge Auth (基于 Supabase) 实现用户认证，支持邮箱密码登录和 Google OAuth。认证状态通过 React Context 全局管理，httpOnly Cookie 存储 session。

## 认证方式

### 1. 邮箱密码 (Server Proxy)
```
用户输入 email + password
  -> lib/auth.ts signIn()
  -> POST /api/auth { action: 'login', email, password }
  -> Next.js Server 代理调用 Insforge POST /api/auth/sessions
  -> Server 从 Insforge Set-Cookie 头提取 refresh token
  -> Server 设置 3 个 httpOnly cookies:
     - insforge-session (access token, 7天)
     - insforge-refresh (refresh token, 30天)
     - insforge-csrf (CSRF token, 30天)
  -> 返回 { accessToken, user } 给前端
  -> 前端设置 SDK 内存状态
  -> AuthContext 更新状态
```

> **为什么需要 Server Proxy?** Insforge 的 refresh token 只通过 `Set-Cookie` 响应头返回（在 Insforge 域名下），不在 response body 中。前端 `fetch()` 无法读取跨域的 `Set-Cookie` 头，所以必须由 Next.js Server 端代理登录请求来捕获 refresh token。

### 2. Google OAuth
```
用户点击 Google 登录
  -> lib/auth.ts signInWithGoogle()
  -> 重定向到 Google 授权页
  -> 回调到 /auth/callback
  -> Insforge 处理 OAuth code
  -> InsforgeBrowserProvider onSignIn 回调触发 POST /api/auth (同步 cookie)
  -> AuthContext 更新状态
```

## 文件架构

| 文件 | 职责 |
|------|------|
| `lib/auth.ts` | Insforge Auth SDK 封装 (signIn/signUp/signOut/OAuth/密码重置) |
| `contexts/AuthContext.tsx` | 全局认证状态管理 (React Context + Provider) |
| `app/api/auth/route.ts` | API Route — Server Proxy 登录 + Cookie 管理 |
| `app/api/auth/session/route.ts` | Session 验证 + Token Refresh (httpOnly Cookie) |
| `app/login/page.tsx` | 登录页面 UI |
| `app/auth/callback/page.tsx` | OAuth 回调处理 |
| `components/NavAuth.tsx` | 导航栏认证状态显示 |
| `components/Providers.tsx` | 包含 InsforgeBrowserProvider + AuthProvider |

## AuthContext 详细逻辑

### 初始化
1. `useInsforge()` hook 加载 SDK，检查是否有已登录用户
2. 如果 SDK 有 user -> 设置 user 状态，`isRecovering = false`
3. 如果 SDK 无 user -> 尝试 httpOnly cookie 恢复 (`GET /api/auth/session`)
4. 恢复成功 -> 设置 SDK user + auth token；失败 -> `isAuthenticated = false`

### 登录后自动行为
1. **订阅同步**: `api.subscriptions.syncUser(userId, email, firstName)`
   - 将网站用户与 Resend 订阅关联
2. **自动订阅日报**: 首次登录时自动订阅 daily_report
   - 使用 `localStorage` 记录 `has_auto_subscribed` 避免重复
3. **刷新用户信息**: `refreshUser()` 更新 Context 状态

### OAuth 回调处理
- `InsforgeBrowserProvider` 自动检测 OAuth 回调中的 code 参数
- SDK 内部处理 code exchange，`onSignIn` 回调触发 cookie 同步
- `/auth/callback` 页面监听 `isAuthenticated` 状态变化后重定向

## Session 管理

### Cookie 管理 (POST /api/auth)

支持的 actions:
- `login` — Server 代理登录，设置 3 个 httpOnly cookies
- SDK 回调 (onSignIn/onRefresh) — 由 `InsforgeBrowserProvider` 自动处理
- `DELETE /api/auth` — 登出时清除所有 auth cookies (含自定义的 refresh/csrf)

### Session 刷新 (GET /api/auth/session)

1. 检查 `insforge-session` cookie 中的 access token 是否有效
2. 如果无效，使用 `insforge-refresh` + `insforge-csrf` 调用 Insforge `POST /api/auth/refresh`
3. Refresh 需要: Cookie `insforge_refresh_token`、Header `X-CSRF-Token`、Header `Authorization: Bearer <anonKey>`
4. 成功后更新 cookies（access token + 可能轮换的 refresh/CSRF token）
5. 全部失败则清除 stale cookies，返回 401

### Token 恢复链 (getAccessToken)

前端 `getAccessToken()` 按以下优先级恢复会话:
1. SDK 内存 session (`getCurrentSession()`，检查 token 是否过期)
2. httpOnly Cookie 恢复 (`GET /api/auth/session`，可触发 refresh)
3. 全部失败返回 null

## 受保护页面

| 页面 | 保护方式 |
|------|----------|
| `/for-you` | AuthContext 检查，未登录重定向到 `/login` |
| `/for-you/[id]` | 同上 |
| `/for-you/archive` | 同上 |
| `/for-you/watchlist` | 同上 |
| `/profile` | 同上 |

### 重定向保持
- 访问受保护页面时，将当前 URL 存入 `sessionStorage`
- 登录成功后，从 `sessionStorage` 读取并跳转回原页面

## 密码重置

```
用户点击"忘记密码"
  -> sendPasswordResetEmail(email)
  -> 用户收到邮件，点击链接
  -> 跳转到重置页面 (含 code)
  -> exchangeResetPasswordCode(code)
  -> resetPassword(newPassword)
  -> 重定向到登录页
```

## Token 生命周期

| Token 类型 | 有效期 | 存储位置 | 用途 |
|------------|--------|----------|------|
| Access Token | ~15 分钟 | SDK 内存 + httpOnly Cookie (`insforge-session`) | API 请求认证 |
| Refresh Token | 30 天 | httpOnly Cookie (`insforge-refresh`) | 刷新 Access Token |
| CSRF Token | 30 天 | httpOnly Cookie (`insforge-csrf`) | Refresh 请求防伪验证 |

> **重要**: Refresh Token 只通过 Insforge 的 `Set-Cookie` 响应头返回，不在 response body 中。必须通过 Server Proxy 登录才能捕获。

## 后端 API 认证

### verify_user_token (Bearer Token 验证)

**位置**: `backend/app/core/deps.py`

**机制**:
- 从 `Authorization: Bearer {token}` Header 提取 JWT
- 调用 Insforge Auth API (`/api/auth/sessions/current`) 验证 token 有效性
- 验证结果缓存 60 秒（内存 dict，避免重复调用 Insforge API）
- 返回 `user_id` 字符串

**使用方式**:
```python
from app.core.deps import verify_user_token

@router.get("/my-endpoint")
async def handler(user_id: str = Depends(verify_user_token)):
    # user_id 已验证，可以安全使用
    ...
```

### 前端发送 Token

**位置**: `frontend/src/lib/api.ts` — `_authHeaders()` 函数

```typescript
import { getAccessToken } from './auth';

async function _authHeaders(base = {}): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) {
    return { ...base, Authorization: `Bearer ${token}` };
  }
  return base;
}
```

**使用方式**:
```typescript
// GET 请求
const headers = await _authHeaders();
const response = await fetch(`${API_BASE_URL}/watchlist`, { headers });

// POST/PUT 请求
const headers = await _authHeaders({ 'Content-Type': 'application/json' });
const response = await fetch(`${API_BASE_URL}/watchlist`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ symbols }),
});
```

### 添加认证到新端点的标准流程

**后端**:
1. 在 router.py 中 import: `from app.core.deps import verify_user_token`
2. 给端点参数加 `user_id: str = Depends(verify_user_token)`
3. body/query 中不要传 user_id，从 token 提取

**前端**:
1. 在 api.ts 中使用 `await _authHeaders()` 获取包含 Bearer token 的 headers
2. 传入 fetch 的 headers 参数
3. 不要在 URL query 或 body 中传 user_id

### 已认证端点清单

| 端点 | 认证方式 | 说明 |
|------|----------|------|
| `GET /api/watchlist` | Bearer Token | 获取用户自选股 |
| `PUT /api/watchlist` | Bearer Token | 保存用户自选股 |
| `GET /api/digests` | Bearer Token | 列出用户摘要 |
| `GET /api/digests/{digest_id}` | Bearer Token | 获取特定摘要 |
| `POST /api/payment/checkout-session` | Bearer Token | 创建 Stripe Checkout Session |
| `GET /api/payment/subscription-status` | Bearer Token | 查询订阅状态 |
| `POST /api/payment/portal-session` | Bearer Token | 创建 Stripe 客户门户 |
| `POST /api/report/send` | X-Cron-Secret | 广播日报 (管理端点) |
| `POST /api/newsletter/generate` | X-Cron-Secret | 生成 Newsletter |
| `POST /api/newsletter/broadcast` | X-Cron-Secret | 广播简报 (管理端点) |
| `POST /api/weekly-report/broadcast` | X-Cron-Secret | 广播周报 (管理端点) |
| `POST /api/payment/sync` | X-Cron-Secret | 手动同步 Stripe 订阅 |

## 注意事项

- Google OAuth 的回调 URL 需要在 Insforge 控制台配置
- httpOnly Cookie 确保 token 不暴露给 JavaScript (XSS 防护)
- `has_auto_subscribed` localStorage key 用于避免每次登录都重复订阅
- Insforge Auth API 路径与 Supabase **不同** (如 `/api/auth/sessions/current` 而非 `/auth/v1/user`)，不要假设兼容
- `verify_user_token` 验证结果有 60 秒内存缓存，高频请求不会反复调用 Insforge API
- 前端 `getAccessToken()` 优先用缓存 token，过期后通过 SDK session 或 `/api/auth/session` cookie 恢复刷新
- Insforge 的 refresh 端点需要 CSRF token，登录时必须同时存储 `insforge-csrf` cookie
