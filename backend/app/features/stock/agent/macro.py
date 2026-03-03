"""
Macro-Sector Agent - Macro environment and sector positioning analysis.

Generates structured analysis covering macro impact, sector positioning,
market regime, and outlook/risks from a macro perspective.
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

MACRO_SECTOR_FIELDS = (
    "title",
    "macro_impact",
    "sector_positioning",
    "market_regime",
    "outlook_and_risks",
)


def _empty_macro_analysis() -> Dict[str, str]:
    return {field: "" for field in MACRO_SECTOR_FIELDS}


class MacroSectorOutput(BaseModel):
    """Macro-sector context analysis output: macro environment impact on individual stock."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. "
        "Example: '利率高位 + 科技板块强势 = NVDA 的宏观甜点期'"
    )
    macro_impact: str = Field(
        description="How current interest rates, inflation, GDP affect this specific company, "
        "500-800 chars Markdown. Be specific (e.g., 'Fed funds rate at 5.25% means PE 60x company "
        "could see 10-15% valuation compression if 10Y yield rises another 50bp'), not generic."
    )
    sector_positioning: str = Field(
        description="Stock's position within its sector: leading, following, or lagging, "
        "400-600 chars Markdown. Include sector recent performance and tailwinds/headwinds."
    )
    market_regime: str = Field(
        description="Current market state: Fear & Greed level, VIX level, risk-on/off, "
        "what this means for this stock's risk/reward, 300-500 chars Markdown."
    )
    outlook_and_risks: str = Field(
        description="Macro outlook for next 3-6 months: Fed path, fiscal policy, "
        "geopolitical risks, what macro events to watch for this stock, "
        "300-500 chars Markdown."
    )


MACRO_SECTOR_INSTRUCTION = """
You are a macro strategist specializing in translating macroeconomic trends into individual stock impacts.

## Core Rules

1. **Be specific, not generic** - Don't say "higher rates are bad for growth stocks". Say exactly HOW current rates affect THIS company's valuation, cost of capital, or demand. Use ACTUAL numbers from the data (e.g., "Fed Funds Rate at 4.33%, 10Y yield at 4.25%").
2. **Write in Chinese (Simplified)**, keep financial terms in English (Fed, VIX, P/E, DXY, etc.).
3. **Quantify when possible**: Use the actual numbers from macro data (risk scores, VIX levels, rates, commodity prices, DXY).
4. **Conclusion first**: State the macro verdict for this stock before explaining why.
5. **Use Markdown formatting**: **bold** for emphasis, bullet points for lists.
6. **Cross-asset awareness**: Connect dots between rates, dollar, commodities, and this stock. For example: strong dollar -> export headwinds, rising oil -> cost pressure for transport companies, gold rally -> risk-off signal.

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Capture the macro narrative for this stock.

### macro_impact (500-800 chars, Markdown)
How current macro environment specifically affects this company:
- **Interest rate impact**: Use actual rates from `rates_snapshot` (Fed Funds Rate, 10Y yield, Real Rate). Calculate specific effects: "10Y at X% means this company's DCF discount rate implies Y% fair value change"
- **Inflation impact**: Use actual CPI/Core PCE data from `inflation_snapshot`. How does current inflation affect this company's input costs vs pricing power?
- **Growth impact**: GDP/economic growth connection to this company's revenue. Use recession probability, CFNAI data.
- **Cross-asset linkages**: If `cross_asset` data is available, connect DXY/oil/gold/copper to this specific company (e.g., strong dollar hurts overseas revenue for exporters; rising copper signals industrial demand for manufacturers)

### sector_positioning (400-600 chars, Markdown)
- How is this stock's sector performing? (from sector_digest if available)
- Is this company leading, matching, or lagging its sector?
- What sector-specific tailwinds or headwinds exist?
- If no sector data available, use profile sector/industry to provide general sector context

### market_regime (300-500 chars, Markdown)
- Use Fear & Greed data (overall score AND sub-components like Put/Call ratio, market breadth, safe haven demand) to paint a nuanced picture
- VIX level and what it means for THIS stock's typical volatility (high-beta stock in high-VIX = amplified risk)
- IMPORTANT: Do NOT just repeat generic VIX/F&G numbers. Explain what this regime specifically means for THIS company's risk/reward. A defensive stock (KO) in risk-off mode is very different from a growth stock (TSLA) in risk-off mode.

### outlook_and_risks (300-500 chars, Markdown)
- 3-6 month macro outlook: Use actual Fed Funds Rate to discuss rate path expectations
- Key macro risks: geopolitical, policy changes, economic slowdown
- **Stock-specific macro watchlist**: Don't just say "watch NFP and CPI". Say what SPECIFIC data releases matter most for THIS stock (e.g., for TSLA: "auto loan rates, consumer confidence, EV subsidy policy"; for NVDA: "hyperscaler CapEx guidance, AI chip export controls")
- One clear recommendation on macro positioning
"""

