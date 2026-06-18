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
import time
from datetime import date
from typing import Any, Dict, List, Optional

from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.plugins import LoggingPlugin
from google.adk.runners import InMemoryRunner
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from app.core.config import AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT
from app.core.logging import get_logger
from app.features.agent_runtime import (
    AssembledContext,
    ContextAssemblyRequest,
    default_budget_plan,
)
from app.features.agent_runtime.runtime import get_agent_runtime
from app.features.screener.agent import (
    _current_universe,
    execute_screener,
    filter_by_tickers,
    get_field_distribution,
    list_available_sectors,
)
from app.shared.data_tools.research_tools import research_data_tools
from app.shared.llm_metering import meter
from app.shared.llm_output import CoerceNoneToDefaultsMixin

RESEARCH_MODEL_NAME = "gemini-3.5-flash"
RESEARCH_MODEL = RESEARCH_MODEL_NAME
# Keep Gemini thinking at the lowest level for default research chat. The
# frontend can still render thought summaries when ADK emits them.
_RESEARCH_GENERATE_CONTENT_CONFIG = genai_types.GenerateContentConfig(
    thinking_config=genai_types.ThinkingConfig(
        include_thoughts=True,
        thinking_level=genai_types.ThinkingLevel.MINIMAL,
    ),
)

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
    "get_forward_valuation": lambda a: "正在核对 %s 的前瞻估值..." % a.get("symbol", ""),
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
    "get_twitter_digest": lambda _: "正在获取今日推特日报...",
}


def _get_tool_description(tool_name: str, args: dict) -> str:
    fn = _TOOL_DESCRIPTIONS.get(tool_name)
    if fn:
        try:
            return fn(args)
        except Exception:
            pass
    return "正在处理..."


# ---------------------------------------------------------------------------
# Tool → Right-panel navigation
# ---------------------------------------------------------------------------
#
# Tool calls are strong intent signals. We auto-fill `navigate` from tool calls
# when the LLM omits it, but screener/filter turns must keep the right panel on
# the fresh candidate list even if the agent later probes an individual ticker.

_TOOL_NAVIGATE: Dict[str, Any] = {
    "get_stock_quote": lambda a: (
        {"type": "stock", "params": {"symbol": (a.get("symbols") or [""])[0]}}
        if a.get("symbols") else None
    ),
    "get_stock_news": lambda a: (
        {"type": "stock", "params": {"symbol": (a.get("symbols") or [""])[0], "tab": "market"}}
        if a.get("symbols") else None
    ),
    "get_stock_fundamentals": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol"), "tab": "overview"}}
        if a.get("symbol") else None
    ),
    "get_forward_valuation": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol"), "tab": "overview"}}
        if a.get("symbol") else None
    ),
    "get_technical_analysis": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol"), "tab": "technical"}}
        if a.get("symbol") else None
    ),
    "get_company_profile": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol")}}
        if a.get("symbol") else None
    ),
    "get_peer_comparison": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol"), "tab": "overview"}}
        if a.get("symbol") else None
    ),
    "get_historical_valuation": lambda a: (
        {"type": "stock", "params": {"symbol": a.get("symbol"), "tab": "overview"}}
        if a.get("symbol") else None
    ),
    "execute_screener": lambda _a: {"type": "screener", "params": {}},
    "filter_by_tickers": lambda _a: {"type": "screener", "params": {}},
    "get_liquidity_overview": lambda _a: {"type": "macro_liquidity", "params": {}},
    "get_market_sentiment": lambda _a: {"type": "macro_sentiment", "params": {}},
    "get_macro_risk_summary": lambda _a: {"type": "macro", "params": {}},
    "get_market_overview": lambda _a: {"type": "macro", "params": {}},
    "get_morning_report": lambda _a: {"type": "morning_report", "params": {}},
    "get_weekly_report": lambda _a: {"type": "macro", "params": {}},
    "get_twitter_digest": lambda _a: {"type": "twitter_digest", "params": {}},
    "get_report_by_date": lambda a: (
        {"type": "daily_report", "params": {"date": a.get("report_date", "")}}
        if a.get("report_date") else None
    ),
}


def _resolve_tool_navigate(tool_name: str, args: dict) -> Optional[Dict[str, Any]]:
    fn = _TOOL_NAVIGATE.get(tool_name)
    if not fn:
        return None
    try:
        result = fn(args or {})
    except Exception:
        return None
    if not result:
        return None
    result.setdefault("reason", "auto:%s" % tool_name)
    return result


