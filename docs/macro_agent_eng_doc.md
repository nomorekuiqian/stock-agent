# Macro Agent 工程设计文档

> **版本**: v2.0
> **日期**: 2025-12-03
> **状态**: 设计阶段

---

## 1. 概述

### 1.1 项目背景

当前 Macro Agent 使用 yfinance 作为单一数据源，提供基础市场行情分析。为了产出更专业、更全面的每日宏观市场报告，需要整合更多数据维度。

### 1.2 改进目标

| 目标 | 描述 |
|------|------|
| 数据全面性 | 整合宏观经济指标、完整收益率曲线、11大板块表现、财经新闻 |
| 前瞻性分析 | 提供未来经济事件日历、重要公司财报预警 |
| 深度解读 | 从数据罗列升级为逻辑关联分析和信号识别 |
| 专业输出 | 产出媲美华尔街研究报告的每日简报 |

### 1.3 改进前后对比

| 维度 | 现有方案 | 改进后方案 |
|------|----------|------------|
| 数据源 | yfinance (单一) | yfinance + FMP (多源) |
| 国债收益率 | 4个点位 (ETF代理) | 12个点位 (官方数据) |
| 宏观指标 | 无 | GDP, CPI, 失业率等 |
| 板块表现 | 2个金融ETF | 11大板块完整数据 |
| 新闻资讯 | 无 | 实时财经新闻 |
| 事件日历 | 无 | 经济数据 + 财报日历 |
| 前瞻性 | 弱 | 强 (未来事件预警) |

---

## 2. FMP API 接口清单

### 2.1 宏观经济数据

| API | 端点 | 用途 |
|-----|------|------|
| Treasury Rates | `/stable/treasury-rates` | 完整国债收益率曲线 (1M-30Y) |
| Economic Indicators | `/stable/economic-indicators` | GDP, CPI, 失业率, 消费者信心等 |
| Economic Calendar | `/stable/economic-calendar` | 经济数据发布日历 (含 High/Medium/Low 影响评级) |
| Market Risk Premium | `/stable/market-risk-premium` | 各国股权风险溢价 |

### 2.2 市场表现

| API | 端点 | 用途 |
|-----|------|------|
| Sector Performance Snapshot | `/stable/sector-performance-snapshot` | 11大板块实时涨跌幅 |
| Historical Sector Performance | `/stable/historical-sector-performance` | 板块历史表现 |
| Batch Index Quotes | `/stable/batch-index-quotes` | 全球主要指数行情 |

### 2.3 新闻与情绪

| API | 端点 | 用途 |
|-----|------|------|
| General News | `/stable/news/general-latest` | 最新财经新闻 |
| Forex News | `/stable/news/forex` | 外汇市场新闻 |
| Crypto News | `/stable/news/crypto-latest` | 加密货币新闻 |
| Stock News Sentiment | `/api/v3/stock-news-sentiment` | 个股新闻情绪评分 |

### 2.4 事件日历

| API | 端点 | 用途 |
|-----|------|------|
| Earnings Calendar | `/stable/earnings-calendar` | 财报发布日历 |
| Dividends Calendar | `/stable/dividends-calendar` | 分红日历 |
| Splits Calendar | `/stable/splits-calendar` | 拆股日历 |
| IPO Disclosures | `/api/v3/ipo/disclosures` | IPO 披露信息 |

### 2.5 关键数据字段

#### Treasury Rates 响应
- 12个期限: 1M, 2M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y
- 可计算: 10Y-3M 利差, 10Y-2Y 利差, 曲线形态

#### Economic Calendar 响应
- `event`: 事件名称 (如 Nonfarm Payrolls)
- `country`: 国家
- `previous`, `estimate`, `actual`: 前值/预期/实际
- `impact`: High/Medium/Low 影响等级
- `changePercentage`: 变化百分比

#### Sector Performance 响应
- 11大板块: Technology, Healthcare, Financial Services, Consumer Cyclical, Industrials, Communication Services, Consumer Defensive, Energy, Basic Materials, Real Estate, Utilities
- `averageChange`: 板块平均涨跌幅

