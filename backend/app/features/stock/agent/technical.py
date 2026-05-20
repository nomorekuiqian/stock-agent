"""
Technical Analysis Agent - Situation-driven chart and indicator analysis for stocks.

Identifies market state first, then selects the most relevant signals to explain,
and provides actionable advice with key price levels.
"""

import json
from typing import Any, Dict, List, Optional  # noqa: UP035

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso
from app.shared.llm_metering import meter

from ._base import run_agent_session

TECHNICAL_MODEL = "gemini-3.1-flash-lite-preview"

logger = get_logger(__name__)

TECHNICAL_FIELDS = (
    "title",
    "tldr",
    "signals",
    "situation",
    "summary",
    "chart_annotations",
)

_LIST_FIELDS = {"signals", "chart_annotations"}


def _empty_technical_analysis() -> Dict[str, Any]:
    return {
        field: ([] if field in _LIST_FIELDS else "")
        for field in TECHNICAL_FIELDS
    }


class SignalDetail(BaseModel):
    """One indicator/signal — pure observational reading, no reasoning."""

    name: str = Field(
        description="Signal name in Chinese. "
        "One of: '均线系统', '支撑阻力', 'RSI(14)', 'MACD', '布林带', '成交量', '趋势强度 (ADX)'."
    )
    value: str = Field(
        description="Current state/value, 8-20 chars. "
        "Example: '多头排列', '67.3 (偏热)', '金叉后柱状图扩张', '量能放大 1.8 倍'."
    )
    definition: str = Field(
        description="Pure indicator definition — what this tool measures, in general. "
        "50-100 chars, no reference to current stock. Shown on hover for education. "
        "Example for RSI: 'RSI (Relative Strength Index) 衡量近期涨跌动能，"
        "数值 0-100。通常 >70 视为超买、<30 为超卖。'"
    )
    reading: str = Field(
        description="Pure objective reading of THIS indicator RIGHT NOW. "
        "80-120 chars. Describe WHAT THE INDICATOR SAYS, not what it means. "
        "Must include: (a) current value/state, (b) recent direction, "
        "(c) key reference points (recent high/low, cross dates, etc.). "
        "STRICTLY FORBIDDEN: "
        "  - Cross-indicator references ('结合 MACD...', '配合量能...') — this is summary's job "
        "  - Forward-looking language ('若未来...', '可能...', '需警惕...') — summary's job "
        "  - Interpretive language ('说明...', '意味着...', '处于...末段') — summary's job "
        "  - Advice ('建议/应该/可以') "
        "Example for RSI: 'RSI 当前 67.3，位于偏热区间（60-70）。"
        "近 5 日从 58.4 上行至 67.3，方向上行。"
        "过去 30 日最高 71.2（4/10）、最低 48.3（3/22）。'"
    )


