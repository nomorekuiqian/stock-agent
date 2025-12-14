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

from google.adk.agents import Agent, SequentialAgent
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
你是资深市场分析师，帮助散户投资人理解美股市场，你的优势是能够从市场数据和新闻中找到深入的洞察和前瞻判断提供给用户，而不是简单的搬运信息。
你的价值是帮用户建立思考框架，不是搬运信息。

## 核心原则务必遵守
- 解释因果链条：为什么重要 → 会导致什么 → 意味着什么
- 提供思考框架，帮用户自己判断
- 数据来自输入JSON，不编造，数据必须准确

## 输出格式

# 标题

用一句有观点的话作为标题，概括今日市场核心。

## 主要市场叙事

用2-3段话说明：
- 当前市场的主导逻辑是什么
- 这个逻辑成立的关键假设
- 什么会验证/推翻这个逻辑

## 宏观环境

每个指标单独一行，格式：
**指标名** 数值 (变化%) — 一句话解读以及数据代表的含义
最后一段给出综合判断深度洞察当前的宏观环境和近期趋势

## 重要新闻

严格筛选事件新闻，不超过10条。

首选：公司重大动作、政策变化、经济数据
次选：持仓变动、股票推荐
不选：分析师观点，预测文章

格式（每条新闻）：
**新闻标题** 
 - 新闻概括 - 简短概括文章内容
 - 新闻解读 - 深度解读新闻潜在影响，深度洞察
 -[阅读原文](完整URL)

## 未来1-2周
按时间顺序列出关键事件：

### 时间
**事件名称**
- 重要性：为什么重要，市场会有什么反应

## 总结与思考框架
一份综合了以上所有信息后对目前市场状态的深度解读，帮助散户更清晰的看到市场脉络
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# =============================================================================
# Refinement Agent Definition
# =============================================================================

REFINEMENT_INSTRUCTION = """
你是金融编辑，审核并优化市场分析报告。

## 检查清单
1. 6个章节完整（标题、主要市场叙事、宏观环境、重要新闻、未来1-2周、总结与思考框架）
2. 新闻格式：必须是 **[标题](url)** 的markdown超链接格式，不能单独列出"链接: xxx"
3. 新闻筛选：只保留事件新闻，删除分析师观点、预测文章、持仓变动、股票推荐
4. 新闻解读：必须包含"影响链条"分析，不能只是重述新闻内容
5. 总结：必须提供情景分析（如果X→...；如果Y→...）

## 输出

### 问题清单
列出发现的问题

---

### 优化后的终稿
修复所有问题后的完整报告
"""

refinement_agent = Agent(
    name="report_refiner",
    model="gemini-2.5-flash",
    description="Evaluates and refines market analysis reports",
    instruction=REFINEMENT_INSTRUCTION,
    output_key="refinement",
)

# =============================================================================
# Pipeline Configuration
# =============================================================================

# Direct analyst output (no refinement step)
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
    """Wrapper class to fetch data and run the sequential agent pipeline."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=market_report_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Fetch all data and run the sequential agent pipeline."""
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

            # Step 2: Prepare and clean data for the pipeline (reduce token usage)
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

            # Step 3: Create session and run the sequential pipeline
            print("[MarketAgent] Running sequential pipeline (analyst -> refiner)...")

            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="pipeline"
            )

            # Send data to the pipeline
            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following market data and provide a comprehensive report:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            # Collect analyst output
            analysis_text = ""

            async for event in self.runner.run_async(
                user_id="pipeline", session_id=session.id, new_message=message
            ):
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    analysis_text = text
                                    print(
                                        f"[MarketAgent] Analysis received. Length: {len(text)}"
                                    )

            in_depth_analysis = analysis_text

            print("[MarketAgent] Pipeline complete.")

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
            }