### 2.6 潜在扩展数据 (待评估)

以下数据可进一步提升报告的专业性和全面性，待确认 FMP 或其他数据源的可用性：

#### 利率政策与通胀预期
| 指标 | 说明 | 价值 |
|------|------|------|
| Fed Funds Rate | 联邦基金利率 (当前政策利率) | 货币政策基准 |
| 利率期货隐含预期 | CME FedWatch 加息/降息概率 | 市场对政策路径的定价 |
| 核心 PCE | Fed 首选通胀指标 | 比 CPI 更受 Fed 关注 |
| Breakeven Inflation | TIPS 隐含通胀预期 | 市场通胀预期 |
| 5Y5Y Forward Inflation | 5年后5年通胀预期 | 长期通胀锚定 |

#### 信用市场深度
| 指标 | 说明 | 价值 |
|------|------|------|
| IG OAS | 投资级信用利差 | 比 LQD ETF 更精确 |
| HY OAS | 高收益信用利差 | 比 HYG ETF 更精确 |
| CDX IG / CDX HY | 信用违约互换指数 | 信用风险市场定价 |

#### 劳动力市场 (高频)
| 指标 | 说明 | 价值 |
|------|------|------|
| Initial Jobless Claims | 初请失业金 (周频) | 领先指标，高频 |
| Continuing Claims | 续请失业金 | 就业市场健康度 |
| JOLTS Job Openings | 职位空缺数 | 劳动力供需 |
| ADP Employment | ADP 就业报告 | 非农前瞻 |

#### 全球市场联动
| 指标 | 说明 | 价值 |
|------|------|------|
| 欧洲股指 | DAX, FTSE 100, CAC 40 | 欧洲市场情绪 |
| 亚洲股指 | 日经225, 恒生, 上证 | 亚洲市场联动 |
| MSCI EM | 新兴市场指数 | 风险偏好指标 |

#### 外汇市场
| 指标 | 说明 | 价值 |
|------|------|------|
| EUR/USD | 欧元兑美元 | 全球最大货币对 |
| USD/JPY | 美元兑日元 | 避险货币、套息交易 |
| USD/CNH | 美元兑离岸人民币 | 中国经济风向 |
| DXY 成分权重 | 美元指数构成 | 理解美元走势驱动 |

#### 商品扩展
| 指标 | 说明 | 价值 |
|------|------|------|
| 铜价 | "铜博士" | 经济活动先行指标 |
| 天然气 | 能源价格 | 通胀、地缘风险 |
| 农产品指数 | 粮食价格 | 食品通胀 |
| 波罗的海干散货指数 | BDI | 全球贸易活动 |

#### 情绪与仓位
| 指标 | 说明 | 价值 |
|------|------|------|
| Put/Call Ratio | 看跌/看涨期权比率 | 市场情绪 |
| AAII Sentiment | 散户情绪调查 | 逆向指标 |
| CNN Fear & Greed | 恐惧贪婪指数 | 综合情绪 |
| COT 报告 | 期货持仓报告 | 机构仓位 |

#### 房地产
| 指标 | 说明 | 价值 |
|------|------|------|
| 30Y Mortgage Rate | 30年房贷利率 | 房市、消费影响 |
| Existing Home Sales | 成屋销售 | 房市活动 |
| Case-Shiller Index | 房价指数 | 财富效应 |

#### 优先级建议

| 优先级 | 指标 | 理由 |
|--------|------|------|
| 🔴 高 | 初请失业金 | 周频领先指标 |
| 🔴 高 | 全球主要股指 | 市场联动性 |
| 🔴 高 | 铜价 | 经济风向标 |
| 🔴 高 | Fed 利率预期 | 政策路径定价 |
| 🟡 中 | 核心 PCE | Fed 首选指标 |
| 🟡 中 | 信用利差 OAS | 比 ETF 更准确 |
| 🟡 中 | Put/Call Ratio | 情绪指标 |
| 🟢 低 | 主要货币对 | 补充分析 |
| 🟢 低 | AAII 情绪 | 逆向参考 |
| 🟢 低 | 房贷利率 | 补充分析 |

