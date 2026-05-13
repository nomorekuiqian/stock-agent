"""
Unit tests for the Twitter KOL Digest pipeline.

Pipeline:
  pull_candidate_tweets — pull enriched tweets from edge function, filter on
    quality (drop 'low'), drop unenriched + low-engagement replies.
  curate_tweets — single pro LLM call → CuratedDigestOutput
    (headline + intro + ticker_theses + macro_threads + watchpoints).
  generate_daily_digest — top-level orchestration + DailyDigest write.

Helper-level tests for the post-LLM provenance + cap enforcement live in
`test_twitter_digest_helpers.py`.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.features.twitter_digest.models import (
    Argument,
    CuratedDigestOutput,
    DailyDigest,
    TickerThesis,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_tweet(
    tid: str,
    author: str,
    text: str = "x",
    tweet_type: str = "original",
    likes: int = 100,
    retweets: int = 10,
    quality: str = "keep",
    tickers: list | None = None,
    sectors: list | None = None,
    enriched: bool = True,
    ticker_stances: list | None = None,
) -> dict:
    """Make a `kol_tweets` row with enrichment populated under `symbols`.

    `quality` accepts new ('keep'/'drop') or legacy ('high'/'medium'/'low')
    values; service-layer logic maps both. `tickers` and `ticker_stances` are
    interchangeable inputs — bare tickers default to stance='neutral'.
    """
    row = {
        "id": tid,
        "author_username": author,
        "text": text,
        "tweet_type": tweet_type,
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "like_count": likes,
        "retweet_count": retweets,
        "reply_count": 0,
        "view_count": 1000,
        "quoted_tweet_text": None,
        "in_reply_to_username": None,
        "url": f"https://x.com/{author}/status/{tid}",
    }
    if enriched:
        stances = ticker_stances or [
            {"ticker": tk, "stance": "neutral"} for tk in (tickers or [])
        ]
        row["symbols"] = {
            "quality": quality,
            "ticker_stances": stances,
            "sectors": sectors or [],
            "enriched_at": datetime.now(timezone.utc).isoformat(),
            "enriched_model": "test-model",
        }
    return row


# ---------------------------------------------------------------------------
# pull_candidate_tweets — quality + reply filters
# ---------------------------------------------------------------------------


class TestPullCandidateTweets:
    @pytest.mark.asyncio
    async def test_empty_catalog_returns_empty(self):
        from app.features.twitter_digest import service
        with patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[])):
            tweets, usernames, raw_count = await service.pull_candidate_tweets()
        assert tweets == []
        assert usernames == []
        assert raw_count == 0

    @pytest.mark.asyncio
    async def test_drops_low_quality(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        edge_tweets = [
            _fake_tweet("hi", "alice", quality="high"),
            _fake_tweet("md", "alice", quality="medium"),
            _fake_tweet("lo", "alice", quality="low"),
        ]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": edge_tweets},
        })
        with patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _, _ = await service.pull_candidate_tweets()
        kept = {t["id"] for t in tweets}
        assert kept == {"hi", "md"}

    @pytest.mark.asyncio
    async def test_drops_unenriched(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        edge_tweets = [
            _fake_tweet("hi", "alice"),
            _fake_tweet("u", "alice", enriched=False),  # unenriched -> dropped
        ]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": edge_tweets},
        })
        with patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _, _ = await service.pull_candidate_tweets()
        kept = {t["id"] for t in tweets}
        assert kept == {"hi"}

    @pytest.mark.asyncio
    async def test_filters_low_engagement_replies(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        edge_tweets = [
            _fake_tweet("orig", "alice", tweet_type="original"),
            _fake_tweet("low_reply", "alice", tweet_type="reply", likes=1, retweets=0),
            _fake_tweet("good_reply", "alice", tweet_type="reply", likes=20, retweets=5),
        ]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": edge_tweets},
        })
        with patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _, _ = await service.pull_candidate_tweets()
        kept = {t["id"] for t in tweets}
        assert kept == {"orig", "good_reply"}

    @pytest.mark.asyncio
    async def test_propagates_edge_function_failure(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 500, "text": "boom",
        })
        with patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="list_batch failed"):
                await service.pull_candidate_tweets()


# ---------------------------------------------------------------------------
# generate_daily_digest — top-level orchestration
# ---------------------------------------------------------------------------


class TestGenerateDailyDigest:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        from app.features.twitter_digest import service

        tweets = [
            _fake_tweet("1", "alice", tickers=["NVDA"]),
            _fake_tweet("2", "bob", tickers=["NVDA"]),
        ]
        usernames = ["alice", "bob"]
        fake_curated = CuratedDigestOutput(
            headline="今日主线",
            intro="导言段含具体抓手数字 60% 与具体事件 NVDA Q1 财报。",
            ticker_theses=[
                TickerThesis(
                    ticker="NVDA",
                    primary_kols=["alice", "bob"],
                    tweet_count=2,
                    synthesis_zh="综述含焦点 + 共识 + 分歧三段。" * 5,
                    buy_arguments=[
                        Argument(
                            kol="alice",
                            point_zh="看多论据 60 字以上,含具体数字 +18% 和具体事件。" * 2,
                            direction="buy",
                            tweet_url="https://x.com/alice/status/1",
                        ),
                        Argument(
                            kol="bob",
                            point_zh="看多论据 60 字以上,含具体数字 30% 和事件。" * 2,
                            direction="buy",
                            tweet_url="https://x.com/bob/status/2",
                        ),
                    ],
                ),
            ],
        )

        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, usernames, 5))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=fake_curated)):
            digest = await service.generate_daily_digest(window_hours=24, persist=False)

        assert isinstance(digest, DailyDigest)
        assert digest.headline == "今日主线"
        assert len(digest.ticker_theses) == 1
        assert digest.ticker_theses[0].ticker == "NVDA"
        assert digest.tracked_kols == ["alice", "bob"]
        # input_tweet_count = raw_count from pull (pre-filter), not len(tweets).
        assert digest.input_tweet_count == 5
        assert digest.window_hours == 24
        assert "enrich=" in digest.model_version
        assert "digest=" in digest.model_version

    @pytest.mark.asyncio
    async def test_no_tweets_raises(self):
        from app.features.twitter_digest import service
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=([], [], 0))):
            with pytest.raises(RuntimeError, match="No high/medium-quality"):
                await service.generate_daily_digest()

    @pytest.mark.asyncio
    async def test_sparse_day_renders_empty(self):
        """A sparse day with no theses or threads still produces a digest."""
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice", tickers=["NVDA"])]
        empty = CuratedDigestOutput(headline="x", intro="x")

        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, ["alice"], 1))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=empty)):
            digest = await service.generate_daily_digest(persist=False)

        assert digest.ticker_theses == []
        assert digest.macro_threads == []
        assert digest.watchpoints == []
