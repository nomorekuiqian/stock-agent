# Technical Analysis Module Implementation Plan

> Created: 2026-02-19
> Status: M1-M4 Complete (Backend Done)
> Module: `features/stock` extension + `shared/data_tools/technical.py`

## 1. Overview

Extend the existing stock analysis framework to include technical analysis capabilities alongside the current fundamental analysis. The goal is to provide users with a comprehensive view: fundamentals tell you **what** to buy, technicals tell you **when** to buy.

### Data Source Strategy

| Source | Role | Data Type | Fallback |
|--------|------|-----------|----------|
| **tvscreener** (primary) | Current indicator snapshot + TV ratings | RSI, MACD, BB, ADX, Ichimoku, MA, oscillators, recommendations | pandas-ta |
| **pandas-ta** (secondary) | Historical indicator trends + fallback | Same indicators, computed locally from yfinance OHLCV | Always available |
| **yfinance** (existing) | Price data for pandas-ta computation | OHLCV | Already in project |

### Why This Combination

- **tvscreener**: One API call returns 40+ pre-computed indicators + TradingView's buy/sell ratings for daily/weekly/monthly timeframes. Zero computation cost.
- **pandas-ta**: tvscreener only returns current values, not historical trends. pandas-ta computes "RSI was 80 last week, now 65 (declining)" — essential for trend interpretation.
- **Fallback**: If tvscreener fails (unofficial API), pandas-ta can compute everything locally.

---

## 2. Architecture Design

### 2.1 Data Flow

```
                    +------------------+
                    |  yfinance OHLCV  |  (existing, 6 months history)
                    +--------+---------+
                             |
                    +--------v---------+
                    |    pandas-ta     |  (compute historical trends)
                    +--------+---------+
                             |
        +--------------------+--------------------+
        |                                         |
+-------v--------+                       +--------v--------+
|   tvscreener   |                       | Trend Analysis  |
| (current snap) |                       | (5-day lookback)|
+-------+--------+                       +--------+--------+
        |                                         |
        +--------------------+--------------------+
                             |
                    +--------v---------+
                    | _prepare_ta_data |  (merge + clean for Agent)
                    +--------+---------+
                             |
                    +--------v---------+
                    | Technical Agent   |  (Gemini, structured output)
                    +--------+---------+
                             |
                    +--------v---------+
                    |   DB Cache (24h)  |
                    +------------------+
```

### 2.2 File Structure (New/Modified)

```
backend/app/
├── shared/data_tools/
│   ├── technical.py          # NEW - Technical indicator data fetching
│   └── ...
├── features/stock/
│   ├── router.py             # MODIFY - Add POST /api/stock/{symbol}/technical endpoint
│   ├── agent.py              # MODIFY - Add TechnicalAnalysisAgent class
│   ├── models.py             # MODIFY - Add TechnicalAnalysisOutput model
│   └── db.py                 # REUSE - analysis_type="technical" in stock_analyses table
```

**No new feature module needed** — technical analysis is an extension of the stock module, not a separate feature. It reuses the same DB table (`stock_analyses`) with `analysis_type="technical"`.

---

## 3. Implementation Details

### 3.1 Data Fetching Layer: `shared/data_tools/technical.py`