---

## 3. 架构设计

### 3.1 三阶段 Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                 Enhanced Macro Analysis Pipeline                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stage 1: Data Fetcher Agent                                    │
│  ├── yfinance: 市场行情 (股指/VIX/商品/货币/信用ETF)             │
│  └── FMP API: 收益率/经济指标/事件日历/板块/新闻/财报            │
│                                                                  │
│                         ↓ raw_data                               │
│                                                                  │
│  Stage 2: Context Enricher Agent (新增)                         │
│  ├── 收益率曲线形态分析 (normal/flat/inverted)                   │
│  ├── 信用利差趋势识别 (widening/tightening)                      │
│  ├── 板块轮动信号 (risk-on/risk-off)                            │
│  ├── 新闻主题提取与情绪评分                                      │
│  └── 风险信号仪表盘生成                                          │
│                                                                  │
│                     ↓ enriched_context                           │
│                                                                  │
│  Stage 3: Analyst Agent                                         │
│  ├── 市场全景解读                                                │
│  ├── 宏观经济脉搏分析                                            │
│  ├── 本周关键事件预警                                            │
│  ├── 新闻驱动解读                                                │
│  ├── 风险仪表盘                                                  │
│  └── 前瞻性展望                                                  │
│                                                                  │
│                     ↓ analysis (Markdown)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户请求
    │
    ▼
┌─────────────────────────────────────────┐
│          Data Fetcher Agent             │
│                                         │
│  ┌─────────────┐   ┌─────────────┐     │
│  │  yfinance   │   │   FMP API   │     │
│  └──────┬──────┘   └──────┬──────┘     │
│         └──────────┬──────┘            │
│                    ▼                    │
│              raw_data: {               │
│                market_data,            │
│                treasury_rates,         │
│                economic_indicators,    │
│                economic_calendar,      │
│                sector_performance,     │
│                market_news,            │
│                earnings_calendar       │
│              }                         │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        Context Enricher Agent           │
│                                         │
│  • 收益率曲线分析                        │
│  • 信用市场分析                          │
│  • 板块轮动信号                          │
│  • 新闻情绪分析                          │
│  • 风险信号汇总                          │
│                                         │
│              enriched_context           │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Analyst Agent                 │
│                                         │
│  生成专业易懂的每日市场简报              │
│                                         │
│              analysis (Markdown)        │
└───────────────────┬─────────────────────┘
                    │
                    ▼
              返回结果
```

### 3.3 Agent 职责

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| Data Fetcher | 多源数据采集与标准化 | - | raw_data (JSON) |
| Context Enricher | 信号识别与数据增强 | raw_data | enriched_context (JSON) |
| Analyst | 专业分析报告生成 | enriched_context | analysis (Markdown) |

---

## 4. 数据模型

### 4.1 原始数据结构 (raw_data)

```
raw_data
├── market_data (yfinance)
│   ├── equities: {S&P 500, Nasdaq, Dow Jones}
│   ├── volatility: {VIX}
│   ├── credit: {HYG, LQD}
│   ├── financials: {XLF, KRE}
│   ├── commodities: {Gold, Oil}
│   └── currencies: {US Dollar}
│
├── treasury_rates (FMP)
│   ├── 1M, 2M, 3M, 6M 短期利率
│   ├── 1Y, 2Y, 3Y, 5Y, 7Y 中期利率
│   └── 10Y, 20Y, 30Y 长期利率
│
├── economic_indicators (FMP)
│   ├── GDP: {latest, previous, trend}
│   ├── CPI: {latest, previous, trend}
│   ├── unemploymentRate: {latest, previous, trend}
│   └── consumerSentiment: {latest, previous, trend}
│
├── economic_calendar (FMP)
│   ├── high_impact_events: [...]
│   ├── medium_impact_events: [...]
│   └── us_events: [...]
│
├── sector_performance (FMP)
│   ├── top_performers: [top 3 sectors]
│   ├── bottom_performers: [bottom 3 sectors]
│   └── market_breadth: {advancing, declining, ratio}
│
├── market_news (FMP)
│   ├── latest_news: [...]
│   └── key_themes: [...]
│
└── earnings_calendar (FMP)
    ├── important_earnings: [major company reports]
    └── by_date: {...}
