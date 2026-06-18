# AI 自选股监控台工程计划

## 状态

V0 已实现，当前用于内部验证。

已完成：

- 后端 `watchlist_monitor` 功能模块。
- `ticker_daily_briefs` 表结构和 `watchlist-monitor` Edge Function。
- 缓存读取 API：`GET /api/watchlist-monitor`。
- Cron/admin 生成 API：`POST /api/admin/watchlist-monitor/generate-active-tickers`。
- 付费用户 universe 生成 API：`POST /api/admin/watchlist-monitor/generate-paid-universe`。
- 生产 cron 启动 API：`POST /api/admin/watchlist-monitor/start-paid-universe`。
- Beta 前端页面：`/for-you/monitor`。
- Monitor 右侧面板已改成全宽 ticker 工作台：选中 ticker 摘要、顶部完整 K 线市场结构图、关键价位、AI memo，以及新闻事件、技术面、市场讨论 3 个详情 tab。
- 新闻区使用 rolling 24h 英文新闻生成的 `news_summary`，最多展示 15 条来源标题。
- 顶部市场结构区复用 `/stock` 页面的 `TechnicalChart`，提供完整 K 线 / RSI / MACD / 成交量上下文。技术面 tab 不再重复图表，而是使用 monitor 专用 `technical_monitor` 展示短摘要、关键价位和 deterministic 硬信号。`/stock` 技术分析保持不变。
- Ticker brief 生成已通过 compact `market_context` 输入具备 market-aware 能力，但 UI 不单独展示 market-background 面板。LLM 应自然吸收大盘/板块背景，避免假精确归因。
- 已用测试账号 watchlist 跑过验证：`AAPL`、`MSFT`、`GOOGL`、`AMZN`、`META`、`NVDA`、`TSLA`。

仍待完成：

- Digest/email 集成。
- 生产定时任务配置：调用 paid universe background start endpoint。
- 产品功能指引：覆盖首次使用、待生成 ticker 状态和证据来源理解。
- 用户触发的 on-demand backfill：新增 ticker 当天没有 brief 时可临时补生成。
- 首次付费用户激活路径：checkout 后或首次设置 portfolio/watchlist 后，立即生成初始 monitor 数据，不等下一次 cron。
- 用户状态：read/handled/snooze。
- Top signal drawer 之外的来源/证据 UI。

## 相关上下文

- `frontend/src/app/for-you/.context.md`
- `backend/app/features/brew/.context.md`
- `backend/app/features/portfolio/.context.md`
- `backend/app/features/stock/.context.md`
- `backend/app/features/twitter_digest/.context.md`
- `backend/app/features/subscription/.context.md`
- `docs/plans/for-you/README.md`

## 目标

把现有“专属日报”升级为一个以关注列表为中心的 AI 监控工作台：系统每天对所有活跃 ticker 统一生成高质量分析，覆盖新闻、社交讨论、事件、技术面、基本面与宏观/行业背景；用户进入 `/for-you` 时直接看到自己的关注列表里哪些股票需要处理、为什么需要关注、未来 7 天要看什么。

日报和邮件不再是唯一产品形态，而是从工作台中抽取的一份压缩版交付。核心产品应该是“AI 每天替用户监控投资口袋”，不是“把新闻整理成列表”。

## 非目标

- 不在用户每次打开页面或发 query 时重新全量跑 LLM。
- 不在 V1 做真正的个性化投资建议、买卖指令或组合调仓建议。
- 不把 Twitter/KOL 作为事实来源；Market Discussion 只用于解释市场讨论和关注度。
- 不依赖已计划 rollback 的模拟持仓能力作为核心输入。V1 以 watchlist 为主，portfolio 只作为兼容输入。
- 不重写 `/stock` 个股研究页。工作台只提供深挖入口。

## 产品决策

### 1. 按 ticker 优先，而不是按用户优先

系统每天先对所有活跃 ticker 统一生成 `ticker_daily_briefs`。不同用户关注同一个 ticker 时，读取同一份 ticker 分析。这能显著降低成本，也更适合使用更好的模型。

用户层只负责：

- 选择该用户 watchlist/portfolio 中的 ticker。
- 对 ticker brief 做排序和组合。
- 保存已读、已处理、稍后提醒等状态。
- 后续按用户 profile 做轻量表达层调整。

### 2. 工作台优先，日报其次

`/for-you` 应该从“日报页面”升级成“AI Watchlist Monitor 工作台”。日报、邮件、历史归档仍然保留，但它们只是工作台的快照。

用户每天最需要的是打开页面后立即知道：

- 哪几个 ticker 今天最需要看。
- 这些 ticker 为什么重要。
- 未来 7 天有什么明确事件或观察点。
- 哪些 ticker 没有明显新变化，可以暂时不处理。

### 3. 缓存化分析读取路径

读路径不跑重型 LLM。

