"""SSE keep-alive helper.

Mobile carriers and Railway's edge proxy RST idle TCP connections after
roughly 15-30 seconds. Our agent endpoints have long silent windows during
LLM planning, so wrap the SSE generator with `with_heartbeat()` to emit
`: ping\n\n` comment lines (which the browser's SSE parser silently ignores)
during those windows. That keeps bytes flowing so the link is never judged
idle.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

SSE_HEARTBEAT_SECONDS = 5.0


async def with_heartbeat(
    source: AsyncIterator[str],
    *,
    interval_seconds: float | None = None,
) -> AsyncIterator[str]:
    """Wrap an SSE string generator, injecting `: ping\n\n` during silent
    windows longer than `interval_seconds` (default `SSE_HEARTBEAT_SECONDS`).
    """
    aiter = source.__aiter__()

    async def _next_chunk() -> str:
        return await aiter.__anext__()

    interval = interval_seconds if interval_seconds is not None else SSE_HEARTBEAT_SECONDS
    next_task: asyncio.Task[str] | None = None
    try:
        while True:
            if next_task is None:
                next_task = asyncio.create_task(_next_chunk())
            done, _ = await asyncio.wait({next_task}, timeout=interval)
            if not done:
                yield ": ping\n\n"
                continue
            try:
                chunk = next_task.result()
            except StopAsyncIteration:
                return
            next_task = None
            yield chunk
    finally:
        if next_task is not None and not next_task.done():
            next_task.cancel()
            try:
                await next_task
            except BaseException:
                pass
