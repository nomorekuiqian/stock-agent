# Frank MVP Production Merge Audit

> Status: Dry-run merge verified; production cutover not executed
> Related: `docs/plans/active/qinbafrank-preview-live-payment-rollout.md`, `backend/app/features/payment/.context.md`, `frontend/src/app/pricing/.context.md`, `frontend/src/contexts/.context.md`, `docs/constraints/subscription-model.md`
> Date: 2026-06-13

## 目标

把 Frank/Qinbafrank MVP 的价格、Ultra 权限包和支付升级流程安全合并到 production，并在生产环境完成一次可回滚的端到端验证。

## 当前判断

- 本仓库没有名为 `frank-mvp` 或 `production` 的本地/远端分支；最接近 `frank-mvp` 的候选是 `codex/qinbafrank-creator-max`。`codex/frank-lens-mcp-mvp` 是 MCP 数据工具分支，不包含新价格/支付流程。
- production 部署目标按当前仓库状态应视为 `master`，而不是 `production` 分支。
- 生产公开 `/pricing` 当前仍显示旧 Pro `$4.99/月`、Max `$9.99/月`，且没有 Ultra。新分支目标价格是 Pro `$10/月`、Max `$20/月`、Ultra `$30/月`。
- `codex/qinbafrank-creator-max` worktree 有大量未提交改动；审计后判断这些 dirty 改动主要是全站中文排版、Serenity/KOL 扩展和视觉可读性 sweep，不是价格/支付主链路必需项。
- Production backend `/health` 与 `/ready` 当前返回 ok/ready。
- 已在 detached dry-run worktree 完成 `origin/codex/qinbafrank-creator-max` -> 最新 `origin/master` 的合并冲突解析；没有 commit、push 或 deploy。
- 已把同一份已验证冲突解析迁移到真实 `master` 工作树，并保持 `--no-commit` merge state。
- Dry-run 代码验证通过：后端 targeted tests `104 passed`，前端 targeted Vitest `166 passed`，ESLint `0 errors`，Next production build pass。
- 本地 production server 页面级 QA 通过：`/pricing` 显示 `$0/$10/$20/$30` 和 Pro/Max/Ultra CTA；未登录 Ultra CTA 跳转登录；`/frank-agent` 保留 query 并 redirect 到 `/kol/qinbafrank`；Qinbafrank Ultra CTA 跳转登录/signup。
- Production `subscriptions` Edge Function 已部署到当前 linked InsForge project，并复验 deployed code 包含 `list_dashboard`、`get_by_customer`、`list_expired_access_grants`。
- InsForge branch `qinbafrank-creator-max-local` 当前仍是 ready，可作为 preview DB 复验环境；parent production 项目当前 CLI `compute list` 返回空。
- 最新生产只读复核时间: `2026-06-13 16:12 PDT`。

## 审计结果

### Git / Merge

- `codex/qinbafrank-creator-max` 比 `master` 多 9 个提交。
- `master` 也已经前进，`git merge-tree` 显示真实冲突，不能直接快进合并。
- Dry-run worktree: `/Users/kedeng/projects/stock-agent-worktrees/frank-mvp-production-dry-run`。
- Dry-run merge source: `origin/codex/qinbafrank-creator-max` at `2b2b5432`，target: `origin/master` at `2c72d824`。
- 冲突已解析并 staged 于 dry-run worktree；关键手工决策:
  - `backend/app/features/admin/router.py`: 保留 master dashboard pagination/fallback/activity 修复，并把 `ultra` 纳入 paid category。
  - `backend/app/features/payment/db.py`: 同时保留 master `clear_cancellation` 和 Frank `clear_cancel_at` / `clear_canceled_at`。
  - `backend/app/features/payment/router.py`: 使用 Frank `sync_subscription_from_stripe()` 路径，同时保留 lifetime skip。
  - `frontend/src/contexts/SubscriptionContext.tsx`: 使用 Frank `CheckoutProduct pro|max|ultra` 和 Portal upgrade 签名，并保留 cancel fields。
  - `frontend/middleware.ts`: 同时保留 `/frank-agent` 与 `/qinbafrank` public route。
  - `frontend/src/app/frank-agent/page.tsx`: 改成保留 query string 的 server redirect 到 `/kol/qinbafrank`。
  - `frontend/src/app/page.tsx`: 保留 master 首页结构，移除已被 Frank `PRICING` 常量删除的 early-bird/original price 引用。
- 冲突热点:
  - `backend/app/features/admin/router.py`
  - `backend/app/features/kol_research/router.py`
  - `backend/app/features/payment/router.py`
  - `backend/app/features/payment/db.py`
  - `frontend/src/lib/api.ts`
  - `frontend/src/contexts/SubscriptionContext.tsx`
  - `frontend/src/app/pricing/page.tsx`
  - 多个 `.context.md` 文档
- `frontend/src/app/frank-agent/*` 在候选分支中被删除，新增 `/qinbafrank` 与 `/kol/[username]` 入口；上线前要确认这不是误删现有落地页。

### Deployment / Release Surface