```python
"""
Technical Analysis Data Tools
Fetches technical indicators from tvscreener (primary) and pandas-ta (fallback).
"""

# --- Dependencies ---
# pip install tvscreener pandas-ta

# --- Core Functions ---

def get_technical_snapshot(symbol: str, exchange: str = "NASDAQ") -> dict:
    """
    Fetch current technical indicator values from TradingView via tvscreener.

    Returns:
    {
        "source": "tvscreener",
        "interval": "1D",
        "ratings": {
            "overall": "BUY",        # STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL
            "moving_averages": "STRONG_BUY",
            "oscillators": "NEUTRAL",
        },
        "moving_averages": {
            "sma_20": 185.50,
            "sma_50": 178.30,
            "sma_200": 165.20,
            "ema_12": 187.10,
            "ema_26": 183.40,
        },
        "oscillators": {
            "rsi_14": 62.5,
            "stochastic_k": 75.3,
            "stochastic_d": 68.2,
            "cci_20": 45.6,
            "macd_level": 3.72,
            "macd_signal": 2.85,
            "momentum_10": 8.5,
            "awesome_oscillator": 12.3,
            "williams_r": -24.5,
        },
        "volatility": {
            "atr_14": 4.85,
            "bb_upper": 195.20,
            "bb_lower": 175.80,
        },
        "trend": {
            "adx_14": 28.5,
            "adx_plus_di": 32.1,
            "adx_minus_di": 18.4,
            "parabolic_sar": 180.50,
            "ichimoku_base": 182.30,
            "ichimoku_conversion": 186.50,
        },
        "price_vs_ma": {
            "above_sma_20": True,
            "above_sma_50": True,
            "above_sma_200": True,
            "sma_20_50_cross": "golden",   # golden / death / none
        },
    }
    """
    # Implementation: Use tvscreener StockScreener to query single symbol
    # with technical fields across daily interval
    pass


def get_technical_snapshot_weekly(symbol: str, exchange: str = "NASDAQ") -> dict:
    """Same as above but for weekly timeframe. Used for multi-timeframe analysis."""
    pass


def get_technical_trends(symbol: str, days: int = 180) -> dict:
    """
    Compute historical indicator trends using pandas-ta + yfinance.
    This fills the gap that tvscreener can't (historical indicator values).

    Returns:
    {
        "source": "pandas-ta",
        "period": "6mo",
        "current": {
            "rsi_14": 62.5,
            "macd": 3.72,
            "macd_signal": 2.85,
            "bb_upper": 195.20,
            "bb_middle": 185.50,
            "bb_lower": 175.80,
        },
        "trends": {
            "rsi_14": {
                "current": 62.5,
                "5d_ago": 71.2,
                "20d_ago": 55.8,
                "direction": "declining",  # rising / declining / flat
                "zone": "neutral",         # overbought(>70) / oversold(<30) / neutral
                "recently_overbought": True,  # was >70 in last 5 days
            },
            "macd": {
                "current": 3.72,
                "signal": 2.85,
                "histogram": 0.87,
                "histogram_direction": "declining",
                "cross": "none",  # bullish_cross / bearish_cross / none (in last 5 days)
            },
            "volume": {
                "current": 45000000,
                "avg_20d": 52000000,
                "ratio": 0.87,  # current / avg
                "trend": "below_average",
            },
        },
        "support_resistance": {
            "support_1": 180.50,   # Recent swing low
            "support_2": 175.20,   # Next support level
            "resistance_1": 192.30, # Recent swing high
            "resistance_2": 198.50, # Next resistance level
            "current_price": 188.75,
        },
        "pattern_signals": {
            "ma_alignment": "bullish",  # price > SMA20 > SMA50 > SMA200
            "bb_position": "upper_half",  # upper_half / lower_half / above_upper / below_lower
            "volume_confirmation": False,  # volume supports the move?
        },
    }
    """
    # Implementation: yf.download() -> pandas-ta computations -> trend analysis
    pass


def get_technical_data(symbol: str, exchange: str = "NASDAQ") -> dict:
    """
    Main entry point: Combines tvscreener snapshot + pandas-ta trends.
    Handles fallback if tvscreener fails.

    Returns merged dict with all data needed for the Technical Agent.
    """
    pass
```

### Exchange Detection Logic

tvscreener requires the exchange parameter. We need a mapping:

```python
def detect_exchange(symbol: str) -> str:
    """
    Detect exchange for a symbol. Uses the stock profile cache if available,
    otherwise defaults to common mappings.
    """
    # 1. Check stock profile cache (from existing StockService)
    # 2. Common overrides: BRK.B -> NYSE, etc.
    # 3. Default heuristic: Most US stocks are NASDAQ or NYSE
    pass
```

### 3.2 Agent Layer: TechnicalAnalysisAgent in `features/stock/agent.py`

Add to existing `agent.py` (not a new file):

