"""
Stock Screener - API Router

Endpoints:
  POST /api/screener/refresh       (cron, protected)
  GET  /api/screener/status        (monitoring, public)
  POST /api/screener/filter        (screener queries, public)
  POST /api/screener/ask           (agent NL queries, auth required)
"""

import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.deps import verify_cron_secret, verify_user_token
from app.core.logging import get_logger
from app.utils.timezone import utc_now_iso
from app.features.screener.db import (
    get_all_status,
    get_cached,
    get_cache_data,
    is_cache_valid,
)
from app.features.screener.models import (
    AskRequest,
    AskResult,
    FilterRequest,
    FilterResult,
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
        candidates = filter_custom(universe, params)

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


@router.post("/ask", response_model=AskResult)
async def ask_screener(req: AskRequest, user_id: str = Depends(verify_user_token)):
    """
    Natural language screener query via AI agent.
    Accepts a message + current filters + history, returns filtered candidates.
    """
    from app.features.screener.agent import get_screener_agent
    from app.features.screener.filters import filter_custom

    # Load universe
    cache = await _load_universe()
    universe = cache["universe"]
    freshness = cache["freshness"]
    is_valid = cache["is_valid"]

    if not universe:
        return AskResult(
            success=False,
            summary="数据尚未加载，请稍后再试",
            data_freshness=freshness,
            is_stale=True,
        )

    # Run agent to parse natural language into filters
    agent = get_screener_agent()
    try:
        parsed = await agent.parse(
            message=req.message,
            current_filters=req.current_filters if req.current_filters else None,
            history=req.history if req.history else None,
            universe=universe,
        )
    except Exception as e:
        logger.error("Screener agent error: %s", e)
        return AskResult(
            success=False,
            summary="AI 解析失败，请换个说法试试",
            universe_size=len(universe),
            data_freshness=freshness,
            is_stale=not is_valid,
        )

    strategy = parsed.get("strategy", "custom")
    summary = parsed.get("summary", "")

    # Build filter params from agent output
    filter_params = {}
    if parsed.get("filters"):
        filter_params["filters"] = parsed["filters"]
    if parsed.get("sort_by"):
        filter_params["sort_by"] = parsed["sort_by"]
        filter_params["sort_order"] = parsed.get("sort_order", "desc")
    if parsed.get("limit"):
        filter_params["limit"] = parsed["limit"]

    # Execute filter
    if strategy == "custom" or strategy not in (
        "hot_sectors", "volume_surge", "value_discovery",
        "high_dividend", "momentum", "oversold_quality",
        "by_sector",
    ):
        candidates = filter_custom(universe, filter_params)
    else:
        # For preset strategies, delegate to the filter endpoint logic
        filter_req = FilterRequest(
            strategy=strategy,
            sector=parsed.get("sector"),
            params=filter_params if filter_params else None,
        )
        result = await filter_stocks(filter_req)
        return AskResult(
            success=result.success,
            filter_used={
                "strategy": strategy,
                "sector": parsed.get("sector"),
                "params": filter_params,
            },
            candidates=result.candidates,
            candidate_count=result.candidate_count,
            universe_size=result.universe_size,
            suggestions=result.suggestions,
            summary=summary,
            data_freshness=result.data_freshness,
            is_stale=result.is_stale,
        )

    # Compute suggestions
    suggestions = compute_narrowing_suggestions(candidates, strategy="custom")

    return AskResult(
        success=True,
        filter_used={
            "strategy": strategy,
            "params": filter_params,
        },
        candidates=candidates,
        candidate_count=len(candidates),
        universe_size=len(universe),
        suggestions=suggestions,
        summary=summary,
        data_freshness=freshness,
        is_stale=not is_valid,
    )
