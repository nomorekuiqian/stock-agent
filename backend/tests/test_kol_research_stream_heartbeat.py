"""SSE keep-alive heartbeat for /api/kol_research/chat/stream.

Reproduces the production bug where the agent had a 20+ second silent window
during LLM planning and mobile carriers RST'd the idle TCP connection. The fix
emits `: ping\n\n` comment lines while waiting for the next agent event.

To run only this file:
    pytest tests/test_kol_research_stream_heartbeat.py -v
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


_ALLOWED_QUOTA = {
    "allowed": True,
    "used": 0,
    "limit": 2,
    "remaining": 2,
    "unlimited": True,
}


def _slow_stream_factory(silence_seconds: float):
    """Build a fake stream_kol_research that stays silent for N seconds
    before yielding a single final event, simulating LLM planning."""

    async def fake_stream(**_kwargs):
        await asyncio.sleep(silence_seconds)
        yield {"type": "final", "data": {"message": "ok"}}

    return fake_stream


def _post_stream_and_collect(silence_seconds: float) -> list[tuple[float, str]]:
    """Hit the chat/stream endpoint with a stubbed agent that goes silent for
    `silence_seconds`. Returns a list of (elapsed_seconds, raw_line) tuples."""
    from app.features.kol_research import router as kol_router
    from app.main import app

    async def fake_flag():
        return {"user_id": "test-user", "email": "test@example.com"}

    app.dependency_overrides[kol_router.require_kol_research_flag] = fake_flag
    try:
        with patch(
            "app.features.kol_research.router.stream_kol_research",
            _slow_stream_factory(silence_seconds),
        ), patch(
            "app.features.kol_research.router.consume_quota",
            new_callable=AsyncMock,
            return_value=_ALLOWED_QUOTA,
        ):
            client = TestClient(app)
            with client.stream(
                "POST",
                "/api/kol_research/chat/stream",
                json={
                    "message": "test",
                    "persona_username": "aleabitoreddit",
                    "history": [],
                    "turn_id": "t1",
                },
            ) as resp:
                assert resp.status_code == 200
                started = time.monotonic()
                lines: list[tuple[float, str]] = []
                for raw in resp.iter_lines():
                    if raw == "":
                        continue
                    lines.append((time.monotonic() - started, raw))
                return lines
    finally:
        app.dependency_overrides.pop(kol_router.require_kol_research_flag, None)


def test_heartbeat_emitted_during_silent_window():
    """During a 12s silent window the client should see at least 2 pings
    before the real event (5s + 10s heartbeats, then event at ~12s)."""
    # Speed up the heartbeat for the test so it runs fast.
    with patch("app.core.sse.SSE_HEARTBEAT_SECONDS", 0.3):
        lines = _post_stream_and_collect(silence_seconds=1.0)

    pings = [(t, line) for t, line in lines if line.startswith(":")]
    data_lines = [(t, line) for t, line in lines if line.startswith("data:")]

    # During a 1.0s silent window with 0.3s heartbeat, expect ≥2 pings.
    assert len(pings) >= 2, (
        f"expected ≥2 heartbeat pings during 1.0s silence, got {len(pings)}. "
        f"all lines: {lines}"
    )
    # First ping must arrive well before the real event.
    assert pings[0][0] < 0.9, f"first ping too late: {pings[0]}"
    # The final event still gets delivered.
    assert len(data_lines) == 1, f"expected 1 data event, got {data_lines}"
    assert '"final"' in data_lines[0][1]


def test_no_heartbeat_when_events_flow_normally():
    """When events arrive faster than the heartbeat interval, no pings should
    be emitted (the heartbeat is only for silent windows)."""
    from app.features.kol_research import router as kol_router
    from app.main import app

    async def fast_stream(**_kw):
        for i in range(3):
            yield {"type": "tool_call_start", "tool": f"t{i}"}
            await asyncio.sleep(0.05)
        yield {"type": "final", "data": {"message": "ok"}}

    async def fake_flag():
        return {"user_id": "test-user", "email": "test@example.com"}

    app.dependency_overrides[kol_router.require_kol_research_flag] = fake_flag
    try:
        with patch("app.core.sse.SSE_HEARTBEAT_SECONDS", 1.0), \
             patch("app.features.kol_research.router.stream_kol_research", fast_stream), \
             patch(
                 "app.features.kol_research.router.consume_quota",
                 new_callable=AsyncMock,
                 return_value=_ALLOWED_QUOTA,
             ):
            client = TestClient(app)
            with client.stream(
                "POST",
                "/api/kol_research/chat/stream",
                json={
                    "message": "test",
                    "persona_username": "aleabitoreddit",
                    "history": [],
                    "turn_id": "t2",
                },
            ) as resp:
                lines = [raw for raw in resp.iter_lines() if raw]

        pings = [line for line in lines if line.startswith(":")]
        data_lines = [line for line in lines if line.startswith("data:")]
        assert pings == [], f"unexpected heartbeats during fast stream: {pings}"
        assert len(data_lines) == 4, f"expected 4 events, got {len(data_lines)}"
    finally:
        app.dependency_overrides.pop(kol_router.require_kol_research_flag, None)
