# PRD2.0

# Product Requirements Document (PRD): AlphaSeeker AI

| **文档版本** | **1.0 (MVP Draft)** |
| --- | --- |
| **状态** | 规划中 |
| **主要负责人** | PM (You) |
| **目标用户** | 具备一定基础知识的散户投资者、科技从业者、美股新手 |

---

## 1. 产品概述 (Executive Summary)

痛点： 散户投资者面临信息过载（News Overload）和分析割裂（Fragmented Analysis）。他们看得懂个股新闻，但往往忽视宏观背景；或者关注了大盘，却不知道如何映射到手里的持仓。

解决方案： 构建一个基于 Multi-Agent 架构的智能投研助手。通过“1个宏观Agent + 5个垂类Agent”的协作模式，为用户提供具备宏观视角的个股深度分析。

核心价值： 不做预测，不给代码，只提供逻辑自洽、数据支撑的结构化情报。

---

## 2. 用户画像 (User Persona)

- **典型用户：** Alex，30岁，北美科技大厂程序员。
- **特征：**
    - 相信逻辑和数据，讨厌“喊单”和情绪化言论。
    - 工作繁忙，没有时间每天读几十页研报。
    - 持有 NVDA, TSLA, MSFT 等科技股，也会配置一些 ETF。
- **需求：** 每天早上喝咖啡时，花 3 分钟了解“今天大盘安不安全”以及“我的持仓有没有大事发生”。

---

## 3. 功能需求 (Functional Requirements)

### 3.1 核心架构：Agent Swarm

系统后端由 6 个独立 Agent 和 1 个编排器（Orchestrator）组成。

### A. 宏观环境 Agent (Macro Agent)

- **输入：** 美债收益率 (10Y Treasury)、美元指数 (DXY)、VIX、财经日历 (Investing.com)、美联储会议纪要。
- **任务：** 判断当前市场所处的周期（Risk-on / Risk-off / Neutral）。
- **MVP输出：**
    - **市场状态标签：** (e.g., "震荡/观望")
    - **关键因子：** 影响今日市场的 Top 3 因素。
    - **全局参数 (Context Param):** 输出一个 JSON 对象传递给个股 Agent (e.g., `{"sentiment": "bearish", "focus": "inflation_data"}`).

### B. 个股垂类 Agents (The Micro 5)

每个 Agent 接收 **用户查询的代码 (Ticker)** + **宏观全局参数**。

1. **基本面 Agent (Fundamental):** 关注营收增速、毛利率、PEG。*逻辑：如果是 Risk-off 环境，着重检查现金流是否健康。*
2. **技术面 Agent (Technical):** 关注均线、支撑/阻力位、成交量。*逻辑：只描述形态（如“箱体震荡”），不给买卖点。*
3. **新闻面 Agent (News):** 抓取最近 24h 核心新闻，进行实体识别和去重。
4. **财报 Agent (Earnings):** (MVP可合并入基本面，或单独) 关注下一次财报日期、分析师预期变化。
5. **风控 Agent (Risk):** 关注 Beta 系数、与大盘的相关性、近期波动率。

### C. 编排器与合成器 (Orchestrator & Synthesizer)

- **逻辑：** 它是系统的“主编”。
- **任务：** 收集所有 Agent 的 JSON 输出，生成最终面向用户的自然语言报告。
- **规则：**
    - **冲突解决：** 如果新闻面利好但技术面利空，必须在总结中明确指出这种分歧（Divergence）。
    - **宏观压制：** 如果宏观是 Negative，必须在总结段落第一句强调“大环境逆风”。

---

### 3.2 用户交互流程 (User Stories)

### Story 1: 每日晨报 (Daily Briefing)

- **触发：** 用户打开 App / 或每日定时推送。
- **内容：**
    1. **宏观卡片：** 50字总结今日天气（多云转晴），列出关键指标（10yr Yield）。
    2. **持仓扫描：** 用户预设的 Watchlist (如 NVDA)，针对每只股生成 100 字简报。
- **体验：** 类似 Email Newsletter 的阅读感，而非对话感。

### Story 2: 个股查询 (On-Demand Inquiry)

- **触发：** 用户输入 "PLTR"。
- **响应：**
    - **Header:** 现价 + 涨跌幅。
    - **Section 1 (Context):** 结合当前宏观环境的一句话定调。
    - **Section 2 (Details):** 分栏展示 新闻/基本面/技术面/风控 的关键点（Bullet points）。
    - **Section 3 (Conclusion):** 综合结语（无打分，无建议，只有事实梳理）。

---

## 4. 数据与接口要求 (Data Requirements)

为保证 MVP 低成本运行，建议使用以下数据源策略：

- **价格/技术面:** Yahoo Finance API (免费/低成本) 或 Alpha Vantage。
- **新闻/宏观:** 接入 SearXNG (开源搜索) 或 Bing Search API，让 News Agent 自行总结。
- **基本面:** Yahoo Finance API (抓取 Key Statistics)。

MVP 输出格式标准 (JSON):

所有 Agent 必须输出 JSON 以便前端未来扩展（做高亮、做图表）。

JSON

`{
  "ticker": "NVDA",
  "macro_context": "Risk_Off",
  "synthesis": "虽然基本面强劲，但受宏观利率压制，股价承压。",
  "modules": {
    "news": {"sentiment": "positive", "headline": "Meta追加订单..."},
    "technical": {"trend": "consolidation", "support": 135}
  }
}`

---

## 5. 非功能需求 (Non-Functional Requirements)

1. **响应速度：**
    - 每日晨报可预先生成（Pre-generated），用户打开即看，无延迟。
    - 实时查询控制在 10-15秒 内（使用 Streaming 流式输出提升体感）。
2. **幻觉控制 (Hallucination):**
    - 严禁编造数据。所有财务数字需保留来源链接（Citation）。
    - Prompt 中加入 Strict Constraints: "If data is missing, state 'Data Unavailable', do not guess."

---

## 6. MVP 成功指标 (Success Metrics)

1. **用户留存 (Retention):** 次日留存率 > 30%（验证每日晨报是否有价值）。
2. **完读率 (Completion Rate):** 用户是否点开了具体的个股分析详情。
3. **Follow-up Rate:** 用户在看完报告后，是否会继续追问（如“展开讲讲这个新闻”）。

---

## 7. 未来规划 (Post-MVP Roadmap)

- **V1.1:** 引入 **“交互式追问”** (Contextual Chips)，如“查看新闻原文”、“展开技术图表”。
- **V1.2:** 引入 **“量化打分模型”** (Scoring System)，给个股打分（0-100）。
- **V1.3:** 引入 **“选股器”** (Screener Agent)，主动推送符合条件的机会。

---

### 下一步行动 (Next Steps)

1. **开发侧：** 搭建 Macro Agent 的 Prompt 框架，确保它能稳定输出 JSON 格式的环境参数。
2. **设计侧：** 设计“每日晨报”的文本排版样式（Markdown Template）。

这个PRD是否符合你目前的开发资源和预期？如果可以，我们可以开始细化 **Macro Agent 的 System Prompt**。