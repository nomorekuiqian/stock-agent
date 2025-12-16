"""
Liquidity Analysis Agent using OpenAI GPT-4o-mini with built-in web search

Features:
- Analyzes current liquidity metrics and historical trends
- Uses OpenAI's native web search for recent news context
- Outputs structured analysis in Chinese
"""

import os
from datetime import datetime
from typing import Optional
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# System prompt for the liquidity analysis agent
SYSTEM_PROMPT = """You are a professional macro liquidity analyst. You are very good at analyzing current macro condition and providing deep insights.
## Task
Based on the provided liquidity data and web search results, write a structured analysis report for retail investors.
The report should be in a professional tone still easy to understand, avoid using words that are too complicated.
It should also be insightful after carefully reasoning instead of just describing the current state. 

## Report Structure (6 sections)

### 1. Current State
Describe the current state of market liquidity based on the data provided.
For each metrics, describe their current status in history level.
For bank reserves, know that 3T is a determining level for abundance.

### 2. Trends
Analyze short-term (past week) and medium-term (past 1-3 months) liquidity trends.
Explain what do these trends mean.

### 3. Drivers
Identify the key factors driving recent liquidity changes (Fed balance sheet, TGA, RRP, etc.).
Provide reasoning and logic referencing relevant news if applicable

### 4. Stress Signals
Note any stress indicators in money markets (SOFR/EFFR movements, NFCI changes, reserve levels).
If there are existing risks call them out.

### 5. Outlook
Provide a forward-looking view for the next 1-3 months based on current trends and news.
Provide reasoning and logic referencing relevant news if applicable

### 6. Summary Investment Implications
Provide a comprehensive summary based on previous information and guide retail investors to understand the current market liquidity implication to risk assets such as stocks and crypto.

## Requirements
- Write in Chinese
- 2-4 sentences per section
- Reference specific data points
- Use web search to find recent Fed/Treasury/liquidity news before analysis
- Write the report in Markdown and do not ask user questions in the end, 
- Remember you are not having a conversation with user"""


