# Qinbafrank Preview Live Payment Rollout Engineering Plan

> Status: In progress
> Related: `backend/app/features/payment/.context.md`, `frontend/src/app/pricing/.context.md`, `backend/app/core/.context.md`, `.insforge/project.json`
> Vision: 在不改动 `master` 和 production DB 的前提下，用当前 branch 做一轮 production-like preview 验证：Vercel Preview 前端 + InsForge Compute 后端 + InsForge branch DB + Stripe Live。

## 目标

把当前 `codex/qinbafrank-creator-max` branch 作为隔离 preview 部署到云端，用真实 Stripe Live 扣款验证 Free/Pro/Max/Ultra 订阅、升级、取消、Webhook 和权益链路，同时保证后续可以安全合并代码到 production。

## 现状

- 当前代码运行在 worktree `qinbafrank-creator-max`，目标是不合并、不修改 `master`。
- 当前 InsForge branch 项目为 `qinbafrank-creator-max-local`，URL 为 `https://9wmhxyi4-eht.us-east.insforge.app`，由 production 项目 `TheMarketBrew Production` 分支而来。
- 本地门禁已通过：
  - `frontend`: `npm run lint`, `npm test`, `npm run build -- --webpack`。
  - `backend`: `tests/test_me_entitlements_unit.py`, `tests/test_payment_unit.py`。
  - 默认 `npm run build` 仍会被当前 worktree 的 `node_modules` 外部 symlink 触发 Turbopack 本地 panic；webpack build 通过。
- InsForge branch 已确认 ready，并已创建 Compute preview service。
- Vercel 正确项目为 `the-market-brew/stock-agent`，但全局 Preview env 当前仍指向 production API/production InsForge，需要为该 branch 单独覆盖 preview env 或部署时传 env。
- 当前云端 preview 骨架已创建：
  - Git branch 已推送到 `origin/codex/qinbafrank-creator-max`。
  - InsForge Compute service: `stock-agent-api-qinbafrank-preview`。
  - Compute endpoint: `https://stock-agent-api--fb97df-24f8aee4-59e1-46aa-a5d9-8fcd3a567934.fly.dev`。
  - Vercel Preview URL: `https://stock-agent-n3aty59be-the-market-brew.vercel.app`。
  - Vercel branch alias: `https://stock-agent-git-codex-qinbafrank-creator-max-the-market-brew.vercel.app`。
  - Vercel Preview Protection 当前开启，未登录访问返回 401。
- 本地 `frontend/.env.local` 已指向 branch DB，并开启：
  - `NEXT_PUBLIC_ENABLE_PAYWALL=true`
  - `NEXT_PUBLIC_STRIPE_LIVE=true`
- 支付链路已支持:
  - Free / Pro / Max / Ultra 定价页。
  - 新订阅走 Stripe Checkout。
  - Pro/Max 升级更高 tier 走 Stripe Billing Portal `subscription_update_confirm`。
  - `subscription-status?fresh=true` 和 `me/entitlements?fresh=true` 从 Stripe 补偿同步。
  - Ultra entitlement 为 `kol_pack_qinbafrank`。
- 需要上线验证的 Stripe Live 对象:
  - `STRIPE_SECRET_KEY=sk_live_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_...`
  - `STRIPE_PRO_PRICE_ID=price_live_...`
  - `STRIPE_MAX_PRICE_ID=price_live_...`
  - `STRIPE_ULTRA_PRICE_ID=price_live_...`
  - Ultra lookup key 兜底为 `themarketbrew_ultra_monthly`，但 Live preview 仍应显式配置 Ultra price id。
- 当前阻塞：
  - `backend/.env` 的 `STRIPE_SECRET_KEY` 仍是 test mode。
  - Compute preview backend 为避免误用 sandbox，当前没有部署 Stripe key；支付端点在补齐 Live key 前不可用于 checkout。
  - InsForge branch 的 Stripe payments connection 为 test/live unconfigured。
  - readiness gate 失败原因是缺少 Live key 和启用的 `/api/payment/webhook` endpoint。
