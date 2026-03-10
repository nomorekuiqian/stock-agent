# Auth Rollback Simplification Engineering Plan

> Status: Implemented
> Related: frontend/docs/auth.md, frontend/src/app/api/auth/.context.md, frontend/src/lib/.context.md, frontend/src/contexts/.context.md
> Vision: 产品策略.md > 账户体系稳定性 / 认证体验

## 目标

把认证体系回撤到 `044f1d2` 附近那套更简单、已被验证过的登录/会话恢复底座，同时保留当前注册体验中真正有价值的部分：邮箱验证码注册、验证页、密码可见性切换。

## 现状

当前认证体系已经演化成一套自定义状态机：

- 前端没有 `InsforgeBrowserProvider`，只保留 `@insforge/sdk`
- `AuthContext` 自己维护 user / isLoading / localStorage / callback / refresh / tab visibility recovery
- `/api/auth` 集中承载 `sign-in` / `refresh` / `verify-email` / `oauth-exchange` / `bridge-session` / `DELETE`
- `api.ts` 受保护请求多了一层恢复等待、三态结果、401 后强制 refresh 重试

这套设计的复杂点主要集中在：

1. 登录真相不再单一
   - SDK 状态
   - localStorage token
   - first-party cookies
   - React state
   这四层在当前实现里会互相兜底，排障成本高

2. `/api/auth` 职责过载
   - 既做登录/刷新，又做邮箱验证/OAuth exchange/session bridge
   - route handler 自身已经成为业务逻辑中心

3. 管控层过厚
   - `getAccessTokenResolution()` 区分 `authenticated / no_session / transient_failure`
   - `api.ts` 对受保护请求做轮询等待、401 后二次 refresh、错误翻译
   - `AuthContext` 又额外做 Strict Mode dedupe、URL 参数清理、tab 重新激活 recovery

相比之下，`044f1d2` 的底座更简单：

- 邮箱密码登录走 Server Proxy 登录
- 会话恢复只走单独的 `GET /api/auth/session`
- `AuthContext` 以 SDK user 为主，只在 SDK 无 user 时做一次 cookie recovery
- `getAccessToken()` 只有缓存 -> SDK session -> `/api/auth/session` 三步

## 设计

### 回撤目标

采用“旧底座 + 新注册体验”的混合方案，而不是把当前实现继续削薄：

```text
登录/会话恢复/管控
  -> 回到 044f1d2 风格

注册/验证邮箱/密码可见性
  -> 保留当前体验
```

这样做的原因：

1. 登录和会话恢复是当前故障高发区，适合整体回到已知稳定形态
2. 注册体验的增量基本是 UI 和有限的 SDK 调用，不必跟复杂恢复链绑定
3. 这样可以避免“只删一半复杂度”，最后留下新的半成品状态机

### 目标架构

```text
InsforgeBrowserProvider (@insforge/nextjs)
  -> SDK user / isLoaded 作为前端 auth 真相

AuthContext
  -> 登录：Server Proxy login
  -> 注册：SDK signUp + verify-email 页面
  -> 恢复：仅在 SDK 无 user 时调用 /api/auth/session

/api/auth
  -> 恢复旧的 createAuthRouteHandlers 底座
  -> 保留自定义 login proxy
  -> 删除当前多动作大路由

/api/auth/session
  -> 恢复独立 session verify + refresh

api.ts
  -> 回到简单 token 获取和普通 401 行为
```

### 已确认决策

1. Google OAuth 跟着一起回撤
   - 回到旧版 provider / handler 默认链路
   - 不保留当前手工 `oauth-exchange` / PKCE 搬运 / callback 接管方案

2. 保留 `.themarketbrew.com` cookie domain 策略
   - 这是生产域名归一化问题，不属于当前 auth 状态机复杂度来源
   - 回撤登录逻辑时保留这一层，避免 `www` / 裸域 cookie 分裂

3. `verify-email` 保留页面体验，但底层优先简化
   - 保留 `/verify-email` 页面、6 位验证码输入、resend、pending profile
   - 底层优先走 provider / SDK 默认链路
   - 只有在验证后无法稳定恢复 first-party session 时，才补最小必要的 proxy

4. 删除当前登录恢复提示体系
   - 不保留 `AuthRecoveryInstructions`
   - 不保留 forced reauth reason 提示文案

### 注册体验保留范围

以下功能保留，不随登录回撤一起删掉：

1. `/login` 页里的注册态切换
2. `PasswordField` 的密码显示/隐藏
3. `signUp(email, password, name, redirectPath?)`
4. `buildVerifyEmailPath()` / `storePendingVerification()`
5. `/verify-email` 自定义页面与 6 位验证码输入体验
6. `resendVerificationEmail`
7. 注册后补写 profile name

### 登录逻辑回撤范围

以下部分回到旧版思路：

1. 恢复 `InsforgeBrowserProvider`
2. `AuthContext` 不再自己维护复杂恢复状态机
3. 恢复 `/api/auth/session`
4. `getAccessToken()` 回到：
   - in-memory cache
   - SDK `getCurrentSession()`
   - `/api/auth/session`
5. `api.ts` 去掉：
   - 轮询等待恢复
   - `authenticated / no_session / transient_failure` 三态
   - 401 后统一 force refresh 再重试
6. 取消当前 callback URL 清理、tab visibility proactive refresh、forced reauth reason 这类控制补丁

### 管控部分回撤范围

