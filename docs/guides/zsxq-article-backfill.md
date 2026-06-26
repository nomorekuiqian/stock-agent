# zsxq 文章正文回填 (article backfill) Runbook

修复「知识星球长文 article 帖只入库了截断预览（~600 字，以 `…` 结尾），而非完整正文」的历史数据。日后若发现某批 article 帖只有预览，按本手册回填。

> 代码：`backend/app/features/zsxq_ingest/{crawl.py,service.py,router.py}`、`docs/plans/active/panda-zsxq-insforge-rollout.md`。模块说明见同目录 `.context.md`。

## 1. 背景 / 何时用

知识星球的长文存为独立 **article**：timeline / 列表 API 返回的 `talk.text` 只是**截断预览**（结尾 `…`），完整正文在 `talk.article.{inline_article_url,article_url}`（`articles.zsxq.com`，需会员 cookie）。

- **2026-06-26 (#88) 之前**：爬虫只入库 `talk.text` 预览 → 长文丢失约 95% 正文。
- **#88 起**：爬虫在采集时自动 `fetch_article_text` 拉全文（going-forward 已修）。
- **本回填**：修 #88 之前已入库的截断 article（一次性历史修复）。

## 2. 原理（务必理解，否则会产生重复 doc）

向量库 `vector_documents` 的唯一键是 **`(source_type, source_id, content_hash)`**（见 `app/edge_functions/vector-store.js` 的 `upsert_document` onConflict）。所以同一 `source_id` 用**新的全文**重新 index → content_hash 变 → **新增一条 doc**（而非替换）→ 与旧的截断 doc **重复**。

因此回填必须 **删旧 + force 重建**（`_backfill_one_topic`）：
1. `delete_vector_source("zsxq_thread", source_id)` 删旧 doc（chunks 级联删除）。
2. `index_prepared(p, force=True)` 入全文。
3. **删除只在全文备好后才发生** —— 拉取失败则保留旧 doc，绝不留空。

## 3. 两种模式（选对来源）

| 模式 | 来源 | 覆盖 | 何时用 |
|---|---|---|---|
| **archive**（默认，无 body）| bucket `topics/` + `raw/` 归档 | 仅 **被 service 爬取并归档**的帖 | 修近期 service-crawl 的截断帖 |
| **by-ids**（body `{"source_ids":[...]}`）| 按 id 调 `GET /topics/{id}` | **任意** indexed 帖（含从本地导入、从未归档的）| 修历史 bulk（**主力**）|

> 经验：历史 bulk（最初本地导入的 ~744 条）**没有 bucket 归档** → 必须用 **by-ids**。archive 模式只够修少量近期帖。

## 4. 前置条件

- `#88`（article 抓取）+ `#91`（archive 回填）+ `#93`（by-ids + `raw/` 扫描）已部署到 Railway。
- `/api/zsxq/backfill` 路由存在（无 auth POST 返回 401，非 404）。
- cookie `active`（`zsxq_credentials.status`）。失效会 `auth_failed`，先 `POST /api/zsxq/cookie` 刷新。
- 取数用的密钥：`CRON_SECRET`（打 backend 端点，经 `railway run` 注入）、`EDGE_FUNCTION_SECRET`（直连 edge fn 查询/验证，`npx @insforge/cli secrets get`）。

## 5. 步骤

所有命令在主仓 `/Users/.../stock-agent`（`insforge` CLI）或 worktree（`railway` CLI）按 CLI 归属执行。下文 `G=15554581218512`、`PROD=https://stock-agent-production.up.railway.app`、`IF=https://9wmhxyi4.us-east.insforge.app`。

### 5.1 找截断 source_ids（启发式）
```bash
cd /path/to/stock-agent   # insforge CLI 所在
npx @insforge/cli db query "SELECT source_id FROM vector_chunks WHERE source_type='zsxq_thread' AND chunk_index=0 AND (content LIKE '%…' OR content LIKE '%… ' OR content LIKE '%...' OR content LIKE '%... ')" --json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n'.join(str(r['source_id']) for r in (d.get('rows') or d)))" > /tmp/trunc_ids.txt
wc -l /tmp/trunc_ids.txt
```
> 启发式抓「结尾是省略号」的 doc。可能漏判（结尾不是 `…` 的截断）；第 5.5 步复查兜底。

### 5.2 受控测试（先 3 条）
```bash
# 取 3 个 id，POST by-ids（经 railway run 注入 CRON_SECRET）
IDS=$(head -3 /tmp/trunc_ids.txt | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
railway run --service stock-agent -- bash -c "curl -sS -m 30 -X POST '$PROD/api/zsxq/backfill' -H \"X-Cron-Secret: \$CRON_SECRET\" -H 'Content-Type: application/json' -d '{\"source_ids\": $IDS}'"
# → {"accepted":true,"run_id":"...","mode":"by_ids(3)"}
```

### 5.3 验证（抽样 + 去重）
```bash
SECRET=$(npx @insforge/cli secrets get EDGE_FUNCTION_SECRET --json | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('value') or d.get('secret') or d)")
# run 结果：scanned/articles/backfilled/failed
curl -s "$IF/functions/zsxq-ingest-store?action=list_runs&group_id=$G&limit=1" -H "X-Internal-Secret: $SECRET" | python3 -m json.tool
# 抽查某条现在是完整正文（chunk 不再以 … 收尾、字数大增）：
npx @insforge/cli db query "SELECT length(content) FROM vector_chunks WHERE source_id='<一个回填的id>' ORDER BY chunk_index"
# 无重复（每 source_id 只 1 条 doc）：
npx @insforge/cli db query "SELECT source_id,count(*) c FROM vector_documents WHERE source_type='zsxq_thread' GROUP BY 1 HAVING count(*)>1"
```

### 5.4 全量
```bash
ALL=$(python3 -c "import json;print(json.dumps([l.strip() for l in open('/tmp/trunc_ids.txt') if l.strip()]))")
railway run --service stock-agent -- bash -c "curl -sS -m 30 -X POST '$PROD/api/zsxq/backfill' -H \"X-Cron-Secret: \$CRON_SECRET\" -H 'Content-Type: application/json' -d '{\"source_ids\": $ALL}'"
# 后台跑（~每条 detail+article 两次请求 + smart_delay）。查 run report 拿 backfilled/failed。
```

### 5.5 复查（截断数应趋近 0）
重跑 5.1 的查询；剩余数应大幅下降。若仍有残留：
- 可能是**已删除/不可达**的帖（by-ids 计 `failed`，正常，无法修）。
- 或启发式漏判的截断帖 → 放宽 5.1 条件后再跑 by-ids。

## 6. 监控

- `/admin/jobs` → 「知识星球采集」→ 看 `backfill` 类型的 run（状态/产出/report）。
- run report 字段：`scanned`（扫了几条）/ `articles`（其中是 article 的）/ `backfilled`（成功替换）/ `dropped`（不合格，如成员发的）/ `failed`（拉取或重建失败）。

## 7. 安全 / 不变量

- **永不留空**：删旧 doc 只在全文备好后。拉取失败 → 旧 doc 原样保留。
- **只动 article 帖**：非 article（`talk.article` 不存在）跳过；不合格作者（成员）`dropped`，不动其 doc。
- **并发**：backfill 建 `running` 的 `backfill` run → 运行期间 4h 定时 incremental 被并发护栏自动跳过（不抢 cookie）。backfill 本身是手动触发，不与自身重入（一次跑一个）。
- **eligibility 仍生效**：回填走同样的 `prepare_records`，官方角色过滤照旧。

## 8. cookie / 成本

- by-ids：每条 = 1 次 `/topics/{id}` + （是 article 时）1 次 article 拉取，均经 `_smart_delay` 错峰。63 条 ≈ ~126 请求、~8–10 分钟。**一次性**，可接受。
- archive 模式：额外扫 bucket（storage 读，不耗 cookie）+ 同样的 article 拉取。
- cookie 失效中途 → 后续全部 `failed`（report 可见）→ 刷新 cookie 后重跑（幂等：已全文的会再删再建，无害；想省可只对 `failed` 的 id 重跑）。

## 9. 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| run `auth_failed` | cookie 失效 → `POST /api/zsxq/cookie` 刷新后重跑 |
| `/backfill` 返回 404 | #91/#93 未部署 → 等 Railway 部署 |
| `failed` 数高 | cookie 中途失效，或大量帖已删除 → 查 backend 日志 `backfill:` |
| 出现重复 doc | 不应发生（删旧在前）；若有，跑 5.3 的去重查询，按 `source_id` 删多余的旧 doc |
| article 仍截断 | article 拉取失败（非 200/空）→ 该条 `failed`，重跑；或 inline_article_url 结构变化 → 查 `_extract_article_text` |
