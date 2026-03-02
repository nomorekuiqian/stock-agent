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
from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.utils.timezone import today_str, now_iso
from app.features.morning_report.agent import MorningReportAgent
from app.features.morning_report import db as morning_db

logger = get_logger(__name__)


router = APIRouter(prefix="/api", tags=["morning_report"])

# Initialize agent (singleton)
morning_agent = MorningReportAgent()


class MorningReportRequest(BaseModel):
    force: bool = False


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
async def get_latest_report_data():
    """Get the most recent morning report regardless of date."""
    report = await morning_db.get_latest_morning_report()
    if not report:
        raise HTTPException(status_code=404, detail="No morning reports found")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/morning/reports/date/{date}")
async def get_morning_report_by_date(date: str):
    """Get a morning report by date (YYYY-MM-DD)."""
    report = await morning_db.get_morning_report_by_date(date)
    if not report:
        raise HTTPException(status_code=404, detail=f"No morning report for date {date}")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/morning/reports/{report_id}")
async def get_morning_report_by_id(report_id: str):
    """Get a morning report by its UUID."""
    report = await morning_db.get_morning_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Morning report not found")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/morning/latest")
async def get_todays_morning_report():
    """Read-only endpoint: return today's cached morning report or 404."""
    today = today_str()
    report = await morning_db.get_morning_report_by_date(today)

    if not report:
        raise HTTPException(status_code=404, detail="No morning report available for today")

    return _report_to_response(report)


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

        # Save to DB
        save_result = await morning_db.save_morning_report(response_data)
        if save_result.get("success"):
            logger.info("Morning report saved for %s", today)
            response_data["report_id"] = save_result.get("report_id")
        else:
            logger.error("Failed to save morning report: %s", save_result.get("error"))

        return response_data

    except Exception as e:
        logger.exception("Error in generate_morning_report")
        raise HTTPException(status_code=500, detail=str(e))
