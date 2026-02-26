# 认证流程

## 概述

使用 Insforge Auth (基于 Supabase) 实现用户认证，支持邮箱密码登录和 Google OAuth。认证状态通过 React Context 全局管理，httpOnly Cookie 存储 session。

## 认证方式

### 1. 邮箱密码
```
用户输入 email + password
  -> lib/auth.ts signIn()
  -> Insforge Auth API
  -> 返回 session + user
  -> POST /api/auth (同步 cookie)
  -> AuthContext 更新状态
```

### 2. Google OAuth
```
用户点击 Google 登录
  -> lib/auth.ts signInWithGoogle()
  -> 重定向到 Google 授权页
  -> 回调到 /auth/callback
  -> Insforge 处理 OAuth code
  -> AuthContext polling 检测 insforge_code
  -> POST /api/auth (同步 cookie)
  -> AuthContext 更新状态
```

## 文件架构

| 文件 | 职责 |
|------|------|
| `lib/auth.ts` | Insforge Auth SDK 封装 (signIn/signUp/signOut/OAuth/密码重置) |
| `contexts/AuthContext.tsx` | 全局认证状态管理 (React Context + Provider) |
| `app/api/auth/route.ts` | API Route — Cookie 同步 (httpOnly) |
| `app/login/page.tsx` | 登录页面 UI |
| `app/auth/callback/page.tsx` | OAuth 回调处理 |
| `components/NavAuth.tsx` | 导航栏认证状态显示 |
| `components/Providers.tsx` | 包含 InsforgeBrowserProvider + AuthProvider |

## AuthContext 详细逻辑

### 初始化
1. 检查 Insforge session (`getCurrentUser()`)
2. 如果有 session -> 设置 user 状态
3. 如果没有 -> isAuthenticated = false

### 登录后自动行为
1. **订阅同步**: `api.subscriptions.syncUser(userId, email, firstName)`
   - 将网站用户与 Resend 订阅关联
2. **自动订阅日报**: 首次登录时自动订阅 daily_report
   - 使用 `localStorage` 记录 `has_auto_subscribed` 避免重复
3. **刷新用户信息**: `refreshUser()` 更新 Context 状态

### OAuth 回调处理
- AuthContext 在加载时检测 URL 中的 `insforge_code` 参数
- 如果存在，使用 `exchangeCodeForSession()` 交换 session
- 交换成功后清理 URL 参数

## Session 管理

### Cookie 同步 (POST /api/auth)
- 前端获取 Insforge session token
- POST 到 `/api/auth` 写入 httpOnly cookie
- 后续请求自动携带 cookie

### Session 刷新
- Insforge SDK 自动处理 token 刷新
- AuthContext 在组件挂载时检查 session 有效性

## 受保护页面

| 页面 | 保护方式 |
|------|----------|
| `/for-you` | AuthContext 检查，未登录重定向到 `/login` |
| `/for-you/[id]` | 同上 |

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

| Token 类型 | 有效期 | 存储位置 | 刷新方式 |
|------------|--------|----------|----------|
| Access Token | 1 小时 | SDK 内存 + localStorage + httpOnly Cookie | SDK 自动刷新 |
| Refresh Token | 30 天 | httpOnly Cookie | 用于获取新 Access Token |

**Token 恢复链** (优先级从高到低):
1. SDK 内存 session (`insforge.auth.getCurrentSession()`)
2. httpOnly Cookie (`/api/auth/session` 端点)
3. localStorage (`insforge-auth-token` key)

## 后端 API 认证

### verify_user_token (Bearer Token 验证)

**位置**: `backend/app/core/deps.py`

**机制**:
- 从 `Authorization: Bearer {token}` Header 提取 JWT
- 调用 Insforge Auth API (`/auth/v1/user`) 验证 token 有效性
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
| `GET /api/digests/{id}` | Bearer Token | 获取特定摘要 |
| `POST /api/payments/*` | Bearer Token | 支付相关 |
| `POST /api/report/send` | X-Cron-Secret | 广播日报 (管理端点) |
| `POST /api/newsletter/broadcast` | X-Cron-Secret | 广播简报 (管理端点) |

## 注意事项

- Google OAuth 的回调 URL 需要在 Insforge 控制台配置
- httpOnly Cookie 确保 token 不暴露给 JavaScript (XSS 防护)
- `has_auto_subscribed` localStorage key 用于避免每次登录都重复订阅
- Insforge Auth 本质上是 Supabase Auth 的封装，API 兼容
- `verify_user_token` 验证结果有 60 秒内存缓存，高频请求不会反复调用 Insforge API
- 前端 `getAccessToken()` 依赖 SDK session，需要 AuthContext 先初始化（页面加载时 `getCurrentUser()` 会设置）
