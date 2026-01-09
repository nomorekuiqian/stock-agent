"""
Market Agent - Simplified Architecture

Architecture:
    Python (fetch data) -> Analyst Agent (analyze)

Data is fetched directly in Python and passed to the analyst agent for analysis.
"""

import json
import os
from app.utils.timezone import now_iso, format_report_date

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
    trend_direction: str = Field(description="Trend direction: 'up', 'down', or 'flat'")
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


# Import data fetching tools
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


# =============================================================================
# Analyst Agent Definition
# =============================================================================

ANALYST_INSTRUCTION = """
你是资深市场分析师，服务对象是美股散户投资人——他们想了解市场但每天只有10-15分钟，苦于没有整理好的信息和解读市场的能力。
你的价值是帮用户建立思考框架，提供可操作的洞察，而不是简单搬运信息。

## 核心原则
- 解释因果链条：为什么重要 → 会导致什么 → 意味着什么
- 提供思考框架，帮用户自己判断
- 数据来自输入JSON，不编造，数据必须准确
- 给出具体可操作的建议，包括标的和风险提示
- 所有内容使用中文

## 事实核查规则（重要！）
你的解读和claim必须与源数据完全一致，不能夸大或曲解：
- "超越某公司"不等于"登顶"或"第一"——必须明确具体排名
- "创新高"必须确认是历史最高，而非仅仅上涨
- "暴跌/暴涨"需有具体百分比支撑（通常>5%）
- 任何排名、数字、时间的claim都必须能在源数据中找到依据
- 如果源数据不明确，使用保守表述（如"显著上涨"而非"暴涨"）

错误示例：新闻说"A超越B成为第二"→ 标题写"A登顶" ❌
正确示例：新闻说"A超越B成为第二"→ 标题写"A跃居第二" ✓

## 输出字段指南

### title（标题）
用一句有观点的话概括今日市场核心，15-30个中文字符。
示例："科技股独舞难掩市场分化，降息预期再遭打压"

### summary（摘要）
2-3句话概括市场主要动向和关键洞察，适合列表预览，50-100个中文字符。

### intro（开场白）
这是用户打开日报看到的第一段内容，要抓住注意力，让他想继续看下去。

写2-3段，包含：
- 今日市场整体情绪和表现（一句话概括）
- 今日最值得关注的2-3件事预告（让用户知道接下来会看到什么）
- 一句话引导（"以下是今日详细分析"）

示例：
"美股三大指数集体收涨，标普创两周新高。市场在消化完Fed会议纪要后情绪回暖，科技股领涨。

今日最值得关注：1) VIX大跌12%回到"恐慌"区间下方；2) 英伟达财报余温推动半导体板块轮动；3) 下周CPI数据前的布局窗口。

以下是今日市场详细分析。"

### macro（宏观环境）

**signals（核心信号，2-3个）**
从输入数据中选择最重要的宏观信号。利用数据中的历史信息（previous_close, week_ago, high_1mo, low_1mo, trend, position_in_range）分析趋势。

每个信号的 analysis 字段需包含（融合成一段连贯的话）：
- 趋势：与上周相比的变化方向和幅度
- 位置：在近期区间的位置（接近高点/低点/中间）
- 影响：对股市/板块意味着什么

示例 analysis："VIX从上周的21.2下降至18.5，跌幅超过12%，显示市场恐慌情绪明显缓解。目前处于月内低位区间，接近一个月最低点16.8。低波动环境通常利好风险资产，尤其是科技成长股，短期内市场有望延续反弹。"

**summary（宏观总结）**
4-6句话综合评价：
- 当前宏观周期（如"高利率+经济韧性"、"降息预期升温"）
- 各信号综合来看，对股市整体是利好还是利空
- 哪类资产/板块在这种环境下更有机会
- 什么事件/数据可能改变当前格局

### news（重要新闻）

**headlines（今日头条，2-4条）**
挑选最重要、最有市场影响力的新闻进行深度解读。优先选择：
- 大型科技公司重大动作（产品发布、战略调整、高管变动）
- AI/芯片行业重大新闻
- 宏观政策变化（Fed、财政政策）
- 重大并购或投资

每条需包含：
- fact_summary: 1句话总结发生了什么
- deep_analysis: 5-6句分析，解释事件背后的逻辑、重要性、对市场/板块/标的的影响
- url: 原文链接（从输入数据中获取）

不选：分析师观点、预测文章、泛泛而谈的市场评论

**briefs（其他快讯，8-12条）**
覆盖更广泛的市场动态：
- 公司财报/业绩指引
- 产品发布、技术突破
- 监管政策、反垄断动态
- 中概股重大新闻
- 加密货币相关（如有）
- 重要持仓变动、并购消息

每条需包含：
- summary: 1句话说明发生了什么
- analysis: 2-3句话分析影响
- url: 原文链接

### report_summary（综合总结）
这是日报最重要的部分。如果用户只看这一段，也要能知道今天的重点。

写成三段话（用换行分隔），不要加小标题：

第一段：今日回顾
市场整体表现如何，主要指数涨跌幅，哪些板块领涨/领跌，最值得关注的单一事件或动向。
示例："今日美股三大指数集体上涨，标普500涨0.9%，纳指涨1.2%领跑。科技股延续强势，半导体板块在NVDA带领下普涨，费城半导体指数创月内新高。另一方面，防御性板块（公用事业、必需消费）表现疲软，显示资金在向风险资产回流。"

第二段：波动归因
解释为什么今天会这样，将宏观因素（美联储、利率、情绪、板块轮动）与具体新闻催化剂结合起来，明确因果关系。不是简单罗列，而是讲清楚逻辑链条。
示例："今日上涨主要受两个因素驱动：1) 昨日Fed会议纪要措辞偏鸽，市场降息预期从年底提前至9月，推动成长股估值修复；2) NVDA财报余温延续，数据中心收入同比+154%超预期，验证AI需求持续性，带动整个半导体板块估值重估。VIX从21跌至18，显示市场恐慌情绪明显缓解。"

第三段：未来展望
未来1-2周的预期走势，需要关注的风险和机会。这一段要有实操价值，必须提到：
- 具体值得关注的标的（使用 $TICKER 格式，如 $NVDA, $SMCI）或板块（如半导体、金融），并解释为什么值得关注
- 潜在风险及其触发条件（如"若CPI超预期，可能压制成长股"）
- 重要日期/事件

示例："短期看，科技股有望继续受益于降息预期升温。AI算力链仍是主线，$NVDA 财报验证需求后，上游的 $MU（内存）和 $SMCI（服务器）可能迎来估值修复。金融板块在降息预期下承压，但 $JPM 等大行若财报超预期可能带动反弹。风险方面，下周三CPI是关键——若通胀超预期反弹至3%以上，降息预期降温将首先冲击高估值成长股。重点关注：1月15日CPI、1月17日大银行财报。"

### calendar（重要事件日历）
从输入的 economic_calendar 和 earnings_calendar 中筛选5-10个最重要事件：
- 优先：美联储利率决议、CPI/PPI、非农就业、GDP、大型科技股财报
- 次要：零售销售、PMI、消费者信心、其他重要公司财报

**字段说明**：
- date: 从输入数据中原样复制日期（YYYY-MM-DD格式）
  - 财报：从 earnings_calendar 的 date 字段复制
  - 经济数据：从 economic_calendar 的 date 字段复制（只取日期部分）
- event: 中文事件名称，如 "美光科技 (MU) 财报"、"美国11月CPI数据"
- analysis: 1-2句中文分析，说明为什么重要及对市场的潜在影响
"""

