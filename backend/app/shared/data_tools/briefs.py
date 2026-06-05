"""Brief-level data tools — composite views matching analyst thinking units.

Each brief bundles multiple fine-grained FMP / data calls into a single tool
exposed to the LLM. Rationale:

- Analysts (like @qinbafrank) think in "give me the whole picture of this
  ticker" units, not "fetch FMP quote endpoint" units. Splitting tools by API
  endpoint forces the LLM to chain 6-8 serial calls per turn, each with 3-5s
  of decision overhead, before it can write a single sentence.
- Briefs concurrent-fetch the same underlying data once and hand the LLM a
  compact JSON blob in 2-3s. The LLM does its own reasoning on that blob
  instead of chaining calls.

Briefs do NOT replace the fine-grained tools — those still serve the neutral
/research agent. They are an additional, coarser-grained layer specifically
chosen by `kol_research/agent.py`.

Partial-fail policy: if a sub-call raises, that section is reported as
`{"error": "..."}` in the output. The whole brief never fails — analysts
should still get the data they can.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable

from app.core.logging import get_logger
from app.features.macro.cache.db import get_cached_many, get_cache_data, is_cache_valid
from app.shared.data_tools.research_tools import (
    get_company_profile,
    get_earnings_calendar,
    get_forward_valuation,
    get_historical_valuation,
    get_market_overview,
    get_peer_comparison,
    get_stock_fundamentals,
    get_stock_news,
    get_stock_quote,
)

logger = get_logger(__name__)

_MACRO_BRIEF_CACHE_SECTIONS: dict[str, tuple[str, ...]] = {
    "risk_summary": ("macro:dashboard",),
    "liquidity": ("fred:liquidity_metrics",),
    "sentiment": ("macro:sentiment",),
    "economic_calendar": ("macro:economic_calendar",),
    "treasury_rates": ("macro:treasury_rates",),
    "economy": ("macro:economy",),
    # :v2 is the current schema; legacy key kept only for backwards compat
    "inflation_rates": ("macro:inflation_rates:v2", "macro:inflation_rates"),
    "cpi_breakdown": ("fred:cpi_breakdown",),
    "liquidity_percentiles": ("macro:liquidity_percentiles",),
    "global_liquidity": ("fred:global_liquidity",),
    "trend_context": ("macro:trend_context",),
}


async def _safe_call(name: str, coro: Awaitable[str]) -> Any:
    """Run a sub-call and return parsed JSON (or an error stub on failure)."""
    try:
        raw = await coro
    except Exception as exc:  # noqa: BLE001 — never let one sub-call sink the brief
        logger.warning("brief sub-call %s failed: %s", name, exc)
        return {"error": "%s: %s" % (type(exc).__name__, str(exc)[:200])}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        # Some fine-grained tools return plain text. Wrap it so the brief
        # output is always structured.
        return {"text": raw if isinstance(raw, str) else str(raw)}


def _bundle(sections: dict[str, Any]) -> str:
    """Serialize a brief payload as compact JSON for the LLM."""
    return json.dumps(sections, ensure_ascii=False, default=str)


def _unique_macro_cache_keys() -> list[str]:
    seen: set[str] = set()
    keys: list[str] = []
    for aliases in _MACRO_BRIEF_CACHE_SECTIONS.values():
        for key in aliases:
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def _pick_cache_row(
    rows: dict[str, dict[str, Any] | None],
    keys: tuple[str, ...],
) -> tuple[str, dict[str, Any] | None]:
    candidates = [
        (key, row)
        for key in keys
        if (row := rows.get(key)) is not None and get_cache_data(row) is not None
    ]
    for key, row in candidates:
        if is_cache_valid(row):
            return key, row
    if candidates:
        return candidates[0]
    return keys[0], None


def _cache_meta(key: str, row: dict[str, Any] | None) -> dict[str, Any]:
    data = get_cache_data(row)
    valid = is_cache_valid(row)
    return {
        "cache_key": key,
        "available": data is not None,
        "is_valid": valid,
        "is_stale": data is not None and not valid,
        "fetched_at": row.get("fetched_at") if row else None,
        "expires_at": row.get("expires_at") if row else None,
        "source": row.get("source") if row else None,
        "last_error": row.get("error") if row else None,
    }


def _summarize_dashboard(data: Any) -> Any:
    if not isinstance(data, dict):
        return data

    categories = []
    for cat in data.get("categories", []) or []:
        if not isinstance(cat, dict):
            continue
        categories.append({
            "name": cat.get("category_name") or cat.get("name"),
            "score": cat.get("risk_score") if "risk_score" in cat else cat.get("score"),
            "level": cat.get("risk_level") or cat.get("level"),
            "headline": cat.get("headline"),
        })

    summary = {
        "composite_score": data.get("composite_score"),
        "composite_level": data.get("composite_level"),
        "categories": categories,
    }
    if data.get("liquidity_summary"):
        summary["liquidity_summary"] = data["liquidity_summary"]
    return summary


def _summarize_fundamentals(data: Any) -> Any:
    if not isinstance(data, dict):
        return data

    sub_dims = []
    for dim in data.get("sub_dimensions", []) or []:
        if not isinstance(dim, dict):
            continue
        sub_dims.append({
            "name": dim.get("name"),
            "name_zh": dim.get("name_zh"),
            "score": dim.get("score"),
            "risk_level": dim.get("risk_level"),
            "headline": dim.get("headline"),
        })

    return {
        "overall_score": data.get("overall_score"),
        "overall_level": data.get("overall_level"),
        "overall_headline": data.get("overall_headline"),
        "sub_dimensions": sub_dims,
    }


def _summarize_liquidity(data: Any) -> Any:
    if not isinstance(data, dict):
        return data

    trimmed = {}
    for key, metric in data.items():
        if not isinstance(metric, dict):
            continue
        trimmed[key] = {
            "title": metric.get("title", key),
            "value": metric.get("value"),
            "date": metric.get("date", ""),
            "change": metric.get("change"),
        }
    return trimmed


def _summarize_cpi_breakdown(data: Any) -> Any:
    if not isinstance(data, dict):
        return data

    components = []
    for component in data.get("components", []) or []:
        if not isinstance(component, dict):
            continue
        components.append({
            "name": component.get("name"),
            "name_zh": component.get("name_zh"),
            "date": component.get("date"),
            "yoy_pct": component.get("yoy_pct"),
            "mom_pct": component.get("mom_pct"),
        })
    return {
        "timestamp": data.get("timestamp"),
        "components": components,
    }


def _summarize_calendar(data: Any) -> Any:
    if not isinstance(data, dict):
        return data

    events = []
    for event in data.get("events", []) or []:
        if not isinstance(event, dict):
            continue
        events.append({
            "date": event.get("date", ""),
            "event": event.get("event", ""),
            "previous": event.get("previous"),
            "estimate": event.get("estimate"),
            "actual": event.get("actual"),
            "is_key_event": event.get("is_key_event", False),
        })
    return {
        "events_count": len(events),
        "events": events,
    }


def _summarize_macro_section(section: str, data: Any) -> Any:
    if section == "risk_summary":
        return _summarize_dashboard(data)
    if section == "liquidity":
        return _summarize_liquidity(data)
    if section in {"sentiment", "economy", "inflation_rates"}:
        return _summarize_fundamentals(data)
    if section == "cpi_breakdown":
        return _summarize_cpi_breakdown(data)
    if section == "economic_calendar":
        return _summarize_calendar(data)
    return data


async def _get_symbol_earnings_calendar(symbol: str, days: int = 90) -> str:
    raw = await get_earnings_calendar(days=days)
    data = json.loads(raw)
    earnings = [
        item
        for item in data.get("earnings", []) or []
        if (item.get("symbol") or "").upper() == symbol.upper()
    ]
    return _bundle({
        "symbol": symbol.upper(),
        "earnings_count": len(earnings),
        "earnings": earnings,
        "date_range": data.get("date_range"),
        "source": data.get("source"),
        "filter": "symbol_specific",
    })


def _company_tokens(profile: Any) -> set[str]:
    if not isinstance(profile, dict):
        return set()
    name = (profile.get("name") or "").lower()
    stop = {
        "inc", "inc.", "corp", "corp.", "corporation", "company", "group",
        "holdings", "holding", "limited", "ltd", "plc", "class",
    }
    return {
        token.strip(".,'\"()[]")
        for token in name.replace("-", " ").split()
        if len(token.strip(".,'\"()[]")) >= 4
        and token.strip(".,'\"()[]") not in stop
    }


def _filter_symbol_news(news: Any, *, symbol: str, profile: Any) -> Any:
    if not isinstance(news, dict):
        return news
    articles = news.get("news")
    if not isinstance(articles, list):
        return news

    tokens = _company_tokens(profile)
    symbol_upper = symbol.upper()
    kept = []
    dropped = 0
    for item in articles:
        if not isinstance(item, dict):
            continue
        haystack = " ".join([
            str(item.get("title") or ""),
            str(item.get("url") or ""),
        ])
        haystack_lower = haystack.lower()
        if symbol_upper in haystack.upper() or any(token in haystack_lower for token in tokens):
            kept.append(item)
        else:
            dropped += 1

    cleaned = dict(news)
    cleaned["news"] = kept
    cleaned["news_count"] = len(kept)
    if dropped:
        cleaned["filtered_out_count"] = dropped
        cleaned["filter"] = "symbol_or_company_name"
    return cleaned


def _filter_post_ipo_valuation(valuation: Any, profile: Any) -> Any:
    if not isinstance(valuation, dict) or not isinstance(profile, dict):
        return valuation
    ipo_date = profile.get("ipo_date")
    if not isinstance(ipo_date, str) or len(ipo_date) < 4:
        return valuation
    try:
        ipo_year = int(ipo_date[:4])
    except ValueError:
        return valuation

    metrics = valuation.get("annual_metrics")
    if not isinstance(metrics, list):
        return valuation
    kept = []
    for row in metrics:
        if not isinstance(row, dict):
            continue
        date = row.get("date")
        if not isinstance(date, str) or len(date) < 4:
            continue
        try:
            row_year = int(date[:4])
        except ValueError:
            continue
        if row_year >= ipo_year:
            kept.append(row)
    if len(kept) == len(metrics):
        return valuation

    cleaned = dict(valuation)
    cleaned["annual_metrics"] = kept
    cleaned["filtered_out_pre_ipo_count"] = len(metrics) - len(kept)
    cleaned["filter"] = "post_ipo_only"
    cleaned["ipo_date"] = ipo_date
    return cleaned


async def get_stock_brief(symbol: str) -> str:
    """获取一只股票的完整画像 (一次性返回 quote / fundamentals / valuation / news / company profile / earnings calendar)。

    Use this as the **first call** whenever the user asks about a specific stock ticker.
    One brief replaces 6 separate calls (get_stock_quote, get_stock_fundamentals,
    get_historical_valuation, get_stock_news, get_company_profile, get_earnings_calendar)
    and runs them concurrently for ~2-3s total instead of ~10-15s serial.

    Args:
      symbol: Stock ticker (e.g. "NVDA", "MRVL"). Case-insensitive.

    Returns:
      JSON with keys: symbol, quote, fundamentals, historical_valuation, news,
      company_profile, earnings_calendar. Each section is either the parsed
      data or {"error": "..."} if its sub-call failed.
    """
    symbol = (symbol or "").strip().upper()
    if not symbol:
        return _bundle({"error": "No symbol provided"})

    logger.info("brief: get_stock_brief(%s)", symbol)

    quote, fundamentals, forward_valuation, valuation, news, profile, earnings = await asyncio.gather(
        _safe_call("quote", get_stock_quote([symbol])),
        _safe_call("fundamentals", get_stock_fundamentals(symbol)),
        _safe_call("forward_valuation", get_forward_valuation(symbol)),
        _safe_call("historical_valuation", get_historical_valuation(symbol)),
        _safe_call("news", get_stock_news([symbol], days=7)),
        _safe_call("company_profile", get_company_profile(symbol)),
        _safe_call("earnings_calendar", _get_symbol_earnings_calendar(symbol, days=90)),
    )
    news = _filter_symbol_news(news, symbol=symbol, profile=profile)
    valuation = _filter_post_ipo_valuation(valuation, profile)

    return _bundle({
        "symbol": symbol,
        "quote": quote,
        "fundamentals": fundamentals,
        "forward_valuation": forward_valuation,
        "historical_valuation": valuation,
        "news_7d": news,
        "company_profile": profile,
        "earnings_calendar": earnings,
    })


async def get_peer_brief(symbol: str) -> str:
    """获取一只股票的同行估值对比。

    Use when comparing a stock's valuation against industry peers. Currently a
    thin wrapper over get_peer_comparison, but kept as a brief for symmetry
    with get_stock_brief and so we can fan out to industry_pe / sector_pe in
    the future without changing the LLM-facing tool surface.

    Args:
      symbol: Stock ticker.

    Returns:
      JSON with company_metrics + peers list (each with metrics).
    """
    symbol = (symbol or "").strip().upper()
    if not symbol:
        return _bundle({"error": "No symbol provided"})

    logger.info("brief: get_peer_brief(%s)", symbol)
    peers = await _safe_call("peer_comparison", get_peer_comparison(symbol))
    return _bundle({"symbol": symbol, "peer_comparison": peers})


async def get_macro_brief() -> str:
    """获取宏观环境全景，在线路径只读取 macro_data_cache 数据库快照。

    Use whenever the user asks about macro / Fed / rates / liquidity / market
    regime, OR as supplementary context for big-cap stock questions where macro
    tone matters. This tool is DB-only by design: external FRED/FMP refreshes
    happen in the macro cache cron path, not during a user-facing agent turn.

    Returns:
      JSON with macro sections plus cache freshness metadata. Stale cache data
      is returned with `is_stale=true` instead of falling through to FRED.
    """
    logger.info("brief: get_macro_brief(db_only)")
    rows = await get_cached_many(_unique_macro_cache_keys())

    payload: dict[str, Any] = {}
    freshness: dict[str, Any] = {}
    missing: list[str] = []
    stale: list[str] = []
    valid: list[str] = []

    for section, keys in _MACRO_BRIEF_CACHE_SECTIONS.items():
        key, row = _pick_cache_row(rows, keys)
        data = get_cache_data(row)
        meta = _cache_meta(key, row)
        freshness[section] = meta

        if data is None:
            missing.append(section)
            payload[section] = {
                "error": "macro cache entry is missing",
                "cache_key": key,
            }
            continue

        if meta["is_stale"]:
            stale.append(section)
        else:
            valid.append(section)
        payload[section] = _summarize_macro_section(section, data)

    payload["cache"] = {
        "policy": "db_only",
        "valid_sections": valid,
        "stale_sections": stale,
        "missing_sections": missing,
        "freshness": freshness,
    }
    if len(missing) == len(_MACRO_BRIEF_CACHE_SECTIONS):
        payload["error"] = "macro cache unavailable"
        logger.error(
            "get_macro_brief: all %d macro cache sections missing — refresher likely down",
            len(_MACRO_BRIEF_CACHE_SECTIONS),
        )

    return _bundle(payload)


async def get_industry_brief(symbol: str) -> str:
    """获取一个行业 / 板块的鸟瞰 (大盘概况 + 同行对比)。

    Use when the user asks about an industry, sector, or "how is X chain
    doing". Combines get_market_overview + get_peer_comparison so the LLM has
    both top-down (market) and bottom-up (peers) context in one call.

    Args:
      symbol: A representative stock symbol for the industry (e.g. "NVDA" for
        AI infrastructure, "JPM" for banks).

    Returns:
      JSON with market_overview + peer_comparison.
    """
    symbol = (symbol or "").strip().upper()
    if not symbol:
        return _bundle({"error": "No symbol provided"})

    logger.info("brief: get_industry_brief(%s)", symbol)
    market, peers = await asyncio.gather(
        _safe_call("market_overview", get_market_overview()),
        _safe_call("peer_comparison", get_peer_comparison(symbol)),
    )
    return _bundle({
        "symbol": symbol,
        "market_overview": market,
        "peer_comparison": peers,
    })


# Export list for tool registration
brief_tools: list[Callable[..., Awaitable[str]]] = [
    get_stock_brief,
    get_peer_brief,
    get_macro_brief,
    get_industry_brief,
]
