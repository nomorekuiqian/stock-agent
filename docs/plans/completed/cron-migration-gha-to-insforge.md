# Cron 迁移：GitHub Actions -> Insforge Schedules

**Status:** Completed
**Owner:** kedengpan
**Created:** 2026-06-02
**Completed:** 2026-06-06
**Scope:** 所有仍在 `.github/workflows` 上的生产 `schedule` cron

## 目标

把生产定时任务从 GitHub Actions 迁到 Insforge Schedules。已迁移的
GitHub cron workflow 文件删除；实际调度统一由 Insforge 触发
`cron-trigger` edge function，再由代理转发到 Railway backend。

## 迁移清单

| GitHub workflow | Insforge schedule | Schedule ID | Cron UTC | Proxy job | 状态 |
|---|---|---|---|---|---|
| `daily-report.yml` | `Cron - Daily Market Report` | `4df141ee-d090-4292-a784-f49feeef34a0` | `0 22 * * 1-5` | `daily_report` | active |
| `daily-digest.yml` | `Cron - Daily Personal Digest` | `8658badd-6537-44ac-bebb-4aa45352af78` | `30 22 * * 1-5` | `daily_digest` | active |
| `weekly-report.yml` | `Cron - Weekly Macro Report` | `cca2235d-05b1-43e7-aa8d-4032519d418b` | `0 17 * * 0` | `weekly_report` | active |
| `onboarding-drip.yml` | `Cron - Onboarding Drip` | `29f09615-aacd-4d3b-a31c-8d8bbae2df07` | `0 23 * * *` | `onboarding_drip` | legacy no-op |
| `screener-universe-refresh.yml` | `Cron - Screener Universe Refresh` | `f236991b-6678-46eb-a24a-1e7b1a7d8a07` | `0 23 * * 1-5` | `screener_universe_refresh` | active |
| `macro-cache-refresh.yml` T1 | `Cron - Macro Cache Tier 1` | `9412e60d-a9d5-4687-81bb-9d82cf179851` | `0 1,5,9,13,17 * * *` | `macro_cache_t1` | active |
| `macro-cache-refresh.yml` T2 | `Cron - Macro Cache Tier 2` | `243b7721-e77f-4ba4-a0c6-7730f5475703` | `0 2,14 * * *` | `macro_cache_t2` | active |
| `macro-cache-refresh.yml` T3 | `Cron - Macro Cache Tier 3` | `f6f023f6-9a94-4421-a4fa-afdd9bd3efa7` | `0 3 * * *` | `macro_cache_t3` | active |
| `kol-list-sync.yml` | `Cron - KOL List Sync` | `7aa01b1d-54a6-4b7d-9004-192af0e008b5` | `0 20 * * *` | `kol_list_sync` | active |
| `kol-tweets-fetch.yml` | `Cron - KOL Tweets Ingestion` | `694a6eb6-3f20-43e8-83f9-197aefcdbe85` | `0 * * * *` | `kol_tweets_ingestion` | active |
| `twitter-digest-generate.yml` | `Cron - Twitter Digest Generate` | `58df517a-89e6-4b0f-90a5-1929c1d8fbd9` | `30 20 * * 1-5` | `twitter_digest_generate` | active |
| `twitter-digest-broadcast.yml` | `Cron - Twitter Digest Broadcast` | `49ee46f5-2300-40f6-8a63-6dd5d1af13be` | `15 22 * * 1-5` | `twitter_digest_broadcast` | active |
| N/A | `Cron - Payment Reconcile Expired Grants` | `bdd60d1a-0db1-4b28-ac99-9df97fe27e57` | `10 8 * * *` | `payment_reconcile_expired_grants` | active |
| N/A | `Cron - Watchlist Monitor Test Universe` | `5f192434-7416-4481-9b52-594f61a4f7ba` | `30 23 * * 1-5` | `watchlist_monitor_test_universe` | inactive until backend endpoint deploy |

## 额外直连 Schedule

以下 schedule 不经过 `cron-trigger`,直接调用 Railway backend:

| Insforge schedule | Schedule ID | Cron UTC | Target | 状态 |
|---|---|---|---|---|
| `KOL Tweet Embeddings - Frank + Serenity` | `e07d6f04-c5fc-4206-9d44-489cf97ff16a` | `15 5,11,17,23 * * *` | `POST /api/vector/index-kol-tweets` with `author_usernames=["qinbafrank","aleabitoreddit"]` | active |

2026-06-09: embedding schedule 从每天一次 `15 23 * * *`
扩为每天四次,并从 Frank-only 改为 Frank + Serenity (`aleabitoreddit`)。
它只写 `vector_documents` / `vector_chunks`; KOL tweet 拉取和 enrichment 仍由
`Cron - KOL Tweets Ingestion` 负责。

