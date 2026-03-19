# Auth Official Alignment Engineering Plan

> Status: In Progress
> Related: frontend/docs/auth.md, frontend/src/app/api/auth/.context.md, frontend/src/contexts/.context.md, frontend/src/lib/.context.md
> Vision: 产品策略.md > 核心认知 / 现有模块演进（先保证稳定可信的账户体验，再承载更高价值的持仓诊断）

## 目标

把当前前端认证体系进一步收敛到 InsForge 官方推荐能力之上，只保留确实无法交给官方处理的最小自定义逻辑，降低维护成本、排障成本和后续升级风险。

## 现状

当前实现属于“官方底座 + 自定义桥接层”的混合模式，已经比历史版本简单，但仍存在明显偏离官方推荐的部分：

- 已保留官方能力
  - `InsforgeBrowserProvider` 已启用，见 `frontend/src/components/Providers.tsx`
  - `createAuthRouteHandlers()` 已启用，见 `frontend/src/app/api/auth/route.ts`
- 仍保留的自定义逻辑
  - 邮箱密码登录不走 SDK `signInWithPassword()`，而是走 `POST /api/auth { action: 'login' }` server proxy
  - `route.ts` 手工从 InsForge 返回头里提取 refresh token，再写入应用域名 cookie
  - 自建 `GET /api/auth/session` 负责 access token 校验、refresh、cookie 回写与清理
  - `AuthContext` 在 SDK 没有 user 时额外打一遍 `/api/auth/session`，再手工 `sdk.setUser(...)`
  - `lib/auth.ts` 自己维护 token cache、JWT 过期判断、cookie recovery promise 去重、本地存储同步
  - Google OAuth 仍是手工 PKCE + 自定义 callback route + 手工 exchange，而不是官方默认回调链
  - `middleware.ts` 没有使用官方 `InsforgeMiddleware`
- 文档已出现漂移
  - `frontend/docs/auth.md` 与 `frontend/src/lib/.context.md` 写的是“Google OAuth 已回到官方默认链路”
  - 实际代码仍保留 `frontend/src/app/api/auth/oauth-callback/route.ts` 与 `signInWithGoogle()` 的手工 exchange 流程

结论：当前最需要继续官方化的，不是 UI 层，而是 OAuth、session 恢复、middleware、token 生命周期管理这几层底座。

## 当前 InsForge 使用清单

当前前端同时使用了两个 InsForge 包：

- `@insforge/sdk`
  - 依赖声明存在于 `frontend/package.json`
  - 实际用于创建基础 client：`frontend/src/lib/insforge.ts`
  - 实际用于 auth 动作：`signUp`、`setProfile`、`signOut`、`getCurrentSession`、`sendResetPasswordEmail`、`exchangeResetPasswordToken`、`resetPassword`
  - 实际也被用来发起当前这套自定义 Google OAuth 流
- `@insforge/nextjs`
  - 依赖声明存在于 `frontend/package.json`
  - 实际用于 `InsforgeBrowserProvider`：`frontend/src/components/Providers.tsx`
  - 实际用于 `useInsforge()`：`frontend/src/contexts/AuthContext.tsx`
  - 实际用于 `createAuthRouteHandlers()`：`frontend/src/app/api/auth/route.ts`

也就是说，当前不是“只用了基础 SDK”，而是：

1. 用 `@insforge/sdk` 做底层 client 与大部分 auth API 调用
2. 同时用 `@insforge/nextjs` 做 provider、hook、route handlers
3. 再叠加我们自己的 server proxy、session recovery、OAuth callback 逻辑

从“官方能力使用程度”看：

- 已在用的官方 Next.js 能力
  - `InsforgeBrowserProvider`
  - `useInsforge()`
  - `createAuthRouteHandlers()`
- 尚未用到、但计划要补回的官方 Next.js 能力
  - `InsforgeMiddleware`
- 已偏离官方推荐、计划要删掉的自定义链路
  - 自定义 OAuth callback / exchange / PKCE
  - 自定义 session recovery 主链路
  - 自定义 middleware

## 设计

### 设计原则

1. 官方能做的，就不要自己再做一遍。
2. 自定义只允许存在于“跨域 refresh token 必须桥接到 first-party cookie”这一个边界。
3. 认证底座与业务初始化解耦。订阅同步、自动订阅日报等业务动作不能再主导 auth 状态机。
4. 优先减少控制面数量，而不是继续在现有控制面上修补。

