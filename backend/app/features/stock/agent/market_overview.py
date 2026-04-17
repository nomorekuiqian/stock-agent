"""
Market Overview Agent - Comprehensive market-facing synthesis for a single stock.

Ingests 12 data sources (news, press releases, analyst grades, price targets,
insider activity, peers, market heat, sector performance, earnings calendar,
macro snapshot) and produces a 6-section structured Chinese briefing that
surfaces cross-dimensional signal coherence.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso

from ._base import run_agent_session

logger = get_logger(__name__)

MARKET_OVERVIEW_FIELDS = (
    "title",
    "narrative",
    "analyst_signals",
    "capital_and_insider",
    "catalysts_and_events",
    "signal_coherence",
)


def _empty_market_overview() -> Dict[str, str]:
    return {field: "" for field in MARKET_OVERVIEW_FIELDS}


class MarketOverviewOutput(BaseModel):
    """Comprehensive market briefing output (6 sections, Chinese)."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. Example: "
        "'AAPL: 评级共识转向 Buy,但内部人持续净卖出'"
    )
    narrative: str = Field(
        description="Core narrative (400-700 chars Markdown): what is the market "
        "talking about right now? What is the main tension or debate? "
        "Weave in the most important news + press releases."
    )
    analyst_signals: str = Field(
        description="Analyst signal block (300-500 chars Markdown): consensus "
        "direction (strongBuy/buy/hold mix), recent upgrades/downgrades with "
        "firm names, target price direction vs current price, whether the "
        "12-month rating trend is improving or deteriorating."
    )
    capital_and_insider: str = Field(
        description="Capital flow & insider block (300-500 chars Markdown): "
        "insider net flow (buy/sell) and what it signals, peer relative "
        "performance (is this stock keeping up with MSFT/GOOGL etc.), "
        "market heat (on gainers/losers/most-active lists?)."
    )
    catalysts_and_events: str = Field(
        description="Event-driven block (300-500 chars Markdown): next earnings "
        "countdown + EPS estimate, notable press releases (product, M&A, "
        "guidance), near-term macro/industry events that could move the stock."
    )
    signal_coherence: str = Field(
        description="Signal coherence (300-500 chars Markdown): do the "
        "dimensions (analyst/insider/peer/price/macro) agree or disagree? "
        "Explicitly call out divergences. Close with what investors should "
        "watch to resolve the tension. Do not give a buy/sell recommendation."
    )


MARKET_OVERVIEW_INSTRUCTION = """
You are a senior equity research analyst. You are writing a **market-facing** single-stock briefing for retail investors, synthesising multiple data streams into a cross-dimensional view.

## Core Rules

1. **Data accuracy is absolute** — every factual claim must come from the provided data. Never fabricate.
2. **Write in Chinese (Simplified)**; keep financial terms in English (EPS, P/E, etc.).
3. **Conclusion-first** at the top of each section.
4. **Be opinionated but not prescriptive** — do NOT say "buy" or "sell". Point out signals and tensions instead.
5. **Use Markdown formatting**: **bold** for emphasis, bullet points where helpful.
6. **Favor cross-dimensional analysis** — the value of this briefing is connecting dots across data types. For example: analyst upgrade + insider selling = divergence worth flagging.

## Section Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Capture the single most important insight (especially divergences). Example: "NVDA: 评级集体上调,但同行均在跑赢,相对表现走弱".

### narrative (400-700 chars)
What is the market talking about for this stock right now? What is the main tension/debate? Weave in the 2-3 most investment-relevant news + press releases. If news is sparse, say so honestly.

### analyst_signals (300-500 chars)
- Consensus (strongBuy + buy vs hold vs sell mix) and whether it's improving
- Any recent upgrades/downgrades/initiations — name the firm, direction
- Target price vs current price (upside %) + how the consensus has moved in last 1-3 months
- 12-month rating trend: is consensus shifting bullish/bearish?

### capital_and_insider (300-500 chars)
- Insider net flow last quarter: positive (net buy) or negative (net sell) and scale
- Peer comparison: is this stock underperforming / outperforming MSFT-type peers?
- Market heat: is the stock on today's gainers/losers/most-active top lists?
- What does the combination signal?

### catalysts_and_events (300-500 chars)
- Next earnings date (if within the data), days until, EPS estimate if available
- Notable press releases (product launches, M&A, guidance, legal/regulatory)
- Near-term macro or industry events that could move the stock
- If nothing specific, suggest what would be the next catalyst to watch

### signal_coherence (300-500 chars)
This is the highest-value section. Look at ALL the dimensions and ask: do they agree?
- Bullish signals: (list)
- Bearish/cautionary signals: (list)
- If they mostly agree → state the thesis clearly
- If they diverge → explicitly call out the divergence and what it means
- Close with: "Key signpost to watch next" — one concrete data point that would resolve the tension
- DO NOT give a buy/sell recommendation. Just surface signals.
"""

