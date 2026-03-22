# Auth SDK Direct Migration Engineering Plan

> Status: Done
> Related: frontend/docs/auth.md, frontend/src/app/api/auth/.context.md, frontend/src/contexts/.context.md, frontend/src/lib/.context.md
> Vision: 产品策略.md > 核心认知 / 现有模块演进（先保证稳定可信的账户体验，再承载更高价值的登录后个性化能力）

## 目标

将当前基于 `@insforge/nextjs` 的前端认证体系迁移到最新官方 guidance 的 `@insforge/sdk` 直连模式，保留我们现有后端 Bearer token 校验边界，同时降低对 deprecated 包的依赖。

## 现状

当前代码与“最新官方 guidance”之间有两层差异：

- 按当前代码状态，认证主链路已经比较简化
  - `AuthContext` 主要依赖 `useInsforge()` 提供的状态，见 `frontend/src/contexts/AuthContext.tsx`
  - `middleware.ts` 使用 `InsforgeMiddleware` 做路由保护
  - `/api/auth` 使用 `createAuthRouteHandlers()` 做 cookie 同步
  - 业务 API 统一从 `getAccessToken()` 取 Bearer token，后端继续走 `verify_user_token`
- 按最新 InsForge skill guidance，这套仍不是目标形态
  - `@insforge/nextjs` 已被标记为 deprecated
  - 推荐方向改为只使用 `@insforge/sdk`
  - Next.js / SSR auth 推荐把 token 保存在 httpOnly cookie，并在 server side 完成 auth flow

当前仓库里与 auth 相关的文档也有轻微漂移：

- `frontend/docs/auth.md` 已把现状描述成“完全使用 `@insforge/sdk` 原生能力”
- 实际代码仍显式依赖 `@insforge/nextjs`：
  - `frontend/src/components/Providers.tsx`
  - `frontend/middleware.ts`
  - `frontend/src/app/api/auth/route.ts`

因此这次工作不是“修一个局部 bug”，而是一次认证底座收敛。

## 设计

### 设计原则

1. 认证状态只保留一个主控制面，避免 SDK state、provider state、cookie state 互相桥接。
2. 前端继续负责获取 Bearer token，后端继续负责 `verify_user_token`，不改现有 API 鉴权边界。
3. 能由 `@insforge/sdk` 直接完成的动作，不再通过 `@insforge/nextjs` 间接完成。
4. 迁移拆成可回滚的小阶段，先把控制面收缩，再决定是否进一步做完整 server-side auth。

### 目标架构

```text
@insforge/sdk client
  -> AuthContext 作为唯一前端 auth 状态源
  -> 自定义 /api/auth 只承担 first-party cookie bridge / session helper
  -> middleware.ts 使用我们自己的轻量路由保护
  -> getAccessToken() 统一向业务 API 提供 Bearer token

业务 API
  -> Authorization: Bearer <accessToken>
  -> backend verify_user_token
```

### 关键决策

#### 1. 移除 `@insforge/nextjs`

要删除的依赖与接入点：

- `InsforgeBrowserProvider`
- `useInsforge()`
- `InsforgeMiddleware`
- `createAuthRouteHandlers()`

保留的核心 SDK：

- `createClient()` 创建 `insforge`
- `insforge.auth.signInWithPassword()`
- `insforge.auth.signUp()`
- `insforge.auth.signInWithOAuth()`
- `insforge.auth.verifyEmail()`
- `insforge.auth.resendVerificationEmail()`
- `insforge.auth.sendResetPasswordEmail()`
- `insforge.auth.exchangeResetPasswordToken()`
- `insforge.auth.resetPassword()`
- `insforge.auth.setProfile()`

#### 2. `AuthContext` 成为唯一前端 auth 状态源

迁移后 `AuthContext` 直接维护：

- `user`
- `isLoading`
- `isAuthenticated`

不再依赖：

- `useInsforge()` 的 `sdk.user`
- `sdk.isLoaded`
- `sdk.reloadAuth()`

登录、登出、验证邮箱、资料更新完成后，由 `AuthContext` 统一更新本地状态和 token 存储。

#### 3. `/api/auth` 改成“最小自定义 server bridge”

当前 `/api/auth` 是 `@insforge/nextjs` 的标准 handler。迁移后改成我们自己的 route handler，但职责要刻意收缩，只做：

- `POST /api/auth`
  - `action: sign-in`
  - 如有需要，后续可保留 `action: session` 或 `action: clear`
- `GET /api/auth`
  - 可选，仅用于当前 cookie/session 调试或恢复
- `DELETE /api/auth`
  - 清理 first-party auth cookie

不在 route 中重新做一整套复杂状态机：

- 不引入多阶段 recovery pipeline
- 不让 route 负责页面级 redirect 逻辑
- 不让 route 成为第二个 AuthContext

#### 4. 自己实现轻量 middleware

迁移后不再依赖 `InsforgeMiddleware`。目标是自定义一个简单中间件：

- 公开页直接放行
- 受保护页检查 first-party session cookie
- 无 cookie 时跳转 `/login?redirect=...`

中间件只做存在性检查，不负责 token 刷新和用户恢复。

#### 5. 分阶段处理 SSR

最新 guidance 提到 Next.js / SSR auth 应以 server side auth flow + httpOnly cookie 为主，但当前项目的业务 API 调用主要发生在 client side，且后端鉴权仍使用 Bearer token。

