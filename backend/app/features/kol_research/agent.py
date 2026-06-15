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
from pydantic import BaseModel, Field

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
from app.shared.data_tools.research_tools import get_forward_valuation, get_technical_analysis
from app.shared.kol_persona import (
    Persona,
    build_always_on_instruction,
    build_lens_skills,
    chunk_to_persona_result,
    get_persona,
    persona_chunks_buffer,
    search_kol_tweets,
)
from app.shared.kol_persona.tools import _active_kol_author
from app.shared.llm_metering import meter

logger = get_logger(__name__)

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
_GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if _GOOGLE_API_KEY and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = _GOOGLE_API_KEY

MODEL = "gemini-3.5-flash"
FOLLOW_UP_MODEL = "gemini-3.1-flash-lite"
APP_NAME = "kol_research_agent"
FOLLOW_UP_APP_NAME = "kol_follow_up_options"
DEFAULT_PERSONA = "qinbafrank"


class _KolFollowUpOptionsOutput(BaseModel):
    options: List[str] = Field(default_factory=list)


_FOLLOW_UP_OPTIONS_INSTRUCTION = """
你是 TheMarketBrew 研究对话的 follow-up chips 生成器。

你会收到 JSON，包含:
- persona_username: 当前 KOL persona
- recent_history: 最近几轮对话
- user_question: 用户刚问的问题
- assistant_answer: Agent 刚给出的回答
- content_context: 用户右侧正在看的股票/报告/宏观上下文摘要
- evidence: 本轮召回的 KOL 历史证据摘要

你的任务: 生成 3-4 个用户最可能继续点击的问题。

质量标准:
1. 每个 option 都必须是可以直接发送给 Agent 的中文短问题。
2. 优先匹配用户刚才真正关心的下一步，不要泛泛补课。
3. 抓住 assistant_answer 里的未解决张力:
   - 需要用什么数据验证?
   - 哪些信号会证伪?
   - 这个 ticker / 板块和谁最该对比?
   - KOL 历史上是否有直接观点或观点变化?
   - 接下来财报、新闻、宏观变量应该看什么?
4. 尽量复用答案里的具体 ticker、公司、板块、变量、事件，避免空泛词。
5. 避免模板感问题，例如“继续追问主要风险”“用当前数据验证”。
6. 不要生成买卖建议、仓位建议、目标价或短线交易问题。
7. 每条尽量 8-28 个中文字；可以包含 ticker。不要超过 40 个字符。
8. 不要重复 assistant_answer 已经完整回答过的内容；要引导下一步研究。

输出只填 schema 里的 options 数组。不要输出解释。

好例子:
- "哪些数据会证伪 NVDA 逻辑?"
- "把 MU 和 AVGO 放一起比"
- "Qinbafrank 以前怎么修正过?"
- "下一季财报最该看什么?"
- "这会影响 AI Capex 主线吗?"

坏例子:
- "继续追问主要风险"
- "用当前数据验证"
- "这只股票可以买入吗?"
- "给我一个目标价"
"""


