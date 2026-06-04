"""KOL Persona Research Agent — qinbafrank-style investment workflow.

Built on ADK's SkillToolset for progressive disclosure of lens-*.md docs.
The orchestrator / overview / cross-cutting docs are always concatenated
into Agent.instruction; lenses are loaded lazily via load_skill tool calls.

Tool set:
  - search_kol_tweets        (KOL RAG; from shared.kol_persona)
  - research_data_tools      (market data; reused from screener)
  - get_report_by_date / list_recent_reports (daily report lookup)
  - GoogleSearchTool         (fallback)

Tools intentionally excluded from the neutral /research set:
  - execute_screener / filter_by_tickers / get_field_distribution / list_available_sectors
    (universe-wide selection is at odds with the analyst's "follow the
    industry chain" approach.)
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import os
import re
import sys
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import InMemoryRunner
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.adk.tools.skill_toolset import SkillToolset
from google.genai import types

from app.core.config import (
    AGENT_RUNTIME_KOL_TIMEOUT_S,
    AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN,
    AGENT_RUNTIME_MAX_KOL_TWEET_SEARCH_PER_TURN,
    AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
    AGENT_RUNTIME_REQUEST_HISTORY,
    AGENT_RUNTIME_TOOL_CACHE_MAXSIZE,
    AGENT_RUNTIME_TOOL_CACHE_TTL,
)
from app.core.logging import get_logger, use_turn_context
from app.features.agent_runtime import (
    AgentRunRequest,
    AgentRuntimeTurn,
    ContextAssemblyRequest,
    default_budget_plan,
)
from app.features.agent_runtime.events import (
    append_turn_events,
    context_budget_truncated_event,
    context_snapshot_event,
    error_event,
    tool_call_events,
)
from app.features.agent_runtime.runtime import get_agent_runtime
from app.features.kol_research.models import (
    KolResearchResponse,
    KolToolCallSummary,
)
from app.features.kol_research.input_guard import (
    InputGuardContext,
    append_data_coverage_warning,
    build_input_guard_context,
    validate_data_coverage,
)
from app.features.screener.research_agent import (
    _recent_reports,
    get_report_by_date,
    list_recent_reports,
)
from app.shared.data_tools.briefs import brief_tools
from app.shared.data_tools.research_tools import get_technical_analysis
from app.shared.kol_persona import (
    Persona,
    build_always_on_instruction,
    build_lens_skills,
    chunk_to_persona_result,
    get_persona,
    persona_chunks_buffer,
    search_kol_tweets,
)
from app.shared.llm_metering import meter

logger = get_logger(__name__)

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
_GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if _GOOGLE_API_KEY and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = _GOOGLE_API_KEY

MODEL = "gemini-3.5-flash"
APP_NAME = "kol_research_agent"
DEFAULT_PERSONA = "qinbafrank"


# ---------------------------------------------------------------------------
# Run-scoped contextvars (set by guide() / run_stream(), cleared on exit)
# ---------------------------------------------------------------------------

_sse_queue: contextvars.ContextVar[Optional[asyncio.Queue]] = contextvars.ContextVar(
    "_kol_research_sse_queue", default=None
)
_activated_skills: contextvars.ContextVar[Optional[List[str]]] = contextvars.ContextVar(
    "_kol_research_activated_skills", default=None
)
_tool_call_log: contextvars.ContextVar[Optional[List[KolToolCallSummary]]] = (
    contextvars.ContextVar("_kol_research_tool_call_log", default=None)
)
_navigate_buffer: contextvars.ContextVar[Optional[List[Dict[str, Any]]]] = (
    contextvars.ContextVar("_kol_research_navigate_buffer", default=None)
)
_tool_started_at: contextvars.ContextVar[Optional[Dict[str, float]]] = (
    contextvars.ContextVar("_kol_research_tool_started_at", default=None)
)
# Hard cap counter: google_search_agent calls per turn. Each call is ~20-30s
# (spawns a sub-agent that fetches and summarizes web pages), so we cap at 1.
_google_search_calls: contextvars.ContextVar[Optional[Dict[str, int]]] = (
    contextvars.ContextVar("_kol_research_google_calls", default=None)
)
_kol_tweet_search_calls: contextvars.ContextVar[Optional[Dict[str, int]]] = (
    contextvars.ContextVar("_kol_research_tweet_search_calls", default=None)
)
# Tool names that ADK exposes for the GoogleSearchTool. ADK currently registers
# the underlying agent transfer under "google_search_agent"; "google_search"
# may appear in older / different code paths.
_GOOGLE_SEARCH_TOOL_NAMES = {"google_search_agent", "google_search"}

# Active conversation id for the in-flight turn (Phase 2). Used as a cache
# scope so tool results survive across turns. None means anonymous / dedup
# only within the current SSE request.
_active_conversation_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_kol_research_conversation_id", default=None
)

# Active user scope for the in-flight turn. Used together with conversation_id
# so two anonymous users never share the same cache scope (would leak personalized
# tool results across requests once any cacheable tool starts depending on user).
_active_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_kol_research_user_id", default=None
)

# LRU+TTL bounded tool result cache keyed by (scope, tool, args_hash). Scope is
# (user_id, conversation_id) so anonymous requests never collide on "".
_TOOL_RESULT_CACHE: "OrderedDict[tuple, tuple[float, Any]]" = OrderedDict()
# Tools that are safe to memoize across turns. Skill loaders, navigation,
# logging and Google search are intentionally excluded — skills/loaders carry
# zero cost on re-call, and google_search has its own per-turn hard cap.
_CACHEABLE_TOOLS = {
    "get_stock_brief",
    "get_peer_brief",
    "get_macro_brief",
    "get_industry_brief",
    "get_technical_analysis",
    "get_report_by_date",
    "list_recent_reports",
    "search_kol_tweets",
}


def _make_cache_key(tool_name: str, args: dict | None) -> tuple | None:
    """Return a cache key, or None if no safe scope is available.

    Refusing to cache when scope is unknown is the safer default: caching at
    a global "" scope would mean two unrelated requests share the same tool
    response, which becomes a cross-tenant leak the moment any cacheable tool
    starts to depend on the calling user.
    """
    conversation_id = _active_conversation_id.get(None)
    user_id = _active_user_id.get(None)
    if not conversation_id and not user_id:
        return None
    try:
        args_blob = json.dumps(args or {}, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:  # noqa: BLE001
        args_blob = str(args)
    return ((user_id or "", conversation_id or ""), tool_name, args_blob)


def _cache_lookup(key: tuple | None) -> Any | None:
    if key is None:
        return None
    entry = _TOOL_RESULT_CACHE.get(key)
    if entry is None:
        return None
    ts, payload = entry
    if (time.monotonic() - ts) > AGENT_RUNTIME_TOOL_CACHE_TTL:
        _TOOL_RESULT_CACHE.pop(key, None)
        return None
    _TOOL_RESULT_CACHE.move_to_end(key)
    return payload


def _cache_store(key: tuple | None, payload: Any) -> None:
    if key is None:
        return
    _TOOL_RESULT_CACHE[key] = (time.monotonic(), payload)
    _TOOL_RESULT_CACHE.move_to_end(key)
    while len(_TOOL_RESULT_CACHE) > AGENT_RUNTIME_TOOL_CACHE_MAXSIZE:
        _TOOL_RESULT_CACHE.popitem(last=False)


def _request_history_for_runtime(history: List[Dict[str, str]] | None) -> list[dict[str, str]]:
    if AGENT_RUNTIME_REQUEST_HISTORY == "disabled":
        return []
    return list(history or [])


def _effective_history_for_prompt(
    *,
    session_history: list[dict[str, str]],
    request_history: List[Dict[str, str]] | None,
) -> list[dict[str, str]]:
    """Pick the history list KOL agent should reason over.

    See screener/router._effective_research_history for the flag semantics —
    same rules apply: "primary" never re-imports request_history when the
    runtime session is empty; "fallback" does; "disabled" drops request
    history at the earlier guard in `_request_history_for_runtime`.
    """
    if session_history:
        return session_history
    if AGENT_RUNTIME_REQUEST_HISTORY == "fallback":
        return list(request_history or [])
    return []


# ---------------------------------------------------------------------------
# Tool descriptions for SSE UI (Chinese)
# ---------------------------------------------------------------------------

_TOOL_DESCRIPTIONS = {
    "load_skill": lambda a: "正在切到 %s 视角..." % a.get("skill_name", "lens"),
    "list_skills": lambda _: "正在浏览可用视角...",
    "search_kol_tweets": lambda a: "正在检索 @%s 的历史观点..."
    % (a.get("author_username") or DEFAULT_PERSONA),
    "get_stock_news": lambda a: "正在查询 %s 的新闻..."
    % ", ".join([str(v) for v in (a.get("symbols") or [])[:3]])
    if a.get("symbols") else "正在查询新闻...",
    "get_stock_quote": lambda a: "正在获取 %s 的行情..."
    % ", ".join([str(v) for v in (a.get("symbols") or [])[:3]])
    if a.get("symbols") else "正在获取行情...",
    "get_technical_analysis": lambda a: "正在分析 %s 的技术面..." % a.get("symbol", ""),
    "get_stock_fundamentals": lambda a: "正在查看 %s 的基本面..." % a.get("symbol", ""),
    "get_earnings_calendar": lambda _: "正在查询财报日历...",
    "get_market_overview": lambda _: "正在获取大盘概况...",
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


def _describe_tool(name: str, args: dict) -> str:
    fn = _TOOL_DESCRIPTIONS.get(name)
    if fn:
        try:
            return fn(args or {})
        except Exception:  # noqa: BLE001
            return "正在处理..."
    return "正在处理..."


# ---------------------------------------------------------------------------
# Tool -> right-panel navigate mapping
# ---------------------------------------------------------------------------

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


def _resolve_navigate(tool_name: str, args: dict) -> Optional[Dict[str, Any]]:
    fn = _TOOL_NAVIGATE.get(tool_name)
    if not fn:
        return None
    try:
        result = fn(args or {})
    except Exception:  # noqa: BLE001
        return None
    if not result:
        return None
    result.setdefault("reason", "auto:%s" % tool_name)
    return result


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------


async def _before_tool_callback(tool, args, tool_context):
    tool_name = getattr(tool, "name", str(tool))
    args = args or {}

    if tool_name == "search_kol_tweets":
        counts = _kol_tweet_search_calls.get(None)
        if counts is not None:
            counts[tool_name] = counts.get(tool_name, 0) + 1
            if counts[tool_name] > AGENT_RUNTIME_MAX_KOL_TWEET_SEARCH_PER_TURN:
                logger.info(
                    "kol_research: blocked extra search_kol_tweets call (count=%d)",
                    counts[tool_name],
                )
                return {
                    "status": "rate_limited",
                    "message": (
                        "search_kol_tweets 本轮已达上限. 基于已召回的历史观点、"
                        "已加载 skill 和已注入/已调用的数据回答. 如果证据不足, "
                        "在答案里说'博主未明确表态'或'需要补充数据'."
                    ),
                }

    # Conversation-scoped tool result cache (Phase 2). Same (conversation, tool,
    # args) within TTL returns the cached payload instead of re-invoking the
    # tool. This is what stops re-fetching get_stock_brief("NVDA") every turn.
    if tool_name in _CACHEABLE_TOOLS:
        cache_key = _make_cache_key(tool_name, args)
        cached = _cache_lookup(cache_key)
        if cached is not None:
            queue_local = _sse_queue.get(None)
            if queue_local is not None:
                queue_local.put_nowait({
                    "type": "tool_call_start",
                    "tool": tool_name,
                    "description": _describe_tool(tool_name, args) + "（命中缓存）",
                })
                queue_local.put_nowait({
                    "type": "tool_call_end",
                    "tool": tool_name,
                    "duration_ms": 0,
                })
            log = _tool_call_log.get(None)
            if log is not None:
                log.append(KolToolCallSummary(
                    name=tool_name,
                    args_summary=_safe_args_summary(args),
                    duration_ms=0,
                    ok=True,
                ))
            return cached

    # Hard cap on google_search: kill the second+ call to keep latency in check.
    if tool_name in _GOOGLE_SEARCH_TOOL_NAMES:
        counts = _google_search_calls.get(None)
        if counts is not None:
            counts[tool_name] = counts.get(tool_name, 0) + 1
            if counts[tool_name] > AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN:
                logger.info(
                    "kol_research: blocked extra google_search call (count=%d)",
                    counts[tool_name],
                )
                # Returning a dict from before_tool_callback short-circuits the
                # tool execution; the LLM sees this as the tool's result.
                return {
                    "status": "rate_limited",
                    "message": (
                        "google_search 本轮已达上限. 基于现有 lens / "
                        "search_kol_tweets / data tool 结果回答, 无需再次搜索. "
                        "如果数据真的不足, 在答案里说'需要补充'."
                    ),
                }

    queue = _sse_queue.get(None)

    # Emit a friendly progress event for the SSE client.
    if queue is not None:
        if tool_name == "load_skill":
            queue.put_nowait({
                "type": "skill_activated",
                "skill_name": args.get("skill_name", ""),
                "description": _describe_tool(tool_name, args),
            })
        else:
            queue.put_nowait({
                "type": "tool_call_start",
                "tool": tool_name,
                "description": _describe_tool(tool_name, args),
            })

    # Track activated skill names for the response payload.
    if tool_name == "load_skill":
        bucket = _activated_skills.get(None)
        if bucket is not None:
            skill = args.get("skill_name")
            if skill and skill not in bucket:
                bucket.append(skill)

    # Record start time for duration measurement.
    timers = _tool_started_at.get(None)
    if timers is not None:
        timers[tool_name] = time.monotonic()

    # Record navigate candidate based on this tool call.
    nav_buf = _navigate_buffer.get(None)
    if nav_buf is not None:
        candidate = _resolve_navigate(tool_name, args)
        if candidate:
            nav_buf.append(candidate)

    return None


async def _after_tool_callback(tool, args, tool_context, tool_response):
    tool_name = getattr(tool, "name", str(tool))
    queue = _sse_queue.get(None)

    duration_ms: Optional[int] = None
    timers = _tool_started_at.get(None)
    if timers is not None and tool_name in timers:
        duration_ms = int((time.monotonic() - timers[tool_name]) * 1000)

    if queue is not None and tool_name != "load_skill":
        queue.put_nowait({
            "type": "tool_call_end",
            "tool": tool_name,
            "duration_ms": duration_ms,
        })

    # Store cacheable tool results so subsequent turns can reuse them.
    if tool_name in _CACHEABLE_TOOLS and tool_response is not None:
        try:
            _cache_store(_make_cache_key(tool_name, args), tool_response)
        except Exception:  # noqa: BLE001 — cache must never break the tool path
            logger.debug("tool cache store failed for %s", tool_name)

    # Log tool calls for response.tool_calls (excluding ADK internals like set_model_response).
    log = _tool_call_log.get(None)
    if log is not None and tool_name not in {"set_model_response"}:
        from app.features.agent_runtime.events import summarize_tool_result
        summary = summarize_tool_result(tool_response)
        log.append(KolToolCallSummary(
            name=tool_name,
            args_summary=_safe_args_summary(args),
            duration_ms=duration_ms,
            ok=True,
            result_preview=summary["preview"],
            result_hash=summary["hash"],
            result_truncated=summary["truncated"],
        ))

    return None


def _safe_args_summary(args: dict | None, *, max_len: int = 120) -> Optional[str]:
    if not args:
        return None
    try:
        text = json.dumps(args, ensure_ascii=False, default=str)
    except Exception:  # noqa: BLE001
        return None
    if len(text) > max_len:
        text = text[:max_len].rstrip() + "..."
    return text


# Server-side fallback: even with prompt constraints, LLM occasionally emits
# concatenated citations like [#3, #5] / [#3,#5] / [#3][#4]. Split into the
# natural "[#3] 和 [#5]" form. Operates on the final aggregated text only;
# streaming partial chunks can split a citation token across chunks, so we
# don't run this on deltas.
_CITATION_CONCAT_RE = re.compile(r"\[#(\d+)((?:[,\s、]+#?\d+)+)\]")
_CITATION_ADJACENT_RE = re.compile(r"(\[#\d+\])(?=\[#\d+\])")
_INTERNAL_COVERAGE_RE = re.compile(
    r"(?i)(?:[`'\"]?coverage[`'\"]?\s*[:=]\s*)[`'\"]?(high|medium|low|none)[`'\"]?"
)
_CODE_SPAN_RE = re.compile(r"`([^`\n]+)`")
_BULLET_BOLD_LABEL_RE = re.compile(r"(?m)^(\s*[*+-]\s+)\*\*([^*\n]{1,40})\*\*([：:])")
_BOLD_RE = re.compile(r"\*\*([^*\n]+)\*\*")
_COVERAGE_LABELS = {
    "high": "博主讨论很充分",
    "medium": "博主有过多次讨论",
    "low": "博主提到较少",
    "none": "博主未直接讨论",
}
_TRADING_PHRASE_REPLACEMENTS = (
    ("视作分批回补仓位的窗口", "视作重新评估仓位风险收益的窗口"),
    ("视作分批建仓的窗口", "视作分批评估的窗口"),
    ("分批回补仓位", "分批评估仓位"),
    ("回补仓位", "重新评估仓位"),
    ("分批建仓", "分批评估"),
    ("再分批建仓", "再分批评估"),
    ("不建议", "不适合"),
    ("应该等待", "更稳的是等待"),
    ("恐慌卖出", "因情绪一次性处理"),
)


def _fix_concat_citations(text: str) -> str:
    """Normalize concatenated citations to the natural "[#a] 和 [#b]" form."""
    def _split_inner(m: re.Match) -> str:
        first = m.group(1)
        rest = re.findall(r"\d+", m.group(2))
        all_nums = [first] + rest
        return " 和 ".join(f"[#{n}]" for n in all_nums)
    text = _CITATION_CONCAT_RE.sub(_split_inner, text)
    text = _CITATION_ADJACENT_RE.sub(r"\1 和 ", text)
    return text


def _sanitize_user_facing_markdown(text: str) -> str:
    """Remove internal metadata and debug-looking markdown from final answers."""
    if not text:
        return text

    def _replace_coverage(m: re.Match) -> str:
        return _COVERAGE_LABELS.get(m.group(1).lower(), "博主讨论覆盖度待确认")

    def _replace_code_span(m: re.Match) -> str:
        token = m.group(1).strip()
        if not token:
            return ""
        if re.fullmatch(r"\$?[A-Z]{1,5}", token):
            return f"`{token}`"
        if re.search(r"\d|[<>=±+*/%$]", token):
            return f"`{token}`"
        return token

    def _cap_bold(match: re.Match) -> str:
        nonlocal bold_count
        bold_count += 1
        if bold_count <= 3:
            return match.group(0)
        return match.group(1)

    text = _INTERNAL_COVERAGE_RE.sub(_replace_coverage, text)
    text = _CODE_SPAN_RE.sub(_replace_code_span, text)
    text = _BULLET_BOLD_LABEL_RE.sub(r"\1\2\3", text)
    for source, target in _TRADING_PHRASE_REPLACEMENTS:
        text = text.replace(source, target)
    bold_count = 0
    return _BOLD_RE.sub(_cap_bold, text)


# ---------------------------------------------------------------------------
# Agent construction (singleton per persona)
# ---------------------------------------------------------------------------

# LONG-TERM TODO: 下面这套"回答框架 / 工具使用 / 输出格式"规则混合了通用脚手架
# (任何 KOL persona 都该遵守) 和 qinbafrank 特定的认知模式 (产业派分析师独有的
# 5 段式推理). 长期方向: 把"产业派回答框架"这种 KOL 特定内容继续沉到
# skill 文件里, 让换 KOL 时框架自动跟着变 (技术派会用形态/均线/量能/
# 突破/止损; 量化派会用因子/backtest/sharpe). 当前只服务 qinbafrank, 一次性
# hardcode 是可接受的简化。

_TOOL_USAGE_RULES = """
# 工具使用规则

