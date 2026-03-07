# Auth Hardening Engineering Plan

> Status: In Progress
> Related: frontend/docs/auth.md, frontend/src/app/api/auth/.context.md, frontend/src/lib/.context.md, frontend/src/contexts/.context.md, backend/app/core/.context.md
> Vision: 产品策略.md > 核心认知 / 方向一：AI 财务顾问 / 持仓为中心

## 目标

把当前“能登录”的认证体系升级成“权限边界清晰、恢复链统一、可观测、可扩展”的用户账户体系，支撑更多真实付费用户和后续持仓型功能。

## 已确认范围

以下范围已经明确，后续实现以此为准：

- 要做：
  - 邮箱验证闭环
  - resend verification email
  - 已登录用户修改密码
  - 登录 / 注册 / 验证 / 改密码的反馈体验优化
  - 密码输入显示/隐藏切换
  - 审计邮箱注册链路，并明确“同邮箱 Google / 邮箱登录”的账户策略
- 不做：
  - 修改邮箱
  - 删除账户
  - 登出所有设备
  - 会话 / 设备管理页面
  - 注册后 onboarding
  - MFA / passkey / 更多登录方式

## 现状

当前认证主链路基于 `@insforge/nextjs` 和 `@insforge/sdk`：

- 前端 `InsforgeBrowserProvider` + `useInsforge()` 管理登录状态
- 后端 API 通过 `verify_user_token()` 调用 Insforge `/api/auth/sessions/current` 校验 Bearer token
- 登录页将登录和注册合并在 `/login`
- 已有 Google OAuth、邮箱密码登录、忘记密码、重置密码

但目前存在四类明显问题：

1. 权限边界不一致
   - `backend/app/features/brew/router.py` 的 `/digest` 依赖前端传 `user_id`，没有强制 `Depends(verify_user_token)`
   - `backend/app/features/sector/router.py` 的订阅接口直接信任 query/body 中的 `user_id`
   - 这类接口会造成“鉴权存在但身份来源不统一”的问题

2. 认证链路分叉
   - `frontend/docs/auth.md` 仍描述旧的 Server Proxy + 自定义 cookie 流程
   - 实际代码已经切到 SDK 驱动模式
   - OAuth callback、`afterSignInUrl`、登录页 redirect 行为之间存在历史残留

3. 账户功能仍不完整
   - 邮箱注册是存在的，但缺少完整的邮箱验证闭环
   - Profile 页只能改昵称，不能修改密码
   - 没有 resend verification email 和未验证邮箱的恢复路径
   - “同邮箱 Google / 邮箱登录”是否连接到同一账户，目前没有明确产品规则和应用层约束

4. 可观测性和测试不足
   - 缺少 auth 事件审计日志
   - 缺少权限绕过测试、token 过期恢复测试、OAuth 异常测试
   - 缺少以用户体验为中心的错误闭环

## 设计

### 总体原则

1. 后端以 token 解析出的 `user_id` 为唯一可信身份
2. 前端不再通过 body/query 决定“我是哪个用户”
3. 认证链路只保留一套 canonical flow
4. 先修权限和一致性，再加能力
5. 所有新增能力必须有监控、文档和测试

### 目标架构

```text
Browser
  -> InsforgeBrowserProvider / useInsforge
  -> getAccessToken()
  -> Authorization: Bearer <token>

Frontend API Client
  -> 只发送 token，不发送可决定身份的 user_id

Backend Router
  -> Depends(verify_user_token)
  -> token_user_id
  -> service/db 层只接收 token_user_id

Auth Observability
  -> 记录 sign-in / sign-up / sign-out / reset / refresh / auth-failure
  -> 聚合错误码和关键漏斗
```

### 数据流

#### 登录

```text
用户提交邮箱密码 / Google OAuth
  -> Insforge SDK 完成认证
  -> BrowserProvider 恢复 session
  -> getAccessToken() 提供 Bearer token
  -> 前端调用业务 API
  -> 后端统一 verify_user_token()
```

#### 受保护业务请求

