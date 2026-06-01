# Subscription Model

TheMarketBrew freemium 模式的订阅 contract. Source of truth, 与代码实现一致.

相关 plan: [`docs/plans/active/freemium-lifecycle-email.md`](../plans/active/freemium-lifecycle-email.md)

## 套餐分层

| 套餐 | 标识 | DB 信号 |
|---|---|---|
| Free | `plan="free"` 或无 subscription 行 | `entitlements=[]` |
| Pro | `plan="pro"` | `entitlements` 含 PRO_FEATURES, `access_expires_at=NULL` |
| Max | `plan="max"` | `entitlements` 含 MAX_FEATURES, `access_expires_at=NULL` |
| Lifetime | `is_lifetime=true` | 永久全功能 (覆盖 Max) |
| 老 trial (过渡) | `invite_code='AUTO_TRIAL'` + `access_expires_at` 未来 | 让现有 trial 自然走完, 到期后降 Free; 期间被识别为 "真付费" 走 PAID CTA 分流 |

## 功能边界

**Pro / Max 功能不变, 只调整 Free 列**:

| 功能 | Free | Pro | Max |
|---|---|---|---|
| `daily_report` (公开版) | 完整 | 完整 | 完整 |
| 宏观 dashboard | 基础视图 | 完整 | 完整 |
| watchlist 数量 | 25 | 25 | 25 |
| AI 投研对话 (`/api/research/chat`) | 2/天 | 2/天 | 无限 |
| 推特日报 (`twitter_digest`) | 前 3 封 intro 完整版 (注册 D0/D1/D2 自然日), 之后停 | 锁 | 每天完整 |
| `morning_report_email` / `weekly_report_email` / `personal_digest_email` | 无 | 有 | 有 |
| 个股深度研究 (`stock_research`) | 无 | 锁 | 无限 |

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

**Lifetime** (`is_lifetime=true`) 自动 grant 完整 `MAX_FEATURES`.

## 配额规则

- **AI 投研对话** (`/api/research/chat`): 无 `ai_research_engine` entitlement 的用户每天 2 次. Redis 计数 (`backend/app/features/quota/`), 按 user_id 或 IP, midnight UTC reset. `quota/service.py:17` `DAILY_LIMIT = 2`.
- **推特日报 intro**: 无 `twitter_digest` entitlement 的用户, 注册起 3 个自然日内每天 1 封. `lifecycle_state.intro_sent_count` 跟踪, max 3.
- **watchlist**: 所有用户最多 25 (Pydantic + 前端校验).

## Lifecycle State

新增字段 (Phase 0 migration):

- `subscriptions.lifecycle_state` (JSONB, default `{}`):
  - `onboarding_sent`: `{day_int: ISO_timestamp}` — 每封 onboarding 邮件发送时间, 防重复
  - `intro_sent_count`: int — 已发推特日报 intro 数 (max 3)
  - `triggered_at`: `{trigger_key: ISO_timestamp}` — 行为触发邮件 cooldown (Phase 4)
- `subscriptions.reactivation_state` (TEXT, default NULL): enum `NULL` / `cohort_a` / `cohort_b` / `cohort_c` / `cold` (Phase 3 使用)
- `subscriptions.onboarding_completed_at` (TIMESTAMP, default NULL): Step 1/2/3 全部完成的时间

未完成 onboarding (`onboarding_completed_at IS NULL`) 的用户访问受限页面 → 由 Next.js middleware 拦截 redirect `/onboarding` (排除 `/onboarding` 自身、auth callback、`/api/*`、静态资源).

## CTA Tier 决策

`is_real_paid_sub(sub)` (`backend/app/features/subscription/cta_tier.py`):

1. `is_lifetime=true` → **True**
2. `entitlements` 为空 → **False**
3. 否则 → **True** (**取消旧 `access_expires_at` 分支** — 因为取消 trial 后该字段不再是试用信号; 老 trial 用户期间也走 PAID 分流, 让他们感觉一致, 自然退场)

## Onboarding 流程 (强制)

3 步, **必须完成**:

1. **Welcome**: 价值主张 (今天就能用: 1 次 AI 投研体验 + 首份推特日报 + 自选股提醒; 建好自选股, 解锁每天专属日报)
2. **建自选股 (强制, 至少 3 只, 推荐 5-10)**: 不允许 skip; UI 鼓励多加, 上限 25, 一键加 Mag 7 等 popular groups
3. **专属日报 modal**: 标题 "为你的 X 只自选股, 每天生成专属日报"; 嵌一份**通用样本** (从 Mag 7 池 `AAPL/MSFT/GOOGL/AMZN/META/NVDA/TSLA` 选一只, 不基于用户实际持仓 mock); 主 CTA "升级 Pro 立即激活" → 直接 `POST /api/payment/checkout-session` (`tier="pro"`, `source="onboarding"`), 跳 Stripe 托管页; 次 CTA "稍后再说"

完成后写 `onboarding_completed_at = NOW()`, 落地 `/today`. 顶部配额 widget: "今天还可以: 2 次 AI 投研对话".

## 监控边界

详见 [`docs/plans/active/freemium-lifecycle-email.md`](../plans/active/freemium-lifecycle-email.md) 的 "监控指标" 节.
