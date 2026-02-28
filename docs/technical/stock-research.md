# 个股研究能力演进路线图

> 基于 [TradingAgents](https://github.com/TauricResearch/TradingAgents) (Apache 2.0, 29.5k stars) 的架构分析，结合 TheMarketBrew 现有基础设施，规划个股研究模块的下一步方向。

## 现状评估

### 已完成：基本面分析（Phase 0）

当前个股研究模块专注于**基本面分析**，在数据工程和分析深度上已经建立了扎实的基础：

| 能力 | 实现细节 |
|------|----------|
| **数据采集** | OpenBB SDK (财报三表) + FMP API (估值指标、同行数据) |
| **缓存架构** | 3 层缓存：Memory (30min) -> Insforge DB (30天/季度) -> API |
| **指标计算** | Python 层自算 TTM、增长率 (YoY/QoQ)、盈利能力、估值倍数 |
| **估值对比** | 同行对比 (5家)、行业/板块平均 P/E、5年历史估值趋势 |
| **AI 分析** | Gemini (gemini-3-pro-preview) 结构化输出，Pydantic schema 约束 7 个字段 |
| **分析框架** | 估值解读 -> 增长质量 -> 盈利能力 -> 核心判断，每个维度有明确的分析要求 |

**优势**：数据预处理精细（不是把原始数据扔给 LLM），输出格式可控，基础设施成熟（缓存、持久化、前端展示完整）。

### 缺失的维度

| 维度 | 当前状态 | 影响 |
|------|----------|------|
| 技术分析 | 无 | 缺少价格趋势、支撑/阻力、动量信号 |
| 新闻/舆情 | 无 | 缺少事件驱动分析、市场情绪判断 |
| 多视角对抗 | 单 Agent 单次生成 | 容易确认偏误，缺少反面论证 |
| 交易信号 | 无 | 只有分析文章，没有明确的 BUY/HOLD/SELL |
| 跨次学习 | 无 | 每次分析无状态，不能从历史中学习 |
| 风险量化 | 定性描述 | 没有量化的风控评估层 |

---

## TradingAgents 架构参考

TradingAgents 的核心价值不在于它的数据质量（实际上比我们粗糙），而在于它的**多 Agent 编排架构**：

```
Phase 1: 数据收集（4 个分析师并行）
  Market Analyst    -> 技术指标 (8个最相关指标)
  Social Analyst    -> 社交媒体情绪
  News Analyst      -> 宏观新闻 + 内部人交易
  Fundamentals      -> 财报三表

Phase 2: 多空辩论
  Bull Researcher <-> Bear Researcher （N轮对抗）
  Research Manager  -> 裁判判决

Phase 3: 交易决策
  Trader            -> BUY/HOLD/SELL + 投资计划

Phase 4: 风控辩论
  Aggressive <-> Conservative <-> Neutral （三方轮流）
  Risk Judge        -> 最终裁决
```

**关键设计**：
- **双层辩论**：投资决策和风控各一轮辩论，模拟真实交易公司
- **双 LLM**：分析师用快速模型，裁判用深度模型（成本/质量平衡）
- **记忆系统**：每个关键 Agent 有独立记忆，能从历史交易盈亏中学习
- **Tool-calling 循环**：分析师自主调用工具，直到获取足够信息

**TradingAgents 的不足**：
- 数据直接扔给 LLM，没有预处理和指标计算
- 无缓存，每次重新拉取数据
- 无估值对比体系
- 无宏观经济数据（利率、通胀、流动性）
- 输出是自由文本，不可控
- 只有 CLI，没有产品化

---

## 演进路线

### Phase 1: 扩展数据维度（低成本、高收益）

在现有单 Agent 架构上，先把数据维度补齐。这些数据源我们大部分已经有了，只需要接入个股分析流程。

#### 1.1 技术分析数据

现有 yfinance 就能获取价格数据，用 stockstats 或 pandas-ta 计算指标。

**需要的指标**（参考 TradingAgents 的选择逻辑，按场景选 6-8 个）：
- 趋势类：50 SMA, 200 SMA, 10 EMA
- 动量类：RSI, MACD (MACD/Signal/Histogram)
- 波动类：Bollinger Bands (upper/middle/lower), ATR
- 成交量：VWMA

**实现思路**：
- 在 `StockService.get_stock_data()` 中增加 `technical_indicators` 字段
- 用 yfinance 获取近 1 年日线数据，计算指标
- 在 Agent prompt 中增加技术分析维度

#### 1.2 新闻和舆情数据

已有 FMP 新闻 API (`shared/fmp_service.py`) 和 yfinance 新闻。

**实现思路**：
- 获取个股近 7 天新闻（FMP `stock_news` API）
- 获取相关宏观新闻
- 在 Agent prompt 中增加新闻分析维度
- 可选：内部人交易数据（FMP insider trading API）

#### 1.3 增强 Prompt

在现有 `STOCK_ANALYST_INSTRUCTION` 中增加：
- `technical_analysis` 字段：趋势判断、支撑阻力、动量信号
- `news_sentiment` 字段：近期事件影响、市场情绪
- 更新 `StockAnalysisOutput` schema

### Phase 2: 多视角分析架构（核心升级）

从单 Agent 升级为多 Agent 辩论架构，这是分析质量的质变。

#### 2.1 多空辩论（Bull vs Bear）

**架构设计**：
```
[数据准备] -> [Bull Agent] <-> [Bear Agent] -> [Judge Agent] -> 综合报告
                  (N轮辩论)
```

- **Bull Agent**：基于同样的数据，构建看多论证
- **Bear Agent**：构建看空论证，反驳 Bull 的每个观点
- **Judge Agent**：综合双方辩论，给出平衡的投资判断

**实现选择**：
- 方案 A：用 Google ADK 的 multi-agent 能力（如果支持）
- 方案 B：在 Python 层编排多次 LLM 调用
- 方案 C：引入 LangGraph 仅用于这个编排流程

#### 2.2 交易信号输出

在 Judge Agent 的输出中增加明确信号：
- **评级**：Strong Buy / Buy / Hold / Sell / Strong Sell
- **目标价区间**：基于估值分析的合理价格范围
- **信心度**：基于数据完整度和分析师一致性

### Phase 3: 智能化增强（长期方向）

#### 3.1 分析记忆系统

记录历史分析结果和后续股价表现，让 Agent 从过去的分析中学习：
- 存储每次分析的核心判断和当时的关键数据
- 追踪分析后 30/60/90 天的实际股价表现
- 在新分析时检索相似场景的历史教训

#### 3.2 风控评估层

在投资分析之后增加独立的风控审查：
- 评估头寸集中度风险
- 评估与宏观环境的相关性（联动流动性分析模块）
- 量化下行风险（最大回撤估计）

#### 3.3 宏观联动

把已有的流动性分析和宏观风险模块与个股分析联动：
- 在个股分析中引入当前宏观环境背景
- 评估个股对利率/通胀的敏感度
- 行业轮动信号与个股选择联动

---

## 技术决策记录

### 为什么不直接集成 TradingAgents？

1. **架构不兼容**：TradingAgents 基于 LangGraph + LangChain，我们基于 Google ADK + FastAPI
2. **数据层差距**：它的数据处理比我们粗糙，集成后反而降级
3. **产品定位不同**：它是交易决策工具，我们是投资研究平台
4. **借鉴思路更有价值**：多空辩论、记忆系统等架构思路可以在我们的技术栈上更好地实现

### License 确认

TradingAgents 使用 Apache License 2.0：
- 允许商用、修改、分发
- 要求保留版权声明、标注修改
- 不能使用其商标
- 如果后续决定直接引用部分代码，需在项目中包含 License 副本