_follow_up_options_agent = LlmAgent(
    name="kol_follow_up_options",
    model=FOLLOW_UP_MODEL,
    instruction=_FOLLOW_UP_OPTIONS_INSTRUCTION,
    output_schema=_KolFollowUpOptionsOutput,
    output_key="follow_up_options",
    after_model_callback=meter("kol_research.follow_up_options", model=FOLLOW_UP_MODEL),
)
_follow_up_options_runner = InMemoryRunner(
    agent=_follow_up_options_agent,
    app_name=FOLLOW_UP_APP_NAME,
)


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
    "get_forward_valuation",
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
    "get_forward_valuation": lambda a: "正在核对 %s 的前瞻估值..." % a.get("symbol", ""),
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
    ("TLDR：", "一句话说："),
    ("TLDR:", "一句话说："),
    ("methodology", "方法论"),
    ("Methodology", "方法论"),
    ("top picks", "高信念标的"),
    ("Top picks", "高信念标的"),
    ("Veto", "一票否决"),
    ("veto", "一票否决"),
    ("chokepoint", "物理咽喉"),
    ("Chokepoint", "物理咽喉"),
    ("bottleneck", "产能瓶颈"),
    ("Bottleneck", "产能瓶颈"),
    ("forward mismatch", "前瞻错配"),
    ("Forward mismatch", "前瞻错配"),
    ("forward revenue ramp", "未来收入爬坡"),
    ("revenue ramp", "收入爬坡"),
    ("volume ramp", "量产爬坡"),
    ("design-in", "客户导入"),
    ("Design-in", "客户导入"),
    ("design out", "被客户绕开"),
    ("design-out", "被客户绕开"),
    ("qualification", "客户验证"),
    ("Qualification", "客户验证"),
    ("BOM", "物料清单"),
    ("capex", "资本开支"),
    ("Capex", "资本开支"),
    ("hyperscaler", "超大规模云厂商"),
    ("Hyperscaler", "超大规模云厂商"),
    ("high conviction", "高信念"),
    ("High conviction", "高信念"),
    ("playbook", "完整材料"),
    ("thesis", "原始判断"),
    ("Thesis", "原始判断"),
    ("TAM", "可服务市场"),
    ("物料清单（物料清单）", "物料清单"),
    ("物理咽喉（物理咽喉）", "物理咽喉"),
    ("完全值得继续深入研究", "仍值得继续研究"),
    ("完全值得继续研究", "仍值得继续研究"),
    ("极高的权重", "较高权重"),
    ("极高的研究与追踪价值", "较高的研究与追踪价值"),
    ("最具爆发力的", "弹性较高的"),
    ("强烈支持", "支持"),
    ("强力背书", "支持信号"),
    ("顶尖背景", "相关背景"),
    ("不可替代的国安节点", "重要国安节点"),
    ("重点轮动加仓", "重点轮动关注"),
    ("绝对份额", "关键份额"),
    ("坚决一票否决", "触发一票否决"),
    ("看多逻辑", "原始判断"),
    ("享受估值重塑", "观察估值重塑"),
    ("非常值得关注", "值得继续观察"),
    ("非常值得继续观察", "仍可放进观察名单"),
    ("高度值得关注", "值得继续观察"),
    ("值得高度关注", "值得继续观察"),
    ("博主现在高度看好", "博主历史上给过高权重"),
    ("现在高度看好", "历史上给过高权重"),
    ("高度看好", "高权重关注"),
    ("最具确定性", "关键"),
    ("极强的", "较强的"),
    ("极强", "较强"),
    ("绝对瓶颈", "关键瓶颈"),
    ("黄金窗口期", "验证窗口"),
    ("黄金期", "验证窗口"),
    ("国王制造者", "关键上游"),
    ("视作分批回补仓位的窗口", "视作重新评估仓位风险收益的窗口"),
    ("视作分批建仓的窗口", "视作分批评估的窗口"),
    ("分批回补仓位", "分批评估仓位"),
    ("回补仓位", "重新评估仓位"),
    ("分批建仓", "分批评估"),
    ("再分批建仓", "再分批评估"),
    ("提前入场", "提前识别"),
    ("入场接盘", "追认"),
    ("接盘", "追认"),
    ("不建议", "不适合"),
    ("应该等待", "更稳的是等待"),
    ("恐慌卖出", "因情绪一次性处理"),
    ("800V 直流（HDC）", "800V 直流（HVDC）"),
    ("杀估值", "估值回撤"),
    ("杀验证", "验证窗口"),
    ("杀业绩", "业绩恶化"),
    ("杀逻辑", "逻辑破裂"),
    ("三杀", "判断状态"),
)

_FRANK_METHODOLOGY_TERMS = {
    "杀估值",
    "杀业绩",
    "杀逻辑",
    "三杀",
}


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


def _sanitize_user_facing_markdown(
    text: str,
    *,
    persona_username: str | None = None,
) -> str:
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
    preserve_frank_terms = (persona_username or "").lower() == "qinbafrank"
    for source, target in _TRADING_PHRASE_REPLACEMENTS:
        if preserve_frank_terms and source in _FRANK_METHODOLOGY_TERMS:
            continue
        text = text.replace(source, target)
    bold_count = 0
    return _BOLD_RE.sub(_cap_bold, text)


