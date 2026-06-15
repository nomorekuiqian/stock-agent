# Subscription Model

TheMarketBrew freemium 模式的订阅 contract. Source of truth, 与代码实现一致.

## 套餐分层

| 套餐 | 标识 | DB 信号 |
|---|---|---|
| Free | `plan="free"` 或无 subscription 行 | `entitlements=[]` |
| Pro | `plan="pro"` | `entitlements` 含 PRO_FEATURES, `access_expires_at=NULL` |
| Max | `plan="max"` | `entitlements` 含 MAX_FEATURES, `access_expires_at=NULL` |
| Lifetime | `is_lifetime=true` | 永久 Max 全功能 |
| 非 Stripe grant (过渡/赠送) | `access_expires_at` 未来 + `plan/status/entitlements` | 读时按 `access_expires_at` 失效；每日 reconciliation 清成 Free/expired |

## 功能边界

**正式销售层只有 Pro / Max**:

| 功能 | Free | Pro | Max |
|---|---|---|---|
| `daily_report` (公开版) | 完整 | 完整 | 完整 |
| 宏观 dashboard | 基础视图 | 完整 | 完整 |
| watchlist 数量 | 25 | 25 | 25 |
| AI 投研对话 (`/api/research/chat`) | 2/天 | 2/天 | 无限 |
| 博主 Agent (`/api/kol_research/chat`) | 2/天 | 2/天 | 无限 |
| Qinbafrank 研究室子页 | 登录后 Max CTA | 登录后 Max CTA | 解锁 |
| 推特日报 (`twitter_digest`) | 前 3 封 intro 完整版 (注册 D0/D1/D2 自然日), 之后停 | 锁 | 每天完整 |
| `morning_report_email` / `weekly_report_email` / `personal_digest_email` | 无 | 有 | 有 |
| 个股深度研究 (`stock_research`) | 无 | 锁 | 无限 |

后端安全边界必须和上表一致。前端 PaywallGuard 只负责展示/导航，不能作为权限保护。

必须后端 gate 的付费内容：
- Stock AI 内容（缓存读取 + 生成）：`/api/stocks/{symbol}/analysis/cache`, `/analysis`, `/technical`, `/news`, `/macro`, `/market-analysis`, `/earnings` 必须 `verify_user_token` + `stock_research`。
- Portfolio 写入和体检：必须 `portfolio_management`。
- For You Action Bar：必须 `for_you_website`。
- 邮件偏好开启付费频道：必须按对应 entitlement 校验。

## 设计原则

1. **watchlist 对 Free 是钩子, 不是价值**: Free / Pro / Max 全部上限 25 — 数量不是付费卖点, 唯一作用是让用户录入"自己的股票"后引导升级 Pro 拿专属日报. Free 用户能加 25 只但收不到任何基于持仓的邮件, 没有日常 ROI; 这是设计意图.
2. **AI 投研对话 Pro 不差异化**: Free + Pro 都是 2/天, Max 无限. AI 投研是 Max 独家深度使用功能, **不是 Pro 升级卖点**. Pro 卖点全部在邮件层 (morning / weekly / personal_digest). Max 卖点: 推特日报 + AI 投研无限 + 个股深度无限.
3. **推特日报 "前 3 封后停"**: 注册自然日 D0/D1/D2 各发 1 封完整版, 周末也发 (跟正常发刊日历独立; 周末无新内容时复用最近一期). D4 onboarding 邮件转化推 Max.
4. **专属日报通过 onboarding 流程做转化**: Step 2 建完自选股 → Step 3 modal **直跳 Stripe Checkout** (`POST /api/payment/checkout-session` with `tier="pro"`), 不经 `/pricing`.

## Entitlements

`subscriptions.entitlements` 是 JSONB array, 由 `backend/app/features/payment/entitlements.py` 维护.

**PRO_FEATURES**:
- `morning_report_email`
- `weekly_report_email`
- `personal_digest_email`
- `watchlist_extended` (保留, 但 Free 也 25 后不再有差异; 未来可能 repurpose)
- `today_website` / `for_you_website` / `morning_website`

**MAX_ONLY_FEATURES** (Pro 之外):
- `stock_research`
- `ai_research_engine` (赋予无限 `/api/research/chat` quota)
- `portfolio_management`
- `twitter_digest`

**MAX_FEATURES** = `PRO_FEATURES | MAX_ONLY_FEATURES`

**Legacy KOL pack key**:
- `kol_pack_qinbafrank` 历史 Ultra/Qinbafrank pack key，迁移期只用于识别旧 Stripe entitlement 或 DB 残留；同步时归一化为 `plan="max"` + `MAX_FEATURES`，active rows 迁移后不应再保留该 key。

新用户开通 Pro/Max 走 Stripe Checkout；已有 Pro 真实付费订阅升级 Max 走 Stripe Billing Portal `subscription_update_confirm`，不能创建第二个并行订阅。升级使用 `proration_behavior=always_invoice` 的 Billing Portal configuration，由 Stripe 立即按剩余周期收取差价，不能手动退款后重收全额，也不能重新收一整笔目标套餐价格。Checkout 回跳会带 `session_id={CHECKOUT_SESSION_ID}`，成功页调用 `/api/payment/checkout-session/complete` 主动同步；Portal 回跳通过 `subscription-status?fresh=true` 从 Stripe Subscription 刷新本地 plan/status/entitlements。

旧 `tier=ultra` / `product=creator_max_qinbafrank` / Stripe Ultra price / lookup key `themarketbrew_ultra_monthly` 在迁移窗口归一化为 Max，避免历史链接或 webhook 失败。

**Lifetime** (`is_lifetime=true`) 自动 grant 完整 `MAX_FEATURES`，并忽略 row 上存储的 legacy `kol_pack_qinbafrank`。

