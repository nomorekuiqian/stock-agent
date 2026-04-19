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
  DELETE /api/screener/conversations/{id}    (delete, auth required)

  POST /api/research/chat                    (guided stock research, auth required)
  GET  /api/research/conversations           (list, auth required)
  GET  /api/research/conversations/{id}      (get, auth required)
  POST /api/research/conversations           (create, auth required)
  PUT  /api/research/conversations/{id}      (update, auth required)
  DELETE /api/research/conversations/{id}    (delete, auth required)
"""

import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.deps import verify_cron_secret, verify_user_token, optional_user_token
from app.core.rate_limit import _get_real_ip
from app.core.logging import get_logger
from app.utils.timezone import utc_now_iso
from app.features.screener.db import (
    get_all_status,
    get_cached,
    get_cache_data,
    is_cache_valid,
)
from app.features.screener.models import (
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
    update_results = parsed.get("update_results", True)

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
        navigate=parsed.get("navigate"),
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
    try:
        parsed = await agent.guide(
            message=req.message,
            history=req.history if req.history else None,
            accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
            universe=universe,
            content_context=req.active_context,
            user_id=user_id,
        )
    except Exception as e:
        logger.error("Research agent error: %s", e)
        return ResearchResult(
            success=False,
            message="AI 助手出了点问题，请再试一次",
            universe_size=len(universe),
            data_freshness=freshness,
            is_stale=not is_valid,
        )

    result = _postprocess_agent_output(parsed, universe, freshness, is_valid)
    return result


# ---------------------------------------------------------------------------
# Research Conversation CRUD
# ---------------------------------------------------------------------------


@router.get("/conversations")
async def list_conversations(user_id: str = Depends(verify_user_token)):
    """List user's research conversations (lightweight, no data field)."""
    from app.features.screener.conversation_db import list_conversations as db_list

    items = await db_list(user_id)
    return {"conversations": items}


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
    )
    if not result:
        from fastapi import HTTPException

        raise HTTPException(status_code=500, detail="Failed to create conversation")
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
    )
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=404, detail="Conversation not found or not owned"
        )
    return {"success": True}


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
    user_id: str | None = Depends(optional_user_token),
):
    """Unified research chat endpoint. Open to all users with quota."""
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
    return await pick_stocks(req, user_id or "anonymous")


@research_router.get("/conversations")
async def research_list_conversations(user_id: str | None = Depends(optional_user_token)):
    """List research conversations. Anonymous users get empty list."""
    if not user_id:
        return {"conversations": []}
    return await list_conversations(user_id)


@research_router.get("/conversations/{conversation_id}")
async def research_get_conversation(
    conversation_id: str,
    user_id: str | None = Depends(optional_user_token),
):
    """Get a single conversation."""
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Login required to load conversations")
    return await get_conversation(conversation_id, user_id)


@research_router.post("/conversations", status_code=201)
async def research_create_conversation(
    req: ConversationSaveRequest,
    user_id: str | None = Depends(optional_user_token),
):
    """Create a research conversation. Silently skip for anonymous."""
    if not user_id:
        return {"id": None, "skipped": True}
    return await create_conversation(req, user_id)


@research_router.put("/conversations/{conversation_id}")
async def research_update_conversation(
    conversation_id: str,
    req: ConversationSaveRequest,
    user_id: str | None = Depends(optional_user_token),
):
    """Update a research conversation. Silently skip for anonymous."""
    if not user_id:
        return {"success": True, "skipped": True}
    return await update_conversation(conversation_id, req, user_id)


@research_router.delete("/conversations/{conversation_id}")
async def research_delete_conversation(
    conversation_id: str,
    user_id: str | None = Depends(optional_user_token),
):
    """Delete a research conversation."""
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Login required")
    return await delete_conversation(conversation_id, user_id)


# ---------------------------------------------------------------------------
# SSE Streaming Endpoint
# ---------------------------------------------------------------------------


@research_router.post("/chat/stream")
async def research_chat_stream(
    req: ResearchRequest,
    request: Request,
    user_id: str | None = Depends(optional_user_token),
):
    """SSE streaming research chat. Open to all users with quota."""
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

    cache = await _load_universe()
    universe = cache["universe"]

    if not universe:
        async def error_stream():
            yield "data: %s\n\n" % _json.dumps(
                {"type": "error", "message": "数据还没准备好，请稍等一下再试"},
                ensure_ascii=False,
            )
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    agent = get_research_agent()

    async def event_generator():
        from app.features.screener.agent import _current_universe
        from app.features.screener.research_agent import _recent_reports

        _current_universe.set(universe if universe else [])

        try:
            from app.features.daily_report.db import list_reports
            reports_result = await list_reports(limit=7, offset=0)
            _recent_reports.set(reports_result.get("data", []) if reports_result else [])
        except Exception:
            _recent_reports.set([])

        # Reuse guide()'s prompt building
        prompt = await agent.build_prompt(
            message=req.message,
            history=req.history if req.history else None,
            accumulated_filters=req.accumulated_filters if req.accumulated_filters else None,
            universe_size=len(universe),
            content_context=req.active_context,
            user_id=effective_user_id,
        )

        freshness = cache.get("freshness")
        is_valid = cache.get("is_valid", True)

        try:
            async for event in agent.run_stream(prompt, universe):
                if event.get("type") == "done":
                    # Apply same post-processing as /chat (filter, symbol resolve, etc.)
                    parsed = event.get("parsed", {})
                    result = _postprocess_agent_output(parsed, universe, freshness, is_valid)
                    yield "data: %s\n\n" % _json.dumps(
                        {"type": "done", "result": result.model_dump()},
                        ensure_ascii=False, default=str,
                    )
                else:
                    yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)
        finally:
            _current_universe.set([])
            _recent_reports.set([])

    return StreamingResponse(event_generator(), media_type="text/event-stream")
