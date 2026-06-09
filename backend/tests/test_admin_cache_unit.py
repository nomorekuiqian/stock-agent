"""
Admin cache unit tests -- generated from git diff

Tests for: app.features.admin.cache.get_list_all / invalidate
No network access, no database. Loader callables are in-memory async stubs.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_admin_cache_unit.py -v
"""

import asyncio

import pytest

from app.features.admin import cache


@pytest.fixture(autouse=True)
def clear_admin_cache():
    """Ensure module-level cache state cannot leak across tests."""
    cache.invalidate()
    yield
    cache.invalidate()


class TestAdminListAllCache:
    """Tests for get_list_all."""

    @pytest.mark.asyncio
    async def test_successful_payload_is_cached_until_invalidated(self):
        """Successful list_all payload is reused, then refreshed after invalidate()."""
        calls = 0

        async def loader():
            nonlocal calls
            calls += 1
            return {"data": {"success": True, "data": [{"user_id": f"u{calls}"}]}}

        first = await cache.get_list_all(loader)
        second = await cache.get_list_all(loader)
        assert calls == 1
        assert first is second
        assert second["data"]["data"][0]["user_id"] == "u1"

        cache.invalidate()
        refreshed = await cache.get_list_all(loader)
        assert calls == 2
        assert refreshed["data"]["data"][0]["user_id"] == "u2"

    @pytest.mark.asyncio
    async def test_failed_payload_is_not_cached(self):
        """Failed edge-function payloads are not pinned for the TTL window."""
        calls = 0

        async def loader():
            nonlocal calls
            calls += 1
            if calls == 1:
                return {"data": {"success": False, "error": "upstream failed"}}
            return {"data": {"success": True, "data": [{"user_id": "u2"}]}}

        failed = await cache.get_list_all(loader)
        recovered = await cache.get_list_all(loader)

        assert calls == 2
        assert failed["data"]["success"] is False
        assert recovered["data"]["success"] is True
        assert recovered["data"]["data"][0]["user_id"] == "u2"

    @pytest.mark.asyncio
    async def test_concurrent_callers_share_one_loader(self):
        """Concurrent cache misses coalesce behind a single upstream loader call."""
        calls = 0
        started = asyncio.Event()
        release = asyncio.Event()

        async def loader():
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            return {"data": {"success": True, "data": [{"user_id": "shared"}]}}

        tasks = [asyncio.create_task(cache.get_list_all(loader)) for _ in range(5)]
        await started.wait()
        release.set()
        results = await asyncio.gather(*tasks)

        assert calls == 1
        assert all(result["data"]["data"][0]["user_id"] == "shared" for result in results)
