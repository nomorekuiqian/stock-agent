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
| `daily-digest.yml` | `Cron - Daily Personal Digest` | `8658badd-6537-44ac-bebb-4aa45352af78` | `15 22 * * 1-5` | `daily_digest` | active |
| `weekly-report.yml` | `Cron - Weekly Macro Report` | `cca2235d-05b1-43e7-aa8d-4032519d418b` | `0 17 * * 0` | `weekly_report` | active |
| `onboarding-drip.yml` | `Cron - Onboarding Drip` | `29f09615-aacd-4d3b-a31c-8d8bbae2df07` | `0 23 * * *` | `onboarding_drip` | legacy no-op |
| `screener-universe-refresh.yml` | `Cron - Screener Universe Refresh` | `f236991b-6678-46eb-a24a-1e7b1a7d8a07` | `0 23 * * 1-5` | `screener_universe_refresh` | active |
| `macro-cache-refresh.yml` T1 | `Cron - Macro Cache Tier 1` | `9412e60d-a9d5-4687-81bb-9d82cf179851` | `0 1,5,9,13,17 * * *` | `macro_cache_t1` | active |
| `macro-cache-refresh.yml` T2 | `Cron - Macro Cache Tier 2` | `243b7721-e77f-4ba4-a0c6-7730f5475703` | `0 2,14 * * *` | `macro_cache_t2` | active |
| `macro-cache-refresh.yml` T3 | `Cron - Macro Cache Tier 3` | `f6f023f6-9a94-4421-a4fa-afdd9bd3efa7` | `0 3 * * *` | `macro_cache_t3` | active |
| `kol-list-sync.yml` | `Cron - KOL List Sync` | `7aa01b1d-54a6-4b7d-9004-192af0e008b5` | `0 20 * * *` | `kol_list_sync` | active |
| `kol-tweets-fetch.yml` | `Cron - KOL Tweets Ingestion` | `694a6eb6-3f20-43e8-83f9-197aefcdbe85` | `0 * * * *` | `kol_tweets_ingestion` | active |
| `twitter-digest-generate.yml` | `Cron - Twitter Digest Generate` | `58df517a-89e6-4b0f-90a5-1929c1d8fbd9` | `30 20 * * 1-5` | `twitter_digest_generate` | active |
| `twitter-digest-broadcast.yml` | `Cron - Twitter Digest Broadcast` | `49ee46f5-2300-40f6-8a63-6dd5d1af13be` | `2 22 * * 1-5` | `twitter_digest_broadcast` | active |

`twitter_digest_broadcast` 从原 `0 22 * * 1-5` 调整到 `2 22 * * 1-5`，
避免 pg_cron 精确触发时与 `daily_report` 同分钟撞 Resend 限流。GitHub
Actions 时代的调度抖动会天然错开，迁到 Insforge 后需要显式错峰。

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

## 回滚

单个 schedule 异常时:

1. `npx @insforge/cli schedules update <id> --active false`
2. 如需回滚到 GitHub，重新添加对应 workflow 文件及原 cron。
3. push 到 `master`。
4. 排障 `cron-trigger` logs 和 backend logs 后再重开 schedule。
