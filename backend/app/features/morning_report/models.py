"""
Morning report Pydantic models - structured output schema for the morning analyst agent.

These models define the shape of the AI-generated morning briefing.
Kept separate so other modules (router, email, etc.) can import
without pulling in the full agent machinery.
"""

from pydantic import BaseModel, Field


class FuturesQuote(BaseModel):
    """A single futures index quote."""

    name: str = Field(description="Futures name, e.g. 'S&P 500 Futures'")
    value: float = Field(description="Current price level, copy exactly from input data")
    daily_change: float = Field(description="Daily change percentage, copy exactly from input data")


class MarketQuote(BaseModel):
    """A single market index or asset quote."""

    name: str = Field(description="Asset name, e.g. 'Nikkei 225', 'Gold', 'BTC'")
    value: float = Field(description="Current price/level, copy exactly from input data")
    daily_change: float = Field(description="Daily change percentage, copy exactly from input data")


class GlobalSnapshot(BaseModel):
    """Global market snapshot grouped by region."""

    asia: list[MarketQuote] = Field(description="Asian market indices (Nikkei, Hang Seng, Shanghai)")
    europe: list[MarketQuote] = Field(description="European market indices (DAX, FTSE)")
    other: list[MarketQuote] = Field(description="Other key assets: Gold, US Dollar, BTC, VIX")


class OvernightItem(BaseModel):
    """An overnight news item with analysis."""

    title: str = Field(description="News headline in Chinese, concise and factual")
    analysis: str = Field(
        description="3-4 sentence analysis: why this matters for today's trading, market implications, and what investors should watch, in Chinese"
    )
    url: str = Field(
        default="",
        description="The article_id number of the source article from the input news array (e.g. '0', '3')",
    )
    published_at: str = Field(
        default="",
        description="Original article publish timestamp in ISO-8601 format, filled by Python post-processing",
    )


class TodayFocusItem(BaseModel):
    """An item to watch today (economic event, earnings, or news catalyst)."""

    title: str = Field(description="Event or focus item title in Chinese")
    analysis: str = Field(
        description="2-3 sentence analysis: what to expect, potential market impact, and key levels or metrics to watch, in Chinese"
    )
    time: str = Field(
        default="",
        description="Specific time only, e.g. '8:30 AM ET', 'BMO', 'AMC'. Leave empty if no specific scheduled time.",
    )


class SummarySection(BaseModel):
    """A summary section of the morning report."""

    title: str = Field(description="Section title in Chinese")
    content: str = Field(
        description="Section content, 1-2 paragraphs. Concise plain-language analysis in Chinese."
    )


class MorningReportOutput(BaseModel):
    """Structured output schema for the morning market briefing."""

    title: str = Field(
        description="Morning report title - one concise sentence capturing the pre-market mood, 10-25 Chinese characters"
    )
    market_pulse: str = Field(
        description="One-sentence opening prediction/mood for today's market session, 20-40 Chinese characters"
    )
    futures: list[FuturesQuote] = Field(
        description="US index futures: S&P 500, Nasdaq, Dow. Copy values exactly from input data."
    )
    futures_analysis: str = Field(
        description="2-3 sentence interpretation of futures and global market movements: what drove them, "
        "what the pattern suggests for today's session, and key levels to watch. In Chinese."
    )
    global_markets: GlobalSnapshot = Field(
        description="Global market snapshot: asia, europe, and other key assets. Copy values exactly from input data."
    )
    global_markets_analysis: str = Field(
        description="2-3 sentence summary of overnight global market reaction: what pattern is visible across regions, "
        "which assets stood out, and what this tells us about risk appetite heading into today. In Chinese."
    )
    overnight_news: list[OvernightItem] = Field(
        description="3-5 most important overnight news items, each with title and 3-4 sentence deep analysis"
    )
    today_focus: list[TodayFocusItem] = Field(
        description="3-6 things to watch today: economic data releases, earnings reports, and key catalysts. Sorted by importance."
    )
    summary: list[SummarySection] = Field(
        description="Exactly 2 sections: 1) title='overnight_review' - overnight market review and analysis; "
        "2) title='today_outlook' - forward-looking outlook for today's session"
    )
