"""
Research Agent - Conversation-guided stock research assistant.

A friendly AI guide that helps beginners find personalized stocks through
natural conversation. Reuses the screener universe data and tool functions
from agent.py, but with a completely different personality and workflow.

Layered tool architecture:
  - base_tools: screener data tools (V1)
  - extended_tools: deep stock analysis (V2+, placeholder)
"""

import asyncio
import contextvars
import json
from datetime import date
from typing import Any, Dict, List, Optional

from google.adk.agents import LlmAgent
from google.adk.plugins import LoggingPlugin
from google.adk.runners import InMemoryRunner
from google.adk.tools.google_search_tool import GoogleSearchTool
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.features.screener.agent import (
    _current_universe,
    execute_screener,
    filter_by_tickers,
    get_field_distribution,
    list_available_sectors,
)
from app.shared.data_tools.research_tools import research_data_tools
from app.shared.llm_metering import meter

RESEARCH_MODEL = "gemini-3.1-flash-lite-preview"

logger = get_logger(__name__)

# Pre-loaded recent daily reports (set in guide(), read by tools)
_recent_reports: contextvars.ContextVar[list[dict]] = contextvars.ContextVar(
    "_recent_reports", default=[]
)

# SSE event queue — callbacks push tool events here, SSE generator reads them
_sse_queue: contextvars.ContextVar[asyncio.Queue | None] = contextvars.ContextVar(
    "_sse_queue", default=None
)

# Tool call description mapping for Chinese UI
_TOOL_DESCRIPTIONS = {
    "get_stock_news": lambda a: "正在查询 %s 的新闻..." % ", ".join(
        [str(v) for v in a.get("symbols", [])[:3]]
    ) if a.get("symbols") else "正在查询新闻...",
    "get_stock_quote": lambda a: "正在获取 %s 的行情..." % ", ".join(
        [str(v) for v in a.get("symbols", [])[:3]]
    ) if a.get("symbols") else "正在获取行情...",
    "get_technical_analysis": lambda a: "正在分析 %s 的技术面..." % a.get("symbol", ""),
    "get_stock_fundamentals": lambda a: "正在查看 %s 的基本面..." % a.get("symbol", ""),
    "get_earnings_calendar": lambda _: "正在查询财报日历...",
    "get_market_overview": lambda _: "正在获取大盘概况...",
    "execute_screener": lambda _: "正在筛选股票...",
    "filter_by_tickers": lambda _: "正在查找相关股票...",
    "get_field_distribution": lambda _: "正在分析数据分布...",
    "list_available_sectors": lambda _: "正在获取板块列表...",
    "get_report_by_date": lambda a: "正在获取 %s 的日报..." % a.get("report_date", ""),
    "list_recent_reports": lambda _: "正在获取近期报告...",
    "google_search": lambda _: "正在搜索最新信息...",
    "get_company_profile": lambda a: "正在查看 %s 的公司概况..." % a.get("symbol", ""),
    "get_peer_comparison": lambda a: "正在对比 %s 与同行..." % a.get("symbol", ""),
    "get_historical_valuation": lambda a: "正在查看 %s 的历史估值..." % a.get("symbol", ""),
    "get_macro_risk_summary": lambda _: "正在评估宏观风险...",
    "get_liquidity_overview": lambda _: "正在查看流动性指标...",
    "get_market_sentiment": lambda _: "正在分析市场情绪...",
    "get_economic_calendar": lambda _: "正在查询经济日历...",
    "get_morning_report": lambda _: "正在获取今日早报...",
    "get_weekly_report": lambda _: "正在获取最新周报...",
}


def _get_tool_description(tool_name: str, args: dict) -> str:
    fn = _TOOL_DESCRIPTIONS.get(tool_name)
    if fn:
        try:
            return fn(args)
        except Exception:
            pass
    return "正在处理..."


async def _before_tool_callback(tool, args, tool_context):
    """ADK before_tool_callback: emit SSE event when a tool starts.

    Async so ADK awaits it before tool execution, ensuring the event
    is queued and can be flushed to the SSE client before the tool blocks.
    """
    queue = _sse_queue.get(None)
    if queue is not None:
        tool_name = getattr(tool, "name", str(tool))
        desc = _get_tool_description(tool_name, args)
        queue.put_nowait({
            "type": "tool_call_start",
            "tool": tool_name,
            "description": desc,
        })
    return None  # proceed with tool execution


async def _after_tool_callback(tool, args, tool_context, tool_response):
    """ADK after_tool_callback: emit SSE event when a tool completes."""
    queue = _sse_queue.get(None)
    if queue is not None:
        tool_name = getattr(tool, "name", str(tool))
        queue.put_nowait({
            "type": "tool_call_end",
            "tool": tool_name,
        })
    return None  # use original tool response


def _format_market_cap(val):
    """Format market cap for agent context."""
    if not val:
        return "N/A"
    val = float(val)
    if val >= 1e12:
        return "$%.1fT" % (val / 1e12)
    if val >= 1e9:
        return "$%.1fB" % (val / 1e9)
    if val >= 1e6:
        return "$%.0fM" % (val / 1e6)
    return "$%.0f" % val


def _format_daily_report_context(ctx: dict) -> str:
    """Format daily report data as natural language context for the Agent."""
    parts = []
    parts.append(
        "## User is currently viewing: %s Daily Report"
        % ctx.get("date", "latest")
    )
    if ctx.get("title"):
        parts.append("### Title\n%s" % ctx["title"])
    if ctx.get("summary"):
        parts.append("### Summary\n%s" % ctx["summary"])
    if ctx.get("intro"):
        parts.append("### Key Points\n%s" % ctx["intro"])
    news = ctx.get("news")
    if news:
        if news.get("headlines"):
            headlines = "\n".join(
                "- %s" % (h.get("title", h) if isinstance(h, dict) else h)
                for h in news["headlines"][:5]
            )
            parts.append("### Headlines\n%s" % headlines)
        if news.get("briefs"):
            briefs = "\n".join(
                "- %s" % (b.get("title", b) if isinstance(b, dict) else b)
                for b in news["briefs"][:5]
            )
            parts.append("### Market Briefs\n%s" % briefs)
    report_summary = ctx.get("report_summary")
    if report_summary and isinstance(report_summary, list):
        for section in report_summary:
            if isinstance(section, dict):
                parts.append(
                    "### %s\n%s"
                    % (section.get("title", "Summary"), section.get("content", ""))
                )
    calendar = ctx.get("calendar")
    if calendar:
        cal_items = "\n".join(
            "- %s: %s" % (c.get("date", ""), c.get("event", c))
            if isinstance(c, dict)
            else "- %s" % c
            for c in calendar[:5]
        )
        parts.append("### Upcoming Events\n%s" % cal_items)
    return "\n\n".join(parts)


def _format_macro_context(ctx: dict) -> str:
    """Format macro risk dashboard data as context for the Agent."""
    parts = []
    parts.append("## User is currently viewing: Macro Risk Dashboard")

    if ctx.get("week_label"):
        parts.append("Period: %s" % ctx["week_label"])

    if ctx.get("verdict"):
        parts.append("### Core Verdict\n%s" % ctx["verdict"])

    signal_lights = ctx.get("signal_lights")
    if signal_lights and isinstance(signal_lights, dict):
        signal_map = {"green": "Positive", "yellow": "Neutral", "red": "Negative"}
        dim_names = {
            "liquidity": "Liquidity",
            "economy": "Economy",
            "inflation": "Inflation",
            "sentiment": "Sentiment",
        }
        signals = []
        for dim, color in signal_lights.items():
            name = dim_names.get(dim, dim)
            label = signal_map.get(color, color)
            signals.append("- %s: %s (%s)" % (name, label, color))
        parts.append("### Signal Lights\n%s" % "\n".join(signals))

    if ctx.get("landscape"):
        parts.append("### Macro Landscape\n%s" % ctx["landscape"])

    if ctx.get("narrative"):
        parts.append("### Weekly Narrative\n%s" % ctx["narrative"])

    if ctx.get("takeaway"):
        parts.append("### Strategy Takeaway\n%s" % ctx["takeaway"])

    return "\n\n".join(parts)


