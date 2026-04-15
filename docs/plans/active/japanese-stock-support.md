# Japanese Stock Support - Implementation Plan

## Overview

在 Stock Research 模块中增加日本股票支持。当前系统全面假设 US-only（USD、美东时区、美股行业分类、Fed 宏观），需要系统性改造为 multi-market 架构。

**前提**: FMP Ultimate 计划已覆盖日本市场（46 国之一）。

## 现状诊断

### 已兼容 (无需改动)
- Symbol 正则 `^[A-Z0-9.\-]{1,10}$` 已支持 `.T` 后缀 (如 `7203.T`)
- FMP search API `/stable/stock-list` 已包含日本股票
- 前端搜索 hook 无硬编码过滤
- Screener filter 策略本身无交易所检查

### 需要改动的硬编码问题

| 问题 | 文件 | 严重程度 |
|------|------|---------|
| 货币硬编码 USD | `models.py:311`, `db.py:205` | Critical |
| 前端 `$` 符号硬编码 | `OverviewTab`, `EarningsTab`, `StockDetailContent` | Critical |
| `formatNumber()` 锁定 USD | `StockDetailContent.tsx:383-410` | Critical |
| TradingView 时区 `America/New_York` | `TradingViewWidget.tsx:59` | High |
| 价格 `.toFixed(2)` 假设小数 | 多处 | High |
| Screener 锁定 `Market.AMERICA` | `screener/refresher.py:134` | High |
| AI Prompt 美股导向 | `agent/fundamental.py`, `agent/macro.py` | High |
| 宏观分析只有 Fed/VIX | `agent/macro.py` | Medium |
| Peer 比较用美股行业分类 | `service.py:484-511` | Medium |
| 新闻源偏英语 | `agent/news.py` | Medium |
| 财年假设日历年 | `service.py:350-376` | Medium |
| URL 路由 `.T` 点号问题 | `[symbol]/page.tsx` | Medium |

---

## Phase 1: Multi-Currency Foundation (基础层)

**目标**: 让系统能正确识别、存储、显示非 USD 货币。这是所有后续工作的前提。

### 1.1 后端 - 货币感知

**backend/app/features/stock/models.py**
- `StockQuote` / `StockFinancial` 等模型的 `currency` 字段改为从数据源动态获取
- 移除 `currency: str = "USD"` 硬编码

**backend/app/features/stock/service.py**
- `get_stock_quote()` / `get_financial_data()` 等方法提取并传递 currency
- yfinance 已返回 JPY，当前代码忽略了这个字段，需要采用

**backend/app/shared/fmp_service.py**
- FMP profile 端点返回 `currency` 字段，确保透传到前端

**新增**: 交易所-货币映射工具
```python
EXCHANGE_CURRENCY = {
    "NYSE": "USD", "NASDAQ": "USD", "AMEX": "USD",
    "TSE": "JPY", "OSE": "JPY",  # Tokyo / Osaka
    "HKSE": "HKD", "LSE": "GBP",
}
```

### 1.2 前端 - 货币格式化

**新增**: `formatCurrency()` 通用函数替代所有硬编码 `$`
```typescript
function formatCurrency(
  value: number,
  currency: string = "USD",
  compact?: boolean
): string
// USD: $123.45  |  JPY: ¥12,345  |  compact: $1.2B / ¥1.2兆
```

**改动文件**:
- `StockDetailContent.tsx` - `formatNumber()` 接受 currency 参数
- `OverviewTab.tsx` - `fmtBig()` 改用 `formatCurrency()`
- `EarningsTab.tsx` - `fmt()` / `fmtStatementVal()` 改用 `formatCurrency()`
- `shared.tsx` - 如有通用格式化函数也需修改

**关键规则**:
- USD: 2 位小数
- JPY: 0 位小数（日股价格都是整数）
- 大数缩写: USD 用 B/M，JPY 用 兆/億

### 1.3 前端 - Symbol URL 处理

**frontend/src/app/stock/[symbol]/page.tsx**
- 路由跳转时 `encodeURIComponent(symbol)` 编码 `.T`
- 页面接收时 `decodeURIComponent(params.symbol)` 解码
- 测试 Next.js App Router 对 `6753.T` 路径的处理

---

## Phase 2: Stock Detail 适配 (个股研究页)

**目标**: 用户能正常查看一只日本股票的完整分析页面。

### 2.1 TradingView 图表

**frontend TradingViewWidget.tsx**
- 时区从硬编码改为按交易所动态设置
```typescript
const EXCHANGE_TZ: Record<string, string> = {
  NYSE: "America/New_York",
  NASDAQ: "America/New_York",
  TSE: "Asia/Tokyo",
};
```
- Symbol 格式验证：TradingView 用 `TSE:7203` 格式还是 `7203.T`，需要测试确认

### 2.2 AI Agent Prompts 国际化

**agent/fundamental.py** - 基本面分析
- 移除 "Wall Street N位分析师" 硬编码措辞
- 添加市场感知上下文：如果是日股，提供日本市场的 P/E 基准（日经平均 ~15-20x vs 美股 20-25x）
- 提示 Agent 注意日本公司的财年通常是 4月-3月