macro_sector_agent = LlmAgent(
    name="macro_sector_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes macro environment and sector positioning impact on individual stocks in Chinese",
    instruction=MACRO_SECTOR_INSTRUCTION,
    output_schema=MacroSectorOutput,
    output_key="macro_analysis",
)


def _to_dict(obj: Any) -> Dict[str, Any]:
    """Convert Pydantic model or dict to dict."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, dict):
        return obj
    return {}


def _prepare_macro_sector_context(
    macro_dashboard: Optional[Any],
    market_sentiment: Optional[Any],
    sector_digest: Optional[Dict[str, Any]],
    profile: Dict[str, Any],
    inflation_rates: Optional[Any] = None,
    treasury_commodities: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Prepare macro and sector context data for the agent. Returns None if no useful data."""
    result: Dict[str, Any] = {}

    # ── 1. Macro risk dashboard ──
    # Structure: composite_score, composite_level, categories (list of category dicts)
    if macro_dashboard:
        dashboard_dict = _to_dict(macro_dashboard)
        composite_score = dashboard_dict.get("composite_score")
        categories_list = dashboard_dict.get("categories", [])

        if composite_score is not None:
            result["macro_risk"] = {
                "composite_score": composite_score,
                "composite_level": dashboard_dict.get("composite_level"),
                "categories": {
                    cat.get("category_name", "cat_%d" % i): {
                        "score": cat.get("risk_score"),
                        "level": cat.get("risk_level"),
                        "headline": cat.get("headline"),
                    }
                    for i, cat in enumerate(categories_list)
                    if isinstance(cat, dict)
                },
            }

        # Extract key economic indicators from category indicators
        economic_data: Dict[str, Any] = {}
        for cat in categories_list:
            if not isinstance(cat, dict):
                continue
            for ind in cat.get("indicators", []):
                if not isinstance(ind, dict):
                    continue
                series_id = ind.get("series_id", "")
                value = ind.get("value")
                if value is None:
                    continue
                if series_id in ("T10Y2Y", "UMCSENT", "CFNAI", "RECPROUSM156N"):
                    economic_data[ind.get("name", series_id)] = value
        if economic_data:
            result["economic_data"] = economic_data

    # ── 2. Market sentiment (Fear & Greed + VIX + sub-components) ──
    # Structure: overall_score, overall_level, overall_headline, sub_dimensions (list)
    if market_sentiment:
        sentiment_dict = _to_dict(market_sentiment)
        overall_score = sentiment_dict.get("overall_score")
        if overall_score is not None:
            sentiment_out: Dict[str, Any] = {
                "overall_score": overall_score,
                "overall_level": sentiment_dict.get("overall_level"),
                "headline": sentiment_dict.get("overall_headline"),
            }

            for sub in sentiment_dict.get("sub_dimensions", []):
                if not isinstance(sub, dict):
                    continue
                sub_name = sub.get("name", "")

                if sub_name == "cnn_indicators":
                    sentiment_out["fear_greed_headline"] = sub.get("headline")
                    sentiment_out["fear_greed_score"] = sub.get("score")
                    # Extract individual F&G sub-components for richer analysis
                    fg_components = {}
                    for ind in sub.get("indicators", []):
                        if not isinstance(ind, dict):
                            continue
                        ind_name = ind.get("name", "")
                        ind_value = ind.get("value")
                        if ind_name and ind_value is not None:
                            fg_components[ind_name] = ind_value
                    if fg_components:
                        sentiment_out["fear_greed_components"] = fg_components

                elif sub_name == "volatility":
                    sentiment_out["volatility_headline"] = sub.get("headline")
                    for ind in sub.get("indicators", []):
                        if isinstance(ind, dict):
                            sid = ind.get("series_id", "")
                            if sid == "VIX":
                                sentiment_out["vix"] = ind.get("value")
                            elif sid == "VVIX":
                                sentiment_out["vvix"] = ind.get("value")

                elif sub_name == "breadth_options":
                    for ind in sub.get("indicators", []):
                        if isinstance(ind, dict):
                            sid = ind.get("series_id", "")
                            if sid == "BREADTH":
                                sentiment_out["market_breadth"] = ind.get("value")
                            elif sid == "PCCE":
                                sentiment_out["put_call_ratio"] = ind.get("value")

            result["market_sentiment"] = sentiment_out

    # ── 3. Inflation & Rates snapshot ──
    # Structure: EconomicFundamentals with sub_dimensions: inflation, rates
    if inflation_rates:
        ir_dict = _to_dict(inflation_rates)
        rates_snapshot: Dict[str, Any] = {}
        inflation_snapshot: Dict[str, Any] = {}

        for sub in ir_dict.get("sub_dimensions", []):
            if not isinstance(sub, dict):
                continue
            sub_name = sub.get("name", "")
            for ind in sub.get("indicators", []):
                if not isinstance(ind, dict):
                    continue
                series_id = ind.get("series_id", "")
                value = ind.get("value")
                name = ind.get("name", series_id)
                if value is None:
                    continue

                if sub_name == "rates":
                    # Fed Funds Rate, 10Y Treasury, Real 10Y Rate
                    rates_snapshot[name] = value
                elif sub_name == "inflation":
                    # CPI, Core PCE, 5Y inflation expectations
                    inflation_snapshot[name] = value

        if rates_snapshot:
            result["rates_snapshot"] = rates_snapshot
        if inflation_snapshot:
            result["inflation_snapshot"] = inflation_snapshot

    # ── 4. Cross-asset data (DXY, commodities, treasury curve) ──
    if treasury_commodities and isinstance(treasury_commodities, dict):
        cross_asset: Dict[str, Any] = {}

        # Dollar index
        dollar = treasury_commodities.get("dollar")
        if isinstance(dollar, dict) and dollar.get("price") is not None:
            cross_asset["dxy"] = {
                "price": dollar.get("price"),
                "change_percent": dollar.get("change_percent"),
            }

        # Commodities (gold, oil, copper)
        commodities = treasury_commodities.get("commodities", {})
        if isinstance(commodities, dict):
            commodity_names = {
                "GCUSD": "gold",
                "BZUSD": "oil_brent",
                "HGUSD": "copper",
            }
            for ticker, label in commodity_names.items():
                c = commodities.get(ticker)
                if isinstance(c, dict) and c.get("price") is not None:
                    cross_asset[label] = {
                        "price": c.get("price"),
                        "change_percent": c.get("changePercent") or c.get("change_percent"),
                    }

        # Key treasury yields (10Y, 2Y for curve context)
        treasury = treasury_commodities.get("treasury", {})
        if isinstance(treasury, dict):
            rates_map = treasury.get("rates", {})
            if isinstance(rates_map, dict):
                for tenor in ("2Y", "10Y", "30Y"):
                    t = rates_map.get(tenor)
                    if isinstance(t, dict) and t.get("yield") is not None:
                        cross_asset["treasury_%s" % tenor] = {
                            "yield": t.get("yield"),
                            "change_bp": t.get("change_bp"),
                        }

        if cross_asset:
            result["cross_asset"] = cross_asset

    # ── 5. Sector digest ──
    if sector_digest:
        digest_dict = _to_dict(sector_digest)
        result["sector_digest"] = {
            "sector_name": digest_dict.get("sector_name"),
            "summary": (digest_dict.get("summary") or "")[:500],
            "stocks": [
                {
                    "symbol": s.get("symbol"),
                    "change_percent": s.get("change_percent"),
                    "analysis": (s.get("analysis") or "")[:100],
                }
                for s in (digest_dict.get("stocks") or [])[:8]
            ],
        }

    # ── 6. Company profile (always include) ──
    classification = profile.get("classification", {})
    result["company_profile"] = {
        "sector": classification.get("sector"),
        "industry": classification.get("industry"),
    }

    return result if result else None