- CI 配置 `.github/workflows/ci.yml` 只在 push/PR 到 `master` 时跑 frontend/backend job；合并前必须走 PR 或等价本地验证，不能绕过 CI。
- 项目文档明确 `master` 是主分支，Vercel production 和 Railway backend 都由 push/merge 到 `master` 自动部署。
- Vercel production 目标是 `themarketbrew.com`；Railway backend 目标是 `stock-agent-production.up.railway.app`。
- Railway 后端没有 preview 分支；后端改动只能本地/InsForge branch 复验，或合并后在 production canary 验证。
- InsForge Edge Functions 不随 Git 自动部署；合并代码后仍需要手动部署对应 Edge Function。
- Backend `railway.json` 使用 Dockerfile 构建并以 `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}` 启动；healthcheck path 是 `/`。
- 主干当前支付配置只读取 `STRIPE_PRO_PRICE_ID` / `STRIPE_MAX_PRICE_ID`；Frank 分支新增 `STRIPE_ULTRA_PRICE_ID`，并兼容旧名 `STRIPE_CREATOR_MAX_QINBAFRANK_PRICE_ID`。
- 前端 production gate 仍由 `NEXT_PUBLIC_ENABLE_PAYWALL=true` 和 `NEXT_PUBLIC_STRIPE_LIVE=true` 控制；如果 Vercel 未配置这两个变量，新价格页面会显示但 CTA 仍是“即将开放”。
- Frank 分支的 checkout return URL 会使用请求 `Origin`，但只允许 `FRONTEND_URL`、`ALLOWED_ORIGINS` 或 `CORS_ALLOWED_ORIGIN_REGEX` 匹配的 preview/prod origin；这降低了 preview 与 production URL 混用风险。

### Preview Rollout Cross-check

- 候选分支自带 `docs/plans/active/qinbafrank-preview-live-payment-rollout.md`，其目标是用 Vercel Preview + InsForge Compute + InsForge branch DB + Stripe Live 做 production-like 验证，不改 production DB。
- 该 rollout 文档记录 preview 环境曾配置 branch-specific Vercel env、InsForge Compute preview、Live Stripe webhook、Live Billing Portal configuration，并跑通过 `check_qinbafrank_stripe_readiness.py --require-live --webhook-url <compute>/api/payment/webhook`。
- 该 preview 验证不等于 production readiness：preview 使用 branch DB，preview 购买写入的 `subscriptions` rows 不会 merge 回 production DB。
- 该 rollout 的手动验收项仍未标完成，包括 Free -> Pro、Pro -> Max、Max -> Ultra、取消、webhook 后 branch DB 与 API 状态一致、refund/cancel 清理。
- Readiness 脚本本身只验证 key mode、Ultra price/lookup、webhook endpoint 和 Billing Portal Ultra upgrade；它不验证 Pro `$10/month`、Max `$20/month` 的金额和 active 状态。因此 production gate 必须额外检查 Pro/Max price。

### 未提交改动审计

- `codex/qinbafrank-creator-max` 当前 dirty diff 为 128 个文件，约 `1603 insertions / 943 deletions`，另有未跟踪文件 `docs/plans/active/sitewide-chinese-typography.md`、`frontend/src/app/kol/page.tsx`、`frontend/src/app/kol/serenity/[...path]/page.tsx`。
- Dirty diff 分类:
  - backend: 2 个文件，均在 `backend/app/features/kol_research/`。
  - docs: 2 个文件。
  - KOL pages/components: 18 个文件。
  - research app: 30 个文件。
  - macro app: 12 个文件。
  - admin app: 4 个文件。
  - other app pages: 32 个文件。
  - shared components: 28 个文件。
- 支付主链路没有 dirty backend 改动：`backend/app/features/payment/`、`frontend/src/lib/`、`frontend/src/contexts/` 在 dirty diff 中没有变更。
- `frontend/src/app/pricing/success/page.tsx` 与 `frontend/src/app/profile/page.tsx` 的 dirty 改动只是文字颜色/字号 token 调整，不改变 checkout sync、subscription status、Portal 或 entitlement 逻辑。
- `frontend/src/components/PaywallGuard.tsx` 的 dirty 改动只把 CTA 辅助文案从 `text-xs` 调到 `text-sm`，不改变 `requiredFeature`、`checkoutProduct` 或 Stripe live gate。
- 有业务相邻含义的 dirty 改动:
  - `backend/app/features/kol_research/router.py` 为非 Frank v3 persona 增加 ticker timeline fallback，并解析 sector evidence map 的 `rep_tweet_ids`。
  - 新增 `/kol` 博主研究室总入口，导航从 `/kol/qinbafrank` 改到 `/kol`。
  - `/kol/serenity` 与 `/kol/serenity/*` 作为 alias redirect 到 `/kol/aleabitoreddit`。
  - `SerenityOverview.tsx` 大幅扩展 Serenity 研究室首页。
  - 全站字体从 `LXGW WenKai-first` 改为 sans-first，并引入 `.font-reading` / `.prose-agent`。
- 风险判断: 这些 dirty 改动已经通过本轮 `npm run lint` 与 `npm run build -- --webpack`，但它们显著扩大前端回归面，也改变全站字体加载方式和多个已上线页面的可读性/布局。因此不应自动夹带进今天的价格/支付 cutover。
- 推荐决策: 今天默认只合并 `origin/codex/qinbafrank-creator-max` 已提交内容。dirty diff 另开排版/KOL Serenity 扩展批次；如果必须纳入，只建议先挑出 `/kol` 总入口、Serenity alias 和 `kol_research` fallback 这些产品必需改动，做独立 commit、独立截图回归，再进入合并。

