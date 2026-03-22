# Clerk Auth 迁移 Engineering Plan

> Status: Planning
> Related: frontend/docs/auth.md, backend/app/core/deps.py
> Created: 2026-03-20
> Updated: 2026-03-20 (Review #2: 补充用户体验保全、安全修复、架构决策)

## 目标

将认证系统从 Insforge 自带 auth 迁移到 Clerk，消除手写登录/刷新/恢复逻辑，用成熟的托管服务替代。

**用户体验红线**：迁移后用户感知不到变化——登录/注册/验证/重置密码的流程和中文 UI 保持不变，现有用户用原密码无感登录。

## 现状

### 当前架构的问题

- **手写逻辑过多**：Server Proxy 登录、Cookie 管理、Token 刷新、Session 恢复、OAuth 回调——全部手写，频繁出 bug
- **三层 token fallback**：memory cache → SDK session → cookie recovery，任一层出问题就登录异常
- **middleware 脆弱**：从简单 pass-through 到 InsforgeMiddleware，每次改都引入新问题
- **跨域 cookie 复杂**：`.themarketbrew.com` 域名 cookie + Insforge 自己的 cookie，两套并存
- **历史教训**：18 天内 4 次 auth plan（auth-hardening → remove-insforge-nextjs → auth-rollback-simplification → auth-official-alignment），每次都没彻底解决，根因是 Insforge 的跨域 cookie 架构

### 当前认证文件清单

**后端（改动小）**：
- `backend/app/core/deps.py` — `verify_user_token()` 通过 Insforge API 验证 Bearer token，60s 内存缓存
- `backend/app/core/deps.py` — `verify_user_token_with_email()` 返回 user_id + email（用于 subscription preferences）
- `backend/app/features/*/router.py` — 27 个用户端点用 `Depends(verify_user_token)`，10 个管理端点用 `Depends(verify_cron_secret)`
- `backend/edge_functions/*.js` — 13 个 Edge Function，其中 `user-watchlists.js` 验证 token，`user-digests.js` 和 `sector-subscriptions.js` **无 token 验证（安全漏洞）**

**前端（改动大，也是 bug 集中区）**：
- `frontend/src/lib/auth.ts` — signIn/signUp/OAuth/getAccessToken/token refresh（~400 行手写逻辑）
- `frontend/src/lib/auth-storage.ts` — localStorage 清理工具（keys: `insforge-auth-token`, `insforge-auth-user`）
- `frontend/src/lib/auth-redirect.ts` — redirect 路径管理 + sanitize（独立于 auth provider，可保留）
- `frontend/src/lib/auth-verification.ts` — 邮箱验证状态管理 via sessionStorage（独立于 auth provider，可保留）
- `frontend/src/contexts/AuthContext.tsx` — React Context，包含 session recovery、subscription sync、auto-subscribe
- `frontend/src/contexts/SubscriptionContext.tsx` — 依赖 `useAuth()` 获取 user + token，管理 isPro 状态
- `frontend/src/app/api/auth/route.ts` — Server Proxy 登录 + cookie 设置
- `frontend/src/app/api/auth/session/route.ts` — Session 恢复 + token refresh
- `frontend/src/app/api/auth/helpers.ts` — Cookie 工具函数（`.themarketbrew.com` domain）
- `frontend/middleware.ts` — 路由保护（当前是 pass-through，检查 `insforge-session` cookie）
- `frontend/src/lib/insforge.ts` — SDK 初始化
- `frontend/src/components/Providers.tsx` — InsforgeBrowserProvider 包裹

**使用 auth 的 UI 组件**：
- `frontend/src/app/login/page.tsx` — 登录/注册表单 + 18 条中文错误翻译
- `frontend/src/app/verify-email/page.tsx` — 6 位验证码输入（自动跳格、粘贴、退格回跳）
- `frontend/src/app/forgot-password/page.tsx` — 3 步向导（邮箱 → 验证码 → 新密码）
- `frontend/src/app/reset-password/page.tsx` — 从邮件链接直接重置
- `frontend/src/app/auth/callback/page.tsx` — OAuth 回调落地页
- `frontend/src/app/profile/page.tsx` — 用户资料编辑 + 订阅偏好
- NavAuth 组件 — 导航栏用户菜单（显示名字、登出）
- PaywallGuard 组件 — 付费墙（依赖 SubscriptionContext → AuthContext）

**数据库**（user_id 外键）：
- `subscriptions` 表 — `user_id` (UUID string)
- `user_watchlists` 表 — `user_id`
- `personal_digests` 表 — `user_id`
- `user_feedback` 表 — `user_id`
- `picker_conversations` 表 — `user_id`
- `sector_subscriptions` 表 — `user_id`
- Stripe `customer` — metadata 含 `user_id`
- Resend contacts — metadata 含 `user_id`

## 设计

### 目标架构

```
┌──────────────────────────────────────────────────────────┐
│  Clerk (托管服务)                                         │
│  - 密码/OAuth/MFA 全部由 Clerk 管理                       │
│  - 前端: <ClerkProvider> + 自定义中文 UI + useSignIn()    │
│  - 中间件: clerkMiddleware() 自动保护路由                  │
│  - Session: Clerk 自动管理，无需手写 refresh               │
└────────────────────┬─────────────────────────────────────┘
                     │ webhook: user.created / user.updated
                     ▼
┌──────────────────────────────────────────────────────────┐
│  后端 (FastAPI)                                           │
│  - verify_user_token: PyJWT + JWKS 本地验证 Clerk JWT     │
│  - webhook endpoint: 同步用户 + 自动订阅 daily_report     │
│  - 业务数据: 全部用 clerk_user_id 做外键                   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Insforge (纯数据库，不再用其 auth 功能)                    │
│  - users 表: clerk_id (PK/unique), email, name            │
│  - 业务表: user_id → clerk_id                             │
│  - Edge Functions: 用 service_role key 操作，不再验 token  │
└──────────────────────────────────────────────────────────┘
```

### 核心设计决策

**1. 用户 ID 策略：直接用 Clerk user_id 替换 Insforge user_id**

Clerk 的 user_id 格式是 `user_2abc...`（string），当前 Insforge 是 UUID string。两者都是 string 类型，数据库字段兼容。需要做数据迁移：为每个现有用户建立 `insforge_uid → clerk_uid` 映射。

**2. 前端策略：自定义中文 UI + Clerk hooks（不用 Clerk 预制组件）**

Clerk 的 `<SignIn />`、`<SignUp />` 是英文组件，与当前中文 UI 不一致。为保持用户体验不变，保留自定义表单 UI，只替换底层 auth 调用：

| 当前 | 迁移后 |
|------|--------|
| 手写 `<form>` + `signIn()` via Server Proxy | 保留 `<form>` + Clerk `useSignIn()` hook |
| 手写注册表单 + `sdk.signUp()` | 保留表单 + Clerk `useSignUp()` hook |
| 手写 6 位验证码输入 | 保留 UI + Clerk `useSignUp().attemptEmailAddressVerification()` |
| 手写 3 步密码重置向导 | 保留 UI + Clerk `useSignIn().resetPasswordEmailCode` strategy |
| `useAuth()` (自建 Context) | 保留 thin wrapper，内部用 Clerk `useUser()` + `useAuth()` |
| `InsforgeBrowserProvider` | `<ClerkProvider>` |
| 手写 middleware | `clerkMiddleware()` |
| `/api/auth/route.ts` (Server Proxy) | **删除** |
| `/api/auth/session/route.ts` (refresh) | **删除** |
| `auth.ts` 400 行手写逻辑 | ~50 行 wrapper |

**3. Token 注入策略：全局 token store（解决 api.ts 非 React 上下文问题）**

`api.ts` 是纯 TypeScript 模块（不在 React 组件树内），不能直接调 `useAuth().getToken()`。方案：

```typescript
// lib/auth.ts（迁移后 ~50 行）
let _clerkGetToken: (() => Promise<string | null>) | null = null;

// AuthContext 初始化时注入
export function setTokenGetter(fn: () => Promise<string | null>) {
  _clerkGetToken = fn;
}

// api.ts 继续调这个函数，签名不变
export async function getAccessToken(): Promise<string | null> {
  if (!_clerkGetToken) return null;
  return _clerkGetToken();
}
```

```typescript
// AuthContext.tsx 中注入
const { getToken } = useAuth(); // Clerk hook
useEffect(() => {
  setTokenGetter(() => getToken());
}, [getToken]);
```

这样 `api.ts` 的 `_authHeaders()` 和所有 27+ 个 API 调用完全不需要改。

**4. 后端策略：PyJWT + JWKS 本地验证（不用 Clerk beta SDK）**

```python
# backend/app/core/clerk_auth.py
import jwt
from jwt import PyJWKClient

CLERK_JWKS_URL = f"https://{CLERK_FRONTEND_API}/.well-known/jwks.json"
jwks_client = PyJWKClient(CLERK_JWKS_URL, cache_keys=True)

def verify_clerk_jwt(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(token, signing_key.key, algorithms=["RS256"],
                      options={"verify_aud": False})
```

`clerk-backend-api` 是 beta 包，不在生产依赖中使用。只需 `pip install pyjwt[crypto]`。

**5. Dual-mode 过渡：后端同时接受两种 token**

Phase 1 切后端、Phase 4-6 切前端，中间有窗口期。后端必须同时接受 Clerk JWT 和 Insforge token：

```python
# deps.py 过渡期
async def verify_user_token(authorization: str = Header(None)) -> str:
    token = authorization[7:]
    # 先尝试 Clerk JWT（本地验证，快）
    clerk_uid = try_verify_clerk_jwt(token)
    if clerk_uid:
        return clerk_uid
    # 回退到 Insforge API 验证（过渡期）
    return await verify_insforge_token(token)
```

前端全部切完后，移除 Insforge 回退路径。

**6. Edge Function 策略：改用 service_role + 修复安全漏洞**

当前 Edge Function 各自验证 Bearer token。迁移后：
- 后端用 service_role key 调 Edge Function（内部调用，已有 `X-Internal-Secret` 机制）
- Edge Function 不再需要验证用户 token，由后端 `verify_user_token` 统一把关
- **同时修复**：`user-digests.js` 和 `sector-subscriptions.js` 当前无 token 验证（安全漏洞），迁移后通过后端统一鉴权解决

**7. Webhook 同步 + 自动订阅**

当前 `AuthContext.tsx` 里有业务逻辑：首次登录自动订阅 daily_report。迁移后移到 webhook（更可靠）：

```
POST /api/webhooks/clerk
├── user.created
│   ├── INSERT INTO users (clerk_id, email, name)
│   ├── api.subscriptions.syncUser(clerk_id, email, name)
│   └── api.subscriptions.subscribe('daily_report', ...)  ← 从 AuthContext 迁移过来
├── user.updated → UPDATE users SET email=..., name=... WHERE clerk_id=...
└── user.deleted → UPDATE users SET deleted_at=now() WHERE clerk_id=...
```

**8. Profile 更新策略：name 存 Clerk `firstName`**

Clerk 把名字拆成 `firstName` + `lastName`。当前只有一个 `name` 字段。方案：
- 存到 Clerk `firstName`，`lastName` 留空
- `useUser().user.firstName` 获取
- `user.update({ firstName: name })` 更新
- 保留 profile 页面现有 UI，只改底层调用

### 数据流变化

```
当前:
  前端 → Server Proxy → Insforge Auth API → 返回 token → 前端存 cookie
  前端 → 后端 API (Bearer token) → deps.py 调 Insforge API 验证 → 返回数据

迁移后:
  前端 → Clerk (全托管) → 自动获取 session token
  前端 → 后端 API (Bearer token) → deps.py 本地验证 Clerk JWT → 返回数据
  前端 → api.ts → getAccessToken() → 内部调 Clerk getToken() → Bearer header
```

### API 接口变化

**后端 API 接口：不变**。`Depends(verify_user_token)` 签名不变，只改内部实现。

**前端页面路由：路径不变，内部实现替换**。

| 路由 | 变化 |
|------|------|
| `/login` | 保留自定义中文表单 + 18 条错误翻译，底层换 Clerk `useSignIn()` / `useSignUp()` |
| `/verify-email` | 保留自定义 6 位验证码 UI，底层换 `useSignUp().attemptEmailAddressVerification()` |
| `/forgot-password` | 保留 3 步向导 UI，底层换 Clerk `useSignIn()` reset flow |
| `/reset-password` | 保留自定义 UI，底层换 Clerk reset flow |
| `/auth/callback` | **删除**（Clerk 自动处理 OAuth 回调） |
| `/profile` | 保留 UI，`updateProfile()` 内部换 Clerk `user.update()` |
| 其他页面 | `useAuth()` 保留（thin wrapper），import 不变 |

## 实施步骤

### Phase 0: 准备（不改代码）

- [ ] 注册 Clerk 账号，创建 application
- [ ] 配置 Google OAuth provider（迁移现有 Google Cloud OAuth client ID）
- [ ] 在 Clerk Dashboard 开启 Email + Password 登录
- [ ] 在 Clerk Dashboard 开启 Email verification（code 模式，匹配当前 6 位验证码 UX）
- [ ] 记录 `CLERK_SECRET_KEY`、`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] 确认 Clerk 定价：当前 MAU 是否在免费 10,000 内
- [ ] 规划现有用户数据迁移方案（Insforge user_id → Clerk user_id 映射）

### Phase 1: 后端 — Clerk JWT 验证（dual-mode）

- [ ] `pip install pyjwt[crypto] svix`
- [ ] 新建 `backend/app/core/clerk_auth.py`：PyJWT + JWKS 本地验证
- [ ] 修改 `backend/app/core/deps.py`：dual-mode（先 Clerk → 回退 Insforge）
- [ ] `verify_user_token` 签名 `-> str` 不变（返回 user_id）
- [ ] `verify_user_token_with_email` 签名 `-> dict` 不变
- [ ] 保留 `verify_cron_secret` 不动
- [ ] 添加 `.env` 变量：`CLERK_SECRET_KEY`（JWKS URL 从 publishable key 推导，不需要单独配）
- [ ] 单元测试：验证 Clerk JWT 解析正确
- [ ] 单元测试：dual-mode 回退到 Insforge 正确

### Phase 2: 后端 — Webhook 端点 + 用户同步 + 自动订阅

- [ ] 新建 `backend/app/features/auth/router.py`：Clerk webhook handler
- [ ] `pip install svix` 实现 Svix 签名验证
- [ ] 处理 `user.created`：
  - 在 Insforge users 表创建用户行（upsert）
  - 调 `subscription.service.sync_user()` 同步到 Resend
  - 自动订阅 `daily_report`（从前端 AuthContext `syncUserWithSubscriptions` 迁移过来）
- [ ] 处理 `user.updated`：同步 email/name
- [ ] 处理 `user.deleted`：软删除
- [ ] 在 `main.py` 注册新 router（公开端点，不需要 auth）
- [ ] 在 Clerk Dashboard 配置 webhook URL
- [ ] 添加 `.env`：`CLERK_WEBHOOK_SIGNING_SECRET`

### Phase 3: 数据迁移

- [ ] 导出现有 Insforge 用户列表（id, email, password_hash, name）
- [ ] 写迁移脚本：用 Clerk Backend API `createUser()` 批量创建，传入 `passwordDigest` + `passwordHasher: 'bcrypt'`
- [ ] 建立映射表 `user_id_mapping (insforge_id, clerk_id)`
- [ ] 更新业务表的 `user_id`：`subscriptions`、`user_watchlists`、`personal_digests`、`user_feedback`、`picker_conversations`、`sector_subscriptions`
- [ ] 更新 Stripe customer metadata 中的 `user_id`
- [ ] 更新 Resend contacts metadata 中的 `user_id`
- [ ] 验证数据完整性：每张表迁移前后行数一致，无孤儿记录

### Phase 4: 前端 — Clerk SDK 集成

- [ ] `npm install @clerk/nextjs`
- [ ] 移除 `@insforge/nextjs`（认证部分）、保留 `@insforge/sdk`（数据库操作）
- [ ] `insforge.ts` 移除 `_capturedOAuthCode`（不再需要）
- [ ] 配置 `.env.local`：`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] 修改 `Providers.tsx`：`<InsforgeBrowserProvider>` 替换为 `<ClerkProvider>`
  - 保留 `<AuthProvider>` wrapper（thin wrapper over Clerk hooks）
  - 保留 `<SubscriptionProvider>` 不变
