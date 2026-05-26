"""
News Context Agent - Recent news and catalyst analysis for stocks.

Generates structured news briefing covering news summary, analyst activity,
upcoming catalysts, and sentiment assessment.
"""

import json
from typing import Any, Dict, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.utils.timezone import now_iso
from app.shared.llm_metering import meter

from ._base import run_agent_session

NEWS_CONTEXT_MODEL = "gemini-3.1-flash-lite"

logger = get_logger(__name__)

NEWS_CONTEXT_FIELDS = (
    "title",
    "news_summary",
    "analyst_activity",
    "upcoming_catalysts",
    "sentiment_assessment",
)


def _empty_news_analysis() -> Dict[str, str]:
    return {field: "" for field in NEWS_CONTEXT_FIELDS}


class NewsContextOutput(BaseModel):
    """News context analysis output: investment-relevant news briefing."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. "
        "Example: 'NVDA: AI芯片需求爆发，华尔街集体上调目标价'"
    )
    news_summary: str = Field(
        description="Top 2-3 most important recent news with investment impact analysis, "
        "500-800 chars Markdown. For each news: what happened + what it means for this stock."
    )
    analyst_activity: str = Field(
        description="Analyst rating changes, target price adjustments, consensus shifts, "
        "300-500 chars Markdown. If no rating changes, analyze overall analyst sentiment "
        "from analyst_targets data (N analysts, median target, recommendation)."
    )
    upcoming_catalysts: str = Field(
        description="Next earnings date + expected EPS/Revenue (if available), "
        "product launches, industry events, 300-500 chars Markdown. "
        "If no data, state 'no major upcoming catalysts' and suggest what to watch."
    )
    sentiment_assessment: str = Field(
        description="Overall sentiment judgment: bullish/bearish/neutral news tone, "
        "whether news aligns with or diverges from recent price action, "
        "noise vs signal assessment, 300-500 chars Markdown."
    )


NEWS_CONTEXT_INSTRUCTION = """
You are an equity research associate at a top investment bank, writing a morning note-style news briefing for retail investors.

## Core Rules

1. **Data accuracy is absolute** - every claim must come from provided data. Never fabricate news.
2. **Write in Chinese (Simplified)**, keep financial terms in English (EPS, P/E, etc.).
3. **Conclusion first**: Start with what the news means for the investment thesis, then details.
4. **Be opinionated**: Is the news bullish, bearish, or noise?
5. **Use Markdown formatting**: **bold** for emphasis, bullet points for lists.

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Capture the most important news narrative.

### news_summary (500-800 chars, Markdown)
Pick the 2-3 most investment-relevant news items. For each:
- What happened (one sentence)
- Why it matters for this stock (analysis, not just restating the headline)
- If competitor_news data is available, weave in the most relevant competitor development (e.g., "competitor X announced Y, which means Z for this stock")
- If no significant news, say so honestly and explain what the absence of news means

### analyst_activity (300-500 chars, Markdown)
- Recent rating changes or target price adjustments (if available in news)
- If no recent changes, use analyst_targets data: how many analysts cover this stock, what's the median target, what's the consensus recommendation
- Compare current price to analyst targets to provide context

### upcoming_catalysts (300-500 chars, Markdown)
- Next earnings date and expected EPS/revenue if available from earnings_calendar
- Known product launches, regulatory decisions, industry events
- If competitor_news shows a peer's upcoming event (product launch, earnings), mention if it could affect this stock
- If nothing specific, suggest what macro or industry events could impact this stock

