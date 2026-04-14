# Research Agent 工具扩展 V2 — 工程计划

> Status: Draft
> Priority: P1
> Timeline: 4-5 天
> Goal: 覆盖网站所有数据能力 + 桥接专业 AI Agent 到对话 + 面板交互联动

## Context

V1 upgrade (agent-upgrade.md) 已完成，Agent 从 6 个工具扩展到 13 个，解锁了行情、新闻、技术面、基本面、财报日历、Google 搜索。但仍有四大盲区：

1. **宏观分析完全缺失** — 用户问"宏观环境怎么样"、"流动性如何"、"通胀怎么样"，Agent 无法使用我们自己的结构化数据
2. **个股深度研究不足** — 缺少公司概况、同行对比、历史估值，无法回答"这家公司做什么"、"跟同行比怎么样"、"现在贵不贵"
3. **早报/周报不可访问** — 用户无法跟早报、周报内容进行对话
4. **5 个专业 AI Agent 未接入对话** — `fundamental.py`、`technical.py`、`earnings.py`、`news.py`、`macro.py` 只服务于独立页面 `/stock/[symbol]`，对话中拿不到它们的高质量中文分析

### 设计原则

- **报告类数据**（早报、周报、宏观风险）→ 返回预生成的成品，一次调用拿到完整叙事
- **查询类数据**（公司概况、同行对比、经济日历）→ 返回细粒度原始数据，Agent 按需组合
- **轻量 vs 深度分层** — 快速问价格/指标 → 原始数据工具（快，<1s）；用户要求"分析"/"研究" → 专业 Agent 工具（慢，3-8s，但质量远高于 Chat Agent 自行解读）
- **已有 AI 分析** → 不做成工具，继续用 content_context 注入作为背景知识

## 工具清单

### 一、原始数据工具（10 个新增）

#### 个股研究（3 个）

```
9.  get_company_profile(symbol: str) -> str
    - 来源：data_tools/fundamentals.py -> get_company_profile(symbol)
    - 返回：公司名称、行业、CEO、员工数、商业描述
    - 裁剪：description 截断到 500 字符，去掉 image/website 等无用字段

10. get_peer_comparison(symbol: str) -> str
    - 来源：data_tools/peers.py -> get_peer_companies(symbol) + get_peer_valuation(symbol, peers)
    - 返回：同行公司列表 + 目标公司 vs 同行的估值对比（PE/PB/PS/ROE/利润率）
    - 裁剪：同行最多 5 家，每家只保留 symbol + 核心估值指标（~8 字段）
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装

11. get_historical_valuation(symbol: str) -> str
    - 来源：data_tools/fundamentals.py -> get_historical_metrics(symbol, period="annual", limit=5)
    - 返回：最近 5 年的 PE/PB/PS/PEG/EV_EBITDA/ROE 趋势
    - 裁剪：每年只保留 date + 6 个核心指标
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装
```

#### 宏观行情（3 个）

```
13. get_macro_risk_summary() -> str
    - 来源：macro/risk/service.py -> get_macro_risk_dashboard()
    - 返回：4 维度风险评分（经济/信用/就业/AI健康度）+ 复合评分 + 风险等级
    - 裁剪：每个 category 只保留 name/name_zh/score/level/headline，
            去掉 indicators 细节和 ai_stocks 列表
    - 已有缓存：10 分钟内存 + DB 缓存

14. get_liquidity_overview() -> str
    - 来源：macro/liquidity/fred_service.py -> get_all_liquidity_metrics()
    - 返回：净流动性、Fed 资产、TGA、RRP、准备金、SOFR、EFFR、NFCI
    - 裁剪：每个指标只保留 title/value/date/change，去掉 series_id/units/previous_*
    - 已有缓存：10 分钟内存 + DB 缓存

15. get_market_sentiment() -> str
    - 来源：macro/risk/service.py -> get_market_sentiment()
    - 返回：CNN 恐贪指数总分 + 等级 + VIX 相关指标
    - 裁剪：保留 overall_score/overall_level/overall_headline，
            sub_dimensions 每个只保留 name_zh/score/risk_level/headline
    - 已有缓存：10 分钟内存 + DB 缓存
```

#### 事件日历（1 个）

```
18. get_economic_calendar(days: int = 14) -> str
    - 来源：data_tools/calendar.py -> get_economic_calendar(days)
    - 返回：未来 N 天高影响力美国经济事件（CPI、非农、FOMC 等）
    - 裁剪：每个事件只保留 date/event/previous/estimate/actual/is_key_event
    - 注意：底层是同步函数，需要 asyncio.to_thread 包装
```