- [ ] 修改 `middleware.ts`：使用 `clerkMiddleware()` + `createRouteMatcher()`
  - 公开路由：`/`, `/login`, `/sign-up`, `/today`, `/api/webhooks/clerk`
  - 保护路由：`/for-you`, `/profile`, `/macro`, `/sectors`, `/screener`
- [ ] 重写 `auth.ts`（~400 行 → ~50 行）：
  - 删除 signIn/signUp/signInWithGoogle/signOut（Clerk 处理）
  - 删除 getAccessToken 三层 fallback、isTokenExpired、recoverTokenFromCookies
  - 保留 `getAccessToken()` 作为 thin wrapper（调用注入的 Clerk getToken）
  - 保留 `setTokenGetter()` 供 AuthContext 注入
  - 保留 `sendPasswordResetEmail`、`exchangeResetPasswordCode`、`resetPassword`（改为 Clerk 实现）
- [ ] 保留 `auth-redirect.ts` 不变（独立于 auth provider）
- [ ] 保留 `auth-verification.ts` 不变（sessionStorage 管理，独立于 auth provider）
- [ ] 删除 `auth-storage.ts`（localStorage keys 不再需要）

### Phase 5: 前端 — 认证页面迁移（保留现有 UI）

- [ ] `/login` 页面：
  - 保留自定义中文表单 UI 和 18 条错误翻译
  - 邮箱密码登录：表单 submit → `useSignIn().signIn.create({ identifier, password })`
  - 注册：表单 submit → `useSignUp().signUp.create({ emailAddress, password, firstName })`
  - Google OAuth：按钮点击 → `useSignIn().signIn.authenticateWithRedirect({ strategy: 'oauth_google' })`
  - 错误映射：Clerk 错误码 → 现有中文翻译（`form_identifier_not_found` → "邮箱不存在" 等）
