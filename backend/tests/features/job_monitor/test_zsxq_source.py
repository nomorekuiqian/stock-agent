"""Tests for the zsxq job-monitor source adapter.

Focus: status->state mapping, metric normalization, overview health logic,
the cookie NEVER leaking, and graceful degradation on read failure.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.features.job_monitor import sources
from app.features.job_monitor import zsxq_source as zs


def _run_row(**over):
    base = {
        "run_id": "r1",
        "crawl_type": "incremental",
        "status": "done",
        "started_at": "2026-06-24T10:00:00+00:00",
        "finished_at": "2026-06-24T10:00:11+00:00",
        "topics_seen": 5,
        "indexed": 3,
        "skipped": 2,
        "failed": 0,
        "files_downloaded": 1,
        "error_message": None,
    }
    base.update(over)
    return base


def test_normalize_run_maps_state_metrics_and_duration():
    n = zs._normalize_run(_run_row())
    assert n["id"] == "r1"
    assert n["type"] == "incremental"
    assert n["state"] == sources.STATE_OK
    assert n["duration_seconds"] == 11.0
    metrics = {m["label"]: m["value"] for m in n["metrics"]}
    assert metrics["抓取"] == 5
    assert metrics["入库"] == 3
    assert metrics["跳过"] == 2


@pytest.mark.parametrize(
    "status,state",
    [
        ("done", sources.STATE_OK),
        ("running", sources.STATE_RUNNING),
        ("degraded", sources.STATE_WARN),
        ("failed", sources.STATE_FAIL),
        ("auth_failed", sources.STATE_FAIL),
        ("something_new", sources.STATE_WARN),  # unknown -> warn (visible, not hidden)
    ],
)
def test_state_mapping(status, state):
    assert zs._normalize_run(_run_row(status=status))["state"] == state


def test_normalize_run_handles_missing_finish():
    n = zs._normalize_run(_run_row(status="running", finished_at=None))
    assert n["duration_seconds"] is None


@pytest.mark.asyncio
async def test_overview_health_fail_and_cookie_never_leaks():
    src = zs.ZsxqJobSource()
    with (
        patch.object(zs.zsxq_db, "get_credential", new_callable=AsyncMock,
                     return_value={"status": "cookie_expired", "cookie": "SUPER_SECRET_TOKEN"}),
        patch.object(zs.zsxq_db, "get_state", new_callable=AsyncMock,
                     return_value={"last_success_at": "2026-06-20T00:00:00+00:00",
                                   "last_seen_create_time": "2026-06-23T00:00:00+00:00"}),
        patch.object(zs.zsxq_db, "list_runs", new_callable=AsyncMock,
                     return_value=[_run_row(status="done", indexed=3)]),
    ):
        ov = await src.overview()

    assert ov["health"] == sources.TONE_FAIL  # cookie not active dominates
    assert "SUPER_SECRET_TOKEN" not in str(ov)  # cookie value must never surface
    cookie_stat = next(s for s in ov["stats"] if s["label"] == "Cookie")
    assert cookie_stat["value"] == "cookie_expired"
    assert cookie_stat["tone"] == sources.TONE_FAIL


@pytest.mark.asyncio
async def test_overview_health_ok_when_active_and_last_done():
    src = zs.ZsxqJobSource()
    with (
        patch.object(zs.zsxq_db, "get_credential", new_callable=AsyncMock,
                     return_value={"status": "active", "cookie": "x"}),
        patch.object(zs.zsxq_db, "get_state", new_callable=AsyncMock,
                     return_value={"last_success_at": "2026-06-24T00:00:00+00:00",
                                   "last_seen_create_time": "c"}),
        patch.object(zs.zsxq_db, "list_runs", new_callable=AsyncMock,
                     return_value=[_run_row(status="done")]),
    ):
        ov = await src.overview()
    assert ov["health"] == sources.TONE_OK


@pytest.mark.asyncio
async def test_overview_warn_when_active_but_last_run_failed():
    src = zs.ZsxqJobSource()
    with (
        patch.object(zs.zsxq_db, "get_credential", new_callable=AsyncMock,
                     return_value={"status": "active"}),
        patch.object(zs.zsxq_db, "get_state", new_callable=AsyncMock, return_value={}),
        patch.object(zs.zsxq_db, "list_runs", new_callable=AsyncMock,
                     return_value=[_run_row(status="failed")]),
    ):
        ov = await src.overview()
    assert ov["health"] == sources.TONE_WARN


@pytest.mark.asyncio
async def test_get_run_attaches_ledger_and_report_detail():
    src = zs.ZsxqJobSource()
    with (
        patch.object(zs.zsxq_db, "get_run", new_callable=AsyncMock,
                     return_value=_run_row(report={"indexed": 3, "dropped": {}})),
        patch.object(zs.zsxq_db, "aggregate_ledger", new_callable=AsyncMock,
                     return_value={"total": 5, "drop_reasons": {"non_authored": 2}}),
    ):
        run = await src.get_run("r1")
    assert run["detail"]["ledger"]["total"] == 5
    assert run["detail"]["ledger"]["drop_reasons"]["non_authored"] == 2
    assert run["detail"]["report"]["indexed"] == 3


@pytest.mark.asyncio
async def test_get_run_returns_none_when_missing():
    src = zs.ZsxqJobSource()
    with patch.object(zs.zsxq_db, "get_run", new_callable=AsyncMock, return_value=None):
        assert await src.get_run("nope") is None


@pytest.mark.asyncio
async def test_overview_degrades_on_read_failure():
    # Every read raising must not bubble up — overview still returns a shape.
    src = zs.ZsxqJobSource()
    with (
        patch.object(zs.zsxq_db, "get_credential", new_callable=AsyncMock, side_effect=RuntimeError("down")),
        patch.object(zs.zsxq_db, "get_state", new_callable=AsyncMock, side_effect=RuntimeError("down")),
        patch.object(zs.zsxq_db, "list_runs", new_callable=AsyncMock, side_effect=RuntimeError("down")),
    ):
        ov = await src.overview()
    assert ov["health"] == sources.TONE_FAIL  # missing cookie -> fail
    assert isinstance(ov["stats"], list)
