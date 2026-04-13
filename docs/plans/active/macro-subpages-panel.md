# 宏观子页面嵌入 Research Agent 右侧面板 — 工程计划

> Status: Draft
> Priority: P1
> Timeline: 3-4 天
> Goal: 让 Agent 右侧面板覆盖网站所有宏观子页面，用户聊宏观时有对应的可视化

## Context

当前 Research Agent 右侧面板的 `macro` 类型只显示周报数据（信号灯 + 分析文本），但网站上有 4 个独立的宏观深度页面，每个都有丰富的图表：

| 页面 | URL | 内容 | 右侧面板 |
|------|-----|------|---------|
| 流动性环境 | `/macro/liquidity` | 净流动性图、全球流动性、NFCI 仪表盘 | ❌ 缺失 |
| 经济基本面 | `/macro/economy` | GDP、失业率、收益率曲线 | ❌ 缺失 |
| 通胀与利率 | `/macro/inflation-rates` | CPI 拆解、联邦基金利率、国债收益率 | ❌ 缺失 |
| 市场情绪 | `/macro/sentiment` | CNN 恐贪指数、VIX/VVIX/SKEW | ❌ 缺失 |

用户问"流动性怎么样"时，Agent 调用 `get_liquidity_overview` 返回文字数据，但右侧面板没有变化。应该同时展示流动性页面的图表。

### 设计原则

- **复用，不重写** — 每个子页面 700-1300 行，直接复用核心组件和 hook
- **轻量面板版** — 不需要 PaywallGuard、MacroPageHeader、InsightBanner 等页面级装饰
- **保持 context 注入** — 每个面板需要 `onContextReady` 回调，让 Agent 知道用户在看什么

## 现有模式（DailyReportView 为例）

```
DailyReportView.tsx (~90 行)
  ├── 调用 useReportByDate / useLatestReport hook（复用）
  ├── 复用 <ReportContent> 组件（同 /today 页面）
  ├── useEffect → onContextReady(payload)（注入 Agent 上下文）
  └── Loading / Error / Empty 三状态处理
```

4 个新面板遵循完全相同的模式。

## 新增文件（4 个面板组件）

### `frontend/src/app/research/_components/LiquidityView.tsx`

```
数据 Hook：
  - useLiquidityMetrics() → 美国流动性快照
  - useGlobalLiquidity() → 全球流动性快照（可选，看面板空间）

核心渲染（从 /macro/liquidity/page.tsx 提取）：
  - 净流动性值 + 变化（文字卡片）
  - Fed 资产、TGA、RRP、准备金（4 个指标卡片网格）
  - SOFR / EFFR / NFCI（利率卡片）
  - NetLiquidityChart（动态导入，美国净流动性组合图）
  - 不含 Tab 切换（US/Global），不含 TradingView 图表（太重）

Context Payload：
  {
    type: 'macro_liquidity',
    net_liquidity: number | null,
    fed_assets: number | null,
    tga: number | null,
    rrp: number | null,
    reserves: number | null,
    nfci: number | null,
    sofr: number | null,
    effr: number | null,
  }

预估行数：~150 行
```

### `frontend/src/app/research/_components/EconomyView.tsx`

```
数据 Hook：
  - useEconomicFundamentals() → 经济基本面数据

核心渲染（从 /macro/economy/page.tsx 提取）：
  - 3 个 HeroCard（增长/就业/信用）显示主副指标 + 风险等级
  - 选中维度的 DeepDive 详细指标列表
  - 不含 TradingView 实时图表（太重）

Context Payload：
  {
    type: 'macro_economy',
    overall_score: number,
    overall_level: string,
    overall_headline: string,
    dimensions: [{ name_zh, score, risk_level, headline }],
  }

预估行数：~180 行
```

### `frontend/src/app/research/_components/InflationView.tsx`

