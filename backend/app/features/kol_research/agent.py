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
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.adk.tools.skill_toolset import SkillToolset
from google.genai import types

from app.core.logging import get_logger
from app.features.kol_research.models import (
    KolResearchResponse,
    KolToolCallSummary,
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
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

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
_MAX_GOOGLE_SEARCH_PER_TURN = 1
# Tool names that ADK exposes for the GoogleSearchTool. ADK currently registers
# the underlying agent transfer under "google_search_agent"; "google_search"
# may appear in older / different code paths.
_GOOGLE_SEARCH_TOOL_NAMES = {"google_search_agent", "google_search"}


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

    # Hard cap on google_search: kill the second+ call to keep latency in check.
    if tool_name in _GOOGLE_SEARCH_TOOL_NAMES:
        counts = _google_search_calls.get(None)
        if counts is not None:
            counts[tool_name] = counts.get(tool_name, 0) + 1
            if counts[tool_name] > _MAX_GOOGLE_SEARCH_PER_TURN:
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

    # Log tool calls for response.tool_calls (excluding ADK internals like set_model_response).
    log = _tool_call_log.get(None)
    if log is not None and tool_name not in {"set_model_response"}:
        log.append(KolToolCallSummary(
            name=tool_name,
            args_summary=_safe_args_summary(args),
            duration_ms=duration_ms,
            ok=True,
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


# ---------------------------------------------------------------------------
# Agent construction (singleton per persona)
# ---------------------------------------------------------------------------

# LONG-TERM TODO: 下面这套"回答框架 / 工具使用 / 输出格式"规则混合了通用脚手架
# (任何 KOL persona 都该遵守) 和 qinbafrank 特定的认知模式 (产业派分析师独有的
# 5 段式推理). 长期方向: 把"产业派回答框架"这种 KOL 特定内容迁回
# `methodologies/qinbafrank/*.md`, 让换 KOL 时框架自动跟着变 (技术派会用形态/
# 均线/量能/突破/止损; 量化派会用因子/backtest/sharpe). 当前只服务 qinbafrank,
# 一次性 hardcode 是可接受的简化.

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

- Markdown 简体中文, **目标 800-1500 字** (投研问题, 短了就是糊弄)
- 5 段必须用 `### 1. 产业定位` / `### 2. 当下指标读数` 这种结构化标题, 不要全堆一段
- 每段内: 关键判断 / 数字 / falsifiability 锚用 **粗体** 突出
- 指标对照、风险因子、观察清单 用列表
- 长度不达标或缺段 = 没用尽工具, 重新组织
"""


def _build_instruction(persona: Persona) -> str:
    always_on = build_always_on_instruction(persona)
    tool_rules = _TOOL_USAGE_RULES.format(username=persona.username)
    return (
        f"你是 TheMarketBrew 的投研助手 (KOL 视角)，正在用 @{persona.username} 的公开方法论看市场。\n"
        f"**绝不能声称自己就是 @{persona.username}**。\n\n"
        f"{always_on}\n\n"
        f"{tool_rules}"
    )


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

    agent = LlmAgent(
        name="kol_research_agent",
        model=MODEL,
        instruction=_build_instruction(persona),
        tools=_build_tools(persona),
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
) -> str:
    parts: List[str] = []

    if history:
        parts.append("## Conversation History")
        for turn in history[-12:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            label = "User" if role == "user" else "Assistant"
            parts.append(f"{label}: {content}")
        parts.append("")

    if content_context:
        ctx_type = content_context.get("type", "")
        if ctx_type == "stock" and content_context.get("symbol"):
            parts.append(
                "## User is currently viewing: %s Stock Research"
                % content_context["symbol"]
            )
        elif ctx_type == "daily_report":
            parts.append(
                "## User is currently viewing: %s Daily Report"
                % content_context.get("date", "latest")
            )
        elif ctx_type == "morning_report":
            parts.append("## User is currently viewing: Morning Report")
        elif ctx_type == "macro":
            parts.append("## User is currently viewing: Macro Dashboard")
        # Keep the context light — the agent can call tools to deep-dive.
        parts.append("")

    parts.append("## User question")
    parts.append(message)
    return "\n".join(parts)


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
    """Run one turn, return collected markdown text."""
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id="kol_research"
    )
    message = types.Content(parts=[types.Part(text=prompt)], role="user")

    final_text_parts: list[str] = []
    try:
        async for event in runner.run_async(
            user_id="kol_research",
            session_id=session.id,
            new_message=message,
        ):
            if hasattr(event, "content") and event.content and event.content.parts:
                for part in event.content.parts:
                    text = getattr(part, "text", None)
                    if text:
                        final_text_parts.append(text)
    finally:
        try:
            await runner.session_service.delete_session(
                app_name=APP_NAME,
                user_id="kol_research",
                session_id=session.id,
            )
        except Exception:  # noqa: BLE001
            pass

    return "".join(final_text_parts).strip()


async def answer_kol_research(
    *,
    message: str,
    history: List[Dict[str, str]] | None = None,
    persona_username: str = DEFAULT_PERSONA,
    content_context: Dict[str, Any] | None = None,
    timeout: float = 120.0,
) -> KolResearchResponse:
    """Unary entry — runs the agent and returns a complete response."""
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

    try:
        await _preload_recent_reports()
        agent = get_agent(persona_username)
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)

        prompt = await _build_prompt(
            message=message,
            history=history,
            content_context=content_context,
        )

        try:
            text = await asyncio.wait_for(
                _run_session(agent=agent, runner=runner, prompt=prompt),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.error("kol_research timed out for: %s", message[:100])
            text = "AI 助手思考时间太长了，请再试一次。如果持续超时，可以简化一下问题。"

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


async def stream_kol_research(
    *,
    message: str,
    history: List[Dict[str, str]] | None = None,
    persona_username: str = DEFAULT_PERSONA,
    content_context: Dict[str, Any] | None = None,
    timeout: float = 120.0,
):
    """SSE generator — yields events:

      {"type": "skill_activated", "skill_name": ..., "description": ...}
      {"type": "tool_call_start", "tool": ..., "description": ...}
      {"type": "tool_call_end", "tool": ..., "duration_ms": ...}
      {"type": "final", "data": KolResearchResponse-dict}
      {"type": "error", "error": "..."}

    Internally the agent run is launched in a background task; this generator
    forwards events from a contextvar queue until the agent finishes.
    """
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

    try:
        await _preload_recent_reports()
        agent = get_agent(persona_username)
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
        prompt = await _build_prompt(
            message=message,
            history=history,
            content_context=content_context,
        )

        agent_done = asyncio.Event()
        agent_text: list[str] = []
        agent_error: list[BaseException] = []

        async def _run():
            try:
                text = await asyncio.wait_for(
                    _run_session(agent=agent, runner=runner, prompt=prompt),
                    timeout=timeout,
                )
                agent_text.append(text)
            except BaseException as e:  # noqa: BLE001 — propagate after queue drain
                agent_error.append(e)
            finally:
                agent_done.set()

        task = asyncio.create_task(_run())

        # Drain the SSE queue while the agent is running.
        while not agent_done.is_set():
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.15)
                yield event
                if event.get("type") in {"tool_call_start", "skill_activated"}:
                    # Yield control so SSE flushes before the tool actually runs.
                    await asyncio.sleep(0)
            except asyncio.TimeoutError:
                pass

        # Drain remaining events.
        while not queue.empty():
            yield queue.get_nowait()

        await task

        if agent_error:
            err = agent_error[0]
            if isinstance(err, asyncio.TimeoutError):
                yield {
                    "type": "final",
                    "data": KolResearchResponse(
                        persona_username=persona_username,
                        message="AI 助手思考时间太长了，请再试一次。",
                        tool_calls=tool_log,
                    ).model_dump(),
                }
                return
            logger.exception("kol_research stream failed", exc_info=err)
            yield {"type": "error", "error": str(err)}
            return

        navigate = nav_buf[-1] if nav_buf else None
        kol_chunks = [
            chunk_to_persona_result(c, citation_index=i + 1)
            for i, c in enumerate(chunks_buf)
        ]
        final = KolResearchResponse(
            persona_username=persona_username,
            message=agent_text[0] if agent_text else "",
            kol_chunks=kol_chunks,
            activated_skills=skills_buf,
            tool_calls=tool_log,
            navigate=navigate,
        )
        yield {"type": "final", "data": final.model_dump()}
    finally:
        _sse_queue.reset(token_queue)
        persona_chunks_buffer.reset(token_chunks)
        _activated_skills.reset(token_skills)
        _tool_call_log.reset(token_log)
        _navigate_buffer.reset(token_nav)
        _tool_started_at.reset(token_timers)
        _google_search_calls.reset(token_google)
