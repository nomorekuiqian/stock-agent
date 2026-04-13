# 微信小程序入口 — 工程计划（合并版）

> **Status**: In Progress（Phase 0–M2 已完成，M3 骨架已完成，M1 部分完成）
> **小程序 Repo**: `/Users/xuxueyang/Documents/GitHub/theMarketBrew_wechat_test0`
> **AppID**: `wx55148e271bdc08e2`
> **更新**: 2026-04-12（合并 wechat-mini-program.md + wechat-miniprogram.md，加入实现核查与待办）

---

## 整体展望

通过微信小程序触达中国用户，采用"原生壳 + WebView"渐进式策略，打通微信、邮箱三种身份（Google 不支持）。

```
第一阶段（本 plan）          第二阶段                 第三阶段
原生壳 + WebView       →  高频页面原生化         →  全功能原生
4 个原生页面               日报/早报原生              所有页面原生
内容全走 WebView           Brew/个股仍 WebView       考虑 Taro 框架
邮箱验证码绑定             服务号模板消息推送          完整微信生态
```

**核心原则**: 现有代码零侵入。后端共享、前端路由组隔离、小程序独立 repo。

---

## 现状核查（2026-04-12）

### 已完成

| 模块 | 内容 |
|------|------|
| 后端 `features/wechat/` | router.py / service.py / models.py / db.py 全部存在 |
| 后端端点 | `POST /api/wechat/login`, `POST /api/wechat/bind`, `GET /api/wechat/home-cards` |
| 后端配置 | `core/config.py` 已有 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` |
| Edge Function | `wechat-users.js` 已实现 upsert / get_by_openid / bind |
| 前端工具库 | `lib/wechat.ts` — 环境检测 + token 存取 |
| 前端 PageShell | 检测 `?from=wechat` 跳过 Navbar/Footer |
| 前端 login-callback | `(wechat)/wechat-login-callback/page.tsx` — token 回传小程序 |
| 前端诊断页 | `app/webview-check/page.tsx` — httpOnly cookie + session 诊断 |
| 小程序骨架 | pages: home / login / profile / webview；services: auth / api；utils: storage |
| 小程序首页 | 动态卡片从 `/wechat/home-cards` 加载，含离线 fallback |
| 小程序登录页 | 微信登录 + 邮箱/密码绑定 + WebView 邮箱登录入口 |
| 小程序我的页 | 显示 openid / 昵称，跳转邮件订阅 WebView |

### 未完成（待实现）

| 缺口 | 说明 |
|------|------|
| 邮箱验证码绑定 | 当前只支持邮箱+密码，Google 用户无密码无法绑定 |
| 自签 JWT（未绑定用户） | 当前未绑定用户 `token` 字段为 `None`，无法调用需认证的 API |
| `wechat_bind_codes` 表 | 验证码流程所需数据表尚未建 |
| `verify_user_token` 双 token 支持 | 未改造，wechat JWT 无法通过现有认证中间件 |
| WebView bridge ticket | Phase 3，PoC 结果决定是否需要 |
| 推送通知 | `features/wechat_notify/` 未建 |
| 服务号 Webhook | `webhook.py` 未建 |
| 后端单元 / E2E 测试 | `tests/test_wechat_unit.py` / `tests/e2e/test_wechat_e2e.py` 未写 |
| 小程序 `diagnose` 页 | 原生 wx.login 诊断页（可选） |

---

## 六大问题解答

### Q1：小程序"我的"登录 vs 网页登录态如何同步？会联动 /profile 吗？

**现状**：两者完全独立，不自动同步。

- **网页版**：登录态是 `app_access_token` + `app_refresh_token` httpOnly cookie，由 Server Bridge 写入，AuthContext 通过 `/api/auth/session` 读取。
- **小程序**：登录态是 `wx.setStorageSync('tmb_token', ...)` 本地缓存的 Insforge accessToken（仅在绑定后才有）；未绑定用户当前 token 为 `None`。

**打通方式**（两条路）：

1. **方式 A（已实现 —— 邮箱+密码绑定）**：用户在小程序"登录"页输入邮箱+密码 → `POST /api/wechat/bind` → 后端用 Insforge signIn 验证 → 返回 accessToken → 存入 `wx.storage`。之后小程序可用此 token 调用需认证的 API（目前 `needAuth: false` 所有请求都不带 token，需修改）。
2. **方式 B（已实现 —— WebView 回传）**：登录页的"邮箱登录"按钮打开 WebView 加载 `/wechat-login-callback`，用户在 WebView 里正常登录（Google / 邮箱均可），登录完成后 `wx.miniProgram.redirectTo` 把 token 送回 `login` 页保存到 storage。

**与 `/profile` 的联动**：**当前无原生联动**。小程序"我的"页是独立的原生页，只展示 openid/昵称，并提供"邮件订阅"按钮（跳 WebView `/subscription`）。`/profile` 网页没有在小程序原生入口里出现。

**改进建议**（待规划）：
- 在"我的"页增加"查看完整账号" → WebView 加载 `/profile?from=wechat&token=xxx`
- 绑定成功后在"我的"页展示邮箱和会员状态

---

### Q2：如何进入测试页面？如何使用？

**诊断页**：`/webview-check`（`frontend/src/app/webview-check/page.tsx`）

**进入方式**：
1. 在小程序开发者工具，在"首页"任意一张卡片的 `onCardTap` 中临时把 URL 改为 `/webview-check`，或
2. 修改 `miniprogram/services/api.ts` 中 `WEB_BASE_URL`，然后在小程序任何跳转 WebView 的地方改路径为 `/webview-check`，
3. 或直接在浏览器访问 `http://localhost:3000/webview-check`（普通浏览器只能测 session，无法测微信环境）。

**测试内容**：
| 指标 | 含义 |
|------|------|
| `/api/auth/session` 状态码 | 200 = httpOnly cookie 正常送达 Next.js server |
| 已登录用户 | 显示邮箱说明 cookie 跨 WebView 存活 |
| `insforge_csrf_token` 存在 | 非 httpOnly cookie 是否保留 |
| 小程序 web-view 标志 | UA 中是否有 `miniProgram` |
| localStorage / sessionStorage | 存储可用性 |

**重要**：模拟器 `<web-view>` CSS 不渲染（已知限制）。WebView 真实渲染效果和登录态测试必须用**真机调试 2.0**（开发者工具顶部工具栏扫码）。

---

### Q3：能不能用邮箱+验证码登录？当前数据后端如何？还需要哪些改动？

**现状**：不支持。当前 `POST /api/wechat/bind` 需要邮箱+密码，Google 登录用户因无密码无法绑定。

**数据后端现状**：
- `wechat_users` 表：openid / session_key / user_id（绑定后填入 Insforge user.id）/ nickname / avatar_url
- `login_with_code` 返回时 `token: None`（未绑定用户没有可用 token）
- 绑定走 Insforge `/api/auth/sessions` signIn，返回 Insforge accessToken

**需要的改动（邮箱验证码方案）**：

1. **新建 `wechat_bind_codes` 表**（via Edge Function 或 SQL）：
   ```sql
   create table wechat_bind_codes (
     email text not null,
     code text not null,          -- 6 位数字
     openid text not null,        -- 待绑定的 wechat openid
     expires_at timestamptz not null,
     consumed_at timestamptz,
     created_at timestamptz default now(),
     primary key (email, code)
   );
   ```

2. **新增端点** `POST /api/wechat/bind/request { email }`：
   - 用 Insforge server client 查 email 是否存在（防止给不存在的账号发码）
   - 生成 6 位数字验证码，写入 `wechat_bind_codes`（TTL 5 分钟）
   - 调 `EmailService` 发送验证码邮件

3. **新增端点** `POST /api/wechat/bind/confirm { email, code }`：
   - 校验 code + TTL + 未被消费
   - 通过 Insforge server client 查 `target_user.id`（by email）
   - 更新 `wechat_users.user_id = insforge_user_id`
   - 在 Insforge `user_metadata` 写入 `wechat_openid`
   - 签发自签 JWT（`typ: "wechat_bound"`，sub 为 insforge_user_id）返回
   - 标记验证码已消费

4. **保留旧的 `POST /api/wechat/bind` 端点**（邮箱+密码方案）作为备选，不删除。

5. **小程序改造**：登录页的绑定 UI 改为"发送验证码"按钮 + 验证码输入框（替代密码框）。

**为什么必须加验证码流程**：Google OAuth 用户没有密码，邮箱+密码方案对他们完全不通。

---

### Q4：微信登录后各类用户的 workflow？如何绑定已有账户？

#### 新用户（从未用过 TheMarketBrew）

```
wx.login() → code → POST /api/wechat/login
  → openid 不在 wechat_users，新建记录，user_id 为 null
  → 返回 { is_bound: false, openid, token: null }
  ↓
小程序: 展示绑定选项
  ├── "绑定已有账号" → 邮箱验证码流程（Q3 方案）
  └── "跳过，浏览免费内容" → 直接进首页（仅能看公开内容）
```

