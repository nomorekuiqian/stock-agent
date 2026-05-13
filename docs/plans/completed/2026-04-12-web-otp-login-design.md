# Web OTP 登录设计文档

**日期**: 2026-04-12  
**状态**: 待实现（计划已完成，需选定技术路线后执行）  
**范围**: Web 端（`frontend/`）邮箱 OTP 无密码登录，覆盖普通邮箱用户和 Google OAuth 用户

---

## 背景与目标

### 现有认证体系

| 层 | 技术 | 说明 |
|----|------|------|
| Web 前端 | `@insforge/sdk` | `signInWithPassword`、`signInWithOAuth(google)` |
| 后端验证 | FastAPI `verify_user_token` | 调 `GET /api/auth/sessions/current` 验 Insforge JWT |
| 微信小程序 | 自建 WeChat JWT | `wechat_unbound / email_only / bound` 三态，独立于 Insforge |
| OTP 工具 | `itsdangerous.URLSafeTimedSerializer` | 已在 `backend/app/features/wechat/jwt_utils.py` 实现，5 分钟 TTL |

### 目标

用户在 web 端 `/login` 页可以选择：
1. 原有密码登录（保持不变）
2. **新增**：输入邮箱 → 收到 OTP 邮件 → 点击链接 → 直接登录（获得完整 Insforge session）

OTP 必须对以下用户类型都有效：
- 普通邮箱注册用户（`emailVerified: true/false`，`providers: ["email"]`）
- Google OAuth 用户（`emailVerified: true`，`providers: ["google"]`，无密码）

---

## 研究发现

### Insforge SDK 完整 Auth 方法清单

```
signUp(email, password, name)              → session（若需邮箱验证则无 token）
signInWithPassword(email, password)        → session
signInWithOAuth(provider, redirectTo)      → OAuth URL
signInWithIdToken({provider: 'google', token}) → session（仅 Google）
verifyEmail({email, otp})                  → session ← 关键
resendVerificationEmail({email})           → void
sendResetPasswordEmail({email})            → void
exchangeResetPasswordToken({email, code})  → {token, expiresAt}
resetPassword({newPassword, otp})          → {message}（无 session！）
refreshSession({refreshToken})             → session
```

### Insforge REST API 完整 Auth 端点

| 端点 | 说明 |
|------|------|
| `POST /api/auth/users` | 注册 |
| `POST /api/auth/sessions` | 密码登录 → accessToken |
| `POST /api/auth/refresh` | 刷新 token |
| `GET /api/auth/sessions/current` | 验证当前 session |
| `POST /api/auth/email/send-verification` | 发验证码（设计用于注册后邮箱确认） |
| `POST /api/auth/email/verify` | `{email, otp}` → **accessToken + refreshToken** |
| `POST /api/auth/email/send-reset-password` | 发密码重置码 |
| `POST /api/auth/email/exchange-reset-password-token` | `{email, code}` → `{token}` |
| `POST /api/auth/email/reset-password` | `{newPassword, otp}` → `{message}`（无 session） |
| `GET /api/auth/users` *(admin)* | 列出用户（SERVICE_KEY） |
| `GET /api/auth/users/{id}` *(admin)* | 获取单个用户 |
| `DELETE /api/auth/users` *(admin)* | 删除用户 |
| `POST /api/auth/tokens/anon` *(admin)* | 生成匿名 token（用途待确认） |

### 关键约束（已确认）

1. **Insforge 无 "为任意用户创建 session" 的 admin 接口**。Admin API 只能 list/delete 用户，不能 impersonate 或 sign tokens for users。
2. **密码重置流不返回 session**，`resetPassword` 只返回 `{message}`，无法用于登录。
3. **`verifyEmail` 返回完整 session**，这是目前唯一的 OTP → accessToken 官方路径。
4. **`verifyEmail` 设计用于新用户邮箱确认**，对 `emailVerified: true` 用户的行为未在文档中明确，需实测。
5. `INSFORGE_SERVICE_KEY` 已在 `backend/app/core/config.py` 配置，目前仅用于 `GET /api/auth/admin/users`（按邮箱查用户）。
6. **Insforge 支持 Edge Functions**（Deno Subhosting），可在 Insforge 环境内运行自定义逻辑。

---

## 技术路线分析

### 路线 A：复用 Insforge 原生 `verifyEmail` flow

**流程**

```
用户输入邮箱
    → 前端 Server Action 调 insforge.auth.resendVerificationEmail({email})
    → Insforge 发 6 位验证码邮件
    → 用户输入验证码（或点击 link）
    → 前端调 insforge.auth.verifyEmail({email, otp})
    → 获得 accessToken + refreshToken
    → setAuthCookies → 登录成功
```