**调用顺序 (每次回答都按这个顺序至少走一遍)**:

1. **先调 `load_skill(skill_name=...)`** — 看用户问题命中哪个 lens (stock-analysis / macro / ai-infrastructure / crypto), 加载 1-3 个相关 lens. AI 算力相关同时加载 stock-analysis + ai-infrastructure.

2. **再调 `search_kol_tweets(query=..., author_username="{username}")`** — 看博主过去具体说过什么. 引用必须用 [#N] 编号 + 作者 + 日期.

3. **必须调对应的 brief 拿"当下"数据** — 不调就是只有历史回声的空话. 每个 brief 内部已经并发拉多个数据点, 一次调用就够:
   - 用户问个股 (任何 ticker 出现): **`get_stock_brief(symbol)`** — 一次返回 quote / fundamentals / 历史估值分位 / 7 天新闻 / 公司画像 / 财报日历
   - 需要同行对比: **`get_peer_brief(symbol)`**
   - 需要行业鸟瞰 (大盘 + 同行): **`get_industry_brief(symbol)`**
   - 用户问宏观 / Fed / 利率 / 流动性: **`get_macro_brief()`** — 一次返回风险综述 / 流动性 / 情绪 / 经济日历
   - 用户问最近市场 / 复盘 / 早报: `get_morning_report` / `get_report_by_date` / `list_recent_reports`
   - 用户问 KOL 圈最近在聊什么 / 推特日报 / 多空打架: `get_twitter_digest`
   - 罕见: 技术面 / K 线问题用 `get_technical_analysis` (博主权重低)
   不要分别调 `get_stock_quote` / `get_stock_fundamentals` 等 fine-grained 工具 — 它们已经被 brief 包了, 串行调多次只会浪费时间.

4. **`google_search` — Escape hatch, 通常不应触发**. 仅在**同时满足以下三条**时, 才允许调用一次:
   a) search_kol_tweets 召回 0 条 (博主对该话题完全没讲过)
   b) 所有相关 data tool 都返回"未找到" / "无数据" / 拿不到该标的
   c) 用户问的是博主 4 个 lens (stock / macro / ai-infra / crypto) 之外的话题 (例如日本央行政策细节、欧洲小盘股、新近发生且博主未表态的事件)
   一旦使用 `google_search`, **必须**在答案里显式标注 "以下信息来自 web 搜索, 非博主历史观点", 不要混进博主引用里.
   如果**不**满足以上三条但前面工具仍不够, 不要 google. 直接在答案里说"博主未明确表态, 按方法论推断"或"暂无最新数据, 建议补充", 也不要编造数据.
   注: 代码层会硬限 `google_search` 每轮最多 1 次, 第二次调用会被强制拒绝.

