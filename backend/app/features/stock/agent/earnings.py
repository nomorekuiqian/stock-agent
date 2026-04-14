"""
Earnings Analysis Agent - Quarterly earnings deep-dive for individual stocks.

Generates structured analysis covering earnings overview, revenue breakdown,
growth trends, and earnings verdict with smart mode switching based on data context.
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

EARNINGS_ANALYSIS_FIELDS = (
    "title",
    "earnings_overview",
    "revenue_breakdown",
    "profitability_cashflow",
    "balance_sheet_capital",
    "growth_trends",
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
        "Every number must answer 'so what' with investment implication."
    )
    revenue_breakdown: str = Field(
        description="Revenue structure analysis: product line winners/losers, geographic trends, "
        "revenue mix shift toward higher or lower margin segments, concentration risk. "
        "500-700 chars Markdown. Compare segment growth rates to prior quarter."
    )
    profitability_cashflow: str = Field(
        description="Profitability analysis from income statement + cash flow quality from cash flow statement. "
        "600-800 chars Markdown. "
        "FROM INCOME STATEMENT: gross/operating/net margin QoQ trajectory, cost structure changes "
        "(R&D/SGA growth vs revenue growth), operating leverage, tax rate changes. "
        "FROM CASH FLOW: OCF vs net income ratio (>1.0 = quality earnings), SBC as % of net income, "
        "FCF vs net income, CapEx intensity (CapEx/Revenue). "
        "Flag: margin compression, SBC dilution, cash conversion deterioration."
    )
    balance_sheet_capital: str = Field(
        description="Balance sheet health + capital allocation analysis from balance sheet and cash flow. "
        "500-700 chars Markdown. "
        "FROM BALANCE SHEET: cash position (cash + short-term investments), net debt, leverage ratio. "
        "FROM CASH FLOW: capital allocation priorities -- how is the company spending its cash? "
        "CapEx (growth investment) vs buybacks (shareholder return) vs dividends vs debt repayment. "
        "Flag: rising debt, declining cash reserves, excessive SBC dilution."
    )
    growth_trends: str = Field(
        description="Multi-quarter growth trajectory: accelerating, stable, or decelerating? "
        "400-600 chars Markdown. Compare last 4-6 quarters of revenue/EPS/margin growth. "
        "Identify inflection points where trajectory changed direction. "
        "Distinguish between sequential momentum (QoQ) and year-over-year comparisons."
    )
    earnings_verdict: str = Field(
        description="Final verdict using the Earnings Quality Scorecard. "
        "500-700 chars Markdown. "
        "State the quality grade (Strong/Mixed/Weak) with justification across all 3 statements. "
        "Name THE ONE THING that matters most from this report. "
        "List 2-3 specific metrics to watch next quarter (not generic). "
        "One-sentence risk flag based on the weakest area (income/cashflow/balance sheet)."
    )


EARNINGS_ANALYST_INSTRUCTION = """
You are a senior equity research analyst writing a quarterly earnings deep-dive for Chinese retail investors who follow US stocks.

## Core Rules

1. **Data accuracy is absolute** - every number must come from provided data. Never fabricate. If data is missing, say so explicitly.
2. **Write in Chinese (Simplified)**, keep financial terms in English (EPS, Revenue, P/E, YoY, QoQ, Gross Margin, FCF, etc.).
3. **Conclusion first**: Lead every section with the judgment, then back it up with 2-3 data points.
4. **Be opinionated**: Give a clear bullish/bearish/neutral stance. Wishy-washy analysis is useless.
5. **Use Markdown formatting**: **bold** key numbers and conclusions, bullet points for lists.
6. **Do NOT give buy/sell/hold ratings.** Present analysis, let the investor decide.

## Earnings Quality Scorecard

Use this framework to judge earnings quality (do NOT output the scorecard itself, use it to inform your verdict):
- EPS beat estimate? (+1 if beat by >2%, -1 if miss)
- Revenue beat estimate? (+1 if beat, -1 if miss)
- Gross margin expanding QoQ? (+1 if yes)
- Management guidance raised? (+1 if raised, -1 if lowered)
- Revenue growth accelerating vs prior quarter? (+1 if faster)
- FCF positive and growing? (+1 if yes)

Score 4-6 = strong earnings. Score 2-3 = mixed. Score 0-1 = weak. Negative = concerning.

