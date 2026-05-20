"""
Market Agent - Single Agent Architecture

Architecture:
    Python (fetch data) -> Analyst Agent (analyze + select news)

Data is fetched in Python, then the analyst agent selects important news
and produces the final structured report.
"""

import asyncio
import json
import os
import re

from app.core.logging import get_logger
from app.utils.timezone import now_iso, format_report_date

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

# Import Pydantic models from the models module
from app.features.daily_report.models import MarketReportOutput
from app.features.daily_report import db as market_db
from app.shared.llm_metering import meter

DAILY_REPORT_MODEL = "gemini-3.5-flash"

# Import data fetching tools
from app.shared.data_tools import get_all_market_data
from app.shared.data_tools.news import get_combined_market_news
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar


# =============================================================================
# Analyst Agent Definition
# =============================================================================

ANALYST_INSTRUCTION = """
你是资深市场分析师，服务对象是美股散户投资人——他们想了解市场但每天只有10-15分钟，苦于没有整理好的信息和解读市场的能力。
这些用户大多是科技股持有者和科技行业从业者，对科技股（尤其是AI、半导体、云计算、SaaS）和科技行业动态最为关注。
你的价值不是搬运信息，而是帮用户建立思考框架和判断能力。

## 核心原则
- 解释因果链条：为什么重要 -> 会导致什么 -> 意味着什么
- 提供判断框架而非推荐：给场景分析和触发条件，让用户自己决策
- 数据来自输入JSON，不编造，数据必须准确
- 所有内容使用中文

## 叙事连续性规则（重要！）
输入数据中可能包含 previous_reports（过去几天的日报标题和总结）。你必须：
- 将今天的行情放在最近几天的叙事里，而非孤立分析。例如："这是连续第三天科技股承压"或"与周二的恐慌不同，今天市场态度发生了转变"
- 如果前几天的展望被验证或被推翻，要主动说明。例如："我们周三提到关注 $AMZN 在200美元的支撑，今天该位果然被测试"
- 时间表述用"最近几天"、"近期"、"过去几个交易日"等，避免使用"本周"——因为 previous_reports 可能跨周
- 如果没有 previous_reports，则正常分析，不需要强行引用历史

## 情绪校准规则（重要！）
你是冷静的分析师，不是情绪放大器：
- 大涨日：在分析上涨逻辑的同时，必须指出"什么条件下涨势可能停止"
- 大跌日：在分析风险的同时，必须给出"更大图景中这次下跌的位置"（如"标普距年内高点仅回调3%"）
- 禁止使用以下词汇：黑色星期X、末日、狂欢、疯狂、崩盘（除非真的跌超10%）
- 标题风格：有观点但克制，像《经济学人》而非小报

## 事实核查规则
- "创新高"必须确认是历史最高，而非仅仅上涨
- "暴跌/暴涨"需有具体百分比支撑（通常>5%）
- 任何排名、数字、时间的claim都必须能在源数据中找到依据
- 如果源数据不明确，使用保守表述

## 输出字段指南

### title（标题）
用一句有观点但克制的话概括今日市场核心，15-30个中文字符。
好标题："AI开支争议进入第四天，硬件与软件阵营分化加剧"
坏标题："AI军备竞赛狂热掩盖巨头财控隐忧"（太煽情）

### summary（摘要）
2-3句话概括市场主要动向和关键洞察，适合列表预览，50-100个中文字符。

### intro（开场白）
这是用户打开日报看到的第一段内容。写2-3段：

第一段：今日市场一句话概括 + 与近几天的关联（如果有 previous_reports）
第二段：今日最值得关注的2-3件事预告
第三段：引导语

示例（有连续性的）：
"经历了周二周三的连续回调后，美股今日迎来技术性反弹，标普500收涨1.97%。但上涨结构值得细看——涨幅主要来自硬件芯片股，而非引发本轮调整的云计算巨头。

今日关键：1) 道指首次收于50,000点上方；2) 亚马逊2000亿开支计划的市场消化过程；3) 英伟达CEO关于需求的最新表态。

以下是详细分析。"

### news（今日市场热点）

这个板块的目的是让读者快速了解：今天市场上在讨论什么？发生了哪些重要的事？

输入JSON中有一个 news 数组，包含近期新闻文章，每条有 article_id、title、text、publishedDate。
你需要从中选出今天真正重要的市场热点。所有条目都必须来自这个数组中的真实文章。

**什么是"新闻"？——用"今天发生了什么"测试**
每条新闻必须能用"[某公司/某人] 做了 [某事]"来概括。如果概括不出来，它就不是新闻。

是新闻（有人做了某事）：
- "英伟达CEO黄仁勋表示AI需求远超预期" -> 黄仁勋发表了声明
- "亚马逊宣布2000亿美元AI投资计划" -> 亚马逊做了决定
- "Block宣布裁员10%" -> Block采取了行动
- "Palantir Q4利润同比增长700%" -> Palantir公布了财报

不是新闻（没有新事件发生）：
- "周三将公布CPI数据" -> 日历预告，属于 calendar 板块
- "道指首次突破5万点" -> 指数变动，属于 report_summary 分析
- "分析师认为AI股票被高估" -> 个人观点，不是事件
- "美股本周回顾与展望" -> 市场综述，不是具体事件

**时效性验证（极重要！必须严格执行）**
新闻数组中的文章虽然是最近发布的，但文章报道的事件可能发生在数天甚至数周前。你必须检查每篇文章的实际内容，判断报道的事件是否发生在今天或昨天。

必须排除的"旧事新报"类文章：
- 回顾/总结类："亚马逊股价上月大跌12%"、"Netflix stock surged 10% in February" -> 报道的是上月的价格变动，不是今天发生的
- 月度/周度复盘："Top gainers/losers of the month"、"本月表现最佳科技股" -> 回顾总结，不是新事件
- 过时的价格变动：文章标题或正文提到 "last month"、"in January"、"past quarter"、"since December"、"over the past weeks" 等过去时间框架的价格涨跌幅

判断方法：读文章的 title 和 text，问自己"这个事件是今天/昨天发生的吗？"
- 如果文章说"Amazon dropped 12%"，检查 text 里是否提到这是 last month/past month 的变动 -> 如果是，排除
- 如果文章说"Amazon宣布新AI计划"，这是一个新公告 -> 可以选入

这类旧事新报的文章会严重误导读者，让他们以为今天发生了大波动。即使文章来自可靠来源且内容准确，只要报道的事件不是近1-2天发生的，就不能选入。

**URL 规则：** url 字段填写来源文章的 article_id 数字（如 "0"、"5"、"12"），系统自动替换为真实链接。

**headlines（今日头条，2-4条）**
头条 = 今天市场关注度最高的热点。选择前先思考：如果一个科技行业从业者今天只看3条新闻，他最想知道什么？

选择标准（全部满足）：
1. 市场关注度高——判断方法：这条新闻会不会出现在 CNBC/Bloomberg 的首页？普通投资者会不会在社交媒体上讨论它？如果答案是"不会"，就不要选。像 Firmus、Wolfspeed、Faraday Future 这类大多数投资者没听过的公司，关注度不够做头条。
2. 公司知名度门槛——headlines 中涉及的公司必须是大众投资者认识的名字：
   - Mag 7（AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA）
   - 知名科技/金融公司（AMD, CRM, NFLX, COIN, PLTR, SQ, UBER, SNOW, BA, JPM, GS 等）
   - 中概龙头（BABA, PDD, NIO, LI, BIDU, JD 等）
   - 如果是行业事件（如AI出口管制、关税政策），不需要特定公司
   - 不符合以上条件的公司只能放 briefs
3. 有实质性的新事件发生（不是预告、不是评论、不是指数变动）
4. 优先科技/AI相关热点

每条需包含：
- fact_summary: 1句话总结发生了什么
- deep_analysis: 5-6句分析，解释事件背后的逻辑、重要性、对市场/板块/标的的影响
- url: 来源文章的 article_id 数字

**briefs（其他快讯，目标8-12条，最少5条）**
读者以科技股投资者为主，优先级从高到低：
1. 科技/AI公司动态（财报、产品、战略、人事）
2. 半导体、云计算、SaaS行业变化
3. 科技行业监管和政策
4. 中概股科技公司
5. 加密货币
6. 其他行业——仅当对大盘有显著影响时才选入

数量规则：质量优先于数量。宁可少几条，也不要凑数。
去重规则：同一家公司（同一个 ticker）在整个 news 板块中最多出现一次。如果有多篇关于同一家公司的文章，选最重要的一篇，放在 headlines 或 briefs 中，不要两边都放。

每条需包含：
- summary: 1句话说明发生了什么
- analysis: 2-3句话分析影响
- url: 来源文章的 article_id 数字

### report_summary（总结与展望）
输出2个子板块（title + content）。读者已经看过 intro 和新闻，这里不要重复那些内容。

**语言规则**
- 大白话写作，禁止术语（"结构性扩散"、"风险资产定价"）和比喻（"就像爱马仕和优衣库"）
- 专业概念必须翻译：如"VIX（恐慌指数）跌了20%，说明市场紧张情绪正在消退"
- 标准：没有金融背景的大学生也能看懂

**子板块1：深度解读与总结**
title: "深度解读与总结"
content: 1段，150-200字。回答一个问题：把今天所有事串起来，背后的一条主线是什么？
- 第一句话就是核心洞察（不是"今天市场…"的流水账开头）
- 融入关键宏观信号（VIX、利率、美元等），用大白话解释含义
- 如果有 previous_reports，把今天放到最近几天的叙事中

示例："今天表面上是科技股反弹，但真正的信号藏在债市——10年期国债利率一天跌了8个基点，说明市场押注经济在降温。这和昨天公布的疲软就业数据一脉相承：如果经济真的在放缓，美联储降息的理由就更充分了，而降息预期正是今天成长股反弹的底层逻辑。不过VIX（恐慌指数）还在20以上，说明市场并没有完全放心。"

**子板块2：未来展望**
title: "未来展望"
content: 1-2段，150-250字。回答一个问题：接下来最值得关注的2-3件事是什么？
- 每件事必须有具体日期 + "如果X -> 则Y"的场景分析
- 提到标的时附带具体价位或触发条件
- 给判断框架，不给操作建议

示例："接下来关注两件事：周三（2月11日）的CPI数据，如果低于2.5%，降息预期升温，科技股可能继续反弹；如果超过3%，高估值科技股首当其冲。第二，$AMZN周四盘后财报，AWS增速能否超19%的预期将直接影响AI板块信心，200美元是关键支撑位。"

### calendar（重要事件日历）
从输入的 economic_calendar 和 earnings_calendar 中筛选5-10个最重要事件：
- 优先：美联储利率决议、CPI/PPI、非农就业、GDP、大型科技股财报
- 次要：零售销售、PMI、消费者信心、其他重要公司财报

字段说明：
- date: 从输入数据中原样复制日期（YYYY-MM-DD格式）
- event: 中文事件名称，如 "美光科技 (MU) 财报"、"美国1月CPI数据"
- analysis: 1-2句分析，说明为什么重要及潜在影响
"""