**冲突处理**: lens 框架是判断准则; search_kol_tweets 召回是具体观点; data tool 是当下事实. 三者冲突时显式点出"分歧", 不要藏起来.

**没数据时**: 明确说"需要补充", 不要笼统判断. 不冒充博主本人, 用"按 @{username} 方法论看", 不说"我认为".

# 回答框架 (qinbafrank 产业派的 5 段式)

每次回答按这个顺序展开, 每段都要混合 [lens 框架] + [历史观点 [#N]] + [当下数据], 缺一段就是空话:

### 1. 产业定位
- 这个标的在 qinbafrank 的世界观里属于哪条产业链的哪个位置?
- 主线叙事 (AI 算力 / 稳定币合规化 / etc) 是否仍成立?
- 引博主历史观点 [#N] 佐证产业逻辑

### 2. 当下指标读数 (差异化最强的一段)
- 列出 qinbafrank 关心的特定指标 (RPO 增速 / Capex 比 / 营收-Capex 比 / 产能售罄 / 加权剩余期限 等; 不同 lens 关心的指标见 lens 内容)
- **每个指标必须三栏对照**: 博主关心 X → 历史阈值 / 解读 [#N] → 当前实际数值 (来自 data tool)
- 这段如果只引用历史观点没拉当下数据, 等于完全没回答问题

### 3. 催化剂 & 风险等级
- 近期催化剂 (财报日 / 政策窗口 / 经济数据): 用 calendar 工具拿
- 风险等级化: 小级别 (个位数) / 中级别 (15-20%) / 大级别 (25%+, 需要产业基本面崩塌) — 引博主原话 [#N]
- 当前是"杀估值"还是"杀业绩"还是"杀逻辑"? 这是博主的关键分类, 必须明确归位

### 4. Falsifiability 锚
- 强信念必带可证伪锚 — qinbafrank 真正的指纹
- **必须具体到 指标 + 阈值 + 时间窗**, 不要写"若情况恶化"这种模糊话
- 例: "**若 Q4 RPO 环比 < 15% 或营收/Capex 比 < 3.5, 则长合约时代假设证伪**"

### 5. 操作框架
- 不给精确点位 ("让子弹自己飞")
- 给: 观察清单 + 加减仓阈值 + 仓位心理测试 ("回调 30% 能拿住吗?")
- 仓位匹配认知深度: 拿不住 = 不该重仓 = 不够了解

# 输出格式

- Markdown 简体中文, **目标 800-1500 字** (投研问题, 短了就是糊弄).
- 5 段必须用 `### 1. 产业定位` / `### 2. 当下指标读数` 这种结构化标题, 不要全堆一段.
- **粗体** 全段 1-2 处, 锁定该段核心判断的句子或数字, 不打装饰. 看到第三处 ** 就该自问 "这真重要吗".
- **代码反引号** ` ` 只能包裹:
  (a) 美股 ticker: `NVDA` / `TSLA` / `SPY`
  (b) 含运算符/单位的数值阈值: `10Y > 4.5%` / `PE < 20` / `RPO 增速 < 15%`
  (c) 指标短名: `RPO` / `Capex/Revenue` / `PMI`
  **禁止包裹**: 中文短语 (`业绩兑现` / `确定性` / `兑现`) / 英文名词 (`Macro` / `Capex`) / 整句话 / 形容词. 规则极简: 这个 token 是数据字面量吗? 不是就别用反引号, 用粗体或不强调.
- **表格** (GFM 管道语法) 仅当展示"多维度对照" (≥3 行 × ≥2 列) 时用. 典型: 当下数据 vs 博主原话对照 (列 = 指标 / 博主原话 / 当下值 / 状态). 状态列只填 `已达` / `未达` / `数据走弱` / `数据走强` / `与博主原话一致` / `与博主原话偏离` / `数据待补`. 单维度清单一律用列表, 不要造两列假表格.
- **列表**: 观察清单 / 风险因子 / 触发条件 / 待补数据; ≥3 项才列, 1-2 项写进段落.
- **引用块** `>` : 直接转述博主原话 (一两句) 时用, 紧跟 `— 博主 YYYY/MM/DD [#N]`. 长段落转述用普通段落 + 句末 [#N], 不要套引用块.
- **禁止**: 装饰性 emoji、ASCII 分隔线、嵌套 4 层以上列表、`# / ##` 一级二级标题 (与气泡视觉撞).
- 长度不达标或缺段 = 没用尽工具, 重新组织.
"""


# ---------------------------------------------------------------------------
# 当前 Frank skill loader 使用这套更松散的指令
# ---------------------------------------------------------------------------

_SKILL_TOOL_USAGE_RULES = """
# 工具使用规则

每次回答按这个顺序走:

1. **先看用户问什么类型的问题, 加载对应的 framework skill** (拿到这类问题"必须包含的动作"清单, 不是骨架):

   | 问题类型 | 触发关键词 | 加载 framework |
   |---|---|---|
   | 个股观点 | ticker / 公司中文名 + 怎么看 / 估值 / 财报 / 加仓 / 顶 / 底 | `framework-ask-about-stock` |
   | 产业板块 | AI 算力 / HBM / 稳定币 / 太空 / SaaS / 物理 AI + 板块 / 看好 / 阶段 | `framework-ask-about-sector` |
   | 宏观判断 | Fed / 降息 / CPI / 流动性 / 大顶 / 地缘 / 关税 / TACO | `framework-ask-about-macro` |
   | 新闻事件 | 新闻 / 消息 / 利好利空 / 怎么看这个新闻 / 对 X 影响 | 先判断影响对象: 个股用 stock, 产业用 sector, 宏观用 macro |
   | 方法论 / 概念 | 什么是 / 怎么判断 / 如何决策 / 为什么 / 是什么意思 | `framework-ask-about-method` |
   | Veto 类 | meme / 梭哈 / all in / 做空 / 抄底烂 / 一把梭 / 短炒 / 赌 | `framework-ask-about-veto` |
   | 比较选择 | 还是 / vs / 对比 / 哪个 / 选谁 / 二选一 | `framework-ask-to-compare` |

   边界 case 你自己判断. 通常 1 个 framework 就够; 跨类问题最多 2 个.

2. **再加载对应的内容 skill** (拿到博主对具体主题的看法):
   - 个股问题 → `ticker-<TICKER>` (例: `ticker-nvda`, `ticker-mrvl` 是 marker)
   - 产业问题 → `sector-<name>` (`sector-ai-infrastructure` / `sector-crypto-stablecoin-rwa` / `sector-defense-and-space` / `sector-power-and-physical-ai` / `sector-semiconductor-memory-hbm` / `sector-software-ai-disruption` / `sector-fintech-brokerage`)
   - 宏观问题 → core 和 macro 已经在 system prompt 里, 通常不需要再 load
   - 方法论 / Veto / 比较 → 通常 framework + core 就够, 按需加 sector / ticker

3. **调 `search_kol_tweets(query=..., author_username="{username}")`** 找博主历史原话. 引用必须用 [#N] 编号 + 作者 + 日期.

4. **调对应的 brief 拿"当下"数据** (除非是方法论 / Veto 类不需要数据; 比较类只要涉及可交易标的也要拿当前数据):
   - 个股: `get_stock_brief(symbol)`
   - 同行对比: `get_peer_brief(symbol)`
   - 行业鸟瞰: `get_industry_brief(symbol)`
   - 宏观 / Fed / 利率 / 流动性: `get_macro_brief()`
   - 早报: `get_report_by_date` / `list_recent_reports`
   - 技术面 (罕见): `get_technical_analysis`
   不要调 fine-grained 工具, brief 内部已并发拉数据.

5. **`google_search` 是 escape hatch**, 仅在同时满足三条时调用一次:
   a) search_kol_tweets 召回 0 条
   b) 所有 data tool 返回无数据
   c) 话题超出 skill 覆盖范围
   调用后在答案显式标注 "以下信息来自 web 搜索, 非博主历史观点".

# 回答模式 (用户格式优先)

先看 `Deterministic Input Guard` 里的 `parsed_input.response_hints`, 再结合用户原话选择回答模式。用户明确要求的格式优先于任何默认框架。

| Mode | 触发 | 用户可见形态 |
|---|---|---|
| `direct_short` | `requested_brevity=true`, "只答两句 / 只选一只 / 简单说" | 直接结论 + 1-3 个理由; 不要四段标题 |
| `normal_explain` | 默认"怎么看 / 是否还成立 / 利好利空" | 白话结论 → Frank 会先问什么 → 历史观点与当下事实 → 观察/打脸信号 |
| `deep_research` | 用户明确要详细、深度、表格、对照 | 可分段、可表格, 但仍先给白话结论 |
| `method_teach` | `question_shape=method` | 先用大白话解释概念, 再给一个例子和可复用 checklist |
| `latest_take` | `question_shape=latest` | 最近直接观点优先; 没有最近直接观点就明说, 再退回方法论推断 |
| `no_coverage` | RAG 无直接覆盖 / ticker 弱覆盖 | 先说覆盖不足, 再说明只能按 sector/core 方法论推断 |

禁止为了完整而强行输出固定的 `结论 / Frank 过往观点 / 现状 / 总结` 四段。只有用户要长文、或问题确实需要清楚分离历史观点和当前事实时, 才使用这些标题。

# 默认回答顺序

1. **第一句直接白话回答用户的问题**: 更像机会、风险、等待确认、分歧未决, 还是 Frank 没直接覆盖。
2. **马上说 Frank 会先问哪几个问题**: 例如"不是先看 PE, 而是先看需求有没有断、瓶颈还在不在、什么数据会打脸"。
3. **分清三种来源**:
   - 历史观点: 只能来自 `search_kol_tweets`, 用 `[#N]` 引用, 写清日期/当时场景。
   - 当前事实: 只能来自 `prefetched_data` / brief tool / report tool / 明确披露的 web 搜索。
   - 方法论推断: 没有直接观点时, 写成"按 @{username} 方法论推断", 不装成博主最新表态。
4. **最后给确认/打脸信号**: 每个信号都要说明"变了以后意味着什么", 不要只列观察清单。

# Frank 框架必须可感知

每个 stock / sector / macro / compare 回答至少体现下面 2 个元素:

- 产业链位置: 这只票/产业在链条哪一层, 瓶颈在哪里。
- 三杀分类: 当前更像杀估值、杀业绩, 还是杀逻辑。
- 可证伪锚: 什么事实出现后, 原来的判断必须下修。
- 风险等级: 小级别扰动、中级别调整、大级别风险, 并解释成普通话。
- 能力圈 / Veto: 这是不是 Frank 框架内的问题, 是否触发不碰原则。

# 白话纪律

- **禁止专业名词堆叠**. `TGA` / `RRP` / `SOFR` / `RPO` / `Capex` 这类词出现时, 必须在同一句或下一句翻译成普通投资者能理解的机制语言。
- 常用翻译:
  - 杀估值 = 公司故事没坏, 市场只是嫌贵。
  - 杀业绩 = 订单、收入、利润或增速真的开始变差。
  - 杀逻辑 = 原来相信的产业故事被事实推翻。
  - RPO = 已签但还没交付、未来可能转成收入的订单。
  - Capex = 大客户愿不愿意继续掏钱建基础设施。
  - 流动性 = 市场里愿意追风险资产的钱是不是变多。
  - 打脸条件 = 什么事实出现后, 原来的判断必须认错。
- 不要把 "因果链" / "场景树" / "Thesis 证伪条件" / "coverage" / "high/medium/low/none" 当标题或正文标签写给用户。

# 通用纪律 (跨所有 framework 必须遵守)

- **不假冒博主本人**. 用"按 @{username} 方法论看", 不说"我认为"。
- **没数据时**明确说"需要补充", 不要编造数字。
- **不预测精确点位 / 不预测 Fed 节奏 / 不喊大顶大底崩盘** — 博主语言指纹。
- **冲突处理**: skill 框架是判断准则; search_kol_tweets 是历史观点; data tool / web 是当下事实. 三者冲突时显式点出"分歧"。
- **禁用词**: all in / 梭哈 / 必涨 / 保底 / 稳赚 / 财富自由 / 猛干 / 绝对崩盘。
- **任何具体阈值/数字必须来自 search_kol_tweets 召回的博主原话或 data tool 的当前数据**. 来源是历史原话时写清"博主当时说"; 来源是当前数据时写清"截至本轮可用数据". 没来源就标"博主未给具体数字"或"数据待补", 不要编。
- **开场禁止引言句**: 直接给观点 / 转述博主评价. 禁用 "拆解为几个维度" / "以下为分析" / "可以从几个方面看" / "下面展开" / "可以从以下几点看" 这类填表式开场。

# 引用规则 [#N] (硬性约束)

- 只能引用 **search_kol_tweets 工具本轮实际返回过的 [#N] 编号**. 工具结果里会显式告诉你 "Valid citation range: [#X] ~ [#Y]", 严格在这范围内引.
- **不要瞎编引用号** (例如 [#11]、[#44] 这种你从没在工具返回里见过的编号). 用户看到的中间稿会先于最终 strip 出现, 所以即使后端会 fallback 删掉, 仍要尽量从源头不写错号.
- **未调 search_kol_tweets 之前不要写 [#N]**. 想引用就先 search, 拿到编号再引.
- 引用号不连写多个: 用 `[#3]` 而不是 `[#3][#4]`; 多个来源用 `[#3] 和 [#4]` 这种自然句式.
- 引用必须有具体含义: 不要句尾随手挂 `[#11]` 当装饰, 要么佐证一个具体论点, 要么省略.

# 策展人模式 (全 framework 默认生效)

你是博主观点的**策展人**, 不是博主代言人, 也不是判断者. 所有 framework 默认遵守这套约束 (method / veto 因为本身就是转述博主立场, 天然适用; stock / sector / macro / compare 风险更高, 务必严守):

- **主语锁博主**. 用 "博主说过 / 博主认为 / 博主关心 / 博主多次强调". **禁用**: "我看多 X / 我看空 X" / "博主框架下能买 / 不能买" / "建议加仓 / 减仓" / "产业看好 / 板块见顶".
- **可以给散户可用含义, 但必须条件化**. 允许说"如果 X 信号未出现, 更适合观察/等待确认"; 禁止说"应该买/应该卖/可以加仓".
- **交易措辞降级**. 不要用 "建议买入 / 建议卖出 / 应当布局 / 持有是合理的 / 坚决降低 / 回补仓位" 这种像投顾指令的话. 改成 "可以把 X 当作继续观察条件" / "这更像风险复核信号" / "不适合只凭单一叙事加大暴露".
- **不主动扩写无关交易剧本**. 如果需要给路径分叉, 只画与用户问题直接相关的基准 / 升级 / 缓和路径, 不把未发生场景定性成事实.
- **如果你选用对照表**展示当下数据 vs 博主原话, 对照列只能填以下机械事实词:
  - 允许: `已达` / `未达` / `数据走弱` / `数据走强` / `与博主原话一致` / `与博主原话偏离` / `数据待补`
  - 禁用: `看多` / `看空` / `仍成立` / `已破` / `已触发` / `已证伪` / `加仓` / `减仓` / `风险升高` / `接近触发` / `框架成立`
- 安全护栏: 博主历史推文是过去某一时点的立场, 中间可能出过新事件博主已悄悄改了立场 —— 你不知道. 你只摆 "博主当时说过 X + 当下数据是 Y", 让用户自己拼接结论.

# 输出格式

- Markdown 简体中文; 段落自然语言为主, 别填表.
- 不要使用 `# / ##` 一级二级标题。短答通常不需要标题; 普通解释最多用 2-3 个短标题; 深度研究才使用多段标题。
- 长度由问题深度决定: 短答 80-260 字; 普通解释 300-700 字; 深度投研问题 800-1500 字。
- **粗体** 全篇最多 3 处; 散户短问最多 1 处. 只加粗真正的结论或打脸信号, 不给每个小标题、每条 bullet、普通形容词加粗.
- **代码反引号** ` ` 只能包裹:
  (a) 用户问到的美股 ticker: `NVDA` / `TSLA` / `SPY`
  (b) 含运算符/单位的数值阈值: `10Y > 4.5%` / `PE < 20` / `RPO 增速 < 15%`
  **禁止包裹**: 中文短语、产品名、普通指标名、公司名、英文名词、整句话、形容词. 例如 Blackwell / Rubin / Revenue YoY / Forward PE / Gross Margin / Capex 都不要加反引号.
- **内部标签禁止外露**: 不输出 `coverage: high`、`parent_sector`、`marker`、skill 文件名、frontmatter 字段名. 需要表达覆盖度时写成人话: "博主对这只票讨论很多 / 讨论不多 / 没有直接讨论".
- **表格** 仅当用户明确要"数据对照 / 详细表格", 或确实有 ≥4 个独立指标需要同屏比较时才用. 散户短问、thesis 是否成立、能买吗/要卖吗/持有吗这几类问题禁止用表格, 包括 GFM 管道表、空格对齐表、"指标对照表"小节. 如果用了表格, 列名要像给普通投资者看的语言, 不要出现 "状态" 这种机械列; 最后一列用 "怎么理解".
- **列表**: 观察清单 / 风险因子 / 触发条件 / 待补数据; ≥3 项才列, 1-2 项写进段落.
- **引用块** `>` : 直接转述博主原话 (一两句) 时用, 紧跟 `— 博主 YYYY/MM/DD [#N]`. 长段落转述用普通段落 + 句末 [#N], 不要套引用块.
- **禁止**: 装饰性 emoji、ASCII 分隔线、嵌套 4 层以上列表.

# skill 来源

当前加载 Frank skill 资产:
- core/operating-system + macro/macro-regime 已注入此 prompt (always-on)
- 6 个 framework + 7 sector + 32 ticker playbook + 1 marker 通过 load_skill 按需加载
"""


def _build_instruction(persona: Persona) -> str:
    always_on = build_always_on_instruction(persona)
    tool_rules = _SKILL_TOOL_USAGE_RULES.format(username=persona.username)
    header = (
        f"你是 TheMarketBrew 的投研助手 (KOL 视角)，"
        f"正在用 @{persona.username} 的公开方法论 skill 系统看市场。\n"
        f"**绝不能声称自己就是 @{persona.username}**。\n\n"
    )
    return f"{header}{always_on}\n\n{tool_rules}"


def _build_tools(persona: Persona) -> list:
    skill_toolset = SkillToolset(skills=build_lens_skills(persona))
    # Brief-level tools (briefs.py) are used in place of fine-grained
    # research_data_tools. Each brief bundles 4-6 underlying FMP calls via
    # asyncio.gather, matching the analyst's "give me the whole picture"
    # thinking unit instead of the LLM having to chain 6-8 serial tool calls.
    # The neutral /research agent still uses fine-grained tools — they coexist.
    #
    # GoogleSearchTool is kept as last-resort web search, heavily rate-limited:
    # - Instruction tells LLM it's ONLY for "external info our tools can't reach"
    # - before_tool_callback enforces a hard cap of 1 call per turn
    # - Each call is ~20-30s (Gemini built-in grounding fetches + summarizes web)
    return [
        skill_toolset,
        search_kol_tweets,
        *brief_tools,                # get_stock_brief / get_peer_brief / get_macro_brief / get_industry_brief
        get_technical_analysis,      # kept fine-grained (rarely used, but escape hatch when K-line matters)
        get_report_by_date,
        list_recent_reports,
        GoogleSearchTool(bypass_multi_tools_limit=True),
    ]


_agent_cache: Dict[str, LlmAgent] = {}


def get_agent(persona_username: str = DEFAULT_PERSONA) -> LlmAgent:
    """Get or build the LlmAgent for a persona. Cached per persona username."""
    if persona_username in _agent_cache:
        return _agent_cache[persona_username]

    persona = get_persona(persona_username)
    if persona is None:
        raise ValueError(f"Unknown persona: {persona_username!r}")

    # Enable Gemini's built-in thinking output so the agent emits `thought=True`
    # parts during the response stream; the frontend uses them to render a
    # collapsible "思考过程" section under each KOL answer.
    gen_config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(include_thoughts=True),
    )
    agent = LlmAgent(
        name="kol_research_agent",
        model=MODEL,
        instruction=_build_instruction(persona),
        tools=_build_tools(persona),
        generate_content_config=gen_config,
        before_tool_callback=_before_tool_callback,
        after_tool_callback=_after_tool_callback,
        after_model_callback=meter("kol_research", model=MODEL),
    )
    _agent_cache[persona_username] = agent
    return agent


# ---------------------------------------------------------------------------
# Prompt builder (mirrors ResearchAgent.build_prompt — content_context + history)
# ---------------------------------------------------------------------------

async def _build_prompt(
    *,
    message: str,
    history: List[Dict[str, str]] | None = None,
    content_context: Dict[str, Any] | None = None,
    input_guard: InputGuardContext | None = None,
    history_keep: int = 12,
) -> str:
    assembled = await get_agent_runtime().assemble_context(
        ContextAssemblyRequest(
            message=message,
            history=history or [],
            content_context=content_context,
            input_guard_section=input_guard.prompt_section if input_guard else None,
            history_keep=history_keep,
            char_soft_limit=AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
            budget_plan=default_budget_plan(),
        )
    )
    if assembled.dropped_history:
        logger.info(
            "kol prompt history truncated: kept=%d dropped=%d size=%d",
            assembled.kept_history,
            assembled.dropped_history,
            assembled.char_count,
        )
    return assembled.prompt


async def _prepare_runtime_context(
    *,
    message: str,
    history: List[Dict[str, str]] | None,
    persona_username: str,
    content_context: Dict[str, Any] | None,
    conversation_id: str | None,
    user_id: str | None,
    turn_id: str | None = None,
    history_keep: int = 12,
) -> tuple[AgentRuntimeTurn, InputGuardContext, str, list[dict[str, str]]]:
    runtime = get_agent_runtime()
    runtime_request = AgentRunRequest(
        agent_id=APP_NAME,
        user_id=user_id,
        session_id=conversation_id,
        message=message,
        history=_request_history_for_runtime(history),
        content_context=content_context,
        metadata={
            "agent_kind": "kol_research",
            "persona_username": persona_username,
        },
        turn_id=turn_id,
    )
    session = await runtime.load_session(runtime_request)
    effective_history = _effective_history_for_prompt(
        session_history=session.chat_history(),
        request_history=history,
    )
    input_guard = await build_input_guard_context(
        message=message,
        content_context=content_context,
        history=effective_history,
    )
    assembled = await runtime.assemble_context(
        ContextAssemblyRequest(
            message=message,
            history=effective_history,
            content_context=content_context,
            input_guard_section=input_guard.prompt_section,
            session=session,
            history_keep=history_keep,
            char_soft_limit=AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
            budget_plan=default_budget_plan(),
        )
    )
    if assembled.dropped_history:
        logger.info(
            "kol prompt history truncated: kept=%d dropped=%d size=%d",
            assembled.kept_history,
            assembled.dropped_history,
            assembled.char_count,
        )
    turn = AgentRuntimeTurn(
        request=runtime_request,
        session=session,
        assembled_context=assembled,
    )
    return turn, input_guard, assembled.prompt, effective_history


# ---------------------------------------------------------------------------
# Pre-load recent reports for get_report_by_date / list_recent_reports
# ---------------------------------------------------------------------------

async def _preload_recent_reports() -> None:
    try:
        from app.features.daily_report.db import list_reports
        result = await list_reports(limit=7, offset=0)
        _recent_reports.set(result.get("data", []) if result else [])
    except Exception:  # noqa: BLE001
        logger.warning("Failed to preload recent reports")
        _recent_reports.set([])


# ---------------------------------------------------------------------------
# Public run API
# ---------------------------------------------------------------------------

async def _run_session(
    *,
    agent: LlmAgent,
    runner: InMemoryRunner,
    prompt: str,
) -> str:
    """Run one turn, return collected markdown text.

    Side effect: while running, pushes `message_delta` and `thinking` events
    onto the SSE queue (if set by the caller via `_sse_queue`). This lets the
    frontend render token-by-token streaming + chain-of-thought.
    """
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id="kol_research"
    )
    message = types.Content(parts=[types.Part(text=prompt)], role="user")

    queue = _sse_queue.get(None)
    final_text_parts: list[str] = []
    # ADK requires explicit StreamingMode.SSE to get partial text chunks.
    # Default is StreamingMode.NONE which only yields final aggregated events
    # — that's why typewriter streaming wasn't working before.
    run_config = RunConfig(streaming_mode=StreamingMode.SSE)
    started_at = time.monotonic()
    adk_events = 0
    partial_chunks = 0
    final_chunks = 0
    logger.info("_run_session start: prompt_chars=%d", len(prompt))
    cancelled = False
    try:
        async for event in runner.run_async(
            user_id="kol_research",
            session_id=session.id,
            new_message=message,
            run_config=run_config,
        ):
            adk_events += 1
            if not (hasattr(event, "content") and event.content and event.content.parts):
                continue
            is_partial = bool(getattr(event, "partial", False))
            # Avoid duplicate-text issue (ADK doc Option A): only forward
            # partial events to the SSE queue; final aggregated events are
            # used solely to accumulate final_text_parts for the response.
            for part in event.content.parts:
                text = getattr(part, "text", None)
                if not text:
                    continue
                # Skip function-call parts (LLM emits these as partial too).
                has_fc = getattr(part, "function_call", None) is not None
                if has_fc:
                    continue
                is_thought = bool(getattr(part, "thought", False))
                if is_thought:
                    if queue is not None and is_partial:
                        queue.put_nowait({"type": "thinking", "text": text})
                    continue
                if is_partial:
                    partial_chunks += 1
                    if queue is not None:
                        queue.put_nowait({"type": "message_delta", "text": text})
                        await asyncio.sleep(0)
                else:
                    # Final aggregated text — use as the canonical answer body
                    # (partial chunks may have lost some structure during stream
                    # buffering, so we trust the aggregated version for the
                    # final_text used in KolResearchResponse).
                    final_chunks += 1
                    final_text_parts.append(text)
    except asyncio.CancelledError:
        cancelled = True
        raise
    finally:
        elapsed = time.monotonic() - started_at
        total_final = sum(len(p) for p in final_text_parts)
        logger.info(
            "_run_session end: cancelled=%s elapsed=%.2fs adk_events=%d "
            "partial_chunks=%d final_chunks=%d final_text_chars=%d",
            cancelled, elapsed, adk_events, partial_chunks, final_chunks, total_final,
        )
        try:
            await runner.session_service.delete_session(
                app_name=APP_NAME,
                user_id="kol_research",
                session_id=session.id,
            )
        except Exception:  # noqa: BLE001
            pass

    text = _fix_concat_citations("".join(final_text_parts).strip())
    return _sanitize_user_facing_markdown(text)


async def answer_kol_research(
    *,
    message: str,
    history: List[Dict[str, str]] | None = None,
    persona_username: str = DEFAULT_PERSONA,
    content_context: Dict[str, Any] | None = None,
    conversation_id: str | None = None,
    user_id: str | None = None,
    turn_id: str | None = None,
    timeout: float | None = None,
) -> KolResearchResponse:
    """Unary entry — runs the agent and returns a complete response."""
    if timeout is None:
        timeout = AGENT_RUNTIME_KOL_TIMEOUT_S
    chunks_buf: List = []
    skills_buf: List[str] = []
    tool_log: List[KolToolCallSummary] = []
    nav_buf: List[Dict[str, Any]] = []
    timers: Dict[str, float] = {}

    token_chunks = persona_chunks_buffer.set(chunks_buf)
    token_skills = _activated_skills.set(skills_buf)
    token_log = _tool_call_log.set(tool_log)
    token_nav = _navigate_buffer.set(nav_buf)
    token_timers = _tool_started_at.set(timers)
    google_counts: Dict[str, int] = {}
    token_google = _google_search_calls.set(google_counts)
    kol_search_counts: Dict[str, int] = {}
    token_kol_search = _kol_tweet_search_calls.set(kol_search_counts)
    token_conv = _active_conversation_id.set(conversation_id)
    token_user = _active_user_id.set(user_id)
    turn_ctx = use_turn_context(
        turn_id=turn_id,
        session_id=conversation_id,
        agent_id=APP_NAME,
    )
    turn_ctx.__enter__()

    try:
        await _preload_recent_reports()
        agent = get_agent(persona_username)
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
        runtime_turn, input_guard, prompt, _effective_history = await _prepare_runtime_context(
            message=message,
            history=history,
            persona_username=persona_username,
            content_context=content_context,
            conversation_id=conversation_id,
            user_id=user_id,
            turn_id=turn_id,
        )

        try:
            text = await asyncio.wait_for(
                _run_session(agent=agent, runner=runner, prompt=prompt),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.error("kol_research timed out for: %s", message[:100])
            text = "AI 助手思考时间太长了，请再试一次。如果持续超时，可以简化一下问题。"
            await append_turn_events(
                runtime_turn,
                metadata={
                    "agent_kind": "kol_research",
                    "persona_username": persona_username,
                },
                events=[
                    error_event(
                        code="agent_timeout",
                        stage="model_run",
                        message=text,
                    )
                ],
            )
        missing_data = validate_data_coverage(
            input_guard.parsed,
            fulfilled_tool_keys=input_guard.fulfilled_tool_keys,
            tool_calls=tool_log,
        )
        text = append_data_coverage_warning(text, missing_data)
        await get_agent_runtime().complete_turn(
            runtime_turn,
            assistant_text=text,
            metadata={
                "agent_kind": "kol_research",
                "persona_username": persona_username,
            },
        )
        unary_events: list[dict[str, Any]] = [
            context_snapshot_event(runtime_turn),
            *tool_call_events(tool_log),
        ]
        unary_budget_event = context_budget_truncated_event(runtime_turn)
        if unary_budget_event is not None:
            unary_events.append(unary_budget_event)
        await append_turn_events(
            runtime_turn,
            metadata={
                "agent_kind": "kol_research",
                "persona_username": persona_username,
            },
            events=unary_events,
        )

        # Final navigate: last candidate wins.
        navigate = nav_buf[-1] if nav_buf else None

        kol_chunks = [
            chunk_to_persona_result(c, citation_index=i + 1)
            for i, c in enumerate(chunks_buf)
        ]

        return KolResearchResponse(
            persona_username=persona_username,
            message=text,
            kol_chunks=kol_chunks,
            activated_skills=skills_buf,
            tool_calls=tool_log,
            navigate=navigate,
        )
    finally:
        persona_chunks_buffer.reset(token_chunks)
        _activated_skills.reset(token_skills)
        _tool_call_log.reset(token_log)
        _navigate_buffer.reset(token_nav)
        _tool_started_at.reset(token_timers)
        _google_search_calls.reset(token_google)
        _kol_tweet_search_calls.reset(token_kol_search)
        _active_conversation_id.reset(token_conv)
        _active_user_id.reset(token_user)
        turn_ctx.__exit__(None, None, None)


async def stream_kol_research(
    *,
    message: str,
    history: List[Dict[str, str]] | None = None,
    persona_username: str = DEFAULT_PERSONA,
    content_context: Dict[str, Any] | None = None,
    conversation_id: str | None = None,
    user_id: str | None = None,
    turn_id: str | None = None,
    timeout: float | None = None,
):
    """SSE generator — yields events:

      {"type": "skill_activated", "skill_name": ..., "description": ...}
      {"type": "tool_call_start", "tool": ..., "description": ...}
      {"type": "tool_call_end", "tool": ..., "duration_ms": ...}
      {"type": "thinking", "text": "..."}            # chain-of-thought chunk
      {"type": "message_delta", "text": "..."}       # incremental answer text
      {"type": "final", "data": KolResearchResponse-dict}
      {"type": "error", "error": "..."}

    Internally the agent run is launched in a background task; this generator
    forwards events from a contextvar queue until the agent finishes.
    """
    if timeout is None:
        timeout = AGENT_RUNTIME_KOL_TIMEOUT_S
    queue: asyncio.Queue = asyncio.Queue()
    chunks_buf: List = []
    skills_buf: List[str] = []
    tool_log: List[KolToolCallSummary] = []
    nav_buf: List[Dict[str, Any]] = []
    timers: Dict[str, float] = {}

    token_queue = _sse_queue.set(queue)
    token_chunks = persona_chunks_buffer.set(chunks_buf)
    token_skills = _activated_skills.set(skills_buf)
    token_log = _tool_call_log.set(tool_log)
    token_nav = _navigate_buffer.set(nav_buf)
    token_timers = _tool_started_at.set(timers)
    google_counts: Dict[str, int] = {}
    token_google = _google_search_calls.set(google_counts)
    kol_search_counts: Dict[str, int] = {}
    token_kol_search = _kol_tweet_search_calls.set(kol_search_counts)
    token_conv = _active_conversation_id.set(conversation_id)
    token_user = _active_user_id.set(user_id)
    turn_ctx = use_turn_context(
        turn_id=turn_id,
        session_id=conversation_id,
        agent_id=APP_NAME,
    )
    turn_ctx.__enter__()

    # Entry log — appears in /tmp/uvicorn-frank.log before the agent does any work.
    # If you grep "kol chat request" and don't see this line for a failing turn,
    # the request never reached the agent (frontend bug, middleware reject, or
    # backend reload between accept and dispatch).
    logger.info(
        "kol chat request: persona=%s message=%r history_len=%d context=%s",
        persona_username,
        message[:120],
        len(history or []),
        "yes" if content_context else "no",
    )
    stream_started_at = time.time()
    runtime_turn: AgentRuntimeTurn | None = None
    completed_normally = False

    try:
        await _preload_recent_reports()
        agent = get_agent(persona_username)
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
        runtime_turn, input_guard, prompt, effective_history = await _prepare_runtime_context(
            message=message,
            history=history,
            persona_username=persona_username,
            content_context=content_context,
            conversation_id=conversation_id,
            user_id=user_id,
            turn_id=turn_id,
        )

        agent_done = asyncio.Event()
        agent_text: list[str] = []
        agent_error: list[BaseException] = []
        retry_attempted = False

        async def _run(prompt_to_run: str):
            try:
                text = await asyncio.wait_for(
                    _run_session(agent=agent, runner=runner, prompt=prompt_to_run),
                    timeout=timeout,
                )
                agent_text.append(text)
            except BaseException as e:  # noqa: BLE001 — propagate after queue drain
                agent_error.append(e)
            finally:
                agent_done.set()

        task = asyncio.create_task(_run(prompt))

        # Drain the SSE queue while the agent is running.
        while not agent_done.is_set():
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.15)
                yield event
                if event.get("type") in {
                    "tool_call_start",
                    "skill_activated",
                    "message_delta",
                    "thinking",
                }:
                    # Yield control so SSE flushes the event promptly.
                    await asyncio.sleep(0)
            except asyncio.TimeoutError:
                pass

        # Drain remaining events.
        while not queue.empty():
            yield queue.get_nowait()

        await task

        if agent_error:
            err = agent_error[0]
            elapsed = time.time() - stream_started_at
            if isinstance(err, asyncio.TimeoutError):
                logger.warning(
                    "kol chat timeout: persona=%s elapsed=%.1fs limit=%ss",
                    persona_username, elapsed, timeout,
                )
                if runtime_turn is not None:
                    await append_turn_events(
                        runtime_turn,
                        metadata={
                            "agent_kind": "kol_research",
                            "persona_username": persona_username,
                        },
                        events=[
                            error_event(
                                code="agent_timeout",
                                stage="model_run",
                                message="AI 助手思考时间太长了，请再试一次",
                            )
                        ],
                    )
                yield {
                    "type": "error",
                    "code": "agent_timeout",
                    "error": "AI 助手思考时间太长了，请再试一次",
                }
                completed_normally = True
                return
            err_text = str(err).lower()
            if "token" in err_text or "context" in err_text or "too long" in err_text:
                code = "context_too_long"
            elif "schema" in err_text or "validation" in err_text or "json" in err_text:
                code = "model_schema_error"
            else:
                code = "agent_error"

            # Phase 2.3 — automatic retry once on context_too_long with the
            # history aggressively shrunk. The first attempt already used the
            # token budget guard; if we still blew the limit, the only safe
            # move is to drop most of the history and let the live exchange
            # rerun. Skip retry for other error codes — they aren't fixed by
            # rebuilding the prompt.
            if code == "context_too_long" and not retry_attempted:
                retry_attempted = True
                logger.warning(
                    "kol chat context_too_long: retrying once with shrunk history (was %d turns)",
                    len(effective_history or []),
                )
                # Reset state for the retry attempt: drain residual events,
                # clear errors, reset the agent_done flag, drop deepest history.
                agent_error.clear()
                agent_done.clear()
                shrunk_history = (effective_history or [])[-2:]
                shrunk_prompt = await _build_prompt(
                    message=message,
                    history=shrunk_history,
                    content_context=content_context,
                    input_guard=input_guard,
                    history_keep=2,
                )
                task = asyncio.create_task(_run(shrunk_prompt))
                while not agent_done.is_set():
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=0.15)
                        yield event
                    except asyncio.TimeoutError:
                        pass
                while not queue.empty():
                    yield queue.get_nowait()
                await task
                if agent_error:
                    err = agent_error[0]
                    logger.exception(
                        "kol chat retry failed: persona=%s err=%s",
                        persona_username, err,
                    )
                    if runtime_turn is not None:
                        await append_turn_events(
                            runtime_turn,
                            metadata={
                                "agent_kind": "kol_research",
                                "persona_username": persona_username,
                            },
                            events=[
                                error_event(
                                    code="context_too_long",
                                    stage="model_retry",
                                    message="对话上下文太长了。系统已尝试压缩仍失败，请新建对话。",
                                )
                            ],
                        )
                    yield {
                        "type": "error",
                        "code": "context_too_long",
                        "error": "对话上下文太长了。系统已尝试压缩仍失败，请新建对话。",
                    }
                    completed_normally = True
                    return
                # Retry succeeded — fall through to the success path.
            else:
                # logger.exception captures the full traceback — search log for
                # "kol chat failed" to find the exact stack on a failing turn.
                logger.exception(
                    "kol chat failed: persona=%s elapsed=%.1fs code=%s err=%s",
                    persona_username, elapsed, code, err,
                )
                if runtime_turn is not None:
                    await append_turn_events(
                        runtime_turn,
                        metadata={
                            "agent_kind": "kol_research",
                            "persona_username": persona_username,
                        },
                        events=[
                            error_event(
                                code=code,
                                stage="model_run",
                                message="AI 助手出了点问题，请再试一次",
                            )
                        ],
                    )
                yield {
                    "type": "error",
                    "code": code,
                    "error": "AI 助手出了点问题，请再试一次",
                }
                completed_normally = True
                return

        navigate = nav_buf[-1] if nav_buf else None
        kol_chunks = [
            chunk_to_persona_result(c, citation_index=i + 1)
            for i, c in enumerate(chunks_buf)
        ]
        final_text = agent_text[0] if agent_text else ""
        missing_data = validate_data_coverage(
            input_guard.parsed,
            fulfilled_tool_keys=input_guard.fulfilled_tool_keys,
            tool_calls=tool_log,
        )
        final_text = append_data_coverage_warning(final_text, missing_data)
        await get_agent_runtime().complete_turn(
            runtime_turn,
            assistant_text=final_text,
            metadata={
                "agent_kind": "kol_research",
                "persona_username": persona_username,
            },
        )
        stream_events: list[dict[str, Any]] = [
            context_snapshot_event(runtime_turn),
            *tool_call_events(tool_log),
        ]
        stream_budget_event = context_budget_truncated_event(runtime_turn)
        if stream_budget_event is not None:
            stream_events.append(stream_budget_event)
        await append_turn_events(
            runtime_turn,
            metadata={
                "agent_kind": "kol_research",
                "persona_username": persona_username,
            },
            events=stream_events,
        )
        final = KolResearchResponse(
            persona_username=persona_username,
            message=final_text,
            kol_chunks=kol_chunks,
            activated_skills=skills_buf,
            tool_calls=tool_log,
            navigate=navigate,
        )
        yield {"type": "final", "data": final.model_dump()}
        completed_normally = True
        logger.info(
            "kol chat completed: persona=%s elapsed=%.2fs final_chars=%d tool_calls=%d skills=%d",
            persona_username,
            time.time() - stream_started_at,
            len(final_text or ""),
            len(tool_log),
            len(skills_buf),
        )
    except Exception as setup_err:  # noqa: BLE001
        # Setup-phase errors (_preload_recent_reports / get_agent / _build_prompt)
        # would otherwise bubble out of the generator with zero SSE events,
        # which the frontend logs as "no final event". Catch and yield a
        # proper error event so the user sees a useful message and the log
        # shows where it broke. GeneratorExit / CancelledError are BaseException
        # subclasses and intentionally NOT caught — client-disconnect cancels
        # must still propagate to the finally block for contextvar cleanup.
        elapsed = time.time() - stream_started_at
        logger.exception(
            "kol chat setup failed: persona=%s elapsed=%.1fs err=%s",
            persona_username, elapsed, setup_err,
        )
        if runtime_turn is not None:
            await append_turn_events(
                runtime_turn,
                metadata={
                    "agent_kind": "kol_research",
                    "persona_username": persona_username,
                },
                events=[
                    error_event(
                        code="agent_setup_error",
                        stage="setup",
                        message="AI 助手启动失败，请再试一次",
                    )
                ],
            )
        yield {
            "type": "error",
            "code": "agent_setup_error",
            "error": "AI 助手启动失败，请再试一次",
        }
        completed_normally = True  # error event delivered; not an abort.
        return
    finally:
        # If we get here without `completed_normally` and the `except` block
        # didn't run either, the generator was cancelled (client disconnected)
        # or an exception is propagating. sys.exc_info() distinguishes the two.
        if not completed_normally:
            exc_type, exc_val, _ = sys.exc_info()
            elapsed = time.time() - stream_started_at
            if exc_type is None:
                # Generator was closed (client disconnect / aclose).
                logger.warning(
                    "kol chat aborted: persona=%s elapsed=%.2fs tool_calls=%d "
                    "reason=generator_closed (client disconnected before final event)",
                    persona_username, elapsed, len(tool_log),
                )
            elif issubclass(exc_type, (GeneratorExit, asyncio.CancelledError)):
                logger.warning(
                    "kol chat cancelled: persona=%s elapsed=%.2fs tool_calls=%d "
                    "exc=%s",
                    persona_username, elapsed, len(tool_log), exc_type.__name__,
                )
            else:
                logger.warning(
                    "kol chat exited via exception: persona=%s elapsed=%.2fs "
                    "tool_calls=%d exc=%s msg=%s",
                    persona_username, elapsed, len(tool_log),
                    exc_type.__name__, exc_val,
                )
        _sse_queue.reset(token_queue)
        persona_chunks_buffer.reset(token_chunks)
        _activated_skills.reset(token_skills)
        _tool_call_log.reset(token_log)
        _navigate_buffer.reset(token_nav)
        _tool_started_at.reset(token_timers)
        _google_search_calls.reset(token_google)
        _kol_tweet_search_calls.reset(token_kol_search)
        _active_conversation_id.reset(token_conv)
        _active_user_id.reset(token_user)
        turn_ctx.__exit__(None, None, None)