market_overview_agent = LlmAgent(
    name="market_overview_analyst",
    model="gemini-3.1-flash-lite-preview",
    description=(
        "Comprehensive market-facing synthesis for single-stock briefing, "
        "combining news, analyst grades, insider, peers, and macro context"
    ),
    instruction=MARKET_OVERVIEW_INSTRUCTION,
    output_schema=MarketOverviewOutput,
    output_key="market_overview_analysis",
)


def _prepare_market_overview_context(
    symbol: str,
    quote: Optional[Dict[str, Any]] = None,
    news: Optional[list] = None,
    press_releases: Optional[list] = None,
    grades_summary: Optional[Dict[str, Any]] = None,
    grades_recent: Optional[list] = None,
    grades_historical: Optional[list] = None,
    price_target: Optional[Dict[str, Any]] = None,
    insider_stats: Optional[list] = None,
    insider_trades: Optional[list] = None,
    peers_comparison: Optional[list] = None,
    market_heat: Optional[Dict[str, Any]] = None,
    sector_perf: Optional[Dict[str, Any]] = None,
    next_earnings: Optional[Dict[str, Any]] = None,
    macro_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Assemble a compact context blob for the LLM. Trims verbose fields."""
    ctx: Dict[str, Any] = {"symbol": symbol}

    if quote:
        ctx["quote"] = {
            "price": quote.get("price"),
            "change_pct_today": quote.get("daily_change") or quote.get("changesPercentage"),
        }

    if news:
        ctx["recent_news"] = [
            {
                "title": (a.get("title") or "")[:150],
                "date": a.get("publishedDate") or a.get("date"),
                "source": a.get("source") or a.get("publisher"),
            }
            for a in news[:15]
        ]

    if press_releases:
        ctx["press_releases"] = [
            {
                "title": (r.get("title") or "")[:150],
                "date": r.get("published_date") or r.get("publishedDate"),
                "publisher": r.get("publisher"),
                "preview": (r.get("preview") or r.get("text") or "")[:200],
            }
            for r in press_releases[:8]
        ]

    if grades_summary:
        ctx["analyst_consensus"] = grades_summary

    if grades_recent:
        ctx["recent_grade_changes"] = [
            {
                "date": g.get("date"),
                "firm": g.get("firm") or g.get("gradingCompany"),
                "from": g.get("previous_grade") or g.get("previousGrade"),
                "to": g.get("new_grade") or g.get("newGrade"),
                "action": g.get("action"),
            }
            for g in grades_recent[:12]
        ]

    if grades_historical:
        # Keep just 3-4 historical points: most recent, ~3m, ~6m, ~12m
        picks = []
        for idx in (-1, -4, -7, -12):
            try:
                picks.append(grades_historical[idx])
            except IndexError:
                continue
        ctx["grade_history_snapshots"] = picks

    if price_target:
        ctx["price_target"] = price_target

    if insider_stats:
        ctx["insider_stats_recent"] = insider_stats[:2]

    if insider_trades:
        ctx["insider_trades_recent"] = [
            {
                "date": t.get("transaction_date") or t.get("filing_date"),
                "name": t.get("reporting_name"),
                "type": t.get("transaction_type"),
                "shares": t.get("securities_transacted"),
                "price": t.get("price"),
                "direction": t.get("acquisition_or_disposition"),
            }
            for t in (insider_trades or [])[:5]
        ]

    if peers_comparison:
        ctx["peers"] = peers_comparison

    if market_heat:
        ctx["market_heat"] = market_heat

    if sector_perf:
        ctx["sector_performance"] = sector_perf

    if next_earnings:
        ctx["next_earnings"] = next_earnings

    if macro_snapshot:
        ctx["macro_snapshot"] = macro_snapshot

    return ctx


class MarketOverviewAgent:
    """Runs the market overview agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=market_overview_agent, app_name="stock_market_overview"
        )

    async def analyze(self, symbol: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI market overview analysis. Returns dict with analysis + metadata."""
        try:
            logger.info("Starting market overview analysis for %s", symbol)

            prompt = (
                f"Please synthesize the following multi-dimensional data for {symbol} "
                f"into a comprehensive market-facing briefing:\n\n"
                f"{json.dumps(context, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_market_overview", prompt, "market_overview_analysis"
            )

            result = {field: analysis_data.get(field, "") for field in MARKET_OVERVIEW_FIELDS}

            logger.info(
                "Market overview analysis complete for %s. Title: %s...",
                symbol,
                result["title"][:30] if result["title"] else "N/A",
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing market overview for %s", symbol)
            return {
                "analysis": _empty_market_overview(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_market_overview_agent_instance: Optional[MarketOverviewAgent] = None


def get_market_overview_agent() -> MarketOverviewAgent:
    global _market_overview_agent_instance
    if _market_overview_agent_instance is None:
        _market_overview_agent_instance = MarketOverviewAgent()
    return _market_overview_agent_instance
