# Cancel Ultra And Merge KOL To Max Engineering Plan

> Status: Planning
> Related: `backend/app/features/payment/.context.md`, `backend/app/features/subscription/.context.md`, `backend/app/features/kol_research/.context.md`, `frontend/src/app/kol/.context.md`, `docs/constraints/subscription-model.md`
> Vision: 产品策略.md > 现有模块演进 / 产品模块规划

## 目标

取消 TheMarketBrew Ultra 订阅层，恢复 Pro / Max 两档；把 Qinbafrank / 博主研究室和博主 Agent 的付费入口统一并入 Max，让 `$20/月` 的 Max 成为完整研究工作台。

## 现状

当前系统里 Ultra 是完整的一等订阅层，不只是前端文案：

- Backend Payment 把 `pro|max|ultra` 作为三档产品处理，`STRIPE_ULTRA_PRICE_ID`、`themarketbrew_ultra_monthly`、`creator_max_qinbafrank` alias 都仍在 `backend/app/features/payment/service.py`。
- Entitlements 里有 `KOL_PACK_QINBAFRANK = "kol_pack_qinbafrank"`，`ULTRA_FEATURES = MAX_FEATURES | KOL_PACK_FEATURES`。`MAX_FEATURES` 当前不包含 `kol_pack_qinbafrank`。
- Payment sync 有一段特殊逻辑：本地 `plan=ultra` 且 Stripe 仍是 Max price 的 grandfathered 用户，在 active/trialing 状态下不能被 Stripe sync 降回 Max。
- KOL 后端聊天接口对 qinbafrank 单独检查 `kol_pack_qinbafrank`，未购买者只有 1 次 lifetime trial，并返回 `required_product="ultra"`。
- 前端 pricing、profile、mobile menu、pricing success、Qinbafrank landing、KOL subpage paywall、research chat CTA、PersonaSelector 和多处测试都有 Ultra 文案和 `createCheckout("ultra")`。
- 文档 `docs/constraints/subscription-model.md`、payment / KOL / pages context 都把 Ultra 当作正式产品层。

产品策略长期方向是 portfolio-centric 的 Max 研究工作台，而不是继续叠内容型 tier。把 KOL 能力并入 Max 更符合这个方向。

## 设计

### 核心决策

1. **业务上取消 Ultra，系统只保留 Free / Pro / Max。**
   - 新购买只允许 `pro` 和 `max`。
   - 前端不再展示 Ultra。
   - Backend rank 只保留 `pro=1`, `max=2`。

2. **KOL / 博主 Agent 的长期 gate 使用 Max 能力，而不是独立 KOL entitlement。**
   - 推荐用已有 `ai_research_engine` 作为后端 gate，因为它已经代表 Max 的无限研究助手能力。
   - qinbafrank 不再走 `kol_pack_qinbafrank` 专属门。
   - `kol_pack_qinbafrank` 只作为 legacy key 兼容旧 Stripe/webhook/DB 数据，迁移完成后不再被产品逻辑依赖。

3. **Max 用户立即获得全部博主研究室子页和博主 Agent。**
   - `/kol/qinbafrank` 根页继续公开，用作介绍页。
   - `/kol/qinbafrank/*` 子页从 `requiredFeature="kol_pack_qinbafrank"` 改为 Max gate。
   - `/api/kol_research/chat` 的 qinbafrank 分支改成和其他 KOL persona 一样走通用 research quota；Max 因 `ai_research_engine` 仍是 unlimited，Free/Pro 走日额度。

4. **历史 Ultra 用户迁回 Max，但不丢权益。**
   - DB active/trialing `plan=ultra` 统一改为 `plan=max` + `MAX_FEATURES`。
   - 如果 Stripe subscription 仍在 Ultra price，需要把 Stripe subscription item 改到 Max price，或至少确保下一次续费按 Max 收费。
   - 迁移前导出 dry-run snapshot，保证可审计、可回滚。

### 数据流