- 每日主生成：美股盘后或盘前批量生成 ticker brief。
- 盘中轻量监控：只抓取新新闻、社交信号、价格/技术变化，必要时生成增量 signal。
- 重大变化触发：当出现 earnings、guidance、SEC filing、显著价格跳变、重大新闻时，允许对单 ticker 重跑 brief。
- 用户 query：基于已缓存的 ticker briefs、signals、source refs 做 RAG 问答；只有用户显式请求“重新分析”或系统检测重大变化时才触发重生成。

### 4. Signal 分类体系

每只 ticker 保持“一段 AI 分析”为主，不把信息拆得过碎。但后端结构化存储 signals，前端按需要展示。

V1 使用以下 signal 类型：

- `news`: 公司相关新闻、监管、产品、诉讼、M&A、管理层变化。
- `social`: KOL/Twitter/社交平台上主要在讨论什么，正反观点是什么。
- `event`: 已确认或高置信度的未来事件，如财报、投资者日、产品发布、法院/监管节点、宏观数据影响窗口。
- `technical`: 价格趋势、成交量、均线、RSI、关键支撑/阻力、突破/跌破风险。
- `fundamental`: 财报、估值、分析师预期、guidance、盈利质量等。
- `macro_sector`: 利率、美元、油价、行业轮动、同业事件对该 ticker 的影响。

前端不需要每只股票固定展示全部分类。默认展示最重要的 2-4 个 signal，并保留详情抽屉查看完整证据来源。

### 5. 不破坏缓存读取路径的引导式激活

用户添加新 ticker、刚完成付费、或首次录入持仓后，应该能在几分钟内看到第一批 monitor 数据，而不是等下一个交易日 cron。但这不能破坏 `GET /api/watchlist-monitor` 的核心约束：读路径仍然只读 cached `ticker_daily_briefs`，不在页面加载、刷新或 tab 切换时隐式跑 LLM。

设计决策：

- 临时生成是一个显式 backfill action：由用户保存关注列表/持仓后的前端动作触发，或由 checkout success / entitlement sync 后的激活流程触发。
- 普通用户 backfill 只允许补“自己 watchlist / portfolio 中、今天缺 brief 的 symbol”，不提供任意 ticker 生成能力，不提供 `force=true`。
- 生成底层复用现有 `generate_for_symbols(force=false)`，继续按 `symbol + brief_date + model_version` 幂等跳过今天已有 brief。
- backfill 返回 `accepted/skipped/already_fresh` 等状态，前端展示“正在准备今日监控”，并短轮询 monitor read API；不让用户同步等待完整 LLM 完成。
- 付费后首次激活可以触发一次初始批次生成，但仍受单次 ticker 数、每日次数和 entitlement 限制。

## 前端 UI

### 路由策略

M1-M4 阶段建议新增 `/for-you/monitor`，保持现有 `/for-you` 不受影响。验证稳定后，再把 `/for-you` 主入口切到 Monitor，旧日报变成历史/邮件/快照视图。

### 页面布局

页面应是工作台，不是文章流。

1. 顶部摘要
   - 今日覆盖：已生成 brief 的 ticker 数和旧缓存 ticker 数。
   - 新信号：过去 24 小时新增 signal 数。
   - 未来观察点：未来 7 天 watchpoints 数。
   - Freshness：AI 分析更新时间、行情更新时间、社交数据更新时间。

2. 关注标的分析列表
   - 按用户 watchlist 顺序展示 ticker brief。
   - 每项包含 ticker、AI 一句话判断、下一步观察点和更新时间。
   - 不在 V0 为每个 brief 设计 status 或排序分数字段；如需排序，后续必须单独设计信息架构和解释方式。

3. 关注列表表格
   - 行级结构：Ticker、触发 signals、AI 判断、下一观察点、更新时间、是否为旧缓存。
   - 不给 brief 增加业务状态或排序分数字段；是否过期由 `brief_date` 派生。
   - 支持按 signal type、更新时间筛选。

4. 信号流
   - 按时间展示系统新捕获的新闻、社交、事件、技术信号。
   - 可以按 ticker 和 signal type 过滤。
   - 用于满足用户“实时发生了什么”的需求，但不承担主判断。

5. 未来观察点
   - 未来 7 天观察清单。
   - 分两类：
     - Dated events：有明确日期的财报、经济数据、公司活动、监管节点。
     - Open watchpoints：没有明确日期，但需要持续观察的事项，如 guidance follow-up、产品发布窗口、诉讼进展、社交舆论主题。

6. 标的详情抽屉
   - 点击任一 ticker 打开，不跳页。
   - 内容包括：
     - AI Take：一段完整分析。
     - Signal blocks：news/social/event/technical/fundamental/macro_sector。
     - Watchpoints：未来要看什么、为什么重要、触发条件是什么。
     - Evidence：source title、source URL、published_at、confidence。
     - 深挖 CTA：跳转 `/stock/{symbol}`。

### 空态、加载态、错误态

