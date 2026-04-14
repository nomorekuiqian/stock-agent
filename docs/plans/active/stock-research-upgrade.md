# 个股研究升级 Engineering Plan

> Status: Planning
> Related: features/stock/.context.md
> Vision: 产品策略.md > 模块 3 — 个股深研

## 目标

新增财报解读维度 + 深化现有四维分析，让个股研究页面从"展示数据"升级为"辅助决策"。

## 现状

### 已有能力
- **四维 AI 分析**：基本面 / 技术面 / 新闻面 / 宏观面，各自独立触发、独立缓存（24h/8h TTL）
- **数据源**：OpenBB（财报）、yfinance（报价+指标）、FMP（搜索+新闻+同行+估值+财报日历）、tvscreener+pandas-ta（技术指标）、FRED（宏观）
- **三级缓存**：内存 30min → DB 30天 → API 源
- **前端**：4-tab 分析界面（grid-cols-4），价格图表，财务表格，估值对比，技术仪表盘

### 核心问题
- **DAU ~0**，用户反馈"太简单了"
- 数据齐全但不回答"所以呢"
- 大量 FMP 数据未被利用（key-metrics、ratios、financial-growth、revenue-segmentation、DCF、analyst-estimates quarterly、insider-trading）

### 数据可用性（已验证 2026-04-13）

**FMP Premium Plan ($69/mo) 可用端点**：

| 端点 | 说明 | 当前使用 |
|------|------|---------|
| `income-statement?period=quarter` (39字段) | 季度利润表 | 通过 OpenBB 部分使用 |
| `balance-sheet-statement?period=quarter` (61字段) | 季度资产负债表 | 通过 OpenBB 部分使用 |
| `cash-flow-statement?period=quarter` (47字段) | 季度现金流量表 | 通过 OpenBB 部分使用 |
| `key-metrics?period=quarter` (47字段) | 季度关键指标 | **未使用** |
| `ratios?period=quarter` (64字段) | 季度财务比率 | **未使用** |
| `financial-growth?period=quarter` (44字段) | 季度 YoY 增长率 | **未使用** |
| `analyst-estimates?period=quarter` (22字段) | 季度分析师预测 EPS/Revenue low/avg/high | **未使用** |
| `revenue-product-segmentation?period=quarter` | 按产品线拆分营收 | **未使用** |
| `revenue-geographic-segmentation` | 按地区拆分营收 | **未使用** |
| `discounted-cash-flow` | DCF 估值 | **未使用** |
| `insider-trading/search?symbol=X` | 内部人交易明细 | **未使用** |
| `insider-trading/statistics?symbol=X` | 内部人交易季度汇总 | **未使用** |
| `price-target-summary?symbol=X` | 分析师目标价汇总 | **未使用** |
| `price-target-consensus?symbol=X` | 目标价共识 | **未使用** |
| `earnings-calendar` | 财报日历 | 已使用 |

**yfinance 可用但未展示的数据**：
- `get_earnings_history()` → 近 4Q EPS actual/estimate/surprise%
- `info.beta` / `info.short_ratio` / `info.ex_dividend_date`
- `info.earningsTimestamp` → 下次财报日期

**不可用（需 Ultimate $139/mo）**：
- `earning-call-transcript`（财报电话会文字记录）
- `earnings-surprises-bulk`
- `upgrades-downgrades-consensus-bulk`
- 13F Institutional Holdings

---

## Part A：新增财报 Tab

> 第 5 个分析维度，让用户快速看懂一家公司的财报表现

### Tab 设计

**位置**：5-tab 布局，Tab 顺序：
```
基本面(amber) | 财报(emerald) | 技术面(primary) | 新闻面(blue) | 宏观面(violet)
```

**移动端**：5 Tab 改为横向滚动 flex 布局（当前 `grid-cols-4` 需调整）

### 数据层

**新增 `fmp_service.py` 方法**：

```python
def get_earnings_surprise(self, symbol: str) -> dict:
    """yfinance get_earnings_history() — 近 4Q EPS actual/estimate/surprise%"""

def get_quarterly_analyst_estimates(self, symbol: str, limit: int = 4) -> list:
    """FMP /stable/analyst-estimates?period=quarter — 季度 EPS/Revenue 预测"""

def get_revenue_segmentation(self, symbol: str) -> dict:
    """FMP /stable/revenue-product-segmentation?period=quarter — 产品线营收拆分"""

def get_revenue_geo_segmentation(self, symbol: str) -> dict:
    """FMP /stable/revenue-geographic-segmentation — 地区营收拆分"""

def get_financial_growth(self, symbol: str, limit: int = 8) -> list:
    """FMP /stable/financial-growth?period=quarter — 季度 YoY 增长率"""
```

