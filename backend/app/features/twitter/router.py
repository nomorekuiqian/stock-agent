"""
Twitter KOL - API Router

Endpoints:
  POST /api/twitter/fetch-configured-kols  (cron, batch fetch every Twitter list in the catalog)
  POST /api/twitter/sync-kol-list          (cron, sync one Twitter list's membership into kol_accounts)
  GET  /api/twitter/kol-accounts           (auth, list configured KOL catalog)
  GET  /api/twitter/fetch-runs             (cron, list recent fetch run records)
  GET  /api/twitter/tweets                 (auth, list stored tweets)
  GET  /api/twitter/stats                  (auth, tweet statistics)
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.core.deps import verify_cron_secret, verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.twitter import db
from app.features.twitter.methodology_extractor import extract_methodology_for_category
from app.features.twitter.methodology_models import MethodologyCategory
from app.features.twitter.models import FetchConfiguredKolsRequest
from app.features.twitter.service import (
    fetch_configured_kols,
    sync_kol_list,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/twitter", tags=["twitter"])


class ExtractMethodologyRequest(BaseModel):
    username: str = Field(..., min_length=1)
    category: MethodologyCategory
    methodology_version: str = Field(default="v1.0", min_length=1)
    limit: int = Field(default=2000, ge=20, le=5000)


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


@router.post("/extract-methodology")
async def extract_methodology(
    body: ExtractMethodologyRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """Extract and persist one methodology YAML + review artifact set."""
    logger.info(
        "extract-methodology: @%s category=%s version=%s limit=%d",
        body.username,
        body.category,
        body.methodology_version,
        body.limit,
    )
    output, artifacts = await extract_methodology_for_category(
        username=body.username,
        category=body.category,
        methodology_version=body.methodology_version,
        limit=body.limit,
    )
    return {
        "success": True,
        "username": body.username,
        "category": body.category,
        "tweet_count": output.source_tweet_count,
        "data_preferences_count": len(output.data_preferences),
        "analytical_steps_count": len(output.analytical_process),
        "decision_criteria_count": len(output.decision_criteria),
        "communication_patterns_count": len(output.communication_patterns),
        "veto_rules_count": len(output.veto_rules),
        "falsifiability_rules_count": len(output.falsifiability_rules),
        "insufficient_evidence_notes": output.insufficient_evidence_notes,
        "artifacts": artifacts,
    }


# ---------------------------------------------------------------------------
# Configured KOL catalog batch fetch
# ---------------------------------------------------------------------------

@router.post("/fetch-configured-kols")
async def fetch_configured_kols_endpoint(
    body: FetchConfiguredKolsRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Iterate enabled KOL catalog and fetch every Twitter list. One call per
    list covers all its members; failures are isolated per list.
    """
    logger.info(
        "fetch-configured-kols: list_lookback=%.1fh list_safety_pages=%d",
        body.list_lookback_hours, body.list_safety_max_pages,
    )
    return await fetch_configured_kols(
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