### Payment / Stripe

- 代码使用 Stripe Checkout subscription mode 和 Billing Portal 升级 flow；没有发现 `payment_method_types` 硬编码。
- 新用户 Pro/Max/Ultra 走 Checkout；已有 Pro/Max 升级更高 tier 走 Billing Portal `subscription_update_confirm`，避免创建并行订阅。
- Ultra 权限为 `kol_pack_qinbafrank`，并继承 Max 全部 feature。
- Frank 分支新增 `CheckoutProduct = pro | max | ultra`，并兼容旧产品别名 `creator_max_qinbafrank -> ultra`。
- Pro/Max 只从 backend env price id 解析；Ultra 可以从 `STRIPE_ULTRA_PRICE_ID` 解析，或 fallback 到 Stripe lookup key `themarketbrew_ultra_monthly`。
- `/payment/checkout-session/complete` 会在 Stripe Checkout 返回后用 `session_id` 主动补偿同步，降低 webhook 延迟导致的成功页 stale paywall。
- `checkout.session.completed`、`customer.subscription.updated/deleted` 和 `entitlements.active_entitlement_summary.updated` 都会触发或补偿同步本地 entitlements。
- 风险点: `_ensure_upgrade_portal_configuration_id()` 在找不到 `always_invoice` 配置时会修改一个现有 Billing Portal configuration。生产前必须确认目标 Portal configuration 正确，避免误改默认配置。
- 产品政策点: Frank 分支中 `is_lifetime=true` 用户仍只自动拥有 `MAX_FEATURES`，不包含 `kol_pack_qinbafrank`；如果 lifetime 应该包含 Ultra，必须改 `entitlements.py` 和相关测试。
- 使用本地 backend `.env` 通过 Python dotenv 加载后，Stripe live readiness 宽松检查已通过：live key、Ultra price、Portal upgrade config、以及至少一个 enabled `/api/payment/webhook` endpoint 覆盖 required events。
- Production exact webhook gate 未通过: 没找到精确匹配 `https://stock-agent-production.up.railway.app/api/payment/webhook` 的 enabled Stripe webhook endpoint。
- Stripe 当前 enabled required webhook 指向 `https://stock-agent-api--fb97df-24f8aee4-59e1-46aa-a5d9-8fcd3a567934.fly.dev/api/payment/webhook`，且覆盖 `checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`、`entitlements.active_entitlement_summary.updated`。
- 使用 Fly exact webhook URL 运行 readiness 已通过；因此当前问题是 production runbook/目标 endpoint 与 Stripe 实际 endpoint 不一致，而不是当前 Stripe webhook 事件集缺失。
- Railway backend 和当前 Stripe webhook 指向的 Fly backend 在 `2026-06-13 16:12 PDT` 均返回 `/health` ok、`/ready` ready。上线前必须决定 production webhook 应继续指向 Fly，还是改到 Railway 并更新 `STRIPE_WEBHOOK_SECRET`。

### Database / InsForge

- 候选分支没有新增 `subscriptions` schema migration；它依赖 production DB 已经存在 `entitlements`、`access_expires_at`、`is_lifetime`、`cancel_at`、`canceled_at`、`cancel_at_period_end` 等列。
- Production InsForge schema 已只读验证：`subscriptions` 存在 `user_id`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `cancel_at`, `canceled_at`, `access_expires_at`, `entitlements`, `is_lifetime`, `lifecycle_state`, `reactivation_state`, `onboarding_completed_at`。
- Production `subscriptions` Edge Function 是 active，但部署代码落后于当前仓库：只读 `functions code subscriptions` 没看到 `list_expired_access_grants`，也没看到 `cancel_at*` 字段在 `list_all` 输出中显式返回。也没看到 `list_dashboard`，但 `master` 的 admin router 有 fallback，所以这是性能/功能完整性风险，不是支付主链路阻塞。合并/发布前必须部署当前仓库的 `backend/app/edge_functions/subscriptions.js` 或至少验证目标代码已包含相关 action/字段。
- Preview/live Stripe 测试写入的是 branch DB row data；普通 row data 不会自动 merge 回 production DB。真实 preview 订阅若要保留，必须在 production 跑 Stripe reconcile/import。

### Frontend

- `/pricing` 新分支展示 Free/Pro/Max/Ultra，价格来自 `frontend/src/lib/pricing.ts`，实际扣款由 backend Stripe Price ID 决定。
- `/pricing/success` 会先完成 checkout session sync，再轮询 `subscription-status?fresh=true` 和 `me/entitlements?fresh=true`。
- `SubscriptionContext` 中 `isPro` 包含 Pro/Max/Ultra，`isMax` 包含 Max/Ultra，Ultra 专属能力通过 `EntitlementsContext.has("kol_pack_qinbafrank")` 判断。
- 主干当前 `frontend/src/lib/pricing.ts` 仍是旧价格 `$4.99/$9.99` 与早鸟折扣文案；Frank 分支改为 `$10/$20/$30` 且去掉折扣。
- 主干当前 `SubscriptionContext.createCheckout()` 只接受 `pro|max`；Frank 分支改为 `pro|max|ultra`，并在已有付费订阅升档时优先打开 Billing Portal。
- 主干当前 `frontend/middleware.ts` 把 `/frank-agent` 设为 public route；Frank 分支移除 `/frank-agent` 并新增 `/qinbafrank` legacy redirect。上线前建议保留 `/frank-agent -> /kol/qinbafrank` redirect，避免历史链接被 middleware 转去登录或 404。