- 无 watchlist：引导用户添加关注 ticker，不展示空日报。
- watchlist 有 ticker 但今日 brief 未生成：展示 “正在准备今日监控”，并显示已有历史 brief。
- 部分数据源失败：显示 source-level freshness，例如 “社交信号暂缺”、“技术数据已更新”、“事件日历已更新”。
- 过期数据：ticker row 显示 stale badge，避免用户误以为是实时判断。

### 产品指引

目标不是在页面顶部放一大段说明文字，而是在用户遇到决策点时给出短、可执行的引导。

1. 首次激活
   - 无 watchlist / 无 portfolio 时，空态只回答一个问题：“先添加哪些股票？”
   - CTA 优先指向 inline ticker search；如果用户有 Max/portfolio entitlement，再提供导入或录入持仓入口。
   - 文案强调“添加后会自动准备今日监控”，避免用户以为要等明天。

2. 使用说明弹窗
   - 顶部标题旁放一个 help icon，点击后展示 3 步短说明：添加关注标的、等待今日监控生成、查看 AI 判断 / 新闻事件 / 技术面 / 市场讨论。
   - 用 localStorage 记住用户是否已看过；默认不反复打扰老用户。
   - 避免做占满首屏的 tutorial overlay。

3. 待生成/过期行状态说明
   - 新增 ticker 立刻出现在左侧列表，状态为 “正在生成” 或 “等待今日监控”。
   - 如果有旧 brief，保留旧内容但显式标注日期；如果完全没有 brief，右侧显示轻量待生成面板。
   - 待生成面板说明“我们正在抓取新闻、技术面、事件和市场讨论；完成后会自动刷新”，并保留 `/stock/{symbol}` 深挖入口。

4. 证据来源说明
   - 在 AI Take 或 source 区附近增加简短 tooltip，解释来源分层：新闻/财报日历/技术面/市场讨论。
   - 市场讨论必须继续标注为“市场观点，不是事实来源”，与后端约束一致。
   - 不新增买卖建议、风险评级或不可解释分数。

## 后端实现

### 模块边界

建议新增 feature module：

```text
backend/app/features/watchlist_monitor/
├── .context.md
├── __init__.py
├── models.py
├── router.py
├── service.py
├── db.py
├── signal_builder.py
├── event_discovery.py
└── ticker_brief_agent.py
```

原因：

- `brew` 当前承担旧个性化摘要，数据模型已经偏日报。
- monitor 是新的产品主干，应该有独立数据表、API 和 cron。
- `brew` 后续可以改成 monitor 快照适配层，而不是继续膨胀。

### 数据源

V1 数据源按可靠性分层：

1. 结构化来源
   - FMP earnings calendar。
   - FMP economics calendar。
   - FMP stock news / press releases。
   - FMP analyst estimates / ratings / price target（如果可用）。
   - 现有技术面数据：`backend/app/shared/data_tools/technical.py`。
   - 现有 macro cache/report data。

2. 现有产品数据
   - `/stock` 已有的数据工具和基本面/技术工具。
   - 来自 `brew` / `portfolio` 的用户 watchlist/profile。
   - `kol_tweets` ticker-level cached discussion，在离线生成阶段压缩成 Market Discussion。

3. 事件发现来源
   - 公司 IR 页面 / press release feeds（如果可用）。
   - SEC filings，用于 company-specific triggers。
   - Search API 用于未来事件候选发现，不属于 V0 范围。
   - 后续可选：Benzinga calendar/guidance、Trading Economics calendar、其他付费事件源。

### 搜索策略

V0 只把 Tavily 用作 ticker 新闻补源。每个 ticker 使用固定 query `{TICKER} stock news` 做一次 basic search，再与 FMP news 合并去重后进入 LLM synthesis。V0 不维护独立 event-candidate 历史表。未来 Search/IR crawling 应作为单独、source-grounded 的迭代落地。

### 数据库表

#### `ticker_daily_briefs`

共享 ticker 分析结果。

```text
id uuid primary key
symbol text not null
brief_date date not null
model_version text not null
headline text
ai_take text not null
news_summary text
technical_monitor jsonb not null
market_discussion jsonb not null
signals jsonb not null
watchpoints jsonb not null
event_candidates jsonb not null
source_refs jsonb not null
generated_at timestamptz not null
created_at timestamptz not null
updated_at timestamptz not null
unique(symbol, brief_date, model_version)
```

`signals` 结构：

```json
[
  {
    "type": "news",
    "title": "string",
    "summary": "string",
    "why_it_matters": "string",
    "source_ref_ids": ["string"],
    "observed_at": "ISO timestamp"
  }
]
```

`watchpoints` 结构：

```json
[
  {
    "type": "dated_event",
    "date": "YYYY-MM-DD",
    "title": "string",
    "why_it_matters": "string",
    "what_to_watch": "string",
    "confidence": "high",
    "source_ref_ids": ["string"]
  }
]
```