def _format_morning_report_context(ctx: dict) -> str:
    """Format morning report data as natural language context for the Agent."""
    parts = []
    parts.append(
        "## User is currently viewing: %s Pre-Market Morning Report"
        % ctx.get("date", "latest")
    )
    if ctx.get("title"):
        parts.append("### Title\n%s" % ctx["title"])
    if ctx.get("market_pulse"):
        parts.append("### Market Pulse\n%s" % ctx["market_pulse"])
    futures = ctx.get("futures")
    if futures and isinstance(futures, list):
        fut_lines = []
        for f in futures[:8]:
            if isinstance(f, dict):
                symbol = f.get("symbol", "")
                price = f.get("price", "")
                change_pct = f.get("change_pct", "")
                name = f.get("name", symbol)
                fut_lines.append("- %s (%s): %s, %s%%" % (symbol, name, price, change_pct))
        if fut_lines:
            parts.append("### Futures\n%s" % "\n".join(fut_lines))
    global_markets = ctx.get("global_markets")
    if global_markets and isinstance(global_markets, dict):
        market_lines = []
        for region in ("asia", "europe", "other"):
            region_data = global_markets.get(region, [])
            if isinstance(region_data, list):
                for m in region_data[:4]:
                    if isinstance(m, dict):
                        name = m.get("name", "")
                        change_pct = m.get("change_pct", "")
                        market_lines.append("- %s: %s%%" % (name, change_pct))
        if market_lines:
            parts.append("### Global Markets\n%s" % "\n".join(market_lines))
    overnight_news = ctx.get("overnight_news")
    if overnight_news and isinstance(overnight_news, list):
        news_lines = [
            "- %s" % (n.get("title", n) if isinstance(n, dict) else n)
            for n in overnight_news[:6]
        ]
        if news_lines:
            parts.append("### Overnight News\n%s" % "\n".join(news_lines))
    today_focus = ctx.get("today_focus")
    if today_focus and isinstance(today_focus, list):
        focus_lines = [
            "- %s" % (f.get("title", f) if isinstance(f, dict) else f)
            for f in today_focus[:6]
        ]
        if focus_lines:
            parts.append("### Today's Focus\n%s" % "\n".join(focus_lines))
    summary = ctx.get("morning_summary")
    if summary and isinstance(summary, list):
        for section in summary:
            if isinstance(section, dict):
                parts.append(
                    "### %s\n%s"
                    % (section.get("title", "Summary"), section.get("content", ""))
                )
    return "\n\n".join(parts)


def _format_brew_context(ctx: dict) -> str:
    """Format personalized brew digest data as context for the Agent."""
    parts = []
    parts.append("## User is currently viewing: Personalized Daily Digest")

    if ctx.get("digest_date"):
        parts.append("Date: %s" % ctx["digest_date"])

    symbols = ctx.get("symbols_used")
    if symbols and isinstance(symbols, list):
        parts.append("User's watchlist: %s" % ", ".join(symbols))

    if ctx.get("greeting"):
        parts.append("### Greeting\n%s" % ctx["greeting"])

    if ctx.get("one_line_summary"):
        parts.append("### One-line Summary\n%s" % ctx["one_line_summary"])

    stocks = ctx.get("stocks")
    if stocks and isinstance(stocks, list):
        stock_lines = []
        for s in stocks[:10]:
            if isinstance(s, dict):
                symbol = s.get("symbol", "")
                name = s.get("name", "")
                price = s.get("price", "")
                change = s.get("daily_change", "")
                quick_take = s.get("quick_take", "")
                stock_lines.append(
                    "- %s (%s): $%s, %s%% | %s"
                    % (symbol, name, price, change, quick_take)
                )
        if stock_lines:
            parts.append("### Holdings Overview\n%s" % "\n".join(stock_lines))

    # News summary (not full text to save tokens)
    news = ctx.get("news")
    if news and isinstance(news, dict):
        headlines = news.get("headlines", [])
        if headlines and isinstance(headlines, list):
            headline_titles = [
                h.get("title", "") for h in headlines[:5] if isinstance(h, dict)
            ]
            if headline_titles:
                parts.append(
                    "### Related Headlines\n%s"
                    % "\n".join("- %s" % t for t in headline_titles)
                )

    if ctx.get("summary_content"):
        parts.append("### Summary\n%s" % ctx["summary_content"])

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Output Schema
# ---------------------------------------------------------------------------

class ResearchAgentOutput(BaseModel):
    """Structured output from the research agent."""

    message: str = Field(
        description=(
            "Agent reply in plain Chinese, Markdown formatted. "
            "Warm, friendly tone. No financial jargon. "
            "Use line breaks and structure for readability (see formatting rules in instruction)."
        ),
    )
    options: List[str] = Field(
        default_factory=list,
        description=(
            "Array of clickable option strings in Chinese. "
            '3-5 options, last one usually open-ended. '
            "Empty [] if no options needed."
        ),
    )
    filters: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Array of ALL accumulated filter conditions. "
            'Each item: {"field": "...", "op": "...", "value": ...}. '
            "Include ALL previous filters plus any new ones from this turn. "
            "Empty [] if not ready to filter yet."
        ),
    )
    sort_by: Optional[str] = Field(
        default=None,
        description="Field to sort results by (e.g. 'market_cap', 'dividend_yield').",
    )
    sort_order: str = Field(
        default="desc",
        description="Sort direction: 'asc' or 'desc'.",
    )
    limit: int = Field(
        default=100,
        description="Max results to return. Use 100 for broad exploration, 30-50 for narrowed results.",
    )
    update_results: bool = Field(
        default=True,
        description=(
            "Whether this turn should refresh the stock list on the right panel. "
            "True when filters change (user narrows/broadens criteria). "
            "False for pure conversation about existing stocks "
            "(e.g. discussing analyst ratings, comparing stocks, asking details)."
        ),
    )
    recommendations: List[Dict[str, str]] = Field(
        default_factory=list,
        description=(
            "Array of per-stock recommendation reasons. "
            'Each item: {"symbol": "AAPL", "reason": "..."}. '
            "Only populate when making final recommendations. "
            "Reasons should echo the user's stated preferences in plain Chinese."
        ),
    )
    title: str = Field(
        default="",
        description=(
            "5-10 Chinese characters summarizing the stock picking direction. "
            "e.g. '高股息大盘蓝筹', 'AI芯片成长股', '低估值科技反弹'. "
            "Update every turn to reflect the CURRENT direction "
            "(user may change direction mid-conversation)."
        ),
    )
    navigate: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Navigate the right panel to different content. "
            "IMPORTANT: Actively navigate when you call research tools so the user sees visual data alongside your text response. "
            "Supported types: "
            '"stock" (params: {symbol}), '
            '"screener" (params: {}), '
            '"daily_report" (params: {date}), '
            '"morning_report" (params: {date}), '
            '"macro" (params: {}), '
            '"brew" (params: {}), '
            '"macro_liquidity" (params: {}), '
            '"macro_economy" (params: {}), '
            '"macro_inflation" (params: {}), '
            '"macro_sentiment" (params: {}). '
            'Example: {"type": "macro_liquidity", "params": {}, "reason": "User asked about liquidity"}'
        ),
    )


# ---------------------------------------------------------------------------
# Layered Tool Architecture
# ---------------------------------------------------------------------------

# Base tools - screener data operations (V1)
base_tools = [
    execute_screener,
    filter_by_tickers,
    get_field_distribution,
    list_available_sectors,
]

# Extended tools - deep stock analysis (V2+, placeholder)
# extended_tools = [
#     get_stock_profile,      # Business description, competitive landscape (FMP)
#     get_recent_news,        # Recent news summary
#     get_earnings_summary,   # Latest earnings highlights
# ]


# ---------------------------------------------------------------------------
# Daily Report Tools (operate on _recent_reports ContextVar)
# ---------------------------------------------------------------------------

def get_report_by_date(report_date: str) -> str:
    """Fetch a daily market report for a specific date.

    Use when user asks about a specific day's market report, e.g. "yesterday's report",
    "how was the market on March 15". Also use when you need to navigate the right panel
    to a specific date's report.

    Args:
        report_date: Date in YYYY-MM-DD format. Example: "2026-03-18"

    Returns:
        JSON with: date, title, summary, intro, news (headlines + briefs),
        report_summary, calendar. Returns error if no report for that date.
    """
    reports = _recent_reports.get()
    for r in reports:
        if r.get("report_date") == report_date:
            return json.dumps({
                "found": True,
                "date": r.get("report_date"),
                "title": r.get("title"),
                "summary": r.get("summary"),
                "intro": r.get("intro"),
                "news": r.get("news"),
                "report_summary": r.get("report_summary"),
                "calendar": r.get("calendar"),
            }, ensure_ascii=False, default=str)
    available = [r.get("report_date") for r in reports]
    return json.dumps({
        "found": False,
        "error": "No report found for %s. Available dates: %s" % (report_date, available),
    }, ensure_ascii=False)


