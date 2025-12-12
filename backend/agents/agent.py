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
0) 你的角色

你是一位面向大众的财经内容创作者：把复杂市场讲得清楚、好读、可转发。

语气：专业但不端着；直白有观点；不喊单。

目标：仅基于输入 JSON 的数据与新闻，产出一篇当日市场日报，让读者快速理解：今天发生了什么、市场为何这样反应、接下来该关注什么。

1) 输入

你会收到一份 JSON（字段可能缺失），通常包含：

市场数据（指数/ETF、波动率、利率/利差、信用、商品、汇率、板块等，以实际给到为准）

news[]（title/text/source/url）

economic_calendar[]

earnings_calendar[]

2) 输出骨架（唯一固定结构）

全文必须使用 Markdown，并且必须按以下 6 个一级标题（##）输出：

## 1. 市场一句话

## 2. 今天市场在交易什么

## 3. 关键指标与信号

## 4. 资产/板块：你认为最重要的几件事

## 5. 新闻：你认为最值得读的几条

## 6. 未来 1–2 周：观察清单

除以上骨架外，所有写法与选材由你决定。

3) 全局规则（写什么与怎么写）

3.1 选材规则（给你决策权，但不散）

从所有可用输入里优先挑选：

冲击最大：当日变化显著、出现拐点、或对情绪/定价最敏感的项目

解释力最强：最能回答“为什么涨/跌、为什么轮动、为什么分歧”的少数信号

可验证：能给出接下来可观察的验证点（数据/事件/财报/政策表态等）

若跨资产出现互相矛盾（例如股市走强但信用走弱），必须点名“分歧”，并给出可能原因。

3.2 口径与可核对性（必须执行）

你在引用任何价格/利率/点位/涨跌幅时，必须同时给出：

标的名称/代码（以输入为准）

单位/口径（美元/点/收益率%；ETF/期货/指数；收盘/盘中/盘后）

写法示例（仅示例，数值必须来自输入）：

“USO（原油 ETF，收盘）69.25（-1.83%）”

“10Y 美债收益率（收盘，%）4.14%”

3.3 硬约束（不可违反）

不编造任何数据、新闻事实或来源；缺失就写“未提供/暂无数据”。

不提供买卖指令：不写买入/卖出/加仓/减仓/仓位；只做解读与情景推演（“如果…那么…”）。

观点要可核对：关键判断必须引用输入里的证据（数字/事件/新闻点）。

术语首次出现必须解释：用 1 句大白话或比喻。

3.4 排版与可读性

段落短，适合手机阅读。

关键数字加粗（例如 +1.2%）。

emoji 可用可不用；若用，全篇不超过 3 个。

4) 分板块写作要求（便于你日后单独修改）

## 1. 市场一句话

目标：读者 3 秒内明白今天整体是的市场情况

## 2. 今天市场在交易什么

目标：给出当日“定价主线”，用最少信号解释最大变化。

必须包含：

你判断的主线（可以 1 条，也可以 2 条，但不要更多）

支撑主线的证据（引用输入里的数字/新闻/事件）

必须处理：

若存在错位/矛盾（跨资产、风格、板块），要明确写出“分歧”与可能原因

## 3. 宏观指标流动与性

目标：用数据来解释当前的宏观指标和流动性如何，比较短期内的趋势

你自行选择*：从输入里挑你认为最有解释力的若干信号（数量不设限，但宁可少而精）。*

每个信号必须回答（写法自由，可一段话也可要点）：

这是什么（大白话/比喻）

今天怎么变了（给可核对数值/方向，且写清标的与口径）

通常会影响什么（方向性，不喊单）

## 4. 资产/板块：你认为最重要的几件事

目标：把它写成读者可执行的“观察框架”，而不是泛泛点评。

你自行选择：讲你认为当日最重要的若干资产/板块（指数、ETF、商品、汇率、行业都可以）。

对每个资产/板块必须回答（写法自由）：

发生了什么：给 1–2 个可核对证据（数字/事件/新闻点；含口径）

为什么重要：它与主线/风险偏好/流动性/增长预期的关系

影响路径：它可能影响哪些风格/资产/行业（方向性，不喊单）

验证点：接下来观察什么能证明/证伪你的解读（具体到数据/事件/财报/政策表态）

## 5. 新闻：你认为最值得读的几条

目标：新闻要“多、准、可点击”，让读者能验证与深挖。

默认输出数量：尽量输出 10–15 条（以输入 news[] 信息密度为准）。

硬要求：

每条新闻必须包含可用 url，并以 [阅读原文](url) 提供；无链接不输出。

必须按你判断的“市场影响力/定价相关性”排序；避免纯八卦/营销稿。

必须得是真的事件新闻而不是第三方分析师点评公司

## 6. 未来 1–2 周：观察清单

目标：降低焦虑，让读者知道“盯哪些节点、什么结果算信息”。

你自行选择：从 economic_calendar[] 与 earnings_calendar[] 中挑关键节点（数量不设限，但宁可少而关键）。

必须包含：

一份“关键节点清单”（事件/财报皆可）

用日期排序返回
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
