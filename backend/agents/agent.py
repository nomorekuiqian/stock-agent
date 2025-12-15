"""
Market Agent - Simplified Architecture

Architecture:
    Python (fetch data) -> Analyst Agent (analyze)

Data is fetched directly in Python and passed to the analyst agent for analysis.
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

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field


# =============================================================================
# Pydantic Output Schema for Market Report
# =============================================================================


class CalendarEvent(BaseModel):
    """A key economic or earnings event with analysis."""

    date: str = Field(description="Event date in YYYY-MM-DD format")
    event: str = Field(description="Event name in Chinese, e.g. '美联储利率决议', 'NVIDIA财报', '非农就业数据'")
    analysis: str = Field(
        description="Why this event matters and potential market impact, 1-2 sentences in Chinese"
    )


class MarketReportOutput(BaseModel):
    """Structured output schema for complete market report."""

    title: str = Field(
        description="Report title - one insightful, opinionated sentence summarizing today's market, 15-30 Chinese characters"
    )
    summary: str = Field(
        description="Report summary - 2-3 sentences covering key market movements and insights for list preview, 50-100 Chinese characters"
    )
    analysis: str = Field(
        description="Full market analysis report in markdown format, following the specified structure with all 6 sections"
    )
    calendar: list[CalendarEvent] = Field(
        description="Top 5-10 most important upcoming economic and earnings events from the input data, sorted by date"
    )


# Import data fetching tools
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


# =============================================================================
# Analyst Agent Definition
# =============================================================================

ANALYST_INSTRUCTION = """
你是资深市场分析师，帮助散户投资人理解美股市场，你的优势是能够从市场数据和新闻中找到深入的洞察和前瞻判断提供给用户，而不是简单的搬运信息。
你的价值是帮用户建立思考框架，不是搬运信息。

## 核心原则务必遵守
- 解释因果链条：为什么重要 → 会导致什么 → 意味着什么
- 提供思考框架，帮用户自己判断
- 数据来自输入JSON，不编造，数据必须准确

## 输出要求

你需要输出四个字段：

1. **title**: 用一句有观点的话作为标题，概括今日市场核心（15-30个中文字符）

2. **summary**: 2-3句话概括市场主要动向和关键洞察，适合列表预览（50-100个中文字符）

3. **analysis**: 完整的市场分析报告，markdown格式，包含以下6个章节（详见下方）

4. **calendar**: 从输入的 economic_calendar 和 earnings_calendar 中筛选出最重要的5-10个事件，按日期排序，每个事件包含：
   - date: 事件日期 (YYYY-MM-DD)
   - event: 事件名称（必须使用中文，例如："美联储利率决议"、"NVIDIA财报"、"非农就业数据"、"CPI通胀数据"）
   - analysis: 为什么这个事件重要，可能对市场产生什么影响（1-2句中文）

### calendar 筛选标准
- 优先选择：美联储利率决议、CPI/PPI通胀数据、非农就业、GDP、大型科技股财报（NVDA, AAPL, MSFT, GOOGL, META, AMZN）
- 次要选择：零售销售、PMI、消费者信心、其他重要公司财报
- 解读要点：说明市场预期、潜在影响方向、关注什么数据

### analysis 字段的结构

# 标题
用一句有观点的话作为标题，概括今日市场核心。

## 主要市场叙事
用2-3段话说明：
- 当前市场的主导逻辑是什么
- 这个逻辑成立的关键假设
- 什么会验证/推翻这个逻辑

## 宏观环境
分析当前宏观环境，严格按照以下格式输出：

每个指标必须单独一行，使用以下固定格式（不要添加额外换行）：
- **指标名** 数值 (变化%) — 一句话解读

示例：
- **S&P 500** 6827.41 (-1.07%) — 科技股拖累大盘，但跌幅有限显示买盘承接
- **VIX** 15.74 (+5.99%) — 恐慌指数反弹，市场避险情绪升温
- **10Y国债** 4.19% — 维持高位，压制成长股估值

列出所有关键指标后，最后用一段话（以"**综合判断**："开头）总结宏观环境

## 重要新闻
严格筛选事件新闻，不超过10条。
首选：公司重大动作、政策变化、经济数据
次选：持仓变动、股票推荐
不选：分析师观点，预测文章

格式（每条新闻）：
**新闻标题**
 - 新闻概括 - 简短概括文章内容
 - 新闻解读 - 深度解读新闻潜在影响，深度洞察
 - [阅读原文](完整URL)

## 未来1-2周
按时间顺序列出关键事件：
### 时间
**事件名称**
- 重要性：为什么重要，市场会有什么反应