## 已跑验证

- Backend:
  - `/Users/kedeng/projects/stock-agent/backend/venv/bin/python -m pytest backend/tests/test_payment_unit.py backend/tests/test_me_entitlements_unit.py -q`
  - Result: `58 passed`, 6 warnings。
  - `/Users/kedeng/projects/stock-agent/backend/venv/bin/python -m pytest backend/tests/test_kol_cockpit_unit.py backend/tests/test_kol_research_quota.py backend/tests/test_kol_research_stream_heartbeat.py -q`
  - Result: `46 passed`, 6 warnings。
- Frontend:
  - `npm ci --prefer-offline`
  - Result: dependency install pass; npm audit reported `14 vulnerabilities (5 moderate, 8 high, 1 critical)` for the dependency tree.
  - `npm test -- src/app/pricing/success/__tests__/page.test.tsx src/app/profile/__tests__/page.test.tsx src/lib/__tests__/api.test.ts src/lib/__tests__/paywall-analytics.test.ts src/hooks/queries/__tests__/query-keys.test.ts src/hooks/queries/__tests__/use-kol-data.test.tsx`
  - Result: `166 passed`。
  - `npm run lint`
  - Result: pass, `0 errors`, `38 warnings`。
  - `NEXT_TELEMETRY_DISABLED=1 npm run build`
  - Result: first run failed because dry-run worktree lacked `NEXT_PUBLIC_INSFORGE_URL` / `NEXT_PUBLIC_INSFORGE_ANON_KEY`; rerun with public env loaded from main `frontend/.env.local` passed.
- Local production page QA:
  - Server: `NEXT_TELEMETRY_DISABLED=1 npm start -- -p 3100` from dry-run `frontend/`.
  - `/pricing`: shows Free `$0`, Pro `$10/月`, Max `$20/月`, Ultra `$30/月`; DOM has `订阅 Pro · $10/月`, `订阅 Max · $20/月`, `订阅 Ultra · $30/月` for authenticated state and `登录后订阅` for unauthenticated state.
  - Unauthenticated Ultra CTA on `/pricing`: navigates to `/login?redirect=/pricing`。
  - `/frank-agent?utm_source=x&ref=test`: redirects to `/kol/qinbafrank?utm_source=x&ref=test`。
  - `/kol/qinbafrank`: displays Qinbafrank Research Room, `$30/月`, Ultra CTA, and public library links; unauthenticated Ultra CTA navigates to `/login?mode=signup&redirect=%2Fkol%2Fqinbafrank%3Fcheckout%3Dultra`。
- Stripe readiness:
  - Exact Railway webhook command failed: `No enabled Stripe webhook endpoint exactly matches https://stock-agent-production.up.railway.app/api/payment/webhook`。
  - Broad required webhook command passed.
  - Stripe active required webhook observed at `https://stock-agent-api--fb97df-24f8aee4-59e1-46aa-a5d9-8fcd3a567934.fly.dev/api/payment/webhook`。
  - Exact Fly webhook command passed for that endpoint.
- Static:
  - `rg -n "^<<<<<<<|^=======$|^>>>>>>>" .`
  - Result: no merge conflict markers in dry-run worktree.
- Production read-only checks:
  - `npx @insforge/cli db query ... information_schema.columns ... --json`: required `subscriptions` columns present.
  - `npx @insforge/cli functions list --json`: `subscriptions` function active.
  - `npx @insforge/cli functions code subscriptions | rg ...`: production deployed function appears stale for `list_expired_access_grants`.
  - `curl https://stock-agent-production.up.railway.app/health` and `/ready`: ok/ready; latest recheck `2026-06-13 16:12 PDT` returned `insforge`, `google_api_key`, `fmp_api_key` all ok.
  - `curl https://stock-agent-api--fb97df-24f8aee4-59e1-46aa-a5d9-8fcd3a567934.fly.dev/health` and `/ready`: ok/ready at `2026-06-13 16:12 PDT`。
  - Public `/pricing`: still old Pro `$4.99/月`, Max `$9.99/月`, no Ultra; latest recheck `2026-06-13 15:53:51 PDT`.
  - `npx @insforge/cli branch list --json`: `qinbafrank-creator-max-local` branch ready.

## 冲突保留矩阵