def list_recent_reports(days: int = 7) -> str:
    """List recent daily market reports with their titles and summaries.

    Use when user asks about recent market trends, e.g. "what happened this week",
    "how has the market been recently", "summarize this week's news". Returns a list
    of available reports with dates and key summaries.

    Args:
        days: Number of recent days to include. Default 7, max 14.

    Returns:
        JSON with: count, reports (list of {date, title, summary, headline_count, brief_count}).
    """
    reports = _recent_reports.get()
    days = min(days, 14)
    recent = reports[:days]  # already sorted by date desc

    result = []
    for r in recent:
        news = r.get("news") or {}
        headline_count = len(news.get("headlines", [])) if isinstance(news, dict) else 0
        brief_count = len(news.get("briefs", [])) if isinstance(news, dict) else 0
        result.append({
            "date": r.get("report_date"),
            "title": r.get("title"),
            "summary": r.get("summary"),
            "headline_count": headline_count,
            "brief_count": brief_count,
        })

    return json.dumps({
        "count": len(result),
        "reports": result,
    }, ensure_ascii=False, default=str)


# Active tool set
research_tools = (
    base_tools
    + [get_report_by_date, list_recent_reports]
    + research_data_tools
    + [GoogleSearchTool(bypass_multi_tools_limit=True)]
)


# ---------------------------------------------------------------------------
# Agent Instruction
# ---------------------------------------------------------------------------

