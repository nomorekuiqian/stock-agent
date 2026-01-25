"""
Market report Pydantic models - structured output schema for the market analyst agent.

These models define the shape of the AI-generated market report.
Kept in a separate file so other modules (router, email, etc.) can import
without pulling in the full agent machinery.
"""

from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    """A key economic or earnings event with analysis."""

    date: str = Field(
        description="Event date, MUST copy exactly from input data (YYYY-MM-DD format). For earnings: copy from earnings_calendar's date field. For economic: copy date part from economic_calendar's date field."
    )
    event: str = Field(
        description="Event name in Chinese, e.g. '美光科技 (MU) 财报', '美国11月CPI数据', '美联储利率决议'"
    )
    analysis: str = Field(
        description="Why this event matters and potential market impact, 1-2 sentences in Chinese"
    )


# --- Macro Section ---
class MacroSignal(BaseModel):
    """A single macro signal with analysis."""

    name: str = Field(
        description="Signal name in Chinese, e.g. 'VIX', '10Y国债', '美元指数', '10Y-3M利差'"
    )
    current_value: str = Field(
        description="Current value with unit, e.g. '18.5', '4.50%', '105.2'"
    )
    change: str = Field(
        description="Change description, e.g. '周跌12.3%', '周涨0.15%', '持平'"
    )
    trend_direction: str = Field(
        description="Value change direction for color display: 'up' (green) if value increased, 'down' (red) if value decreased. "
        "Always use 'up' or 'down' based on numerical change, never 'flat'. "
        "Example: VIX drops from 21 to 18 = 'down' (red), even though it's bullish for stocks."
    )
    analysis: str = Field(
        description="Comprehensive analysis in 3-4 sentences covering: 1) trend vs last week, 2) position in recent range, 3) impact on market/sectors"
    )


class MacroSection(BaseModel):
    """Macro environment section."""

    signals: list[MacroSignal] = Field(
        description="2-3 most important macro signals with analysis"
    )
    summary: str = Field(
        description="4-6 sentence summary of overall macro environment: current cycle, combined signal interpretation, sector implications, key risks"
    )


# --- News Section ---
class HeadlineNews(BaseModel):
    """A headline news item with deep analysis."""

    title: str = Field(description="News title in Chinese")
    fact_summary: str = Field(
        description="One sentence factual summary of what happened"
    )
    deep_analysis: str = Field(
        description="5-6 sentence deep analysis: background context, why it matters, market/sector/stock implications, what to watch next"
    )
    url: str = Field(description="Original article URL")


class BriefNews(BaseModel):
    """A brief news item with short analysis."""

    title: str = Field(description="News title in Chinese")
    summary: str = Field(description="One sentence summary of what happened")
    analysis: str = Field(description="2-3 sentence analysis of market impact")
    url: str = Field(description="Original article URL")


class NewsSection(BaseModel):
    """News section with headlines and briefs."""

    headlines: list[HeadlineNews] = Field(
        description="2-4 most important news items with deep analysis"
    )
    briefs: list[BriefNews] = Field(
        description="8-12 other notable news items with brief analysis"
    )


class MarketReportOutput(BaseModel):
    """Structured output schema for complete market report."""

    # Basic info
    title: str = Field(
        description="Report title - one insightful, opinionated sentence summarizing today's market, 15-30 Chinese characters"
    )
    summary: str = Field(
        description="Report summary - 2-3 sentences covering key market movements and insights for list preview, 50-100 Chinese characters"
    )
    intro: str = Field(
        description="Opening section (2-3 paragraphs, 150-250 chars): "
        "1) Today's market sentiment and performance (one sentence), "
        "2) 2-3 most important things to watch today (preview), "
        "3) One sentence leading to detailed analysis"
    )

    # Structured sections
    macro: MacroSection = Field(description="Macro environment analysis")
    news: NewsSection = Field(description="Important news with analysis")

    # Free-form narrative section (keeps coherence)
    report_summary: str = Field(
        description="Comprehensive summary in 3 paragraphs (separated by newlines, NO subtitles):\n\n"
        "Paragraph 1: Today's recap - overall market performance, major index movements, sector leaders/laggards.\n\n"
        "Paragraph 2: Why it happened - connect macro factors with news catalysts, explain cause-and-effect.\n\n"
        "Paragraph 3: Forward outlook - must mention specific tickers ($TICKER format) or sectors worth watching with reasons, potential risks with trigger conditions, and key dates/events."
    )

    # Calendar - AI provides event selection and analysis, dates are matched from source data in Python
    calendar: list[CalendarEvent] = Field(
        description="Top 5-10 most important upcoming events. Use event_key to identify, dates will be matched from source data."
    )
