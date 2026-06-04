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
import sys
import time
from typing import AsyncIterator

from app.core.logging import get_logger

logger = get_logger(__name__)

SSE_HEARTBEAT_SECONDS = 5.0


async def with_heartbeat(
    source: AsyncIterator[str],
    *,
    interval_seconds: float | None = None,
    stream_name: str = "sse",
) -> AsyncIterator[str]:
    """Wrap an SSE string generator, injecting `: ping\n\n` during silent
    windows longer than `interval_seconds` (default `SSE_HEARTBEAT_SECONDS`).

    Logs a single summary line at end of stream so we can tell from logs
    whether the client received the full stream or got disconnected early.
    """
    aiter = source.__aiter__()

    async def _next_chunk() -> str:
        return await aiter.__anext__()

    interval = interval_seconds if interval_seconds is not None else SSE_HEARTBEAT_SECONDS
    started_at = time.monotonic()
    chunks_forwarded = 0
    heartbeats_sent = 0
    longest_silence = 0.0
    last_chunk_at = started_at
    next_task: asyncio.Task[str] | None = None
    completed_normally = False
    try:
        while True:
            if next_task is None:
                next_task = asyncio.create_task(_next_chunk())
            done, _ = await asyncio.wait({next_task}, timeout=interval)
            if not done:
                yield ": ping\n\n"
                heartbeats_sent += 1
                continue
            try:
                chunk = next_task.result()
            except StopAsyncIteration:
                completed_normally = True
                return
            next_task = None
            gap = time.monotonic() - last_chunk_at
            if gap > longest_silence:
                longest_silence = gap
            last_chunk_at = time.monotonic()
            chunks_forwarded += 1
            yield chunk
    finally:
        if next_task is not None and not next_task.done():
            next_task.cancel()
            try:
                await next_task
            except BaseException:
                pass
        elapsed = time.monotonic() - started_at
        if completed_normally:
            logger.info(
                "sse_stream end: name=%s reason=ok elapsed=%.2fs chunks=%d "
                "heartbeats=%d longest_silence=%.2fs",
                stream_name, elapsed, chunks_forwarded, heartbeats_sent, longest_silence,
            )
        else:
            exc_type = sys.exc_info()[0]
            reason = "client_disconnect" if exc_type is None else exc_type.__name__
            logger.warning(
                "sse_stream end: name=%s reason=%s elapsed=%.2fs chunks=%d "
                "heartbeats=%d longest_silence=%.2fs",
                stream_name, reason, elapsed, chunks_forwarded, heartbeats_sent,
                longest_silence,
            )