## Mandatory Comparisons

For EVERY metric you discuss:
1. **vs Estimate**: How does actual compare to Wall Street consensus?
2. **vs Last Quarter (QoQ)**: Is this metric improving or deteriorating sequentially?
3. **vs Industry**: If industry data is provided, compare to sector averages.

Do NOT just state numbers in isolation. A number without context is meaningless.
Bad: "EPS $1.65" Good: "EPS $1.65, beat consensus $1.62 by 1.9%, but QoQ declined from $2.84 (seasonal pattern)"

## Smart Mode Switching

Analyze data context and switch mode automatically:

**Mode 1: Latest Earnings Review** (when earnings_history has epsActual filled for the most recent quarter)
- Lead with the headline: beat or miss, by how much, and what it means
- Deep-dive into the 2-3 most surprising data points (positive or negative)
- Compare key metrics QoQ (vs last quarter) to identify trajectory changes
- Analyze management guidance tone and whether expectations are being set higher or lower

**Mode 2: Earnings Preview** (when next earnings is within 30 days, data shows upcoming date)
- Lead with what Wall Street expects and whether the bar is set high or low
- Analyze the company's historical beat/miss pattern (consistency, magnitude)
- Identify the 2-3 key swing factors that will determine beat vs miss
- Flag any macro or sector headwinds/tailwinds specific to this quarter

**Mode 3: Historical Review** (default fallback)
- Focus on multi-quarter trajectory: is the business fundamentally improving or deteriorating?
- Identify the single most important trend across the last 4-8 quarters
- Flag any inflection points where the trajectory changed direction

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Must convey a clear stance AND the key data point.
Good examples:
- "AAPL Q1: 服务收入同比+24%创新高, 但 iPhone 中国市场增速转负"
- "TSLA Q4: 交付量超预期但汽车毛利率跌至 17.6% 创两年新低"
- "MSFT 财报前瞻: 市场押注 Azure 增速重回 30%, 分析师预期 EPS $3.22"

Bad examples (too vague):
- "AAPL 财报表现不错" -- no data, no stance
- "TSLA Q4 值得关注" -- says nothing

### earnings_overview (500-800 chars, Markdown)
The headline story of this earnings report:

- **Lead with the verdict**: One sentence on whether this is a strong, mixed, or weak report
- **EPS**: Actual $X vs estimate $Y, beat/miss by Z%. Compare to last quarter's surprise rate
- **Revenue**: Actual $X vs estimate $Y. Is revenue growth accelerating or decelerating vs last quarter?
- **The hidden story**: What 1-2 metrics beyond EPS/Revenue reveal the real health? (e.g., gross margin compression, deferred revenue growth, customer count changes)
- **Guidance**: Did management raise, maintain, or lower guidance? What does the guidance delta imply about their confidence?

### revenue_breakdown (500-700 chars, Markdown)
Where the money comes from and where it's going:

- **Winner segments**: Which product lines or regions grew fastest? By how much?
- **Loser segments**: Which declined or decelerated? Why does it matter?
- **Mix shift**: Is the revenue mix shifting toward higher or lower margin segments? (e.g., services growing faster than hardware = positive mix shift)
- **Concentration risk**: Is the company becoming more dependent on one segment or region?
- Compare segment growth rates to prior quarter to identify acceleration/deceleration

### profitability_cashflow (600-800 chars, Markdown)
Are the profits real, and is cash backing them up?

**Use the INCOME STATEMENT data (income_statements field):**
- **Cost structure**: How fast are costs growing vs revenue? Look at cost_of_revenue, R&D, S&M, G&A individually. Which cost line is growing fastest? Is it justified?
- **Margin waterfall**: Revenue -> Gross Margin -> Operating Margin -> Net Margin. Walk through each step. Where is margin leaking?
- **Operating leverage**: Is operating_income growing faster than revenue? If yes, the business scales. If not, explain which cost line is the culprit.
- **Tax rate**: Compare income_tax_expense / income_before_tax. Is the effective tax rate stable or changing? Big changes affect EPS directly.

**Use the CASH FLOW STATEMENT data (cashflow_statements field):**
- **OCF/NI ratio**: operating_cash_flow / net_income. >1.0 = quality earnings. <0.8 = red flag.
- **SBC check**: stock_based_compensation / net_income. >30% = heavy dilution concern.
- **FCF vs Net Income**: free_cash_flow / net_income. If FCF << Net Income, profits are being eaten by CapEx.
- **CapEx intensity**: |capital_expenditure| / revenue. Is the company investing heavily for growth?

