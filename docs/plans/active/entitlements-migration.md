# Feature Entitlements Migration Plan

> Status: Planning
> Related: docs/plans/enforce-tier-gating.md (supersedes Phase C–H), features/payment/.context.md, features/subscription/.context.md, features/invites/.context.md
> Vision: 产品策略.md > 现有模块演进（商业化执行）
> Created: 2026-04-08

## 目标

用 **Stripe Entitlements API** 作为"谁能用什么功能"的单一真相源，替换现有"Insforge subscriptions 表 + Resend segments 分散管理"的架构。最终达成：

1. **一个真相源**：Stripe 定义 Feature → Product 映射，所有下游状态（本地 DB、Resend segment、前端 gate）都是 Stripe entitlements 的派生缓存
2. **一个事件源**：订阅状态变化（升级/降级/取消/试用到期）统一通过 `entitlements.active_entitlement_summary.updated` webhook 下发，消除 `customer.subscription.*` 的散乱 handler
3. **一个检查 API**：前后端统一通过 `has_entitlement(user, feature)` 查权限，不再有 `_is_pro_user` / `plan == 'pro'` / `access_expires_at` 三处重复判断
4. **零手动过期逻辑**：邀请码试用改为 Stripe Trial Subscription，14 天到期由 Stripe 自动处理，不再需要自建过期 cron

最终效果：三档订阅功能权限完整、可靠、可审计，消除"付了钱收不到邮件"和"取消了还在收"这两类用户可感知的 bug。

## 非目标

- 不引入第三方 Entitlements 平台（Stigg、Schematic），Stripe 原生功能足够
- 不重构定价结构，继续保持 Free / Pro / Max 三档
- 不改变 Stripe Checkout 的付款流程
- 不迁移免费用户的匿名邮件订阅（landing page 收集的无账号用户仍只进 free segment）
- 本次 plan 范围内不实现"使用量限制"（如"免费用户每天只能查 3 次"），Stripe Entitlements 支持但本项目暂不需要

## 架构

### 四层数据流

```
┌───────────────────────────────────────────────────────────┐
│ Layer 1:  Stripe (真相源)                                   │
│                                                            │
│   Customer → Subscription → Active Entitlements            │
│                                                            │
│   此层说什么，就是什么。其它层不允许独立修改。                │
└───────────────────────────────────────────────────────────┘
              │
              │  webhook: entitlements.active_entitlement_summary.updated
              │          + customer.subscription.{created,updated,deleted}
              ▼
┌───────────────────────────────────────────────────────────┐
│ Layer 2:  Insforge subscriptions 表 (快速读缓存)             │
│                                                            │
│   存储: user_id, stripe_customer_id, stripe_subscription_id │
│         plan, status, current_period_end,                  │
│         entitlements (JSONB: ["morning_report_email", ...]) │
│                                                            │
│   服务: get_subscription() + _sub_cache (5 min 内存 TTL,    │
│        webhook upsert 时 invalidate,/api/me/entitlements   │
│        支持 ?fresh=true 旁路给 post-checkout 用)            │
└───────────────────────────────────────────────────────────┘
              │
              │  同一个 webhook handler 顺序写
              ▼
┌───────────────────────────────────────────────────────────┐
│ Layer 3:  Resend Segments (发送缓存)                        │
│                                                            │
│   evening (free, all users)                                │
│   morning (pro+max, morning_report entitled)               │
│   weekly  (pro+max, weekly_report entitled)                │
│                                                            │
│   写操作: sync_resend_segments(email, entitlements)        │
│            幂等，是 Resend 的唯一写入点                      │
└───────────────────────────────────────────────────────────┘
              │
              │  前端调 GET /api/me/entitlements
              ▼
┌───────────────────────────────────────────────────────────┐
│ Layer 4:  Frontend React State (渲染缓存)                   │
│                                                            │
│   EntitlementsContext + useEntitlements() hook             │
│   PaywallGuard 按 feature 名判断，不再按 plan 名            │
└───────────────────────────────────────────────────────────┘
```

**核心约束**：除 Layer 1 外，其它层都**只能从上一层派生**。任何直接修改 Layer 2/3/4 的代码都是 bug。

### Feature Catalog

在 Stripe Dashboard 定义 10 个 feature，lookup_key 使用蛇形命名：

**Pro 专属（7 个）** — Pro product 和 Max product 都 attach：

| lookup_key | name | 对应场景 |
|------------|------|---------|
| `morning_report_email` | 盘前早报邮件 | 每个交易日早上推送的早报 |
| `weekly_report_email` | 宏观周报邮件 | 每周日推送的宏观周报 |
| `personal_digest_email` | 专属持仓日报邮件 | 基于 watchlist 的每日摘要 |
| `watchlist_extended` | 扩展自选股 | 最多 25 只股票 |
| `today_website` | 市场日报网站 | `/today` 和 `/today/archive` |
| `for_you_website` | 个性化页面 | `/for-you` 和 `/for-you/watchlist` |
| `morning_website` | 盘前早报网站 | `/morning` 和 `/morning/archive` |

**Max 独享（3 个）** — 仅 Max product attach：

| lookup_key | name | 对应场景 |
|------------|------|---------|
| `macro_dashboard` | 宏观仪表盘 | `/macro/*` 全套 **以及** `/liquidity` |
| `stock_research` | 个股深度研究 | `/stock` 和 `/stock/[symbol]` |
| `ai_research_engine` | AI 投研引擎 | `/research` |

**设计决策说明**：
- `morning_website` 归 Pro：和 `morning_report_email` 在同一档保持一致，付费 Pro 用户网站和邮件都能看早报
- `liquidity_dashboard` 合并进 `macro_dashboard`：`/liquidity` 属于宏观仪表盘的流动性子模块，不单独作为一个 feature

**免费功能**（不需要 feature，默认开放）：
- 每日晚报邮件 evening_daily_report（通过 Resend free segment 发送）
- 基础自选股（最多 5 只）
- 登录、个人信息等

## 用户状态矩阵

设想 7 个典型用户，展示四层状态：

| # | 用户 | 场景 | Layer 1 Stripe | Layer 2 Insforge | Layer 3 Resend | Layer 4 前端效果 |
|---|------|------|----------------|------------------|----------------|-----------------|
| 1 | Alice | 新注册免费用户 | Customer 可选，无 Subscription | `plan=free, entitlements=[]` | `[evening]` | 只能访问免费页，所有 Pro/Max paywall |
| 2 | Bob | 付费 Pro（本期已付） | `sub_B: active` → 7 个 Pro entitlements | `plan=pro, status=active, entitlements=[7 Pro features]` | `[evening, morning, weekly]` | 可访问 `/today`, `/for-you`, **`/morning`**；`/macro/*`, `/stock`, `/research` 仍 paywall |
| 3 | Carol | 付费 Max | `sub_C: active` → 10 个 entitlements | `plan=max, status=active, entitlements=[10 features]` | `[evening, morning, weekly]` | 全站解锁 |
| 4 | Dave | 邀请码兑换 day 1（Max 试用） | `sub_D: trialing, trial_end=+14d` → 10 个 entitlements（同 Max） | `plan=max, status=trialing, current_period_end=trial_end, entitlements=[10]` | `[evening, morning, weekly]` | 全站解锁（UI 可显示"试用还剩 14 天"） |
| 5 | Eve | 邀请码 day 13 | `sub_E: trialing, trial_end=+1d` | `plan=max, status=trialing, entitlements=[10]` | `[evening, morning, weekly]` | 全站解锁（UI 显示"还剩 1 天"） |
| 6 | Frank | Pro 订阅昨天取消，本期还剩 20 天 | `sub_F: active, cancel_at_period_end=true` → 7 个 entitlements 到 period_end | `plan=pro, status=active, cancel_at_period_end=true, entitlements=[7]` | `[evening, morning, weekly]` | 可访问 Pro 页面，UI 显示"订阅将于 X 日结束" |
| 7 | Grace | 邀请 day 15（过期） | `sub_G: canceled` → 0 entitlements（Stripe 自动清空） | `plan=free, status=canceled, entitlements=[]` | `[evening]` | 只能访问免费页 |