```text
Stripe Pro / Max products
  -> webhook / fresh sync
  -> subscriptions.plan = pro|max
  -> subscriptions.entitlements = PRO_FEATURES|MAX_FEATURES
  -> EntitlementsContext / SubscriptionContext
  -> PaywallGuard requiredPlan=max or requiredFeature=ai_research_engine
  -> KOL Agent / KOL subpages unlocked for Max
```

### API Changes

- `POST /api/payment/checkout-session`
  - 支持 `tier=pro|max`。
  - 迁移窗口内：`tier=ultra` 或 `product=creator_max_qinbafrank` 建议 alias 到 `max`，避免旧链接 500；埋 warning log。
  - 迁移稳定后：可以改成 400/410，彻底删除 alias。

- `POST /api/payment/portal-session`
  - 只允许升级到 `max`。
  - 旧 `product=ultra` 在迁移窗口 alias 到 `max`。

- `GET /api/payment/subscription-status`
  - 不再向前端返回新的 `plan=ultra`。
  - 兼容期如果 Stripe 仍报告 Ultra price，backend sync 应归一化为 `max`。

- `GET /api/payment/me/entitlements`
  - Max 返回 `MAX_FEATURES`。
  - 不要求 Max row 必须包含 `kol_pack_qinbafrank`。

- `POST /api/kol_research/chat` 和 `/chat/stream`
  - qinbafrank 不再返回 `required_product="ultra"`。
  - quota exhausted 时统一返回 Max 升级语义。

### Database Changes

不需要新增表字段。需要一次性数据迁移脚本，建议新建：

```text
backend/scripts/migrate_ultra_to_max.py
```

脚本要求：

- 默认 dry-run，`--apply` 才写。
- 通过 `subscriptions?action=list_all` 获取全量用户。
- 输出 JSON/CSV snapshot，至少包含 `user_id/email/plan/status/is_lifetime/access_expires_at/stripe_customer_id/stripe_subscription_id/current_entitlements/target_plan/target_entitlements/billing_action`。
- 分类统计：
  - active/trialing Stripe Ultra price 用户。
  - active/trialing 本地 grandfathered Ultra 但 Stripe 仍是 Max price 用户。
  - lifetime 且 row 含 `kol_pack_qinbafrank` 用户。
  - canceled/expired/free 但残留 Ultra plan 或 KOL entitlement 用户。
  - 非 Stripe grant / trial 且 `access_expires_at` 非空用户。
- DB apply 规则：
  - active/trialing paid Ultra -> `plan=max`, `entitlements=sorted(MAX_FEATURES)`, 保留 period/cancel 字段，清理 `kol_pack_qinbafrank`。
  - grandfathered local Ultra -> `plan=max`, `entitlements=sorted(MAX_FEATURES)`。
  - lifetime -> 保持 `is_lifetime=true`，row entitlements 写 `sorted(MAX_FEATURES)` 或清理 legacy key。
  - expired/canceled 且无 active access -> `plan=free`, `entitlements=[]`，保留 canceled/expired status。
  - 非 Stripe grant/trial -> 映射为 Max grant，保留 `access_expires_at`，不要误清。
- 写后触发 Resend segment sync，确保 Twitter Digest 等 Max-only 邮件段不漂移。

### Stripe Changes

需要在 live Stripe 做只读审计后再 apply：

1. 找出仍使用 Ultra price 的 active/trialing subscriptions。
2. 把 subscription item 切到 Max monthly price。
3. 推荐 `proration_behavior=none`，保持当前账期已付款不动，从下一次续费开始按 `$20/月` 收费。
4. 如果想对已付 Ultra 用户做补偿，另行决定是否发 prorated credit / coupon / manual refund；这是产品/财务决策，不建议脚本默认退款。
5. 将 Ultra price 设为 inactive，并从 Billing Portal 可升级列表移除。
6. Stripe entitlements 里 `kol_pack_qinbafrank` 可以保留为历史 feature，但不要再挂到活跃销售产品。

### Frontend Changes

- `frontend/src/lib/pricing.ts`
  - 删除 `ultra` / `ultraPerMonth`，保留 Pro `$10`、Max `$20`。

