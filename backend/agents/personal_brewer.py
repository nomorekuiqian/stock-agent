"""
PersonalBrewer - Personalized Daily Digest for User Watchlist

Architecture:
    Python (fetch stock + news data) -> PersonalBrewer Agent (gemini-3-flash) -> Structured output

Cost: ~$0.018/request (vs MarketAgent $0.07 - saves 75%)

Naming: "PersonalBrewer" echoes the MarketBrew brand
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
# Pydantic Output Schema for PersonalBrew
# =============================================================================


class StockSummary(BaseModel):
    """Individual stock summary in the digest."""

    symbol: str = Field(description="Stock ticker symbol, e.g., 'AAPL'")
    name: str = Field(description="Company name in Chinese, e.g., '苹果公司'")
    price: float = Field(description="Current stock price")
    daily_change: str = Field(
        description="Daily change with direction and percentage, e.g., '+2.35%' or '-1.20%'"
    )
    week_change: str = Field(
        description="Weekly change with direction and percentage, e.g., '+5.2%' or '-3.1%'"
    )
    status: str = Field(
        description="Brief status in Chinese, one of: '强势上涨', '温和上涨', '横盘震荡', '小幅回调', '明显下跌'"
    )
    quick_take: str = Field(
        description="1-2 sentence analysis in Chinese explaining recent performance and key factors"
    )


class RelevantNews(BaseModel):
    """News item relevant to user's watchlist."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this news affects, e.g., ['AAPL', 'MSFT']"
    )
    summary: str = Field(description="1 sentence summary of what happened")
    analysis: str = Field(
        description="2-3 sentence analysis: why this matters and how it impacts the related stocks"
    )
    url: str = Field(description="Original article URL")


class UpcomingEvent(BaseModel):
    """Upcoming event relevant to user's watchlist."""

    date: str = Field(description="Event date in YYYY-MM-DD format")
    event: str = Field(
        description="Event name in Chinese, e.g., '英伟达 (NVDA) 第三季度财报', '美国11月CPI数据'"
    )
    related_symbols: list[str] = Field(
        description="Which watchlist stocks this event affects"
    )
    why_important: str = Field(
        description="Why this matters for the user's holdings, 1-2 sentences in Chinese"
    )


class MacroImpact(BaseModel):
    """How macro environment impacts user's portfolio."""

    overall_environment: str = Field(
        description="Current macro environment summary in 2-3 sentences, covering rates, market sentiment, sector trends"
    )
    impact_on_portfolio: str = Field(
        description="How current macro conditions specifically affect user's holdings, 2-3 sentences with concrete implications"
    )
    risk_level: str = Field(
        description="Current risk assessment, one of: '低风险', '中低风险', '中等风险', '中高风险', '高风险'"
    )
    risk_factors: str = Field(
        description="Key risk factors to watch, 1-2 sentences"
    )


class PersonalBrewOutput(BaseModel):
    """Structured output for personalized digest."""

    # Header
    greeting: str = Field(
        description="Personalized greeting with date in Chinese, e.g., '2024年12月18日 | 你的持仓速览'"
    )
    one_line_summary: str = Field(
        description="One sentence summary of user's portfolio performance today, 20-50 Chinese characters, with specific numbers"
    )

    # Section 1: Portfolio Overview
    stocks: list[StockSummary] = Field(
        description="Summary for each stock in user's watchlist, ordered by absolute daily change"
    )

    # Section 2: Relevant News (8-10 items as per user request)
    news: list[RelevantNews] = Field(
        description="8-10 most relevant and important news items for user's watchlist"
    )

    # Section 3: Upcoming Events
    events: list[UpcomingEvent] = Field(
        description="5-8 upcoming events relevant to user's watchlist within next 7 days"
    )

    # Section 4: Macro Impact
    macro_impact: MacroImpact = Field(
        description="How macro environment impacts user's portfolio"
    )

    # Section 5: Bottom Line (paragraph as per user request)
    bottom_line: str = Field(
        description="A paragraph (3-5 sentences) summarizing what the user should focus on: key themes, action items, and things to watch. Be specific and actionable."
    )


# =============================================================================
# PersonalBrewer Agent Prompt
# =============================================================================

