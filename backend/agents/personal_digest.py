"""
PersonalDigest - Daily Digest for User Watchlist

Architecture:
    Python (fetch stock + news data) -> PersonalDigest Agent (gemini-3-flash) -> Structured output

Cost: ~$0.018/request (vs MarketAgent $0.07 - saves 75%)
"""

import json
import os
from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field

from app.utils.timezone import now_iso, format_report_date
from agents.tools.market_data import get_stock_quotes, get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


# =============================================================================
# Pydantic Output Schema for PersonalDigest
# =============================================================================


class StockSummary(BaseModel):
    """Individual stock summary in the digest."""

    symbol: str = Field(description="Stock ticker symbol, e.g., 'NVDA'")
    name: str = Field(
        description="Chinese company name, e.g., '英伟达', '苹果', '特斯拉'"
    )
    price: float = Field(
        description="Current stock price from input data, must be accurate"
    )
    daily_change: str = Field(
        description="Daily change with +/- sign, e.g., '+2.35%' or '-1.20%'"
    )
    week_change: str = Field(
        description="Weekly change with +/- sign, e.g., '+5.2%' or '-3.1%'"
    )
    status: str = Field(
        description="Natural language status - describe what's happening, not a fixed category. "
        "Good: '连涨四天后首次回调', '财报后持续消化中', '跟随板块反弹', '创一个月新高'. "
        "Bad: '强势上涨', '小幅回调' (too template-like)"
    )
    quick_take: str = Field(
        description="3-4 sentences with clear logic chain: "
        "1) What happened today (price action), "
        "2) Why it happened (news catalyst, sentiment shift, sector rotation), "
        "3) Market's interpretation (institutional behavior, narrative change), "
        "4) What it means going forward. "
        "Focus on news, sentiment, narrative - NOT technical analysis (no support/resistance levels)."
    )


class HeadlineNews(BaseModel):
    """Important news with deep analysis."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this affects, e.g., ['NVDA', 'AMD']"
    )
    fact_summary: str = Field(
        description="One sentence: factual summary of what happened"
    )
    deep_analysis: str = Field(
        description="5-6 sentences: "
        "1) background context, "
        "2) why this news matters, "
        "3) market/sector implications, "
        "4) specific impact on user's watched stocks,"
        "5) what to watch next"
    )
    url: str = Field(description="Original article URL from input data")


class BriefNews(BaseModel):
    """Other notable news with brief analysis."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this affects"
    )
    summary: str = Field(description="One sentence: what happened")
    analysis: str = Field(
        description="2-3 sentences: why it matters and impact on watched stocks"
    )
    url: str = Field(description="Original article URL from input data")


class NewsSection(BaseModel):
    """News section with headlines and briefs."""

    headlines: list[HeadlineNews] = Field(
        description="3-4 most impactful news items with deep analysis"
    )
    briefs: list[BriefNews] = Field(
        description="8-10 other notable news items with brief analysis"
    )


class UpcomingEvent(BaseModel):
    """Upcoming event relevant to user's watchlist."""

    date: str = Field(
        description="Event date in YYYY-MM-DD format, copied from input data"
    )
    event: str = Field(
        description="Event name in Chinese, e.g., '英伟达 (NVDA) Q3财报', '美国12月CPI数据'"
    )
    related_symbols: list[str] = Field(
        description="Which watchlist stocks will be affected"
    )
    why_important: str = Field(
        description="1-2 sentences: why user should care about this event."
    )


class Summary(BaseModel):
    """Comprehensive summary in 3 paragraphs, no subtitles."""

    content: str = Field(
        description="Three paragraphs of analysis, separated by newlines:\n\n"
        "Paragraph 1: Watchlist overview today - best/worst performers, how they compare to market (SPY/QQQ).\n\n"
        "Paragraph 2: Why these stocks moved - connect macro factors (Fed, rates, sentiment, sector rotation) "
        "with specific news catalysts. Be specific about cause-and-effect.\n\n"
        "Paragraph 3: Near-term outlook - expectations for 1-2 weeks, key risks to watch, "
        "potential catalysts, important upcoming events."
    )


