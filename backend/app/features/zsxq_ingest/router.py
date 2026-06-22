"""FastAPI router for 知识星球 (zsxq) ingestion endpoints.

Endpoints:
  POST /api/zsxq/ingest        — trigger incremental or full ingest (cron-secret)
  GET  /api/zsxq/runs/{run_id} — poll run status (cron-secret)
  POST /api/zsxq/cookie        — update cookie (admin user)
"""

from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.deps import verify_admin_user, verify_cron_secret
from app.core.logging import get_logger
from app.features.zsxq_ingest import db, service

logger = get_logger(__name__)

router = APIRouter(prefix="/api/zsxq", tags=["zsxq-ingest"])

GROUP = "15554581218512"


@router.post("/ingest", dependencies=[Depends(verify_cron_secret)])
async def ingest(background_tasks: BackgroundTasks, full: bool = False):
    """Trigger a zsxq ingest run (incremental by default, full when ``?full=true``)."""
    run = await db.create_run(GROUP, "full" if full else "incremental")
    run_id = run["run_id"]
    background_tasks.add_task(service.run_ingest, GROUP, full=full, run_id=run_id)
    logger.info("zsxq ingest accepted: run_id=%s full=%s", run_id, full)
    return {"success": True, "accepted": True, "run_id": run_id}


@router.get("/runs/{run_id}", dependencies=[Depends(verify_cron_secret)])
async def get_run(run_id: str):
    """Return the current state of an ingest run."""
    run = await db.get_run(run_id)
    return {"success": True, "run": run}


@router.post("/cookie", dependencies=[Depends(verify_admin_user)])
async def set_cookie(payload: dict):
    """Update the zsxq cookie (admin only)."""
    cookie = payload.get("cookie", "")
    by = payload.get("by", "admin")
    await db.set_credential(GROUP, cookie, status="active", updated_by=by)
    logger.info("zsxq cookie updated by=%s", by)
    return {"success": True}