- `frontend/src/lib/paywall-analytics.ts`
  - `PaywallTier` 改为 `pro|max`。
  - `qinbafrank_ultra_landing` 改名或保留为 legacy source，新增 `kol_agent_landing` / `qinbafrank_max_landing`。

- `frontend/src/contexts/SubscriptionContext.tsx`
  - 删除 `isUltra`，`CheckoutProduct` 只接受 `pro|max`。
  - 兼容期可把服务端返回的 legacy `plan=ultra` normalize 成 Max 展示，避免迁移期间用户看到 Ultra。

- `frontend/src/app/pricing/page.tsx`
  - 从 3 张卡改回 2 张卡。
  - Max features 增加“博主 Agent / 博主研究室资料库 / KOL 日报 / AI Research”。
  - FAQ 移除 Ultra。

- `frontend/src/app/pricing/success/page.tsx`
  - legacy `tier=ultra` / `product=creator_max_qinbafrank` 归一化到 `max`。
  - Activation ready 只检查 active subscription + `ai_research_engine`。

- `frontend/src/app/kol/[username]/layout.tsx`
  - qinbafrank 子页改为 Max lock：`requiredPlan="max"` 或 `requiredFeature="ai_research_engine"`，`checkoutProduct="max"`。
  - 文案从“解锁 Ultra”改为“升级 Max 解锁博主研究室”。

- `frontend/src/app/kol/[username]/_components/QinbafrankUltraLandingClient.tsx`
  - 建议重命名为 `QinbafrankMaxLandingClient.tsx`。
  - `PRODUCT = "max"`，CTA `createCheckout("max", "/kol/qinbafrank?welcome=1")`。
  - 文案从 “TheMarketBrew Ultra” 改为 “TheMarketBrew Max”。
  - 登录回跳 `checkout=ultra` 在兼容期仍触发 Max checkout，之后改成 `checkout=max`。

- Research UI
  - `ChatPanel.tsx` / `ChatMessage.tsx` / `PersonaSelector.tsx` 把 Ultra copy 和 checkout 全部改为 Max。
  - `required_product` 类型移除 Ultra 或 legacy map 到 Max。

- Profile / nav
  - profile 不再显示 Ultra badge，不再给 Max 用户展示“升级到 Ultra”。
  - MobileMenu badge 只显示 Pro / Max。

### Backend Changes

- `backend/app/features/payment/entitlements.py`
  - 删除 `ULTRA_FEATURES` 常规使用。
  - 保留 `KOL_PACK_QINBAFRANK` 为 legacy 常量，直到所有历史数据清理完。
  - `ALL_FEATURES = MAX_FEATURES`，或仅在兼容函数里识别 legacy key。

- `backend/app/features/payment/service.py`
  - `PRICE_ID_MAP` / `PRICE_LOOKUP_KEY_MAP` 只保留 Pro / Max。
  - 兼容期 `CHECKOUT_PRODUCT_ALIASES = {"ultra": "max", "creator_max_qinbafrank": "max"}`。
  - `_canonical_features_for_plan()` 只返回 Pro / Max。
  - `_normalize_entitlements([kol_pack_qinbafrank])` 返回 Max，而不是 Ultra。
  - 删除 `_preserve_local_ultra_when_subscription_active()` 逻辑。
  - `resolve_plan_from_subscription()` 遇到旧 Ultra price / lookup / metadata 时返回 `max`。

- `backend/app/features/payment/router.py`
  - `_plan_rank()` 删除 Ultra rank。
  - PostHog plan properties 不再发 Ultra。

- `backend/app/features/kol_research/router.py`
  - 删除 qinbafrank 专属 `kol_pack_qinbafrank` gate 和 1 次 lifetime trial bucket，或保留为兼容但不再主用。
  - `_consume_kol_chat_access()` 对所有 persona 走 `consume_quota()`。
  - 错误 payload 统一为 Max。

- `backend/app/core/config.py`
  - 第一阶段保留 `STRIPE_ULTRA_PRICE_ID` 只用于迁移识别旧 price。
  - 第二阶段确认 live Stripe 无 active Ultra subscriptions 后删除。