游客状态下，`buildWebViewUrl` 拼接 `?from=wechat`（无 token），WebView 内只能访问未登录内容。

#### 已有邮箱账号用户（注册过网页版，邮箱登录）

```
wx.login() → is_bound: false → 输入邮箱 → 发验证码 → 输入验证码
  → POST /api/wechat/bind/confirm
  → wechat_users.user_id = insforge_user_id
  → 返回自签 JWT（sub = insforge_user_id，typ = "wechat_bound"）
  ↓
之后 wx.login() → is_bound: true → 直接用同一 insforge_user_id
订阅状态、收藏、偏好全部共享
```

#### 已有 Google 登录用户（只用过 Google OAuth）

同"已有邮箱账号用户"流程，**前提是必须用验证码而非密码**（无密码）。

```
wx.login() → is_bound: false → 输入注册时的邮箱 → 收验证码 → 绑定
  ↓
同上，合并成功
```

> ⚠ 如果用户注册 Google 时用的是 Google 帐号邮箱，Insforge 中的 email 就是该邮箱，验证码会发到那里。

#### 绑定后再次登录

```
wx.login() → code → POST /api/wechat/login
  → 查到 wechat_users.user_id 不为 null
  → 返回 { is_bound: true, user_id: insforge_user_id, token: <自签JWT> }
  → 直接进首页
```

**当前实现的缺口**：`login_with_code` 在 `is_bound: true` 时没有签发 JWT（`token: None`），需要补充签发逻辑。

---

### Q5：小程序 vs 网页版体验差异

| 维度 | 小程序（当前） | 网页版 |
|------|-------------|--------|
| 登录方式 | 微信一键 + 邮箱验证码绑定 | Google OAuth / 邮箱+密码 |
| 导航 | TabBar（首页 + 我的） | 完整 Navbar + 二级菜单 |
| 内容页 | WebView（CSS 完整，需真机） | 完整 Next.js 渲染 |
| 个人资料 | 原生我的页（仅 openid + 昵称） | `/profile` 完整账号管理页 |
| 订阅管理 | 跳 WebView `/subscription` | 原生 `/subscription` 页 |
| 会员状态 | 不展示（待补充） | 显示在 profile 页 |
| 收藏 / For You | WebView | 原生 |
| 推送通知 | 不支持（第二阶段服务号） | 邮件推送 |
| 搜索 | WebView `/stock` | 原生搜索组件 |
| 深色模式 | 跟系统（原生页） / WebView 内跟网页 | 跟系统 |

**主要体验劣势**（待改进）：
- 我的页信息太少，看不到会员状态和订阅功能入口
- 首次登录绑定流程步骤偏多（相比 Google 一键登录）
- WebView 内跳转后退交互依赖左滑手势，和原生不一致

---

### Q6：如何测试登录？后端流程是什么？为什么需要独立后端？

#### 如何测试登录

**本地调试（模拟器，原生页面）**：
1. 启动后端：`cd backend && uvicorn app.main:app --reload`
2. 在 `miniprogram/services/api.ts` 把 `BASE_URL` 改为 `http://localhost:8000/api`（或局域网 IP）
3. 微信开发者工具导入 `theMarketBrew_wechat_test0/`，**勾选"不校验合法域名"**
4. 在"调试器 → Network"观察 `/wechat/login` 请求和响应

**真机调试（WebView + 全流程）**：
1. 用 ngrok 暴露本地：`ngrok http 8000`（后端）+ `ngrok http 3000`（前端）
2. 把 ngrok HTTPS 地址填入 `api.ts` 的 `BASE_URL` 和 `WEB_BASE_URL`
3. 微信开发者工具点"真机调试 2.0" → 手机扫码
4. 真机会看到完整 CSS 渲染和 cookie 行为

**环境配置速查（`miniprogram/services/api.ts`）**：

| 场景 | BASE_URL | WEB_BASE_URL |
|------|----------|--------------|
| 模拟器 | `http://localhost:8000/api` 或局域网 IP | 不需要 |
| 真机调试 | ngrok 后端 HTTPS + `/api` | ngrok 前端 HTTPS |
| 生产 | `https://api.themarketbrew.com/api` | `https://themarketbrew.com` |

#### 后端登录流程

```
[小程序] wx.login() → code（临时5分钟有效）
  ↓
POST /api/wechat/login { code }
  ↓
[后端 service.py] code2Session:
  GET https://api.weixin.qq.com/sns/jscode2session
       ?appid=WECHAT_APP_ID
       &secret=WECHAT_APP_SECRET   ← 必须在服务端！
       &js_code=code
       &grant_type=authorization_code
  → { openid, session_key }
  ↓
[后端 db.py → Edge Function wechat-users.js]
  upsert wechat_users(openid, session_key)
  get_by_openid(openid) → 查 user_id 是否已绑定
  ↓
返回 { success, openid, is_bound, token (仅绑定后有) }
```

#### 为什么不能让 Vercel / Next.js 直接管理

有两个原因：

1. **技术原因：AppSecret 必须在服务端**。`jscode2session` 需要 `WECHAT_APP_SECRET`，该密钥绝不能暴露到前端。虽然 Next.js API routes / Vercel Functions 也是服务端，也可以存放密钥，但——

2. **架构原因：共享现有身份体系**。认证核心（`verify_user_token`）、Insforge 操作（绑定账号、写 user_metadata）、邮件发送（`EmailService`）都在 FastAPI 里。把微信登录逻辑分裂到 Next.js API routes 会造成认证逻辑碎片化：一部分在 Next.js，一部分在 FastAPI，后续无法统一升级。
   
   **结论**：所有需要身份校验的逻辑都放 FastAPI，Next.js 只做前端渲染和 WebView 适配。

---

## 架构图

```
┌─────────────────────────────────────┐
│         微信小程序 (原生)              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
│  │ 首页  │ │ 登录  │ │ 我的  │ │WebView│
│  │(动态卡)│ │(wx+码)│ │(原生) │ │(容器) │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬──┘ │
└────────────────────────────┼─────────┘
                             │ URL + ?from=wechat&token=xxx
         ┌───────────────────┼──────────────────────┐
         │  Next.js (themarketbrew.com)              │
         │  PageShell 检测 from=wechat → 隐藏 Navbar │
         │  /webview-check   诊断页（公开）           │
         │  /wechat-login-callback  token 回传页     │
         └───────────────────┬──────────────────────┘
                             │ Bearer Token
         ┌───────────────────┼──────────────────────┐
         │  FastAPI 后端 (共享)                       │
         │  features/wechat/ — login/bind/home-cards │
         │  [待] bind/request + bind/confirm         │
         │  [待] verify_user_token 双 token 支持      │
         └──────────────────────────────────────────┘
                             │
         ┌───────────────────┼──────────────────────┐
         │  Insforge (数据库)                        │
         │  wechat_users 表（openid ↔ user_id）      │
         │  [待] wechat_bind_codes 表（验证码 TTL）   │
         └──────────────────────────────────────────┘
```

---

## 数据模型

### `wechat_users` 表（扩展版，Edge Function 需同步更新）

```sql
create table wechat_users (
  id                 uuid primary key default gen_random_uuid(),

  -- 微信身份（永久不变）
  openid             text not null unique,   -- 小程序 openid，卸载重装不变
  unionid            text unique,            -- 跨应用 ID（绑定开放平台后才有）
  service_openid     text,                   -- 服务号 openid（Phase 2）

  -- 账号状态（三态）
  -- NULL insforge_user_id + NULL email       → unbound（游客）
  -- NULL insforge_user_id + email_verified   → email_only（无密码新账号）
  -- NOT NULL insforge_user_id                → bound（绑定现有账号）
  insforge_user_id   uuid,                   -- 绑定后指向 Insforge user.id
  bound_at           timestamptz,
  email              text,                   -- OTP 验证后的邮箱（两种状态共用）
  email_verified_at  timestamptz,            -- OTP 验证时间

  -- 微信 session（每次 wx.login 刷新，不持久化到小程序侧）
  session_key        text,
  nickname           text,
  avatar_url         text,

  last_login_at      timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index on wechat_users (insforge_user_id) where insforge_user_id is not null;
create index on wechat_users (email) where email is not null;
create index on wechat_users (unionid) where unionid is not null;
```

### `wechat_register_codes` 表（新建，替代原 wechat_bind_codes）

```sql
-- 统一处理"绑定现有账号"和"新用户注册"两种场景
create table wechat_register_codes (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  code           text not null,        -- 6 位随机数字
  openid         text not null,
  action         text not null,        -- "bind_existing" | "create_new"
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz default now()
);

create index on wechat_register_codes (email, expires_at);
create index on wechat_register_codes (openid);
```

### JWT Payload 规范

```
wechat_unbound:
  { sub: <openid>,            typ: "wechat_unbound",    exp: +1d }
  → verify_user_token 返回 403 "请先验证邮箱"

wechat_email_only:
  { sub: <wechat_users.id>,   typ: "wechat_email_only", exp: +7d }
  → verify_user_token 返回该 UUID 作为 user_id
  → 可访问公开内容 + 订阅管理，无 Stripe 权益

wechat_bound:
  { sub: <insforge_user_id>,  typ: "wechat_bound",      exp: +7d }
  → verify_user_token 返回 insforge_user_id
  → 完整权益
```

