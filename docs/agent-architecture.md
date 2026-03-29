# TheMarketBrew AI Agent 架构详解

> 面试准备用。最后更新：2026-03-26

---

## 一、Agent 体系总览

### 框架选型：Google ADK

Google ADK (Agent Development Kit) 的核心 API：

```python
# 定义 Agent — 两个类就够了
agent = LlmAgent(
    model="gemini-3.1-flash-lite-preview",
    name="analyst",
    instruction=SYSTEM_PROMPT,         # 中文系统提示词
    output_schema=AnalysisOutput,      # Pydantic → 强制结构化 JSON
    output_key="analysis",             # 存储到 session.state 的 key
)
runner = InMemoryRunner(agent=agent, app_name="stock_analysis")
```

**为什么不用 LangChain？** 我们的场景是确定性 pipeline（数据进 → 报告出），ADK 的 Pydantic output_schema 原生强制输出格式，20 行代码搞定一个 Agent，不需要 Chain/Pipeline/OutputParser 一大堆抽象。

### 两种 Agent 范式

```
┌───────────────────────────────────────────────────────────────┐
│ Structured Output (8 个)              Tool-Use 对话 (1 个)     │
│                                                               │
│  数据 → LLM → 结构化 JSON             多轮对话 + Function Tools │
│  单轮，无工具调用                       累积式筛选 + 面板导航     │
│                                                               │
│  日报 · 早报 · 摘要 · 周报             ResearchAgent            │
│  基本面 · 技术面 · 新闻面 · 宏观面       (AI 选股助手)            │
└───────────────────────────────────────────────────────────────┘
```

### 统一数据流 (Structured Output Agent)

```
Step 1  asyncio.gather() 并行获取多源数据
Step 2  Python 清洗 (减少 30-45% tokens，去垃圾新闻/截断/过滤)
Step 3  Gemini LLM → Pydantic output_schema 强制结构化输出
Step 4  Python 后处理 (URL 解析、时间戳补全)
Step 5  异步写入 DB (非阻塞)
```

### Agent 清单

| Agent | 模型 | 缓存 | 核心能力 |
|-------|------|------|---------|
| MarketAgent | Pro | 按日期 | 市场日报，加载前5天实现叙事连续性 |
| MorningAgent | Flash Lite | 按日期 | 盘前早报，仅隔夜数据+今日关注 |
| PersonalDigest | Pro | user+日期 | 围绕用户自选股定制，检测自选股变化 |
| WeeklyAgent | Pro | 按周标签 | 4维宏观分析+信号灯，最复杂的 prompt |
| StockAnalysis×4 | Flash Lite | 8h-7天 | 基本面/技术面/新闻面/宏观面，4个独立Agent并行 |
| **ResearchAgent** | **Flash** | **无** | **多轮对话选股，6个Tools，上下文感知** |

### 容错机制

```
正常执行 → Gemini Pro/Flash
    │
    └─ 503 (模型过载) → 自动切换 Flash Lite → 执行 → 恢复原模型
```

---

## 二、Research Agent 深度解析

### 产品定位

Research Agent 是一个**对话式选股助手**，面向完全的投资新手。用户不需要懂任何金融术语，通过自然对话就能找到符合自己偏好的股票。

```
┌──────────────────────────────────────────────────────────────┐
│                     /research 页面布局                         │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │     左侧: 对话面板    │  │    右侧: 结果面板             │   │
│  │                     │  │                             │   │
│  │  🤖 "想找什么股票？"  │  │  [股票卡片列表]              │   │
│  │                     │  │  AAPL  $198  +1.2%          │   │
│  │  👤 "稳定分红的大公司" │  │  JNJ   $155  +0.3%          │   │
│  │                     │  │  PG    $168  -0.1%          │   │
│  │  🤖 "找到 23 只..."  │  │  ...                        │   │
│  │  [只看科技] [提高股息] │  │                             │   │
│  │  [换个方向]          │  │  或: 日报/个股/宏观 等视图     │   │
│  │                     │  │                             │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 与其他 Agent 的本质区别

| 维度 | 报告类 Agent | Research Agent |
|------|------------|----------------|
| 交互模式 | 单轮：数据进 → 报告出 | 多轮对话，状态累积 |
| 工具使用 | 无（纯文本生成） | 6 个 Function Tools |
| 输出 | 固定结构报告 | 动态：消息 + 选项 + 筛选 + 导航 |
| 数据来源 | Agent 启动前 Python 获取 | Agent 运行中自主调用 Tools 获取 |
| 人格 | 专业分析师 | 友好的朋友，禁止金融术语 |

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                   ResearchAgent 架构                          │
│                                                              │
│  用户消息 + 对话历史 + 页面上下文                               │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────┐                │
│  │         Gemini LLM (Flash)              │                │
│  │                                         │                │
│  │  System Prompt:                         │                │
│  │  · 友好向导人格                           │                │
│  │  · 术语翻译规则                           │                │
│  │  · 对话循环逻辑                           │                │
│  │  · 筛选策略指南                           │                │
│  │  · 上下文感知规则                         │                │
│  │                                         │                │
│  │  ┌─ Tools ────────────────────────┐     │                │
│  │  │ execute_screener()    筛选股票   │     │                │
│  │  │ filter_by_tickers()   主题过滤   │     │                │
│  │  │ get_field_distribution() 数据分布│     │                │
│  │  │ list_available_sectors() 板块列表│     │                │
│  │  │ get_report_by_date()  查日报     │     │                │
│  │  │ list_recent_reports() 近期日报   │     │                │
│  │  └────────────────────────────────┘     │                │
│  └────────────────┬────────────────────────┘                │
│                   │                                          │
│                   ▼                                          │
│  ┌─────────────────────────────────────────┐                │
│  │        ResearchAgentOutput (Pydantic)   │                │
│  │                                         │                │
│  │  message          中文回复               │                │
│  │  options[]        可点击选项 (3-5个)      │                │
│  │  filters[]        累积筛选条件            │                │
│  │  update_results   是否刷新右侧面板        │                │
│  │  recommendations[] 推荐理由 (≤15只时)     │                │
│  │  title            选股方向标题            │                │
│  │  navigate         面板导航指令            │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 核心机制 1：对话循环

Agent 每轮都执行同一个决策循环：

```
用户输入
   │
   ├─ 判断意图 ──→ 改变筛选条件?
   │                ├─ YES → 更新 filters + update_results=true
   │                │        调用 execute_screener 验证结果数
   │                │        结果 ≤15 → 附上 recommendations
   │                │
   │                ├─ NO  → 保持 filters + update_results=false
   │                │        回答关于现有结果的问题
   │                │
   │                └─ RESET → filters=[] + update_results=true
   │                           用户说"换个方向"
   │
   └─ 生成回复 + 3-5 个后续选项
