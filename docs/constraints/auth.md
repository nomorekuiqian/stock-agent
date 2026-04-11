# 认证流程

## 概述

当前前端认证体系只使用 `@insforge/sdk` 客户端直接调用（SDK Direct），不使用 `@insforge/nextjs`，也没有同源 `/api/auth` server bridge（`/api/auth/route.ts` 目前不存在）。

核心原则：

- SDK 负责登录、注册、OAuth callback、session 恢复、refresh、登出
- 项目代码只负责 `AuthContext`、路由保护、登录后跳转、后端 Bearer token 适配
- 受保护后端接口继续使用 `Authorization: Bearer <token>` + `verify_user_token`
- `middleware.ts` 只做 first-pass 路由保护（检查 `insforge_csrf_token` first-party cookie），不是权威 auth source

### 已知局限（SDK Direct）

`insforge_refresh_token` 由 Insforge 服务器通过 `Set-Cookie` 设置在 **Insforge 域名**上，是我们站点的第三方 cookie。`insforge.auth.refreshSession()` 调用时需要携带该 cookie（`credentials: "include"`），在以下场景下会被阻止，导致**刷新页面后登录状态丢失**：

- Chrome 无痕模式（默认阻止第三方 cookie）
- Safari（ITP 策略默认阻止跨域 cookie）
- Firefox（Enhanced Tracking Protection 可能阻止）

`insforge_csrf_token` 是 SDK 通过 `document.cookie` 写在我们域名的 first-party cookie，不受影响，因此 middleware 路由保护仍然正常工作。

**根本解决方案**：实现 `/api/auth/route.ts` Server Bridge，在 server side 完成登录并将 token 存为我们域名的 httpOnly first-party cookie。见 `frontend/src/app/api/auth/.context.md`。

## 主链路

### 1. 邮箱密码登录

```text
用户在 /login 输入邮箱和密码
  -> AuthContext.signIn()
  -> lib/auth.ts signIn()
  -> insforge.auth.signInWithPassword({ email, password })
  -> SDK 保存当前 session
  -> AuthContext 更新 user
  -> /login 页面根据 isAuthenticated 跳到最终 redirect
```

### 2. Google OAuth

```text
用户点击 Google 登录
  -> AuthContext.signInWithGoogle()
  -> lib/auth.ts signInWithGoogle()
  -> insforge.auth.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })
  -> 浏览器跳转到 Google
  -> Google 回跳 /auth/callback?insforge_code=...
  -> SDK 在客户端初始化时自动处理 callback code exchange
  -> /auth/callback 页面调用 completeOAuthSignIn() 确认当前 user
  -> AuthContext.refreshUser() 同步当前登录态
  -> 页面跳到 sessionStorage 里的最终 redirect
```

### 3. 注册与邮箱验证

```text
用户在 /login 切到注册态
  -> AuthContext.signUp()
  -> lib/auth.ts signUp()
  -> insforge.auth.signUp({ email, password, name })
  -> 如果 requireEmailVerification = true：
       1. 记录 pending email / name
       2. 跳到 /verify-email
       3. 用户输入 6 位验证码，或带 token/otp 回到该页
       4. AuthContext.verifyEmail()
       5. insforge.auth.verifyEmail({ email, otp })
       6. SDK 自动保存 session，用户直接进入登录态
       7. 页面补写 pending name 到 profile
```

### 4. 密码重置

```text
/forgot-password
  -> insforge.auth.sendResetPasswordEmail(email)
  -> exchangeResetPasswordToken(email, code)
  -> resetPassword(newPassword, otp)
```

### 5. 路由保护

```text
用户访问受保护页面
  -> Next.js middleware 先执行
  -> 检查 insforge_csrf_token 是否存在
  -> 没有时跳到 /login?redirect=当前路径
  -> 有时先放行
  -> AuthContext 再通过当前 session 决定真实登录态
```

当前由 `middleware` 首层保护的页面包括：`/for-you`、`/profile`、`/macro`、`/sectors`、`/screener`

## Session 与 Token

前端对 session 的读取顺序：

