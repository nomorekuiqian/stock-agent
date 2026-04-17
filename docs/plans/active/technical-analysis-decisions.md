# 技术分析重构 — 关键决策记录

## 决策 1: 图表方案 — LightweightCharts v5.0 可以满足需求

### 结论

**用 LightweightCharts v5.0 替换 TradingView iframe**，完全能满足技术分析页面的所有图表需求。

### 调研结果

项目当前版本 `lightweight-charts@^5.0.9`，已在 `StockPriceChart.tsx` 中使用（仅用了最基础的面积图和 K 线图）。

v5.0 的能力覆盖：

| 需求 | 支持情况 | 具体 API |
|------|----------|----------|
| K 线图 | 原生支持 | `CandlestickSeries` |
| 主图叠加指标 (SMA/BB) | 完全支持 | 多个 `LineSeries` 在 paneIndex=0 |
| 独立面板 (RSI/MACD/Volume) | v5.0 原生 Pane | `chart.addPane()` + `paneIndex` 参数 |
| 支撑/阻力水平线 | 完全支持 | `series.createPriceLine()` |
| 信号标记 (金叉/死叉) | 完全支持 | `SeriesMarkersPrimitive` |
| 跨面板 Crosshair 同步 | 原生 Pane 自动同步 | 无需额外代码 |

### 与 TradingView Widget 的取舍

**我们放弃的**：
- 内置绘图工具（趋势线、斐波那契）— 我们的目标用户不是画线交易者
- 内置 100+ 指标库 — 我们只需要 5-6 个核心指标
- 交互式指标参数调节 — 我们控制展示哪些指标

**我们获得的**：
- 完全可编程 — 能画支撑阻力线、标注 AI 信号点、和分析文字联动
- 无品牌水印 — 不显示 TradingView logo
- 极小体积 — ~45KB gzipped vs iframe 加载整个 TradingView
- 无 iframe 隔离 — 能与 React 状态完全打通

### 架构设计

```
主图 (paneIndex=0)
  ├── K 线 (CandlestickSeries)
  ├── SMA 20/50/200 (3x LineSeries, 可开关)
  ├── 布林带 (2x LineSeries, 半透明)
  ├── 支撑/阻力水平线 (createPriceLine, 虚线)
  ├── 信号标记 (SeriesMarkersPrimitive)
  └── 成交量 (HistogramSeries, priceScaleId='volume', 压到底部 20%)

RSI 面板 (paneIndex=1)
  ├── RSI 线 (LineSeries)
  └── 超买(70)/超卖(30) 水平线 (createPriceLine)

MACD 面板 (paneIndex=2)
  ├── MACD 柱状图 (HistogramSeries, 红绿)
  ├── MACD 线 (LineSeries)
  └── Signal 线 (LineSeries)
```

---

## 决策 2: AI 技术分析框架 — 情境驱动而非指标驱动

### 结论

**采用"情境驱动"的固定框架**，而非逐指标分析或完全自由发挥。

### 为什么不选"指标驱动"（当前方案的问题）

当前 Agent 的 prompt 本质上是"拿到一堆指标数据，逐一解读"。问题：
1. **信息平铺**：RSI 说了一段、MACD 说了一段、ADX 说了一段，读者要自己综合
2. **缺少主线**：没有一个贯穿的叙事，每段话可以独立存在
3. **关键信号被淹没**：明明 MACD 金叉是最重要的信号，但它和其他指标占同样篇幅

### 为什么不选"完全自由发挥"

1. **输出质量不可控**：有时候会遗漏关键信息
2. **前端无法结构化展示**：需要固定字段才能渲染 UI
3. **无法和图表联动**：需要结构化的 annotations 数据

### 选择："情境驱动"框架

核心思路：**先判断市场处于什么状态，再选择最相关的 2-3 个信号来论证**。

不同状态下，关注点不同：
- **强趋势中**（ADX>25 + 均线排列）→ 重点看趋势强度和目标位
- **超买超卖**（RSI 极端）→ 重点看反转信号和支撑阻力
- **横盘震荡**（ADX<20）→ 重点看突破方向和量能变化
- **趋势转折**（交叉信号）→ 重点看信号确认度和风险

