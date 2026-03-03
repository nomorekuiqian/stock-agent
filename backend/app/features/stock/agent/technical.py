"""
Technical Analysis Agent - Chart pattern and indicator analysis for stocks.

Generates structured technical analysis covering trend, entry/exit signals,
pattern confluence, and actionable summary.
"""

import json
from typing import Any, Dict, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso

from ._base import run_agent_session

logger = get_logger(__name__)

TECHNICAL_FIELDS = (
    "title",
    "trend_analysis",
    "entry_exit_signals",
    "pattern_analysis",
    "technical_summary",
)


def _empty_technical_analysis() -> Dict[str, str]:
    return {field: "" for field in TECHNICAL_FIELDS}


class TechnicalAnalysisOutput(BaseModel):
    """Technical analysis output: conclusion-first, plain language, actionable."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. Direct stance, no metaphors. "
        "Example: 'META: 跌破所有均线，弱势震荡等待方向选择'"
    )
    trend_analysis: str = Field(
        description="Trend and momentum analysis in Markdown, 500-800 chars. "
        "Conclusion-first style. Explain what readings MEAN in context, not just what they ARE. "
        "Cover: MA alignment, trend strength, momentum direction, overall bias."
    )
    entry_exit_signals: str = Field(
        description="Key levels and actionable signals in Markdown, 400-600 chars. "
        "Cover: support/resistance with distance%, overbought/oversold, "
        "invalidation conditions, specific advice for holders vs watchers."
    )
    pattern_analysis: str = Field(
        description="Signal confluence and risk warning in Markdown, 400-600 chars. "
        "Cover: which signals agree/conflict and what that means, "
        "risk scenarios, what would prove current view wrong."
    )
    technical_summary: str = Field(
        description="2-3 sentence TLDR in Markdown, 100-200 chars. "
        "Current status + key level to watch + what to do. "
        "Do NOT repeat specific numbers from other fields."
    )


TECHNICAL_ANALYST_INSTRUCTION = """
你是一位经验丰富的技术分析师，为普通投资者解读盘面信号。

你的读者可能不太熟悉技术指标，但不要居高临下地教他们，也不要甩术语让他们自己猜。
你的工作是：**把指标读数翻译成"盘面正在告诉我们什么"**。

## 写作原则：结论先行，数据支撑，解释含义

1. **每段先说结论**，再用数据证明。不要用指标名+数字开头
2. **解释"这个数值意味着什么"**，而不是罗列指标读数
3. **数字放括号里作为佐证**，不要让数字做主语
4. **只讲最关键的 2-3 个信号**，不需要提到每一个指标
5. **术语首次出现时加简短说明**，如"均线（一段时间的平均价格）"、"ADX（衡量趋势强弱的指标）"
6. **给明确观点**：看涨/看跌/观望 + 信心度（强/中/弱）
7. **中文为主**，指标缩写保留英文（RSI, MACD, SMA, ADX, BB）
8. **Markdown 格式**：关键结论加粗，分条列出

## 禁止事项
- 不要用任何比喻和类比，包括但不限于：天气、温度计、油门刹车、地板天花板、跑步、温水煮青蛙、慢牛、阴跌
- 不要用"像...一样"、"就好比..."
- 不要在每段末尾加"对你意味着什么"这种固定栏目

## 术语处理
读者可能不太懂以下术语，首次使用时请加简短括号说明：
- 多头排列/空头排列 → 如"多头排列（短期均线在上、长期在下，说明各周期都在涨）"
- 金叉/死叉 → 如"MACD 金叉（短期动能线上穿长期线，通常是买入信号）"
- 超买/超卖 → 如"进入超卖区（短期跌得太多太快）"
- 钝化 → 避免使用这个词，改用"指标在极端区域停留较久"
- 套牢盘 → 如"套牢盘（之前高位买入、目前亏损的投资者）"
- 放量/缩量 → 如"放量（成交量明显高于平时）"
其他不常见术语同理，首次出现时加一句解释。第二次出现时不需要重复解释。

## 写法示范

差的写法（术语堆砌，数字开头）：
"ADX 指标为 30.33，且 -DI (33.64) 显著高于 +DI (19.41)，说明当前的下跌并非盘整，而是具备较强动能的单边趋势。"

好的写法（结论先行，解释含义）：
"这轮下跌不是横盘震荡，而是有方向的持续下跌——趋势强度指标 ADX 达到 30（超过 25 就算强趋势），卖方力量明显压过买方。"

差的写法（数字墙）：
"价格 (210.11) 位于 SMA20 (221.65)、SMA50 (228.52) 和 SMA200 (223.97) 下方。所有均线构成层层压制，呈现典型的空头排列。"

好的写法（先说意味着什么）：
"价格（210）已跌破所有重要均线（短期 222、中期 229、长期 224），无论从短期还是长期看，市场都在走弱。上方均线密集，意味着反弹的阻力很大。"

## 时间框架
根据收到的数据调整分析视角：
- **日线**：关注 1-2 周的短期信号和动能变化
- **周线**：关注 1-3 个月的中期趋势方向

