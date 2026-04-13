# Research Agent 工具扩展 V2 — 工程计划

> Status: Draft
> Priority: P1
> Timeline: 2-3 天
> Goal: 让 Agent 覆盖网站所有数据能力，支持宏观、个股深度研究、报告内容对话

## Context

V1 upgrade (agent-upgrade.md) 已完成，Agent 从 6 个工具扩展到 13 个，解锁了行情、新闻、技术面、基本面、财报日历、Google 搜索。但仍有三大盲区：

1. **宏观分析完全缺失** — 用户问"宏观环境怎么样"、"流动性如何"、"通胀怎么样"，Agent 无法使用我们自己的结构化数据
2. **个股深度研究不足** — 缺少公司概况、同行对比、历史估值，无法回答"这家公司做什么"、"跟同行比怎么样"、"现在贵不贵"
3. **早报/周报不可访问** — 用户无法跟早报、周报内容进行对话

### 设计原则

- **报告类数据**（早报、周报、宏观风险）→ 返回预生成的成品，一次调用拿到完整叙事
- **查询类数据**（公司概况、同行对比、经济日历）→ 返回细粒度原始数据，Agent 按需组合
- **已有 AI 分析** → 不做成工具，继续用 content_context 注入作为背景知识

## 工具清单（10 个新增）

### 个股研究（3 个）

```
9.  get_company_profile(symbol: str) -> str
    - 来源：data_tools/fundamentals.py → get_company_profile(symbol)
    - 返回：公司名称、行业、CEO、员工数、商业描述
    - 裁剪：description 截断到 500 字符，去掉 image/website 等无用字段

10. get_peer_comparison(symbol: str) -> str
    - 来源：data_tools/peers.py → get_peer_companies(symbol) + get_peer_valuation(symbol, peers)
    - 返回：同行公司列表 + 目标公司 vs 同行的估值对比（PE/PB/PS/ROE/利润率）
    - 裁剪：同行最多 5 家，每家只保留 symbol + 核心估值指标（~8 字段）
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装

11. get_historical_valuation(symbol: str) -> str
    - 来源：data_tools/fundamentals.py → get_historical_metrics(symbol, period="annual", limit=5)
    - 返回：最近 5 年的 PE/PB/PS/PEG/EV_EBITDA/ROE 趋势
    - 裁剪：每年只保留 date + 6 个核心指标
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装
```

### 宏观行情（3 个）

```
13. get_macro_risk_summary() -> str
    - 来源：macro/risk/service.py → get_macro_risk_dashboard()
    - 返回：4 维度风险评分（经济/信用/就业/AI健康度）+ 复合评分 + 风险等级
    - 裁剪：每个 category 只保留 name/name_zh/score/level/headline，
            去掉 indicators 细节和 ai_stocks 列表
    - 已有缓存：10 分钟内存 + DB 缓存

14. get_liquidity_overview() -> str
    - 来源：macro/liquidity/fred_service.py → get_all_liquidity_metrics()
    - 返回：净流动性、Fed 资产、TGA、RRP、准备金、SOFR、EFFR、NFCI
    - 裁剪：每个指标只保留 title/value/date/change，去掉 series_id/units/previous_*
    - 已有缓存：10 分钟内存 + DB 缓存

15. get_market_sentiment() -> str
    - 来源：macro/risk/service.py → get_market_sentiment()
    - 返回：CNN 恐贪指数总分 + 等级 + VIX 相关指标
    - 裁剪：保留 overall_score/overall_level/overall_headline，
            sub_dimensions 每个只保留 name_zh/score/risk_level/headline
    - 已有缓存：10 分钟内存 + DB 缓存
```

### 事件日历（1 个）

```
18. get_economic_calendar(days: int = 14) -> str
    - 来源：data_tools/calendar.py → get_economic_calendar(days)
    - 返回：未来 N 天高影响力美国经济事件（CPI、非农、FOMC 等）
    - 裁剪：每个事件只保留 date/event/previous/estimate/actual/is_key_event
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装
```

### 报告内容（2 个）

```
21. get_morning_report() -> str
    - 来源：morning_report/db.py → get_latest_morning_report()
    - 返回：最新早报（盘前期货、全球市场、隔夜新闻、今日焦点、摘要）
    - 裁剪：futures 保留 symbol/name/price/change_pct（去掉原始数据），
            global_markets 每个区域最多 4 条，overnight_news 最多 5 条，
            today_focus 最多 5 条，去掉 market_data 原始对象
    - 无数据时返回 {"message": "今天还没有早报"}

22. get_weekly_report() -> str
    - 来源：macro/weekly/db.py → get_latest_report()
    - 返回：最新周报（verdict、信号灯、4 维分析、投资启示、下周焦点）
    - 裁剪：保留 week_label/title/verdict/signal_lights/takeaway/week_ahead，
            4 个 *_analysis 各保留 headline + key_points（去掉 raw indicators），
            去掉 raw_data/landscape/narrative（太长）
    - 无数据时返回 {"message": "还没有最新周报"}
```

### CPI 拆解（从 get_macro_risk_summary 独立出来）

