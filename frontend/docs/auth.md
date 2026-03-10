# 认证流程

## 概述

当前认证体系已经回撤到更简单的模式：

- 前端重新使用 `@insforge/nextjs` 的 `InsforgeBrowserProvider`
- 邮箱密码登录仍然走应用域名下的 Server Proxy：`POST /api/auth { action: 'login' }`
- 页面刷新后的会话恢复只走一条补充链路：`GET /api/auth/session`
- 注册体验保留当前版本：邮箱验证码、`/verify-email` 页面、密码可见性切换

这套设计的目标很简单：让“登录”和“恢复登录态”重新收敛到少数几个固定入口，避免 SDK 状态、localStorage、cookie 和自定义状态机彼此打架。

## 主链路

### 1. 邮箱密码登录

```text
用户在 /login 输入邮箱和密码
  -> AuthContext.signIn()
  -> POST /api/auth { action: 'login', email, password }
    -> Next.js route handler 调 Insforge /api/auth/sessions
    -> 从 Set-Cookie 提取 refresh token
    -> 在我们域名下写入 insforge-session / insforge-refresh / insforge-csrf
    -> 返回 { success, accessToken, user }
  -> 前端把 access token 同步到内存缓存、SDK http client、localStorage
  -> AuthContext 用 sdk.setUser() 同步当前用户
  -> 后端接口继续用 Bearer token + verify_user_token 校验身份
```

### 2. 页面刷新后的会话恢复

```text
应用挂载
  -> InsforgeBrowserProvider 先恢复 SDK 状态
  -> 如果 SDK 已有 user：直接认为已登录
  -> 如果 SDK 没有 user：AuthContext 仅额外请求一次 GET /api/auth/session
    -> 先验证 insforge-session
    -> access token 失效时，再用 insforge-refresh + insforge-csrf 换新 token
    -> 成功后把 access token/user 回填到 SDK
```

`/api/auth/session` 是唯一的 cookie recovery 入口，不再把刷新、重试、forced reauth、callback 接管等控制逻辑分散在多个地方。

### 3. Google OAuth

```text
用户点击 Google 登录
  -> AuthContext.signInWithGoogle()
  -> SDK 发起 insforge.auth.signInWithOAuth({ provider: 'google', redirectTo: 最终业务页 })
  -> Google 回跳后由 Insforge provider / SDK 默认链路恢复登录态
  -> 登录页或回调页检测到 isAuthenticated 后跳转到最终业务页
```

当前不再使用手工 `oauth-exchange`、PKCE verifier 搬运、cookie bridge 这些自定义接管逻辑。Google OAuth 已回到更接近旧版的 provider 默认链路。

`/auth/callback` 页面仍保留为兼容落地页，但不再承担自定义 code exchange 职责。

### 4. 注册与邮箱验证

```text
用户在 /login 切到注册态
  -> AuthContext.signUp()
  -> sdk.signUp(email, password, { emailRedirectTo: /verify-email?redirect=... })
  -> 如果需要邮箱验证：
       1. 记录 pending email / name
       2. 跳到 /verify-email
       3. 用户输入 6 位验证码，或通过邮件链接回到该页
       4. AuthContext.verifyEmail() 调 sdk.verifyEmail()
       5. 验证成功后补写 profile name
       6. 跳转到原始 redirect
```

当前保留的注册体验：

- 注册时发送邮箱验证码
- `/verify-email` 自定义页面
- 6 位验证码输入、粘贴、退格回跳
- resend verification
- `PasswordField` 密码显示/隐藏

### 5. 密码重置

```text
/forgot-password
  -> sendPasswordResetEmail(email)
  -> exchangeResetPasswordCode(email, code)
  -> resetPassword(newPassword, otp)
```

这部分仍然是对 Insforge SDK 的薄封装，没有跟登录恢复链路重新耦合。

## Token 获取

前端受保护请求统一走 `getAccessToken()`：

```text
1. 先读内存缓存 _cachedToken
2. 再读 SDK getCurrentSession()
3. 最后调 GET /api/auth/session 做 cookie recovery
```

如果三步都拿不到有效 token，则认为当前没有可用会话。

当前不再保留这些复杂控制：

- `authenticated / no_session / transient_failure` 三态
- 请求前轮询等待恢复
- 401 后自动 force refresh 再重试
- forced reauth reason
- 登录页恢复指引文案

## `/api/auth` 路由职责

当前 `/api/auth` 重新回到“默认 handler + 自定义 login proxy”的结构：

- `POST { action: 'login' }`
  - 自定义登录代理
  - 负责把 refresh token 桥接为应用域名 cookie
- 其他 GET / POST / DELETE
  - 交给 `createAuthRouteHandlers()` 默认处理

独立的 `GET /api/auth/session` 负责：

- 校验当前 access token
- 必要时使用 refresh token 刷新
- 刷新失败时清理失效 cookie

## Cookie 策略

线上继续保留 `.themarketbrew.com` cookie domain 策略。

原因：

- `themarketbrew.com` 和 `www.themarketbrew.com` 需要共享同一套 auth cookie
- 这是生产域名归一化问题，不是当前登录复杂度的来源

当前主要使用的 cookie：

- `insforge-session`
- `insforge-refresh`
- `insforge-csrf`

## 前后端职责

### 前端

文件：

- `frontend/src/components/Providers.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/verify-email/page.tsx`
- `frontend/src/lib/auth.ts`
- `frontend/src/app/api/auth/route.ts`
- `frontend/src/app/api/auth/session/route.ts`

职责：

- 发起登录、注册、邮箱验证、Google OAuth
- 在必要时用 `/api/auth/session` 恢复 cookie 会话
- 给受保护请求附带 Bearer token

### 后端

文件：

- `backend/app/core/deps.py`
- 各 feature `router.py`

职责：

- 用 `Depends(verify_user_token)` 校验 Bearer token
- 从 token 中提取可信 `user_id`
- 不信任前端显式传入的身份字段

## 当前取舍

这次回撤的核心不是“完全去掉 proxy”，而是把 auth 控制面重新简化：

- 登录只有一条主链路：Server Proxy login
- 恢复只有一条补充链路：`/api/auth/session`
- 注册体验保留，但不再和复杂恢复状态机绑定
- Google OAuth 回到 provider 默认链路

如果后续还要继续增强 auth，优先保持这几个边界稳定，不要再把 callback、refresh、提示文案和错误恢复堆回同一个状态机里。