V0 直接把 `event_candidates` 存在 `ticker_daily_briefs` 上，不单独建 `ticker_event_candidates` 表。

#### `ticker_signal_events`

M2/M3 可选。用于盘中增量 signals，不强制每次重跑完整 brief。

```text
id uuid primary key
symbol text not null
signal_date date not null
signal_type text not null
title text not null
summary text
source_refs jsonb not null
created_at timestamptz not null
expires_at timestamptz
```

#### `user_monitor_state`

M3 可选，用于已读、处理、稍后提醒。

```text
id uuid primary key
user_id uuid not null
symbol text
item_type text not null
item_id uuid not null
state text not null
snoozed_until timestamptz
updated_at timestamptz not null
unique(user_id, item_type, item_id)
```

### API 设计

#### 用户 API

```text
GET /api/watchlist-monitor
```

返回当前用户 monitor 首页数据。

响应：

```json
{
  "as_of": "ISO timestamp",
  "freshness": {
    "ai_generated_at": "ISO timestamp",
    "quotes_updated_at": "ISO timestamp",
    "social_updated_at": "ISO timestamp",
    "events_updated_at": "ISO timestamp"
  },
  "summary": {
    "new_signals": 8,
    "next_7d_watchpoints": 5,
    "stale_tickers": 1
  },
  "ticker_rows": [],
  "future_watchpoints": [],
  "signal_feed": []
}
```

```text
PATCH /api/watchlist-monitor/state
```

M3 增加。保存 read/handled/snoozed 状态。

```text
POST /api/watchlist-monitor/backfill
```

M7 增加。为当前认证用户请求一次受控的临时补生成，用于新 ticker、刚付费后的首次激活，或首次持仓录入后的 immediate value。

认证：

- Bearer Token (`verify_user_token`)
- 必须拥有 `for_you_website` entitlement

请求：

```json
{
  "symbols": ["NVDA", "MSFT"],
  "source": "watchlist_add",
  "include_portfolio": false
}
```

规则：

- `symbols` 为空时，后端从当前 watchlist 读取 symbol；`include_portfolio=true` 时合并非 `$CASH` portfolio symbols。
- 显式 `symbols` 必须是当前用户 watchlist 或 portfolio 的子集，防止把用户端点变成免费任意 ticker 生成器。
- 单次最多 5 个 symbols；每日最多 1 次初始批次 + 若干次“仅新增 symbol”补生成，具体限额实现时用配置项控制。
- 用户端不接受 `force=true`；如果今天已有 brief，返回 `already_fresh`。
- 后端只对“今天缺失或过期”的 symbols 调用 `generate_for_symbols(force=false)`，并可通过 `BackgroundTasks` 立即返回 `accepted=true`。

响应：

```json
{
  "success": true,
  "accepted": true,
  "requested_symbols": ["NVDA"],
  "queued_symbols": ["NVDA"],
  "already_fresh": [],
  "skipped_symbols": [],
  "message": "generation started"
}
```

#### Admin/Cron API

```text
POST /api/admin/watchlist-monitor/discover-events
POST /api/admin/watchlist-monitor/generate-ticker
POST /api/admin/watchlist-monitor/generate-active-tickers
POST /api/admin/watchlist-monitor/generate-paid-universe
POST /api/admin/watchlist-monitor/start-paid-universe
```

这些端点使用 cron/admin auth，不暴露给普通用户。

### 生成流水线

1. 构建活跃 ticker 池
   - 付费页面使用拥有 `for_you_website` entitlement 用户的 watchlist 去重并集。
   - 兼容 portfolio symbols。
   - Admin pinned tickers。
   - 不再使用 Twitter Digest hot tickers 作为 monitor universe 或 ticker brief 输入。

2. 收集每个 ticker 的原始输入
   - quotes。
   - technical summary。
   - company news and press releases。
   - earnings calendar。
   - event candidates。
   - cached Market Discussion from ticker-level KOL/social discussion。
   - macro/sector context。

3. 构建规则型信号候选
   - 用规则压缩技术面。
   - 用 source metadata 去重新闻。
   - 用 event_date/confidence 过滤未来 7 天事件。
   - 用 KOL digest 生成 social discussion summary。

4. 运行 ticker brief LLM
   - 主模型迁移为 DeepSeek direct API，当前默认 `deepseek-v4-pro`，调用层不再依赖 ADK session/runner。
   - DeepSeek 官方 API 仅保证 `json_object`，不保证严格 JSON Schema；schema 由本地 Pydantic validation + retry adapter 保证。
   - 要求 source-grounded，禁止无来源日期。
   - 输出一段自然语言 AI Take + structured signals/watchpoints。

5. 质量门
   - `ai_take` 非空。
   - 至少 1 个 signal 或明确说明 quiet。
   - watchpoint 有日期时必须有 source_ref。
   - source refs 必须可追溯。
   - LLM 失败不能写 fake success。