- [ ] `/verify-email` 页面：
  - 保留 6 位验证码 UI（自动跳格、粘贴、退格回跳）
  - 提交验证码：`useSignUp().signUp.attemptEmailAddressVerification({ code })`
  - 重新发送：`useSignUp().signUp.prepareEmailAddressVerification({ strategy: 'email_code' })`
  - 邮件链接自动验证：检查 URL 参数，调 Clerk 验证 API
- [ ] `/forgot-password` 页面：
  - 保留 3 步向导 UI
  - Step 1：`useSignIn().signIn.create({ strategy: 'reset_password_email_code', identifier: email })`
  - Step 2：`useSignIn().signIn.attemptFirstFactor({ strategy: 'reset_password_email_code', code })`
  - Step 3：`useSignIn().signIn.resetPassword({ password })`
- [ ] `/reset-password` 页面：保留 UI，底层换 Clerk reset flow
- [ ] `/auth/callback` 页面：**删除**（Clerk 自动处理 OAuth 回调，在 Clerk Dashboard 配置 redirect URL）

### Phase 6: 前端 — AuthContext + 全局组件更新

- [ ] 重写 `AuthContext.tsx`（~425 行 → ~100 行）：
  - 用 Clerk `useUser()` 获取 user（映射到现有 `User` 接口：`{ id: user.id, email, name: user.firstName }`）
  - 用 Clerk `useAuth()` 获取 `isLoaded`, `isSignedIn`
  - 调 `setTokenGetter(() => getToken())` 注入 token getter 供 api.ts 使用
  - 删除 session recovery 逻辑（`recoveryPending`、`recoveryAttempted`）
  - 删除 `syncUserWithSubscriptions()`（已迁移到 Phase 2 webhook）
  - 保留 `signOut` wrapper（`useClerk().signOut()` + `queryClient.clear()`）
  - 保留 `updateProfile` wrapper（`useUser().user.update({ firstName: name })`）
  - 保留 `AuthContextType` 接口，减少下游改动