class PersonalDigestOutput(BaseModel):
    """Structured output for personalized digest."""

    # Header
    greeting: str = Field(
        description="Date + engaging hook. Format: 'YYYY年MM月DD日 | [hook]'. "
        "Example: '2024年12月18日 | 科技股集体反弹，你关注的股票今天表现不错'"
    )
    one_line_summary: str = Field(
        description="One sentence telling the core story of user's watchlist today. Must have insight, not just list numbers. "
        "Good: 'NVDA带领科技股反弹，但AAPL因中国销量担忧掉队'. "
        "Bad: '今日关注股票涨跌不一，NVDA涨3%，AAPL跌1%'"
    )

    # Section 1: Watchlist Overview
    stocks: list[StockSummary] = Field(
        description="Analysis for each watchlist stock, ordered by importance (most notable movement first)"
    )

    # Section 2: News (Headline + Brief structure)
    news: NewsSection = Field(
        description="News section with 3-4 headlines (deep analysis) and 8-10 briefs (short analysis)"
    )

    # Section 3: Upcoming Events
    events: list[UpcomingEvent] = Field(
        description="3-6 events in next 7 days relevant to user's watchlist. Prioritize earnings of held stocks."
    )

    # Section 4: Summary (replaces macro_impact + bottom_line)
    summary: Summary = Field(
        description="Comprehensive summary: watchlist recap, movement drivers, outlook, and key takeaways"
    )


# =============================================================================
# PersonalDigest Agent Prompt (Reasoning-First Design)
# =============================================================================