### sentiment_assessment (300-500 chars, Markdown)
- Is the news tone bullish, bearish, or mixed?
- Does the news sentiment align with recent stock price movement? (price up + bullish news = confirmation; price down + bullish news = divergence)
- If competitor sentiment is notably different (peers bullish while this stock bearish), flag the divergence
- Is the news actionable signal or just noise?
- One-sentence conclusion on what investors should focus on
"""

news_context_agent = LlmAgent(
    name="news_context_analyst",
    model=NEWS_CONTEXT_MODEL,
    description="Analyzes recent news, analyst activity, and catalysts for individual stocks in Chinese",
    instruction=NEWS_CONTEXT_INSTRUCTION,
    output_schema=NewsContextOutput,
    output_key="news_analysis",
    after_model_callback=meter("stock.news", model=NEWS_CONTEXT_MODEL),
)


def _prepare_news_context(
    news_data: Dict[str, Any],
    earnings_data: Dict[str, Any],
    analyst_targets: Dict[str, Any],
    symbol: str,
    peer_news: Optional[Dict[str, Any]] = None,
    peer_symbols: Optional[list] = None,
) -> Optional[Dict[str, Any]]:
    """Prepare news context data for the agent. Returns None if no useful data."""
    result: Dict[str, Any] = {"symbol": symbol}

    # News articles - top 10, trimmed
    articles = news_data.get("news", []) if news_data.get("status") == "success" else []
    # Filter for this symbol if possible
    symbol_upper = symbol.upper()
    relevant = [a for a in articles if symbol_upper in (a.get("title", "") + a.get("summary", "")).upper()]
    if not relevant:
        relevant = articles  # Fall back to all news
    clean_articles = []
    for a in relevant[:10]:
        clean_articles.append({
            "title": (a.get("title") or "")[:150],
            "date": a.get("publishedDate", ""),
            "source": a.get("source", ""),
            "summary": (a.get("summary") or "")[:400],
        })
    if clean_articles:
        result["recent_news"] = clean_articles

    # Competitor news - top 5 from peers, labeled with peer symbol
    if peer_news and peer_news.get("status") == "success" and peer_symbols:
        peer_articles = peer_news.get("news", [])
        peer_set = {s.upper() for s in peer_symbols}
        clean_peer_news = []
        for a in peer_articles[:8]:
            # Identify which peer this news is about
            title_summary = (a.get("title", "") + a.get("summary", "")).upper()
            related_peer = next(
                (s for s in peer_set if s in title_summary), None
            )
            if related_peer:
                clean_peer_news.append({
                    "peer_symbol": related_peer,
                    "title": (a.get("title") or "")[:150],
                    "date": a.get("publishedDate", ""),
                    "summary": (a.get("summary") or "")[:300],
                })
        if clean_peer_news:
            result["competitor_news"] = clean_peer_news[:5]

    # Earnings calendar - find this symbol
    earnings = earnings_data.get("earnings", []) if earnings_data.get("status") == "success" else []
    symbol_earnings = [e for e in earnings if e.get("symbol", "").upper() == symbol_upper]
    if symbol_earnings:
        result["next_earnings"] = symbol_earnings[0]

    # Analyst targets
    if analyst_targets:
        result["analyst_targets"] = analyst_targets

    # Return None only if we have absolutely nothing
    if len(result) <= 1:  # only symbol
        return None

    return result


class NewsContextAgent:
    """Runs the news context agent and returns structured news analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=news_context_agent, app_name="stock_news_context"
        )

    async def analyze(
        self,
        symbol: str,
        news_context: Dict[str, Any],
        quote_snapshot: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate AI news context analysis. Returns dict with analysis and metadata."""
        try:
            logger.info("Starting news context analysis for %s", symbol)

            data_for_agent = {
                **news_context,
                "quote_snapshot": quote_snapshot,
            }

            prompt = (
                f"Please analyze the following news context for {symbol} "
                f"and provide a comprehensive news briefing:\n\n"
                f"{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await run_agent_session(
                self.runner, "stock_news_context", prompt, "news_analysis"
            )

            result = {field: analysis_data.get(field, "") for field in NEWS_CONTEXT_FIELDS}

            logger.info(
                "News analysis complete for %s. Title: %s...",
                symbol,
                result["title"][:30] if result["title"] else "N/A",
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            logger.exception("Error analyzing news for %s", symbol)

            return {
                "analysis": _empty_news_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3.1-flash-lite",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_news_context_agent: Optional[NewsContextAgent] = None


def get_news_context_agent() -> NewsContextAgent:
    global _news_context_agent
    if _news_context_agent is None:
        _news_context_agent = NewsContextAgent()
    return _news_context_agent