```text
getCurrentAuthSession() / getAccessToken()
  -> 先读模块级内存缓存（_sessionCache，含 JWT 过期检查，60 秒缓冲）
  -> 再读 SDK tokenManager in-memory session（getSdkSession）
  -> 如果都没有，再调用 insforge.auth.refreshSession()
  -> 返回 user / accessToken
```

### OAuth Callback 竞态处理

SDK 在构造时启动 `detectAuthCallback()`，将 PKCE code exchange 封装为 `authCallbackHandled` Promise。只有 `insforge.auth.getCurrentUser()` 内部会 `await authCallbackHandled`，其余方法（包括 `refreshSession()`）**不会等待**。

在 `/auth/callback` 页面挂载时，`AuthContext` 的初始 hydration 会触发 `getSessionWithRefresh()`。如果此时直接调 `refreshSession()`，code exchange 尚未完成会得到 401。

处理方式：

```text
getSessionWithRefresh()
  -> isOAuthCallbackRoute() 检查路径是否为 /auth/callback
  -> 命中则委托给 getCallbackRouteSession()
     -> 调 insforge.auth.getCurrentUser()（内部 await authCallbackHandled）
     -> 读 getSdkSession()（tokenManager 已被 code exchange 填充）
     -> 不再落入 refreshAndCacheSession()，避免重复 401
```

说明：

- `callback 场景`：`getCallbackRouteSession()` 是唯一入口，严禁再调 `refreshSession()`
- `completeOAuthSignIn()`（`/auth/callback` 页面调用）：调一次 `getCurrentUser()`，再读 `getSdkSession()`，不重复调任何方法
- `getAccessToken()` 是前端调用业务后端接口的唯一 Bearer token 入口
- `api.ts` 里的受保护请求统一通过它补 `Authorization` 头

## 前后端职责

### 前端文件

- `frontend/src/lib/insforge.ts` - 创建浏览器侧 InsForge SDK client
- `frontend/src/lib/auth.ts` - 认证封装、session 读取、Bearer token 获取
- `frontend/src/contexts/AuthContext.tsx` - 前端唯一 auth 状态源
- `frontend/middleware.ts` - 受保护路由首层拦截
- `frontend/src/app/auth/callback/page.tsx` - OAuth callback 完成页
- `frontend/src/app/verify-email/page.tsx` - 邮箱验证页

### 后端

- `backend/app/core/deps.py` - `verify_user_token` 用 Bearer token 校验身份
- 各 feature `router.py` - `Depends(verify_user_token)` 提取 `user_id`

## 手动 QA 计划

下面这套 checklist 用于每次 auth 改动后的手测。目标不是只验证“主链路能跑通”，而是验证用户在不同入口、不同状态、不同异常情况下，都能最终顺利登录成功。

建议分两轮执行：

- 第一轮：在全新无痕窗口执行，验证首次使用体验
- 第二轮：在普通窗口执行，验证已有 cookie / sessionStorage / 半登录状态下的恢复能力

### 测试前准备

1. 启动前端：`cd frontend && npm run dev`
2. 启动后端：`cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
3. 确认前端环境变量有效：`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_INSFORGE_URL`、`NEXT_PUBLIC_INSFORGE_ANON_KEY`
4. 如果测试 Google OAuth，确认 InsForge / Google 后台已登记当前回调地址，例如 `http://localhost:3000/auth/callback`
5. 打开浏览器 DevTools，准备观察 `Network`、`Application > Cookies`、`Application > Session Storage`
6. 本地测试账号可用：`voya.technologies@gmail.com / 123456`

### A. 未登录访问保护页

1. 打开一个全新无痕窗口，直接访问 `http://localhost:3000/for-you`
2. 预期：立即被重定向到 `/login?redirect=%2Ffor-you`
3. 检查 `sessionStorage.auth_redirect`
4. 预期：值为 `/for-you`

### B. 登录入口覆盖矩阵

下面这些入口都要至少各测一次，确认用户无论从哪里开始，都能顺利进入登录成功状态：

