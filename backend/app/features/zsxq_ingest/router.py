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


def _run_ingest_bg(group_id: str, full: bool, run_id: str, limit: int | None) -> None:
    """Sync wrapper scheduled as a BackgroundTask.

    FastAPI runs *sync* background tasks in a threadpool, so the blocking
    crawler inside ``run_ingest`` (``httpx.Client`` + ``time.sleep`` anti-ban
    delays of seconds-to-minutes) cannot stall the API event loop. ``asyncio.run``
    gives this worker thread its own loop for the async db/index calls.
    """
    import asyncio

    from app.core.database import get_insforge_service

    async def _main() -> None:
        try:
            await service.run_ingest(group_id, full=full, run_id=run_id, limit=limit)
        finally:
            # Release the httpx client bound to THIS one-off loop so it isn't
            # left lingering bound to a dead loop after asyncio.run returns.
            await get_insforge_service().aclose_current_loop()

    asyncio.run(_main())


@router.post("/ingest", dependencies=[Depends(verify_cron_secret)])
async def ingest(background_tasks: BackgroundTasks, full: bool = False, limit: int | None = None):
    """Trigger a zsxq ingest run.

    - ``full=true`` ignores the incremental cursor and crawls from the top.
    - ``limit=N`` stops after N crawled topics — use for a small, controlled
      first run (respects rate limits / avoids a bulk crawl during validation).
    """
    run = await db.create_run(GROUP, "full" if full else "incremental")
    run_id = run["run_id"]
    # Schedule the SYNC wrapper (threadpooled) — NOT the async coroutine directly,
    # which would run the blocking crawl on the event loop and freeze the worker.
    background_tasks.add_task(_run_ingest_bg, GROUP, full, run_id, limit)
    logger.info("zsxq ingest accepted: run_id=%s full=%s limit=%s", run_id, full, limit)
    return {"success": True, "accepted": True, "run_id": run_id, "limit": limit}


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