```python
# --- Output Schema ---

class TechnicalAnalysisOutput(BaseModel):
    title: str = Field(
        description="Opinionated Chinese title about technical outlook, 15-40 chars."
    )
    trend_analysis: str = Field(
        description="Multi-timeframe trend analysis in Markdown, 600-1000 chars. "
        "Cover: primary trend direction, MA alignment, momentum state, "
        "comparison between daily and weekly signals."
    )
    entry_exit_signals: str = Field(
        description="Key signals and levels in Markdown, 400-600 chars. "
        "Cover: support/resistance levels, overbought/oversold conditions, "
        "MACD/RSI signals, volume confirmation."
    )
    pattern_analysis: str = Field(
        description="Chart pattern and indicator pattern analysis in Markdown, 400-600 chars. "
        "Cover: MA crosses, Bollinger Band squeeze/expansion, divergences, "
        "candlestick patterns if detected."
    )
    technical_summary: str = Field(
        description="Technical outlook summary in Markdown, 300-500 chars. "
        "Cover: overall technical rating, key price levels to watch, "
        "scenario analysis (bullish/bearish conditions)."
    )

TECHNICAL_FIELDS = (
    "title",
    "trend_analysis",
    "entry_exit_signals",
    "pattern_analysis",
    "technical_summary",
)

# --- Agent Instruction ---

TECHNICAL_ANALYST_INSTRUCTION = """
You are a senior technical analyst specializing in US equities.
You analyze price action, technical indicators, and chart patterns to provide
actionable technical insights for retail investors.

## Core Rules

1. **Data accuracy is absolute** - every indicator value must match the provided data.
2. **Write in Chinese (Simplified)**, keep indicator names in English (RSI, MACD, SMA, EMA).
3. **Framework**: Signal -> Context -> Implication. Every observation must explain what it means.
4. **Be opinionated**: Give clear directional bias (bullish/bearish/neutral) with conditions.
5. **Use Markdown formatting**: Bold for emphasis, bullet points for clarity.
6. **Multi-timeframe**: Always compare daily vs weekly signals for confirmation.

## Output Field Guidelines

### title
One sentence Chinese title with clear technical stance, 15-40 chars.
Example: "NVDA: RSI back from overbought, 850 support is the key test"

### trend_analysis (600-1000 chars, Markdown)

**1. Primary Trend**
- Current trend direction based on MA alignment (SMA 20/50/200)
- Is the trend strengthening or weakening? Use ADX to confirm.
- Price position relative to key MAs

**2. Momentum State**
- RSI level and direction (rising/falling, overbought/oversold zones)
- MACD state (above/below signal line, histogram expanding/contracting)
- Stochastic position

**3. Multi-Timeframe Confirmation**
- Compare daily vs weekly signals
- Are they aligned (strong signal) or divergent (caution)?

**4. TradingView Rating Context**
- Reference the overall/MA/oscillator ratings
- Do they confirm or contradict your analysis?

### entry_exit_signals (400-600 chars, Markdown)

**Support & Resistance**
- Key support levels with rationale (MA, swing low, BB lower)
- Key resistance levels with rationale
- Current price position within the range

**Signal Conditions**
- What specific conditions would trigger a bullish signal?
- What specific conditions would trigger a bearish signal?
- Current overbought/oversold status

### pattern_analysis (400-600 chars, Markdown)

**Indicator Patterns**
- Recent MA crosses (golden cross / death cross / approaching)
- Bollinger Band state (squeeze, expansion, walking the band)
- RSI/MACD divergences with price
- Volume trend vs price trend

**Key Observations**
- Any notable pattern setups forming
- Convergence or divergence of multiple indicators

### technical_summary (300-500 chars, Markdown)

**Overall Technical Rating**
- One-line verdict: bullish/bearish/neutral with conviction level

**Key Levels to Watch**
- Upside target and breakout level
- Downside risk and breakdown level

**Scenario Analysis**
- If X happens -> expect Y (bullish scenario)
- If A happens -> expect B (bearish scenario)
- Key trigger to change the outlook
"""

# --- Agent Definition ---

technical_analyst_agent = LlmAgent(
    name="technical_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes stock technical indicators and provides technical outlook in Chinese",
    instruction=TECHNICAL_ANALYST_INSTRUCTION,
    output_schema=TechnicalAnalysisOutput,
    output_key="technical_analysis",
)


class TechnicalAnalysisAgent:
    """Runs the technical analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=technical_analyst_agent, app_name="stock_technical"
        )

    async def analyze(self, symbol: str, technical_data: dict) -> dict:
        """Generate AI technical analysis. Returns dict with analysis and metadata."""
        # Same pattern as StockAnalysisAgent.analyze()
        # 1. Create session
        # 2. Send technical_data as JSON message
        # 3. Run agent, collect structured output
        # 4. Clean up session
        # 5. Return result
        pass
```