这里的“管控部分”定义为认证控制面，而不是业务后端鉴权本身。

需要回撤的控制面：

1. 前端请求前的 auth recovery orchestration
2. 前端统一错误展示与强制恢复提示
3. 多套 token/cookie/localStorage 同步规则
4. 当前 middleware 里基于多个 cookie 的路由保护假设

不应该回撤的控制面：

1. 后端 `verify_user_token()` 这一层 Bearer token 校验
2. 业务 router 上的 `Depends(verify_user_token)` 身份边界
3. 注册验证码能力本身

### InsForge 后端 / 控制台需要不要改

结论：**大概率不需要改 InsForge 后端代码，只需要确认控制台配置不要被回退。**

需要保留的 InsForge 侧条件：

1. 邮箱注册后发送验证码/验证邮件的 auth 配置仍然开启
2. 当前 `verifyEmailMethod` 仍是你希望的模式（通常是 `code`）
3. OAuth redirect URL 如果回撤到旧链路，需要确认仍与旧 provider 流程兼容

需要改我们自己应用侧的地方，而不是 InsForge 后端的地方：

1. `frontend/package.json`
   - 重新引入 `@insforge/nextjs`
2. `frontend/src/components/Providers.tsx`
   - 恢复 `InsforgeBrowserProvider`
3. `frontend/src/contexts/AuthContext.tsx`
   - 回到轻量模式，再把注册验证能力嫁接进去
4. `frontend/src/app/api/auth/route.ts`
   - 从“多动作总线”回撤为“旧 route handler + login proxy”
   - 同时保留 `.themarketbrew.com` cookie domain 兼容
5. 新增/恢复 `frontend/src/app/api/auth/session/route.ts`
6. `frontend/src/lib/auth.ts`
   - 删除当前复杂 token lifecycle，恢复简单模式
7. `frontend/src/lib/api.ts`
   - 删除复杂 auth recovery waiting / force refresh retry

## 实施步骤

1. [x] 确认回撤基线以 `044f1d2` 为准，注册体验保留以 `e824c2a` 之后的 `/login`、`/verify-email`、`PasswordField` 为准。
2. [x] 重新引入 `@insforge/nextjs` 依赖，并恢复 `InsforgeBrowserProvider` 与旧版 provider 结构。
3. [x] 恢复独立的 `/api/auth/session` 路由，作为唯一 cookie recovery + refresh 入口。
4. [x] 将 `/api/auth/route.ts` 从当前多动作 handler 回撤到旧版结构，只保留 login proxy 与 SDK route handlers，并保留 `.themarketbrew.com` cookie domain 兼容。
5. [x] 重写 `AuthContext.tsx`：恢复“SDK user 为主、cookie recovery 为辅”的轻量模型，同时保留 `signUp` / `verifyEmail` / `resendVerificationEmail` / `PasswordField` 对应的注册体验。
6. [x] 重写 `lib/auth.ts`：删除 `getAccessTokenResolution()`、forced reauth、cleanup callback、复杂 refresh retry；恢复旧版 `getAccessToken()` 简单链路。
7. [x] 简化 `lib/api.ts`：移除 auth recovery wait、401 二次 retry、临时失败三态，回到旧版 bearer header 获取逻辑。
8. [x] 将 Google OAuth 一并回撤到旧 provider 自动回调链，删除当前手工 callback exchange / PKCE 接管。
9. [x] 对 `/login`、`/verify-email`、`/forgot-password` 做兼容检查，确保注册页仍然支持：
   - 邮箱验证码发送
   - 6 位验证码验证
   - 密码可见性切换
10. [x] 清理当前“控制面”残留逻辑：
   - `AuthRecoveryInstructions`
   - forced reauth reason
   - callback URL 参数额外清洗
   - tab visibility refresh
   - 其他与复杂恢复状态机绑定的错误提示
11. [x] 更新文档：
   - `frontend/docs/auth.md`
   - `frontend/src/app/api/auth/.context.md`
   - `frontend/src/lib/.context.md`
   - `frontend/src/contexts/.context.md`
12. [x] 补跑验证：
   - 登录
   - 注册 + 验证码
   - 验证后自动登录/跳转
   - 刷新页面恢复
   - 受保护接口 bearer token

## 当前实施顺序

1. 先恢复旧 auth 底座与 provider
2. 再把当前注册/验证邮箱体验嫁接回去
3. 最后清理管控层与文档

## 实施结果

本次已经完成的实际回撤结果：

1. 登录链路回到旧底座
   - `@insforge/nextjs` + `InsforgeBrowserProvider` 已恢复
   - `/api/auth` 回到默认 handler + `action=login` proxy
   - `/api/auth/session` 成为唯一 session recovery 入口

2. 注册体验保留
   - `/login` 注册态保留
   - `/verify-email` 页面与 6 位验证码输入保留
   - `PasswordField` 密码可见性保留
   - resend verification 与验证后补写 profile name 保留

3. 控制面已简化
   - 删除复杂 auth recovery wait / retry / forced reauth 体系
   - 删除登录页与业务页上的 `AuthRecoveryInstructions`
   - Google OAuth 改回 SDK/provider 默认链路

4. 验证已完成
   - `npm run build` 通过
   - auth 相关 Vitest 测试通过

## 已知备注

- `next build` 期间仍会出现 `baseline-browser-mapping` 过期警告
- `sitemap.xml` 在构建期拉取 reports 时仍会出现一次 `ECONNREFUSED` 日志，但不会导致构建失败
