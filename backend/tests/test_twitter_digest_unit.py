"""
Unit tests for the V2 Twitter KOL Digest single-stage pipeline.

V2 design: one LLM call returns CuratedDigestOutput =
  {takeaway, macro_picks, industry_picks, stock_picks}.
Each pick is a CuratedTweet with content type (macro / industry / stock),
sector or primary_ticker, and a non-obvious AI interpretation.

Covers:
- pull_candidate_tweets: empty catalog, low-engagement reply filter, edge errors
- generate_daily_digest: pipeline composition + error surfacing
- engagement enrichment + same-KOL same-subject dedup
- DailyDigest schema bounds
- DB persistence: upsert + read paths
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.features.twitter_digest.models import (
    CuratedDigestOutput,
    CuratedTweet,
    DailyDigest,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_tweet(tid: str, author: str, text: str = "x", tweet_type: str = "original",
                likes: int = 100, retweets: int = 10) -> dict:
    return {
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


def _curated_stock(tid: str, ticker: str, username: str = "alice") -> CuratedTweet:
    return CuratedTweet(
        tweet_id=tid,
        username=username,
        display_name=username.capitalize(),
        text_en="English text",
        text_zh="中文翻译",
        created_at=datetime.now(timezone.utc).isoformat(),
        tweet_type="original",
        url=f"https://x.com/{username}/status/{tid}",
        category="stock",
        primary_ticker=ticker,
        sector="",
        interpretation_zh="一句解读,说明为什么这条推文值得看。",
    )


def _curated_industry(tid: str, sector: str, username: str = "alice") -> CuratedTweet:
    return CuratedTweet(
        tweet_id=tid,
        username=username,
        display_name=username.capitalize(),
        text_en="",
        text_zh="行业分析",
        created_at=datetime.now(timezone.utc).isoformat(),
        tweet_type="thread",
        url=f"https://x.com/{username}/status/{tid}",
        category="industry",
        primary_ticker="",
        sector=sector,
        interpretation_zh="一句解读。",
    )


def _curated_macro(tid: str, username: str = "alice") -> CuratedTweet:
    return CuratedTweet(
        tweet_id=tid,
        username=username,
        display_name=username.capitalize(),
        text_en="",
        text_zh="大盘观点",
        created_at=datetime.now(timezone.utc).isoformat(),
        tweet_type="original",
        url=f"https://x.com/{username}/status/{tid}",
        category="macro",
        primary_ticker="",
        sector="",
        interpretation_zh="一句解读。",
    )


# ---------------------------------------------------------------------------
# pull_candidate_tweets
# ---------------------------------------------------------------------------

class TestPullCandidateTweets:
    @pytest.mark.asyncio
    async def test_empty_catalog_returns_empty(self):
        from app.features.twitter_digest import service
        with patch("app.features.twitter_digest.service.enabled_kols", return_value=[]):
            tweets, usernames = await service.pull_candidate_tweets()
        assert tweets == []
        assert usernames == []

    @pytest.mark.asyncio
    async def test_filters_low_engagement_replies(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        edge_tweets = [
            _fake_tweet("1", "alice", tweet_type="original", likes=10, retweets=1),
            _fake_tweet("2", "alice", tweet_type="reply", likes=1, retweets=0),    # dropped
            _fake_tweet("3", "alice", tweet_type="reply", likes=20, retweets=5),   # kept
        ]

        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": edge_tweets},
        })
        with patch("app.features.twitter_digest.service.enabled_kols", return_value=kols), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, usernames = await service.pull_candidate_tweets(window_hours=24)

        kept_ids = {t["id"] for t in tweets}
        assert kept_ids == {"1", "3"}
        assert usernames == ["alice"]

    @pytest.mark.asyncio
    async def test_propagates_edge_function_failure(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 500, "text": "boom",
        })
        with patch("app.features.twitter_digest.service.enabled_kols", return_value=kols), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="list_batch failed"):
                await service.pull_candidate_tweets()


# ---------------------------------------------------------------------------
# Pipeline composition
# ---------------------------------------------------------------------------

class TestGenerateDailyDigest:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice"), _fake_tweet("2", "bob")]
        usernames = ["alice", "bob"]

        fake_curated = CuratedDigestOutput(
            takeaway=["要点 1", "要点 2"],
            macro_picks=[_curated_macro("m1", "alice")],
            industry_picks=[_curated_industry("i1", "AI 算力", "alice")],
            stock_picks=[
                _curated_stock("1", "NVDA", "alice"),
                _curated_stock("2", "TSLA", "bob"),
            ],
        )

        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, usernames))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=fake_curated)):
            digest = await service.generate_daily_digest(window_hours=36, persist=False)

        assert isinstance(digest, DailyDigest)
        assert len(digest.macro_picks) == 1
        assert len(digest.industry_picks) == 1
        assert len(digest.stock_picks) == 2
        assert digest.tracked_kols == ["alice", "bob"]
        assert digest.takeaway == ["要点 1", "要点 2"]
        assert digest.input_tweet_count == 2
        assert digest.window_hours == 36
        assert all(p.category == "macro" for p in digest.macro_picks)
        assert all(p.category == "industry" for p in digest.industry_picks)
        assert all(p.category == "stock" for p in digest.stock_picks)

    @pytest.mark.asyncio
    async def test_no_tweets_raises(self):
        from app.features.twitter_digest import service
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=([], []))):
            with pytest.raises(RuntimeError, match="No candidate tweets"):
                await service.generate_daily_digest()

    @pytest.mark.asyncio
    async def test_empty_buckets_allowed_when_sparse(self):
        """A sparse day may yield 0 picks in any bucket — pipeline must not blow up."""
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice")]
        empty_curated = CuratedDigestOutput(
            takeaway=[], macro_picks=[], industry_picks=[], stock_picks=[],
        )

        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, ["alice"]))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=empty_curated)):
            digest = await service.generate_daily_digest()

        assert digest.macro_picks == []
        assert digest.industry_picks == []
        assert digest.stock_picks == []


# ---------------------------------------------------------------------------
# Schema invariants
# ---------------------------------------------------------------------------

class TestSchemaInvariants:
    def test_curated_tweet_requires_category(self):
        with pytest.raises(ValidationError):
            CuratedTweet(  # type: ignore[call-arg]
                tweet_id="1", username="a", display_name="A",
                text_en="x", text_zh="x", created_at="now",
                tweet_type="original", url="https://x.com/",
                primary_ticker="NVDA",
                interpretation_zh="x",
            )

    def test_curated_tweet_category_must_be_known(self):
        with pytest.raises(ValidationError):
            CuratedTweet(
                tweet_id="1", username="a", display_name="A",
                text_en="x", text_zh="x", created_at="now",
                tweet_type="original", url="https://x.com/",
                primary_ticker="NVDA",
                category="bullish",  # type: ignore[arg-type]  # legacy V1 label
                interpretation_zh="x",
            )

    def test_macro_picks_have_no_ticker_or_sector(self):
        m = _curated_macro("1", "alice")
        assert m.primary_ticker == ""
        assert m.sector == ""

    def test_industry_picks_have_sector_no_ticker(self):
        i = _curated_industry("1", "加密", "bob")
        assert i.sector == "加密"
        assert i.primary_ticker == ""

    def test_stock_picks_have_ticker_no_sector(self):
        s = _curated_stock("1", "NVDA", "carol")
        assert s.primary_ticker == "NVDA"
        assert s.sector == ""

    def test_curated_tweet_engagement_defaults_to_zero(self):
        t = _curated_stock("1", "NVDA")
        assert t.like_count == 0
        assert t.retweet_count == 0
        assert t.view_count == 0

    def test_curated_output_takeaway_defaults_to_empty(self):
        out = CuratedDigestOutput(macro_picks=[], industry_picks=[], stock_picks=[])
        assert out.takeaway == []


# ---------------------------------------------------------------------------
# Engagement enrichment + dedup
# ---------------------------------------------------------------------------

class TestCurateEnrichment:
    @pytest.mark.asyncio
    async def test_engagement_backfilled_from_source(self):
        """LLM returns engagement=0; service must overwrite from raw tweet."""
        from app.features.twitter_digest import service

        raw_tweets = [
            _fake_tweet("1", "alice", likes=500, retweets=120),
            _fake_tweet("2", "bob", likes=80, retweets=10),
        ]
        llm_output = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[],
            industry_picks=[],
            stock_picks=[
                _curated_stock("1", "NVDA", "alice"),
                _curated_stock("2", "TSLA", "bob"),
            ],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_output)), \
             patch("app.features.twitter_digest.service.enabled_kols",
                   return_value=[
                       {"username": "alice", "display_name": "Alice"},
                       {"username": "bob", "display_name": "Bob"},
                   ]):
            result = await service.curate_tweets(raw_tweets, ["alice", "bob"])

        by_id = {p.tweet_id: p for p in result.stock_picks}
        assert by_id["1"].like_count == 500
        assert by_id["1"].retweet_count == 120
        assert by_id["2"].like_count == 80
        assert by_id["2"].retweet_count == 10

    @pytest.mark.asyncio
    async def test_dedupe_same_kol_same_ticker_in_stock_bucket(self):
        from app.features.twitter_digest import service

        raw_tweets = [
            _fake_tweet("low", "alice", likes=10, retweets=1),
            _fake_tweet("high", "alice", likes=900, retweets=200),
            _fake_tweet("other", "bob", likes=50, retweets=5),
        ]
        llm_output = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[],
            industry_picks=[],
            stock_picks=[
                _curated_stock("low", "NVDA", "alice"),
                _curated_stock("high", "NVDA", "alice"),
                _curated_stock("other", "TSLA", "bob"),
            ],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_output)), \
             patch("app.features.twitter_digest.service.enabled_kols",
                   return_value=[
                       {"username": "alice", "display_name": "Alice"},
                       {"username": "bob", "display_name": "Bob"},
                   ]):
            result = await service.curate_tweets(raw_tweets, ["alice", "bob"])

        ids = sorted(p.tweet_id for p in result.stock_picks)
        assert ids == ["high", "other"]

    @pytest.mark.asyncio
    async def test_dedupe_same_kol_same_sector_in_industry_bucket(self):
        from app.features.twitter_digest import service

        raw_tweets = [
            _fake_tweet("a", "alice", likes=10, retweets=1),
            _fake_tweet("b", "alice", likes=200, retweets=50),
        ]
        llm_output = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[],
            industry_picks=[
                _curated_industry("a", "AI 算力", "alice"),
                _curated_industry("b", "AI 算力", "alice"),  # same sector, same KOL
            ],
            stock_picks=[],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_output)), \
             patch("app.features.twitter_digest.service.enabled_kols",
                   return_value=[{"username": "alice", "display_name": "Alice"}]):
            result = await service.curate_tweets(raw_tweets, ["alice"])

        ids = [p.tweet_id for p in result.industry_picks]
        assert ids == ["b"]  # higher engagement wins

    @pytest.mark.asyncio
    async def test_dedupe_macro_collapses_to_one_per_kol(self):
        from app.features.twitter_digest import service

        raw_tweets = [
            _fake_tweet("a", "alice", likes=10, retweets=1),
            _fake_tweet("b", "alice", likes=200, retweets=50),
        ]
        llm_output = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[_curated_macro("a", "alice"), _curated_macro("b", "alice")],
            industry_picks=[],
            stock_picks=[],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_output)), \
             patch("app.features.twitter_digest.service.enabled_kols",
                   return_value=[{"username": "alice", "display_name": "Alice"}]):
            result = await service.curate_tweets(raw_tweets, ["alice"])

        assert [p.tweet_id for p in result.macro_picks] == ["b"]


# ---------------------------------------------------------------------------
# V2 persistence
# ---------------------------------------------------------------------------

class TestGetDigest:
    @pytest.mark.asyncio
    async def test_get_digest_by_date_returns_none_when_row_missing(self):
        from app.features.twitter_digest import db as digest_db
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": None},
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            result = await digest_db.get_digest_by_date("2026-04-25")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_digest_by_date_raises_on_backend_error(self):
        from app.features.twitter_digest import db as digest_db
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 500, "text": "insforge down",
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="get_digest backend error"):
                await digest_db.get_digest_by_date("2026-04-25")

    @pytest.mark.asyncio
    async def test_get_latest_digest_raises_on_backend_error(self):
        from app.features.twitter_digest import db as digest_db
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 502, "text": "bad gateway",
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="get_latest_digest backend error"):
                await digest_db.get_latest_digest()

    @pytest.mark.asyncio
    async def test_get_digest_falls_back_to_legacy_field_names(self):
        """Older rows store legacy bullish/bearish/neutral keys — must still parse."""
        from app.features.twitter_digest import db as digest_db
        legacy_row = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "window_hours": 36,
            "input_tweet_count": 5,
            "tracked_kols": ["alice"],
            "takeaway": ["legacy"],
            "bullish_picks": [],     # legacy = macro
            "bearish_picks": [],     # legacy = industry
            "neutral_analyses": [],  # legacy = stock
            "model_version": "legacy-model",
        }
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": legacy_row},
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            digest = await digest_db.get_latest_digest()
        assert digest is not None
        assert digest.takeaway == ["legacy"]
        assert digest.macro_picks == []
        assert digest.industry_picks == []
        assert digest.stock_picks == []


class TestSaveDigest:
    @pytest.mark.asyncio
    async def test_save_digest_calls_edge_function_with_v2_field_names(self):
        from app.features.twitter_digest import db as digest_db

        digest = DailyDigest(
            generated_at=datetime.now(timezone.utc).isoformat(),
            window_hours=36,
            input_tweet_count=2,
            tracked_kols=["alice", "bob"],
            takeaway=["要点"],
            macro_picks=[_curated_macro("m1", "alice")],
            industry_picks=[_curated_industry("i1", "AI 算力", "alice")],
            stock_picks=[_curated_stock("s1", "NVDA", "bob")],
            model_version="gemini-test",
        )

        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": {"id": "row-uuid", "date": "2026-04-25"}},
        })

        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            await digest_db.save_digest(digest, "2026-04-25")

        call = fake_db.call_function.call_args
        assert call.args[0] == "kol-tweets"
        assert call.kwargs["params"] == {"action": "upsert_digest"}

        body = call.kwargs["json_body"]
        assert body["date"] == "2026-04-25"
        assert body["window_hours"] == 36
        assert body["takeaway"] == ["要点"]
        # V2 names sent to edge function (which maps to legacy DB columns)
        assert body["macro_picks"][0]["tweet_id"] == "m1"
        assert body["industry_picks"][0]["sector"] == "AI 算力"
        assert body["stock_picks"][0]["primary_ticker"] == "NVDA"

    @pytest.mark.asyncio
    async def test_save_digest_raises_on_edge_failure(self):
        from app.features.twitter_digest import db as digest_db

        digest = DailyDigest(
            generated_at=datetime.now(timezone.utc).isoformat(),
            window_hours=36,
            input_tweet_count=0,
            tracked_kols=[],
            takeaway=[],
            macro_picks=[],
            industry_picks=[],
            stock_picks=[],
            model_version="m",
        )

        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 500, "text": "boom",
        })

        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="upsert_digest failed"):
                await digest_db.save_digest(digest, "2026-04-25")


class TestGeneratePersistsDigest:
    @pytest.mark.asyncio
    async def test_generate_persists_when_enabled(self):
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice")]
        usernames = ["alice"]
        curated = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[],
            industry_picks=[],
            stock_picks=[_curated_stock("1", "NVDA", "alice")],
        )

        save_mock = AsyncMock(return_value=None)
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, usernames))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=curated)), \
             patch.object(service.db, "save_digest", save_mock):
            digest = await service.generate_daily_digest(window_hours=36)

        assert isinstance(digest, DailyDigest)
        save_mock.assert_awaited_once()
        passed_digest, passed_date = save_mock.await_args.args
        assert passed_digest is digest
        assert passed_date == datetime.now(timezone.utc).date().isoformat()

    @pytest.mark.asyncio
    async def test_generate_skips_persist_when_disabled(self):
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice")]
        curated = CuratedDigestOutput(
            takeaway=[], macro_picks=[], industry_picks=[], stock_picks=[],
        )

        save_mock = AsyncMock(return_value=None)
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, ["alice"]))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=curated)), \
             patch.object(service.db, "save_digest", save_mock):
            digest = await service.generate_daily_digest(persist=False)

        assert isinstance(digest, DailyDigest)
        save_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_persist_failure_does_not_raise(self):
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice")]
        curated = CuratedDigestOutput(
            takeaway=[],
            macro_picks=[],
            industry_picks=[],
            stock_picks=[_curated_stock("1", "NVDA", "alice")],
        )

        save_mock = AsyncMock(side_effect=RuntimeError("insforge down"))
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, ["alice"]))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=curated)), \
             patch.object(service.db, "save_digest", save_mock):
            digest = await service.generate_daily_digest()

        assert isinstance(digest, DailyDigest)
        assert len(digest.stock_picks) == 1
        save_mock.assert_awaited_once()