6. 保存和服务读取
   - `ticker_daily_briefs` upsert。
   - monitor API 从 briefs + event candidates + user watchlist 拼装。

7. 用户触发 backfill
   - 前端保存 watchlist/portfolio 后，先乐观更新本地列表，再调用 `POST /api/watchlist-monitor/backfill`。
   - 后端重新读取当前用户 watchlist/portfolio 做授权校验和 symbol 归属校验。
   - 只补今天缺失的 brief；生成完成后仍写共享 `ticker_daily_briefs`，其他用户关注同一 ticker 时自动受益。
   - 前端用 `GET /api/watchlist-monitor` 轮询或手动刷新拿结果，不接收流式 LLM 输出。
   - 失败时 row 保持待生成/过期状态，错误只作为轻量 toast 或 row 状态，不写 fake success。

### DeepSeek direct API 模型迁移

目标是把 AI 监控台的主生成模型从 ADK `gemini-3.5-flash` 切到更 cost-effective 的 DeepSeek direct API，同时保持现有产品契约不变：用户读路径不跑 LLM，`TickerBriefAgentOutput` 仍是唯一业务输出 schema，质量门失败不能写 fake success。

2026-06-16 实测 DeepSeek `/models` 当前只返回 `deepseek-v4-flash`、`deepseek-v4-pro`，没有 `deepseek-v3-pro`。因此实现默认使用当前可用的 `deepseek-v4-pro`；如果后续账号开放私有/别名模型 ID，可通过 `WATCHLIST_MONITOR_LLM_MODEL` 覆盖。

#### 结论

不建议为当前 monitor pipeline 直接引入完整 Agent Framework。`ticker_brief_agent.py` 现在没有用到 ADK 的多轮记忆、工具编排或 session 状态，只用到了 `output_schema`、`output_key` 和 `after_model_callback`。因此最小且更稳的方案是新增一个内部 `StructuredLLMClient` adapter，用 OpenAI-compatible SDK 直连 DeepSeek API，再用 Pydantic 做 schema validation、修复重试和 usage metering。

未来如果 monitor 变成真正的多工具 agent，再评估 PydanticAI 或 Instructor；当前一阶段不需要 LangChain/LlamaIndex 这类重型编排。

#### 供应商策略

直连 DeepSeek 官方 API：

- base URL: `https://api.deepseek.com`
- model: 默认 `deepseek-v4-pro`
- auth: 复用现有 `DEEPSEEK_API_KEY`
- response format: `{"type": "json_object"}`
- thinking: 显式 `{"type":"disabled"}`，减少离线批量任务的 token 和延迟，并避免 V4 默认 thinking 在大输入下消耗输出 token 导致 content 为空。

OpenRouter 暂不进入本次实现；当前代码没有运行时 OpenRouter 调用，避免引入新的 provider routing 不确定性。

#### 适配器设计

新增共享模块：

```text
backend/app/shared/llm_clients/
├── __init__.py
├── structured.py        # generate_structured_json()
└── deepseek.py          # DeepSeek OpenAI-compatible client
```

核心接口：

```python
async def generate_structured_json(
    *,
    feature: str,
    agent_name: str,
    model: str,
    system_prompt: str,
    user_payload: dict,
    output_model: type[T],
    max_tokens: int,
    retries: int = 2,
) -> tuple[T, LLMUsage]
```

行为：

1. 生成稳定消息前缀：system instruction + 小型 JSON schema 摘要 + compact input JSON。
2. 调 DeepSeek `chat.completions.create()`，`response_format={"type": "json_object"}`。
3. 解析 `choices[0].message.content`；空内容或 JSON decode 失败视为 retryable。
4. 用当前子任务的 Pydantic model 校验。
5. 如果 Pydantic 失败，将压缩后的 validation errors 和上一轮 invalid JSON 反馈给模型，要求只返回修正后的 JSON。
6. 所有 retry 失败后抛异常，由现有 `generate_for_symbols()` 记录失败，不写 brief。

实际 monitor pipeline 不再让一个 call 直接产出完整 `TickerBriefAgentOutput`，而是拆成小 schema：

- `NewsSummaryOutput`：只负责 `news_summary`、主题和新闻 source ids。
- `FutureEventExtractionOutput`：只负责从 `news_items` 抽取 company-specific future events。
- `TechnicalInterpretationOutput`：只解释规则已经检测好的技术面输入。
- `MarketDiscussionOutput`：只解释缓存的 Twitter/KOL 讨论。
- `BriefCompositionOutput`：只做最终 `status/headline/ai_take/signals/watchpoints` 判断。

最终由 `ticker_brief_agent.generate_ticker_brief()` 合成 `TickerBriefAgentOutput`，再交给 `service.py` 的质量门。所有 prompt-only JSON 输出模型继承现有 `CoerceNoneToDefaultsMixin`，吸收常见的 `null` 默认值问题；required 字段仍保持 required，不能被静默补空。

#### Watchlist Monitor 集成

替换范围只限：

