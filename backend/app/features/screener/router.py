"""
Stock Screener - API Router

Endpoints:
  POST /api/screener/refresh       (cron, protected)
  GET  /api/screener/status        (monitoring, public)
  POST /api/screener/filter        (screener queries, public)
  POST /api/screener/pick          (guided stock research, auth required) [deprecated -> /api/research/chat]
  GET  /api/screener/conversations           (list, auth required) [deprecated -> /api/research/conversations]
  GET  /api/screener/conversations/{id}      (get, auth required)
  POST /api/screener/conversations           (create, auth required)
  PUT  /api/screener/conversations/{id}      (update, auth required)
  PATCH /api/screener/conversations/{id}/pin (pin/unpin, auth required)
  DELETE /api/screener/conversations/{id}    (delete, auth required)

  POST /api/research/chat                    (guided stock research, auth required)
  GET  /api/research/conversations           (list, auth required)
  GET  /api/research/conversations/{id}      (get, auth required)
  POST /api/research/conversations           (create, auth required)
  PUT  /api/research/conversations/{id}      (update, auth required)
  PATCH /api/research/conversations/{id}/pin (pin/unpin, auth required)
  DELETE /api/research/conversations/{id}    (delete, auth required)
"""

import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.config import AGENT_RUNTIME_REQUEST_HISTORY
from app.core.deps import verify_cron_secret, verify_user_token, optional_user_token
from app.core.rate_limit import _get_real_ip
from app.core.logging import get_logger
from app.core.sse import with_heartbeat
from app.utils.timezone import utc_now_iso
from app.features.screener.db import (
    get_all_status,
    get_cached,
    get_cache_data,
    is_cache_valid,
)
from app.features.screener.models import (
    ConversationPinRequest,
    ConversationSaveRequest,
    FilterRequest,
    FilterResult,
    ResearchRequest,
    ResearchResult,
)
from app.features.screener.suggestions import (
    compute_narrowing_suggestions,
    SECTOR_ZH,
)

logger = get_logger(__name__)

import app.core.posthog_client as posthog

router = APIRouter(prefix="/api/screener", tags=["screener"])

# -- In-memory universe cache to avoid re-reading 12 DB chunks per filter call --
_universe_cache: Dict[str, Any] = {
    "universe": None,
    "sector_stats": None,
    "freshness": None,
    "is_valid": True,
    "ts": 0.0,
}
_CACHE_TTL = 300  # 5 minutes
RESEARCH_AGENT_ID = "research_agent"
KOL_RESEARCH_AGENT_ID = "kol_research_agent"
_PINNABLE_RUNTIME_AGENT_IDS = (RESEARCH_AGENT_ID, KOL_RESEARCH_AGENT_ID)


def _stream_text_chunks(text: str, *, chunk_size: int = 12) -> list[str]:
    if not text:
        return []
    return [text[idx:idx + chunk_size] for idx in range(0, len(text), chunk_size)]


def _runtime_session_id(req: ResearchRequest) -> str | None:
    return req.session_id or req.conversation_id


def _request_history_for_runtime(req: ResearchRequest) -> list[dict]:
    if AGENT_RUNTIME_REQUEST_HISTORY == "disabled":
        return []
    return req.history if req.history else []


def _legacy_conversation_agent_id(conversation: dict[str, Any]) -> str:
    data = conversation.get("data") if isinstance(conversation.get("data"), dict) else {}
    if data.get("agent_kind") == "kol_research" or data.get("persona_username"):
        return KOL_RESEARCH_AGENT_ID
    return RESEARCH_AGENT_ID


def _legacy_conversation_metadata(conversation: dict[str, Any]) -> dict[str, Any]:
    data = conversation.get("data") if isinstance(conversation.get("data"), dict) else {}
    agent_kind = (
        "kol_research"
        if _legacy_conversation_agent_id(conversation) == KOL_RESEARCH_AGENT_ID
        else "research"
    )
    metadata: dict[str, Any] = {
        "agent_kind": agent_kind,
        "legacy_picker_conversation_id": conversation.get("id"),
        "title": conversation.get("title") or "历史对话",
        "message_count": conversation.get("message_count") or 0,
    }
    persona_username = data.get("persona_username")
    if persona_username:
        metadata["persona_username"] = persona_username
    return metadata