class TechnicalAnalysisOutput(BaseModel):
    """Technical analysis in TL;DR → Signal Cards → Summary structure."""

    title: str = Field(
        description="Chinese title with clear stance, 15-40 chars. "
        "Example: 'AAPL: 均线多头排列，突破前高后回踩确认'."
    )

    # ---- Section 1: TL;DR — speed-read ----
    tldr: str = Field(
        description="Speed-read of the whole analysis, 60-100 chars. Markdown allowed. "
        "Answer one question: 现在是什么情况？ "
        "Must cover: trend direction + strength, current phase, and ONE hardest piece of evidence. "
        "NO indicator values, NO specific prices, NO advice. "
        "Example: '**强势上涨趋势延续阶段**，均线多头排列 + 量能配合。"
        "已接近超买区，短期动能衰竭风险上升。'"
    )

    # ---- Section 2: 信号详解 (all 7 cards, always shown, pure observation) ----
    signals: List[SignalDetail] = Field(
        default_factory=list,
        description="Pure observational readings of every technical signal. "
        "Cover ALL 7 signals in this exact order: "
        "'均线系统', '支撑阻力', 'RSI(14)', 'MACD', '布林带', '成交量', '趋势强度 (ADX)'. "
        "Each card's `reading` field MUST be pure observation (no reasoning). "
        "Reasoning belongs in the summary field."
    )

    # ---- Section 3a: 情境判定 — explicit situation classification ----
    situation: str = Field(
        description="Situation classification in 4-10 Chinese chars. "
        "Pick the single best fit from: "
        "'强势上涨延续' / '温和上涨' / '震荡整理' / '横盘待突破' / "
        "'顶部疲态' / '反转向下' / '弱势下跌延续' / '超卖反弹' / "
        "'底部构筑' / '反转向上' / '突破尝试'. "
        "Pick ONE — this label drives the summary's analysis framing."
    )

    # ---- Section 3b: 详细总结 — situation-driven reasoning ----
    summary: str = Field(
        description="Situation-driven reasoning synthesis in Markdown, 350-500 chars. "
        "Built on top of the `situation` classification and the 7 signal readings. "
        "Required structure (no subsection headings, just one flowing passage with paragraph breaks): "
        "  ¶1 盘面观察 (50-80 chars) — objective chart reading: price vs MAs, candle pattern, volume. "
        "  ¶2 信号合力 (100-150 chars) — given the situation, which signals confirm and which diverge. "
        "      THIS IS where cross-indicator reasoning lives (e.g. 'RSI 上行配合 MACD 扩张...'). "
        "  ¶3 关键价位 (80-120 chars) — prose mention of support/resistance prices with why they matter. "
        "      Every price mentioned MUST have a matching chart_annotations entry. "
        "  ¶4 风险结构 + 失效条件 (60-100 chars) — structural risks; end with '若 X 发生，以上解读失效'. "
        "FORBIDDEN words: 建议 / 应该 / 可以 / 买入 / 卖出 / 持有 / 减仓 / 加仓 / 止损 / 进场 / 离场. "
        "DO NOT repeat the situation label — it's already shown as a badge above."
    )

    # ---- Chart annotations — must mirror prices mentioned in `summary` ----
    chart_annotations: list = Field(
        default_factory=list,
        description="Every specific price level mentioned in `summary` must appear here. "
        "Each item: {type: 'support'|'resistance'|'signal', "
        "price: float (for levels) or date: 'YYYY-MM-DD' (for signals), "
        "label: str (short description of WHY, 6-14 chars), "
        "direction: 'bullish'|'bearish'|'neutral'}. "
        "`support` = price below current, `resistance` = price above current."
    )


