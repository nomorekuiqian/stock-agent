# Plan: Remove @insforge/nextjs, Keep @insforge/sdk + Server Proxy

**Status**: Done (代码变更完成，自动化验证通过)
**Goal**: 去掉 `@insforge/nextjs` 适配层，用 `@insforge/sdk` + 自建 Server Proxy 作为唯一 auth 方案，消除双层状态冲突。

## 背景

`@insforge/nextjs` 提供了 Next.js 的 auth 集成（Provider、Middleware、route handler、SSR auth），但其跨域 token 管理实现不完善，导致我们在它上面写了一整套 workaround（Server Proxy login/refresh、cookie recovery、sdk.setUser hack、sanitizeServerAuthSeed 等）。现在有两层 auth 状态系统在打架，是大部分 auth bug 的根源。

**决策**: Insforge 团队建议去掉 `@insforge/nextjs`，只保留 `@insforge/sdk`。我们采纳这个建议。

## 核心原则

- `AuthContext` 成为唯一 auth 状态源（useState 管 user，不依赖 SDK 内部状态）
- `@insforge/sdk` 只用于调 auth API（signUp、signOut、verifyEmail、resetPassword、OAuth）
- Server Proxy（route.ts handleSignIn/handleRefresh）保留，处理跨域 refresh token
- Cookie 方案不变（6 个 cookie 在 themarketbrew.com 域名上）
- `api.ts` 的 `_authHeaders()` → `getAccessToken()` 链路完全不变

## 现有架构

```
InsforgeBrowserProvider (isLoaded, user, tokenManager)  ← @insforge/nextjs
  └── AuthContext (isRecovering, user 映射, sdk.setUser hack)  ← 我们的 workaround
```

### 现有文件职责

| 文件 | 来源 | 职责 |
|------|------|------|
| `middleware.ts` | @insforge/nextjs | InsforgeMiddleware 路由保护 |
| `layout.tsx` | @insforge/nextjs | auth() SSR 注入 initialState |
| `Providers.tsx` | @insforge/nextjs | InsforgeBrowserProvider 包裹 + initialState 水合 |
| `AuthContext.tsx` | 我们的 | 状态管理、cookie recovery、所有 auth 动作 |
| `auth-storage.ts` | 混合 | InitialAuthState 类型(nextjs) + localStorage 操作 |
| `route.ts` | 混合 | createAuthRouteHandlers(nextjs) + handleSignIn/handleRefresh(我们的) |
| `auth.ts` | 我们的 | getAccessToken、tryRefreshToken、resetPassword 等 |
| `auth-token.ts` | 我们的 | JWT 过期检查 |
| `auth-redirect.ts` | 我们的 | 重定向路径管理 |
| `auth-verification.ts` | 我们的 | 邮箱验证状态管理 |
| `insforge.ts` | @insforge/sdk | SDK client 实例 |
| `api.ts` | 我们的 | _authHeaders() 获取 token |

## 目标架构

```
AuthContext (user, isLoading)  ← 唯一状态源
  ├── 登录 → Server Proxy (route.ts)
  ├── 注册/验证/OAuth/重置密码 → @insforge/sdk 直接调
  ├── token 管理 → auth.ts (localStorage + cookie)
  └── session 恢复 → /api/auth refresh
```

## 实施步骤

### Phase 1: 替换 middleware.ts

删掉 InsforgeMiddleware，自己写路由保护（~10 行）。检查 cookie 存在性即可。

**改动文件**: `middleware.ts`

### Phase 2: 清理 layout.tsx + Providers.tsx

- `layout.tsx`: 删 `auth()` 调用和 `sanitizeServerAuthSeed`，不再传 `initialState`
- `Providers.tsx`: 删 `InsforgeBrowserProvider` 包裹、`initialState` prop、`seedClientAuthFromServer`

**改动文件**: `layout.tsx`, `Providers.tsx`

### Phase 3: 重写 AuthContext.tsx

这是最核心的改动。从依赖 `useInsforge()` 改为自己管状态：