**关键观察**：

- **Dave 和 Carol 的 entitlements 完全一样**（都是 10 个 Max features）。代码不需要区分 "trialing" 和 "active"，统一看 entitlements 即可。这是 Stripe Trial Subscription 模式的巨大优势。
- **Frank 不会立即失去访问**：Stripe 的 `cancel_at_period_end` 语义下，entitlements 保持到 `current_period_end`。当前代码在 `subscription.deleted` 立刻降级，其实是 bug——迁移后顺带修复。
- **Grace 不需要 cron**：14 天后 Stripe 自动把 subscription 从 `trialing` 迁移到 `canceled`（因为无支付方式 + `trial_settings.end_behavior.missing_payment_method='cancel'`），entitlements 自动清空并触发 webhook。
- **邀请码给 Max 不是 Pro**：旧文档和代码里写的"14 天 Pro 访问"会在 Phase 4 改为 Max。理由：Max 是更强的转化诱饵，让用户体验所有高价功能（AI 投研、个股深度、宏观仪表盘），试用期结束后即使只转化为 Pro 也是净赚。

## 迁移策略

### 现有付费用户（Bob / Carol 类型）

**问题**：Stripe 文档明确 "Existing subscriptions will create active entitlements for any product feature changes at the **start of the next billing period**"。即：给 product 新 attach feature 后，已存在的 active subscription 要等到下个计费周期才会自动拿到这些 entitlements。

**解决方案**：混合桥接策略

**现实数据**：截至 2026-04-08，生产环境只有 3 个活跃付费订阅（全部 Max，`$9.99/月`），最晚的 `current_period_end = 2026-05-08`。所以 fallback 窗口只需覆盖一个月即可。

1. **Feature 定义 + attach 先行**：在 Stripe Dashboard 或 API 里先建好 10 个 feature，attach 到 Pro 和 Max product。此时已有的月付订阅用户**当下不会立刻有 entitlements**。
2. **后端查权限时加 fallback**：`has_entitlement(user_id, feature)` 的实现：
   ```
   1. 查 Layer 2 的 entitlements 列表，命中则返回 True
   2. Fallback: 看 plan 字段
        - plan == 'pro' → 返回 True if feature in PRO_FEATURES
        - plan == 'max' → 返回 True if feature in MAX_FEATURES
   3. 返回 False
   ```
3. **Fallback 的存在期**：`FALLBACK_SUNSET = "2026-05-15"`（3 个现有订阅里最晚 `current_period_end` 2026-05-08 + 7 天缓冲）。超过该日期后，fallback 路径记 warning 日志；命中 0 次持续 1 周则安全删除 fallback 代码。
4. **数据质量处理**：现有 3 个订阅里有 1 个缺 `metadata.tier` 字段（sub_1THIUfKBW0cac2K4finfoA4c，user d00a6201）。Phase 0 补数据时顺手 backfill 一下：
   ```
   stripe subscriptions update sub_xxx -d "metadata[tier]=max"
   ```

这样既不阻塞迁移，也不破坏已有用户体验。

### 现有邀请用户（Dave / Eve / Grace 类型）

**问题**：当前邀请用户在 Insforge 里有 `invite_code + access_expires_at` 但**没有 Stripe Customer 和 Subscription**，Stripe 完全不知道他们。

**解决方案**：一次性回填脚本 `backend/scripts/backfill_invite_trials.py`

对每个 `subscriptions` 表中 `invite_code IS NOT NULL AND access_expires_at > now()` 的记录：
1. 如果该 user 没有 `stripe_customer_id`：创建 Stripe Customer（只需 email）
2. 创建 Stripe Subscription：
   - `price = STRIPE_MAX_PRICE_ID`
   - `trial_end = 原 access_expires_at`（保持原到期日）
   - `trial_settings.end_behavior.missing_payment_method = "cancel"`
   - `payment_behavior = "default_incomplete"`（允许无支付方式创建）
   - `metadata = {user_id: ..., migrated_from_invite: "true", original_invite_code: ...}`
3. 更新 Insforge 记录：写入 `stripe_customer_id` 和新的 `stripe_subscription_id`
4. 记录迁移日志到 `docs/reports/invite-migration-{date}/`

**dry-run 默认**，`--execute` 才真正写入。

### 现有免费用户（Alice 类型）

免费用户**不需要迁移**：
- 他们没有 Stripe Customer 和 Subscription，也不应该有
- `has_entitlement()` 对所有 Pro/Max feature 返回 False
- Resend 里他们只在 evening segment，与现状一致

唯一需要的变化：新用户注册时，可选地创建一个空 Stripe Customer（方便日后升级时复用 customer_id）。这是 nice-to-have，不是必需。

## 实施阶段

### Phase 0 — 前置条件（必须先做）

**状态**：`docs/plans/enforce-tier-gating.md` 的 Phase A + Phase B 必须先做完。

理由：
- 需要先把当前的 drift 清理干净，再迁移才有意义
- Phase A 的 `update_email_preferences` Pro gate 是 defense in depth，即使迁移后仍保留
- Phase B 的 audit 脚本可以复用一部分逻辑做 Phase 1 的数据盘点

**Checklist**：
- [ ] Phase A1–A4 完成（见 enforce-tier-gating.md）
- [ ] Phase B1 audit 脚本产出 drift 报告
- [ ] Phase B2 通知邮件已发送
- [ ] Phase B3 drift 清理已执行
- [ ] `EMAIL_PRO_GATE=true` 在 Railway 生产已启用

### Phase 1 — Stripe 侧配置

目标：在 Stripe Dashboard 和 API 里完成 feature/product 映射。

**1.1 创建 10 个 Feature**

在 Stripe CLI（或 Dashboard → Product catalog → Features）：