**新增端点**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/stocks/{symbol}/earnings` | POST | AI 财报解读（走 Agent） |
| `/api/stocks/{symbol}/earnings-data` | GET | 纯数据：surprise history + 分析师预测 + 营收拆分 + 增长率 |

### Agent 层

**新增 `features/stock/agent/earnings.py`**

**数据输入**：
- yfinance earnings history（4Q EPS surprise）
- FMP quarterly income statement（近 2Q 完整损益表）
- FMP financial-growth（近 4Q YoY 增长率）
- FMP analyst-estimates quarterly（下季预测）
- FMP revenue-product-segmentation（产品线拆分）
- yfinance analyst_targets + quote_snapshot

**智能模式切换**：
- 最近一次财报 < 45 天前 → **"最新财报解读"** 模式（侧重分析最新一季）
- 下次财报 < 30 天内 → **"财报前瞻"** 模式（预期 + 历史模式 + 关注重点）
- 其他 → **"财报历史回顾"** 模式（趋势和模式分析）

**输出结构（5 段式）**：

```python
class EarningsAnalysisOutput(BaseModel):
    title: str              # "AAPL Q1 FY26: 服务收入创新高，iPhone 增速放缓值得关注"（15-40字）
    earnings_overview: str   # 本季核心数据 vs 预期，最重要的 beat/miss（500-800字）
    revenue_breakdown: str   # 产品线/地区营收拆分分析，增长引擎在哪（400-600字）
    growth_trends: str       # 近 4-8Q 增长趋势，加速还是减速（400-600字）
    earnings_verdict: str    # 综合判断 + 下季关注重点（300-500字）
```

### 前端展示

#### 事件日历置顶卡片（股票详情页顶部，所有 Tab 共享）

**位置**：价格图表下方，始终可见

**内容**：
- 下次财报日期 + 倒计时 + 盘前/盘后（BMO/AMC）
- 下次 Ex-Dividend 日期（如有）
- 分析师对下季 EPS 预期（FMP analyst-estimates）

**数据源**：yfinance `info.earningsTimestamp` + `info.ex_dividend_date` + FMP `analyst-estimates`

#### 财报 Tab 数据可视化（非 AI，纯数据）

**EPS Surprise 柱状图**：
- 近 4Q，绿色 beat / 红色 miss
- 标注 surprise %
- 数据源：yfinance `get_earnings_history()`

**营收拆分堆叠图**：
- 按产品线拆分的季度营收趋势（4-8Q）
- 数据源：FMP `revenue-product-segmentation`

**增长趋势折线图**：
- Revenue YoY / EPS YoY / Net Income YoY 三条线
- 数据源：FMP `financial-growth`

**AI 分析**：与其他 tab 一致的生成按钮 + Markdown 渲染

---

## Part B：现有维度深化

### B.1 基本面增强

#### 财务趋势 Sparkline

在财务表格上方增加 4 个迷你趋势图：
- 季度营收 / 净利润 / 毛利率 / 自由现金流（4-8Q）
- 数据源：已有 OpenBB quarterly financials
- 前端：简单 SVG sparkline 组件

#### 财务健康评分

简化版 Piotroski F-Score（0-10 分）：

| # | 指标 | 得分规则 |
|---|------|---------|
| 1 | Net Income > 0 | +1 |
| 2 | OCF > 0 | +1 |
| 3 | ROA YoY 改善 | +1 |
| 4 | OCF > Net Income（盈利质量） | +1 |
| 5 | Debt/Equity YoY 下降 | +1 |
| 6 | Current Ratio YoY 改善 | +1 |
| 7 | Shares Outstanding 未增加 | +1 |
| 8 | Gross Margin YoY 改善 | +1 |
| 9 | Asset Turnover YoY 改善 | +1 |
| 10 | Revenue YoY > 0 | +1 |

实现：后端计算，用 FMP `ratios?period=annual&limit=2` + `key-metrics?period=annual&limit=2` 做 YoY 比较，在 `get_stock_data` 响应中新增 `financial_health_score` 字段

前端：圆环进度条 + 分项明细折叠

#### 估值判断增强

- **Fair Value Range Bar**：基于 yfinance analyst target_low / target_median / target_high 画价格区间条，当前价格标注其中
- **DCF 估值参考**：展示 FMP `discounted-cash-flow` 的 DCF 值 vs 当前价格
- **估值信号灯**：PE vs 行业 PE（FMP `industry-pe`）、PE vs 5 年均值 → 高估/合理/低估

数据全部已有，无需新增 API

### B.2 技术面增强

#### 图表关键价位标注

在 `StockPriceChart`（lightweight-charts）上叠加：
- 支撑/阻力位水平线（pandas-ta 已有数据）
- 50/200 日均线（前端从 price history 计算）

实现：lightweight-charts `createPriceLine()` API

#### 多周期共振信号卡片

技术面 Tab 顶部新增：
```
┌─────────────────────────────────────┐
│  多周期信号共振                       │
│  日线: 看涨 (RSI 55, MACD 金叉)     │
│  周线: 中性 (RSI 48, 均线缠绕)       │
│  共振判断: ⚠️ 日线偏多但周线未确认    │
└─────────────────────────────────────┘
```

纯前端逻辑，基于已有 daily/weekly tvscreener 数据

### B.3 新闻面增强

#### 原始新闻 Feed

新闻面 Tab 底部，AI 分析之下：
- 最近 7 天原始新闻列表（标题 + 来源 + 时间 + 摘要前 2 行 + 原文链接）
- 数据已有（FMP `get_stock_news`）

新增端点：`GET /api/stocks/{symbol}/news-feed?days=7`

#### 内部人交易

新闻面 Tab，AI 分析与原始新闻之间：
- 最近 90 天内部人买卖列表（交易人、职位、买/卖、股数、金额、日期）
- 净买入/卖出汇总卡片

新增 `fmp_service.py` 方法：
```python
def get_insider_trading(self, symbol: str, limit: int = 20) -> dict:
    """FMP /stable/insider-trading/search?symbol=X"""

