"""
Market feature router - daily market report generation and caching.

Endpoints:
    POST /api/market - Generate or return cached market report
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from app.core.deps import verify_user_token, optional_user_token
from app.core.config import ENVIRONMENT
from app.core.logging import get_logger
from app.core.rate_limit import limiter
import app.core.posthog_client as posthog
from app.utils.timezone import today_str, now_iso
from app.features.daily_report.agent import MarketAgent
from app.features.daily_report import db as market_db

logger = get_logger(__name__)


router = APIRouter(prefix="/api", tags=["market"])

# Initialize agent (singleton for the module lifetime)
market_agent = MarketAgent()


def transform_market_data_to_indices(market_data: dict) -> list:
    """Transform market_data dict to frontend indices array format."""
    indices = []

    # Standard categories with value/daily_change structure
    for category in ["equities", "volatility", "commodities", "currencies", "credit", "financials"]:
        for name, data in market_data.get(category, {}).items():
            if isinstance(data, dict) and "value" in data:
                indices.append({
                    "name": name,
                    "value": data.get("value", 0),
                    "change_percent": data.get("daily_change", 0)
                })

    # Treasury rates (special structure: rates.yield_curve)
    # Only include 2Y and 10Y for simplicity
    # Note: Treasury changes are in basis points (bps), not percent
    rates_data = market_data.get("rates", {})
    yield_curve = rates_data.get("yield_curve", {})
    key_tenors = ["2Y", "10Y"]
    for tenor in key_tenors:
        data = yield_curve.get(tenor, {})
        if isinstance(data, dict) and "rate" in data:
            display_name = f"{tenor} Treasury"
            # Use daily_change_bps for new format, fallback to daily_change for old format
            change_bps = data.get("daily_change_bps")
            if change_bps is None:
                change_bps = data.get("daily_change", 0) or 0
            indices.append({
                "name": display_name,
                "value": data.get("rate", 0),
                "change_percent": change_bps,  # Value is in bps for Treasury
                "change_unit": "bps",  # Indicate unit is basis points
            })

    return indices


def _normalize_report_data(data: dict) -> dict:
    """Normalize report data before saving to DB.

    Fixes:
    - report_summary stored as JSON string instead of list
    - Literal '\\n' in text fields instead of real newlines
    """
    import json as _json

    # Ensure report_summary is a list (ADK may serialize it as JSON string)
    rs = data.get("report_summary", [])
    if isinstance(rs, str):
        try:
            rs = _json.loads(rs)
        except (ValueError, TypeError):
            rs = []
        data["report_summary"] = rs

    # Fix literal \\n in text fields
    def fix_newlines(s: str) -> str:
        if not isinstance(s, str):
            return s
        return s.replace("\\n", "\n")

    # Fix intro
    if isinstance(data.get("intro"), str):
        data["intro"] = fix_newlines(data["intro"])

    # Fix report_summary content
    if isinstance(rs, list):
        for section in rs:
            if isinstance(section, dict) and "content" in section:
                section["content"] = fix_newlines(section["content"])

    return data


class MarketAnalysisRequest(BaseModel):
    force: bool = False


def _report_to_response(report: dict) -> dict:
    """Build a normalized API response dict from a DB report row."""
    from app.features.seo.policy import published
    answer=published('today-answer:'+str(report.get('report_date')))
    return _normalize_report_data({
        'public_answer':answer['content'] if answer else '',
        "report_id": report.get("id"),
        "report_date": report.get("report_date", ""),
        "indices": report.get("indices", []),
        "timestamp": report.get("timestamp", now_iso()),
        "title": report.get("title", ""),
        "summary": report.get("summary", ""),
        "intro": report.get("intro", ""),
        "news": report.get("news"),
        "report_summary": report.get("report_summary", []),
        "calendar": report.get("calendar", []),
        "market_data": report.get("market_data", {}),
        "from_cache": True,
    })


@router.get("/market/reports")
@limiter.limit("20/minute")
async def list_market_reports(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List historical market reports with pagination."""
    result = await market_db.list_reports(limit=limit, offset=offset)
    return {
        "success": True,
        "data": result["data"],
        "total": result["total"],
        "limit": limit,
        "offset": offset,
    }


@router.get("/market/reports/latest")
async def get_latest_report_data():
    """Get the most recent market report regardless of date."""
    report = await market_db.get_latest_report()
    if not report:
        raise HTTPException(status_code=404, detail="No reports found")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/market/reports/date/{date}")
async def get_report_by_date(date: str):
    """Get a market report by date (YYYY-MM-DD)."""
    report = await market_db.get_report_by_date(date)
    if not report:
        raise HTTPException(status_code=404, detail=f"No report found for date {date}")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/market/reports/{report_id}")
async def get_report_by_id(report_id: str):
    """Get a market report by its UUID."""
    report = await market_db.get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True, "data": _report_to_response(report)}


@router.get("/market/latest")
async def get_latest_report(user_id: Optional[str] = Depends(optional_user_token)):
    """Read-only endpoint: return today's cached report or 404."""
    today = today_str()
    report = await market_db.get_report_by_date(today)

    if not report:
        raise HTTPException(status_code=404, detail="No report available for today")

    timestamp = report.get("timestamp", "")
    if timestamp[:10] != today:
        raise HTTPException(status_code=404, detail="No report available for today")

    if user_id and posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_id,
            event="daily_report_viewed",
            properties={},
        )

    return _report_to_response(report)


@router.post("/market")
@limiter.limit("5/minute")
async def analyze_market(request: Request, body: Optional[MarketAnalysisRequest] = None, _user_id: str = Depends(verify_user_token)):
    try:
        force = body.force if body else False

        today = today_str()
        existing_report = await market_db.get_report_by_date(today)

        if existing_report and not force:
            report_timestamp = existing_report.get("timestamp", "")
            report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

            if report_date_from_timestamp == today:
                logger.info("Found existing report for %s, returning cached data", today)
                return _report_to_response(existing_report)
            else:
                logger.info("Found report but timestamp (%s) doesn't match today (%s), regenerating...", report_date_from_timestamp, today)

        if force:
            logger.info("Force regeneration requested, generating new report...")
        else:
            logger.info("No report found for %s, generating new analysis...", today)
        result = await market_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate market analysis")

        market_data = result.get("market_data", {})
        indices = transform_market_data_to_indices(market_data)

        response_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", now_iso()),
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "intro": result.get("intro", ""),
            "news": result.get("news"),
            "report_summary": result.get("report_summary", []),
            "calendar": result.get("calendar", []),
            "market_data": market_data,
            "from_cache": False,
        }

        response_data = _normalize_report_data(response_data)

        if ENVIRONMENT == "production":
            save_result = await market_db.save_market_report(response_data)
            if save_result.get("success"):
                logger.info("Report saved to database for %s", today)
                response_data["report_id"] = save_result.get("report_id")
            else:
                logger.error("Failed to save report: %s", save_result.get('error'))
        else:
            logger.info("Dev environment: skipping DB save to protect production data")

        return response_data
    except Exception as e:
        logger.exception("Error in analyze_market")
        raise HTTPException(status_code=500, detail=str(e))
