"""
PersonalBrewer - Personalized Daily Digest for User Watchlist

Architecture:
    Python (fetch stock + news data) -> PersonalBrewer Agent (gemini-3-flash) -> Structured output

Cost: ~$0.018/request (vs MarketAgent $0.07 - saves 75%)

Naming: "PersonalBrewer" echoes the MarketBrew brand

Personalization Dimensions:
    1. Watchlist (symbols) - which stocks to focus on
    2. Investment Style (trader/swing/long_term) - analysis timeframe and focus
    3. Content Focus (earnings/macro/industry/technical/deals) - what to emphasize
"""

import json
import os
from typing import Literal
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
# User Preferences Model
# =============================================================================


class UserPreferences(BaseModel):
    """User investment preferences for personalized digest."""

    # Investment style (single choice)
    style: Literal["trader", "swing", "long_term"] = Field(
        default="long_term",
        description="Investment style: trader (short-term), swing (weeks), long_term (months/years)"
    )

    # Content focus areas (multi-select, 1-3 items)
    focus: list[Literal["earnings", "macro", "industry", "technical", "deals"]] = Field(
        default=["earnings", "macro"],
        description="Content focus areas to emphasize"
    )


# Style-specific analysis instructions - written as user persona descriptions
STYLE_INSTRUCTIONS = {
    "trader": """这是一个短线交易者。他每天盯盘，关注的是"今天能不能操作"。

对他来说重要的是:
- 今天有没有异动? 成交量放大了吗?
- 有没有突发消息可以博一把?
- 技术位置到了吗? 支撑阻力在哪?

他不需要你讲长期逻辑，他需要的是"现在该不该动手"。说话要直接，判断要果断。""",

    "swing": """这是一个波段操作者。他看的是周线和月线级别的趋势，持仓周期通常是1-4周。

对他来说重要的是:
- 当前趋势还在吗? 有反转信号吗?
- 板块轮动到哪了? 资金在流向哪里?
- 这个位置值得加仓还是该减仓?

他需要的是趋势判断和板块视角，不是每日波动的噪音。""",

    "long_term": """这是一个长期投资者。他关注的是公司质量和长期增长逻辑，持仓以年为单位。

对他来说重要的是:
- 公司基本面有变化吗? 护城河还在吗?
- 这个估值还合理吗?
- 长期投资逻辑被打破了吗?

短期涨跌他不太在意，但如果有什么事情可能改变长期故事，他需要知道。帮他过滤掉噪音，只说真正重要的。"""
}

# Focus-specific content emphasis instructions
FOCUS_INSTRUCTIONS = {
    "earnings": "财报和业绩 - 用户很在意公司赚不赚钱。财报发布、业绩指引、盈利能力变化这些要重点讲。",
    "macro": "宏观和政策 - 用户关注大环境。美联储说了什么、利率怎么走、这些对他的股票意味着什么。",
    "industry": "行业动态 - 用户关注竞争格局。行业里谁在崛起、谁在掉队、新技术会颠覆什么。",
    "technical": "技术面 - 用户看图。关键价位在哪、趋势有没有变、量价配合如何。",
    "deals": "并购交易 - 用户关注资本运作。谁在收购谁、有没有拆分、这些对估值意味着什么。"
}


# =============================================================================
# Pydantic Output Schema for PersonalBrew
# =============================================================================


class StockSummary(BaseModel):
    """Individual stock summary in the digest."""

    symbol: str = Field(description="Stock ticker symbol, e.g., 'NVDA'")
    name: str = Field(description="Chinese company name, e.g., '英伟达', '苹果', '特斯拉'")
    price: float = Field(description="Current stock price from input data, must be accurate")
    daily_change: str = Field(description="Daily change with +/- sign, e.g., '+2.35%' or '-1.20%'")
    week_change: str = Field(description="Weekly change with +/- sign, e.g., '+5.2%' or '-3.1%'")
    status: str = Field(
        description="Natural language status - describe what's happening, not a fixed category. "
        "Good: '连涨四天后首次回调', '财报后持续消化中', '跟随板块反弹', '创一个月新高'. "
        "Bad: '强势上涨', '小幅回调' (too template-like)"
    )
    quick_take: str = Field(
        description="1-2 sentence analysis tailored to user's investment style. "
        "For traders: focus on technicals and catalysts. "
        "For swing traders: focus on trends and sector rotation. "
        "For long-term: focus on fundamentals and investment thesis."
    )


