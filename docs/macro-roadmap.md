# 宏观看板产品路线图

> 本文档是宏观看板重构的完整产品规划，作为后续所有宏观相关开发的执行依据。
>
> **最后更新**: 2026-02-07

---

## 一、产品定位

### 核心价值主张

**"30 秒看懂宏观，5 分钟做出判断"**

为个人投资者提供一站式宏观环境感知工具——不是彭博终端的简化版，而是一个"宏观天气预报"：用最少的指标、最直觉的呈现，帮助用户快速判断当前市场处于什么环境，以及接下来可能发生什么。

### 目标用户

- 有一定投资经验（1-5 年）、关注美股的个人投资者
- 知道宏观很重要但看不懂 FRED 数据、读不完所有新闻
- 需要"有人帮我盯着、有事告诉我"的被动跟踪型需求

### 痛点分析

| 痛点 | 现状 | 我们的解法 |
|------|------|-----------|
| 宏观数据分散在 FRED / 财经网站 | 用户需要自己找、自己算 | 四大板块整合，一屏呈现 |
| 不知道哪些指标真正重要 | 看到 100 个指标，不知道看哪个 | 精选核心指标 + 判断逻辑 |
| 看到数据不知道意味着什么 | 数字没有上下文 | 指标即教育 + 情景推演 |
| 不知道接下来会发生什么 | 纯回顾、无前瞻 | 事件日历 + AI 前瞻研判 |
| 缺少通胀和情绪维度 | 现有看板无覆盖 | 新增"通胀与利率"和"市场情绪"板块 |

---

## 二、四大宏观板块

用 4 个板块替代旧 5 分类，每个板块回答一个核心问题：

### 板块 1：流动性环境 (Liquidity) -- DONE

> **核心问题**: 市场上的钱是多了还是少了？

**状态**: 已完成

**实现**: `features/liquidity/fred_service.py` + 前端 `/macro/liquidity`

| 指标 | FRED Series | 判断逻辑 | 权重 |
|------|------------|----------|------|
| 美联储资产负债表 (WALCL) | `WALCL` | 扩张 = 流动性增加 | 30% |
| 财政部一般账户 (TGA) | `WDTGAL` | TGA 下降 = 流动性释放 | 25% |
| 逆回购 (RRP) | `RRPONTSYD` | RRP 下降 = 流动性回流市场 | 25% |
| 净流动性 | WALCL - TGA - RRP | 综合流动性水位 | -- |
| 全国金融状况指数 (NFCI) | `NFCI` | <0 宽松, >0 收紧 | 20% |

**已删除功能**: 流动性 AI 分析 (`agent.py`, `db.py`, edge function) 已移除，仅保留 FRED 指标数据端点。AI 分析能力已由周报模块替代。

---

### 板块 2：经济基本面 (Economic Fundamentals) -- DONE

> **核心问题**: 经济是在变好还是变差？

**状态**: 已完成

**实现**: `features/macro_risk/service.py` 中的 `get_economic_fundamentals()` + 前端 `/macro/economy`

已合并旧"经济恶化 + 信用违约 + 就业"三个分类为 3 个子维度：

| 子维度 | 权重 | 核心指标 |
|--------|------|---------|
| 增长 (Growth) | 35% | GDP、衰退概率、CFNAI、消费者信心、零售销售、工业产出 |
| 就业 (Employment) | 35% | 失业率、非农就业、初请失业金、Sahm 规则、续请失业金 |
| 信用 (Credit) | 30% | HY OAS、收益率曲线、商业地产违约率、BBB 利差、商业贷款违约率 |

综合评分: 加权风险分 0-10，沿用 `_score_indicator()` 评分函数。

---

### 板块 3：通胀与利率 (Inflation & Rates) -- DONE

> **核心问题**: 物价压力如何？美联储会怎么做？

**状态**: 已完成