```
数据 Hook：
  - useInflationRates() → 通胀与利率数据
  - useCpiBreakdown() → CPI 分项数据

核心渲染（从 /macro/inflation-rates/page.tsx 提取）：
  - 2 个 HeroCard（通胀/利率）显示主副指标
  - CPI 分项条形图或表格（核心 CPI、住房、食品、能源）
  - 关键利率指标卡片（FFR、10Y、实际利率）
  - 不含 TradingView / FredAreaChart / YieldCurveChart（太重）

Context Payload：
  {
    type: 'macro_inflation',
    overall_score: number,
    overall_level: string,
    overall_headline: string,
    dimensions: [{ name_zh, score, risk_level, headline }],
    cpi_components: [{ name_zh, yoy_pct, mom_pct }],
  }

预估行数：~200 行
```

### `frontend/src/app/research/_components/SentimentView.tsx`

```
数据 Hook：
  - useMarketSentiment() → 市场情绪数据

核心渲染（从 /macro/sentiment/page.tsx 提取）：
  - CNN Fear & Greed 总分 + 等级（大号 gauge 或数字卡片）
  - CNN 7 个分项指标卡片（网格）
  - VIX / VVIX / SKEW 指标值
  - 不含 TradingView 图表 / IndexAreaChart

Context Payload：
  {
    type: 'macro_sentiment',
    overall_score: number,
    overall_level: string,
    overall_headline: string,
    dimensions: [{ name_zh, score, risk_level, headline }],
  }

预估行数：~170 行
```

## 修改文件

### `frontend/src/app/research/_lib/contentTypes.ts`

新增 4 个 content type：

```typescript
export type ContentType =
  | 'screener' | 'stock' | 'daily_report' | 'morning_report'
  | 'macro' | 'sector' | 'brew'
  | 'macro_liquidity' | 'macro_economy' | 'macro_inflation' | 'macro_sentiment';

export const MACRO_LIQUIDITY_CONTENT: ContentContext = {
  type: 'macro_liquidity',
  label: '流动性环境',
  summary: '',
  params: {},
  available_actions: ['解读流动性数据', '对持仓有什么影响', '返回宏观总览'],
};

export const MACRO_ECONOMY_CONTENT: ContentContext = {
  type: 'macro_economy',
  label: '经济基本面',
  summary: '',
  params: {},
  available_actions: ['解读经济数据', '对持仓有什么影响', '返回宏观总览'],
};

export const MACRO_INFLATION_CONTENT: ContentContext = {
  type: 'macro_inflation',
  label: '通胀与利率',
  summary: '',
  params: {},
  available_actions: ['解读通胀数据', '美联储会怎么做', '返回宏观总览'],
};

export const MACRO_SENTIMENT_CONTENT: ContentContext = {
  type: 'macro_sentiment',
  label: '市场情绪',
  summary: '',
  params: {},
  available_actions: ['解读情绪指标', '现在适合买入吗', '返回宏观总览'],
};
```

### `frontend/src/app/research/_components/ContentPanel.tsx`

- 导入 4 个新组件 + 4 个新 context payload 类型
- 添加 4 个 `onXxxContextReady` 回调 prop
- 添加 4 个条件渲染分支

### `frontend/src/app/research/page.tsx`

- 添加 4 个 contextRef（`liquidityContextRef` 等）
- 在 `buildActiveContext` 中添加 4 个 `else if` 分支
- 在 navigate 处理中添加 4 个 `else if` 分支
- 将 4 个 `onXxxContextReady` 回调传入 ContentPanel

### `backend/app/features/screener/research_agent.py`

**navigate 字段**：
- `ResearchAgentOutput` 的 navigate type 扩展：添加 `macro_liquidity`、`macro_economy`、`macro_inflation`、`macro_sentiment`

**Instruction prompt 更新**：
- 工具分组中"宏观环境"部分，添加导航指引：

