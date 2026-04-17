# Agent 右侧面板改造 Engineering Plan

> Status: Planning
> Related: `frontend/src/app/research/_components/StockResearchView.tsx`, `frontend/src/app/research/_components/MacroOverview.tsx`, `frontend/src/app/research/_components/ContentPanel.tsx`
> Vision: 面板从"固定格式静态展示"升级为"Tab 级精准导航 + 交互式数据终端"

## 目标

1. 个股面板带 4 Tab(概览/财报/技术面/市场面),Agent 可精准导航到某个 Tab
2. 宏观面板同理,带维度 Tab
3. 每个 Tab 是**面板适配的精简版**(不照搬完整页面),但完整展示关键信息
4. 面板可交互:图表、Tab 切换、展开折叠、跳转详情页

## 约束

- 面板可用宽度: **~680px** (1440px viewport, 50/50 split, minus 32px padding)
- 面板高度: 100vh - header,纵向可滚动
- 和左侧 Chat 并列,用户边聊边看

## 现状

### 个股面板 (StockResearchView)
- 固定展示:Hero header → Key stats → 基本面指标网格(grid-cols-4) → 季度表 → AI 分析
- 无 Tab 切换
- 无图表
- 不随对话上下文变化

### 宏观面板 (MacroOverview / LiquidityView / EconomyView / InflationView / SentimentView)
- 5 个独立组件,通过 navigate.type 切换
- MacroOverview 是周报阅读摘要(文字 + 静态信号灯)
- 4 个子面板是数字卡片(无图表)
- 不聚合在一个面板里

### navigate 参数
- 当前只有 `type` + `params.symbol` / `params.date`
- **无 `tab` 字段** — Agent 无法指定面板展示哪个 Tab

---

## 设计

### 一、个股面板 (StockPanelView)

替代现有 `StockResearchView`。结构:

```
┌─────────────────────────────────────────┐
│ AAPL · Apple Inc.                        │
│ $263.40  -1.14%  ▼                       │
│ Market Cap $4.05T · P/E 28.5             │
├─────────────────────────────────────────┤
│ [概览] [财报] [技术面] [市场面]             │  ← Agent 可指定默认 Tab
├─────────────────────────────────────────┤
│                                          │
│ (当前 Tab 内容,详见下方)                   │
│                                          │
├─────────────────────────────────────────┤
│ [在详情页查看完整分析 →]                    │
└─────────────────────────────────────────┘
```

#### Tab 1: 概览(默认)

680px 宽度下单列布局:

```
[股价走势图]                         ← Interactive: 1M/3M/6M/1Y 切换
  StockPriceChart (height=200)

[核心估值]                           ← 4 卡 grid-cols-2
  P/E 28.5 (vs 板块 32.1)
  P/S  8.2 (vs 板块 6.5)
  PEG  1.8
  ROE 147%

[AI 投研分析]                        ← 复用 AnalysisSection
  title + 核心段落(公司概览/估值判断/投资摘要)
  如果没有 → "生成投资分析" CTA
```

**Interactive 元素**:
- 图表时间范围切换(1M/3M/6M/1Y 按钮组)
- 图表 hover 看具体价格+日期
- 估值卡片 hover tooltip 显示行业均值
- AI 分析段落可折叠

#### Tab 2: 财报

```
[EPS Surprise]                       ← Interactive: hover 看具体数值
  最近 4 季横向条形图
  每条: 预期 EPS vs 实际 EPS + beat/miss 标签

[关键指标趋势]                        ← 4 卡 grid-cols-2
  收入 (最近季 + QoQ%)
  EPS (最近季 + YoY%)
  毛利率 (最近季)
  自由现金流 (最近季)

[AI 财报解读]                         ← 复用 AnalysisSection
  title + 核心段落(财报概览/综合判断)
  如果没有 → "生成财报解读" CTA
```

**Interactive 元素**:
- EPS Surprise 条形图 hover 看数值
- 指标卡可点击展开查看 4 季趋势
- AI 段落可折叠
- 季度选择器(如果有多季数据)

#### Tab 3: 技术面

```
[K 线图 + 指标]                       ← Interactive: 日/周切换
  TechnicalChart (height=240)
  叠加 SMA/MACD/RSI(和详情页一致)

[核心信号]                            ← 3 卡单列
  趋势: 上行/下行/盘整 + 理由
  RSI: 45 (neutral zone)
  MACD: 看跌(死叉 3 天前)

[AI 技术分析]                          ← 复用 AnalysisSection
  title + TLDR + situation
  如果没有 → "生成技术分析" CTA
```

**Interactive 元素**:
- K 线图日线/周线切换
- K 线 hover 看 OHLCV
- 信号卡 hover tooltip 解释指标含义
- AI 段落可折叠

