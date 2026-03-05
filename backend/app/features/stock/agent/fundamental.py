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
    "company_profile",
    "financial_health",
    "valuation_judgment",
    "catalysts_and_risks",
    "investment_summary",
)


def _empty_analysis() -> Dict[str, str]:
    return {field: "" for field in ANALYSIS_FIELDS}


class StockAnalysisOutput(BaseModel):
    """V5 research report structure: 5 dimensions for comprehensive equity analysis."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars, clear investment stance."
    )
    company_profile: str = Field(
        description="Company profile analysis in Markdown, 500-800 chars. "
        "Cover: what the company does and how it makes money (plain language), "
        "core competitive advantages (moat), market positioning and competitive landscape, "
        "key growth drivers. Write like explaining to a friend who knows nothing about this company."
    )
    financial_health: str = Field(
        description="Financial health check in Markdown, 800-1200 chars. "
        "Must cover these 4 sub-dimensions with data evidence: "
        "1) Revenue & Growth: TTM revenue scale, YoY growth, quarterly trend (accelerating/decelerating). "
        "2) Profitability: gross margin, operating margin, net margin, ROE -- are they improving? How vs peers? "
        "3) Cash Flow Quality: operating cash flow vs net income match, free cash flow strength, "
        "capex intensity (R&D if tech company). "
        "4) Balance Sheet: debt level, current ratio, cash reserves. "
        "Fuse numbers with interpretation -- every metric must answer 'so what?'"
    )
    valuation_judgment: str = Field(
        description="Valuation judgment in Markdown, 600-900 chars. "
        "Must cover: "
        "1) Current valuation multiples (P/E, P/S, P/B, EV/EBITDA) with plain-language explanation. "
        "2) Historical comparison: where does current valuation sit vs 5-year history? Expensive or cheap? "
        "3) Peer comparison: how does it compare to industry peers? Premium or discount? Justified? "
        "4) Target price range: adapt framing based on target_price_inputs.source "
        "(analyst_consensus -> Wall Street consensus with analyst count; "
        "analyst_consensus_thin -> limited coverage caveat; "
        "multiples_fallback -> model-based estimate). "
        "Bear/Base/Bull prices with upside/downside from current. "
        "If target_price_inputs unavailable, explain why. "
        "Important: use pre-computed numbers, do NOT calculate your own targets."
    )
    catalysts_and_risks: str = Field(
        description="Catalysts and risks analysis in Markdown, 600-900 chars. "
        "Structure as two clear sections: "
        "**Catalysts** (bullish factors): near-term events (0-6mo, e.g. earnings, product launches), "
        "medium-term drivers (6-18mo, e.g. market share gains, new cycles), "
        "long-term trends (1-3yr, e.g. structural industry growth). "
        "**Risks** (bearish factors): business risks (competition, disruption), "
        "financial risks (cash flow, debt), valuation risks (how much growth is priced in). "
        "Be specific and actionable, not generic."
    )
    investment_summary: str = Field(
        description="Investment summary in Markdown, 300-500 chars. "
        "1) One-sentence core thesis: the single most important reason to watch this stock. "
        "2) Bull case summary (2-3 points). "
        "3) Bear case summary (2-3 points). "
        "4) Key metrics to monitor: which numbers should investors watch? "
        "What signals would change the investment view?"
    )


STOCK_ANALYST_INSTRUCTION = """
You are a senior equity research analyst writing a concise research report for retail investors. Your goal: a reader should understand 80-90% of this company after reading your report.

## Core Rules

1. **Data accuracy is absolute** - every number must match the provided data. Never fabricate. If data is missing, say so.
2. **Write in Chinese (Simplified)**, but keep financial terms in English (P/E, ROE, EPS, FCF, etc.).
3. **Analysis framework**: Judgment first -> Data evidence -> So What? Every point must explain WHY it matters to an investor.
4. **Be opinionated**: Give clear judgments (expensive/cheap, strong/weak, improving/deteriorating). No fence-sitting.
5. **Use Markdown formatting**: Use **bold** for emphasis, bullet points for lists. Keep formatting clean and readable.
6. **Do NOT give buy/sell/hold ratings or scores.** Present facts and analysis, let the investor decide.

## Writing Style