- InsForge branch merge 的限制:
  - schema/config/edge function 等可通过 branch merge 回 parent。
  - 普通用户表 row data 不会自动 merge。
  - 因此 preview 中由 Live Stripe 写入 branch DB 的 `subscriptions` row 不会自动进入 production DB。

## 决策

1. **接受真实扣款，但只用于受控测试账号。**
   - 可以用真实卡完成 Pro/Max/Ultra 流程。
   - 测试结束后在 Stripe Live 中 refund，并 cancel/delete 测试订阅。
   - 不邀请真实用户在 preview 购买，除非先决定如何把他们的 Stripe subscription reconcile 到 production DB。

2. **后端需要稳定 preview URL，但不需要 production 自定义域。**
   - “固定子域”指整个测试期间后端 URL 不变，例如 InsForge Compute 返回的稳定 endpoint。
   - 推荐固定 Compute service name: `stock-agent-api-qinbafrank-preview`。
   - 只要 service name 不变，后续 redeploy/update 不应改变 endpoint；Vercel env、Stripe webhook、CORS 都绑定这个稳定 URL。
   - 不建议为 preview 绑定 `api.themarketbrew.com` 或其他 production 域名，避免和正式服务混淆。

3. **无缝 merge 的定义是代码/配置无缝，不是 preview row data 自动进 production。**
   - production 发布时重新部署 production frontend/backend，并继续使用 production DB。
   - 如果 preview Live 测试产生的订阅需要保留，必须在 production 上跑 Stripe reconcile/import，而不是依赖 InsForge branch merge。
   - 当前计划默认 preview 购买为测试购买，全部 refund/cancel，不保留到 production。

## 设计

### 环境拓扑

```text
Git branch: codex/qinbafrank-creator-max
   |
   +-- Vercel Preview frontend
   |     NEXT_PUBLIC_API_URL=https://<insforge-compute-preview>/api
   |     NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4-eht.us-east.insforge.app
   |     NEXT_PUBLIC_STRIPE_LIVE=true
   |
   +-- InsForge Compute preview backend
   |     FRONTEND_URL=https://<vercel-preview-url>
   |     INSFORGE_BASE_URL=https://9wmhxyi4-eht.us-east.insforge.app
   |     STRIPE_SECRET_KEY=sk_live_...
   |     STRIPE_*_PRICE_ID=price_live_...
   |
   +-- InsForge branch DB
   |     project: qinbafrank-creator-max-local
   |
   +-- Stripe Live
         checkout/session/portal/webhook all use live objects
```

### URL 策略

- 前端: Vercel Preview URL 可以是 Vercel 自动生成的 preview URL。
- 后端: 使用 InsForge Compute 稳定 endpoint。
- Stripe webhook endpoint:

```text
https://<insforge-compute-preview>/api/payment/webhook
```

- 后端 `FRONTEND_URL` 必须填 Vercel Preview URL，保证 Checkout/Portal 完成后回到 preview 前端。
- 前端 `NEXT_PUBLIC_API_URL` 必须填 Compute preview backend，不能指向 production Railway/production API。

### Stripe Live 策略

- Live mode 可真实扣款，测试卡不可用。
- Pro/Max/Ultra price id 必须全部使用 Live price。
- Billing Portal Live configuration 必须支持:
  - subscription update。
  - Pro/Max -> Ultra product/price。
  - `proration_behavior=always_invoice`。
- Live webhook events 至少包含:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `entitlements.active_entitlement_summary.updated`

### Production Merge 策略

```text
Preview 验证通过
  -> branch merge dry-run 只审 schema/config/function diff
  -> 不依赖 branch DB row data
  -> 代码 PR / merge 到 production branch
  -> 部署 production frontend/backend
  -> production env 使用 production DB + production backend URL + Stripe Live
  -> 对需要保留的 Live subscription 跑 production reconcile
```

## 实施步骤

1. [x] **冻结并检查 branch**
   - 确认当前 branch: `codex/qinbafrank-creator-max`。
   - 确认无意外切到 `master`。
   - 记录当前 diff，不自动 commit。