```bash
# Pro 专属（7 个，Pro 和 Max product 都 attach）
stripe entitlements features create \
  --lookup-key="morning_report_email" --name="盘前早报邮件"
stripe entitlements features create \
  --lookup-key="weekly_report_email" --name="宏观周报邮件"
stripe entitlements features create \
  --lookup-key="personal_digest_email" --name="专属持仓日报邮件"
stripe entitlements features create \
  --lookup-key="watchlist_extended" --name="扩展自选股 (25)"
stripe entitlements features create \
  --lookup-key="today_website" --name="市场日报网站"
stripe entitlements features create \
  --lookup-key="for_you_website" --name="个性化页面"
stripe entitlements features create \
  --lookup-key="morning_website" --name="盘前早报网站"

# Max 独享（3 个，仅 Max product attach）
stripe entitlements features create \
  --lookup-key="macro_dashboard" --name="宏观仪表盘 (含流动性)"
stripe entitlements features create \
  --lookup-key="stock_research" --name="个股深度研究"
stripe entitlements features create \
  --lookup-key="ai_research_engine" --name="AI 投研引擎"
```

**在 test mode 先做一遍，再在 live mode 做一遍。** 保存 feat_xxx 的 ID 到一个临时文档。

**1.2 Attach Feature 到 Product**

查出 Pro product ID 和 Max product ID（从 STRIPE_PRO_PRICE_ID 反查）：

```bash
# 从现有 price 反查 product
stripe prices retrieve "${STRIPE_PRO_PRICE_ID}"  # -> product id
stripe prices retrieve "${STRIPE_MAX_PRICE_ID}"

# Attach to Pro product (7 个 Pro features)
for f in morning_report_email weekly_report_email personal_digest_email \
         watchlist_extended today_website for_you_website morning_website; do
  stripe product_features create "${PRO_PRODUCT_ID}" \
    --entitlement-feature="${FEAT_ID_OF_$f}"
done

# Attach to Max product (全部 10 个 = Pro 7 个 + Max 独享 3 个)
for f in morning_report_email weekly_report_email personal_digest_email \
         watchlist_extended today_website for_you_website morning_website \
         macro_dashboard stock_research ai_research_engine; do
  stripe product_features create "${MAX_PRODUCT_ID}" \
    --entitlement-feature="${FEAT_ID_OF_$f}"
done
```

**1.3 订阅新 Webhook**

在 Stripe Dashboard → Developers → Webhooks，给生产和 test endpoint 都勾选：
- `entitlements.active_entitlement_summary.updated`（新增）
- `customer.subscription.created`（已有）
- `customer.subscription.updated`（已有）
- `customer.subscription.deleted`（已有）
- `customer.subscription.trial_will_end`（新增，提前通知用户试用要结束）

**Checklist**：
- [ ] 10 个 feature 在 test mode 创建
- [ ] 10 个 feature 在 live mode 创建
- [ ] Feature ID 映射表落盘到 `backend/app/features/payment/entitlements_config.py`
- [ ] Pro product attach 7 个 feature
- [ ] Max product attach 10 个 feature
- [ ] Webhook endpoint 订阅新事件类型
- [ ] Stripe 测试：创建一个 test customer + Pro subscription，调 `active_entitlements list`，确认返回 7 个 entitlements
- [ ] 数据修复：给 `sub_1THIUfKBW0cac2K4finfoA4c` backfill `metadata.tier=max`

### Phase 2 — 后端 Entitlements Gateway

目标：建立后端统一的"查权限"API，不改任何现有行为。

**2.1 新文件：`backend/app/features/payment/entitlements.py`**

```python
"""
Entitlements Gateway.

Single source of truth for 'does this user have feature X'.
Reads from Layer 2 (Insforge subscriptions.entitlements) with
fallback to plan-based mapping during migration window.
"""
from typing import Set

# Feature catalog — kept in sync with Stripe dashboard
PRO_FEATURES: Set[str] = {
    "morning_report_email",
    "weekly_report_email",
    "personal_digest_email",
    "watchlist_extended",
    "today_website",
    "for_you_website",
    "morning_website",
}

MAX_ONLY_FEATURES: Set[str] = {
    "macro_dashboard",     # covers /macro/* AND /liquidity
    "stock_research",
    "ai_research_engine",
}

MAX_FEATURES: Set[str] = PRO_FEATURES | MAX_ONLY_FEATURES
ALL_FEATURES: Set[str] = MAX_FEATURES

# Fallback sunset date — after this date, plan-based fallback logs warning.
# Derived from: latest current_period_end among live paid subs (2026-05-08) + 7d buffer.
# Re-check via `stripe subscriptions list --live` before each deployment.
FALLBACK_SUNSET = "2026-05-15"


async def has_entitlement(user_id: str, feature: str) -> bool:
    """Check whether a user has access to a feature.

    Reads Layer 2 (DB cache). Falls back to plan-based mapping for
    legacy subscriptions that haven't renewed yet.
    """
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return False

    # Primary path: check entitlements JSON column
    entitlements = sub.get("entitlements") or []
    if feature in entitlements:
        return True

    # Fallback path: plan-based mapping (sunset after migration window)
    plan = sub.get("plan")
    status = sub.get("status")
    if status != "active" and status != "trialing":
        return False

    if plan == "pro" and feature in PRO_FEATURES:
        _log_fallback_hit(user_id, feature, plan)
        return True
    if plan == "max" and feature in MAX_FEATURES:
        _log_fallback_hit(user_id, feature, plan)
        return True

    return False


async def get_user_entitlements(user_id: str) -> Set[str]:
    """Return the full set of entitlements a user has. For /api/me/entitlements."""
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return set()

    entitlements = set(sub.get("entitlements") or [])
    if entitlements:
        return entitlements

    # Fallback
    plan = sub.get("plan")
    if sub.get("status") not in ("active", "trialing"):
        return set()
    if plan == "pro":
        return PRO_FEATURES
    if plan == "max":
        return MAX_FEATURES
    return set()


def _log_fallback_hit(user_id: str, feature: str, plan: str) -> None:
    """Instrument fallback path usage for migration tracking."""
    from datetime import datetime
    from app.core.logging import get_logger
    logger = get_logger(__name__)

    today = datetime.utcnow().strftime("%Y-%m-%d")
    if today >= FALLBACK_SUNSET:
        logger.warning(
            "entitlements fallback hit after sunset: user=%s feature=%s plan=%s",
            user_id[:8], feature, plan,
        )
    else:
        logger.info(
            "entitlements fallback: user=%s feature=%s plan=%s",
            user_id[:8], feature, plan,
        )
```

**2.2 新列：Insforge subscriptions 表加 `entitlements` JSONB 列**

需要在 Insforge dashboard 手动加（或通过 edge function 写 migration）：

```sql
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS entitlements JSONB DEFAULT '[]'::jsonb;
```

对应的 Insforge edge function (`subscriptions.js`) 需要在 upsert 里接受这个字段。

**2.3 新端点：`GET /api/me/entitlements`**

在 `backend/app/features/payment/router.py` 加：

```python
@router.get("/me/entitlements")
async def api_my_entitlements(
    fresh: bool = False,
    user_id: str = Depends(verify_user_token),
):
    """Return the current user's feature entitlement set for frontend gating.

    Pass `?fresh=true` from the post-checkout success page to bypass the
    5-minute in-memory cache and read straight from Insforge. This avoids
    the small window where a user who just upgraded sees stale "free" state
    because the webhook-triggered cache invalidation hasn't propagated
    across backend instances yet.
    """
    from app.features.payment.db import invalidate_subscription_cache
    from app.features.payment.entitlements import get_user_entitlements

    if fresh:
        invalidate_subscription_cache(user_id)
    ents = await get_user_entitlements(user_id)
    return {"entitlements": sorted(ents)}
```

