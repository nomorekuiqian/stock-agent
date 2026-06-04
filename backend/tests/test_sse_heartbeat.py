"""Unit tests for app.core.sse.with_heartbeat.

This is the helper used by /api/kol_research/chat/stream and
/api/research/chat/stream to prevent mobile carriers from RST'ing the idle
TCP connection during long LLM planning windows.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import patch


async def _collect(agen) -> list[tuple[float, str]]:
    started = time.monotonic()
    out: list[tuple[float, str]] = []
    async for chunk in agen:
        out.append((time.monotonic() - started, chunk))
    return out


def test_with_heartbeat_emits_pings_during_silence():
    """A 1.0s silent window with a 0.3s heartbeat → ≥2 pings, then the event."""
    from app.core import sse

    async def slow_source():
        await asyncio.sleep(1.0)
        yield "data: real\n\n"

    with patch.object(sse, "SSE_HEARTBEAT_SECONDS", 0.3):
        chunks = asyncio.run(_collect(sse.with_heartbeat(slow_source())))

    pings = [c for _, c in chunks if c == ": ping\n\n"]
    data = [c for _, c in chunks if c.startswith("data: ")]
    assert len(pings) >= 2, f"expected ≥2 pings, got {pings} (all: {chunks})"
    assert data == ["data: real\n\n"], f"data chunk missing: {chunks}"


def test_with_heartbeat_no_pings_when_events_flow():
    """Rapid events → zero heartbeat noise. Heartbeat only fires on silence."""
    from app.core import sse

    async def fast_source():
        for i in range(4):
            yield f"data: e{i}\n\n"
            await asyncio.sleep(0.02)

    with patch.object(sse, "SSE_HEARTBEAT_SECONDS", 1.0):
        chunks = asyncio.run(_collect(sse.with_heartbeat(fast_source())))

    pings = [c for _, c in chunks if c == ": ping\n\n"]
    data = [c for _, c in chunks if c.startswith("data: ")]
    assert pings == [], f"unexpected pings: {pings}"
    assert len(data) == 4


def test_with_heartbeat_cleans_up_pending_task_on_close():
    """If the consumer stops iterating mid-stream the pending next_task must
    be cancelled so we don't leak the inner generator."""
    from app.core import sse

    inner_started = asyncio.Event()
    inner_cancelled = asyncio.Event()

    async def slow_source():
        try:
            inner_started.set()
            await asyncio.sleep(10)
            yield "data: never\n\n"
        except asyncio.CancelledError:
            inner_cancelled.set()
            raise

    async def run():
        agen = sse.with_heartbeat(slow_source(), interval_seconds=0.05)
        # Pull one ping, then close the generator.
        first = await agen.__anext__()
        assert first == ": ping\n\n"
        await agen.aclose()

    asyncio.run(run())
    assert inner_started.is_set()
    assert inner_cancelled.is_set(), "inner source was not cancelled on close"


def test_with_heartbeat_uses_explicit_interval_over_module_default():
    """interval_seconds kwarg should win over the module-level default."""
    from app.core import sse

    async def slow_source():
        await asyncio.sleep(0.5)
        yield "data: real\n\n"

    with patch.object(sse, "SSE_HEARTBEAT_SECONDS", 999.0):  # would never fire
        chunks = asyncio.run(_collect(
            sse.with_heartbeat(slow_source(), interval_seconds=0.1)
        ))

    pings = [c for _, c in chunks if c == ": ping\n\n"]
    assert len(pings) >= 2, f"expected explicit interval to take effect: {chunks}"
