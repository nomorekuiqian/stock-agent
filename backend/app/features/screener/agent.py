"""
Screener shared infrastructure - tools, ContextVar, and session helper.

Provides the shared FunctionTools and utilities used by the ResearchAgent.
The tools operate on a per-coroutine universe ContextVar for thread safety.
"""

import contextvars
import json
import os
import statistics
from typing import Any, Dict

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

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
    Aim for 10-50 results for a useful screening. If 0 results, relax the most
    restrictive condition; if too many (>50), tighten one more dimension.

    Args:
        filters_json: JSON array of filter conditions. Each item: {"field": "<field_name>", "op": "gt|gte|lt|lte|eq|neq|in", "value": <number_or_string>}. Example: [{"field": "pe_ttm", "op": "lt", "value": 15}, {"field": "roe", "op": "gt", "value": 10}]
        sort_by: Field name to sort results by. Default: market_cap
        sort_order: Sort direction, "asc" or "desc". Default: desc
        limit: Max number of preview results to return (1-50). Default: 20

    Returns:
        JSON with match_count (total matches), universe_size, and preview of top results.

    Available fields:
        Identity: name, sector, industry, beta_1y
        Price/Performance: price, daily_change, weekly_change, monthly_change,
            change_3m, change_6m, ytd_change, yearly_change, high_52w, low_52w
        Valuation: market_cap (USD, 1e9=$1B), pe_ttm, pb_mrq, ps_fy, ev_ebitda_ttm, peg_ttm
        Profitability (% as raw numbers, ROE 15%=15): gross_margin, operating_margin,
            net_margin, roe, roa, roic
        Growth: revenue_growth_ttm, revenue_growth_quarterly, eps_growth_ttm,
            eps_growth_quarterly, ebitda_growth_ttm, fcf_growth_ttm,
            revenue_growth_5y, eps_growth_5y
        Dividends: dividend_yield, payout_ratio, dividend_growth_years, dividend_payout_years
        Balance: debt_to_equity, current_ratio, cash_equivalents
        Volume: volume, avg_volume_30d, relative_volume
        Analyst: target_price_avg, analyst_rating (1=Strong Buy, 5=Strong Sell)
        Technical: rsi, sma50, sma200, above_sma50, above_sma200
        Derived: position_52w (0=52w low, 1=52w high), analyst_upside (% to target),
            market_cap_tier ("small" <$2B, "mid" $2-10B, "large" $10-200B, "mega" >$200B)

    Operators: gt (>), gte (>=), lt (<), lte (<=), eq (=), neq (!=), in (value in list)

    Preference → filter cheatsheet (translate user intent to filters):
        "stable"/"safe"/"steady"  → market_cap_tier in ["large","mega"], beta_1y < 1
        "dividends"/"income"      → dividend_yield > 2, dividend_payout_years >= 5
        "growth"/"fast growing"   → revenue_growth_ttm > 20, eps_growth_ttm > 15
        "cheap"/"undervalued"     → pe_ttm < 15, position_52w < 0.4
        "trending"/"momentum"     → change_3m > 10, above_sma50 eq true
        "earnings beat"           → eps_growth_quarterly > 0, revenue_growth_quarterly > 0
        "white horse"/"白马股"    → roe > 15, pe_ttm < 25, market_cap_tier in ["large","mega"]
        "tech"                    → sector eq "Technology Services"
        "healthcare"              → sector in ["Health Technology","Health Services"]
        "big company"             → market_cap_tier in ["large","mega"]
        "small company"           → market_cap_tier eq "small"
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
        raw_sym = s.get("symbol", "")
        item: dict[str, Any] = {"ticker": raw_sym.split(":")[-1] if raw_sym else ""}
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


def filter_by_tickers(
    tickers: list[str],
    sort_by: str = "market_cap",
    sort_order: str = "desc",
) -> str:
    """Filter stocks by a list of ticker symbols. Use this when the user asks about
    a thematic group that doesn't map to standard sector/industry filters,
    e.g. "crypto stocks", "AI chips", "weight-loss drugs", "space companies",
    "nuclear energy", "quantum computing", etc.

    Rely on your own world knowledge to decide which tickers belong to the theme.
    Be EXHAUSTIVE - list every ticker you can think of (aim for 20-50+).
    The tool automatically ignores tickers not in our universe, so there is
    zero cost to including more. More candidates = better narrowing later.

    Args:
        tickers: List of ticker symbols. Include as many as possible, e.g. for crypto: ["COIN", "MARA", "RIOT", "MSTR", "CLSK", "HUT", "BITF", "CIFR", "BTBT", "HIVE", "ARBK", "IREN", "CORZ", "WULF", "SQ", "PYPL", "HOOD", "GBTC", "ETHE", ...]
        sort_by: Field to sort by. Default: market_cap
        sort_order: "asc" or "desc". Default: desc

    Returns:
        JSON with match_count, universe_size, and matched stocks with full data.
    """
    if not isinstance(tickers, list):
        return json.dumps({"error": "tickers must be a list of strings."})

    ticker_set = {t.upper().strip() for t in tickers if isinstance(t, str)}

    matched = []
    for s in _current_universe.get():
        raw_sym = s.get("symbol", "")
        clean = raw_sym.split(":")[-1].upper() if raw_sym else ""
        if clean in ticker_set:
            matched.append(s)

    # Sort
    sort_key = sort_by or "market_cap"
    valid = [s for s in matched if s.get(sort_key) is not None]
    valid.sort(key=lambda s: s[sort_key], reverse=(sort_order == "desc"))

    # Build preview
    preview_fields = (
        "name", "sector", "industry", "price", "market_cap", "pe_ttm", "roe",
        "daily_change", "dividend_yield", "rsi", "analyst_rating",
        "revenue_growth_ttm", "change_3m",
    )
    preview = []
    for s in valid[:15]:
        raw_sym = s.get("symbol", "")
        item: dict[str, Any] = {"ticker": raw_sym.split(":")[-1] if raw_sym else ""}
        for key in preview_fields:
            val = s.get(key)
            if val is not None:
                item[key] = val
        preview.append(item)

    found_tickers = {s.get("symbol", "").split(":")[-1].upper() for s in matched}
    not_found = sorted(ticker_set - found_tickers)

    return json.dumps({
        "match_count": len(matched),
        "universe_size": len(_current_universe.get()),
        "not_in_universe": not_found,
        "preview": preview,
    }, ensure_ascii=False, default=str)


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
# Agent Session Helper
# ---------------------------------------------------------------------------


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