**设计说明**：Layer 2b（5 分钟内存缓存）保持原样，不改 TTL、不改策略。唯一新增的是这个 `fresh=true` 旁路——前端在刚从 Stripe Checkout 跳回的那一刻调一次，彻底消除"付完钱还看到 paywall"的尴尬。日常读仍然走缓存，性能不变。

**2.4 单元测试：`backend/tests/test_entitlements_unit.py`**

覆盖：
- Plan-based fallback 对 Pro 返回 PRO_FEATURES
- Plan-based fallback 对 Max 返回 MAX_FEATURES  
- Entitlements 列表存在时优先用它（DB 里写了但只有 2 个 feature，测试只返回这 2 个）
- `status=canceled` 时 fallback 不生效
- `status=trialing` 时 fallback 生效

**Checklist**：
- [ ] `entitlements.py` 写完并有单元测试
- [ ] Insforge `subscriptions` 表加 `entitlements` 列
- [ ] `subscriptions.js` edge function 支持 `entitlements` 字段读写
- [ ] `/api/me/entitlements` 端点实现
- [ ] `_is_pro_user` 内部调 `has_entitlement()`，保持对外接口不变
- [ ] 所有相关单元测试通过

### Phase 3 — Webhook Handler 改造

目标：接收 Stripe 的新 entitlements webhook，把 entitlements 写入 Layer 2，然后同步 Layer 3。

**3.1 新 handler：`entitlements.active_entitlement_summary.updated`**

在 `backend/app/features/payment/router.py` 的 `stripe_webhook()` 函数里加分支：

```python
elif event_type == "entitlements.active_entitlement_summary.updated":
    # Payload only includes customer + first 10 entitlements.
    # Always fetch the full list via API to be safe.
    customer_id = obj.get("customer")
    if not customer_id:
        logger.warning("entitlements webhook missing customer id")
        return {"received": True}

    # Fetch user_id from Insforge by stripe_customer_id
    user_id = await _find_user_by_customer(customer_id)
    if not user_id:
        logger.warning("entitlements webhook for unknown customer: %s", customer_id)
        return {"received": True}

    # Fetch full entitlements from Stripe
    ents_response = await asyncio.to_thread(
        stripe.entitlements.ActiveEntitlement.list,
        customer=customer_id,
        expand=["data.feature"],
    )
    feature_keys = sorted({
        ent["feature"]["lookup_key"]
        for ent in ents_response["data"]
    })

    # Fetch subscription for plan/status info
    sub_list = await asyncio.to_thread(
        stripe.Subscription.list,
        customer=customer_id, status="all", limit=1,
    )
    if sub_list["data"]:
        stripe_sub = sub_list["data"][0]
        plan = _resolve_plan_from_subscription(stripe_sub)
        status = stripe_sub["status"]
        _, period_end = _get_period(stripe_sub)
    else:
        plan = "free"
        status = "inactive"
        period_end = None

    # Layer 2: update Insforge
    await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        plan=plan,
        status=status,
        current_period_end=period_end,
        entitlements=feature_keys,  # new column
    )

    # Layer 3: sync Resend
    user_email = await _get_user_email(user_id)
    if user_email:
        await asyncio.to_thread(
            sync_resend_segments, user_email, set(feature_keys),
        )

    logger.info(
        "entitlements synced: user=%s plan=%s status=%s features=%s",
        user_id[:8], plan, status, feature_keys,
    )
```

**3.2 `sync_resend_segments(email, entitlements)` 函数**

在 `backend/app/features/subscription/service.py` 新加：

```python
def sync_resend_segments(self, email: str, entitlements: set[str]) -> None:
    """Reconcile Resend segment membership to match the entitlement set.

    Idempotent. Only touches segments whose state differs from desired.
    """
    self._validate_api_key()

    # Desired state derived from entitlements
    desired = {
        "daily_report": True,  # always on (free evening)
        "morning_report": "morning_report_email" in entitlements,
        "weekly_report": "weekly_report_email" in entitlements,
    }

    # Get current segment membership
    current_prefs = self.get_email_preferences(email)

    # Diff and apply
    for report_type, should_be in desired.items():
        is_in = current_prefs.get(report_type, False)
        seg_id = self.SEGMENT_IDS.get(report_type)
        if not seg_id:
            continue

        if should_be and not is_in:
            try:
                _rate_limit_wait()
                resend.ContactSegments.add({"email": email, "segment_id": seg_id})
                logger.info("sync: added %s to %s", email, report_type)
            except Exception as e:
                logger.warning("sync failed: add %s to %s: %s", email, report_type, e)
        elif not should_be and is_in:
            try:
                _rate_limit_wait()
                resend.ContactSegments.remove({"email": email, "segment_id": seg_id})
                logger.info("sync: removed %s from %s", email, report_type)
            except Exception as e:
                logger.warning("sync failed: remove %s from %s: %s", email, report_type, e)
```

**3.3 旧 handler 简化**

`customer.subscription.created/updated/deleted` 的 handler 变成**纯 subscription identity 同步**：只更新 `stripe_customer_id`, `stripe_subscription_id`, `current_period_end` 等字段，**不再推导 plan 和 entitlements**。

删除这些 handler 里现有的：
- `add_pro_segments` / `remove_pro_segments` 调用
- `_resolve_plan_from_subscription` 调用（让 entitlements webhook 处理）
- "用户有其他 active sub" 的特殊分支（让 entitlements 自己决定）

**3.4 `_find_user_by_customer` helper**

需要新的 edge function action 或新索引：通过 `stripe_customer_id` 反查 user_id。可以在 `subscriptions.js` edge function 加 `action=get_by_customer_id`。

**Checklist**：
- [ ] `entitlements.active_entitlement_summary.updated` handler 写完
- [ ] `sync_resend_segments()` 函数实现并单元测试
- [ ] `_find_user_by_customer()` helper + edge function 支持
- [ ] 旧 `customer.subscription.*` handler 精简为只写 identity
- [ ] 本地用 Stripe CLI 重放一次 webhook，确认 Layer 2/3 都正确更新
- [ ] Webhook handler 有超时和错误处理（不能让 Stripe 重试爆炸）

### Phase 4 — 邀请码走 Stripe Trial Subscription

目标：`redeem_code` 不再直接写 Insforge，而是通过创建 Stripe Trial Subscription 让 webhook 自然流入。

**4.1 改造 `backend/app/features/invites/db.py`**