| 文件 | `master` 必须保留 | Frank 分支必须保留 | 合并规则 |
|------|-------------------|--------------------|----------|
| `frontend/src/lib/api.ts` | Research/KOL conversation APIs 使用 `_authHeaders(..., { required: true })`，401/403 不再静默降级为空列表；agent session restore 不把 502 当空状态 | KOL feed 增加 `tickers` / `keywords` query params | 两者都保留：先保留 auth fail-fast，再加 feed filter serialization |
| `backend/app/features/kol_research/router.py` | 现有 vector/chunk wording 与 master 上的 research 修复 | `kol_pack_qinbafrank` Ultra gate、1 次 lifetime trial、SSE `required_product="ultra"`、feed/timeline limit 1500 | 合并为：普通 persona 仍走通用 quota，`qinbafrank` 走 Ultra pack gate |
| `backend/app/features/payment/router.py` | master 的 cancel state 写入、lifetime skip、subscription status 返回 cancel fields | Ultra product normalization、Checkout complete endpoint、fresh sync from Stripe、已有 paid upgrade 转 Portal | 优先使用 Frank 的 `sync_subscription_from_stripe()` 路径，同时保留 cancel field response 和 lifetime skip 行为 |
| `backend/app/features/payment/db.py` | `clear_cancellation` 语义可一次清空 cancel fields | `clear_cancel_at` / `clear_canceled_at` 细粒度清理 | 采用细粒度 API，并确认所有调用点能清空 `cancel_at` / `canceled_at`；必要时保留兼容 `clear_cancellation` wrapper |
| `frontend/src/contexts/SubscriptionContext.tsx` | master 订阅状态展示/取消字段语义 | `CheckoutProduct = pro/max/ultra`、已有订阅升级走 Portal、`isPro/isMax` 包含 Ultra | 保留 Ultra rank/Portal upgrade，并确保 profile/pricing 使用 cancel state |
| `frontend/src/app/pricing/page.tsx` | master 的 pricing polish、交互状态、a11y/focus motion 改进 | 新 Free/Pro/Max/Ultra 信息架构，$10/$20/$30，无早鸟折扣 | 以 Frank 的四档产品结构为主，回填 master 的可访问性/交互 polish |
| `backend/app/features/admin/router.py` | server-side dashboard pagination、activity include_growth、dashboard fallback、避免 growth query 卡刷新 | `/admin/feedback` dashboard endpoint | 同时保留，避免 Frank 分支旧 admin feedback 覆盖 master pagination |
| `frontend/src/app/frank-agent/*` | production 现有 Frank Agent landing 入口 | Frank 分支删除旧入口并新增 `/qinbafrank` | 需要产品确认；默认建议保留 redirect/compat，避免旧链接 404 |

## 合并计划

1. [ ] **确认目标分支**
   - 明确 `frank-mvp` 是否就是 `codex/qinbafrank-creator-max`。
   - 明确 production 代码分支是否就是 `master`。
   - 决定是否纳入 qinbafrank worktree 当前未提交改动；默认不纳入，因为 dirty diff 是全站排版/KOL Serenity 扩展，不是价格/支付主链路。

2. [ ] **清理合并输入**
   - 若只合并远端分支: 保持 `origin/codex/qinbafrank-creator-max` 为唯一输入。
   - 若纳入未提交改动: 先拆成独立 commit，并单独审计 128 个文件的 typography/UI 改动；不要在同一个 merge commit 里同时发布价格/支付与全站排版。

3. [ ] **在隔离 worktree 做 merge dry-run**
   - 从最新 `master` 新建临时 worktree。
   - 合并 `codex/qinbafrank-creator-max`，手工解决冲突。
   - 优先保留 `master` 上已修复的 research auth、admin dashboard、email broadcast idempotency，再叠加 Ultra/payment 变更。

4. [ ] **后端冲突解决重点**
   - `payment/router.py/service.py/db.py/models.py`: 保留 Ultra、Portal upgrade、fresh sync、webhook compensation。
   - `kol_research/router.py`: 合并 master 的 auth/conversation 修复与 qinbafrank pack gate。
   - `admin/router.py`: 合并 master 活动/邮件指标改动与分支 admin feedback dashboard，避免覆盖已有修复。

5. [ ] **前端冲突解决重点**
   - `pricing/page.tsx`, `pricing/success/page.tsx`, `SubscriptionContext.tsx`: 保留 $10/$20/$30、Ultra、Portal upgrade、fresh entitlement polling。
   - `frontend/src/lib/api.ts`: 合并 master conversation fail-fast auth 与 qinbafrank feed filters。
   - 确认 `/frank-agent` 删除是否符合产品策略；如需要保留旧入口，应改成 redirect 或兼容页面。

6. [ ] **数据库与 edge function gate**
   - Production DB schema 已确认完整；发布前仍需在 cutover 当天复跑一次。
   - 部署/确认 production `subscriptions` edge function 支持 `get_by_customer`、`list_expired_access_grants`、`upsert entitlements/cancel fields`。
   - 如缺列，先补 migration/SQL，不能让 webhook 首次写入时失败。

7. [ ] **Stripe production gate**
   - 用 production/live env 跑 readiness 脚本；这只覆盖 Ultra/Webhook/Portal，不覆盖 Pro/Max 金额:

```bash
cd backend
source venv/bin/activate
python scripts/check_qinbafrank_stripe_readiness.py \
  --require-live \
  --webhook-url https://stock-agent-production.up.railway.app/api/payment/webhook
```

   - 必须确认:
     - Pro Price = `$10/month`
     - Max Price = `$20/month`
     - Ultra Price = `$30/month`
     - production webhook enabled 且包含 4 个 required events
     - Billing Portal 支持 price update to Ultra，proration 为 `always_invoice`
   - 对 Pro/Max 价格，必须通过 Stripe Dashboard 或只读 Stripe API 额外确认 `active=true`、currency、interval 和 unit amount。

