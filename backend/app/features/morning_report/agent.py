"""
Morning Report Agent - Pre-market briefing generation.

Architecture:
    Python (fetch pre-market data) -> Morning Analyst Agent (analyze + produce briefing)

Data is fetched in Python, then the analyst agent produces the final
structured morning briefing for US stock investors.
"""

import json
import os

from app.core.ai_models import GENERATIVE_MODEL
from app.core.logging import get_logger
from app.shared.agent_sessions import temporary_agent_session
from app.utils.timezone import now_iso, format_report_date, today_str

logger = get_logger(__name__)

# Load environment variables FIRST before any other imports
from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.features.morning_report.models import MorningReportOutput
from app.features.morning_report import db as morning_db
from app.shared.llm_metering import meter

MORNING_REPORT_MODEL = GENERATIVE_MODEL

# Import data fetching tools
from app.shared.data_tools import get_premarket_data
from app.shared.data_tools.news import get_combined_market_news
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar


# =============================================================================
# Morning Analyst Agent Definition
# =============================================================================

MORNING_ANALYST_INSTRUCTION = """
You are a pre-market briefing analyst for US stock retail investors. Your audience are tech-sector
professionals and tech stock holders who want a quick 3-5 minute scan before the market opens.

## Core Principles
- This is a MORNING BRIEFING, not an evening report. Focus on what happened overnight and what's ahead today.
- Data comes from the input JSON. Never fabricate numbers. Copy market data values exactly.
- All content must be in Chinese.
- Be concise - this is a quick scan, not a deep analysis.

## Narrative Continuity Rules
Input data may include previous_reports (recent morning reports). You must:
- Connect today's briefing to recent trends when relevant
- If a prior outlook was confirmed or refuted, mention it briefly
- Use natural time references like "yesterday", "recently" etc.
- If no previous_reports, analyze normally without forced historical references

## Tone & Style
- Calm, professional, like a Bloomberg morning note
- No sensational language or clickbait
- Acknowledge uncertainty when appropriate
- Standard: a college student without finance background can understand

## Output Field Guide

### title
One concise sentence capturing today's pre-market mood, 10-25 Chinese characters.
Good: "隔夜科技股带动期货走高，等待CPI数据"
Bad: "市场即将迎来史诗级反转！"

### market_pulse
One sentence opening prediction/mood for today's session, 20-40 Chinese characters.
Example: "期货温和上涨，但今日CPI数据可能成为变盘催化剂"

### futures
Copy the futures data EXACTLY from the input. For each future (S&P 500 Futures, Nasdaq Futures, Dow Futures),
provide name, value, and daily_change from the input data.

### futures_analysis
首段写 150–250 个简体中文字的完整公开解读，事实不足不凑字；进一步细节放后续段落。
2-3 sentences interpreting the futures and global market movements as a whole:
- What drove the moves (e.g. geopolitics, earnings, macro data)?
- What does the pattern suggest for today's session?
- Key levels or divergences to watch (e.g. "Nasdaq leads suggests tech-driven risk appetite")
This is the most analytical part of the data section - provide genuine interpretation, not just restating numbers.

### global_markets
Copy the global market data EXACTLY from the input. Organize into:
- asia: Asian indices from input
- europe: European indices from input
- other: Gold, Crude Oil, US Dollar, BTC, VIX from input

### global_markets_analysis
首段写 150–250 个简体中文字的完整公开解读，事实不足不凑字；进一步细节放后续段落。
2-3 sentences summarizing the overnight global market picture:
- What's the dominant theme across regions (risk-on, risk-off, mixed)?
- Which assets or regions stood out and why?
- What does this tell us about sentiment heading into today's US session?
This should be a concise interpretive paragraph, not a list of numbers.

### overnight_news (3-5 items)
Select the most important overnight news from the input news array. Each item needs:
- title: Concise Chinese headline
- analysis: 3-4 sentences providing deep analysis:
  1) What happened (the fact)
  2) Why it matters for the market
  3) Which sectors/stocks are most affected
  4) What to watch going forward
- url: The article_id number from the input news array (e.g. "0", "3")

Selection criteria:
1. Impact on today's US market session
2. Priority: tech/AI > macro > other sectors
3. Must be actual events (someone did something), not commentary

### today_focus (3-6 items)
Events and catalysts happening TODAY ONLY. Do NOT include events scheduled for tomorrow or later days.
Sort by importance. Each item needs:
- title: Chinese description of the event
- analysis: 2-3 sentences on what to expect, potential market impact, and key thresholds/metrics to watch
- time: ONLY use specific scheduled times like "8:30 AM ET", "BMO", "AMC".
  If the event has no specific scheduled time, leave time as empty string "".
  Do NOT use vague descriptions like "ongoing", "real-time", "published" etc.

Source ONLY from input economic_calendar and earnings_calendar (these are already filtered to today's events).
If news mentions an upcoming event (e.g. earnings tomorrow, data release next week), do NOT put it here.
Instead, mention it briefly in the relevant overnight_news item's analysis as forward context.

### summary (exactly 2 sections)
Section 1 - title: "overnight_review"
- content: 2-3 paragraphs (~200-300 chars), synthesize overnight developments into one narrative thread
- Connect futures, global markets, and overnight news into a coherent picture
- Provide genuine interpretation, not just listing what happened

Section 2 - title: "today_outlook"
- content: 2-3 paragraphs (~200-300 chars), forward-looking
- Key events to watch with if/then scenarios
- Specific levels or triggers to monitor
- Actionable framing: what would be bullish vs bearish signals
"""

