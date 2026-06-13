# KOL Methodology Refresh Pipeline Engineering Plan

> Status: Planning
> Related: backend/app/features/twitter/.context.md · backend/app/features/twitter/methodologies/.context.md · backend/app/features/twitter/methodology_v3/.context.md · backend/app/features/vector/.context.md · backend/app/features/kol_research/.context.md · docs/plans/active/kol-agent-validation-and-metrics.md
> Vision: 产品策略.md > Agent 服务 / 博主对话 Agent 忠实度命门

## 目标

建立一条可审计、可回滚的 KOL 方法论刷新管线，让静态蒸馏资产不会落后于已入库推文，同时避免把未经验证的新推文自动写成“博主长期方法论”。

## 现状

已有四条链路：

1. `twitter` 采集：`Cron - KOL Tweets Ingestion` 每小时从 Twitter list 写入 `kol_tweets`，随后触发 enrichment。
2. `vector` 索引：`POST /api/vector/index-kol-tweets` 每天 4 次把 `kol_tweets` 写入 `vector_chunks`。
3. `methodology_v3` 离线工具：`export_corpus -> bucketize -> slice_corpus -> compact_slices -> evidence_audit` 可以从 DB 生成 corpus、bucket、slice 和审计材料。
4. `kol_research` 运行时：加载 `features/twitter/methodologies/<persona>/` 下的静态 skill，同时用 `search_kol_tweets` 查已入库向量语料。

缺口：

- 静态 skill 没有统一 `corpus_cutoff / material_version / last_promoted_at` manifest。
- 没有 drift detector 去发现“静态未覆盖，但后续 RAG 已有直接证据”的情况。
- 没有增量补丁机制；现在只能人工改单个 skill 或重跑全量蒸馏。
- 没有发布门禁把 evidence audit、eval、专家抽检串起来。

MRVL 暴露的问题就是：`ticker/MRVL.md` 的静态快照截至 2026-05-25 未覆盖，但 2026-05-28 和 2026-06-02 已入库语料已有直接讨论。

## 设计

### 核心原则

不要把“及时更新”理解成每小时全量重蒸馏。全量重蒸馏成本高、diff 大、容易把短期观点误提升为长期方法论。

采用三层新鲜度：

1. **即时证据层**：`kol_tweets/vector_chunks` 保持现有小时级/日内更新，回答时可以用最新入库证据修正静态 coverage。
2. **日更覆盖层**：每天生成 persona coverage ledger，检测新增 ticker/sector、coverage mismatch、旧 skill stale。
3. **受控蒸馏层**：按严重度做增量 skill patch；定期全量重蒸馏只在通过 eval 和人工抽检后发布。

### Data Flow

```text
Hourly ingestion
  -> kol_tweets
  -> enrichment symbols
  -> vector_chunks (4x/day)
  -> search_kol_tweets (runtime freshness)

Daily refresh detector
  -> export latest corpus
  -> bucketize + slices + compact views
  -> compare against methodology_manifest.json
  -> refresh_report.json/md
  -> pending_patch/*.md or patch suggestions

Human / gated promotion
  -> evidence_audit
  -> registry load tests + MCP tests
  -> eval cases + weekly expert sample
  -> promote material files
```

### 新增 artifact

在每个 promoted persona root 下新增：

```text
backend/app/features/twitter/methodologies/<persona>/_manifest.json
```

建议字段：

```json
{
  "material_version": "2026-06-11.1",
  "persona_username": "qinbafrank",
  "promoted_at": "2026-06-11T00:00:00Z",
  "corpus_cutoff": "2026-06-11T00:00:00Z",
  "corpus_tweet_count": 1072,
  "generator": "methodology_v3",
  "lenses": {
    "ticker/MRVL.md": {
      "coverage": "low",
      "evidence_ids": ["2060037239120511305", "2061718814254100559"],
      "last_evidence_at": "2026-06-02T07:57:24Z"
    }
  }
}
```

中间产物继续写入 gitignored：

```text
backend/app/features/twitter/_distillation_artifacts/<persona>/refresh_runs/<run_id>/
```

包含：

- `refresh-report.md`：给人看的候选更新清单。
- `refresh-report.json`：给 cron / dashboard / tests 用。
- `coverage-ledger.json`：DB 最新 coverage vs promoted material coverage。
- `pending-patches/`：可选的机器生成 patch 草稿。

### Drift 检测规则

新增脚本：

```text
backend/app/features/twitter/methodology_v3/detect_refresh_candidates.py
```

输入：

- promoted `_manifest.json`
- 最新 `corpus-manifest.json`
- `bucket-summary.json`
- `ticker-index.json` / `sector-index.json`
- compact slices
- 可选：`agent_session_events` 中高频 query ticker/topic

输出 candidate 分级：

| 级别 | 触发条件 | 动作 |
|---|---|---|
| P0 | promoted skill 写 `coverage=none`，但 cutoff 后出现直接 ticker hits >= 1 且 quality keep/high/medium | 生成增量 patch，要求 24h 内人工确认 |
| P1 | 已有 ticker/sector 的 cutoff 后新增高质量证据 >= 3，或新增 evidence engagement 很高 | 生成 refresh suggestion，进入本周 patch batch |
| P1 | 新推文包含“打脸 / 证伪 / 之前错了 / 不再 / 修正”等反转词，并命中已有 lens evidence | 人工审阅，不自动改判断 |
| P2 | skill `last_updated` 超过 30 天，且该 lens 有新增证据 | 周更队列 |
| P2 | 用户高频询问一个未覆盖 ticker/topic，且 RAG 多次命中 | 增加 lens 或 patch 的候选 |