- 删掉 `useInsforge()` 依赖
- 用 `useState` 管 `user` 和 `isLoading`
- mount 时直接从 localStorage 恢复 → 过期则调 refresh → 完成
- 删掉 `isRecovering`、`sdk.setUser()` hack、`recoveryAttempted`
- signIn: 仍走 Server Proxy，成功后 `setUser()` + 存 localStorage
- signUp: 改为直接调 `insforge.auth.signUp()`（底层 SDK，不是 nextjs 包的 sdk）
- signOut: 改为直接调 `insforge.auth.signOut()` + 清 localStorage + 调 DELETE /api/auth
- verifyEmail / resendVerification / resetPassword / OAuth: 改为直接调 `insforge.auth.xxx()`
- updateProfile: 改为直接调 `insforge.auth.setProfile()`

**注册逻辑**: 现在用的 `sdk.signUp()` 来自 `useInsforge()` (nextjs 包)，但底层就是调 `insforge.auth.signUp()`（SDK 包）。两者等价，都是 `POST /api/auth/users`。直接替换 `sdk.signUp(...)` → `insforge.auth.signUp(...)`，无需改业务逻辑。

注册流程细节：
1. 调 `insforge.auth.signUp({ email, password, emailRedirectTo })` → Insforge 创建用户
2. 返回 `requiresEmailVerification: true`（当前已开启邮箱验证）→ 跳转验证页输入验证码
3. 用户输入验证码 → 调 `insforge.auth.verifyEmail({ email, otp })` → 拿到 accessToken
4. 验证成功 → 存 token + setUser

注意事项：
- 当前开启了邮箱验证，注册后 `accessToken` 为 null，走验证码流程，这条主路径不受重构影响
- 如果未来关闭邮箱验证，注册成功会直接返回 `accessToken`。此时 SDK 的 `saveSessionFromResponse()` 不再被自动调用（因为不走 InsforgeBrowserProvider 了），需要自己调 `syncClientAuthSession()` + `setUser()` 存 session，跟登录成功后的处理一样
- `sdk.updateUser({ name })` 改为 `insforge.auth.setProfile({ name })`
- `sdk.resendVerificationEmail(email)` 改为 `insforge.auth.resendVerificationEmail({ email })`
- `sdk.verifyEmail(otp, email)` 改为 `insforge.auth.verifyEmail({ otp, email })`

**改动文件**: `AuthContext.tsx`

### Phase 4: 清理 route.ts

删掉 `createAuthRouteHandlers` 和 `handlers.GET/POST`。保留 handleSignIn、handleRefresh、DELETE（清 cookie）。GET handler 看是否还需要（大概率不需要了）。

**改动文件**: `route.ts`

### Phase 5: 清理 auth.ts + auth-storage.ts

- `auth.ts`: 删掉 `insforge.auth.getCurrentSession()` 调用（SDK 的跨域 refresh 永远失败），getAccessToken 改为只查 localStorage + 调 Server Proxy refresh
- `auth-storage.ts`: 删掉 `InitialAuthState` 类型引用、`ServerAuthSeed`、`sanitizeServerAuthSeed`、`seedClientAuthFromServer`。保留 `clearClientAuthStorage` 和常量

**改动文件**: `auth.ts`, `auth-storage.ts`

### Phase 6: 卸载依赖 + 更新测试

- `npm uninstall @insforge/nextjs`
- 更新 5 个测试文件中 mock `@insforge/nextjs` 的部分：
  - `contexts/__tests__/AuthContext.test.tsx`
  - `components/__tests__/Providers.test.tsx`
  - `app/__tests__/layout-auth.test.tsx`
  - `components/__tests__/StockCard.test.tsx` (eslint directive)
  - E2E tests 需要验证

**改动文件**: `package.json`, 5 个测试文件

## 不变的东西

- `insforge.ts` — SDK client 实例
- `auth-token.ts` — JWT 过期检查
- `auth-redirect.ts` — 重定向路径
- `auth-verification.ts` — 邮箱验证状态
- `api.ts` — `_authHeaders()` → `getAccessToken()` 链路
- `AuthSubscriptionSync.tsx` — 只依赖 `useAuth()`
- 所有页面的 `useAuth()` 调用 — 接口完全不变
- 后端 `verify_user_token` — 不变
- Cookie 方案（6 个 cookie）— 不变
- Server Proxy（handleSignIn/handleRefresh）— 核心逻辑不变

