"""
Earnings Analysis Agent - Quarterly earnings deep-dive for individual stocks.

Two analysis modes:
- Mode A (Transcript): Deep analysis using earnings call transcript as primary source,
  with structured financial data for verification.
- Mode B (Data-only): Pure structured data analysis when no transcript is available.
"""

import json
import re
from typing import Any, Dict, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso

from ._base import run_agent_session

logger = get_logger(__name__)

EARNINGS_ANALYSIS_FIELDS = (
    "title",
    "earnings_overview",
    "guidance_outlook",
    "key_drivers",
    "revenue_and_segments",
    "financial_quality",
    "earnings_verdict",
)


def _empty_earnings_analysis() -> Dict[str, str]:
    return {field: "" for field in EARNINGS_ANALYSIS_FIELDS}


class EarningsAnalysisOutput(BaseModel):
    """Earnings analysis output: quarterly earnings deep-dive."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. "
        "Must include a specific data point. "
        "Example: 'AAPL Q1 FY26: 服务收入同比+24%创新高, 但 iPhone 中国市场增速转负'"
    )
    earnings_overview: str = Field(
        description="Headline story: beat/miss verdict + 2-3 most telling metrics. "
        "600-900 chars Markdown. Lead with judgment, then support with data. "
        "Cover: EPS actual vs estimate, Revenue actual vs estimate, "
        "the one hidden metric that reveals the real story."
    )
    guidance_outlook: str = Field(
        description="Management's forward guidance for next quarter/full year. "
        "MUST include specific numbers if management provided them "
        "(revenue range, gross margin target, opex guidance, etc). "
        "Compare: guidance vs prior quarter's guidance (raised/lowered/maintained), "
        "guidance vs Wall Street consensus (above/below/in-line). "
        "If management did NOT provide guidance, state that explicitly "
        "and explain what the absence of guidance might signal. "
        "Return empty string if no transcript available AND no guidance data in financials. "
        "500-800 chars Markdown."
    )
    key_drivers: str = Field(
        description="WHY did results beat or miss expectations? "
        "Identify the 2-3 most important factors that drove the beat/miss. "
        "In transcript mode: extract from management's explanation + analyst Q&A. "
        "In data-only mode: infer from segment growth, margin changes, one-time items. "
        "Each driver should be specific: not 'strong demand' but "
        "'iPhone 17 drove 23% unit growth in China, reversing 3 quarters of decline'. "
        "500-800 chars Markdown."
    )
    revenue_and_segments: str = Field(
        description="Revenue structure + segment analysis. "
        "In transcript mode, cross-reference management commentary with actual numbers. "
        "In data-only mode, analyze segment growth and mix shift. "
        "500-700 chars Markdown."
    )
    financial_quality: str = Field(
        description="Profitability trajectory + cash flow quality + balance sheet health. "
        "Merged view of income statement, cash flow, and balance sheet. "
        "Key checks: margin waterfall, OCF/NI ratio, SBC dilution, CapEx intensity, "
        "cash position, leverage, capital allocation priorities. "
        "600-800 chars Markdown."
    )
    earnings_verdict: str = Field(
        description="Earnings quality grade (Strong/Mixed/Weak) + justification. "
        "THE one thing that matters most from this report. "
        "2-3 specific next-quarter watchlist items. "
        "One-sentence risk flag. "
        "500-700 chars Markdown."
    )


EARNINGS_ANALYST_INSTRUCTION = """
You are a senior equity research analyst writing a quarterly earnings deep-dive for Chinese retail investors who follow global equities.

## Core Rules

1. **Data accuracy is absolute** - every number must come from provided data. Never fabricate. If data is missing, say so explicitly.
2. **Write in Chinese (Simplified)**, keep financial terms in English (EPS, Revenue, P/E, YoY, QoQ, Gross Margin, FCF, etc.).
3. **Conclusion first**: Lead every section with the judgment, then back it up with 2-3 data points.
4. **Be opinionated**: Give a clear bullish/bearish/neutral stance. Wishy-washy analysis is useless.
5. **Use Markdown formatting**: **bold** key numbers and conclusions, bullet points for lists.
6. **Do NOT give buy/sell/hold ratings.** Present analysis, let the investor decide.

## Two Analysis Modes

### Mode A: Transcript Available (has_transcript = true)

The transcript is your PRIMARY source. Structured financial data is for verification.

