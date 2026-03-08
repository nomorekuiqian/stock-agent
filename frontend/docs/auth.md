# 认证流程

## 概述

当前认证体系已经切到 **`@insforge/sdk` + 自建 Server Proxy**：

- 前端：仅保留 `@insforge/sdk`
- 后端：Bearer token + `verify_user_token`
- Session 恢复：客户端 `AuthContext` + `/api/auth` Server Proxy

当前架构目标已经调整为 **SDK-first + thin proxy only**：

- SDK 负责 UI 侧认证状态、OAuth、邮箱验证等标准能力
- 薄 `Server Proxy` 只负责浏览器天然做不好的跨域/session 桥接
- 不再把“存在 `/api/auth`”本身视为问题
- 真正要避免的是应用层同时维护多套 session 恢复逻辑

`/api/auth` 现在只保留项目自定义动作：`sign-in` / `refresh` / `verify-email` / `oauth-exchange` / `bridge-session` / `DELETE`。

### 为什么薄 Proxy 仍然是合理的

对于 `SSR + httpOnly cookie + auth 服务与业务站点非同域` 的场景，一个运行在应用域名下的薄 auth 路由是常见方案。目标不是“零 proxy”，而是：

1. Proxy 足够薄，只做桥接
2. SDK 仍然是唯一的前端 auth 状态入口
3. “UI 已登录” 与 “受保护接口可用” 必须收敛成同一个 session 真相

## 当前主链路

### 1. 邮箱密码登录

```text
用户在 /login 输入邮箱密码
  -> AuthContext.signIn()
  -> POST /api/auth { action: 'sign-in', email, password }
    -> Next.js Server Proxy 调用 Insforge /api/auth/sessions
    -> 提取 refresh token / csrfToken
    -> 写入我们域名下的 auth cookies
    -> 返回 { accessToken, user, csrfToken }
  -> 前端把登录结果同步到 localStorage / SDK httpClient / React state
  -> 前端业务请求通过 getAccessToken() 取 Bearer token
  -> 后端 verify_user_token() 校验 token
```

### 2. Google OAuth

```text
用户点击 Google 登录
  -> AuthContext.signInWithGoogle()
  -> sessionStorage 保存最终 redirect 目标
  -> sdk.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })
  -> Google 回跳到公开页 /auth/callback?insforge_code=...
  -> callback 页把 code + PKCE verifier 发给 POST /api/auth { action: 'oauth-exchange' }
    -> Server Proxy 调 Insforge /api/auth/oauth/exchange
    -> 提取 refresh token / csrfToken
    -> 写回我们域名的 auth cookies
  -> 前端 syncClientAuthSession() + setUser()
  -> 再跳转到 sessionStorage 里保存的最终业务页
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
       4. verifyEmail() 走 Server Proxy 成功后恢复 session
       5. 如有 pending name，则补一次 updateProfile()
          - 无论补写成功与否，都会清理 pending signup 状态，避免后续污染新注册
       6. 跳到原始 redirect
```

`/verify-email` 同时兼容两种验证模式，且两种模式都会通过 Server Proxy 完成 cookie bridge：

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

`/reset-password` 保留为兼容旧 token link 的落地页，但密码规则与 `/forgot-password` 已统一为至少 6 位。

## Session 恢复

### Client 恢复链

```text
应用挂载
  -> AuthContext init effect
  -> 若当前是 /auth/callback?insforge_code=...:
       跳过 SDK 自动恢复，交给 callback 页手动 exchange
  -> 否则先调 insforge.auth.getCurrentUser()
       - 有本地 session / Insforge 域 refresh cookie：恢复 user
  -> 仍无会话时，再调 POST /api/auth { action: 'refresh' }
       - 用我们域名下的 refresh cookie 换新 access token
```

### getAccessToken()

前端业务 API 统一通过 `getAccessToken()` 取 token，当前策略是：

1. **cachedToken** — 如果之前 refresh 过且 token 未过期，直接返回缓存值
2. **localStorage token** — `insforge-auth-token` 仍有效则直接返回
3. **Server Proxy refresh** — token 不存在或已过期时，`POST /api/auth { action: 'refresh' }`
   - 成功后缓存 token、更新 SDK httpClient auth header、写入 localStorage
   - 使用 Promise 去重，并发调用只触发一次 refresh
4. 全部失败返回 `null`

**为什么业务请求不直接依赖 SDK 内置 refresh？**