1. 从首页头部导航点击“登录”
2. 从首页内容区 CTA 卡片点击“登录”
3. 直接手动访问 `/login`
4. 未登录直接访问 `/for-you`，被重定向到 `/login`
5. 未登录直接访问 `/profile`，被重定向到 `/login`
6. 未登录直接访问 `/screener`，被重定向到 `/login`

每个入口都要验证两件事：

1. 是否稳定到达 `/login`
2. 登录成功后是否回到正确的目标页面，而不是丢失 redirect

### C. 邮箱密码登录

1. 在 `/login` 输入错误密码登录
2. 预期：停留在登录页，并显示“邮箱或密码错误”
3. 输入正确账号密码登录
4. 预期：登录成功后跳回最初的 redirect 页面
5. 刷新当前页面
6. 预期：仍保持登录，不应被打回 `/login`
7. 打开 `/profile`
8. 预期：可直接访问
9. 从首页入口和受保护页重定向入口各重复一次
10. 预期：两种入口都第一次即可成功
11. 如果第一次失败，立即重试一次
12. 预期：必须能成功，且失败原因要能在 UI 上解释清楚，而不是静默卡住

### D. Google OAuth 主路径

1. 在首页进入 `/login`，点击“使用 Google 登录”
2. 预期：跳转到 Google 授权页
3. 完成授权后回到 `/auth/callback?insforge_code=...`
4. 预期：短暂显示处理中状态，然后跳到最初的 redirect 页面
5. 再次退出登录
6. 直接访问 `/login`，再次点击 Google 登录
7. 预期：第一次就成功，不应出现“第一次失败、第二次成功”的现象
8. 如果失败，记录以下信息：
   - 当前入口路径是首页跳转还是直接访问 `/login`
   - callback URL 是否包含 `insforge_code` 或 `error`
   - `sessionStorage.auth_redirect` 的值
   - `Network` 中是否出现 OAuth callback / refresh 失败请求
9. 从受保护页重定向进入 `/login` 后，再次执行一次 Google 登录
10. 预期：也必须第一次成功

### E. Google OAuth 恢复与兜底

这部分专门验证“第一次没有完全成功时，用户是否仍然能顺利完成登录”。

1. 在 Google 授权后，若回到 `/auth/callback` 停留超过 3 秒仍未跳转
2. 预期：页面最终应进入目标页，或明确跳回 `/login?error=...`
3. 如果跳回 `/login?error=...`
4. 预期：用户再次点击 Google 登录后，必须能成功，不应陷入循环失败
5. 在 callback 成功后刷新页面
6. 预期：保持登录态
7. 在 callback 成功后关闭 tab，再重新打开目标页
8. 预期：如果 session 有效，应仍能进入已登录状态
9. 手动删除 `sessionStorage.auth_redirect` 后再执行 Google 登录
10. 预期：即使 redirect 丢失，也应落到安全默认页，不应卡死在 callback

### F. 注册与验证码验证

1. 使用一个未注册邮箱注册
2. 预期：如果 `requireEmailVerification = true`，跳转到 `/verify-email`
3. 在 `/verify-email` 输入 6 位验证码
4. 预期：验证成功后自动进入登录态，不需要再额外输入密码
5. 页面应在短暂成功提示后跳到目标页
6. 如果注册时填写了姓名，进入 `/profile` 检查 profile name
7. 预期：姓名已补写成功
8. 在 `/verify-email` 点击“重新发送”
9. 预期：提示发送成功，不报错
10. 输入错误验证码
11. 预期：留在当前页，并显示清晰错误
12. 输入正确验证码
13. 预期：仍然能顺利完成登录成功

### G. 邮箱验证链接模式

只有在 auth config 使用 link/token 验证时执行。

1. 从验证邮件点击链接回到 `/verify-email?token=...` 或 `/verify-email?otp=...`
2. 预期：页面自动完成验证，无需手动输入验证码
3. 验证成功后进入登录态并跳到目标页

### H. 密码重置