> 讨论后决定不单独做 get_cpi_breakdown 工具。原因：
> 1. CPI 数据在 get_macro_risk_summary 的通胀维度中已有概要
> 2. 用户真正追问通胀细节时，Agent 可用 google_search 补充
> 3. 减少工具数量从 24 → 23，保持精简

## 修改文件

### `backend/app/features/screener/research_tools.py`

在现有 6 个工具后追加 10 个新函数，保持相同模式：

```python
# 新增工具导出列表（追加到现有 research_data_tools）
research_data_tools_v2 = [
    # 个股深度
    get_company_profile,
    get_peer_comparison,
    get_historical_valuation,
    # 宏观
    get_macro_risk_summary,
    get_liquidity_overview,
    get_market_sentiment,
    # 事件
    get_economic_calendar,
    # 报告
    get_morning_report,
    get_weekly_report,
]
```

或者直接追加到现有的 `research_data_tools` 列表中。

### `backend/app/features/screener/research_agent.py`

**工具注册**（~line 507-513）：
- 导入新工具并加入 `research_tools` 列表

**工具描述映射**（~line 48-66 `_TOOL_DESCRIPTIONS`）：
```python
# 新增映射
"get_company_profile": lambda a: "正在查看 %s 的公司概况..." % a.get("symbol", ""),
"get_peer_comparison": lambda a: "正在对比 %s 与同行..." % a.get("symbol", ""),
"get_historical_valuation": lambda a: "正在查看 %s 的历史估值..." % a.get("symbol", ""),
"get_macro_risk_summary": lambda _: "正在评估宏观风险...",
"get_liquidity_overview": lambda _: "正在查看流动性指标...",
"get_market_sentiment": lambda _: "正在分析市场情绪...",
"get_economic_calendar": lambda _: "正在查询经济日历...",
"get_morning_report": lambda _: "正在获取今日早报...",
"get_weekly_report": lambda _: "正在获取最新周报...",
```

**Instruction Prompt 更新**（~line 853 "Research Tools Guide"）：

替换现有工具指南为完整的分组说明：

```
## Research Tools Guide

### 选股筛选 — 用户要找股票
- `execute_screener`: 按条件筛选（PE、市值、行业等）
- `filter_by_tickers`: 按代码查找特定股票
- `get_field_distribution`: 查看某个指标的分布
- `list_available_sectors`: 列出所有可筛选的板块

### 个股研究 — 分析某只股票
- `get_stock_quote(symbols)`: 实时价格和表现（最多 20 只）
- `get_stock_fundamentals(symbol)`: 估值、盈利、增长、分析师目标价
- `get_technical_analysis(symbol)`: RSI、MACD、均线、支撑阻力、买卖评级
- `get_stock_news(symbols, days)`: 个股相关新闻（最近 12 条）
- `get_company_profile(symbol)`: 公司做什么、行业、CEO、规模
- `get_peer_comparison(symbol)`: 跟同行对比估值和盈利能力
- `get_historical_valuation(symbol)`: 历史 PE/PB/PS 趋势，判断贵不贵

### 宏观环境 — 大盘和宏观分析
- `get_market_overview`: 指数、VIX、国债利率、商品、汇率
- `get_macro_risk_summary`: 4 维度宏观风险评分（经济/信用/就业/AI健康度）
- `get_liquidity_overview`: 美联储净流动性、TGA、RRP、准备金
- `get_market_sentiment`: CNN 恐贪指数、VIX、市场情绪等级

### 事件与日历
- `get_earnings_calendar(days)`: 未来财报日期
- `get_economic_calendar(days)`: 高影响力经济事件（CPI、非农、FOMC）

### 报告内容 — 查看已生成的分析报告
- `get_report_by_date(date)` / `list_recent_reports`: 市场日报
- `get_morning_report`: 今日盘前早报（期货、全球市场、隔夜新闻）
- `get_weekly_report`: 最新周报（四维宏观分析 + 投资启示）

### 实时搜索
- `google_search`: 搜最新新闻和事件，仅在其他工具无法回答时使用

### Tool Selection Priority
1. 问大盘/宏观 → get_market_overview + get_macro_risk_summary + get_liquidity_overview
2. 问个股 → get_stock_quote → 按需追加 fundamentals/technical/news/profile/peers
3. 问"贵不贵" → get_historical_valuation + get_peer_comparison
4. 问市场情绪 → get_market_sentiment
5. 问事件/日程 → get_economic_calendar + get_earnings_calendar
6. 问报告内容 → get_morning_report / get_weekly_report / get_report_by_date
7. 问筛选 → execute_screener + filter_by_tickers
8. 以上都答不了 → google_search
```

## 实施顺序

