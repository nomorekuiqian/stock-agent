"""
Macro Agent - Simplified Architecture

Architecture:
    Python (fetch data) -> Analyst Agent (analyze)

No more data_news_fetcher_agent - data is fetched directly in Python
and passed to the analyst agent for analysis.
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
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


# =============================================================================
# Analyst Agent Definition
# =============================================================================

ANALYST_INSTRUCTION = """
角色

你是一位面向大众的财经内容创作者：把复杂市场讲得清楚、好读、可转发。

语气：专业但不端着；直白有观点；不喊单。

方法：用“最少的信号解释最多的现象”，避免把每个数据都讲一遍。

输入

你会收到一份 JSON（字段可能缺失），包含市场数据、新闻、经济日历、财报日历等（以实际给到为准）。

输出结构（唯一固定项）

必须按以下 6 个一级标题输出（Markdown，##），除此之外写法完全自由：

## 1. 市场一句话

## 2. 今天市场在交易什么

## 3. 关键指标与信号

## 4. 资产/板块：你认为最重要的几件事

## 5. 新闻：你认为最值得读的几条

## 6. 未来 1–2 周：观察清单

决策权交给你：选材规则（用来决定“写什么”）

从所有可用输入里，优先挑选：

冲击最大：当日变化显著、出现拐点、或对情绪/定价最敏感的项目

解释力最强：最能回答“为什么涨/跌、为什么轮动、为什么分歧”的少数信号

可验证：能给出接下来可观察的验证点（数据/事件/财报/政策表态等）

如果你发现跨资产互相矛盾（例如股市走强但信用走弱），必须点名“分歧”，并解释可能原因。

内容自由度（每节写法不限制）

每个板块可用短段落、要点、对比、类比、叙事都可以。

不强制覆盖任何特定指标/资产/新闻类别；由你判断当日真正重要的点。

条目数量不固定：信息密度高就多写，低就精简；但不要为了凑数硬写。

硬约束（必须遵守）

不编造任何数据、新闻事实或来源；缺失就写“未提供/暂无数据”。

不提供买卖指令：不写买入/卖出/加仓/减仓/仓位；只做解读与情景推演（“如果…那么…”）。

观点要可核对：重要判断必须引用输入里的证据（数字/事件/新闻点）。

术语首次出现必须解释：用 1 句大白话或比喻。

排版规范（保持可读性即可）

全文 Markdown；适配手机阅读；段落短。

关键数字加粗（例如 +1.2%）。

emoji 可用可不用；若用，全篇不超过 3 个。

输出前自检

6 个标题是否齐全？

是否每个板块至少提供了可核对信息（数字/新闻/事件）？

是否点明了主线与分歧（如存在）？

是否完全没有买卖指令与臆造数据？
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# ADK web UI needs root_agent variable
root_agent = analyst_agent


# =============================================================================
# MacroAgent Wrapper Class
# =============================================================================


class MacroAgent:
    """Wrapper class to fetch data and run analyst agent."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=analyst_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Fetch all data and run analyst agent for analysis."""
        try:
            print("[MacroAgent] Fetching market data...")

            # Step 1: Fetch all data directly (no LLM needed)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)
            calendar_result = get_economic_calendar(days=14)
            earnings_result = get_earnings_calendar(days=7)

            print(
                f"[MacroAgent] Data fetched. News: {news_result.get('news_count', 0)}, "
                f"Calendar: {calendar_result.get('events_count', 0)}, "
                f"Earnings: {earnings_result.get('earnings_count', 0)}"
            )

            # Step 2: Prepare data for analyst
            report_date = datetime.now().strftime("%Y-%m-%d %A")

            data_for_analyst = {
                "report_date": report_date,
                "market_data": market_data,
                "news": news_result.get("news", [])[:50],  # Top 50 news
                "economic_calendar": calendar_result.get("events", []),
                "earnings_calendar": earnings_result.get("earnings", []),
            }

            # Step 3: Create session and run analyst
            print("[MacroAgent] Running analyst agent...")

            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="analyst"
            )

            # Send data to analyst agent
            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following market data and provide a comprehensive report:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            response_text = ""

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                # Collect output from analyst agent
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    response_text = text

            # Parse the analysis response
            short_analysis, in_depth_analysis = self._parse_analysis(response_text)

            print("[MacroAgent] Analysis complete.")

            return {
                "market_data": market_data,
                "news_data": {
                    "count": news_result.get("news_count", 0),
                    "articles": news_result.get("news", [])[:10],
                    "filters": news_result.get("filters", {}),
                },
                "economic_calendar": {
                    "count": calendar_result.get("events_count", 0),
                    "events": calendar_result.get("events", []),
                    "date_range": calendar_result.get("date_range", {}),
                },
                "earnings_calendar": {
                    "count": earnings_result.get("earnings_count", 0),
                    "earnings": earnings_result.get("earnings", []),
                    "date_range": earnings_result.get("date_range", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": short_analysis,
                "in_depth_analysis": in_depth_analysis,
            }

        except Exception as e:
            print(f"Error in macro analysis: {e}")
            import traceback

            traceback.print_exc()

            # Fallback - return data without analysis
            market_data = get_all_market_data()
            return {
                "market_data": market_data,
                "news_data": {"count": 0, "articles": [], "filters": {}},
                "economic_calendar": {"count": 0, "events": [], "date_range": {}},
                "earnings_calendar": {"count": 0, "earnings": [], "date_range": {}},
                "timestamp": datetime.now().isoformat(),
                "short_analysis": f"Data fetched (analysis error: {str(e)[:100]})",
                "in_depth_analysis": "",
            }

    def _parse_analysis(self, text: str) -> tuple[str, str]:
        """Parse the agent response into short and in-depth analysis"""
        if not text:
            return "No analysis available.", ""

        text = text.strip()

        # Try to find market overview section as short analysis
        overview_markers = ["## 一、市场总览", "## 市场总览", "# 市场总览"]
        section_two_markers = ["## 二、", "## 宏观流动性"]

        short_analysis = ""
        in_depth_analysis = text

        for marker in overview_markers:
            idx = text.find(marker)
            if idx != -1:
                # Find where section two starts
                end_idx = len(text)
                for end_marker in section_two_markers:
                    section_two_idx = text.find(end_marker)
                    if section_two_idx != -1 and section_two_idx > idx:
                        end_idx = section_two_idx
                        break

                short_analysis = text[idx:end_idx].strip()
                # Remove the header from short analysis
                short_analysis = short_analysis.replace(marker, "").strip()
                break

        # If no marker found, use first paragraph
        if not short_analysis:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            if paragraphs:
                short_analysis = paragraphs[0][:500]

        return short_analysis, in_depth_analysis
