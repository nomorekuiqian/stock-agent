"""holdings_sync LLM quota — **fail-CLOSED** + **atomic** (design §5;
Codex adversarial-review fixes).

Distinct from `quota/service.py` (research chat = fail-open). For LLM/vision
extract paths a quota-EF outage MUST refuse the call, not silently succeed;
and the consume must be atomic (Codex M2 [high] #3): a single EF action that
returns `(consumed, count, lim)` atomically — no select-then-update race.
These tests lock that contract.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.holdings_sync import quota as hs_quota


def _ok_consume(consumed: bool, count: int) -> dict:
    return {
        "status_code": 200,
        "data": {
            "success": True,
            "data": {"consumed": consumed, "count": count, "lim": hs_quota.DAILY_LIMIT},
        },
        "text": "",
    }


def _ef_down() -> dict:
    return {"status_code": 502, "data": {}, "text": "Bad Gateway"}


def _ef_success_false() -> dict:
    return {"status_code": 200, "data": {"success": False, "error": "boom"}, "text": ""}


def _make_service(*responses):
    """Returns a fake `get_insforge_service()` whose `.call_function` yields
    each scripted response (or raises if the response is an Exception)."""
    it = iter(responses)

    async def fake_call(name, *, method, params=None, json_body=None, timeout=10.0,
                       extra_headers=None):
        nxt = next(it)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    svc = AsyncMock()
    svc.call_function = AsyncMock(side_effect=fake_call)
    return svc


# --------------------------------------------------------------------------- #
# identifier namespace (design §5 — never collide with research chat)
# --------------------------------------------------------------------------- #


def test_identifier_namespaced():
    assert hs_quota._identifier("u-1") == "hsync:u-1"
    assert hs_quota._identifier("u-1").startswith("hsync:")
    assert not hs_quota._identifier("u-1").startswith("research:")


# --------------------------------------------------------------------------- #
# atomic single-call contract (Codex M2 [high] #3)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_check_and_consume_uses_single_atomic_action():
    """The whole point: only ONE EF call (consume_if_under_limit), not the
    old raceable get_usage → increment two-step."""
    svc = _make_service(_ok_consume(True, 3))
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        new = await hs_quota.check_and_consume("u-1", "screenshot")
    assert new == 3
    assert svc.call_function.await_count == 1
    call = svc.call_function.await_args_list[0]
    assert call.kwargs["params"] == {"action": "consume_if_under_limit"}
    body = call.kwargs["json_body"]
    assert body["identifier"] == "hsync:u-1"          # namespaced
    assert body["limit"] == hs_quota.DAILY_LIMIT      # passed atomically
    assert body["identifier_type"] == "user"


# --------------------------------------------------------------------------- #
# happy path
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_check_and_consume_happy_path():
    svc = _make_service(_ok_consume(True, 1))
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        new = await hs_quota.check_and_consume("u-1", "screenshot")
    assert new == 1


# --------------------------------------------------------------------------- #
# fail-CLOSED: EF outage / non-2xx / success=false -> QuotaUnavailable
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_fail_closed_on_transport_exception():
    svc = _make_service(RuntimeError("conn refused"))
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        with pytest.raises(hs_quota.QuotaUnavailable):
            await hs_quota.check_and_consume("u-1", "screenshot")


@pytest.mark.asyncio
async def test_fail_closed_on_5xx():
    svc = _make_service(_ef_down())
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        with pytest.raises(hs_quota.QuotaUnavailable):
            await hs_quota.check_and_consume("u-1", "screenshot")


@pytest.mark.asyncio
async def test_fail_closed_on_success_false():
    svc = _make_service(_ef_success_false())
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        with pytest.raises(hs_quota.QuotaUnavailable):
            await hs_quota.check_and_consume("u-1", "screenshot")


# --------------------------------------------------------------------------- #
# QuotaExceeded — server (SQL function) returned consumed=false at cap
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_quota_exceeded_when_server_refuses():
    """The SQL function atomically refuses (consumed=false) when count >=
    limit. We must map that to QuotaExceeded (router 429), not silently
    succeed and not collapse into QuotaUnavailable (which is 503)."""
    svc = _make_service(_ok_consume(False, hs_quota.DAILY_LIMIT))
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        with pytest.raises(hs_quota.QuotaExceeded):
            await hs_quota.check_and_consume("u-1", "screenshot")


# --------------------------------------------------------------------------- #
# exception classes distinct (router distinguishes 503 vs 429)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_exception_classes_are_distinct():
    assert not issubclass(hs_quota.QuotaExceeded, hs_quota.QuotaUnavailable)
    assert not issubclass(hs_quota.QuotaUnavailable, hs_quota.QuotaExceeded)


# --------------------------------------------------------------------------- #
# concurrency proof — only the first remaining slots are consumed, the rest
# are refused atomically (the whole reason for this fix)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_concurrent_consumes_respect_cap():
    """With remaining = 2 slots, fire 5 concurrent consumes. The atomic SQL
    function (mocked here to simulate Postgres advisory-locked atomicity)
    must give consumed=true to exactly 2 and consumed=false to the rest —
    NEVER allow 5 successful consumes past the cap (the old two-step bug)."""
    state = {"count": hs_quota.DAILY_LIMIT - 2}

    async def fake_call(name, *, method, params=None, json_body=None, timeout=10.0,
                        extra_headers=None):
        # Atomic check-and-increment that mirrors the SQL function semantics
        if state["count"] >= hs_quota.DAILY_LIMIT:
            return _ok_consume(False, state["count"])
        state["count"] += 1
        return _ok_consume(True, state["count"])

    svc = AsyncMock()
    svc.call_function = AsyncMock(side_effect=fake_call)

    import asyncio
    with patch.object(hs_quota, "get_insforge_service", return_value=svc):
        results = await asyncio.gather(
            *[
                _safe(hs_quota.check_and_consume("u-1", "screenshot"))
                for _ in range(5)
            ]
        )
    consumed = [r for r in results if r["ok"]]
    refused = [r for r in results if not r["ok"]]
    assert len(consumed) == 2, f"expected exactly 2 consumes, got {len(consumed)}: {results}"
    assert len(refused) == 3
    assert all(isinstance(r["exc"], hs_quota.QuotaExceeded) for r in refused)


async def _safe(coro):
    try:
        v = await coro
        return {"ok": True, "value": v}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "exc": e}