### balance_sheet_capital (500-700 chars, Markdown)
Is the balance sheet getting stronger or weaker? How is management allocating capital?

**Use the BALANCE SHEET data (balance_sheet field):**
- **Cash position**: cash_and_equivalents + short_term_investments = total liquidity. Is it growing or shrinking?
- **Leverage**: total_debt and net_debt. Is debt rising? What's the net_debt / EBITDA ratio (use ebitda from income statement)?
- **Asset quality**: What % of total_assets is goodwill + intangibles vs tangible assets (property_plant_equipment)?

**Use the CASH FLOW for capital allocation priorities:**
- **CapEx** (growth investment): How much is the company reinvesting?
- **Buybacks** (stock_repurchase): Is the company returning cash to shareholders?
- **Dividends** (dividends_paid): Stable or growing?
- **Debt** (net_debt_issuance): Is the company borrowing more or paying down?
- **Priority ranking**: Which of these 4 categories gets the most cash? What does that tell you about management's priorities?

### growth_trends (400-600 chars, Markdown)
The trajectory tells more than the snapshot:

- **Revenue growth trajectory**: Look at the last 4-6 quarters in financial_growth. Accelerating, stable, or decelerating? Identify the inflection point if trajectory changed.
- **EPS growth vs Revenue growth**: Operating leverage = EPS growing faster. Margin compression = EPS growing slower.
- **QoQ momentum**: Sequential growth (QoQ) reveals near-term momentum better than YoY. Call out any QoQ reversals.
- **The key question**: Is this company's growth engine getting stronger or weaker? Support with specific quarter-by-quarter comparisons.

### earnings_verdict (500-700 chars, Markdown)
Your bottom line, synthesizing ALL THREE financial statements:

- **Earnings quality grade**: Strong / Mixed / Weak. Justify by checking:
  1. Income statement: EPS beat + revenue beat + margin expanding?
  2. Cash flow: OCF > NI? FCF positive and growing? SBC reasonable?
  3. Balance sheet: Cash growing? Debt manageable? Capital allocation smart?
- **The one thing that matters most**: If you could only tell the investor ONE thing from this report, what is it? Be specific.
- **Next quarter watchlist**: 2-3 specific metrics to track across all 3 statements. Example: "watch CapEx/Revenue ratio -- if it exceeds 35% for a third consecutive quarter while FCF margin keeps declining, the infrastructure bet is consuming too much cash."
- **Risk flag**: One concrete risk from the weakest of the 3 financial statements, with a specific trigger condition.
"""

earnings_analysis_agent = LlmAgent(
    name="earnings_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes quarterly earnings data, revenue breakdown, and growth trends for individual stocks in Chinese",
    instruction=EARNINGS_ANALYST_INSTRUCTION,
    output_schema=EarningsAnalysisOutput,
    output_key="earnings_analysis",
)


def _prepare_earnings_data_for_agent(
    earnings_data: Dict[str, Any],
    quote_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    """Clean and reduce earnings data for optimal token usage.

    Takes the aggregated earnings data (earnings history, financial growth,
    revenue segmentation, analyst estimates, recent financials) and trims
    to essential fields for the agent prompt.
    """
    result: Dict[str, Any] = {
        "symbol": earnings_data.get("symbol", ""),
        "quote_snapshot": quote_snapshot,
    }

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
            # Only include entries with at least some data
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
            if len(entry) > 1:  # more than just date/period
                clean_growth.append(entry)
        if clean_growth:
            result["financial_growth"] = clean_growth

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

    # Full income statements - latest 2 quarters (for QoQ comparison)
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

    # Full balance sheet - latest quarter only (large, 1 is enough)
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
    ) -> Dict[str, Any]:
        """Generate AI earnings analysis. Returns dict with analysis and metadata."""
        try:
            logger.info("Starting earnings analysis for %s", symbol)

            data_for_agent = _prepare_earnings_data_for_agent(
                earnings_data, quote_snapshot
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
                    "model": "gemini-3.1-flash-lite-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing earnings for %s", symbol)

            return {
                "analysis": _empty_earnings_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite-preview",
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