Your job: Extract what numbers alone cannot tell you.
- **Forward guidance with specific numbers** -- revenue range, gross margin target, opex guidance
- **WHY results beat/miss** -- management's own explanation + analyst pushback
- **Cross-reference** -- did management's claims match the actual numbers?
- **Tone shifts** -- any language changes from prior quarter ("confident" -> "cautious"?)
- **guidance_outlook** and **key_drivers** must have content in this mode

### Mode B: Data Only (has_transcript = false)

Use structured financial data as sole source.
- **guidance_outlook**: return empty string ("") unless guidance data is available in financials
- **key_drivers**: infer from segment data, margin changes, one-time items
- Apply sub-mode switching:
  - **Latest Review**: if earnings_history has epsActual filled for most recent quarter
  - **Preview**: if next earnings is within 30 days
  - **Historical Review**: default fallback

## Handling Variable Transcript Quality

Different earnings calls have different structures. ADAPT your analysis:

1. **No guidance section?** Do not fabricate guidance. State explicitly that management did not provide forward guidance and explain what the absence might signal.
2. **Guidance given?** This is the MOST important section. Extract every specific number: revenue range, gross margin guidance, opex guidance, CapEx plans, segment-level outlook. Then compare vs prior quarter's guidance and vs Wall Street consensus.
3. **Short Q&A?** Compress key_drivers insights from Q&A into the driver analysis.
4. **Defensive/evasive tone?** This IS the insight. Flag what management was dancing around.

## Earnings Quality Scorecard

Use this framework to judge earnings quality (do NOT output the scorecard itself, use it to inform your verdict):
- EPS beat estimate? (+1 if beat by >2%, -1 if miss)
- Revenue beat estimate? (+1 if beat, -1 if miss)
- Gross margin expanding QoQ? (+1 if yes)
- Management guidance raised? (+1 if raised, -1 if lowered) -- from transcript if available
- Revenue growth accelerating vs prior quarter? (+1 if faster)
- FCF positive and growing? (+1 if yes)

Score 4-6 = strong. Score 2-3 = mixed. Score 0-1 = weak. Negative = concerning.

## Mandatory Comparisons

For EVERY metric you discuss:
1. **vs Estimate**: How does actual compare to Wall Street consensus?
2. **vs Last Quarter (QoQ)**: Is this metric improving or deteriorating?
3. **vs Industry**: If industry data is provided, compare to sector averages.

Bad: "EPS $1.65" Good: "EPS $1.65, beat consensus $1.62 by 1.9%, but QoQ declined from $2.84 (seasonal)"

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Must convey a clear stance AND a specific data point.

### earnings_overview (600-900 chars, Markdown)
The headline story:
- **Lead with verdict**: Strong/Mixed/Weak beat or miss
- **EPS**: actual vs estimate, beat/miss %, compare to last quarter's surprise
- **Revenue**: actual vs estimate, growth rate accelerating or decelerating
- **The hidden metric**: 1-2 numbers beyond EPS/Revenue that reveal the real health

### guidance_outlook (500-800 chars, Markdown)
Management's forward guidance -- this is what moves the stock price:
- **Specific numbers**: next quarter revenue range, gross margin target, opex guidance, CapEx plans
- **vs Prior guidance**: did management raise, lower, or maintain vs what they guided last quarter?
- **vs Consensus**: is guidance above, below, or in-line with Wall Street expectations?
- **Segment-level outlook**: any specific product/geography guidance?
- If no guidance was provided, state that explicitly and analyze what the absence might signal
- In Mode B (no transcript), return empty string unless guidance data is in the financials

### key_drivers (500-800 chars, Markdown)
WHY did results beat or miss? The root cause analysis:
- **2-3 specific drivers**: not "strong demand" but "iPhone 17 drove 23% unit growth in China"
- **From transcript**: management's explanation + what analysts challenged in Q&A
- **From data**: which segments over/underperformed, what margin shifts occurred, any one-time items
- **Surprise factors**: what was unexpected vs consensus expectations

### revenue_and_segments (500-700 chars, Markdown)
Revenue structure analysis:
- Winner/loser segments with specific growth rates
- Revenue mix shift (toward higher or lower margin segments?)
- Geographic trends and concentration risk
- In transcript mode, cross-reference management commentary with actual segment numbers

### financial_quality (600-800 chars, Markdown)
Quality check across all three financial statements:
- **Income**: margin waterfall, operating leverage, cost structure
- **Cash flow**: OCF/NI ratio, SBC check, FCF quality, CapEx intensity
- **Balance sheet**: cash position, leverage, capital allocation priorities

