"""FastAPI router for 知识星球 (zsxq) ingestion endpoints.

Endpoints:
  POST /api/zsxq/ingest        — trigger incremental or full ingest (cron-secret)
  GET  /api/zsxq/runs/{run_id} — poll run status (cron-secret)
  POST /api/zsxq/cookie        — update cookie (admin user)
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Body, Depends

from app.core.deps import verify_admin_user, verify_cron_secret
from app.core.logging import get_logger
from app.features.zsxq_ingest import db, service

logger = get_logger(__name__)

router = APIRouter(prefix="/api/zsxq", tags=["zsxq-ingest"])

GROUP = "15554581218512"

# A 'running' run older than this is treated as crashed/stale (won't block new
# triggers). Comfortably above a normal incremental crawl, below the 4h cadence.
_ACTIVE_RUN_MAX_AGE_MIN = 120


def _parse_iso(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


async def _has_active_run(group_id: str) -> bool:
    """True if a non-stale ``running`` run already exists for *group_id*.

    Guards against overlapping crawls at the 4h schedule cadence: two
    concurrent crawls would share the cookie and re-walk the same backlog
    (wasted requests + higher ban risk). A ``running`` row older than
    ``_ACTIVE_RUN_MAX_AGE_MIN`` is treated as crashed and does NOT block.
    Never raises — a read failure degrades open (allow the run).
    """
    try:
        runs = await db.list_runs(group_id, limit=5, status="running")
    except Exception:  # noqa: BLE001 — guard must never break a trigger
        logger.warning("zsxq _has_active_run: list_runs failed; allowing run", exc_info=True)
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_ACTIVE_RUN_MAX_AGE_MIN)
    for run in runs or []:
        started = _parse_iso(run.get("started_at"))
        if started and started > cutoff:
            return True
    return False


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

    Concurrency guard: an incremental trigger is *skipped* (no run row created)
    when a crawl is already in flight, so the 4h schedule can't stack overlapping
    crawls onto the same cookie. ``full=true`` is an explicit admin override and
    bypasses the guard. ``accepted`` stays ``true`` on skip so the cron step is
    not counted as a failure.
    """
    if not full and await _has_active_run(GROUP):
        logger.info("zsxq ingest skipped: a run is already in progress (group=%s)", GROUP)
        return {"success": True, "accepted": True, "skipped": True, "reason": "run_in_progress"}

    run = await db.create_run(GROUP, "full" if full else "incremental")
    run_id = run["run_id"]
    # Schedule the SYNC wrapper (threadpooled) — NOT the async coroutine directly,
    # which would run the blocking crawl on the event loop and freeze the worker.
    background_tasks.add_task(_run_ingest_bg, GROUP, full, run_id, limit)
    logger.info("zsxq ingest accepted: run_id=%s full=%s limit=%s", run_id, full, limit)
    return {"success": True, "accepted": True, "run_id": run_id, "limit": limit}


def _run_backfill_bg(group_id: str, run_id: str, limit: int | None) -> None:
    """Sync threadpool wrapper for the article backfill (same loop pattern as ingest)."""
    import asyncio

    from app.core.database import get_insforge_service

    async def _main() -> None:
        try:
            await service.backfill_articles(group_id, run_id=run_id, limit=limit)
        finally:
            await get_insforge_service().aclose_current_loop()

    asyncio.run(_main())


def _run_backfill_ids_bg(group_id: str, run_id: str, source_ids: list[str], limit: int | None) -> None:
    """Sync threadpool wrapper for the by-ids article backfill."""
    import asyncio

    from app.core.database import get_insforge_service

    async def _main() -> None:
        try:
            await service.backfill_articles_by_ids(
                group_id, run_id=run_id, source_ids=source_ids, limit=limit
            )
        finally:
            await get_insforge_service().aclose_current_loop()

    asyncio.run(_main())


@router.post("/backfill", dependencies=[Depends(verify_cron_secret)])
async def backfill(
    background_tasks: BackgroundTasks,
    limit: int | None = None,
    payload: dict | None = Body(default=None),
):
    """Backfill full article bodies for article topics (repairs truncated previews).

    - Default (no body): reads raw bucket archives, re-fetches only article posts.
    - Body ``{"source_ids": [...]}``: fetches those topics by id from the API —
      use for topics indexed from a local export (never archived).

    ``limit=N`` caps how many articles are backfilled (controlled test). Creates a
    ``backfill`` run in the job monitor; while it runs, scheduled incrementals skip
    (the concurrency guard sees a run in progress).
    """
    source_ids = (payload.get("source_ids") if isinstance(payload, dict) else None) or None
    run = await db.create_run(GROUP, "backfill")
    run_id = run["run_id"]
    if source_ids:
        background_tasks.add_task(_run_backfill_ids_bg, GROUP, run_id, [str(s) for s in source_ids], limit)
        mode = "by_ids(%d)" % len(source_ids)
    else:
        background_tasks.add_task(_run_backfill_bg, GROUP, run_id, limit)
        mode = "archive"
    logger.info("zsxq backfill accepted: run_id=%s mode=%s limit=%s", run_id, mode, limit)
    return {"success": True, "accepted": True, "run_id": run_id, "mode": mode, "limit": limit}


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