#### 报告内容（2 个）

```
21. get_morning_report() -> str
    - 来源：morning_report/db.py -> get_latest_morning_report()
    - 返回：最新早报（盘前期货、全球市场、隔夜新闻、今日焦点、摘要）
    - 裁剪：futures 保留 symbol/name/price/change_pct（去掉原始数据），
            global_markets 每个区域最多 4 条，overnight_news 最多 5 条，
            today_focus 最多 5 条，去掉 market_data 原始对象
    - 无数据时返回 {"message": "今天还没有早报"}

22. get_weekly_report() -> str
    - 来源：macro/weekly/db.py -> get_latest_report()
    - 返回：最新周报（verdict、信号灯、4 维分析、投资启示、下周焦点）
    - 裁剪：保留 week_label/title/verdict/signal_lights/takeaway/week_ahead，
            4 个 *_analysis 各保留 headline + key_points（去掉 raw indicators），
            去掉 raw_data/landscape/narrative（太长）
    - 无数据时返回 {"message": "还没有最新周报"}
```

### 二、深度分析工具（3 个新增）

桥接 `backend/app/features/stock/agent/` 下已有的专业 AI Agent 到对话中。这些 Agent 拥有精心调教的 prompt（结论先行、中文分析、目标价分层计算等），输出质量远高于 Chat Agent 自行解读原始数据。

**使用时机**：用户明确要求"分析"、"研究"、"深入看看"某只股票时调用。快速查价格/指标时仍用原始数据工具。

```
23. analyze_stock_fundamentals(symbol: str) -> str
    """深度分析个股基本面。当用户要求"分析"、"研究"某只股票时使用。
    返回结构化中文分析：公司概况、财务健康、估值判断（含目标价）、催化剂与风险、投资摘要。
    耗时较长（5-10s），请配合 SSE 提示用户等待。"""
    - 来源：stock/agent/fundamental.py -> StockAnalysisAgent.analyze()
    - 前置数据：调用 StockService.get_stock_data(symbol) + get_valuation_comparison()
    - 返回：{title, company_profile, financial_health, valuation_judgment, catalysts_and_risks, investment_summary}
    - 特点：含目标价计算（3 层 fallback）、同行对比、历史估值上下文
    - 缓存：结果存 Insforge DB（24h TTL），先查缓存再生成

24. analyze_stock_technical(symbol: str) -> str
    """深度技术面分析。当用户问"技术面怎么看"、"现在能买吗"时使用。
    返回结构化中文分析：趋势分析、进出场信号、形态分析、技术摘要。
    耗时较长（3-5s）。"""
    - 来源：stock/agent/technical.py -> TechnicalAnalysisAgent.analyze()
    - 前置数据：调用 data_tools/technical.py -> get_technical_data(symbol)
    - 返回：{title, trend_analysis, entry_exit_signals, pattern_analysis, technical_summary}
    - 特点：翻译指标含义为白话、无比喻、结论先行

25. analyze_stock_earnings(symbol: str) -> str
    """深度财报分析。当用户问"财报怎么样"、"盈利趋势如何"时使用。
    返回结构化中文分析：财报概览、营收拆解、增长趋势、财报判断。
    智能模式切换：最新财报复盘 / 财报预览 / 历史回顾。耗时较长（3-5s）。"""
    - 来源：stock/agent/earnings.py -> EarningsAgent.analyze()
    - 前置数据：调用 StockService.get_earnings_data(symbol) + get_stock_quote()
    - 返回：{title, earnings_overview, revenue_breakdown, growth_trends, earnings_verdict}
    - 特点：自动识别是复盘最近一次财报还是展望下一次
```

**为什么不接入 news.py 和 macro.py Agent：**
- `news.py`：新闻时效性强，原始新闻 + Chat Agent 解读足够，且 news agent 需要较多前置数据组装
- `macro.py`：是 per-stock 的宏观影响分析（"利率对 AAPL 意味着什么"），而宏观问题更多是泛化的（"宏观环境怎么样"），原始宏观数据工具已覆盖。后续可视需求追加

**深度分析工具的实现模式：**

