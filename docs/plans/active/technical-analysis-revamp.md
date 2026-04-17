# 技术分析页面重构 Engineering Plan

> Status: Planning
> Related: `backend/app/features/stock/.context.md`, `backend/app/shared/data_tools/.context.md`, `frontend/src/app/stock/.context.md`
> Vision: 个股深研 — 从"指标堆砌"升级为"图表驱动的技术叙事"

## 目标

用 FMP 统一技术数据源、用 LightweightCharts 替换 TradingView iframe、砍掉独立信号面板改为 AI 分析的可视化层，让图表、数据、AI 分析三者联动成一个有机整体。

## 现状

### 数据层 — 双源拼接，重复且脆弱

当前技术数据由两个源拼接（`shared/data_tools/technical.py`）：

| 源 | 用途 | 问题 |
|---|---|---|
| **tvscreener** (TradingView 爬虫) | 实时指标快照 + 评级 | 第三方非官方库，交易所匹配靠硬编码表(~60 只)，其余靠猜；无 SLA |
| **pandas-ta** (yfinance OHLCV 本地计算) | 趋势方向、交叉检测、支撑阻力 | 需下载 180 天 OHLCV 再本地算，慢(2-5s)；和 tvscreener 大量重复 |

两层高度重叠：RSI、MACD、BB position、MA alignment 在两边各算一遍。pandas-ta 唯一多出的是趋势方向（5日/20日对比）和交叉检测。

**完全没用 FMP**，而 FMP 的 Technical Indicator 端点（`/v3/technical_indicator/daily/{symbol}`）可以一个 API 返回历史指标序列（RSI、MACD、SMA、EMA、ADX、Williams %R、BB 等），同时还有 Pivot Points、Support/Resistance 等 tvscreener 没有的数据。

### AI Agent — 数据搬运 + LLM 写作文

`backend/app/features/stock/agent/technical.py`:
- 把 `get_technical_data()` 的 JSON 全量塞给 `gemini-3.1-flash-lite-preview`
- 输出 4 段结构化分析：title / trend_analysis / entry_exit_signals / pattern_analysis / technical_summary
- Prompt 质量不错（结论先行、禁止比喻），但缺少：
  - **历史走势上下文**：不知道 RSI 从 70 跌到 45 花了 3 天还是 30 天
  - **价格形态识别**：无头肩顶/双底/旗形等 pattern
  - **多时间框架对齐**：日线和周线各自生成，不做交叉验证
  - **相对强弱**：不知道个股 vs 大盘/板块的表现

### 图表 — TradingView iframe 黑盒

`frontend/src/components/technical/TechnicalChart.tsx`:
- 嵌入 TradingView Widget（iframe），硬编码 3 个指标：SMA、MACD、RSI
- 完全黑盒：无法画线、标注信号点、或与 AI 分析联动
- 加载慢，移动端体验差

**重要发现**：项目已在 `StockPriceChart.tsx` 中使用 `lightweight-charts` 库画 K 线/面积图，可直接复用。

### 信号面板 — 和 AI 分析重复，价值存疑

`frontend/src/components/technical/TechnicalSignalDashboard.tsx`（900 行）:
- 5 个 section：TLDR、趋势(ADX/MA)、关键价位(S/R)、指标(RSI/MACD/BB/Vol)、信号一致性
- 所有解读逻辑硬编码在前端（`getADXInterpretation`、`getRSIInterpretation` 等）
- **和 AI 分析完全重复**：AI 已经说了 RSI 超买、MACD 金叉，面板又用粗糙逻辑说一遍
- Confluence 是假共振：只统计看涨/看跌数量，不考虑指标间的独立性
- 定位尴尬：既不够专业（专业人士直接看图），也不够通俗（新手看不懂 ADX +DI/-DI）

## 设计

### 核心理念：图表即分析，分析即图表

不再把图表、信号面板、AI 分析当三个独立模块。新设计是：

```
FMP 统一数据 → AI 分析生成结构化观点 → LightweightCharts 渲染观点到图表上
                                      → 精简状态卡取代信号面板
```

用户看到的是：一张有标注的图 + AI 的文字解读，图和文字说的是同一件事。

### Phase 1: 数据层 — FMP 替换 tvscreener + pandas-ta

#### 新增 FMP 方法

在 `fmp_service.py` 的 `FMPService` 类中新增：