#### Tab 4: 市场面

```
[AI 综合解读]                          ← 复用 AnalysisSection
  title + 核心叙事 + 信号一致性
  如果没有 → "生成综合解读" CTA

[分析师评级]                           ← 精简版 AnalystRatingsCard
  目标价条 (低/共识/高)
  评级 5 段条(强买/买/持/卖/强卖)

[新闻 Top 5]                           ← Interactive: 可点击外链
  标题 + 来源 + 时间
```

**Interactive 元素**:
- 新闻标题可点击跳转
- 评级条 hover 看具体数值
- AI 段落可折叠

### 二、宏观面板 (MacroPanelView)

合并现有 MacroOverview + 4 个子面板为一个带 Tab 的组件。

```
┌─────────────────────────────────────────┐
│ 宏观环境                                  │
│ Verdict: 谨慎乐观 · Risk Score: 3.2/10   │
│ [🟢流动性] [🟡经济] [🟡通胀] [🟢情绪]       │  ← 信号灯色 + Tab
├─────────────────────────────────────────┤
│                                          │
│ (当前 Tab 内容)                           │
│                                          │
├─────────────────────────────────────────┤
│ [查看完整宏观仪表盘 →]                     │
└─────────────────────────────────────────┘
```

#### Tab: 流动性

```
[净流动性]                             ← Hero 数字
  $6.24T  ▲ +$120B (30d)

[构成分解]                             ← 4 卡 grid-cols-2
  Fed 资产负债表: $7.1T
  TGA: -$850B
  逆回购: -$320B
  其他: +$310B

[Mini 流动性趋势图]                     ← Interactive: 30d/90d 切换
  NetLiquidityChart (height=160)

[利率]                                 ← 3 卡 grid-cols-3
  SOFR: 5.31%
  10Y: 4.45%
  Spread: 1.8%
```

**Interactive 元素**:
- 流动性趋势图时间切换
- 图表 hover 看日期+数值
- 指标卡 hover tooltip 解释

#### Tab: 经济/通胀/情绪

类似精简,每个保留:
- Hero 指标(GDP%/CPI%/Fear&Greed Score)
- 子维度 3-4 卡
- Mini 趋势图(如果数据支持)
- AI 判断段落

### 三、navigate 参数扩展

```typescript
// contentTypes.ts 扩展
interface ContentContext {
  type: ContentType;
  label: string;
  summary: string;
  params: {
    symbol?: string;
    date?: string;
    tab?: string;    // 新增! "overview" | "earnings" | "technical" | "market"
    // 宏观: "liquidity" | "economy" | "inflation" | "sentiment"
  };
  available_actions: string[];
}
```

后端 Agent instruction 更新:
```python
# Agent 可以精准指定面板展示哪个 Tab
navigate: {
  "type": "stock",
  "params": { "symbol": "AAPL", "tab": "technical" }
}
# 或宏观:
navigate: {
  "type": "macro",
  "params": { "tab": "liquidity" }
}
```

### 四、Agent Instruction 更新

在 `research_agent.py` 的 navigate 规则中新增:

```
## Tab-Aware Navigation

### Stock: ALWAYS specify tab
- Discussing valuation/fundamentals/overview → tab: "overview"
- Discussing earnings/revenue/EPS → tab: "earnings"
- Discussing RSI/MACD/chart/trend → tab: "technical"
- Discussing news/analyst/sentiment → tab: "market"

### Macro: 分层导航
- 聊整体宏观/大盘/风险/市场环境 → type: "macro"(宏观首页,不指定 tab)
- 聊具体维度时才指定 tab:
  - Fed/TGA/RRP/流动性 → tab: "liquidity"
  - GDP/就业/经济 → tab: "economy"
  - CPI/利率/通胀 → tab: "inflation"
  - VIX/恐慌/贪婪 → tab: "sentiment"

### CRITICAL: 日报/早报导航规则
- ONLY navigate to daily_report/morning_report when user EXPLICITLY 
  mentions "日报"/"每日报告"/"早报"/"今日简报" etc.
- 聊"宏观"/"大盘"/"市场环境" → navigate to macro（宏观首页），NOT daily_report
- 聊"流动性"/"经济" → navigate to macro with tab，NOT daily_report
- DO NOT assume macro discussion = daily report
```

### 五、面板内 AI 生成能力

每个 Tab 在没有 AI 缓存时,**直接在面板里提供"生成 X 分析"CTA 按钮**,
用户无需跳转到详情页即可触发 AI 生成。

