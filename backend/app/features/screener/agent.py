"""
Screener Query Agent - Natural language stock screener with tool-based reasoning.

Uses FunctionTools to:
1. Execute screener filters to test conditions and see results
2. Check field distributions to set reasonable thresholds
3. List available sectors

Then produces structured filter output based on what it observed.
"""

import contextvars
import json
import os
import statistics
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.features.screener.suggestions import SECTOR_ZH

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Per-coroutine universe reference (set by parse() before each agent run)
# Using ContextVar for thread/coroutine safety with concurrent requests
# ---------------------------------------------------------------------------

_current_universe: contextvars.ContextVar[list[dict]] = contextvars.ContextVar(
    "_current_universe", default=[]
)


# ---------------------------------------------------------------------------
# Filter operators (shared between tools and filters.py)
# ---------------------------------------------------------------------------

_OPS = {
    "gt": lambda a, b: a is not None and a > b,
    "gte": lambda a, b: a is not None and a >= b,
    "lt": lambda a, b: a is not None and a < b,
    "lte": lambda a, b: a is not None and a <= b,
    "eq": lambda a, b: a is not None and a == b,
    "neq": lambda a, b: a is not None and a != b,
    "in": lambda a, b: a is not None and a in b,
}


# ---------------------------------------------------------------------------
# Output Schema
# ---------------------------------------------------------------------------

class ScreenerQueryOutput(BaseModel):
    """Structured output from the screener query agent."""

    strategy: str = Field(
        default="custom",
        description="Always 'custom' for tool-based queries.",
    )
    sector: str | None = Field(
        default=None,
        description=(
            "Sector name in English (e.g. 'Technology Services'). "
            "Only set when filtering within a specific sector."
        ),
    )
    filters: str = Field(
        default="[]",
        description=(
            "JSON array string of the final filter conditions. "
            "Format: [{\"field\": \"pe_ttm\", \"op\": \"lt\", \"value\": 15}, ...]. "
            "Use the exact same JSON you passed to execute_screener."
        ),
    )
    sort_by: str | None = Field(
        default=None,
        description="Field name to sort by (e.g. 'roe', 'market_cap').",
    )
    sort_order: str = Field(
        default="desc",
        description="Sort order: 'asc' or 'desc'.",
    )
    limit: int = Field(
        default=30,
        description="Max results to return (1-100).",
    )
    summary: str = Field(
        description=(
            "Chinese summary (60-150 chars). Include: what conditions were used "
            "and how many stocks matched. "
            "Example: '在 5840 只美股中筛选 PE<15 ROE>10% 的科技股，共找到 23 只'"
        ),
    )


# ---------------------------------------------------------------------------
# Tool Functions (operate on _current_universe)
# ---------------------------------------------------------------------------

def execute_screener(
    filters_json: str,
    sort_by: str = "market_cap",
    sort_order: str = "desc",
    limit: int = 20,
) -> str:
    """Execute stock screener with filter conditions and return matching results.

    Call this tool to test filter conditions and see how many stocks match.
    Use the results to decide whether to tighten or relax conditions.
    Aim for 10-50 results for a useful screening.

    Args:
        filters_json: JSON array of filter conditions. Each item: {"field": "<field_name>", "op": "gt|gte|lt|lte|eq|neq|in", "value": <number_or_string>}. Example: [{"field": "pe_ttm", "op": "lt", "value": 15}, {"field": "roe", "op": "gt", "value": 10}]
        sort_by: Field name to sort results by. Default: market_cap
        sort_order: Sort direction, "asc" or "desc". Default: desc
        limit: Max number of preview results to return (1-50). Default: 20

    Returns:
        JSON with match_count (total matches), universe_size, and preview of top results.
    """
    try:
        filters = json.loads(filters_json)
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON in filters_json. Must be a JSON array."})

    if not isinstance(filters, list):
        return json.dumps({"error": "filters_json must be a JSON array of filter objects."})

    # Apply filters (inline to capture total match count before limiting)
    filtered = list(_current_universe.get())
    for f in filters:
        field = f.get("field")
        op = f.get("op")
        value = f.get("value")
        if not field or not op or op not in _OPS:
            continue
        filtered = [s for s in filtered if _OPS[op](s.get(field), value)]

    total_matches = len(filtered)

    # Sort
    sort_key = sort_by or "market_cap"
    valid = [s for s in filtered if s.get(sort_key) is not None]
    valid.sort(key=lambda s: s[sort_key], reverse=(sort_order == "desc"))
    top_results = valid[:min(limit, 50)]

    # Build preview with key metrics
    preview_fields = (
        "name", "sector", "price", "market_cap", "pe_ttm", "roe",
        "daily_change", "dividend_yield", "rsi", "analyst_rating",
        "revenue_growth_ttm", "change_3m",
    )
    preview = []
    for s in top_results[:10]:
        item: dict[str, Any] = {"ticker": s.get("ticker", "")}
        for key in preview_fields:
            val = s.get(key)
            if val is not None:
                item[key] = val
        preview.append(item)

    return json.dumps({
        "match_count": total_matches,
        "returned_count": len(top_results),
        "universe_size": len(_current_universe.get()),
        "preview": preview,
    }, ensure_ascii=False, default=str)


