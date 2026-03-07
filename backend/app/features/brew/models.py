"""
Digest feature models - request/response schemas for personalized digest.

Contains both API models (request/response) and the PersonalDigestOutput
schema used by the ADK agent for structured output.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


# =============================================================================
# API Request/Response Models (from request_models.py)
# =============================================================================


class DigestRequest(BaseModel):
    """Request model for generating personalized digest"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "symbols": ["AAPL", "MSFT", "NVDA", "TSLA"],
            }
        }
    )

    symbols: list[str] = Field(default=[], description="User watchlist symbols to analyze")


class StockAnalysis(BaseModel):
    """Individual stock summary in the digest"""
    symbol: str = Field(..., description="Stock ticker symbol")
    name: str = Field(..., description="Company name in Chinese")
    price: float = Field(..., description="Current stock price")
    daily_change: str = Field(..., description="Daily change with percentage")
    week_change: str = Field(..., description="Weekly change with percentage")
    status: str = Field(..., description="Brief status in Chinese")
    quick_take: str = Field(..., description="1-2 sentence analysis in Chinese")


class DigestHeadlineNews(BaseModel):
    """Important news with deep analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    fact_summary: str = Field(..., description="One sentence factual summary")
    deep_analysis: str = Field(..., description="5-6 sentence deep analysis")
    url: str = Field(default="", description="Original article URL")


class DigestBriefNews(BaseModel):
    """Other notable news with brief analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    summary: str = Field(..., description="One sentence summary")
    analysis: str = Field(..., description="2-3 sentence analysis")
    url: str = Field(default="", description="Original article URL")


class DigestNewsSection(BaseModel):
    """News section with headlines and briefs"""
    headlines: list[DigestHeadlineNews] = Field(default=[], description="3-4 important news with deep analysis")
    briefs: list[DigestBriefNews] = Field(default=[], description="8-10 other news with brief analysis")


class DigestEvent(BaseModel):
    """Upcoming event relevant to user's watchlist"""
    date: str = Field(..., description="Event date in YYYY-MM-DD format")
    event: str = Field(..., description="Event name in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    why_important: str = Field(..., description="Why this matters for user's holdings")


class DigestSummary(BaseModel):
    """Comprehensive summary in 3 paragraphs"""
    content: str = Field(default="", description="Three paragraphs: portfolio recap, movement drivers, outlook")


class DigestResponse(BaseModel):
    """Response model for personalized digest (PersonalDigest output)"""
    success: bool = Field(default=True, description="Whether generation was successful")
    timestamp: str = Field(..., description="Generation timestamp")
    symbols_used: list[str] = Field(default=[], description="Symbols used for analysis")

    # Header
    greeting: str = Field(default="", description="Personalized greeting with date")
    one_line_summary: str = Field(default="", description="One sentence portfolio summary")

    # Section 1: Portfolio Overview
    stocks: list[StockAnalysis] = Field(default=[], description="Summary for each stock")

    # Section 2: News (Headlines + Briefs)
    news: DigestNewsSection = Field(default_factory=DigestNewsSection, description="News with headlines and briefs")

    # Section 3: Upcoming Events
    events: list[DigestEvent] = Field(default=[], description="Upcoming events within 7 days")

    # Section 4: Summary (replaces macro_impact + bottom_line)
    summary: DigestSummary = Field(default_factory=DigestSummary, description="Comprehensive summary")

    # Cache indicator
    from_cache: bool = Field(default=False, description="Whether this digest was returned from cache")

    # Error handling
    error: Optional[str] = Field(None, description="Error message if generation failed")


# =============================================================================
# Agent Output Schema (from personal_digest.py)
# =============================================================================


class StockSummary(BaseModel):
    """Individual stock summary in the digest."""

    symbol: str = Field(description="Stock ticker symbol, e.g., 'NVDA'")
    name: str = Field(
        description="Chinese company name, e.g., '英伟达', '苹果', '特斯拉'"
    )
    price: float = Field(
        description="Current stock price from input data, must be accurate"
    )
    daily_change: str = Field(
        description="Daily change with +/- sign, e.g., '+2.35%' or '-1.20%'"
    )
    week_change: str = Field(
        description="Weekly change with +/- sign, e.g., '+5.2%' or '-3.1%'"
    )
    status: str = Field(
        description="Natural language status - describe what's happening, not a fixed category. "
        "Good: '连涨四天后首次回调', '财报后持续消化中', '跟随板块反弹', '创一个月新高'. "
        "Bad: '强势上涨', '小幅回调' (too template-like)"
    )
    quick_take: str = Field(
        description="3-4 sentences with clear logic chain: "
        "1) What happened today (price action), "
        "2) Why it happened (news catalyst, sentiment shift, sector rotation), "
        "3) Market's interpretation (institutional behavior, narrative change), "
        "4) What it means going forward. "
        "Focus on news, sentiment, narrative - NOT technical analysis (no support/resistance levels)."
    )


class HeadlineNews(BaseModel):
    """Important news with deep analysis."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this affects, e.g., ['NVDA', 'AMD']"
    )
    fact_summary: str = Field(
        description="One sentence: factual summary of what happened"
    )
    deep_analysis: str = Field(
        description="5-6 sentences: "
        "1) background context, "
        "2) why this news matters, "
        "3) market/sector implications, "
        "4) specific impact on user's watched stocks,"
        "5) what to watch next"
    )
    url: str = Field(description="Original article URL from input data")


class BriefNews(BaseModel):
    """Other notable news with brief analysis."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this affects"
    )
    summary: str = Field(description="One sentence: what happened")
    analysis: str = Field(
        description="2-3 sentences: why it matters and impact on watched stocks"
    )
    url: str = Field(description="Original article URL from input data")


