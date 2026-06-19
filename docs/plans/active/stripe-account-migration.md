# Stripe Account Migration Engineering Plan

> Status: In Progress
> Related: `backend/app/features/payment/.context.md`, `backend/app/core/.context.md`
> Last checked: 2026-06-18 15:58 America/Los_Angeles

## 目标

把生产订阅从旧 Stripe 账号迁移到新 Stripe 账号，同时避免重复扣款、权限丢失、Portal 无法打开、过期 CSV 上传和密钥泄漏。

## 当前状态与临时文件

迁移 artifact 只允许放在本地 `backend/tmp/stripe-account-migration/`，不提交到
repo。当前本地 `backend/tmp/` 已清理，继续操作前必须重新跑 status/prepare 脚本生成
新的 JSON/CSV，不要依赖旧文件名。

清理前最后一次只读状态摘要：

- `phase=awaiting_pan_copy`
- `ready_for_toolkit_upload=false`
- 本地 `subscriptions?action=list_all` 返回 1470 行
- 45 个 active/trialing Stripe billing subscription 仍属于旧账号且需要迁移
- 20 个目标账号 customer 已有默认付款方式
- 25 个目标账号 customer 缺付款方式
- 0 个目标账号 customer 需要手工选择默认付款方式
- 0 个目标账号 subscription metadata mapping 已发现
- 0 个目标账号 Billing toolkit subscription schedule mapping 已发现
- 1 个旧账号 active subscription 已设置 `cancel_at_period_end=true`，这是 warning，不是当前 hard failure

当前唯一 hard blocker 是目标 Stripe 账号里还有 25 个 customer 没有付款方式。Stripe-to-Stripe 迁移必须先做 PAN copy，再上传 Billing migration toolkit CSV。

## 安全边界

- 不要在代码、文档、日志、提交信息里写 Stripe secret key。
- 不要提前取消旧账号订阅；只有新账号订阅 active/trialing、Insforge reconcile 成功后，才能对旧账号执行周期末取消。
- 不要复用旧的 toolkit CSV。live `start_date` 必须在上传时至少 24 小时后；PAN copy 完成后必须重新导出。
- 不要手写本地 `subscriptions` 表迁移结果；使用 reconcile 脚本回写。
- 不要用当前开发/test `STRIPE_SECRET_KEY` 当作 live 迁移目标 key；迁移脚本应使用 `STRIPE_MIGRATION_SOURCE_SECRET_KEY` 和 `STRIPE_MIGRATION_DESTINATION_SECRET_KEY`。

## 官方依据

- Stripe PAN copy: https://docs.stripe.com/get-started/data-migrations/pan-copy-self-serve?copy-method=partial-csv-upload
- Stripe Billing migration toolkit: https://docs.stripe.com/billing/subscriptions/import-subscriptions-toolkit
- Stripe toolkit live CSV 的 `start_date` 要至少 24 小时后；toolkit 使用 subscription schedules，scheduled subscription 在 go-live 前有 24 小时缓冲，并且 Dashboard rollback window 是 10 小时。

## 操作流程

### 1. 配置迁移环境变量

在 `backend/` 下操作。密钥值来自本地 `backend/.env`，只在 shell session 里导出，不提交：

```bash
cd backend
source venv/bin/activate
export STRIPE_MIGRATION_SOURCE_SECRET_KEY="..."
export STRIPE_MIGRATION_DESTINATION_SECRET_KEY="..."
export STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID="price_1ThaTYGqICfmoUfq1evHZWOp"
export STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID="price_1ThaTZGqICfmoUfqMaDiAiX1"
```

### 2. 每次操作前先跑总览

```bash
python scripts/status_stripe_account_migration.py \
  --customer-map tmp/stripe-account-migration/customer-map.csv
```

默认会分页扫描最多 500 个目标账号 subscription / subscription schedule；如果目标账号对象更多，可加 `--discover-limit <n>` 提高上限。

报告顶层 `next_action` 是操作入口：它会给出当前 action、reason、commands、operator_steps、do_not，以及当前可用 artifact（例如最新 PAN copy Dashboard CSV）。Dashboard 操作后优先重新跑 status，并按 `next_action.action` 继续。

只允许根据 `phase` 决定下一步：

- `awaiting_pan_copy`: 先做 PAN copy。
- `needs_default_payment_method`: 跑 prepare 脚本并只在安全候选唯一时 `--apply-defaults`。
- `ready_for_billing_toolkit`: 重新导出 toolkit CSV 并上传。
- `post_import_scheduled`: toolkit 已创建 subscription schedules，等待 go-live 后再 reconcile。
- `post_import_reconcile_ready`: 进入 reconcile。

