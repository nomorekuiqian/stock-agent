"""
Digest Agent - Personalized Daily Digest

Architecture:
    Python (fetch data with custom symbols) -> Digest Agent (analyze)

This agent generates personalized digests based on user's stock watchlist.
"""

import json
import os
from datetime import datetime

# Load environment variables FIRST before any other imports
from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

# Import data fetching tools
from agents.tools.news import get_combined_market_news


# =============================================================================
# Default Macro Symbols (always included)
# =============================================================================

DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "VIX"]


# =============================================================================
# Digest Agent Definition
# =============================================================================

DIGEST_INSTRUCTION = """
0) Your Role

You are a personalized financial content creator. Your job is to analyze news related to the user's stock watchlist and provide insights that matter to them.

Language: Chinese
Tone: Professional but accessible; straightforward with opinions; no trading recommendations.

Goal: Based on the input JSON containing news related to the user's watchlist, produce a personalized daily digest that helps the reader understand:
- What's happening with their stocks today
- Key news and developments for their portfolio
- What to watch for in the coming days

1) Input

You will receive a JSON with:
- symbols: The user's watchlist (including default macro symbols)
- news[]: News articles (title/text/source/url/publishedDate)
- report_date: Today's date

2) Output Structure (Markdown)

Output using the following 4 sections:

## 1. Portfolio Summary

A brief overview of today's key themes affecting the user's watchlist.

## 2. Stock-by-Stock Updates

For each stock in the watchlist that has relevant news:
- **[SYMBOL]**: Brief summary of what's happening
- Include specific news references with links

Skip stocks that have no relevant news.

## 3. Key News Articles

List the most important news articles (5-10 articles):
- Each must have a clickable link: [Title](url)
- Brief summary of why it matters
- Prioritize news by market impact

## 4. Watchlist Outlook

Brief outlook for the user's portfolio:
- What to watch in the coming days
- Any earnings, events, or announcements relevant to their stocks

3) Rules

- Only use information from the input JSON; never fabricate data or news
- Every news article must include a valid URL as [Title](url)
- No buy/sell/position recommendations; only analysis and observations
- Use "if...then..." for forward-looking statements
- Keep paragraphs short for mobile reading
- Bold key numbers and stock symbols
- Maximum 3 emojis in the entire output
"""

digest_agent = Agent(
    name="personalized_digest",
    model="gemini-2.5-flash",
    description="Generates personalized daily digests based on user's stock watchlist",
    instruction=DIGEST_INSTRUCTION,
    output_key="digest",
)


# =============================================================================
# DigestAgent Wrapper Class
# =============================================================================


class DigestAgent:
    """Wrapper class to fetch news for user's watchlist and generate digest."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=digest_agent, app_name="digest_agent")

    async def analyze(self, user_symbols: list[str] = None) -> dict:
        """
        Fetch news for user's watchlist and generate personalized digest.

        Args:
            user_symbols: User's watchlist symbols (e.g., ["AAPL", "MSFT", "NVDA"])

        Returns:
            Dictionary with digest analysis and news data
        """
        try:
            user_symbols = user_symbols or []

            # Merge user symbols with default macro symbols
            all_symbols = list(set(DEFAULT_MACRO_SYMBOLS + user_symbols))
            # Limit to 20 symbols (FMP API constraint)
            all_symbols = all_symbols[:20]

            print(f"[DigestAgent] Fetching news for symbols: {all_symbols}")

            # Fetch news for the combined symbols
            news_result = get_combined_market_news(days=1, symbols=all_symbols)

            print(
                f"[DigestAgent] News fetched: {news_result.get('news_count', 0)} articles"
            )

            # Prepare data for the agent
            report_date = datetime.now().strftime("%Y-%m-%d %A")

            data_for_digest = {
                "report_date": report_date,
                "symbols": all_symbols,
                "user_symbols": user_symbols,
                "news": self._clean_news(news_result.get("news", [])[:30]),
            }

            # Create session and run the agent
            print("[DigestAgent] Running digest agent...")

            session = await self.runner.session_service.create_session(
                app_name="digest_agent", user_id="digest"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following news for the user's watchlist and generate a personalized digest:\n\n{json.dumps(data_for_digest, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            digest_text = ""

            async for event in self.runner.run_async(
                user_id="digest", session_id=session.id, new_message=message
            ):
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    digest_text = text
                                    print(
                                        f"[DigestAgent] Digest output received. Length: {len(text)}"
                                    )

            print("[DigestAgent] Complete.")

            return {
                "symbols_used": all_symbols,
                "user_symbols": user_symbols,
                "news_data": news_result.get("news", [])[:10],
                "news_count": news_result.get("news_count", 0),
                "timestamp": datetime.now().isoformat(),
                "analysis": digest_text,
            }

        except Exception as e:
            print(f"Error in digest generation: {e}")
            import traceback

            traceback.print_exc()

            return {
                "symbols_used": all_symbols if 'all_symbols' in locals() else [],
                "user_symbols": user_symbols or [],
                "news_data": [],
                "news_count": 0,
                "timestamp": datetime.now().isoformat(),
                "analysis": f"Error generating digest: {str(e)[:100]}",
            }

    def _clean_news(self, news: list) -> list:
        """Clean news for the agent (reduce token usage)."""
        return [
            {
                "title": n.get("title", ""),
                "text": n.get("text", ""),
                "source": n.get("source", ""),
                "url": n.get("url", ""),
                "publishedDate": n.get("publishedDate", ""),
                "symbol": n.get("symbol", ""),
            }
            for n in news
            if n.get("title") and n.get("url")
        ]