async def _prepare_research_runtime_turn(
    *,
    req: ResearchRequest,
    user_id: str | None,
    agent: Any,
):
    session_id = _runtime_session_id(req)
    if not user_id or not session_id:
        return None
    try:
        from app.features.agent_runtime import (
            AgentRunRequest,
            AgentRuntimeTurn,
        )
        from app.features.agent_runtime.runtime import get_agent_runtime

        runtime_request = AgentRunRequest(
            agent_id=RESEARCH_AGENT_ID,
            user_id=user_id,
            session_id=session_id,
            message=req.message,
            history=_request_history_for_runtime(req),
            content_context=req.active_context,
            metadata={"agent_kind": "research"},
            turn_id=req.turn_id,
        )
        runtime = get_agent_runtime()
        session = await runtime.load_session(runtime_request)
        session_history = session.chat_history()
        if session_history:
            effective_history = session_history
        elif AGENT_RUNTIME_REQUEST_HISTORY == "fallback" and req.history:
            effective_history = req.history
        else:
            effective_history = None
        assembled = await agent.assemble_prompt_context(
            message=req.message,
            history=effective_history,
            accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
            content_context=req.active_context,
            user_id=user_id,
            session=session,
        )
        return AgentRuntimeTurn(
            request=runtime_request,
            session=session,
            assembled_context=assembled,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "research runtime prepare failed session_id=%s",
            session_id,
        )
        return None


def _effective_research_history(runtime_turn, req: ResearchRequest) -> list[dict] | None:
    """Resolve the history list the agent should see for this turn.

    Flag semantics:
      - "primary"   — runtime session is authoritative. If runtime returned an
                      empty transcript we DO NOT silently re-import the
                      client-supplied `history`; the agent sees an empty
                      history. This is what the plan's "grayscale primary
                      mode" expects, so we can A/B test the "frontend stops
                      sending history" rollout.
      - "fallback"  — runtime session is preferred. If it has no transcript,
                      fall back to `req.history` so older clients keep
                      working through the migration.
      - "disabled"  — `req.history` is ignored end-to-end (see
                      `_request_history_for_runtime`).
    """
    if runtime_turn is not None:
        session_history = runtime_turn.session.chat_history()
        if session_history:
            return session_history
    if AGENT_RUNTIME_REQUEST_HISTORY == "fallback" and req.history:
        return req.history
    return None


async def _complete_research_runtime_turn(
    runtime_turn,
    *,
    assistant_text: str,
    tool_calls: list[dict[str, Any]] | None = None,
    latency_ms: int | None = None,
) -> None:
    if runtime_turn is None or not assistant_text:
        return
    try:
        from app.features.agent_runtime.events import (
            append_turn_events,
            context_budget_truncated_event,
            context_snapshot_event,
            tool_call_events,
        )
        from app.features.agent_runtime.runtime import get_agent_runtime

        await get_agent_runtime().complete_turn(
            runtime_turn,
            assistant_text=assistant_text,
            metadata={
                "agent_kind": "research",
                **({"latency_ms": latency_ms} if latency_ms is not None else {}),
            },
        )
        events_to_write: list[dict[str, Any]] = [
            context_snapshot_event(runtime_turn),
            *tool_call_events(tool_calls),
        ]
        budget_event = context_budget_truncated_event(runtime_turn)
        if budget_event is not None:
            events_to_write.append(budget_event)
        await append_turn_events(
            runtime_turn,
            metadata={"agent_kind": "research"},
            events=events_to_write,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "research runtime complete failed session_id=%s",
            getattr(getattr(runtime_turn, "session", None), "session_id", None),
        )


async def _record_research_runtime_error(
    runtime_turn,
    *,
    code: str,
    stage: str,
    message: str,
) -> None:
    if runtime_turn is None:
        return
    try:
        from app.features.agent_runtime.events import append_turn_events, error_event

        await append_turn_events(
            runtime_turn,
            metadata={"agent_kind": "research"},
            events=[error_event(code=code, stage=stage, message=message)],
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "research runtime error event failed session_id=%s",
            getattr(getattr(runtime_turn, "session", None), "session_id", None),
        )


async def _sync_research_runtime_ui_state(
    *,
    user_id: str,
    conversation_id: str | None,
    title: str | None,
    data: dict[str, Any] | None,
    source: str,
) -> None:
    if not conversation_id:
        return
    try:
        from app.features.agent_runtime.events import sync_ui_state

        await sync_ui_state(
            user_id=user_id,
            agent_id=RESEARCH_AGENT_ID,
            session_id=conversation_id,
            agent_kind="research",
            title=title,
            data=data,
            source=source,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "research runtime ui sync failed conversation_id=%s",
            conversation_id,
        )


