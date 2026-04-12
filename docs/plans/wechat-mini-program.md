# 微信小程序入口 Engineering Plan

> Status: Planning
> Related: frontend/docs/auth.md · frontend/src/contexts/AuthContext.tsx · backend/app/features/subscription/.context.md
> Vision: 让现有 Next.js 应用在微信生态里获得一个轻量入口，尽可能复用 web，新功能集中在登录、绑定、通知三个点

## 目标

给 TheMarketBrew 增加一个微信小程序入口，**WebView-first**：绝大多数页面通过小程序 web-view 直接加载 `themarketbrew.com`，只在登录/绑定/入口菜单使用原生页面。同时打通微信、Google、邮箱三种身份，让同一个 Insforge 用户可以用任意一种方式登录。

## 现状（2026-04 核对）

### 认证体系（重要：doc drift 已修正）

- **项目已经完成 Server Bridge 迁移**（`frontend/src/app/actions/auth.ts` + `frontend/src/lib/auth-cookies.ts` + `frontend/src/app/api/auth/session/route.ts`），但 `frontend/docs/auth.md` 仍在描述"SDK Direct 模式"——**这是 doc drift**，后续 PR 需要同步修正该文档
- 登录凭证已经是**第一方 httpOnly cookie**：`app_access_token` (15 min) + `app_refresh_token` (7 天)，写在 Next.js 自己的域名下，不再依赖 Insforge 域的第三方 cookie
- AuthContext 只通过 `/api/auth/session` 读取登录态，所有登录动作都走 Server Action
- 这对 WebView 方案是**利好**：微信 web-view 对第一方 cookie 的限制比第三方宽松得多，理论上可以保持登录态

### Insforge 能力边界（已调研）

通过 InsForge 官方文档和 SDK 源码确认：

- ✅ Insforge 支持**自定义 OAuth 2.0 provider**，但前提是 **OIDC-compatible**（OpenID Connect 标准）
- ❌ **微信 OAuth 不是 OIDC-compatible**（自有协议），无法通过 Insforge dashboard 直接添加
- ❌ InsForge JS SDK **不提供** `admin.createUser()` / `signInWithCustomToken()` / `setSession()` 等后端管理 API —— 没有"后端代签一个 session token 交给用户"的能力
- ✅ SDK 支持 `isServerMode: true`，backend 可以持 `anonKey` 调用 Insforge API
- ✅ InsForge 支持 `edgeFunctionToken` —— 理论上 backend 可以用 Insforge JWT secret 自签一个 token 让 SDK 接受，但这要求拿到 JWT 私钥，属于**不推荐路径**

**结论**：上一轮我设想的"路线 A（Insforge 托管微信 OAuth）"不可行。"路线 B（后端代理 + Insforge 影子账号）"也因为 SDK 缺少 admin API 而难以干净地实现（没法登录一个不知道密码的用户）。**实际可行的路径只有"路线 C（双 token 并存 + 绑定后合并）"**。

### 通知体系

- `backend/app/features/notification/` 专注邮件发送，共 14 个端点
- `backend/app/features/subscription/email_service.py` 是唯一的 dispatcher，直连 Resend
- 没有通用 NotificationDispatcher 抽象层，没有"多渠道 fan-out"逻辑
- 用户偏好字段存在 Insforge `user_metadata` 里（通过 `sync_user` 同步）
- **没有 Redis**，也没有消息队列。后端是单 FastAPI 进程

### 后端 feature 标准结构

`backend/app/main.py:98-129` 明确了 feature router 注册模式：从 `app.features.X.router` 导入 router 后 `include_router`。新增 `features/wechat/` 和 `features/wechat_notify/` 可以无缝对接。

## 设计

### 架构决策

#### 1. 登录：自签 JWT + 绑定后合并（路线 C）

```
微信用户首次登录：
  wx.login() → code
      │
      ▼
  POST /api/wechat/login
      │   ├─ backend: jscode2session(code, AppID, AppSecret) → openid, unionid
      │   ├─ backend: 查 wechat_users 表（新建）是否已有 openid 记录
      │   │   - 有：复用 internal_user_id（UUID）
      │   │   - 无：生成 internal_user_id，insert
      │   └─ backend: 签 JWT {sub: internal_user_id, typ: "wechat", exp: +7d}
      ▼
  返回 { token, user: { id, needs_binding: true } }

后续请求：
  Authorization: Bearer <wechat_jwt>
      │
      ▼
  verify_user_token (改造):
      - 先尝试 Insforge getCurrentUser（Insforge token）
      - 失败则尝试本地 decode（WeChat token，typ == "wechat"）
      - 都失败 → 401
      - 返回统一的 Principal { user_id, email?, provider }
```

