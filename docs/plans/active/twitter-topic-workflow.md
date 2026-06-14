# Twitter Topic Workflow Engineering Plan

> Status: In Progress
> Related: `backend/app/features/twitter/.context.md`, `backend/app/features/twitter_digest/.context.md`, `backend/app/features/vector/.context.md`, `docs/reference/vector-rag-pipeline.md`
> Vision: 产品策略.md > 研究引擎 / 市场数据层

## 目标

把已入库、已标注的 KOL 推文变成一个按需 workflow：用户用自然语言问一个市场话题时，系统先找出近几天相关讨论，再补上历史语料背景，最后产出一份可追溯、适合 FinanceX/X 传播语言的深度报告或长帖。

## 现状

`twitter` 模块已经把 KOL 推文持续写入 `kol_tweets`，并在 `symbols` JSONB 中保存 `quality`、`ticker_stances`、`sectors`、`events` 等标签。`twitter_digest` 模块已经能按时间窗读取所有启用 KOL 的 enriched 推文，并基于 quality 过滤掉低价值内容。

`vector` 模块已经把部分 KOL 推文规范化为 `source_type=kol_tweet` 的向量文档，`metadata` 中保留 author、tweet_type、created_at、quality、tickers、sectors、events、summary 等字段。`match_vector_chunks` 支持 `source_types`、symbol/date/visibility 和 `metadata @>` 精确过滤。

缺口是：现在只有固定日报和 persona chat，没有一个“任意话题 -> 检索证据 -> 重排 -> 给写作层”的通用工作流。用户问“SpaceX 还会涨吗？”时，系统需要同时处理近三天热度和更早的背景证据，不能只靠日报里已有卡片。

## 设计

### Data Flow

```text
user query
  -> query expansion
       - extract literal tokens
       - expand known topic aliases (SpaceX -> Starship/Starlink/SPCX/RKLB/space)
  -> recent evidence
       - pull_candidate_tweets(window_hours)
       - score by text/tag/ticker/sector/event match + engagement
  -> historical evidence
       - vector.search(source_type=kol_tweet, low threshold)
       - no live Twitter fetch
  -> merge/dedupe
       - preserve tweet URL, author, date, tags, original excerpt
       - compute hot tickers/sectors/events from recent evidence
  -> writer input pack
       - why hot
       - what changed
       - affected tickers/sectors
       - watch variables
       - source evidence list
  -> FinanceX writing layer
       - output deep report/thread
       - no price target, no recommendation, no unsupported certainty
```

### API / CLI

P0 先提供后端内部服务和 CLI：

```bash
cd backend
source venv/bin/activate
python scripts/run_twitter_topic_workflow.py "SpaceX 还会涨吗？" --window-hours 72
```

CLI 输出 Markdown 证据包，包含：

- recent evidence：近几天真实相关推文
- historical evidence：向量库历史背景证据
- hot tickers / sectors / events
- writer input：给 FinanceX 写作层使用的结构化素材

P1 再接 API：

```http
POST /api/twitter-digest/topic-workflow
```

请求：

```json
{
  "query": "SpaceX 还会涨吗？",
  "window_hours": 72,
  "top_k": 12,
  "include_historical": true
}
```

响应返回证据包和 writer input。最终文章生成可以作为第二步单独触发，避免检索失败时仍生成“看似完整”的内容。

### 数据库变更

P0 不需要数据库变更。当前 `kol_tweets.symbols` 和 `vector_chunks.metadata` 已够用。

P1 可考虑给 `kol-tweets` Edge Function 增加可选过滤：

- `symbols.ticker_stances[].ticker`
- `symbols.sectors`
- `symbols.events`
- `symbols.quality`

这会减少服务层拉取近窗所有推文的成本，但不是 P0 阻塞项。

### 写作约束

最终输出按 `write-x-finance` skill：

- 先判断帖子类型：这个 workflow 默认是 `Hot event deep dive` 或 `Workflow proof`
- 优先写：为什么热、发生了什么变化、影响哪些标的/板块、接下来观察什么
- 不写荐股、不写目标价、不把“讨论升温”包装成“必然上涨”
- 每个观点必须能回到 evidence list

## 实施步骤

1. [x] 建立工程计划，明确 workflow 边界。
2. [x] 新增 `topic_workflow` 服务模块：query expansion、recent evidence 重排、historical vector search、writer input pack。
3. [x] 新增 CLI 脚本用于本地试跑。
4. [x] 用 “SpaceX 还会涨吗？” 跑通一次真实 evidence pack。
5. [x] 按 FinanceX skill 基于 evidence pack 产出一版长帖/深度报告。
6. [ ] 如 P0 结果稳定，再接 FastAPI endpoint 和前端入口。

## 待定问题

- 是否允许 workflow 默认使用全部 KOL，还是先限制在核心 KOL / Max 内容源。
- “过去三天”无结果但历史证据充足时，产品文案应如何提示：推荐显示“近窗弱、历史强”状态。
- FinanceX 写作层是内置成后端 prompt，还是保留为运营/作者侧工具。P0 建议先不把写作 prompt 写死进后端。
