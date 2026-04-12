# Research Agent 能力升级 — 工程计划

> Status: Approved
> Priority: P0 — 短期获客重点
> Timeline: 3-5 天
> Goal: 让 Research Agent 变得惊艳且可分享，支撑社媒传播

## Context

Research Agent 目前只有 6 个 screener 工具，无法查新闻、看行情、做实时搜索，也不知道用户持有什么股票。为了在 3-5 天内让 Agent 变得"惊艳且可分享"用于社媒获客，需要：
1. 注册 7 个新工具（解锁已有后端数据能力）
2. 注入用户 watchlist 上下文（个性化回答）
3. 添加 SSE 流式端点 + 工具调用事件（体验升级）

## 实施方案

### 新文件

**`backend/app/features/screener/research_tools.py`** — 7 个工具包装函数

所有 tool 遵循现有模式：纯 Python 函数，返回 `json.dumps()` 字符串，docstring 供 LLM 理解用途。

```
工具清单：

1. web_search(query: str) -> str
   - 方案：直接导入 google.adk.tools.google_search 注册到 agent tools（ADK 原生支持）
   - 无需自己包装函数，ADK 自动处理 Gemini grounding
   - 如不可用则 fallback 为自建函数调用 Gemini with search=True

2. get_stock_news(symbols: list[str], days: int = 1) -> str
   - 来源：data_tools/news.py → get_fmp_news(days, symbols)
   - 裁剪：取前 12 条，只保留 title/symbol/publishedDate/link

3. get_stock_quote(symbols: list[str]) -> str
   - 来源：data_tools/market_data.py → get_stock_quotes(symbols)
   - 裁剪：无需（已是紧凑格式，~12 字段/股）
   - 限制：最多 20 symbols

4. get_technical_analysis(symbol: str) -> str
   - 来源：data_tools/technical.py → get_technical_data(symbol)
   - 裁剪：100+ 字段 → 提取 ~20 个关键字段
   - 保留：daily rating, RSI, MACD histogram, SMA 50/200,
           derived(ma_alignment/rsi_zone/bb_position),
           support_resistance, pattern_signals

5. get_stock_fundamentals(symbol: str) -> str
   - 来源：yfinance_service.py → get_ticker_metrics(symbol)
   - 裁剪：保留 valuation/profitability/growth/balance_sheet/analyst_targets
   - 去掉：ttm 原始数据、forward_eps、market_data 等冗余

6. get_earnings_calendar(days: int = 14) -> str
   - 来源：data_tools/earnings.py → get_earnings_calendar(days)
   - 裁剪：无需（已紧凑）

7. get_market_overview() -> str
   - 来源：data_tools/market_data.py → get_all_market_data()
   - 裁剪：yield_curve 只保留 2Y/5Y/10Y/30Y
```

### 修改文件

**`backend/app/features/screener/research_agent.py`**：
- 导入 research_tools.py 的 6 个函数 + google_search
- 将新工具加入 `research_tools` 列表
- `guide()` 方法增加 `user_id` 参数
- `guide()` 内部调用 `get_user_watchlist(user_id)` 获取持仓
- watchlist 注入 prompt_parts（"User holds: NVDA, AAPL..."）
- 新增 `guide_streaming()` 方法（async generator，yield SSE 事件）
- 更新 `RESEARCH_AGENT_INSTRUCTION`：添加工具分组说明 + 持仓感知指引

**`backend/app/features/screener/router.py`**：
- 在 `research_chat()` 调用时传入 `user_id`
- 新增 `POST /api/research/chat/stream` 端点（StreamingResponse）
- SSE async generator 调用 `agent.guide_streaming()`

### Watchlist 注入

位置：`guide()` 方法内，加载 reports 之后、构建 prompt_parts 之前。

```python
watchlist_symbols = []
if user_id:
    from app.features.brew.db import get_user_watchlist
    watchlist = await get_user_watchlist(user_id)
    if watchlist and watchlist.get("symbols"):
        watchlist_symbols = watchlist["symbols"]

if watchlist_symbols:
    prompt_parts.append("## 用户持仓")
    prompt_parts.append(f"用户正在关注: {', '.join(watchlist_symbols[:30])}")
    prompt_parts.append("回答时自然地关联用户持仓，不要强行提及。")
```

### SSE 流式端点

**事件格式**：
```
data: {"type": "tool_call_start", "tool": "get_stock_quote", "description": "正在查询 NVDA 实时行情..."}\n\n
data: {"type": "tool_call_end", "tool": "get_stock_quote"}\n\n
data: {"type": "message_chunk", "content": "..."}\n\n
data: {"type": "done", "result": {ResearchResult JSON}}\n\n
```

**实现方式**：利用 ADK `runner.run_async()` 返回的 async generator，检查每个 Event：
- `event.get_function_calls()` → 发 `tool_call_start`
- `event.get_function_responses()` → 发 `tool_call_end`
- `event.content.parts[].text` → 发 `message_chunk`（如果 author 是 agent）
- 最后从 session state 取结构化输出 → 发 `done`

