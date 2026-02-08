# 数据工具 (Data Tools) 开发笔记

> 最后更新: 2026-02-05

---

## 一、为什么做这些工具？

TheMarketBrew 的核心用户是关注美股宏观面的投资者。市场日报和个股分析已经上线，但缺少一个**可以随时打开、一眼看全局**的实时监控层。

流动性和宏观风险是驱动大盘走势的两大核心力量：

- **流动性 (Liquidity)** 决定了市场有多少钱在流动。美联储缩表 (QT)、财政部发债 (TGA)、逆回购 (RRP) 的此消彼长直接影响风险资产价格。2022-2023 年的市场走势几乎可以用净流动性公式 (WALCL - TGA - RRP) 来解释。
- **宏观风险 (Macro Risk)** 决定了经济是否正在恶化。衰退概率、信用利差、就业数据、AI 板块健康度——这些指标综合起来可以告诉你市场的"体温"。

把这些指标做成可视化看板，用户不需要自己去 FRED 查数据、去 TradingView 拼图表，打开一个页面就能掌握全局。

---

## 二、已完成的工作

### 2.1 流动性监控看板 (`/tools/liquidity`)

**状态**: 已上线

**功能概览**:
- 核心指标卡片: 美联储总资产 (WALCL)、TGA、隔夜逆回购 (RRP)、银行准备金、SOFR、EFFR、NFCI
- 净流动性公式: WALCL - TGA - RRP，自定义折线图展示
- NFCI 仪表盘: 金融条件松紧程度的直观展示
- TradingView 图表: 每个指标配有交互式图表，支持 1M/3M/6M/1Y/ALL 时间范围
- AI 分析: 基于 OpenAI GPT-4o-mini + web search 的流动性分析报告
- 中文指标说明: 每个指标都有详细的中文解读

**技术栈**:
- 后端: `features/liquidity/fred_service.py` (FRED API 封装)、`features/liquidity/router.py`、`features/liquidity/agent.py` (OpenAI)
- 前端: `tools/liquidity/page.tsx`、`LiquidityCard`、`NFCIGauge`、`NetLiquidityChart`、`TradingViewWidget`
- 数据源: FRED API (7 个系列)

**关键文件**:
```
backend/app/features/liquidity/
├── router.py          # /api/liquidity/metrics, /api/liquidity/analysis, /api/liquidity/history
├── agent.py           # LiquidityAgent (OpenAI GPT-4o-mini + web search)
├── fred_service.py    # FRED API: fetch_fred_series, get_latest_value, get_all_liquidity_metrics
└── db.py              # liquidity_analyses 表

frontend/src/
├── app/tools/liquidity/page.tsx
└── components/
    ├── LiquidityCard.tsx
    ├── NFCIGauge.tsx
    ├── NetLiquidityChart.tsx
    └── TradingViewWidget.tsx
```

---

### 2.2 宏观风险监控看板 (`/tools/macro-risk`)

**状态**: 已完成开发，待生产验证

**功能概览**:

#### 风险评分系统 (0-10 分)
综合评分 = 4 个类别等权平均，颜色映射:
- 0-3: 低风险 (emerald 绿色)
- 4-6: 中等风险 (amber 橙色)
- 7-10: 高风险 (red 红色)

#### 5 个板块

| # | 板块 | 数据源 | 指标 |
|---|------|--------|------|
| 1 | 经济恶化 | FRED | 衰退概率 (35%)、收益率曲线 (30%)、CFNAI (20%)、消费者信心 (15%) |
| 2 | 信用/违约风险 | FRED | 高收益债利差 (40%)、BBB利差 (25%)、商业地产违约率 (20%)、商业贷款违约率 (15%) |
| 3 | 就业市场 | FRED | Sahm规则 (35%)、失业率 (25%)、初请失业金 (25%)、非农就业 (15%) |
| 4 | AI 公司健康度 | yfinance | 10只AI核心股日均涨跌 (60%)、下跌比例 (40%) |
| 5 | 流动性摘要 | 复用 liquidity API | NFCI + 净流动性 + 跳转到完整流动性看板 |

#### AI 股票篮子
NVDA, MSFT, GOOGL, META, AMD, AVGO, TSM, SMCI, ARM, PLTR

#### UI 特点
- 完全复用流动性看板的 UI 模式 (header、卡片网格、TradingView 图表、IndicatorDescription)
- RiskGauge 综合仪表 (参照 NFCIGauge)
- AI 股票实时报价表格
- NVDA + BOTZ ETF 图表
- 全中文界面
- 10 分钟内存缓存

