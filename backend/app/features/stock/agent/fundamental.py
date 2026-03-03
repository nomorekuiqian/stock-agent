"""
Fundamental Analysis Agent - Deep equity research for individual stocks.

Generates structured analysis covering valuation, financials, company overview,
target price range, opportunities, risks, and investment summary.
"""

import json
import statistics
from typing import Any, Dict, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso

from ._base import run_agent_session

logger = get_logger(__name__)

ANALYSIS_FIELDS = (
    "title",
    "fundamentals_analysis",
    "financials_analysis",
    "company_overview",
    "valuation_range",
    "opportunities",
    "risks",
    "investment_summary",
)


def _empty_analysis() -> Dict[str, str]:
    return {field: "" for field in ANALYSIS_FIELDS}


class StockAnalysisOutput(BaseModel):
    """V4 deep analysis structure: each field contains rich, structured Markdown content."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars, clear investment stance."
    )
    fundamentals_analysis: str = Field(
        description="Deep fundamentals analysis in Markdown, 500-800 chars. "
        "Cover: valuation vs peers/history, growth quality, profitability."
    )
    financials_analysis: str = Field(
        description="Deep financial statements analysis in Markdown, 600-1000 chars. "
        "Cover: revenue quality, earnings quality, balance sheet health, quarterly trends."
    )
    company_overview: str = Field(
        description="Company and competitive analysis in Markdown, 400-600 chars. "
        "Cover: business model, competitive moat, market positioning."
    )
    valuation_range: str = Field(
        description="Target price range narrative in Markdown, 300-500 chars. "
        "Bear/Base/Bull prices with plain-language explanation, "
        "upside/downside from current price, data source description, "
        "and what this means for the investor. "
        "Adapt tone based on target_price_inputs.source: "
        "analyst_consensus -> Wall Street consensus; "
        "analyst_consensus_thin -> analyst view with thin coverage caveat; "
        "multiples_fallback -> multiples-based estimate. "
        "If target_price_inputs unavailable, briefly explain why."
    )
    opportunities: str = Field(
        description="Investment opportunities in Markdown, 400-600 chars. "
        "Cover: near-term catalysts, medium-term drivers, long-term trends."
    )
    risks: str = Field(
        description="Risk factors in Markdown, 400-600 chars. "
        "Cover: business risks, financial risks, valuation risks."
    )
    investment_summary: str = Field(
        description="Investment summary in Markdown, 300-500 chars. "
        "Cover: core thesis in one sentence, bull/bear cases, key metrics to monitor."
    )


STOCK_ANALYST_INSTRUCTION = """
You are a senior equity research analyst at a top investment bank, writing insightful analysis for retail investors who may not be familiar with financial terminology.

## Core Rules

1. **Data accuracy is absolute** - every number must match the provided data. Never fabricate. If data is missing, say so.
2. **Write in Chinese (Simplified)**, but keep financial terms in English (P/E, ROE, EPS, FCF, etc.).
3. **Analysis framework**: Data -> Context -> So What? Every point must explain WHY it matters.
4. **Be opinionated**: Give clear judgments (expensive/cheap, strong/weak, improving/deteriorating).
5. **Use Markdown formatting**: Use **bold** for emphasis, bullet points for lists. Keep formatting clean and readable.

## Writing Style: Clear, Accessible, Opinionated

1. Conclusion first, data as evidence: state your judgment before supporting with numbers.
   Bad: "P/E is 35x, above industry average of 25x"
   Good: "Valuation is clearly expensive -- current P/E (price-to-earnings ratio) at 35x is 40% above peers"

2. Explain financial terms on first use with parenthetical definitions:
   "P/E (price-to-earnings ratio, how much investors pay per dollar of profit)"
   "ROE (return on equity, how efficiently the company generates profit from shareholders' money)"
   "FCF (free cash flow, the cash a company truly has at its disposal)"
   "EV/EBITDA (enterprise value multiple, commonly used to compare across companies)"

3. Control number density: cite 2-3 key metrics per subsection, pick the most telling ones.