```python
async def analyze_stock_fundamentals(symbol: str) -> str:
    """深度分析个股基本面。当用户明确要求"分析"、"研究"某只股票时使用。
    返回包含公司概况、财务健康、估值判断（含目标价）、催化剂与风险的中文结构化分析。"""
    from app.features.stock.service import StockService
    from app.features.stock.agent.fundamental import StockAnalysisAgent

    service = StockService()
    agent = StockAnalysisAgent()

    # 查缓存
    cached = await get_stock_analysis(symbol, "comprehensive")
    if cached:
        return json.dumps(cached["content"], ensure_ascii=False)

    # 并行获取数据
    stock_data = await service.get_stock_data(symbol)
    profile = stock_data.get("profile", {})
    valuation = await service.get_valuation_comparison(
        symbol, profile.get("industry", ""), profile.get("sector", "")
    )
    stock_data["valuation_comparison"] = valuation

    # 调用专业 Agent
    result = await agent.analyze(stock_data)
    if result.get("meta", {}).get("error"):
        return json.dumps({"error": result["meta"]["error"]}, ensure_ascii=False)

    # 存缓存
    await save_stock_analysis(symbol, "comprehensive", result.get("analysis", {}), ...)

    return json.dumps(result.get("analysis", {}), ensure_ascii=False)
```

## 前端改动

### 右侧面板追问按钮

**问题**：右侧面板展示数据后，用户想追问需要自己在左侧输入框组织语言。面板和对话是两个孤立的世界。

**方案**：在右侧面板的关键数据区域增加 `SuggestedQuestions` 组件，点击直接发送到聊天。

**新建文件**：`frontend/src/app/research/_components/SuggestedQuestions.tsx`

```tsx
interface SuggestedQuestionsProps {
  questions: string[]
  onAsk: (question: string) => void
}

// 渲染为横向滚动的 chip 列表，点击触发 onAsk
```

**集成位置**（修改现有组件）：

| 组件 | 追问内容 |
|------|---------|
| `StockResearchView.tsx` 估值区域 | "这个估值在历史上处于什么水平？"、"跟同行比算贵吗？" |
| `StockResearchView.tsx` 分析区域 | "最大的风险是什么？"、"目标价怎么算的？" |
| `MacroOverview.tsx` 信号灯区域 | "这对科技股有什么影响？"、"现在适合加仓吗？" |
| `DailyReportView.tsx` 新闻区域 | "这条新闻对我的持仓有影响吗？"、"详细解释一下？" |

**数据流**：

```
SuggestedQuestions.onAsk(question)
  -> page.tsx 中通过 ref/callback 传到 handleSend(question)
  -> 发送消息时自动附带当前面板的 active_context
  -> Agent 收到问题 + 上下文，给出针对性回答
```

### Welcome 意图优化

**问题**：意图 2/3/4 选中后，Agent 只是被动等用户追问或导航到页面。应该主动调用工具给出回答。

**方案**：在 `RESEARCH_AGENT_INSTRUCTION` 中增加意图识别 + 主动行为指引。不改前端代码，纯 prompt 层面优化。

**在 instruction 中追加**：

```
## 意图识别与主动行为

当用户第一条消息匹配以下意图时，主动调用工具而非只回复文字：

### "帮我看一只股票" 类（用户提到具体 symbol）
1. 先调 get_stock_quote 获取实时价格
2. 用 1-2 句话概括当前状态（价格、涨跌、关键指标）
3. 问用户想深入了解哪个方面（基本面/技术面/财报/新闻）
4. 如果用户说"全面分析"，调用 analyze_stock_fundamentals

### "今天发生了什么" 类
1. 先调 get_market_overview 获取大盘状况
2. 再调 get_morning_report 或 get_report_by_date 获取今日报告
3. 用 3-5 句话总结今天最重要的 2-3 件事
4. 如果用户有持仓，关联到持仓影响

### "现在适合买吗" / "宏观环境" 类
1. 先调 get_macro_risk_summary + get_market_sentiment
2. 用 2-3 句话给出宏观环境判断（偏多/偏空/中性）
3. 如果用户有持仓，评估当前环境对持仓板块的影响
4. 给出具体建议（加仓/减仓/观望 + 理由）
```

## 修改文件清单

### `backend/app/features/screener/research_tools.py`

在现有工具后追加 13 个新函数（10 个原始数据 + 3 个深度分析），保持相同模式：