**为什么不走 Insforge 影子账号**：InsForge SDK 没有 admin API 可以"登录一个你不知道密码的用户"，signUp 会返回 `requireEmailVerification`，合成邮箱没法收验证码，走不通。

**user_id 空间**：Insforge user.id 是 UUID，我们新建的 wechat_users.internal_user_id 也是 UUID，两个命名空间里不会碰撞。数据库外键指向 user_id 时只需保证 UUID 唯一即可。

#### 2. 绑定流程：邮箱验证码

```
未绑定微信用户 → /profile 页提示"绑定现有账号"
  ↓
POST /api/wechat/bind/request { email }
  ↓
backend:
  1. 通过 Insforge server client 查 email 是否存在
     - 存在 → 生成 6 位验证码，存 DB（wechat_bind_codes 表，TTL 5 分钟）
     - 不存在 → 返回 404"账号不存在，请先注册网页版"
  2. 调 EmailService 发送验证码邮件（复用现有模板风格）
  ↓
POST /api/wechat/bind/confirm { email, code }
  ↓
backend:
  1. 校验 code + TTL
  2. 调 Insforge server client 取 target_user.id
  3. 合并：
     - 在 Insforge user_metadata 写入 wechat_openid / wechat_unionid
     - wechat_users 表记录中：internal_user_id → insforge_user_id mapping
  4. 后续签的 JWT 里 sub 直接用 insforge_user_id，typ = "wechat_bound"
  5. verify_user_token 看到 typ == "wechat_bound" → 直接把 sub 当 Insforge user_id 返回
  ↓
返回 { success: true, user: { id: insforge_user_id, email } }
```

绑定之后这个用户的 `user_id` 就统一成 Insforge 的 UUID，所有下游（Stripe 权益、Resend segments、screener 收藏）自动复用，无需任何迁移。

#### 3. WebView 登录态注入

WebView PoC 通过后两种可能结果：

**结果 A（乐观）**：web-view 对第一方 cookie 完全支持，用户在 web-view 里正常登录即可。小程序原生壳只负责"进入" web-view，不参与登录链路。

**结果 B（悲观）**：cookie 在 web-view 之间不共享、或刷新后丢失。Plan B 是 **bridge token 注入**：

```
原生 wx.login 拿到 code
  ↓
POST /api/wechat/login → {token, needs_binding, insforge_user_id?}
  ↓
如果 bound（已经和 Insforge user 绑定）：
  POST /api/wechat/webview-bridge { wechat_jwt }
    → backend 通过 Insforge server SDK 换出 Insforge access_token + refresh_token
    → 签一个 15 秒 TTL 的 one-shot bridge_ticket
    → 返回 { bridge_ticket }
  ↓
wx.navigateTo 时把 ticket 拼到 URL:
  /webview/webview?path=/for-you?_bridge=xxx
  ↓
Next.js 在 layout 或 middleware 检测 _bridge 参数：
  调 POST /api/auth/bridge-exchange { ticket }
  → server action 验 ticket、用 ticket 里带的 access/refresh token 调 setAuthCookies()
  → 重定向清理 URL
  ↓
之后的请求都靠第一方 httpOnly cookie，和 web 版完全一致
```

未绑定的用户（需要绑定页面）走原生页面，不经过 bridge。

#### 4. 通知分发

保持 **增量扩展**，不做大重构：

```
发送侧已有:
  backend/app/features/subscription/email_service.py → Resend

新增:
  backend/app/features/wechat_notify/service.py
    - send_template_message(openid, template_id, data, miniprogram_pagepath)
    - 拿 access_token（2小时 TTL，缓存在内存）
    - POST https://api.weixin.qq.com/cgi-bin/message/template/send

在业务侧（比如日报广播）加一层薄 fan-out:
  async def broadcast_daily_report_to_user(user, report):
      prefs = user.metadata.get("push_preferences", {})
      if prefs.get("wechat") and user.metadata.get("wechat_service_openid"):
          await wechat_notify.send_template_message(...)
      if prefs.get("email", True):
          await email_service.send_daily_report(...)
```

**刻意不做**：不抽象出通用 NotificationDispatcher 接口，不引入 Strategy 模式，不做"渠道注册"。两个渠道两种业务逻辑，直接 if/else 更清晰。未来要加第三个渠道再抽象。

