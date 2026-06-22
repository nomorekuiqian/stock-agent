# Panda zsxq — Insforge 上线改动计划（逐步审批执行）

> 规则：**每一步在开发者明确同意后才执行**。Claude 不会未经批准对 Insforge 做任何写入/迁移。
> CLI：`insforge` v0.1.49，已登录 `F0rge1cE <xuxueyang1994@outlook.com>`，**项目当前未 link**。
> 所有步骤均可回滚；高风险步骤（S4 重部署 cron-trigger、S8 全量爬）单独标注。

## 更新（2026-06-21 设计 revisit 后）
- **存量幂等已验证**：生产库已有 748 个 `zsxq_thread` doc；本 pipeline 对 5/5 已入库 topic 的 `content_hash` 与库内一致 → 重跑/全量 backfill 对存量 **skip 不重复**（S8 实际只会新增增量 topic）。
- **S2 表结构不变**：LLM-enrich 扩展采用 **metadata 约定**（`enrichment_version`/`enrichment_status`，写进 vector metadata jsonb，不进 content、不改 content_hash），**不新增表列**。4 张运维表 SQL 维持原样。
- **已加 `limit` 参数**：`/api/zsxq/ingest?limit=N` 可做受控小批量首跑（尊重「不可大量爬」）。S8 先用小 `limit` 验证，再考虑全量。
- 检查点 = `zsxq_ingest_state`(游标) + `zsxq_thread_ledger`(逐 topic stage) + `content_hash`(skip)，与 `threads.jsonl` 无关；raw + normalized 双 archive 都留。

## 执行状态（live）
- ✅ **S0** link — 主仓已链接 `stock-agent` / `9wmhxyi4`（2026-06-21）。
- ✅ **S1** bucket — `zsxq-archive`（private）已建。
- ✅ **S2** 迁移 — 4 表已建并验证（全空，0 行）；schema 备份 `/tmp/insforge-schema-backup-20260621-183959.sql`。
- ⏳ **S3** 待批准：部署 `zsxq-ingest-store` edge function。
- ⏳ S4（⚠️ cron-trigger 重部署）/ S5 / S6 / S7 / S8（⚠️ live 爬）待批准。

## 依赖关系

```
S0 link ──┬─ S1 bucket ─────────────┐
          ├─ S2 migration(4 表) ─────┤
          ├─ S3 deploy zsxq-ingest-store ┤
          ├─ S4 redeploy cron-trigger ⚠️ │
          └─ S5 verify secrets          │
后端(Railway)部署新代码 ─ S6 注入 cookie ─┤(需 S2+后端)
                                  S7 schedule ─(需 S3/S4)
                                  S8 首次 backfill ⚠️ ─(需 S1/S2/S3/S6 + 后端)
```

注：S6/S8 需要**后端 FastAPI 新代码已部署到 Railway**（非 Insforge，用户侧）。S6/S8 通过后端端点间接写 Insforge。

---

## S0 — link 项目（本地配置写，非 Insforge 数据写）
- **命令**：`insforge link`（交互选择 org/project；项目 base url 见 CLAUDE.md `INSFORGE_BASE_URL=https://9wmhxyi4.us-east.insforge.app`）
- **影响**：仅写本地 `.insforge` 配置。不触碰 Insforge 数据。
- **验证**：`insforge current` 显示 Project 已链接。
- **回滚**：删除本地 link 配置。
- **风险**：极低。是后续所有命令的前置。

## S1 — 创建 bucket `zsxq-archive`（写）
- **命令**：`insforge storage create-bucket zsxq-archive`（私有；如需 public 由开发者决定）
- **影响**：新增一个空 bucket。对现有数据零影响。
- **验证**：`insforge storage buckets` 列表含 `zsxq-archive`。
- **回滚**：`insforge storage delete-bucket zsxq-archive`（空桶，安全）。
- **风险**：低（纯新增）。

## S2 — 迁移：建 4 张表（迁移）
- **命令**：`insforge db import backend/app/edge_functions/zsxq-ingest-store.sql`
  （或逐条 `insforge db query "<DDL>"`）
- **影响**：新增 `zsxq_credentials` / `zsxq_ingest_state` / `zsxq_ingest_runs` / `zsxq_thread_ledger`。全部 `create table if not exists`——**纯增量、幂等**，不改任何现有表。
- **验证**：`insforge db tables` 含上述 4 表（执行前先 `insforge db tables | grep zsxq` 确认当前不存在，避免误判）。
- **回滚**：`insforge db query "drop table if exists zsxq_thread_ledger, zsxq_ingest_runs, zsxq_ingest_state, zsxq_credentials cascade"`。
- **风险**：低（新增表）。建议执行前先 `insforge db export --schema-only` 备份 schema。

## S3 — 部署 edge function `zsxq-ingest-store`（写，新建）
- **命令**：`insforge functions deploy zsxq-ingest-store --file backend/app/edge_functions/zsxq-ingest-store.js --name "zsxq ingest store"`
- **影响**：**新建**一个 edge function（当前不存在）。对现有函数零影响。
- **验证**：`insforge functions list` 含该函数；`insforge functions invoke zsxq-ingest-store`（带 `X-Internal-Secret` 调一个只读 action 如 `get_state`）返回 200。
- **回滚**：`insforge functions delete zsxq-ingest-store`。
- **风险**：低（纯新增函数）。依赖 S2（表已建）才能真正读写。