morning_analyst_agent = LlmAgent(
    name="morning_analyst",
    model=MORNING_REPORT_MODEL,
    description="Analyzes pre-market data and produces a structured morning briefing in Chinese",
    instruction=MORNING_ANALYST_INSTRUCTION,
    output_schema=MorningReportOutput,
    output_key="morning_report",
    after_model_callback=meter("morning_report", model=MORNING_REPORT_MODEL),
)


# =============================================================================
# Data Cleaning Functions for AI Input
# =============================================================================


def _prepare_data_for_morning_agent(
    premarket_data: dict,
    news: list,
    economic_calendar: list,
    earnings_calendar: list,
) -> dict:
    """
    Clean and minimize data for the morning analyst.
    Filters to today's events only and removes redundant fields.
    """
    today = today_str()

    # 1. Clean news - add article_id, filter junk
    clean_news = []
    for i, n in enumerate(news):
        title = n.get("title", "")
        if not title:
            continue
        title_upper = title.upper()
        if any(spam in title_upper for spam in [
            "DEADLINE ALERT", "ROSEN,", "CLASS ACTION",
            "INVESTORS WITH LOSSES", "ENCOURAGES", "LAWSUIT",
        ]):
            continue
        clean_news.append({
            "article_id": i,
            "title": title,
            "text": n.get("text", ""),
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "publishedDate": n.get("publishedDate", ""),
        })

    # 2. Economic calendar - only today's events
    clean_calendar = [
        {
            "date": e.get("date", ""),
            "event": e.get("event", ""),
            "previous": e.get("previous"),
            "estimate": e.get("estimate"),
            "is_key_event": e.get("is_key_event", False),
        }
        for e in economic_calendar
        if e.get("date", "")[:10] == today
    ]

    # 3. Earnings calendar - only today's, keep time field
    clean_earnings = [
        {
            "symbol": e.get("symbol", ""),
            "date": e.get("date", ""),
            "epsEstimated": e.get("epsEstimated"),
            "revenueEstimated": e.get("revenueEstimated"),
            "time": e.get("time", ""),
            "is_ai_related": e.get("is_ai_related", False),
        }
        for e in earnings_calendar
        if e.get("date", "")[:10] == today
    ]

    return {
        "premarket_data": premarket_data,
        "news": clean_news,
        "economic_calendar": clean_calendar,
        "earnings_calendar": clean_earnings,
    }


# =============================================================================
# MorningReportAgent Wrapper Class
# =============================================================================


