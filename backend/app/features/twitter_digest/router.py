"""
Twitter KOL Digest - V2 API Router.

Endpoints:
  POST /api/twitter-digest/generate   (cron_secret) — trigger pipeline; returns + persists DailyDigest
  GET  /api/twitter-digest/latest     (auth)        — most recent persisted digest
  GET  /api/twitter-digest/{date}     (auth)        — specific date's digest (YYYY-MM-DD)

V2.5 will layer paywall / Stripe entitlement on the GET endpoints.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.deps import verify_admin_or_nonprod_or_cron, verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.twitter_digest import db
from app.features.twitter_digest.models import DailyDigest
from app.features.twitter_digest.service import generate_daily_digest

logger = get_logger(__name__)

router = APIRouter(prefix="/api/twitter-digest", tags=["twitter-digest"])

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.post("/generate", response_model=DailyDigest)
async def generate_endpoint(
    window_hours: int = Query(36, ge=12, le=72),
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
