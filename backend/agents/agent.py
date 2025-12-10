"""
Macro Agent using Google ADK with SequentialAgent Pipeline

Architecture:
    ┌─────────────────────────┐
    │   DataNewsFetcher       │
    │  (market_data + news)   │
    └───────────┬─────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │      Analyst            │
    │   (综合分析报告)         │
    └─────────────────────────┘
"""

import os
from datetime import datetime

# Load environment variables FIRST before any other imports
from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import Agent, SequentialAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

# Import tools
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news


# =============================================================================
# Agent Definitions
# =============================================================================

# Data + News Fetcher Agent - fetches both market data and news
data_news_fetcher_agent = Agent(
    name="data_news_fetcher",
    model="gemini-3-pro-preview",
    description="Fetches market data and news",
    instruction="""Fetch and return market data in simplified format:

1. Call get_all_market_data() - return the full result
2. Call get_combined_market_news() - for each news item, only include:
   - title
   - text (summary)
   - source
   - symbol

Output as JSON:
{
  "market_data": <full market data from tool>,
  "news": [{"title": "...", "text": "...", "source": "...", "symbol": "..."}]
}""",
    tools=[get_all_market_data, get_combined_market_news],
    output_key="fetched_data",
)

# Analyst Agent - analyzes combined data and news
ANALYST_INSTRUCTION = """你是一位资深的财经科普作者，擅长把复杂的市场信息用通俗易懂的语言解释给普通投资者。
你的目标是帮助读者**理解**市场正在发生什么，以及背后的逻辑，而不是告诉他们该买什么卖什么。

## 输入数据
{fetched_data}

---

请撰写一份市场解读报告，让没有金融背景的读者也能看懂。

## 市场简报
(用3-4句最简单的话概括今天的市场)

**写作原则：**
1. 分析必须完全基于提供的数据和新闻，不编造
2. 每个专业术语第一次出现时用通俗语言解释
3. 不给任何买卖建议
4. 语气专业但亲和
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# Sequential Pipeline: DataNewsFetcher -> Analyst
macro_pipeline_agent = SequentialAgent(
    name="macro_analysis_pipeline",
    description="Fetches data and news, then analyzes",
    sub_agents=[data_news_fetcher_agent, analyst_agent],
)

# ADK web UI 需要 root_agent 变量
root_agent = macro_pipeline_agent


# =============================================================================
# MacroAgent Wrapper Class
# =============================================================================


class MacroAgent:
    """Wrapper class to run the ADK macro pipeline with parallel fetching."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=macro_pipeline_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Run macro analysis pipeline with parallel data and news fetching."""
        try:
            print(
                "[MacroAgent] Starting pipeline: DataNewsFetcher -> Analyst"
            )

            # Create session
            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="analyst"
            )

            # Run the pipeline
            message = Content(
                parts=[
                    Part(
                        text="Fetch market data and news, then provide comprehensive analysis."
                    )
                ],
                role="user",
            )

            response_text = ""

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                # Collect outputs from agents
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    response_text = text

            # Fetch fresh data directly for the response
            # (The agents already fetched this, but we want it in the response)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)

            # Parse the analysis response
            short_analysis, in_depth_analysis = self._parse_analysis(response_text)

            print(
                "[MacroAgent] Pipeline complete. News count: "
                + str(news_result.get("news_count", 0))
            )

            return {
                "market_data": market_data,
                "news_data": {
                    "count": news_result.get("news_count", 0),
                    "articles": news_result.get("news", [])[:10],
                    "filters": news_result.get("filters", {}),
                    "sources": news_result.get("sources", ["yahoo_finance"]),
                    "source_counts": news_result.get("source_counts", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": short_analysis,
                "in_depth_analysis": in_depth_analysis,
            }

        except Exception as e:
            print(f"Error in macro analysis: {e}")
            import traceback

            traceback.print_exc()

            # Fallback
            market_data = get_all_market_data()
            return {
                "market_data": market_data,
                "news_data": {"count": 0, "articles": [], "filters": {}},
                "timestamp": datetime.now().isoformat(),
                "short_analysis": f"Data fetched (analysis error: {str(e)[:100]})",
                "in_depth_analysis": "",
            }

    def _parse_analysis(self, text: str) -> tuple[str, str]:
        """Parse the agent response into short and in-depth analysis"""
        if not text:
            return "No analysis available.", ""

        text = text.strip()

        short_markers = ["简要分析", "**简要分析**", "## 简要分析"]
        depth_markers = ["深度分析", "**深度分析**", "## 深度分析"]

        short_start = -1
        depth_start = -1

        for marker in short_markers:
            idx = text.find(marker)
            if idx != -1:
                short_start = idx + len(marker)
                break

        for marker in depth_markers:
            idx = text.find(marker)
            if idx != -1:
                depth_start = idx + len(marker)
                break

        if short_start != -1 and depth_start != -1:
            short_analysis = text[short_start : text.find(depth_markers[0])].strip()
            in_depth_analysis = text[depth_start:].strip()
        elif depth_start != -1:
            short_analysis = text[: text.find(depth_markers[0])].strip()
            in_depth_analysis = text[depth_start:].strip()
        else:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            if len(paragraphs) >= 2:
                short_analysis = paragraphs[0]
                in_depth_analysis = "\n\n".join(paragraphs[1:])
            else:
                short_analysis = text[:500] if len(text) > 500 else text
                in_depth_analysis = text[500:] if len(text) > 500 else ""

        for marker in short_markers + depth_markers:
            short_analysis = short_analysis.replace(marker, "")
            in_depth_analysis = in_depth_analysis.replace(marker, "")

        return short_analysis.strip(": \n"), in_depth_analysis.strip(": \n")
