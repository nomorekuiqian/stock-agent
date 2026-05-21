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
from app.shared.data_tools.research_tools import (
    get_company_profile,
    get_earnings_calendar,
    get_economic_calendar,
    get_historical_valuation,
    get_liquidity_overview,
    get_macro_risk_summary,
    get_market_overview,
    get_market_sentiment,
    get_peer_comparison,
    get_stock_fundamentals,
    get_stock_news,
    get_stock_quote,
)

logger = get_logger(__name__)


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

    quote, fundamentals, valuation, news, profile, earnings = await asyncio.gather(
        _safe_call("quote", get_stock_quote([symbol])),
        _safe_call("fundamentals", get_stock_fundamentals(symbol)),
        _safe_call("historical_valuation", get_historical_valuation(symbol)),
        _safe_call("news", get_stock_news([symbol], days=7)),
        _safe_call("company_profile", get_company_profile(symbol)),
        _safe_call("earnings_calendar", get_earnings_calendar(days=30)),
    )

    return _bundle({
        "symbol": symbol,
        "quote": quote,
        "fundamentals": fundamentals,
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
    """获取宏观环境全景 (一次性返回 risk summary / liquidity / market sentiment / economic calendar)。

    Use whenever the user asks about macro / Fed / rates / liquidity / market
    regime, OR as supplementary context for big-cap stock questions where
    macro tone matters. Replaces 4 separate calls (get_macro_risk_summary,
    get_liquidity_overview, get_market_sentiment, get_economic_calendar) with
    a single concurrent fetch.

    Returns:
      JSON with keys: risk_summary, liquidity, sentiment, economic_calendar.
    """
    logger.info("brief: get_macro_brief()")
    risk, liquidity, sentiment, calendar = await asyncio.gather(
        _safe_call("macro_risk", get_macro_risk_summary()),
        _safe_call("liquidity", get_liquidity_overview()),
        _safe_call("sentiment", get_market_sentiment()),
        _safe_call("economic_calendar", get_economic_calendar(days=14)),
    )

    return _bundle({
        "risk_summary": risk,
        "liquidity": liquidity,
        "sentiment": sentiment,
        "economic_calendar": calendar,
    })


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