**实现**: `features/macro_risk/service.py` 中的 `get_inflation_rates()` + 前端 `/macro/inflation-rates`

| 子维度 | 权重 | 核心指标 |
|--------|------|---------|
| 通胀 (Inflation) | 60% | CPI (`CPIAUCSL`)、核心 PCE (`PCEPILFE`)、5Y 盈亏平衡 (`T5YIE`)、密歇根通胀预期 |
| 利率 (Rates) | 40% | 联邦基金利率 (`FEDFUNDS`)、10Y 国债 (`DGS10`)、10Y 实际利率 (`DFII10`) |

**配套功能**:
- `get_cpi_breakdown()`: CPI 细分 (总体/核心/住房/食品/能源 YoY% + MoM%)
- `get_treasury_and_commodities()`: 12 期限国债收益率曲线 + 日变化 bps

---

### 板块 4：市场情绪 (Market Sentiment) -- DONE

> **核心问题**: 市场参与者现在是贪婪还是恐惧？

**状态**: 已完成

**实现**: `features/macro_risk/service.py` 中的 `get_market_sentiment()` + 前端 `/macro/sentiment`

| 子维度 | 核心指标 | 数据源 |
|--------|---------|--------|
| CNN 恐慌贪婪 | 7 组件 (股价强度/宽度/看跌看涨/动能/垃圾债/VIX/避险) | CNN Fear & Greed API |
| 波动率 | VIX / VVIX / SKEW | yfinance |
| 市场宽度 + 期权 | S&P 500 上涨比例 + Put/Call Ratio | yfinance (100 只成分股) |
| 信用利差 | HY OAS + BBB Spread | FRED |

**特点**: CNN 综合评分 (0-100) 作为主锚点，10 分钟缓存 + request coalescing 防并发。

---

## 三、信息架构 — 三层渐进式设计 -- DONE

### Layer 1: 5 秒总览 — Dashboard Header

**状态**: 已完成 (`/macro` 首页)

- **综合宏观评分**: 0-10 仪表盘 (`RiskGauge` 组件)
- **一句话总结**: AI 生成的宏观摘要 (来自周报 `executive_summary`)
- **四色信号灯**: 每个板块一个信号灯 (来自周报 `signal_lights`)

### Layer 2: 30 秒扫描 — 四板块卡片

**状态**: 已完成

每个板块一张 `terminal-card`：板块名称 + 评分 + headline + 关键指标 + 展开进入 Layer 3。

### Layer 3: 5 分钟深入 — 板块详情页

**状态**: 已完成

4 个详情页 (`/macro/liquidity`, `/macro/economy`, `/macro/inflation-rates`, `/macro/sentiment`)：
- 全量指标数据
- `InsightBanner` 组件展示 AI 解读 (来自周报 `SectionAnalysis`)
- 历史走势图 (`HistoryAreaChart` / `IndexAreaChart` / `CommodityAreaChart` / `YieldCurveChart`)
- TradingView 嵌入图表
- 时间范围选择 (1M/3M/6M/1Y/ALL)

---

## 四、交互与教育 — 三层认知脚手架

### 脚手架 1：指标即教育

每个指标旁附带模板化解读文案，让用户"看到数字就知道什么意思"。

**文案模板**:
```
{指标名} 当前 {当前值}{单位}，{较上期变化方向}{变化幅度}。
{一句话含义解释}。
历史参考：{关键阈值说明}。
```

**技术方案**:
- 在 `models.py` 中为 `RiskIndicator` 新增 `education_text` 字段
- 文案按 `series_id` 索引
- 前端通过 tooltip 或 inline 展示

**状态**: 未实现 | 优先级 P2

---

### 脚手架 2：情景推演卡片

预写 if-then 场景，帮助用户理解"如果 X 发生，意味着什么"。

**卡片结构**:
```
如果 {条件}，
那么 {市场影响}，
你可以 {行动建议}。
```

**预设场景示例**:

| 触发条件 | 市场影响 | 行动建议 |
|---------|---------|---------|
| CPI 同比 > 3.5% | 市场预期美联储推迟降息，成长股承压 | 关注价值股和短久期债券 |
| VIX > 30 且 P/C > 1.2 | 市场恐慌但可能接近底部 | 考虑分批建仓优质标的 |
| 失业率连续 3 月上升 | 衰退概率上升，防御板块走强 | 增配消费必需品和医疗 |
| 净流动性环比增加 > 5% | 风险资产受益，成长股表现好 | 可适度增加权益仓位 |
| 收益率曲线从倒挂转正 | 历史上衰退通常在此后 6-12 个月发生 | 降低杠杆，增加现金比例 |

**技术方案**: 前端 `ScenarioCard.tsx` + 后端预设场景模板

**状态**: 未实现 | 优先级 P3

---

### 脚手架 3：周报一课

每周一个概念科普，嵌入周报中分发。

**选题方向**: 收益率曲线、VIX 解读、美联储点阵图、Sahm 规则、盈亏平衡通胀率、净流动性计算方式 ...

**技术方案**:
- 内容由 AI 生成初稿 + 人工审核
- 存储在 Insforge 数据库中
- 在周报中嵌入"本周一课"区块

**状态**: 未实现 | 优先级 P3

---

## 五、前瞻引擎 — 事件日历 + AI 前瞻研判

### 事件日历

展示未来 1-2 周影响市场的关键事件。

| 事件类型 | 数据源 | 示例 |
|---------|--------|------|
| 经济数据发布 | FMP 经济日历 API | CPI、非农、PMI、消费者信心 |
| 美联储活动 | FMP + 手动维护 | FOMC 会议、联储官员讲话 |
| 财报季节点 | 现有 `earnings.py` | 大型科技公司财报日期 |

**技术方案**: 复用 `shared/data_tools/calendar.py` + 前端 `EventCalendar.tsx`

**状态**: 后端数据已有 (`calendar.py`)，前端日历组件未实现 | 优先级 P2

**注意**: 周报中已有 `week_ahead` 字段 (3-5 个事件的 if-then 预判)，独立日历组件是增量功能。

### AI 前瞻研判

**状态**: 部分实现

周报 Agent (`features/weekly_report/agent.py`) 已包含前瞻研判能力：
- `week_ahead`: 3-5 个关键事件 + if-then 预判
- `investment_implications`: 风格倾向 + 板块偏好 + 风险提示

**未实现**: 独立的实时前瞻 Agent (`macro_risk/agent.py`)，当前前瞻内容仅在周报中提供。
评估后认为周报频率已够，暂不需要独立的每日前瞻 Agent。降为 P3。

---

## 六、周报产品 -- PARTIALLY DONE

### 结构设计 -- DONE

```
┌─ 周报标题 ─────────────────────────┐
│  MarketBrew 宏观周报 · 2025.W06    │
├────────────────────────────────────┤
│  一、本周宏观定调 (executive_summary)│
│  综合判断 + 环境定性                │
├────────────────────────────────────┤
│  二、四维信号灯 (signal_lights)     │
│  流动性/经济/通胀/情绪 green/yellow/red │
├────────────────────────────────────┤
│  三、本周市场回顾 (market_recap)    │
│  指数表现 + 风格/板块趋势           │
├────────────────────────────────────┤
│  四、四大板块分析                   │
│  每个板块: 数据变化 → 趋势解读 → 市场含义 │
├────────────────────────────────────┤
│  五、对股市的启示 (investment_implications) │
│  风格倾向 + 板块偏好 + 风险提示      │
├────────────────────────────────────┤
│  六、下周关注 (week_ahead)          │
│  3-5 个关键事件 + if-then 预判      │
└────────────────────────────────────┘
```

### 已完成

