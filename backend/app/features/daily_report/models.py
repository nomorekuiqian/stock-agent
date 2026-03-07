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
    url: str = Field(description="The article_id number of the source article from the input news array (e.g. '0', '3', '12')")
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format, filled by Python post-processing")


class BriefNews(BaseModel):
    """A brief news item with short analysis."""

    title: str = Field(description="News title in Chinese")
    summary: str = Field(description="One sentence summary of what happened")
    analysis: str = Field(description="2-3 sentence analysis of market impact")
    url: str = Field(description="The article_id number of the source article from the input news array (e.g. '1', '7')")
    published_at: str = Field(default="", description="Original article publish timestamp in ISO-8601 format, filled by Python post-processing")


class NewsSection(BaseModel):
    """News section with headlines and briefs."""

    headlines: list[HeadlineNews] = Field(
        description="2-4 most important news items with deep analysis"
    )
    briefs: list[BriefNews] = Field(
        description="8-12 other notable news items with brief analysis"
    )


class SummarySection(BaseModel):
    """A sub-section of the report summary with its own title and content."""

    title: str = Field(description="Sub-section title in Chinese: '深度解读与总结' or '未来展望'")
    content: str = Field(description="Sub-section content, 1-2 paragraphs separated by \\n\\n. Concise plain-language analysis (150-250 chars per section).")


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
    news: NewsSection = Field(description="Important news with analysis")

    # Structured summary with sub-sections
    report_summary: list[SummarySection] = Field(
        description="2 concise sub-sections: 1) 深度解读与总结 - the ONE connecting thread behind today's events (1 paragraph, ~200 chars); "
        "2) 未来展望 - 2-3 specific things to watch with dates and if/then scenarios (1-2 paragraphs, ~200 chars)."
    )

    # Calendar - AI provides event selection and analysis, dates are matched from source data in Python
    calendar: list[CalendarEvent] = Field(
        description="Top 5-10 most important upcoming events. Use event_key to identify, dates will be matched from source data."
    )