### Insforge user_metadata 新增字段（仅 wechat_bound 写入）

```json
{
  "wechat_openid": "oXXX...",
  "wechat_unionid": "uXXX...",
  "push_preferences": { "email": true, "wechat_template": false }
}
```

---

## API 端点

### 已实现

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/wechat/login` | wx code 换 openid，返回账号状态 |
| POST | `/api/wechat/bind` | 邮箱+密码绑定（旧方案，Phase 2 前保留） |
| GET  | `/api/wechat/home-cards` | 首页卡片列表 |

### Phase 1 实现

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/wechat/register/request` | Bearer (unbound) | 发 OTP（自动判断建账号 vs 绑定） |
| POST | `/api/wechat/register/confirm` | Bearer (unbound) | 验证 OTP，返回升级后的 JWT |
| GET  | `/api/wechat/me` | Bearer (any wechat) | 当前用户状态（account_state + email + 订阅状态） |

### Phase 3 实现（PoC 结论悲观时）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/wechat/webview-bridge` | 签发 bridge_ticket |
| POST | `/api/auth/bridge-exchange` | 用 bridge_ticket 换 first-party cookie |

### Phase 4 实现（服务号）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/wechat/webhook` | 服务号 URL 校验 |
| POST | `/api/wechat/webhook` | 服务号消息事件入口 |

---

## 分阶段里程碑

> 每个 Phase 均为独立可交付单元，Phase 0 是决策门控，结论决定后续工作量。

---

### Phase 0 — WebView PoC 真机验证（决策门控，1-2 天）

**目标**：确定 httpOnly cookie 是否在 WebView 内存活，这个结论决定 Phase 3 的工作量。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | 配置真机调试环境 | `services/api.ts` | 填入 ngrok 地址 |
| 0.2 | 真机加载 `/webview-check` | 诊断页 | 用"真机调试 2.0"扫码 |
| 0.3 | 记录 httpOnly cookie 结果 | — | 已登录用户的 session 是否显示 |
| 0.4 | 决策：结果 A（cookie 存活）→ 跳过 Phase 3；结果 B（不存活）→ Phase 3 必做 | — | |

**验收**：有明确文字记录的 PoC 结论（A 或 B）。

---

### Phase 1 — 后端认证基础设施（核心，4-6 天）

**目标**：完整的三态账号模型 + JWT 体系 + 邮件 OTP 注册/绑定流程。

| # | 任务 | 文件 |
|---|------|------|
| 1.1 | 新增 `WECHAT_JWT_SECRET` 到 `config.py` 和 `.env` | `core/config.py` |
| 1.2 | 新建 `features/wechat/jwt_utils.py` — sign / decode 两个函数 | 新文件 |
| 1.3 | 改造 `login_with_code` — 返回时签发正确类型 JWT（unbound / email_only / bound） | `service.py` |
| 1.4 | 改造 `verify_user_token` — 三路分支（Insforge / wechat_bound / wechat_email_only） | `core/deps.py` |
| 1.5 | 更新 `wechat_users` 表结构（新增字段）+ 更新 Edge Function | `edge_functions/wechat-users.js` |
| 1.6 | 新建 `wechat_register_codes` 表 + Edge Function | 新 Edge Function |
| 1.7 | 新增 `POST /api/wechat/register/request` — OTP 发送（自动判断 bind/create） | `router.py` / `service.py` |
| 1.8 | 新增 `POST /api/wechat/register/confirm` — 验证 OTP，升级 JWT | `router.py` / `service.py` |
| 1.9 | 新增 `GET /api/wechat/me` — 返回当前账号状态 | `router.py` |
| 1.10 | 速率限制（slowapi）：同一 openid / email 1 min/1 次 | `router.py` |
| 1.11 | 单元测试：三种 JWT 分别通过验证，错误 typ 被拒绝 | `tests/test_wechat_unit.py` |
| 1.12 | E2E 测试：完整注册→登录→访问受保护端点流程 | `tests/e2e/test_wechat_e2e.py` |

**验收**：`pytest tests/test_wechat_unit.py tests/e2e/test_wechat_e2e.py` 全绿。

---

### Phase 1 实现方案详解

#### 现成方案调研与选型

在动手前先评估每个子任务是否有现成、安全的库可用，避免重复造轮子。

| 子任务 | 候选方案 | 选型结论 |
|--------|---------|---------|
| WeChat code2Session | `wechatpy` 库封装 / 直接调 API（当前实现） | **保持直调**，现有 `service.py` 代码已正确，`wechatpy` 增加依赖但无实质收益 |
| JWT 签发/验证 | `PyJWT` / `python-jose` | **PyJWT 2.12.1**（已在 venv），API 简洁，微信场景无需 JWK/RS256 |
| OTP 验证码 | 数据库表存 6 位码 / `itsdangerous` HMAC token / `pyotp` TOTP | 见下方详细对比 |
| 速率限制 | `slowapi`（已集成）/ 手写缓存 | **slowapi**（项目已用），`@limiter.limit("1/minute")` 直接标注 |
| 邮件发送 | `EmailService`（现有）| **复用现有**，无需改动 |

#### OTP 方案对比

三种方案的全面权衡：

| 维度 | 方案 A：数据库 6 位码（原计划） | 方案 B：`itsdangerous` HMAC token（推荐） | 方案 C：`pyotp` TOTP |
|------|-------------------------------|------------------------------------------|---------------------|
| 数据库依赖 | 需新建表 + Edge Function | **无** | 无 |
| 穷举风险 | 有（6 位 = 100 万组合，需速率限制） | **无**（token 随机 HMAC，不可穷举） | 低（同 6 位，但有时间窗口） |
| 防重放 | `consumed_at` 字段标记 | **需应用层记录已用 token（内存/Redis）** | 需记录已用 counter |
| 撤销能力 | 可直接删记录 | 无法撤销（TTL 内有效） | 无法撤销 |
| 用户体验 | 输入 6 位数字（熟悉） | 点击邮件链接 或 粘贴 token（割裂感低） | 输入 6 位数字（同 A） |
| 实现复杂度 | 中（需 Edge Function） | **低**（3 行代码） | 低（需 `pyotp` 安装） |
| 已安装 | — | **itsdangerous 2.2.0 已在 venv** | 需 pip install |

**选型决策：方案 B（`itsdangerous` HMAC token）**

理由：
1. `itsdangerous 2.2.0` 已安装，零新增依赖
2. 省去 `wechat_register_codes` 表 + 对应 Edge Function（减少约 30% 的 Phase 1.6 工作量）
3. 穷举风险为零，无需 slowapi 双重保险（但速率限制仍保留，防止邮件滥发）
4. 5 分钟 TTL 足够短，撤销需求可忽略
5. 邮件链接体验：用户点击即完成，无需手动输入——在手机端比 6 位码更顺滑

> **注意**：若产品坚持"6 位数字输入"体验，改回方案 A 即可，其余架构不变。

#### Phase 1 Workflow 解析

##### Workflow 1：首次登录（未绑定用户）

```
小程序                         FastAPI                        Insforge/数据库
   │                               │                               │
   │── wx.login() ─────────────────┤                               │
   │                               │                               │
   │── POST /api/wechat/login ─────▶                               │
   │       { code }                │── GET jscode2session ────────▶ 微信服务器
   │                               │◀──── { openid, session_key } ─┤
   │                               │── upsert wechat_users ────────▶
   │                               │   (openid, session_key)       │
   │                               │── get_by_openid ──────────────▶
   │                               │◀── { user_id: null } ─────────┤
   │                               │                               │
   │                               │ sign JWT:                     │
   │                               │   typ="wechat_unbound"        │
   │                               │   sub=openid, exp=+1d         │
   │                               │                               │
   │◀── { is_bound: false, ────────┤                               │
   │      account_state: "unbound",│                               │
   │      token: <unbound_JWT> }   │                               │
   │                               │                               │
   │ 展示选项:                      │                               │
   │   [验证邮箱/订阅] [先逛逛]     │                               │
```

##### Workflow 2：OTP 邮箱验证（绑定/注册）

