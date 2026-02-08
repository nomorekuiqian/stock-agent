"""
Weekly Report Agent - AI-powered weekly macro report generation.

Architecture: WeeklyRawData (from data_collector) -> LlmAgent -> WeeklyMacroReport

Follows the same pattern as features/market/agent.py:
- Class wrapper with InMemoryRunner
- Structured output via output_schema + output_key
- Data cleaning to reduce token usage
"""

import json
import os

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.features.weekly_report.models import WeeklyRawData, WeeklyReportOutput


# =============================================================================
# Analyst Prompt
# =============================================================================

WEEKLY_ANALYST_INSTRUCTION = """
You are the Chief Macro Strategist at MarketBrew. Your audience is US stock retail investors with 1-5 years of experience.

## Role
- You are NOT an objective data reporter. You are an opinionated strategist.
- Every analysis MUST answer: "What does this mean for the stock market / investing?"
- Be decisive: say "bullish" not "mixed"; say "favors growth" not "could go either way".
- Support opinions with data, but don't pile on data without interpretation.

## Output Structure (follow the schema exactly)

### executive_summary
2-3 paragraphs of cross-sector synthesis. MUST include:
- A clear verdict: bullish / neutral / bearish for risk assets
- Connect macro to equities (don't just talk economics)

### signal_lights
Four dimensions: liquidity, economy, inflation, sentiment.
Each value: "green" (bullish) / "yellow" (neutral/watch) / "red" (bearish/warning).
Base on data evidence, not gut feeling.

### market_recap
3-4 sentences of high-level weekly recap.
- Only cover index-level weekly performance (% change) and style/sector trends.
- No individual stocks, no daily moves, no news events.

### liquidity_analysis / economy_analysis / inflation_analysis / sentiment_analysis
Each has three sub-fields (SectionAnalysis):
- data_changes: 2-3 key indicators with notable changes and their values (objective)
- trend_interpretation: 1-2 sentences explaining what the changes mean (analysis)
- market_implication: 1 sentence on what it means for stocks/investing (judgment)

### investment_implications
- Style tilt: growth vs value / large cap vs small cap
- Sector preference: which sectors benefit/suffer and why
- Risk warning: 1-2 macro risks to watch

### week_ahead
3-5 key events, each with:
- date: e.g. "Wednesday" or "2/12"
- event: e.g. "CPI (est. +0.2% MoM)"
- if_above: market impact if above expectations
- if_below: market impact if at or below expectations

## Fact-checking rules
- Data comes from input JSON. Do NOT fabricate.
- Quote % changes and indicator values accurately.
- If data is missing for a section, skip the analysis rather than inventing.

## Language
- ALL content in Chinese (Simplified).
"""


weekly_analyst = LlmAgent(
    name="weekly_macro_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes macro data and generates structured weekly report in Chinese",
    instruction=WEEKLY_ANALYST_INSTRUCTION,
    output_schema=WeeklyReportOutput,
    output_key="report",
)

root_agent = weekly_analyst


# =============================================================================
# Data Cleaning
# =============================================================================


def _prepare_data_for_agent(raw_data: WeeklyRawData) -> dict:
    """
    Serialize and clean WeeklyRawData for the AI agent.
    Removes redundant nesting and keeps only key values to reduce token usage.
    """
    result = {
        "week_label": raw_data.week_label,
        "collected_at": raw_data.collected_at,
    }

    # Market performance - already compact
    if raw_data.market_performance:
        result["market_performance"] = raw_data.market_performance.model_dump()

    # Macro risk dashboard
    if raw_data.macro_risk:
        result["macro_risk"] = raw_data.macro_risk

    # Economy fundamentals
    if raw_data.economy:
        result["economy"] = raw_data.economy

    # Inflation & rates
    if raw_data.inflation_rates:
        result["inflation_rates"] = raw_data.inflation_rates

    # Liquidity metrics
    if raw_data.liquidity:
        result["liquidity"] = raw_data.liquidity

    # Economic calendar - keep only key fields
    result["economic_calendar"] = [
        {
            "date": e.get("date", ""),
            "event": e.get("event", ""),
            "previous": e.get("previous"),
            "estimate": e.get("estimate"),
            "is_key_event": e.get("is_key_event", False),
        }
        for e in (raw_data.economic_calendar or [])
    ]

    # Earnings calendar - keep only key fields
    result["earnings_calendar"] = [
        {
            "symbol": e.get("symbol", ""),
            "date": e.get("date", ""),
            "epsEstimated": e.get("epsEstimated"),
            "revenueEstimated": e.get("revenueEstimated"),
            "is_ai_related": e.get("is_ai_related", False),
        }
        for e in (raw_data.earnings_calendar or [])
    ]

    return result


