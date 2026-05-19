"""holdings_sync router guards — Codex adversarial review fix.

The staged-rollout boundary must hold on the **write** endpoint too: a
direct `POST /commit` (skipping `/extract`) must be refused with 404 when
the flag is off and 400 when the source isn't yet enabled — BEFORE
entitlement and BEFORE reconcile. Otherwise any Pro user who knows the
endpoint can write `user_portfolios` in a flag-closed / not-yet-rolled-out
state and trigger replace-by-source deletes.

These tests pin that order on BOTH endpoints.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.features.holdings_sync import router as hs_router
from app.features.holdings_sync import service as hs_service
from app.main import app


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


@pytest.fixture
def client_authed():
    """Bypass JWT verification with a fixed user_id."""
    async def _user():
        return "u-test"
    app.dependency_overrides[deps.verify_user_token] = _user
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _flag_on(*flags: str):
    async def _f(_uid):
        return set(flags)
    return _f


def _ent(allowed: bool):
    async def _e(_uid, _feat):
        return allowed
    return _e


# Convenience: an UploadFile-shaped multipart payload for /extract.
def _file_part():
    return {"file": ("x.png", b"\x89PNG\r\n\x1a\nFAKE", "image/png")}


# --------------------------------------------------------------------------- #
# /extract — flag → stage → entitlement order
# --------------------------------------------------------------------------- #


def test_extract_returns_404_when_flag_off(client_authed):
    with patch.object(hs_router, "get_user_flags", _flag_on()):  # empty flag set
        r = client_authed.post("/api/holdings-sync/extract",
                               data={"mode": "screenshot"},
                               files=_file_part())
    assert r.status_code == 404


def test_extract_returns_400_when_mode_not_enabled(client_authed):
    # Stage 1 = {"screenshot"} — paste/csv/pdf must 400 even with flag on.
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")):
        r = client_authed.post("/api/holdings-sync/extract",
                               data={"mode": "csv"},
                               files=_file_part())
    assert r.status_code == 400
    assert "即将上线" in r.json().get("detail", "")


def test_extract_403_when_no_entitlement(client_authed):
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(False)):
        r = client_authed.post("/api/holdings-sync/extract",
                               data={"mode": "screenshot"},
                               files=_file_part())
    assert r.status_code == 403


# --------------------------------------------------------------------------- #
# /commit — write path symmetric guards (Codex [high] fix)
# --------------------------------------------------------------------------- #


@pytest.fixture
def reconcile_spy(monkeypatch):
    """Spy on reconcile_and_upsert to assert it's never called when gates
    short-circuit (the whole point of the guard)."""
    spy = AsyncMock(return_value=None)
    monkeypatch.setattr(hs_router, "reconcile_and_upsert", spy)
    monkeypatch.setattr(hs_service, "reconcile_and_upsert", spy)
    return spy


def _commit_body(source: str = "screenshot", rows=None):
    return {
        "source": source,
        "rows": rows if rows is not None else [
            {"symbol": "AAPL", "shares": 10}
        ],
        "clear_source": False,
    }


def test_commit_404_when_flag_off_bypass_blocked(client_authed, reconcile_spy):
    """The Codex blocker: direct POST /commit must 404 when the flag is
    off — even with a valid JWT and Pro entitlement, no DB write occurs."""
    with patch.object(hs_router, "get_user_flags", _flag_on()), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post("/api/holdings-sync/commit", json=_commit_body())
    assert r.status_code == 404
    reconcile_spy.assert_not_called()


def test_commit_400_when_source_not_enabled(client_authed, reconcile_spy):
    """Stage 1: payload.source='csv' is rejected at the gate before
    entitlement/reconcile — exactly the symmetric stage gate on the write
    path that Codex required."""
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post("/api/holdings-sync/commit",
                               json=_commit_body(source="csv"))
    assert r.status_code == 400
    reconcile_spy.assert_not_called()


def test_commit_403_when_no_entitlement(client_authed, reconcile_spy):
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(False)):
        r = client_authed.post("/api/holdings-sync/commit",
                               json=_commit_body(source="screenshot"))
    assert r.status_code == 403
    reconcile_spy.assert_not_called()


# --------------------------------------------------------------------------- #
# Ordering: flag/stage execute BEFORE entitlement (no info leak / no call)
# --------------------------------------------------------------------------- #


def test_flag_check_runs_before_entitlement(client_authed):
    """When the flag is off AND the entitlement check would have failed
    too, the response is 404 (flag) — not 403. Locks the gate order so a
    future refactor can't accidentally surface entitlement state to
    unauthorized callers."""
    ent_spy = AsyncMock(return_value=False)
    with patch.object(hs_router, "get_user_flags", _flag_on()), \
         patch.object(hs_router, "has_entitlement", ent_spy):
        r = client_authed.post("/api/holdings-sync/commit", json=_commit_body())
    assert r.status_code == 404
    ent_spy.assert_not_called()