analyst_agent = LlmAgent(
    name="market_analyst",
    model="gemini-3-flash-preview",
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
            report_date = format_report_date()  # Pacific timezone

            data_for_analyst = _prepare_data_for_analyst(
                market_data=market_data,
                news=news_result.get("news", [])[
                    :70
                ],  # Top 70 news for broader coverage
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
            # New structured fields
            title = ""
            summary = ""
            intro = ""
            macro = {"signals": [], "summary": ""}
            news = {"headlines": [], "briefs": []}
            report_summary = ""
            calendar = []

            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                report_data = state.get("report", {})

                if isinstance(report_data, str):
                    # Try to parse as JSON if it's a string
                    try:
                        report_data = json.loads(report_data)
                    except json.JSONDecodeError:
                        report_data = {}

                if isinstance(report_data, dict):
                    title = report_data.get("title", "")
                    summary = report_data.get("summary", "")
                    intro = report_data.get("intro", "")
                    macro = report_data.get("macro", {"signals": [], "summary": ""})
                    news = report_data.get("news", {"headlines": [], "briefs": []})
                    report_summary = report_data.get("report_summary", "")
                    calendar = report_data.get("calendar", [])

            print(
                f"[MarketAgent] Analysis complete. Title: {title[:30] if title else 'N/A'}, "
                f"Macro signals: {len(macro.get('signals', []))}, "
                f"Headlines: {len(news.get('headlines', []))}, "
                f"Briefs: {len(news.get('briefs', []))}, "
                f"Calendar: {len(calendar)} events"
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
                "timestamp": now_iso(),
                # Structured output
                "title": title,
                "summary": summary,
                "intro": intro,
                "macro": macro,
                "news": news,
                "report_summary": report_summary,
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
                "timestamp": now_iso(),
                # Structured fields with defaults
                "title": "",
                "summary": f"Data fetched (analysis error: {str(e)[:100]})",
                "intro": "",
                "macro": {"signals": [], "summary": ""},
                "news": {"headlines": [], "briefs": []},
                "report_summary": "",
                "calendar": [],
            }