async def _load_universe() -> Dict[str, Any]:
    """
    Load universe data from DB with in-memory caching.
    Returns dict with universe, sector_stats, freshness, is_valid.
    """
    now = time.monotonic()
    if (
        _universe_cache["universe"] is not None
        and (now - _universe_cache["ts"]) < _CACHE_TTL
    ):
        return _universe_cache

    logger.info("Loading screener universe from DB (cache miss or expired)")

    # Read meta first
    meta_row = await get_cached("screener:meta")
    meta = get_cache_data(meta_row)

    if not meta or not meta.get("chunk_count"):
        return {
            "universe": None,
            "sector_stats": None,
            "freshness": None,
            "is_valid": False,
            "ts": now,
        }

    chunk_count = meta["chunk_count"]

    # Read chunks with limited concurrency (3 at a time)
    sem = asyncio.Semaphore(3)

    async def _read_chunk(idx: int):
        async with sem:
            return await get_cached(f"screener:universe:{idx}")

    chunk_rows = await asyncio.gather(
        *[_read_chunk(i) for i in range(chunk_count)]
    )

    universe: list[dict] = []
    is_valid = True
    freshness = None
    for row in chunk_rows:
        if not row:
            is_valid = False
            continue
        data = get_cache_data(row)
        if data:
            universe.extend(data)
        if not is_cache_valid(row):
            is_valid = False
        if freshness is None:
            freshness = row.get("fetched_at")

    # Read sector stats
    sector_row = await get_cached("screener:sector_stats")
    sector_stats = get_cache_data(sector_row) or []

    # Update cache
    _universe_cache["universe"] = universe if universe else None
    _universe_cache["sector_stats"] = sector_stats
    _universe_cache["freshness"] = freshness
    _universe_cache["is_valid"] = is_valid
    _universe_cache["ts"] = now

    logger.info(
        "Universe cache loaded: %d stocks, %d sectors, valid=%s",
        len(universe), len(sector_stats), is_valid,
    )

    return _universe_cache


@router.post("/refresh")
async def refresh_screener(
    _secret: str = Depends(verify_cron_secret),
):
    """
    Trigger screener universe refresh via tvscreener.
    Protected by X-Cron-Secret header.
    Fetches ~5,800 US stocks with 65+ fields in ~5 seconds.
    """
    from app.features.screener.refresher import refresh_universe

    try:
        results = await refresh_universe()
        # Invalidate in-memory cache so next filter picks up fresh data
        _universe_cache["universe"] = None
        _universe_cache["ts"] = 0.0
        return {
            "success": results.get("success", False),
            "timestamp": utc_now_iso(),
            "results": results,
        }
    except Exception as e:
        logger.exception("Screener refresh failed")
        return {
            "success": False,
            "timestamp": utc_now_iso(),
            "error": str(e),
        }


@router.get("/status")
async def screener_status():
    """Get status of all screener cache entries (no auth required)."""
    try:
        entries = await get_all_status()
        return {
            "success": True,
            "timestamp": utc_now_iso(),
            "entries": entries,
            "count": len(entries),
        }
    except Exception as e:
        logger.exception("Screener status check failed")
        return {
            "success": False,
            "timestamp": utc_now_iso(),
            "error": str(e),
        }


@router.get("/sectors")
async def screener_sectors():
    """Return available sectors with bilingual labels from cached universe."""
    cache = await _load_universe()
    universe = cache["universe"]

    if not universe:
        return {"success": True, "sectors": list(SECTOR_ZH.items()), "count": len(SECTOR_ZH)}

    # Count stocks per sector from actual data
    sector_counts: dict[str, int] = {}
    for stock in universe:
        sector = stock.get("sector")
        if sector:
            sector_counts[sector] = sector_counts.get(sector, 0) + 1

    sectors = []
    for en, zh in sorted(SECTOR_ZH.items()):
        count = sector_counts.get(en, 0)
        if count > 0:
            sectors.append({
                "value": en,
                "label_zh": zh,
                "label": f"{zh} {en}",
                "count": count,
            })

    return {"success": True, "sectors": sectors, "count": len(sectors)}