# ---------------------------------------------------------------------------
# Agent construction (singleton per persona)
# ---------------------------------------------------------------------------

# Shared outer prompt. Persona-specific voice and frameworks belong in skill docs.

_SKILL_TOOL_USAGE_RULES = """
# 职责

你是 TheMarketBrew 的 KOL 方法论投研分析师。你的主要职责是帮助用户透过 @{username} 过去的公开观点、长期方法论,并结合当前可获得的市场和公司数据,理解股票、板块、市场主线或新闻事件。

你不是 @{username} 本人,也不是替用户做买卖决定的人。你的工作是把"博主过去怎么看、他/她通常怎么判断、现在的数据发生了什么、这些信息合起来说明什么"讲清楚。

# 回答原则

- 默认以深度投研方式回答: 结论清楚、证据充分、解释完整。除非用户明确要求"简单说 / 两句话 / 只选一个 / 只要结论",不要主动压短。
- 回答风格、分析框架、术语体系、判断顺序,全部以当前 persona 的 skill 为准。outer prompt 不定义具体博主风格,也不要把一个博主的框架套到另一个博主身上。
- 尽量通俗易懂: 少堆术语,不要只贴标签;要讲清楚背后的因果关系,说明这个变量为什么重要、它影响哪条链、变化后意味着什么。
- skill 文件是判断素材库,不是答案大纲。不要机械复述 skill 的目录、章节名或 evidence 段落。

# 每轮流程

1. 先理解用户问题类型: 个股、板块、宏观、新闻事件、方法论、比较、机会发现、历史观点追问。
2. core / macro 已经常驻在系统 prompt 里,不需要重复加载。
3. 根据问题加载最相关的 framework skill,用它决定这个问题应该怎么分析;如不确定,先用 `list_skills` 看当前 persona 实际可用的 skill。
4. 当用户问"为什么 / 怎么判断 / 框架 / 方法 / 如何理解",或博主近期没有直接观点但需要按其长期思路分析当下问题时,加载方法论相关 framework skill;方法论用于解释判断逻辑,不要机械复述 skill 内容。
5. 如果涉及具体个股,加载对应 ticker skill。
6. 如果涉及产业或主题,加载对应 sector skill。
7. 用 `search_kol_tweets(query=..., author_username="{username}")` 检索当前 persona 的历史原文。
8. 涉及当下判断时,调用 `get_stock_brief` / `get_peer_brief` / `get_industry_brief` / `get_macro_brief` 等 brief 工具;早报/复盘问题可用 `get_report_by_date` / `list_recent_reports`。
9. 回答时清楚分开: 博主历史上说过什么、当前数据是什么、按博主方法论可以如何理解、后续需要观察哪些变化。

# 证据和边界

- 引用历史观点时,必须提及大致时间或当时语境,并使用本轮 `search_kol_tweets` 返回的 [#N] 编号。
- 只能引用本轮工具实际返回过的 [#N];未调 `search_kol_tweets` 前不要写引用号,不要编造引用号。
- 没有直接覆盖时要明说,再按方法论和当前数据做有边界的分析。
- `search_kol_tweets` 查询的是已入库并向量化的 `kol_tweets/vector_chunks`,不是现场抓取 Twitter/X。用户可见表述应写"已入库推文检索"或"向量语料检索",不要写"实时推文检索"。
- skill 中的 coverage / "未提及" 是静态蒸馏快照,会有语料截止日期。如果静态 skill 说某标的在截止日前未覆盖,但本轮 `search_kol_tweets` 返回了截止日之后的直接推文,以本轮召回的直接证据为准,并清楚说明"静态蒸馏截至 YYYY-MM-DD 未覆盖;当前已入库语料中有 YYYY-MM-DD 的新证据"。
- 复述静态语料截止日期和推文日期时必须使用工具或 skill 给出的精确日期,不要把 2026-05-25 写成 2025-05-25。
- 当前事实只能来自 `prefetched_data`、brief tool、report tool 或明确披露的 web 搜索;没数据时说明缺口,不要编造数字。
- 不假装自己是博主本人,不编造博主没说过的话,不给直接买卖指令。
- `google_search` 仅作为 escape hatch: 当历史观点、skill 和数据工具都不足以回答当前事件/URL时使用;使用后必须说明哪些信息来自 web 搜索。
"""


