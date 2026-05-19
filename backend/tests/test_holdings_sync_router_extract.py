"""holdings_sync /extract screenshot path — Codex M2 [high] fixes.

Locks in the post-fix order/contract of `_extract_screenshot`:
  ① Invalid image bytes (correct MIME / size, garbage payload) → 400 from
     Pillow decode, and **quota is NOT consumed** (Codex M2 [high] #1).
  ② LLM call has a hard wall-clock cap (`_LLM_TIMEOUT_SEC`); exceeding it
     returns 504 to the user — never an unbounded hang (Codex M2 [high] #2).
  ③ Resolver receives the *remaining* budget, not a fresh deadline.
"""

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.features.holdings_sync import agent as hs_agent
from app.features.holdings_sync import quota as hs_quota
from app.features.holdings_sync import resolver as hs_resolver
from app.features.holdings_sync import router as hs_router
from app.main import app


@pytest.fixture
def client_authed():
    async def _user():
        return "u-test"
    app.dependency_overrides[deps.verify_user_token] = _user
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _flag_on(*flags):
    async def _f(_uid):
        return set(flags)
    return _f


def _ent(allowed):
    async def _e(_uid, _feat):
        return allowed
    return _e


_PNG = ("x.png", b"\x89PNG\r\n\x1a\nNOT-A-REAL-PNG-BUT-RIGHT-MAGIC", "image/png")


# --------------------------------------------------------------------------- #
# ① quota not consumed when image is invalid (Codex M2 [high] #1)
# --------------------------------------------------------------------------- #


def test_invalid_image_returns_400_without_burning_quota(client_authed):
    quota_spy = AsyncMock()
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)), \
         patch.object(hs_router.hs_quota, "check_and_consume", quota_spy):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "screenshot"},
            files={"file": _PNG},  # correct MIME, garbage bytes -> Pillow fails
        )
    assert r.status_code == 400, r.text
    # The whole point of the fix: quota was NEVER touched.
    quota_spy.assert_not_called()


# --------------------------------------------------------------------------- #
# ② LLM timeout returns 504 — request never hangs (Codex M2 [high] #2)
# --------------------------------------------------------------------------- #


def test_llm_timeout_returns_504(client_authed, monkeypatch):
    # Make the LLM step "hang" longer than _LLM_TIMEOUT_SEC. We collapse the
    # timeout to a small value so the test is fast.
    monkeypatch.setattr(hs_router, "_LLM_TIMEOUT_SEC", 0.05)

    # Bypass the image-decode 400 with a no-op downsample that accepts bytes.
    monkeypatch.setattr(hs_router, "_downsample_if_needed",
                        lambda data, mime: (data, mime))

    def slow_extract(_bytes, _mime):
        time.sleep(1.0)  # longer than the (mocked) 0.05s timeout
        raise AssertionError("should have been cancelled by wait_for")
    monkeypatch.setattr(hs_agent, "extract_from_image", slow_extract)

    async def fake_consume(_uid, _mode):
        return 1
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "screenshot"},
            files={"file": _PNG},
        )
    assert r.status_code == 504, r.text


# --------------------------------------------------------------------------- #
# ③ resolver receives the *remaining* budget, not a fresh deadline
# --------------------------------------------------------------------------- #


def test_resolver_receives_remaining_budget(client_authed, monkeypatch):
    """If the LLM took ~2s and the total budget is 14s, resolver should get
    ≤ 12s — not a fresh 8s (the old behavior). We capture the
    SourceContext's deadline_ts and assert it sits within the expected
    window relative to request start."""

    monkeypatch.setattr(hs_router, "_TOTAL_DEADLINE_SEC", 14.0)
    monkeypatch.setattr(hs_router, "_downsample_if_needed",
                        lambda data, mime: (data, mime))

    async def fake_consume(_uid, _mode):
        return 1
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    # Cheap synthetic vision result with a single holding.
    class _R:
        looks_like_holdings = True
        holdings = [type("H", (), dict(symbol_or_name="AAPL", shares=10,
                                       cost_basis=None, entry_price=None,
                                       weight_pct=None))()]
    def fake_extract(_bytes, _mime):
        time.sleep(0.05)  # simulate small LLM latency
        return _R()
    monkeypatch.setattr(hs_agent, "extract_from_image", fake_extract)

    captured = {}
    async def fake_resolve(ctx, raws):
        captured["deadline_ts"] = ctx.deadline_ts
        captured["t"] = time.time()
        return [hs_resolver.Resolution(symbol="AAPL", name="Apple",
                                       exchange="NASDAQ", confidence="high",
                                       status="ok")]
    monkeypatch.setattr(hs_resolver, "resolve_many", fake_resolve)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "screenshot"},
            files={"file": _PNG},
        )
    assert r.status_code == 200, r.text
    remaining = captured["deadline_ts"] - captured["t"]
    # ≤ TOTAL (14s) minus the LLM time (~0.05s) and any IO overhead, ≥ _RESOLVER_MIN_BUDGET (2s).
    assert hs_router._RESOLVER_MIN_BUDGET <= remaining <= hs_router._TOTAL_DEADLINE_SEC, \
        f"resolver deadline {remaining:.2f}s outside expected band " \
        f"[{hs_router._RESOLVER_MIN_BUDGET}, {hs_router._TOTAL_DEADLINE_SEC}]"