@router.post("/filter", response_model=FilterResult)
async def filter_stocks(req: FilterRequest):
    """
    Execute a screener filter strategy on cached universe data.
    No auth required - reads from cache only, no external API calls.

    Strategies: hot_sectors, volume_surge, value_discovery,
    high_dividend, momentum, oversold_quality, by_sector, custom
    """
    from app.features.screener.filters import (
        filter_hot_sectors,
        filter_volume_surge,
        filter_value_discovery,
        filter_high_dividend,
        filter_momentum,
        filter_oversold_quality,
        filter_by_sector,
        filter_custom,
        STRATEGIES,
    )

    # Validate strategy
    if req.strategy not in STRATEGIES:
        return FilterResult(
            success=False,
            strategy=req.strategy,
            candidates=[],
            candidate_count=0,
            universe_size=0,
            data_freshness=None,
            is_stale=True,
        )

    # Load universe from in-memory cache (reads DB at most once per 5 min)
    cache = await _load_universe()
    universe = cache["universe"]
    freshness = cache["freshness"]
    is_valid = cache["is_valid"]

    if not universe:
        return FilterResult(
            success=False,
            strategy=req.strategy,
            candidates=[],
            candidate_count=0,
            universe_size=0,
            data_freshness=freshness,
            is_stale=True,
        )

    # Get params with defaults
    params = req.params or {}

    # Execute strategy
    if req.strategy == "hot_sectors":
        sector_stats = cache["sector_stats"] or []
        candidates = filter_hot_sectors(
            universe, sector_stats,
            top_n=params.get("top_n", 3),
            per_sector=params.get("per_sector", 10),
        )

    elif req.strategy == "volume_surge":
        candidates = filter_volume_surge(
            universe,
            ratio_threshold=params.get("ratio_threshold", 2.0),
            limit=params.get("limit", 30),
        )

    elif req.strategy == "value_discovery":
        candidates = filter_value_discovery(
            universe,
            limit=params.get("limit", 30),
        )

    elif req.strategy == "high_dividend":
        candidates = filter_high_dividend(
            universe,
            min_yield=params.get("min_yield", 2.0),
            limit=params.get("limit", 30),
        )

    elif req.strategy == "momentum":
        candidates = filter_momentum(
            universe,
            limit=params.get("limit", 30),
        )

    elif req.strategy == "oversold_quality":
        candidates = filter_oversold_quality(
            universe,
            limit=params.get("limit", 30),
        )

    elif req.strategy == "by_sector":
        if not req.sector:
            return FilterResult(
                success=False,
                strategy=req.strategy,
                candidates=[],
                candidate_count=0,
                universe_size=len(universe),
                data_freshness=freshness,
                is_stale=not is_valid,
            )
        candidates = filter_by_sector(
            universe, req.sector,
            sort_by=params.get("sort_by", "daily_change"),
            limit=params.get("limit", 30),
        )

    elif req.strategy == "custom":
        candidates, _ = filter_custom(universe, params)

    else:
        candidates = []

    # Compute smart narrowing suggestions
    suggestions = compute_narrowing_suggestions(candidates, strategy=req.strategy)

    if posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id="anonymous",
            event="screener_filter_used",
            properties={
                "strategy": req.strategy,
                "result_count": len(candidates),
            },
        )

    return FilterResult(
        success=True,
        strategy=req.strategy,
        candidates=candidates,
        candidate_count=len(candidates),
        universe_size=len(universe),
        data_freshness=freshness,
        is_stale=not is_valid,
        suggestions=suggestions,
    )