**用户偏好字段**：在 Insforge `user_metadata` 下新增 `push_preferences: { email: bool, wechat: bool, mini_program: bool }`，沿用现有 `sync_user` edge function 扩展字段。

#### 5. 服务号 Webhook + Bot Chat

新增 `features/wechat/webhook.py`：
- GET：签名校验（URL 有 token/nonce/timestamp/echostr），用 sha1 比对后返回 echostr
- POST：解析 XML 消息，5 秒内必须返回
- 异步回复：用 FastAPI `BackgroundTasks`，先返回空串，后台任务调 LLM → POST `cgi-bin/message/custom/send`
- **刻意不引入 Celery/Redis**：单进程单副本部署下 BackgroundTasks 够用。上线后如果 QPS 撑不住再迁移

### 数据模型变更

后端需要新建两张表（通过 Insforge Edge Functions 或 SQL migration）：

```sql
-- WeChat-only users（未绑定阶段）
create table wechat_users (
  internal_user_id uuid primary key default gen_random_uuid(),
  wechat_openid text not null unique,      -- 小程序 openid
  wechat_unionid text,                      -- 同一主体下跨应用统一
  wechat_service_openid text,               -- 服务号 openid（绑定后填）
  insforge_user_id uuid,                    -- 绑定后指向 Insforge user.id
  created_at timestamptz default now(),
  last_login_at timestamptz,
  unique (wechat_unionid)
);

-- 绑定流程的验证码（短期，5 分钟 TTL）
create table wechat_bind_codes (
  email text not null,
  code text not null,                       -- 6 位数字
  internal_user_id uuid not null,           -- 待绑定的微信侧用户
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz default now(),
  primary key (email, code)
);
create index on wechat_bind_codes (expires_at);
```

Insforge `user_metadata` 新增字段：
- `wechat_openid` / `wechat_unionid` / `wechat_service_openid`
- `push_preferences: { email: bool, wechat: bool, mini_program: bool }`

### 新增后端端点

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/wechat/login` | Public | jscode2session 换 openid，返回 backend JWT |
| POST | `/api/wechat/bind/request` | Bearer (wechat) | 发送绑定验证码到邮箱 |
| POST | `/api/wechat/bind/confirm` | Bearer (wechat) | 校验验证码，合并身份 |
| POST | `/api/wechat/webview-bridge` | Bearer | 签发 bridge_ticket（Plan B 用） |
| POST | `/api/auth/bridge-exchange` | Public (ticket) | 用 bridge_ticket 换 first-party cookie |
| GET | `/api/wechat/webhook` | Public | 服务号 URL 校验 |
| POST | `/api/wechat/webhook` | Public（微信签名）| 服务号消息入口 |
| POST | `/api/wechat/notify/send` | Cron | 内部广播触发点（模板消息） |

### 前端改动

- `frontend/src/app/webview-check/page.tsx`（**本 PR 已创建**）：web-view 诊断页
- `middleware.ts`：把 `/webview-check` 加入 PUBLIC_ROUTES（**本 PR 已改**）
- `frontend/docs/auth.md`：修正 doc drift，说明 Server Bridge 已经就位
- `frontend/src/app/actions/auth.ts`：未来新增 `exchangeBridgeTicketAction` 服务动作（如 PoC 结果需要）
- 现有 Next.js 页面**不需要改**：web-view 直接加载，登录链路不变

### 小程序端

本 PR 已创建的 `miniprogram/` 骨架包含：
- `pages/index` 菜单入口
- `pages/webview` 通用 web-view 容器（`?path=/xxx`）
- `pages/diagnose` 原生 wx.login 诊断

MVP 真正上线需要追加的原生页面：
- `pages/login`：原生登录页，调 `/api/wechat/login`
- `pages/bind`：邮箱绑定流程
- `pages/profile`：推送偏好设置（如果 webview 版不合适）

### 安全考虑

- **AppSecret 只存后端**：小程序端绝不持有，`project.config.json` 只放 AppID
- **bridge_ticket 一次性 + 短 TTL**：15 秒内必须兑换，兑换后立即作废，避免被 URL 日志泄漏
- **wechat_jwt 不能被当作 Insforge token 使用**：`verify_user_token` 通过 `typ` claim 区分，不允许跨模式伪造
- **绑定验证码 rate limit**：同一邮箱 1 分钟最多 1 次，5 分钟最多 3 次（用 slowapi）
- **服务号 webhook 签名校验**：所有 POST 必须通过微信 sha1 签名校验，否则丢弃

## 实施步骤

### Phase 0 — WebView PoC 验证（优先级最高）
1. [x] 小程序骨架 + web-view 容器
2. [x] `/webview-check` 诊断页
3. [ ] 注册一个测试用小程序，拿到 AppID，配置业务域名白名单
4. [ ] 把 `themarketbrew.com` 或 staging 域名配置到业务域名
5. [ ] 真机测试 README 里的 6 项 PoC 脚本，记录结果
6. [ ] 根据 PoC 结果决定走"web-view only"还是"需要 bridge_ticket 注入"

### Phase 1 — 后端身份基础设施（决策点后开始）
1. [ ] 新建 `backend/app/features/wechat/` feature 模块
2. [ ] 在 `core/config.py` 追加 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` / `WECHAT_MP_TOKEN`
3. [ ] 新建 `wechat_users` 和 `wechat_bind_codes` 表（Insforge edge function 或直接 SQL）
4. [ ] 实现 `POST /api/wechat/login` — jscode2session 封装 + 自签 JWT
5. [ ] 改造 `verify_user_token` 接受两种 token，返回统一的 Principal
6. [ ] 单元测试：两种 token 分别能通过验证，伪造的 typ 被拒绝

