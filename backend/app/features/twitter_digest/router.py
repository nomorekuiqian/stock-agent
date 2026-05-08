"""
Twitter KOL Digest - V2 API Router.

Endpoints:
  POST /api/twitter-digest/generate   (cron_secret) — trigger pipeline; returns + persists DailyDigest
  GET  /api/twitter-digest/latest     (auth)        — most recent persisted digest
  GET  /api/twitter-digest/preview    (open)        — render persisted digest as HTML email (for /email-test)
  GET  /api/twitter-digest/{date}     (auth)        — specific date's digest (YYYY-MM-DD)

V2.5 will layer paywall / Stripe entitlement on the GET endpoints.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.deps import verify_admin_or_nonprod_or_cron, verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.subscription.email_templates import format_twitter_digest_html
from app.features.twitter_digest import db
from app.features.twitter_digest.enrichment import enrich_unenriched_tweets
from app.features.twitter_digest.models import DailyDigest
from app.features.twitter_digest.service import generate_daily_digest

logger = get_logger(__name__)

router = APIRouter(prefix="/api/twitter-digest", tags=["twitter-digest"])

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.post("/generate", response_model=DailyDigest)
async def generate_endpoint(
    window_hours: int = Query(24, ge=12, le=72),
    persist: bool = Query(True),
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """
    Trigger the daily digest pipeline (LLM-backed). Returns the full DailyDigest
    JSON and (by default) upserts it into `kol_daily_digests` keyed by today's date.

    Access control: cron secret, admin user, or non-production environment only.
    Regular logged-in users in production are blocked from triggering regen — they
    can read the latest persisted digest via GET /latest.
    """
    logger.info(
        "twitter-digest generate: window_hours=%d persist=%s auth=%s",
        window_hours, persist, auth_path,
    )
    digest = await generate_daily_digest(window_hours=window_hours, persist=persist)
    return digest


@router.post("/enrich")
async def enrich_endpoint(
    window_hours: int = Query(24, ge=12, le=72),
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """
    V3 daily enrichment cron entrypoint.

    Walks `kol_tweets` rows where `symbols IS NULL` and `created_at >= window_hours`
    ago, runs flash-lite to populate {quality, summary, tickers, sectors, events},
    and writes back into `symbols` JSONB. Idempotent: already-enriched rows are
    skipped at the data-pull layer.

    Returns a summary suitable for cron logging.
    """
    logger.info(
        "twitter-digest enrich: window_hours=%d auth=%s", window_hours, auth_path,
    )
    summary = await enrich_unenriched_tweets(window_hours=window_hours)
    return {"success": True, **summary}


@router.get("/latest", response_model=DailyDigest)
@limiter.limit("30/minute")
async def get_latest(
    request: Request,
    _user_id: str = Depends(verify_user_token),
):
    """
    Latest persisted digest.

    TODO(V2.5): replace verify_user_token with verify_pro_user (Stripe entitlement).
    Codex review flagged this as a P1 paywall gap; deferred to V2.5 per product plan.
    """
    digest = await db.get_latest_digest()
    if not digest:
        raise HTTPException(status_code=404, detail="No digest available yet")
    return digest


@router.get("/preview")
@limiter.limit("30/minute")
async def get_email_preview(
    request: Request,
    date: Optional[str] = Query(None, description="ISO YYYY-MM-DD; default = latest"),
):
    """
    Render a persisted digest as an HTML email body for the /email-test page.

    No auth — matches other preview endpoints (/report/preview, /weekly-report/preview).
    Returns the rendered HTML plus minimal metadata for the preview UI.
    """
    if date:
        if not _ISO_DATE_RE.match(date):
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
        digest = await db.get_digest_by_date(date)
    else:
        digest = await db.get_latest_digest()

    if not digest:
        raise HTTPException(status_code=404, detail="No digest available")

    digest_dict = digest.model_dump()
    # `kol_daily_digests.date` is the canonical key; we don't carry it through
    # the Pydantic model, so derive from generated_at — close enough for preview
    # (off by one only if generation crosses midnight UTC, which we don't run).
    derived_date = date or (digest.generated_at[:10] if digest.generated_at else None)

    html = format_twitter_digest_html(
        digest_dict,
        digest_date=derived_date,
        digest_id=None,
    )
    return {
        "success": True,
        "html": html,
        "digest_date": derived_date,
        "input_tweet_count": digest.input_tweet_count,
        "tracked_kol_count": len(digest.tracked_kols),
    }


@router.get("/{date}", response_model=DailyDigest)
@limiter.limit("30/minute")
async def get_by_date(
    request: Request,
    date: str,
    _user_id: str = Depends(verify_user_token),
):
    """
    Specific date's digest, format YYYY-MM-DD.

    Validates the date format here so the path param can never reach the edge
    function as anything but a plain ISO date — defensive even though Insforge
    SDK already parameterizes the query.

    TODO(V2.5): replace verify_user_token with verify_pro_user (Stripe entitlement).
    """
    if not _ISO_DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    digest = await db.get_digest_by_date(date)
    if not digest:
        raise HTTPException(status_code=404, detail=f"No digest for {date}")
    return digest