```

### 4.2 增强上下文结构 (enriched_context)

```
enriched_context
├── raw_data (原始数据)
│
└── analysis_hints (分析提示)
    ├── yield_curve
    │   ├── shape: normal | flat | inverted
    │   ├── spread_10y_3m: number
    │   ├── spread_10y_2y: number
    │   └── inversion_warning: boolean
    │
    ├── credit
    │   ├── hyg_lqd_spread: number
    │   ├── trend: widening | tightening | stable
    │   └── credit_stress: boolean
    │
    ├── sector_rotation
    │   ├── signal: risk_on | risk_off | mixed
    │   ├── top_sectors: [...]
    │   ├── bottom_sectors: [...]
    │   └── market_breadth: number (0-1)
    │
    ├── news_sentiment
    │   ├── overall_score: number (-1 to 1)
    │   └── key_themes: [...]
    │
    └── risk_signals
        ├── yield_curve: 🟢|🟡|🔴
        ├── credit_market: 🟢|🟡|🔴
        ├── vix_level: 🟢|🟡|🔴
        ├── financial_sector: 🟢|🟡|🔴
        ├── market_breadth: 🟢|🟡|🔴
        └── overall_risk: low | medium | high
```

---

## 5. 报告输出结构

### 5.1 报告大纲

```
# 每日宏观市场简报

## 🎯 三句话看懂今日市场
- 核心主题
- 最值得关注的变化
- 当前市场情绪

## 📊 市场全景
- 股市表现 (三大指数)
- 恐慌指数 VIX
- 板块轮动

## 💰 利率与信用
- 收益率曲线分析
- 信用市场状态

## 🌍 宏观经济脉搏
- 关键指标追踪 (GDP, CPI, 失业率等)
- 经济周期判断

## 📅 本周关键事件
- 高影响力经济数据
- 重要公司财报

## 📰 新闻与市场叙事
- 今日头条主题
- 核心新闻解读

## 🚦 风险仪表盘
- 6维风险信号 (收益率曲线/信用/VIX/金融/广度/避险)
- 综合风险评级

## 🔮 前瞻展望
- 最可能情景
- 需要警惕的变化
- 本周观察重点

## 📝 总结
- 通俗易懂的市场概括
```

### 5.2 风险信号判断标准

| 信号 | 🟢 低风险 | 🟡 中等风险 | 🔴 高风险 |
|------|-----------|-------------|-----------|
| 收益率曲线 | 正常 (10Y>3M+50bp) | 平坦 | 倒挂 (10Y<3M) |
| 信用市场 | 利差收窄 | 稳定 | 利差扩大 >1% |
| VIX 水平 | <15 | 15-20 | >20 |
| 金融板块 | KRE 周涨 | 周平 | KRE 周跌 >5% |
| 市场广度 | >70% 上涨 | 40-70% | <40% 上涨 |
| 避险信号 | 股涨金跌 | 混合 | 股跌金涨 |

**综合评级**: 红灯数量 0-1 = 低风险 | 2-3 = 中等风险 | 4+ = 高风险

---

## 6. 实施计划（增量式）

### 6.1 设计原则

每一步遵循以下原则：
- **最小改动**: 在现有代码基础上增量修改
- **可独立验证**: 每步完成后可立即测试
- **有回退方案**: 失败时可回退到上一步
- **价值可见**: 每步都带来可感知的改进

### 6.2 步骤总览

```
现有状态                                      目标状态
    │                                            │
    │  Step 1: Treasury Rates                    │
    ├──────────────────────────────────────────→ │ 完整收益率曲线
    │                                            │
    │  Step 2: Analyst Prompt v1.1               │
    ├──────────────────────────────────────────→ │ 利用新收益率数据
    │                                            │
    │  Step 3: Economic Calendar                 │
    ├──────────────────────────────────────────→ │ 前瞻性事件预警
    │                                            │
    │  Step 4: Sector Performance                │
    ├──────────────────────────────────────────→ │ 板块轮动分析
    │                                            │
    │  Step 5: Analyst Prompt v1.2               │
    ├──────────────────────────────────────────→ │ 整合日历+板块
    │                                            │
    │  Step 6: Economic Indicators               │
    ├──────────────────────────────────────────→ │ 宏观经济脉搏
    │                                            │
    │  Step 7: Market News                       │
    ├──────────────────────────────────────────→ │ 新闻驱动分析
    │                                            │
    │  Step 8: Earnings Calendar                 │
    ├──────────────────────────────────────────→ │ 财报事件预警
    │                                            │
    │  Step 9: Context Enricher Agent            │
    ├──────────────────────────────────────────→ │ 信号识别层
    │                                            │
    │  Step 10: Analyst Prompt v2.0              │
    ├──────────────────────────────────────────→ │ 完整专业报告
    │                                            │
    ▼                                            ▼