RESEARCH_AGENT_INSTRUCTION = """You are a friendly stock research guide for Chinese-speaking users. You help complete beginners find personalized stocks through natural conversation.

## Your Personality

You are like a knowledgeable friend - warm, patient, and approachable. You NEVER use financial jargon. Always translate technical terms to plain language:
- "ROE" -> "盈利能力"
- "PE" -> "股价是否划算"
- "市盈率" -> "赚钱速度跟股价的比例"
- "RSI" -> "最近涨太多还是跌太多"
- "分析师评级" -> "华尔街专家们怎么看"
- "SMA50" -> "最近走势"
- "beta" -> "波动大不大"
- "市值" -> "公司大小"

## How You Work

Every turn: understand user intent, decide if filters need changing, respond naturally.

### Core loop
1. User says something (click or type).
2. Decide: is the user **changing criteria** or **chatting about existing results**?
   - Changing criteria -> update filters, set `update_results=true`
   - Chatting about existing stocks -> keep filters unchanged, set `update_results=false`
3. If updating: call `execute_screener` to see how many stocks match.
4. Reply with a detailed, informative message + follow-up options. Don't be stingy with words — the user came here to learn, not to get one-liners.
5. If match_count is small enough (roughly <15), also write a `recommendations` entry for each stock.

### update_results: when to refresh the right panel
- `true`: User wants to change, add, or remove filter conditions (e.g. "only large caps", "show me tech stocks", "remove the dividend filter")
- `false`: User is asking about the current results without changing criteria:
  - "专家们怎么评价？" (asking analyst ratings)
  - "这几只哪个最稳？" (comparing current stocks)
  - "看看它们的增长潜力" (discussing existing picks)
  - "为什么推荐这只？" (asking for explanation)

### When to reset (change direction)
- `update_results=true` with `filters=[]`: User wants to start over or change approach completely.
  - "换个选股思路" / "换个方向" / "重新来" / "不要这些了"
  - This clears the right panel and asks the user for a new direction.
  - IMPORTANT: output `filters=[]` (empty) + `update_results=true` to trigger a reset.

### When to write recommendations
- match_count > 15: Do NOT write recommendations. Just show the list and ask follow-up questions to narrow down.
- match_count <= 15: Write a 1-2 sentence reason for each stock in the results. This happens naturally as the list gets small -- no special mode switch needed.
- User explicitly asks "recommend" / "help me pick from these": Write recommendations even if list is larger.

### Every turn must output filters
- Always include ALL accumulated filters in your output (even when `update_results=false`).
- If user says "dividends" on the first turn, output filters immediately with `update_results=true`.
- The only exception: if the user says something completely unrelated to stock picking (e.g. "hello"), output `filters=[]` and ask what they're looking for.

### Examples
- "稳健收息" -> filters: [dividend_yield>2, dividend_payout_years>=5], recommendations: [] (list is large)
- -> "公用事业" -> add sector eq Utilities, recommendations: [] or reasons if list is small
- -> "大公司" -> add market_cap_tier in [large, mega], recommendations: [{symbol, reason}, ...] (list is now small)

- "PE<15 ROE>20% 软件股" -> filters: [pe_ttm<15, roe>20, sector eq Technology Services], recommendations: [{...}] (specific enough, list is small)

- "加密货币相关股票" -> call filter_by_tickers(["COIN", "MARA", "RIOT", "MSTR", "CLSK", ...]) -> filters: [{"field": "tickers", "op": "in", "value": ["COIN", "MARA", ...]}]
- "AI芯片" -> call filter_by_tickers(["NVDA", "AMD", "AVGO", "MRVL", ...]) -> filters: [{"field": "tickers", "op": "in", "value": [...]}]

## First Turn Rules (New Conversation)

When conversation history is empty (this is the first turn), your reply needs special attention:

1. **Personalized welcome**: Generate a friendly greeting based on what the user is currently viewing. Do NOT use generic templates - say something specific based on actual data.
2. **Dynamic options**: Generate 3-5 options the user might be interested in. These options MUST be based on actual data from the current context, never generic questions.
3. **Don't repeat data**: The welcome should highlight key insights and important points, not recite the context data back.

### First-turn style by context type

**Screener mode** (no active_context or type=screener):
- Welcome: Brief, guide the user to start picking stocks
- Options: Stock picking directions based on current market hot topics

**Daily report mode** (type=daily_report):
- Welcome: Extract the 1-2 most important points from today's report
- Options: Generate questions based on actual news/events in the report, e.g. "XX company rose 5%, why?", "What does the Fed's statement mean?"

**Morning report mode** (type=morning_report):
- Welcome: Extract the 1-2 most important pre-market signals (futures direction, key overnight news)
- Options: Generate questions based on actual data in the report, e.g. "What does today's futures decline mean?", "Which overnight news item is most market-moving?"

**Macro mode** (type=macro):
- Welcome: Summarize the 4 signal lights' status in one sentence with overall assessment
- Options: Generate questions based on signal light states, e.g. "Why is liquidity green?", "How does the inflation yellow light affect tech stocks?"

**Stock mode** (type=stock):
- Welcome: Extract the 1-2 most noteworthy points about this stock (e.g. valuation, recent price movement, analyst ratings)
- Options: Generate questions based on actual stock data, e.g. "Is 40x PE expensive?", "Why did it drop this week?"

**Brew mode** (type=brew):
- Welcome: Based on user's holdings' today performance, highlight the 1-2 most noteworthy stocks and key news
- Options: Generate personalized questions based on actual holdings and related news, e.g. "What does the NVDA analyst price target upgrade mean?", "Is your portfolio leaning defensive or offensive?"

## Daily Report Tools

You have two daily report tools:
- `get_report_by_date(report_date)` - Fetch a specific date's full report. Use when user says "yesterday's report", "how was March 15"
- `list_recent_reports(days)` - List recent N days' report summaries. Use when user says "what happened this week", "recent market trends"

Usage rules:
- After fetching report data, you can use navigate to switch the right panel to that date's daily report
- When answering "what happened recently", call list_recent_reports first for summaries, pick out key events, and summarize in your own words
- Do NOT copy-paste entire report text to the user; distill key information
- When navigating to a daily report, include a date param in navigate: {"type": "daily_report", "params": {"date": "2026-03-18"}, "reason": "..."}

## Tool Strategy

- Use `execute_screener` for structured filter conditions (PE, ROE, sector, etc.).
- Use `filter_by_tickers` when the user asks about a **thematic group** that doesn't map to standard sectors:
  - Crypto/blockchain stocks, AI chips, weight-loss drugs, space companies, nuclear energy, quantum computing, EV/electric vehicles, cybersecurity, cannabis, sports betting, etc.
  - Use YOUR OWN knowledge to decide which tickers belong to the theme. Be EXHAUSTIVE - include every ticker you can think of (20-50+). The tool will automatically filter out any that aren't in our universe. More is always better than fewer, because the user can narrow down later.
  - IMPORTANT: After calling filter_by_tickers, include `{"field": "tickers", "op": "in", "value": ["COIN", "MARA", ...]}` in your `filters` output so the right panel updates correctly. This is a special filter type for thematic groups.
  - You can combine this with other filters: e.g. tickers filter + pe_ttm < 15.
- Use `get_field_distribution` to understand data ranges when needed.
- Use `list_available_sectors` to know what sectors exist.
- Before adding a new filter, test with `execute_screener` first to make sure results won't drop to 0.
- If results = 0, relax the most restrictive condition and tell the user.

## Dynamic Options

Generate 3-5 clickable options based on conversation context. Rules:
- Options are plain Chinese strings that will be sent as the user's message when clicked.
- Example: `["只看大公司", "兼顾一点成长性", "换个方向看看"]`
- Options should feel natural and relevant to what was just discussed
- Last option is usually open-ended (e.g. "other ideas", "tell me more")
- Never generate generic placeholder options
- In RECOMMEND mode, options are follow-up actions (e.g. "change direction", "see more", "adjust criteria")

## Filter Accumulation

- When user expresses a preference, translate it to filter conditions
- ALWAYS include ALL previous filters in your output (accumulate, don't replace)
- If user says to remove a condition, exclude it from the accumulated list
- Your `filters` output must be the complete set of active conditions

## Recommendations

- The `symbol` field MUST be the stock ticker (e.g. "AAPL", "VRT", "MSFT") copied from the `ticker` field in execute_screener results. NEVER use company names (e.g. "Apple Inc.", "Vertiv Holdings, LLC") as the symbol.
- Write a 2-4 sentence reason for EACH recommended stock. Cover why it fits the user's criteria, one key strength, and one thing to watch out for.
- Echo the user's stated preferences (e.g. "you wanted steady dividends - this company has paid dividends for 25 years straight")
- Use plain Chinese, include meaningful numbers (e.g. "连续25年分红，股息率3.2%")

## Available Data Fields

### Identity
- `name`, `sector`, `industry`, `beta_1y`

### Price & Performance
- `price`, `daily_change`, `weekly_change`, `monthly_change`
- `change_3m`, `change_6m`, `ytd_change`, `yearly_change`
- `high_52w`, `low_52w`

### Valuation
- `market_cap`, `pe_ttm`, `pb_mrq`, `ps_fy`, `ev_ebitda_ttm`, `peg_ttm`

### Profitability
- `gross_margin`, `operating_margin`, `net_margin`, `roe`, `roa`, `roic`

### Growth
- `revenue_growth_ttm`, `revenue_growth_quarterly`, `eps_growth_ttm`
- `eps_growth_quarterly`, `ebitda_growth_ttm`, `fcf_growth_ttm`
- `revenue_growth_5y`, `eps_growth_5y`

### Dividends
- `dividend_yield`, `payout_ratio`, `dividend_growth_years`, `dividend_payout_years`

### Balance Sheet
- `debt_to_equity`, `current_ratio`, `cash_equivalents`

### Volume
- `volume`, `avg_volume_30d`, `relative_volume`

### Analyst
- `target_price_avg`, `analyst_rating` (1=Strong Buy, 5=Strong Sell)

### Technical
- `rsi`, `sma50`, `sma200`, `above_sma50`, `above_sma200`

### Derived
- `position_52w` (0=52w low, 1=52w high)
- `analyst_upside` (% upside to target price)
- `market_cap_tier`: "small" (<$2B), "mid" ($2-10B), "large" ($10-200B), "mega" (>$200B)

## Preference-to-Filter Mapping

| User says | Translate to |
|-----------|-------------|
| "stable"/"safe"/"steady" | market_cap_tier in ["large","mega"], beta_1y < 1 |
| "dividends"/"income" | dividend_yield > 2, dividend_payout_years >= 5 |
| "growth"/"fast growing" | revenue_growth_ttm > 20, eps_growth_ttm > 15 |
| "cheap"/"undervalued" | pe_ttm < 15, position_52w < 0.4 |
| "trending"/"momentum" | change_3m > 10, above_sma50 eq true |
| "earnings beat"/"财报超预期" | eps_growth_quarterly > 0, revenue_growth_quarterly > 0 |
| "white horse"/"白马股"/"被低估的好公司" | roe > 15, pe_ttm < 25, market_cap_tier in ["large","mega"] |
| "tech" | sector eq "Technology Services" |
| "healthcare" | sector in ["Health Technology","Health Services"] |
| "big company" | market_cap_tier in ["large","mega"] |
| "small company" | market_cap_tier eq "small" |

IMPORTANT: When the user expresses ANY intent to find, discover, or screen stocks (even indirectly like "财报超预期的公司", "被低估的白马股", "最近涨得好的"), you MUST:
1. Translate the intent into filter conditions
2. Call `execute_screener` to get results
3. Set `update_results=true` and output the filters
This is a STOCK SELECTION task, not a research question. Use the screener, not just conversation.

## Operators
- gt (>), gte (>=), lt (<), lte (<=), eq (=), neq (!=), in (value in list)

## Message Formatting Rules

Your `message` field is rendered as Markdown in the frontend. Follow these rules for readability:

1. **Use line breaks between ideas.** Never write a wall of text. Each distinct thought should be a separate paragraph (separated by `\n\n`).
2. **Bold text must start on its own line.** Never bold random words mid-sentence. Use bold only for:
   - Section headings (e.g. `**筛选结果**\n找到了12只符合条件的股票...`)
   - Key metrics as a label at line start (e.g. `**盈利能力** 都在20%以上`)
3. **Lists for multiple items.** When mentioning 3+ things (sectors, criteria, stocks), use bullet points:
   ```
   目前的筛选条件：\n- 大公司\n- 盈利能力 > 20%\n- 股息率 > 2%
   ```
4. **Be thorough and generous with detail.** The user is here to learn — give them real substance, not surface-level summaries.
   - Stock analysis (fundamentals, technicals, news): 4-8 paragraphs. Cover valuation, growth, risks, and what to watch. Always interpret the numbers, don't just list them.
   - Screener results: 3-5 paragraphs. Explain what the filters found, highlight patterns in the results, and give context on why these stocks stand out.
   - Macro/market questions: 4-6 paragraphs. Connect multiple data points into a coherent narrative. Explain what it means for the average investor.
   - General questions: At least 3 paragraphs. A one-liner is never enough.
5. **No inline bold for emphasis.** Don't write `这些股票的**盈利能力**都很强`. Instead write `这些股票的盈利能力都很强` or put it on its own line as a heading.

Good example:
```
找到了8只符合条件的股票！都是大公司，盈利能力强，而且稳定分红。

**筛选条件**
- 大公司（市值500亿美元以上）
- 盈利能力 > 20%
- 连续分红5年以上

想进一步缩小范围吗？可以看看它们最近的走势或者华尔街专家的评价。
```

Bad example (do NOT do this):
```
找到了8只符合条件的**股票**！这些都是**大公司**，它们的**盈利能力**都在20%以上，而且都**稳定分红**超过5年，筛选条件包括市值500亿美元以上、盈利能力大于20%、连续分红5年以上，想进一步缩小范围的话可以看看走势或者专家评价。
```

## Title Rules

Every turn, output a `title` field: a 5-10 Chinese character summary of the current stock picking direction.
- Must be Chinese
- Reflect the current direction, not conversation summary
- Update when user changes direction
- Examples: "高股息大盘蓝筹", "AI芯片成长股", "低估值科技反弹", "网络安全小盘股"

## Navigation (Research Desk)

You can navigate the user's right panel to show a stock's detailed research view or daily report.

### When to navigate:
- User says "show me NVDA", "look at AAPL details", "open Apple's research" -> navigate to stock
- User clicks a stock from results and wants to see more -> navigate to stock
- User says "look at today's report", "what's happening in the market today" -> navigate to daily_report
- User in daily report says "let me look at NVDA in detail" -> navigate to stock
- User says "go back to the report" -> navigate to daily_report
- User says "show me the morning report", "what's pre-market like", "how are futures today" -> navigate to morning_report
- User in morning report says "let me look at a stock in detail" -> navigate to stock
- User says "look at macro", "how's the macro", "how's liquidity" -> navigate to macro
- User in macro dashboard says "how does this affect my stocks" -> combine macro data with user's watchlist/sectors to analyze
- User says "go back to screener", "find new stocks", "screen stocks", "help me pick stocks" -> navigate to screener
- User in any non-screener mode expresses intent to discover/find/screen stocks -> navigate to screener
- User says "show my holdings", "my daily digest" -> navigate to brew
- User in brew digest says "look at NVDA in detail" -> navigate to stock
- NEVER navigate just because user mentions a stock name casually

### CRITICAL navigate rules:
- When you call `execute_screener` or `filter_by_tickers` tools AND the current context is NOT screener, you MUST set navigate to screener. The right panel needs to show screening results.
- When you output `filters` with `update_results=true` AND the current context is NOT screener, you MUST set navigate to screener.
- When you call `get_report_by_date` and want to show the report, set navigate to daily_report with the date.
- In short: if your response changes what should be displayed on the right panel, ALWAYS set navigate accordingly.

### How to navigate:
Set the `navigate` field in your output:
- For screener: type: "screener", params: {}, reason: "..."
- For stock: type: "stock", params: {"symbol": "AAPL", "tab": "<tab>"}, reason: "..."
  Tab options: "overview" (fundamentals/valuation), "earnings" (EPS/revenue/financials), "technical" (RSI/MACD/chart), "market" (news/analyst/sentiment)
  Omit "tab" to default to "overview".
- For daily report: type: "daily_report", params: {"date": "2026-03-18"}, reason: "..."
  ONLY use when user EXPLICITLY asks for "日报"/"每日报告"/"今日简报". Do NOT navigate here when user asks about "宏观" or "大盘".
- For morning report: type: "morning_report", params: {"date": "2026-03-18"}, reason: "..."
  ONLY use when user EXPLICITLY asks for "早报"/"盘前简报".
- For macro dashboard: type: "macro", params: {"tab": "<tab>"}, reason: "..."
  Tab options: "liquidity" (Fed/TGA/RRP), "economy" (GDP/employment), "inflation" (CPI/rates), "sentiment" (VIX/fear&greed)
  Omit "tab" to show the macro overview homepage.
- For brew digest: type: "brew", params: {}, reason: "..."

### Tab-Aware Navigation Rules (CRITICAL):
When navigating to stock, ALWAYS pick the tab matching the discussion topic:
- Valuation/PE/fundamentals/overview -> tab: "overview"
- Earnings/EPS/revenue/quarterly -> tab: "earnings"
- Chart/RSI/MACD/trend/support/resistance -> tab: "technical"
- News/analyst/rating/sentiment/market -> tab: "market"

When navigating to macro, pick the tab matching the dimension:
- General macro/risk/market environment -> NO tab (shows overview homepage)
- Fed/TGA/RRP/net liquidity/balance sheet -> tab: "liquidity"
- GDP/employment/recession/economic -> tab: "economy"
- CPI/rates/inflation/Fed policy -> tab: "inflation"
- VIX/fear/greed/put-call/sentiment -> tab: "sentiment"

CRITICAL: 聊"宏观"/"大盘"/"市场环境" -> navigate to macro (首页), NOT daily_report.
只有用户明确说"日报"/"早报"/"今日报告"才跳日报/早报。

### When viewing a stock:
- You have the stock's data in the context above
- Answer questions about the stock directly from the context data
- If the user wants to go back to screening, tell them to click the back button

## Daily Report Discussion Mode

When user is viewing the daily report, you switch from stock picker to market commentary assistant:
- Interpret news and market dynamics from the report in plain language to help the user understand implications
- When user asks "how does this news affect my holdings", combine news content with the stocks the user cares about to answer
- When user is interested in a stock mentioned in the news, use navigate to switch to that stock's research view
- Keep the conversation natural - do not repeat the report content verbatim, provide analysis and insights instead
- You can still use screener tools to find stocks related to market themes from the daily report
- When outputting filters/recommendations during daily report discussion, set `update_results=false` unless user explicitly wants to screen stocks

## Macro Discussion Mode

When user is viewing the macro risk dashboard, you switch from stock picker to macro analyst assistant:
- Interpret the signal lights (4 dimensions: liquidity, economy, inflation, sentiment) in plain language, explaining what green/yellow/red means for each
- Explain the logic behind the core verdict
- When user asks "how does this affect my stocks", combine the signal light status with the user's watchlist sectors/stocks to provide targeted analysis
- You can deep-dive into a specific dimension (e.g. "why is liquidity green") using the landscape and narrative data
- When user is interested in a stock or sector mentioned in the macro context, use navigate to jump to that stock's research view
- Default `update_results=false` (macro discussion does not change stock screening results)

## Brew Digest Discussion Mode

When user is viewing their personalized daily digest, you switch to personal investment advisor:
- You know ALL stocks the user is watching - use this to give targeted advice
- Interpret news in terms of impact on the USER'S holdings specifically, not the market overall
- When user asks "how are my holdings doing", combine each stock's performance and related news to give a comprehensive assessment
- Proactively flag risks (e.g. a stock dropping multiple days, analyst downgrades)
- When user is interested in a specific stock from their holdings, use navigate to switch to that stock's research view
- Default `update_results=false` (brew discussion does not change stock screening results)

## Critical Output Rules

1. **`filters` must be a valid JSON array string.** Copy the exact filters you used in execute_screener.
2. **`options` must be a valid JSON array of strings.** Each item is a plain Chinese string.
3. **`recommendations` must be a valid JSON array string.** Each item has "symbol" and "reason" keys.
4. **Market cap is in USD** (1e9 = $1B).
5. **Percentages are raw numbers** (ROE 15% = 15, not 0.15).
6. **Always write message in Chinese.**
7. **If you use execute_screener, your filters output MUST match what you tested.**
8. **Message must follow the Markdown formatting rules above.**

## Research Tools Guide

### Stock Screening -- finding stocks
- `execute_screener`: Filter by conditions (PE, market cap, sector, etc)
- `filter_by_tickers`: Look up specific stocks in the universe
- `get_field_distribution`: See distribution of a metric across the universe
- `list_available_sectors`: List all available sectors for filtering

### Individual Stock Research -- analyzing a specific stock
- `get_stock_quote(symbols)`: Real-time price and performance for up to 20 stocks
- `get_stock_fundamentals(symbol)`: Valuation (PE/PS/PB), profitability (margins, ROE), growth, analyst targets
- `get_technical_analysis(symbol)`: RSI, MACD, moving averages, support/resistance, buy/sell ratings
- `get_stock_news(symbols, days)`: Recent news for specific stocks (top 12 articles)
- `get_company_profile(symbol)`: What the company does, industry, CEO, employee count
- `get_peer_comparison(symbol)`: Compare valuation and profitability vs industry peers
- `get_historical_valuation(symbol)`: Historical PE/PB/PS trend (5 years) to judge if current price is expensive

### Macro Environment -- market and macro analysis
- `get_market_overview`: Indices, VIX, treasury rates, commodities, currencies
- `get_macro_risk_summary`: 4-dimension macro risk scores (economy, credit, employment, AI health)
- `get_liquidity_overview`: Fed net liquidity, TGA, RRP, reserves, SOFR, EFFR
- `get_market_sentiment`: CNN Fear & Greed Index, VIX, overall sentiment level

### Events & Calendar
- `get_earnings_calendar(days)`: Upcoming earnings dates for major companies
- `get_economic_calendar(days)`: High-impact US economic events (CPI, Non-Farm, FOMC, GDP)

### Reports -- pre-generated analysis reports
- `get_report_by_date(date)` / `list_recent_reports`: Daily market reports
- `get_morning_report`: Today's pre-market morning briefing (futures, global markets, overnight news)
- `get_weekly_report`: Latest weekly macro analysis (verdict, signal lights, 4-dimension analysis, week ahead)

### Web Search
- `google_search`: Search the web for breaking news. Use ONLY when other tools cannot answer.

### Tool Selection Priority
1. Market/macro questions -> get_market_overview + get_macro_risk_summary + get_liquidity_overview
2. Individual stock analysis -> get_stock_quote, then add fundamentals/technical/news/profile/peers as needed
3. "Is it expensive?" -> get_historical_valuation + get_peer_comparison
4. Market sentiment -> get_market_sentiment
5. Upcoming events -> get_economic_calendar + get_earnings_calendar
6. Report content -> get_morning_report / get_weekly_report / get_report_by_date
7. Stock screening -> execute_screener + filter_by_tickers
8. Last resort -> google_search

### How to Use Tool Results
When you get data from research tools, DON'T just list the raw data. Instead:
- **Interpret the data**: "RSI 72 means it's in overbought territory - short-term pullback risk"
- **Connect the dots**: "Revenue grew 25% but margins shrank - growth is coming at the cost of profitability"
- **Give actionable context**: "Analyst consensus target is $180, which is 15% upside from current price"
- **Compare**: When using peer comparison or historical valuation, highlight what stands out vs peers or vs history
- **Be specific**: Use actual numbers from the tools, not vague statements
- If a tool returns no data, acknowledge it and try google_search as fallback

## Navigation Rules (IMPORTANT)

When you call research tools, you MUST navigate the right panel so the user sees visual data alongside your text answer. This is what makes you more than a chatbot.

### Auto-navigate after tool calls:
- Called `get_liquidity_overview` -> navigate to `macro_liquidity`
- Called `get_market_sentiment` -> navigate to `macro_sentiment`
- Called `get_macro_risk_summary` -> navigate to `macro` (main dashboard)
- Called `get_stock_fundamentals` or `get_company_profile` or `get_peer_comparison` for a single stock -> navigate to `stock` with that symbol
- Called `get_morning_report` -> navigate to `morning_report`
- Called `get_weekly_report` -> navigate to `macro` (weekly report view)
- Called `execute_screener` with new filters -> navigate to `screener`

### Navigate based on user topic (even without tool calls):
- User asks about inflation, CPI, interest rates -> navigate to `macro_inflation`
- User asks about economy, GDP, employment, recession -> navigate to `macro_economy`
- User asks about their personal digest / holdings overview -> navigate to `brew`
- User asks about today's daily report -> navigate to `daily_report`

### When NOT to navigate:
- When answering a follow-up question about content already displayed in the right panel
- When giving a brief answer that doesn't need visual support
- When comparing 2+ stocks (keep the current panel, don't pick one)

## User Portfolio Awareness

When you have the user's watchlist/portfolio data (shown in the context above as "User Watchlist"):
- Naturally reference their holdings when relevant - don't force it
- When discussing market news, connect it to their specific holdings
- When recommending stocks, note overlap or complementarity with existing positions
- For risk analysis, consider their portfolio concentration
- If user asks "how are my stocks doing", use get_stock_quote with their watchlist symbols
"""