2. [x] **本地质量门禁**
   - Frontend: `cd frontend && npm run lint && npm test && npm run build`。
   - Backend: `cd backend && python -m pytest tests/test_me_entitlements_unit.py tests/test_payment_unit.py -q`。
   - Payment readiness: 用 live env 跑 `backend/scripts/check_qinbafrank_stripe_readiness.py`，webhook URL 先用计划中的 Compute preview URL。

3. [x] **确认 InsForge branch 状态**
   - `npx @insforge/cli current --json` 应指向 `qinbafrank-creator-max-local`。
   - `npx @insforge/cli branch list` 确认 branch `ready`。
   - 如有 Edge Function 变更，部署到 branch runtime，不部署 production runtime。

4. [ ] **准备 InsForge Compute env file**
   - 建一个本地临时 env 文件，不提交。
   - 必填:
     - `ENVIRONMENT=preview`
     - `FRONTEND_URL=https://<vercel-preview-url>`
     - `BACKEND_URL=https://<insforge-compute-preview>`
     - `INSFORGE_BASE_URL=https://9wmhxyi4-eht.us-east.insforge.app`
     - `INSFORGE_ANON_KEY=<branch anon key>`
     - `INSFORGE_SERVICE_KEY=<branch service key>`
     - `CRON_SECRET=<preview secret>`
     - `EDGE_FUNCTION_SECRET=<preview secret>`
     - `STRIPE_SECRET_KEY=sk_live_...`
     - `STRIPE_WEBHOOK_SECRET=whsec_...`
     - `STRIPE_PRO_PRICE_ID=price_live_...`
     - `STRIPE_MAX_PRICE_ID=price_live_...`
     - `STRIPE_ULTRA_PRICE_ID=price_live_...`
     - 必要 AI / market data / Resend key
   - `ENVIRONMENT` 不设 `production`，防止非生产邮件广播误触生产发送逻辑。
   - 现状：`flyctl` 已安装，InsForge source deploy 工具链就绪；等待 Live Stripe key/price/webhook 输入。

5. [x] **部署后端到 InsForge Compute preview**
   - 推荐 service name: `stock-agent-api-qinbafrank-preview`。
   - 使用当前 `backend/Dockerfile` source deploy:

```bash
npx @insforge/cli compute deploy backend \
  --name stock-agent-api-qinbafrank-preview \
  --port 8000 \
  --cpu shared-1x \
  --memory 1024 \
  --env-file /path/to/preview-backend.env
```

   - 记录返回的 `endpointUrl`。
   - 如果后续只改 env 或 image，使用同一个 service name update/redeploy，避免 URL 改变。
   - 已部署 preview skeleton，`/health` 与 `/ready` 均通过；Stripe key 暂为空，等待 Live key 后使用 `compute update --env-set` 启用支付。

6. [x] **部署前端到 Vercel Preview**
   - Push 当前 branch 到 GitHub，不 push/merge `master`。
   - 让 Vercel 生成 Preview Deployment。
   - Preview env:
     - `NEXT_PUBLIC_API_URL=https://<insforge-compute-preview>/api`
     - `NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4-eht.us-east.insforge.app`
     - `NEXT_PUBLIC_INSFORGE_ANON_KEY=<branch anon key>`
     - `NEXT_PUBLIC_ENABLE_PAYWALL=true`
     - `NEXT_PUBLIC_STRIPE_LIVE=true`
   - 拿到 Vercel Preview URL 后，回填后端 `FRONTEND_URL` 并重启/redeploy Compute。
   - 已为 `codex/qinbafrank-creator-max` 设置 branch-specific preview env：
     - `NEXT_PUBLIC_API_URL` 指向 Compute preview `/api`。
     - `NEXT_PUBLIC_INSFORGE_URL` 指向 InsForge branch。
     - `NEXT_PUBLIC_INSFORGE_ANON_KEY` 使用 InsForge branch anon key。
     - `NEXT_PUBLIC_ENABLE_PAYWALL=true`。
     - `NEXT_PUBLIC_STRIPE_LIVE=true`。
   - branch-specific preview env 已通过 `vercel env pull --git-branch codex/qinbafrank-creator-max` 验证。
   - 已 redeploy Vercel preview，状态 Ready。
   - Compute `FRONTEND_URL` 已回填为 Vercel branch alias。