### 3.3 API Endpoint: New route in `features/stock/router.py`

```python
@router.post("/stock/{symbol}/technical")
async def generate_technical_analysis_endpoint(
    symbol: str,
    force: bool = Query(default=False, description="Force regenerate even if cached"),
):
    """
    Generate AI technical analysis for a stock.

    Returns structured technical analysis covering trend, signals,
    patterns, and outlook.
    """
    symbol = symbol.upper()

    if not re.match(r'^[A-Z0-9.\-]{1,10}$', symbol):
        raise HTTPException(status_code=400, detail="Invalid stock symbol format")

    # 1. Check cache (analysis_type="technical", 24h TTL)
    if not force:
        cached = await get_stock_analysis(symbol, analysis_type="technical")
        if cached:
            return {"success": True, "analysis": cached.get("content"), "meta": {...}}

    # 2. Fetch technical data
    from app.shared.data_tools.technical import get_technical_data
    technical_data = get_technical_data(symbol)

    # 3. Run Technical Agent
    agent = get_technical_analysis_agent()
    result = await agent.analyze(symbol, technical_data)

    # 4. Save to cache (reuses existing stock_analyses table)
    await save_stock_analysis(
        symbol=symbol,
        analysis_type="technical",  # Different type, same table
        content=result["analysis"],
        data_snapshot=technical_data,
        model="gemini-3-pro-preview",
    )

    # 5. Return result
    return {"success": True, "analysis": result["analysis"], "meta": result["meta"]}
```

### 3.4 Database: No Changes Needed

The existing `stock_analyses` table and `save_stock_analysis()` / `get_stock_analysis()` functions already support `analysis_type` parameter. We just use `analysis_type="technical"` to differentiate from `"comprehensive"` (fundamental analysis).

---

## 4. Dependencies

```bash
# New packages to install
pip install tvscreener pandas-ta
```

Add to `backend/requirements.txt`:
```
tvscreener>=0.2.0
pandas-ta>=0.3.14b
```

**No C library dependencies** (unlike TA-Lib). Both are pure Python, pip install only.

---

## 5. Milestones & Implementation Roadmap

### Milestone 1: tvscreener 验证与数据层基础 ✅ DONE

> **目标**: 验证 tvscreener 在项目中可用，能稳定拿到单只股票的技术指标数据
> **产出**: `shared/data_tools/technical.py` 中 tvscreener 相关函数可用
> **验收标准**: 在 Python REPL 中运行 `get_technical_snapshot("AAPL")`，返回包含 RSI、MACD、SMA 等 30+ 指标的完整 dict

**Tasks:**

1. 安装依赖: `pip install tvscreener pandas-ta`，更新 `requirements.txt`
2. 创建 `backend/app/shared/data_tools/technical.py` 文件
3. 实现 `get_technical_snapshot(symbol, exchange)`:
   - 使用 StockScreener + select() 查询全部技术指标字段
   - 使用 where() 按 symbol 过滤单只股票
   - 解析 DataFrame 返回结构化 dict（ratings / moving_averages / oscillators / volatility / trend）
   - 处理 symbol 找不到的情况
4. 实现 `get_technical_snapshot_weekly(symbol)` (周线级别)
5. 实现 `detect_exchange(symbol)`:
   - 从现有 stock profile 缓存读取 exchange
   - 常见股票映射表兜底（NASDAQ / NYSE）
6. 手动测试 3-5 个不同交易所的 symbol（AAPL/NASDAQ, JPM/NYSE, BRK.B/NYSE）
7. 确认 tvscreener 的响应速度和稳定性（记录在注释中）

**风险确认:**
- 如果 tvscreener 对单只股票查询不稳定，在此阶段就决定是否降级为纯 pandas-ta 方案

---

### Milestone 2: pandas-ta 历史趋势计算 ✅ DONE

> **目标**: 能从 yfinance OHLCV 数据中计算出指标的历史变化趋势（方向、区间、交叉信号）
> **产出**: `get_technical_trends(symbol)` 函数可用
> **验收标准**: 运行 `get_technical_trends("NVDA")`，返回包含 RSI 方向、MACD 交叉、支撑阻力位的完整 dict