# ---------------------------------------------------------------------------
# Agent + Runner
# ---------------------------------------------------------------------------

_research_agent = LlmAgent(
    name="stock_picker",
    model=RESEARCH_MODEL,
    instruction=RESEARCH_AGENT_INSTRUCTION,
    output_schema=ResearchAgentOutput,
    output_key="picker",
    tools=research_tools,
    before_tool_callback=_before_tool_callback,
    after_tool_callback=_after_tool_callback,
    after_model_callback=meter("screener.research", model=RESEARCH_MODEL),
)


# ---------------------------------------------------------------------------
# Wrapper Class
# ---------------------------------------------------------------------------

class ResearchAgent:
    """Conversation-guided stock research assistant.

    Uses ADK's InMemoryRunner with:
    - before_tool_callback/after_tool_callback for SSE tool events
    - RunConfig(streaming_mode=SSE) for streaming
    - ContextVar-based queue to bridge callbacks with SSE generator
    """

    def __init__(self, debug: bool = False):
        plugins = [LoggingPlugin()] if debug else []
        self.runner = InMemoryRunner(
            agent=_research_agent,
            app_name="stock_picker",
            plugins=plugins,
        )

    async def _run_session(self, prompt: str) -> Dict[str, Any]:
        """Run one agent turn using ADK session, extract structured output."""
        from google.genai import types

        session = await self.runner.session_service.create_session(
            app_name="stock_picker", user_id="research"
        )
        message = types.Content(
            parts=[types.Part(text=prompt)], role="user"
        )
        try:
            async for _ in self.runner.run_async(
                user_id="research", session_id=session.id, new_message=message
            ):
                pass
        except Exception as run_err:
            logger.warning("Agent run error (checking state): %s", run_err)

        # Extract output from session state
        session_data = await self.runner.session_service.get_session(
            app_name="stock_picker", user_id="research", session_id=session.id
        )
        result: Dict[str, Any] = {}
        if session_data and hasattr(session_data, "state"):
            state = session_data.state or {}
            raw = state.get("picker", {})
            if isinstance(raw, str):
                try:
                    result = json.loads(raw)
                except json.JSONDecodeError:
                    result = {}
            elif isinstance(raw, dict):
                result = raw

        # Cleanup session (one-shot, not persistent yet)
        try:
            await self.runner.session_service.delete_session(
                app_name="stock_picker", user_id="research", session_id=session.id
            )
        except Exception:
            pass

        return result

    async def run_stream(self, prompt: str, universe: list[dict] | None = None):
        """Run agent with SSE streaming. Yields SSE event dicts.

        Tool events are emitted via ADK callbacks (before_tool_callback/after_tool_callback)
        through the _sse_queue ContextVar. This method reads from that queue and yields events.

        Note: We use normal run_async (not StreamingMode.SSE) because SSE mode
        is incompatible with output_schema — it doesn't populate session state.
        Tool call events come from ADK callbacks instead, which work in all modes.
        """
        from google.genai import types

        queue: asyncio.Queue = asyncio.Queue()
        _sse_queue.set(queue)

        session = await self.runner.session_service.create_session(
            app_name="stock_picker", user_id="research"
        )
        message = types.Content(
            parts=[types.Part(text=prompt)], role="user"
        )

        try:
            # Run agent in background task so we can yield tool events
            # from the callback queue as they happen (before tools finish)
            agent_done = asyncio.Event()
            agent_error: list = []

            async def _run_agent():
                try:
                    async for _ in self.runner.run_async(
                        user_id="research",
                        session_id=session.id,
                        new_message=message,
                    ):
                        pass
                except Exception as e:
                    agent_error.append(e)
                finally:
                    agent_done.set()

            task = asyncio.create_task(_run_agent())

            # Poll the queue for tool events while agent runs.
            # Yield each event individually with a small pause after tool_call_start
            # so the SSE client receives it before tool_call_end arrives.
            while not agent_done.is_set():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.15)
                    yield event
                    if event.get("type") == "tool_call_start":
                        await asyncio.sleep(0)  # flush to SSE client
                except asyncio.TimeoutError:
                    pass

            # Drain any remaining events after agent finishes
            while not queue.empty():
                yield queue.get_nowait()

            # Propagate agent errors
            if agent_error:
                raise agent_error[0]

            await task  # ensure task is cleaned up

            # Extract final result from session state
            session_data = await self.runner.session_service.get_session(
                app_name="stock_picker", user_id="research", session_id=session.id
            )
            parsed = {}
            if session_data and hasattr(session_data, "state") and session_data.state:
                raw = session_data.state.get("picker", {})
                if isinstance(raw, str):
                    try:
                        parsed = json.loads(raw)
                    except json.JSONDecodeError:
                        parsed = {"message": raw}
                elif isinstance(raw, dict):
                    parsed = raw

            # Yield raw parsed agent output — router handles post-processing
            yield {
                "type": "done",
                "parsed": parsed,
            }
        except Exception as e:
            logger.error("Stream error: %s", e)
            yield {"type": "error", "message": "AI 助手出了点问题，请再试一次"}
        finally:
            _sse_queue.set(None)
            try:
                await self.runner.session_service.delete_session(
                    app_name="stock_picker", user_id="research", session_id=session.id
                )
            except Exception:
                pass

    async def build_prompt(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        universe_size: int = 0,
        content_context: dict | None = None,
        user_id: str | None = None,
    ) -> str:
        """Build the full prompt with context injection.

        Shared by guide() and run_stream() to ensure consistent behavior.
        """
        # Load user watchlist for personalization
        watchlist_symbols: list[str] = []
        if user_id:
            try:
                from app.features.brew.db import get_user_watchlist
                watchlist = await get_user_watchlist(user_id)
                if watchlist and watchlist.get("symbols"):
                    watchlist_symbols = watchlist["symbols"]
            except Exception:
                logger.warning("Failed to load watchlist for user %s", user_id[:12] if user_id else "")

        prompt_parts = []

        # Current date context
        prompt_parts.append("## Current Date: %s" % date.today().isoformat())
        prompt_parts.append("")

        # User watchlist context
        if watchlist_symbols:
            prompt_parts.append("## User Watchlist")
            prompt_parts.append(
                "User is tracking these stocks: %s"
                % ", ".join(watchlist_symbols[:30])
            )
            prompt_parts.append(
                "When relevant, reference their holdings in your analysis. "
                "Do not force mentions if unrelated to the conversation."
            )
            prompt_parts.append("")

        # Conversation history
        if history:
            prompt_parts.append("## Conversation History")
            for turn in history[-20:]:
                role = turn.get("role", "user")
                content = turn.get("content", "")
                if role == "user":
                    prompt_parts.append("User: %s" % content)
                else:
                    prompt_parts.append("Assistant: %s" % content)
            prompt_parts.append("")

        # Accumulated filters from previous turns
        if accumulated_filters:
            prompt_parts.append("## Currently Active Filters")
            prompt_parts.append(
                "These filters are already applied from previous conversation turns. "
                "Include ALL of them in your output unless the user wants to change direction."
            )
            prompt_parts.append(json.dumps(accumulated_filters, ensure_ascii=False))
            prompt_parts.append("")

        # Universe info
        prompt_parts.append("## Universe: %d stocks loaded" % universe_size)
        prompt_parts.append("")

        # Content context (Research Desk: what user is viewing in right panel)
        if content_context:
            ctx_type = content_context.get("type", "screener")
            if ctx_type == "stock":
                symbol = content_context.get("symbol", "")
                prompt_parts.append("## User is currently viewing: %s Stock Research" % symbol)
                # Format quote data
                quote = content_context.get("quote", {})
                if quote:
                    prompt_parts.append("Price: $%.2f (%s%.2f%%)" % (
                        quote.get("price", 0) or 0,
                        "+" if (quote.get("change_percent", 0) or 0) >= 0 else "",
                        quote.get("change_percent", 0) or 0,
                    ))
                    prompt_parts.append("Market Cap: %s" % _format_market_cap(quote.get("market_cap")))
                # Format fundamentals
                fundamentals = content_context.get("fundamentals", {})
                if fundamentals:
                    valuation = fundamentals.get("valuation", {})
                    profitability = fundamentals.get("profitability", {})
                    growth = fundamentals.get("growth", {})
                    parts = []
                    if valuation.get("pe"): parts.append("PE %.1f" % valuation["pe"])
                    if valuation.get("pb"): parts.append("PB %.1f" % valuation["pb"])
                    if valuation.get("ps"): parts.append("PS %.1f" % valuation["ps"])
                    if profitability.get("roe"): parts.append("ROE %.1f%%" % (profitability["roe"] * 100))
                    if growth.get("revenue_yoy"): parts.append("Revenue YoY %+.1f%%" % (growth["revenue_yoy"] * 100))
                    if parts:
                        prompt_parts.append("Fundamentals: %s" % " | ".join(parts))
                # Earnings data
                earnings_history = content_context.get("earnings_history")
                if earnings_history:
                    eps_parts = []
                    for eh in earnings_history[:4]:
                        if isinstance(eh, dict):
                            q = eh.get("quarter", "")
                            actual = eh.get("eps_actual")
                            est = eh.get("eps_estimate")
                            surprise = eh.get("surprise_percent")
                            eps_parts.append("%s: EPS $%.2f (est $%.2f, %s%.1f%%)" % (
                                q[:7] if q else "?",
                                actual or 0, est or 0,
                                "+" if (surprise or 0) >= 0 else "", (surprise or 0) * 100
                            ))
                    if eps_parts:
                        prompt_parts.append("EPS History: " + " | ".join(eps_parts))

                financial_growth = content_context.get("financial_growth")
                if financial_growth and len(financial_growth) > 0:
                    latest = financial_growth[0] if isinstance(financial_growth[0], dict) else {}
                    g_parts = []
                    if latest.get("revenueGrowth") is not None:
                        g_parts.append("Revenue YoY %+.1f%%" % (latest["revenueGrowth"] * 100))
                    if latest.get("netIncomeGrowth") is not None:
                        g_parts.append("Net Income YoY %+.1f%%" % (latest["netIncomeGrowth"] * 100))
                    if latest.get("epsdilutedGrowth") is not None:
                        g_parts.append("EPS YoY %+.1f%%" % (latest["epsdilutedGrowth"] * 100))
                    if g_parts:
                        prompt_parts.append("Latest Quarter Growth: " + " | ".join(g_parts))

                income_stmts = content_context.get("income_statements")
                if income_stmts and len(income_stmts) > 0:
                    latest_is = income_stmts[0] if isinstance(income_stmts[0], dict) else {}
                    is_parts = []
                    if latest_is.get("revenue"):
                        is_parts.append("Revenue %s" % _format_market_cap(latest_is["revenue"]))
                    if latest_is.get("net_income"):
                        is_parts.append("Net Income %s" % _format_market_cap(latest_is["net_income"]))
                    if latest_is.get("gross_profit_ratio"):
                        is_parts.append("Gross Margin %.1f%%" % (latest_is["gross_profit_ratio"] * 100))
                    if is_parts:
                        prompt_parts.append("Latest Income Statement: " + " | ".join(is_parts))

                # Technical data
                tech_derived = content_context.get("technical_derived")
                if tech_derived and isinstance(tech_derived, dict):
                    t_parts = []
                    if tech_derived.get("trend_direction"):
                        t_parts.append("Trend: %s" % tech_derived["trend_direction"])
                    if tech_derived.get("rsi_zone"):
                        t_parts.append("RSI: %s" % tech_derived["rsi_zone"])
                    if tech_derived.get("macd_cross"):
                        t_parts.append("MACD: %s" % tech_derived["macd_cross"])
                    if tech_derived.get("ma_alignment"):
                        t_parts.append("MA: %s" % tech_derived["ma_alignment"])
                    if tech_derived.get("bb_position"):
                        t_parts.append("BB: %s" % tech_derived["bb_position"])
                    if tech_derived.get("volume_trend"):
                        t_parts.append("Volume: %s" % tech_derived["volume_trend"])
                    if t_parts:
                        prompt_parts.append("Technical Signals: " + " | ".join(t_parts))

                sr = content_context.get("support_resistance")
                if sr and isinstance(sr, dict):
                    sr_parts = []
                    if sr.get("resistance_1"):
                        sr_parts.append("R1 $%.2f" % sr["resistance_1"])
                    if sr.get("support_1"):
                        sr_parts.append("S1 $%.2f" % sr["support_1"])
                    if sr_parts:
                        prompt_parts.append("Support/Resistance: " + " | ".join(sr_parts))

                # Market / analyst data
                analyst = content_context.get("analyst_summary")
                if analyst and isinstance(analyst, dict):
                    a_parts = []
                    if analyst.get("consensus"):
                        a_parts.append("Consensus: %s" % analyst["consensus"])
                    if analyst.get("total"):
                        a_parts.append("%d analysts" % analyst["total"])
                    if analyst.get("price_target_avg"):
                        a_parts.append("Avg Target $%.0f" % analyst["price_target_avg"])
                    if a_parts:
                        prompt_parts.append("Analyst Ratings: " + " | ".join(a_parts))

                recent_news = content_context.get("recent_news")
                if recent_news and isinstance(recent_news, list):
                    news_titles = [n.get("title", "") for n in recent_news[:5] if isinstance(n, dict) and n.get("title")]
                    if news_titles:
                        prompt_parts.append("Recent News Headlines:")
                        for title in news_titles:
                            prompt_parts.append("- %s" % title[:120])

                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see all this data in the right panel (4 tabs: Overview, Earnings, Technical, Market). "
                    "You have the full picture: quote, fundamentals, earnings history, technical signals, analyst ratings, and recent news. "
                    "Use ALL of this data to answer the user's questions comprehensively. "
                    "If user wants to see a different stock, use the navigate field to switch to that stock's research view."
                )
                prompt_parts.append("")
            elif ctx_type == "daily_report":
                report_context = _format_daily_report_context(content_context)
                prompt_parts.append(report_context)
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see the daily report in the right panel. "
                    "Answer questions about market news and trends using the report data above. "
                    "If the user is interested in a specific stock mentioned in the report, "
                    "use the navigate field to switch to that stock's research view."
                )
                prompt_parts.append("")
            elif ctx_type == "morning_report":
                morning_context = _format_morning_report_context(content_context)
                prompt_parts.append(morning_context)
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see the pre-market morning report in the right panel. "
                    "Answer questions about overnight news, futures movements, and today's key events "
                    "using the report data above. "
                    "If the user is interested in a specific stock or sector mentioned in the report, "
                    "use the navigate field to switch to that stock's research view."
                )
                prompt_parts.append("")
            elif ctx_type == "macro":
                macro_context = _format_macro_context(content_context)
                if macro_context:
                    prompt_parts.append(macro_context)
                    prompt_parts.append("")
                    prompt_parts.append(
                        "The user can see the macro risk dashboard in the right panel. "
                        "Answer questions about macro conditions, signal lights, and their "
                        "implications using the data above. "
                        "If the user is interested in a specific stock or sector, "
                        "use the navigate field to switch to that stock's research view."
                    )
                    prompt_parts.append("")
            elif ctx_type == "brew":
                brew_context = _format_brew_context(content_context)
                if brew_context:
                    prompt_parts.append(brew_context)
                    prompt_parts.append("")
                    prompt_parts.append(
                        "The user can see their personalized daily digest in the right panel. "
                        "You know their watchlist and today's performance for each stock. "
                        "Answer questions as a personal investment advisor - focus on how news "
                        "and events affect THEIR holdings specifically, not the market overall. "
                        "If the user wants to dive deeper into a specific stock, "
                        "use the navigate field to switch to that stock's research view."
                    )
                    prompt_parts.append("")
            elif ctx_type == "macro_liquidity":
                prompt_parts.append("## User is currently viewing: Liquidity Environment")
                nl = content_context.get("net_liquidity")
                if nl is not None:
                    prompt_parts.append("Net Liquidity: $%.2fT" % (nl / 1000) if nl >= 1000 else "Net Liquidity: $%.0fB" % nl)
                change = content_context.get("net_liquidity_change")
                if change is not None:
                    prompt_parts.append("Change: %+.2f%%" % change)
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see liquidity metrics in the right panel. "
                    "Answer questions about Fed balance sheet, TGA, RRP, and monetary conditions "
                    "using the data above. Default update_results=false."
                )
                prompt_parts.append("")
            elif ctx_type == "macro_economy":
                prompt_parts.append("## User is currently viewing: Economic Fundamentals")
                headline = content_context.get("overall_headline", "")
                if headline:
                    prompt_parts.append("Assessment: %s" % headline)
                dims = content_context.get("dimensions", [])
                for d in dims:
                    if isinstance(d, dict):
                        prompt_parts.append("- %s: %s (score %.1f/10)" % (
                            d.get("name_zh", ""), d.get("headline", ""), d.get("score", 0)
                        ))
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see economic indicators in the right panel. "
                    "Answer questions about GDP, employment, credit conditions. "
                    "Default update_results=false."
                )
                prompt_parts.append("")
            elif ctx_type == "macro_inflation":
                prompt_parts.append("## User is currently viewing: Inflation & Rates")
                headline = content_context.get("overall_headline", "")
                if headline:
                    prompt_parts.append("Assessment: %s" % headline)
                cpi = content_context.get("cpi_components", [])
                if cpi:
                    prompt_parts.append("CPI components:")
                    for c in cpi:
                        if isinstance(c, dict):
                            yoy = c.get("yoy_pct")
                            prompt_parts.append("- %s: YoY %s" % (
                                c.get("name_zh", ""),
                                "%.1f%%" % yoy if yoy is not None else "N/A"
                            ))
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see inflation and rate data in the right panel. "
                    "Answer questions about CPI, Fed policy, interest rates. "
                    "Default update_results=false."
                )
                prompt_parts.append("")
            elif ctx_type == "macro_sentiment":
                prompt_parts.append("## User is currently viewing: Market Sentiment")
                score = content_context.get("overall_score")
                headline = content_context.get("overall_headline", "")
                if score is not None:
                    prompt_parts.append("CNN Fear & Greed: %.0f/100" % score)
                if headline:
                    prompt_parts.append("Assessment: %s" % headline)
                prompt_parts.append("")
                prompt_parts.append(
                    "The user can see sentiment indicators in the right panel. "
                    "Answer questions about market fear/greed, VIX, put/call ratios. "
                    "Default update_results=false."
                )
                prompt_parts.append("")

        # Current user message
        prompt_parts.append("## User's Message")
        prompt_parts.append(message)

        return "\n".join(prompt_parts)

    async def guide(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        universe: list[dict] | None = None,
        content_context: dict | None = None,
        user_id: str | None = None,
    ) -> Dict[str, Any]:
        """Process one turn of the guided stock research conversation."""
        _current_universe.set(universe if universe else [])

        # Pre-load recent reports for daily report tools
        try:
            from app.features.daily_report.db import list_reports
            reports_result = await list_reports(limit=7, offset=0)
            _recent_reports.set(reports_result.get("data", []) if reports_result else [])
        except Exception:
            logger.warning("Failed to pre-load recent reports for tools")
            _recent_reports.set([])

        prompt = await self.build_prompt(
            message=message,
            history=history,
            accumulated_filters=accumulated_filters,
            universe_size=len(universe) if universe else 0,
            content_context=content_context,
            user_id=user_id,
        )

        logger.info("Research agent message: %s", message[:100])

        try:
            result = await asyncio.wait_for(
                self._run_session(prompt),
                timeout=75.0,
            )
        except asyncio.TimeoutError:
            _current_universe.set([])
            _recent_reports.set([])
            logger.error("Research agent timed out for: %s", message[:100])
            return {
                "message": "AI 助手思考时间太长了，请再试一次。如果持续超时，可以简化一下问题。",
                "options": ["重新试试", "换个方向看看"],
                "filters": accumulated_filters or [],
                "sort_by": None,
                "sort_order": "desc",
                "limit": 30,
                "recommendations": [],
                "update_results": False,
                "title": "",
            }
        finally:
            _current_universe.set([])
            _recent_reports.set([])

        if not result:
            logger.warning(
                "Research agent returned empty result for: %s", message[:100]
            )
            return {
                "message": "抱歉，我没有理解你的意思。可以换个说法试试吗？",
                "options": [],
                "filters": accumulated_filters or [],
                "sort_by": None,
                "sort_order": "desc",
                "limit": 30,
                "recommendations": [],
                "update_results": False,
            }

        # Extract list fields (now native lists from output schema)
        options = _parse_json_field(result.get("options", []), [])
        filters = _parse_json_field(result.get("filters", []), accumulated_filters or [])
        recommendations = _parse_json_field(result.get("recommendations", []), [])

        # Navigate instruction
        navigate = result.get("navigate")
        if navigate and not isinstance(navigate, dict):
            navigate = None

        logger.info(
            "Research agent raw output: message=%s, options=%s, filters=%s, "
            "recommendations=%s, sort_by=%s, limit=%s, navigate=%s",
            result.get("message", "")[:80],
            options,
            filters,
            recommendations,
            result.get("sort_by"),
            result.get("limit", 30),
            navigate,
        )

        return {
            "message": result.get("message", ""),
            "options": options,
            "filters": filters,
            "sort_by": result.get("sort_by"),
            "sort_order": result.get("sort_order", "desc"),
            "limit": result.get("limit", 100),
            "update_results": result.get("update_results", True),
            "recommendations": recommendations,
            "title": result.get("title", ""),
            "navigate": navigate,
        }


def _parse_json_field(raw: Any, fallback: Any) -> Any:
    """Normalize agent output field, with fallback.

    Handles: plain str (JSON), list of dicts, list of JSON strings, etc.
    """
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return fallback
    if isinstance(raw, list):
        return raw
    return fallback


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_research_instance: ResearchAgent | None = None


def get_research_agent() -> ResearchAgent:
    """Get or create the singleton research agent."""
    global _research_instance
    if _research_instance is None:
        _research_instance = ResearchAgent()
    return _research_instance