def get_field_distribution(field: str, sector: str = "") -> str:
    """Get distribution statistics for a data field to help set reasonable thresholds.

    Call this when you need to understand what values are typical for a field
    before constructing filter conditions.

    Args:
        field: Field name, e.g. "pe_ttm", "roe", "dividend_yield", "sector", "market_cap"
        sector: Optional sector name to limit scope, e.g. "Technology Services". Leave empty for all stocks.

    Returns:
        For numeric fields: min, max, mean, median, percentile_25, percentile_75, non_null_count.
        For boolean fields: true_count, false_count.
        For categorical fields: top 20 value counts.
    """
    stocks = _current_universe.get()
    if sector:
        stocks = [
            s for s in stocks
            if s.get("sector", "").lower() == sector.lower()
        ]

    values = [s.get(field) for s in stocks if s.get(field) is not None]

    if not values:
        return json.dumps({
            "field": field,
            "error": "No data available for this field",
            "non_null_count": 0,
            "total_stocks": len(stocks),
        })

    sample = values[0]

    # Boolean fields (check before numeric since bool is subclass of int)
    if isinstance(sample, bool):
        true_count = sum(1 for v in values if v is True)
        false_count = sum(1 for v in values if v is False)
        return json.dumps({
            "field": field,
            "type": "boolean",
            "true_count": true_count,
            "false_count": false_count,
            "total_stocks": len(stocks),
        })

    # Numeric fields
    if isinstance(sample, (int, float)):
        nums = []
        for v in values:
            try:
                nums.append(float(v))
            except (TypeError, ValueError):
                pass

        if not nums:
            return json.dumps({"field": field, "error": "No valid numeric data"})

        nums.sort()
        n = len(nums)
        return json.dumps({
            "field": field,
            "type": "numeric",
            "non_null_count": n,
            "total_stocks": len(stocks),
            "min": round(nums[0], 2),
            "max": round(nums[-1], 2),
            "mean": round(statistics.mean(nums), 2),
            "median": round(statistics.median(nums), 2),
            "percentile_25": round(nums[n // 4], 2),
            "percentile_75": round(nums[3 * n // 4], 2),
        })

    # Categorical fields
    counts: dict[str, int] = {}
    for v in values:
        sv = str(v)
        counts[sv] = counts.get(sv, 0) + 1

    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:20]
    return json.dumps({
        "field": field,
        "type": "categorical",
        "unique_count": len(counts),
        "total_with_value": len(values),
        "total_stocks": len(stocks),
        "top_values": [{"value": v, "count": c} for v, c in top],
    }, ensure_ascii=False)


def list_available_sectors() -> str:
    """List all available stock sectors with Chinese names and stock counts.

    Call this to see what sectors are available for filtering.

    Returns:
        JSON with total_sectors, total_stocks, and array of sectors
        (English name, Chinese name, stock count).
    """
    universe = _current_universe.get()
    counts: dict[str, int] = {}
    for s in universe:
        sector = s.get("sector")
        if sector:
            counts[sector] = counts.get(sector, 0) + 1

    result = []
    for en, zh in sorted(SECTOR_ZH.items()):
        count = counts.get(en, 0)
        if count > 0:
            result.append({"sector_en": en, "sector_zh": zh, "count": count})

    return json.dumps({
        "total_sectors": len(result),
        "total_stocks": len(universe),
        "sectors": result,
    }, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Agent Instruction
# ---------------------------------------------------------------------------

SCREENER_AGENT_INSTRUCTION = """You are a stock screening assistant for a US stock screener covering ~5,800 stocks with 71 data fields.

## How to Work

You have 3 tools:
- **execute_screener**: Test filter conditions and see matching results
- **get_field_distribution**: Check field statistics to set smart thresholds
- **list_available_sectors**: See available sectors with counts

### Always follow this workflow:
1. Understand what the user wants to filter
2. If unsure about typical field values, call `get_field_distribution` first
3. Build filter conditions and call `execute_screener` to test them
4. Check match_count:
   - 0 results: relax conditions (raise/lower thresholds) and retry
   - >100 results: tighten conditions or add more filters, then retry
   - 10-50 results: good range, use these conditions
5. Produce your final output with the conditions that gave the best results

**IMPORTANT**: You MUST call execute_screener at least once before producing your final answer.

## Available Data Fields

### Identity
- `name` (str): Company name
- `sector` (str): Sector (see sector list below)
- `industry` (str): Industry
- `beta_1y` (float): 1-year beta

### Price & Performance
- `price` (float): Current price (USD)
- `daily_change` (float): Daily change %
- `weekly_change` (float): Weekly change %
- `monthly_change` (float): Monthly change %
- `change_3m` (float): 3-month change %
- `change_6m` (float): 6-month change %
- `ytd_change` (float): Year-to-date %
- `yearly_change` (float): 1-year change %
- `high_52w` (float): 52-week high
- `low_52w` (float): 52-week low

### Valuation
- `market_cap` (float): Market cap (USD)
- `pe_ttm` (float): P/E TTM
- `pb_mrq` (float): P/B MRQ
- `ps_fy` (float): P/S FY
- `ev_ebitda_ttm` (float): EV/EBITDA TTM
- `ev_mrq` (float): Enterprise value MRQ
- `peg_ttm` (float): PEG TTM

### Profitability
- `gross_margin` (float): Gross margin % TTM
- `operating_margin` (float): Operating margin % TTM
- `net_margin` (float): Net margin % TTM
- `roe` (float): ROE % TTM
- `roa` (float): ROA % TTM
- `roic` (float): ROIC % TTM

### Growth
- `revenue_growth_ttm` (float): Revenue growth TTM YoY %
- `revenue_growth_quarterly` (float): Revenue growth quarterly YoY %
- `eps_growth_ttm` (float): EPS growth TTM YoY %
- `eps_growth_quarterly` (float): EPS growth quarterly YoY %
- `ebitda_growth_ttm` (float): EBITDA growth TTM YoY %
- `fcf_growth_ttm` (float): FCF growth TTM YoY %
- `revenue_growth_5y` (float): 5-year revenue growth %
- `eps_growth_5y` (float): 5-year EPS growth %

### Dividends
- `dividend_yield` (float): Dividend yield %
- `payout_ratio` (float): Payout ratio % TTM
- `dividend_growth_years` (int): Consecutive growth years
- `dividend_payout_years` (int): Consecutive payout years

### Earnings & Cash Flow
- `eps_ttm` (float): Diluted EPS TTM
- `net_income_fy` (float): Net income FY
- `gross_profit_fy` (float): Gross profit FY
- `fcf_margin` (float): FCF margin % TTM

### Balance Sheet
- `debt_to_equity` (float): Debt/equity MRQ
- `current_ratio` (float): Current ratio MRQ
- `cash_equivalents` (float): Cash & equivalents MRQ

### Volume
- `volume` (float): Daily volume
- `avg_volume_30d` (float): 30-day avg volume
- `relative_volume` (float): Today / 30-day avg

### Shares
- `shares_outstanding` (float): Total shares
- `shares_float` (float): Float shares
- `float_pct` (float): Float %

### Analyst
- `target_price_avg` (float): Avg target price
- `target_price_median` (float): Median target price
- `target_price_high` (float): High target
- `target_price_low` (float): Low target
- `analyst_rating` (float): 1=Strong Buy ... 5=Strong Sell

### Technical
- `rsi` (float): RSI 14
- `macd` (float): MACD 12,26
- `macd_signal` (float): MACD signal
- `sma20` / `sma50` / `sma200` (float): Simple moving averages
- `ema20` / `ema50` (float): Exponential moving averages
- `atr` (float): ATR 14
- `bb_upper` / `bb_lower` (float): Bollinger bands
- `adx` (float): ADX 14
- `cmf` (float): Chaikin Money Flow
- `stoch_k` (float): Stochastic %K

### Derived (computed)
- `pct_from_52w_high` (float): % from 52w high (negative)
- `position_52w` (float): 52w range position (0=low, 1=high)
- `above_sma200` (bool): Price > SMA200
- `above_sma50` (bool): Price > SMA50
- `analyst_upside` (float): (target_avg - price) / price * 100
- `market_cap_tier` (str): "small" (<$2B), "mid" ($2-10B), "large" ($10-200B), "mega" (>$200B)

## Sectors (English -> Chinese)
Commercial Services (商业服务), Communications (通信), Consumer Durables (耐用消费品),
Consumer Non-Durables (非耐用消费品), Consumer Services (消费服务),
Distribution Services (分销服务), Electronic Technology (电子技术),
Energy Minerals (能源矿产), Finance (金融), Health Services (医疗服务),
Health Technology (医疗技术), Industrial Services (工业服务),
Miscellaneous (其他), Non-Energy Minerals (非能源矿产),
Process Industries (加工工业), Producer Manufacturing (生产制造),
Retail Trade (零售), Technology Services (科技服务),
Transportation (运输), Utilities (公用事业)

## Operators
- gt (>), gte (>=), lt (<), lte (<=), eq (=), neq (!=), in (value in list)

## Fuzzy Expression Mapping
| User says | Map to |
|-----------|--------|
| "cheap"/"undervalued"/"便宜"/"低估" | pe_ttm < 15 |
| "expensive"/"overvalued"/"贵" | pe_ttm > 30 |
| "profitable"/"赚钱"/"盈利好" | roe > 15 |
| "high growth"/"高增长" | revenue_growth_ttm > 20 |
| "stable"/"low risk"/"稳定" | beta_1y < 1 |
| "volatile"/"risky"/"高波动" | beta_1y > 1.5 |
| "large cap"/"大盘" | market_cap_tier in ["large","mega"] |
| "small cap"/"小盘" | market_cap_tier eq "small" |
| "analysts bullish"/"分析师看好" | analyst_rating < 2.5 |
| "high dividend"/"高股息" | dividend_yield > 2 |
| "oversold"/"超卖" | rsi < 30 |
| "overbought"/"超买" | rsi > 70 |
| "trending up"/"上升趋势" | above_sma200 eq true, change_3m > 0 |
| "near 52w low"/"接近低点" | position_52w < 0.2 |
| "放量" | relative_volume > 2 |
| "tech"/"科技" | sector eq "Technology Services" |
| "finance"/"金融" | sector eq "Finance" |
| "healthcare"/"医疗" | sector in ["Health Technology","Health Services"] |
| "energy"/"能源" | sector eq "Energy Minerals" |

## Critical Output Rules

**Your `filters` output field MUST contain the exact same JSON array you passed to execute_screener in your last successful call.** Do NOT leave filters empty. Copy the filters_json string directly.

Example: if you called `execute_screener(filters_json='[{"field":"pe_ttm","op":"lt","value":15}]')`,
then your output `filters` MUST be `[{"field":"pe_ttm","op":"lt","value":15}]`.

**Your `sector` output field must be a single string or null.** If you filtered by multiple sectors, put them in the filters array using the "in" operator instead.

## Other Rules
1. **ALWAYS call execute_screener** at least once before producing your final output.
2. **Merge with existing filters**: Include ALL previous conditions from current_filters plus new ones.
3. **Modify/remove filters only on explicit request** (e.g. "remove PE condition", "change ROE to >20").
4. **Use exact field names** from the list above. Do not invent field names.
5. **Market cap is in USD** (1e9 = $1B, 10e9 = $10B).
6. **Percentages are raw numbers** (ROE 15% = 15, not 0.15).
7. **Analyst rating**: 1=Strong Buy, 5=Strong Sell. Lower = more bullish.
8. **Write summary in Chinese**, mention conditions applied and result count.
9. **Default limit 30**. Adjust if user says "top 10", "show 5", etc.
10. **If results are 0**, relax conditions and try again. Mention the adjustment in summary.
11. **If user is vague**, start with a broad filter and explain what you found.
"""


# ---------------------------------------------------------------------------
# Agent + Runner
# ---------------------------------------------------------------------------

_screener_agent = LlmAgent(
    name="screener_query",
    model="gemini-3.1-pro-preview",
    instruction=SCREENER_AGENT_INSTRUCTION,
    output_schema=ScreenerQueryOutput,
    output_key="query",
    tools=[execute_screener, get_field_distribution, list_available_sectors],
)


async def _run_agent_session(
    runner: InMemoryRunner,
    app_name: str,
    prompt: str,
    output_key: str,
) -> Dict[str, Any]:
    """Run an ADK agent session and extract structured output from state."""
    session = await runner.session_service.create_session(
        app_name=app_name, user_id="screener"
    )

    message = Content(
        parts=[Part(text=prompt)],
        role="user",
    )

    try:
        async for _ in runner.run_async(
            user_id="screener", session_id=session.id, new_message=message
        ):
            pass
    except Exception as run_err:
        # output_schema validation errors propagate here;
        # session state may still contain partial/raw results
        logger.warning("Agent run error (checking state): %s", run_err)

    session_data = await runner.session_service.get_session(
        app_name=app_name, user_id="screener", session_id=session.id
    )

    result: Dict[str, Any] = {}
    if session_data and hasattr(session_data, "state"):
        state = session_data.state or {}
        result = state.get(output_key, {})
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                result = {}

    try:
        await runner.session_service.delete_session(
            app_name=app_name, user_id="screener", session_id=session.id
        )
    except Exception:
        pass

    return result


# ---------------------------------------------------------------------------
# Wrapper Class
# ---------------------------------------------------------------------------

class ScreenerQueryAgent:
    """Natural language stock screener with tool-based reasoning."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=_screener_agent, app_name="screener_query"
        )

    async def parse(
        self,
        message: str,
        current_filters: List[Dict[str, Any]] | None = None,
        history: List[Dict[str, str]] | None = None,
        universe: list[dict] | None = None,
    ) -> Dict[str, Any]:
        """
        Parse a natural language screener query with tool-based reasoning.

        The agent will use tools to explore the data, test conditions,
        and produce refined filter conditions.

        Args:
            message: User's natural language query
            current_filters: Existing filter conditions to build upon
            history: Conversation history [{role, content/summary}]
            universe: Stock universe data (list of stock dicts)

        Returns:
            Dict with strategy, filters, sort_by, sort_order, limit, summary
        """
        # Set universe for tool access (ContextVar: coroutine-safe)
        _current_universe.set(universe if universe else [])

        prompt_parts = []

        # Conversation history
        if history:
            prompt_parts.append("## Conversation History")
            for turn in history[-5:]:  # max 5 rounds
                role = turn.get("role", "user")
                content = turn.get("content") or turn.get("summary", "")
                if role == "user":
                    prompt_parts.append(f"User: {content}")
                else:
                    prompt_parts.append(f"Assistant: {content}")
            prompt_parts.append("")

        # Current filters
        if current_filters:
            prompt_parts.append("## Current Active Filters")
            prompt_parts.append(
                "These filters are already applied. Include ALL of them "
                "in your output unless the user explicitly wants to remove one."
            )
            prompt_parts.append(json.dumps(current_filters, ensure_ascii=False))
            prompt_parts.append("")

        # Universe info
        prompt_parts.append(
            f"## Universe: {len(_current_universe.get())} stocks loaded"
        )
        prompt_parts.append("")

        # User message
        prompt_parts.append("## User's Request")
        prompt_parts.append(message)

        prompt = "\n".join(prompt_parts)

        logger.info("Screener agent query: %s", message[:100])

        try:
            result = await _run_agent_session(
                runner=self.runner,
                app_name="screener_query",
                prompt=prompt,
                output_key="query",
            )
        finally:
            # Clean up universe reference
            _current_universe.set([])

        if not result:
            logger.warning(
                "Screener agent returned empty result for: %s", message[:100]
            )
            return {
                "strategy": "custom",
                "filters": current_filters or [],
                "sort_by": None,
                "sort_order": "desc",
                "limit": 30,
                "summary": "未能理解您的筛选条件，请换个说法试试",
            }

        # Parse filters from JSON string (output_schema uses str to avoid
        # Gemini API rejecting list[dict] schemas with additional_properties)
        filters_raw = result.get("filters", "[]")
        if isinstance(filters_raw, str):
            try:
                filters = json.loads(filters_raw)
            except json.JSONDecodeError:
                filters = current_filters or []
        elif isinstance(filters_raw, list):
            filters = filters_raw
        else:
            filters = current_filters or []

        # Normalize sector: model sometimes returns a list
        sector_raw = result.get("sector")
        if isinstance(sector_raw, list):
            if len(sector_raw) == 1:
                sector_raw = sector_raw[0]
            elif len(sector_raw) > 1:
                # Multiple sectors → add "in" filter
                filters.append({
                    "field": "sector", "op": "in", "value": sector_raw
                })
                sector_raw = None

        return {
            "strategy": result.get("strategy", "custom"),
            "sector": sector_raw,
            "filters": filters,
            "sort_by": result.get("sort_by"),
            "sort_order": result.get("sort_order", "desc"),
            "limit": result.get("limit", 30),
            "summary": result.get("summary", ""),
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_agent_instance: ScreenerQueryAgent | None = None


def get_screener_agent() -> ScreenerQueryAgent:
    """Get or create the singleton screener query agent."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = ScreenerQueryAgent()
    return _agent_instance