analyst_agent = LlmAgent(
    name="market_analyst",
    model=DAILY_REPORT_MODEL,
    description="Analyzes market data and news, provides structured insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_schema=MarketReportOutput,
    output_key="report",
    after_model_callback=meter("daily_report", model=DAILY_REPORT_MODEL),
)

# =============================================================================
# Pipeline Configuration
# =============================================================================

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


def _is_retrospective_news(title: str, text: str) -> bool:
    """
    Detect retrospective/stale news that reports on past events.

    These are articles published today but reporting on price movements or events
    from weeks/months ago. They mislead readers into thinking the event happened today.

    Examples that should be filtered:
    - "Amazon stock dropped 12% last month"
    - "Top tech gainers of February"
    - "Netflix surged 10% since January"
    """
    combined = (title + " " + text[:300]).lower()

    # Pattern 1: Past timeframe + price movement (the most common pattern)
    # Matches: "fell 12% last month", "surged 10% in february", "dropped since january"
    price_move_re = re.compile(
        r'(?:surge[ds]?|jump(?:ed|s)?|soar(?:ed|s)?|gain(?:ed|s)?|rose|ris(?:es?|ing)|rally|rallied'
        r'|drop(?:ped|s)?|fell|fall(?:s|ing)?|plung(?:ed|es?|ing)|tumbl(?:ed|es?|ing)'
        r'|declin(?:ed|es?|ing)|los(?:t|es?|ing)|tank(?:ed|s)?|crash(?:ed)?|slid|sink(?:s|ing)?)'
        r'\s+\d+%?\s*'
        r'(?:last\s+(?:month|week|quarter)|in\s+(?:january|february|march|april|may|june'
        r'|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)'
        r'|over\s+the\s+past\s+(?:month|weeks?|quarter)'
        r'|since\s+(?:january|february|march|april|may|june|july|august|september|october|november|december'
        r'|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|last|the\s+start))'
    )
    if price_move_re.search(combined):
        return True

    # Pattern 2: Reverse order - timeframe then price move
    # Matches: "last month Amazon fell 12%", "in February, Netflix surged"
    reverse_re = re.compile(
        r'(?:last\s+(?:month|week|quarter)'
        r'|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december'
        r'|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))'
        r'.{0,40}'
        r'(?:surge[ds]?|jump(?:ed|s)?|soar(?:ed|s)?|gain(?:ed|s)?|rose|rally|rallied'
        r'|drop(?:ped|s)?|fell|plung(?:ed|es?|ing)|tumbl(?:ed|es?|ing)|declin(?:ed|es?|ing)'
        r'|los(?:t|es?)|tank(?:ed|s)?|crash(?:ed)?|slid)'
        r'\s+\d+%'
    )
    if reverse_re.search(combined):
        return True

    # Pattern 3: Monthly/weekly summary articles
    summary_patterns = [
        r'(?:top|best|worst|biggest)\s+\w*\s*(?:gainers?|losers?|performers?|stocks?)\s+(?:of|in|for)\s+(?:the\s+)?(?:month|week|january|february|march|april|may|june|july|august|september|october|november|december)',
        r'(?:monthly|weekly)\s+(?:recap|review|roundup|wrap|summary)',
        r'(?:month|week)\s+in\s+review',
        r'how\s+.{0,20}\s+performed\s+(?:last|in|this)\s+(?:month|week|quarter)',
    ]
    for pattern in summary_patterns:
        if re.search(pattern, combined):
            return True

    return False


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
    # 1. Clean news - add article_id for reliable URL resolution.
    #    URL is kept in data so AI can see it, but AI writes article_id in output.
    #    Python post-processing resolves article_id -> real URL.
    #    Pre-filter obvious junk before sending to AI.
    clean_news = []
    retrospective_filtered = 0
    for i, n in enumerate(news):
        title = n.get("title", "")
        if not title:
            continue
        # Pre-filter junk articles that waste AI attention
        title_upper = title.upper()
        if any(spam in title_upper for spam in [
            "DEADLINE ALERT", "ROSEN,", "CLASS ACTION",
            "INVESTORS WITH LOSSES", "ENCOURAGES", "LAWSUIT",
        ]):
            continue
        # Pre-filter retrospective news (reports on past events)
        text = n.get("text", "")
        if _is_retrospective_news(title, text):
            retrospective_filtered += 1
            logger.info("Filtered retrospective news: %s", title[:80])
            continue
        item = {
            "article_id": i,
            "title": title,
            "text": text,
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "publishedDate": n.get("publishedDate", ""),
        }
        clean_news.append(item)

    if retrospective_filtered:
        logger.info("Filtered %d retrospective news articles", retrospective_filtered)

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

    async def analyze(self) -> dict | None:
        """Fetch all data and run the analyst agent with structured output."""
        try:
            logger.info("Fetching market data...")

            # Step 1: Fetch all data directly (no LLM needed)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)
            calendar_result = get_economic_calendar(days=14)
            earnings_result = get_earnings_calendar(days=14)

            logger.info(
                "Data fetched. News: %d, Calendar: %d, Earnings: %d",
                news_result.get('news_count', 0),
                calendar_result.get('events_count', 0),
                earnings_result.get('earnings_count', 0),
            )

            # Step 2: Prepare and clean data for the analyst (reduce token usage)
            raw_news = news_result.get("news", [])
            report_date = format_report_date()  # Pacific timezone

            data_for_analyst = _prepare_data_for_analyst(
                market_data=market_data,
                news=raw_news,
                economic_calendar=calendar_result.get("events", []),
                earnings_calendar=earnings_result.get("earnings", []),
            )
            data_for_analyst["report_date"] = report_date

            # Step 3: Fetch past 5 days' reports for narrative continuity
            previous_reports = []
            try:
                recent_reports = await market_db.list_reports(limit=5)
                for r in reversed(recent_reports):  # oldest first
                    previous_reports.append({
                        "date": r.get("report_date", "")[:10],
                        "title": r.get("title", ""),
                        "report_summary": r.get("report_summary", ""),
                    })
                logger.info("Loaded %d previous reports for context", len(previous_reports))
            except Exception as e:
                logger.warning("Could not load previous reports: %s", e)

            if previous_reports:
                data_for_analyst["previous_reports"] = previous_reports

            # Step 4: Create session and run the analyst agent (with retry)
            logger.info("Running analyst agent with structured output...")
            max_attempts = 2
            title = ""
            summary = ""
            intro = ""
            news = {"headlines": [], "briefs": []}
            report_summary = []
            calendar = []

            for attempt in range(1, max_attempts + 1):
                try:
                    session = await self.runner.session_service.create_session(
                        app_name="stock_agent", user_id="analyst"
                    )

                    message = Content(
                        parts=[
                            Part(
                                text=f"Please analyze the following market data and provide a comprehensive report:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                            )
                        ],
                        role="user",
                    )

                    async for event in self.runner.run_async(
                        user_id="analyst", session_id=session.id, new_message=message
                    ):
                        pass

                    session_data = await self.runner.session_service.get_session(
                        app_name="stock_agent", user_id="analyst", session_id=session.id
                    )

                    if session_data and hasattr(session_data, "state"):
                        state = session_data.state or {}
                        report_data = state.get("report", {})

                        if isinstance(report_data, str):
                            try:
                                report_data = json.loads(report_data)
                            except json.JSONDecodeError:
                                report_data = {}

                        if isinstance(report_data, dict):
                            title = report_data.get("title", "")
                            summary = report_data.get("summary", "")
                            intro = report_data.get("intro", "")
                            news = report_data.get("news", {"headlines": [], "briefs": []})
                            report_summary = report_data.get("report_summary", [])
                            calendar = report_data.get("calendar", [])

                    # Validate Gemini returned actual content
                    if not title and not news.get("headlines"):
                        logger.warning(
                            "Gemini returned empty content (attempt %d/%d)",
                            attempt, max_attempts,
                        )
                        if attempt < max_attempts:
                            await asyncio.sleep(3)
                            continue
                        else:
                            logger.error("Gemini returned empty content after %d attempts", max_attempts)
                            return None

                    break  # Success, exit retry loop

                except Exception as e:
                    if attempt < max_attempts:
                        logger.warning(
                            "Analyst Gemini call failed (attempt %d/%d), retrying in 3s: %s",
                            attempt, max_attempts, e,
                        )
                        await asyncio.sleep(3)
                    else:
                        logger.error(
                            "Analyst Gemini call failed after %d attempts: %s",
                            max_attempts, e,
                        )
                        return None

            # Resolve article_id references to real URLs
            news = self._resolve_article_urls(news, raw_news)

            logger.info(
                "Analysis complete. Title: %s, Headlines: %d, Briefs: %d, Calendar: %d events",
                title[:30] if title else 'N/A',
                len(news.get('headlines', [])),
                len(news.get('briefs', [])),
                len(calendar),
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
                "title": title,
                "summary": summary,
                "intro": intro,
                "news": news,
                "report_summary": report_summary,
                "calendar": calendar,
            }

        except Exception as e:
            logger.exception("Error in market analysis")
            return None

    def _resolve_article_urls(self, news: dict, source_news: list) -> dict:
        """Ensure all news URLs are valid by resolving article_id or validating URLs.

        Handles three cases:
        1. AI wrote article_id (e.g. "0", "5") -> resolve to real URL
        2. AI copied a real URL from input -> keep as-is
        3. AI fabricated a URL -> try to fix, otherwise clear
        """
        if not news or not source_news:
            return news

        # Build mappings
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
        kept = 0
        cleared = 0

        for item in news.get("headlines", []) + news.get("briefs", []):
            url_field = str(item.get("url", "")).strip()
            published_at = ""

            if url_field in id_to_url:
                # Case 1: article_id -> resolve to real URL
                item["url"] = id_to_url[url_field]
                published_at = id_to_published_at.get(url_field, "")
                resolved += 1
            elif url_field in valid_urls:
                # Case 2: AI correctly copied a real URL from input
                published_at = url_to_published_at.get(url_field, "")
                kept += 1
            elif url_field.startswith("http"):
                # Case 3: AI wrote a URL but it's not from input (fabricated)
                # Clear it rather than show a broken/wrong link
                item["url"] = ""
                cleared += 1
            else:
                # Empty or unrecognized
                item["url"] = ""
                if url_field:
                    cleared += 1

            item["published_at"] = published_at

        logger.info("%d resolved from ID, %d valid URLs kept, %d cleared", resolved, kept, cleared)
        return news