```python
def get_technical_indicators(self, symbol: str, period: str = "daily", limit: int = 200) -> dict:
    """获取 FMP 技术指标历史序列"""
    # 并行请求多个指标端点：
    # GET /v3/technical_indicator/daily/{symbol}?type=rsi&period=14
    # GET /v3/technical_indicator/daily/{symbol}?type=macd
    # GET /v3/technical_indicator/daily/{symbol}?type=sma&period=20
    # GET /v3/technical_indicator/daily/{symbol}?type=sma&period=50
    # GET /v3/technical_indicator/daily/{symbol}?type=sma&period=200
    # GET /v3/technical_indicator/daily/{symbol}?type=ema&period=12
    # GET /v3/technical_indicator/daily/{symbol}?type=adx&period=14
    # GET /v3/technical_indicator/daily/{symbol}?type=williams&period=14
    # GET /v3/technical_indicator/daily/{symbol}?type=standardDeviation (for BB)
    ...

def get_stock_price_history(self, symbol: str, period: str = "daily", limit: int = 200) -> list:
    """获取 OHLCV 历史价格（供图表绘制和本地计算）"""
    # GET /v3/historical-price-full/{symbol}
    ...
```

#### 重写 `shared/data_tools/technical.py`

```python
# 新版：单一数据源，返回结构更清晰
def get_technical_data(symbol: str, timeframe: str = "daily") -> dict:
    """
    FMP 统一获取技术数据。
    返回：OHLCV 历史 + 指标序列 + 当前值 + 衍生信号
    """
    fmp = get_fmp_service()

    # 并行获取
    ohlcv = fmp.get_stock_price_history(symbol, period=timeframe, limit=200)
    indicators = fmp.get_technical_indicators(symbol, period=timeframe)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "ohlcv": ohlcv,                    # 供图表直接使用
        "indicators": {
            "rsi_14": indicators["rsi"],     # 历史序列 [{date, value}]
            "macd": indicators["macd"],      # [{date, macd, signal, histogram}]
            "sma_20": indicators["sma_20"],  # [{date, value}]
            "sma_50": indicators["sma_50"],
            "sma_200": indicators["sma_200"],
            "ema_12": indicators["ema_12"],
            "adx_14": indicators["adx"],
            "williams_r": indicators["williams"],
            "bb": indicators["bb"],          # [{date, upper, middle, lower}]
        },
        "current": {                         # 最新值快照（从序列末尾提取）
            "price": ...,
            "rsi_14": ...,
            "macd_histogram": ...,
            "adx_14": ...,
            "sma_20": ..., "sma_50": ..., "sma_200": ...,
        },
        "derived": {                         # 从序列计算的衍生信号
            "ma_alignment": "bullish|bearish|mixed",
            "rsi_zone": "overbought|oversold|neutral",
            "macd_cross": "bullish_cross|bearish_cross|none",
            "sma_50_200_cross": "golden_cross|death_cross|none",
            "trend_direction": "up|down|sideways",
            "trend_strength": 0-100,         # 基于 ADX
            "support_levels": [...],
            "resistance_levels": [...],
        },
    }
```

**关键改变**：
- 返回**指标历史序列**而非仅当前值，支持图表绘制 + AI 上下文
- 支撑/阻力从 OHLCV 本地计算（保留 `_find_support_resistance` 逻辑）
- 交叉检测从指标序列本地计算（简单高效）
- 移除 tvscreener 和 pandas-ta 依赖

#### API 端点变更

```
GET /api/stocks/{symbol}/technical-snapshot  →  GET /api/stocks/{symbol}/technical-data?timeframe=daily
```

返回完整的 `get_technical_data()` 结果（含 OHLCV + 指标序列），前端用于图表绘制和状态卡。

`POST /api/stocks/{symbol}/technical` 保持不变，但 Agent 收到的数据更丰富（含历史序列摘要）。

### Phase 2: 图表 — LightweightCharts 替换 TradingView

#### 新 TechnicalChart 组件

基于项目已有的 `StockPriceChart.tsx` 模式，构建可编程的技术图表：

```
主图 (K线/面积图)
  ├── SMA 20/50/200 叠加线
  ├── 布林带叠加 (半透明填充)
  ├── 支撑/阻力水平线 (虚线)
  ├── 信号标记 (金叉/死叉/突破)
  └── AI 标注点 (关键价位标记)
副图 1: RSI (带超买/超卖区域)
副图 2: MACD (柱状图 + 双线)
副图 3: 成交量 (涨红跌绿)
```

**核心能力**：
- 前端直接用 API 返回的 OHLCV + 指标序列渲染，无需 iframe
- 通过 `addLineSeries` / `addHistogramSeries` 叠加指标
- 用 `createPriceLine` 画支撑/阻力
- 用 `setMarkers` 标注 AI 识别的信号点
- 日线/周线切换时重新请求数据并刷新图表
- 指标可开关（用户选择显示哪些）

#### 图表-AI 联动

AI 分析提到的关键价位和信号，自动在图表上标注：
- AI 说"210 有支撑" → 图表画一条 $210 的水平线
- AI 说"MACD 金叉" → 图表在金叉位置标记一个点
- 用户 hover AI 文字中的价位 → 图表高亮对应位置（stretch goal）

### Phase 3: 砍信号面板 → AI 状态摘要卡

用一个轻量的"技术状态卡"取代 900 行的信号面板：