邮箱密码登录、邮箱验证成功、OAuth callback 成功后，真正作为“应用主 session”的 refresh token 都会被桥接到我们域名 cookie。`getAccessToken()` 必须优先走这条 first-party refresh 链，不能再把 SDK 的 cross-domain refresh 当主链路。

这里的关键认知更新是：问题不在“需要薄 Proxy”，而在“SDK 与应用之间缺少统一的 session bridge”。如果应用层必须自己分别兜底 `sdk.user`、token hydrate、refresh、forced reauth，就会出现状态分裂。

`@insforge/nextjs` 相关的 `auth()` / `initialState` / `InsforgeBrowserProvider` 已经移除，这一段历史 workaround 不再适用。

## 当前目标架构

```text
Browser UI
  -> AuthContext
  -> 单一前端认证状态

Thin App-Domain Proxy (/api/auth)
  -> 登录/回调/refresh 的跨域桥接
  -> 写入或清理 first-party cookies

Insforge Auth API
  -> 身份源头
  -> token 校验与 session 发放
```

设计原则：

1. SDK-first，而不是页面自己拼 session
2. Thin proxy only，而不是把 auth 业务逻辑堆进 route handler
3. 单一 session 真相，避免 “UI 显示已登录但接口 401”
4. 避免双重恢复链，不再同时维护 `sdk.user`、手写缓存 token、零散 localStorage 注入等彼此独立的判定

### 会话异常兜底

受保护请求现在还有一层统一兜底：

1. `api.ts` 的 `_authHeaders(..., { required: true })` 会短暂等待 token 恢复
2. 如果恢复窗口内始终只有“临时失败”（网络抖动、短暂 5xx、refresh 超时），返回可重试错误，不立刻强制重登
3. 如果 refresh / session 复核明确判定为 `no_session`，前端只返回“登录已过期”错误，不再自动清 session 或强制跳回登录页
4. 用户可以手动刷新页面，或在需要时主动重新登录；系统不再因为单次 401/恢复失败就把整个前端登录态清空

这样可以先把认证行为收敛回“尽量不自动动用户 session”的模式，避免线上因为单次 401 或恢复时序问题把用户踢回登录页。

### Production 额外约束

- 线上真实主站当前是 `https://www.themarketbrew.com`；`https://themarketbrew.com` 会先 307 到 `www`
- 因此 auth cookies 不能再默认只依赖当前 host；Server Proxy 在 production 会把 auth cookies 统一写到 `.themarketbrew.com`
- 这样可以减少 `www` / 裸域切换、旧 cookie 残留、以及生产环境 host 归一化带来的 session 分裂
- OAuth callback 不能直接回 `/for-you` / `/profile` 这类受保护页。原因是 middleware 会在 cookie bridge 之前抢先重定向回 `/login`
- `AuthContext` 在 `/auth/callback?insforge_code=...` 场景会主动跳过 SDK 自动 code exchange，避免 SDK 先消耗掉一次性 code，导致 Server Proxy 无法再桥接 refresh token
- `signOut()` 现在必须走统一清理函数，把模块级 `cachedToken`、localStorage、SDK httpClient header、以及 app-domain cookies 一起清掉；否则同 tab 后续 API 可能继续带旧 Bearer token
- 受保护接口在收到 `401` 后，如果 `forceRefresh` 成功，前端会自动重试一次原请求；如果仍然失败，只展示错误，不再自动强制登出
- 登录页和受保护错误页现在都会给出统一恢复指引：
  - Mac：`Command + Shift + R`
  - Windows：`Ctrl + Shift + R`
  - 手机端：浏览器菜单重新加载或下拉刷新；若仍失败，关闭当前页面后重新打开
- `insforge_code` 是回调链中的一次性授权码，不是长期 session token。前端现在会在 SDK 初始化和恢复链结束后，再额外清理一次 `insforge_code` / `access_token` / `user_id` / `email`，避免这些参数长时间停留在地址栏
- Server Proxy `refresh` 成功后，现在也会同步更新 CSRF cookie，避免 refresh token 轮换后下一次刷新仍拿着旧 CSRF 值

## 前后端职责

### 前端

文件：

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/verify-email/page.tsx`
- `frontend/src/app/auth/callback/page.tsx`
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
5. 登录逻辑变更时，旧 cookie / 旧 localStorage 仍可能进入不一致状态；当前前端会在检测到异常后强制重登，而不是无限停留在损坏会话里。
