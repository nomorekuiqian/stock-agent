"""
Unit tests for fetch_list_timeline (V4 dual-source ingest).

Time-driven pagination: walk pages until oldest tweet on a page is older
than (now - lookback_hours). Belt-and-suspenders safety_max_pages cap.

No network — _fetch_page is mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_twitter_list_timeline_unit.py -v
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.features.twitter import service as twitter_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _twitter_api_format_time(dt: datetime) -> str:
    """Convert UTC datetime to TwitterAPI.io createdAt string."""
    # e.g. 'Sat May 09 21:44:02 +0000 2026'
    return dt.strftime("%a %b %d %H:%M:%S +0000 %Y")


def _api_tweet(tid: str, author: str, age_hours: float) -> dict:
    """Construct a TwitterAPI.io-shaped tweet."""
    when = datetime.now(timezone.utc) - timedelta(hours=age_hours)
    return {
        "id": tid,
        "text": f"tweet {tid}",
        "createdAt": _twitter_api_format_time(when),
        "url": f"https://x.com/{author}/status/{tid}",
        "type": "original",
        "likeCount": 10,
        "retweetCount": 1,
        "replyCount": 0,
        "viewCount": 100,
        "isReply": False,
        "author": {"userName": author, "id": "1"},
    }


# ---------------------------------------------------------------------------
# fetch_list_timeline — stop conditions
# ---------------------------------------------------------------------------


class TestFetchListTimeline:
    """Verifies time-window primary stop, list_end stop, safety cap."""

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(self):
        with patch.object(twitter_service, "TWITTER_API_KEY", ""):
            result = await twitter_service.fetch_list_timeline("123")
        assert result["success"] is False
        assert "TWITTER_API_KEY" in result.get("error", "")

    @pytest.mark.asyncio
    async def test_empty_list_id_returns_error(self):
        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            result = await twitter_service.fetch_list_timeline("")
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_stops_when_page_oldest_below_cutoff(self):
        """Once a page has tweets older than lookback, stop walking."""
        # First page: all within 0.5h. Second page: includes a tweet at 5h
        # which is older than lookback=1h → stop after second page.
        pages = [
            {
                "tweets": [_api_tweet("1", "a", 0.1), _api_tweet("2", "a", 0.5)],
                "has_next_page": True,
                "next_cursor": "c1",
                "status": "ok",
            },
            {
                "tweets": [_api_tweet("3", "a", 0.9), _api_tweet("4", "a", 5.0)],
                "has_next_page": True,
                "next_cursor": "c2",
                "status": "ok",
            },
            {
                "tweets": [_api_tweet("5", "a", 10.0)],
                "has_next_page": True,
                "next_cursor": "c3",
                "status": "ok",
            },
        ]
        page_iter = iter(pages)

        async def fake_page(*args, **kwargs):
            return next(page_iter)

        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            with patch.object(twitter_service, "_fetch_page", fake_page):
                with patch.object(twitter_service.db, "upsert_tweets_batch",
                                  AsyncMock(return_value=4)):
                    result = await twitter_service.fetch_list_timeline(
                        "123", lookback_hours=1.0, safety_max_pages=10,
                    )

        assert result["success"] is True
        assert result["stopped_reason"] == "time_window"
        # Two pages walked (third has 10h tweet, but we already stopped after page 2)
        assert result["pages_fetched"] == 2

    @pytest.mark.asyncio
    async def test_stops_at_list_end(self):
        """Stop when has_next_page=False even within window."""
        page = {
            "tweets": [_api_tweet("1", "a", 0.1)],
            "has_next_page": False,
            "next_cursor": None,
            "status": "ok",
        }

        async def fake_page(*args, **kwargs):
            return page

        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            with patch.object(twitter_service, "_fetch_page", fake_page):
                with patch.object(twitter_service.db, "upsert_tweets_batch",
                                  AsyncMock(return_value=1)):
                    result = await twitter_service.fetch_list_timeline(
                        "123", lookback_hours=24.0,
                    )

        assert result["stopped_reason"] == "list_end"

    @pytest.mark.asyncio
    async def test_stops_at_safety_cap(self):
        """Belt-and-suspenders: safety_max_pages caps runaway loops."""
        # All pages return tweets within window — would loop forever w/o cap.
        page = {
            "tweets": [_api_tweet("1", "a", 0.1)],
            "has_next_page": True,
            "next_cursor": "c1",
            "status": "ok",
        }

        async def fake_page(*args, **kwargs):
            return page

        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            with patch.object(twitter_service, "_fetch_page", fake_page):
                with patch.object(twitter_service.db, "upsert_tweets_batch",
                                  AsyncMock(return_value=1)):
                    result = await twitter_service.fetch_list_timeline(
                        "123", lookback_hours=24.0, safety_max_pages=3,
                    )

        assert result["stopped_reason"] == "safety_cap"
        assert result["pages_fetched"] == 3

    @pytest.mark.asyncio
    async def test_filters_disabled_authors(self):
        """enabled_usernames whitelist drops authors not in the set."""
        page = {
            "tweets": [
                _api_tweet("1", "alice", 0.1),
                _api_tweet("2", "bob", 0.2),
                _api_tweet("3", "stranger", 0.3),
            ],
            "has_next_page": False,
            "next_cursor": None,
            "status": "ok",
        }

        async def fake_page(*args, **kwargs):
            return page

        upserted = []

        async def capture_upsert(batch):
            upserted.extend(batch)
            return len(batch)

        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            with patch.object(twitter_service, "_fetch_page", fake_page):
                with patch.object(twitter_service.db, "upsert_tweets_batch",
                                  capture_upsert):
                    result = await twitter_service.fetch_list_timeline(
                        "123",
                        lookback_hours=24.0,
                        enabled_usernames={"alice", "bob"},
                    )

        # Only alice + bob upserted; stranger filtered out
        assert len(upserted) == 2
        assert {t["author_username"] for t in upserted} == {"alice", "bob"}
        assert result["total_filtered_disabled"] == 1

    @pytest.mark.asyncio
    async def test_api_error_recorded(self):
        """API status='error' surfaces as stopped_reason='api_error'."""
        async def fake_page(*args, **kwargs):
            return {"status": "error", "msg": "oops", "tweets": []}

        with patch.object(twitter_service, "TWITTER_API_KEY", "key"):
            with patch.object(twitter_service, "_fetch_page", fake_page):
                with patch.object(twitter_service.db, "upsert_tweets_batch",
                                  AsyncMock(return_value=0)):
                    result = await twitter_service.fetch_list_timeline(
                        "123", lookback_hours=1.0,
                    )

        assert result["stopped_reason"] == "api_error"