DIGEST_INSTRUCTION = """
你是用户的私人市场分析师。用户把关注列表（watchlist）交给你，希望你每天帮他梳理"今天我应该知道什么"。

注意：这是用户关注的股票，不一定是用户实际持有的股票。用户可能在观察这些股票，考虑买入，或者只是想跟踪它们的动态。

你不是在填表格，而是在帮朋友写一份有洞见的投资笔记。

## 核心原则
- 围绕用户关注的股票组织内容，这不是泛泛的市场日报
- 解释因果链: 发生了什么 → 为什么重要 → 对这些股票意味着什么
- 数据来自输入JSON，价格和涨跌幅必须准确，不编造
- 语言自然，像给朋友发消息，有观点，敢下判断
- 所有内容使用中文

## 你的思考过程

分析数据时，问自己:
1. 今天哪只股票有异常? 为什么?
2. 新闻里什么会真正影响用户关注的股票?
3. 未来一周有什么事件需要提前关注?
4. 如果只能说一句话，最重要的是什么?

---

## 输出字段指南

### greeting（开场）
日期 + 一句有温度的引子，让用户想继续看下去。
格式: "YYYY年MM月DD日 | [引子]"
示例: "2024年12月18日 | 科技股集体反弹，你关注的股票今天表现不错"
示例: "2024年12月19日 | 市场震荡，但有一个消息你需要知道"

### one_line_summary（一句话总结）
用一句话讲今天关注股票的核心故事，不是罗列涨跌幅。要有洞见。
好的示例: "NVDA带领科技股反弹，但AAPL因中国销量担忧掉队"
不好的示例: "今日关注股票涨跌不一，NVDA涨3%，AAPL跌1%"（这是复读机）

### stocks（关注股票速览）
**重要：必须为 user_symbols 中的每一只股票生成分析，不能遗漏任何一只。**

按重要性排序（波动最大或最值得关注的在前），但所有股票都必须包含在输出中。
即使某只股票今天没有相关新闻，也要根据价格走势和市场环境给出观察分析。

每只股票包含:
- symbol: 股票代码
- name: 中文公司名（如"英伟达"、"苹果"、"特斯拉"）
- price: 当前价格（从输入数据获取）
- daily_change: 日涨跌幅，带+/-号（如"+2.35%"或"-1.20%"）
- week_change: 周涨跌幅，带+/-号
- status: 用自然语言描述当前状态，不要用固定分类
  好的示例: "连涨四天后首次回调"、"财报后持续消化中"、"跟随板块反弹"、"创一个月新高"
  不好的示例: "强势上涨"、"小幅回调"（太模板化）
- quick_take: 3-4句深度分析，包含清晰的逻辑链条:
  1) 今天发生了什么（股价表现）
  2) 为什么会这样（新闻催化剂、情绪变化、板块轮动）
  3) 市场如何解读（机构行为、叙事变化）
  4) 这意味着什么（后续影响）
  注意: 聚焦新闻、情绪、叙事分析，不要做技术面分析（不提支撑位/阻力位）

### news（与我相关的新闻）
从输入新闻中精选与用户关注股票相关的重要新闻，分为 headlines（深度分析）和 briefs（简短分析）两类。

#### headlines（重要新闻，3-4条）
选择对用户关注的股票影响最大的新闻，进行深度解读。

筛选标准:
- 公司官方重大公告（财报、并购、产品发布）
- 影响多只关注股票的行业/宏观新闻
- 可能改变投资逻辑的突发事件

每条 headline 包含:
- title: 中文新闻标题
- related_symbols: 影响哪些关注股票（如 ["NVDA", "AMD"]）
- fact_summary: 一句话事实总结
- deep_analysis: 5-6句深度分析:
  1) 背景上下文
  2) 为什么这条新闻重要
  3) 对市场/板块的影响
  4) 对用户关注股票的具体影响
  5) 后续需要关注什么
- url: 原文链接

#### briefs（其他新闻，8-10条）
其他值得关注但不需要深度解读的新闻。

每条 brief 包含:
- title: 中文新闻标题
- related_symbols: 影响哪些关注股票
- summary: 一句话总结
- analysis: 2-3句分析为什么重要、对关注股票的影响
- url: 原文链接

筛选原则:
- 必须与用户某只关注股票直接相关，或影响其所在板块
- 如果某只股票确实没有相关新闻，不必强行添加
- 不选: 与关注股票完全无关的新闻、泛泛的市场评论

### events（未来一周关注）
从经济日历和财报日历中筛选与用户关注股票相关的事件，通常3-6个。

筛选标准:
- 优先: 用户关注公司的财报日期
- 次要: 会影响关注股票所在板块的宏观数据（如CPI对科技股的影响）
- 不选: 与用户关注股票完全无关的事件

每个事件包含:
- date: 日期（YYYY-MM-DD格式，从输入数据复制）
- event: 中文事件名（如"英伟达 (NVDA) Q3财报"、"美国12月CPI数据"）
- related_symbols: 影响哪些关注股票
- why_important: 1-2句解释为什么用户需要关注

### summary（综合总结）
这是最重要的部分，整合宏观环境、关注股票表现、未来展望。如果用户只看这一段，也要能知道今天的重点。

包含一个字段 content，写成三段话（用换行分隔），不要加小标题:

第一段: 关注股票回顾
今日整体表现如何，最佳/最差表现，与大盘（SPY/QQQ）对比。
示例: "今日关注股票整体上涨1.8%，跑赢标普500(+0.9%)。NVDA领涨+4.2%贡献最大，AAPL(-1.1%)因中国销量担忧拖累。"

第二段: 波动归因
解释为什么今天这些股票会这样表现，将宏观因素（美联储、利率、情绪、板块轮动）与具体新闻催化剂结合起来，明确因果关系。
示例: "今日上涨主要受两个因素驱动：1) 美联储会议纪要偏鸽，市场降息预期升温，推动成长股估值修复；2) NVDA财报余温延续，带动整个AI/半导体板块轮动。AAPL的下跌则是因为早盘彭博报道中国市场份额被华为蚕食。"

第三段: 未来展望
未来1-2周关注股票的预期走势，需要关注的风险，潜在的机会或催化剂，重要日期/事件。
示例: "短期看，科技股有望继续受益于年末risk-on行情，但需警惕下周三CPI数据。如果通胀超预期，可能打断当前反弹。NVDA在12月15日有Investor Day，是验证AI需求持续性的关键事件。"
"""


personal_digest_agent = LlmAgent(
    name="personal_digest",
    model="gemini-3-flash-preview",
    description="Generates personalized daily digest based on user's watchlist",
    instruction=DIGEST_INSTRUCTION,
    output_schema=PersonalDigestOutput,
    output_key="digest",
)


# =============================================================================
# PersonalDigest Wrapper Class
# =============================================================================