class MacroSectorAgent:
    """Runs the macro-sector context agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=macro_sector_agent, app_name="stock_macro_sector"
        )

    async def analyze(
        self,
        symbol: str,
        macro_context: Dict[str, Any],
        quote_snapshot: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate AI macro-sector analysis. Returns dict with analysis and metadata."""
        try:
            logger.info("Starting macro-sector analysis for %s", symbol)

            data_for_agent = {
                "symbol": symbol,
                **macro_context,
                "quote_snapshot": quote_snapshot,
            }

            prompt = (
                f"Please analyze the macro environment and sector positioning for {symbol} "
                f"and provide a comprehensive macro-sector assessment:\n\n"
                f"{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_macro_sector", prompt, "macro_analysis"
            )

            result = {field: analysis_data.get(field, "") for field in MACRO_SECTOR_FIELDS}

            logger.info(
                "Macro analysis complete for %s. Title: %s...",
                symbol,
                result["title"][:30] if result["title"] else "N/A",
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
            logger.exception("Error analyzing macro for %s", symbol)

            return {
                "analysis": _empty_macro_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_macro_sector_agent: Optional[MacroSectorAgent] = None


def get_macro_sector_agent() -> MacroSectorAgent:
    global _macro_sector_agent
    if _macro_sector_agent is None:
        _macro_sector_agent = MacroSectorAgent()
    return _macro_sector_agent