- `backend/app/features/watchlist_monitor/ticker_brief_agent.py`

保持不变：

- `service.py` 的 `generate_for_symbols()` orchestration。
- `_validate_quality()` source ref / dated watchpoint / event candidate gate。
- `TickerBriefAgentOutput`、`TickerDailyBrief`、DB rows、Edge Function。
- `/api/watchlist-monitor` 读取路径。
- `/for-you/monitor` frontend contract。

新增配置：

```text
WATCHLIST_MONITOR_LLM_MODEL=deepseek-v4-pro
WATCHLIST_MONITOR_LLM_MAX_TOKENS=2400
WATCHLIST_MONITOR_LLM_RETRIES=2
WATCHLIST_MONITOR_LLM_TEMPERATURE=0.2
WATCHLIST_MONITOR_MODEL_VERSION=watchlist-monitor-v1-deepseek-v4-pro
```

`MODEL_VERSION` 应随主模型变化，便于回看质量和成本。当前 `latest_briefs` 按 `brief_date/generated_at` 取最新，不按 `model_version` 过滤，所以新模型可以逐 ticker 灰度生成，不需要前端改动。

#### 计量与成本控制

现有 `llm_metering.py` 只适配 ADK callback，需要抽出 provider-neutral recorder：

- 新增 `record_llm_usage(record)`，复用当前 `llm-usage` Edge Function。
- ADK `meter()` 保持兼容，内部调用同一个 recorder。
- DeepSeek adapter 从 OpenAI-compatible response 的 `usage` 读取：
  - `prompt_tokens`
  - `completion_tokens`
  - `total_tokens`
  - `prompt_cache_hit_tokens`
  - `prompt_cache_miss_tokens`
- admin `_estimate_usd()` 增加 `deepseek-v4-pro` 和 `deepseek-v4-flash` 官方价格分支；cache hit/miss 先写入 `extra`，后续再升级 dashboard 精算。

成本策略：

- ticker-first 共享 brief 继续作为最大降本手段。
- prompt 前缀固定，把 instruction/schema/example 放在 messages 的稳定开头，提高 DeepSeek 自动 context cache 命中。
- 当日已有 brief 且 `force=false` 时不重跑。
- 输出限制在 `max_tokens=2400` 左右，避免 `news_summary` 和 event candidates 过长。
- 请求中显式设置 `thinking={"type":"disabled"}`，避免 V4 默认 thinking 消耗输出 token。

#### 发布计划

1. Adapter 落地：新增 DeepSeek structured client、usage recorder、配置项和单元测试；不改业务行为。
2. 影子评估：对固定 ticker set 同时跑 Gemini 和 DeepSeek，不写 DeepSeek 或写入新 `model_version`，比较 schema pass rate、质量门失败率、事件日期幻觉、source ref 准确率、成本和延迟。
3. 内部 canary：admin 手动生成内部 watchlist，先观察 schema pass、质量门和事件日期引用。
4. 生产默认：批量 cron 默认 DeepSeek direct API；子任务失败先降级为空结果，最终合成失败或 service 质量门失败时直接标记 ticker failed，不写 fake success。
5. 优化：如果 V4 Pro 质量稳定，再评估是否按 ticker universe 分层 A/B DeepSeek V4 Flash；分层规则需要独立设计，不能依赖 brief 内的分数字段。

#### 验收标准

- DeepSeek V4 Pro 对 20 个样例 ticker 的分任务 schema pass rate >= 98%，最终 retry 后质量门通过率 >= 95%。
- 0 条输出包含不存在的 `source_ref_ids`。
- 0 条 exact-date event candidate 使用无来源日期。
- 生成 brief 不输出业务 status；读取路径仅用 `is_stale` 表示旧缓存回退。
- 读路径无 LLM 调用，`GET /api/watchlist-monitor` 行为不变。
- admin LLM usage dashboard 能看到 DeepSeek 调用量和粗略 USD 成本。
- 子任务失败会记录 warning 并降级为空结果；最终合成失败或质量门失败时不写 brief。

## 产品矩阵集成

### `/for-you`

定位从“专属日报”升级为“AI Watchlist Monitor”。现有 `DigestInlineReport` 保留为历史日报/邮件预览形态。新工作台稳定后，`/for-you` 默认进入 monitor。

### `/stock/{symbol}`

作为深挖页面。Monitor 的 ticker detail drawer 提供“查看完整个股研究” CTA。后续可以在 `/stock` 中加入“Latest Monitor Signals”区块，复用同一份 ticker brief。

### `/twitter-digest`

作为 Social Signal 来源。Monitor 不复制完整 Twitter 日报，而是提炼：

- 社交平台在讨论什么。
- 主要多空观点。
- 哪些 KOL/主题使该 ticker 进入关注。

### `/today` 和 `/morning`

继续负责通用市场日报和盘前日报。Monitor 可引用其中的宏观背景，但用户最终看到的是“这些宏观事件如何影响我的 watchlist”。