### 目标架构

```text
InsforgeBrowserProvider
  -> 作为前端主 auth provider

createAuthRouteHandlers()
  -> 作为 Next.js auth route 默认实现

InsforgeMiddleware
  -> 作为路由保护默认实现

仅保留一个最小 custom edge:
  邮箱密码登录 server proxy
    -> 调 InsForge /api/auth/sessions
    -> 桥接 refresh token 到应用域名 cookie

其余能力尽量全部回归官方:
  - Google OAuth
  - session 恢复
  - callback 处理
  - middleware 路由保护
  - 用户恢复与 provider 状态同步
```

### 关键决策

#### 1. Google OAuth 全量回归官方

当前自定义 OAuth 是最明显的非官方链路，计划完全删除：

- 删除 `frontend/src/app/api/auth/oauth-callback/route.ts`
- 删除 `frontend/src/lib/auth.ts` 中的手工 PKCE 生成与 `fetch(.../api/auth/oauth/google)`
- 改为 `insforge.auth.signInWithOAuth({ provider: 'google', redirectTo })` 或 `@insforge/nextjs` 对应默认能力
- 让 SDK/provider 自己处理回调参数与 session 恢复

这部分不保留兼容层。因为官方文档明确给出“callback 自动恢复，无需手工处理”。

#### 2. middleware 改回官方

当前 `middleware.ts` 只是写 `x-has-session` header，没有真正承担官方推荐的路由保护职责。

目标改为：

- 使用 `InsforgeMiddleware({ baseUrl, publicRoutes })`
- 明确公开页、认证页、受保护页
- 删除当前无业务价值的 `x-has-session` 头逻辑

#### 3. `/api/auth/session` 进入“待删除候选”

`/api/auth/session` 当前是系统里第二个核心控制面。长期目标是删除，短期先降级为兼容层。

分两步走：

- Phase A：继续保留，但只给 `getAccessToken()` 与页面刷新恢复兜底
- Phase B：验证官方 `getCurrentSession()` + provider 恢复稳定后，再删除这条自定义恢复链

这样做是为了避免一次性同时替换登录、恢复、OAuth 三条主链路带来的联动风险。

#### 4. server proxy 只保留邮箱密码登录桥接

这条链路短期内大概率还得保留，因为当前仓库文档和已知经验都指向一个现实限制：

- refresh token 在 InsForge 登录响应的 `Set-Cookie` 中
- 前端跨域直登后，应用域名无法稳定获得 first-party refresh cookie

因此短期目标不是“删掉所有 proxy”，而是“把 proxy 压缩到只处理 email/password login 一件事”。

#### 5. `AuthContext` 退化为 UI-facing wrapper

`AuthContext` 以后只负责：

- 暴露项目统一接口：`signIn`、`signUp`、`signOut`、`verifyEmail`、`updateProfile`
- 登录后的业务初始化：`syncUserWithSubscriptions()`
- 极薄的 loading / redirect 协调

`AuthContext` 不再负责：

- 自己维护一套隐式 token 生命周期
- 扮演第二个 session 恢复引擎
- 手工 `sdk.setUser()` 作为主恢复机制

### 分层边界

#### 允许保留的自定义能力

- 邮箱密码 server proxy login
- `.themarketbrew.com` cookie domain 兼容
- 登录页 UI、自定义错误翻译、redirect path 管理
- `/verify-email` 自定义验证页体验
- 登录成功后的订阅同步与日报自动订阅

#### 优先删除的自定义能力

- Google OAuth callback/exchange/PKCE
- 手工 callback URL 清理
- `sdk.setUser()` 作为主恢复手段
- 非必要的 localStorage / in-memory / cookie 多层同步
- 自定义 middleware

#### 条件删除的自定义能力

- `/api/auth/session`
- `getAccessToken()` 中对 `/api/auth/session` 的回退
- `syncClientAuthSession()` 中的本地 token/user 双写

## 数据流

### 目标登录流

```text
邮箱密码登录
  -> /login
  -> AuthContext.signIn()
  -> POST /api/auth { action: 'login' }
  -> server proxy 调 InsForge /api/auth/sessions
  -> 写 first-party cookies
  -> provider / SDK 读取会话
  -> 页面跳转
```