4. Follow every fact with "this means":
   "Gross margin rose from 60% to 65% -- meaning the company's pricing power is strengthening, keeping more of every dollar earned"

5. Chinese is the primary language; keep financial acronyms in English (P/E, ROE, EPS, FCF, etc.).

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Must convey a clear investment stance.
Example: "NVDA: AI浪潮的最大赢家，但估值已透支未来三年增长"

### fundamentals_analysis (500-800 chars, Markdown)
Write a deep fundamentals analysis covering these three dimensions:

**1. Valuation Interpretation** (focus on valuation_comparison data)
- Current P/E, P/S, P/B, EV/EBITDA and other core valuation metrics (explain on first mention)
- **Historical comparison**: use valuation_comparison.historical_valuation data, state where current valuation sits historically
- **Peer comparison**: use valuation_comparison.peer_comparison data, compare with specific peer companies
- **Industry comparison**: use valuation_comparison.industry_averages data

**2. Growth Quality**
- Revenue and EPS growth rates and trends
- Is growth sustainable? One-time or structural?
- What drives the growth?

**3. Profitability**
- Gross margin, net margin, ROE, ROA (explain on first mention)
- Is profitability improving or deteriorating?
- How does it compare to peers?

### financials_analysis (600-1000 chars, Markdown)
Write a deep financial statements analysis covering these four dimensions:

**1. Revenue Quality**
- TTM revenue scale and YoY change
- Is revenue growth healthy?
- Quarterly revenue trend: accelerating, decelerating, or stable?

**2. Earnings Quality**
- Match between net income and operating cash flow
- Any receivables buildup or inventory issues?
- Are earnings mainly from core business?

**3. Balance Sheet Health**
- Debt ratio level and trend
- Are cash reserves sufficient?
- Any goodwill impairment or asset quality issues?

**4. Quarterly Trend**
- Key metrics trends over recent 2-4 quarters
- Any inflection points? Revenue acceleration/deceleration, margin expansion/contraction?

### company_overview (400-600 chars, Markdown)
Write a company and competitive analysis covering:

**Business Model**
- Explain what the company does and how it makes money in plain language
- Revenue sources and profit drivers

**Moat Analysis**
- Core competitive advantages (brand, technology, network effects, scale, switching costs, etc.)
- Are these advantages sustainable?

**Competitive Landscape**
- Who are the main competitors?
- Company's position in the industry? Market share trends?

### valuation_range (300-500 chars, Markdown)

Based on the provided target_price_inputs data, write an accessible target price analysis.
Adapt your framing based on `target_price_inputs.source`:

**When source is "analyst_consensus"** (>= 5 sell-side analysts):
- Frame as Wall Street consensus: "Based on N analysts covering this stock..."
- Mention the recommendation (buy/hold/sell) if available
- Note sell-side optimism bias: analysts tend to skew 10-15% bullish
- Bear = lowest analyst target, Base = median, Bull = highest

**When source is "analyst_consensus_thin"** (2-4 analysts):
- Same structure but note limited coverage: "Only N analysts cover this stock, so targets carry more uncertainty"

**When source is "multiples_fallback"** (no analyst coverage):
- Frame as multiples-based estimate: "Based on peer comparison and historical valuation..."
- Explain these are model-derived, not analyst opinions

**Structure (all sources)**:
1. One-sentence conclusion: "[stock] currently looks [expensive/fair/cheap] relative to [analyst targets / multiples]"
2. Three price levels:
   - Bear case $X (explain what scenario leads to this price)
   - Base case $Y (explain what this represents)
   - Bull case $Z (explain what conditions could reach this price)
3. Distance from current price: "Current price $W, [X% upside/downside] to base target"
4. Simple action guidance: "This means [current price has/lacks] margin of safety"

**If target_price_inputs is not available**:
Briefly explain why (e.g., "the company is not yet profitable, standard valuation methods don't apply"), and point to qualitative judgments in other sections.

**Important**: You MUST use the pre-computed numbers provided. Do NOT calculate your own target prices.

### opportunities (400-600 chars, Markdown)
Write an investment opportunity analysis covering three time horizons:

**Near-term Catalysts (0-6 months)**
- Upcoming earnings, product launches, policy changes
- Specific events that could trigger stock re-rating

**Medium-term Drivers (6-18 months)**
- Business expansion, market share gains, new product cycles
- Concrete paths to fundamental improvement

**Long-term Trends (1-3 years)**
- Structural industry growth opportunities
- Company strategic positioning and long-term competitiveness

### risks (400-600 chars, Markdown)
Write a risk analysis covering three categories:

**Business Risks**
- Intensifying competition, customer loss, technology disruption
- Specific threats to core business

**Financial Risks**
- Cash flow pressure, debt maturity, financing difficulty
- Potential balance sheet concerns

**Valuation Risks**
- How much growth is priced into current valuation?
- How much downside if growth disappoints?

### investment_summary (300-500 chars, Markdown)
Write a balanced investment summary covering:

**One-sentence Core Logic**
- Summarize the core reason or concern for investing in this stock in one sentence

**Bull vs Bear**
- Main bull arguments (2-3 points)
- Main bear arguments (2-3 points)

**Key Metrics to Monitor**
- Which metrics should investors watch to validate the thesis?
- What signals would change the investment view?
"""

stock_analyst_agent = LlmAgent(
    name="stock_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes individual stock fundamentals, provides investment insights in Chinese",
    instruction=STOCK_ANALYST_INSTRUCTION,
    output_schema=StockAnalysisOutput,
    output_key="analysis",
)


def _compute_target_price_inputs(
    fundamentals: Dict[str, Any],
    valuation_comparison: Dict[str, Any],
    current_price: float | None,
) -> Dict[str, Any] | None:
    """
    Pre-compute Bear/Base/Bull target prices using a tiered approach.

    Tier 1 (analysts >= 5): Use analyst consensus targets directly.
    Tier 2 (analysts 2-4): Use analyst targets, flag thin coverage.
    Tier 3 (analysts 0-1): Improved multiples fallback (peer + historical + industry P/E).

    Returns None if no method produces valid results.
    """
    analyst_targets = fundamentals.get("analyst_targets") or {}
    num_analysts = analyst_targets.get("number_of_analysts", 0) or 0
    target_median = analyst_targets.get("target_median")
    target_low = analyst_targets.get("target_low")
    target_high = analyst_targets.get("target_high")

    # --- Tier 1 & 2: Analyst consensus ---
    has_analyst_data = (
        num_analysts >= 2
        and target_median is not None
        and target_low is not None
        and target_high is not None
        and target_low > 0
    )

    if has_analyst_data:
        source = "analyst_consensus" if num_analysts >= 5 else "analyst_consensus_thin"
        result: Dict[str, Any] = {
            "source": source,
            "bear": round(target_low, 2),
            "base": round(target_median, 2),
            "bull": round(target_high, 2),
            "number_of_analysts": num_analysts,
        }
        rec = analyst_targets.get("recommendation")
        if rec:
            result["recommendation"] = rec
        if source == "analyst_consensus_thin":
            result["coverage_note"] = "only %d analysts cover this stock" % num_analysts

        if current_price and current_price > 0:
            result["current_price"] = round(current_price, 2)
            result["upside_to_base"] = round(
                (target_median - current_price) / current_price * 100, 1
            )
            result["upside_to_bull"] = round(
                (target_high - current_price) / current_price * 100, 1
            )
            result["downside_to_bear"] = round(
                (target_low - current_price) / current_price * 100, 1
            )

        return result

    # --- Tier 3: Multiples fallback ---
    forward_eps = fundamentals.get("forward_eps")
    if not isinstance(forward_eps, (int, float)) or forward_eps <= 0:
        return None

    implied_pe_values: list[float] = []
    method_details: list[Dict[str, Any]] = []

    # Method 1: Peer median P/E
    peer_data = valuation_comparison.get("peer_comparison", {})
    peers = peer_data.get("peers", [])
    peer_pes = [
        p.get("metrics", {}).get("pe_ratio")
        for p in peers
        if p.get("metrics", {}).get("pe_ratio") and p["metrics"]["pe_ratio"] > 0
    ]
    if peer_pes:
        peer_median_pe = statistics.median(peer_pes)
        implied_pe_values.append(peer_median_pe)
        method_details.append({
            "method": "peer_median_pe",
            "pe": round(peer_median_pe, 1),
            "target": round(peer_median_pe * forward_eps, 2),
            "peer_count": len(peer_pes),
        })

    # Method 2: 5-year historical median P/E
    historical = valuation_comparison.get("historical_valuation", {})
    years = historical.get("years", [])
    hist_pes = [
        y.get("pe") for y in years if y.get("pe") and y["pe"] > 0
    ]
    if hist_pes:
        hist_median_pe = statistics.median(hist_pes)
        implied_pe_values.append(hist_median_pe)
        method_details.append({
            "method": "historical_median_pe",
            "pe": round(hist_median_pe, 1),
            "target": round(hist_median_pe * forward_eps, 2),
            "years_used": len(hist_pes),
        })

    # Method 3: Industry average P/E (replaces PEG=1)
    industry_val = valuation_comparison.get("industry_valuation", {})
    industry_pe = industry_val.get("industry_pe")
    if industry_pe and industry_pe > 0:
        implied_pe_values.append(industry_pe)
        method_details.append({
            "method": "industry_avg_pe",
            "pe": round(industry_pe, 1),
            "target": round(industry_pe * forward_eps, 2),
            "industry": industry_val.get("industry", ""),
        })

    if len(implied_pe_values) < 2:
        return None

    # Compute Bear / Base / Bull using discount/premium on base
    targets = [pe * forward_eps for pe in implied_pe_values]
    base = statistics.median(targets)
    bear = round(base * 0.85, 2)
    bull = round(base * 1.20, 2)

    result = {
        "source": "multiples_fallback",
        "bear": bear,
        "base": round(base, 2),
        "bull": bull,
        "forward_eps": round(forward_eps, 4),
        "methods_used": len(method_details),
        "methods": method_details,
    }

    if current_price and current_price > 0:
        result["current_price"] = round(current_price, 2)
        result["upside_to_base"] = round((base - current_price) / current_price * 100, 1)
        result["upside_to_bull"] = round((bull - current_price) / current_price * 100, 1)
        result["downside_to_bear"] = round((bear - current_price) / current_price * 100, 1)

    return result


def _prepare_stock_data_for_analyst(stock_data: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and reduce stock data for optimal token usage."""
    profile = stock_data.get("profile", {})
    quote = stock_data.get("quote", {})
    fundamentals = stock_data.get("fundamentals", {})
    financials = stock_data.get("financials", {})
    valuation_comparison = stock_data.get("valuation_comparison", {})

    def clean_dict(d: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in d.items() if v is not None and v != 0}

    clean_profile = {
        "symbol": profile.get("symbol") or stock_data.get("meta", {}).get("symbol"),
        "company_name": profile.get("company_name"),
        "company_name_zh": profile.get("company_name_zh"),
        "sector": profile.get("classification", {}).get("sector"),
        "industry": profile.get("classification", {}).get("industry"),
        "description_en": profile.get("description", {}).get("en", "")[:500],
        "description_zh": profile.get("description", {}).get("zh", "")[:500],
        "employees": profile.get("company_details", {}).get("employees"),
        "ipo_date": profile.get("company_details", {}).get("ipo_date"),
    }

    clean_quote = {
        "price": quote.get("price"),
        "change_percent": quote.get("change_percent"),
        "market_cap": quote.get("market_cap"),
        "volume": quote.get("volume"),
        "week_52_high": quote.get("week_52_high"),
        "week_52_low": quote.get("week_52_low"),
    }

    analyst_targets = fundamentals.get("analyst_targets", {})

    clean_fundamentals = {
        "ttm": fundamentals.get("ttm", {}),
        "valuation": fundamentals.get("valuation", {}),
        "growth": fundamentals.get("growth", {}),
        "profitability": fundamentals.get("profitability", {}),
        "analyst_targets": analyst_targets if analyst_targets else None,
    }

    clean_quarters = []
    for q in financials.get("quarters", [])[:4]:
        income = q.get("income_statement", {})
        clean_quarters.append({
            "period": q.get("period"),
            "fiscal_quarter": q.get("fiscal_quarter"),
            "revenue": income.get("revenue"),
            "net_income": income.get("net_income"),
            "eps": income.get("eps"),
            "gross_margin": income.get("gross_profit_margin"),
            "operating_margin": income.get("operating_income_margin"),
        })

    clean_valuation_comparison = {}

    historical = valuation_comparison.get("historical_valuation", {})
    years_data = historical.get("years", [])
    if years_data:
        sorted_years = sorted(years_data, key=lambda y: y.get("year", ""), reverse=True)[:5]
        clean_years = [
            cleaned for y in sorted_years
            if (cleaned := clean_dict({
                "year": y.get("year"), "pe": y.get("pe"),
                "pb": y.get("pb"), "ps": y.get("ps"),
            })).get("year")
        ]
        if clean_years:
            clean_valuation_comparison["historical_valuation"] = clean_years

    peer_data = valuation_comparison.get("peer_comparison", {})
    peers = peer_data.get("peers", [])
    if peers:
        clean_peers = []
        for p in peers[:5]:
            metrics = p.get("metrics", {})
            peer_entry = clean_dict({
                "symbol": p.get("symbol"),
                "pe_ratio": metrics.get("pe_ratio"),
                "pb_ratio": metrics.get("pb_ratio"),
                "ps_ratio": metrics.get("ps_ratio"),
                "roe": metrics.get("roe"),
            })
            if peer_entry.get("symbol") and len(peer_entry) > 1:
                clean_peers.append(peer_entry)
        if clean_peers:
            clean_valuation_comparison["peer_comparison"] = clean_peers

    industry_val = valuation_comparison.get("industry_valuation", {})
    industry_pe = industry_val.get("industry_pe")
    sector_pe = industry_val.get("sector_pe")
    if industry_pe or sector_pe:
        industry_averages = {}
        if industry_pe:
            industry_averages["industry"] = industry_val.get("industry")
            industry_averages["industry_pe"] = industry_pe
        if sector_pe:
            industry_averages["sector"] = industry_val.get("sector")
            industry_averages["sector_pe"] = sector_pe
        clean_valuation_comparison["industry_averages"] = industry_averages

    result = {
        "profile": clean_profile,
        "quote": clean_quote,
        "fundamentals": clean_fundamentals,
        "financials": {
            "latest_quarter": financials.get("latest_quarter"),
            "quarters": clean_quarters,
        },
    }

    if clean_valuation_comparison:
        result["valuation_comparison"] = clean_valuation_comparison

    # Pre-compute target price inputs for the Agent
    target_price_inputs = _compute_target_price_inputs(
        fundamentals=stock_data.get("fundamentals", {}),
        valuation_comparison=valuation_comparison,
        current_price=quote.get("price"),
    )
    if target_price_inputs:
        result["target_price_inputs"] = target_price_inputs

    return result


class StockAnalysisAgent:
    """Runs the stock analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(agent=stock_analyst_agent, app_name="stock_analysis")

    async def analyze(self, stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI analysis for a stock. Returns dict with analysis and metadata."""
        symbol = stock_data.get("meta", {}).get("symbol", "UNKNOWN")

        try:
            logger.info("Starting analysis for %s", symbol)
            data_for_analyst = _prepare_stock_data_for_analyst(stock_data)

            prompt = (
                "Please analyze the following stock data and provide a comprehensive analysis:\n\n"
                f"{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_analysis", prompt, "analysis"
            )

            result = {field: analysis_data.get(field, "") for field in ANALYSIS_FIELDS}

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
            logger.exception("Error analyzing stock %s", symbol)

            return {
                "analysis": _empty_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_stock_analysis_agent: Optional[StockAnalysisAgent] = None


def get_stock_analysis_agent() -> StockAnalysisAgent:
    global _stock_analysis_agent
    if _stock_analysis_agent is None:
        _stock_analysis_agent = StockAnalysisAgent()
    return _stock_analysis_agent
