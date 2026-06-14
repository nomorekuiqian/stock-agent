# Max 老用户升级为 Ultra 迁移计划

日期：2026-06-13
状态：代码保护已实现并通过单测；生产 DB 迁移需在后端部署后执行

## 目标

把现有 Max 用户在 app DB 里升级为 Ultra，让他们继续交当前 Stripe Max 价格，但获得 Ultra benefits。用户取消或订阅结束后，Ultra benefits 跟随订阅一起消失。

## 最终方案

不改 Stripe price，不创建 Legacy Ultra price，不新增 entitlement override 字段。

迁移方式：

- 生产 DB 中目标老用户写成 `plan="ultra"`。
- `entitlements` 写成完整 `ULTRA_FEATURES`，包括 `kol_pack_qinbafrank`。
- Stripe 订阅继续保持原 Max price。
- 后端同步逻辑保护：如果本地 row 已经是 active/trialing Ultra，Stripe 仍是 active/trialing，即使 Stripe price/entitlements 仍报告 Max，也不把本地降级回 Max。
- 如果 Stripe 订阅变成 canceled/deleted/非 active，仍正常写成 Free 并清空 `entitlements`。

这样满足：

- 老用户在应用内就是 Ultra。
- 老用户继续付原 Max 价格。
- 用户打开页面触发 `fresh=true` 不会被刷回 Max。
- Stripe `customer.subscription.updated` / `entitlements.active_entitlement_summary.updated` 不会把 active 老 Ultra 刷回 Max。
- Stripe `customer.subscription.deleted` 仍会清空权益。

## 当前生产快照

2026-06-13 只读查询结果：

| 分组 | 数量 | 迁移处理 |
|---|---:|---|
| Active Max，有 Stripe subscription，且没有 `access_expires_at` | 41 | 升级为 Ultra |
| Active Max，有 Stripe subscription，但仍带 `access_expires_at` | 17 | 升级为 Ultra，并清掉脏 `access_expires_at` |
| Lifetime Max | 5 | 升级为 Ultra |
| 非 Stripe Max grant，`access_expires_at` 仍在未来 | 7 | 临时升级为 Ultra，保留原过期时间 |
| 非 Stripe Max grant，`access_expires_at` 已过期 | 3 | 清理成 Free/expired，不升级 |

应升级为 Ultra 体验的当前账号总数：**70 个**。

## 已完成代码改动

后端保护逻辑：

- `backend/app/features/payment/entitlements.py`
  - Lifetime 用户现在返回 `MAX_FEATURES ∪ subscriptions.entitlements`。
  - 因此 lifetime row 里写入 `kol_pack_qinbafrank` 后，后端 gate 会放行。

- `backend/app/features/payment/service.py`
  - `sync_subscription_from_stripe()` 增加保护：本地 active/trialing Ultra + Stripe active/trialing 时，不降级回 Max。
  - `sync_entitlements_from_stripe()` 增加同样保护。
  - Stripe 非 active / 空 active entitlement 仍会正常 deprovision。

测试：

```bash
backend/venv/bin/python -m pytest \
  backend/tests/test_payment_unit.py \
  backend/tests/test_entitlements_unit.py \
  backend/tests/test_me_entitlements_unit.py \
  backend/tests/test_kol_research_quota.py \
  -q
```

结果：`81 passed, 6 warnings`。

## 生产迁移顺序

必须先部署后端代码，再执行生产 DB 迁移。

原因：生产旧代码仍会在 `fresh=true` 或 webhook sync 时按 Stripe Max 结果覆盖本地 DB。如果先改 DB、后部署代码，用户打开页面就可能被刷回 Max。

安全顺序：

1. 部署后端代码。
2. 创建生产 DB rollback snapshot。
3. 把目标 Max rows 升级为 Ultra。
4. 清理 expired grant。
5. 验证聚合结果。
6. 抽样验证 `/payment/me/entitlements?fresh=true` 不会降级。

## 生产 SQL

### 1. Rollback snapshot

```sql
create table if not exists public.subscription_migration_snapshots (
  migration_key text not null,
  captured_at timestamptz not null default now(),
  user_id uuid not null,
  row_data jsonb not null,
  primary key (migration_key, user_id)
);

insert into public.subscription_migration_snapshots
  (migration_key, user_id, row_data)
select
  '2026-06-13-max-to-ultra-db-migration',
  user_id,
  to_jsonb(subscriptions.*)
from public.subscriptions
where plan = 'max'
  and status in ('active', 'trialing')
  and (
    coalesce(is_lifetime, false) = true
    or stripe_subscription_id is not null
    or (
      stripe_subscription_id is null
      and access_expires_at is not null
      and access_expires_at > now()
    )
  )
on conflict do nothing;
```

### 2. 升级目标用户为 Ultra

```sql
update public.subscriptions
set
  plan = 'ultra',
  status = 'active',
  entitlements = '[
    "morning_report_email",
    "weekly_report_email",
    "personal_digest_email",
    "watchlist_extended",
    "today_website",
    "for_you_website",
    "morning_website",
    "stock_research",
    "ai_research_engine",
    "portfolio_management",
    "twitter_digest",
    "kol_pack_qinbafrank"
  ]'::jsonb,
  access_expires_at = case
    when stripe_subscription_id is not null or coalesce(is_lifetime, false)
      then null
    else access_expires_at
  end,
  updated_at = now()
where plan = 'max'
  and status in ('active', 'trialing')
  and (
    coalesce(is_lifetime, false) = true
    or stripe_subscription_id is not null
    or (
      stripe_subscription_id is null
      and access_expires_at is not null
      and access_expires_at > now()
    )
  );
```

### 3. 清理已过期非 Stripe Max grant

```sql
update public.subscriptions
set
  plan = 'free',
  status = 'expired',
  entitlements = '[]'::jsonb,
  updated_at = now()
where plan = 'max'
  and status in ('active', 'trialing')
  and coalesce(is_lifetime, false) = false
  and stripe_subscription_id is null
  and access_expires_at is not null
  and access_expires_at <= now();
```

## 验证 SQL

```sql
select
  plan,
  status,
  coalesce(is_lifetime, false) as is_lifetime,
  count(*)::int as users,
  count(*) filter (
    where coalesce(entitlements, '[]'::jsonb) ? 'kol_pack_qinbafrank'
  )::int as has_qinbafrank
from public.subscriptions
where plan in ('max', 'ultra')
group by plan, status, coalesce(is_lifetime, false)
order by plan, status, is_lifetime;
```

预期：

- 原 70 个目标账号进入 `plan=ultra` 并有 `kol_pack_qinbafrank`。
- 已过期的 3 个非 Stripe Max grant 进入 Free/expired。
- `plan=max/status=active` 的老目标用户应为 0。

## 回滚

Stripe 用户不要只靠 SQL 回滚业务逻辑；不过本次不改 Stripe price，所以 DB 回滚可直接从 snapshot 恢复目标 row。

```sql
update public.subscriptions s
set
  plan = snapshot.row_data->>'plan',
  status = snapshot.row_data->>'status',
  entitlements = coalesce(snapshot.row_data->'entitlements', '[]'::jsonb),
  access_expires_at = nullif(snapshot.row_data->>'access_expires_at', '')::timestamptz,
  updated_at = now()
from public.subscription_migration_snapshots snapshot
where snapshot.migration_key = '2026-06-13-max-to-ultra-db-migration'
  and snapshot.user_id = s.user_id;
```