8. [ ] **发布前测试**
   - Backend: payment/entitlements/kol gate/admin affected tests。
   - Frontend: pricing/success/subscription context/API tests、lint、webpack build。
   - 预发环境手测:
     - Free -> Pro Checkout
     - Free -> Max Checkout
     - Free -> Ultra Checkout
     - Pro -> Max Portal upgrade
     - Max -> Ultra Portal upgrade
     - cancel at period end
     - webhook 后 DB entitlements 与前端状态一致

9. [ ] **Production cutover**
   - 配置 production env:
     - `STRIPE_PRO_PRICE_ID`
     - `STRIPE_MAX_PRICE_ID`
     - `STRIPE_ULTRA_PRICE_ID`
     - `STRIPE_WEBHOOK_SECRET`
     - `NEXT_PUBLIC_STRIPE_LIVE=true`
     - `NEXT_PUBLIC_ENABLE_PAYWALL=true`
   - 部署 backend，再部署 frontend。
   - 生产 canary:
     - 内部账号完成一笔最小范围真实 Checkout。
     - 验证 webhook 写入 production DB。
     - 验证 `/pricing/success` 跳转、`/profile` 状态、`/kol/qinbafrank` gate。
   - 测试 charge refund/cancel，并记录结果。

10. [ ] **回滚策略**
    - 代码回滚: revert/rollback frontend + backend deploy 到 merge 前版本。
    - Stripe 回滚: 暂停 Ultra price 或隐藏 pricing CTA；保留 webhook 不删除。
    - DB 回滚: 不删除订阅 row；只修复错误 entitlements/plan 字段，保留审计记录。

## 执行 Runbook

> 前提: 以下步骤只有在用户确认目标分支、production 分支、dirty diff 范围后执行。当前文档只定义顺序，不代表已经授权 merge/push/deploy。

### Phase 0: 冻结输入

1. 确认 merge source:
   - 默认: `origin/codex/qinbafrank-creator-max`。
   - 不带入 qinbafrank worktree 的 128 个 dirty UI/typography 改动。
2. 确认 production target:
   - 默认: `master`。
3. 确认产品策略:
   - `/frank-agent` 是否保留 redirect 到 `/kol/qinbafrank`。
   - lifetime 用户是否解锁 Ultra / `kol_pack_qinbafrank`。
   - `/kol` 总入口和 Serenity 扩展是否本批发布。

### Phase 1: 隔离合并

1. 从最新 `master` 创建临时 worktree 或临时分支。
2. 合并 source branch，手动解决冲突。
3. 冲突解决后先跑静态检查:
   - `git diff --check`
   - frontend `npm run lint`
   - frontend `npx tsc --noEmit`
   - backend import check
4. 解决冲突时的默认策略:
   - payment 使用 Frank 分支的 Ultra / checkout complete / fresh sync / Portal upgrade。
   - 保留 master 的 cancel fields、lifetime skip、admin dashboard pagination、research auth fail-fast。
   - `/frank-agent` 默认改成兼容 redirect，不直接删除历史入口。

### Phase 2: 本地和 preview 验证

1. Backend targeted tests:
   - `tests/test_payment_unit.py`
   - `tests/test_me_entitlements_unit.py`
   - `tests/test_webhook_entitlements_unit.py`
   - KOL gate / admin affected tests。
2. Frontend targeted tests:
   - pricing success page tests。
   - subscription context tests。
   - API tests around KOL feed filters and auth fail-fast。
3. Full frontend build:
   - 优先 `npm run build -- --webpack`，因为候选 rollout 记录当前 worktree 的默认 Turbopack build 曾被外部 symlink 触发本地 panic。
4. Preview manual flow:
   - Free -> Pro Checkout。
   - Free -> Max Checkout。
   - Free -> Ultra Checkout。
   - Pro -> Max Portal upgrade。
   - Max -> Ultra Portal upgrade。
   - Cancel at period end。
   - `/pricing/success`、`/profile`、`/kol/qinbafrank` gate 与 DB entitlements 一致。

### Phase 3: Production preflight

1. Vercel production env:
   - `NEXT_PUBLIC_ENABLE_PAYWALL=true`
   - `NEXT_PUBLIC_STRIPE_LIVE=true`
   - `NEXT_PUBLIC_API_URL` 指向 production backend `/api`。
2. Railway production env:
   - `ENVIRONMENT=production`
   - `FRONTEND_URL=https://www.themarketbrew.com` 或 canonical production frontend。
   - `STRIPE_PRO_PRICE_ID`, `STRIPE_MAX_PRICE_ID`, `STRIPE_ULTRA_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`
3. Stripe production checks:
   - Pro active monthly price is `$10`。
   - Max active monthly price is `$20`。
   - Ultra active monthly price is `$30`。
   - Production webhook exact URL: `https://stock-agent-production.up.railway.app/api/payment/webhook`。
   - Webhook events include checkout, subscription updated/deleted, entitlement summary updated。
   - Billing Portal can update existing subscriptions to Ultra with `always_invoice` proration。
4. InsForge production:
   - Reconfirm `subscriptions` schema columns.
   - Deploy/verify `subscriptions` Edge Function code supports current actions and fields.

### Phase 4: Cutover and canary

1. Merge to `master` only after CI/local gates are green.
2. Deploy order:
   - Backend first.
   - Edge Function deploy/verify.
   - Frontend second.