def _build_instruction(persona: Persona) -> str:
    always_on = build_always_on_instruction(persona)
    tool_rules = _SKILL_TOOL_USAGE_RULES.format(username=persona.username)
    header = (
        f"你是 TheMarketBrew 的 KOL 方法论投研分析师，"
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
        get_forward_valuation,       # explicit FY forward P/E from FMP price + analyst EPS
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
        thinking_config=types.ThinkingConfig(
            include_thoughts=True,
            thinking_level=types.ThinkingLevel.MEDIUM,
        ),
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


_FORBIDDEN_FOLLOW_UP_RE = re.compile(
    r"(买入|卖出|加仓|减仓|清仓|目标价|止损|荐股|能不能买|该不该买|可以买|要不要买)"
)


def _truncate_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _slim_content_context_for_follow_up(
    content_context: Dict[str, Any] | None,
) -> Dict[str, Any] | None:
    if not isinstance(content_context, dict):
        return None

    slim: Dict[str, Any] = {}
    for key in ("type", "label", "summary", "symbol"):
        if content_context.get(key):
            slim[key] = content_context.get(key)

    params = content_context.get("params")
    if isinstance(params, dict):
        slim["params"] = {
            k: v
            for k, v in params.items()
            if k in {"symbol", "ticker", "date", "tab"} and v
        }

    quote = content_context.get("quote")
    if isinstance(quote, dict):
        slim["quote"] = {
            k: quote.get(k)
            for k in ("symbol", "price", "change_percent", "market_cap")
            if quote.get(k) is not None
        }

    return slim or None


def _slim_chunks_for_follow_up(kol_chunks: List[Any] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in (kol_chunks or [])[:5]:
        if hasattr(raw, "model_dump"):
            chunk = raw.model_dump()
        elif isinstance(raw, dict):
            chunk = raw
        else:
            continue
        out.append(
            {
                "citation_index": chunk.get("citation_index"),
                "title": chunk.get("title"),
                "created_at": chunk.get("created_at"),
                "tickers": chunk.get("tickers") or [],
                "content": _truncate_text(chunk.get("content"), 280),
            }
        )
    return out


def _normalize_follow_up_options(raw_options: Any) -> list[str]:
    if not isinstance(raw_options, list):
        return []

    options: list[str] = []
    seen: set[str] = set()
    for raw in raw_options:
        option = str(raw or "").strip()
        option = re.sub(r"^[\s\-*•\d.、]+", "", option)
        option = option.strip("「」\"'` ")
        option = re.sub(r"\s+", " ", option)
        if not option or option in seen:
            continue
        if len(option) > 48:
            continue
        if _FORBIDDEN_FOLLOW_UP_RE.search(option):
            continue
        seen.add(option)
        options.append(option)
        if len(options) >= 4:
            break
    return options


async def generate_kol_follow_up_options(
    *,
    user_message: str,
    assistant_message: str,
    persona_username: str,
    history: List[Dict[str, str]] | None = None,
    kol_chunks: List[Any] | None = None,
    content_context: Dict[str, Any] | None = None,
    timeout: float = 8.0,
) -> list[str]:
    """Generate high-intent follow-up chips with a small structured LLM pass.

    This is deliberately best-effort. If the generator is slow or malformed,
    callers return an empty list and the frontend falls back to deterministic
    chips so the main answer is never blocked by UI sugar.
    """
    payload = {
        "persona_username": persona_username,
        "recent_history": [
            {
                "role": str(turn.get("role", ""))[:20],
                "content": _truncate_text(turn.get("content"), 500),
            }
            for turn in (history or [])[-6:]
            if isinstance(turn, dict)
        ],
        "user_question": _truncate_text(user_message, 900),
        "assistant_answer": _truncate_text(assistant_message, 4500),
        "content_context": _slim_content_context_for_follow_up(content_context),
        "evidence": _slim_chunks_for_follow_up(kol_chunks),
    }

    session = None
    try:
        session = await _follow_up_options_runner.session_service.create_session(
            app_name=FOLLOW_UP_APP_NAME,
            user_id="kol_follow_up",
        )
        message = types.Content(
            parts=[types.Part(text=json.dumps(payload, ensure_ascii=False, default=str))],
            role="user",
        )
        await asyncio.wait_for(
            _run_follow_up_options_session(session_id=session.id, message=message),
            timeout=timeout,
        )
        session_data = await _follow_up_options_runner.session_service.get_session(
            app_name=FOLLOW_UP_APP_NAME,
            user_id="kol_follow_up",
            session_id=session.id,
        )
        state = (session_data.state if session_data else {}) or {}
        raw = state.get("follow_up_options")
        if isinstance(raw, str):
            raw = json.loads(raw)
        parsed = _KolFollowUpOptionsOutput.model_validate(raw or {})
        return _normalize_follow_up_options(parsed.options)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "kol follow-up option generation failed: persona=%s err=%s",
            persona_username,
            exc,
        )
        return []
    finally:
        if session is not None:
            try:
                await _follow_up_options_runner.session_service.delete_session(
                    app_name=FOLLOW_UP_APP_NAME,
                    user_id="kol_follow_up",
                    session_id=session.id,
                )
            except Exception:  # noqa: BLE001
                pass


async def _run_follow_up_options_session(
    *,
    session_id: str,
    message: types.Content,
) -> None:
    async for _ in _follow_up_options_runner.run_async(
        user_id="kol_follow_up",
        session_id=session_id,
        new_message=message,
    ):
        pass


# ---------------------------------------------------------------------------
# Public run API
# ---------------------------------------------------------------------------

async def _run_session(
    *,
    agent: LlmAgent,
    runner: InMemoryRunner,
    prompt: str,
    persona_username: str,
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
    partial_text_parts: list[str] = []
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
    async def _collect_text(new_message: types.Content) -> None:
        nonlocal adk_events, partial_chunks, final_chunks
        async for event in runner.run_async(
            user_id="kol_research",
            session_id=session.id,
            new_message=new_message,
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
                    partial_text_parts.append(text)
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

    try:
        await _collect_text(message)
        if not "".join(final_text_parts).strip() and not "".join(partial_text_parts).strip():
            logger.warning(
                "_run_session got no user-visible text after first pass; requesting final answer"
            )
            follow_up = types.Content(
                parts=[
                    types.Part(
                        text=(
                            "请基于刚才已经加载的 skill 和工具结果,直接给出用户可见的最终回答。"
                            "不要只调用工具;如果信息不足,也要明确说明不足并给出可用判断。"
                        )
                    )
                ],
                role="user",
            )
            await _collect_text(follow_up)
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

    canonical_text = "".join(final_text_parts).strip()
    if not canonical_text:
        canonical_text = "".join(partial_text_parts).strip()
    text = _fix_concat_citations(canonical_text)
    return _sanitize_user_facing_markdown(text, persona_username=persona_username)


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

    token_author = _active_kol_author.set(persona_username)
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
                _run_session(
                    agent=agent,
                    runner=runner,
                    prompt=prompt,
                    persona_username=persona_username,
                ),
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
        options = await generate_kol_follow_up_options(
            user_message=message,
            assistant_message=text,
            persona_username=persona_username,
            history=history,
            kol_chunks=kol_chunks,
            content_context=content_context,
        )

        return KolResearchResponse(
            persona_username=persona_username,
            message=text,
            options=options,
            kol_chunks=kol_chunks,
            activated_skills=skills_buf,
            tool_calls=tool_log,
            navigate=navigate,
        )
    finally:
        _active_kol_author.reset(token_author)
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
    token_author = _active_kol_author.set(persona_username)
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
                    _run_session(
                        agent=agent,
                        runner=runner,
                        prompt=prompt_to_run,
                        persona_username=persona_username,
                    ),
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
        options = await generate_kol_follow_up_options(
            user_message=message,
            assistant_message=final_text,
            persona_username=persona_username,
            history=history,
            kol_chunks=kol_chunks,
            content_context=content_context,
        )
        final = KolResearchResponse(
            persona_username=persona_username,
            message=final_text,
            options=options,
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
        _active_kol_author.reset(token_author)
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