# =============================================================================
# WeeklyReportAgent Wrapper
# =============================================================================


class WeeklyReportAgent:
    """Wrapper class to run the weekly analyst agent with structured output."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=weekly_analyst, app_name="weekly_report"
        )

    async def generate(self, raw_data: WeeklyRawData) -> dict:
        """
        Generate a weekly macro report from raw data.

        Args:
            raw_data: WeeklyRawData from collect_weekly_data()

        Returns:
            dict matching WeeklyMacroReport fields
        """
        print("[WeeklyReportAgent] Preparing data for agent...")

        # Step 1: Clean data for token efficiency
        data_for_agent = _prepare_data_for_agent(raw_data)

        # Step 2: Create session
        session = await self.runner.session_service.create_session(
            app_name="weekly_report", user_id="weekly_analyst"
        )

        # Step 3: Send data to the agent
        message = Content(
            parts=[
                Part(
                    text=(
                        "Please analyze the following weekly macro data and "
                        "generate a comprehensive weekly report:\n\n"
                        + json.dumps(
                            data_for_agent,
                            ensure_ascii=False,
                            indent=2,
                            default=str,
                        )
                    )
                )
            ],
            role="user",
        )

        print("[WeeklyReportAgent] Running agent (this may take 30-60s)...")

        async for event in self.runner.run_async(
            user_id="weekly_analyst",
            session_id=session.id,
            new_message=message,
        ):
            pass  # Events processed, output stored in session state

        # Step 4: Extract structured output from session state
        session_data = await self.runner.session_service.get_session(
            app_name="weekly_report",
            user_id="weekly_analyst",
            session_id=session.id,
        )

        result = self._extract_report(session_data)

        print(
            f"[WeeklyReportAgent] Generation complete. "
            f"Summary length: {len(result.get('executive_summary', ''))}, "
            f"Signal lights: {result.get('signal_lights', {})}"
        )

        return result

    def _extract_report(self, session_data) -> dict:
        """Extract WeeklyMacroReport fields from session state."""
        empty_section = {
            "data_changes": "",
            "trend_interpretation": "",
            "market_implication": "",
        }

        if not session_data or not hasattr(session_data, "state"):
            print("[WeeklyReportAgent] No session state found")
            return self._empty_report()

        state = session_data.state or {}
        report_data = state.get("report", {})

        # Handle string response (may need JSON parse)
        if isinstance(report_data, str):
            try:
                report_data = json.loads(report_data)
            except json.JSONDecodeError:
                print("[WeeklyReportAgent] Failed to parse report as JSON")
                return self._empty_report()

        if not isinstance(report_data, dict):
            print(f"[WeeklyReportAgent] Unexpected report type: {type(report_data)}")
            return self._empty_report()

        # Extract each field with safe defaults
        def _safe_section(key: str) -> dict:
            section = report_data.get(key)
            if isinstance(section, dict):
                return {
                    "data_changes": section.get("data_changes", ""),
                    "trend_interpretation": section.get("trend_interpretation", ""),
                    "market_implication": section.get("market_implication", ""),
                }
            return empty_section

        def _safe_signal_lights() -> dict:
            lights = report_data.get("signal_lights", {})
            if isinstance(lights, dict):
                return {
                    "liquidity": lights.get("liquidity", "yellow"),
                    "economy": lights.get("economy", "yellow"),
                    "inflation": lights.get("inflation", "yellow"),
                    "sentiment": lights.get("sentiment", "yellow"),
                }
            return {"liquidity": "yellow", "economy": "yellow", "inflation": "yellow", "sentiment": "yellow"}

        return {
            "executive_summary": report_data.get("executive_summary", ""),
            "signal_lights": _safe_signal_lights(),
            "market_recap": report_data.get("market_recap", ""),
            "liquidity_analysis": _safe_section("liquidity_analysis"),
            "economy_analysis": _safe_section("economy_analysis"),
            "inflation_analysis": _safe_section("inflation_analysis"),
            "sentiment_analysis": _safe_section("sentiment_analysis"),
            "investment_implications": report_data.get("investment_implications", ""),
            "week_ahead": report_data.get("week_ahead", []),
        }

    def _empty_report(self) -> dict:
        """Return an empty report structure for error cases."""
        empty_section = {
            "data_changes": "",
            "trend_interpretation": "",
            "market_implication": "",
        }
        return {
            "executive_summary": "",
            "signal_lights": {"liquidity": "yellow", "economy": "yellow", "inflation": "yellow", "sentiment": "yellow"},
            "market_recap": "",
            "liquidity_analysis": empty_section,
            "economy_analysis": empty_section,
            "inflation_analysis": empty_section,
            "sentiment_analysis": empty_section,
            "investment_implications": "",
            "week_ahead": [],
        }