### earnings_verdict (500-700 chars, Markdown)
Quality grade (Strong/Mixed/Weak) justified across all 3 statements. THE one thing that matters most. 2-3 specific next-quarter watchlist items. One risk flag.
"""

earnings_analysis_agent = LlmAgent(
    name="earnings_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes quarterly earnings using transcript and financial data for individual stocks in Chinese",
    instruction=EARNINGS_ANALYST_INSTRUCTION,
    output_schema=EarningsAnalysisOutput,
    output_key="earnings_analysis",
)


# ---------------------------------------------------------------------------
# Transcript preprocessing
# ---------------------------------------------------------------------------

_OPERATOR_PATTERNS = [
    r"^Operator:.*$",
    r"^(?:Ladies and gentlemen|Thank you for standing by|This concludes).*$",
    r"^(?:Our next question|The next question|We'll take our next).*$",
    r"^(?:Please stand by|One moment|Please go ahead).*$",
    r"^(?:And that does conclude|Once again, this does conclude).*$",
]
_OPERATOR_RE = re.compile(
    "|".join(_OPERATOR_PATTERNS), re.IGNORECASE | re.MULTILINE
)


def preprocess_transcript(raw_text: str, max_chars: int = 60000) -> str:
    """Clean transcript text for LLM consumption.

    1. Remove operator procedural lines (~10-15% token savings).
    2. Preserve speaker attribution.
    3. If over budget, truncate Q&A from the end.
    """
    if not raw_text:
        return ""

    # Remove operator boilerplate
    cleaned = _OPERATOR_RE.sub("", raw_text)
    # Collapse multiple blank lines
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    if len(cleaned) <= max_chars:
        return cleaned

    # Over budget: keep as much as possible, cut from the end
    return cleaned[:max_chars].rsplit("\n", 1)[0] + "\n\n[Transcript truncated]"


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------

def _prepare_earnings_data_for_agent(
    earnings_data: Dict[str, Any],
    quote_snapshot: Dict[str, Any],
    transcript: Optional[str] = None,
) -> Dict[str, Any]:
    """Clean and reduce earnings data for optimal token usage."""
    result: Dict[str, Any] = {
        "symbol": earnings_data.get("symbol", ""),
        "quote_snapshot": quote_snapshot,
        "has_transcript": bool(transcript),
    }

    if transcript:
        result["transcript"] = preprocess_transcript(transcript)

    # Earnings history (surprise data) - last 8 quarters
    earnings_history = earnings_data.get("earnings_history", [])
    if earnings_history:
        clean_history = []
        for item in earnings_history[:8]:
            entry = {
                "quarter": item.get("quarter", ""),
                "eps_actual": item.get("eps_actual"),
                "eps_estimate": item.get("eps_estimate"),
                "surprise_percent": item.get("surprise_percent"),
            }
            if entry.get("eps_actual") is not None or entry.get("eps_estimate") is not None:
                clean_history.append(entry)
        if clean_history:
            result["earnings_history"] = clean_history

    # Analyst estimates - next 4 periods
    analyst_estimates = earnings_data.get("analyst_estimates", [])
    if analyst_estimates:
        clean_estimates = []
        for item in analyst_estimates[:4]:
            entry = {
                "date": item.get("date", ""),
                "revenue_avg": item.get("revenue_avg"),
                "eps_avg": item.get("eps_avg"),
                "num_analysts_eps": item.get("num_analysts_eps"),
                "num_analysts_revenue": item.get("num_analysts_revenue"),
            }
            clean_estimates.append(entry)
        if clean_estimates:
            result["analyst_estimates"] = clean_estimates

    # Revenue segments - last 4 periods
    revenue_segments = earnings_data.get("revenue_segments", [])
    if revenue_segments:
        clean_segments = []
        for item in revenue_segments[:4]:
            entry = {
                "period": item.get("period", ""),
                "date": item.get("date", ""),
                "data": item.get("data", {}),
            }
            if entry["data"]:
                clean_segments.append(entry)
        if clean_segments:
            result["revenue_segments"] = clean_segments

    # Revenue geographic segments - last 4 periods
    revenue_geo = earnings_data.get("revenue_geo_segments", [])
    if revenue_geo:
        clean_geo = []
        for item in revenue_geo[:4]:
            entry = {
                "period": item.get("period", ""),
                "date": item.get("date", ""),
                "data": item.get("data", {}),
            }
            if entry["data"]:
                clean_geo.append(entry)
        if clean_geo:
            result["revenue_geo_segments"] = clean_geo

    # Financial growth - last 8 quarters
    financial_growth = earnings_data.get("financial_growth", [])
    if financial_growth:
        clean_growth = []
        for item in financial_growth[:8]:
            entry = {}
            for key in (
                "date", "period",
                "revenueGrowth", "grossProfitGrowth", "netIncomeGrowth",
                "epsdilutedGrowth", "operatingIncomeGrowth",
                "freeCashFlowGrowth",
            ):
                val = item.get(key)
                if val is not None:
                    entry[key] = val
            if len(entry) > 1:
                clean_growth.append(entry)
        if clean_growth:
            result["financial_growth"] = clean_growth

    # Pending quarter headline data (available on earnings day before full
    # income statement is published). Gives the agent EPS/Revenue actuals.
    pending = earnings_data.get("pending_quarter")
    if pending:
        result["pending_quarter"] = {
            "date": pending.get("date"),
            "fiscal_year": pending.get("fiscal_year"),
            "fiscal_period": pending.get("fiscal_period"),
            "eps_actual": pending.get("eps_diluted"),
            "eps_estimated": pending.get("eps_estimated"),
            "revenue_actual": pending.get("revenue"),
            "revenue_estimated": pending.get("revenue_estimated"),
        }

    # Next earnings date
    next_earnings = earnings_data.get("next_earnings_date")
    if next_earnings:
        result["next_earnings_date"] = next_earnings

    # DCF value for context
    dcf_value = earnings_data.get("dcf_value")
    if dcf_value is not None:
        result["dcf_value"] = dcf_value

    stock_price = earnings_data.get("stock_price")
    if stock_price is not None:
        result["stock_price"] = stock_price

    # Full income statements - latest 2 quarters
    income_stmts = earnings_data.get("income_statements", [])
    if income_stmts:
        clean_is = []
        for item in income_stmts[:2]:
            entry = {k: v for k, v in item.items()
                     if v is not None and v != 0 and k != "fiscal_year"}
            if entry:
                clean_is.append(entry)
        if clean_is:
            result["income_statements"] = clean_is

    # Full cash flow statements - latest 2 quarters
    cashflow = earnings_data.get("cashflow_statements", [])
    if cashflow:
        clean_cf = []
        for item in cashflow[:2]:
            entry = {k: v for k, v in item.items()
                     if v is not None and v != 0 and k != "fiscal_year"}
            if entry:
                clean_cf.append(entry)
        if clean_cf:
            result["cashflow_statements"] = clean_cf

    # Full balance sheet - latest quarter only
    balance = earnings_data.get("balance_sheets", [])
    if balance:
        bs = balance[0]
        clean_bs = {k: v for k, v in bs.items()
                    if v is not None and v != 0 and k != "fiscal_year"}
        if clean_bs:
            result["balance_sheet"] = clean_bs

    # Industry context from enriched quote_snapshot
    context = {}
    for key in ("industry", "sector", "pe", "revenue_yoy",
                "gross_margin", "operating_margin", "net_margin",
                "roe", "roa", "current_ratio", "debt_to_equity"):
        val = quote_snapshot.get(key)
        if val is not None:
            context[key] = val
    if context:
        result["company_context"] = context

    return result


# ---------------------------------------------------------------------------
# Agent class
# ---------------------------------------------------------------------------

class EarningsAgent:
    """Runs the earnings analysis agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=earnings_analysis_agent, app_name="stock_earnings_analysis"
        )

    async def analyze(
        self,
        symbol: str,
        earnings_data: Dict[str, Any],
        quote_snapshot: Dict[str, Any],
        transcript: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate AI earnings analysis. Returns dict with analysis and metadata."""
        try:
            has_transcript = bool(transcript and len(transcript) > 100)
            logger.info(
                "Starting earnings analysis for %s (transcript=%s)",
                symbol, has_transcript,
            )

            data_for_agent = _prepare_earnings_data_for_agent(
                earnings_data, quote_snapshot, transcript
            )

            prompt = (
                f"Please analyze the following earnings data for {symbol} "
                f"and provide a comprehensive earnings analysis:\n\n"
                f"{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_earnings_analysis", prompt, "earnings_analysis"
            )

            result = {
                field: analysis_data.get(field, "")
                for field in EARNINGS_ANALYSIS_FIELDS
            }

            logger.info(
                "Earnings analysis complete for %s. Title: %s...",
                symbol,
                result["title"][:30] if result["title"] else "N/A",
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
                    "has_transcript": has_transcript,
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing earnings for %s", symbol)

            return {
                "analysis": _empty_earnings_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_earnings_agent: Optional[EarningsAgent] = None


def get_earnings_agent() -> EarningsAgent:
    global _earnings_agent
    if _earnings_agent is None:
        _earnings_agent = EarningsAgent()
    return _earnings_agent
