# 线上基线存档（2026-10-17）

restart-2026q4 第 0.1 步的证据：记录重启开始时线上**实际在跑**的东西，供以后对照「git 是否仍等于线上」。只做了只读导出，没有修改任何线上配置。

## 代码（已收回 git，分支 `restart/prod-baseline`）

| 部分 | 线上版本 | git commit | 核对结果 |
|---|---|---|---|
| 后端（Railway） | 部署 `333381af-e501-440f-a698-30832fc4cb27`（2026-10-13） | `e69b155` | 489/489 个文件 SHA-256 一致 |
| 前端（Vercel） | `dpl_vDYUPisf1WmJD9Q7PBMTByXSYw4j`（2026-09-22） | `50651cb` | 416/416 一致 |
| Edge Functions（Insforge） | 37 个 active 函数，见 `edge-functions.json` | `6d82edd` | 37/37 逐字节一致 |

快照来源是 `.codex/artifacts/` 下 `railway-memory-2026-10-13` 和 `persona-chat-2026-09-22` 两次发布的源码与清单。该目录已被 git 忽略，只保存在本机。

## 定时任务（`schedules.json`）

共 17 个，13 个启用、4 个停用，与 9 月审计一致。全部发往 `cron-trigger`，请求头只引用 `${{secrets.EDGE_FUNCTION_SECRET}}`，不含明文。

- **启用（13）**：盘前早报、市场日报、专属日报、KOL 推文抓取（每小时）、KOL 列表同步、推特日报生成与发送、宏观缓存 T1/T2/T3、选股池刷新、宏观周报、付费赠送到期回收
- **停用（4）**：Onboarding Drip、Watchlist Monitor Paid Universe、zsxq Panda Ingestion、KOL Tweet Embeddings

## 数据库结构（`schema.sql`）

`npx -y @insforge/cli db export --no-data --include-functions --include-views --include-sequences` 的结果：48 张表、38 个函数，只有结构，没有数据行（文件里的 4 处 `INSERT` 都在函数定义内）。注意：这个 CLI 的 `--output` 会把 SQL 包在 `{"format","data"}` JSON 外壳里，需要取出 `data` 字段才是真正的 SQL。

## 重新核对的方法

- Edge Functions：`npx -y @insforge/cli functions code <slug> --json`，与 `backend/app/edge_functions/<slug>.js` 比较
- 定时任务：`npx -y @insforge/cli schedules list --json`
- 数据库结构：用同一条命令再导一次，与本文件 diff