## 输出要求

### title
一句话中文标题，15-40 字，直接表达观点和关键信息。

### trend_analysis (500-800 chars, Markdown)
先用一句话给出趋势判断（偏多/偏空/震荡 + 信心度），然后分析：
- **趋势状态**：价格和均线的关系说明什么？是在上涨通道、下跌通道还是横盘？
- **趋势强度**：趋势是强是弱？是有方向的趋势还是无序的震荡？
- **动能变化**：涨跌的力度在加强还是减弱？有没有边际变化？（比如"虽然还在跌，但跌速在放缓"）
- **量能配合**：成交量是否支持当前趋势？放量（成交量明显高于平时）说明市场认可这个方向，缩量说明参与度不足
- **结论**：一句话总结，建议进攻、防守还是观望

### entry_exit_signals (400-600 chars, Markdown)
围绕"该怎么做"来组织：
- **关键阻力位**：上方什么价格有压力？距离多远？突破意味着什么？
- **关键支撑位**：下方什么价格有支撑？跌破意味着什么？
- **短期信号**：有没有超买/超卖？有没有短期反弹/回调的迹象？
- **操作建议**：分别对持有者和观望者给出具体建议。突破或跌破关键位时，要关注成交量是否配合（放量突破更可信，缩量突破容易是假突破）

### pattern_analysis (400-600 chars, Markdown)
信号共振与风险提示：
- **一致性判断**：多数指标指向同一方向吗？一致性越高判断越可靠。成交量是否与价格方向一致？（量价齐升=健康上涨，价涨量缩=动力不足）
- **矛盾信号**：有没有和主趋势相悖的信号？这些矛盾信号可靠吗？为什么？
- **风险提示**：当前判断最大的风险是什么？什么情况会证明判断是错的？出现什么信号应该改变看法？

### technical_summary (100-200 chars, Markdown)
2-3 句话的核心总结：当前是什么状态 + 最该关注的一个关键价位或信号 + 建议怎么做。不要重复其他部分的具体数字。
"""

technical_analyst_agent = LlmAgent(
    name="technical_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes stock technical indicators and provides technical outlook in Chinese",
    instruction=TECHNICAL_ANALYST_INSTRUCTION,
    output_schema=TechnicalAnalysisOutput,
    output_key="technical_analysis",
)


def _strip_none(d: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of dict with None values removed."""
    return {k: v for k, v in d.items() if v is not None}


def _prepare_technical_data_for_agent(
    technical_data: Dict[str, Any],
    timeframe: str = "daily",
) -> Dict[str, Any]:
    """Clean and reduce technical data for optimal Agent token usage.

    Filters data by timeframe: daily keeps only daily indicators,
    weekly remaps weekly indicators to standard field names.
    """
    result: Dict[str, Any] = {"symbol": technical_data.get("symbol", "UNKNOWN")}

    ratings = technical_data.get("ratings", {})
    oscillators = technical_data.get("oscillators", {})
    trend = technical_data.get("trend", {})

    if timeframe == "weekly":
        if ratings:
            result["tv_ratings"] = {"weekly": ratings.get("weekly", {})}
        if oscillators:
            result["oscillators"] = _strip_none({
                "rsi_14": oscillators.get("rsi_14_weekly"),
                "macd_level": oscillators.get("macd_level_weekly"),
                "macd_signal": oscillators.get("macd_signal_weekly"),
                "macd_histogram": oscillators.get("macd_histogram_weekly"),
            })
        if trend:
            result["trend_indicators"] = _strip_none({
                "adx_14": trend.get("adx_14_weekly"),
            })
    else:
        if ratings:
            result["tv_ratings"] = {"daily": ratings.get("daily", {})}
        if oscillators:
            result["oscillators"] = {
                k: v for k, v in oscillators.items()
                if v is not None and not k.endswith("_weekly")
            }
        if trend:
            result["trend_indicators"] = {
                k: v for k, v in trend.items()
                if v is not None and not k.endswith("_weekly")
            }

    # Pass-through sections: filter None values from dicts, copy non-empty sections as-is
    for source_key, dest_key in [
        ("moving_averages", "moving_averages"),
        ("volatility", "volatility"),
        ("price_volume", "price_volume"),
    ]:
        section = technical_data.get(source_key, {})
        if section:
            result[dest_key] = _strip_none(section)

    for source_key, dest_key in [
        ("derived", "derived_signals"),
        ("trends", "indicator_trends"),
        ("support_resistance", "support_resistance"),
        ("pattern_signals", "pattern_signals"),
    ]:
        section = technical_data.get(source_key, {})
        if section:
            result[dest_key] = section

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

            result = {field: analysis_data.get(field, "") for field in TECHNICAL_FIELDS}

            logger.info(
                "Analysis complete for %s. Title: %s...",
                symbol,
                result['title'][:30] if result['title'] else 'N/A',
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing %s", symbol)

            return {
                "analysis": _empty_technical_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
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