**关键文件**:
```
backend/app/features/macro_risk/
├── __init__.py
├── models.py          # RiskIndicator, CategoryRiskScore, AIStockInfo, MacroRiskDashboard
├── service.py         # FRED 并行获取 + yfinance 报价 + 风险评分算法
└── router.py          # /api/macro-risk/dashboard, /api/macro-risk/history/{series_id}

frontend/src/
├── app/tools/macro-risk/
│   ├── page.tsx       # 主页面 (5 个板块 + 12 个 TradingView 图表)
│   └── layout.tsx     # metadata
└── components/
    ├── RiskGauge.tsx        # 综合风险仪表 (0-10)
    └── RiskSummaryBar.tsx   # 风险总览 (仪表 + 4 类别卡片)
```

**复用的组件** (未修改):
- `LiquidityCard` - 指标卡片
- `TradingViewWidget` - 图表
- `fred_service.py` 中的 `get_latest_value()`, `get_all_liquidity_metrics()`
- `yfinance_service.py` 中的 `get_stock_quotes()`

---

### 2.3 工具入口页 (`/tools`)

已注册两个可用工具:
1. 宏观风险监控 (macro-risk) - available
2. 流动性监控 (liquidity) - available

预留两个 Coming Soon:
3. 经济日历 (calendar) - coming soon
4. 财报追踪 (earnings) - coming soon

---

## 三、未来可做的事情

### 3.1 短期改进 (现有看板优化)

#### 宏观风险看板
- [ ] **历史评分趋势**: 将每次计算的评分存入数据库，展示 30/90/180 天评分走势图
- [ ] **AI 分析报告**: 类似流动性看板的 AI 分析功能，用 LLM 生成宏观风险综合解读
- [ ] **评分阈值告警**: 当综合评分突破某个阈值 (如 >7) 时通过邮件通知订阅用户
- [ ] **30日回看指标**: 加入 AI 篮子 30 日均涨跌、更长周期的就业数据趋势
- [ ] **FMP 分析师评级**: 接入 FMP API 获取 AI 股票的分析师评级变化 (已在计划中但未实现)
- [ ] **信用卡违约率 + 全部贷款违约率**: FRED 系列 DRCCLACBS、DRALACBS (已在原始计划中)

#### 流动性看板
- [ ] **净流动性对比叠加**: 将 SPY 走势与净流动性叠加展示，直观看相关性
- [ ] **QT 进度追踪**: 美联储缩表进度可视化，预测 QT 结束时间点
- [ ] **美联储会议倒计时**: 距离下次 FOMC 会议的倒计时

### 3.2 新工具

#### 经济日历 (`/tools/calendar`)
- 接入经济事件 API (investing.com / FMP economic calendar)
- FOMC 会议日程、非农/CPI 发布日、财报季时间线
- 按重要性分级 (高/中/低影响)
- 支持日/周/月视图

#### 财报追踪 (`/tools/earnings`)
- 关注列表中股票的财报日期
- 历史财报 EPS 对比 (预期 vs 实际)
- 财报发布后的股价反应统计
- 可以和个股分析 (/stock) 模块联动

#### 市场情绪仪表盘 (`/tools/sentiment`)
- 恐惧贪婪指数 (CNN Fear & Greed)
- VIX 及 VIX 期限结构
- Put/Call Ratio
- AAII 散户情绪调查
- 融资融券数据 (FINRA Margin)

#### 资金流向 (`/tools/flows`)
- ETF 资金流入/流出
- 行业轮动热力图
- 外资持仓变化 (TIC 数据)

### 3.3 平台级功能

- [ ] **统一告警系统**: 用户自定义指标阈值，触发邮件/推送通知
- [ ] **个性化看板**: 用户可以选择关注哪些指标，自定义布局
- [ ] **数据导出**: CSV/PDF 导出功能
- [ ] **移动端优化**: 虽然已响应式，但可以做更多移动端专属优化
- [ ] **国际化**: 目前以中文为主，未来可以支持中英切换

---

## 四、架构备忘

### 数据流
```
FRED API / yfinance / FMP
       ↓
  Backend Service (并行获取 + 缓存)
       ↓
  FastAPI Router (JSON API)
       ↓
  Frontend Page (fetch + render)
       ↓
  TradingView Widget (嵌入式图表)
```

### 复用模式
新工具应复用以下模式:
1. **后端**: `features/{tool}/` 标准结构 (router + service + models)
2. **前端**: 流动性看板的 UI 模式 (header + 卡片网格 + TradingView 图表 + IndicatorDescription)
3. **组件**: `LiquidityCard`, `TradingViewWidget`, 以及新的 `RiskGauge`
4. **缓存**: 10 分钟内存缓存 (适合免费 FRED API 的请求限制)

### FRED API 注意事项
- 免费版有请求频率限制，务必做好缓存
- 部分序列更新频率不同: 日频 (利差、利率)、周频 (资产负债表)、月频 (失业率)、季频 (违约率)
- 宏观风险看板共用 13 个 FRED 系列 + 流动性看板的 7 个 = 20 个系列