```

---

### Step 1: Treasury Rates API 集成

**目标**: 用 FMP 官方数据替换 yfinance ETF 代理数据

**当前状态**:
```
rates (yfinance ETF):
├── 3M  (^IRX)
├── 5Y  (^FVX)
├── 10Y (^TNX)
└── 30Y (^TYX)
```

**目标状态**:
```
rates (FMP API):
├── 1M, 2M, 3M, 6M  (短端)
├── 1Y, 2Y, 3Y      (中短端)
├── 5Y, 7Y          (中端)
└── 10Y, 20Y, 30Y   (长端)
```

**改动范围**:
| 文件 | 改动 |
|------|------|
| `.env` | 新增 `FMP_API_KEY` |
| `services/fmp_service.py` | 新建，实现 `get_treasury_rates()` |
| `macro_agent.py` | 修改 `get_all_market_data()` 的 rates 部分 |

**验证方式**:
- 调用 API 返回 12 个期限的收益率
- 计算 10Y-3M, 10Y-2Y 利差
- 报告中显示完整曲线

**回退方案**: 保留 yfinance 代码，FMP 失败时自动降级

---

### Step 2: Analyst Prompt v1.1 - 利用收益率数据

**目标**: 更新 Analyst 的 prompt，充分利用新的收益率曲线数据

**改动范围**:
| 文件 | 改动 |
|------|------|
| `macro_agent.py` | 更新 `analyst_agent` 的 instruction |

**新增分析内容**:
- 完整收益率曲线表格 (12 期限)
- 曲线形态判断 (normal/flat/inverted)
- 2Y-10Y 利差分析 (关键衰退指标)
- 短端利率变化解读 (货币政策预期)

**验证方式**: 报告输出包含完整收益率曲线分析

---

### Step 3: Economic Calendar 集成

**目标**: 添加未来经济事件日历，实现前瞻性分析

**改动范围**:
| 文件 | 改动 |
|------|------|
| `services/fmp_service.py` | 新增 `get_economic_calendar()` |
| `macro_agent.py` | 新增工具函数，更新 data_fetcher 工具列表 |

**数据结构**:
```
economic_calendar:
├── high_impact_events: [未来7天高影响事件]
├── us_events: [美国相关事件]
└── by_date: {按日期分组}
```

**验证方式**:
- 返回未来 7 天的 High/Medium impact 事件
- 包含 Nonfarm Payrolls, CPI, FOMC 等关键事件

---

### Step 4: Sector Performance 集成

**目标**: 添加 11 大板块实时表现

**当前状态**:
```
financials (yfinance):
├── XLF (金融板块 ETF)
└── KRE (区域银行 ETF)
```

**目标状态**:
```
sector_performance (FMP):
├── Technology, Healthcare, Financial Services
├── Consumer Cyclical, Industrials, Communication Services
├── Consumer Defensive, Energy, Basic Materials
└── Real Estate, Utilities
```

**改动范围**:
| 文件 | 改动 |
|------|------|
| `services/fmp_service.py` | 新增 `get_sector_performance()` |
| `macro_agent.py` | 新增工具函数 |

**新增分析维度**:
- 领涨/领跌板块 Top 3
- 市场广度 (上涨板块占比)
- 板块轮动信号 (risk-on vs risk-off)

---

### Step 5: Analyst Prompt v1.2 - 整合日历+板块

**目标**: 更新 Analyst prompt，整合经济日历和板块数据

**改动范围**:
| 文件 | 改动 |
|------|------|
| `macro_agent.py` | 更新 `analyst_agent` 的 instruction |

**新增报告章节**:
```
## 📅 本周关键事件
- 高影响力经济数据发布
- 潜在市场影响分析