## Ultra -> Max 迁移

生产迁移先跑 dry-run:

```bash
cd backend
source venv/bin/activate
python scripts/migrate_ultra_to_max.py
```

核对 `backend/tmp/ultra-to-max-migration/*.json` 后再执行:

```bash
python scripts/migrate_ultra_to_max.py --apply
```

脚本会把 active/trialing/grant/lifetime legacy Ultra rows 改为 `plan=max` + `MAX_FEATURES`，把 inactive legacy rows 清成 Free，并标出仍在 Stripe Ultra price 上、需要人工移动到 Max price 的 subscription。当前确认没有真实 `$30/月` Ultra 付费用户，因此不做 refund/credit 逻辑。

## 配额规则

- **AI 投研对话** (`/api/research/chat`): 无 `ai_research_engine` entitlement 的用户每天 2 次. Redis 计数 (`backend/app/features/quota/`), 按 user_id 或 IP, midnight UTC reset. `quota/service.py:17` `DAILY_LIMIT = 2`.
- **博主 Agent** (`/api/kol_research/chat`): 与普通 Research 共享每日 2 次免费额度；Max 通过 `ai_research_engine` unlimited。
- **推特日报 intro**: 无 `twitter_digest` entitlement 的用户, 注册起 3 个自然日内每天 1 封. `lifecycle_state.intro_sent_count` 跟踪, max 3.
- **watchlist**: 所有用户最多 25 (Pydantic + 前端校验).

## Lifecycle State

新增字段 (Phase 0 migration):

- `subscriptions.lifecycle_state` (JSONB, default `{}`):
  - `onboarding_sent`: `{day_int: ISO_timestamp}` — legacy onboarding drip 发送记录；当前 Day 3/7/14 drip 邮件已删除，cron no-op 不再写入
  - `intro_sent_count`: int — 已发推特日报 intro 数 (max 3)
  - `triggered_at`: `{trigger_key: ISO_timestamp}` — 行为触发邮件 cooldown (Phase 4)
- `subscriptions.reactivation_state` (TEXT, default NULL): enum `NULL` / `cohort_a` / `cohort_b` / `cohort_c` / `cold` (Phase 3 使用)
- `subscriptions.onboarding_completed_at` (TIMESTAMP, default NULL): 首页 Guided Tour 完成或跳过的时间

未完成 onboarding (`onboarding_completed_at IS NULL`) 的用户访问受限页面 → 由前端 `OnboardingGate` 在后端明确返回 `completed:false` 时跳转首页 `/?tour=1`。Next.js middleware 只做 cookie gate，不再负责 onboarding redirect。

## CTA Tier 决策

`is_real_paid_sub(sub)` (`backend/app/features/subscription/cta_tier.py`):

1. `is_lifetime=true` → **True**
2. `access_expires_at` 非空 → **False**（非 Stripe grant / 试用用户进入 Free CTA）
3. `status != "active"` → **False**（Stripe trialing/canceled 不算真付费）
4. `stripe_subscription_id` 为空 → **False**（手工 grant 不算真付费）
5. `entitlements` 为空 → **False**
6. 否则 → **True**（active Stripe subscription + entitlements + 无 grant expiry）

## Grant 到期与同步

- 真付费订阅通过 Stripe Subscription + Entitlements webhook 同步 `plan/status/entitlements`；legacy Ultra price / metadata / entitlement 一律归一化为 Max。
- Webhook compensation：`checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted` 会调用同一个 entitlement sync，减少 webhook 乱序或漏投造成的漂移。
- Stripe entitlement sync 写入 `plan/status/entitlements` 时必须清理旧 `access_expires_at`，避免历史 grant 到期字段拦住真实付费订阅。
- 非 Stripe grant 仍保存在同一张 `subscriptions` 表，用 `access_expires_at` 表达到期时间。
- 权限读取时必须检查 `access_expires_at`；每日 `POST /api/payment/reconcile-expired-grants` 只是把已过期 grant 的展示状态清理成 `plan="free"`, `status="expired"`, `entitlements=[]`，并同步 Resend。查询/写入失败必须让 cron 返回失败，不能假装 0 条成功。
- 新增试用优先使用 Stripe Trial Subscription，这样到期、取消和 entitlement 清理都走 Stripe webhook；`access_expires_at` 主要作为历史/手动 grant 兜底。
- Stripe `trialing` subscription 也代表 active access；前端 display/activation 和 deleted webhook replacement-sub 检查都必须兼容 `trialing`。

## Onboarding 流程

新用户主路径是首页轻量 Guided Tour：

1. 注册或首次 OAuth 后默认落到 `/?tour=1`；该入口会先检查本地/后端完成状态，已完成用户不再显示 tour。
2. 首页 `HomeGuidedTour` 用 spotlight/coach-mark 高亮真实 UI，不再强制进入独立 onboarding 页面。
3. Tour 高亮顶部导航的四个入口：AI 研究助手、每日简报、投研、我的，简短说明每天看简报、需要深挖时进 Agent、从个股/宏观/博主研究室切入，以及在「我的」里添加自选股启动专属监控。
4. 用户点“完成导览”或“跳过”时，前端 best-effort 调 `POST /api/user/onboarding/complete`，写 `onboarding_completed_at = NOW()`，并写本地 `onboarding_completed:{userId}` marker。
5. 手动调试使用 `/?tour=home` 强制预览；不要把它作为注册默认 redirect。

独立 `/onboarding` 页面已移除；更细的自选股和持仓设置继续放在 `/for-you/onboarding`、`/for-you/watchlist` 等真实功能页里承接。

## 监控边界

监控实现以 `backend/app/features/subscription/`、`backend/app/features/payment/`
和对应 `.context.md` 为准.