class RelevantNews(BaseModel):
    """News item relevant to user's watchlist."""

    title: str = Field(description="News title in Chinese")
    related_symbols: list[str] = Field(description="Which watchlist stocks this affects, e.g., ['NVDA', 'AMD']")
    summary: str = Field(description="One sentence: what happened")
    analysis: str = Field(
        description="2-3 sentences: 'So what?' - why user should care, what it means for their holdings. "
        "Tailor analysis angle to user's investment style."
    )
    url: str = Field(description="Original article URL from input data")


class UpcomingEvent(BaseModel):
    """Upcoming event relevant to user's watchlist."""

    date: str = Field(description="Event date in YYYY-MM-DD format, copied from input data")
    event: str = Field(description="Event name in Chinese, e.g., '英伟达 (NVDA) Q3财报', '美国12月CPI数据'")
    related_symbols: list[str] = Field(description="Which watchlist stocks will be affected")
    why_important: str = Field(
        description="1-2 sentences: why user should care about this event. "
        "Tailor to investment style - traders care about volatility, long-term investors care about thesis validation."
    )


class MacroImpact(BaseModel):
    """How macro environment impacts user's portfolio."""

    overall_environment: str = Field(
        description="2-3 sentences: current macro environment including rates, sentiment, sector rotation. "
        "Example: '美联储维持利率不变，但点阵图暗示明年降息预期下调。市场风险偏好有所收敛。'"
    )
    impact_on_portfolio: str = Field(
        description="2-3 sentences: what this means for user's specific holdings. Be concrete, mention their stocks. "
        "Example: '你持仓的科技股（NVDA、MSFT）短期承压，高估值成长股对利率敏感。'"
    )
    risk_level: str = Field(
        description="Natural language risk assessment. "
        "Example: '中等偏高——利率预期反复是当前最大变数' or '相对可控——VIX低位，暂无系统性风险'"
    )
    risk_factors: str = Field(
        description="1-2 sentences: key risks to watch, tailored to investment style. "
        "Traders: volatility, technical breakdowns. Swing: trend reversals. Long-term: fundamental changes."
    )


class PersonalBrewOutput(BaseModel):
    """Structured output for personalized digest."""

    # Header
    greeting: str = Field(
        description="Date + engaging hook. Format: 'YYYY年MM月DD日 | [hook]'. "
        "Example: '2024年12月18日 | 科技股集体反弹，你的持仓今天表现不错'"
    )
    one_line_summary: str = Field(
        description="One sentence telling the core story of user's portfolio today. Must have insight, not just list numbers. "
        "Good: 'NVDA带领科技股反弹，但AAPL因中国销量担忧掉队'. "
        "Bad: '今日持仓涨跌不一，NVDA涨3%，AAPL跌1%'"
    )

    # Section 1: Portfolio Overview
    stocks: list[StockSummary] = Field(
        description="Analysis for each watchlist stock, ordered by volatility (most notable first)"
    )

    # Section 2: Relevant News - quality over quantity
    news: list[RelevantNews] = Field(
        description="5-8 curated news items that actually matter for user's holdings. Quality over quantity, max 10."
    )

    # Section 3: Upcoming Events
    events: list[UpcomingEvent] = Field(
        description="3-6 events in next 7 days relevant to user's watchlist. Prioritize earnings of held stocks."
    )

    # Section 4: Macro Impact
    macro_impact: MacroImpact = Field(
        description="How macro environment specifically impacts this user's portfolio"
    )

    # Section 5: Bottom Line
    bottom_line: str = Field(
        description="3-5 sentences: the most important thing user should know. Include: 1) core theme today, "
        "2) 1-2 things to watch, 3) specific actionable advice tailored to investment style."
    )


# =============================================================================
# PersonalBrewer Agent Prompt (Reasoning-First Design)
# =============================================================================