def _postprocess_agent_output(
    parsed: Dict[str, Any],
    universe: list[dict],
    freshness: str | None = None,
    is_valid: bool = True,
) -> ResearchResult:
    """Shared post-processing for agent output. Used by both /chat and /chat/stream."""
    from app.features.screener.filters import filter_custom

    agent_message = parsed.get("message", "")
    options_raw = parsed.get("options", [])
    filters = parsed.get("filters", [])
    recommendations_raw = parsed.get("recommendations", [])
    raw_update_results = parsed.get("update_results")
    update_results = bool(filters) if raw_update_results is None else raw_update_results is not False
    navigate = parsed.get("navigate")
    if navigate and not isinstance(navigate, dict):
        navigate = None

    options = [str(o) for o in options_raw if o]

    # Execute filter only when agent signals a criteria change
    candidates = []
    total_matches = 0
    reset_results = False
    if filters and update_results:
        filter_params = {
            "filters": filters,
            "sort_by": parsed.get("sort_by") or "market_cap",
            "sort_order": parsed.get("sort_order") or "desc",
            "limit": parsed.get("limit") or 500,
        }
        candidates, total_matches = filter_custom(universe, filter_params)
        logger.info(
            "Research filter: %d conditions -> %d matches (%d returned)",
            len(filters), total_matches, len(candidates),
        )
    elif not filters and update_results:
        reset_results = True
        logger.info("Research reset: agent cleared all filters")
    elif not update_results:
        logger.info("Research chat turn: skipping filter (update_results=false)")

    # Build lookup tables for symbol validation
    ticker_set: set[str] = set()
    name_to_ticker: dict[str, str] = {}
    for s in universe:
        raw_sym = s.get("symbol", "")
        ticker = raw_sym.split(":")[-1] if raw_sym else ""
        if ticker:
            ticker_set.add(ticker.upper())
        name = s.get("name", "")
        if name and ticker:
            name_to_ticker[name.lower()] = ticker

    def _resolve_symbol(sym: str) -> str | None:
        upper = sym.upper()
        if upper in ticker_set:
            return upper
        if ":" in sym:
            stripped = sym.split(":")[-1].upper()
            if stripped in ticker_set:
                return stripped
        name_lower = sym.lower()
        if name_lower in name_to_ticker:
            return name_to_ticker[name_lower]
        for candidate_name, candidate_ticker in name_to_ticker.items():
            if name_lower in candidate_name or candidate_name in name_lower:
                return candidate_ticker
        for c in candidates:
            c_name = c.get("name", "")
            if c_name and (name_lower in c_name.lower() or c_name.lower() in name_lower):
                c_sym = c.get("symbol", "")
                return c_sym.split(":")[-1].upper() if c_sym else None
        return None

    recommendations = []
    for pr in recommendations_raw:
        if not isinstance(pr, dict) or "symbol" not in pr or "reason" not in pr:
            continue
        resolved = _resolve_symbol(pr["symbol"].strip())
        if resolved:
            recommendations.append({"symbol": resolved, "reason": pr["reason"]})

    if filters and update_results:
        navigate = {"type": "screener", "params": {}, "reason": "filter_results"}

    return ResearchResult(
        success=True,
        message=agent_message,
        options=options,
        candidates=candidates,
        candidate_count=total_matches if total_matches else len(candidates),
        universe_size=len(universe),
        recommendations=recommendations,
        accumulated_filters=filters,
        reset_results=reset_results,
        title=parsed.get("title", ""),
        navigate=navigate,
        data_freshness=freshness,
        is_stale=not is_valid,
    )


@router.post("/pick", response_model=ResearchResult)
async def pick_stocks(req: ResearchRequest, user_id: str = Depends(verify_user_token)):
    """
    Conversation-guided stock research assistant.
    Each call is one turn in an ongoing conversation.
    The agent guides the user to find personalized stocks.
    """
    from app.features.screener.research_agent import get_research_agent

    # Load universe
    cache = await _load_universe()
    universe = cache["universe"]
    freshness = cache["freshness"]
    is_valid = cache["is_valid"]

    if not universe:
        return ResearchResult(
            success=False,
            message="数据还没准备好，请稍等一下再试",
            data_freshness=freshness,
            is_stale=True,
            universe_size=0,
        )

    # Run research agent
    agent = get_research_agent()
    runtime_turn = await _prepare_research_runtime_turn(
        req=req,
        user_id=user_id,
        agent=agent,
    )
    try:
        parsed = await agent.guide(
            message=req.message,
            history=_effective_research_history(runtime_turn, req),
            accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
            universe=universe,
            content_context=req.active_context,
            user_id=user_id,
            session=getattr(runtime_turn, "session", None) if runtime_turn else None,
            prebuilt_prompt=(
                getattr(runtime_turn.assembled_context, "prompt", None)
                if runtime_turn else None
            ),
        )
    except Exception as e:
        logger.error("Research agent error: %s", e)
        await _record_research_runtime_error(
            runtime_turn,
            code="agent_error",
            stage="model_run",
            message="AI 助手出了点问题，请再试一次",
        )
        return ResearchResult(
            success=False,
            message="AI 助手出了点问题，请再试一次",
            universe_size=len(universe),
            data_freshness=freshness,
            is_stale=not is_valid,
        )

    result = _postprocess_agent_output(parsed, universe, freshness, is_valid)
    await _complete_research_runtime_turn(runtime_turn, assistant_text=result.message)
    return result


# ---------------------------------------------------------------------------
# Research Conversation CRUD
# ---------------------------------------------------------------------------