| 组件 | 路径 | 说明 |
|------|------|------|
| 数据模型 | `features/weekly_report/models.py` | `WeeklyReportOutput`, `SignalLights`, `SectionAnalysis`, `WeekAheadEvent` |
| AI Agent | `features/weekly_report/agent.py` | Google ADK (gemini-3-pro-preview) 生成报告 |
| 数据收集 | `features/weekly_report/data_collector.py` | 整合 4 板块数据 + 市场表现 + 日历 |
| 数据库 | `features/weekly_report/db.py` | Insforge `weekly_macro_reports` 表 + edge function |
| API 端点 | `features/weekly_report/router.py` | GET 读取 / POST 生成 (X-Cron-Secret 保护) |
| 前端展示 | `InsightBanner` 组件 | 在 4 个详情页中展示周报 AI 解读 |
| 测试 | `tests/e2e/test_weekly_report_e2e.py` + `tests/test_weekly_report_unit.py` | 9 E2E + 10 单元测试 |

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/weekly-report` | GET | 获取最新周报 (或 `?week=2025.W06` 指定周) |
| `/api/weekly-report/list` | GET | 分页列表 (`?limit=20&offset=0`) |
| `/api/weekly-report/generate` | POST | 生成周报 (需 `X-Cron-Secret`，支持 `?force=true`) |

### 未完成

| 任务 | 说明 | 优先级 |
|------|------|--------|
| HTML 邮件模板 | 需在 `email_service.py` 中添加 `_format_weekly_html()` | P1 |
| 邮件分发端点 | `/api/weekly-report/send` 广播周报邮件 | P1 |
| Cron Job 配置 | 每周日晚自动生成 + 周一早晨发送 | P1 |
| 前端周报阅读页 | 独立页面展示完整周报内容 | P2 |

---

## 七、实施路线图

### Phase 1: 基础重构 -- DONE

> 目标: 完成四大板块数据层 + 前端重构

| 任务 | 状态 | 说明 |
|------|------|------|
| 重构经济基本面板块 | DONE | 合并 3 分类为 `get_economic_fundamentals()` |
| 新建通胀与利率板块 | DONE | `get_inflation_rates()` + CPI 细分 + 国债曲线 |
| 新建市场情绪板块 | DONE | `get_market_sentiment()` + CNN Fear & Greed |
| 更新 API 响应结构 | DONE | `EconomicFundamentals` 统一模型 + 新 router 端点 |
| 前端四板块重构 | DONE | `/macro/*` 4 个详情页 + 5 个图表组件 |
| 删除流动性 AI 分析 | DONE | 移除 `agent.py` / `db.py` / edge function |
| 后端测试 | DONE | 25 个测试 (周报 E2E + 流动性 E2E + 模型单元测试) |

### Phase 2: 周报闭环 + 教育 -- IN PROGRESS

> 目标: 完成周报邮件分发 + 交互教育功能

| 任务 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| 周报 AI 生成 | DONE | -- | `weekly_report/agent.py` 已完成 |
| 周报数据收集 | DONE | -- | `data_collector.py` 整合 4 板块 + 日历 |
| 周报 API 读写 | DONE | -- | GET/POST 端点 + DB 持久化 |
| 前端 InsightBanner | DONE | -- | 在详情页展示周报 AI 解读 |
| 周报 HTML 邮件模板 | TODO | P1 | `email_service.py` 新增 `_format_weekly_html()` |
| 周报邮件分发 | TODO | P1 | `/api/weekly-report/send` + Cron 配置 |
| 移除 AI 股票篮子 | TODO | P2 | `_compute_ai_health()` + `AI_STOCK_BASKET` 仍在代码中，前端已不使用 |
| 指标即教育 | TODO | P2 | `RiskIndicator` 新增 `education_text` 字段 |
| 事件日历组件 | TODO | P2 | 前端 `EventCalendar.tsx`，后端数据已有 |
| 前端周报阅读页 | TODO | P2 | 独立页面展示完整周报 |

### Phase 3: 增强 + 打磨

> 目标: 高级功能 + 用户体验优化

| 任务 | 状态 | 优先级 |
|------|------|--------|
| 情景推演卡片 (`ScenarioCard.tsx`) | TODO | P3 |
| 周报一课 (概念科普) | TODO | P3 |
| 自定义看板 (用户选择板块/指标) | TODO | P3 |
| 通知与预警 (指标异常推送) | TODO | P3 |
| 指标相关性分析 | TODO | P3 |
| 实时前瞻 Agent (`macro_risk/agent.py`) | TODO | P3 |

---

## 八、当前代码架构

### 后端架构

```
features/macro_risk/
  service.py          # 四板块核心逻辑 (dashboard, economy, inflation, sentiment)
  models.py           # MacroRiskDashboard, EconomicFundamentals, RiskIndicator
  router.py           # API 端点 (/api/macro-risk/*)

features/liquidity/
  fred_service.py     # FRED API 流动性指标 (WALCL, TGA, RRP, NFCI, SOFR, EFFR)
  router.py           # API 端点 (/api/liquidity/*)
  [已删除]            # agent.py, db.py (AI 分析功能已移除)

features/weekly_report/
  agent.py            # WeeklyReportAgent (Google ADK, gemini-3-pro-preview)
  data_collector.py   # collect_weekly_data() 整合 4 板块 + 市场表现 + 日历
  db.py               # Insforge edge function 读写
  models.py           # WeeklyReportOutput, SignalLights, SectionAnalysis, WeekAheadEvent
  router.py           # API 端点 (/api/weekly-report/*)
```

### 前端页面

```
/macro                    # 宏观仪表板首页 (4 维度概览)
/macro/liquidity          # 流动性环境详情
/macro/economy            # 经济基本面详情
/macro/inflation-rates    # 通胀与利率详情
/macro/sentiment          # 市场情绪详情
```

### 前端组件

| 组件 | 用途 |
|------|------|
| `InsightBanner` | AI 解读横幅 (3 层: 数据变动 / 趋势解读 / 市场影响) |
| `HistoryAreaChart` | 通用历史面积图 (可复用基础组件) |
| `IndexAreaChart` | 指数历史图 (VIX/VVIX/SKEW) |
| `CommodityAreaChart` | 商品历史图 (Gold/Silver/Oil/Copper/DXY) |
| `YieldCurveChart` | 国债收益率曲线 |
| `MacroPageHeader` | 宏观页面统一页头 |
| `NetLiquidityChart` | 净流动性图表 |

### 数据流架构

```
FRED API ────────────────────────────┐
  (流动性 7 series)                    │
  (经济基本面 11 series)                │
  (通胀与利率 7 series)                 │
                                     ├──→ macro_risk/service.py ──→ 四板块评分 + API
yfinance ──────────────────────────┤
  (VIX/VVIX/SKEW, S&P 500 成分股)     │
                                     │
CNN Fear & Greed API ────────────────┤
  (7 组件恐慌贪婪指数)                  │
                                     │
FMP API ─────────────────────────────┘
  (经济日历, 财报日历, 国债利率)

                    ↓
         weekly_report/data_collector.py  (每周收集)
                    ↓
         weekly_report/agent.py  (AI 生成周报)
                    ↓
         Insforge DB  (持久化)
                    ↓
         InsightBanner  (前端展示 AI 解读)
```

### 遗留清理项

| 项目 | 说明 | 优先级 |
|------|------|--------|
| `AI_STOCK_BASKET` + `_compute_ai_health()` | 后端仍在 dashboard API 中计算和返回 `ai_stocks`，但前端 `/macro` 页面已不使用 | P2 |
| `test_macro_risk_unit.py` | 因 `_get_cached_dashboard` 重命名导致 import 失败，需更新 | P2 |