```
### Macro Environment Navigation
When you call macro tools, navigate to the corresponding sub-page:
- get_liquidity_overview → navigate to macro_liquidity
- get_macro_risk_summary → navigate to macro (main dashboard)
- get_market_sentiment → navigate to macro_sentiment
- get_economic_calendar → no navigation (calendar events, not a dashboard)

When user explicitly asks about inflation/CPI → navigate to macro_inflation
When user explicitly asks about economy/GDP/employment → navigate to macro_economy
```

**Agent context 处理**（`build_prompt` 方法）：
- 新增 4 个 content_context type 的格式化分支

## 实施顺序

```
Day 1: 4 个面板组件
  - LiquidityView.tsx (~150 行)
  - EconomyView.tsx (~180 行)
  - InflationView.tsx (~200 行)
  - SentimentView.tsx (~170 行)
  - 每个组件：hook 调用 → 核心 UI 渲染 → onContextReady 回调
  - 不含重型图表（TradingView / FredAreaChart），只用指标卡片和文字

Day 2: 前端集成
  - contentTypes.ts 新增 4 个类型
  - ContentPanel.tsx 新增 4 个渲染分支
  - page.tsx 新增 4 个 contextRef + buildActiveContext + navigate 处理
  - 本地验证：手动修改 activeContent type 看面板是否正确渲染

Day 3: 后端 Agent 集成
  - research_agent.py 扩展 navigate type
  - instruction prompt 添加导航指引
  - build_prompt 添加 4 个 context 格式化分支
  - 端到端测试：问"流动性怎么样"→ 验证右侧显示 LiquidityView

Day 4: 打磨 + 移动端
  - 移动端 tab 切换适配
  - 空数据处理（API 无数据时显示友好提示）
  - Agent 主动 navigate 的触发条件精调
  - 从 MacroOverview 面板点击维度可钻取到子面板
```

## 关键文件

| 文件 | 操作 |
|------|------|
| `frontend/src/app/research/_components/LiquidityView.tsx` | 新建 |
| `frontend/src/app/research/_components/EconomyView.tsx` | 新建 |
| `frontend/src/app/research/_components/InflationView.tsx` | 新建 |
| `frontend/src/app/research/_components/SentimentView.tsx` | 新建 |
| `frontend/src/app/research/_lib/contentTypes.ts` | 修改（+4 类型） |
| `frontend/src/app/research/_components/ContentPanel.tsx` | 修改（+4 渲染分支） |
| `frontend/src/app/research/page.tsx` | 修改（+4 contextRef + navigate + activeContext） |
| `backend/app/features/screener/research_agent.py` | 修改（navigate type + instruction + build_prompt） |

## 完成后右侧面板类型总览（10 种）

| # | 类型 | 触发场景 | 状态 |
|---|------|---------|------|
| 1 | `screener` | 选股筛选 | 已有 |
| 2 | `stock` | 个股研究 | 已有 |
| 3 | `daily_report` | 市场日报 | 已有 |
| 4 | `morning_report` | 盘前早报 | 已有 |
| 5 | `macro` | 宏观总览（周报） | 已有 |
| 6 | `brew` | 专属日报 | 已有 |
| 7 | `macro_liquidity` | 流动性分析 | 新增 |
| 8 | `macro_economy` | 经济基本面 | 新增 |
| 9 | `macro_inflation` | 通胀与利率 | 新增 |
| 10 | `macro_sentiment` | 市场情绪 | 新增 |

## 风险与降级

| 风险 | 降级方案 |
|------|---------|
| 面板组件复用原页面的图表太重（TradingView） | 面板版只用指标卡片 + 文字，不含实时图表 |
| 4 个新 context 增加 prompt token | context payload 只保留核心指标（score/level/headline），不传原始数据 |
| Agent navigate 太频繁 | instruction 约束：只在用户明确聊宏观时 navigate，不在简单提及时跳转 |
| 移动端面板切换体验差 | 保持现有 mobileTab 切换模式，与已有面板一致 |
