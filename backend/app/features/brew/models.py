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


class ActionItem(BaseModel):
    """Structured action item produced by the digest agent.

    Each item represents one in-site action the user can take. Nothing that
    requires leaving the site (buy/sell/etc.) should ever appear here.
    """
    # Soft limit: prompt asks for ≤12 chars, schema tolerates up to 20 because LLMs
    # count Chinese/mixed characters poorly and occasionally overshoot. A borderline
    # overshoot is better than dropping a useful action via ValidationError.
    label: str = Field(..., max_length=20, description="Action label (prompt limit: ≤12 chars)")
    target: str = Field(..., description="Site-internal target path, e.g., 'thesis:NVDA', 'portfolio', 'health'. Validated at service layer against a whitelist.")
    reason: str = Field(..., description="Concrete reason citing user state/today's events/attribution")
    priority: int = Field(..., ge=1, le=3, description="1 = highest")


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
    status: str = Field(..., description="Brief status in Chinese")
    quick_take: str = Field(..., description="120-160 char analyst note: trend, driver, judgment, optional event condition")


class DigestHeadlineNews(BaseModel):
    """Important news with deep analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    fact_summary: str = Field(default="", description="Deprecated, kept for cache compatibility. New digests leave empty.")
    deep_analysis: str = Field(..., description="5-6 sentence deep analysis")
    url: str = Field(default="", description="Original article URL")
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format")


class DigestBriefNews(BaseModel):
    """Other notable news with brief analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    summary: str = Field(..., description="One sentence summary")
    analysis: str = Field(..., description="2-3 sentence analysis")
    url: str = Field(default="", description="Original article URL")
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format")


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
    """Three-paragraph analyst summary."""
    content: str = Field(default="", description="Three natural paragraphs, 420-650 Chinese chars: core judgment, movement attribution, future scenarios")


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

    portfolio_summary: Optional[str] = Field(None, description="One-line portfolio attribution summary from portfolio perspective")

    # Cache indicator
    from_cache: bool = Field(default=False, description="Whether this digest was returned from cache")

    # Top event (computed by Python rules, not LLM)
    top_event: Optional["TopEvent"] = Field(None, description="Most urgent event for user's portfolio")

    action_items: list[ActionItem] = Field(
        default_factory=list,
        description="0-3 in-site action items co-produced with the digest narrative",
    )

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
    status: str = Field(
        description="Short one-line status, 12-18 Chinese chars. "
        "Good: '财报后继续消化，逻辑未破', '创三个月新高但追涨风险上升'. "
        "Bad: '强势上涨', '小幅回调' (too template-like)."
    )
    quick_take: str = Field(
        description="120-160 Chinese chars (hard cap 180), 3-4 sentences: "
        "1) one sentence on today's price action and direct cause, "
        "2) one sentence connecting the driver to this specific stock, "
        "3) one judgment on whether the medium-term logic is strengthened, "
        "weakened, or unchanged, "
        "4) IF a relevant upcoming event exists, include a concrete condition "
        "to watch; skip if none. If the same story appears in headlines below, "
        "mention it briefly and let news carry the depth."
    )


class HeadlineNews(BaseModel):
    """Important news with deep analysis."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this affects, e.g., ['NVDA', 'AMD']"
    )
    fact_summary: str = Field(
        default="",
        description="Deprecated. Leave empty — the title already conveys the fact."
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
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format, filled by Python post-processing")


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
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format, filled by Python post-processing")


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
    """Three-paragraph private-analyst summary."""

    content: str = Field(
        description="Three natural paragraphs, 420-650 Chinese chars total. "
        "Paragraph 1: core judgment and narrative continuity. "
        "Paragraph 2: movement attribution connecting macro/sector/news to "
        "specific watched or held stocks. "
        "Paragraph 3: 2-3 future scenarios with dates/events, trigger "
        "conditions, and concrete consequences for the user's watchlist. "
        "Do not issue buy/sell instructions."
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

    portfolio_summary: str = Field(
        default="",
        description="One sentence summarizing portfolio performance from the owner's perspective. "
        "Focus on: which stock contributed/dragged most by weight, alignment with investment thesis if known. "
        "Do NOT repeat market event narratives (that belongs in one_line_summary). "
        "Example: '科技持仓领涨，NVDA (+3.2%) 贡献最大，组合整体涨 1.4%'"
    )

    action_items: list[ActionItem] = Field(
        default_factory=list,
        max_length=3,
        description=(
            "0-3 in-site actions. Only emit when there's something concrete the user can "
            "do on this website. Never recommend real-world trades. See instruction block."
        ),
    )


# ---------------------------------------------------------------------------
# Resolve forward reference: DigestResponse.top_event -> TopEvent
# Import here (after class definitions) to avoid circular imports.
# ---------------------------------------------------------------------------
from app.features.brew.event_selector import TopEvent  # noqa: E402

DigestResponse.model_rebuild()
