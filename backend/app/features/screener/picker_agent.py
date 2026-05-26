"""
Stock Picker Agent - Conversation-guided stock picking assistant.

A friendly AI guide that helps beginners find personalized stocks through
natural conversation. Reuses the screener universe data and tool functions
from agent.py, but with a completely different personality and workflow.

Layered tool architecture:
  - base_tools: screener data tools (V1)
  - extended_tools: deep stock analysis (V2+, placeholder)
"""

import asyncio
import json
from typing import Any, Dict, List, Optional

from google.adk.agents import LlmAgent
from google.adk.plugins import LoggingPlugin
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.features.screener.agent import (
    _current_universe,
    _run_agent_session,
    execute_screener,
    filter_by_tickers,
    get_field_distribution,
    list_available_sectors,
)
from app.shared.llm_metering import meter

PICKER_MODEL = "gemini-3.1-flash-lite"

logger = get_logger(__name__)


def _format_market_cap(val):
    """Format market cap for agent context."""
    if not val:
        return "N/A"
    val = float(val)
    if val >= 1e12:
        return "$%.1fT" % (val / 1e12)
    if val >= 1e9:
        return "$%.1fB" % (val / 1e9)
    if val >= 1e6:
        return "$%.0fM" % (val / 1e6)
    return "$%.0f" % val


# ---------------------------------------------------------------------------
# Output Schema
# ---------------------------------------------------------------------------

class PickerAgentOutput(BaseModel):
    """Structured output from the stock picker agent."""

    message: str = Field(
        description=(
            "Agent reply in plain Chinese, Markdown formatted. "
            "Warm, friendly tone. No financial jargon. "
            "Use line breaks and structure for readability (see formatting rules in instruction)."
        ),
    )
    options: List[str] = Field(
        default_factory=list,
        description=(
            "Array of clickable option strings in Chinese. "
            '3-5 options, last one usually open-ended. '
            "Empty [] if no options needed."
        ),
    )
    filters: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Array of ALL accumulated filter conditions. "
            'Each item: {"field": "...", "op": "...", "value": ...}. '
            "Include ALL previous filters plus any new ones from this turn. "
            "Empty [] if not ready to filter yet."
        ),
    )
    sort_by: Optional[str] = Field(
        default=None,
        description="Field to sort results by (e.g. 'market_cap', 'dividend_yield').",
    )
    sort_order: str = Field(
        default="desc",
        description="Sort direction: 'asc' or 'desc'.",
    )
    limit: int = Field(
        default=100,
        description="Max results to return. Use 100 for broad exploration, 30-50 for narrowed results.",
    )
    update_results: bool = Field(
        default=True,
        description=(
            "Whether this turn should refresh the stock list on the right panel. "
            "True when filters change (user narrows/broadens criteria). "
            "False for pure conversation about existing stocks "
            "(e.g. discussing analyst ratings, comparing stocks, asking details)."
        ),
    )
    pick_reasons: List[Dict[str, str]] = Field(
        default_factory=list,
        description=(
            "Array of per-stock recommendation reasons. "
            'Each item: {"symbol": "AAPL", "reason": "..."}. '
            "Only populate when making final recommendations. "
            "Reasons should echo the user's stated preferences in plain Chinese."
        ),
    )
    title: str = Field(
        default="",
        description=(
            "5-10 Chinese characters summarizing the stock picking direction. "
            "e.g. '高股息大盘蓝筹', 'AI芯片成长股', '低估值科技反弹'. "
            "Update every turn to reflect the CURRENT direction "
            "(user may change direction mid-conversation)."
        ),
    )
    navigate: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Set this to navigate the right panel to a different content. "
            "Only use when user explicitly asks to view a stock. "
            'Format: {"type": "stock", "params": {"symbol": "NVDA"}, "reason": "Opening NVDA research"}'
        ),
    )


# ---------------------------------------------------------------------------
# Layered Tool Architecture
# ---------------------------------------------------------------------------

