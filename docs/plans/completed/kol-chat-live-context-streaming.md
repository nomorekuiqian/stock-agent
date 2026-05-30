# KOL Chat Live Context + Streaming MVP

> Status: In Progress — MVP 已接入 `/kol-chat`，后续进入数据源扩展与真实 token streaming
> Updated: 2026-05-16
> Related: `backend/app/features/twitter/.context.md`, `frontend/src/app/kol-chat/page.tsx`
> Vision: 让 qinbafrank 方法论对话从“历史方法论解释器”升级为“能结合当前市场环境的分析助手”

## 目标

让 `/kol-chat` 在回答“当前怎么看某个板块/股票/宏观环境”时，不再只依赖历史推文蒸馏体，而是同时注入实时行情、新闻事件、日历事件和站内日报/早报上下文。

用户体验上，减少黑盒等待：先展示数据准备进度，再给最终回答。

## 设计理念

### 1. 方法论和实时事实分层

KOL 方法论蒸馏体是慢变量，负责回答“他会怎么拆问题”：

- 看哪些驱动变量
- 怎么判断催化是否成立
- 什么条件下证伪
- 如何区分交易节奏和长期叙事

实时上下文是快变量，负责回答“现在环境里发生了什么”：

- FMP quote
- FMP stock news
- earnings calendar
- economic calendar
- 最新 daily/morning report 缓存

两者不能混在一起存。历史方法论不负责实时新闻，实时新闻也不替代方法论。

### 2. FMP first，不追求多源堆叠

当前 MVP 只接 FMP 和站内报告缓存：

- FMP 是现有项目里最成熟的数据源，已有 shared data tools 和缓存
- quote/news/calendar 都能走同一套 key 和错误处理
- 先把“能用、可追踪、可解释”的链路跑通，再补 Finnhub / web search

Finnhub 放在后续 fallback，ChromaDB/pgvector 放在历史观点 RAG，不参与实时新闻。

### 3. 阶段式 streaming 优先于 token streaming

用户觉得慢，主要不是因为最终文本没有逐字出现，而是前 20-40 秒不知道系统在做什么。

因此 MVP 先做 SSE 阶段流：

```text
status: 已路由到 sector_analysis
status: 已载入 qinbafrank 方法论蒸馏体
status: 正在获取 FMP 行情、新闻事件和日报上下文
live_context: 实时上下文已就绪
status: 正在按方法论生成回答
final: 最终结构化回答
```

这比直接改 token streaming 风险更低，因为当前 ADK 链路使用 `output_schema` 结构化输出，不一定稳定暴露 token-level stream。

## 当前数据流

```text
/kol-chat 用户输入
  |
  v
api.twitterMethodology.chatStream()
  |
  v
POST /api/twitter/methodology-chat/stream
  |
  |-- choose_methodology_category()
  |-- load_methodology_payload()
  |-- build_live_context()
  |     |-- detect_live_context_symbols()
  |     |-- get_batch_quotes()
  |     |-- get_fmp_news(days=7, symbols=...)
  |     |-- get_earnings_calendar(days=21)
  |     |-- get_economic_calendar(days=14)
  |     |-- get_latest_report()
  |     |-- get_latest_morning_report()
  |
  v
answer_methodology_chat_with_context()
  |
  v
SSE final response
```

## 当前 MVP 范围

### 主题识别

首批内置 topic map：

| Topic | 触发词 | Ticker basket |
|---|---|---|
| `ai_storage_optical` | 光存储、光模块、光通信、硅光、CPO、存储、HBM、DRAM、NAND、AI 基建 | `MU`, `WDC`, `STX`, `COHR`, `LITE`, `CIEN`, `FN`, `MRVL`, `AVGO`, `ANET`, `SMH`, `SOXX` |
| `ai_semiconductors` | 半导体、芯片、GPU、算力、晶圆、AI 芯片 | `NVDA`, `AMD`, `AVGO`, `TSM`, `ASML`, `ARM`, `MRVL`, `SMCI`, `SMH`, `SOXX` |
| `mega_cap_tech` | 大科技、七巨头、MAG7、科技股、纳指 | `NVDA`, `MSFT`, `AAPL`, `AMZN`, `GOOGL`, `META`, `TSLA`, `QQQ` |
| `macro_market` | 宏观、大盘、市场环境、美联储、降息、通胀、流动性 | `SPY`, `QQQ`, `DIA`, `IWM`, `TLT`, `GLD`, `UUP`, `VIX` |

