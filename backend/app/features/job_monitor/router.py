"""Admin API for monitoring recurring background jobs (generic, read-only).

One screen monitors any registered job source — zsxq ingest today, more later.
The source contract lives in ``app/features/job_monitor/sources.py``.

  GET /api/admin/jobs                      — list sources
  GET /api/admin/jobs/{source}/overview    — health header
  GET /api/admin/jobs/{source}/runs        — recent runs (newest first)
  GET /api/admin/jobs/{source}/runs/{id}   — one run + source-specific detail
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import verify_admin_user
from app.core.logging import get_logger
from app.features.job_monitor import sources

# Import side-effect: registers the built-in sources.
from app.features.job_monitor import zsxq_source  # noqa: F401

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin/jobs", tags=["admin", "job-monitor"])


def _require_source(source: str):
    src = sources.get_source(source)
    if src is None:
        raise HTTPException(404, f"Unknown job source: {source}")
    return src


@router.get("")
async def get_sources(_admin: dict = Depends(verify_admin_user)):
    """List monitorable job sources."""
    return {"sources": sources.list_sources()}


@router.get("/{source}/overview")
async def get_overview(source: str, _admin: dict = Depends(verify_admin_user)):
    """Health header for a source: ``{health, stats}``."""
    return await _require_source(source).overview()


@router.get("/{source}/runs")
async def get_runs(
    source: str,
    limit: int = Query(30, ge=1, le=200),
    _admin: dict = Depends(verify_admin_user),
):
    """Recent runs (newest first) for a source."""
    return {"runs": await _require_source(source).list_runs(limit=limit)}


@router.get("/{source}/runs/{run_id}")
async def get_run(source: str, run_id: str, _admin: dict = Depends(verify_admin_user)):
    """One run, normalized, with source-specific ``detail``."""
    run = await _require_source(source).get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run not found: {run_id}")
    return {"run": run}