## 实施步骤

1. [x] 补充 migration dry-run 脚本，只读统计 DB Ultra / legacy KOL entitlement / Stripe Ultra price 覆盖面。
2. [x] Backend 第一阶段兼容改造：新请求只产生 Max，旧 Ultra checkout/product/Stripe metadata 归一化到 Max，KOL gate 改为 Max quota。
3. [x] Backend 单测更新：catalog、checkout alias、Stripe sync、entitlement normalization、KOL quota。
4. [x] Frontend 改造：pricing 两档、Qinbafrank landing 改 Max、KOL paywall 改 Max、research/profile/mobile 文案和类型清理。
5. [x] Frontend 单测和 E2E 更新：pricing success legacy ultra -> max，KOL subpage Max gate，research CTA 不再出现 Ultra。
6. [x] 更新 docs/context：payment、kol_research、subscription-model、frontend kol、pages reference、pricing/research/component/lib contexts。
7. [ ] 部署 backend，再部署 frontend，先阻断新 Ultra 销售并让旧链接落到 Max。
8. [ ] 生产 dry-run：导出迁移 snapshot，人工核对 active Ultra 用户数、billing action 和 sample users。
9. [ ] 执行 DB migration `--apply`，同步 Resend，等待缓存 TTL 或随部署重启清缓存。
10. [ ] 执行 Stripe billing migration：Ultra price subscriptions 改 Max price，Ultra price inactive，Portal 移除 Ultra。
11. [ ] 生产验证：Max 用户可进 qinbafrank 子页和 Agent；Pro/Free 看到 Max CTA；`/payment/me/entitlements?fresh=true` 返回 Max 权限；无 active `plan=ultra`。
12. [ ] 第二阶段清理：删除 legacy Ultra env/config/alias/旧测试，前提是 Stripe 和 DB 连续一个账期无 Ultra active。

## 验证计划

- Backend:
  - `pytest tests/test_payment_unit.py tests/test_entitlements_unit.py tests/test_kol_research_quota.py -v`
  - 对 migration script 跑 dry-run fixture / mocked rows。

- Frontend:
  - `npm test -- pricing success SubscriptionContext ChatPanel profile`
  - `npm run lint`
  - `npm run build`
  - `npm run test:e2e -- kol-login-gate`

- Production smoke:
  - Free/unauthenticated 访问 `/kol/qinbafrank/stocks`：登录/Max paywall。
  - Pro 访问：Max upgrade CTA。
  - Max 访问：页面放行。
  - Max 在 `/research?agent=kol&persona=qinbafrank`：无 Ultra banner，可持续对话。
  - 旧 `/kol/qinbafrank?checkout=ultra`：触发 Max checkout 或被安全重定向到 Max。

## 回滚计划

- DB migration 前必须保存 snapshot；如果出现权限误伤，可按 snapshot 回写 `plan/status/entitlements/access_expires_at`。
- Stripe billing migration 和 DB migration 分开执行；如果 DB 改动有问题，先回滚 DB，不立即反复切 Stripe price。
- Backend 第一阶段保留 legacy Ultra 输入 alias，这样旧链接不会崩；如果要完全恢复 Ultra 销售，需要恢复上一版 backend/frontend，并手动把 Stripe Ultra price 重新 active。
- 如果 KOL Agent 成本异常，优先通过 quota / rate limit / runtime timeout 控制，不恢复 Ultra tier。

## 待定问题

1. 已确认没有真正支付 `$30/月` 的 Ultra 用户，本次不实现 prorated credit/refund 逻辑。
2. Free/Pro 对博主 Agent 沿用通用 research quota：每天 2 次；Max 通过 `ai_research_engine` 无限。
3. `kol_pack_qinbafrank` legacy key 从 active rows 清掉；代码兼容旧 Stripe/webhook/DB 数据一个账期后再二阶段删除。
4. Qinbafrank landing 继续叫“Qinbafrank 研究室”，不重命名；本次只把 tier/CTA 从 Ultra 改成 Max。