```
小程序                         FastAPI                        Insforge/邮件
   │                               │                               │
   │ 用户输入邮箱                    │                               │
   │── POST /register/request ─────▶                               │
   │   { email }                   │── 查 Insforge email ──────────▶
   │   Bearer: <unbound_JWT>       │◀── 存在 / 不存在 ──────────────┤
   │                               │                               │
   │                               │ itsdangerous.dumps(           │
   │                               │   {email, openid, action}     │
   │                               │ ) → otp_token                 │
   │                               │                               │
   │                               │── EmailService.send() ────────▶
   │                               │   链接: /wechat-verify?t=otp_token
   │◀── { sent: true, action } ────┤                               │
   │                               │                               │
   │ 用户点击邮件链接               │                               │
   │ (WebView 打开验证页)           │                               │
   │── POST /register/confirm ─────▶                               │
   │   { otp_token }               │ itsdangerous.loads(           │
   │   Bearer: <unbound_JWT>       │   otp_token, max_age=300      │
   │                               │ ) → 解码 email + openid       │
   │                               │   校验 JWT.openid 一致        │
   │                               │                               │
   │                               │ 按 action 分支:               │
   │                               │   bind_existing:              │
   │                               │   ── 查 insforge_user_id ─────▶
   │                               │   ── UPDATE wechat_users ─────▶
   │                               │   ── 写 user_metadata ─────────▶
   │                               │   ── sign JWT(wechat_bound)   │
   │                               │                               │
   │                               │   create_new:                 │
   │                               │   ── UPDATE wechat_users ─────▶
   │                               │      email, email_verified_at │
   │                               │   ── sign JWT(wechat_email_only)
   │                               │                               │
   │◀── { token: <升级后JWT>,  ────┤                               │
   │      account_state, email }   │                               │
   │                               │                               │
   │ 存 token 到 wx.storage         │                               │
   │ 跳转首页                       │                               │
```

##### Workflow 3：已绑定用户再次登录

```
小程序                         FastAPI                        数据库
   │                               │                               │
   │── wx.login() ─────────────────┤                               │
   │── POST /api/wechat/login ─────▶                               │
   │       { code }                │── jscode2session ─────────────▶ 微信服务器
   │                               │◀── { openid } ────────────────┤
   │                               │── get_by_openid ──────────────▶
   │                               │◀── { insforge_user_id: "xxx" }┤
   │                               │                               │
   │                               │ sign JWT:                     │
   │                               │   typ="wechat_bound"          │
   │                               │   sub=insforge_user_id,exp=+7d│
   │                               │                               │
   │◀── { is_bound: true, ─────────┤                               │
   │      token: <bound_JWT> }     │                               │
   │                               │                               │
   │ 直接进首页（无需绑定流程）      │                               │
```

##### Workflow 4：受保护 API 调用（verify_user_token 三路分支）

```
任意客户端                     FastAPI deps.py
   │                               │
   │── GET /api/xxx ───────────────▶
   │   Bearer: <wechat_JWT>        │
   │                               │ token 前缀检测:
   │                               │
   │                               ├─ 能被 WECHAT_JWT_SECRET 解码？
   │                               │     ├─ typ == "wechat_bound"
   │                               │     │     → 返回 sub (insforge_user_id) ✅
   │                               │     │
   │                               │     ├─ typ == "wechat_email_only"
   │                               │     │     → 返回 sub (wechat_users.id) ✅
   │                               │     │       (受限权益)
   │                               │     │
   │                               │     └─ typ == "wechat_unbound"
   │                               │           → 403 "请先验证邮箱" ❌
   │                               │
   │                               └─ 解码失败 → 转 Insforge 验证（现有逻辑）
   │                                   ├─ 200 → 返回 user_id ✅
   │                                   └─ 非200 → 401 ❌
```

#### Phase 1 架构解析

```
┌─────────────────────────────────────────────────────────────────┐
│  features/wechat/                                                │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │   router.py      │   │   service.py      │   │ jwt_utils.py │  │
│  │                  │   │                  │   │  (新建)       │  │
│  │ POST /login      │──▶│ login_with_code  │   │              │  │
│  │ POST /register/  │   │ register_request │   │ sign(sub,    │  │
│  │   request        │   │ register_confirm │──▶│   typ, exp)  │  │
│  │ POST /register/  │   │                  │   │ decode(token)│  │
│  │   confirm        │   │ [使用itsdangerous│   │ [PyJWT]      │  │
│  │ GET /me          │   │  生成/验证OTP]   │   └──────────────┘  │
│  │                  │   │                  │                      │
│  │ [slowapi 速率限制] │   └──────────────────┘                    │
│  └─────────────────┘             │                               │
│                                  │                               │
└──────────────────────────────────┼───────────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
     ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
     │  db.py       │      │ EmailService │      │  core/deps.py│
     │              │      │ (现有，复用)  │      │              │
     │ upsert_wechat│      │              │      │ verify_user_ │
     │ _user        │      │ 发 OTP 链接  │      │ token        │
     │ get_by_openid│      │ 邮件         │      │ (改造:三路   │
     │ bind_user    │      └──────────────┘      │  分支)       │
     │ update_email │                            └──────────────┘
     └──────┬───────┘
            │ Edge Function
            ▼
     ┌─────────────────────┐
     │  Insforge (数据库)   │
     │                     │
     │  wechat_users        │
     │  ├ openid (唯一)     │
     │  ├ insforge_user_id  │
     │  ├ email             │
     │  ├ email_verified_at │
     │  └ account_state 推导│
     │                     │
     │  [无需 register_codes│
     │   表，token 无状态]   │
     └─────────────────────┘
```

**关键设计决策说明**：
- `jwt_utils.py` 只做签发/解码，不访问数据库，保持纯函数，易于单元测试
- `verify_user_token` 通过 `try/except jwt.decode()` 前置检测微信 JWT，解码失败再走 Insforge 路径，不影响现有 web 用户认证
- OTP token 内嵌 openid，confirm 端点从 Bearer JWT 取 openid 后与 token 内 openid 对比，防止 A 请求发的 OTP 被 B 冒用
- `wechat_email_only` 账号的 `sub` 是 `wechat_users.id`（我们内部 UUID），而非 Insforge user_id，因此 `verify_user_token` 需要在返回值中附带账号类型标识，让下游 endpoint 决定是否拦截会员功能

---

### Phase 2 — 小程序 UI 重构（3-4 天）

**目标**：登录页改用 OTP 流程；"我的"Tab 按三态分流。

| # | 任务 | 文件 |
|---|------|------|
| 2.1 | `storage.ts` — 新增 `account_state` / `email` 字段存取 | `utils/storage.ts` |
| 2.2 | `auth.ts` — 替换 bindAccount（密码）为 OTP 两步流程 | `services/auth.ts` |
| 2.3 | `login.wxml/ts` — 重构 UI：微信登录 + 邮箱 OTP 绑定两个区块 | `pages/login/` |
| 2.4 | `profile.ts` — `onShow` 三路分流（未登录 / 游客 / 已绑定→WebView） | `pages/profile/profile.ts` |
| 2.5 | `profile.wxml` — 游客态 UI：绑定价值引导 + 订阅日报入口 | `pages/profile/profile.wxml` |
| 2.6 | `profile.ts` — 已绑定时 `redirectTo` WebView `/profile?from=wechat&token=xxx` | `pages/profile/profile.ts` |
| 2.7 | 模拟器冒烟测试：三种状态 UI 均正确渲染 | — |

**验收**：模拟器走通未登录→游客→OTP 验证→游客升级全流程。

---

### Phase 3 — WebView Bridge（仅当 Phase 0 结果为 B，2-3 天）

**目标**：已绑定 Insforge 账号的用户进入 WebView 时自动恢复登录态。

| # | 任务 | 文件 |
|---|------|------|
| 3.1 | 新增 `POST /api/wechat/webview-bridge` — 签发 15s 一次性 bridge_ticket | `router.py` |
| 3.2 | 新增 `POST /api/auth/bridge-exchange` — ticket 换 first-party cookie | Next.js server action |
| 3.3 | `api.ts` — `buildWebViewUrl` 先请求 bridge_ticket，拼入 URL | `services/api.ts` |
| 3.4 | Next.js layout / middleware — 检测 `_bridge` 参数，调 bridge-exchange | `frontend/` |
| 3.5 | E2E：原生登录→进 WebView→受保护页可访问 | — |

**验收**：真机调试 2.0，已绑定用户打开 WebView 后 `/webview-check` 显示"已登录"。

---

### Phase 4 — 网页端微信登录（中期，3-4 天）

**目标**：`wechat_email_only` 用户可在网页版通过微信 OAuth 登录（不需要密码）。

| # | 任务 | 文件 |
|---|------|------|
| 4.1 | 调研微信网页授权（公众号 OAuth 2.0）可行性，确认 AppID 是否支持 | — |
| 4.2 | 新增 `GET /api/wechat/web-login` — 生成微信授权 URL | `router.py` |
| 4.3 | 新增 `GET /api/wechat/web-callback` — code 换 openid，查 wechat_users，签 session | `router.py` |
| 4.4 | Next.js 新增"微信登录"按钮（仅在中国 UA 或用户主动选择时显示） | `frontend/` |
| 4.5 | 允许 `wechat_email_only` 用户可选升级：邮箱 OTP → 创建完整 Insforge 账号 | `service.py` |

**验收**：网页端"微信登录"按钮走通完整 OAuth 流程，`wechat_email_only` 用户能登录网页版。

---

### Phase 5 — 服务号 / 推送通知（长期，5-7 天）

**目标**：注册服务号，实现模板消息推送，联通 unionid 跨应用识别。