## 风险与应对

| 风险 | 严重性 | 应对 |
|------|--------|------|
| SSR 首帧闪烁（Navbar 显示"登录"后变"用户名"） | 低 | isLoading 时 Navbar auth 区域显示骨架屏 |
| signUp/OAuth 参数兼容性 | 低 | nextjs 包的 sdk.signUp 就是调底层 insforge.auth.signUp，参数一致 |
| 测试需要更新 mock | 中 | Phase 6 统一处理 |
| 遗漏某个 @insforge/nextjs 的隐式依赖 | 低 | npm uninstall 后 build 会立刻报错 |

## 重构后的关键流程

### 登录
```
AuthContext.handleSignIn()
  → fetch('/api/auth', { action: 'sign-in' })  [不变]
  → route.ts handleSignIn() proxy to Insforge  [不变]
  → 成功: setUser(useState) + 存 localStorage  [简化: 不再 sdk.setUser]
```

### Session 恢复
```
AuthContext mount, isLoading = true
  → localStorage 有 token 且未过期? → setUser → setIsLoading(false)
  → 过期/没有? → fetch('/api/auth', { action: 'refresh' })
    → 成功: setUser + 存 localStorage → setIsLoading(false)
    → 失败: setIsLoading(false), 未登录
[简化: 不再有 sdk.isLoaded → isRecovering → sdk.setUser 三阶段]
```

### Token 刷新 (API 调用时)
```
api.ts _authHeaders() → getAccessToken()
  → auth.ts: 查 localStorage 缓存
  → 过期? → fetch('/api/auth', { action: 'refresh' })  [不变]
  → 返回 token 或 null
[简化: 不再先调 SDK getCurrentSession 等 2 秒超时]
```

### 注册
```
AuthContext.handleSignUp()
  → insforge.auth.signUp({ email, password })  [改: sdk.signUp → insforge.auth.signUp]
  → requiresEmailVerification? → 跳转验证页
  → 否则 saveSession + setUser
[逻辑不变，只是调用来源从 useInsforge() 改为 insforge 实例]
```

## 验收流程

分 3 层验证：**自动化测试** → **手动浏览器测试** → **生产灰度验证**。

### 第 1 层：自动化测试 (CI 级)

实施完成后跑 `/test frontend`，确保全部通过。

| 测试 | 验证内容 | 重构影响 |
|------|----------|----------|
| `AuthContext.test.tsx` (10 cases) | signIn/signUp/signOut/recovery 逻辑 | mock `@insforge/nextjs` → 改为 mock `@insforge/sdk` |
| `Providers.test.tsx` | Provider 渲染 | 删除 `InsforgeBrowserProvider` mock |
| `layout-auth.test.tsx` | SSR auth 注入 | 删除 `auth()` mock，改写或删除 |
| `login.spec.ts` (8 E2E cases) | 登录/注册/验证码全流程 | mock Server Proxy + SDK API，基本不变 |
| ESLint + TSC | 无残留 `@insforge/nextjs` 引用 | `npm uninstall` 后自动暴露 |
| `next build` | 编译通过 | 验证 SSR 不依赖 `auth()` |

**新增自动化测试（建议）**:

AuthContext.test.tsx 新增 case:
1. mount 时 localStorage 有有效 token → 立即 setUser, isLoading=false
2. mount 时 localStorage token 过期 → 调 /api/auth refresh → 成功 → setUser
3. mount 时 localStorage token 过期 → refresh 失败 → user=null, isLoading=false
4. signOut → 清 localStorage + 调 DELETE /api/auth + queryClient.clear()

### 第 2 层：手动浏览器测试 (Dev 环境)

测试账号 `voya.technologies@gmail.com` / `123456`，在 `localhost:3000` 验证。

#### A. 登录流程

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| A1 | 访问 /login，输入正确账号密码，点击登录 | 跳转到首页，Navbar 显示用户名 | 目视 |
| A2 | 登录后检查 localStorage | `insforge-auth-token` 和 `insforge-auth-user` 有值 | DevTools |
| A3 | 登录后检查 Cookies | `insforge-session`, `insforge-refresh`, `insforge-user` 有值 | DevTools |
| A4 | 输入错误密码 | 显示"邮箱或密码错误" | 目视 |
| A5 | 从 /for-you 重定向到 /login?redirect=/for-you，登录后 | 跳转回 /for-you 而非首页 | URL 检查 |

