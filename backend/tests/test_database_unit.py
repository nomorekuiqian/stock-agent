"""Unit tests for app.core.database.InsforgeService — per-event-loop HTTP client.

Regression: the service is a process-wide singleton, but httpx.AsyncClient is
bound to the event loop it was created on. zsxq ingest runs its crawl in a
worker thread via ``asyncio.run`` (a NEW loop) after the request handler already
used the singleton on the main loop, which raised
``RuntimeError: <...> is bound to a different event loop`` on the first Insforge
call. The client must therefore be keyed per running loop.
"""

from __future__ import annotations

import asyncio
import threading

import httpx

from app.core.database import InsforgeService


def test_client_is_per_event_loop():
    """Two separate event loops must each get their OWN client object."""
    svc = InsforgeService()
    box: dict[str, object] = {}

    async def grab(key: str) -> None:
        box[key] = await svc._get_client()

    asyncio.run(grab("a"))
    asyncio.run(grab("b"))

    assert box["a"] is not box["b"], "each event loop must get its own httpx client"


def test_client_reused_within_same_loop():
    """Within a single loop the client is reused (connection pooling preserved)."""
    svc = InsforgeService()

    async def grab_twice():
        a = await svc._get_client()
        b = await svc._get_client()
        return a is b

    assert asyncio.run(grab_twice()) is True


def test_client_not_shared_across_thread_loops():
    """Reproduce the production router pattern: the singleton is used on the main
    loop, then a worker thread runs its own ``asyncio.run`` loop reusing the SAME
    singleton. Each loop must hold a distinct client (so no cross-loop reuse)."""
    svc = InsforgeService()
    box: dict[str, object] = {}

    async def grab(key: str) -> None:
        box[key] = await svc._get_client()

    asyncio.run(grab("main"))  # main loop
    t = threading.Thread(target=lambda: asyncio.run(grab("worker")))
    t.start()
    t.join()

    assert box["main"] is not box["worker"]


def test_aclose_current_loop_closes_and_removes():
    """aclose_current_loop must close the current loop's client and forget it."""
    svc = InsforgeService()

    async def make_then_close():
        c = await svc._get_client()
        assert not c.is_closed
        await svc.aclose_current_loop()
        return c.is_closed

    assert asyncio.run(make_then_close()) is True


def test_call_function_retries_timeout_with_fresh_client(monkeypatch):
    """A pooled-client timeout should drop that loop's client and retry once."""
    svc = InsforgeService()
    seen_clients: list[httpx.AsyncClient] = []

    async def fake_send(client, *_args, **_kwargs):
        seen_clients.append(client)
        if len(seen_clients) == 1:
            raise httpx.TimeoutException("stale connection")
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(svc, "_send", fake_send)

    async def run():
        return await svc.call_function("example", timeout=15.0)

    result = asyncio.run(run())

    assert result["status_code"] == 200
    assert result["data"] == {"success": True}
    assert len(seen_clients) == 2
    assert seen_clients[0].is_closed
    assert svc._clients == {}


def test_call_function_can_bypass_pool(monkeypatch):
    """use_pool=False uses a one-shot client and leaves the pool untouched."""
    svc = InsforgeService()
    seen_clients: list[httpx.AsyncClient] = []

    async def fake_send(client, *_args, **_kwargs):
        seen_clients.append(client)
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(svc, "_send", fake_send)

    async def run():
        return await svc.call_function("example", use_pool=False)

    result = asyncio.run(run())

    assert result["status_code"] == 200
    assert result["data"] == {"success": True}
    assert len(seen_clients) == 1
    assert seen_clients[0].is_closed
    assert svc._clients == {}
