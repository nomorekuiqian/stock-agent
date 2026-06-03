"""
Twitter KOL Digest — API Router.

Endpoints:
  POST /api/twitter-digest/generate   (cron_secret) — trigger pipeline; returns + persists DailyDigest
  POST /api/twitter-digest/broadcast  (cron_secret) — send today's digest to Max opt-in subscribers
  GET  /api/twitter-digest/latest     (open)        — most recent persisted digest; locked unless Max
  GET  /api/twitter-digest/teaser/latest (open)     — lightweight headline + hot lists for CTA surfaces
  GET  /api/twitter-digest/archive    (open)        — paginated lightweight digest archive
  GET  /api/twitter-digest/archive/teaser (open)    — alias for archive, kept for backwards compat
  GET  /api/twitter-digest/preview    (open)        — render persisted digest as HTML email (for /email-test)
  GET  /api/twitter-digest/{date}     (open)        — specific date's digest; locked unless Max

`latest` and `{date}` return the same `DailyDigest` shape for everyone, but
the heavy paid content (synthesis_zh / arguments / evidence / why_it_matters_zh)
is stripped when the caller lacks the `twitter_digest` entitlement. The
`is_locked: bool` plus per-section `*_count` fields drive the locked skeleton
rendered on the same frontend page that Max users see — so free and Max share
the exact same component tree, differing only in section content.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.deps import (
    optional_user_token,
    verify_admin_or_nonprod_or_cron,
    verify_cron_secret,
)
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.payment.entitlements import has_entitlement
from app.features.subscription.email_templates import format_twitter_digest_html
from app.features.twitter_digest import db
from app.features.twitter_digest.enrichment import enrich_unenriched_tweets
from app.features.twitter_digest.models import (
    DailyDigest,
    DailyDigestArchiveResponse,
    TwitterDigestTeaser,
)
from app.features.twitter_digest.service import generate_daily_digest

logger = get_logger(__name__)

router = APIRouter(prefix="/api/twitter-digest", tags=["twitter-digest"])

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TWITTER_DIGEST_FEATURE = "twitter_digest"


async def _viewer_has_full_access(user_id: Optional[str]) -> bool:
    """True iff the optional bearer user has the twitter_digest entitlement."""
    if not user_id:
        return False
    return await has_entitlement(user_id, _TWITTER_DIGEST_FEATURE)


def _to_locked_digest(digest: DailyDigest) -> DailyDigest:
    """Project a full digest into the paywalled shape.

    Preserves the structural skeleton — headline, hot lists, per-section
    titles, KOL lists, tweet counts, ticker/side classification — so the
    frontend can render the same layout as a Max user would see. Strips the
    paid editorial content (synthesis paragraphs, KOL arguments, evidence,
    why-it-matters write-ups) and replaces it with per-section counts so the
    locked skeleton can show "5 条看多论据 · 3 条看空论据 → 解锁".
    """
    locked = digest.model_copy(deep=True)
    locked.is_locked = True

    for thesis in locked.ticker_theses:
        thesis.buy_count = len(thesis.buy_arguments)
        thesis.sell_count = len(thesis.sell_arguments)
        thesis.observation_count = len(thesis.observation_arguments)
        thesis.synthesis_zh = ""
        thesis.buy_arguments = []
        thesis.sell_arguments = []
        thesis.observation_arguments = []

    for macro in locked.macro_threads:
        macro.key_points_count = len(macro.key_points)
        macro.synthesis_zh = ""
        macro.key_points = []

    for wp in locked.watchpoints:
        wp.evidence_count = len(wp.evidence)
        wp.why_it_matters_zh = ""
        wp.evidence = []

    return locked


def _digest_to_teaser(digest: DailyDigest) -> TwitterDigestTeaser:
    item = db.digest_to_list_item(digest)
    return TwitterDigestTeaser(**item.model_dump())


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
    Send today's persisted digest to the dedicated Max opt-in segment.

    Cron-driven (北京 08:00 工作日). Pulls the persisted DailyDigest for
    `date` (defaults to latest), renders the HTML email, and batches sends
    through `EmailService.broadcast_twitter_digest()`.

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
    # Prefer the explicit query param, then the persisted ET market date,
    # and only fall back to slicing the UTC generated_at for legacy rows that
    # predate the ET-business-day migration (will be off by a day; accepted
    # for archival reads).
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
    window_hours: int = Query(24, ge=6, le=72),
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
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Latest persisted digest. Same shape for everyone; paid content stripped
    when the caller lacks the `twitter_digest` entitlement."""
    digest = await db.get_latest_digest()
    if not digest:
        raise HTTPException(status_code=404, detail="No digest available yet")
    if await _viewer_has_full_access(user_id):
        return digest
    return _to_locked_digest(digest)


@router.get("/teaser/latest", response_model=TwitterDigestTeaser)
@limiter.limit("30/minute")
async def get_latest_teaser(
    request: Request,
):
    """Public lightweight preview used by /today CTA strip and other conversion
    surfaces. Smaller payload than the locked DailyDigest from `/latest` — only
    carries date / headline / hot lists / tracked-kol count."""
    digest = await db.get_latest_digest()
    if not digest:
        raise HTTPException(status_code=404, detail="No digest available yet")
    return _digest_to_teaser(digest)


@router.get("/archive", response_model=DailyDigestArchiveResponse)
@limiter.limit("30/minute")
async def list_archive(
    request: Request,
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Paginated lightweight digest archive. Open for everyone — the rows only
    carry the public list-item shape (headline / hot lists / counts), so this is
    safe to expose without auth and serves both Max and non-Max users."""
    try:
        rows, total = await db.list_digests(limit=limit, offset=offset)
    except RuntimeError as exc:
        logger.warning("twitter-digest archive unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Twitter digest archive temporarily unavailable",
        ) from exc
    return DailyDigestArchiveResponse(data=rows, total=total)


@router.get("/archive/teaser", response_model=DailyDigestArchiveResponse)
@limiter.limit("30/minute")
async def list_archive_teaser(
    request: Request,
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Backwards-compatible alias for `/archive` — both return the same
    lightweight shape now. Kept so existing frontend callers do not break."""
    try:
        rows, total = await db.list_digests(limit=limit, offset=offset)
    except RuntimeError as exc:
        logger.warning("twitter-digest archive teaser unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Twitter digest archive temporarily unavailable",
        ) from exc
    return DailyDigestArchiveResponse(data=rows, total=total)


@router.get("/preview")
@limiter.limit("30/minute")
async def get_email_preview(
    request: Request,
    date: Optional[str] = Query(None, description="ISO YYYY-MM-DD; default = latest"),
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """
    Render a persisted digest as an HTML email body for the /email-test page.

    Auth: admin user / non-prod env / cron secret. The rendered HTML carries
    the full paid content (`synthesis_zh`, `arguments`, `why_it_matters_zh`)
    so opening this endpoint would bypass `_to_locked_digest` and leak the
    Max-only content. Unlike daily / weekly preview (which render free-tier
    content), twitter digest is Max-only — gate it.
    """
    del auth_path  # only consumed by the dependency for access control
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
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Specific date's digest (YYYY-MM-DD). Same shape for everyone; paid
    content stripped when the caller lacks the `twitter_digest` entitlement.

    Validates the date format here so the path param can never reach the edge
    function as anything but a plain ISO date — defensive even though Insforge
    SDK already parameterizes the query.
    """
    if not _ISO_DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    digest = await db.get_digest_by_date(date)
    if not digest:
        raise HTTPException(status_code=404, detail=f"No digest for {date}")
    if await _viewer_has_full_access(user_id):
        return digest
    return _to_locked_digest(digest)