**agent/macro.py** - 宏观分析
- 当前只注入 Fed Funds Rate / VIX / US Treasury
- 日股需要注入：BOJ 利率、日元汇率 (USD/JPY)、日经 225 指数
- 方案：根据股票的 exchange 选择注入不同的宏观数据集

**agent/technical.py** - 技术分析
- pandas-ta 指标通用，无需改动
- tvscreener 数据源需验证对 TSE 的覆盖度
- 成交量阈值可能需要按市场调整

**agent/news.py** - 新闻分析
- FMP 新闻 API 对日股覆盖较弱
- 短期方案：依赖 FMP 能返回的英文新闻
- 中期方案：考虑补充日语新闻源

### 2.3 Peer Comparison 适配

**service.py** `get_peer_data()`
- FMP `/stable/stock-peers` 对日股可能返回错误的 peer（如 Toyota 返回 GM 而非 Nissan）
- 方案：如果 FMP peer 结果 <3 个或全是美股，回退到同行业+同交易所筛选
- 行业 PE 对比需区分市场（日股用日本行业 PE，不用美股的）

### 2.4 财年处理

**service.py:350-376**
- 当前用月份推断 fiscal quarter（假设日历年）
- 日本公司 fiscal year: 4月开始 → Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
- 方案：优先使用 FMP 返回的 `fiscal_period` 字段，不自己推算

---

## Phase 3: Screener 扩展

**目标**: 用户能在选股器中筛选日本股票。

### 3.1 Universe 扩展

**screener/refresher.py:134**
```python
# 当前
screener.set_markets(Market.AMERICA)
# 改为
screener.set_markets(Market.AMERICA, Market.JAPAN)
```
- 验证 tvscreener 对日本市场的字段覆盖度（PE、ROE、dividend yield 等）
- 缺失字段需要 fallback 到 FMP 或标记为 N/A

### 3.2 前端筛选 UI

- 添加「市场」筛选维度：全部 / 美国 / 日本
- Sector 翻译增加日本市场的行业名称映射
- 注意：日股 market cap 单位是 JPY，排序时需要统一换算或分开展示

### 3.3 数据质量

- 日股的 analyst rating 覆盖度低，相关策略（如 value_discovery）需要容错
- 部分小盘日股可能缺少 TTM 指标，filter 需处理 None 值

---

## Phase 4: Search & Discovery

**目标**: 用户能方便地搜索和发现日本股票。

### 4.1 搜索增强

**fmp_service.py** `search_stocks()`
- FMP stock list 已包含日本股票，搜索本身无需改动
- 但需验证：搜索 "Toyota" 或 "7203" 能否返回 7203.T
- 考虑添加日语公司名搜索支持（如搜 "トヨタ"）

### 4.2 热门日股推荐

- 首页或 stock 列表页增加「日本市场」板块
- 预设热门日股：7203.T (Toyota), 6758.T (Sony), 9984.T (SoftBank), 6861.T (Keyence), 9983.T (Fast Retailing)

---

## Phase 5: 宏观模块联动 (可选增强)

### 5.1 日本宏观数据

**backend/app/features/macro/**
- 增加日本经济指标：
  - BOJ 基准利率
  - 日本 CPI / GDP
  - USD/JPY 汇率
  - 日经 225 / TOPIX 指数
- FRED 有部分日本数据（如 JPY 汇率），可复用现有 FRED 集成

### 5.2 Morning/Daily Report

- 如果日股用户增多，可在每日报告中增加日本市场简报
- 注意时区：日本市场比美国早开盘约 14 小时

---

## Implementation Order

```
Phase 1 (基础层) ─── 约 2-3 天
  ├── 1.1 后端货币感知
  ├── 1.2 前端货币格式化
  └── 1.3 Symbol URL 处理

Phase 2 (个股页) ─── 约 3-4 天
  ├── 2.1 TradingView 适配
  ├── 2.2 AI Prompt 国际化
  ├── 2.3 Peer Comparison
  └── 2.4 财年处理

Phase 3 (选股器) ─── 约 1-2 天
  ├── 3.1 Universe 扩展
  ├── 3.2 筛选 UI
  └── 3.3 数据质量

Phase 4 (搜索) ─── 约 1 天
  ├── 4.1 搜索验证
  └── 4.2 热门推荐

Phase 5 (宏观) ─── 可选，约 2 天
  ├── 5.1 日本宏观数据
  └── 5.2 报告联动
```

## Validation Checklist

- [ ] 搜索 "Toyota" / "7203" 能返回 7203.T
- [ ] 7203.T 个股页正常加载，价格显示 ¥ 且无小数
- [ ] 财务报表数据正确（JPY 单位）
- [ ] TradingView 图表显示东京时区
- [ ] AI 基本面分析提到日本市场背景（BOJ、日经）
- [ ] AI 宏观分析注入日本宏观数据
- [ ] Peer 比较返回日本同行（不是美股）
- [ ] Screener 能筛出日本股票
- [ ] URL `/stock/7203.T` 正常路由
- [ ] 移动端货币显示正常
