"""
Unit tests for the configured-KOLs batch fetcher.

Covers Phase 1 of the Twitter KOL Opinion Platform plan:
- Empty catalog returns success with no work.
- All-success path: every KOL fetched, run rows recorded.
- Per-KOL isolation: one KOL failing does not block the rest.
- TwitterAPI key missing → service returns failure per KOL, recorded as failed run.
- Catalog validation: duplicate / missing username are caught.
- Safety window flag: reached_safety_window is True iff latest tweet predates window.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.twitter import service as twitter_service
from app.shared.twitter_kol_config import KolAccount, validate_catalog


# ---------------------------------------------------------------------------
# Catalog validation
# ---------------------------------------------------------------------------

class TestCatalogValidation:
    def test_empty_catalog_is_valid(self):
        with patch("app.shared.twitter_kol_config.TWITTER_KOL_ACCOUNTS", []):
            assert validate_catalog() == []

    def test_missing_username_flagged(self):
        bad: list[KolAccount] = [{"display_name": "X"}]  # type: ignore[typeddict-item]
        with patch("app.shared.twitter_kol_config.TWITTER_KOL_ACCOUNTS", bad):
            errors = validate_catalog()
        assert any("missing username" in e for e in errors)

    def test_duplicate_username_flagged(self):
        bad: list[KolAccount] = [
            {"username": "alice", "display_name": "Alice"},
            {"username": "ALICE", "display_name": "Alice2"},
        ]
        with patch("app.shared.twitter_kol_config.TWITTER_KOL_ACCOUNTS", bad):
            errors = validate_catalog()
        assert any("duplicate" in e for e in errors)


# ---------------------------------------------------------------------------
# fetch_configured_kols behavior
# ---------------------------------------------------------------------------

def _kol(username: str) -> KolAccount:
    return {
        "username": username,
        "display_name": username.capitalize(),
    }


@pytest.fixture
def patched_db(monkeypatch):
    """Patch all db.* helpers used by fetch_configured_kols with async mocks."""
    start = AsyncMock(return_value="row-id-123")
    finish = AsyncMock(return_value=True)
    get_tweets = AsyncMock(return_value=[])

    monkeypatch.setattr(twitter_service.db, "start_fetch_run", start)
    monkeypatch.setattr(twitter_service.db, "finish_fetch_run", finish)
    monkeypatch.setattr(twitter_service.db, "get_tweets", get_tweets)

    return {
        "start": start,
        "finish": finish,
        "get_tweets": get_tweets,
    }


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
    async def test_all_success_path(self, patched_db):
        kols = [_kol("alice"), _kol("bob")]

        fake_fetch = AsyncMock(side_effect=lambda username, max_pages: {
            "success": True,
            "username": username,
            "pages_fetched": 1,
            "total_fetched": 5,
            "total_stored": 5,
            "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        assert result["success"] is True
        assert result["kol_count"] == 2
        assert result["succeeded"] == 2
        assert result["failed"] == 0
        assert {r["username"] for r in result["results"]} == {"alice", "bob"}
        assert all(r["status"] == "success" for r in result["results"])

        # Each KOL got start_run + finish_run (no kol_state writes anymore)
        assert patched_db["start"].call_count == 2
        assert patched_db["finish"].call_count == 2

        # All finish_run calls used status=success
        for call in patched_db["finish"].call_args_list:
            assert call.kwargs.get("status") == "success"

    @pytest.mark.asyncio
    async def test_one_failure_does_not_block_others(self, patched_db):
        kols = [_kol("alice"), _kol("broken"), _kol("carol")]

        async def fake_fetch(username, max_pages):
            if username == "broken":
                raise RuntimeError("twitter api exploded")
            return {
                "success": True, "username": username,
                "pages_fetched": 1, "total_fetched": 3,
                "total_stored": 3, "total_skipped_retweets": 0,
            }

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets",
                   side_effect=fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        assert result["kol_count"] == 3
        assert result["succeeded"] == 2
        assert result["failed"] == 1

        statuses = {r["username"]: r["status"] for r in result["results"]}
        assert statuses == {"alice": "success", "broken": "failed", "carol": "success"}

        # Failed KOL still recorded a run with status=failed and error message
        failed_calls = [
            c for c in patched_db["finish"].call_args_list
            if c.kwargs.get("status") == "failed"
        ]
        assert len(failed_calls) == 1
        assert "twitter api exploded" in (failed_calls[0].kwargs.get("error") or "")

    @pytest.mark.asyncio
    async def test_missing_api_key_recorded_per_kol(self, patched_db):
        kols = [_kol("alice")]

        # fetch_and_store_tweets returns failure dict when key missing
        fake_fetch = AsyncMock(return_value={
            "success": False,
            "error": "TWITTER_API_KEY not configured",
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        assert result["succeeded"] == 0
        assert result["failed"] == 1
        assert result["results"][0]["status"] == "failed"
        assert "TWITTER_API_KEY" in result["results"][0]["error"]

        # Run should be marked failed
        finish_call = patched_db["finish"].call_args_list[0]
        assert finish_call.kwargs.get("status") == "failed"

    @pytest.mark.asyncio
    async def test_safety_window_flag_set_when_oldest_tweet_outside_window(self, patched_db):
        from datetime import datetime, timedelta, timezone

        kols = [_kol("alice")]

        # Latest stored tweet is 5 hours old; safety window is 3h ⇒ reached_safety_window=True
        old_dt = datetime.now(timezone.utc) - timedelta(hours=5)
        old_str = old_dt.strftime("%a %b %d %H:%M:%S %z %Y")
        patched_db["get_tweets"].return_value = [{
            "id": "tweet-old",
            "created_at": old_str,
        }]

        fake_fetch = AsyncMock(return_value={
            "success": True, "username": "alice",
            "pages_fetched": 1, "total_fetched": 1,
            "total_stored": 1, "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch):
            result = await twitter_service.fetch_configured_kols(safety_window_hours=3)

        assert result["results"][0]["reached_safety_window"] is True
        finish_call = patched_db["finish"].call_args_list[0]
        assert finish_call.kwargs.get("reached_safety_window") is True

    @pytest.mark.asyncio
    async def test_default_max_pages_used(self, patched_db):
        kols = [_kol("alice")]

        fake_fetch = AsyncMock(return_value={
            "success": True, "username": "alice",
            "pages_fetched": 2, "total_fetched": 40,
            "total_stored": 40, "total_skipped_retweets": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch):
            await twitter_service.fetch_configured_kols(max_pages_per_kol=2)

        fake_fetch.assert_called_once()
        assert fake_fetch.call_args.kwargs.get("max_pages") == 2

    @pytest.mark.asyncio
    async def test_include_articles_calls_article_fetch(self, patched_db):
        kols = [_kol("alice")]

        fake_fetch = AsyncMock(return_value={
            "success": True, "username": "alice",
            "pages_fetched": 1, "total_fetched": 1,
            "total_stored": 1, "total_skipped_retweets": 0,
        })
        fake_articles = AsyncMock(return_value={
            "success": True, "articles_fetched": 0,
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch), \
             patch("app.features.twitter.service.fetch_and_store_articles", fake_articles):
            result = await twitter_service.fetch_configured_kols(include_articles=True)

        fake_articles.assert_called_once_with("alice")
        assert result["results"][0]["articles"]["success"] is True

    @pytest.mark.asyncio
    async def test_run_id_shared_across_kols(self, patched_db):
        kols = [_kol("alice"), _kol("bob")]
        fake_fetch = AsyncMock(return_value={
            "success": True, "pages_fetched": 1, "total_fetched": 1,
            "total_stored": 1, "total_skipped_retweets": 0, "username": "x",
        })

        with patch("app.features.twitter.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter.service.fetch_and_store_tweets", fake_fetch):
            result = await twitter_service.fetch_configured_kols()

        run_ids = [
            call.kwargs.get("run_id") for call in patched_db["start"].call_args_list
        ]
        assert len(run_ids) == 2
        assert run_ids[0] == run_ids[1] == result["run_id"]