BREWER_INSTRUCTION = """
你是用户的个人投资助手 PersonalBrewer，为用户生成每日个性化持仓摘要。用户已设置了自己的股票观察列表 (watchlist)。

## 核心原则
- 围绕用户持仓组织内容，这不是泛泛的市场日报
- 每个部分都要有针对性，直接关联到用户的持仓
- 数据来自输入JSON，数据必须准确，不编造
- 给出具体可操作的建议
- 所有内容使用中文

## 输出字段指南

### greeting
格式: "YYYY年MM月DD日 | 你的持仓速览"
示例: "2024年12月18日 | 你的持仓速览"

### one_line_summary
用一句话概括用户持仓今天的整体表现，要有具体数字。
示例: "今日持仓整体上涨1.2%，NVDA领涨+3.2%，AAPL小幅回调-0.5%"

### stocks (持仓速览)
为用户 watchlist 中的每只股票生成摘要，按涨跌幅绝对值排序（最大变动在前）:
- symbol: 股票代码
- name: 中文公司名（如"英伟达"、"苹果公司"）
- price: 当前价格
- daily_change: 日涨跌幅，带+/-号（如"+2.35%"或"-1.20%"）
- week_change: 周涨跌幅，带+/-号
- status: 状态判断（强势上涨/温和上涨/横盘震荡/小幅回调/明显下跌）
- quick_take: 1-2句分析，说明近期走势的关键因素

状态判断标准:
- 强势上涨: 日涨 > 3% 或 周涨 > 5%
- 温和上涨: 日涨 0.5%-3%
- 横盘震荡: 日涨跌在 -0.5% 到 +0.5% 之间
- 小幅回调: 日跌 0.5%-3%
- 明显下跌: 日跌 > 3% 或 周跌 > 5%

### news (与我相关的新闻) - 8-10条
从输入新闻中筛选与用户持仓相关的 8-10 条重要新闻:
- 必须与用户的某个持仓直接相关
- related_symbols 标注影响哪些持仓
- summary 1句话说明发生了什么
- analysis 2-3句话分析：为什么重要、对相关股票有什么影响

筛选优先级:
1. 用户持仓公司的官方公告、财报、产品发布
2. 影响用户持仓行业的重大政策、监管变化
3. 用户持仓的竞争对手动态（间接影响）
4. 分析师评级变化、目标价调整

不选: 与用户持仓完全无关的新闻

### events (未来一周我需要关注的事件) - 5-8个
从经济日历和财报日历筛选与用户持仓相关的事件:
- 优先: 用户持仓公司的财报日期
- 次要: 会影响用户持仓板块的宏观数据（如CPI影响科技股）
- related_symbols 标注影响哪些持仓
- why_important 说明用户为什么需要关注

### macro_impact (宏观环境对我的影响)
分析当前宏观环境对用户具体持仓的影响:
- overall_environment: 2-3句话概述当前宏观环境
- impact_on_portfolio: 2-3句话分析这对用户持仓意味着什么
- risk_level: 风险等级（低风险/中低风险/中等风险/中高风险/高风险）
- risk_factors: 需要关注的风险因素

### bottom_line (一段话总结) - 3-5句话
给用户一段可操作的总结，包括:
1. 当前持仓的核心主题/趋势
2. 最需要关注的1-2件事
3. 具体的建议或提醒

示例: "本周你的持仓整体受益于科技股反弹，NVDA和AMD表现亮眼。重点关注下周三NVDA财报，市场预期较高，建议财报前评估是否需要减仓锁定利润。此外，美联储会议纪要可能影响利率预期，如果转鸽将进一步利好你的科技持仓。"
"""

personal_brewer_agent = LlmAgent(
    name="personal_brewer",
    model="gemini-3-flash-preview",
    description="Generates personalized daily digest based on user's watchlist",
    instruction=BREWER_INSTRUCTION,
    output_schema=PersonalBrewOutput,
    output_key="brew",
)


# =============================================================================
# PersonalBrewer Wrapper Class
# =============================================================================


class PersonalBrewer:
    """Wrapper class to fetch user-specific data and run the brewer agent."""

    DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "^VIX"]

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=personal_brewer_agent, app_name="personal_brewer"
        )

    async def brew(self, symbols: list[str]) -> dict:
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

            # Limit to 20 stocks max
            symbols = symbols[:20]
            print(f"[PersonalBrewer] Brewing digest for: {symbols}")

            # Step 1: Fetch user-specific stock data
            print("[PersonalBrewer] Fetching stock quotes...")
            stock_data = get_stock_quotes(symbols)

            # Step 2: Fetch news filtered by user's symbols + macro symbols
            print("[PersonalBrewer] Fetching news...")
            news_symbols = symbols + self.DEFAULT_MACRO_SYMBOLS
            news_result = get_combined_market_news(days=1, symbols=news_symbols)

            # Step 3: Fetch calendars
            print("[PersonalBrewer] Fetching calendars...")
            calendar_result = get_economic_calendar(days=7)
            earnings_result = get_earnings_calendar(days=7)

            # Step 4: Get macro context (simplified)
            print("[PersonalBrewer] Fetching macro context...")
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
            print("[PersonalBrewer] Running agent...")

            session = await self.runner.session_service.create_session(
                app_name="personal_brewer", user_id="brewer"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Generate personalized digest for user watchlist:\n\n{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for event in self.runner.run_async(
                user_id="brewer", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await self.runner.session_service.get_session(
                app_name="personal_brewer", user_id="brewer", session_id=session.id
            )

            brew_output = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                brew_output = state.get("brew", {})
                if isinstance(brew_output, str):
                    try:
                        brew_output = json.loads(brew_output)
                    except json.JSONDecodeError:
                        brew_output = {}

            print(
                f"[PersonalBrewer] Brew complete. "
                f"Stocks: {len(brew_output.get('stocks', []))}, "
                f"News: {len(brew_output.get('news', []))}, "
                f"Events: {len(brew_output.get('events', []))}"
            )

            return {
                "success": True,
                "timestamp": now_iso(),
                "symbols_used": symbols,
                **brew_output,
            }

        except Exception as e:
            print(f"[PersonalBrewer] Error: {e}")
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

_personal_brewer_instance = None


def get_personal_brewer() -> PersonalBrewer:
    """Get singleton PersonalBrewer instance."""
    global _personal_brewer_instance
    if _personal_brewer_instance is None:
        _personal_brewer_instance = PersonalBrewer()
    return _personal_brewer_instance