## 📊 板块轮动
- 领涨/领跌板块
- 资金流向解读
- 市场广度指标
```

---

### Step 6: Economic Indicators 集成

**目标**: 添加 GDP、CPI、失业率等宏观经济指标

**改动范围**:
| 文件 | 改动 |
|------|------|
| `services/fmp_service.py` | 新增 `get_economic_indicators()` |
| `macro_agent.py` | 新增工具函数 |

**数据结构**:
```
economic_indicators:
├── GDP: {latest, previous, trend}
├── CPI: {latest, previous, trend}
├── unemploymentRate: {latest, previous, trend}
├── consumerSentiment: {latest, previous, trend}
├── retailSales: {latest, previous, trend}
└── industrialProductionMoM: {latest, previous, trend}
```

**新增分析维度**: 经济周期判断 (软着陆/硬着陆/再加速/滞胀)

---

### Step 7: Market News 集成

**目标**: 添加最新财经新闻

**改动范围**:
| 文件 | 改动 |
|------|------|
| `services/fmp_service.py` | 新增 `get_market_news()` |
| `macro_agent.py` | 新增工具函数 |

**数据结构**:
```
market_news:
├── latest_news: [最新10条新闻]
└── key_themes: [关键主题提取]
```

**新增分析维度**: 新闻驱动解读、市场叙事分析

---

### Step 8: Earnings Calendar 集成

**目标**: 添加重要公司财报日历

**改动范围**:
| 文件 | 改动 |
|------|------|
| `services/fmp_service.py` | 新增 `get_earnings_calendar()` |
| `macro_agent.py` | 新增工具函数 |

**数据结构**:
```
earnings_calendar:
├── important_earnings: [AAPL, MSFT, GOOGL 等重要公司]
└── by_date: {按日期分组}
```

---

### Step 9: Context Enricher Agent

**目标**: 新增中间层 Agent，进行信号识别和数据增强

**改动范围**:
| 文件 | 改动 |
|------|------|
| `macro_agent.py` | 新增 `context_enricher_agent` |
| `macro_agent.py` | 更新 Pipeline 为三阶段 |

**架构变化**:
```
之前: Data Fetcher → Analyst
之后: Data Fetcher → Context Enricher → Analyst
```

**Context Enricher 职责**:
- 收益率曲线形态分析 (normal/flat/inverted)
- 信用利差趋势识别 (widening/tightening)
- 板块轮动信号 (risk-on/risk-off)
- 新闻主题提取
- 风险信号仪表盘生成

---

### Step 10: Analyst Prompt v2.0 - 完整专业报告

**目标**: 最终版 Analyst prompt，产出完整专业报告

**改动范围**:
| 文件 | 改动 |
|------|------|
| `macro_agent.py` | 完整更新 `analyst_agent` 的 instruction |

**完整报告结构**:
```
# 每日宏观市场简报

## 🎯 三句话看懂今日市场
## 📊 市场全景
## 💰 利率与信用
## 🌍 宏观经济脉搏
## 📅 本周关键事件
## 📰 新闻与市场叙事
## 🚦 风险仪表盘
## 🔮 前瞻展望
## 📝 总结
```

---

### 6.3 步骤依赖关系

```
Step 1 ─────┬────→ Step 2
            │
Step 3 ─────┼────→ Step 5 ────→ Step 9 ────→ Step 10
            │
Step 4 ─────┘

Step 6 ─────┬────→ Step 9
            │
Step 7 ─────┤
            │