**前提**：已完成微信服务号认证（需营业执照 / 个人主体资质）。

| # | 任务 | 文件 |
|---|------|------|
| 5.1 | 注册微信开放平台，绑定小程序 + 服务号 | — |
| 5.2 | `config.py` 新增 `WECHAT_MP_TOKEN` / `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` | `core/config.py` |
| 5.3 | `GET /api/wechat/webhook` — sha1 签名校验 | `router.py` |
| 5.4 | `POST /api/wechat/webhook` — follow 事件：更新 `wechat_users.service_openid` + `unionid` | `router.py` / `service.py` |
| 5.5 | 新建 `features/wechat_notify/service.py` — 模板消息发送 + access_token 缓存（2h TTL） | 新文件 |
| 5.6 | 在日报 / 早报广播逻辑中加 fan-out：email（现有）+ wechat template（新增） | `features/notification/` |
| 5.7 | 小程序"我的"页新增"关注公众号"引导 | `pages/profile/` |
| 5.8 | 测试：订阅了微信推送的用户收到模板消息；取消推送后不再收 | — |

**验收**：真实手机收到模板消息推送。

---

### 里程碑总览

```
Phase 0  ──── 1-2d ────  WebView PoC 结论（决策门控）
    │
    ├── Phase 1  ── 4-6d ──  后端认证体系（JWT + OTP + 三态账号）
    │       │
    │       └── Phase 2  ── 3-4d ──  小程序 UI 重构（可内测）
    │               │
    │               ├── [若 P0=B] Phase 3 ── 2-3d ── WebView Bridge
    │               │
    │               └── Phase 4 ── 3-4d ── 网页端微信登录
    │                       │
    │                       └── Phase 5 ── 5-7d ── 服务号推送
    │
    └── 可提审节点: Phase 1 + Phase 2 完成后，功能完整可上架
```

**最早可提审**：Phase 0 + Phase 1 + Phase 2 完成（约 8-12 天工作日）。

---

## 测试计划

### 自动化测试

| 测试项 | 位置 | 命令 |
|--------|------|------|
| 后端 service 单元测试 | `tests/test_wechat_unit.py` | `pytest tests/test_wechat_unit.py -v` |
| 后端 API E2E 测试 | `tests/e2e/test_wechat_e2e.py` | `pytest tests/e2e/test_wechat_e2e.py -v` |
| 前端工具库测试 | `lib/__tests__/wechat.test.ts` | `npx vitest run src/lib/__tests__/wechat.test.ts` |

### 手动验收 SOP

**重要：模拟器 vs 真机**

| 测试内容 | 模拟器 | 真机调试 2.0 |
|----------|--------|-------------|
| 原生页面（首页/登录/我的） | ✅ | ✅ |
| WebView CSS 渲染 | ❌ CSS 全丢 | ✅ |
| WebView 登录态 / cookie | ❌ 不可靠 | ✅ |
| API 调用调试 | ✅ | ✅ |

**WebView 测试必须用"真机调试 2.0"**，不要用模拟器。

---

## 安全考虑

- **AppSecret 只存后端**：`project.config.json` 只放 AppID
- **bridge_ticket 一次性 + 15s TTL**：兑换后立即作废，防 URL 日志泄漏
- **wechat JWT 不能伪造 Insforge token**：`verify_user_token` 通过 `typ` claim 区分
- **验证码速率限制**：同一邮箱 1 分钟最多 1 次（slowapi）
- **服务号 webhook 签名校验**：所有 POST 必须通过微信 sha1 签名校验

---

## 推送策略

第一阶段不做微信订阅消息推送（一次授权只能发一条，体验差）。

- "我的"页提供邮箱输入，复用现有 Resend 邮件通道
- 第二阶段注册微信服务号后，`features/wechat_notify/` 模块实现模板消息 fan-out

---

## 待定问题

1. **WebView PoC 结论**：cookie 是否在 web-view 之间共享？须真机测试确认，决定是否需要 bridge ticket。
2. **主体注册**：是否已有中国大陆营业执照/个人主体？影响审核时间线。
3. **UnionID**：需要把小程序和服务号绑定到同一微信开放平台账号才能拿到统一 ID。
4. **服务号 vs 订阅号**：template message 只有服务号（已认证）才有，第二阶段选哪个取决于注册成本。
5. **开发环境广播隔离**：微信侧无对应 test segment，开发期必须用沙箱账号，否则误发给真实用户。

---

## 附录 A：Q&A 技术深度解答

### A1 — "我的" Tab 是否必要？能否用 WebView？

**结论**：Tab 本身必须保留，但 Tab 内的内容可以（且应该）改为 WebView。

#### 为什么 Tab 不能删

微信小程序 TabBar 是全局导航的唯一入口——没有独立浮动按钮、没有全局 drawer。去掉"我的" tab 意味着用户无法随时触达账号相关功能。

#### 为什么 `wx.login()` 必须在原生执行

`wx.login()` 只能在小程序原生 JS 上下文中调用。WebView 里的网页无法调用任何 `wx.*` API（只能调用 `wx.miniProgram.*` 这个受限子集来通知原生侧）。因此，"触发微信登录"这个动作永远必须在原生侧完成。

#### 推荐方案：原生壳 + 条件 WebView

```
未登录状态:
  "我的" Tab → 原生登录页（调 wx.login，展示绑定 UI）

已登录状态（已绑定邮箱）:
  "我的" Tab → 直接 navigateTo WebView
               /profile?from=wechat&token=xxx
               （网页版完整 profile，包括会员状态、订阅偏好等）

已登录状态（未绑定，游客）:
  "我的" Tab → 原生轻量 profile
               （显示微信昵称 + 头像 + "绑定邮箱以解锁完整功能"提示）
```

这样做的好处：
- 已绑定用户 profile 和网页版完全一致，无需单独维护原生 UI
- 未绑定游客看到的是引导绑定的轻量页，不暴露不需要的复杂账号信息
- `wx.login` / logout / token 管理继续留在原生侧，WebView 只消费 token

#### 实现要点

`pages/profile/profile.ts` 在 `onShow` 里判断：
```typescript
onShow() {
  const token = getToken();
  const isBound = !!getUserInfo()?.email;

  if (token && isBound) {
    // 直接跳 WebView profile（不停留在这个 tab page）
    const url = buildWebViewUrl('/profile');
    wx.redirectTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  } else if (token && !isBound) {
    this.setData({ mode: 'guest' });   // 展示轻量 guest UI
  } else {
    wx.redirectTo({ url: '/pages/login/login' });
  }
}
```

WebView 里 `/profile?from=wechat` 已经有 PageShell 隐藏 Navbar/Footer，可以直接使用。

---

### A2 — 测试工具完整说明

见附录 B（展开版）。

---

### A3 — 登录方式方案对比（邮箱验证码 vs 其他）

#### 背景

微信小程序不支持 Google OAuth。Google 用户在网页版只做了 Google 登录、没有设置密码，现有的邮箱+密码绑定对他们完全无效。需要一种"只知道邮箱"就能完成绑定的机制。

以下提供三种技术方案：

---

#### 方案 A：邮箱验证码（服务端 OTP）【推荐】

```
用户在小程序输入邮箱
  ↓
POST /api/wechat/bind/request { email, openid }
  后端:
    1. Insforge server client 查 email → 不存在则 404（"请先注册网页版"）
    2. 生成 6 位随机数字码，写 wechat_bind_codes（TTL 5 分钟）
    3. EmailService.send(email, template="wechat_bind", data={code})
  返回: { sent: true }
  ↓
用户填入 6 位验证码
  ↓
POST /api/wechat/bind/confirm { email, code, openid }
  后端:
    1. 查 wechat_bind_codes，校验 code + TTL + consumed_at IS NULL
    2. 通过 email 查 Insforge user_id
    3. UPDATE wechat_users SET insforge_user_id = ?, bound_at = now() WHERE openid = ?
    4. 调 Insforge server client 在 user_metadata 写入 wechat_openid
    5. 标记验证码 consumed_at = now()
    6. 签发 wechat_bound JWT（sub = insforge_user_id，exp = 7d）
  返回: { token, user_id, email }
```

**依赖**：
- `wechat_bind_codes` 表（新建）
- `WECHAT_JWT_SECRET` 环境变量（PyJWT 已在 venv 中）
- `slowapi` 速率限制：同一 openid / 同一 email 1 分钟最多 1 次

**Pro**：
- 最短路径，完全在小程序原生 UI 完成，不出 app
- 同时支持邮箱用户和 Google 用户（只需知道注册邮箱）
- 代码量最少，复用现有 EmailService

**Con**：
- 用户需要手动切换到邮件 app 查验证码（体验中等）
- 需要建新表和新端点
- 验证码有被穷举风险（需速率限制）

---

#### 方案 B：魔法链接（Magic Link）