1. 打开 `/forgot-password`
2. 输入已注册邮箱发送重置邮件
3. 预期：进入下一步提示或验证码输入流程
4. 如果是 code 模式，输入收到的 code；如果是 link 模式，点击邮件链接
5. 在 `/reset-password` 输入新密码并提交
6. 预期：提示重置成功，并跳到 `/login`
7. 用新密码登录
8. 预期：成功
9. 用旧密码登录
10. 预期：失败
11. 密码重置成功后，立刻再走一次 Google 登录或邮箱密码登录
12. 预期：不会因为 reset 流程残留状态而影响正常登录

### I. 已有状态下的登录恢复

这一组测试验证用户不是从“干净环境”开始时，也能顺利登录成功。

1. 先完成一次邮箱密码登录
2. 刷新页面
3. 预期：保持登录
4. 再访问另一个受保护页，例如 `/profile`
5. 预期：直接进入
6. 打开一个新 tab，访问 `/for-you`
7. 预期：仍保持登录
8. 退出登录后，立刻走 Google 登录
9. 预期：可正常成功
10. 退出登录后，立刻走邮箱密码登录
11. 预期：可正常成功

### J. 登出与恢复

1. 登录后点击“退出登录”
2. 预期：回到未登录状态
3. 再访问 `/for-you`
4. 预期：重新被重定向到 `/login`
5. 登录成功后刷新页面
6. 预期：仍能恢复登录态
7. 关闭当前 tab，重新打开站点
8. 预期：如果 session 仍有效，页面应恢复登录
9. 登出后立即访问 `/profile`
10. 预期：必须重新要求登录，不应出现“UI 显示已登出，但实际还能访问”的状态

### K. 业务后端 Bearer Token

1. 登录后打开一个需要用户态的页面，例如 `/for-you`
2. 在 DevTools `Network` 里观察发往后端 `NEXT_PUBLIC_API_URL` 的受保护请求
3. 预期：请求头包含 `Authorization: Bearer <token>`
4. 人为登出后重试相同操作
5. 预期：请求不再携带有效 Bearer token，并被页面引导回登录
6. 在 OAuth 登录成功后的第一次受保护请求上也检查一次
7. 预期：第一次成功登录后发出的后端请求就能拿到有效 Bearer token，不需要用户再登录第二次

### L. 失败恢复专项

这一组是最重要的。即使用户第一次没成功，也必须能靠清晰路径恢复，而不是陷入不确定状态。

1. 登录页输入错误邮箱密码后，再输入正确密码
2. 预期：第二次尝试能成功
3. Google 授权后如果被打回 `/login?error=...`
4. 预期：错误文案可理解，且用户再次点击 Google 登录能成功
5. `/verify-email` 输入错误验证码后，再输入正确验证码
6. 预期：仍然能成功进入登录态
7. 删除浏览器 cookie 后重新访问受保护页
8. 预期：明确跳回登录页，而不是空白页或无限跳转
9. 保留 cookie 但关闭当前 tab，再重新打开
10. 预期：若 session 有效，能恢复；若 session 无效，明确要求重新登录

### M. 通过标准

- 未登录用户无法进入受保护页
- 所有登录入口都能把用户带到正确登录页
- 邮箱密码登录在所有入口下都应第一次即可成功
- Google OAuth 在所有入口下都应第一次即可成功
- 即使第一次失败，用户第二次尝试也必须能明确、稳定地成功
- 注册后验证码验证会自动进入登录态
- 密码重置后不会破坏后续登录
- 刷新页面、打开新 tab、重新打开站点时，session 能稳定恢复
- 登出后保护页会重新要求登录
- 受保护后端请求始终能拿到 Bearer token
- 不允许出现以下情况：
  - 登录成功但停留在 `/auth/callback`
  - 已登录但被错误踢回 `/login`
  - 需要登录两次才成功
  - 没有错误提示的静默失败

## 注意事项

- 不要重新引入 `@insforge/nextjs`
- callback 与 session 恢复优先信任 SDK 当前 session，不要在页面层再造第二套状态机
- 若需彻底解决刷新后登录丢失（无痕模式/Safari），需实现 `/api/auth/route.ts` Server Bridge，但实现前须将 `/api/auth` 路由从 `PUBLIC_ROUTES` 中保留（它目前不在受保护路由列表内）
