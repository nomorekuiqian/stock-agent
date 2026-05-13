"""
Twitter KOL Digest — API Router.

Endpoints:
  POST /api/twitter-digest/generate   (cron_secret) — trigger pipeline; returns + persists DailyDigest
  POST /api/twitter-digest/broadcast  (cron_secret) — send today's digest to Pro/Max subscribers
  GET  /api/twitter-digest/latest     (auth)        — most recent persisted digest
  GET  /api/twitter-digest/preview    (open)        — render persisted digest as HTML email (for /email-test)
  GET  /api/twitter-digest/{date}     (auth)        — specific date's digest (YYYY-MM-DD)

Paywall (Stripe entitlement) will be layered on the GET endpoints in a
later phase — see the TODOs on `/latest` and `/{date}` handlers.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.deps import (
    verify_admin_or_nonprod_or_cron,
    verify_cron_secret,
    verify_user_token,
)
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


@router.post("/broadcast")
async def broadcast_endpoint(
    date: Optional[str] = Query(None, description="ISO YYYY-MM-DD; default = latest"),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Send today's persisted digest to Pro/Max subscribers via Resend Batch.

    Cron-driven (北京 08:00 工作日). Pulls the persisted DailyDigest for
    `date` (defaults to latest), renders the HTML email, and batches sends
    to all users with the `personal_digest_email` entitlement.

    Fails with 500 if the digest is missing OR has no ticker_theses /
    macro_threads (don't send empty mail to paying users).
    """
    from app.features.subscription.email_service import get_email_service
    from app.features.twitter_digest.service import _digest_is_empty

    if date and not _ISO_DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    digest = (
        await db.get_digest_by_date(date) if date
        else await db.get_latest_digest()
    )
    if not digest:
        raise HTTPException(status_code=500, detail="No digest available to broadcast")

    if _digest_is_empty(digest):
        raise HTTPException(
            status_code=500,
            detail="Digest has no ticker_theses or macro_threads — refusing to broadcast empty mail",
        )

    digest_dict = digest.model_dump()
    # Prefer the explicit query param, then the persisted BJT business date,
    # and only fall back to slicing the UTC generated_at for legacy rows
    # (will be off by a day around the 22:00 UTC cron — accept for history).
    derived_date = (
        date
        or digest.date
        or (digest.generated_at[:10] if digest.generated_at else None)
    )
    if derived_date:
        digest_dict["date"] = derived_date

    email_service = get_email_service()
    result = await email_service.broadcast_twitter_digest(digest_dict)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "broadcast failed"))

    logger.info(
        "twitter-digest broadcast: date=%s total=%d sent=%d failed=%d",
        derived_date, result.get("total", 0),
        result.get("sent", 0), result.get("failed", 0),
    )
    return result


@router.post("/enrich")
async def enrich_endpoint(
    window_hours: int = Query(24, ge=12, le=72),
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """
    Daily enrichment cron entrypoint.

    Walks `kol_tweets` rows where `symbols IS NULL` and `created_at >= window_hours`
    ago, runs flash-lite to populate {quality, ticker_stances, sectors}, and
    writes back into `symbols` JSONB. Idempotent: already-enriched rows are
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
    user_id: str = Depends(verify_user_token),  # noqa: ARG001 — auth-only
):
    """Latest persisted digest.

    Free-trial phase: open to any signed-in user. When the trial ends, gate
    behind `has_entitlement(user_id, "twitter_digest_email")` (or the chosen
    paid feature key) — see commented gating helper in this module's history.
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
    user_id: str = Depends(verify_user_token),  # noqa: ARG001 — auth-only
):
    """Specific date's digest (YYYY-MM-DD).

    Free-trial phase: open to any signed-in user (same as `/latest`).
    Validates the date format here so the path param can never reach the edge
    function as anything but a plain ISO date — defensive even though Insforge
    SDK already parameterizes the query.
    """
    if not _ISO_DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    digest = await db.get_digest_by_date(date)
    if not digest:
        raise HTTPException(status_code=404, detail=f"No digest for {date}")
    return digest