BREWER_BASE_INSTRUCTION = """
你是用户的私人投资分析师。用户把持仓列表交给你，希望你每天帮他梳理"今天我应该知道什么"。

你不是在填表格，而是在帮朋友写一份有洞见的投资笔记。

## 用户画像

{style_instruction}

## 用户关注领域
{focus_instructions}

## 核心原则
- 围绕用户持仓组织内容，这不是泛泛的市场日报
- 解释因果链: 发生了什么 → 为什么重要 → 对持仓意味着什么
- 数据来自输入JSON，价格和涨跌幅必须准确，不编造
- 语言自然，像给朋友发消息，有观点，敢下判断
- 所有内容使用中文

## 你的思考过程

分析数据时，问自己:
1. 今天哪只股票有异常? 为什么?
2. 新闻里什么会真正影响用户持仓?
3. 未来一周有什么事件需要提前关注?
4. 如果只能说一句话，最重要的是什么?

---

## 输出字段指南

### greeting（开场）
日期 + 一句有温度的引子，让用户想继续看下去。
格式: "YYYY年MM月DD日 | [引子]"
示例: "2024年12月18日 | 科技股集体反弹，你的持仓今天表现不错"
示例: "2024年12月19日 | 市场震荡，但有一个消息你需要知道"

### one_line_summary（一句话总结）
用一句话讲今天持仓的核心故事，不是罗列涨跌幅。要有洞见。
好的示例: "NVDA带领科技股反弹，但AAPL因中国销量担忧掉队"
不好的示例: "今日持仓涨跌不一，NVDA涨3%，AAPL跌1%"（这是复读机）

### stocks（持仓速览）
为用户 watchlist 中的每只股票生成分析，按波动大小排序（最值得关注的在前）。

每只股票包含:
- symbol: 股票代码
- name: 中文公司名（如"英伟达"、"苹果"、"特斯拉"）
- price: 当前价格（从输入数据获取）
- daily_change: 日涨跌幅，带+/-号（如"+2.35%"或"-1.20%"）
- week_change: 周涨跌幅，带+/-号
- status: 用自然语言描述当前状态，不要用固定分类
  好的示例: "连涨四天后首次回调"、"财报后持续消化中"、"跟随板块反弹"、"创一个月新高"
  不好的示例: "强势上涨"、"小幅回调"（太模板化）
- quick_take: 1-2句你的分析，根据用户投资风格调整视角
  短线用户: 关注技术位、催化剂、操作时机
  波段用户: 关注趋势、板块位置、中期逻辑
  长期用户: 关注基本面变化、长期逻辑是否成立

### news（与我相关的新闻）
从输入新闻中精选与用户持仓相关的重要新闻。质量优先，通常5-8条，最多10条。

筛选标准:
- 必须与用户某个持仓直接相关，或影响其所在板块
- 优先: 公司官方公告、财报、产品发布、重大合同
- 次要: 行业政策、竞争对手动态、分析师评级变化
- 不选: 与持仓完全无关的新闻、泛泛的市场评论

每条新闻包含:
- title: 中文新闻标题
- related_symbols: 影响哪些持仓（如 ["NVDA", "AMD"]）
- summary: 一句话说明发生了什么
- analysis: 2-3句分析"所以呢"——为什么用户应该在意，对持仓意味着什么
  根据用户投资风格调整分析角度
- url: 原文链接

### events（未来一周关注）
从经济日历和财报日历中筛选与用户持仓相关的事件，通常3-6个。

筛选标准:
- 优先: 用户持仓公司的财报日期
- 次要: 会影响持仓板块的宏观数据（如CPI对科技股的影响）
- 不选: 与用户持仓完全无关的事件

每个事件包含:
- date: 日期（YYYY-MM-DD格式，从输入数据复制）
- event: 中文事件名（如"英伟达 (NVDA) Q3财报"、"美国12月CPI数据"）
- related_symbols: 影响哪些持仓
- why_important: 1-2句解释为什么用户需要关注，根据投资风格调整
  短线: "财报后波动率通常放大，可关注期权策略"
  波段: "如超预期可能开启新一轮上涨趋势"
  长期: "关注指引中对AI需求的展望，这是核心逻辑验证点"

### macro_impact（宏观环境对我的影响）
分析当前宏观环境对用户具体持仓的影响。

包含四个字段:
- overall_environment: 2-3句概述当前宏观环境
  包括: 利率环境、市场情绪、资金流向、板块轮动
  示例: "美联储维持利率不变，但点阵图暗示明年降息预期下调。市场风险偏好有所收敛，资金从成长股流向防御板块。"

- impact_on_portfolio: 2-3句分析这对用户持仓意味着什么
  要具体到用户的股票，不要泛泛而谈
  示例: "你持仓的科技股（NVDA、MSFT）短期承压，高估值成长股对利率敏感。但如果你是长期持有，当前回调反而是加仓机会。"

- risk_level: 用自然语言描述风险水平
  示例: "中等偏高——利率预期反复是当前最大变数"
  示例: "相对可控——VIX低位，市场暂无系统性风险信号"

- risk_factors: 1-2句提醒需要关注的风险
  根据用户投资风格调整风险类型
  短线: 关注波动率、技术位破位、突发消息
  波段: 关注趋势反转信号、板块轮动
  长期: 关注基本面恶化、护城河被侵蚀

### bottom_line（一段话总结）
这是最重要的部分。如果用户只看这一段，也要能知道今天的重点。

3-5句话，包含:
1. 今天持仓的核心主题/状态
2. 最需要关注的1-2件事
3. 具体的建议或提醒

根据用户投资风格调整建议方向:
- 短线: 给时机建议，如"NVDA突破阻力位，可考虑跟进"
- 波段: 给趋势判断，如"科技板块动能转弱，可逐步减仓"
- 长期: 给基本面评估，如"短期波动不改变长期逻辑，持有不动"

示例:
"今天科技股全面反弹，你的持仓整体表现不错，NVDA领涨+4.2%。最值得关注的是下周三的CPI数据，如果通胀超预期，可能打断当前反弹。作为长期投资者，你不需要对短期波动做出反应，但如果NVDA跌回120以下，是不错的加仓点。"
"""


