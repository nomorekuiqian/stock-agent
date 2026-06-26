"""Unit tests for the zsxq ingest router — focused on the concurrency guard.

The guard stops the 4h schedule from stacking overlapping crawls onto the same
cookie: an incremental trigger is skipped (no run row) when a *fresh* ``running``
run exists; a ``full=true`` trigger always proceeds (admin override); a *stale*
``running`` run (older than the staleness window) does not block.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import BackgroundTasks

from app.features.zsxq_ingest import router as rt


def _iso(minutes_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def _running(minutes_ago: int) -> dict:
    return {"run_id": "in-flight", "status": "running", "started_at": _iso(minutes_ago)}


@pytest.mark.asyncio
async def test_incremental_skipped_when_fresh_run_in_progress():
    with (
        patch("app.features.zsxq_ingest.router.db.list_runs", new_callable=AsyncMock,
              return_value=[_running(5)]),
        patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock) as mock_create,
    ):
        bg = BackgroundTasks()
        resp = await rt.ingest(bg, full=False, limit=None)

    assert resp["accepted"] is True          # cron step must not count as failure
    assert resp["skipped"] is True
    assert resp["reason"] == "run_in_progress"
    mock_create.assert_not_awaited()         # no spurious run row
    assert len(bg.tasks) == 0                # no background crawl scheduled


@pytest.mark.asyncio
async def test_incremental_proceeds_when_no_running_run():
    with (
        patch("app.features.zsxq_ingest.router.db.list_runs", new_callable=AsyncMock,
              return_value=[]),
        patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock,
              return_value={"run_id": "r1"}) as mock_create,
    ):
        bg = BackgroundTasks()
        resp = await rt.ingest(bg, full=False, limit=None)

    assert resp["accepted"] is True
    assert resp.get("skipped") is not True
    assert resp["run_id"] == "r1"
    mock_create.assert_awaited_once()
    assert len(bg.tasks) == 1


@pytest.mark.asyncio
async def test_incremental_proceeds_when_only_stale_running_run():
    # A 'running' row older than the staleness window = crashed run; must not block.
    stale = _running(rt._ACTIVE_RUN_MAX_AGE_MIN + 30)
    with (
        patch("app.features.zsxq_ingest.router.db.list_runs", new_callable=AsyncMock,
              return_value=[stale]),
        patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock,
              return_value={"run_id": "r2"}) as mock_create,
    ):
        bg = BackgroundTasks()
        resp = await rt.ingest(bg, full=False, limit=None)

    assert resp.get("skipped") is not True
    mock_create.assert_awaited_once()
    assert len(bg.tasks) == 1


@pytest.mark.asyncio
async def test_full_trigger_bypasses_guard():
    with (
        patch("app.features.zsxq_ingest.router.db.list_runs", new_callable=AsyncMock,
              return_value=[_running(5)]) as mock_list,
        patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock,
              return_value={"run_id": "rf"}) as mock_create,
    ):
        bg = BackgroundTasks()
        resp = await rt.ingest(bg, full=True, limit=None)

    assert resp["accepted"] is True
    assert resp.get("skipped") is not True
    mock_create.assert_awaited_once()        # full proceeds despite in-flight run
    mock_list.assert_not_awaited()           # guard short-circuits on full


@pytest.mark.asyncio
async def test_guard_degrades_open_on_read_failure():
    # If list_runs raises, the guard must allow the run (never break a trigger).
    with (
        patch("app.features.zsxq_ingest.router.db.list_runs", new_callable=AsyncMock,
              side_effect=RuntimeError("insforge down")),
        patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock,
              return_value={"run_id": "r3"}) as mock_create,
    ):
        bg = BackgroundTasks()
        resp = await rt.ingest(bg, full=False, limit=None)

    assert resp.get("skipped") is not True
    mock_create.assert_awaited_once()


@pytest.mark.asyncio
async def test_backfill_creates_run_and_schedules_task():
    with patch("app.features.zsxq_ingest.router.db.create_run", new_callable=AsyncMock,
               return_value={"run_id": "rb"}) as mock_create:
        bg = BackgroundTasks()
        resp = await rt.backfill(bg, limit=3)

    assert resp["accepted"] is True
    assert resp["run_id"] == "rb"
    assert resp["limit"] == 3
    mock_create.assert_awaited_once_with(rt.GROUP, "backfill")
    assert len(bg.tasks) == 1   # background backfill scheduled