```text
前端业务请求
  -> _authHeaders()
  -> Authorization Bearer token
  -> router Depends(verify_user_token)
  -> token_user_id
  -> service/db
```

#### 密码重置

```text
用户输入邮箱
  -> 统一一个 reset flow
  -> 发送验证码/链接
  -> 统一校验 token/code
  -> 设置新密码
  -> 回到登录页
```

### API 变更

#### P0 必改

- `POST /api/digest`
  - 改为强制认证
  - 删除 body 中的 `user_id` 作为身份来源
  - 后端仅使用 `Depends(verify_user_token)` 提取的 user id

- sector 订阅接口
  - `POST /api/sectors/subscribe`
  - `GET /api/sectors/subscriptions`
  - `DELETE /api/sectors/{sector_id}/unsubscribe`
  - 全部改为强制认证
  - 删除 query/body 中外部传入的 `user_id`

#### P1 建议新增 / 确认能力

- `POST /api/auth/resend-verification`
  - 如果 SDK / route handler 不能直接覆盖当前 UI 需求，则补一个前端封装入口
  - 否则优先直接使用 SDK `resendVerificationEmail`

- `POST /api/auth/change-password`
  - 仅当 Insforge SDK 现有能力不足时新增
  - 否则优先直接使用 SDK / 原生 auth 组件能力

### 前端变更

#### P0

- 登录页和注册页逻辑解耦
  - 可以继续共用 UI，但状态和文案要清晰
  - 登录失败、注册失败、邮箱未验证需要明确区分

- 删除前端对“业务 user_id”身份传递的依赖
  - `api.generateDigest()`
  - `api.sectors.subscribe()/unsubscribe()/getSubscriptions()`

- OAuth 流程统一
  - 明确唯一回调页
  - 删除无效的 `afterSignInUrl`
  - 登录页读取并展示 callback 错误

- 密码重置流程统一
  - `/forgot-password` 和 `/reset-password` 二选一或强约束职责
  - 密码规则统一为一套

#### P1

- 补齐邮箱注册 / 验证闭环
  - 注册成功后进入“请验证邮箱”态，而不是把它当错误
  - 增加 resend verification
  - 增加验证成功 / 失败 / 过期状态

- Profile 页补“修改密码”

- 新增 auth 错误态和空态规范
  - token 过期
  - OAuth 取消
  - 网络异常
  - 请求频率过高
  - 邮箱未验证
  - Google-only / password-only 账户提示

- 登录 / 注册 / 忘记密码 / 重置密码统一密码体验
  - 密码显示/隐藏切换
  - 密码规则统一为至少 8 位
  - 优先复用 Insforge `AuthPasswordField` / `AuthPasswordStrengthIndicator`

### 安全与防滥用

#### P0

- 登录、注册、忘记密码接口增加应用层速率限制
- 对失败登录尝试增加节流或退避策略
- 清理前端不必要的敏感 token 持久化路径，重新评估 [frontend/src/components/Providers.tsx](/Users/kedeng/Desktop/projects/stock-agent/frontend/src/components/Providers.tsx) 的 `localStorage` 注入方案

#### P1

- 增加 Turnstile / reCAPTCHA 于注册、忘记密码、可疑登录场景
- 增加邮箱验证 resend 流程
- 对敏感操作启用重新认证或二次确认

#### P2

- 评估 MFA/TOTP
- 评估 WebAuthn/passkey
- 评估异常登录提醒和地理/IP 风险信号

### 监控与审计

#### P0

- 前端和后端统一 auth 错误码字典
- 埋点/日志覆盖：
  - login_success
  - login_failed
  - signup_success
  - signup_failed
  - oauth_failed
  - password_reset_requested
  - password_reset_failed
  - token_verification_failed

#### P1

- 增加 auth dashboard
  - 登录成功率
  - 注册完成率
  - 密码重置完成率
  - OAuth 失败率
  - 401/403 趋势

## 实施步骤

### P0: 安全与一致性修复