### 目标 OAuth 流

```text
Google 登录
  -> AuthContext.signInWithGoogle()
  -> InsForge SDK signInWithOAuth()
  -> Google 回跳
  -> provider / SDK 自动恢复 session
  -> 页面跳转
```

### 目标刷新恢复流

```text
应用挂载
  -> provider / SDK 优先恢复
  -> 如果恢复稳定：直接完成
  -> 如果当前阶段仍保留 /api/auth/session：
       仅在 getCurrentSession() 失败时兜底一次
```

## API 变更

### 保留

- `POST /api/auth` 中 `action=login`
- `GET/POST/DELETE /api/auth` 的默认 handler

### 删除

- `GET /api/auth/oauth-callback`

### 待阶段性删除

- `GET /api/auth/session`

### 行为调整

- `DELETE /api/auth` 继续清理本域 cookie
- 不再在 auth route 中承载 OAuth code exchange

## 前端变更

### `frontend/src/lib/auth.ts`

- 删除手工 PKCE 相关函数
- 删除直接请求 `/api/auth/oauth/google` 的逻辑
- 将 `signInWithGoogle()` 改为官方 SDK 调用
- 重新梳理 `getAccessToken()`，优先官方 session 恢复，减少自定义 fallback
- 标记并逐步删除兼容残留：
  - `cleanupAuthCallbackUrlParams()`
  - `consumeForcedReauthReason()`
  - `getAccessTokenResolution()`

### `frontend/src/contexts/AuthContext.tsx`

- 将 `sdk.setUser(...)` 从主链路中移除或降为短期兼容补丁
- 将 session 恢复判断收缩为“读取 provider 状态为主”
- 保留注册、验证邮箱、更新资料、登出等 UI-facing 包装
- 把业务初始化逻辑显式标记为 post-auth hooks，而不是 auth recovery 一部分

### `frontend/src/app/api/auth/route.ts`

- 保留 login proxy
- 删除与 OAuth callback 相关的假设
- 审核 `DELETE` 时的 cookie 清理是否仍需要 `insforge-user`

### `frontend/src/app/api/auth/session/route.ts`

- Phase A：保留但限制职责，只作为兼容兜底
- Phase B：删除文件与对应引用

### `frontend/src/app/api/auth/oauth-callback/route.ts`

- 删除

### `frontend/middleware.ts`

- 改为官方 `InsforgeMiddleware`
- 梳理 `publicRoutes`

### `frontend/src/app/login/page.tsx`

- 保留 UI、redirect、错误翻译
- 调整 Google 登录按钮只触发官方 OAuth

## 文档变更

需要同步更新：

- `frontend/docs/auth.md`
- `frontend/src/app/api/auth/.context.md`
- `frontend/src/contexts/.context.md`
- `frontend/src/lib/.context.md`
- `frontend/docs/pages.md`
- 如删除 `/auth/callback` 或 `/api/auth/oauth-callback`，同步修正页面与回调说明

还需要顺手审计：

- `frontend/docs/components.md` 中对 AuthContext / OAuth callback 的陈旧描述

## 实施步骤

1. [x] 建立基线测试，锁定当前可工作的登录、注册、刷新恢复、OAuth、登出行为。
2. [x] 将 `middleware.ts` 改回官方 `InsforgeMiddleware`，明确公开路由和受保护路由。
3. [x] 删除 `frontend/src/app/api/auth/oauth-callback/route.ts`，同时删掉 `frontend/src/lib/auth.ts` 中的手工 PKCE 与 exchange 逻辑。
4. [x] 将 Google 登录切换到官方 `signInWithOAuth()` 默认链路，并验证 callback 后 session 能被 provider 正常恢复。
5. [x] 收缩 `AuthContext.tsx`：把 provider 状态作为主真相，移除 `sdk.setUser()` 主恢复职责，只保留必要的 UI 包装和业务初始化。
6. [ ] 收缩 `lib/auth.ts`：减少 `_cachedToken`、localStorage、cookie recovery 之间的重复同步，删除兼容残留导出或标记废弃。
7. [x] 将 `/api/auth/session` 改为兼容兜底模式，只服务少数恢复失败场景，不再作为默认主链路。
8. [ ] 在一轮手工验证后评估 `/api/auth/session` 的调用频率与必要性，若官方恢复已稳定，则删除该 route 及调用代码。
9. [ ] 保留并巩固邮箱密码 login proxy，只处理 refresh token 桥接，不再承载其他 auth 动作。
10. [x] 审核 `syncClientAuthSession()`、`clearStaleAuthStateWithoutRedirect()`、`getAccessTokenResolution()` 这些历史兼容接口，删除未被实际依赖的部分。
11. [x] 更新 auth 相关文档与 `.context.md`，修正文档和代码漂移。
12. [ ] 跑完整验证：Vitest、受影响页面手测、登录/OAuth/刷新/登出回归。

