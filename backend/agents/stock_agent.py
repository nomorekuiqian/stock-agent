"""
Stock Analysis Agent - Individual stock AI analysis.

Python fetches data via StockService, then the Analyst Agent generates
structured analysis (V3 flat string fields).
"""

import json
import os
import traceback
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field

from app.utils.timezone import now_iso

ANALYSIS_FIELDS = (
    "title",
    "fundamentals_analysis",
    "financials_analysis",
    "company_overview",
    "opportunities",
    "risks",
    "investment_summary",
)


def _empty_analysis() -> Dict[str, str]:
    """Return an empty analysis dict with all expected fields."""
    return {field: "" for field in ANALYSIS_FIELDS}


class StockAnalysisOutput(BaseModel):
    """V3 flat structure: each field is a single coherent paragraph of analysis."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars, clear investment stance."
    )
    fundamentals_analysis: str = Field(
        description="Fundamentals analysis, 300-500 chars. "
        "Cite valuation, growth, profitability data with causal reasoning."
    )
    financials_analysis: str = Field(
        description="Financial statements analysis, 300-500 chars. "
        "Analyze TTM/quarterly revenue trends, earnings quality, cash flow."
    )
    company_overview: str = Field(
        description="Company overview, 200-400 chars. "
        "Positioning, business model, competitive landscape."
    )
    opportunities: str = Field(
        description="Investment opportunities, 200-300 chars. 2-3 core catalysts."
    )
    risks: str = Field(
        description="Risk factors, 200-300 chars. 2-3 material risks."
    )
    investment_summary: str = Field(
        description="Investment summary, 150-300 chars. "
        "Bull/bear synthesis with balanced view."
    )


STOCK_ANALYST_INSTRUCTION = """
You are a senior equity research analyst writing for retail investors who want to quickly understand a stock.

## Core Rules

1. **Data accuracy is absolute** - every number must match the provided data. Never fabricate. If data is missing, say so.
2. **Write in Chinese (Simplified)**, but keep financial terms in English (P/E, ROE, EPS, FCF, etc.).
3. **Analysis framework**: Data -> Context -> Inference. Every paragraph must follow this chain.
4. **Minimum depth**: Each field must contain at least 3 substantive sentences. No shallow one-liners.
5. **Be opinionated**: Give clear judgments (expensive/cheap, strong/weak, improving/deteriorating).

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Must include a clear stance.

### fundamentals_analysis
Comprehensive analysis of fundamentals based on ALL provided data (valuation, growth, profitability).
Write as one coherent paragraph, 300-500 characters:
- Cite specific valuation multiples (P/E, P/S, P/B, EV/EBITDA) and assess whether they are justified
- Cite growth rates (revenue YoY, EPS YoY, net income YoY) and assess the trajectory
- Cite profitability metrics (gross margin, net margin, ROE, ROA) and assess earnings quality
- Connect these dimensions: e.g., high growth justifying high valuation, or margin expansion driving earnings growth

### financials_analysis
Comprehensive analysis of financial statements based on ALL provided data (TTM, quarterly).
Write as one coherent paragraph, 300-500 characters:
- Cite TTM figures (revenue, net income, EBITDA, cash flow) to assess financial scale and health
- Analyze quarterly trends: are revenues accelerating or decelerating? Is margin expanding or compressing?
- Assess cash flow quality: operating cash flow vs net income, free cash flow generation
- Highlight any notable changes or inflection points in recent quarters

### company_overview
Company positioning and business model analysis, 200-400 characters:
- What the company does in plain language
- Core competitive advantages (moat)
- Industry positioning and market share context

### opportunities
Investment opportunity analysis, 200-300 characters:
- Identify 2-3 core catalysts or growth drivers
- Mix of near-term (0-6 months) and longer-term opportunities
- Explain why each matters for the stock price

### risks
Risk factor analysis, 200-300 characters:
- Identify 2-3 most material risks
- Focus on risks that could meaningfully impact the investment thesis
- Be specific, not generic