def get_insider_statistics(self, symbol: str) -> dict:
    """FMP /stable/insider-trading/statistics?symbol=X"""
```

新增端点：`GET /api/stocks/{symbol}/insider-trading`

#### 分析师目标价可视化

将纯文字分析师信息升级为可视化：
- **目标价区间条**：target_low — target_median — target_high，当前价格标注（FMP `price-target-consensus`）
- **目标价趋势**：近 1 月 / 1 季 / 1 年均价对比（FMP `price-target-summary`）

数据已有，只需前端可视化

### B.4 宏观面增强

当前宏观面 Tab 内容已经比较完善。小优化：
- 将 F&G 子项评分可视化为迷你条形图（替代纯文字）

---

## 实施步骤

### Step 1：后端数据层（财报 + 新增 FMP 方法）

1. [ ] `fmp_service.py` 新增方法：`get_quarterly_analyst_estimates`、`get_revenue_segmentation`、`get_revenue_geo_segmentation`、`get_financial_growth`、`get_insider_trading`、`get_insider_statistics`
2. [ ] `yfinance_service.py` 新增方法：`get_earnings_history`（封装 `Ticker.get_earnings_history()`）
3. [ ] `features/stock/service.py` 新增 `get_earnings_data` 方法，聚合以上数据
4. [ ] `features/stock/service.py` 新增 `financial_health_score` 计算逻辑
5. [ ] `features/stock/models.py` 新增 Pydantic 模型

### Step 2：后端 Agent + 端点

6. [ ] 新增 `features/stock/agent/earnings.py` — 财报解读 Agent（含智能模式切换）
7. [ ] `router.py` 新增 `POST /api/stocks/{symbol}/earnings` — AI 财报解读
8. [ ] `router.py` 新增 `GET /api/stocks/{symbol}/earnings-data` — 纯数据
9. [ ] `router.py` 新增 `GET /api/stocks/{symbol}/news-feed?days=7` — 原始新闻
10. [ ] `router.py` 新增 `GET /api/stocks/{symbol}/insider-trading` — 内部人交易

### Step 3：前端 — 财报 Tab + 事件日历

11. [ ] React Query hooks：`useEarningsData`、`useGenerateEarningsAnalysis`、`useNewsFeed`、`useInsiderTrading`
12. [ ] `StockDetailContent.tsx` 扩展 tab 系统为 5-tab（grid → flex 横向滚动）
13. [ ] 事件日历置顶卡片组件（财报倒计时 + Ex-Dividend + 下季 EPS 预期）
14. [ ] 财报 Tab：EPS Surprise 柱状图
15. [ ] 财报 Tab：营收拆分堆叠图
16. [ ] 财报 Tab：增长趋势折线图
17. [ ] 财报 Tab：AI 分析渲染区域

### Step 4：前端 — 现有维度增强

18. [ ] 基本面：财务趋势 Sparkline（4 个迷你图）
19. [ ] 基本面：财务健康评分圆环组件
20. [ ] 基本面：Fair Value Range Bar + DCF 估值 + 估值信号灯
21. [ ] 技术面：图表关键价位标注（支撑/阻力 + 均线）
22. [ ] 技术面：多周期共振信号卡片
23. [ ] 新闻面：原始新闻 Feed 列表
24. [ ] 新闻面：内部人交易列表 + 汇总卡片
25. [ ] 新闻面：分析师目标价区间条 + 趋势

### Step 5：收尾

26. [ ] 更新 `features/stock/.context.md`
27. [ ] 更新 `features/stock/models.py` 补全新增模型
28. [ ] `db.py` 确认 `stock_analyses` 表支持 `analysis_type="earnings"` 缓存

---

## 待定问题

1. **营收拆分图表类型**：堆叠柱状图 vs 堆叠面积图？堆叠柱状图更常见，但面积图更能看趋势
2. **财报模式切换的时间阈值**：45 天/30 天是否合适？还是应该更短？
3. **内部人交易展示数量**：默认显示最近 20 条 + "查看更多"，还是全部展示？
4. **后续升级**：FMP Ultimate ($139/mo) 解锁 Earnings Call Transcript 后，可在财报 Tab 新增"电话会要点"段落，Agent 自动提取管理层 guidance 和分析师 Q&A 关键信息