class LiquidityAnalysisAgent:
    """OpenAI-based agent for liquidity analysis with native web search."""

    def __init__(self):
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")
        self.client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        self.model = "gpt-5.2"

    def _build_data_context(
        self, current_metrics: dict, history_30d: list, history_90d: list
    ) -> str:
        """Build the data context string for the prompt."""

        # Current metrics summary
        metrics_text = "## Current Metrics (Latest Data)\n"

        if current_metrics:
            net_liq = current_metrics.get("net_liquidity", {})
            fed_assets = current_metrics.get("fed_assets", {})
            tga = current_metrics.get("tga", {})
            rrp = current_metrics.get("rrp", {})
            reserves = current_metrics.get("reserves", {})
            sofr = current_metrics.get("sofr", {})
            effr = current_metrics.get("effr", {})
            nfci = current_metrics.get("nfci", {})

            metrics_text += f"""
- Net Liquidity: ${net_liq.get('value', 'N/A'):.0f}B (Date: {net_liq.get('date', 'N/A')})
- Fed Total Assets (WALCL): ${fed_assets.get('value', 'N/A'):.0f}B
- Treasury Cash (TGA): ${tga.get('value', 'N/A'):.0f}B
- Overnight Reverse Repo (RRP): ${rrp.get('value', 'N/A'):.0f}B
- Bank Reserves: ${reserves.get('value', 'N/A'):.0f}B
- SOFR: {sofr.get('value', 'N/A'):.2f}%
- EFFR: {effr.get('value', 'N/A'):.2f}%
- NFCI: {nfci.get('value', 'N/A'):.2f}
"""

        # 30-day trend (short-term)
        if history_30d and len(history_30d) >= 2:
            first = history_30d[0]
            last = history_30d[-1]
            change_30d = last["value"] - first["value"]
            pct_30d = (change_30d / first["value"]) * 100 if first["value"] else 0

            metrics_text += f"""
## Short-term Trend (Past 30 Days)
- Start ({first['time']}): ${first['value']:.0f}B
- Latest ({last['time']}): ${last['value']:.0f}B
- Change: ${change_30d:.0f}B ({pct_30d:+.1f}%)
"""

        # 90-day trend (medium-term)
        if history_90d and len(history_90d) >= 2:
            first = history_90d[0]
            last = history_90d[-1]
            change_90d = last["value"] - first["value"]
            pct_90d = (change_90d / first["value"]) * 100 if first["value"] else 0

            metrics_text += f"""
## Medium-term Trend (Past 90 Days)
- Start ({first['time']}): ${first['value']:.0f}B
- Latest ({last['time']}): ${last['value']:.0f}B
- Change: ${change_90d:.0f}B ({pct_90d:+.1f}%)
"""

        # Component breakdown for recent changes
        if history_30d and len(history_30d) >= 2:
            first = history_30d[0]
            last = history_30d[-1]

            fed_change = last.get("fed_assets", 0) - first.get("fed_assets", 0)
            tga_change = last.get("tga", 0) - first.get("tga", 0)
            rrp_change = last.get("rrp", 0) - first.get("rrp", 0)
            reserves_change = last.get("reserves", 0) - first.get("reserves", 0)

            metrics_text += f"""
## Component Changes (Past 30 Days)
- Fed Assets Change: ${fed_change:+.0f}B
- TGA Change: ${tga_change:+.0f}B (positive = draining, negative = releasing)
- RRP Change: ${rrp_change:+.0f}B (positive = absorbing, negative = releasing)
- Bank Reserves Change: ${reserves_change:+.0f}B (3T is abundance threshold)
"""

        # Rate and Financial Conditions Analysis
        if current_metrics:
            sofr = current_metrics.get("sofr", {})
            effr = current_metrics.get("effr", {})
            nfci = current_metrics.get("nfci", {})

            sofr_val = sofr.get("value", 0)
            effr_val = effr.get("value", 0)
            sofr_effr_spread = (sofr_val - effr_val) * 100 if sofr_val and effr_val else 0  # in bps

            metrics_text += f"""
## Rate Spreads & Stress Indicators
- SOFR-EFFR Spread: {sofr_effr_spread:+.0f}bps (widening spread may signal funding stress)
"""
            # Add rate changes if available in history
            if history_30d and len(history_30d) >= 2:
                first = history_30d[0]
                last = history_30d[-1]

                sofr_30d_ago = first.get("sofr", 0)
                effr_30d_ago = first.get("effr", 0)
                nfci_30d_ago = first.get("nfci", 0)

                if sofr_30d_ago and sofr_val:
                    sofr_change = (sofr_val - sofr_30d_ago) * 100  # in bps
                    metrics_text += f"- SOFR 30-Day Change: {sofr_change:+.0f}bps\n"

                if effr_30d_ago and effr_val:
                    effr_change = (effr_val - effr_30d_ago) * 100  # in bps
                    metrics_text += f"- EFFR 30-Day Change: {effr_change:+.0f}bps\n"

                nfci_val = nfci.get("value", 0)
                if nfci_30d_ago and nfci_val:
                    nfci_change = nfci_val - nfci_30d_ago
                    direction = "tightening" if nfci_change > 0 else "loosening"
                    metrics_text += f"- NFCI 30-Day Change: {nfci_change:+.2f} ({direction} financial conditions)\n"

        return metrics_text

    async def analyze(
        self,
        current_metrics: dict,
        history_30d: list,
        history_90d: list,
        additional_context: Optional[str] = None,
    ) -> dict:
        """
        Generate liquidity analysis using GPT-5-mini with web search.

        Args:
            current_metrics: Current liquidity metrics from FRED
            history_30d: 30-day historical data for short-term trend
            history_90d: 90-day historical data for medium-term trend
            additional_context: Optional additional context

        Returns:
            dict with analysis text and metadata
        """

        # Build data context
        data_context = self._build_data_context(
            current_metrics, history_30d, history_90d
        )

        # User message with instructions
        user_message = f"""Please analyze the current US market liquidity based on the data below.

First, use web search to find the latest news about:
1. Federal Reserve balance sheet and QT
2. Treasury TGA cash balance
3. US money market conditions

Then generate a comprehensive liquidity analysis report in Chinese following the 6-dimension framework.

{data_context}

"""

        try:
            # Call OpenAI API with web search enabled (using GA version)
            response = await self.client.responses.create(
                model=self.model,
                tools=[
                    {
                        "type": "web_search",
                        "search_context_size": "medium",  # low/medium/high
                    }
                ],
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
            )

            # Extract the text output from response
            analysis_text = ""
            for item in response.output:
                if item.type == "message":
                    for content in item.content:
                        if content.type == "output_text":
                            analysis_text = content.text
                            break

            # Determine status based on metrics (Chinese)
            net_liq_value = current_metrics.get("net_liquidity", {}).get("value", 0)
            if net_liq_value > 6000:
                status = "充裕"
            elif net_liq_value > 5500:
                status = "适中"
            else:
                status = "偏紧"

            return {
                "success": True,
                "analysis": analysis_text,
                "status": status,
                "generated_at": datetime.now().isoformat(),
                "model": self.model,
                "metrics_snapshot": {
                    "net_liquidity": current_metrics.get("net_liquidity", {}).get(
                        "value"
                    ),
                    "fed_assets": current_metrics.get("fed_assets", {}).get("value"),
                    "tga": current_metrics.get("tga", {}).get("value"),
                    "rrp": current_metrics.get("rrp", {}).get("value"),
                    "nfci": current_metrics.get("nfci", {}).get("value"),
                },
            }

        except Exception as e:
            print(f"[LiquidityAgent] Error: {e}")
            return {
                "success": False,
                "error": str(e),
                "generated_at": datetime.now().isoformat(),
            }


# Singleton instance
_agent_instance: Optional[LiquidityAnalysisAgent] = None


def get_liquidity_agent() -> LiquidityAnalysisAgent:
    """Get or create the liquidity analysis agent instance."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = LiquidityAnalysisAgent()
    return _agent_instance