具体交互:
- 面板 Tab 加载时检查缓存(GET /stocks/{symbol}/analysis/cache 等)
- 有缓存 → 直接展示 AnalysisSection
- 无缓存 → 显示 CTA 按钮("生成投资分析" / "生成财报解读" / "生成技术分析" / "生成综合解读")
- 用户点击 → 调用 POST 端点 → loading spinner → 生成完展示
- 面板里的"重新生成"按钮也要有(和详情页一致)

实现:每个 Panel Tab 内部自带 useMutation hook,复用现有 API 端点:
- 概览: POST /stocks/{symbol}/analysis
- 财报: POST /stocks/{symbol}/earnings
- 技术面: POST /stocks/{symbol}/technical
- 市场面: POST /stocks/{symbol}/market-analysis

---

## 工程分步

### Phase 1: 个股面板改造 (3-4 天)

1. **新建 `StockPanelView.tsx`** 替代 `StockResearchView.tsx`
   - Hero header (保留现有)
   - 4 Tab 切换器
   - 各 Tab 精简版内容

2. **每个 Tab 精简版组件**:
   - `PanelOverviewTab.tsx` — 价格图 + 估值 4 卡 + AI
   - `PanelEarningsTab.tsx` — EPS Surprise + 指标 4 卡 + AI
   - `PanelTechnicalTab.tsx` — K 线图 + 信号 3 卡 + AI
   - `PanelMarketTab.tsx` — AI 解读 + 评级条 + 新闻 5 条

3. **navigate 参数扩展**:
   - `contentTypes.ts` 加 `tab` 字段
   - `page.tsx` handleSend 传递 tab 参数
   - ContentPanel 传 tab 到 StockPanelView

4. **Agent instruction 更新**:
   - 新增 tab-aware 导航规则

### Phase 2: 宏观面板改造 (2-3 天)

1. **新建 `MacroPanelView.tsx`** 合并 MacroOverview + 4 子面板
   - Verdict + 信号灯 header
   - 4 Tab 切换器(流动性/经济/通胀/情绪)
   - 各 Tab 精简版内容(数字 + mini 图 + AI)

2. **navigate 同步**:
   - `type: "macro"` 统一入口,通过 `tab` 切维度
   - 删除 `macro_liquidity` / `macro_economy` / `macro_inflation` / `macro_sentiment` 4 个独立 type(合并到 `macro` + `tab`)

3. **Agent instruction 同步更新**

### Phase 3: 交互增强 (2 天)

1. 图表交互(hover tooltip, 时间范围切换)
2. 指标卡 tooltip(解释金融术语)
3. "在详情页查看 →" 跳转按钮
4. 从面板触发 AI 生成(如果用户在面板上没有对应分析)

---

## Interactive 元素清单(全面)

| 元素 | 交互 | 目的 |
|---|---|---|
| Tab 切换器 | Click | 切换维度 |
| 价格/K 线图 | Hover / 时间范围按钮 | 查看具体数值 / 切换区间 |
| 日线/周线切换 | Toggle | 多时间框架分析 |
| 估值卡片 | Hover tooltip | 显示 vs 行业均值 |
| EPS Surprise 条形 | Hover | 看具体 beat/miss 金额 |
| AI 段落 | 折叠/展开 | 控制信息密度 |
| 新闻标题 | Click 外链 | 跳转原文 |
| 评级变动 | Click 展开 | 看更多变动记录 |
| 流动性趋势图 | Hover / 时间切换 | 看日期+数值 |
| 指标卡 | Hover tooltip | 解释金融术语(什么是 PEG) |
| "详情页查看" | Click | 跳转完整页面 |
| "生成 X 分析" | Click | 触发 AI 生成(如果无缓存) |

---

## 组件复用计划

| 精简版 Tab | 复用什么 | 从哪来 |
|---|---|---|
| 概览 | StockPriceChart, MetricCard, AnalysisSection | OverviewTab + shared |
| 财报 | AnalysisSection, SectionCard | EarningsTab + shared |
| 技术面 | TechnicalChart (dynamic), AnalysisSection | TechnicalTab + shared |
| 市场面 | AnalysisSection, ConsensusBar (从 AnalystRatingsCard 提取), NewsFeed | MarketTab 组件 |
| 宏观·流动性 | NetLiquidityChart, MetricCard | macro 页面 |
| 宏观·经济 | MetricCard, dimension tabs | EconomyView |
| 宏观·通胀 | MetricCard, CPI breakdown | InflationView |
| 宏观·情绪 | Sentiment bar, MetricCard | SentimentView |

## 非目标

- 不重构 Agent 后端逻辑(tool 调用、prompt 结构不变)
- 不修改左侧 Chat 面板
- 不新增数据 API(全部复用现有 hook)
- 面板不需要做到和详情页 100% 一致(精简版就是精简版)
