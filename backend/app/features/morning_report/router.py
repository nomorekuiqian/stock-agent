"""
Morning report router - pre-market briefing generation and caching.

Endpoints:
    POST /api/morning           - Generate or return cached morning report
    GET  /api/morning/latest    - Today's cached report or 404
    GET  /api/morning/reports   - Paginated list of reports
    GET  /api/morning/reports/latest      - Most recent report
    GET  /api/morning/reports/date/{date} - Report by date
    GET  /api/morning/reports/{report_id} - Report by UUID
"""

import json as _json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from app.core.deps import optional_user_token, verify_cron_secret, verify_user_token
from app.features.payment.entitlements import has_entitlement
from app.features.subscription.models import BroadcastResponse
from app.features.subscription.broadcast_runs import (
    acquire_broadcast_run,
    complete_broadcast_run,
)
from app.core.config import ENVIRONMENT
from app.core.logging import get_logger
from app.core.rate_limit import limiter
import app.core.posthog_client as posthog
from app.utils.timezone import today_str, now_iso
from app.features.morning_report.agent import MorningReportAgent
from app.features.morning_report import db as morning_db

logger = get_logger(__name__)


router = APIRouter(prefix="/api", tags=["morning_report"])

# Initialize agent (singleton)
morning_agent = MorningReportAgent()


class MorningReportRequest(BaseModel):
    force: bool = False


def _is_morning_report_valid(data: dict) -> bool:
    """Check if a morning report has enough content to broadcast."""
    if not data.get("title"):
        return False
    if not data.get("overnight_news"):
        return False
    if not data.get("summary"):
        return False
    return True


def _normalize_report_data(data: dict) -> dict:
    """Normalize report data before saving/returning.

    Fixes:
    - summary stored as JSON string instead of list
    - Literal '\\n' in text fields instead of real newlines
    """
    # Ensure summary is a list
    s = data.get("summary", [])
    if isinstance(s, str):
        try:
            s = _json.loads(s)
        except (ValueError, TypeError):
            s = []
        data["summary"] = s

    # Fix literal \\n in text fields
    def fix_newlines(val):
        if not isinstance(val, str):
            return val
        return val.replace("\\n", "\n")

    if isinstance(data.get("market_pulse"), str):
        data["market_pulse"] = fix_newlines(data["market_pulse"])

    if isinstance(s, list):
        for section in s:
            if isinstance(section, dict) and "content" in section:
                section["content"] = fix_newlines(section["content"])

    return data


_MORNING_FEATURE = "morning_website"

# Paid AI narrative fields stripped from the response when the viewer lacks
# the `morning_website` entitlement. Structured numeric fields (`futures`,
# `global_markets`, `market_data`) plus the short `title` headline stay
# visible — they act as a free-tier teaser that powers SEO / OG metadata
# without leaking the paid commentary.
_LOCKED_STRING_FIELDS = (
    "market_pulse",
    "futures_analysis",
    "global_markets_analysis",
)
_LOCKED_LIST_FIELDS = (
    "overnight_news",
    "today_focus",
    "summary",
)


async def _viewer_has_morning_access(user_id: Optional[str]) -> bool:
    """True iff the optional bearer user has the morning_website entitlement."""
    if not user_id:
        return False
    return await has_entitlement(user_id, _MORNING_FEATURE)


def _maybe_lock_report(data: dict, *, viewer_has_access: bool) -> dict:
    """Project a normalized report into the paywalled shape when unauthorized.

    Critical: this is the only trust boundary. The detail endpoints are
    server-rendered (no auth context on the SSR fetch by default), so any
    full-content data returned here gets serialized into the HTML / RSC
    payload and is readable via View Source even when the client UI claims
    to be locked. Strip AI text fields server-side before they ever leave
    the API.
    """
    if viewer_has_access:
        normalized = dict(data)
        normalized["is_locked"] = False
        return normalized
    locked = dict(data)
    for field in _LOCKED_STRING_FIELDS:
        locked[field] = ""
    for field in _LOCKED_LIST_FIELDS:
        locked[field] = []
    locked["is_locked"] = True
    return locked


def _report_to_response(report: dict) -> dict:
    """Build a normalized API response dict from a DB report row."""
    return _normalize_report_data({
        "report_id": report.get("id"),
        "report_date": report.get("report_date", ""),
        "timestamp": report.get("timestamp", now_iso()),
        "title": report.get("title", ""),
        "market_pulse": report.get("market_pulse", ""),
        "futures": report.get("futures", []),
        "futures_analysis": report.get("futures_analysis", ""),
        "global_markets": report.get("global_markets", {}),
        "global_markets_analysis": report.get("global_markets_analysis", ""),
        "overnight_news": report.get("overnight_news", []),
        "today_focus": report.get("today_focus", []),
        "summary": report.get("summary", []),
        "market_data": report.get("market_data", {}),
        "from_cache": True,
    })