```
用户在小程序输入邮箱
  ↓
POST /api/wechat/bind/magic-link { email, openid }
  后端:
    1. 同方案 A 步骤 1
    2. 生成签名 token：HMAC-SHA256(email + openid + timestamp, secret)
    3. 存 DB（TTL 10 分钟，一次性）
    4. EmailService.send(email, body="点击链接完成绑定: https://themarketbrew.com/wechat-bind?token=xxx")
  ↓
用户在手机邮件 app 点击链接
  → 系统浏览器打开 themarketbrew.com/wechat-bind?token=xxx
  → 页面自动 POST /api/wechat/bind/magic-confirm { token }
  → 后端验证 + 绑定
  → 页面显示"绑定成功，请返回小程序"（或尝试打开 wxapp:// scheme）
```

**Pro**：
- 无需输入验证码，点击即完成
- 安全性更高（无穷举风险，token 随机长度）
- 对 Google 用户友好（他们习惯邮件点链接）

**Con**：
- 用户需要在系统浏览器完成，体验割裂（离开小程序 → 邮件 app → 浏览器 → 回小程序）
- `wxapp://` scheme 返回小程序不稳定，部分 iOS 版本受限
- 需要新建 `/wechat-bind` Next.js 页面
- 实现复杂度略高

---

#### 方案 C：WebView 内完成 OAuth（复用现有 login-callback）

```
小程序点"已有账号？在网页登录"
  ↓
wx.navigateTo 打开 WebView → /wechat-login-callback?from=wechat
  ↓
WebView 内:
  - 如果用 Google 登录 → 完成 Google OAuth
  - 如果用邮箱登录 → 填邮箱密码
  ↓
登录成功后:
  wx.miniProgram.redirectTo({ url: '/pages/login/login?token=xxx&user_id=xxx' })
  ↓
原生侧 login.ts 接收 token + user_id，存 wx.storage
  → 此时小程序持有合法的 Insforge access token
  → 但 openid 和 insforge_user_id 还未在 wechat_users 表中关联！
  ↓
需要再调 POST /api/wechat/bind/by-token { openid, insforge_token }
  后端用 insforge_token 验证身份，然后写绑定关系
```

**Pro**：
- Google 登录用户完全不需要输入邮箱（直接 OAuth 完成）
- 已有大部分基础设施（wechat-login-callback 已存在）
- 用户在 WebView 里可以做任何 Web 支持的登录方式

**Con**：
- 用户体验割裂：从小程序 → WebView → 回小程序，心智负担高
- 还需要额外的 `bind/by-token` 端点补写绑定关系
- WebView 内 Google OAuth 需要先在网页版登录一次，不是真正的"一步"

---

#### 推荐组合策略

```
登录页 UI:
  ┌─────────────────────────┐
  │  [微信一键登录]           │  ← 主流程
  │                         │
  │  已有账号？绑定邮箱:       │
  │  [邮箱框] [发送验证码]    │  ← 方案 A（适用全部用户）
  │  [验证码框] [确认绑定]   │
  │                         │
  │  [用网页账号登录 →]      │  ← 方案 C（备用，适合老用户）
  └─────────────────────────┘
```

- **主路径**：方案 A（OTP），支持所有用户，代码最简
- **备用路径**：方案 C（WebView 回调），适合已有网页 session 的老用户
- **暂不实现**：方案 B（magic link），复杂度不值当

---

### A4 — 游客模式 + 订阅自动建账号

#### 账号三态模型

微信用户在我们系统里有且只有三种状态，状态单向递升：

```
状态 1: wechat_unbound
  ─ openid 已知，未提供邮箱
  ─ JWT typ = "wechat_unbound"，sub = openid
  ─ 只能访问公开内容

状态 2: wechat_email_only
  ─ openid + 邮箱已 OTP 验证
  ─ 在我们系统建了账号（内部 UUID），无 Insforge 账号，无密码
  ─ JWT typ = "wechat_email_only"，sub = wechat_users.id（我们的内部 UUID）
  ─ 可订阅日报、接收邮件推送
  ─ 会员权益不可用（无 Stripe/Insforge 关联）

状态 3: wechat_bound
  ─ openid + Insforge user_id 关联（现有网页账号绑定）
  ─ JWT typ = "wechat_bound"，sub = insforge_user_id
  ─ 完整权益，和网页账号共享会员状态 / 收藏 / Brew
```

#### 游客浏览流程

```
wx.login() → openid → wechat_users upsert
  ↓
返回 { is_bound: false, account_state: "unbound" }
  ↓
小程序展示两个选项:
  ├── [验证邮箱 / 订阅日报]  → 进入 OTP 流程（建账号或绑定现有账号）
  └── [先逛逛]               → 进首页，游客模式

游客可访问:
  - 首页卡片（无需认证）
  - WebView 公开内容（日报摘要、早报）
  - 会员内容 → 网页自然拦截显示"请登录"
```

#### 订阅/注册 OTP 流程（统一入口）

无论是"订阅日报"还是"注册账号"，都走同一个 OTP 入口：

```
用户输入邮箱 → POST /api/wechat/register/request { email, openid }

  后端:
    查 Insforge: email 是否存在？
    ├── 存在（已有网页账号）:
    │     发邮件："您的验证码 {code}，验证后微信将绑定到此账号"
    │     返回 { action: "bind_existing" }
    │
    └── 不存在（全新用户）:
          发邮件："您的验证码 {code}，验证后为您创建账号并开通日报订阅"
          返回 { action: "create_new" }

用户填入验证码 → POST /api/wechat/register/confirm { email, code, openid }

  后端按 action 分支:

  ── bind_existing ──────────────────────────────
    1. 校验 code + TTL
    2. 查 Insforge user_id by email
    3. UPDATE wechat_users SET insforge_user_id=?, bound_at=now()
    4. 写 Insforge user_metadata.wechat_openid
    5. 签 JWT {typ:"wechat_bound", sub: insforge_user_id, exp:7d}
    6. 加入 Resend 邮件订阅列表（如未订阅）
    返回 { account_state:"bound", token, email }

  ── create_new ─────────────────────────────────
    1. 校验 code + TTL
    2. INSERT wechat_users SET
         email = ?,
         email_verified_at = now(),
         insforge_user_id = NULL  ← 无 Insforge 账号
    3. 签 JWT {typ:"wechat_email_only", sub: wechat_users.id, exp:7d}
    4. 加入 Resend 邮件订阅列表
    返回 { account_state:"email_only", token, email }
```

#### `verify_user_token` 三路处理

```python
# typ = "wechat_bound"      → sub 是 insforge_user_id，完整权益
# typ = "wechat_email_only" → sub 是 wechat_users.id（内部 UUID），
#                              只能访问公开 API + 订阅管理
# typ = "wechat_unbound"    → 403，引导验证邮箱
```

#### 未来：网页端微信登录

`wechat_email_only` 用户后续在网页端访问时，需要提供一个登录入口（不能用密码，因为没设密码）。方案留到 Phase 4：
- 网页端展示"用微信登录"按钮 → 跳转微信 OAuth 或扫码
- 用 openid 找到 `wechat_users`，查 insforge_user_id
- 若有 → 已绑定，正常登录
- 若无（`wechat_email_only`）→ 可选择：用邮箱验证码升级绑定、或新建 Insforge 账号

此阶段不需要修改现有网页认证流程，新增入口即可。

---

### A5 — 小程序"我的"页面 UI 重新设计

#### 现有问题

1. 只显示 openid（用户不理解这是什么）
2. 无会员状态
3. 唯一功能入口"邮件订阅"指向 WebView，等于没有原生价值
4. 未登录状态的空页面没有引导

#### 新设计方向

**未登录游客**（原生页）:
```
┌─────────────────────────────┐
│  [应用 Logo + 名称]          │
│                             │
│  ┌─── 欢迎使用 ────────────┐ │
│  │  [微信头像占位图]        │ │
│  │  游客模式               │ │
│  │  [微信一键登录] (绿色)   │ │
│  └─────────────────────────┘ │
│                             │
│  免费内容预览:               │
│  · 每日市场日报摘要          │
│  · 盘前早报                 │
│  登录后解锁全部功能          │
└─────────────────────────────┘
```

**已登录 + 已绑定**（直接跳 WebView `/profile?from=wechat`，不停留）

**已登录 + 未绑定游客**（原生轻量页）:
```
┌─────────────────────────────┐
│  [微信头像]  微信用户         │
│  游客模式 · 免费内容可用     │
│                             │
│  ┌─── 解锁完整功能 ────────┐ │
│  │  绑定邮箱账号以获得:    │ │
│  │  ✓ 专属 For You 日报    │ │
│  │  ✓ 会员内容            │ │
│  │  ✓ 投资组合跟踪         │ │
│  │  [绑定邮箱账号]        │ │
│  │  [订阅日报（输入邮箱）] │ │
│  └─────────────────────────┘ │
│                             │
│  [退出登录]                 │
└─────────────────────────────┘
```

#### 实现策略

- 移除"openid"显示（用户不关心）
- 未绑定用户不进入 WebView（不需要 token）
- 已绑定用户的所有账号管理交给网页版 `/profile`（已有完整 UI）
- "我的"原生页的职责缩减为：**登录触发 + 绑定引导 + 游客信息展示**