## 当前进度

- 已记录基线提交：`66b0dbf2158e04dc0c6256fc43576a3348b843a4`
- 已保存未提交 auth 差异快照：
  - `docs/plans/auth-official-alignment-baseline.md`
  - `docs/plans/auth-official-alignment-baseline.patch`
- 已完成 Phase 1：
  - 删除自定义 `oauth-callback` route
  - `signInWithGoogle()` 切回官方 `signInWithOAuth()`
  - 本地验证：
    - `npm run build` 通过
    - 相关 Vitest 4 个文件、37 个测试全部通过
- 已完成 Phase 2：
  - `middleware.ts` 切回官方 `InsforgeMiddleware`
  - 以当前代码行为为准，保护 `/for-you*`、`/profile`、`/macro*`、`/sectors*`、`/screener` 及相关旧别名
  - 本地验证：
    - `npm run build` 通过
    - 相关 Vitest 通过
- 已完成保守版 Phase 3：
  - `AuthContext` 不再直接 `fetch('/api/auth/session')`
  - 页面层统一改为先走 `getAccessToken()`，只在内部按需 fallback 到 `/api/auth/session`
  - `sdk.setUser()` 继续保留为兼容桥接，而不是主恢复引擎
  - `auth.ts` 已删除未使用的 `consumeForcedReauthReason()`、`getAccessTokenResolution()`、`resetStaleAuthState()` 等历史兼容空壳
  - 本地验证：
    - `npm run build` 通过
    - `AuthContext` / `auth` / `login` 相关 Vitest 通过
    - 真实浏览器验证通过：
      - 清除 `insforge-auth-token` / `insforge-auth-user` 后重新访问 `/profile`
      - 页面仍可恢复为已登录状态
      - localStorage 会被重新写回
- 暂未推进 Phase 4：
  - `/api/auth/session` 仍保留
  - 当前评估结果表明：
    - 它已经不是页面主恢复链，而是 `getAccessToken()` 内部的最后兜底
    - `AuthContext`、`api.ts`、`SubscriptionContext` 都通过 `getAccessToken()` 间接依赖它
    - 在“清空 localStorage 后仍能恢复登录态”的场景下，它大概率仍然参与了恢复
  - 因此在没有明确证据证明 SDK 官方恢复已完全覆盖前，不应提前删除

## 验证方案

### 自动化验证

- 基线要求
  - 改造前先在当前分支记录一轮基线结果，作为“当前状态”的回滚对照
  - 至少保存以下信息：
    - `npm test` 结果
    - `npm run build` 结果
    - 登录、刷新恢复、登出、Google OAuth 的手测结论

- `frontend/src/contexts/__tests__/AuthContext.test.tsx`
- `frontend/src/lib/__tests__/auth.test.ts`
- `frontend/src/app/api/auth/__tests__/helpers.test.ts`
- `frontend/src/app/auth/callback/__tests__/page.test.tsx` 或相应替换测试
- `frontend/src/app/login/__tests__/page.test.tsx`
- `npm test`
- `npm run build`

### 手动验证

#### A. 邮箱密码登录

1. 打开 `/login`
2. 输入测试账号 `voya.technologies@gmail.com / 123456`
3. 点击登录
4. 验证结果：
   - 跳转到预期业务页
   - 页面顶部不出现错误提示
   - React Query 依赖的受保护接口请求成功
   - 本域 cookie 中存在 `insforge-session`
   - 如当前阶段仍保留 bridge，则存在 `insforge-refresh` 与 `insforge-csrf`

#### B. 页面刷新恢复

1. 在已登录状态下刷新 `/for-you`、`/profile`、`/today`
2. 验证结果：
   - 不出现错误跳回 `/login`
   - `AuthContext` 最终为已登录
   - 页面业务数据能够继续加载
   - 首帧 loading 可接受，不出现持续空白或死循环重定向