### `/macro`

作为 Macro/Sector Signal 的深挖入口。Monitor 中出现利率、美元、油价、行业轮动等影响时，链接到宏观页。

### 邮件 / 订阅

邮件不再承载完整工作台，只发送压缩版：

- 今日最需要关注的 3 个 ticker。
- 未来 7 天最重要的 3 个观察点。
- 点击回到 `/for-you/monitor` 查看完整证据来源。

广播安全规则保持不变，非 production 仍必须走 Resend test segment。

### 未来 MCP / Agent 服务

Ticker briefs 和 watchlist monitor API 可以成为后续 MCP/API agent 服务的基础能力：外部 agent 可以询问某个 ticker 今日 signals 或某个用户 watchlist 的待处理事项。

## 里程碑

### M0. 计划与契约

范围：

- 完成本计划评审。
- 定义后端 Pydantic models、TypeScript types、API response contract。
- 确定 feature flag，例如 `watchlist_monitor_enabled`。
- 确定 V1 支持的 signal taxonomy；暂不设计 per-brief status 或排序规则。

验证：

- 产品评审通过：确认工作台优先、日报压缩、ticker-first 生成。
- 后端 model unit tests 可解析 sample JSON fixture。
- 前端 mock fixture 可渲染 monitor 页面原型。
- 确认不会触碰 dead code zones。

### M1. 后端数据地基

范围：

- 新增 `watchlist_monitor` feature module。
- 新增 Insforge tables / edge functions / db helpers。
- 实现 active ticker universe builder。
- 实现 ticker brief 和 event candidate 的 idempotent upsert/read。

验证：

- 本地或 staging 数据库可创建表。
- 同一 `symbol + brief_date + model_version` 重复写入不会产生重复 brief。
- API/db tests 覆盖 insert、read、empty、partial failure。
- 代码没有 import `backend/app/services/` 或 `backend/app/models/`。

### M2. Ticker brief 生成器

范围：

- 实现 `signal_builder.py`。
- 接入 FMP news/calendar、technical data、cached Market Discussion、macro context。
- 实现 `ticker_brief_agent.py`，使用 `gemini-3.5-flash` 输出结构化 brief。
- 增加 admin/cron 批量 ticker 生成端点。

验证：

- 对 5 个样例 ticker 生成完整 brief，例如 `NVDA`、`TSLA`、`AAPL`、`MSFT`、`AMD`。
- 每个样例至少输出 `ai_take`、signals、source_refs。
- 有明确日期的 watchpoint 必须带 source。
- 外部数据失败时返回 partial result，不写 fake success。
- 日志记录 input source count、生成耗时、模型版本、失败原因。
- 生成成本和耗时在可接受范围内，批量任务支持配置上限。

### M3. Monitor 用户 API

范围：

- 实现 `GET /api/watchlist-monitor`。
- 从当前用户 watchlist/portfolio 读取 ticker 列表。
- 拼装 summary、ticker_rows、future_watchpoints、signal_feed、freshness。
- 按用户 watchlist 顺序返回 ticker_rows；不做系统排序。
- 可选实现 `PATCH /api/watchlist-monitor/state`。

验证：

- 使用本地测试账号 `voya.technologies@gmail.com` 可返回 watchlist monitor。
- 无 watchlist、部分 ticker 无 brief、全部过期三种情况都有稳定响应。
- 读取路径不调用重型 LLM。
- cached response latency 目标小于 500-1000ms。
- e2e/API tests 覆盖 auth、empty、happy path、partial data。

### M4. 前端工作台

范围：

- 新增 `/for-you/monitor` 页面。
- 实现顶部摘要、关注标的分析列表、关注列表表格、信号流、未来观察点、标的详情抽屉。
- 更新 `frontend/src/lib/api.ts` types 和 API client。
- 保持现有 `/for-you` 旧 digest 可用。
- 加入 responsive layout，桌面优先，移动端可读。

验证：

- Vitest 覆盖核心组件：summary cards、ticker row、detail drawer、empty state。
- Playwright 检查 desktop 和 mobile 页面可渲染。
- 无 watchlist、brief 待生成、部分来源失败、正常数据四种状态都可读。
- 文本不溢出、不遮挡，按钮/筛选控件稳定。
- 手动验证从 ticker drawer 跳转 `/stock/{symbol}` 正常。

### M5. Digest 和 Email 集成

范围：

- 将现有 personalized digest 生成逻辑改为优先读取 ticker briefs。
- 生成日报 snapshot：今日最重要 ticker、未来观察点、简短总结。
- 更新邮件模板 compact version。
- 保留旧 `personal_digests` 历史渲染兼容。

验证：

- `/api/digest` 在已有 ticker brief 时不重新 per-user 跑全量 ticker LLM。
- 老 digest 数据仍可在历史列表渲染。
- 邮件模板 snapshot 在桌面/移动邮箱预览正常。
- dev 环境广播仍返回 Resend test segment audience id。
- 失败时不发送低质量空邮件。