---

### A6 — 后端完整技术方案

#### 6.1 数据模型（完整表结构）

**`wechat_users` 表（现有 + 扩展字段）**

```sql
create table wechat_users (
  id               uuid primary key default gen_random_uuid(),

  -- WeChat 身份（永久不变）
  openid           text not null unique,  -- 小程序 openid，对同一用户永久不变
  unionid          text unique,           -- 跨应用统一 ID（需绑定开放平台后才有）
  service_openid   text,                  -- 服务号 openid（第二阶段，关注服务号后填入）

  -- 账号绑定
  insforge_user_id uuid,                  -- 绑定后指向 Insforge user.id
  bound_at         timestamptz,           -- 绑定时间
  unverified_email text,                  -- 游客订阅邮箱（OTP 验证前暂存）

  -- 微信 session（每次 wx.login 刷新）
  session_key      text,                  -- 用于解密 encryptedData（目前未用）
  nickname         text,
  avatar_url       text,

  last_login_at    timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- 索引
create index on wechat_users (insforge_user_id);
create index on wechat_users (unionid) where unionid is not null;
create index on wechat_users (service_openid) where service_openid is not null;
```

**openid 的持久性保证**：
- openid 对同一微信用户 + 同一小程序 AppID 永久不变，即使用户卸载重装也不变
- unionid 跨应用（小程序 + 服务号）唯一，但需要注册微信开放平台并绑定才能获得

---

**`wechat_bind_codes` 表（新建）**

```sql
create table wechat_bind_codes (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  code           text not null,       -- 6 位数字
  openid         text not null,       -- 请求绑定的小程序 openid
  expires_at     timestamptz not null,
  consumed_at    timestamptz,         -- 消费时间，非 null 表示已用
  created_at     timestamptz default now()
);

create index on wechat_bind_codes (email, expires_at);
create index on wechat_bind_codes (openid);
-- 清理任务：定期删除 expires_at < now() - interval '1 day' 的记录
```

---

**Insforge `user_metadata` 新增字段（绑定后写入）**

```json
{
  "wechat_openid": "oXXX...",
  "wechat_unionid": "uXXX...",
  "wechat_service_openid": "oYYY...",
  "push_preferences": {
    "email": true,
    "wechat_template": false
  }
}
```

---

#### 6.2 微信一键登录完整流程

```
[小程序]
  onWechatLogin() → wx.login() → { code }  [有效期 5 分钟]
        │
        ▼
POST /api/wechat/login { code }
        │
        ▼ [后端 service.py]
  1. jscode2session(code, WECHAT_APP_ID, WECHAT_APP_SECRET)
     → { openid, session_key, [unionid if open platform bound] }
     错误: errcode=40029 → code 无效/过期

  2. upsert wechat_users:
     INSERT INTO wechat_users (openid, session_key, unionid, last_login_at)
     ON CONFLICT (openid) DO UPDATE SET
       session_key = excluded.session_key,
       unionid = COALESCE(excluded.unionid, wechat_users.unionid),
       last_login_at = now()

  3. 查 wechat_users.insforge_user_id
     ├── insforge_user_id IS NOT NULL (已绑定)
     │     sign_jwt(sub=insforge_user_id, typ="wechat_bound", exp=7d)
     │     返回 { success, openid, is_bound: true, token }
     │
     └── insforge_user_id IS NULL (未绑定)
           sign_jwt(sub=openid, typ="wechat_unbound", exp=1d)
           返回 { success, openid, is_bound: false, token }
           （unbound token 只能访问公开 API，不能访问用户数据）
```

**JWT 实现**（PyJWT 已在 venv，追加到 config.py）：

```python
# backend/app/core/config.py (新增)
WECHAT_JWT_SECRET = os.getenv("WECHAT_JWT_SECRET", "")
# ⚠ 必须在 .env 中设置，不能用默认空字符串
```

```python
# backend/app/features/wechat/jwt_utils.py (新文件)
import jwt
from datetime import datetime, timezone, timedelta
from app.core.config import WECHAT_JWT_SECRET

def sign_wechat_jwt(sub: str, typ: str, exp_days: int) -> str:
    return jwt.encode({
        "sub": sub,
        "typ": typ,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=exp_days),
    }, WECHAT_JWT_SECRET, algorithm="HS256")

def decode_wechat_jwt(token: str) -> dict:
    """Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, WECHAT_JWT_SECRET, algorithms=["HS256"])
```

---

#### 6.3 `verify_user_token` 双 Token 支持

```python
# backend/app/core/deps.py (改造)
import jwt as pyjwt
from app.features.wechat.jwt_utils import decode_wechat_jwt

async def verify_user_token(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    接受两种 Bearer token:
    1. Insforge access token → 调 Insforge /sessions/current 验证
    2. WeChat JWT (typ=wechat_bound) → 本地验证，sub 即 insforge_user_id

    未绑定 wechat_unbound token → 401，引导绑定。
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization header")

    token = authorization[7:]

    # ── 路径 1: 检查缓存 ──────────────────────────────────────────
    cached = _token_cache.get(token)
    if cached:
        user_id, _email, expiry = cached
        if time.time() < expiry:
            return user_id
        del _token_cache[token]

    # ── 路径 2: 尝试 WeChat JWT（本地验证，更快）──────────────────
    try:
        payload = decode_wechat_jwt(token)
        typ = payload.get("typ", "")
        if typ == "wechat_bound":
            user_id = payload["sub"]
            _token_cache[token] = (user_id, "", time.time() + _CACHE_TTL)
            return user_id
        if typ == "wechat_unbound":
            raise HTTPException(403, "Wechat account not bound. Please bind your email first.")
    except pyjwt.InvalidTokenError:
        pass  # 不是 WeChat JWT，继续尝试 Insforge

    # ── 路径 3: Insforge token 验证（现有逻辑）───────────────────
    ... # 现有代码不变
```

---

#### 6.4 邮箱绑定（OTP 方案，推荐路径）

```
[小程序] 用户输入 email → 点"发送验证码"
  ↓
POST /api/wechat/bind/request
  Header: Authorization: Bearer <wechat_unbound_token>
  Body: { email }

  后端:
    1. decode_wechat_jwt(token) → openid（从 sub 取）
    2. Insforge server client 查 email 是否存在
       - 不存在 → 404 "该邮箱未注册，请先在网页版创建账号"
    3. 速率检查（slowapi）: openid 1min/1次，email 1min/1次
    4. 生成 6 位随机数字码
    5. INSERT wechat_bind_codes (email, code, openid, expires_at=now()+5min)
    6. EmailService.send(to=email, subject="微信绑定验证码",
                        body=f"您的验证码是 {code}，5分钟内有效")
  返回: { sent: true }

[小程序] 用户输入 6 位验证码 → 点"确认绑定"
  ↓
POST /api/wechat/bind/confirm
  Header: Authorization: Bearer <wechat_unbound_token>
  Body: { email, code }

  后端:
    1. decode_wechat_jwt(token) → openid
    2. SELECT FROM wechat_bind_codes
       WHERE email=? AND code=? AND openid=?
         AND expires_at > now() AND consumed_at IS NULL
       → 未找到 → 400 "验证码无效或已过期"
    3. Insforge server client: 查 email → insforge_user_id
    4. UPDATE wechat_users
         SET insforge_user_id=?, bound_at=now()
       WHERE openid=?
    5. Insforge server client: PATCH user_metadata += {wechat_openid: openid}
    6. UPDATE wechat_bind_codes SET consumed_at=now()
    7. sign_jwt(sub=insforge_user_id, typ="wechat_bound", exp=7d)
  返回: { success: true, token, user_id, email }
```

---

#### 6.5 多渠道身份合一（Resolve to same user）

| 标识符 | 范围 | 永久性 | 说明 |
|--------|------|--------|---------|
| `openid` | 同一 AppID（小程序/公众号） | 永久 | **多端不统一**。同一用户在小程序和网页扫码下的 OpenID 不同。 |
| `unionid` | 同一微信开放平台账号 | 永久 | **跨端统一锚点**。同一用户在同一主体下的所有应用中 UnionID 相同。 |
| `insforge_user_id` | 我们的业务系统 | 永久 | 最终关联的业务账号 ID。 |

**跨渠道识别策略（UnionID 优先识别）：**

为了支持未来“网页扫码登录”与“小程序登录”识别为同一用户，后端 `login_with_code` 逻辑演进如下：

1.  **获取 UnionID**：调用 `jscode2session` 时，如果用户已关注关联的公众号或在开放平台有记录，微信会返回 `unionid`。
2.  **多维度查找（Merge Logic）**：
    *   **Step 1**：优先尝试 `SELECT * FROM wechat_users WHERE openid = :openid`。
    *   **Step 2**：若未找到，且存在 `unionid`，则尝试 `SELECT * FROM wechat_users WHERE unionid = :unionid`。
    *   **合并记录**：如果通过 `unionid` 找到了记录，说明用户曾从其他渠道（如网页扫码）进入过。此时，将当前的 `openid` 更新到该记录中，实现身份合并，用户立即继承已有的绑定状态和 `insforge_user_id`。

