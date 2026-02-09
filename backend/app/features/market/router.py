"""
Market feature router - daily market report generation and caching.

Endpoints:
    POST /api/market - Generate or return cached market report
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.utils.timezone import today_str, now_iso
from app.features.market.agent import MarketAgent
from app.features.market import db as market_db


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
    force: bool = False  # Force regenerate even if cached


@router.post("/market")
async def analyze_market(request: Optional[MarketAnalysisRequest] = None):
    try:
        force = request.force if request else False

        # Check if today's report already exists in database (Pacific timezone)
        today = today_str()
        existing_report = await market_db.get_report_by_date(today)

        # Validate that the cached report's timestamp is actually from today (local time)
        # This handles timezone issues where report_date might be stored in UTC
        if existing_report and not force:
            report_timestamp = existing_report.get("timestamp", "")
            report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

            if report_date_from_timestamp == today:
                print(f"[API] Found existing report for {today}, returning cached data")
                # Return existing report from database
                cached = {
                    "report_id": existing_report.get("id"),
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "intro": existing_report.get("intro", ""),
                    "news": existing_report.get("news"),
                    "report_summary": existing_report.get("report_summary", []),
                    "calendar": existing_report.get("calendar", []),
                    "market_data": existing_report.get("market_data", {}),
                    "from_cache": True,
                }
                return _normalize_report_data(cached)
            else:
                print(f"[API] Found report but timestamp ({report_date_from_timestamp}) doesn't match today ({today}), regenerating...")

        # Force regeneration requested
        if force:
            print(f"[API] Force regeneration requested, generating new report...")

        # No existing report, generate new one
        if not force:
            print(f"[API] No report found for {today}, generating new analysis...")
        result = await market_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate market analysis")

        # Transform market_data to frontend expected format
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

        # Normalize data before saving (fix double-escaped newlines, ensure correct types)
        response_data = _normalize_report_data(response_data)

        # Save new report to database (field names match DB schema directly)
        save_result = await market_db.save_market_report(response_data)
        if save_result.get("success"):
            print(f"[API] Report saved to database for {today}")
            response_data["report_id"] = save_result.get("report_id")
        else:
            print(f"[API] Failed to save report: {save_result.get('error')}")

        return response_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
