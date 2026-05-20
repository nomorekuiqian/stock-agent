"""
Unit tests for the configured-KOLs batch fetcher (list-only ingestion).

Covers:
- Empty catalog returns success with no work.
- Each list source maps to ONE list/tweets call (cheap path).
- List failure is isolated per list.
- Orphan rows (non-list source) are skipped with a warning, not crashed on.
- run_id is shared across every list in one batch.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.twitter import service as twitter_service
from app.shared.twitter_kol_config import KolAccount


def _list_kol(username: str, list_id: str) -> KolAccount:
    return {
        "username": username,
        "display_name": username.capitalize(),
        "source": f"list:{list_id}",
    }


def _orphan_kol(username: str) -> KolAccount:
    return {
        "username": username,
        "display_name": username.capitalize(),
        "source": "manual",
    }


@pytest.fixture
def patched_db(monkeypatch):
    """Patch the db.* helpers fetch_configured_kols calls."""
    start = AsyncMock(return_value="row-id-123")
    finish = AsyncMock(return_value=True)
    monkeypatch.setattr(twitter_service.db, "start_fetch_run", start)
    monkeypatch.setattr(twitter_service.db, "finish_fetch_run", finish)
    return {"start": start, "finish": finish}


class TestFetchConfiguredKols:
    @pytest.mark.asyncio
    async def test_empty_catalog_no_op(self, patched_db):
        with patch(
            "app.features.twitter.service.get_enabled_kols",
            new=AsyncMock(return_value=[]),
        ):
            result = await twitter_service.fetch_configured_kols()

        assert result["success"] is True
        assert result["kol_count"] == 0
        assert result["results"] == []
        patched_db["start"].assert_not_called()
        patched_db["finish"].assert_not_called()

    @pytest.mark.asyncio
    async def test_single_list_success(self, patched_db):
        kols = [_list_kol("alice", "123"), _list_kol("bob", "123")]

        fake_list_fetch = AsyncMock(return_value={
            "success": True,
            "list_id": "123",
            "pages_fetched": 2,
            "total_fetched": 40,
            "total_stored": 38,
            "total_skipped_retweets": 2,
            "stopped_reason": "time_window",
        })

        with patch("app.features.twitter.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_list_timeline",
                   fake_list_fetch):
            result = await twitter_service.fetch_configured_kols()

        # One call per list, NOT per KOL
        assert fake_list_fetch.call_count == 1
        assert result["list_groups"] == 1
        assert result["kol_count"] == 2
        assert result["succeeded"] == 1
        assert result["failed"] == 0
        assert result["results"][0]["source"] == "list:123"
        assert result["results"][0]["members_count"] == 2

        # Run row uses synthetic _list:<id> username
        start_kwargs = patched_db["start"].call_args.kwargs
        assert start_kwargs["username"] == "_list:123"

    @pytest.mark.asyncio
    async def test_multiple_lists_isolated_on_failure(self, patched_db):
        kols = [
            _list_kol("alice", "111"),
            _list_kol("bob", "222"),
        ]

        async def fake_fetch(list_id, **kw):
            if list_id == "222":
                raise RuntimeError("twitterapi exploded")
            return {
                "success": True, "list_id": list_id,
                "pages_fetched": 1, "total_fetched": 5,
                "total_stored": 5, "total_skipped_retweets": 0,
            }

        with patch("app.features.twitter.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_list_timeline",
                   side_effect=fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        assert result["list_groups"] == 2
        assert result["succeeded"] == 1
        assert result["failed"] == 1

        failed_calls = [
            c for c in patched_db["finish"].call_args_list
            if c.kwargs.get("status") == "failed"
        ]
        assert len(failed_calls) == 1
        assert "exploded" in (failed_calls[0].kwargs.get("error") or "")

    @pytest.mark.asyncio
    async def test_orphan_non_list_rows_skipped(self, patched_db):
        """Rows with source != 'list:<id>' (e.g. legacy manual) are skipped with
        a warning, not crashed on."""
        kols = [
            _list_kol("alice", "111"),
            _orphan_kol("legacy_manual_kol"),
        ]
        fake_fetch = AsyncMock(return_value={
            "success": True, "list_id": "111",
            "pages_fetched": 1, "total_fetched": 3,
            "total_stored": 3, "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_list_timeline",
                   fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        assert fake_fetch.call_count == 1
        assert result["orphan_count"] == 1
        assert result["list_groups"] == 1

    @pytest.mark.asyncio
    async def test_run_id_shared_across_lists(self, patched_db):
        kols = [_list_kol("a", "111"), _list_kol("b", "222")]
        fake_fetch = AsyncMock(return_value={
            "success": True, "pages_fetched": 1, "total_fetched": 1,
            "total_stored": 1, "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_list_timeline",
                   fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        run_ids = [
            c.kwargs.get("run_id") for c in patched_db["start"].call_args_list
        ]
        assert len(run_ids) == 2
        assert run_ids[0] == run_ids[1] == result["run_id"]

    @pytest.mark.asyncio
    async def test_lookback_and_safety_cap_passed_through(self, patched_db):
        kols = [_list_kol("alice", "111")]
        fake_fetch = AsyncMock(return_value={
            "success": True, "pages_fetched": 1, "total_fetched": 1,
            "total_stored": 1, "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_list_timeline",
                   fake_fetch):
            await twitter_service.fetch_configured_kols(
                list_lookback_hours=6.0,
                list_safety_max_pages=25,
            )

        kw = fake_fetch.call_args.kwargs
        assert kw["lookback_hours"] == 6.0
        assert kw["safety_max_pages"] == 25