@router.get("/conversations")
async def list_conversations(
    user_id: str = Depends(verify_user_token),
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
):
    """List user's research conversations (lightweight, no data field)."""
    from app.features.screener.conversation_db import list_conversations as db_list

    result = await db_list(user_id, limit=limit, offset=offset, search=search)
    return {
        "conversations": result["items"],
        "has_more": result["has_more"],
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user_id: str = Depends(verify_user_token),
):
    """Get a single conversation with full data."""
    from app.features.screener.conversation_db import (
        get_conversation as db_get,
    )

    conv = await db_get(conversation_id, user_id)
    if not conv:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/conversations", status_code=201)
async def create_conversation(
    req: ConversationSaveRequest,
    user_id: str = Depends(verify_user_token),
):
    """Create a new research conversation."""
    from app.features.screener.conversation_db import (
        create_conversation as db_create,
    )

    result = await db_create(
        user_id=user_id,
        title=req.title,
        data=req.data,
        message_count=req.message_count,
        conversation_id=req.id,
    )
    if not result:
        from fastapi import HTTPException

        raise HTTPException(status_code=500, detail="Failed to create conversation")
    await _sync_research_runtime_ui_state(
        user_id=user_id,
        conversation_id=result.get("id"),
        title=req.title,
        data=req.data,
        source="conversation_create",
    )
    if posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_id,
            event="research_conversation_created",
            properties={},
        )
    return result


@router.put("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    req: ConversationSaveRequest,
    user_id: str = Depends(verify_user_token),
):
    """Update an existing research conversation."""
    from app.features.screener.conversation_db import (
        update_conversation as db_update,
    )

    ok = await db_update(
        conversation_id=conversation_id,
        user_id=user_id,
        title=req.title,
        data=req.data,
        message_count=req.message_count,
        touch=req.touch,
    )
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=404, detail="Conversation not found or not owned"
        )
    await _sync_research_runtime_ui_state(
        user_id=user_id,
        conversation_id=conversation_id,
        title=req.title,
        data=req.data,
        source="conversation_update",
    )
    return {"success": True}


@router.patch("/conversations/{conversation_id}/pin")
async def pin_conversation(
    conversation_id: str,
    req: ConversationPinRequest,
    user_id: str = Depends(verify_user_token),
):
    """Pin or unpin the durable runtime session without touching updated_at."""
    from fastapi import HTTPException
    from app.features.agent_runtime import db as agent_runtime_db
    from app.features.screener.conversation_db import (
        get_conversation as db_get_conversation,
    )

    result = None
    if req.agent_id:
        if req.agent_id not in _PINNABLE_RUNTIME_AGENT_IDS:
            raise HTTPException(status_code=400, detail="Unsupported agent_id")
        agent_ids = (req.agent_id,)
    else:
        agent_ids = _PINNABLE_RUNTIME_AGENT_IDS

    for agent_id in agent_ids:
        result = await agent_runtime_db.pin_session(
            user_id=user_id,
            agent_id=agent_id,
            session_id=conversation_id,
            is_pinned=req.is_pinned,
        )
        if result:
            break

    if not result and req.is_pinned:
        legacy_conversation = await db_get_conversation(conversation_id, user_id)
        if legacy_conversation:
            fallback_agent_id = req.agent_id or _legacy_conversation_agent_id(legacy_conversation)
            result = await agent_runtime_db.pin_session(
                user_id=user_id,
                agent_id=fallback_agent_id,
                session_id=conversation_id,
                is_pinned=req.is_pinned,
                create_if_missing=True,
                title=legacy_conversation.get("title") or "历史对话",
                metadata=_legacy_conversation_metadata(legacy_conversation),
                created_at=legacy_conversation.get("created_at"),
                updated_at=legacy_conversation.get("updated_at"),
            )

    if not result:
        raise HTTPException(status_code=404, detail="Runtime session not found")
    return {
        "success": True,
        "id": conversation_id,
        "agent_id": result.get("agent_id"),
        "is_pinned": bool(result.get("is_pinned")),
        "pinned_at": result.get("pinned_at"),
        "updated_at": result.get("updated_at"),
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user_id: str = Depends(verify_user_token),
):
    """Delete a research conversation."""
    from app.features.screener.conversation_db import (
        delete_conversation as db_delete,
    )

    ok = await db_delete(conversation_id, user_id)
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# /api/research/* -- new unified endpoints (delegates to same logic)
# ---------------------------------------------------------------------------

research_router = APIRouter(prefix="/api/research", tags=["research"])