### Phase 2 — 绑定流程
1. [ ] `POST /api/wechat/bind/request` + 邮箱验证码发送（复用 `EmailService`）
2. [ ] `POST /api/wechat/bind/confirm` + Insforge metadata 写入
3. [ ] 速率限制（slowapi）
4. [ ] E2E：新微信用户登录 → 绑定 → 用绑定后的 JWT 访问 `/api/subscriptions/status` 能拿到正确数据

### Phase 3 — WebView Bridge（仅当 PoC 结果为悲观路径）
1. [ ] `POST /api/wechat/webview-bridge` — 签 bridge_ticket
2. [ ] Next.js `POST /api/auth/bridge-exchange` server action
3. [ ] 修改 webview 容器 URL 拼接逻辑
4. [ ] E2E：原生登录 → 进入 web-view → 受保护页直接可访问

### Phase 4 — 推送通知
1. [ ] `features/wechat_notify/service.py` — 模板消息发送 + access_token 缓存
2. [ ] 在日报 / 早报 / 关键 alert 的广播入口加 fan-out
3. [ ] `user_metadata.push_preferences` 扩展 + 前端/小程序偏好 UI
4. [ ] 测试：用户勾掉微信推送后不再收到模板消息

### Phase 5 — 服务号 Webhook + Bot
1. [ ] `GET /api/wechat/webhook` 签名校验
2. [ ] `POST /api/wechat/webhook` 消息解析 + 5 秒内返回
3. [ ] `BackgroundTasks` 异步 LLM → 客服消息 API 回复
4. [ ] 测试：给服务号发消息，10 秒内收到 bot 回复

### Phase 6 — 上架
1. [ ] 小程序原生登录页 / 绑定页
2. [ ] 隐私政策、类目申报
3. [ ] 提审 + 灰度发布

## 待定问题

1. **主体注册**：项目是否已经有中国大陆营业执照/个人主体？没有的话 Phase 0 时间要拉长到 2-3 周
2. **WebView PoC 真机结果**：cookie 是否在 web-view 之间共享？这个问题不做真机测试无法得到权威答案
3. **bridge_ticket 需要 Insforge SDK 支持"从 refresh_token 恢复会话"的能力**：`/api/auth/session` 已经实现了这个（调 `refreshSession({refreshToken})`），但我们还没验证过可以**从 backend 主动**换出一对 access/refresh token 交给小程序使用
4. **服务号 vs 订阅号**：template message 只有服务号（已认证）才有，订阅号只有群发，选择哪个取决于注册成本
5. **UnionID 要求**：UnionID 需要把小程序和服务号绑定到**同一个微信开放平台账号**才能拿到统一 ID，注册流程要包含这一步
6. **开发环境广播路由**：`ENVIRONMENT != "production"` 时邮件已有 test segment 兜底，微信侧没有对应隔离 —— 开发期必须用沙箱账号，否则会误发给真实微信用户

## 附录：已调研的参考链接

- [InsForge Authentication Architecture](https://docs.insforge.dev/core-concepts/authentication/architecture)
- [InsForge SDK JS 源码](https://github.com/InsForge/InsForge-sdk-js)
- [Mobile App WeChat Login Dev Guide](https://developers.weixin.qq.com/doc/oplatform/en/Mobile_App/WeChat_Login/Development_Guide.html)