#### C. 浏览器重开恢复

1. 登录后关闭浏览器标签页或整个浏览器
2. 重新打开站点
3. 验证结果：
   - 仍然保持登录态，或在一次短暂恢复后进入登录态
   - 如果不能恢复，则本次改造视为未达标

#### D. 登出

1. 点击登出
2. 验证结果：
   - 跳回未登录态
   - 受保护页面重新访问会被拦截
   - 本地 localStorage 中 auth 相关数据被清理
   - 应用域名 cookie 被清理

#### E. Google OAuth

1. 点击“使用 Google 登录”
2. 走完整授权流程
3. 验证结果：
   - 成功回跳应用
   - 回跳后 provider 能恢复登录态
   - 不再依赖 `/api/auth/oauth-callback`
   - 页面按预期跳转到目标页

#### F. 注册与邮箱验证

1. 注册新账号
2. 进入 `/verify-email`
3. 输入验证码
4. 测试 resend verification
5. 验证结果：
   - 验证成功后用户可进入登录态或跳到预期下一步
   - 自定义验证页体验不回退

#### G. 路由保护

1. 未登录访问受保护页
2. 已登录访问同一路由
3. 验证结果：
   - 未登录时由官方 middleware 正确重定向
   - 已登录时不会误拦截
   - 公开页不受影响

#### H. 多域 cookie 兼容

仅生产或可模拟环境验证：

1. 在 `themarketbrew.com` 登录
2. 切到 `www.themarketbrew.com`
3. 验证结果：
   - 登录态按预期共享
   - 不出现双份 cookie 或一个域登录另一个域失效

### 分阶段验收门槛

#### Phase 1 验收门槛：OAuth 官方化

必须全部满足：

1. Google OAuth 成功率不低于当前实现
2. 删除 `frontend/src/app/api/auth/oauth-callback/route.ts` 后，登录流程不依赖它
3. `npm test` 与 `npm run build` 通过

#### Phase 2 验收门槛：middleware 官方化

必须全部满足：

1. 受保护页未登录必拦，已登录不误拦
2. 公开页无回归
3. 不再依赖当前 `x-has-session` 头

#### Phase 3 验收门槛：AuthContext / token 管理收缩

必须全部满足：

1. 邮箱密码登录成功
2. 页面刷新恢复成功
3. 浏览器重开恢复成功
4. 登出成功
5. 注册与邮箱验证无回归

#### Phase 4 验收门槛：尝试删除 `/api/auth/session`

只有在以下全部满足时才允许删除：

1. provider + 官方 session 恢复在本地与预发连续多轮验证稳定
2. 刷新恢复与浏览器重开恢复不依赖 `/api/auth/session`
3. 受保护 API 拿 token 不再需要 fallback 到 `/api/auth/session`

## 风险

### 高风险

- 官方 OAuth callback 链路与当前站点 redirect 配置不一致，导致 Google 登录回跳失败。
- 去掉 `sdk.setUser()` 后，provider 对 server proxy 登录结果的感知不如预期。

### 中风险

- `/api/auth/session` 删除过早，导致页面刷新恢复回退。
- middleware 改回官方后，现有公开页/私有页清单遗漏。

### 低风险

- 文档更新不完整，再次形成代码与文档漂移。

## 回滚策略

本计划的回滚目标不是“回到更早版本”，而是明确回到你当前确认可工作的这版状态，也就是开始实施本计划之前的仓库状态。

### 回滚基线

实施前必须先记录一份“当前状态基线”：

1. 当前分支名与提交哈希
2. 当前 auth 相关文件列表
3. 当前通过的测试结果
4. 当前手动验证结论

建议至少覆盖这些文件作为回滚观察面：

- `frontend/src/lib/auth.ts`
- `frontend/src/lib/insforge.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/components/Providers.tsx`
- `frontend/src/app/api/auth/route.ts`
- `frontend/src/app/api/auth/session/route.ts`
- `frontend/src/app/api/auth/oauth-callback/route.ts`
- `frontend/middleware.ts`
- `frontend/docs/auth.md`
- `frontend/src/app/api/auth/.context.md`
- `frontend/src/contexts/.context.md`
- `frontend/src/lib/.context.md`

### 回滚原则

