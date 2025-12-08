"""
Macro Agent using Google ADK with ParallelAgent for Concurrent Fetching

Architecture (using native ADK ParallelAgent):
    ┌─────────────────────────────────────────┐
    │           ParallelAgent                 │
    │  ┌─────────────┐  ┌─────────────────┐   │
    │  │DataFetcher  │  │  NewsFetcher    │   │
    │  │(market_data)│  │ (curated_news)  │   │
    │  └─────────────┘  └─────────────────┘   │
    └───────────────────┬─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │      Analyst        │
              │  (综合分析报告)      │
              └─────────────────────┘
"""

import os
from datetime import datetime

# Load environment variables FIRST before any other imports
from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import Agent, SequentialAgent, ParallelAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

# Import tools
from agents.tools import get_all_market_data
from agents.tools.news import get_market_news


# =============================================================================
# Agent Definitions
# =============================================================================

# Data Fetcher Agent - fetches market data
data_fetcher_agent = Agent(
    name="data_fetcher",
    model="gemini-3-pro-preview",
    description="Fetches comprehensive market data",
    instruction="""You are a data fetcher agent. Your job is simple:

1. Call get_all_market_data() to fetch all market data
2. Return the data exactly as received

Do not modify the data. Just call the tool and return its output.""",
    tools=[get_all_market_data],
    output_key="market_data",
)

# News Fetcher Agent - fetches and curates news
news_fetcher_agent = Agent(
    name="news_fetcher",
    model="gemini-3-pro-preview",
    description="Fetches and curates macro market news",
    instruction="""You are a news fetcher agent. Your job is:

1. Call get_market_news() to fetch the latest macro-focused market news
2. Return the news data exactly as received

The news is already filtered for macro-relevance (Fed, rates, inflation, etc).
Do not modify the data. Just call the tool and return its output.""",
    tools=[get_market_news],
    output_key="news_data",
)

# Parallel Agent - runs data and news fetchers concurrently
parallel_fetch_agent = ParallelAgent(
    name="parallel_fetcher",
    description="Fetches market data and news concurrently",
    sub_agents=[data_fetcher_agent, news_fetcher_agent],
)

# Analyst Agent - analyzes combined data and news
ANALYST_INSTRUCTION = """你是一位资深的财经科普作者，擅长把复杂的市场信息用通俗易懂的语言解释给普通投资者。
你的目标是帮助读者**理解**市场正在发生什么，以及背后的逻辑，而不是告诉他们该买什么卖什么。

## 输入数据

### 市场数据
{market_data}

### 今日宏观新闻
{news_data}

---

请撰写一份市场解读报告，让没有金融背景的读者也能看懂。

## 简要分析
(用3-4句最简单的话概括今天的市场)

**写作原则：**
1. 分析必须完全基于提供的数据和新闻，不编造
2. 每个专业术语第一次出现时用通俗语言解释
3. 多用比喻帮助理解
4. 不给任何买卖建议
5. 语气专业但亲和
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# Sequential Pipeline: Parallel Fetch -> Analyst
macro_pipeline_agent = SequentialAgent(
    name="macro_analysis_pipeline",
    description="Fetches data and news in parallel, then analyzes",
    sub_agents=[parallel_fetch_agent, analyst_agent],
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
                "[MacroAgent] Starting parallel pipeline: DataFetcher + NewsFetcher -> Analyst"
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
            news_result = get_market_news(days=1, macro_only=True)

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
                    "articles": news_result.get("news", [])[:5],
                    "filters": news_result.get("filters", {}),
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