3. Canary after deploy:
   - Open production `/pricing` and verify Free/Pro/Max/Ultra, `$10/$20/$30`, no old early-bird copy.
   - Internal account completes smallest acceptable live checkout.
   - Verify Stripe webhook delivery succeeded.
   - Verify production DB row has expected plan/status/entitlements.
   - Verify `/pricing/success`, `/profile`, `/kol/qinbafrank` gate.
   - Refund/cancel test charge and subscription.

## Production 验收矩阵

| Area | Case | Expected | Evidence to capture |
|------|------|----------|---------------------|
| Pricing copy | 打开 `https://www.themarketbrew.com/pricing` | 显示 Free / Pro / Max / Ultra；Pro `$10/月`，Max `$20/月`，Ultra `$30/月`；不再出现 `$4.99`、`$9.99`、早鸟折扣、前 50 名 | 页面截图 + HTML/text 抽查 |
| Pricing CTA gate | `NEXT_PUBLIC_STRIPE_LIVE=true` 后点击 Pro/Max/Ultra CTA | 已登录用户进入 Stripe Checkout 或 Portal；未登录用户进入 `/login?redirect=/pricing` | 浏览器录屏或截图 + network request |
| Free -> Pro | 新/测试用户订阅 Pro | Stripe checkout 使用 Pro live price；返回 `/pricing/success`；DB `plan=pro`，entitlements 包含 Pro features | Stripe session/payment + DB row + `/payment/subscription-status?fresh=true` |
| Free -> Max | 新/测试用户订阅 Max | Stripe checkout 使用 Max live price；DB `plan=max`；entitlements 包含 Max features | Stripe session/payment + DB row + `/payment/me/entitlements?fresh=true` |
| Free -> Ultra | 新/测试用户订阅 Ultra | Stripe checkout 使用 Ultra live price；DB `plan=ultra`；entitlements 包含 `kol_pack_qinbafrank` | Stripe session/payment + DB row + `/kol/qinbafrank` access |
| Pro -> Max | Pro 用户点击 Max | 打开 Billing Portal upgrade flow，不创建第二个 active subscription；proration 行为符合 `always_invoice` | Stripe customer subscriptions list + invoice/portal event |
| Max -> Ultra | Max 用户点击 Ultra | 打开 Billing Portal upgrade flow；DB 最终 `plan=ultra`；`kol_pack_qinbafrank` 生效 | Stripe event + DB row + frontend gate |
| Duplicate purchase | 当前 plan 再次点击同级/更低级 | API 返回已包含方案或前端显示当前/已包含，不创建新 checkout | Network response + Stripe no duplicate session/sub |
| Success polling | Checkout return with `session_id` | `/payment/checkout-session/complete` 先尝试补偿同步，随后 success page 轮询 fresh endpoints 至 ready | Browser network log |
| Webhook delivery | Checkout/update/delete events | Stripe webhook endpoint 2xx；失败时 Stripe 可 retry；本地 DB 与 Stripe 最终一致 | Stripe webhook delivery log + backend log |
| Entitlement webhook | `entitlements.active_entitlement_summary.updated` | `subscriptions.entitlements` 与 Stripe feature summary 一致 | Stripe event + DB row |
| KOL gate | 非 Ultra 用户访问 `/kol/qinbafrank/*` | 子页被 Ultra paywall 拦截，根页可浏览 | 浏览器截图 |
| KOL gate | Ultra 用户访问 `/kol/qinbafrank/*` | 子页可访问，chat/stream 不返回 required_product block | 浏览器截图 + API response |
| Profile | `/profile` 订阅区 | 显示当前方案、取消状态、账单管理入口；cancel fields 正确 | 浏览器截图 + subscription-status JSON |
| Cancel at period end | Portal 取消订阅 | DB `cancel_at_period_end=true` 或 cancel fields 与 Stripe 一致；当前周期内仍可访问 | Stripe subscription + DB row + frontend |
| Immediate deleted/canceled | 取消/删除测试订阅后 | 无 active replacement subscription 时 DB `plan=free`，entitlements 清空 | Stripe subscription + DB row |
| Refund cleanup | 测试 charge refund/cancel | 测试费用已退款，测试 subscription 不会续费 | Stripe refund + subscription state |
| Legacy route | `/frank-agent` | 推荐重定向到 `/kol/qinbafrank`，不 404，不被 middleware 强制登录 | 浏览器截图 |

## Evidence Log Template

上线当天把每项证据记录到本节或单独 release note，避免凭记忆判断:

```text
Cutover date/time:
Merge commit:
Backend deploy id / timestamp:
Frontend deploy id / timestamp:
InsForge subscriptions function deploy timestamp:
Stripe readiness command result:
Pro price evidence:
Max price evidence:
Ultra price evidence:
Webhook endpoint evidence:
Billing Portal evidence:
Production /pricing screenshot:
Canary user id:
Canary Stripe customer id:
Canary subscription id:
Canary plan/status/entitlements row:
/pricing/success result:
/profile result:
/kol/qinbafrank gate result:
Refund id:
Cancel/delete confirmation:
Rollback needed? yes/no
Notes:
```

## Merge PR Checklist