class PersonalDigest:
    """Wrapper class to fetch user-specific data and run the digest agent."""

    DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "^VIX"]

    def __init__(self):
        self._runner = InMemoryRunner(
            agent=personal_digest_agent, app_name="personal_digest"
        )

    async def generate(
        self,
        symbols: list[str],
    ) -> dict:
        """
        Generate personalized digest for user's watchlist.

        Args:
            symbols: User's watchlist symbols (e.g., ["AAPL", "MSFT", "NVDA"])

        Returns:
            Structured digest report
        """
        try:
            if not symbols:
                return {"success": False, "error": "No symbols provided"}

            # Limit to 15 stocks max
            symbols = symbols[:15]
            print(f"[PersonalDigest] Generating digest for: {symbols}")

            # Step 1: Fetch user-specific stock data
            print("[PersonalDigest] Fetching stock quotes...")
            stock_data = get_stock_quotes(symbols)

            # Step 2: Fetch news filtered by user's symbols + macro symbols
            print("[PersonalDigest] Fetching news...")
            news_symbols = symbols + self.DEFAULT_MACRO_SYMBOLS
            news_result = get_combined_market_news(days=1, symbols=news_symbols)

            # Step 3: Fetch calendars
            print("[PersonalDigest] Fetching calendars...")
            calendar_result = get_economic_calendar(days=7)
            earnings_result = get_earnings_calendar(days=7)

            # Step 4: Get macro context (simplified)
            print("[PersonalDigest] Fetching macro context...")
            market_data = get_all_market_data()
            macro_summary = self._extract_macro_summary(market_data)

            # Step 5: Prepare data for agent
            report_date = format_report_date()

            data_for_agent = {
                "report_date": report_date,
                "user_symbols": symbols,
                "stocks": stock_data.get("stocks", {}),
                "news": self._clean_news(news_result.get("news", [])[:30]),
                "economic_calendar": calendar_result.get("events", [])[:15],
                "earnings_calendar": self._filter_earnings(
                    earnings_result.get("earnings", []), symbols
                ),
                "macro_summary": macro_summary,
            }

            # Step 6: Run agent
            print("[PersonalDigest] Running agent...")

            session = await self._runner.session_service.create_session(
                app_name="personal_digest", user_id="digest"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Generate personalized digest for user watchlist:\n\n{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for _ in self._runner.run_async(
                user_id="digest", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await self._runner.session_service.get_session(
                app_name="personal_digest", user_id="digest", session_id=session.id
            )

            digest_output = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                digest_output = state.get("digest", {})
                if isinstance(digest_output, str):
                    try:
                        digest_output = json.loads(digest_output)
                    except json.JSONDecodeError:
                        digest_output = {}

            news_data = digest_output.get("news", {})
            news_count = 0
            if isinstance(news_data, dict):
                news_count = len(news_data.get("headlines", [])) + len(
                    news_data.get("briefs", [])
                )
            print(
                f"[PersonalDigest] Generation complete. "
                f"Stocks: {len(digest_output.get('stocks', []))}, "
                f"News: {news_count}, "
                f"Events: {len(digest_output.get('events', []))}"
            )

            return {
                "success": True,
                "timestamp": now_iso(),
                "symbols_used": symbols,
                **digest_output,
            }

        except Exception as e:
            print(f"[PersonalDigest] Error: {e}")
            import traceback

            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "timestamp": now_iso(),
            }

    def _extract_macro_summary(self, market_data: dict) -> dict:
        """Extract key macro indicators for context."""
        return {
            "sp500": market_data.get("equities", {}).get("S&P 500", {}),
            "nasdaq": market_data.get("equities", {}).get("Nasdaq", {}),
            "vix": market_data.get("volatility", {}).get("VIX", {}),
            "yield_10y": market_data.get("rates", {})
            .get("yield_curve", {})
            .get("10Y", {}),
            "dollar": market_data.get("currencies", {}).get("US Dollar", {}),
        }

    def _clean_news(self, news: list) -> list:
        """Clean news for token efficiency."""
        return [
            {
                "title": n.get("title", ""),
                "text": n.get("text", "")[:500],
                "url": n.get("url", ""),
                "publishedDate": n.get("publishedDate", ""),
                "symbol": n.get("symbol", ""),
            }
            for n in news
            if n.get("title")
        ]

    def _filter_earnings(self, earnings: list, user_symbols: list) -> list:
        """Filter earnings to user's watchlist + major tech."""
        user_set = set(s.upper() for s in user_symbols)
        # Always include major tech earnings as reference
        always_show = {"NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "AMD"}
        relevant = always_show.union(user_set)

        filtered = [e for e in earnings if e.get("symbol", "").upper() in relevant]
        return filtered[:15]


# =============================================================================
# Singleton Instance
# =============================================================================

_personal_digest_instance = None


def get_personal_digest() -> PersonalDigest:
    """Get singleton PersonalDigest instance."""
    global _personal_digest_instance
    if _personal_digest_instance is None:
        _personal_digest_instance = PersonalDigest()
    return _personal_digest_instance
