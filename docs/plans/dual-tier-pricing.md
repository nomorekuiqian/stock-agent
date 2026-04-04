# 双 Tier 定价 (Pro $5 / Max $10) Engineering Plan

> Status: In Progress
> Related: features/payment/.context.md, frontend/src/contexts/SubscriptionContext.tsx
> Vision: 降低付费门槛，用 $5 邮件订阅 tier 提高转化率

## 目标

将现有单一 Pro ($9.99/月) 拆为两个付费 tier：
- **Pro ($4.99/月)**: 收邮件（早报/晚报/专属日报/宏观周报）+ 网站只能看 /today 和 /for-you
- **Max ($9.99/月)**: 全部功能，网站所有页面

## 现状

- 数据库 `subscriptions` 表的 `plan` 字段当前只有 `free` / `pro` 两个值
- `STRIPE_PRO_PRICE_ID` 环境变量指向唯一的 Stripe Price ($9.99)
- 前端 `isPro` 是 boolean（`plan === 'pro' && status === 'active'`），所有 PaywallGuard 检查同一个值
- PaywallGuard 组件是统一的：要么全锁、要么全开
- Navbar 不做条件隐藏，所有链接对所有用户可见
- pricing.ts 里硬编码 `$9.99` 作为唯一价格

## 设计

### Plan 层级定义

| Plan | 数据库值 | 邮件 | /today | /for-you | /stock, /macro, /screener, /morning, /research |
|------|---------|------|--------|----------|------------------------------------------------|
| Free | `free` | 基础晚报 | PaywallGuard | PaywallGuard | PaywallGuard |
| Pro | `pro` | 全部邮件 | ✓ | ✓ | PaywallGuard (升级到 Max) |
| Max | `max` | 全部邮件 | ✓ | ✓ | ✓ |

### 数据变更

**数据库**: `subscriptions.plan` 字段新增值 `max`，无需改表结构（text 字段）。

**Stripe**: 新建一个 $4.99/月的 Price，ID 存入 `STRIPE_PRO_PRICE_ID`（原 Pro），原 $9.99 Price ID 存入新环境变量 `STRIPE_MAX_PRICE_ID`。

### 前端权限模型

```typescript
// SubscriptionContext 新增
const planLevel = plan === 'max' ? 2 : plan === 'pro' ? 1 : 0;
const isPro = !PAYWALL_ENABLED || planLevel >= 1;  // Pro 或 Max
const isMax = !PAYWALL_ENABLED || planLevel >= 2;   // 仅 Max
```

**PaywallGuard 改造**:
- 接受 `requiredPlan?: 'pro' | 'max'` prop（默认 `'pro'`）
- `requiredPlan='pro'`: /today, /for-you — Free 用户看到升级提示
- `requiredPlan='max'`: /stock, /macro, /screener, /morning, /research — Free 和 Pro 用户看到升级提示
- Pro 用户看到 Max 升级提示时，文案不同（"升级到 Max 解锁更多功能"）

### 后端变更

**checkout 流程**: `create_checkout_session` 需要知道用户选的是哪个 tier，新增 `price_id` 参数或 `tier` 参数。

**Webhook**: `checkout.session.completed` 需要根据 Price ID 判断是 `pro` 还是 `max` 来写入 `plan`。

**subscription-status**: 返回值不变，`plan` 字段已经会返回 `pro` / `max` / `free`。

### Checkout 流程

```
前端选择 tier → POST /checkout-session { tier: 'pro' | 'max' } → 后端用对应 Price ID 创建 Session
→ Stripe Checkout → Webhook → upsert plan='pro'|'max'
```

## 实施步骤

### Phase 1: 后端支持双 tier

1. [x] `config.py`: 新增 `STRIPE_MAX_PRICE_ID` 环境变量
2. [x] `models.py`: `CreateCheckoutRequest` 新增 `tier` 字段（`pro` | `max`，默认 `pro`）
3. [x] `service.py`: `create_checkout_session` 根据 tier 选择对应 Price ID
4. [x] `router.py` webhook: `checkout.session.completed` 根据 Price ID 映射 plan 值
5. [x] `router.py` webhook: `subscription.updated` 同样根据 Price ID 判断 plan
6. [x] `router.py`: `api_sync_subscription` 同样支持 plan 映射

### Phase 2: 前端权限模型

7. [x] `pricing.ts`: 新增 Max tier 价格常量
8. [x] `SubscriptionContext.tsx`: 新增 `isMax`，调整 `isPro` 语义（Pro or Max）
9. [x] `PaywallGuard.tsx`: 支持 `requiredPlan` prop，区分 Pro/Max 锁定 UI
10. [x] 各页面更新 PaywallGuard 的 `requiredPlan`：
    - /today, /for-you: `requiredPlan="pro"` (默认)
    - /stock, /macro, /screener, /morning, /research: `requiredPlan="max"`

### Phase 3: Pricing 页面改版

11. [x] `pricing/page.tsx`: 三列布局（Free / Pro $4.99 / Max $9.99），双 checkout 按钮
12. [ ] Navbar: Pro 用户隐藏 Max-only 页面链接（或显示锁标志）— 暂不做，保持现有行为
13. [ ] Profile 页面: 显示当前 tier，Pro 用户有升级到 Max 的入口 — 后续迭代
14. [x] NavAuth: badge 区分 PRO / MAX

### Phase 4: Stripe 配置

15. [ ] Stripe Dashboard 创建 $4.99/月 Price
16. [ ] 环境变量: 本地 .env + Railway 生产环境 + Vercel
17. [ ] 测试: checkout 两个 tier + webhook 处理

## 待定问题

1. **现有 $9.99 付费用户**: 自动升级为 Max？还是保持 Pro 不变让他们手动选择？
   → 建议：自动映射为 Max（他们付的是 $9.99，Max 正是 $9.99）
2. **邀请码**: 邀请码体验给 Pro 还是 Max 权限？
   → 建议：给 Max（保持现有体验不降级）
3. **Pro → Max 升级**: Stripe 是否支持同一 customer 切换 Price？需要 proration 吗？
   → Stripe 原生支持 subscription update with proration