因此迁移拆两段：

- Phase A：先完成 `@insforge/nextjs` 移除，维持现有“客户端取 token -> 调后端”的模式
- Phase B：如果后续要进一步完全对齐最新 SSR guidance，再评估是否把受保护页面的数据获取迁到 server component / route handler

这样能避免这次任务同时重构 auth 和数据获取方式，降低范围失控风险。

## 数据流

### 邮箱密码登录

```text
/login
  -> AuthContext.signIn()
  -> 调用 insforge.auth.signInWithPassword()
  -> 成功后写入本地 auth 状态
  -> 同步 first-party cookie（供 middleware 使用）
  -> 业务 API 继续通过 getAccessToken() 带 Bearer token
```

### Google OAuth

```text
/login
  -> AuthContext.signInWithGoogle()
  -> insforge.auth.signInWithOAuth({ provider: 'google', redirectTo })
  -> SDK 自动处理 OAuth callback
  -> AuthContext 在应用恢复阶段读取当前会话
  -> 同步 first-party cookie
```

### 会话恢复

```text
应用挂载
  -> AuthContext 初始化
  -> 从 SDK 当前 session / 本地持久化读取用户
  -> 如果存在有效 session：恢复 user
  -> 如果不存在：未登录
```

### 受保护请求

```text
api.ts
  -> getAccessToken()
  -> 从当前 session 拿 access token
  -> 加 Authorization Bearer
  -> backend verify_user_token
```

## API 变更

### 前端 API Route

- 重写 `frontend/src/app/api/auth/route.ts`
- 从 `createAuthRouteHandlers()` 切换到自定义 handler
- 明确 cookie 名称、过期时间、清理方式

### 前端业务 API

- `frontend/src/lib/api.ts` 的 `_authHeaders()` 接口保持不变
- `getAccessToken()` 的内部实现会调整，但调用方不需要改

### 后端 API

- 不修改 `backend/app/core/deps.py`
- 不修改现有 feature router 的 `Depends(verify_user_token)`

## 前端变更

### `frontend/package.json`

- 删除 `@insforge/nextjs`
- 保留 `@insforge/sdk`

### `frontend/src/components/Providers.tsx`

- 移除 `InsforgeBrowserProvider`
- 只保留项目自己的 provider 组合

### `frontend/src/contexts/AuthContext.tsx`

- 移除 `useInsforge()` 依赖
- 改为直接调用 `insforge.auth.*`
- 自己维护 `user/isLoading`
- 保留登录后订阅同步和自动订阅日报等业务初始化逻辑

### `frontend/src/lib/auth.ts`

- 收敛为纯 SDK helper
- 重新定义 `getAccessToken()` 与 cookie 同步逻辑
- 清理对 `@insforge/nextjs` 语义的隐含依赖

### `frontend/middleware.ts`

- 改为项目自定义 middleware
- 显式声明公开页与受保护页

### `frontend/src/app/layout.tsx`

- 无需 `initialState` 注入
- 保持 Root Layout 只负责 UI 框架，不再承担 auth hydration 责任

### `frontend/docs/auth.md`

- 迁移完成后必须同步更新
- 明确说明“当前只使用 `@insforge/sdk`，不再使用 `@insforge/nextjs`”

## 实施步骤

1. [x] 确认最终 token 持久化策略：仅 SDK session，还是 SDK + first-party cookie 双写。
2. [x] 重写 `frontend/src/app/api/auth/route.ts`，从 `createAuthRouteHandlers()` 切到项目自定义 handler。
3. [x] 重写 `frontend/middleware.ts`，用 cookie 存在性做轻量受保护路由拦截。
4. [x] 改造 `frontend/src/components/Providers.tsx`，移除 `InsforgeBrowserProvider`。
5. [x] 改造 `frontend/src/contexts/AuthContext.tsx`，让它直接依赖 `@insforge/sdk` 并成为唯一前端 auth 状态源。
6. [x] 收敛 `frontend/src/lib/auth.ts` 的 token 获取、OAuth、登出清理与 helper 逻辑。
7. [x] 跑通登录、注册、邮箱验证、Google OAuth、忘记密码、重置密码全链路。
8. [x] 更新 auth 相关单测、集成测试和文档，确保实现与 `frontend/docs/auth.md`、`.context.md` 对齐。
9. [x] 验证受保护页面访问、刷新恢复、登出清理、redirect 行为在本地和预发环境稳定。

## 依赖

- 需要确认 InsForge 当前 SDK 对浏览器端 session 持久化和 OAuth callback 恢复的实际行为，避免迁移时误删必要桥接。
- 需要保留现有 Bearer token 鉴权边界，不改后端 router/deps。
- 需要核对生产环境 cookie domain、secure、sameSite 设置，否则 middleware 迁移后可能只在本地正常。

## 待定问题

1. 这次迁移是否接受“先对齐 SDK-only，暂不完全 server-side auth”的阶段目标？
2. first-party cookie 里只存 session token 是否足够，还是还需要冗余 user 摘要供 middleware / Navbar 使用？
3. Google OAuth 回跳后，是否需要保留一个最小的 callback 页面做 UX 过渡，还是完全交给 SDK 自动恢复？
4. 当前 `getCurrentSession()` 在 SDK 类型里已标为 deprecated，迁移时是否直接切到 `getCurrentUser()` + 单独 token 来源方案？