### investment_summary
Balanced investment view, 150-300 characters:
- Synthesize the bull case and bear case
- Identify key metrics to watch going forward
- Provide a balanced conclusion
"""

stock_analyst_agent = LlmAgent(
    name="stock_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes individual stock fundamentals, provides investment insights in Chinese",
    instruction=STOCK_ANALYST_INSTRUCTION,
    output_schema=StockAnalysisOutput,
    output_key="analysis",
)


def _prepare_stock_data_for_analyst(stock_data: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and reduce stock data for optimal token usage."""
    profile = stock_data.get("profile", {})
    quote = stock_data.get("quote", {})
    fundamentals = stock_data.get("fundamentals", {})
    financials = stock_data.get("financials", {})

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

    clean_fundamentals = {
        "ttm": fundamentals.get("ttm", {}),
        "valuation": fundamentals.get("valuation", {}),
        "growth": fundamentals.get("growth", {}),
        "profitability": fundamentals.get("profitability", {}),
    }

    quarters = financials.get("quarters", [])[:4]
    clean_quarters = []
    for q in quarters:
        clean_q = {
            "period": q.get("period"),
            "fiscal_quarter": q.get("fiscal_quarter"),
            "revenue": q.get("income_statement", {}).get("revenue"),
            "net_income": q.get("income_statement", {}).get("net_income"),
            "eps": q.get("income_statement", {}).get("eps"),
            "gross_margin": q.get("income_statement", {}).get("gross_profit_margin"),
            "operating_margin": q.get("income_statement", {}).get("operating_income_margin"),
        }
        clean_quarters.append(clean_q)

    return {
        "profile": clean_profile,
        "quote": clean_quote,
        "fundamentals": clean_fundamentals,
        "financials": {
            "latest_quarter": financials.get("latest_quarter"),
            "quarters": clean_quarters,
        },
    }


class StockAnalysisAgent:
    """Runs the stock analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(agent=stock_analyst_agent, app_name="stock_analysis")

    async def analyze(self, stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI analysis for a stock. Returns dict with analysis and metadata."""
        symbol = stock_data.get("meta", {}).get("symbol", "UNKNOWN")

        try:
            print(f"[StockAnalysisAgent] Starting analysis for {symbol}")
            data_for_analyst = _prepare_stock_data_for_analyst(stock_data)

            session = await self.runner.session_service.create_session(
                app_name="stock_analysis", user_id="analyst"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following stock data and provide a comprehensive analysis:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                pass

            session_data = await self.runner.session_service.get_session(
                app_name="stock_analysis", user_id="analyst", session_id=session.id
            )

            analysis_data = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                analysis_data = state.get("analysis", {})
                if isinstance(analysis_data, str):
                    try:
                        analysis_data = json.loads(analysis_data)
                    except json.JSONDecodeError:
                        analysis_data = {}

            # Clean up session to prevent memory leak (InMemoryRunner stores all sessions)
            try:
                await self.runner.session_service.delete_session(
                    app_name="stock_analysis", user_id="analyst", session_id=session.id
                )
            except Exception:
                pass

            result = {field: analysis_data.get(field, "") for field in ANALYSIS_FIELDS}

            print(
                f"[StockAnalysisAgent] Analysis complete for {symbol}. "
                f"Title: {result['title'][:30] if result['title'] else 'N/A'}..."
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            print(f"[StockAnalysisAgent] Error analyzing stock: {e}")
            traceback.print_exc()

            return {
                "analysis": _empty_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


# Singleton instance
_stock_analysis_agent: Optional[StockAnalysisAgent] = None


def get_stock_analysis_agent() -> StockAnalysisAgent:
    """Get or create the StockAnalysisAgent singleton."""
    global _stock_analysis_agent
    if _stock_analysis_agent is None:
        _stock_analysis_agent = StockAnalysisAgent()
    return _stock_analysis_agent