class MorningReportAgent:
    """Wrapper class to fetch pre-market data and run the morning analyst agent."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            self.runner = InMemoryRunner(
                agent=morning_analyst_agent, app_name="morning_report"
            )
            self._initialized = True

    async def analyze(self) -> dict | None:
        """Fetch all pre-market data and run the morning analyst agent."""
        try:
            logger.info("Fetching pre-market data...")

            # Step 1: Fetch data
            premarket_data = get_premarket_data()
            news_result = get_combined_market_news(days=1)
            calendar_result = get_economic_calendar(days=3)
            earnings_result = get_earnings_calendar(days=2)

            logger.info(
                "Pre-market data fetched. News: %d, Calendar: %d, Earnings: %d",
                news_result.get("news_count", 0),
                calendar_result.get("events_count", 0),
                earnings_result.get("earnings_count", 0),
            )

            # Step 2: Prepare and clean data
            raw_news = news_result.get("news", [])
            report_date = format_report_date()

            data_for_agent = _prepare_data_for_morning_agent(
                premarket_data=premarket_data,
                news=raw_news,
                economic_calendar=calendar_result.get("events", []),
                earnings_calendar=earnings_result.get("earnings", []),
            )
            data_for_agent["report_date"] = report_date

            # Step 3: Fetch recent morning reports for narrative continuity
            previous_reports = []
            try:
                recent = await morning_db.list_morning_reports(limit=5)
                for r in reversed(recent.get("data", [])):
                    previous_reports.append({
                        "date": r.get("report_date", "")[:10],
                        "title": r.get("title", ""),
                        "market_pulse": r.get("market_pulse", ""),
                    })
                logger.info("Loaded %d previous morning reports for context", len(previous_reports))
            except Exception as e:
                logger.warning("Could not load previous morning reports: %s", e)

            if previous_reports:
                data_for_agent["previous_reports"] = previous_reports

            # Step 4: Run the agent
            logger.info("Running morning analyst agent...")

            async with temporary_agent_session(
                self.runner, app_name="morning_report", user_id="morning_analyst"
            ) as session:
                message = Content(
                    parts=[
                        Part(
                            text=(
                                "Please analyze the following pre-market data and provide "
                                "a morning briefing:\n\n"
                                + json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)
                            )
                        )
                    ],
                    role="user",
                )

                async for event in self.runner.run_async(
                    user_id="morning_analyst",
                    session_id=session.id,
                    new_message=message,
                ):
                    pass

                # Get structured output from session state
                session_data = await self.runner.session_service.get_session(
                    app_name="morning_report",
                    user_id="morning_analyst",
                    session_id=session.id,
                )

                # Extract report from state
                title = ""
                market_pulse = ""
                futures = []
                futures_analysis = ""
                global_markets_analysis = ""
                global_markets = {"asia": [], "europe": [], "other": []}
                overnight_news = []
                today_focus = []
                summary = []

                if session_data and hasattr(session_data, "state"):
                    state = session_data.state or {}
                    report_data = state.get("morning_report", {})

                    if isinstance(report_data, str):
                        try:
                            report_data = json.loads(report_data)
                        except json.JSONDecodeError:
                            report_data = {}

                    if isinstance(report_data, dict):
                        title = report_data.get("title", "")
                        market_pulse = report_data.get("market_pulse", "")
                        futures = report_data.get("futures", [])
                        futures_analysis = report_data.get("futures_analysis", "")
                        global_markets_analysis = report_data.get("global_markets_analysis", "")
                        global_markets = report_data.get("global_markets", global_markets)
                        overnight_news = report_data.get("overnight_news", [])
                        today_focus = report_data.get("today_focus", [])
                        summary = report_data.get("summary", [])

                # Resolve article_id references to real URLs in overnight_news
                overnight_news = self._resolve_article_urls(overnight_news, raw_news)

                logger.info(
                    "Morning analysis complete. Title: %s, News: %d, Focus: %d",
                    title[:30] if title else "N/A",
                    len(overnight_news),
                    len(today_focus),
                )

                return {
                    "timestamp": now_iso(),
                    "title": title,
                    "market_pulse": market_pulse,
                    "futures": futures,
                    "futures_analysis": futures_analysis,
                    "global_markets": global_markets,
                    "global_markets_analysis": global_markets_analysis,
                    "overnight_news": overnight_news,
                    "today_focus": today_focus,
                    "summary": summary,
                    "market_data": {
                        "premarket": premarket_data,
                        "news_count": news_result.get("news_count", 0),
                        "calendar_count": calendar_result.get("events_count", 0),
                        "earnings_count": earnings_result.get("earnings_count", 0),
                    },
                }

        except Exception as e:
            logger.exception("Error in morning analysis")
            return None

    def _resolve_article_urls(self, news_items: list, source_news: list) -> list:
        """Resolve article_id references to real URLs in news items.

        Same pattern as daily_report agent's _resolve_article_urls,
        adapted for the flat list structure of overnight_news.
        """
        if not news_items or not source_news:
            return news_items

        id_to_url = {}
        id_to_published_at = {}
        valid_urls = set()
        url_to_published_at = {}
        for i, article in enumerate(source_news):
            url = article.get("url", "")
            published_at = article.get("publishedDate", "") or ""
            id_to_published_at[str(i)] = published_at
            if url:
                id_to_url[str(i)] = url
                valid_urls.add(url)
                url_to_published_at[url] = published_at

        resolved = 0
        cleared = 0

        for item in news_items:
            url_field = str(item.get("url", "")).strip()
            published_at = ""

            if url_field in id_to_url:
                item["url"] = id_to_url[url_field]
                published_at = id_to_published_at.get(url_field, "")
                resolved += 1
            elif url_field in valid_urls:
                published_at = url_to_published_at.get(url_field, "")
            elif url_field.startswith("http"):
                item["url"] = ""
                cleared += 1
            else:
                item["url"] = ""
                if url_field:
                    cleared += 1

            item["published_at"] = published_at

        logger.info("Morning news URLs: %d resolved, %d cleared", resolved, cleared)
        return news_items