### 增量 patch 策略

P0/P1 不直接重写整份 skill，只做窄 patch：

- frontmatter 更新：`coverage`、`direct_mention_count`、`static_corpus_cutoff`、`recent_direct_evidence_since`、`last_updated`。
- 增加 `## 覆盖状态` 中的“静态 cutoff vs 后续已入库证据”说明。
- 增加 `## Evidence Map` 新 tweet ids。
- 对 `coverage=none -> low` 的 ticker，新增“运行时必须调用 `search_kol_tweets`”约束。

禁止机器 patch 自动改：

- core operating system。
- sector/ticker 的强结论、买卖倾向、长期高信念定性。
- 任何没有 evidence id 的判断。

这类变化只进入人工 review。

### 全量重蒸馏策略

全量重蒸馏按月或重大事件触发，而不是日更：

- 每月一次：对 active persona 跑完整 `export -> bucketize -> slice -> compact -> evidence_audit`。
- 每季度一次：重审 core / framework 方法层，避免短期观点污染长期方法。
- 重大事件手动触发：博主连续多条推文修正某个核心框架、或上线新 persona。

发布门禁：

1. `evidence_audit` 全绿。
2. `get_persona()` registry load 成功。
3. `test_kol_persona_unit.py`、`test_themarketbrew_mcp.py` 通过。
4. eval 覆盖：
   - no coverage -> direct coverage case，例如 MRVL。
   - direct evidence citation case。
   - stale cutoff correction case。
   - cross-persona isolation case。
5. 每周专家抽检样本里，新增/变更 lens 至少抽 5 条回答。

### 运行时防线

即使静态 skill 未更新，runtime 也应继续防止旧结论误导：

- `agent.py` 已要求：`search_kol_tweets` 是已入库向量语料，不是实时 Twitter；新 RAG 证据可 supersede 旧 cutoff。
- 后续可以把 `_manifest.json` 的 `corpus_cutoff` 注入 always-on prompt，让模型知道“静态材料版本”。
- MCP `workflow/context` 返回 `methodology_context.material_version`、`corpus_cutoff`、`evidence_freshness`，外部 Agent 也能显示口径。

## API / Cron 变更

P0 可以先做脚本，不加 API。

后续新增 cron/admin endpoint：

```text
POST /api/twitter/methodology-refresh/detect
```

认证：`verify_cron_secret`。

请求：

```json
{
  "persona_key": "qinbafrank-skill-v3",
  "mode": "detect_only",
  "since": "last_manifest_cutoff"
}
```

响应：

```json
{
  "success": true,
  "run_id": "2026-06-11-qinbafrank",
  "candidates": 4,
  "p0": 1,
  "report_path": "backend/app/features/twitter/_distillation_artifacts/..."
}
```

先用 Insforge Schedule 每天跑 `detect_only`。自动应用 patch 不进生产 cron，只能由人工在本地运行。

## 数据库变更

P0 不需要新表。

P1 可加 `methodology_refresh_runs`，用于 dashboard / 审计：

| 字段 | 用途 |
|---|---|
| `id` | run id |
| `persona_username` | persona |
| `run_type` | detect / patch / full_redistill |
| `started_at` / `completed_at` | 运行时间 |
| `source_corpus_cutoff` | 本次 corpus 最新时间 |
| `base_material_version` | 对比的 material version |
| `candidate_counts` | JSONB |
| `status` | success / failed / promoted |
| `report_path` | artifact path |

## 实施步骤

1. [ ] 给 qinbafrank / Serenity material root 增加 `_manifest.json`，记录 corpus cutoff、tweet count、lens coverage、evidence ids。
2. [ ] 实现 `build_manifest.py`，从当前 `methodologies/<persona>` 和最新 artifacts 生成/校验 manifest。
3. [ ] 实现 `detect_refresh_candidates.py`，输出 `coverage-ledger.json` 和 `refresh-report.md/json`。
4. [ ] 加 P0 规则测试：`coverage=none` + cutoff 后 direct hit 必须产生 P0 candidate。
5. [ ] 实现只读 admin/cron detect endpoint，或先以 CLI + Insforge Schedule 跑 detect-only。
6. [ ] 实现窄范围 `generate_patch.py`：只生成 patch 草稿，不自动写 runtime material。
7. [ ] 把 `_manifest.json` 的 `corpus_cutoff/material_version` 接入 MCP context 和 KOL response metadata。
8. [ ] 扩展 eval cases：MRVL stale cutoff、direct citation、cross-persona isolation、no evidence fallback。
9. [ ] 建立每周专家抽检协议：refresh candidates 进入抽样池，记录忠实度/接地/有用三项分。
10. [ ] 文档更新：`methodologies/.context.md`、`methodology_v3/.context.md`、`kol_research/.context.md` 写清刷新 cadence 和发布门禁。

## 待定问题

- P0 patch 是否允许机器直接修改 runtime material，还是永远只生成草稿等待人工确认。建议初期永远人工确认。
- `methodology_refresh_runs` 是否现在建表。建议 P0 先文件 artifact，等 dashboard 需要再建表。
- full redistill 的频率：建议月更；如果博主发文密度高，可对 ticker/sector 做周更，对 core/framework 做季度更新。
- 新推文何时能被提升为“长期方法论”：建议至少满足多条证据、跨时间一致、专家抽检通过，不由单条推文决定。