7. [ ] **配置 Stripe Live webhook**
   - 在 Stripe Live Dashboard 添加 endpoint:

```text
https://<insforge-compute-preview>/api/payment/webhook
```

   - 事件:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `entitlements.active_entitlement_summary.updated`
   - 把新的 `whsec_...` 写入 Compute preview env。
   - 重新部署/更新 Compute。

8. [ ] **Stripe Live catalog / Portal readiness**
   - 确认 Pro price 为 $10/month。
   - 确认 Max price 为 $20/month。
   - 确认 Ultra price 为 $30/month，并且 lookup key 为 `themarketbrew_ultra_monthly`。
   - 确认 Live products 绑定正确 entitlements：
     - Pro: `PRO_FEATURES`
     - Max: `MAX_FEATURES`
     - Ultra: `ULTRA_FEATURES`
   - 确认 Live Billing Portal 配置支持 subscription update 到 Ultra，且 proration 为 `always_invoice`。

9. [ ] **Preview 手动验收**
   - Free 用户访问 `/pricing`，点击 Pro，完成 live checkout。
   - Pro 用户升级 Max，应进入 Billing Portal，不创建第二个 subscription。
   - Max 用户升级 Ultra，应只补剩余周期差价，不重新收完整 $30。
   - 取消订阅后 `/profile?tab=subscription` 显示已取消/有效至。
   - Webhook 后 branch DB 中 `subscriptions` row 正确：
     - `plan`
     - `status`
     - `stripe_customer_id`
     - `stripe_subscription_id`
     - `entitlements`
     - `cancel_at` / `canceled_at`
   - `/api/payment/subscription-status?fresh=true` 与 `/api/payment/me/entitlements?fresh=true` 返回一致。

10. [ ] **退款与清理**
    - 对所有 preview Live 测试 charge 执行 refund。
    - cancel 测试 subscription，避免继续续费。
    - 如 Stripe Customer 是专门测试用途，可保留用于审计，也可标记 metadata。
    - Branch DB 中测试 row 可保留作为审计，不 merge row data。

11. [ ] **Production merge 准备**
    - `npx @insforge/cli branch merge qinbafrank-creator-max-local --dry-run --save-sql /tmp/qinbafrank-preview-merge.sql`
    - 人工审查 SQL：只接受预期 schema/config/function 变更。
    - 明确普通 row data 不会 merge。
    - 代码层面走正常 PR/merge，production env 仍使用 production DB 和 production backend URL。

12. [ ] **Production cutover**
    - 部署 production backend/frontend。
    - 配置 production Stripe Live webhook 指向 production backend。
    - 如需要保留 preview 中真实用户的 Live subscription，运行单独的 Stripe reconcile/import 到 production DB。
    - 最终在 production 跑一次 checkout / portal / webhook canary。

## 风险与控制

| 风险 | 控制 |
|------|------|
| Preview Live 真实扣款误伤真实用户 | 只用内部测试账号；测试后 refund + cancel |
| Stripe Live webhook 写到 branch DB，production 没有 row | 默认 preview 付款不保留；若要保留，production cutover 时跑 Stripe reconcile |
| 后端 URL 改变导致 Stripe webhook 失效 | 使用固定 Compute service name `stock-agent-api-qinbafrank-preview` |
| Vercel Preview 指到 production backend | Preview env 显式设置 `NEXT_PUBLIC_API_URL` 到 Compute preview |
| 后端误用 production DB | Compute env 显式设置 branch `INSFORGE_BASE_URL` / branch keys |
| 非生产广播误发给真实用户 | `ENVIRONMENT=preview`，并确认 email guard 行为 |
| Branch merge 带入不该进 production 的改动 | merge 必须先 dry-run 并审 SQL |

## 待定问题

无阻塞问题。当前决策为：

- 接受真实扣款，测试后 refund。
- 使用 InsForge Compute 稳定 preview endpoint，不绑定 production 自定义域。
- Preview Live 测试产生的数据默认不带入 production；需要保留时另做 Stripe reconcile/import。