**工具描述映射**（中文 UI）：
```python
TOOL_DESCRIPTIONS = {
    "get_stock_news": lambda a: f"正在查询 {', '.join(a.get('symbols', [])[:3])} 的新闻...",
    "get_stock_quote": lambda a: f"正在获取 {', '.join(a.get('symbols', [])[:3])} 的行情...",
    "get_technical_analysis": lambda a: f"正在分析 {a.get('symbol', '')} 的技术面...",
    "get_stock_fundamentals": lambda a: f"正在查看 {a.get('symbol', '')} 的基本面...",
    "get_earnings_calendar": lambda a: "正在查询财报日历...",
    "get_market_overview": lambda a: "正在获取大盘概况...",
    "execute_screener": lambda a: "正在筛选股票...",
    "google_search": lambda a: "正在搜索最新信息...",
}
```

### Instruction Prompt 更新

在现有 instruction 末尾追加工具分组：

```
## 工具使用指南

【行情查询】问价格、看大盘
- get_stock_quote: 查实时价格（最多 20 只）
- get_market_overview: 大盘/VIX/国债/商品全貌

【个股研究】分析某只股票
- get_stock_fundamentals: PE/利润率/增长/分析师目标
- get_technical_analysis: RSI/MACD/均线/支撑阻力
- get_stock_news: 个股相关新闻（最近 12 条）

【选股筛选】用户要筛选
- execute_screener / filter_by_tickers / get_field_distribution / list_available_sectors

【搜索/日历】实时事件和日程
- google_search: 搜索最新新闻和事件
- get_earnings_calendar: 未来财报日历
- get_report_by_date / list_recent_reports: 历史日报

## 用户持仓感知

当有用户持仓数据时：
- 自然关联，不强行提及
- 讨论新闻时关联到用户持仓
- 推荐股票时说明与现有持仓的关系
- 风险分析时考虑组合集中度
```

## 实施顺序

```
Day 1: 工具函数
  - 创建 research_tools.py
  - 实现 6 个包装函数 + 输出裁剪逻辑
  - 测试每个函数独立运行正确

Day 2: Agent 集成
  - 注册 7 个新工具（6 函数 + google_search）
  - 更新 instruction prompt
  - guide() 接入 watchlist 注入
  - router 传入 user_id
  - 端到端测试：通过 /api/research/chat 验证工具被正确调用

Day 3: SSE 流式
  - research_agent.py 新增 guide_streaming() 方法
  - router.py 新增 /api/research/chat/stream 端点
  - 用 curl 验证 SSE 事件格式正确

Day 4: 前端 + 打磨
  - 前端解析新 SSE 事件类型
  - 工具调用状态 UI 组件
  - Prompt 精调（确保回答个性化、格式适合截图）
  - 输出格式优化

Day 5: 测试 + 素材
  - 真实持仓端到端测试
  - 边缘 case（空 watchlist、tool 超时、symbol 无效）
  - 截图/录屏准备社媒素材
```

## 关键文件

| 文件 | 操作 |
|------|------|
| `backend/app/features/screener/research_tools.py` | 新建 |
| `backend/app/features/screener/research_agent.py` | 修改（工具注册 + watchlist + streaming） |
| `backend/app/features/screener/router.py` | 修改（user_id 传递 + stream 端点） |
| `backend/app/shared/data_tools/news.py` | 只读（被包装） |
| `backend/app/shared/data_tools/market_data.py` | 只读（被包装） |
| `backend/app/shared/data_tools/technical.py` | 只读（被包装） |
| `backend/app/shared/data_tools/earnings.py` | 只读（被包装） |
| `backend/app/shared/yfinance_service.py` | 只读（被包装） |
| `backend/app/features/brew/db.py` | 只读（get_user_watchlist） |

## 验证方式

1. **工具函数测试**：`pytest tests/test_research_tools.py` — mock 底层服务，验证输出裁剪和 JSON 格式
2. **Agent 端到端**：`pytest -v --run-generate` — 真实 Gemini 调用，验证工具选择正确性
3. **SSE 流式验证**：`curl -N -X POST http://localhost:8000/api/research/chat/stream -H "Authorization: Bearer <token>" -d '{"message": "NVDA 最近怎么样"}'`
4. **前端验证**：打开 /research 页面，输入持仓相关问题，确认工具调用 UI + 回答带持仓视角

## 风险与降级

| 风险 | 降级方案 |
|------|---------|
| `google_search` 与 `output_schema` 冲突 | 改为自建 web_search 函数（用 Gemini with search=True 的独立调用） |
| 技术分析工具慢（3-5s） | 已有 15min 缓存；SSE 显示"正在分析..."让用户感知等待合理 |
| ADK Event 不暴露 function_call 信息 | 在 tool 函数入口手动 yield SSE 事件（用 ContextVar 传递 event emitter） |
| 13 个工具 token 占用大 | 保持 docstring 简短（2-3 行）；监控 token 使用；超出后考虑拆分 Agent |