def build_personalized_instruction(preferences: UserPreferences) -> str:
    """Build personalized instruction based on user preferences."""
    # Get style-specific instruction
    style_instruction = STYLE_INSTRUCTIONS.get(preferences.style, STYLE_INSTRUCTIONS["long_term"])

    # Build focus instructions
    focus_lines = []
    for focus_area in preferences.focus:
        if focus_area in FOCUS_INSTRUCTIONS:
            focus_lines.append(FOCUS_INSTRUCTIONS[focus_area])

    # Default focus if empty
    if not focus_lines:
        focus_lines = [
            FOCUS_INSTRUCTIONS["earnings"],
            FOCUS_INSTRUCTIONS["macro"]
        ]

    focus_instructions = "\n".join(focus_lines)

    # Build final instruction
    return BREWER_BASE_INSTRUCTION.format(
        style_instruction=style_instruction,
        focus_instructions=focus_instructions
    )


def create_personalized_agent(preferences: UserPreferences) -> LlmAgent:
    """Create a personalized LlmAgent with user-specific instructions."""
    instruction = build_personalized_instruction(preferences)

    return LlmAgent(
        name="personal_brewer",
        model="gemini-3-flash-preview",
        description="Generates personalized daily digest based on user's watchlist and preferences",
        instruction=instruction,
        output_schema=PersonalBrewOutput,
        output_key="brew",
    )


# Default agent for backward compatibility
DEFAULT_PREFERENCES = UserPreferences(style="long_term", focus=["earnings", "macro"])
personal_brewer_agent = create_personalized_agent(DEFAULT_PREFERENCES)


# =============================================================================
# PersonalBrewer Wrapper Class
# =============================================================================


class PersonalBrewer:
    """Wrapper class to fetch user-specific data and run the brewer agent."""

    DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "^VIX"]

    def __init__(self):
        # Default runner for backward compatibility
        self._default_runner = InMemoryRunner(
            agent=personal_brewer_agent, app_name="personal_brewer"
        )
        self._cached_runners: dict[str, InMemoryRunner] = {}

    def _get_runner(self, preferences: UserPreferences) -> InMemoryRunner:
        """Get or create a runner for specific preferences."""
        # Create cache key from preferences
        cache_key = f"{preferences.style}|{','.join(sorted(preferences.focus))}"

        if cache_key not in self._cached_runners:
            agent = create_personalized_agent(preferences)
            self._cached_runners[cache_key] = InMemoryRunner(
                agent=agent, app_name=f"personal_brewer_{cache_key}"
            )
            print(f"[PersonalBrewer] Created new agent for: style={preferences.style}, focus={preferences.focus}")

        return self._cached_runners[cache_key]

    async def brew(
        self,
        symbols: list[str],
        preferences: UserPreferences | None = None
    ) -> dict:
        """
        Generate personalized digest for user's watchlist.

        Args:
            symbols: User's watchlist symbols (e.g., ["AAPL", "MSFT", "NVDA"])
            preferences: User's investment preferences (style, focus areas)

        Returns:
            Structured digest report
        """
        try:
            if not symbols:
                return {"success": False, "error": "No symbols provided"}

            # Use default preferences if not provided
            if preferences is None:
                preferences = DEFAULT_PREFERENCES

            # Limit to 20 stocks max
            symbols = symbols[:20]
            print(f"[PersonalBrewer] Brewing digest for: {symbols}")
            print(f"[PersonalBrewer] Style: {preferences.style}, Focus: {preferences.focus}")

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

            # Step 6: Run agent with personalized preferences
            print("[PersonalBrewer] Running agent...")

            # Get personalized runner
            runner = self._get_runner(preferences)
            app_name = f"personal_brewer_{preferences.style}|{','.join(sorted(preferences.focus))}"

            session = await runner.session_service.create_session(
                app_name=app_name, user_id="brewer"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Generate personalized digest for user watchlist:\n\n{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for _ in runner.run_async(
                user_id="brewer", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await runner.session_service.get_session(
                app_name=app_name, user_id="brewer", session_id=session.id
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
                "preferences_used": {
                    "style": preferences.style,
                    "focus": preferences.focus,
                },
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
