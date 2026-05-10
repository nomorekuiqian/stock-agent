"""
Twitter KOL - API Router

Endpoints:
  POST /api/twitter/fetch-tweets           (cron, fetch & store tweets from TwitterAPI.io)
  POST /api/twitter/search-tweets          (cron, advanced_search history backfill)
  POST /api/twitter/fetch-articles         (cron, fetch & store article content)
  POST /api/twitter/fetch-configured-kols  (cron, batch fetch the configured catalog)
  GET  /api/twitter/kol-accounts           (auth, list configured KOL catalog)
  GET  /api/twitter/fetch-runs             (cron, list recent fetch run records)
  GET  /api/twitter/tweets                 (auth, list stored tweets)
  GET  /api/twitter/stats                  (auth, tweet statistics)
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import verify_cron_secret, verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.twitter import db
from app.shared.twitter_kol_config import validate_catalog
from app.features.twitter.models import (
    FetchConfiguredKolsRequest,
    FetchTweetsRequest,
    SearchTweetsRequest,
)
from app.features.twitter.service import (
    fetch_and_store_tweets,
    fetch_and_store_articles,
    fetch_configured_kols,
    fetch_tweets_by_search,
    sync_kol_list,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/twitter", tags=["twitter"])


@router.post("/fetch-tweets")
async def fetch_tweets(
    body: FetchTweetsRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Fetch tweets from a Twitter user and store in database.
    Protected by cron secret — admin operation only.
    """
    logger.info("Starting tweet fetch for @%s (max_pages=%d)", body.username, body.max_pages)
    result = await fetch_and_store_tweets(
        username=body.username,
        max_pages=body.max_pages,
    )
    return result


@router.post("/search-tweets")
async def search_tweets(
    body: SearchTweetsRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Fetch older tweets using advanced_search with daily time windows.
    Supplements timeline-based fetching which has depth limits.
    Protected by cron secret -- admin operation only.
    """
    logger.info(
        "Starting search fetch for @%s (months_back=%d)",
        body.username,
        body.months_back,
    )
    result = await fetch_tweets_by_search(
        username=body.username,
        months_back=body.months_back,
    )
    return result


@router.post("/fetch-articles")
async def fetch_articles(
    body: FetchTweetsRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Fetch full article content for tweets that are articles.
    Protected by cron secret — admin operation only.
    """
    logger.info("Starting article fetch for @%s", body.username)
    result = await fetch_and_store_articles(username=body.username)
    return result


@router.get("/tweets")
@limiter.limit("30/minute")
async def list_tweets(
    request: Request,
    username: str = Query(..., min_length=1),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _user_id: str = Depends(verify_user_token),
):
    """List stored tweets for a KOL, optionally filtered by category."""
    tweets = await db.get_tweets(
        username=username,
        category=category,
        page=page,
        limit=limit,
    )
    return {"success": True, "data": tweets}


@router.get("/stats")
@limiter.limit("30/minute")
async def tweet_stats(
    request: Request,
    username: str = Query(..., min_length=1),
    _user_id: str = Depends(verify_user_token),
):
    """Get tweet statistics for a KOL."""
    stats = await db.get_tweet_stats(username)
    if stats is None:
        return {"success": False, "error": "Failed to get stats"}
    return {"success": True, "data": stats}


# ---------------------------------------------------------------------------
# Configured KOL catalog batch fetch
# ---------------------------------------------------------------------------

@router.post("/fetch-configured-kols")
async def fetch_configured_kols_endpoint(
    body: FetchConfiguredKolsRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Iterate the enabled KOL catalog and fetch each timeline.
    Each KOL is isolated; one failure does not block the rest.
    """
    catalog_errors = validate_catalog()
    if catalog_errors:
        logger.error("KOL catalog validation failed: %s", catalog_errors)
        return {"success": False, "error": "catalog_invalid", "details": catalog_errors}

    logger.info(
        "fetch-configured-kols: max_pages=%d window=%dh include_articles=%s "
        "list_lookback=%.1fh list_safety_pages=%d",
        body.max_pages_per_kol, body.safety_window_hours, body.include_articles,
        body.list_lookback_hours, body.list_safety_max_pages,
    )
    return await fetch_configured_kols(
        max_pages_per_kol=body.max_pages_per_kol,
        safety_window_hours=body.safety_window_hours,
        include_articles=body.include_articles,
        list_lookback_hours=body.list_lookback_hours,
        list_safety_max_pages=body.list_safety_max_pages,
    )


@router.get("/kol-accounts")
@limiter.limit("60/minute")
async def list_kol_accounts(
    request: Request,
    enabled_only: bool = Query(True),
    _user_id: str = Depends(verify_user_token),
):
    """Return the KOL catalog from the kol_accounts DB table."""
    rows = await db.list_kol_accounts(enabled_only=enabled_only)
    return {"success": True, "data": rows}


@router.post("/sync-kol-list")
async def sync_kol_list_endpoint(
    list_id: str = Query(..., description="Twitter list ID"),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Sync a Twitter list's membership into kol_accounts.

    - New members upserted with source="list:<list_id>", enabled=true
    - Members removed from the Twitter list get enabled=false (soft delete)
    - followers/bio/display_name refreshed for existing entries
    """
    logger.info("sync-kol-list: list_id=%s", list_id)
    return await sync_kol_list(list_id)


@router.get("/fetch-runs")
async def list_fetch_runs_endpoint(
    run_id: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    _secret: str = Depends(verify_cron_secret),
):
    """List recent fetch_runs records, optionally filtered by run_id or username."""
    runs = await db.list_fetch_runs(run_id=run_id, username=username, limit=limit)
    return {"success": True, "data": runs}