### 3. PAN copy 阶段

重新生成当前缺付款方式的 customer 清单：

```bash
python scripts/prepare_stripe_account_migration_customers.py \
  --customer-map tmp/stripe-account-migration/customer-map.csv
```

把最新的 `pan-copy-remaining-customer-ids-dashboard-*.csv` 上传到 Stripe Dashboard 的 PAN copy partial CSV upload。上传完成后重复第 2 步，直到：

- `payment_risks.missing_destination_payment_method=0`
- `payment_risks.needs_default_payment_method=0`
- `preflight_ok=true`
- `phase=ready_for_billing_toolkit`

### 4. Billing toolkit 阶段

PAN copy 完成后重新导出，不要复用旧 CSV：

```bash
python scripts/export_stripe_account_migration.py \
  --customer-map tmp/stripe-account-migration/customer-map.csv \
  --include-cancel-scheduled
```

把最新 `toolkit-*.csv` 上传到 Stripe Dashboard Billing migration toolkit。上传后核对 Dashboard summary：

- subscription 数量应等于 export 的 `exported_rows`
- customer 数量应等于 active candidate 覆盖数
- 第一条 go-live/start date 应在上传时间至少 24 小时后
- 金额和币种应与 report 中的历史价格一致

如果 Dashboard validation 报错，取消本次 migration，修正后重新导出并上传。

### 5. Post-import scheduled 阶段

Billing toolkit 上传并开始 migration 后，Stripe 会先创建 subscription schedules。live migration 中 scheduled subscriptions 会在 go-live 前保持 scheduled 状态，此时还不能把本地 `subscriptions` 回写成新 subscription id。

可用下面命令观察排期结果：

```bash
python scripts/reconcile_stripe_account_migration.py \
  --discover-schedules \
  --output tmp/stripe-account-migration/discovered-schedules-latest.csv
```

`--discover-schedules` 默认同样最多分页扫描 500 个 schedule；必要时加 `--discover-limit <n>`。

如果 `status` 显示 `phase=post_import_scheduled`，等待 go-live。不要在这个阶段 cancel 旧账号 subscription，也不要手写本地 DB。如果所有 discovered schedules 都已经带 `new_stripe_subscription_id`，`status` 会切到 `phase=post_import_reconcile_ready`，并允许用 `discovered-schedules-latest.csv` 作为 dry-run reconcile 的 mapping 输入。`--strict-metadata` 会回查 Stripe subscription schedule，确认 schedule metadata、new subscription id、user_id 与 mapping 一致。

### 6. Post-import reconcile 阶段

等目标账号 subscription 已 active/trialing，或 `status` 报 `post_import_reconcile_ready` 后，生成 mapping：

```bash
python scripts/reconcile_stripe_account_migration.py \
  --discover-mapping \
  --output tmp/stripe-account-migration/discovered-mapping-latest.csv
```

`--discover-mapping` 默认最多分页扫描 500 个 subscription；必要时加 `--discover-limit <n>`。

先 dry-run reconcile：

```bash
python scripts/reconcile_stripe_account_migration.py \
  --mapping tmp/stripe-account-migration/discovered-mapping-latest.csv \
  --strict-metadata \
  --verify-portal
```

dry-run 全部通过后再 apply，并在本地回写成功后设置旧账号周期末取消：

```bash
python scripts/reconcile_stripe_account_migration.py \
  --mapping tmp/stripe-account-migration/discovered-mapping-latest.csv \
  --strict-metadata \
  --verify-portal \
  --apply \
  --cancel-source-at-period-end
```

### 7. 完成判定

只有同时满足以下条件，迁移才算完成：

- `status_stripe_account_migration.py` 不再报告旧账号 active candidate 需要迁移。
- 45 个目标新订阅已 active/trialing，且 metadata 能映射回旧订阅。
- Insforge `subscriptions` 已回写新 `stripe_customer_id` / `stripe_subscription_id`，旧 id 保留在 legacy 字段。
- Profile/Billing Portal 使用新账号 customer/subscription 能打开。
- 旧账号对应 subscription 已设置周期末取消，避免下一周期双重扣款。
- 相关 backend tests 通过。

## 待定问题

- PAN copy 必须在 Stripe Dashboard 完成，当前 CLI 只能生成 partial CSV 和验证结果。
- Billing toolkit 上传/开始 migration 也必须在 Stripe Dashboard 完成。
- 如果 PAN copy 后仍有 customer 没有默认付款方式，需要根据 `manual-default-payment-method-required-*.csv` 做人工判断，不能由脚本猜测。