```
Day 1: 工具函数实现
  - research_tools.py 追加 10 个包装函数
  - 每个函数：导入 → 调用 → 裁剪 → JSON 序列化
  - 同步函数统一用 asyncio.to_thread 包装
  - 异步函数直接 await
  - 每个函数手动验证输出（pytest 或 shell 调用）

Day 2: Agent 集成 + Instruction 更新
  - 注册 10 个新工具到 research_tools 列表
  - 更新 _TOOL_DESCRIPTIONS 映射（9 条新增）
  - 替换 instruction 的 Research Tools Guide 部分
  - 端到端测试：通过 /api/research/chat 验证新工具被正确调用
  - 测试场景：
    - "宏观环境怎么样" → 应调用 get_macro_risk_summary
    - "NVDA 跟 AMD 比怎么样" → 应调用 get_peer_comparison
    - "今天早报说了什么" → 应调用 get_morning_report
    - "最近流动性怎么样" → 应调用 get_liquidity_overview
    - "AAPL 现在贵不贵" → 应调用 get_historical_valuation

Day 3: 打磨 + 边缘 case
  - 空数据处理（无早报、无周报、无同行数据）
  - Token 使用监控（23 个工具的 docstring 总占用）
  - Prompt 精调（确保工具选择准确率）
  - SSE 流式验证（新工具的 tool_call_start 描述正确）
```

## 关键文件

| 文件 | 操作 |
|------|------|
| `backend/app/features/screener/research_tools.py` | 修改（追加 10 个工具函数） |
| `backend/app/features/screener/research_agent.py` | 修改（注册工具 + 描述映射 + instruction） |
| `backend/app/shared/data_tools/fundamentals.py` | 只读（get_company_profile, get_historical_metrics） |
| `backend/app/shared/data_tools/peers.py` | 只读（get_peer_companies, get_peer_valuation） |
| `backend/app/shared/data_tools/calendar.py` | 只读（get_economic_calendar） |
| `backend/app/features/macro/risk/service.py` | 只读（get_macro_risk_dashboard, get_market_sentiment） |
| `backend/app/features/macro/liquidity/fred_service.py` | 只读（get_all_liquidity_metrics） |
| `backend/app/features/morning_report/db.py` | 只读（get_latest_morning_report） |
| `backend/app/features/macro/weekly/db.py` | 只读（get_latest_report） |

## 同步/异步处理

| 工具 | 底层函数 | 类型 | 包装方式 |
|------|---------|------|---------|
| get_company_profile | fundamentals.get_company_profile | 同步 | asyncio.to_thread |
| get_peer_comparison | peers.get_peer_companies + get_peer_valuation | 同步 | asyncio.to_thread |
| get_historical_valuation | fundamentals.get_historical_metrics | 同步 | asyncio.to_thread |
| get_macro_risk_summary | risk/service.get_macro_risk_dashboard | 异步 | 直接 await |
| get_liquidity_overview | fred_service.get_all_liquidity_metrics | 异步 | 直接 await |
| get_market_sentiment | risk/service.get_market_sentiment | 异步 | 直接 await |
| get_economic_calendar | calendar.get_economic_calendar | 同步 | asyncio.to_thread |
| get_morning_report | morning_report/db.get_latest_morning_report | 异步 | 直接 await |
| get_weekly_report | macro/weekly/db.get_latest_report | 异步 | 直接 await |

## 风险与降级

| 风险 | 降级方案 |
|------|---------|
| 23 个工具 docstring 占用过多 token | 保持 docstring 2-3 行；监控 token；超出后拆分 sub-agent |
| 宏观工具调用慢（FRED API 3-5s） | 已有 10 分钟缓存 + 请求合并；SSE 显示"正在评估宏观风险..." |
| 早报/周报为空（未生成） | 工具返回友好提示 {"message": "今天还没有早报"} |
| 同行对比无数据（小盘股） | 返回 {"message": "暂无同行数据"} |
| 工具选择错误率上升 | instruction 中明确 Tool Selection Priority 决策树 |

## 完成后工具总览（23 个）

| # | 工具 | 分组 | 状态 |
|---|------|------|------|
| 1 | execute_screener | 选股筛选 | 已有 |
| 2 | filter_by_tickers | 选股筛选 | 已有 |
| 3 | get_field_distribution | 选股筛选 | 已有 |
| 4 | list_available_sectors | 选股筛选 | 已有 |
| 5 | get_stock_quote | 个股研究 | 已有 |
| 6 | get_stock_fundamentals | 个股研究 | 已有 |
| 7 | get_technical_analysis | 个股研究 | 已有 |
| 8 | get_stock_news | 个股研究 | 已有 |
| 9 | get_company_profile | 个股研究 | 新增 |
| 10 | get_peer_comparison | 个股研究 | 新增 |
| 11 | get_historical_valuation | 个股研究 | 新增 |
| 12 | get_market_overview | 宏观行情 | 已有 |
| 13 | get_macro_risk_summary | 宏观行情 | 新增 |
| 14 | get_liquidity_overview | 宏观行情 | 新增 |
| 15 | get_market_sentiment | 宏观行情 | 新增 |
| 16 | get_earnings_calendar | 事件日历 | 已有 |
| 17 | get_economic_calendar | 事件日历 | 新增 |
| 18 | get_report_by_date | 报告内容 | 已有 |
| 19 | list_recent_reports | 报告内容 | 已有 |
| 20 | get_morning_report | 报告内容 | 新增 |
| 21 | get_weekly_report | 报告内容 | 新增 |
| 22 | google_search | 实时搜索 | 已有 |