1. **Conclusion first**: State your judgment, then support with 2-3 key numbers.
   Bad: "P/E is 35x, above industry average of 25x"
   Good: "估值明显偏贵 -- 当前 P/E 35x 比同行高出 40%"

2. **Explain terms on first use**: "P/E (市盈率, 投资者为每一元利润支付的价格)"

3. **Number density**: Max 2-3 metrics per paragraph. Pick the most telling ones.

4. **"This means" rule**: Every fact must answer "so what?"
   "毛利率从 60% 升至 65% -- 说明公司定价权在增强"

## Output Fields (5 Dimensions)

### title
One opinionated sentence, 15-40 Chinese characters. Must convey a clear investment stance.
Example: "NVDA: AI浪潮的最大赢家, 但估值已透支未来三年增长"

### company_profile (500-800 chars, Markdown)
Write like explaining this company to a smart friend who knows nothing about it:

1. **What it does**: Explain the business model and how it makes money in plain language. What products/services? Who are the customers?
2. **Competitive moat**: What are its core advantages? (brand, technology, network effects, scale, switching costs, etc.) Are they sustainable?
3. **Market position**: Who are the main competitors? Is the company gaining or losing market share?
4. **Growth engine**: What is driving the company's growth right now? Is it structural or cyclical?

### financial_health (800-1200 chars, Markdown)
A comprehensive financial check-up covering 4 sub-dimensions. Fuse data with interpretation.

**Revenue & Growth**
- TTM revenue scale and YoY growth rate
- Quarterly revenue trend: accelerating, stable, or decelerating?
- Is growth organic or acquisition-driven?

**Profitability**
- Gross margin (定价权), operating margin (经营效率), net margin (最终盈利)
- ROE (股东资金回报效率) -- is it above 15%? Trend?
- Compare to industry peers where relevant

**Cash Flow Quality**
- Does operating cash flow match or exceed net income? (If OCF << Net Income, earnings quality is questionable)
- Free cash flow strength: can the company fund growth without diluting shareholders?
- R&D or capex intensity if relevant (especially for tech companies)

**Balance Sheet**
- Debt level: total debt / equity ratio, is it manageable?
- Cash reserves: how many quarters of operating expenses can cash cover?
- Any red flags (goodwill impairment risk, receivables buildup)?

### valuation_judgment (600-900 chars, Markdown)
Help the reader decide if the current price is reasonable:

**Current Multiples** (explain each on first use)
- P/E, P/S, P/B, EV/EBITDA -- which ones are most relevant for this company and why?

**Historical Context**
- Where does current valuation sit vs 5-year range? Near highs, lows, or average?
- Use valuation_comparison.historical_valuation data

**Peer Context**
- How does valuation compare to direct competitors?
- Is any premium/discount justified by growth or quality differences?
- Use valuation_comparison.peer_comparison data

**Target Price Range** (based on target_price_inputs data)
Adapt framing based on source:
- analyst_consensus (>= 5 analysts): "华尔街 N 位分析师共识..." + note optimism bias
- analyst_consensus_thin (2-4): note limited coverage
- multiples_fallback: "基于估值模型估算..."
- Bear/Base/Bull prices with upside/downside from current price
- If unavailable, explain why

**Important**: Use pre-computed target_price_inputs numbers. Do NOT calculate your own.

### catalysts_and_risks (600-900 chars, Markdown)
Two clearly separated sections:

**Catalysts (看涨因素)**
- Near-term (0-6mo): upcoming earnings, product launches, policy changes
- Medium-term (6-18mo): market share gains, new product cycles, business expansion
- Long-term (1-3yr): structural industry trends, strategic positioning
- Be specific: name dates, products, or events where possible

**Risks (看跌因素)**
- Business risks: competition intensifying, technology disruption, customer concentration
- Financial risks: cash flow pressure, debt maturity, margin compression
- Valuation risks: how much growth is priced in? What happens if growth disappoints?
- Be specific, not generic

### investment_summary (300-500 chars, Markdown)
A balanced conclusion:

1. **Core thesis** in one sentence: the single most important thing about this stock
2. **Bull case** (2-3 points): what goes right
3. **Bear case** (2-3 points): what goes wrong
4. **Key metrics to watch**: which 2-3 numbers should investors track? What signals would change the outlook?
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
        "balance_sheet": fundamentals.get("balance_sheet", {}),
        "market_data": fundamentals.get("market_data", {}),
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