```python
# 追加到现有 research_data_tools
research_data_tools_v2 = [
    # 个股深度数据
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
    # 深度分析（调用专业 AI Agent）
    analyze_stock_fundamentals,
    analyze_stock_technical,
    analyze_stock_earnings,
]
```

### `backend/app/features/screener/research_agent.py`

**工具注册**（~line 507-513）：
- 导入新工具并加入 `research_tools` 列表

**工具描述映射**（~line 48-66 `_TOOL_DESCRIPTIONS`）：
```python
# 原始数据工具
"get_company_profile": lambda a: "正在查看 %s 的公司概况..." % a.get("symbol", ""),
"get_peer_comparison": lambda a: "正在对比 %s 与同行..." % a.get("symbol", ""),
"get_historical_valuation": lambda a: "正在查看 %s 的历史估值..." % a.get("symbol", ""),
"get_macro_risk_summary": lambda _: "正在评估宏观风险...",
"get_liquidity_overview": lambda _: "正在查看流动性指标...",
"get_market_sentiment": lambda _: "正在分析市场情绪...",
"get_economic_calendar": lambda _: "正在查询经济日历...",
"get_morning_report": lambda _: "正在获取今日早报...",
"get_weekly_report": lambda _: "正在获取最新周报...",
# 深度分析工具
"analyze_stock_fundamentals": lambda a: "正在深度分析 %s 的基本面..." % a.get("symbol", ""),
"analyze_stock_technical": lambda a: "正在深度分析 %s 的技术面..." % a.get("symbol", ""),
"analyze_stock_earnings": lambda a: "正在深度分析 %s 的财报..." % a.get("symbol", ""),
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

### 个股研究 — 轻量查询（快速，<1s）
- `get_stock_quote(symbols)`: 实时价格和表现（最多 20 只）
- `get_stock_fundamentals(symbol)`: 估值、盈利、增长、分析师目标价
- `get_technical_analysis(symbol)`: RSI、MACD、均线、支撑阻力、买卖评级
- `get_stock_news(symbols, days)`: 个股相关新闻（最近 12 条）
- `get_company_profile(symbol)`: 公司做什么、行业、CEO、规模
- `get_peer_comparison(symbol)`: 跟同行对比估值和盈利能力
- `get_historical_valuation(symbol)`: 历史 PE/PB/PS 趋势，判断贵不贵

### 个股研究 — 深度分析（调用专业 AI Agent，5-10s）
- `analyze_stock_fundamentals(symbol)`: 完整基本面分析（公司概况 + 财务 + 估值判断 + 目标价 + 风险）
- `analyze_stock_technical(symbol)`: 完整技术面分析（趋势 + 信号 + 形态 + 摘要）
- `analyze_stock_earnings(symbol)`: 完整财报分析（业绩 + 营收拆解 + 增长趋势 + 判断）

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

## Tool Selection — 轻量 vs 深度决策

**核心原则**：先轻后重。大多数问题用原始数据工具 + 你的解读就够了。只有用户明确要求深度分析时才调用 AI Agent 工具。

**轻量查询（用原始数据工具）**：
- "AAPL 多少钱" → get_stock_quote
- "PE 多少" → get_stock_fundamentals
- "RSI 多少" → get_technical_analysis
- "跟同行比怎么样" → get_peer_comparison
- "宏观环境怎么样" → get_macro_risk_summary + get_market_sentiment
- "今天早报说了什么" → get_morning_report

**深度分析（用 AI Agent 工具）**：
- "帮我分析 AAPL" / "深入研究一下" → analyze_stock_fundamentals
- "技术面怎么看" / "现在能买吗" → analyze_stock_technical
- "财报怎么样" / "盈利趋势如何" → analyze_stock_earnings
- "全面分析" → analyze_stock_fundamentals + analyze_stock_technical

**识别信号词**：
- 深度触发词："分析"、"研究"、"深入"、"详细看看"、"帮我看看"、"全面"
- 轻量触发词："多少"、"现在"、"价格"、"查一下"、"是什么"

**深度分析输出处理**：
- 深度工具返回的是已格式化的中文分析，不要重新改写
- 提取 title 和关键结论用 1-2 句话总结
- 告诉用户"详细分析如下"，然后展示完整内容
- 如果用户追问分析中的某个点，用原始数据工具补充细节

## 意图识别与主动行为

当用户第一条消息匹配以下意图时，主动调用工具而非只回复文字：

### "帮我看一只股票" 类（用户提到具体 symbol）
1. 先调 get_stock_quote 获取实时价格
2. 用 1-2 句话概括当前状态（价格、涨跌、关键指标）
3. 问用户想深入了解哪个方面（基本面/技术面/财报/新闻）
4. 如果用户说"全面分析"，调用 analyze_stock_fundamentals

### "今天发生了什么" 类
1. 先调 get_market_overview 获取大盘状况
2. 再调 get_morning_report 或 get_report_by_date 获取今日报告
3. 用 3-5 句话总结今天最重要的 2-3 件事
4. 如果用户有持仓，关联到持仓影响

### "现在适合买吗" / "宏观环境" 类
1. 先调 get_macro_risk_summary + get_market_sentiment
2. 用 2-3 句话给出宏观环境判断（偏多/偏空/中性）
3. 如果用户有持仓，评估当前环境对持仓板块的影响
4. 给出具体建议（加仓/减仓/观望 + 理由）
```

