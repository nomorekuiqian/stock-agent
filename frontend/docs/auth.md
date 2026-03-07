# 认证流程

## 概述

当前认证体系基于 Insforge SDK：

- 前端：`@insforge/nextjs` + `@insforge/sdk`
- 后端：Bearer token + `verify_user_token`
- Session 恢复：Server Component `auth()` + `InsforgeBrowserProvider initialState`

不再使用旧的“自定义 server proxy 登录 + 自己维护 refresh/csrf cookie”的方案。`/api/auth` 只是委托 `createAuthRouteHandlers` 给 SDK 管理 cookie/session。

## 当前主链路

### 1. 邮箱密码登录

```text
用户在 /login 输入邮箱密码
  -> AuthContext.signIn()
  -> sdk.signIn(email, password)
  -> Insforge SDK 写入 session/cookie
  -> RootLayout 下次请求时通过 auth() 读取用户
  -> Providers 初始注入 initialState
  -> 前端业务请求通过 getAccessToken() 取 Bearer token
  -> 后端 verify_user_token() 校验 token
```

### 2. Google OAuth

```text
用户点击 Google 登录
  -> AuthContext.signInWithGoogle()
  -> 从 sessionStorage 读取 redirect 目标
  -> sdk.loginWithOAuth('google', redirectTo)
  -> OAuth 成功后回到目标页
  -> SDK / Provider 恢复用户状态
  -> 如有 callback 错误，兼容页 /auth/callback 会带 error 回 /login
```

### 3. 邮箱注册与验证

```text
用户在 /login 切到注册态，提交 name + email + password
  -> AuthContext.signUp()
  -> sdk.signUp(email, password, { emailRedirectTo: /verify-email?redirect=... })
  -> 如果无需邮箱验证：直接建立 session，按 redirect 进入产品
  -> 如果需要邮箱验证：
       1. sessionStorage 保存 pending email / name
       2. 跳到 /verify-email?email=...&redirect=...
       3. 用户输入验证码，或点击邮件链接回到 /verify-email?token=...
       4. verifyEmail() 成功后恢复 session
       5. 如有 pending name，则补一次 updateProfile()
          - 无论补写成功与否，都会清理 pending signup 状态，避免后续污染新注册
       6. 跳到原始 redirect
```

`/verify-email` 同时兼容两种验证模式：

- `code`：页面输入 6 位验证码
- `link`：点击邮件链接自动验证，并提供 resend 入口

当前 `/verify-email` 是自定义页面，不受 Insforge 预置文案限制。页面已支持：

- 自定义标题 / 副标题 / 按钮文案 / 品牌视觉
- 6 位验证码自动跳格
- Backspace 回退到上一格
- 一次性粘贴完整验证码
- resend verification 失败时显示错误，不再把 SDK 空返回误判成成功

### 4. 密码重置

当前用户入口只有 `/forgot-password`：

```text
输入邮箱
  -> sendPasswordResetEmail(email)
  -> 输入 6 位验证码
  -> exchangeResetPasswordCode(email, code)
  -> resetPassword(newPassword, otp)
  -> 跳回 /login
```

`/reset-password` 保留为兼容旧 token link 的落地页，但密码规则与 `/forgot-password` 已统一为至少 8 位。

## Session 恢复

### Server -> Client 恢复链

```text
页面请求
  -> layout.tsx 调用 auth()
  -> 读取当前 cookie/session
  -> 把 initialState 传给 Providers
  -> Providers 调用 seedClientAuthFromServer()
  -> InsforgeBrowserProvider 初始化
  -> AuthContext 从 useInsforge() 读取 user
```

### getAccessToken()

前端业务 API 统一通过 `getAccessToken()` 取 token：

1. `insforge.auth.getCurrentSession()`
2. 检查 JWT `exp`
3. 过期或超时则返回 `null`