**扩展性优势：**
- **网页登录支持**：当实现网页端扫码登录（Phase 4）时，网页端拿到 `unionid` 后同样能识别出用户已在小程序绑定的 Insforge 账号。
- **存量合并**：用户只需在任一端完成一次邮箱绑定，全渠道自动同步。

**持久识别策略（分阶段）：**
1. **第一阶段**：用 `openid` 作为微信侧唯一 ID，`insforge_user_id` 作为业务侧 ID。
2. **第二阶段（服务号上线后）**：注册微信开放平台，把小程序和服务号都绑定进去，从 jscode2session 响应中拿到 `unionid`，写入 `wechat_users.unionid`。此后 `unionid` 是跨小程序+服务号的统一识别锚点。
3. **重新安装后的持久性**：用户卸载重装小程序 → `wx.login()` 返回同一 `openid` → 后端 `wechat_users` 里找到记录 → `insforge_user_id` 仍在 → 自动恢复登录态。

---

#### 6.6 服务号/公众号集成（第二阶段路线图）

```
现在（小程序）:
  openid_miniapp  ──绑定── insforge_user_id

未来（+服务号）:
  注册微信开放平台
    ├── 绑定小程序
    └── 绑定服务号

  此后 jscode2session 返回 unionid
    → wechat_users.unionid 填入

  用户关注服务号 → 服务号 follow 事件 webhook
    → 事件里有 service_openid + unionid
    → 通过 unionid 找到已有 wechat_users 记录
    → 填入 wechat_users.service_openid

  模板消息推送:
    POST https://api.weixin.qq.com/cgi-bin/message/template/send
    { touser: service_openid, template_id: ..., data: {...} }
```

**服务号 Webhook 端点**（第二阶段实现）：

```python
# GET /api/wechat/webhook — URL 校验
# POST /api/wechat/webhook — 事件处理
async def wechat_webhook(request: Request):
    # 1. 校验微信签名（sha1）
    # 2. 解析 XML（follow/unfollow/text 等事件）
    # 3. follow 事件: 取 service_openid + unionid，更新 wechat_users
    # 4. text 消息: BackgroundTasks → LLM → 客服消息回复
    # 5. 5 秒内必须返回（慢处理用 BackgroundTasks）
```

**注意事项与生产环境策略**：
- **域名收敛策略 (Next.js Rewrites)**:
  - **目标**: 生产环境下，小程序 `BASE_URL` 应统一指向前端主域名 `https://www.themarketbrew.com/api`，而非直连 Railway 后端。
  - **实现**: 在 `next.config.ts` 中配置 `rewrites` 规则，将特定业务路径中转至后端。
  - **白名单机制**: 为防止滥用，必须针对小程序需要的业务模块（如 `/api/wechat/*`, `/api/market/*`, `/api/stocks/*`）进行显式的白名单路径匹配，严禁全量透传。
  - **优势**: 微信后台仅需配置一个合法域名，规避共享后缀域名审核风险，统一认证上下文。
- 模板消息只有已认证服务号才有（需营业执照 / 个人主体认证）
- unionid 需要在微信开放平台绑定，没有绑定则服务号和小程序 openid 无法关联

---

## 附录 B：WebView 测试工具使用说明

### B1 — 诊断页 `/webview-check`

**目的**：在微信 WebView 环境中验证以下关键问题：
1. httpOnly cookie 是否能跨 WebView 存活（决定是否需要 bridge token）
2. 是否真的运行在小程序 WebView 里（UA 检测）
3. localStorage / sessionStorage 是否可用

**文件位置**：`frontend/src/app/webview-check/page.tsx`

**访问方式**：

| 环境 | 访问方法 |
|------|---------|
| 本地浏览器（开发调试） | `http://localhost:3000/webview-check` |
| 模拟器 WebView | 把任意 WebView 跳转 URL 改为 `{WEB_BASE_URL}/webview-check` |
| 真机调试（推荐） | 真机调试 2.0 + WebView 加载 `{WEB_BASE_URL}/webview-check` |

**在小程序里触发（临时方法）**：

在 `pages/home/home.ts` 的 `onLoad` 里临时加一行，或修改某张卡片的 URL：
```typescript
// 临时调试用，测完还原
onLoad() {
  const url = `${WEB_BASE_URL}/webview-check?from=wechat`;
  wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
}
```

### B2 — 读取诊断结果

| 指标 | 期望值 | 说明 |
|------|--------|------|
| `/api/auth/session` 状态码 | 200 | 服务器能正常响应 |
| 已登录用户 | 显示邮箱 | httpOnly cookie 跨 WebView 存活（乐观结果 A） |
| 已登录用户 | 未登录 | httpOnly cookie 不跨 WebView（悲观结果 B，需实现 bridge ticket） |
| `insforge_csrf_token` 存在 | 是 | 非 httpOnly cookie 存活 |
| 小程序 web-view | 是 | UA 中含 `miniProgram`，确认环境正确 |
| localStorage 可用 | 是 | 可以用 sessionStorage 存 token |

### B3 — 测试环境配置速查

**`miniprogram/services/api.ts` 中的两个 URL**：

```typescript
// 后端 API URL
const BASE_URL = 'http://localhost:8000/api';          // 模拟器
// const BASE_URL = 'https://xxx.ngrok-free.app/api';  // 真机调试

// 前端 WebView URL
const WEB_BASE_URL = 'http://localhost:3000';          // 浏览器调试
// const WEB_BASE_URL = 'https://yyy.ngrok-free.app';  // 真机调试
// const WEB_BASE_URL = 'https://themarketbrew.com';   // 生产
```

**真机调试步骤**：

1. 启动后端：`cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
2. 启动前端：`cd frontend && npm run dev`
3. 暴露公网：`ngrok http 8000`（终端 1）+ `ngrok http 3000`（终端 2）
4. 把两个 ngrok HTTPS 地址填入 `api.ts` 的 `BASE_URL` / `WEB_BASE_URL`
5. 微信开发者工具 → 工具栏 → **真机调试 2.0** → 手机扫码
6. 手机上操作，PC 上看 Console 和 Network 日志

**模拟器注意事项**：
- WebView CSS 完全丢失（已知限制，用简化浏览器引擎）
- WebView 内 JS 行为不可靠
- 仅用于测试原生页面（首页卡片加载、登录 API 调用）
- **绝对不要**用模拟器的 WebView 结果做架构决策

### B4 — 快速验收 SOP (手动测试 Checklist)

无需发布代码即可进行全面测试。请按以下顺序操作：

#### 1. 基础设施准备
- [ ] **启动后端**：`cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] **启动前端**：`cd frontend && npm run dev`
- [ ] **启动 ngrok**：`ngrok http 8000` (后端) 和 `ngrok http 3000` (前端)
- [ ] **同步地址**：将 ngrok 生成的 HTTPS 地址填入小程序 `miniprogram/services/api.ts` 的 `BASE_URL` 和 `WEB_BASE_URL`。

#### 2. 开发者工具设置
- [ ] **跳过校验**：工具右上角 -> **详情** -> **本地设置** -> 勾选“**不校验合法域名、业务域名、TLS版本以及 HTTPS 证书**”。
- [ ] **清理旧状态**：工具顶部菜单 -> **缓存** -> **全部清除**（确保以全新用户身份模拟进入）。

#### 3. 执行核心功能测试
- [ ] **真机进入**：点击工具栏“**真机调试 2.0**”，用手机微信扫码进入。
- [ ] **一键登录**：点击“微信一键登录”，观察控制台 Network 确认 `/api/wechat/login` 返回了 `token`。
- [ ] **OTP 绑定**：输入测试邮箱 -> 点击发送 -> 在手机邮件 App 中点击验证链接 -> 返回小程序，页面应自动或经引导刷新为已登录状态。
- [ ] **WebView 诊断**：点击诊断卡片进入 `/webview-check`，确认 `httpOnly cookie` 状态。

---

### B5 — 微信测试环境说明 (FAQ)

**问：测试前一定要发布代码到腾讯服务器吗？**
**答：不需要。** 微信小程序设计了完善的本地调试机制：

1.  **开发版 (Development)**：通过“真机调试”或“预览”生成的版本。它直接请求您在代码中指定的服务器地址（如 ngrok 地址）。**Phase 1 & 2 的所有功能都在此模式下完成验证**。
2.  **体验版 (Experience)**：上传代码后，在微信管理后台将其设为体验版。这通常在后端 API 已经部署到公网测试服务器（如 Railway）后使用。
3.  **正式版 (Release)**：经过腾讯审核通过后的版本，面向所有真实用户。

**问：我可以使用测试号吗？**
**答：可以但没必要。** 既然您已有正式的 AppID (`wx55148e...`)，直接在开发者工具中使用该 AppID 即可。只要您不点击“上传”并“提交审核”，您的任何测试行为都不会影响到线上用户。