## 总结与思考框架
一份综合了以上所有信息后对目前市场状态的深度解读，帮助散户更清晰的看到市场脉络
"""

analyst_agent = LlmAgent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides structured insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_schema=MarketReportOutput,
    output_key="report",
)

# =============================================================================
# Pipeline Configuration
# =============================================================================

# Single agent with structured output (title, summary, analysis)
market_report_agent = analyst_agent

# ADK web UI needs root_agent variable
root_agent = market_report_agent


# =============================================================================
# Data Cleaning Functions for AI Input
# =============================================================================


def _clean_market_data(data: dict) -> dict:
    """Remove month_change field from market_data to reduce token usage."""
    result = {}
    for category, assets in data.items():
        if category in ["status", "report_date"]:
            result[category] = assets
            continue
        if isinstance(assets, dict):
            result[category] = {}
            for name, values in assets.items():
                if isinstance(values, dict):
                    # Handle nested dicts (e.g., rates.yield_curve.10Y)
                    cleaned = {}
                    for k, v in values.items():
                        if k == "month_change":
                            continue  # Remove month_change
                        if isinstance(v, dict):
                            # Recursively clean nested dicts
                            cleaned[k] = {
                                kk: vv for kk, vv in v.items() if kk != "month_change"
                            }
                        else:
                            cleaned[k] = v
                    result[category][name] = cleaned
                else:
                    result[category][name] = values
        else:
            result[category] = assets
    return result


def _prepare_data_for_analyst(
    market_data: dict,
    news: list,
    economic_calendar: list,
    earnings_calendar: list,
) -> dict:
    """
    Clean and minimize data for AI analyst.
    Removes redundant fields to reduce token usage by ~45%.

    Fields removed:
    - news: image, symbol, type, _source
    - economic_calendar: country, currency, impact, actual, change, changePercentage
    - earnings_calendar: epsActual, revenueActual, lastUpdated
    - market_data: month_change
    """
    # 1. Clean news - keep only: title, text, source, url, publishedDate
    clean_news = [
        {
            "title": n.get("title", ""),
            "text": n.get("text", ""),
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "publishedDate": n.get("publishedDate", ""),
        }
        for n in news
        if n.get("title") and n.get("url")  # Must have title and url
    ]

    # 2. Clean economic_calendar - keep only: date, event, previous, estimate, is_key_event
    clean_calendar = [
        {
            "date": e.get("date", ""),
            "event": e.get("event", ""),
            "previous": e.get("previous"),
            "estimate": e.get("estimate"),
            "is_key_event": e.get("is_key_event", False),
        }
        for e in economic_calendar
    ]

    # 3. Clean earnings_calendar - keep only: symbol, date, epsEstimated, revenueEstimated, is_ai_related
    clean_earnings = [
        {
            "symbol": e.get("symbol", ""),
            "date": e.get("date", ""),
            "epsEstimated": e.get("epsEstimated"),
            "revenueEstimated": e.get("revenueEstimated"),
            "is_ai_related": e.get("is_ai_related", False),
        }
        for e in earnings_calendar
    ]

    # 4. Clean market_data - remove month_change
    clean_market = _clean_market_data(market_data)

    return {
        "market_data": clean_market,
        "news": clean_news,
        "economic_calendar": clean_calendar,
        "earnings_calendar": clean_earnings,
    }


# =============================================================================
# MarketAgent Wrapper Class
# =============================================================================


class MarketAgent:
    """Wrapper class to fetch data and run the analyst agent."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=market_report_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Fetch all data and run the analyst agent with structured output."""
        try:
            print("[MarketAgent] Fetching market data...")

            # Step 1: Fetch all data directly (no LLM needed)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)
            calendar_result = get_economic_calendar(days=14)
            earnings_result = get_earnings_calendar(days=14)

            print(
                f"[MarketAgent] Data fetched. News: {news_result.get('news_count', 0)}, "
                f"Calendar: {calendar_result.get('events_count', 0)}, "
                f"Earnings: {earnings_result.get('earnings_count', 0)}"
            )

            # Step 2: Prepare and clean data for the agent (reduce token usage)
            report_date = datetime.now().strftime("%Y-%m-%d %A")

            data_for_analyst = _prepare_data_for_analyst(
                market_data=market_data,
                news=news_result.get("news", [])[
                    :50
                ],  # Top 50 news for better filtering
                economic_calendar=calendar_result.get("events", []),
                earnings_calendar=earnings_result.get("earnings", []),
            )
            data_for_analyst["report_date"] = report_date

            # Step 3: Create session and run the analyst agent
            print("[MarketAgent] Running analyst agent with structured output...")

            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="analyst"
            )

            # Send data to the agent
            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following market data and provide a comprehensive report:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            # Run agent and collect output
            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                pass  # Events are processed, output stored in session state

            # Get structured output from session state
            session_data = await self.runner.session_service.get_session(
                app_name="stock_agent", user_id="analyst", session_id=session.id
            )

            # Extract report from state (output_key="report" from analyst_agent)
            in_depth_analysis = ""
            title = ""
            summary = ""
            calendar = []

            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                report_data = state.get("report", {})

                if isinstance(report_data, dict):
                    title = report_data.get("title", "")
                    summary = report_data.get("summary", "")
                    in_depth_analysis = report_data.get("analysis", "")
                    calendar = report_data.get("calendar", [])
                elif isinstance(report_data, str):
                    # Try to parse as JSON if it's a string
                    try:
                        parsed = json.loads(report_data)
                        title = parsed.get("title", "")
                        summary = parsed.get("summary", "")
                        in_depth_analysis = parsed.get("analysis", "")
                        calendar = parsed.get("calendar", [])
                    except json.JSONDecodeError:
                        # If not JSON, treat as raw analysis
                        in_depth_analysis = report_data

            print(
                f"[MarketAgent] Analysis complete. Length: {len(in_depth_analysis)}, Title: {title[:30] if title else 'N/A'}, Calendar: {len(calendar)} events"
            )

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
                "short_analysis": "",
                "in_depth_analysis": in_depth_analysis,
                "title": title,
                "summary": summary,
                "calendar": calendar,
            }

        except Exception as e:
            print(f"Error in market analysis: {e}")
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
                "title": "",
                "summary": "",
                "calendar": [],
            }
