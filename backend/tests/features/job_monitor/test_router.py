"""Tests for the generic job-monitor admin router.

Endpoints are called directly (the verify_admin_user dependency is bypassed by
passing _admin explicitly), focusing on source resolution + delegation.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.features.job_monitor import router as jm


def _fake_source():
    src = type("FakeSource", (), {})()
    src.key = "fake"
    src.label = "Fake"
    src.overview = AsyncMock(return_value={"health": "ok", "stats": []})
    src.list_runs = AsyncMock(return_value=[{"id": "r1"}])
    src.get_run = AsyncMock(return_value={"id": "r1", "detail": {}})
    return src


@pytest.mark.asyncio
async def test_get_sources_includes_builtin_zsxq():
    out = await jm.get_sources(_admin={})
    keys = [s["key"] for s in out["sources"]]
    assert "zsxq" in keys  # registered via import side-effect


@pytest.mark.asyncio
async def test_unknown_source_raises_404():
    with pytest.raises(HTTPException) as ei:
        await jm.get_overview("does_not_exist", _admin={})
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_overview_delegates_to_source():
    src = _fake_source()
    with patch.object(jm.sources, "get_source", return_value=src):
        out = await jm.get_overview("fake", _admin={})
    assert out == {"health": "ok", "stats": []}
    src.overview.assert_awaited_once()


@pytest.mark.asyncio
async def test_runs_delegates_with_limit():
    src = _fake_source()
    with patch.object(jm.sources, "get_source", return_value=src):
        out = await jm.get_runs("fake", limit=15, _admin={})
    assert out == {"runs": [{"id": "r1"}]}
    src.list_runs.assert_awaited_once_with(limit=15)


@pytest.mark.asyncio
async def test_get_run_wraps_result():
    src = _fake_source()
    with patch.object(jm.sources, "get_source", return_value=src):
        out = await jm.get_run("fake", "r1", _admin={})
    assert out == {"run": {"id": "r1", "detail": {}}}
    src.get_run.assert_awaited_once_with("r1")


@pytest.mark.asyncio
async def test_get_run_404_when_source_returns_none():
    src = _fake_source()
    src.get_run = AsyncMock(return_value=None)
    with patch.object(jm.sources, "get_source", return_value=src):
        with pytest.raises(HTTPException) as ei:
            await jm.get_run("fake", "missing", _admin={})
    assert ei.value.status_code == 404