## 实施顺序

```
Day 1: 原始数据工具函数
  - research_tools.py 追加 10 个原始数据包装函数
  - 每个函数：导入 -> 调用 -> 裁剪 -> JSON 序列化
  - 同步函数统一用 asyncio.to_thread 包装
  - 异步函数直接 await
  - 每个函数手动验证输出（pytest 或 shell 调用）

Day 2: 深度分析工具函数
  - research_tools.py 追加 3 个深度分析包装函数
  - 每个函数：查缓存 -> 获取前置数据 -> 调用专业 Agent -> 存缓存 -> 返回
  - 复用 StockService + StockAnalysisAgent 等已有类
  - 验证：symbol = "AAPL" 端到端调用，确认返回完整中文分析

Day 3: Agent 集成 + Instruction 更新
  - 注册 13 个新工具到 research_tools 列表
  - 更新 _TOOL_DESCRIPTIONS 映射（12 条新增）
  - 替换 instruction 的 Research Tools Guide 部分
  - 追加"轻量 vs 深度决策"和"意图识别"指引
  - 端到端测试：通过 /api/research/chat 验证工具选择
  - 测试场景：
    - "宏观环境怎么样" -> 应调用 get_macro_risk_summary（轻量）
    - "NVDA 跟 AMD 比怎么样" -> 应调用 get_peer_comparison（轻量）
    - "帮我深入分析 AAPL" -> 应调用 analyze_stock_fundamentals（深度）
    - "TSLA 技术面怎么看" -> 应调用 analyze_stock_technical（深度）
    - "今天早报说了什么" -> 应调用 get_morning_report
    - "最近流动性怎么样" -> 应调用 get_liquidity_overview

Day 4: 前端 — 右侧面板追问按钮
  - 新建 SuggestedQuestions.tsx 组件
  - 集成到 StockResearchView / MacroOverview / DailyReportView
  - 通过 page.tsx 的 handleSend 连接到聊天
  - 验证：点击追问按钮 -> 左侧发送消息 -> Agent 带上下文回答

Day 5: 打磨 + 边缘 case
  - 空数据处理（无早报、无周报、无同行数据、分析 Agent 超时）
  - Token 使用监控（25 个工具的 docstring 总占用）
  - 深度分析工具的 SSE 流式体验（长等待时的用户反馈）
  - Prompt 精调（确保轻量/深度选择准确率 + 意图主动行为触发率）
  - 截图/录屏准备社媒素材
```

## 关键文件

| 文件 | 操作 |
|------|------|
| `backend/app/features/screener/research_tools.py` | 修改（追加 10 + 3 个工具函数） |
| `backend/app/features/screener/research_agent.py` | 修改（注册工具 + 描述映射 + instruction） |
| `backend/app/shared/data_tools/fundamentals.py` | 只读（get_company_profile, get_historical_metrics） |
| `backend/app/shared/data_tools/peers.py` | 只读（get_peer_companies, get_peer_valuation） |
| `backend/app/shared/data_tools/calendar.py` | 只读（get_economic_calendar） |
| `backend/app/features/macro/risk/service.py` | 只读（get_macro_risk_dashboard, get_market_sentiment） |
| `backend/app/features/macro/liquidity/fred_service.py` | 只读（get_all_liquidity_metrics） |
| `backend/app/features/morning_report/db.py` | 只读（get_latest_morning_report） |
| `backend/app/features/macro/weekly/db.py` | 只读（get_latest_report） |
| `backend/app/features/stock/agent/fundamental.py` | 只读（StockAnalysisAgent） |
| `backend/app/features/stock/agent/technical.py` | 只读（TechnicalAnalysisAgent） |
| `backend/app/features/stock/agent/earnings.py` | 只读（EarningsAgent） |
| `backend/app/features/stock/service.py` | 只读（StockService） |
| `frontend/src/app/research/_components/SuggestedQuestions.tsx` | 新建 |
| `frontend/src/app/research/_components/StockResearchView.tsx` | 修改（集成追问按钮） |
| `frontend/src/app/research/_components/MacroOverview.tsx` | 修改（集成追问按钮） |
| `frontend/src/app/research/_components/DailyReportView.tsx` | 修改（集成追问按钮） |

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
| analyze_stock_fundamentals | StockService + StockAnalysisAgent | 异步 | 直接 await |
| analyze_stock_technical | get_technical_data + TechnicalAnalysisAgent | 混合 | asyncio.to_thread(data) + await agent |
| analyze_stock_earnings | StockService + EarningsAgent | 异步 | 直接 await |