```

**关键设计**：`update_results` 字段控制右侧面板是否刷新。用户问"这几只里哪个最稳？"时不应该刷新列表，只有修改条件时才刷新。

### 核心机制 2：两种筛选模式

```
模式 A: 结构化筛选 (execute_screener)
─────────────────────────────────────
用户: "PE低于15，ROE高于20%的软件股"
  ↓
Agent 构建 filters:
  [{"field": "pe_ttm", "op": "lt", "value": 15},
   {"field": "roe", "op": "gt", "value": 20},
   {"field": "sector", "op": "eq", "value": "Technology Services"}]
  ↓
execute_screener(filters_json) → 在 ~5800 只股票中执行
  ↓
返回: match_count + preview (top 10 with key metrics)


模式 B: 主题筛选 (filter_by_tickers)
─────────────────────────────────────
用户: "AI芯片相关的股票"
  ↓
Agent 凭自身知识列出所有相关 ticker (尽可能多):
  ["NVDA", "AMD", "AVGO", "MRVL", "INTC", "QCOM", "ARM", ...]
  ↓
filter_by_tickers(tickers) → 自动过滤不在 universe 中的
  ↓
两种模式可以组合: 主题 + 结构化条件
  例: AI芯片 + PE < 30 + 市值 > 100B
```

**为什么主题筛选让 LLM 列 ticker？** 因为"AI芯片"这种概念无法用字段过滤表达。Agent 利用 LLM 的知识把概念映射成具体公司列表，再交给筛选引擎过滤。

### 核心机制 3：累积式筛选

```
Turn 1: "分红稳定的"
  filters: [{"field":"dividend_yield","op":"gt","value":2},
            {"field":"dividend_payout_years","op":"gte","value":5}]
  → 230 只匹配

Turn 2: "公用事业的"
  filters: [{"field":"dividend_yield","op":"gt","value":2},
            {"field":"dividend_payout_years","op":"gte","value":5},
            {"field":"sector","op":"eq","value":"Utilities"}]  ← 追加
  → 28 只匹配

Turn 3: "大公司"
  filters: [...前面的...,
            {"field":"market_cap","op":"gte","value":10000000000}]  ← 继续追加
  → 12 只匹配 → 触发 recommendations

Turn 4: "去掉股息年限的要求"
  filters: [{"field":"dividend_yield","op":"gt","value":2},
            {"field":"sector","op":"eq","value":"Utilities"},   ← 移除了第2条
            {"field":"market_cap","op":"gte","value":10000000000}]
  → 15 只匹配