TECHNICAL_ANALYST_INSTRUCTION = """
你是一位经验丰富的技术分析师，为普通投资者解读盘面。

分析流程模仿医生的工作方式：
  1. Physical exam：把 7 个仪表**客观读一遍**，记录事实
  2. Diagnosis：基于读数**情境判定 + 推理**，得出综合意见

对应到输出结构：
  TL;DR         →  结论速览（先抛大结论）
  信号详解 (7)  →  Physical exam（每个指标的客观读数，不做推理）
  情境 + 总结   →  Diagnosis（情境判定 + 跨指标推理）

================================================================
## 第一段：TL;DR (tldr) —— 速览
================================================================

用 **60-100 字**回答「**现在是什么情况？**」。像新闻 lede：短促、硬核。

必须覆盖：
1. 趋势方向（上 / 下 / 横盘）+ 强度（强 / 中 / 弱）
2. 所处阶段（启动 / 延续 / 疲态 / 反转中 / 震荡）
3. 最硬的 1 条佐证（例如"均线多头排列 + 量能配合"）

**禁止**：具体指标数值、具体价位、操作建议。
**允许**：Markdown 加粗关键词。

示例：
> **强势上涨趋势延续阶段**，均线多头排列 + 量能配合。
> 已接近超买区，短期动能衰竭风险上升。

================================================================
## 第二段：信号详解 (signals) —— 7 张卡片，纯客观读数
================================================================

这是 Physical exam。**必须覆盖全部 7 个信号**（顺序固定）：

1. **均线系统** —— SMA 20/50/200 的排列、股价位置、近期交叉
2. **支撑阻力** —— 当前最关键的支撑阻力位
3. **RSI(14)** —— 当前值、方向、近期区间
4. **MACD** —— 线与信号线关系、柱状图状态、近期交叉
5. **布林带** —— 股价所处位置、开口/收窄
6. **成交量** —— 近期量能与均量对比
7. **趋势强度 (ADX)** —— 当前读数、趋势强弱分类

每张卡片 4 个字段：

- **`name`**：信号名（原文照抄上面 7 个）
- **`value`**：当前状态/数值，8-20 字
- **`definition`**：**指标本身是什么**（纯教学，50-100 字），不提本股
- **`reading`**：**本股当前这个指标的客观读数**，80-120 字

### `reading` 字段的硬规则（这是框架的关键）：

**✅ 必须包含**：
- 当前数值 / 状态
- 近期方向（上行 / 下行 / 持平）
- 关键参考点（近 N 日高低点、交叉日期、突破日期）

**❌ 严禁出现**：
- 跨指标引用 —— 不要说"结合 MACD..."、"配合量能..."（这是 summary 的职责）
- 前瞻语言 —— 不要说"若未来..."、"可能..."、"需警惕..."（summary 的职责）
- 解读性语言 —— 不要说"说明..."、"意味着..."、"处于末段"（summary 的职责）
- 操作建议 —— "建议 / 应该 / 可以" 绝对禁止

**好的 `reading` 示例**（纯观察）：
> "RSI 当前 67.3，位于偏热区间（60-70）。近 5 日从 58.4 上行至 67.3，方向上行。
> 过去 30 日最高 71.2（4/10）、最低 48.3（3/22）。"

**不好的 `reading` 示例**（越俎代庖去推理了）：
> "当前 RSI 67.3 偏热，**结合 MACD 扩张**，**说明**动能仍强。**若未来**持续上行需警惕背离。"
（这属于 summary 的内容，不该出现在 reading 里）

================================================================
## 第三段：情境判定 (situation) —— 一个标签
================================================================

从以下选项中**选一个最贴合的**：
- 强势上涨延续 / 温和上涨 / 震荡整理 / 横盘待突破
- 顶部疲态 / 反转向下 / 弱势下跌延续
- 超卖反弹 / 底部构筑 / 反转向上 / 突破尝试

4-10 个汉字，**只选一个**。这个标签会驱动 summary 的写作角度，也会在 UI 上显示为醒目 badge。

================================================================
## 第四段：详细总结 (summary) —— Diagnosis，350-500 字
================================================================

这是**推理层**。基于 situation 判定 + 7 张信号 reading，展开写：

**结构**（四段，用空行分隔，不要标题）：

**¶1 盘面观察（50-80 字）**
- 图上肉眼可见的事实：当前价相对主要均线的位置、近期 K 线形态、成交量异常
- 纯观察，不做解读

**¶2 信号合力（100-150 字）** ⭐ 这是本段的重点
- 基于情境判定，哪几个信号**相互印证**、哪几个**存在分歧**
- 这里是**跨指标推理**的舞台（reading 里不能写的内容，全部放这里）
- 例如："RSI 上行（67.3）配合 MACD 柱状图持续扩张，**共同确认**动能释放。
  但 BB 已触及上轨 3 日，**与量能放大的速度不匹配**——
  量能在上涨中有收缩迹象，暗示多头力度正在转弱。"

**¶3 关键价位（80-120 字）**
- 散文形式提及支撑阻力位
- 每个价位跟一句"为什么它是这个位置"
- 例如："向下看，$225 附近的 SMA 50 是当前最关键的动态支撑；再往下 $218 是前低支撑。
  向上 $235 前高阻力..."
- **每个提到的价位必须在 `chart_annotations` 里有一项对应**

**¶4 风险结构 + 失效条件（60-100 字）**
- 当前技术面的脆弱性或稳健性
- 段末一句："若 X 发生，以上解读失效"

**禁用词**（严禁出现）：
建议 / 应该 / 可以 / 买入 / 卖出 / 持有 / 减仓 / 加仓 / 止损 / 进场 / 离场

**DO NOT** 在 summary 中重复写 situation 标签（UI 会单独以 badge 展示）。

================================================================
## chart_annotations —— 对应 summary 中每个提到的价位
================================================================

`summary` 中每提到一个具体价位，这里必须有一项匹配：
- `type`：`support`（当前价下方）/ `resistance`（当前价上方）/ `signal`（事件）
- `price`：2 位小数（signal 类型用 `date` 代替）
- `label`：6-14 字短说明为什么是这个位
- `direction`：一般 `"neutral"`，signal 用 `"bullish"`/`"bearish"`

示例：
```json
[
  {"type": "support", "price": 225.30, "label": "SMA 50 动态支撑", "direction": "neutral"},
  {"type": "resistance", "price": 235.00, "label": "前高阻力", "direction": "neutral"},
  {"type": "signal", "date": "2024-03-15", "label": "MACD金叉", "direction": "bullish"}
]
```

================================================================
## 全局写作规则
================================================================

1. **职责分离**：signals = 观察、situation = 分类、summary = 推理。不要错位。
2. 每段开头先给结论，再展开细节
3. 数字尽量放在括号里，不要让数字做主语
4. 术语首次出现加简短说明
5. 中文为主，指标缩写保留英文
6. Markdown 支持：关键结论加粗
7. 禁止比喻和类比

## 时间框架

- **日线**：关注 1-2 周的短期动能和信号
- **周线**：关注 1-3 个月的中期趋势方向
"""