- [ ] User confirmed source branch and target branch.
- [ ] User confirmed dirty qinbafrank worktree scope.
- [ ] Product decision recorded for `/frank-agent`.
- [ ] Product decision recorded for lifetime -> Ultra entitlement.
- [ ] Merge conflicts resolved according to conflict matrix.
- [ ] `.context.md` docs updated for changed router/page/data flow files.
- [ ] Backend targeted tests passed.
- [ ] Frontend targeted tests passed.
- [ ] Frontend lint, typecheck, build passed.
- [ ] Production env variables prepared in Railway/Vercel.
- [ ] Production InsForge Edge Function deploy/verify plan ready.
- [ ] Stripe production readiness passed, including separate Pro/Max price evidence.
- [ ] Production canary owner and test payment/refund plan ready.
- [ ] Rollback owner and rollback trigger thresholds agreed.

## 待确认决策记录

| Decision | Default recommendation | Why it matters |
|----------|------------------------|----------------|
| Source branch | Treat `frank-mvp` as `origin/codex/qinbafrank-creator-max` | No literal `frank-mvp` branch exists; this is the only Frank branch with pricing/payment/Ultra changes |
| Target branch | Treat production code branch as `master` | CI, Vercel, Railway, and project docs all point production deployment at `master` |
| Dirty diff scope | Exclude 128-file qinbafrank worktree dirty diff from this production merge | Dirty diff is broad typography/KOL Serenity/UI sweep; it increases regression area without changing payment core |
| `/frank-agent` | Keep a compatibility redirect to `/kol/qinbafrank` | Production currently has a public waitlist route; deleting it can break shared links and analytics attribution |
| Lifetime users | Do not automatically grant Ultra unless explicitly decided | Candidate branch currently keeps lifetime at Max; changing this affects revenue/access policy and tests |
| `/kol` index + Serenity | Ship separately unless product wants it in this cutover | Useful product expansion, but not required for price/payment/Ultra production merge |
| Stripe Portal config mutation | Prefer pre-created/verified Portal config over code auto-modifying an existing default config | Reduces risk of silently changing global Billing Portal behavior during launch |
| Preview purchases | Treat all preview live purchases as test purchases to refund/cancel | Branch DB rows do not merge to production; retaining preview purchases requires production reconcile/import |

### Phase 5: Rollback

1. If frontend copy/CTA is wrong but payment backend is healthy:
   - Hide CTA by flipping `NEXT_PUBLIC_STRIPE_LIVE=false` or rollback frontend.
2. If webhook/payment sync is wrong:
   - Keep webhook endpoint alive for retries.
   - Rollback backend.
   - Manually repair affected subscription rows; do not delete rows as rollback.
3. If Ultra entitlement leaks or blocks wrongly:
   - Disable Ultra CTA.
   - Patch entitlement gate or affected rows.
   - Re-run canary before reopening.

## 当前 Go / No-Go

当前是 **Code merge ready / Production deploy No-Go**。

已满足:

- 已按默认决策把 `frank-mvp` 视为 `origin/codex/qinbafrank-creator-max`，production 代码目标视为 `master`。
- 已在隔离 dry-run worktree 完成真实 merge conflict resolution，并迁移到真实 `master` merge state；仍未 push，也未部署 backend/frontend。
- 已排除 qinbafrank worktree 的 128 个 dirty UI/typography/KOL Serenity 改动。
- 后端 payment/KOL targeted tests、前端 targeted tests、lint、Next production build、local production page QA 均通过。
- Stripe live readiness 宽松检查通过，说明 live Ultra Price、Portal config 和至少一个 enabled required webhook 存在。
- Production `subscriptions` Edge Function 已部署并验证到当前代码。

仍阻塞 production cutover:

- Stripe webhook exact production URL 不一致：readiness 对 `https://stock-agent-production.up.railway.app/api/payment/webhook` 失败；Stripe 当前 required webhook 指向 Fly backend。必须先决定 production webhook endpoint 和对应 `STRIPE_WEBHOOK_SECRET`。
- Resolution on `2026-06-13 16:22 PDT`: deployed `backend/app/edge_functions/subscriptions.js` with `npx @insforge/cli functions deploy subscriptions --file backend/app/edge_functions/subscriptions.js --yes`。
- Deployed code verification:
  - `functions code subscriptions` contains `list_dashboard`、`get_by_customer`、`list_expired_access_grants`。
  - `curl https://9wmhxyi4.functions.insforge.app/subscriptions?action=list_expired_access_grants&now=1970-01-01T00%3A00%3A00%2B00%3A00` returned `{"success":true,"data":[]}`。
- 还没有在真实 production 完成 canary purchase / webhook delivery / DB row / refund-cancel 闭环。
- 还没有执行 push、CI、backend/frontend deploy；项目规则禁止自动 push/deploy，需用户明确确认。

## 推荐执行顺序

1. **先修 webhook gate**: 决定 Stripe production webhook 是继续 Fly 还是切 Railway；如果切 Railway，需要在 Stripe 新建/更新 enabled endpoint 并同步 `STRIPE_WEBHOOK_SECRET`。
2. **再提交/推送代码**: 当前真实 `master` merge state 已准备好；提交后不要带入 qinbafrank dirty diff 或其它未暂存用户文档改动。
3. **再等 CI/deploy**: backend -> frontend 顺序发布；Edge Function 已提前部署。
4. **最后 cutover canary**: 内部账号真实小额 checkout/portal/cancel，确认 webhook 写 production DB 后退款/取消。

## 阻塞项

- 需要修正/确认 Stripe production webhook endpoint: Fly vs Railway。
- 需要真实 production canary purchase / webhook / DB / refund-cancel 验收。