### M6. 发布与运维

范围：

- 生产 rollout 走 `for_you_website` entitlement；不再使用 watchlist monitor 专用 feature flag。
- 配置每日生成 cron、事件发现 cron、可选盘中轻量 scan；生产 full-universe cron 走后台 start endpoint，避免 Edge Function 同步等待全量生成超时。
- 增加 admin regeneration 操作。
- 增加监控指标：生成成功率、缺失 brief 数、source failure、read latency、LLM cost。
- 更新 `.context.md` 和相关 reference docs。

验证：

- Staging 连续跑 3 个交易日，成功率、成本、延迟达到目标。
- 失败 ticker 可单独重跑。
- Paid beta 对拥有 `for_you_website` entitlement 的用户开放；普通未付费用户由付费墙和后端 entitlement gate 拦截。
- 文档更新完成：`watchlist_monitor/.context.md`、`brew/.context.md`、`for-you/.context.md`、API docs。
- 产品验收：用户打开页面能在 30 秒内判断今天要处理什么。

### M7. 引导式激活与 on-demand backfill

范围：

- 增加用户端 `POST /api/watchlist-monitor/backfill`，复用现有 ticker brief generator，保持读取路径不跑 LLM。
- 新增 backfill request/response Pydantic models、API client、TanStack mutation hook。
- 在 `/for-you/monitor` 的 inline ticker 添加成功后触发 backfill；待生成 ticker 立刻显示在左侧列表。
- 对 checkout success / 首次付费进入 monitor / 首次 portfolio save 设计一次初始批次触发点。
- 增加帮助弹窗、首次使用空态、待生成/过期 row 引导和证据来源 tooltip。
- 更新 `watchlist_monitor/.context.md`、`frontend/src/app/for-you/.context.md`、`frontend/src/lib/.context.md` 和 `docs/reference/pages.md`。

验证：

- 新增 ticker 今天没有 brief 时，用户保存后看到待生成 row，backfill endpoint 返回 `accepted=true`，生成完成后 monitor read API 返回新鲜 row。
- 新增 ticker 今天已有 brief 时，endpoint 返回 `already_fresh`，不重复生成。
- 用户不能为 watchlist/portfolio 外的 symbol 触发 backfill。
- 未付费或无 `for_you_website` entitlement 用户被 403 拦截。
- 同一用户连续点击不会绕过单次/每日限额，也不会产生重复 DB row。
- `GET /api/watchlist-monitor` 仍不调用 LLM；所有生成只发生在 cron/admin/backfill endpoints。
- 前端待生成、过期、空态、错误四类状态在 desktop/mobile 下无文本溢出。
- 后端测试覆盖 auth、symbol ownership、already fresh、accepted、limit exceeded、generation failure。

## 待定问题

- V1 是否直接把 `/for-you` 切到 monitor，还是先以 `/for-you/monitor` beta 发布。
- 是否购买 Benzinga/Trading Economics 等更完整事件源，还是先用 FMP + Market Discussion。
- 如果未来要做排序，是否需要单独设计 explainable ranking，而不是在 brief schema 里直接加分数。
- 是否在 M3 就加入 read/handled/snooze，还是先只做只读工作台。
- Market Discussion 是否继续只用 cached `kol_tweets`，还是增加更完整的 ticker-level discussion retrieval。
- Backfill 的每日用户限额应该是多少：一次初始批次 + 新增 ticker 补齐是否足够，还是需要 Pro/Max 分层。
- Portfolio symbols 是否应该正式进入 monitor 默认 symbol universe，还是只在首次持仓录入后用于 initial backfill。

## 风险

- Event discovery 质量不足：未来事件最容易出现日期不准或来源不可靠。必须 source-grounded，并区分 confirmed events 与 open watchpoints。
- LLM 成本失控：active ticker universe 需要限额、去重和同日缓存复用。
- 产品过重：工作台信息密度必须控制，主视图只展示优先事项，完整证据来源放在抽屉里。
- 数据 freshness 误解：必须明确展示 AI 分析、行情、社交、事件各自更新时间。
- 现有 `/for-you` 迁移风险：先做 beta route，再替换主入口。
- 用户触发生成带来成本放大：必须限制为 entitlement 用户、自有 symbols、missing today briefs，且不暴露 force refresh。
- BackgroundTasks 进程内执行存在部署中断风险：短期可接受；如果 backfill 成为高频入口，应迁移到持久 job queue 或 InsForge Compute。

## 推荐优先实现

先做 M0-M3，完成一个可被前端 mock 和内部 API 使用的 ticker-first 后端。只要后端可以稳定产出 5-20 个 ticker 的每日 briefs，就能快速验证产品价值。

随后 M4 做工作台 UI，并用真实 sample 数据盲测：用户是否能在打开页面后立即回答“今天我需要看什么、为什么、接下来等什么”。