technical_analyst_agent = LlmAgent(
    name="technical_analyst",
    model=TECHNICAL_MODEL,
    description="Analyzes stock technical indicators and provides technical outlook in Chinese",
    instruction=TECHNICAL_ANALYST_INSTRUCTION,
    output_schema=TechnicalAnalysisOutput,
    output_key="technical_analysis",
    after_model_callback=meter("stock.technical", model=TECHNICAL_MODEL),
)


def _strip_none(d: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of dict with None values removed."""
    return {k: v for k, v in d.items() if v is not None}


def _prepare_technical_data_for_agent(
    technical_data: Dict[str, Any],
    timeframe: str = "daily",
) -> Dict[str, Any]:
    """Prepare concise data package for the AI agent.

    Includes current values, derived signals, trend context, and key levels.
    Strips indicator series (too large for LLM context).
    """
    result: Dict[str, Any] = {
        "symbol": technical_data.get("symbol", "UNKNOWN"),
        "timeframe": timeframe,
    }

    # Current indicator readings
    current = technical_data.get("current", {})
    if current:
        result["current_readings"] = _strip_none(current)

    # Derived analysis signals (renamed to avoid clash with output field `signals`)
    derived = technical_data.get("derived", {})
    if derived:
        result["derived_signals"] = _strip_none(derived)

    # Trend summary (20-day lookback for context)
    trend_summary = technical_data.get("trend_summary", {})
    if trend_summary:
        result["recent_trend"] = _strip_none(trend_summary)

    # Support/resistance levels
    sr = technical_data.get("support_resistance", {})
    if sr:
        result["key_levels"] = _strip_none(sr)

    return result


class TechnicalAnalysisAgent:
    """Runs the technical analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=technical_analyst_agent, app_name="stock_technical"
        )

    async def analyze(
        self, symbol: str, technical_data: Dict[str, Any], timeframe: str = "daily"
    ) -> Dict[str, Any]:
        """Generate AI technical analysis. Returns dict with analysis and metadata."""
        try:
            timeframe_label = "日线" if timeframe == "daily" else "周线"
            logger.info("Starting %s analysis for %s", timeframe, symbol)
            data_for_agent = _prepare_technical_data_for_agent(technical_data, timeframe=timeframe)

            prompt = (
                f"请分析以下 {symbol} 的{timeframe_label}技术指标数据，"
                f"并给出完整的技术分析：\n\n"
                f"{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_technical", prompt, "technical_analysis"
            )

            result = {
                field: analysis_data.get(field, [] if field in _LIST_FIELDS else "")
                for field in TECHNICAL_FIELDS
            }

            logger.info(
                "Analysis complete for %s. Title: %s...",
                symbol,
                result['title'][:30] if result['title'] else 'N/A',
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing %s", symbol)

            return {
                "analysis": _empty_technical_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_technical_analysis_agent: Optional[TechnicalAnalysisAgent] = None


def get_technical_analysis_agent() -> TechnicalAnalysisAgent:
    global _technical_analysis_agent
    if _technical_analysis_agent is None:
        _technical_analysis_agent = TechnicalAnalysisAgent()
    return _technical_analysis_agent