目前 `Providers.tsx` 会通过 `seedClientAuthFromServer()` 把 `initialState.token` 注入 `localStorage`，用于 SDK memory mode 下的刷新恢复。

原因不是业务代码偏好，而是当前 SDK 约束：

1. `@insforge/nextjs/server` 的 `auth()` 可以拿到 `{ userId, user, token }`
2. `@insforge/react` 的 `InitialAuthState` 只包含 `user` / `userId`
3. `InsforgeProviderCore.setInitialState()` 只 hydrate 用户信息，不写入 SDK token manager
4. SDK `TokenManager.getSession()` 仍优先从 `insforge-auth-token` / `insforge-auth-user` 读取浏览器 session

所以这一步目前是“兼容 SDK 恢复链的最小补丁”，而不是可以直接删除的冗余代码。

## 前后端职责

### 前端

文件：

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/verify-email/page.tsx`
- `frontend/src/components/PasswordField.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/components/Providers.tsx`
- `frontend/src/lib/auth.ts`
- `frontend/src/lib/auth-verification.ts`
- `frontend/src/lib/api.ts`

职责：

- 登录 / 注册 / OAuth 发起
- 邮箱验证 / resend verification
- redirect path 存取与清洗
- 从 SDK 读取 user/session
- 给业务请求附带 `Authorization: Bearer <token>`

### 后端

文件：

- `backend/app/core/deps.py`
- `backend/app/features/brew/router.py`
- `backend/app/features/sector/router.py`
- 其他使用 `Depends(verify_user_token)` 的 router

职责：

- 校验 Bearer token
- 从 token 提取可信 `user_id`
- 路由层禁止信任前端传来的业务 `user_id`

## 认证边界

P0 后，以下接口统一以后端 token 身份为准：

- `POST /api/digest`
- `GET /api/watchlist`
- `PUT /api/watchlist`
- `GET /api/digests`
- `GET /api/digests/{digest_id}`
- `POST /api/sectors/subscribe`
- `GET /api/sectors/subscriptions`
- `DELETE /api/sectors/{sector_id}/unsubscribe`

前端不再通过 body/query 传入这些接口的 `user_id`。

## 受保护页面

当前受保护页面主要通过页面级 `AuthContext` 检查并跳转：

- `/for-you`
- `/for-you/[id]`
- `/for-you/archive`
- `/for-you/watchlist`
- `/profile`
- `/sectors`
- `/screener`

`middleware.ts` 目前仍将多数内容页视为 public route，因此真正的数据权限控制仍以后端 Bearer token 校验为准。

## 关键文件

| 文件 | 作用 |
|------|------|
| `frontend/middleware.ts` | InsforgeMiddleware 配置 |
| `frontend/src/app/layout.tsx` | `auth()` 读取 server-side auth state |
| `frontend/src/components/Providers.tsx` | Provider 初始化与 initialState 注入 |
| `frontend/src/contexts/AuthContext.tsx` | 登录/注册/OAuth/登出封装 |
| `frontend/src/lib/auth.ts` | token 获取与密码重置函数 |
| `frontend/src/lib/auth-verification.ts` | verify-email redirect 与 pending signup 状态管理 |
| `frontend/src/app/api/auth/route.ts` | SDK auth route handlers |
| `backend/app/core/deps.py` | `verify_user_token` / `verify_cron_secret` |

## 已知约束

1. `verify_user_token` 通过 Insforge `/api/auth/sessions/current` 校验 token，并做 60 秒内存缓存。
2. 前端页面保护和后端接口保护不是一回事，接口一定要显式 `Depends(verify_user_token)`。
3. `/auth/callback` 目前主要是兼容错误回传和历史 callback 流程，不是唯一 OAuth 成功落地页。
4. 当前 SDK 已提供 `verifyEmail` / `resendVerificationEmail` / `resetPassword`，但未见独立的“已登录修改密码”入口；Profile 页补“修改密码”前，需要先确认是否有可复用的 Insforge 原生 API。