**Pros**
- 代码量最少，纯前端 Server Action，不需要动后端
- 直接获得标准 Insforge session，零架构变化
- 邮件由 Insforge 原生发送，不需要 Resend API

**Cons**
- `resendVerificationEmail` **是否对 `emailVerified: true` 用户有效未知**（Insforge 文档未说明）
- 如果 Insforge 拒绝对已验证用户发码，Google OAuth 用户（始终 `emailVerified: true`）将无法使用
- 验证码样式和文案由 Insforge 控制，无法定制
- 用于登录的 `verifyEmail` 调用本质上是 API misuse（设计用于注册后验证），Insforge 未来可能收紧限制

**可行性前提**：需要先测试 `resendVerificationEmail` 对 Google 用户（`emailVerified: true`）是否正常发码，以及 `verifyEmail` 对其是否返回 session。

**测试方法**
```bash
# 用 Google 账号邮箱测试
curl -X POST https://9wmhxyi4.us-east.insforge.app/api/auth/email/send-verification \
  -H "Content-Type: application/json" \
  -d '{"email": "voya.technologies@gmail.com"}'

# 收到验证码后
curl -X POST "https://9wmhxyi4.us-east.insforge.app/api/auth/email/verify?client_type=mobile" \
  -H "Content-Type: application/json" \
  -d '{"email": "voya.technologies@gmail.com", "otp": "<code>"}'
```

---

### 路线 B：FastAPI 自建 OTP + Insforge Edge Function 签发 Token

**流程**

```
用户输入邮箱
    → 前端调 POST /api/auth/otp/request
    → FastAPI：用 SERVICE_KEY 查 Insforge 确认用户存在
    → FastAPI：生成 itsdangerous OTP token，发邮件（Resend）
    → 用户点击链接 → /verify-email-otp?t=<token>
    → 前端 Server Action 调 POST /api/auth/otp/confirm
    → FastAPI：验证 OTP，调用 Insforge Edge Function
    → Edge Function（Insforge 环境内）：查用户 → 签发 Insforge JWT
    → FastAPI 返回 {accessToken, refreshToken}
    → 前端 setAuthCookies → 登录成功
```

**关键子组件：Insforge Edge Function**

在 Insforge 环境（Deno）内运行，SERVICE_KEY 鉴权，能访问 Insforge 内部数据库和 JWT 密钥：

```typescript
// insforge edge function: generate-user-token
Deno.serve(async (req) => {
  const serviceKey = req.headers.get("X-Service-Key");
  if (serviceKey !== Deno.env.get("SERVICE_KEY")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { userId } = await req.json();
  // 在 Insforge 环境内签发 JWT（需确认 Insforge 是否暴露 JWT secret 给 edge function）
  // ...
  return new Response(JSON.stringify({ accessToken, refreshToken }));
});
```

**Pros**
- 完全自控：OTP TTL、邮件模板、速率限制
- 复用已有微信 OTP 基础设施（`itsdangerous`、Resend）
- 对任意用户类型（Google/密码/未验证）均有效
- 防重放、速率限制已有实现参考（WeChat 路线）

**Cons**
- **Edge Function 能否在 Insforge 环境内签发任意用户 JWT 未经验证**，这是最大风险
- 需要额外建立 Edge Function（Deno TypeScript），维护成本增加
- 后端新增 2 个 FastAPI 端点 + 前端验证页 + 邮件模板
- Insforge Edge Function 的 JWT 签发权限需要测试确认

**可行性前提**：验证 Insforge Edge Function 能否访问 JWT signing secret 并签发有效的 user session token。

---

### 路线 C：FastAPI 自建 OTP + 临时密码桥接（Workaround）

**流程**

```
用户验证 OTP 成功
    → FastAPI 生成随机 64 位密码 temp_pw
    → FastAPI 用 SERVICE_KEY 调 PATCH /api/auth/admin/users/{userId} 更新密码
    → FastAPI 调 POST /api/auth/sessions {email, temp_pw} 获得 session
    → FastAPI 再次调 PATCH /api/auth/admin/users/{userId} 恢复为随机密码（防止 temp_pw 被利用）
    → 返回 session 给前端
```

**Pros**
- 不依赖 Edge Function，纯 REST API 调用
- 如果 Insforge admin API 支持 `PATCH /api/auth/admin/users/{userId}`，技术上完全可行

**Cons**
- **`PATCH /api/auth/admin/users/{userId}` 是否存在未在文档中确认**（admin 文档只列了 GET/DELETE）
- 非常 hacky：临时修改用户密码，存在并发窗口风险（如果两步之间崩溃，用户密码被改为 temp_pw）
- 对 Google OAuth 用户（无密码）调 `signInWithPassword` 可能失败
- 整体设计脆弱，不推荐用于生产