**Tasks:**

1. 实现 `get_technical_trends(symbol, days=180)`:
   - 调用 `yf.download(symbol, period="6mo")` 获取 OHLCV
   - 使用 pandas-ta 计算: RSI(14), MACD(12,26,9), BBands(20,2), SMA(20/50/200), EMA(12/26), ADX(14), ATR(14), Stoch(14,3), OBV
   - 提取当前值 + 5天前值 + 20天前值
   - 计算趋势方向 (rising/declining/flat)
   - 计算 RSI 区间 (overbought/oversold/neutral)
   - 检测 MACD 交叉信号 (近5天内是否发生金叉/死叉)
   - 计算成交量 vs 20日均量比率
2. 实现 `find_support_resistance(df)`:
   - 基于 swing high/low 检测支撑阻力位
   - 返回 support_1/2 和 resistance_1/2
3. 计算 pattern signals:
   - MA 排列 (bullish: price>20>50>200, bearish: 反向)
   - BB 位置 (upper_half / lower_half / above_upper / below_lower)
   - 量价配合度
4. 实现 `get_technical_data(symbol)` — 合并入口:
   - 并行调用 tvscreener snapshot + pandas-ta trends
   - tvscreener 失败时降级为纯 pandas-ta
   - 合并为统一输出格式
5. 在 `shared/data_tools/__init__.py` 中导出新函数
6. 写单元测试 `tests/test_technical_data.py`

---

### Milestone 3: Technical Agent + Prompt 工程 ✅ DONE

> **目标**: Gemini Agent 能根据技术指标数据生成结构化的中文技术分析报告
> **产出**: `TechnicalAnalysisAgent` 类可用，能输出 4 段式技术分析
> **验收标准**: 对 AAPL 运行 Agent，输出的 4 个字段全部有内容，中文、有观点、引用了具体指标数值

**Tasks:**

1. 在 `features/stock/agent.py` 中添加:
   - `TechnicalAnalysisOutput` Pydantic model (title + trend_analysis + entry_exit_signals + pattern_analysis + technical_summary)
   - `TECHNICAL_FIELDS` 字段元组
   - `TECHNICAL_ANALYST_INSTRUCTION` prompt
   - `technical_analyst_agent` LlmAgent 定义
2. 实现 `_prepare_technical_data_for_agent()`:
   - 从 tvscreener snapshot + pandas-ta trends 中提取关键数据
   - 预计算衍生信号（减少 Agent 需要做的推理）
   - 控制 token 量在 ~2000 tokens
3. 实现 `TechnicalAnalysisAgent` 类:
   - `__init__`: 创建 InMemoryRunner
   - `analyze(symbol, technical_data)`: 创建 session -> 发送数据 -> 运行 agent -> 提取输出 -> 清理 session
   - 错误处理: 返回 `_empty_technical_analysis()` + error meta
4. 添加 singleton getter: `get_technical_analysis_agent()`
5. 手动测试 Agent 输出质量:
   - 测试 3 只不同类型的股票 (大盘科技股 AAPL, 高波动成长股 PLTR, 稳定蓝筹 JNJ)
   - 检查: 标题是否有观点、分析是否引用了具体数值、是否有多周期对比
6. 根据测试结果迭代 prompt（可能需要 2-3 轮调优）

---

### Milestone 4: API 端点 + 缓存 + 集成测试 ✅ DONE

> **目标**: 后端 API 完整可用，前端可以调用获取技术分析
> **产出**: `POST /api/stock/{symbol}/technical` 端点，带 24h DB 缓存
> **验收标准**: `curl -X POST localhost:8000/api/stock/AAPL/technical` 返回完整技术分析 JSON；第二次调用命中缓存

**Tasks:**

1. 在 `features/stock/router.py` 中添加:
   - `POST /api/stock/{symbol}/technical` 端点
   - Symbol 格式校验 (复用现有正则)
   - 缓存检查: `get_stock_analysis(symbol, analysis_type="technical")`
   - 数据获取 -> Agent 运行 -> 保存缓存流程
   - `force=true` 参数支持强制重新生成