如果用户直接输入 ticker，例如 `NVDA`，会被加入 symbol list。

### 实时上下文结构

后端返回 `live_context`：

```json
{
  "topic": "ai_storage_optical",
  "symbols": ["MU", "WDC", "STX", "COHR"],
  "quotes": [],
  "news_events": [],
  "calendar_events": [],
  "market_reports": [],
  "sources": ["fmp_quotes", "fmp_news", "daily_report_cache"],
  "data_timestamp": "2026-05-17T01:33:55Z",
  "limitations": []
}
```

Prompt 规则要求模型：

- 只使用 `live_context` 里的具体价格、新闻、日历事件
- 没有实时数据时必须说明数据缺口
- 回答要区分“方法论证据支持的框架”和“基于实时上下文的推断”
- 不给确定买卖指令，只给观察条件、证伪条件和节奏判断

## 代码最新改动

### Backend

#### `backend/app/features/twitter/live_context.py`

新增实时上下文聚合模块：

- `detect_live_context_symbols(message)`：识别 topic 和 ticker basket
- `build_live_context(message)`：并发获取 FMP quotes/news/calendar 和站内 report cache
- Pydantic schema：
  - `LiveContext`
  - `LiveContextQuote`
  - `LiveContextNewsEvent`
  - `LiveContextCalendarEvent`
  - `LiveContextMarketReport`

实现细节：

- quote/news/earnings/economic calendar 并发执行
- daily report / morning report 作为已加工市场叙事层注入
- 对 morning report 的 `summary` 做了 string/list/dict 兼容，避免 Pydantic validation error
- 只保留有限数量的数据，避免 prompt 过长

#### `backend/app/features/twitter/methodology_chat.py`

改动：

- 新增 `MethodologyChatResponse`，在结构化 LLM 输出外附加 `live_context`
- 新增 `answer_methodology_chat_with_context()`，方便 streaming endpoint 复用已经构建好的 live context
- 原 `answer_methodology_chat()` 保留，作为非 streaming 兼容路径
- Prompt 增加实时上下文约束，禁止模型编造实时行情/新闻

#### `backend/app/features/twitter/router.py`

新增：

- `POST /api/twitter/methodology-chat/stream`

SSE event 类型：

| Event | 用途 |
|---|---|
| `status` | 路由、方法论载入、实时数据获取、生成阶段 |
| `live_context` | 返回已经准备好的实时上下文 |
| `final` | 返回最终 `MethodologyChatResponse` |
| `error` | streaming 内部异常，避免连接静默断掉 |

保留：

- `POST /api/twitter/methodology-chat`

### Frontend

#### `frontend/src/lib/api.ts`

新增：

- `MethodologyLiveContext`
- `MethodologyChatStreamEvent`
- `api.twitterMethodology.chatStream()`

实现方式：

- 使用 `fetch()` 请求 SSE endpoint
- 用 `response.body.getReader()` 读取 chunk
- 解析 `event:` 和 `data:` 行
- 收到 `final` 后 resolve `MethodologyChatResponse`

#### `frontend/src/app/kol-chat/page.tsx`

改动：

- 发送消息时改用 `chatStream()`
- 新增 `progressItems`，逐步展示执行阶段
- `live_context` 到达后显示 ticker 和数据源摘要
- 最终 assistant message 保存 `liveContext`
- 回答卡片展示实时上下文 ticker 和 `sources`
- 停止按钮仍使用 `AbortController`