### 新的输出结构

```python
class TechnicalAnalysisOutput(BaseModel):
    # 核心判断
    title: str                    # 标题（含观点）
    situation: str                # 当前处于什么状态 + 为什么这么判断
    key_signals: str              # 当前最重要的 2-3 个信号（不是所有指标的罗列）
    levels_and_action: str        # 关键价位 + 对持有者和观望者的建议
    risk_invalidation: str        # 风险 + 什么情况会推翻当前判断

    # 图表联动数据（结构化，非文本）
    chart_annotations: list       # [{type, price/date, label, direction}]
```

变化：
- 砍掉 `trend_analysis` / `entry_exit_signals` / `pattern_analysis` 的"按维度拆分"
- 改为 `situation` / `key_signals` / `levels_and_action` / `risk_invalidation` 的"按叙事逻辑拆分"
- 新增 `chart_annotations` 让 AI 输出可以直接标注到图表上

### Prompt 框架设计

```
你是技术分析师。分析步骤：

第一步：判断市场状态
- 看均线排列和 ADX → 是趋势还是震荡？
- 看 RSI 和价格位置 → 是超买超卖还是正常区间？
- 看近期交叉信号 → 有没有刚发生的转折？

第二步：根据状态选择分析重点
- 强趋势 → 说趋势能持续多久、目标在哪
- 超买超卖 → 说反转风险有多大、支撑阻力在哪
- 横盘 → 说突破方向的线索、关注什么信号
- 转折 → 说信号的可靠性、确认条件

第三步：给出行动建议
- 对持有者：该持有/减仓/加仓？
- 对观望者：该进场/继续等？等什么信号？
- 风险线在哪：跌破/突破什么价位需要改变看法？

禁止：逐指标罗列、所有指标都提一遍、缺少主线的分析
```

### 给 Agent 的数据变化

**当前**：只给 Agent 当前值 snapshot
**新方案**：给 Agent 三层数据

1. **当前值**：价格、RSI、MACD、ADX、均线等的最新值
2. **近期走势摘要**：最近 20 天的关键变化（RSI 从 72 降到 55、MACD 3 天前金叉等）
3. **衍生信号**：均线排列、交叉检测、支撑阻力、趋势强度评分

这样 Agent 不只知道"RSI 是 55"，还知道"RSI 一周前是 72，现在降到 55，从超买回落"。

---

## 决策 3: 数据方案 — FMP + 本地混合计算

### 调研发现

FMP 稳定 API (`/stable/technical-indicators/`) 支持：
- SMA、EMA、WMA、DEMA、TEMA、RSI、ADX、Williams %R、Standard Deviation

FMP **不支持**：
- MACD（404）
- Bollinger Bands（无端点）
- 周线 timeframe（返回 400）

### 方案

**混合方案**：FMP 获取 OHLCV + 部分指标，其余本地计算

```
FMP API 调用（可并行）:
  ├── OHLCV 历史 (/stable/historical-price-eod/full)     → 图表 K 线 + 本地计算基础
  ├── RSI(14)   (/stable/technical-indicators/rsi)        → 直接使用
  ├── SMA(20)   (/stable/technical-indicators/sma)        → 直接使用 + BB 计算基础
  ├── SMA(50)   (/stable/technical-indicators/sma)        → 直接使用
  ├── SMA(200)  (/stable/technical-indicators/sma)        → 直接使用
  ├── EMA(12)   (/stable/technical-indicators/ema)        → MACD 计算基础
  ├── EMA(26)   (/stable/technical-indicators/ema)        → MACD 计算基础
  └── ADX(14)   (/stable/technical-indicators/adx)        → 直接使用

本地计算:
  ├── MACD = EMA(12) - EMA(26), Signal = EMA(9) of MACD
  ├── BB = SMA(20) +/- 2 * StdDev(20)  （StdDev 从 OHLCV 计算）
  ├── 支撑/阻力（从 OHLCV swing highs/lows）
  ├── 交叉检测（从指标序列比较）
  └── 周线数据（聚合日线 OHLCV 再计算）
```

总计 ~8 个 FMP 并行请求，在付费计划的 3000/min 限制下完全没问题。