2. 添加 in-memory 缓存:
   - tvscreener snapshot: 15 min TTL (dict + threading.Lock)
   - pandas-ta computation: 30 min TTL
3. 错误处理:
   - 数据获取失败 -> 500 + 明确错误信息
   - Agent 失败 -> 500 + "Analysis generation failed"
   - 无效 symbol -> 400
4. 写 E2E 测试 `tests/e2e/test_technical_e2e.py`:
   - test_generate_analysis: 正常流程
   - test_cache_hit: 第二次调用返回缓存
   - test_force_regenerate: force=true 绕过缓存
   - test_invalid_symbol: 返回 400
5. 运行完整测试套件确保没有回归: `pytest`
6. 更新 `features/stock/CONTEXT.md` 文档

---

### Milestone 5: 前端集成（可选，后续执行）

> **目标**: 用户在个股页面能看到并使用技术分析功能
> **产出**: 股票详情页新增"技术分析" Tab
> **验收标准**: 用户点击"技术分析"按钮，看到加载动画，然后显示完整的 4 段式技术分析报告

**Tasks:**

1. 在个股详情页添加"基本面分析 / 技术分析" Tab 切换
2. 调用 `POST /api/stock/{symbol}/technical` 获取数据
3. 渲染 4 个分析段落（趋势分析 / 关键信号 / 形态分析 / 技术总结）
4. Loading 状态和错误处理
5. 响应式布局适配移动端

---

### Milestone 6: 质量打磨与产品增强（可选，后续执行）

> **目标**: 提升分析质量和用户体验
> **产出**: 更好的 prompt、更丰富的展示

**Tasks:**

1. Prompt 迭代优化:
   - 收集 20+ 只股票的分析结果，评估质量
   - 调整字数、覆盖面、观点明确度
   - 针对不同类型股票（成长/价值/高波动）优化分析框架
2. 考虑合并报告: 一键生成"完整投资报告"（基本面 + 技术面）
3. 指标仪表盘: 在分析报告上方展示关键指标的可视化（RSI 刻度盘、MA 排列图示）
4. TradingView 评级徽章: 显示 TV 的买/卖评级作为快速参考

---

### 里程碑总览

```
M1: tvscreener 验证 + 数据层基础  ✅
 |
M2: pandas-ta 历史趋势  ✅
 |
M3: Technical Agent + Prompt  ✅
 |
M4: API 端点 + 缓存 + 测试  ✅
 |
 |--- (后端完成，可独立部署) ---
 |
M5: 前端集成 (下一步)
 |
M6: 质量打磨 (可选)
```

**M1-M4 是核心路径**，完成后后端技术分析 API 即可对外服务。M5-M6 按需推进。

每个 Milestone 完成后我们可以暂停、评估、决定是否继续下一个。特别是 **M1 是关键验证点** — 如果 tvscreener 不可靠，需要在这一步就调整方案。

---

## 6. tvscreener Usage Details

### Single Stock Query Pattern

```python
from tvscreener import StockScreener
from tvscreener.field.stock import StockField

screener = StockScreener()
screener.select(
    # Ratings
    StockField.TECHNICAL_RATING,
    StockField.MOVING_AVERAGES_RATING,
    StockField.OSCILLATORS_RATING,
    # Moving Averages
    StockField.SIMPLE_MOVING_AVERAGE_20,
    StockField.SIMPLE_MOVING_AVERAGE_50,
    StockField.SIMPLE_MOVING_AVERAGE_200,
    StockField.EXPONENTIAL_MOVING_AVERAGE_12,
    StockField.EXPONENTIAL_MOVING_AVERAGE_26,
    # Oscillators
    StockField.RELATIVE_STRENGTH_INDEX_14,
    StockField.MACD_LEVEL_12_26,
    StockField.MACD_SIGNAL_12_26,
    StockField.STOCHASTIC_PERCENTK_14_3_3,
    StockField.STOCHASTIC_PERCENTD_14_3_3,
    StockField.COMMODITY_CHANNEL_INDEX_20,
    StockField.AWESOME_OSCILLATOR,
    StockField.MOMENTUM_10,
    StockField.WILLIAMS_PERCENT_RANGE_14,
    # Volatility
    StockField.AVERAGE_TRUE_RANGE_14,
    StockField.BOLLINGER_UPPER_BAND_20,
    StockField.BOLLINGER_LOWER_BAND_20,
    # Trend
    StockField.AVERAGE_DIRECTIONAL_INDEX_14,
    StockField.POSITIVE_DIRECTIONAL_INDICATOR_14,
    StockField.NEGATIVE_DIRECTIONAL_INDICATOR_14,
    StockField.PARABOLIC_SAR,
    StockField.ICHIMOKU_BASE_LINE_9_26_52_26,
    StockField.ICHIMOKU_CONVERSION_LINE_9_26_52_26,
    # Price
    StockField.PRICE,
    StockField.VOLUME,
)

# Filter for single symbol
screener.where(StockField.NAME.isin(["AAPL"]))

# Get data
df = screener.get()  # Returns pandas DataFrame
```