@research_router.get("/quota")
async def research_quota(
    request: Request,
    user_id: str | None = Depends(optional_user_token),
):
    """Check remaining research quota for the current user/IP."""
    from app.features.quota.service import check_quota

    client_ip = _get_real_ip(request)
    quota = await check_quota(user_id, client_ip)
    return {"success": True, **quota}


@research_router.post("/chat", response_model=ResearchResult)
async def research_chat(
    req: ResearchRequest,
    request: Request,
    user_id: str = Depends(verify_user_token),
):
    """Unified research chat endpoint. Login required (enforced here so the API
    can't be driven anonymously even if the frontend login wall is bypassed)."""
    from app.features.quota.service import consume_quota

    client_ip = _get_real_ip(request)
    quota = await consume_quota(user_id, client_ip)
    if not quota["allowed"]:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail="今日免费提问次数已用完，升级 Max 解锁无限使用",
        )

    logger.info("research_chat called (new endpoint)")
    if posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_id or "anonymous",
            event="research_chat_sent",
            properties={"is_authenticated": bool(user_id)},
        )
    return await pick_stocks(req, user_id or "anonymous")


@research_router.get("/conversations")
async def research_list_conversations(
    user_id: str = Depends(verify_user_token),
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
):
    """List research conversations for the authenticated user."""
    return await list_conversations(user_id, limit=limit, offset=offset, search=search)


@research_router.get("/conversations/{conversation_id}")
async def research_get_conversation(
    conversation_id: str,
    user_id: str = Depends(verify_user_token),
):
    """Get a single conversation."""
    return await get_conversation(conversation_id, user_id)


@research_router.post("/conversations", status_code=201)
async def research_create_conversation(
    req: ConversationSaveRequest,
    user_id: str = Depends(verify_user_token),
):
    """Create a research conversation for the authenticated user."""
    return await create_conversation(req, user_id)


@research_router.put("/conversations/{conversation_id}")
async def research_update_conversation(
    conversation_id: str,
    req: ConversationSaveRequest,
    user_id: str = Depends(verify_user_token),
):
    """Update a research conversation for the authenticated user."""
    return await update_conversation(conversation_id, req, user_id)


@research_router.patch("/conversations/{conversation_id}/pin")
async def research_pin_conversation(
    conversation_id: str,
    req: ConversationPinRequest,
    user_id: str = Depends(verify_user_token),
):
    """Pin or unpin a conversation for the authenticated user."""
    return await pin_conversation(conversation_id, req, user_id)


@research_router.delete("/conversations/{conversation_id}")
async def research_delete_conversation(
    conversation_id: str,
    user_id: str = Depends(verify_user_token),
):
    """Delete a research conversation."""
    return await delete_conversation(conversation_id, user_id)


# ---------------------------------------------------------------------------
# SSE Streaming Endpoint
# ---------------------------------------------------------------------------