---

### 路线对比

| 维度 | 路线 A（原生 verifyEmail） | 路线 B（Edge Function） | 路线 C（临时密码桥接） |
|------|--------------------------|------------------------|----------------------|
| 代码量 | 最少（仅前端） | 中等（后端+EdgeFn+前端） | 中等（纯后端） |
| 架构侵入 | 无 | 低 | 低 |
| 对 Google 用户支持 | **待验证** | 是 | 可能不支持 |
| 邮件可定制 | 否 | 是 | 是 |
| 可靠性 | 依赖 Insforge 内部行为 | 依赖 Edge Fn JWT 能力 | 存在并发窗口 |
| 推荐度 | **先测，若可行首选** | **若 A 不行的主选** | 不推荐 |

---

## 推荐执行顺序

### Step 0：验证路线 A 可行性（30 分钟）

用测试账号 `voya.technologies@gmail.com`（Google 登录用户）手动测试：

```bash
# 发验证码
curl -X POST https://9wmhxyi4.us-east.insforge.app/api/auth/email/send-verification \
  -H "Content-Type: application/json" \
  -d '{"email": "voya.technologies@gmail.com"}'

# 验证码验证（mobile client_type 直接返回 refreshToken，无需 cookie）
curl -X POST "https://9wmhxyi4.us-east.insforge.app/api/auth/email/verify?client_type=mobile" \
  -H "Content-Type: application/json" \
  -d '{"email": "voya.technologies@gmail.com", "otp": "CODE_FROM_EMAIL"}'
```

- **若返回 accessToken**：走路线 A，直接实现
- **若返回 403/400/邮件未收到**：走路线 B

---

### 如果走路线 A（前提：Step 0 验证通过）

**文件改动**

| 文件 | 动作 |
|------|------|
| `frontend/src/app/actions/auth.ts` | 新增 `sendOtpAction(email)` 和 `verifyOtpAction(email, otp)` |
| `frontend/src/app/login/page.tsx` | UI 新增 OTP tab，状态机：`idle → otp_sent → verifying` |
| `frontend/src/contexts/AuthContext.tsx` | 新增 `sendOtp`、`verifyOtp` 方法 |

**Server Actions 实现**

```typescript
// frontend/src/app/actions/auth.ts

export async function sendOtpAction(email: string): Promise<{success: boolean; error?: string}> {
  const client = createServerClient();
  const { data, error } = await client.auth.resendVerificationEmail({ email });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function verifyOtpAction(
  email: string, 
  otp: string
): Promise<AuthActionResult> {
  const client = createServerClient();
  const { data, error } = await client.auth.verifyEmail({ otp, email });
  if (error || !data) return { success: false, error: error?.message ?? '验证失败' };
  await setAuthCookies(data.accessToken, data.refreshToken);
  return { success: true, user: mapUser(data.user) };
}
```

**Login 页 UI 状态机**

```
tab: '密码登录' | 'OTP 登录'

OTP 状态：
  idle       → 显示邮箱输入框 + 发送按钮
  otp_sent   → 显示验证码输入框 + 确认按钮 + 倒计时重发
  verifying  → loading
  success    → 跳转
  error      → 显示错误，可重试
```

---

### 如果走路线 B（Step 0 验证失败时）

**新增文件**

| 文件 | 动作 |
|------|------|
| `backend/app/features/auth_otp/router.py` | 新模块，`POST /api/auth-otp/request` 和 `/confirm` |
| `backend/app/features/auth_otp/service.py` | OTP 生成/验证/邮件发送逻辑 |
| `backend/app/features/auth_otp/models.py` | Pydantic request/response models |
| `backend/app/features/wechat/jwt_utils.py` | 将 OTP 工具函数提取为可共享（或直接 import） |
| `frontend/src/app/verify-otp/page.tsx` | 邮件链接落地页（类似 `/wechat-verify`） |
| `frontend/src/app/actions/auth.ts` | 新增 `sendWebOtpAction`、`confirmWebOtpAction` |
| `insforge-edge-functions/generate-user-token/index.ts` | Insforge Edge Function（需先验证可行性） |

**FastAPI 端点设计**

```python
# POST /api/auth-otp/request
# Body: {email: str}
# 无需鉴权（公开端点）
# 速率限制：1/minute per IP
# 流程：
#   1. 用 SERVICE_KEY 调 GET /api/auth/admin/users?email={email} 确认用户存在
#   2. 生成 itsdangerous OTP token（email, user_id, exp=5min）
#   3. 发 Resend 邮件，链接指向 /verify-otp?t=<token>
#   4. 返回 {success: true}（不透露用户是否存在，防枚举）

# POST /api/auth-otp/confirm
# Body: {otp_token: str}
# 无需鉴权（token 即凭证）
# 流程：
#   1. verify_otp_token(otp_token)
#   2. mark_otp_used(otp_token)
#   3. 调 Insforge Edge Function generate-user-token({userId})
#   4. 返回 {accessToken, refreshToken, user}
```

