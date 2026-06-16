"""
E2E Tests for Twitter ticker discussion API endpoint.

Tests via httpx.AsyncClient + ASGITransport with DB and LLM synthesis mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_twitter_ticker_discussion_e2e.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.deps import verify_user_token
from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def restore_dependency_overrides():
    original = dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(original)


@pytest.mark.e2e
class TestTwitterTickerDiscussion:
    """Tests for GET /api/twitter/ticker-discussion."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get(
            "/api/twitter/ticker-discussion",
            params={"symbol": "AMD"},
            timeout=30,
        )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_symbol_returns_400_after_auth(self, client):
        app.dependency_overrides[verify_user_token] = lambda: "user-1"

        resp = await client.get(
            "/api/twitter/ticker-discussion",
            params={"symbol": "bad!"},
            headers={"Authorization": "Bearer test-token"},
            timeout=30,
        )

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid symbol"

    @pytest.mark.asyncio
    async def test_success_returns_normalized_symbol_and_chinese_summary(self, client):
        app.dependency_overrides[verify_user_token] = lambda: "user-1"
        tweet = {
            "id": "tweet-1",
            "author_username": "alice",
            "text": "Watching AMD AI GPU demand.",
            "tweet_type": "original",
            "conversation_id": "tweet-1",
            "quoted_tweet_text": None,
            "in_reply_to_username": None,
            "created_at": "2026-06-16T12:00:00+00:00",
            "url": "https://x.com/alice/status/tweet-1",
            "like_count": 10,
            "retweet_count": 2,
            "reply_count": 1,
            "view_count": 100,
            "category": "ai",
            "quality": "keep",
            "content_type": "thesis",
            "key_claim": "AMD AI GPU demand is improving.",
            "sectors": ["semis"],
            "tickers": ["AMD"],
            "stance": "bull",
        }
        grouped_summary = {
            "overview": {
                "tweet_count": 1,
                "author_count": 1,
                "bull_count": 1,
                "bear_count": 0,
                "neutral_count": 0,
                "dominant_stance": "bull",
                "latest_at": "2026-06-16T12:00:00+00:00",
                "one_line_summary": "raw fallback",
            },
            "themes": [
                {
                    "key": "ai_demand",
                    "title": "AI 需求",
                    "stance": "bull",
                    "summary": "raw",
                    "tweet_count": 1,
                    "author_count": 1,
                    "representative_claims": ["raw"],
                    "evidence_tweet_ids": ["tweet-1"],
                }
            ],
        }
        chinese_summary = {
            "overview": {
                **grouped_summary["overview"],
                "one_line_summary": "过去 48 小时，AMD 讨论集中在 AI GPU 需求。",
            },
            "themes": [
                {
                    **grouped_summary["themes"][0],
                    "title": "AI 需求升温",
                    "summary": "KOL 主要在讨论 AMD AI GPU 需求是否继续改善。",
                    "representative_claims": ["AI GPU 需求改善是代表观点。"],
                }
            ],
        }

        with (
            patch(
                "app.features.twitter.router.db.list_ticker_discussion",
                new_callable=AsyncMock,
                return_value=[tweet],
            ) as mock_list,
            patch(
                "app.features.twitter.router.db.build_ticker_discussion_summary",
                return_value=grouped_summary,
            ) as mock_build,
            patch(
                "app.features.twitter.router.generate_chinese_discussion_summary",
                new_callable=AsyncMock,
                return_value=chinese_summary,
            ) as mock_summarize,
        ):
            resp = await client.get(
                "/api/twitter/ticker-discussion",
                params={"symbol": "$amd", "hours": 48, "limit": 20},
                headers={"Authorization": "Bearer test-token"},
                timeout=30,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AMD"
        assert data["hours"] == 48
        assert data["count"] == 1
        assert data["overview"]["one_line_summary"].startswith("过去 48 小时")
        assert data["themes"][0]["title"] == "AI 需求升温"
        assert data["data"][0]["id"] == "tweet-1"
        mock_list.assert_awaited_once_with("AMD", hours=48, limit=20)
        mock_build.assert_called_once_with("AMD", [tweet], hours=48)
        mock_summarize.assert_awaited_once_with(
            symbol="AMD",
            hours=48,
            summary=grouped_summary,
            tweets=[tweet],
        )