```
┌──────────────────────────────────────┐
│  偏空 · 下降趋势(ADX 30) · RSI 中性  │  ← 一行总结（从 AI 分析的 technical_summary 提取）
│  支撑 $210 (-3.2%) | 阻力 $235 (+8.3%) │  ← 关键价位（从 derived 数据计算距离%）
│  [均线空头] [MACD看跌] [量能不足]       │  ← 信号标签（从 derived 数据生成）
└──────────────────────────────────────┘
```

**设计原则**：
- 不做任何独立解读——所有文字来自 AI 分析或 derived 数据
- 只展示结论，不展示推理过程（推理在 AI 分析文字中）
- 视觉化大于文字化——用颜色和图标传达方向

### Phase 4: 增强 AI Agent（后续迭代）

数据层到位后，逐步增强 Agent 能力：

1. **历史走势上下文**：给 Agent 传最近 20 天的 RSI/MACD 序列摘要，而非仅当前值
2. **多时间框架对齐**：同时传日线和周线的 derived signals，让 Agent 做交叉验证
3. **相对强弱**：对比个股 vs SPY 的涨跌幅，传入 relative_strength 数据
4. **更好的模型**：复杂分析用 `gemini-3.1-pro-preview` 替代 `flash-lite`

## 实施步骤

### Phase 1: 数据层重构（后端）

1. [ ] **FMP 技术指标接口** — 在 `fmp_service.py` 新增 `get_technical_indicators()` 和 `get_stock_price_history()`，支持 RSI/MACD/SMA/EMA/ADX/Williams/BB 历史序列
2. [ ] **重写 technical.py** — 用 FMP 替换 tvscreener + pandas-ta，新的 `get_technical_data()` 返回 OHLCV + 指标序列 + 当前值 + 衍生信号
3. [ ] **更新 router.py** — `GET /technical-snapshot` 改为 `GET /technical-data`，返回完整数据（含 OHLCV 供前端图表用）
4. [ ] **更新 Agent 数据准备** — `_prepare_technical_data_for_agent()` 适配新数据结构，传入历史序列摘要
5. [ ] **后端测试** — 更新 `test_technical_unit.py`，验证 FMP 数据获取和衍生信号计算

### Phase 2: 图表重构（前端）

6. [ ] **新 TechnicalChart 组件** — 基于 lightweight-charts，支持 K 线 + SMA/BB 叠加 + 支撑阻力线 + 信号标记
7. [ ] **RSI/MACD/Volume 副图** — 在主图下方添加独立指标面板
8. [ ] **指标开关控制** — 用户可选择显示/隐藏各指标
9. [ ] **前端 hooks 适配** — `useTechnicalSnapshot` → `useTechnicalData`，适配新 API 返回结构

### Phase 3: 信号面板重构（前端）

10. [ ] **AI 状态摘要卡** — 用轻量状态卡替代 900 行的 TechnicalSignalDashboard
11. [ ] **更新 TechnicalTab 布局** — 整合新图表 + 状态卡 + AI 分析的布局
12. [ ] **清理旧代码** — 删除 TechnicalSignalDashboard、TradingView 相关组件（如技术分析不再使用）、旧 constants 中仅信号面板用的内容

### Phase 4: AI 增强（后续迭代）

13. [ ] **历史走势摘要** — Agent prompt 中加入最近 20 天指标走势描述
14. [ ] **多时间框架** — 同时传日线+周线 derived signals 给 Agent
15. [ ] **相对强弱** — 加入 vs SPY 的相对表现数据
16. [ ] **图表-AI 标注联动** — AI 输出结构中增加 `annotations` 字段，前端自动在图表上标注

## 依赖

- FMP 订阅已升级，Technical Indicator 端点可用 ✅
- `lightweight-charts` 已在项目中 (`StockPriceChart.tsx`) ✅
- 无新的外部依赖需要引入

## 待定问题

1. **FMP Technical Indicator 端点具体能力**：需要实测确认支持哪些指标类型、历史深度、请求频率限制。建议先手动调用几个端点看返回结构
2. **周线数据**：FMP 的 `period=weekly` 是否支持所有技术指标？还是需要从日线数据聚合？
3. **TradingView Widget 的其他使用场景**：宏观页面（inflation-rates, economy, sentiment, liquidity）仍在用 TradingViewWidget，这次不动它们
4. **图表-AI 标注联动的实现方式**：Agent 输出中是否新增 `annotations` 结构化字段（含价位 + 标注类型），还是前端从 derived signals 自动推断？先不做，Phase 4 再考虑
5. **tvscreener 的评级系统**：FMP 没有类似 TradingView 的 "STRONG_BUY/BUY/NEUTRAL" 综合评级，是否需要自己实现一套评分，还是直接砍掉评级概念？
6. **缓存策略**：FMP 数据的缓存 TTL 设多少？建议 OHLCV 15 分钟（盘中）/ 4 小时（盘后），指标序列同步
