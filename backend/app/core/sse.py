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

    # Drive the source generator inside ONE producer task so its entire lifetime
    # runs in a single consistent context. The old approach re-tasked each
    # __anext__ (asyncio.create_task per chunk), which copies the context per
    # chunk and breaks any ContextVar the source sets/resets across yields
    # (e.g. kol_research's _sse_queue -> "Token created in a different Context").
    chunk_queue: asyncio.Queue = asyncio.Queue()
    _DONE = object()

    async def _drain() -> None:
        try:
            while True:
                chunk = await aiter.__anext__()
                await chunk_queue.put(("chunk", chunk))
        except StopAsyncIteration:
            await chunk_queue.put(("done", _DONE))
        except BaseException as exc:  # noqa: BLE001 - forwarded to the consumer
            await chunk_queue.put(("error", exc))

    interval = interval_seconds if interval_seconds is not None else SSE_HEARTBEAT_SECONDS
    started_at = time.monotonic()
    chunks_forwarded = 0
    heartbeats_sent = 0
    longest_silence = 0.0
    last_chunk_at = started_at
    completed_normally = False
    producer: asyncio.Task[None] = asyncio.create_task(_drain())
    get_task: asyncio.Task | None = None
    try:
        while True:
            if get_task is None:
                get_task = asyncio.ensure_future(chunk_queue.get())
            done, _ = await asyncio.wait({get_task}, timeout=interval)
            if not done:
                yield ": ping\n\n"
                heartbeats_sent += 1
                continue
            kind, payload = get_task.result()
            get_task = None
            if kind == "done":
                completed_normally = True
                return
            if kind == "error":
                raise payload
            gap = time.monotonic() - last_chunk_at
            if gap > longest_silence:
                longest_silence = gap
            last_chunk_at = time.monotonic()
            chunks_forwarded += 1
            yield payload
    finally:
        if get_task is not None and not get_task.done():
            get_task.cancel()
            try:
                await get_task
            except BaseException:
                pass
        if not producer.done():
            producer.cancel()
            try:
                await producer
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