1. [x] 审计所有受保护接口，找出仍信任前端 `user_id` 的路由和 API client
2. [x] 修复 `brew` 的 `/digest`，改为强制 `Depends(verify_user_token)`
3. [x] 修复 `sector` 订阅相关接口，移除前端传入的 `user_id`
4. [x] 更新前端 `api.ts`，删除业务身份参数，统一以 Bearer token 驱动
5. [x] 统一 OAuth 回调和 redirect 逻辑，删除历史残留配置
6. [x] 统一密码重置流程和密码规则
7. [x] 修正文档漂移，重写 `frontend/docs/auth.md` 为当前真实实现
8. [x] 为以上变更补 E2E / integration / unit tests

### P1: 账户体系增强

1. [x] 增加邮箱验证状态与 resend verification 流程
2. [ ] 增加修改密码能力
3. [x] 审计并修正邮箱注册链路，把“需要验证邮箱”从错误流改成正常注册流
4. [ ] 明确“同邮箱 Google / 邮箱登录”的账户策略，并补充对应错误提示
5. [ ] 对登录/注册/忘记密码引入 CAPTCHA 或风险校验
6. [ ] 建立 auth 错误码和用户提示规范
7. [ ] 建立 auth 审计日志与基础 dashboard
8. [ ] 为登录/注册/验证/改密码/刷新恢复补齐 E2E 测试

### Out of Scope: 本轮不做

1. [x] 修改邮箱
2. [x] 删除账户
3. [x] 会话 / 设备管理页面
4. [x] `logout all sessions`
5. [x] 注册后 onboarding
6. [x] MFA / TOTP / passkey
7. [x] 更多第三方登录方式

### P2: 高阶安全能力

1. [ ] 评估并接入 MFA/TOTP
2. [ ] 评估 WebAuthn/passkey 登录
3. [ ] 增加异常登录提醒与设备风险评分
4. [ ] 增加账户删除、数据导出、敏感操作二次验证

## 依赖

- Insforge 对 session、logout-all、device/session list 的能力边界需要先确认
- 前端需要明确是否继续使用 SDK memory mode + localStorage 注入
- 后端各 feature 路由需要统一 auth 规范，避免继续出现“部分接口例外”

## 待定问题

1. Insforge 对“同邮箱 Google / 邮箱登录”的默认行为到底是自动合并、拒绝，还是创建独立 identity？
2. 你们是否接受继续把 access token 注入 `localStorage`，还是要改为更保守的 session 恢复方案？
3. 邮箱注册后是否强制验证邮箱才能进入产品？当前倾向是“必须验证后再登录”。
4. 修改密码优先走 Insforge 原生组件 / SDK，还是保持现有自定义 UI 外观后只复用底层能力？当前本地 SDK 只明确暴露 `sendResetPasswordEmail` / `exchangeResetPasswordToken` / `resetPassword`，尚未确认存在单独的“已登录修改密码”接口。

## 最新进展

- 已完成邮箱注册 -> `/verify-email` -> resend verification -> 验证成功回跳闭环
- 已统一登录 / 忘记密码 / 重置密码的密码输入体验，增加显示/隐藏切换
- 已确认“修改密码”不是纯前端页面任务，需要先确认 Insforge 是否提供原生能力或补受保护后端接口

## 同邮箱多登录方式策略建议

当前代码里没有显式的 account linking / merge 逻辑，因此不能假设“Google 和邮箱密码会自动连到同一账户”。

建议先采用最小策略：

1. 产品规则
   - 同一个邮箱只能对应一个账户主体
   - 不主动承诺“Google 与邮箱密码自动绑定”，直到确认 Insforge 的默认行为

2. 登录/注册提示
   - 邮箱注册时如果邮箱已存在：提示“该邮箱已注册，请直接登录”
   - 邮箱密码登录失败且确认该邮箱是 Google-only 时：提示“该邮箱已通过 Google 注册，请使用 Google 登录”
   - Google 登录失败且确认该邮箱是 password-only 时：提示“该邮箱已使用邮箱注册，请先用邮箱登录”

3. 实施顺序
   - 第一步：确认 Insforge 对“同邮箱不同 provider”的真实行为
   - 第二步：补错误提示和注册/登录页文案
   - 第三步：如果需要，再评估已登录态下的 provider linking