# Base tools - screener data operations (V1)
base_tools = [
    execute_screener,
    filter_by_tickers,
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

Every turn: understand user intent, decide if filters need changing, respond naturally.

### Core loop
1. User says something (click or type).
2. Decide: is the user **changing criteria** or **chatting about existing results**?
   - Changing criteria -> update filters, set `update_results=true`
   - Chatting about existing stocks -> keep filters unchanged, set `update_results=false`
3. If updating: call `execute_screener` to see how many stocks match.
4. Reply with a short message + follow-up options.
5. If match_count is small enough (roughly <15), also write a `pick_reasons` entry for each stock.

### update_results: when to refresh the right panel
- `true`: User wants to change, add, or remove filter conditions (e.g. "only large caps", "show me tech stocks", "remove the dividend filter")
- `false`: User is asking about the current results without changing criteria:
  - "专家们怎么评价？" (asking analyst ratings)
  - "这几只哪个最稳？" (comparing current stocks)
  - "看看它们的增长潜力" (discussing existing picks)
  - "为什么推荐这只？" (asking for explanation)

### When to reset (change direction)
- `update_results=true` with `filters=[]`: User wants to start over or change approach completely.
  - "换个选股思路" / "换个方向" / "重新来" / "不要这些了"
  - This clears the right panel and asks the user for a new direction.
  - IMPORTANT: output `filters=[]` (empty) + `update_results=true` to trigger a reset.

### When to write pick_reasons
- match_count > 15: Do NOT write pick_reasons. Just show the list and ask follow-up questions to narrow down.
- match_count <= 15: Write a 1-2 sentence reason for each stock in the results. This happens naturally as the list gets small -- no special mode switch needed.
- User explicitly asks "recommend" / "help me pick from these": Write pick_reasons even if list is larger.

### Every turn must output filters
- Always include ALL accumulated filters in your output (even when `update_results=false`).
- If user says "dividends" on the first turn, output filters immediately with `update_results=true`.
- The only exception: if the user says something completely unrelated to stock picking (e.g. "hello"), output `filters=[]` and ask what they're looking for.

### Examples
- "稳健收息" -> filters: [dividend_yield>2, dividend_payout_years>=5], pick_reasons: [] (list is large)
- -> "公用事业" -> add sector eq Utilities, pick_reasons: [] or reasons if list is small
- -> "大公司" -> add market_cap_tier in [large, mega], pick_reasons: [{symbol, reason}, ...] (list is now small)

- "PE<15 ROE>20% 软件股" -> filters: [pe_ttm<15, roe>20, sector eq Technology Services], pick_reasons: [{...}] (specific enough, list is small)

- "加密货币相关股票" -> call filter_by_tickers(["COIN", "MARA", "RIOT", "MSTR", "CLSK", ...]) -> filters: [{"field": "tickers", "op": "in", "value": ["COIN", "MARA", ...]}]
- "AI芯片" -> call filter_by_tickers(["NVDA", "AMD", "AVGO", "MRVL", ...]) -> filters: [{"field": "tickers", "op": "in", "value": [...]}]

## Tool Strategy

- Use `execute_screener` for structured filter conditions (PE, ROE, sector, etc.).
- Use `filter_by_tickers` when the user asks about a **thematic group** that doesn't map to standard sectors:
  - Crypto/blockchain stocks, AI chips, weight-loss drugs, space companies, nuclear energy, quantum computing, EV/electric vehicles, cybersecurity, cannabis, sports betting, etc.
  - Use YOUR OWN knowledge to decide which tickers belong to the theme. Be EXHAUSTIVE - include every ticker you can think of (20-50+). The tool will automatically filter out any that aren't in our universe. More is always better than fewer, because the user can narrow down later.
  - IMPORTANT: After calling filter_by_tickers, include `{"field": "tickers", "op": "in", "value": ["COIN", "MARA", ...]}` in your `filters` output so the right panel updates correctly. This is a special filter type for thematic groups.
  - You can combine this with other filters: e.g. tickers filter + pe_ttm < 15.
- Use `get_field_distribution` to understand data ranges when needed.
- Use `list_available_sectors` to know what sectors exist.
- Before adding a new filter, test with `execute_screener` first to make sure results won't drop to 0.
- If results = 0, relax the most restrictive condition and tell the user.

## Dynamic Options

Generate 3-5 clickable options based on conversation context. Rules:
- Options are plain Chinese strings that will be sent as the user's message when clicked.
- Example: `["只看大公司", "兼顾一点成长性", "换个方向看看"]`
- Options should feel natural and relevant to what was just discussed
- Last option is usually open-ended (e.g. "other ideas", "tell me more")
- Never generate generic placeholder options
- In RECOMMEND mode, options are follow-up actions (e.g. "change direction", "see more", "adjust criteria")

## Filter Accumulation

- When user expresses a preference, translate it to filter conditions
- ALWAYS include ALL previous filters in your output (accumulate, don't replace)
- If user says to remove a condition, exclude it from the accumulated list
- Your `filters` output must be the complete set of active conditions

## Pick Reasons

- The `symbol` field MUST be the stock ticker (e.g. "AAPL", "VRT", "MSFT") copied from the `ticker` field in execute_screener results. NEVER use company names (e.g. "Apple Inc.", "Vertiv Holdings, LLC") as the symbol.
- Write a 1-2 sentence reason for EACH recommended stock
- Echo the user's stated preferences (e.g. "you wanted steady dividends - this company has paid dividends for 25 years straight")
- Use plain Chinese, no numbers unless they're meaningful to the user

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

## Message Formatting Rules

Your `message` field is rendered as Markdown in the frontend. Follow these rules for readability:

1. **Use line breaks between ideas.** Never write a wall of text. Each distinct thought should be a separate paragraph (separated by `\n\n`).
2. **Bold text must start on its own line.** Never bold random words mid-sentence. Use bold only for:
   - Section headings (e.g. `**筛选结果**\n找到了12只符合条件的股票...`)
   - Key metrics as a label at line start (e.g. `**盈利能力** 都在20%以上`)
3. **Lists for multiple items.** When mentioning 3+ things (sectors, criteria, stocks), use bullet points:
   ```
   目前的筛选条件：\n- 大公司\n- 盈利能力 > 20%\n- 股息率 > 2%
   ```
4. **Keep it concise.** 2-5 short paragraphs max. Don't over-explain.
5. **No inline bold for emphasis.** Don't write `这些股票的**盈利能力**都很强`. Instead write `这些股票的盈利能力都很强` or put it on its own line as a heading.

Good example:
```
找到了8只符合条件的股票！都是大公司，盈利能力强，而且稳定分红。

**筛选条件**
- 大公司（市值500亿美元以上）
- 盈利能力 > 20%
- 连续分红5年以上

想进一步缩小范围吗？可以看看它们最近的走势或者华尔街专家的评价。
```

Bad example (do NOT do this):
```
找到了8只符合条件的**股票**！这些都是**大公司**，它们的**盈利能力**都在20%以上，而且都**稳定分红**超过5年，筛选条件包括市值500亿美元以上、盈利能力大于20%、连续分红5年以上，想进一步缩小范围的话可以看看走势或者专家评价。
```

## Title Rules

Every turn, output a `title` field: a 5-10 Chinese character summary of the current stock picking direction.
- Must be Chinese
- Reflect the current direction, not conversation summary
- Update when user changes direction
- Examples: "高股息大盘蓝筹", "AI芯片成长股", "低估值科技反弹", "网络安全小盘股"

## Navigation (Research Desk)

You can navigate the user's right panel to show a stock's detailed research view.

### When to navigate:
- User says "show me NVDA", "look at AAPL details", "open Apple's research"
- User clicks a stock from results and wants to see more
- NEVER navigate just because user mentions a stock name casually

### How to navigate:
Set the `navigate` field in your output:
- type: "stock"
- params: {"symbol": "AAPL"} (use clean ticker, no exchange prefix)
- reason: brief Chinese explanation of what you're doing

### When viewing a stock:
- You have the stock's data in the context above
- Answer questions about the stock directly from the context data
- If the user wants to go back to screening, tell them to click the back button

## Critical Output Rules

1. **`filters` must be a valid JSON array string.** Copy the exact filters you used in execute_screener.
2. **`options` must be a valid JSON array of strings.** Each item is a plain Chinese string.
3. **`pick_reasons` must be a valid JSON array string.** Each item has "symbol" and "reason" keys.
4. **Market cap is in USD** (1e9 = $1B).
5. **Percentages are raw numbers** (ROE 15% = 15, not 0.15).
6. **Always write message in Chinese.**
7. **If you use execute_screener, your filters output MUST match what you tested.**
8. **Message must follow the Markdown formatting rules above.**
"""


# ---------------------------------------------------------------------------
# Agent + Runner
# ---------------------------------------------------------------------------

_picker_agent = LlmAgent(
    name="stock_picker",
    model=PICKER_MODEL,
    instruction=PICKER_AGENT_INSTRUCTION,
    output_schema=PickerAgentOutput,
    output_key="picker",
    tools=picker_tools,
    after_model_callback=meter("screener.picker", model=PICKER_MODEL),
)


# ---------------------------------------------------------------------------
# Wrapper Class
# ---------------------------------------------------------------------------

class StockPickerAgent:
    """Conversation-guided stock picking assistant."""

    def __init__(self, debug: bool = False):
        plugins = [LoggingPlugin()] if debug else []
        self.runner = InMemoryRunner(
            agent=_picker_agent,
            app_name="stock_picker",
            plugins=plugins,
        )

    async def guide(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        universe: list[dict] | None = None,
        content_context: dict | None = None,
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

        # Content context (Research Desk: what user is viewing in right panel)
        if content_context:
            ctx_type = content_context.get("type", "screener")
            if ctx_type == "stock":
                symbol = content_context.get("symbol", "")
                prompt_parts.append("## User is currently viewing: %s Stock Research" % symbol)
                # Format quote data
                quote = content_context.get("quote", {})
                if quote:
                    prompt_parts.append("Price: $%.2f (%s%.2f%%)" % (
                        quote.get("price", 0) or 0,
                        "+" if (quote.get("change_percent", 0) or 0) >= 0 else "",
                        quote.get("change_percent", 0) or 0,
                    ))
                    prompt_parts.append("Market Cap: %s" % _format_market_cap(quote.get("market_cap")))
                # Format fundamentals
                fundamentals = content_context.get("fundamentals", {})
                if fundamentals:
                    valuation = fundamentals.get("valuation", {})
                    profitability = fundamentals.get("profitability", {})
                    growth = fundamentals.get("growth", {})
                    parts = []
                    if valuation.get("pe"): parts.append("PE %.1f" % valuation["pe"])
                    if valuation.get("pb"): parts.append("PB %.1f" % valuation["pb"])
                    if valuation.get("ps"): parts.append("PS %.1f" % valuation["ps"])
                    if profitability.get("roe"): parts.append("ROE %.1f%%" % (profitability["roe"] * 100))
                    if growth.get("revenue_yoy"): parts.append("Revenue YoY %+.1f%%" % (growth["revenue_yoy"] * 100))
                    if parts:
                        prompt_parts.append("Fundamentals: %s" % " | ".join(parts))
                # Earnings data
                earnings_history = content_context.get("earnings_history")
                if earnings_history:
                    eps_parts = []
                    for eh in earnings_history[:4]:
                        if isinstance(eh, dict):
                            q = eh.get("quarter", "")
                            actual = eh.get("eps_actual")
                            est = eh.get("eps_estimate")
                            surprise = eh.get("surprise_percent")
                            eps_parts.append("%s: EPS $%.2f (est $%.2f, %s%.1f%%)" % (
                                q[:7] if q else "?",
                                actual or 0, est or 0,
                                "+" if (surprise or 0) >= 0 else "", (surprise or 0) * 100
                            ))
                    if eps_parts:
                        prompt_parts.append("EPS History: " + " | ".join(eps_parts))

                # Technical data
                tech_derived = content_context.get("technical_derived")
                if tech_derived and isinstance(tech_derived, dict):
                    t_parts = []
                    if tech_derived.get("trend_direction"):
                        t_parts.append("Trend: %s" % tech_derived["trend_direction"])
                    if tech_derived.get("rsi_zone"):
                        t_parts.append("RSI: %s" % tech_derived["rsi_zone"])
                    if tech_derived.get("macd_cross"):
                        t_parts.append("MACD: %s" % tech_derived["macd_cross"])
                    if t_parts:
                        prompt_parts.append("Technical: " + " | ".join(t_parts))

                # Analyst data
                analyst = content_context.get("analyst_summary")
                if analyst and isinstance(analyst, dict):
                    a_parts = []
                    if analyst.get("consensus"):
                        a_parts.append(analyst["consensus"])
                    if analyst.get("total"):
                        a_parts.append("%d analysts" % analyst["total"])
                    if analyst.get("price_target_avg"):
                        a_parts.append("Target $%.0f" % analyst["price_target_avg"])
                    if a_parts:
                        prompt_parts.append("Analyst: " + " | ".join(a_parts))

                # Recent news
                recent_news = content_context.get("recent_news")
                if recent_news and isinstance(recent_news, list):
                    news_titles = [n.get("title", "") for n in recent_news[:3] if isinstance(n, dict) and n.get("title")]
                    if news_titles:
                        prompt_parts.append("News: " + " | ".join(t[:80] for t in news_titles))

                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see all this data in the right panel. "
                    "Answer questions about this stock using the data above. "
                    "If user wants to see a different stock, use navigate_to_content tool."
                )
                prompt_parts.append("")

        # Current user message
        prompt_parts.append("## User's Message")
        prompt_parts.append(message)

        prompt = "\n".join(prompt_parts)

        logger.info("Picker agent message: %s", message[:100])

        try:
            result = await asyncio.wait_for(
                _run_agent_session(
                    runner=self.runner,
                    app_name="stock_picker",
                    prompt=prompt,
                    output_key="picker",
                ),
                timeout=75.0,
            )
        except asyncio.TimeoutError:
            _current_universe.set([])
            logger.error("Picker agent timed out for: %s", message[:100])
            return {
                "message": "AI 助手思考时间太长了，请再试一次。如果持续超时，可以简化一下问题。",
                "options": ["重新试试", "换个方向看看"],
                "filters": accumulated_filters or [],
                "sort_by": None,
                "sort_order": "desc",
                "limit": 30,
                "pick_reasons": [],
                "update_results": False,
                "title": "",
            }
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

        # Extract list fields (now native lists from output schema)
        options = _parse_json_field(result.get("options", []), [])
        filters = _parse_json_field(result.get("filters", []), accumulated_filters or [])
        pick_reasons = _parse_json_field(result.get("pick_reasons", []), [])

        # Navigate instruction
        navigate = result.get("navigate")
        if navigate and not isinstance(navigate, dict):
            navigate = None

        logger.info(
            "Picker agent raw output: message=%s, options=%s, filters=%s, "
            "pick_reasons=%s, sort_by=%s, limit=%s, navigate=%s",
            result.get("message", "")[:80],
            options,
            filters,
            pick_reasons,
            result.get("sort_by"),
            result.get("limit", 30),
            navigate,
        )

        return {
            "message": result.get("message", ""),
            "options": options,
            "filters": filters,
            "sort_by": result.get("sort_by"),
            "sort_order": result.get("sort_order", "desc"),
            "limit": result.get("limit", 100),
            "update_results": result.get("update_results", True),
            "pick_reasons": pick_reasons,
            "title": result.get("title", ""),
            "navigate": navigate,
        }


def _parse_json_field(raw: Any, fallback: Any) -> Any:
    """Normalize agent output field, with fallback.

    Handles: plain str (JSON), list of dicts, list of JSON strings, etc.
    """
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