- [ ] 更新 `SubscriptionContext.tsx`：
  - `useAuth()` 来源不变（仍从自建 AuthContext import，接口兼容）
  - `getAccessToken()` 来源不变（仍从 auth.ts import）
  - 无需改动（如果 AuthContext wrapper 保持接口兼容）
- [ ] 更新 NavAuth 组件：
  - `useAuth()` 接口不变（user, signOut）
  - 应无需改动
- [ ] 更新 `api.ts`：
  - `_authHeaders()` 继续调 `getAccessToken()`（来自 auth.ts thin wrapper）
  - 无需改动
- [ ] 删除 `frontend/src/app/api/auth/route.ts`（Server Proxy）
- [ ] 删除 `frontend/src/app/api/auth/session/route.ts`（token refresh）
- [ ] 删除 `frontend/src/app/api/auth/helpers.ts`（cookie 工具）

### Phase 7: Edge Function 简化 + 安全修复

- [ ] `user-watchlists.js`：移除 `resolveAuthContext` 中的 Insforge token 验证，改为只接受 `X-Internal-Secret`
- [ ] `user-digests.js`：**安全修复** — 当前无 token 验证，迁移后由后端统一鉴权 + `X-Internal-Secret`
- [ ] `sector-subscriptions.js`：**安全修复** — 当前无 token 验证，迁移后由后端统一鉴权 + `X-Internal-Secret`
- [ ] 其他 Edge Function（stock-analyses, market-reports 等）：已用 anon key 或 cron secret，无需改动