def _select_auto_navigate(
    parsed: Dict[str, Any],
    nav_buf: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Choose the right-panel auto navigation for a completed agent turn.

    Screener tools mean the turn updated the stock-picking result panel. If the
    model later probes a ticker from those results, do not let that incidental
    stock tool steal the panel away from the fresh candidate list.
    """
    if not nav_buf:
        return None

    raw_filters = parsed.get("filters", [])
    filters = _parse_json_field(raw_filters, [])
    has_filters = isinstance(filters, list) and len(filters) > 0
    raw_update_results = parsed.get("update_results")
    update_results = has_filters if raw_update_results is None else raw_update_results is not False
    screener_nav = next(
        (nav for nav in reversed(nav_buf) if nav.get("type") == "screener"),
        None,
    )

    if screener_nav and (update_results or has_filters):
        return screener_nav
    if has_filters and update_results:
        return {"type": "screener", "params": {}, "reason": "auto:filters"}
    return nav_buf[-1]


# Auto-navigate candidates collected during a single agent run. run_stream
# initializes this to [] and reads the last entry to fill parsed.navigate when
# the agent omitted it.
_navigate_buffer: contextvars.ContextVar[Optional[List[Dict[str, Any]]]] = (
    contextvars.ContextVar("_navigate_buffer", default=None)
)
_tool_started_at: contextvars.ContextVar[Optional[Dict[str, float]]] = (
    contextvars.ContextVar("_tool_started_at", default=None)
)
# Hard cap on google_search calls per turn. Each call is ~20-30s and burns the
# turn budget if the LLM falls back to "just google it" multiple times.
_google_search_calls: contextvars.ContextVar[Optional[Dict[str, int]]] = (
    contextvars.ContextVar("_research_google_search_calls", default=None)
)
_GOOGLE_SEARCH_TOOL_NAMES = {"google_search_agent", "google_search"}


async def _before_tool_callback(tool, args, tool_context):
    """ADK before_tool_callback: emit SSE event when a tool starts.

    Async so ADK awaits it before tool execution, ensuring the event
    is queued and can be flushed to the SSE client before the tool blocks.
    Also records a navigate candidate so the right panel can auto-switch when
    the agent omits an explicit `navigate` field in its output.
    """
    from app.core.config import AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN

    tool_name = getattr(tool, "name", str(tool))
    args = args or {}

    # Per-turn hard cap on google_search. Each call is ~20-30s; without a cap
    # the LLM can chain 3-4 web searches and blow the turn timeout. Returning
    # a dict here short-circuits the tool and the LLM sees this as the result.
    if tool_name in _GOOGLE_SEARCH_TOOL_NAMES:
        counts = _google_search_calls.get(None)
        if counts is not None:
            counts[tool_name] = counts.get(tool_name, 0) + 1
            if counts[tool_name] > AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN:
                logger.info(
                    "research: blocked extra google_search call (count=%d)",
                    counts[tool_name],
                )
                return {
                    "status": "rate_limited",
                    "message": (
                        "google_search 本轮已达上限. 基于已有工具结果回答即可. "
                        "如果数据真的不足, 在答案里说'需要补充'."
                    ),
                }

    timers = _tool_started_at.get(None)
    if timers is not None:
        timers[tool_name] = time.monotonic()
    queue = _sse_queue.get(None)
    if queue is not None:
        desc = _get_tool_description(tool_name, args)
        queue.put_nowait({
            "type": "tool_call_start",
            "tool": tool_name,
            "description": desc,
        })
    nav_buf = _navigate_buffer.get(None)
    if nav_buf is not None:
        candidate = _resolve_tool_navigate(tool_name, args)
        if candidate:
            nav_buf.append(candidate)
    return None  # proceed with tool execution


async def _after_tool_callback(tool, args, tool_context, tool_response):
    """ADK after_tool_callback: emit SSE event when a tool completes."""
    from app.features.agent_runtime.events import summarize_tool_result

    queue = _sse_queue.get(None)
    tool_name = getattr(tool, "name", str(tool))
    duration_ms: int | None = None
    timers = _tool_started_at.get(None)
    if timers and tool_name in timers:
        duration_ms = int((time.monotonic() - timers.pop(tool_name)) * 1000)
    if queue is not None:
        summary = summarize_tool_result(tool_response)
        queue.put_nowait({
            "type": "tool_call_end",
            "tool": tool_name,
            "duration_ms": duration_ms,
            "result_preview": summary["preview"],
            "result_hash": summary["hash"],
            "result_truncated": summary["truncated"],
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


def _format_twitter_digest_context(ctx: dict) -> str:
    """Format twitter digest data as natural language context for the Agent."""
    parts = []
    parts.append(
        "## User is currently viewing: %s KOL Twitter Digest"
        % ctx.get("date", "latest")
    )
    if ctx.get("headline"):
        parts.append("### Headline\n%s" % ctx["headline"])

    hot_tickers = ctx.get("hot_tickers")
    if hot_tickers and isinstance(hot_tickers, list):
        rows = []
        for h in hot_tickers[:10]:
            if isinstance(h, dict):
                rows.append("- %s · %d mentions / %d KOLs" % (
                    h.get("label", ""), h.get("count", 0), h.get("kols", 0)
                ))
        if rows:
            parts.append("### Hot Tickers\n%s" % "\n".join(rows))

    theses = ctx.get("ticker_theses")
    if theses and isinstance(theses, list):
        for t in theses[:8]:
            if not isinstance(t, dict):
                continue
            head = "### Ticker %s · side=%s · %d tweets" % (
                t.get("ticker", ""), t.get("side", ""), t.get("tweet_count", 0),
            )
            stance = t.get("stance_summary", "")
            synth = t.get("synthesis_zh", "")
            kols = t.get("primary_kols") or []
            body = []
            if stance:
                body.append("Stance: %s" % stance)
            if synth:
                body.append("Synthesis: %s" % synth)
            if kols:
                body.append("KOLs: %s" % ", ".join(kols[:4]))
            body.append("buy=%d / sell=%d / observation=%d" % (
                t.get("buy_count", 0), t.get("sell_count", 0), t.get("observation_count", 0),
            ))
            parts.append("%s\n%s" % (head, "\n".join(body)))

    threads = ctx.get("macro_threads")
    if threads and isinstance(threads, list):
        rows = []
        for m in threads[:4]:
            if isinstance(m, dict):
                rows.append("- %s: %s" % (m.get("title", ""), m.get("synthesis_zh", "")[:200]))
        if rows:
            parts.append("### Macro Threads\n%s" % "\n".join(rows))

    watchpoints = ctx.get("watchpoints")
    if watchpoints and isinstance(watchpoints, list):
        rows = []
        for w in watchpoints[:5]:
            if isinstance(w, dict):
                rows.append("- %s (%s): %s" % (
                    w.get("title", ""), w.get("date_hint", ""),
                    w.get("why_it_matters_zh", "")[:200],
                ))
        if rows:
            parts.append("### Watchpoints\n%s" % "\n".join(rows))

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

class ResearchAgentOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Structured output from the research agent.

    Runs on DeepSeek via LiteLlm with `response_format={"type": "json_object"}`,
    which is not schema-enforcing — see `CoerceNoneToDefaultsMixin` for why we
    need to absorb stray `null` values that the model may emit.
    """

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
    sort_order: Optional[str] = Field(
        default="desc",
        description="Sort direction: 'asc' or 'desc'.",
    )
    limit: Optional[int] = Field(
        default=100,
        description="Max results to return. Use 100 for broad exploration, 30-50 for narrowed results.",
    )
    update_results: bool = Field(
        default=False,
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
            "Optional right-panel override. The system auto-navigates based on "
            "the tools you call (e.g. get_stock_fundamentals -> stock panel), "
            "so leave this null in most cases. Only set this when the user asks "
            "to switch panels but you did not call any tool. Format: "
            '{"type": "stock|screener|daily_report|morning_report|twitter_digest|'
            'macro|brew|macro_liquidity|macro_economy|macro_inflation|macro_sentiment", '
            '"params": {...}, "reason": "..."}.'
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

RESEARCH_AGENT_INSTRUCTION = """\
你是 TheMarketBrew 的投研助手 (research copilot)，服务中文用户。
你不是单纯的选股向导，也不是只会聊天 — 你能围绕股票、宏观、新闻、报告做多轮深度分析。

# 你能做的事

按"动作"组织，看用户意图选工具组合，不需要每次都全套：

- 选股 / 发现股票
  - execute_screener · filter_by_tickers · list_available_sectors · get_field_distribution
- 个股投研
  - get_stock_quote · get_stock_fundamentals · get_forward_valuation · get_technical_analysis · get_stock_news
  - get_company_profile · get_peer_comparison · get_historical_valuation
- 宏观与流动性
  - get_market_overview · get_macro_risk_summary · get_liquidity_overview · get_market_sentiment
- 报告与日历
  - get_morning_report · get_weekly_report · list_recent_reports · get_report_by_date
  - get_twitter_digest (KOL 推特圈每日聚合: ticker 多空、宏观讨论、Watchpoints)
  - get_earnings_calendar · get_economic_calendar
- 兜底
  - google_search · 仅在以上工具都答不了时使用

# 决策顺序

每个用户 message 先判定一个主意图，然后只为这个主意图调用工具：

- 选股 / 筛选 / 收窄条件（如 "PE 小于 20、有分红"）：
  调 `execute_screener` 或 `filter_by_tickers`；输出当前全部有效 `filters`；`update_results=true`；`navigate=null`。
  不要顺手挑 AMD/NVDA 等单只股票再查行情、新闻或基本面，除非用户明确说"打开/分析这只"。
- 清空筛选 / 换方向：
  输出 `filters=[]`；`update_results=true`；`navigate=null`。
- 个股投研（如 "AMD 怎么样"、"打开 NVDA 技术面"）：
  调 stock 类工具；`update_results=false`；`filters` 保持当前已有条件，不要刷新筛选结果。
- 宏观 / 报告 / Brew：
  调对应工具；`update_results=false`；`filters` 保持当前已有条件。
- KOL / 推特圈 / 博主在聊什么（如 "今天 KOL 都在聊什么"、"推特圈对 NVDA 怎么看"、"博主们对 AI 算力的最新观点"）：
  **必须调 `get_twitter_digest`**，不要用 `google_search` 兜底。digest 里有 ticker_theses / macro_threads / watchpoints。`update_results=false`。
- 纯聊天 / 解释已有结果：
  能直接回答就不调用工具；`update_results=false`；`filters` 保持当前已有条件。

# 工作原则

1. 先分类意图，再调用对应工具；不要为了切换右面板额外调用工具。
2. 工具结果要转成洞察：给出数字时同时解释含义，不复制原始 JSON。
3. 中文白话，必要时解释 PE/ROE/RSI 等指标。
4. 没有数据时直说"需要补充"，不要编造。
5. 不冒充任何人；你是 TheMarketBrew 的助手。

# 右面板导航

**重要：你不需要操心右面板切换。** 系统会根据主意图和工具调用自动切换右侧面板。不要为了切换面板而额外调用 stock / macro / report 工具。

`navigate` 字段几乎总是留空 (null)。只有一种例外：用户明确说"帮我切到 X 页"但你不需要拉任何新数据时，才主动输出 navigate。

# 输出契约

按需填充，不需要的字段就留空 / 默认值，不要硬凑：

- `message` (必填) · Markdown 中文，段落分明（`\\n\\n` 分段），关键标题用 `**粗体独占一行**`，列表用 bullet；长度自行判断，复杂问题展开讲，简单问题别凑字
- `title` · 方向概括，反映当前讨论焦点
- `options` · 3-5 个后续追问选项（中文短语，点击直接发给你）
- `update_results` · 筛选条件变化或清空筛选时才是 true；其他场景一律 false
- `filters` · 始终放当前已有的全部有效 filter；筛选变化时更新，非筛选场景保持不变
- `recommendations` · 仅当 match_count <= 15 或用户明确说"帮我推荐"时填；从工具 preview 可见标的里选 3-5 个；symbol 必须是 ticker（如 "NVDA"）
- `sort_by` / `sort_order` / `limit` · 仅选股场景
- `navigate` · 几乎总是 null（见上文）

## Markdown 格式约束

- 段落之间用 `\\n\\n` 分开
- bold 必须独占一行做小标题，不要在句中加粗
- 列举 3+ 项用 `- bullet`
- 不要堆数字不解读

# Watchlist 联动

如果上下文里有 "User Watchlist"，自然引用用户的持仓：
- 聊新闻时联系持仓影响
- 推荐股票时提到与持仓的互补 / 重叠
- 用户问"我的股票怎么样"直接用 get_stock_quote 拉 watchlist symbols，`update_results=false`，不要误判成筛选

# 选股工作流（仅当用户意图是挑股票时）

1. 把用户偏好翻译成 filter 条件（参考 execute_screener docstring 的偏好对照表）
2. 调 execute_screener 看 match_count，太多 (>50) 就追加条件，太少 (<5) 就放宽最严格那条
3. 累积式 · output 的 filters 永远是当前所有有效条件，不要替换式输出
4. match_count <= 15 时从 preview 可见标的里填 3-5 个 recommendations，>15 时只给方向选项让用户继续收窄
5. 主题股（加密、AI 芯片、核能、量子等不对应标准 sector）用 filter_by_tickers，自己列 20-50 个 ticker

# 几个 hard 规则

- message 始终中文
- 市值单位是 USD（1e9 = $1B）
- 百分比是裸数字（ROE 15% → 15，不是 0.15）
- 不要把工具返回的原始 JSON 复制给用户
- 没有 watchlist / 没有报告数据时，不要编造，明确说"还没拿到数据"
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
    generate_content_config=_RESEARCH_GENERATE_CONTENT_CONFIG,
    before_tool_callback=_before_tool_callback,
    after_tool_callback=_after_tool_callback,
    after_model_callback=meter("screener.research", model=RESEARCH_MODEL_NAME),
)


def _render_research_content_context(content_context: dict[str, Any] | None) -> str | None:
    """Render rich Research Desk right-panel context for ContextEngine."""
    if not content_context:
        return None

    prompt_parts: list[str] = []
    ctx_type = content_context.get("type", "screener")
    if ctx_type == "stock":
        symbol = content_context.get("symbol", "")
        prompt_parts.append("## User is currently viewing: %s Stock Research" % symbol)
        quote = content_context.get("quote", {})
        if quote:
            prompt_parts.append(
                "Price: $%.2f (%s%.2f%%)"
                % (
                    quote.get("price", 0) or 0,
                    "+" if (quote.get("change_percent", 0) or 0) >= 0 else "",
                    quote.get("change_percent", 0) or 0,
                )
            )
            prompt_parts.append(
                "Market Cap: %s" % _format_market_cap(quote.get("market_cap"))
            )
        fundamentals = content_context.get("fundamentals", {})
        if fundamentals:
            valuation = fundamentals.get("valuation", {})
            profitability = fundamentals.get("profitability", {})
            growth = fundamentals.get("growth", {})
            parts = []
            if valuation.get("pe"):
                parts.append("PE %.1f" % valuation["pe"])
            if valuation.get("pb"):
                parts.append("PB %.1f" % valuation["pb"])
            if valuation.get("ps"):
                parts.append("PS %.1f" % valuation["ps"])
            if profitability.get("roe"):
                parts.append("ROE %.1f%%" % (profitability["roe"] * 100))
            if growth.get("revenue_yoy"):
                parts.append("Revenue YoY %+.1f%%" % (growth["revenue_yoy"] * 100))
            if parts:
                prompt_parts.append("Fundamentals: %s" % " | ".join(parts))

        earnings_history = content_context.get("earnings_history")
        if earnings_history:
            eps_parts = []
            for eh in earnings_history[:4]:
                if isinstance(eh, dict):
                    q = eh.get("quarter", "")
                    actual = eh.get("eps_actual")
                    est = eh.get("eps_estimate")
                    surprise = eh.get("surprise_percent")
                    eps_parts.append(
                        "%s: EPS $%.2f (est $%.2f, %s%.1f%%)"
                        % (
                            q[:7] if q else "?",
                            actual or 0,
                            est or 0,
                            "+" if (surprise or 0) >= 0 else "",
                            (surprise or 0) * 100,
                        )
                    )
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
            news_titles = [
                n.get("title", "")
                for n in recent_news[:5]
                if isinstance(n, dict) and n.get("title")
            ]
            if news_titles:
                prompt_parts.append("Recent News Headlines:")
                for title in news_titles:
                    prompt_parts.append("- %s" % title[:120])

        prompt_parts.append("")
        prompt_parts.append(
            "The user can see all this data in the right panel (4 tabs: Overview, Earnings, Technical, Market). "
            "Use the available quote, fundamentals, earnings history, technical signals, and recent news above. "
            "Do not assume fields that are not present in the provided context. "
            "If user wants to see a different stock, use the navigate field to switch to that stock's research view."
        )
    elif ctx_type == "daily_report":
        prompt_parts.append(_format_daily_report_context(content_context))
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see the daily report in the right panel. "
            "Answer questions about market news and trends using the report data above. "
            "If the user is interested in a specific stock mentioned in the report, "
            "use the navigate field to switch to that stock's research view."
        )
    elif ctx_type == "morning_report":
        prompt_parts.append(_format_morning_report_context(content_context))
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see the pre-market morning report in the right panel. "
            "Answer questions about overnight news, futures movements, and today's key events "
            "using the report data above. "
            "If the user is interested in a specific stock or sector mentioned in the report, "
            "use the navigate field to switch to that stock's research view."
        )
    elif ctx_type == "twitter_digest":
        prompt_parts.append(_format_twitter_digest_context(content_context))
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see the KOL twitter digest in the right panel. "
            "Answer questions about what tracked KOLs are saying — bull/bear stances on "
            "individual tickers, macro debates, forward-looking watchpoints — using the "
            "digest data above. Cite specific KOL views when relevant; do not invent "
            "stances. If the user wants to dive into a specific ticker mentioned, use the "
            "navigate field to switch to that stock's research view."
        )
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
    elif ctx_type == "macro_liquidity":
        prompt_parts.append("## User is currently viewing: Liquidity Environment")
        nl = content_context.get("net_liquidity")
        if nl is not None:
            prompt_parts.append(
                "Net Liquidity: $%.2fT" % (nl / 1000)
                if nl >= 1000
                else "Net Liquidity: $%.0fB" % nl
            )
        change = content_context.get("net_liquidity_change")
        if change is not None:
            prompt_parts.append("Change: %+.2f%%" % change)
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see liquidity metrics in the right panel. "
            "Answer questions about Fed balance sheet, TGA, RRP, and monetary conditions "
            "using the data above. Default update_results=false."
        )
    elif ctx_type == "macro_economy":
        prompt_parts.append("## User is currently viewing: Economic Fundamentals")
        headline = content_context.get("overall_headline", "")
        if headline:
            prompt_parts.append("Assessment: %s" % headline)
        dims = content_context.get("dimensions", [])
        for d in dims:
            if isinstance(d, dict):
                prompt_parts.append(
                    "- %s: %s (score %.1f/10)"
                    % (d.get("name_zh", ""), d.get("headline", ""), d.get("score", 0))
                )
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see economic indicators in the right panel. "
            "Answer questions about GDP, employment, credit conditions. "
            "Default update_results=false."
        )
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
                    prompt_parts.append(
                        "- %s: YoY %s"
                        % (
                            c.get("name_zh", ""),
                            "%.1f%%" % yoy if yoy is not None else "N/A",
                        )
                    )
        prompt_parts.append("")
        prompt_parts.append(
            "The user can see inflation and rate data in the right panel. "
            "Answer questions about CPI, Fed policy, interest rates. "
            "Default update_results=false."
        )
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

    rendered = "\n".join(part for part in prompt_parts if part is not None).strip()
    return rendered or None


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

        nav_buf: List[Dict[str, Any]] = []
        google_counts: Dict[str, int] = {}
        token_nav = _navigate_buffer.set(nav_buf)
        token_timers = _tool_started_at.set({})
        token_google = _google_search_calls.set(google_counts)

        try:
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

            # Auto-fill navigate from tool calls when the agent omitted it.
            # Prefer screener when this turn updated screening filters/results.
            if not result.get("navigate"):
                auto_nav = _select_auto_navigate(result, nav_buf)
                if auto_nav:
                    result["navigate"] = auto_nav

            # Cleanup session (one-shot, not persistent yet)
            try:
                await self.runner.session_service.delete_session(
                    app_name="stock_picker", user_id="research", session_id=session.id
                )
            except Exception:
                pass

            return result
        finally:
            _navigate_buffer.reset(token_nav)
            _tool_started_at.reset(token_timers)
            _google_search_calls.reset(token_google)

    async def run_stream(
        self,
        prompt: str,
        *,
        retry_prompt_factory=None,
    ):
        """Run agent with SSE streaming. Yields SSE event dicts.

        Tool events are emitted via ADK callbacks (before_tool_callback/after_tool_callback)
        through the _sse_queue ContextVar. This method reads from that queue and yields events.

        On `context_too_long` the stream optionally retries once with a
        shorter prompt obtained from `retry_prompt_factory()`. Mirrors the
        KOL agent's behavior so a single oversized turn doesn't surface as
        a hard error when the conversation can still be saved by shrinking
        history.
        """
        from google.genai import types

        queue: asyncio.Queue = asyncio.Queue()
        nav_buf: List[Dict[str, Any]] = []
        google_counts: Dict[str, int] = {}
        token_queue = _sse_queue.set(queue)
        token_nav = _navigate_buffer.set(nav_buf)
        token_timers = _tool_started_at.set({})
        token_google = _google_search_calls.set(google_counts)

        active_session_id: str | None = None
        # Mutable state filled by _stream_once for each pass so the outer flow
        # can decide whether to retry without losing the streamed events.
        run_state: Dict[str, Any] = {"session_id": None, "error": None}

        async def _stream_once(current_prompt: str):
            """Async generator: yields SSE events in real-time as the agent runs.

            Mirrors the KOL agent pattern — events drain from the queue while
            the agent task is still running so thinking/tool events stream to
            the UI immediately instead of being held until the run finishes.
            Final session_id / error is written into ``run_state``.
            """
            nonlocal active_session_id
            session = await self.runner.session_service.create_session(
                app_name="stock_picker", user_id="research"
            )
            active_session_id = session.id
            run_state["session_id"] = session.id
            run_state["error"] = None
            message = types.Content(
                parts=[types.Part(text=current_prompt)], role="user"
            )
            agent_done = asyncio.Event()
            agent_error: list = []

            # StreamingMode.SSE makes ADK emit partial events with `part.thought`
            # for reasoning-content chunks. DeepSeek V4-Pro streams reasoning and
            # JSON content on separate channels, so the JSON body is buffered as
            # usual while thinking text streams through the SSE queue.
            run_config = RunConfig(streaming_mode=StreamingMode.SSE)

            async def _run_agent():
                try:
                    async for ev in self.runner.run_async(
                        user_id="research",
                        session_id=session.id,
                        new_message=message,
                        run_config=run_config,
                    ):
                        if not (
                            hasattr(ev, "content")
                            and ev.content
                            and ev.content.parts
                        ):
                            continue
                        if not bool(getattr(ev, "partial", False)):
                            # Only forward thinking from partial chunks; the
                            # final aggregated event would re-emit the whole
                            # reasoning blob and double the UI text.
                            continue
                        for part in ev.content.parts:
                            text = getattr(part, "text", None)
                            if not text:
                                continue
                            if getattr(part, "function_call", None) is not None:
                                continue
                            if not bool(getattr(part, "thought", False)):
                                # Non-thought partials are JSON fragments of the
                                # output schema — useless to render, drop them.
                                continue
                            queue.put_nowait({"type": "thinking", "text": text})
                            await asyncio.sleep(0)
                except Exception as e:  # noqa: BLE001
                    agent_error.append(e)
                finally:
                    agent_done.set()

            task = asyncio.create_task(_run_agent())
            while not agent_done.is_set():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.15)
                    yield event
                    if event.get("type") in {
                        "tool_call_start",
                        "tool_call_end",
                        "thinking",
                    }:
                        # Yield control so SSE flushes the event promptly.
                        await asyncio.sleep(0)
                except asyncio.TimeoutError:
                    pass
            while not queue.empty():
                yield queue.get_nowait()
            await task

            run_state["error"] = agent_error[0] if agent_error else None

        async def _delete_session(session_id: str | None) -> None:
            if not session_id:
                return
            try:
                await self.runner.session_service.delete_session(
                    app_name="stock_picker",
                    user_id="research",
                    session_id=session_id,
                )
            except Exception:  # noqa: BLE001
                pass

        async def _extract_parsed(session_id: str) -> Dict[str, Any]:
            session_data = await self.runner.session_service.get_session(
                app_name="stock_picker", user_id="research", session_id=session_id
            )
            parsed: Dict[str, Any] = {}
            if session_data and hasattr(session_data, "state") and session_data.state:
                raw = session_data.state.get("picker", {})
                if isinstance(raw, str):
                    try:
                        parsed = json.loads(raw)
                    except json.JSONDecodeError:
                        parsed = {"message": raw}
                elif isinstance(raw, dict):
                    parsed = raw
            if not parsed.get("navigate"):
                auto_nav = _select_auto_navigate(parsed, nav_buf)
                if auto_nav:
                    parsed["navigate"] = auto_nav
            return parsed

        def _classify(err: BaseException) -> str:
            err_text = str(err).lower()
            if "token" in err_text or "context" in err_text or "too long" in err_text:
                return "context_too_long"
            if "schema" in err_text or "validation" in err_text or "json" in err_text:
                return "model_schema_error"
            return "agent_error"

        try:
            async for event in _stream_once(prompt):
                yield event
            err = run_state["error"]
            session_id = run_state["session_id"]

            if err is not None and _classify(err) == "context_too_long" and retry_prompt_factory is not None:
                logger.warning(
                    "research stream context_too_long: retrying once with shrunk prompt"
                )
                # Reset only the SSE / nav buffers; keep google counts so an
                # already-spent google_search call still counts toward the cap.
                nav_buf.clear()
                await _delete_session(session_id)
                try:
                    shrunk_prompt = await retry_prompt_factory()
                except Exception:  # noqa: BLE001
                    logger.exception("research retry_prompt_factory failed")
                    shrunk_prompt = None
                if shrunk_prompt:
                    async for event in _stream_once(shrunk_prompt):
                        yield event
                    err = run_state["error"]
                    session_id = run_state["session_id"]

            if err is not None:
                if isinstance(err, asyncio.TimeoutError):
                    logger.exception("Research stream timed out")
                    yield {
                        "type": "error",
                        "code": "agent_timeout",
                        "message": "AI 助手思考时间太长了，请再试一次",
                    }
                    return
                logger.exception("Research stream error: %s", err)
                yield {
                    "type": "error",
                    "code": _classify(err),
                    "message": "AI 助手出了点问题，请再试一次",
                }
                return

            parsed = await _extract_parsed(session_id)
            yield {
                "type": "done",
                "parsed": parsed,
            }
        finally:
            _sse_queue.reset(token_queue)
            _navigate_buffer.reset(token_nav)
            _tool_started_at.reset(token_timers)
            _google_search_calls.reset(token_google)
            await _delete_session(active_session_id)

    async def assemble_prompt_context(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        content_context: dict | None = None,
        user_id: str | None = None,
        session: Any = None,
    ) -> AssembledContext:
        """Assemble the actual prompt that will be sent to the Research Agent."""
        watchlist_symbols: list[str] = []
        if user_id:
            try:
                from app.features.brew.db import get_user_watchlist
                watchlist = await get_user_watchlist(user_id)
                if watchlist and watchlist.get("symbols"):
                    watchlist_symbols = watchlist["symbols"]
            except Exception:
                logger.warning("Failed to load watchlist for user %s", user_id[:12] if user_id else "")

        prefix_sections = ["## Current Date: %s" % date.today().isoformat()]
        if watchlist_symbols:
            prefix_sections.append(
                "\n".join(
                    [
                        "## User Watchlist",
                        "User is tracking these stocks: %s"
                        % ", ".join(watchlist_symbols[:30]),
                        (
                            "When relevant, reference their holdings in your analysis. "
                            "Do not force mentions if unrelated to the conversation."
                        ),
                    ]
                )
            )
        if accumulated_filters:
            prefix_sections.append(
                "\n".join(
                    [
                        "## Currently Active Filters",
                        (
                            "These filters are already applied from previous conversation turns. "
                            "Include ALL of them in your output unless the user wants to change direction."
                        ),
                        json.dumps(accumulated_filters, ensure_ascii=False),
                    ]
                )
            )

        assembled = await get_agent_runtime().assemble_context(
            ContextAssemblyRequest(
                message=message,
                history=history or [],
                content_context=content_context,
                session=session,
                history_keep=20,
                char_soft_limit=AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
                budget_plan=default_budget_plan(),
                prefix_sections=prefix_sections,
                content_renderer=_render_research_content_context,
            )
        )
        if assembled.dropped_history:
            logger.info(
                "research prompt history truncated: kept=%d dropped=%d size=%d",
                assembled.kept_history,
                assembled.dropped_history,
                assembled.char_count,
            )
        return assembled

    async def build_prompt(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        content_context: dict | None = None,
        user_id: str | None = None,
        session: Any = None,
    ) -> str:
        """Build the full prompt with ContextEngine budget enforcement."""
        assembled = await self.assemble_prompt_context(
            message=message,
            history=history,
            accumulated_filters=accumulated_filters,
            content_context=content_context,
            user_id=user_id,
            session=session,
        )
        return assembled.prompt

    async def guide(
        self,
        message: str,
        history: List[Dict[str, str]] | None = None,
        accumulated_filters: List[Dict[str, Any]] | None = None,
        universe: list[dict] | None = None,
        content_context: dict | None = None,
        user_id: str | None = None,
        session: Any = None,
        prebuilt_prompt: str | None = None,
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

        prompt = prebuilt_prompt or await self.build_prompt(
            message=message,
            history=history,
            accumulated_filters=accumulated_filters,
            content_context=content_context,
            user_id=user_id,
            session=session,
        )

        logger.info("Research agent message: %s", message[:100])

        from app.core.config import AGENT_RUNTIME_RESEARCH_TIMEOUT_S
        try:
            result = await asyncio.wait_for(
                self._run_session(prompt),
                timeout=AGENT_RUNTIME_RESEARCH_TIMEOUT_S,
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