**OTP Token 结构**（itsdangerous，5 分钟 TTL）

```python
# 不嵌入 openid（web 无 openid），改为嵌入 insforge_user_id
generate_otp_token(email=email, user_id=insforge_user_id, context="web_login")
```

注意：需要修改 `jwt_utils.py` 中的 `generate_otp_token` 签名，或在新模块中复制一份，避免破坏微信路线。

**Edge Function（路线 B 的关键待验证部分）**

```typescript
// insforge-edge-functions/generate-user-token/index.ts
// 需要验证：Insforge Edge Function 能否访问 JWT_SECRET 环境变量并签发合法 user token

import { createClient } from "@insforge/sdk";

Deno.serve(async (req: Request) => {
  const serviceKey = req.headers.get("X-Service-Key");
  if (serviceKey !== Deno.env.get("SERVICE_KEY")) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  const { userId } = await req.json();
  
  // 选项 1：如果 Insforge 暴露了签发 token 的 API
  // const client = createClient({ edgeFunctionToken: Deno.env.get("SERVICE_KEY") });
  // const { data } = await client.auth.generateUserToken({ userId });
  
  // 选项 2：直接用 JWT_SECRET 签发（需 Insforge 暴露该环境变量）
  // const jwt = await signJWT({ sub: userId, ... }, Deno.env.get("JWT_SECRET"));
  
  return new Response(JSON.stringify({ accessToken, refreshToken }));
});
```

**⚠️ 路线 B 最大风险**：Edge Function 内是否能签发合法的 Insforge user JWT 完全取决于 Insforge 平台能力，需要实际部署测试后才能确认。

---

## 前端 UI 设计

无论走哪条路线，登录页 UI 改动相同：

**方案：Tab 切换（密码 / OTP）**

```
┌─────────────────────────────┐
│  [密码登录]  |  [邮件登录]   │  ← tab
├─────────────────────────────┤
│  邮箱: [___________________]│
│                              │
│  OTP 状态一：                │
│  [发送验证码]                 │
│                              │
│  OTP 状态二（已发送）：       │
│  验证码: [______]            │
│  [验证登录]  60s 后可重发    │
└─────────────────────────────┘
```

**与现有 UI 的关系**：`/login` 页已有 Google 按钮 + 邮箱密码表单，只需在密码表单上方加 tab 切换，OTP tab 复用同一个邮箱 input。

---

## 共享基础设施复用情况

| 组件 | 微信路线 | Web OTP 路线 A | Web OTP 路线 B |
|------|---------|----------------|----------------|
| `itsdangerous` OTP token | 是 | 否（用 Insforge 原生） | 是（共享或复制） |
| Resend 邮件发送 | 是 | 否（Insforge 发） | 是 |
| `INSFORGE_SERVICE_KEY` 用户查询 | 是 | 否 | 是 |
| `/wechat-verify` 落地页模式 | 是 | 否（inline 输入验证码） | 是（`/verify-otp`） |
| `setAuthCookies` | 是（适配） | 直接使用 | 直接使用 |

---

## 安全考量

| 威胁 | 缓解措施 |
|------|---------|
| 用户枚举（确认邮箱是否存在） | request 端点无论邮箱是否存在均返回 `{success: true}` |
| OTP 重放 | `mark_otp_used()` + in-process dict（单实例可用，多实例需 Redis） |
| 邮件轰炸 | 速率限制 1/minute per IP（参考微信路线的 `@limiter.limit`） |
| OTP 暴力破解 | itsdangerous token 不是 6 位数字，是 HMAC 签名的 URL-safe token，无法暴力破解 |
| Token 泄露 | HTTPS 传输，5 分钟 TTL |

---

## 已知未解问题（实施前需确认）

1. **[路线 A 前提]** `resendVerificationEmail` 对 `emailVerified: true` 的用户（Google 用户）是否发码？
2. **[路线 A 前提]** `verifyEmail` 是否允许已验证用户的 OTP 换 session？
3. **[路线 B 前提]** Insforge Edge Function 是否能访问 JWT signing secret 并签发合法的 user token？
4. **[路线 B 替代]** `POST /api/auth/tokens/anon`（admin 文档中提到的 "Generate Anonymous Token"）的具体行为是什么？是否能用于 user token 生成？
5. **[共用]** 多实例部署时，`_used_otp_tokens` in-process dict 需换为 Redis `SETNX`（低优先级，当前单实例部署可忽略）。