@research_router.post("/chat/stream")
async def research_chat_stream(
    req: ResearchRequest,
    request: Request,
    user_id: str = Depends(verify_user_token),
):
    """SSE streaming research chat. Login required (enforced here so the API
    can't be driven anonymously even if the frontend login wall is bypassed)."""
    import json as _json

    from app.features.quota.service import consume_quota
    from app.features.screener.research_agent import get_research_agent

    # Check and consume quota before streaming
    client_ip = _get_real_ip(request)
    quota = await consume_quota(user_id, client_ip)
    if not quota["allowed"]:
        async def quota_error():
            yield "data: %s\n\n" % _json.dumps(
                {
                    "type": "error",
                    "message": "今日免费提问次数已用完，升级 Max 解锁无限使用",
                    "quota_exceeded": True,
                },
                ensure_ascii=False,
            )
        return StreamingResponse(quota_error(), media_type="text/event-stream")

    effective_user_id = user_id or "anonymous"
    logger.info("research_chat_stream called by user %s", effective_user_id[:12])

    agent = get_research_agent()

    async def event_generator():
        from app.core.logging import use_turn_context
        from app.features.screener.agent import _ensure_universe
        from app.features.screener.research_agent import _recent_reports

        request_started_at = time.monotonic()
        turn_ctx = use_turn_context(
            turn_id=req.turn_id,
            session_id=_runtime_session_id(req),
            agent_id=RESEARCH_AGENT_ID,
        )
        turn_ctx.__enter__()

        try:
            from app.features.daily_report.db import list_reports
            reports_result = await list_reports(limit=7, offset=0)
            _recent_reports.set(reports_result.get("data", []) if reports_result else [])
        except Exception:
            _recent_reports.set([])

        # Reuse guide()'s prompt building. Universe is NOT pre-loaded here —
        # screener tools (execute_screener / filter_by_tickers / ...) trigger
        # `_ensure_universe()` on demand, so greeting / stock / macro / report
        # turns no longer pay the 6s cold-cache fee.
        runtime_turn = await _prepare_research_runtime_turn(
            req=req,
            user_id=user_id,
            agent=agent,
        )
        effective_history = _effective_research_history(runtime_turn, req)
        runtime_session = (
            getattr(runtime_turn, "session", None) if runtime_turn else None
        )
        if runtime_turn is not None:
            prompt = runtime_turn.assembled_context.prompt
        else:
            prompt = await agent.build_prompt(
                message=req.message,
                history=effective_history,
                accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
                content_context=req.active_context,
                user_id=effective_user_id,
                session=runtime_session,
            )

        async def _shrunk_prompt_factory() -> str:
            # Mirror KOL agent's retry-with-shrunk-history: drop everything
            # except the last user/assistant exchange and rebuild. The shrunk
            # prompt explicitly passes session=None so build_prompt does not
            # silently re-expand the history from the durable transcript.
            tail = (effective_history or [])[-2:]
            return await agent.build_prompt(
                message=req.message,
                history=tail,
                accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
                content_context=req.active_context,
                user_id=effective_user_id,
                session=None,
            )

        tool_descriptions: dict[str, str] = {}
        tool_calls: list[dict[str, Any]] = []
        message_delta_seen = False

        try:
            async for event in agent.run_stream(
                prompt,
                retry_prompt_factory=_shrunk_prompt_factory,
            ):
                if event.get("type") == "done":
                    # Apply same post-processing as /chat (filter, symbol resolve, etc.)
                    parsed = event.get("parsed", {})
                    # Universe is only needed downstream if the agent actually
                    # produced filters or recommendations — otherwise it stays
                    # unloaded and this turn pays zero cold-cache cost.
                    needs_universe = bool(parsed.get("filters")) or bool(parsed.get("recommendations"))
                    if needs_universe:
                        universe_data = await _ensure_universe()
                        freshness = _universe_cache.get("freshness")
                        is_valid = _universe_cache.get("is_valid", True)
                    else:
                        universe_data = []
                        freshness = None
                        is_valid = True
                    result = _postprocess_agent_output(parsed, universe_data, freshness, is_valid)
                    latency_ms = int((time.monotonic() - request_started_at) * 1000)
                    await _complete_research_runtime_turn(
                        runtime_turn,
                        assistant_text=result.message,
                        tool_calls=tool_calls,
                        latency_ms=latency_ms,
                    )
                    if result.message and not message_delta_seen:
                        for chunk in _stream_text_chunks(result.message):
                            yield "data: %s\n\n" % _json.dumps(
                                {"type": "message_delta", "text": chunk},
                                ensure_ascii=False, default=str,
                            )
                            await asyncio.sleep(0.015)
                    yield "data: %s\n\n" % _json.dumps(
                        {"type": "done", "result": result.model_dump()},
                        ensure_ascii=False, default=str,
                    )
                elif event.get("type") == "message_delta":
                    message_delta_seen = True
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
                elif event.get("type") == "tool_call_start":
                    tool_name = event.get("tool")
                    if tool_name:
                        tool_descriptions[str(tool_name)] = str(event.get("description") or "")
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
                elif event.get("type") == "tool_call_end":
                    tool_name = event.get("tool")
                    if tool_name:
                        tool_calls.append({
                            "name": str(tool_name),
                            "description": tool_descriptions.get(str(tool_name)),
                            "duration_ms": event.get("duration_ms"),
                            "ok": True,
                            "result_preview": event.get("result_preview"),
                            "result_hash": event.get("result_hash"),
                            "result_truncated": bool(event.get("result_truncated")),
                        })
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
                elif event.get("type") == "error":
                    await _record_research_runtime_error(
                        runtime_turn,
                        code=str(event.get("code") or "agent_error"),
                        stage="model_run",
                        message=str(event.get("message") or "AI 助手出了点问题，请再试一次"),
                    )
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
                else:
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
        finally:
            _recent_reports.set([])
            turn_ctx.__exit__(None, None, None)

    return StreamingResponse(
        with_heartbeat(event_generator(), stream_name="research_chat"),
        media_type="text/event-stream",
    )