2026-06-13: 晚间邮件错峰为 `daily_report` 18:00 ET (`0 22 * * 1-5`),
`twitter_digest_broadcast` 18:15 ET (`15 22 * * 1-5`), `daily_digest`
18:30 ET (`30 22 * * 1-5`)。避免 pg_cron 精确触发时同分钟撞 Resend
限流，同时改善用户连续收到多封晚报的体验。

2026-06-16: 新增 `Cron - Payment Reconcile Expired Grants`
(`10 8 * * *` UTC)，经 `cron-trigger` 调
`payment_reconcile_expired_grants`，每日清理已过期的非 Stripe grant
展示状态和 Resend segment。创建后已手动真实触发一次，返回
`success=true, expired=0, skipped=289`。

2026-06-17: 新增 `Cron - Watchlist Monitor Test Universe`
(`30 23 * * 1-5` UTC)，经 `cron-trigger` 调
`watchlist_monitor_test_universe`。该任务只跑 Voya
(`fa726347-f49a-4fee-973e-a3b69fdcbdd4`) 和 owner
(`d00a6201-646a-489f-95a2-aff8f90fe669`) 两个测试账号 watchlist 的
去重并集，并受 feature flag `watchlist_monitor_test_universe` 控制；
两个 user_id 已在生产 `feature_flags` 表开通该 flag。当前 dry-run
universe 为 14 个 ticker。Schedule 已创建但保持 `isActive=false`，
因为 Railway backend 需要先部署
`/api/admin/watchlist-monitor/generate-test-universe` 后才能真实触发。
激活命令：
`npx @insforge/cli schedules update 5f192434-7416-4481-9b52-594f61a4f7ba --active true`。

2026-06-06: onboarding drip 邮件已删除。`onboarding_drip` schedule 如果继续触发，
只会经 `cron-trigger` 调用 legacy backend endpoint 并返回 `disabled=true`，不会发送邮件。

## Proxy

新增 edge function:

- `backend/app/edge_functions/cron-trigger.js`
- Deployed slug: `cron-trigger`
- Schedule URL: `https://9wmhxyi4.us-east.insforge.app/functions/cron-trigger`
- Schedule headers:
  `{"X-Internal-Secret":"${{secrets.EDGE_FUNCTION_SECRET}}","Content-Type":"application/json"}`
- Schedule body: `{"job":"<proxy job>"}`

代理职责:

1. 用 `EDGE_FUNCTION_SECRET` 校验 schedule -> proxy。
2. 用 `CRON_SECRET` 转发 proxy -> Railway backend。
3. 保留 GitHub Actions 中原来的关键响应校验，例如 `sent=0`、`failed>2`、
   `broadcast_result` 缺失等。
4. 支持 `{"dry_run": true}` 只校验 registry、secret 和目标 URL，不转发后端。
5. 用完整后端响应做校验，但只把 `body_summary` 返回给 schedule logs，避免日志写入完整报告内容。

Insforge 已配置 `BACKEND_URL=https://stock-agent-production.up.railway.app`。
代码仍保留同值 fallback，避免 secret 被误删时 proxy 直接失效。

## 验证记录

2026-06-06 完成以下验证，均未主动调用生产业务 endpoint:

- `origin/master` 的 `.github/workflows` 仅剩 `ci.yml`。
- `origin/master` 上 `rg "^  schedule:|cron:" .github/workflows` 无结果。
- `npx @insforge/cli schedules list --json` 核对 12 条迁移 schedule:
  URL、method、headers、body job、cron 全匹配，且全部 `isActive=true`。
- `cron-trigger` 全局 dry-run 返回:
  `has_edge_function_secret=true`、`has_cron_secret=true`、
  `backend_url_configured=true`、`job_count=12`。
- 12 个 job 逐个 dry-run 成功；`kol_tweets_ingestion` 正确展开为
  `fetch_configured_kols` + `enrich_recent_tweets` 两步。
- GitHub scheduled cron 删除变更已 push 到 `master` 后，才激活 Insforge schedules，避免双跑。

2026-06-17 watchlist monitor test universe 验证：

- 本地 FastAPI dry-run 成功，两个测试账号 watchlist 合并为 14 个 ticker。
- 生产 `feature_flags` 已写入 `watchlist_monitor_test_universe` 两行：
  Voya (`fa726347-f49a-4fee-973e-a3b69fdcbdd4`) 和 owner
  (`d00a6201-646a-489f-95a2-aff8f90fe669`)。
- `cron-trigger` 已 deploy，`watchlist_monitor_test_universe` dry-run 返回
  `has_edge_function_secret=true`、`has_cron_secret=true`，目标 URL 为
  `https://stock-agent-production.up.railway.app/api/admin/watchlist-monitor/generate-test-universe`。
- Insforge schedule 已创建并确认 `isActive=false`，等待后端部署后激活。

## 回滚

单个 schedule 异常时:

1. `npx @insforge/cli schedules update <id> --active false`
2. 如需回滚到 GitHub，重新添加对应 workflow 文件及原 cron。
3. push 到 `master`。
4. 排障 `cron-trigger` logs 和 backend logs 后再重开 schedule。