```

每轮输出**完整**的 filters 数组，前端直接使用，不需要自己做增量计算。

### 核心机制 4：上下文感知

Research Agent 能感知用户当前浏览的页面，生成个性化的首轮回复：

```
┌─────────────┬──────────────────────────────────────────────┐
│ 用户在看      │ Agent 首轮行为                                │
├─────────────┼──────────────────────────────────────────────┤
│ Screener    │ "想找什么股票？" + 基于市场热点的选股方向选项     │
│ 日报        │ 提取报告中最重要的 1-2 个点 + 基于新闻的选项     │
│ 盘前早报     │ 期货方向 + 隔夜关键事件 + 相关提问选项          │
│ 宏观仪表盘   │ 总结 4 个信号灯状态 + 宏观主题选项              │
│ 个股详情     │ 该股最值得关注的点 + 个股相关选项               │
│ Brew 摘要    │ 用户持仓今日表现 + 持仓相关提问选项             │
└─────────────┴──────────────────────────────────────────────┘
```

**实现方式**：Router 调用时传入 `active_context`（当前页面数据），Python 层格式化为 Markdown 文本注入到 Agent prompt 中。每种页面类型有专门的格式化函数。

### 核心机制 5：面板导航

Agent 可以控制右侧面板显示什么内容：

```python
# Agent 输出中的 navigate 字段
navigate: {
    "type": "stock",          # stock / screener / daily_report / macro / brew
    "params": {"symbol": "AAPL"},
    "reason": "用户想了解这只股票的详情"
}
```

**场景**：用户在选股对话中说"帮我看看 AAPL 的详情"→ Agent 输出 navigate 指令 → 前端右侧面板切换到个股详情视图，左侧对话继续。

### 核心机制 6：智能推荐触发

```
match_count > 15   →  不写 recommendations，继续引导缩小范围
match_count ≤ 15   →  为每只股票写 1-2 句推荐理由
用户主动要求推荐    →  无论数量都写 recommendations
```

推荐理由的要求：**回应用户表达过的偏好**。如果用户说"想要稳定分红的"，理由就是"这家公司连续分红 25 年，股息率 3.2%"——用用户的语言，不用金融行话。

### 线程安全

```python
# 股票数据通过 ContextVar 传递，每个请求有独立副本
_current_universe: ContextVar[list[dict]] = ContextVar("_current_universe", default=[])

# Router 调用时设置
_current_universe.set(universe_data)  # 当前请求独享
# Agent 的 Tools 读取
stocks = _current_universe.get()      # 协程安全
```

**为什么用 ContextVar？** FastAPI 是异步框架，多个请求并发执行。如果用全局变量，并发请求会互相污染数据。ContextVar 确保每个协程有独立的数据副本。

### 可用筛选字段

Agent 可以组合使用以下字段构建筛选条件：

| 类别 | 字段 |
|------|------|
| 估值 | pe_ttm, pb_mrq, ps_fy, ev_ebitda_ttm, peg_ttm |
| 盈利能力 | gross_margin, operating_margin, net_margin, roe, roa, roic |
| 增长 | revenue_growth_ttm, eps_growth_ttm, revenue_growth_5y, eps_growth_5y |
| 股息 | dividend_yield, payout_ratio, dividend_growth_years, dividend_payout_years |
| 价格表现 | daily_change, change_3m, change_6m, ytd_change, yearly_change |
| 其他 | market_cap, sector, industry, beta_1y, rsi, analyst_rating |

支持的操作符：`gt, gte, lt, lte, eq, neq, in`

### 术语翻译（Prompt 中的映射表）

Agent 被明确要求不使用金融术语，而是翻译为日常语言：

```
"ROE"          → "盈利能力"
"PE"           → "股价是否划算"
"市盈率"        → "赚钱速度跟股价的比例"
"RSI"          → "最近涨太多还是跌太多"
"分析师评级"    → "华尔街专家们怎么看"
"beta"         → "波动大不大"
"市值"         → "公司大小"
```

---

## 三、Prompt Engineering 设计哲学

所有 Agent 共享的核心原则（不只是 Research Agent）：

| 原则 | 说明 | 示例 |
|------|------|------|
| **数据准确性绝对** | 禁止编造任何数据点 | 数据缺失时明确说"该数据暂无" |
| **"So What?" 框架** | 每个数据都要解释意义 | ❌ "VIX 18.5" ✅ "VIX 处于低位，意味着..." |
| **结论前置** | 先亮立场，再给证据 | ❌ "从X看...从Y看...综上偏多" ✅ "偏多，因为..." |
| **叙事连续性** | 加载前 5 份历史报告 | "上周判断的利率压力本周得到验证..." |
| **情绪校准** | 大涨不盲目乐观 | "涨幅虽大，但成交量/VIX 显示..." |
| **禁止清单** | 无比喻、无投资建议、无套话 | ❌ "市场如同过山车" ❌ "建议买入" |

---

## 四、面试常见追问

**Q: Agent 幻觉了怎么办？**
三层防护：(1) Prompt 明确禁止编造；(2) 关键数据（价格/估值/目标价）由 Python 计算后传入，Agent 只负责解读；(3) URL 用 article_id 索引机制，避免 LLM 编造链接。

**Q: 为什么选 Gemini 不选 GPT-4？**
成本。个股分析是高频场景，Flash Lite 极便宜。分析质量主要靠数据质量和 prompt 质量，不靠模型大小。

**Q: 为什么不用 Streaming？**
output_schema 要求完整 JSON，不支持流式。前端用 loading + 骨架屏处理等待。

**Q: Research Agent 怎么处理用户说了不相关的话？**
Prompt 明确规则：不相关输入 → filters=[] + 友好引导回选股话题。

**Q: 如果筛选结果为 0 怎么办？**
Prompt 要求 Agent 在调用 execute_screener 前先用 get_field_distribution 了解数据范围。结果为 0 时自动放宽最严格的条件并告诉用户。

---

> 系统架构总览见 `docs/architecture.md`。