class NewsSection(BaseModel):
    """News section with headlines and briefs."""

    headlines: list[HeadlineNews] = Field(
        description="3-4 most impactful news items with deep analysis"
    )
    briefs: list[BriefNews] = Field(
        description="8-10 other notable news items with brief analysis"
    )


class UpcomingEvent(BaseModel):
    """Upcoming event relevant to user's watchlist."""

    date: str = Field(
        description="Event date in YYYY-MM-DD format, copied from input data"
    )
    event: str = Field(
        description="Event name in Chinese, e.g., '英伟达 (NVDA) Q3财报', '美国12月CPI数据'"
    )
    related_symbols: list[str] = Field(
        description="Which watchlist stocks will be affected"
    )
    why_important: str = Field(
        description="2-3 sentences: why user should care about this event, potential impact on their watched stocks."
    )


class Summary(BaseModel):
    """Comprehensive summary in 3 paragraphs, no subtitles."""

    content: str = Field(
        description="Three paragraphs of analysis, separated by newlines:\n\n"
        "Paragraph 1: Watchlist overview today - best/worst performers, how they compare to market (SPY/QQQ).\n\n"
        "Paragraph 2: Why these stocks moved - connect macro factors (Fed, rates, sentiment, sector rotation) "
        "with specific news catalysts. Be specific about cause-and-effect.\n\n"
        "Paragraph 3: Near-term outlook - expectations for 1-2 weeks, key risks to watch, "
        "potential catalysts, important upcoming events."
    )


class PersonalDigestOutput(BaseModel):
    """Structured output for personalized digest."""

    # Header
    greeting: str = Field(
        description="Date + engaging hook. Format: 'YYYY年MM月DD日 | [hook]'. "
        "Example: '2024年12月18日 | 科技股集体反弹，你关注的股票今天表现不错'"
    )
    one_line_summary: str = Field(
        description="One sentence telling the core story of user's watchlist today. Must have insight, not just list numbers. "
        "Good: 'NVDA带领科技股反弹，但AAPL因中国销量担忧掉队'. "
        "Bad: '今日关注股票涨跌不一，NVDA涨3%，AAPL跌1%'"
    )

    # Section 1: Watchlist Overview
    stocks: list[StockSummary] = Field(
        description="Analysis for each watchlist stock, ordered by importance (most notable movement first)"
    )

    # Section 2: News (Headline + Brief structure)
    news: NewsSection = Field(
        description="News section with 3-4 headlines (deep analysis) and 8-10 briefs (short analysis)"
    )

    # Section 3: Upcoming Events
    events: list[UpcomingEvent] = Field(
        description="6-10 events in next 14 days relevant to user's watchlist. Include ALL earnings of watchlist stocks, plus major macro events (CPI, Fed, jobs) that affect their sectors."
    )

    # Section 4: Summary (replaces macro_impact + bottom_line)
    summary: Summary = Field(
        description="Comprehensive summary: watchlist recap, movement drivers, outlook, and key takeaways"
    )