```python
async def redeem_code(
    user_id: str,
    user_email: str,
    code: str,
    valid_codes: list[str],
    trial_days: int = 14,
) -> dict:
    """Redeem invite code by creating a Stripe Max trial subscription."""
    code_upper = code.strip().upper()
    if code_upper not in [c.strip().upper() for c in valid_codes]:
        return {"success": False, "error": "invalid_code"}

    # 1. Ensure Stripe Customer exists for user
    existing = await get_subscription(user_id)
    customer_id = existing.get("stripe_customer_id") if existing else None

    if not customer_id:
        customer = await asyncio.to_thread(
            stripe.Customer.create,
            email=user_email,
            metadata={"user_id": user_id, "invite_code": code_upper},
        )
        customer_id = customer["id"]
        # Persist early so we have customer_id even if next step fails
        await upsert_subscription(
            user_id=user_id,
            stripe_customer_id=customer_id,
        )

    # 2. Create trial subscription (no payment method)
    try:
        subscription = await asyncio.to_thread(
            stripe.Subscription.create,
            customer=customer_id,
            items=[{"price": STRIPE_MAX_PRICE_ID}],
            trial_period_days=trial_days,
            trial_settings={
                "end_behavior": {"missing_payment_method": "cancel"}
            },
            payment_behavior="default_incomplete",  # Allow sub creation w/o PM
            metadata={
                "user_id": user_id,
                "source": "invite_redemption",
                "invite_code": code_upper,
            },
        )
    except stripe.error.StripeError as e:
        logger.exception("Failed to create invite trial subscription")
        return {"success": False, "error": str(e)}

    # Webhook will now fire:
    #  - customer.subscription.created
    #  - entitlements.active_entitlement_summary.updated
    # which in turn writes Layer 2 (plan=max, entitlements=[10 features])
    # and Layer 3 (Resend segments).

    trial_end_iso = datetime.fromtimestamp(
        subscription["trial_end"], tz=timezone.utc
    ).isoformat()

    return {
        "success": True,
        "access_expires_at": trial_end_iso,
        "subscription_id": subscription["id"],
    }
```

**4.2 关于 `payment_behavior` 参数（待 Phase 4 实现时本地验证）**

上面代码里用了 `payment_behavior="default_incomplete"`，但这个参数能否配合"无支付方式的 trial"正常工作**需要在 Stripe test mode 实际跑一次验证**。可能的结果：

- **情形 A**：跑通 → 保留现有代码
- **情形 B**：Stripe 报错"customer has no default payment method" → 改用 `payment_behavior="allow_incomplete"` 再试
- **情形 C**：两者都不行 → fallback 方案：在 Stripe Dashboard 建一个专门的 `invite_trial_price`（价格 $0，attach 到 Max product），给邀请用户用这个 price 创建 subscription，100% 不会触发支付流程

这是 Phase 4 开始实现时第一个要跑的实验，耗时 15 分钟，不应该成为 blocker。

**4.3 删除原计划的 invite 过期 cron**

enforce-tier-gating.md 的 Phase F（invite 过期 cron）**不需要实现**。Stripe 会在 `trial_end` 自动把 subscription 转为 canceled，并触发 webhook。

**4.4 保留 `access_expires_at` 字段**

为了兼容性，`upsert_subscription` 仍接受 `access_expires_at`（从 Stripe 的 `trial_end` 派生写入），前端 UI 可以用它显示"试用还剩 X 天"。

**4.5 产品决策：邀请试用给 Max 而不是 Pro**

原代码和 `invites/.context.md` 写的是"14 天 Pro 访问"，Phase 4 改为 **14 天 Max 试用**。理由：
- Max 是更强的转化诱饵（"试用 14 天全部功能"比"试用 14 天 Pro"更有吸引力）
- 让用户体验 AI 投研、个股深度、宏观仪表盘这些 Max 独享功能
- 试用期结束后流失成 Pro 也是好结果（用户已经知道 Pro 能干什么 + Max 不能干什么）
- 邀请码本来就是稀缺资源（小红书 DM 驱动），给好东西

Phase 4 同时更新 `invites/.context.md` 文档，把"14 天 Pro 访问"改为"14 天 Max 试用"。

**Checklist**：
- [ ] `redeem_code` 改造为创建 Stripe Trial Subscription
- [ ] 本地测试：用 test mode 邀请码兑换，验证 Stripe 里真的创建了 trial sub
- [ ] 本地测试：把 test sub 的 `trial_end` 手动设成 `now() - 1 day` 然后触发 subscription 更新，观察 webhook 是否正确 cancel
- [ ] 更新 `invites/.context.md` 描述新流程
- [ ] 前端兑换页面的 success handler 不需要改（仍读 `access_expires_at`）
- [ ] 删除 `find_expired_invite_trials` 相关代码（如果已经写了）

### Phase 5 — 前端 PaywallGuard 迁移

目标：前端按 feature 名判断，而非按 plan 名。

**5.1 新 Context：`frontend/src/contexts/EntitlementsContext.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type EntitlementsContextValue = {
  entitlements: Set<string>;
  isLoading: boolean;
  has: (feature: string) => boolean;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [entitlements, setEntitlements] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    if (!isAuthenticated) {
      setEntitlements(new Set());
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/me/entitlements");
      setEntitlements(new Set(res.entitlements || []));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [isAuthenticated]);

  const has = (feature: string) => entitlements.has(feature);

  return (
    <EntitlementsContext.Provider value={{ entitlements, isLoading, has, refresh }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export const useEntitlements = () => {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error("useEntitlements must be used within EntitlementsProvider");
  return ctx;
};
```

注意 `refresh` 签名接受可选的 `fresh` 选项，对应后端 `?fresh=true` 参数：

```tsx
const refresh = async (opts?: { fresh?: boolean }) => {
  if (!isAuthenticated) { ... return; }
  const url = opts?.fresh ? "/me/entitlements?fresh=true" : "/me/entitlements";
  const res = await apiFetch(url);
  setEntitlements(new Set(res.entitlements || []));
};
```

**5.2 改造 `PaywallGuard`**

从 `requiredPlan="pro"` 改为 `requiredFeature="today_website"`：

```tsx
// Before
<PaywallGuard requiredPlan="pro">{children}</PaywallGuard>

// After
<PaywallGuard requiredFeature="today_website">{children}</PaywallGuard>
```

每个页面的映射（注意 `/morning` 现在是 Pro，`/liquidity` 共用 `macro_dashboard`）：

| 页面 | `requiredFeature` | 档位 |
|------|-------------------|------|
| `/today`, `/today/archive` | `today_website` | Pro |
| `/for-you`, `/for-you/watchlist` | `for_you_website` | Pro |
| `/morning`, `/morning/archive` | `morning_website` | **Pro**（从 Max 移过来） |
| `/macro/*` | `macro_dashboard` | Max |
| `/liquidity` | `macro_dashboard`（同 `/macro`） | Max |
| `/stock`, `/stock/[symbol]` | `stock_research` | Max |
| `/research` | `ai_research_engine` | Max |

**5.3 设置页偏好 toggle 的 gate**

邮件偏好页的 morning/weekly/personal_digest 开关：
- 显示条件：`has('morning_report_email')` 等
- 没有 entitlement → 显示灰色 + "升级 Pro 解锁"提示，点击跳 `/pricing`

**5.4 Post-checkout success 页面（解决 Layer 2b cache stale）**

