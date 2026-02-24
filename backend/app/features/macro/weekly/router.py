"""
Weekly Macro Report - API Router

GET endpoints for reading weekly reports.
POST /generate endpoint for AI generation (protected by X-Cron-Secret).
"""

import time
import traceback
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import verify_cron_secret
from app.features.macro.weekly import db as weekly_db
from app.utils.timezone import market_week_label, utc_now_iso

router = APIRouter(prefix="/api/weekly-report", tags=["weekly-report"])

# ── In-memory cache to avoid Edge Function cold-start on every page load ──
_cache: Dict[str, Any] = {"latest": None, "ts": 0.0}
_CACHE_TTL = 300  # 5 minutes


def _strip_raw_data(report: dict) -> dict:
    """Remove raw_data from response — frontend doesn't need it (saves ~25KB / 60%)."""
    if report and "raw_data" in report:
        return {k: v for k, v in report.items() if k != "raw_data"}
    return report


@router.get("")
async def get_weekly_report(
    week: Optional[str] = Query(
        default=None,
        description="Week label like '2025.W06'. If omitted, returns the latest report.",
    ),
):
    """
    Get a weekly macro report.
    - No params: returns the latest report (cached 5min to avoid Edge Function cold-start)
    - ?week=2025.W06: returns report for a specific week
    """
    try:
        if week:
            report = await weekly_db.get_report_by_week(week)
        else:
            # Serve from cache if fresh
            now = time.monotonic()
            if _cache["latest"] and (now - _cache["ts"]) < _CACHE_TTL:
                return {"success": True, "data": _cache["latest"]}

            report = await weekly_db.get_latest_report()
            if report:
                stripped = _strip_raw_data(report)
                _cache["latest"] = stripped
                _cache["ts"] = now
                return {"success": True, "data": stripped}

        return {
            "success": True,
            "data": _strip_raw_data(report) if report else report,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch weekly report")


@router.get("/list")
async def list_weekly_reports(
    limit: int = Query(default=20, ge=1, le=100, description="Number of reports"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
):
    """
    List historical weekly macro reports with pagination.
    Returns summary fields only (week_label, signal_lights, verdict).
    """
    try:
        reports = await weekly_db.list_reports(limit=limit, offset=offset)
        return {
            "success": True,
            "data": reports,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to list weekly reports")


# =============================================================================
# POST - Generate Weekly Report (CRON / Admin)
# =============================================================================


@router.post("/generate")
async def generate_weekly_report(
    _secret: str = Depends(verify_cron_secret),
    force: bool = Query(default=False, description="Force regeneration even if report exists"),
):
    """
    Generate weekly macro report via AI agent.
    Protected by X-Cron-Secret header.

    Flow: collect_weekly_data() -> WeeklyReportAgent -> db.save_weekly_report()
    """
    try:
        week_label = market_week_label()

        # Idempotency: skip if report already exists (unless force=True)
        if not force:
            existing = await weekly_db.get_report_by_week(week_label)
            if existing:
                return {"success": True, "data": existing, "from_cache": True}

        # Lazy imports to avoid loading heavy deps on every request
        from app.features.macro.weekly.data_collector import collect_weekly_data
        from app.features.macro.weekly.agent import WeeklyReportAgent

        # Step 1: Collect raw data
        print(f"[WeeklyReport] Generating report for {week_label}...")
        raw_data = await collect_weekly_data()

        # Step 2: AI generation
        agent = WeeklyReportAgent()
        report = await agent.generate(raw_data)

        # Step 3: Assemble DB record
        db_record = {
            "week_label": week_label,
            "generated_at": utc_now_iso(),
            **report,
            "raw_data": raw_data.model_dump(mode="json"),
        }

        # Step 4: Save to database
        save_result = await weekly_db.save_weekly_report(db_record)

        # Step 5: Read back the saved report & invalidate cache
        saved_report = await weekly_db.get_report_by_week(week_label)
        _cache["latest"] = None
        _cache["ts"] = 0.0

        # Step 6: Broadcast email to weekly_report subscribers (non-fatal)
        broadcast_result = None
        try:
            from app.features.subscription.email_service import get_email_service

            if saved_report:
                result = await get_email_service().broadcast_weekly_report(saved_report)
                broadcast_result = result
                if result.get("success"):
                    print(f"[WeeklyReport] Broadcast sent: {result.get('broadcast_id')}")
                else:
                    print(f"[WeeklyReport] Broadcast failed: {result.get('error')}")
        except Exception as e:
            print(f"[WeeklyReport] Broadcast failed (non-fatal): {e}")

        return {
            "success": True,
            "data": saved_report,
            "from_cache": False,
            "save_result": save_result,
            "broadcast_result": broadcast_result,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate weekly report: {str(e)[:200]}",
        )
