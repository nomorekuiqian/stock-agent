"""
Stock Picker Agent - Conversation-guided stock picking assistant.

A friendly AI guide that helps beginners find personalized stocks through
natural conversation. Reuses the screener universe data and tool functions
from agent.py, but with a completely different personality and workflow.

Layered tool architecture:
  - base_tools: screener data tools (V1)
  - extended_tools: deep stock analysis (V2+, placeholder)
"""

import json
from typing import Any, Dict, List

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.features.screener.agent import (
    _current_universe,
    _run_agent_session,
    execute_screener,
    get_field_distribution,
    list_available_sectors,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Output Schema
# ---------------------------------------------------------------------------

class PickerAgentOutput(BaseModel):
    """Structured output from the stock picker agent."""

    message: str = Field(
        description=(
            "Agent reply in plain Chinese (60-200 chars). "
            "Warm, friendly tone. No financial jargon."
        ),
    )
    options: str = Field(
        default="[]",
        description=(
            "JSON array of clickable options for the user. "
            'Format: [{"label": "...", "value": "..."}, ...]. '
            "3-5 options, last one usually open-ended. "
            "Empty array [] if no options needed."
        ),
    )
    filters: str = Field(
        default="[]",
        description=(
            "JSON array of ALL accumulated filter conditions. "
            'Format: [{"field": "...", "op": "...", "value": ...}, ...]. '
            "Include ALL previous filters plus any new ones from this turn. "
            "Empty [] if not ready to filter yet."
        ),
    )
    sort_by: str | None = Field(
        default=None,
        description="Field to sort results by (e.g. 'market_cap', 'dividend_yield').",
    )
    sort_order: str = Field(
        default="desc",
        description="Sort direction: 'asc' or 'desc'.",
    )
    limit: int = Field(
        default=30,
        description="Max results to return (1-100).",
    )
    pick_reasons: str = Field(
        default="[]",
        description=(
            "JSON array of per-stock recommendation reasons. "
            'Format: [{"symbol": "AAPL", "reason": "..."}, ...]. '
            "Only populate when making final recommendations. "
            "Reasons should echo the user's stated preferences in plain Chinese."
        ),
    )


# ---------------------------------------------------------------------------
# Layered Tool Architecture
# ---------------------------------------------------------------------------

# Base tools - screener data operations (V1)
base_tools = [
    execute_screener,
    get_field_distribution,
    list_available_sectors,
]

# Extended tools - deep stock analysis (V2+, placeholder)
# extended_tools = [
#     get_stock_profile,      # Business description, competitive landscape (FMP)
#     get_recent_news,        # Recent news summary
#     get_earnings_summary,   # Latest earnings highlights
# ]

# Active tool set
picker_tools = base_tools  # V2: base_tools + extended_tools


# ---------------------------------------------------------------------------
# Agent Instruction
# ---------------------------------------------------------------------------

PICKER_AGENT_INSTRUCTION = """You are a friendly stock picking guide for Chinese-speaking users. You help complete beginners find personalized stocks through natural conversation.

## Your Personality

You are like a knowledgeable friend - warm, patient, and approachable. You NEVER use financial jargon. Always translate technical terms to plain language:
- "ROE" -> "盈利能力"
- "PE" -> "股价是否划算"
- "市盈率" -> "赚钱速度跟股价的比例"
- "RSI" -> "最近涨太多还是跌太多"
- "分析师评级" -> "华尔街专家们怎么看"
- "SMA50" -> "最近走势"
- "beta" -> "波动大不大"
- "市值" -> "公司大小"

## How You Work

### Core Loop
1. Understand what the user wants (ask questions, offer options)
2. Translate preferences into filter conditions
3. Use tools to explore data and test conditions
4. Gradually narrow down from ~3,600 stocks to personalized picks
5. Give recommendation reasons that echo user's preferences

### Tool Strategy
- **Early in conversation**: Use `get_field_distribution` to understand data ranges. Use `list_available_sectors` to know what sectors exist.
- **Once you have conditions**: Use `execute_screener` to test filters and check match_count.
- **Before adding a new filter**: Always test with `execute_screener` first to make sure results won't drop to 0.
- **If results = 0**: Relax the most restrictive condition and tell the user.

### Dynamic Options
Generate 3-5 clickable options based on conversation context. Rules:
- Options should feel natural and relevant to what was just discussed
- Last option is usually open-ended (e.g. "other ideas", "tell me more")
- Never generate generic placeholder options
- Options should help the user make progress toward finding stocks

### Filter Accumulation
- When user expresses a preference, translate it to filter conditions
- ALWAYS include ALL previous filters in your output (accumulate, don't replace)
- If user says to remove a condition, exclude it from the accumulated list
- Your `filters` output must be the complete set of active conditions

### Recommendation Phase
When you have enough information to make recommendations, provide `pick_reasons`. You decide how many stocks to recommend based on context:
- If the user wants a quick overview or broad exploration: 5-10 picks
- If the user has very specific criteria: 3-5 picks
- If the user asks for "a few": 3-5 picks
- If the user asks for "more" or a broad scan: 8-12 picks
- The `symbol` field MUST be the stock ticker (e.g. "AAPL", "VRT", "MSFT") copied from the `ticker` field in execute_screener results. NEVER use company names (e.g. "Apple Inc.", "Vertiv Holdings, LLC") as the symbol.
- Write a 1-2 sentence reason for EACH stock
- Echo the user's stated preferences (e.g. "you wanted steady dividends - this company has paid dividends for 25 years straight")
- Use plain Chinese, no numbers unless they're meaningful to the user

### Adaptive Behavior
- **Beginner** (vague input like "stable stocks"): Ask guiding questions, offer options
- **Expert** (specific input like "PE<15 ROE>20%"): Execute filters directly, ask less

## Available Data Fields

### Identity
- `name`, `sector`, `industry`, `beta_1y`

### Price & Performance
- `price`, `daily_change`, `weekly_change`, `monthly_change`
- `change_3m`, `change_6m`, `ytd_change`, `yearly_change`
- `high_52w`, `low_52w`

### Valuation
- `market_cap`, `pe_ttm`, `pb_mrq`, `ps_fy`, `ev_ebitda_ttm`, `peg_ttm`

### Profitability
- `gross_margin`, `operating_margin`, `net_margin`, `roe`, `roa`, `roic`

### Growth
- `revenue_growth_ttm`, `revenue_growth_quarterly`, `eps_growth_ttm`
- `eps_growth_quarterly`, `ebitda_growth_ttm`, `fcf_growth_ttm`
- `revenue_growth_5y`, `eps_growth_5y`

### Dividends
- `dividend_yield`, `payout_ratio`, `dividend_growth_years`, `dividend_payout_years`

### Balance Sheet
- `debt_to_equity`, `current_ratio`, `cash_equivalents`

### Volume
- `volume`, `avg_volume_30d`, `relative_volume`

### Analyst
- `target_price_avg`, `analyst_rating` (1=Strong Buy, 5=Strong Sell)

### Technical
- `rsi`, `sma50`, `sma200`, `above_sma50`, `above_sma200`

### Derived
- `position_52w` (0=52w low, 1=52w high)
- `analyst_upside` (% upside to target price)
- `market_cap_tier`: "small" (<$2B), "mid" ($2-10B), "large" ($10-200B), "mega" (>$200B)

## Preference-to-Filter Mapping

| User says | Translate to |
|-----------|-------------|
| "stable"/"safe"/"steady" | market_cap_tier in ["large","mega"], beta_1y < 1 |
| "dividends"/"income" | dividend_yield > 2, dividend_payout_years >= 5 |
| "growth"/"fast growing" | revenue_growth_ttm > 20, eps_growth_ttm > 15 |
| "cheap"/"undervalued" | pe_ttm < 15, position_52w < 0.4 |
| "trending"/"momentum" | change_3m > 10, above_sma50 eq true |
| "tech" | sector eq "Technology Services" |
| "healthcare" | sector in ["Health Technology","Health Services"] |
| "big company" | market_cap_tier in ["large","mega"] |
| "small company" | market_cap_tier eq "small" |

## Operators
- gt (>), gte (>=), lt (<), lte (<=), eq (=), neq (!=), in (value in list)

## Critical Output Rules

1. **`filters` must be a valid JSON array string.** Copy the exact filters you used in execute_screener.
2. **`options` must be a valid JSON array string.** Each item has "label" and "value" keys.
3. **`pick_reasons` must be a valid JSON array string.** Each item has "symbol" and "reason" keys.
4. **Market cap is in USD** (1e9 = $1B).
5. **Percentages are raw numbers** (ROE 15% = 15, not 0.15).
6. **Always write message in Chinese.**
7. **If you use execute_screener, your filters output MUST match what you tested.**
"""


# ---------------------------------------------------------------------------
# Agent + Runner
# ---------------------------------------------------------------------------

_picker_agent = LlmAgent(
    name="stock_picker",
    model="gemini-3.1-pro-preview",
    instruction=PICKER_AGENT_INSTRUCTION,
    output_schema=PickerAgentOutput,
    output_key="picker",
    tools=picker_tools,
)


# ---------------------------------------------------------------------------
# Wrapper Class
# ---------------------------------------------------------------------------

class StockPickerAgent:
    """Conversation-guided stock picking assistant."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=_picker_agent, app_name="stock_picker"
        )

    async def guide(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        universe: list[dict] | None = None,
    ) -> Dict[str, Any]:
        """
        Process one turn of the guided stock picking conversation.

        Args:
            message: User's message or selected option value
            history: Full conversation history [{role, content}]
            accumulated_filters: Filters accumulated from previous turns
            universe: Stock universe data

        Returns:
            Dict with message, options, filters, sort_by, sort_order,
            limit, pick_reasons
        """
        _current_universe.set(universe if universe else [])

        prompt_parts = []

        # Conversation history
        if history:
            prompt_parts.append("## Conversation History")
            for turn in history[-20:]:  # generous history window
                role = turn.get("role", "user")
                content = turn.get("content", "")
                if role == "user":
                    prompt_parts.append("User: %s" % content)
                else:
                    prompt_parts.append("Assistant: %s" % content)
            prompt_parts.append("")

        # Accumulated filters from previous turns
        if accumulated_filters:
            prompt_parts.append("## Currently Active Filters")
            prompt_parts.append(
                "These filters are already applied from previous conversation turns. "
                "Include ALL of them in your output unless the user wants to change direction."
            )
            prompt_parts.append(json.dumps(accumulated_filters, ensure_ascii=False))
            prompt_parts.append("")

        # Universe info
        universe_size = len(_current_universe.get())
        prompt_parts.append("## Universe: %d stocks loaded" % universe_size)
        prompt_parts.append("")

        # Current user message
        prompt_parts.append("## User's Message")
        prompt_parts.append(message)

        prompt = "\n".join(prompt_parts)

        logger.info("Picker agent message: %s", message[:100])

        try:
            result = await _run_agent_session(
                runner=self.runner,
                app_name="stock_picker",
                prompt=prompt,
                output_key="picker",
            )
        finally:
            _current_universe.set([])

        if not result:
            logger.warning(
                "Picker agent returned empty result for: %s", message[:100]
            )
            return {
                "message": "抱歉，我没有理解你的意思。可以换个说法试试吗？",
                "options": [],
                "filters": accumulated_filters or [],
                "sort_by": None,
                "sort_order": "desc",
                "limit": 30,
                "pick_reasons": [],
            }

        # Parse JSON string fields
        options = _parse_json_field(result.get("options", "[]"), [])
        filters = _parse_json_field(result.get("filters", "[]"), accumulated_filters or [])
        pick_reasons = _parse_json_field(result.get("pick_reasons", "[]"), [])

        return {
            "message": result.get("message", ""),
            "options": options,
            "filters": filters,
            "sort_by": result.get("sort_by"),
            "sort_order": result.get("sort_order", "desc"),
            "limit": result.get("limit", 30),
            "pick_reasons": pick_reasons,
        }


def _parse_json_field(raw: Any, fallback: Any) -> Any:
    """Parse a JSON string field from agent output, with fallback."""
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return fallback
    if isinstance(raw, list):
        return raw
    return fallback


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_picker_instance: StockPickerAgent | None = None


def get_picker_agent() -> StockPickerAgent:
    """Get or create the singleton stock picker agent."""
    global _picker_instance
    if _picker_instance is None:
        _picker_instance = StockPickerAgent()
    return _picker_instance