### Docs

同步更新：

- `backend/app/features/twitter/.context.md`
- `frontend/src/lib/.context.md`
- `docs/reference/pages.md`

## 验证记录

已执行：

```bash
cd backend
source venv/bin/activate
python -m py_compile app/features/twitter/router.py app/features/twitter/live_context.py app/features/twitter/methodology_chat.py
pytest tests/test_twitter_live_context_unit.py -q

cd frontend
npx eslint src/app/kol-chat/page.tsx src/lib/api.ts
npm run build
```

结果：

- Python compile 通过
- 新增 live context unit tests 通过
- 前端 ESLint 通过
- `npm run build` 通过

运行中发现并修复：

- `morning_report.summary` 有时是 list，初版 `LiveContextMarketReport.summary: str` 触发 Pydantic `ValidationError`
- 修复为 `_stringify_summary()`，兼容 string/list/dict

## 当前局限

1. **不是 token-by-token streaming**

当前是阶段式 SSE。最终回答仍在 ADK 结构化输出完成后一次性返回。

2. **FMP 新闻覆盖不一定够细**

对光模块、CPO、供应链细分新闻，FMP company news 有时覆盖不足。后续需要 Finnhub 或 web search fallback。

3. **topic map 是手写规则**

当前足够 MVP，但长期需要更系统的 entity/topic resolver。

4. **实时上下文未做持久化**

`live_context` 会存进对话消息 JSON，但没有独立表用于追踪每次回答的数据快照质量。

5. **没有历史观点 RAG**

现在只用 L1 方法论 JSON，没有从 qinbafrank 全量历史推文中按 topic/ticker/time 召回具体旧观点。

## 后期方向

### Phase 1: 体验与性能打磨

- 给 `build_live_context()` 增加短 TTL cache，按 `topic + symbols` 缓存 3-10 分钟
- 前端展示更多实时上下文细节，例如涨跌幅、新闻标题、数据时间戳
- 对 FMP 慢请求设置更短 timeout，失败时继续生成但明确标注缺口
- 将 live context 构建拆成更细事件：quotes ready、news ready、calendar ready、reports ready

### Phase 2: 数据源扩展

- Finnhub company news 作为 FMP news 不足时的补充源
- Web/search fallback 只用于突发事件或用户明确问“最新”
- FRED 仅在 macro/liquidity 问题下按需接入
- 将站内 twitter digest 最新主题也作为 market narrative context

### Phase 3: 历史观点 RAG

- 用 ChromaDB 或 pgvector 建 qinbafrank 历史推文向量索引
- 元数据至少包括 `tweet_id`, `created_at`, `category`, `tickers`, `sectors`, `events`
- 召回策略：semantic similarity + ticker/topic filter + 时间衰减
- 回答引用应同时包含 methodology evidence 和 historical opinion evidence

### Phase 4: 真正 token streaming

- 研究 Google ADK 在 `output_schema` 下的 streaming 支持
- 如果结构化 token streaming 不稳定，可以拆成两段：
  1. 非结构化 streaming answer
  2. 后台结构化 citation/metadata 校验
- 前端实现打字机输出和 partial answer 保存

### Phase 5: 可观测性与质量评估

- 记录每次 live context 的 `sources`, `latency`, `news_count`, `quote_count`
- 对回答做自动质量检查：是否引用事实、是否标注数据时间、是否越权给买卖指令
- 建立常见问题 benchmark，例如：
  - 光模块走势
  - NVDA 财报风险
  - 美联储降息推迟
  - AI 基建证伪条件

## 使用方式

本地访问：

```text
http://localhost:3000/kol-chat
```

需要前后端同时运行：

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

cd frontend
npm run dev
```

推荐测试问题：

```text
当前怎么看光存储和光模块板块走势？
按他的框架，现在怎么看 NVDA 财报后的风险？
如果美联储延后降息，他会先看哪些流动性指标？
AI 基建这条主线，什么情况下算被证伪？
```