### Multi-Timeframe Query

```python
from tvscreener.field.stock import StockField

# Daily (default)
daily_fields = StockField.RELATIVE_STRENGTH_INDEX_14
# Weekly
weekly_fields = StockField.RELATIVE_STRENGTH_INDEX_14.with_interval("1W")
```

### Exchange Mapping for tvscreener

tvscreener uses TradingView's exchange names:
- NASDAQ -> "NASDAQ"
- NYSE -> "NYSE"
- AMEX -> "AMEX"

The `set_markets()` method or symbol prefix (e.g., "NASDAQ:AAPL") can be used.

---

## 7. pandas-ta Usage Details

### Computing Indicators

```python
import yfinance as yf
import pandas_ta as ta

# Get 6 months of OHLCV data
df = yf.download("AAPL", period="6mo")

# Compute all needed indicators
df.ta.rsi(length=14, append=True)
df.ta.macd(fast=12, slow=26, signal=9, append=True)
df.ta.bbands(length=20, std=2, append=True)
df.ta.sma(length=20, append=True)
df.ta.sma(length=50, append=True)
df.ta.sma(length=200, append=True)
df.ta.ema(length=12, append=True)
df.ta.ema(length=26, append=True)
df.ta.adx(length=14, append=True)
df.ta.atr(length=14, append=True)
df.ta.stoch(k=14, d=3, append=True)
df.ta.obv(append=True)

# Extract current + historical values
latest = df.iloc[-1]
five_days_ago = df.iloc[-6] if len(df) > 5 else df.iloc[0]
twenty_days_ago = df.iloc[-21] if len(df) > 20 else df.iloc[0]
```

### Support/Resistance Detection

```python
def find_support_resistance(df, window=20):
    """Find support/resistance from recent swing highs/lows."""
    highs = df["High"].rolling(window=window, center=True).max()
    lows = df["Low"].rolling(window=window, center=True).min()

    # Swing highs: where High == rolling max
    swing_highs = df[df["High"] == highs]["High"].dropna().unique()
    # Swing lows: where Low == rolling min
    swing_lows = df[df["Low"] == lows]["Low"].dropna().unique()

    current_price = df["Close"].iloc[-1]

    resistances = sorted([h for h in swing_highs if h > current_price])[:2]
    supports = sorted([l for l in swing_lows if l < current_price], reverse=True)[:2]

    return {
        "support_1": supports[0] if len(supports) > 0 else None,
        "support_2": supports[1] if len(supports) > 1 else None,
        "resistance_1": resistances[0] if len(resistances) > 0 else None,
        "resistance_2": resistances[1] if len(resistances) > 1 else None,
    }
```

---

## 8. Token Optimization

Technical data for the Agent needs to be clean and concise to minimize token usage.

### `_prepare_technical_data_for_agent()` Strategy