Step 8 ─────┘
```

**关键路径**: Step 1 → Step 3 → Step 4 → Step 5 → Step 9 → Step 10

**可并行**:
- Step 6, 7, 8 可在 Step 5 完成后并行开发
- Step 2 可与 Step 3, 4 并行

---

### 6.4 里程碑

| 里程碑 | 完成步骤 | 交付物 | 报告能力 |
|--------|----------|--------|----------|
| M1 | Step 1-2 | 完整收益率曲线 | 收益率分析升级 |
| M2 | Step 3-5 | 日历 + 板块 | 前瞻性 + 板块轮动 |
| M3 | Step 6-8 | 完整数据层 | 宏观指标 + 新闻 |
| M4 | Step 9-10 | 三阶段 Pipeline | 专业完整报告 |

---

### 6.5 每步验收标准

| Step | 验收标准 |
|------|----------|
| 1 | API 返回 12 期限收益率，计算利差正确 |
| 2 | 报告包含完整收益率曲线表格和形态分析 |
| 3 | 返回未来 7 天 High impact 事件，含影响等级 |
| 4 | 返回 11 板块涨跌幅，计算市场广度 |
| 5 | 报告包含事件日历和板块轮动章节 |
| 6 | 返回 6 个经济指标的最新值和趋势 |
| 7 | 返回最新新闻和主题提取 |
| 8 | 返回重要公司财报日历 |
| 9 | Context Enricher 输出结构化分析提示 |
| 10 | 报告包含完整 9 个章节 |

---

## 7. 成本估算

### 7.1 FMP API 定价

| Plan | 价格 | Calls/Month | 适用场景 |
|------|------|-------------|----------|
| Free | $0 | 250 | 开发测试 |
| Starter | $14/mo | 10,000 | 每日报告 |
| Professional | $49/mo | 100,000 | 高频应用 |

### 7.2 每日调用估算

| API | 调用/天 |
|-----|---------|
| Treasury Rates | 1 |
| Economic Indicators | 6 |
| Economic Calendar | 1 |
| Sector Performance | 1 |
| Market News | 1 |
| Earnings Calendar | 1 |
| **合计** | **~11** |

**月度**: 11 × 30 = 330 calls → **Free 计划可满足每日1次报告**

### 7.3 缓存策略 (降低调用量)

| 数据类型 | 缓存时间 | 原因 |
|----------|----------|------|
| Treasury Rates | 1 小时 | 盘中变化小 |
| Economic Indicators | 24 小时 | 发布频率低 |
| Economic Calendar | 24 小时 | 周内不变 |
| Sector Performance | 15 分钟 | 实时性要求 |
| Market News | 30 分钟 | 平衡实时与成本 |

---

## 8. 风险与缓解

### 8.1 技术风险

| 风险 | 缓解措施 |
|------|----------|
| FMP API 不可用 | 降级到 yfinance 数据 |
| API 响应延迟 | 超时设置 + 重试机制 |
| API 配额耗尽 | 缓存 + 监控告警 |
| 数据质量问题 | 数据校验 + 异常检测 |

### 8.2 降级策略

```
FMP API 调用
    │
    ├─ 成功 → 返回数据
    │
    └─ 失败 → 检查缓存
                │
                ├─ 缓存有效 → 返回缓存
                │
                └─ 缓存失效 → 降级到 yfinance
```

---

## 9. 环境配置

### 9.1 新增环境变量

```
FMP_API_KEY=your_fmp_api_key
FMP_CACHE_TTL=3600
FMP_TIMEOUT=30
FMP_MAX_RETRIES=3
```

### 9.2 新增依赖

```
httpx>=0.25.0       # 异步 HTTP 客户端
cachetools>=5.3.0   # 缓存工具
```

### 9.3 目录结构变更

```
backend/app/
├── services/
│   └── fmp_service.py      # 新增
└── models/
    └── macro_models.py     # 新增
```

---

## 10. 成功指标

| 指标 | 目标 |
|------|------|
| 数据完整性 | 100% API 调用成功率 |
| 报告生成时间 | < 30 秒 |
| 报告质量评分 | 用户满意度 > 4/5 |
| 系统可用性 | > 99% |
| API 成本 | < $15/月 |

---

*文档结束*