1. 只回滚本计划引入的改动，不碰无关变更。
2. 按阶段回滚，优先回滚最新一层改动，不做整包式盲回退。
3. 任何阶段只要触发 P0 问题，立即停止继续推进后续阶段。

### P0 回滚触发条件

出现任一情况就必须回滚到当前状态或最近一个稳定阶段：

1. 邮箱密码登录不可用
2. Google OAuth 不可用
3. 页面刷新后大面积丢登录态
4. 浏览器重开后无法恢复登录态
5. 登出后仍残留登录态
6. 受保护路由误放行或误拦截
7. 生产域名 `themarketbrew.com` / `www` 的 cookie 共享被破坏

### 分阶段回滚方案

#### 回滚 Phase 1：OAuth 官方化失败

适用场景：

- 官方 OAuth redirect 配置不完整
- provider 无法正确恢复 Google 登录态
- 回跳路径或目标页跳转异常

回滚动作：

1. 恢复 `frontend/src/app/api/auth/oauth-callback/route.ts`
2. 恢复 `frontend/src/lib/auth.ts` 中的 PKCE 与手工 exchange 实现
3. 恢复登录页和相关页面对当前 callback 流的依赖
4. 重新跑 OAuth 手测与 `npm test`

这类失败只回滚 OAuth，不影响后续是否继续做 middleware 官方化。

#### 回滚 Phase 2：middleware 官方化失败

适用场景：

- 公开页被误拦截
- 私有页未被保护
- 登录后仍被重定向到 `/login`

回滚动作：

1. 恢复当前 `frontend/middleware.ts`
2. 暂停 middleware 官方化，保留其他已成功变更
3. 用当前实现继续推进其他阶段，后面单独再处理 middleware

#### 回滚 Phase 3：AuthContext / token 管理收缩失败

适用场景：

- provider 无法稳定感知 email/password 登录后的状态
- 刷新恢复变差
- `sdk.setUser()` 删除后出现实际回归

回滚动作：

1. 恢复 `frontend/src/contexts/AuthContext.tsx`
2. 恢复 `frontend/src/lib/auth.ts` 中现有 token cache / fallback 逻辑
3. 恢复 `syncClientAuthSession()`、`setCachedToken()`、`sdk.setUser()` 的当前行为
4. 重新验证登录、刷新、登出

#### 回滚 Phase 4：删除 `/api/auth/session` 失败

适用场景：

- 官方 `getCurrentSession()` 仍不足以覆盖刷新恢复
- 受保护 API 丢 token
- 页面刷新恢复退化

回滚动作：

1. 恢复 `frontend/src/app/api/auth/session/route.ts`
2. 恢复 `frontend/src/lib/auth.ts` 中对 `/api/auth/session` 的 fallback
3. 恢复 `AuthContext.tsx` 中必要的一次性 recovery 调用

这是本计划里最容易需要回滚的一步，因此必须最后做。

### 完整回滚到“当前状态”的方案

如果多阶段改造后整体效果不达标，执行完整回滚：

1. 将本计划涉及文件整体恢复到实施前基线版本
2. 恢复当前文档描述
3. 重新执行基线验证：
   - `npm test`
   - `npm run build`
   - 邮箱密码登录
   - 页面刷新恢复
   - 浏览器重开恢复
   - Google OAuth
   - 登出
4. 只有当以上验证重新全部通过，才视为回滚完成

### 回滚后的结论要求

如果最终需要完整回滚，必须产出一份简短复盘，至少说明：

1. 是哪一层官方能力没有满足当前部署现实
2. 失败发生在 OAuth、middleware、还是 session recovery
3. 哪些自定义逻辑在当前阶段仍然必须保留
4. 下次如果再次尝试官方化，需要先补什么前置条件

## 待定问题

1. 对于“邮箱密码登录后 provider 是否能自动稳定感知 session”，是否需要保留一个极薄的 bridge，同步一次用户状态？
2. 如果官方 `getCurrentSession()` 在当前跨域部署下仍不能稳定恢复，`/api/auth/session` 是否应长期保留为基础设施，而不是视为临时兼容层？
3. `/auth/callback` 页面是否还需要保留为兼容落地页，还是可以随着 OAuth 官方化一起删除？
4. 生产环境是否已有完整的 Google OAuth redirect URL 配置，能够覆盖 `themarketbrew.com` 与 `www.themarketbrew.com` 两个入口？