## 风险与降级

| 风险 | 降级方案 |
|------|---------|
| 25 个工具 docstring 占用过多 token | 保持 docstring 2-3 行；监控 token；超出后拆分 sub-agent |
| 宏观工具调用慢（FRED API 3-5s） | 已有 10 分钟缓存 + 请求合并；SSE 显示"正在评估宏观风险..." |
| 早报/周报为空（未生成） | 工具返回友好提示 {"message": "今天还没有早报"} |
| 同行对比无数据（小盘股） | 返回 {"message": "暂无同行数据"} |
| 工具选择错误率上升 | instruction 中明确轻量/深度决策树 + Tool Selection Priority |
| 深度分析工具超时（Agent 调用 5-10s） | SSE 显示"正在深度分析..."；设 30s 超时；超时后降级为原始数据 + Chat Agent 解读 |
| 深度分析 token 开销大（子 Agent 调用） | 24h DB 缓存避免重复生成；监控每次分析的 token 消耗 |
| 轻量/深度选择不准确 | instruction 中明确信号词；前 2 周收集 case，迭代 prompt |

## 完成后工具总览（25 个）

| # | 工具 | 分组 | 类型 | 状态 |
|---|------|------|------|------|
| 1 | execute_screener | 选股筛选 | 原始数据 | 已有 |
| 2 | filter_by_tickers | 选股筛选 | 原始数据 | 已有 |
| 3 | get_field_distribution | 选股筛选 | 原始数据 | 已有 |
| 4 | list_available_sectors | 选股筛选 | 原始数据 | 已有 |
| 5 | get_stock_quote | 个股研究 | 原始数据 | 已有 |
| 6 | get_stock_fundamentals | 个股研究 | 原始数据 | 已有 |
| 7 | get_technical_analysis | 个股研究 | 原始数据 | 已有 |
| 8 | get_stock_news | 个股研究 | 原始数据 | 已有 |
| 9 | get_company_profile | 个股研究 | 原始数据 | V2 新增 |
| 10 | get_peer_comparison | 个股研究 | 原始数据 | V2 新增 |
| 11 | get_historical_valuation | 个股研究 | 原始数据 | V2 新增 |
| 12 | get_market_overview | 宏观行情 | 原始数据 | 已有 |
| 13 | get_macro_risk_summary | 宏观行情 | 原始数据 | V2 新增 |
| 14 | get_liquidity_overview | 宏观行情 | 原始数据 | V2 新增 |
| 15 | get_market_sentiment | 宏观行情 | 原始数据 | V2 新增 |
| 16 | get_earnings_calendar | 事件日历 | 原始数据 | 已有 |
| 17 | get_economic_calendar | 事件日历 | 原始数据 | V2 新增 |
| 18 | get_report_by_date | 报告内容 | 原始数据 | 已有 |
| 19 | list_recent_reports | 报告内容 | 原始数据 | 已有 |
| 20 | get_morning_report | 报告内容 | 原始数据 | V2 新增 |
| 21 | get_weekly_report | 报告内容 | 原始数据 | V2 新增 |
| 22 | google_search | 实时搜索 | 外部 | 已有 |
| 23 | analyze_stock_fundamentals | 深度分析 | AI Agent | V2 新增 |
| 24 | analyze_stock_technical | 深度分析 | AI Agent | V2 新增 |
| 25 | analyze_stock_earnings | 深度分析 | AI Agent | V2 新增 |