#### B. Session 恢复（最关键）

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| B1 | 登录状态下刷新页面 (F5) | Navbar 短暂加载态后显示用户名，不闪"登录"按钮 | 目视 |
| B2 | 登录状态下关闭浏览器，重新打开 | 仍然是登录状态 | 目视 |
| B3 | 手动删除 localStorage token，刷新 | 通过 cookie refresh 恢复登录 | DevTools + 目视 |
| B4 | 删除 localStorage + 所有 cookies，刷新 | 变为未登录状态，不报错 | 目视 |

#### C. Token 刷新

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| C1 | 修改 localStorage token 为过期 JWT | 下一个 API 请求自动刷新 token，请求成功 | Network tab |
| C2 | 观察 /api/auth refresh 请求 | 返回新 accessToken + user | Network tab |

#### D. 登出

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| D1 | 点击"退出登录" | 跳转到首页，Navbar 显示"登录"按钮 | 目视 |
| D2 | 登出后检查 localStorage 和 cookies | 所有 auth 相关 key/cookie 被清除 | DevTools |
| D3 | 登出后访问 /for-you | 被重定向到 /login?redirect=/for-you | URL 检查 |

#### E. 注册 + 邮箱验证

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| E1 | /login 切换到注册表单，填写新邮箱 | 跳转到 /verify-email?email=xxx | URL 检查 |
| E2 | 输入正确验证码 | 显示"邮箱已验证"，跳转到目标页 | 目视 |
| E3 | 已注册邮箱再次注册 | 显示"该邮箱已注册" | 目视 |

#### F. Google OAuth

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| F1 | 点击"使用 Google 登录" | 跳转到 Google 授权页 | 目视 |
| F2 | 授权完成回调 | 回到应用，显示已登录 | 目视 |

#### G. 路由保护 (Middleware)

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| G1 | 未登录访问 /for-you | 重定向到 /login | URL 检查 |
| G2 | 未登录访问 /profile | 重定向到 /login | URL 检查 |
| G3 | 未登录访问 /today, /stock, /macro | 正常访问（公开路由） | 目视 |

#### H. Profile 更新

| # | 操作 | 预期结果 | 验证方式 |
|---|------|----------|----------|
| H1 | /profile 页面修改用户名 | 保存成功，Navbar 显示新名字 | 目视 |

### 第 3 层：生产灰度验证

部署到 Vercel Preview 后，用真实 `themarketbrew.com` 域名测试：

| # | 验证点 | 原因 |
|---|--------|------|
| P1 | 登录 → session cookie domain 是 `.themarketbrew.com` | 跨子域 cookie 共享 |
| P2 | 刷新页面 session 保持 | Cookie 在生产域名生效 |
| P3 | 关闭浏览器重开 → 自动登录 | Refresh token cookie 持久化 |
| P4 | /api/auth refresh 响应正常 | Server Proxy 在 Vercel Edge 正常运行 |
| P5 | 过期 token 自动刷新 | 完整 refresh 链路在生产环境工作 |

### 验证执行顺序

```
Phase 完成
  → npm run build (编译通过?)
  → /test frontend (全部自动化测试通过)
  → 手动测试 A1-A5 (登录) ← 最基础，失败则阻塞一切
  → 手动测试 B1-B4 (Session 恢复) ← 核心改动点，重点验
  → 手动测试 C1-C2 (刷新) + D1-D3 (登出)
  → 手动测试 E1-E3 (注册) + G1-G3 (路由)
  → 手动测试 F1-F2 (OAuth) + H1 (Profile)
  → 部署 Preview → P1-P5 (生产域名)
  → 合并上线
```

### 快速回滚方案

如果生产验证发现问题：
- `git revert` 整个 PR 即可回到 `@insforge/nextjs` 方案
- `npm install @insforge/nextjs` 恢复依赖
- 不涉及数据库或 cookie 格式变更，回滚无副作用