```python
def _prepare_technical_data_for_agent(
    snapshot: dict,       # tvscreener current values
    trends: dict,         # pandas-ta historical trends
    weekly_snapshot: dict, # tvscreener weekly values (subset)
) -> dict:
    """
    Clean and reduce technical data for optimal Agent token usage.
    Target: ~2000 tokens of input data.
    """
    return {
        # TradingView ratings (very token-efficient, high signal)
        "tv_ratings": {
            "daily": snapshot["ratings"],
            "weekly": weekly_snapshot["ratings"],
        },
        # Key indicator values (current only, trends summarized)
        "indicators": {
            "rsi_14": {
                "value": snapshot["oscillators"]["rsi_14"],
                "direction": trends["trends"]["rsi_14"]["direction"],
                "zone": trends["trends"]["rsi_14"]["zone"],
            },
            "macd": {
                "value": snapshot["oscillators"]["macd_level"],
                "signal": snapshot["oscillators"]["macd_signal"],
                "histogram_direction": trends["trends"]["macd"]["histogram_direction"],
                "recent_cross": trends["trends"]["macd"]["cross"],
            },
            "adx": snapshot["trend"]["adx_14"],
            "atr": snapshot["volatility"]["atr_14"],
        },
        # MA alignment (pre-computed, not raw values)
        "ma_structure": {
            "sma_20": snapshot["moving_averages"]["sma_20"],
            "sma_50": snapshot["moving_averages"]["sma_50"],
            "sma_200": snapshot["moving_averages"]["sma_200"],
            "alignment": trends["pattern_signals"]["ma_alignment"],
            "cross": snapshot["price_vs_ma"]["sma_20_50_cross"],
        },
        # Price context
        "price": {
            "current": snapshot["price"],
            "bb_upper": snapshot["volatility"]["bb_upper"],
            "bb_lower": snapshot["volatility"]["bb_lower"],
            "bb_position": trends["pattern_signals"]["bb_position"],
        },
        # Support/Resistance
        "levels": trends["support_resistance"],
        # Volume
        "volume": {
            "ratio_vs_avg": trends["trends"]["volume"]["ratio"],
            "trend": trends["trends"]["volume"]["trend"],
        },
    }
```

---

## 9. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| tvscreener API fails | Fallback to pandas-ta only; log warning; set `source: "pandas-ta_only"` |
| Symbol not found in tvscreener | Try alternate exchange (NASDAQ -> NYSE -> AMEX); fallback to pandas-ta |
| yfinance returns insufficient data | Return partial analysis with caveat (e.g., new IPO <6mo history) |
| pandas-ta computation error | Catch per-indicator; return available indicators only |
| Agent fails (Gemini error) | Return empty analysis with error in meta (same as StockAnalysisAgent pattern) |
| Non-US stock symbol | Initially scope to US stocks only; reject with clear error message |

---

## 10. Caching Strategy

| Data | Cache | TTL | Reason |
|------|-------|-----|--------|
| tvscreener snapshot | In-memory (dict + lock) | 15 min | Indicators change intraday |
| pandas-ta computation | In-memory (dict + lock) | 30 min | Match existing price history cache |
| AI technical analysis | DB (stock_analyses table) | 24 hours | Match fundamental analysis TTL |

---

## 11. Testing Plan

### Unit Tests

```python
# tests/test_technical_data.py

class TestTechnicalSnapshot:
    """Test tvscreener data fetching."""
    def test_get_snapshot_aapl(self): ...
    def test_get_snapshot_unknown_symbol(self): ...
    def test_exchange_detection(self): ...
    def test_fallback_when_tvscreener_fails(self): ...

class TestTechnicalTrends:
    """Test pandas-ta historical computation."""
    def test_compute_rsi_trend(self): ...
    def test_support_resistance_detection(self): ...
    def test_macd_cross_detection(self): ...
    def test_ma_alignment(self): ...

class TestDataMerge:
    """Test combined data preparation."""
    def test_merge_snapshot_and_trends(self): ...
    def test_prepare_for_agent_token_count(self): ...
```

### E2E Test

```python
# tests/e2e/test_technical_e2e.py

class TestTechnicalAnalysisAPI:
    def test_generate_analysis(self): ...
    def test_cache_hit(self): ...
    def test_force_regenerate(self): ...
    def test_invalid_symbol(self): ...
```

---

## 12. Future Enhancements (Out of Scope for V1)

- **tvscreener MCP Server**: Add as Claude Code MCP for interactive analysis
- **Real-time streaming**: Use tvscreener's `stream()` for live indicator updates
- **Chart overlay**: Frontend visualization with indicator overlays (TradingView widget or Chart.js)
- **Combined analysis**: Merge fundamental + technical into a single "Investment Report"
- **Alerts**: Notify users when key technical levels are breached
- **Crypto/Forex**: Extend to other asset classes (tvscreener supports them)
- **Backtesting**: Use VectorBT to validate technical signals