## S4 — ⚠️ 重新部署 `cron-trigger`（写，更新生产派发器）
- **命令**：`insforge functions deploy cron-trigger --file backend/app/edge_functions/cron-trigger.js`
- **影响**：**更新现有生产 cron 派发器**（承载 daily_report / twitter / watchlist 等所有定时任务）。本次改动是**纯增量**（仅新增 `zsxq_panda_ingestion` 一个 JOBS 条目，未改其它 job），但部署失败会影响全部 cron。
- **执行前**：`git diff master -- backend/app/edge_functions/cron-trigger.js` 复核仅新增条目；保存当前线上版本 `insforge functions code cron-trigger > /tmp/cron-trigger.backup.js`。
- **验证**：部署后 dry-run —— 调 `cron-trigger`（`{"dry_run":true}` + `X-Internal-Secret`）确认返回的 `jobs` 列表**同时包含所有原有 job + zsxq_panda_ingestion**。
- **回滚**：`insforge functions deploy cron-trigger --file /tmp/cron-trigger.backup.js`（或 `git show master:...` 的版本）。
- **风险**：**中高**——动的是共享生产函数。务必先备份 + 部署后 dry-run 校验。

## S5 — 校验 secrets（读为主）
- **命令**：`insforge secrets list`（读）确认 `EDGE_FUNCTION_SECRET`、`ANON_KEY`、`INSFORGE_INTERNAL_URL`、`CRON_SECRET`、`BACKEND_URL` 已存在（vector-store/cron-trigger 已在用，应已配）。
- **若缺**：`insforge secrets set <K> <V>`（写，逐个审批）。
- **风险**：低。多为只读确认。

## S6 — 注入 cookie（经后端写 1 行；需后端先部署）
- **前置**：后端 FastAPI 新代码（`zsxq_ingest` 路由）已部署到 Railway。
- **命令**：`curl -X POST "$BACKEND/api/zsxq/cookie" -H "Authorization: Bearer <admin token>" -H 'Content-Type: application/json' -d '{"cookie":"<浏览器成员 cookie>","by":"<you>"}'`
- **影响**：向 `zsxq_credentials` 写/更新 1 行（status=active）。cookie 是成员凭证，存库后仅 edge function 内部读取。
- **验证**：`insforge db query "select group_id,status,updated_at from zsxq_credentials"`。
- **回滚**：`insforge db query "delete from zsxq_credentials where group_id='15554581218512'"`。
- **风险**：低（1 行）。注意凭证保密。

## S7 — 创建 Schedule（写）
- **命令**：`insforge schedules create --name zsxq_panda_ingestion --cron "0 18 * * *" --method POST --url "<cron-trigger fn url>?job=zsxq_panda_ingestion" --headers '{"X-Internal-Secret":"<secret>"}'`
  （cron 时区/点位由开发者定；示例每日 18:00）
- **影响**：新增一条每日定时，触发 cron-trigger 的 zsxq job。
- **验证**：`insforge schedules list` 含该条；可手动 `insforge schedules logs <id>` 看首次执行。
- **回滚**：`insforge schedules delete <id>`。
- **风险**：低（新增）。建议 S8 手动验证通过后再建，避免定时在未验证前自动跑。

## S8 — ⚠️ 首次 backfill（live 全量爬，最大写）
- **命令**：`curl -X POST "$BACKEND/api/zsxq/ingest?full=true" -H "X-Cron-Secret: <secret>"` → 立即返回 `accepted+run_id`，后台异步跑。
- **影响**：**真实全量爬取** panda 全部 topic（约 748）+ 评论 + 二进制 → 写 bucket + 4 表 + `vector_documents`/`vector_chunks`（embedding）。
- **⚠️ 与「cookie 仅测试、不可大量/高频」冲突**：全量 backfill 属于**大量爬取**。需开发者**单独明确批准**用于正式 backfill 的 cookie/时机；或先用受控小批量（注：当前 `/ingest` 无 limit 参数，受控小批量需加一个 `limit` 参数的小改动——可作为前置 follow-up）。
- **监控**：`GET /api/zsxq/runs/{run_id}` 跟踪到 done/degraded；`insforge db query "select stage_indexed,count(*) from zsxq_thread_ledger group by 1"`。
- **部署期校验**：首个 `put_object` 后确认 storage SDK 真返回 `{url,key}`（Appendix A 未决项）；若 shape 不同，改 `zsxq-ingest-store.js` 的 `put_object` 映射后重部署 S3。
- **回滚**：按 `(source_type=zsxq_thread, source_id)` 删 `vector_documents`（`delete_vector_source`）；清 `zsxq_thread_ledger`/`zsxq_ingest_runs`；bucket 对象按 key 删。
- **风险**：**高**（大量真实爬 + 大量写 + 反爬风险）。强烈建议先加 `limit` 小批量验证，再全量。

---

## 建议执行顺序（每步等批准）
S0 → S1 → S2 → S3 → S4(⚠️备份+dry-run) → S5 → [后端部署] → S6 → S8(⚠️先小批量) → 验证检索 → S7(定时).

## 前置 follow-up（建议先做，非 Insforge 写）
- 给 `/api/zsxq/ingest` 加 `limit` 参数，使 S8 能先受控小批量验证（尊重「不可大量爬」）。
- 确认后端 Railway 已部署本分支代码（S6/S8 依赖）。