新建 `frontend/src/app/pricing/success/page.tsx`。Stripe Checkout 的 `success_url` 指向这个页面，它在 mount 时强制刷新 entitlements（走 `?fresh=true` 旁路），确认新权益到位后再跳转到目标页：

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEntitlements } from "@/contexts/EntitlementsContext";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useEntitlements();
  const [status, setStatus] = useState<"activating" | "ready" | "timeout">("activating");

  useEffect(() => {
    let cancelled = false;
    const target = params.get("next") || "/for-you";

    const run = async () => {
      // 强制 refresh 一次,跳过 5 min cache
      await refresh({ fresh: true });
      if (cancelled) return;
      setStatus("ready");
      // 给用户看一眼"激活成功"再跳
      setTimeout(() => !cancelled && router.push(target), 800);
    };

    // 10 秒后如果还在 activating 就显示"稍后自己刷新"的引导
    const timeoutId = setTimeout(() => {
      if (!cancelled) setStatus("timeout");
    }, 10000);

    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (status === "activating") return <p>正在激活你的订阅...</p>;
  if (status === "ready")      return <p>订阅已激活!正在跳转...</p>;
  return <p>激活稍有延迟,请刷新页面或联系我们。</p>;
}
```

配合后端 Checkout Session 创建时的 `success_url`：

```python
# backend/app/features/payment/service.py
success_url = f"{FRONTEND_URL}/pricing/success?next=/for-you&session_id={{CHECKOUT_SESSION_ID}}"
```

**设计要点**：
- **单次 fresh refresh 就够**，不做轮询（webhook 延迟 <1s，fresh refresh 直接读 Insforge 必然命中最新值）
- 如果 fresh refresh 后 entitlements 还是空（极罕见，webhook 彻底挂了），10 秒 timeout 告诉用户手动刷新
- `?next=` 参数支持从不同页面升级后回到原位（e.g. 从 `/morning` 点升级，回来直接跳回 `/morning`）

**Checklist**：
- [ ] `EntitlementsContext` + `useEntitlements` hook 实现（含 `refresh({ fresh })` 选项）
- [ ] `EntitlementsProvider` 包在 `SubscriptionProvider` 旁边或外面
- [ ] `PaywallGuard` 接受 `requiredFeature` prop（保留 `requiredPlan` 兼容一段时间）
- [ ] 所有 7 个 gated 页面的 `requiredPlan` 替换为 `requiredFeature`
- [ ] `/morning` 的 requiredPlan 从 `max` 改为 `requiredFeature='morning_website'`（Pro）
- [ ] `/liquidity` 的 requiredFeature 设为 `macro_dashboard`
- [ ] 邮件偏好页 UI 按 entitlement 显示开关可用状态
- [ ] `/pricing/success` 页面实现 + Stripe Checkout `success_url` 更新
- [ ] E2E 测试：用 free / trial / pro / max 四个测试账号分别验证 paywall 交互
- [ ] E2E 测试：测试 post-checkout success 页面在 webhook 慢时的行为

### Phase 6 — 清理旧代码

目标：在迁移稳定后（约 +2 周）清理 dead code。

**可以删除的代码**：
- [ ] `add_to_default_segments` 对 evening 的特殊逻辑（保留方法，只留下 signup 时加 evening segment 的最小逻辑）
- [ ] `add_pro_segments` / `remove_pro_segments`（已被 `sync_resend_segments` 替代）
- [ ] `customer.subscription.*` handler 里对 plan 的反推逻辑
- [ ] Step 6 `POST /api/cron/expire-invites` 端点（如果 Phase 4 之前已经写了）
- [ ] Plan-based fallback（`_log_fallback_hit` 以及 fallback 分支，达到 FALLBACK_SUNSET 日期后）
- [ ] `backend/app/features/subscription/service.py::update_email_preferences`（router 层的 Pro gate 仍保留作为 defense in depth，但 service 方法改为纯 delegation 到 sync_resend_segments）

**可以保留但标记 deprecated 的**：
- `_is_pro_user()` — 内部调 `has_entitlement()`，对外 API 不变，留给现有 code 平滑迁移

**Checklist**：
- [ ] 监测 `fallback_hit` 日志，确认 sunset 日期后 0 命中再删除 fallback
- [ ] 逐步替换调用 `_is_pro_user()` 的地方为 `has_entitlement()`
- [ ] 更新 `features/payment/.context.md` 和 `features/subscription/.context.md` 文档
- [ ] 在 `MEMORY.md` 加一条"Entitlements 迁移已完成 + 新架构要点"

## 测试策略

### Layer 1 — 单元测试（pytest）

**`tests/test_entitlements_unit.py`**（新）
- `has_entitlement`：entitlements 列表命中
- `has_entitlement`：plan-based fallback 对 Pro
- `has_entitlement`：plan-based fallback 对 Max
- `has_entitlement`：`status=canceled` 不 fallback
- `has_entitlement`：`status=trialing` 正常工作
- `get_user_entitlements` 返回完整集合
- Fallback sunset 日期后日志级别变 warning

**`tests/test_sync_resend_segments_unit.py`**（新）
- 用户有 `morning_report_email` entitlement → Resend add 被调用
- 用户无 `morning_report_email` 且已在 segment → Resend remove 被调用
- 幂等：连调 3 次，Resend API 只被调 1 次
- Resend API 失败不抛异常，只 log warning

**`tests/test_webhook_entitlements_unit.py`**（新）
- Mock Stripe SDK：`entitlements.ActiveEntitlement.list` 返回 6 个 entitlements
- Mock Insforge：验证 `upsert_subscription` 被正确参数调用
- Mock Resend：验证 `sync_resend_segments` 被正确参数调用
- 未知 customer ID → log warning 不崩

**`tests/test_pro_gate_unit.py`**（已有，扩展）
- 保留现有 Pro gate 测试
- 新增：Pro gate 在 router 层用 `has_entitlement` 而非 `_is_pro_user`

### Layer 2 — 集成测试（Stripe test mode）

目标：在真实 Stripe test mode 环境下验证端到端。

**Setup**：
- Stripe test secret key
- 测试用 product（Pro test + Max test，都 attach 了 features）
- 测试 webhook endpoint（本地用 `stripe listen` 转发）

**`tests/integration/test_entitlements_e2e.py`**（新，`@pytest.mark.integration`）

测试场景：
1. **新注册 → 免费用户**
   - 创建 Insforge 用户
   - 调 `/api/me/entitlements` → 返回 `[]`
2. **订阅 Pro → 拿到 7 个 entitlements**
   - 用 Stripe CLI 创建 test customer + Pro subscription
   - `stripe listen` 转发 webhook 到本地后端
   - 等待 webhook 处理完
   - 查 Insforge：`plan=pro`, `entitlements=[7 个 Pro features]`
   - 调 `/api/me/entitlements` → 返回 7 个 feature
3. **升级 Pro → Max → 拿到 10 个 entitlements**
   - 用 Stripe CLI 修改 subscription price
   - 等待 webhook
   - 确认 entitlements 列表从 7 变 10
4. **降级 Max → Pro**
   - 修改回 Pro
   - 确认 entitlements 列表从 10 变 7
5. **取消 (cancel_at_period_end=true)**
   - 调 `stripe subscriptions cancel --at-period-end`
   - 确认 entitlements 保持不变（到 period_end）
6. **取消 (immediate)**
   - 调 `stripe subscriptions cancel`（立即）
   - 确认 entitlements 清空
7. **邀请码兑换 → Stripe Max trial → 拿到 10 个 entitlements**
   - 调 `/api/invites/redeem`
   - 确认 Stripe 里创建了 Max trial sub（不是 Pro）
   - 确认 Insforge 里 `plan=max, status=trialing, entitlements=[10]`
8. **Trial 过期模拟**
   - 用 Stripe CLI 手动把 trial_end 提前到 1 分钟后
   - 等 trial 自动 canceled
   - 确认 webhook 触发，entitlements 清空

### Layer 3 — Webhook 回放测试（Stripe CLI）

本地开发时的日常 debug 工具。

```bash
# Terminal 1: 启动后端
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2: 转发 webhook
stripe listen --forward-to http://localhost:8000/api/payment/webhook

# Terminal 3: 触发各种事件
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.trial_will_end
stripe trigger entitlements.active_entitlement_summary.updated
```

对每个事件，检查：
- 后端日志里 handler 被调用
- Insforge `subscriptions` 表被更新（entitlements 列）
- Resend dashboard 里对应 segment 成员变化
- 没有 unhandled exception

### Layer 4 — 手工验证场景（用户状态矩阵的 7 个用户）

在 **staging 环境**（或 test mode 下的本地 dev）跑一遍。每个场景都用独立测试账号。

**Alice（新注册免费）**
- [ ] 创建新账号
- [ ] 访问 `/for-you` → 看到 paywall
- [ ] 访问 `/morning` → 看到 paywall
- [ ] 设置页的"早报邮件"开关灰色不可点
- [ ] `/api/me/entitlements` 返回 `{"entitlements": []}`
- [ ] Resend 里只在 evening segment

**Bob（付费 Pro）**
- [ ] 通过 Stripe test checkout 订阅 Pro
- [ ] 从 Stripe 跳回 `/pricing/success` 页面 → 自动 `refresh({ fresh: true })` → 跳转到 `/for-you`
- [ ] 访问 `/for-you` → 正常
- [ ] 访问 `/morning` → **正常（现在 Pro 可以看）**
- [ ] 访问 `/macro` → 看到 paywall（Max only）
- [ ] 访问 `/stock/AAPL` → 看到 paywall（Max only）
- [ ] 设置页可以 toggle 早报邮件
- [ ] `/api/me/entitlements` 返回 **7 个** Pro features
- [ ] Resend 里在 `[evening, morning, weekly]`

**Carol（付费 Max）**
- [ ] 通过 Stripe test checkout 订阅 Max
- [ ] 访问所有页面都正常（包括 `/liquidity`）
- [ ] `/api/me/entitlements` 返回 **10 个** features
- [ ] Resend 里在 `[evening, morning, weekly]`

**Dave（邀请码 day 1，Max 试用）**
- [ ] 新账号 + 输入有效邀请码
- [ ] Stripe dashboard 确认创建了 Max trial sub（not Pro）
- [ ] 访问所有 Max 页面都正常
- [ ] UI 显示"试用 14 天剩余"
- [ ] `/api/me/entitlements` 返回 **10 个** features

**Eve（邀请码 day 13）**
- [ ] 用 Stripe test clock 模拟时间前进到 day 13
- [ ] 收到 `trial_will_end` webhook
- [ ] 访问仍正常
- [ ] UI 显示"还剩 1 天"

**Frank（Pro 取消但本期内）**
- [ ] 付费 Pro，然后 cancel_at_period_end
- [ ] 访问仍正常
- [ ] UI 显示"订阅将于 X 日结束"
- [ ] `/api/me/entitlements` 仍返回 7 个 features

**Grace（邀请码过期）**
- [ ] 用 Stripe test clock 前进到 day 15
- [ ] Stripe 自动 cancel trial
- [ ] 等 webhook 处理
- [ ] 访问 Pro/Max 页面都 paywall
- [ ] `/api/me/entitlements` 返回 `[]`
- [ ] Resend 里只在 evening segment

### 测试数据准备

**创建 test mode fixtures 脚本**：`backend/scripts/seed_stripe_test_data.py`

- 创建 3 个 test customer（Alice / Bob / Carol）
- 创建 2 个 test subscription（Bob Pro / Carol Max）
- 输出 customer_id、sub_id 的映射到 `.env.test`
- dry-run 默认

用 Stripe test clocks 处理时间流逝场景（Eve、Grace）：

```bash
stripe test_helpers test_clocks create
stripe test_helpers test_clocks advance --frozen-time +14d
```

## 验证清单

迁移完成的判定标准：

### 功能正确性
- [ ] 全部 7 个手工场景通过
- [ ] Layer 2 单元测试 100% 通过
- [ ] Layer 3 集成测试 100% 通过
- [ ] Stripe CLI 回放 10 个事件全部正确处理
- [ ] 前端 E2E 测试（Playwright）覆盖 paywall 交互

### 数据一致性
- [ ] 迁移后抽样 10 个付费用户，检查 `Insforge.entitlements` 和 `Stripe.active_entitlements` 完全一致
- [ ] 抽样 5 个 Pro 用户，检查 Resend segments 严格等于 `[evening, morning, weekly]`
- [ ] 抽样 5 个免费用户，检查 Resend segments 严格等于 `[evening]`
- [ ] 抽样 5 个邀请用户，检查 Stripe 里有对应 trial sub 且 entitlements 正确

### 可观测性
- [ ] `fallback_hit` 日志在迁移第 1 周每天查看一次
- [ ] 到 sunset 日期前一周，fallback 命中率应降到 < 1%
- [ ] webhook 处理延迟 < 2s p99（有历史基线对比）
- [ ] Resend API 错误率 < 0.5%

### 用户体验
- [ ] 没有收到 "付了钱收不到邮件" 的用户反馈（迁移后 2 周内）
- [ ] 没有收到 "取消了还在收邮件" 的用户反馈
- [ ] 试用用户能看到剩余天数
- [ ] 免费用户点击 Pro 功能能看到友好的升级引导

## 回滚计划

每个 Phase 都设计成可独立回滚：

| Phase | 回滚方式 | 风险 |
|-------|---------|------|
| Phase 0 | 不回滚（前置条件） | — |
| Phase 1 | 删除 Stripe features（会自动从 product 解绑），不影响订阅 | 低 |
| Phase 2 | Revert PR。`has_entitlement` fallback 保证即使没有 entitlements 列也工作 | 低 |
| Phase 3 | Revert webhook handler，恢复旧的 `customer.subscription.*` 分支 | 中 |
| Phase 4 | 恢复 `redeem_code` 的直接 upsert 版本，不创建 Stripe sub。但已创建的 trial sub 要在 Stripe 手动 cancel | 中高 |
| Phase 5 | Revert 前端 PR，PaywallGuard 回到 `requiredPlan` | 低 |
| Phase 6 | 不涉及（只删代码） | 低 |

**红色按钮**：如果 Phase 3 之后发现大面积问题，紧急回滚步骤：
1. 在 Stripe dashboard 关闭 `entitlements.active_entitlement_summary.updated` webhook 投递
2. Revert Phase 3 PR
3. `has_entitlement` 的 fallback 继续工作，用户体验不中断
4. 排查问题后重新部署

## 待定问题

1. **Insforge edge function 的字段类型**：`entitlements` 列用 JSONB 还是 `text[]`？JSONB 更灵活但查询稍慢，`text[]` 有 GIN index 更快。**倾向 JSONB**（和现有 denorm 风格一致）。需要确认 Insforge 支持。

2. ~~**`payment_behavior` for 邀请 trial subscription**~~ → **决策 (2026-04-08)**：推迟到 Phase 4 实现时本地验证。Plan 里暂定 `default_incomplete`，开始写 Phase 4 代码前先跑一个最小 test mode 实验确认 Stripe 实际行为；如果不行，按 4.2 节的 fallback 方案（专用 $0 price）处理。

3. ~~**Max vs Pro 的试用策略**~~ → **决策 (2026-04-08)**：邀请试用改为 **14 天 Max**（原来是 Pro）。理由见 Phase 4.5。

4. **webhook 顺序问题**：`customer.subscription.created` 和 `entitlements.active_entitlement_summary.updated` 的先后顺序不保证。两个 handler 的操作必须是幂等的且对顺序不敏感。当前设计满足这个要求（两个 handler 都是 upsert）。

5. **匿名订阅者（landing page 无账号邮箱）**：这部分用户完全不在 Stripe 里，继续保持现状（手动管理 Resend evening segment）。需要在 `.context.md` 明确这个边界。

6. **免费用户的 Stripe Customer 创建时机**：注册时立即创建？还是只在首次尝试升级时才创建？**倾向注册时创建**，一次性完成，避免后续判断。代价：Stripe customer 数量 == Insforge users 数量，可能触发 Stripe 的 customer limit（检查 pricing）。

7. ~~**Fallback sunset 日期**~~ → **决策 (2026-04-08)**：`FALLBACK_SUNSET = "2026-05-15"`。依据：`stripe subscriptions list --live` 查到 3 个活跃订阅，最晚 `current_period_end = 2026-05-08`，加 7 天缓冲得 2026-05-15。所有 3 个订阅都是 Max（$9.99/月）。Phase 0 同时 backfill `sub_1THIUfKBW0cac2K4finfoA4c` 缺失的 `metadata.tier` 字段。

## 执行顺序建议

**Week 1**：Phase 0 收尾 + Phase 1（Stripe 配置）
- 周一至周三：完成 enforce-tier-gating.md 的 Phase A/B
- 周四：在 test mode 创建所有 feature 并 attach，验证 API 返回正确
- 周五：在 live mode 重复，验证现有订阅的 entitlements 在下次续期时会自动出现

**Week 2**：Phase 2 + Phase 3（后端核心）
- 周一周二：`entitlements.py` + 单元测试
- 周三：Insforge schema + edge function
- 周四：webhook handler + `sync_resend_segments`
- 周五：Stripe CLI 回放测试 + 修 bug

**Week 3**：Phase 4 + Phase 5（邀请 + 前端）
- 周一周二：邀请码改造 + 一次性回填脚本（dry-run 验证）
- 周三：执行回填（`--execute`）
- 周四周五：前端 EntitlementsContext + PaywallGuard 改造

**Week 4**：验证 + 稳定
- 周一：完整手工验证 7 个用户场景
- 周二至周四：监测 fallback 命中率 + 处理 drift
- 周五：团队 review + 决定是否进入 Phase 6 清理

**Week 5+**：Phase 6 清理
- 观测 2-4 周后，若 fallback 命中率 == 0 且无异常，删除 fallback 和旧代码

## 执行检查表（全局进度）

### 前置
- [x] Phase 0: enforce-tier-gating.md Phase A 完成
- [x] Phase 0: enforce-tier-gating.md Phase B 完成 (Morning 358 + Weekly 360 removed)
- [x] Phase 0: `EMAIL_PRO_GATE=true` 上线

### Stripe 配置
- [x] Phase 1.1: 10 个 feature 在 test 创建
- [x] Phase 1.1: 10 个 feature 在 live 创建
- [x] Phase 1.2: Pro product attach 7 个 feature (test + live)
- [x] Phase 1.2: Max product attach 10 个 feature (test + live)
- [x] Phase 1.3: webhook 订阅新事件 (entitlements + trial_will_end)
- [x] Phase 1: backfill `sub_1THIUfKBW0cac2K4finfoA4c` 的 `metadata.tier=max`

### 后端
- [x] Phase 2.1: `entitlements.py` 实现 (无 fallback，纯 entitlements 列查询)
- [x] Phase 2.2: Insforge `entitlements` JSONB 列 + backfill 31 个活跃用户
- [x] Phase 2.3: `/api/me/entitlements` 端点（含 `?fresh=true` 参数）
- [x] Phase 2.4: 单元测试 (22 个 entitlements + sync tests)
- [x] Phase 3.1: entitlements webhook handler
- [x] Phase 3.2: `sync_resend_segments` 函数 (不碰 daily_report)
- [x] Phase 3.3: 旧 handler 精简 (subscription.updated 只写 identity)
- [x] Phase 3.4: `_find_user_by_customer` helper + edge function
- [x] Phase 4.1: `redeem_code` 改造（Stripe Max trial, 无 fallback）
- [x] Phase 4.2: 27 个邀请用户迁移到 Stripe Trial Subscription
- [x] Phase 4.3: 不需要过期 cron（Stripe 自动 cancel）
- [x] Phase 4.4: entitlements 列 backfill 完成，19 个过期用户清理
- [x] Phase 4.5: 更新 `invites/.context.md`（Pro → Max）

### 前端
- [x] Phase 5.1: EntitlementsContext（含 `refresh({ fresh })` 选项）
- [x] Phase 5.2: PaywallGuard 改造（15 个页面迁移到 requiredFeature）
- [x] Phase 5.3: 设置页 toggle gate (按 entitlement 显示/锁定)
- [x] Phase 5.4: `/pricing/success` 页面 + Stripe `success_url` 更新

### 测试
- [x] Unit tests 全部通过 (22 passed)
- [ ] Integration tests
- [ ] 7 个手工场景验证
- [ ] Stripe CLI 回放验证

### 清理
- [x] Phase 6: 删除 fallback (entitlements.py + _is_pro_user + redeem_code)
- [x] Phase 6: 删除旧 handler 逻辑 (add_pro_segments / remove_pro_segments)
- [x] Phase 6: 更新 .context.md 文档 (payment + subscription + invites)

## 参考资料

- [Stripe Entitlements API 文档](https://docs.stripe.com/billing/entitlements)
- [Managing SaaS access control with Stripe Entitlements — Stripe Dev Blog](https://stripe.dev/blog/managing-saas-access-control-with-stripe-entitlements-api)
- [Active Entitlement API Reference](https://docs.stripe.com/api/entitlements/active-entitlement)
- [Feature API Reference](https://docs.stripe.com/api/entitlements/feature)
- [Free Trials Without Payment Method](https://docs.stripe.com/billing/subscriptions/trials/free-trials)
- [Stripe Test Clocks for Time Simulation](https://docs.stripe.com/billing/testing/test-clocks)
- 本项目相关：
  - `docs/plans/enforce-tier-gating.md`（前置）
  - `backend/app/features/payment/.context.md`
  - `backend/app/features/subscription/.context.md`
  - `backend/app/features/invites/.context.md`