### Phase 8: 测试 & 清理

**E2E 测试（覆盖所有用户体验链路）**：
- [ ] 邮箱密码登录 → 跳转 /today
- [ ] 登录错误提示（中文）
- [ ] Google OAuth 登录 → 跳转 /today
- [ ] 注册 → 邮箱验证码 → 验证成功 → 跳转
- [ ] 6 位验证码 UI：自动跳格、粘贴、退格
- [ ] 重新发送验证码
- [ ] 忘记密码 3 步流程
- [ ] 登出 → 清除所有状态 → 跳转 /login
- [ ] Session 持久化：刷新页面保持登录
- [ ] 受保护页面未登录 → 跳转 /login?redirect=...
- [ ] Profile 页面修改名字
- [ ] 新用户自动订阅 daily_report（webhook 触发）
- [ ] 后端 API 调用 Bearer token 验证正确

**清理**：
- [ ] 移除 `@insforge/nextjs` 包
- [ ] 移除 `insforge.ts` 中的 `_capturedOAuthCode`
- [ ] 移除 `auth-storage.ts`
- [ ] 清理旧 localStorage keys（首次加载时删除 `insforge-auth-token`、`insforge-auth-user`）
- [ ] 移除 `deps.py` 中的 Insforge 回退路径（dual-mode → Clerk only）
- [ ] 更新 `frontend/docs/auth.md`
- [ ] 更新相关 `.context.md` 文件
- [ ] 删除旧 auth plan：`auth-official-alignment*.md`、`auth-rollback-simplification.md`、`auth-hardening.md`、`remove-insforge-nextjs.md`
- [ ] 更新 `.env.example` 文件