@router.get("/morning/reports")
@limiter.limit("20/minute")
async def list_morning_reports(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List historical morning reports with pagination."""
    result = await morning_db.list_morning_reports(limit=limit, offset=offset)
    return {
        "success": True,
        "data": result["data"],
        "total": result["total"],
        "limit": limit,
        "offset": offset,
    }


@router.get("/morning/reports/latest")
async def get_latest_report_data(
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Get the most recent morning report regardless of date.

    Paywall: AI narrative fields stripped unless the caller carries the
    `morning_website` entitlement. See `_maybe_lock_report`.
    """
    report = await morning_db.get_latest_morning_report()
    if not report:
        raise HTTPException(status_code=404, detail="No morning reports found")
    viewer_has_access = await _viewer_has_morning_access(user_id)
    payload = _maybe_lock_report(_report_to_response(report), viewer_has_access=viewer_has_access)
    return {"success": True, "data": payload}


@router.get("/morning/reports/date/{date}")
async def get_morning_report_by_date(
    date: str,
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Get a morning report by date (YYYY-MM-DD).

    Paywall: same shape for everyone; AI text stripped without entitlement.
    """
    report = await morning_db.get_morning_report_by_date(date)
    if not report:
        raise HTTPException(status_code=404, detail=f"No morning report for date {date}")
    viewer_has_access = await _viewer_has_morning_access(user_id)
    payload = _maybe_lock_report(_report_to_response(report), viewer_has_access=viewer_has_access)
    return {"success": True, "data": payload}


@router.get("/morning/reports/{report_id}")
async def get_morning_report_by_id(
    report_id: str,
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Get a morning report by its UUID.

    Paywall: same shape for everyone; AI text stripped without entitlement.
    The /morning/[id] page is server-rendered without auth context, so SSR
    always lands on the locked shape — the client then re-fetches with the
    user's token to upgrade subscribers to the full payload.
    """
    report = await morning_db.get_morning_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Morning report not found")
    viewer_has_access = await _viewer_has_morning_access(user_id)
    payload = _maybe_lock_report(_report_to_response(report), viewer_has_access=viewer_has_access)
    return {"success": True, "data": payload}


@router.get("/morning/latest")
async def get_todays_morning_report(
    user_id: Optional[str] = Depends(optional_user_token),
):
    """Read-only endpoint: return today's cached morning report or 404.

    Paywall: AI narrative fields stripped unless the caller carries the
    `morning_website` entitlement.
    """
    today = today_str()
    report = await morning_db.get_morning_report_by_date(today)

    if not report:
        raise HTTPException(status_code=404, detail="No morning report available for today")

    viewer_has_access = await _viewer_has_morning_access(user_id)
    if user_id and posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_id,
            event="morning_report_viewed",
            properties={"has_access": viewer_has_access},
        )
    return _maybe_lock_report(_report_to_response(report), viewer_has_access=viewer_has_access)


@router.post("/morning")
@limiter.limit("5/minute")
async def generate_morning_report(request: Request, body: Optional[MorningReportRequest] = None, _user_id: str = Depends(verify_user_token)):
    """Generate a new morning report or return today's cached version."""
    try:
        force = body.force if body else False
        today = today_str()

        # Check cache
        existing = await morning_db.get_morning_report_by_date(today)
        if existing and not force:
            logger.info("Found existing morning report for %s, returning cached", today)
            return _report_to_response(existing)

        if force:
            logger.info("Force regeneration of morning report for %s", today)
        else:
            logger.info("No morning report for %s, generating...", today)

        # Generate
        result = await morning_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate morning report")

        response_data = {
            "report_date": today,
            "timestamp": result.get("timestamp", now_iso()),
            "title": result.get("title", ""),
            "market_pulse": result.get("market_pulse", ""),
            "futures": result.get("futures", []),
            "futures_analysis": result.get("futures_analysis", ""),
            "global_markets": result.get("global_markets", {}),
            "global_markets_analysis": result.get("global_markets_analysis", ""),
            "overnight_news": result.get("overnight_news", []),
            "today_focus": result.get("today_focus", []),
            "summary": result.get("summary", []),
            "market_data": result.get("market_data", {}),
            "from_cache": False,
        }

        response_data = _normalize_report_data(response_data)

        # Save to DB (production only to avoid overwriting live data)
        if ENVIRONMENT == "production":
            save_result = await morning_db.save_morning_report(response_data)
            if save_result.get("success"):
                logger.info("Morning report saved for %s", today)
                response_data["report_id"] = save_result.get("report_id")
            else:
                logger.error("Failed to save morning report: %s", save_result.get("error"))
        else:
            logger.info("Dev environment: skipping DB save to protect production data")

        return response_data

    except Exception as e:
        logger.exception("Error in generate_morning_report")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/morning/broadcast")
async def broadcast_morning_report(
    force: bool = Query(False, description="Force regenerate report before broadcasting"),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Broadcast morning report to daily_report subscribers.
    Protected by CRON_SECRET for scheduled job authentication.

    Uses the shared daily_report audience (same as daily report).
    """
    try:
        from app.features.subscription.email_service import get_email_service

        email_service = get_email_service()
        today = today_str()
        lock = {"acquired": True}
        if ENVIRONMENT == "production":
            lock = await acquire_broadcast_run(
                "morning_report",
                today,
                {"endpoint": "/api/morning/broadcast"},
            )
            if not lock.get("acquired"):
                logger.warning(
                    "Skipping duplicate morning_report broadcast for %s; existing=%s",
                    today,
                    (lock.get("data") or {}).get("id"),
                )
                return BroadcastResponse(
                    success=True,
                    channel="daily_report",
                    sent=0,
                    failed=0,
                    errors=[{"reason": "duplicate_broadcast_skipped", "date": today}],
                )
        report_data = None

        if not force:
            existing = await morning_db.get_morning_report_by_date(today)
            if existing:
                logger.info("Using cached morning report for %s broadcast", today)
                report_data = {
                    "report_id": existing.get("id"),
                    "report_date": existing.get("report_date", today),
                    "timestamp": existing.get("timestamp", now_iso()),
                    "title": existing.get("title", ""),
                    "market_pulse": existing.get("market_pulse", ""),
                    "futures": existing.get("futures", []),
                    "futures_analysis": existing.get("futures_analysis", ""),
                    "global_markets": existing.get("global_markets", {}),
                    "global_markets_analysis": existing.get("global_markets_analysis", ""),
                    "overnight_news": existing.get("overnight_news", []),
                    "today_focus": existing.get("today_focus", []),
                    "summary": existing.get("summary", []),
                }

        if report_data is None:
            if force:
                logger.info("Force regenerating morning report for broadcast...")
            else:
                logger.info("No cached morning report, generating...")

            agent = MorningReportAgent()
            result = await agent.analyze()
            if not result:
                raise HTTPException(status_code=500, detail="Failed to generate morning report")

            report_data = {
                "report_date": today,
                "timestamp": result.get("timestamp", now_iso()),
                "title": result.get("title", ""),
                "market_pulse": result.get("market_pulse", ""),
                "futures": result.get("futures", []),
                "futures_analysis": result.get("futures_analysis", ""),
                "global_markets": result.get("global_markets", {}),
                "global_markets_analysis": result.get("global_markets_analysis", ""),
                "overnight_news": result.get("overnight_news", []),
                "today_focus": result.get("today_focus", []),
                "summary": result.get("summary", []),
                "market_data": result.get("market_data", {}),
            }

            if ENVIRONMENT == "production":
                save_result = await morning_db.save_morning_report(report_data)
                if save_result.get("success"):
                    report_data["report_id"] = save_result.get("report_id")

        # Quality gate: don't broadcast incomplete reports
        if not _is_morning_report_valid(report_data):
            logger.error(
                "Morning report quality check failed, skipping broadcast. "
                "title=%s, news=%d, summary=%d",
                bool(report_data.get("title")),
                len(report_data.get("overnight_news", [])),
                len(report_data.get("summary", [])),
            )
            raise HTTPException(
                status_code=500,
                detail="Morning report failed quality check: missing title, news, or summary. Broadcast skipped.",
            )

        broadcast_result = await email_service.broadcast_morning_report(report_data)

        if not broadcast_result.get("success"):
            error_msg = broadcast_result.get("error", "Failed to broadcast morning report")
            logger.error("Morning report broadcast failed: %s", error_msg)
            if ENVIRONMENT == "production" and lock.get("lock_token"):
                await complete_broadcast_run(
                    "morning_report",
                    lock["lock_token"],
                    today,
                    status="failed",
                    details={"error": error_msg},
                )
            raise HTTPException(status_code=500, detail=error_msg)

        if ENVIRONMENT == "production" and lock.get("lock_token"):
            await complete_broadcast_run(
                "morning_report",
                lock["lock_token"],
                today,
                broadcast_id=broadcast_result.get("broadcast_id"),
                details=broadcast_result,
            )
        # Mirror to Discord as an embed card (best-effort, never blocks email path)
        from app.shared.discord_notifier import send_morning_report_card
        await send_morning_report_card(report_data)

        return BroadcastResponse(
            success=True,
            channel="daily_report",
            broadcast_id=broadcast_result.get("broadcast_id"),
            audience_id=broadcast_result.get("audience_id"),
            segment_id=broadcast_result.get("segment_id"),
            total=broadcast_result.get("total", 0),
            sent=broadcast_result.get("sent", 0),
            failed=broadcast_result.get("failed", 0),
            errors=[],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in broadcast_morning_report")
        raise HTTPException(status_code=500, detail=str(e))