## 回滚方案

当前已有回滚基线：
- **Commit**: `66b0dbf`（Insforge auth 稳定状态）
- **Patch**: `docs/plans/auth-official-alignment-baseline.patch`
- **方法**: `git checkout 66b0dbf -- <auth files>` 恢复所有前端 auth 文件

迁移策略：
- Phase 1 使用 dual-mode（Clerk + Insforge 并存），任何时候可以移除 Clerk 回退到 Insforge
- 前端切换前，Insforge auth 代码保留不删除
- 全部切完并稳定运行 1 周后，再执行 Phase 8 清理

## 已决定

1. **密码迁移**：✅ **直接迁移，用户无感**。Clerk `createUser()` API 支持 `passwordDigest` + `passwordHasher: 'bcrypt'` 参数，可直接导入 Insforge (bcrypt) 密码哈希。用户用原密码登录即可，首次登录后 Clerk 自动升级哈希格式。官方提供[批量迁移脚本](https://github.com/clerk/migration-script)。
2. **外键策略**：✅ **直接用 `clerk_id` (text) 做外键**。简单直接，业务表的 `user_id` 字段类型从 UUID string 改为 Clerk user_id string (`user_2abc...`)。迁移脚本统一更新。
3. **前端 UI 策略**：✅ **保留自定义中文 UI，不用 Clerk 预制组件**。用 `useSignIn()` / `useSignUp()` hooks + 现有表单，保持中文错误提示和验证码 UX 不变。
4. **Token 注入策略**：✅ **全局 token store 模式**。AuthContext 注入 Clerk `getToken` 到 `auth.ts`，`api.ts` 的 27+ 个 API 调用完全不改。
5. **后端 JWT 验证**：✅ **PyJWT + JWKS**，不用 Clerk beta SDK。只需 `pip install pyjwt[crypto]`。
6. **Webhook 验签**：✅ **svix Python 包**。`pip install svix`。
7. **自动订阅**：✅ **从 AuthContext 迁移到 webhook**。`user.created` 时自动订阅 daily_report，比前端 useEffect 更可靠。
8. **Profile name**：✅ **存 Clerk `firstName`**，`lastName` 留空。
9. **过渡策略**：✅ **dual-mode**。后端同时接受 Clerk JWT 和 Insforge token，前端全切完后移除回退。
10. **Insforge SDK 保留**：✅ **保留 `@insforge/sdk` 用于数据库操作**。移除 `@insforge/nextjs`。`insforge.ts` 初始化不再包含 auth 相关配置（无 `_capturedOAuthCode`）。

## 待定问题

1. **Clerk 定价**：免费计划 10,000 MAU，Pro $25/月。当前用户量是否在免费范围内？
2. **Clerk 邮箱验证方式**：Clerk 支持 `email_code`（6 位数字）和 `email_link`（点击链接），需要在 Dashboard 确认配置为 code 模式以匹配现有 UX。
3. **Google OAuth client ID 复用**：当前 Google Cloud 项目里的 OAuth client ID 能否直接配到 Clerk，还是需要新建？需要确认 redirect URI 变化。

## 用户体验保全检查清单

迁移完成后逐条验证，确保用户感知无变化：

| 体验 | 验证方法 | 通过标准 |
|------|----------|----------|
| 老用户用原密码登录 | 用测试账号 `voya.technologies@gmail.com` / `123456` | 一次成功，无需重置密码 |
| 登录错误中文提示 | 输入错误密码 | 显示"邮箱或密码错误"而非英文 |
| Google 一键登录 | 点击 Google 按钮 | 跳转 Google → 回来 → 进入 /today |
| 注册 + 邮箱验证 | 新邮箱注册 | 收到验证码 → 6 位输入 → 自动跳格 → 验证成功 |
| 忘记密码 | 走完 3 步 | 重置成功，用新密码登录 |
| 刷新页面不掉线 | 登录后 F5 | 仍然是登录状态 |
| 受保护页面拦截 | 未登录访问 /for-you | 跳转 /login?redirect=/for-you |
| 登录后跳回原页面 | 从 /for-you 被拦截 → 登录 | 登录后回到 /for-you |
| 登出 | 点击登出 | 清除所有状态，跳转 /login |
| Profile 改名 | 修改名字并保存 | 成功保存，导航栏显示新名字 |
| 新用户自动订阅 | 新注册用户 | 自动收到 daily_report 订阅 |
| 后端 API 正常 | 访问任意需要登录的功能 | 数据正常加载，无 401 |
