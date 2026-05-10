"""
Unit tests for the V3 Twitter KOL Digest pipeline.

V3 design: enrichment cron pre-tags tweets with quality/summary/tickers/sectors/
events. Single pro LLM call returns CuratedDigestOutput =
  {headline, intro, takeaway, topics, briefs, solo_voices, crosscut, watch_next}.
Each Topic aggregates 2-5 KOL key_arguments; Briefs are single-tweet one-liners
(content_summary_zh reused); SoloVoices are single-KOL deep dives.

Covers:
- pull_candidate_tweets: empty catalog, quality filter, unenriched filter,
  reply low-engagement filter, edge errors
- curate_tweets: overlap stripping, stance distribution recompute, brief
  one-liner backfill, brief label-validity check, defensive caps
- generate_daily_digest: happy path, no tweets raises, sparse day, schema/model
  versioning
- Schema invariants for Topic / Brief / SoloVoice / CuratedDigestOutput
- DB backward compat: V2 row still reads cleanly into DailyDigest
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.features.twitter_digest.models import (
    Brief,
    CuratedDigestOutput,
    CuratedTweet,
    DailyDigest,
    KeyArgument,
    SoloVoice,
    Topic,
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
    quality: str = "high",
    tickers: list | None = None,
    sectors: list | None = None,
    events: list | None = None,
    summary: str = "默认梗概",
    enriched: bool = True,
) -> dict:
    """Make a `kol_tweets` row with V3 enrichment populated under `symbols`."""
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
        row["symbols"] = {
            "quality": quality,
            "quality_features": ["data"] if quality != "low" else [],
            "content_summary_zh": summary,
            "tickers": tickers or [],
            "sectors": sectors or [],
            "events": events or [],
            "enriched_at": datetime.now(timezone.utc).isoformat(),
            "enriched_model": "gemini-3.1-flash-lite-preview",
        }
    return row


def _key_arg(tweet_id: str, username: str, stance: str = "bullish") -> KeyArgument:
    return KeyArgument(
        tweet_id=tweet_id,
        username=username,
        display_name=username.capitalize(),
        stance=stance,  # type: ignore[arg-type]
        tldr_zh=f"{username} 的论据",
        tweet_url=f"https://x.com/{username}/status/{tweet_id}",
    )


def _topic(title: str, layer: str, args: list[KeyArgument], **kw) -> Topic:
    return Topic(
        title=title,
        layer=layer,  # type: ignore[arg-type]
        primary_ticker=kw.get("primary_ticker", ""),
        sector=kw.get("sector", ""),
        event=kw.get("event", ""),
        synthesis_zh=kw.get("synthesis_zh", "综述"),
        key_arguments=args,
    )


def _brief(tid: str, username: str, layer: str = "stock", label: str = "$NVDA") -> Brief:
    return Brief(
        layer=layer,  # type: ignore[arg-type]
        label=label,
        username=username,
        display_name=username.capitalize(),
        tweet_id=tid,
        tweet_url=f"https://x.com/{username}/status/{tid}",
    )


def _solo(tid: str, username: str, ticker: str = "NVDA") -> SoloVoice:
    return SoloVoice(
        title=f"{username} 长文",
        username=username,
        display_name=username.capitalize(),
        primary_ticker=ticker,
        tweet_type="thread",
        tldr_zh="thread 的 TLDR",
        interpretation_zh="为什么值得读",
        tweet_id=tid,
        tweet_url=f"https://x.com/{username}/status/{tid}",
    )


# ---------------------------------------------------------------------------
# pull_candidate_tweets — quality + reply filters
# ---------------------------------------------------------------------------


class TestPullCandidateTweets:
    @pytest.mark.asyncio
    async def test_empty_catalog_returns_empty(self):
        from app.features.twitter_digest import service
        with patch("app.features.twitter_digest.service.get_enabled_kols", new=AsyncMock(return_value=[])):
            tweets, usernames = await service.pull_candidate_tweets()
        assert tweets == []
        assert usernames == []

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
        with patch("app.features.twitter_digest.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _ = await service.pull_candidate_tweets()
        kept = {t["id"] for t in tweets}
        assert kept == {"hi", "md"}

    @pytest.mark.asyncio
    async def test_drops_unenriched(self):
        from app.features.twitter_digest import service
        kols = [{"username": "alice", "display_name": "Alice"}]
        edge_tweets = [
            _fake_tweet("hi", "alice"),
            _fake_tweet("u", "alice", enriched=False),     # unenriched -> dropped
        ]
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": edge_tweets},
        })
        with patch("app.features.twitter_digest.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _ = await service.pull_candidate_tweets()
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
        with patch("app.features.twitter_digest.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            tweets, _ = await service.pull_candidate_tweets()
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
        with patch("app.features.twitter_digest.service.get_enabled_kols", new=AsyncMock(return_value=kols)), \
             patch("app.features.twitter_digest.service.get_insforge_service",
                   return_value=fake_db):
            with pytest.raises(RuntimeError, match="list_batch failed"):
                await service.pull_candidate_tweets()


# ---------------------------------------------------------------------------
# curate_tweets — V3 post-processing
# ---------------------------------------------------------------------------


class TestCuratePostProcessing:
    @pytest.mark.asyncio
    async def test_overlap_stripped_topics_win(self):
        """Same tweet appearing in topics + briefs + solo_voices — only topics keep."""
        from app.features.twitter_digest import service

        raw = [
            _fake_tweet("a", "alice", tickers=["NVDA"], events=["AI"]),
            _fake_tweet("b", "bob", tickers=["NVDA"], events=["AI"]),
        ]
        llm_out = CuratedDigestOutput(
            headline="今日主线", intro="导言",
            takeaway=["要点"],
            topics=[
                _topic("$NVDA · AI Capex", "stock",
                       [_key_arg("a", "alice"), _key_arg("b", "bob")],
                       primary_ticker="NVDA"),
            ],
            briefs=[_brief("a", "alice")],     # duplicate of topic arg
            solo_voices=[_solo("a", "alice")],  # duplicate of topic arg
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "alice", "display_name": "Alice"},
                                 {"username": "bob", "display_name": "Bob"}])):
            result = await service.curate_tweets(raw, ["alice", "bob"])

        assert len(result.topics) == 1
        assert result.briefs == []
        assert result.solo_voices == []

    @pytest.mark.asyncio
    async def test_drops_topic_args_with_unknown_tweet_ids(self):
        """LLM hallucinated tweet_ids must be dropped, not persisted."""
        from app.features.twitter_digest import service

        raw = [_fake_tweet("real", "alice", tickers=["NVDA"])]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=[
                _topic("$NVDA topic", "stock", [
                    _key_arg("real", "alice"),
                    _key_arg("hallucinated", "ghost"),  # not in raw
                ], primary_ticker="NVDA"),
            ],
        )
        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "alice", "display_name": "Alice"}])):
            result = await service.curate_tweets(raw, ["alice"])

        assert len(result.topics) == 1
        ids = {a.tweet_id for a in result.topics[0].key_arguments}
        assert ids == {"real"}

    @pytest.mark.asyncio
    async def test_drops_solo_voice_when_source_not_thread_or_high(self):
        from app.features.twitter_digest import service

        raw = [
            # quality=medium, doesn't qualify for solo
            _fake_tweet("medium_thread", "alice", tweet_type="thread", quality="medium"),
            # quality=high but tweet_type=original, doesn't qualify
            _fake_tweet("high_orig", "bob", tweet_type="original", quality="high"),
            # quality=high + thread — this one DOES qualify
            _fake_tweet("high_thread", "carol", tweet_type="thread", quality="high"),
        ]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            solo_voices=[
                _solo("medium_thread", "alice"),
                _solo("high_orig", "bob"),
                _solo("high_thread", "carol"),
            ],
        )
        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": u, "display_name": u}
                                 for u in ("alice", "bob", "carol")])):
            result = await service.curate_tweets(raw, ["alice", "bob", "carol"])

        ids = [s.tweet_id for s in result.solo_voices]
        assert ids == ["high_thread"]

    @pytest.mark.asyncio
    async def test_participating_kols_always_overwritten(self):
        """LLM-emitted participating_kols must NOT survive — backend recomputes."""
        from app.features.twitter_digest import service

        raw = [
            _fake_tweet("a", "alice", tickers=["NVDA"]),
            _fake_tweet("b", "bob", tickers=["NVDA"]),
        ]
        topic = _topic("$NVDA topic", "stock",
                       [_key_arg("a", "alice"), _key_arg("b", "bob")],
                       primary_ticker="NVDA")
        topic.participating_kols = ["ghost"]  # LLM hallucination

        llm_out = CuratedDigestOutput(headline="x", intro="x", topics=[topic])
        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "alice", "display_name": "Alice"},
                                 {"username": "bob", "display_name": "Bob"}])):
            result = await service.curate_tweets(raw, ["alice", "bob"])

        assert sorted(result.topics[0].participating_kols) == ["alice", "bob"]
        assert "ghost" not in result.topics[0].participating_kols

    @pytest.mark.asyncio
    async def test_overlap_solo_wins_over_brief(self):
        from app.features.twitter_digest import service

        raw = [_fake_tweet("a", "alice", tweet_type="thread", tickers=["NVDA"])]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=[],
            briefs=[_brief("a", "alice")],
            solo_voices=[_solo("a", "alice")],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "alice", "display_name": "Alice"}])):
            result = await service.curate_tweets(raw, ["alice"])

        assert len(result.solo_voices) == 1
        assert result.briefs == []

    @pytest.mark.asyncio
    async def test_stance_distribution_computed(self):
        from app.features.twitter_digest import service

        raw = [
            _fake_tweet("a", "alice", tickers=["NVDA"]),
            _fake_tweet("b", "bob", tickers=["NVDA"]),
            _fake_tweet("c", "carol", tickers=["NVDA"]),
        ]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=[
                _topic("$NVDA topic", "stock", [
                    _key_arg("a", "alice", stance="bullish"),
                    _key_arg("b", "bob", stance="bullish"),
                    _key_arg("c", "carol", stance="bearish"),
                ], primary_ticker="NVDA"),
            ],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": u, "display_name": u}
                                 for u in ("alice", "bob", "carol")])):
            result = await service.curate_tweets(raw, ["alice", "bob", "carol"])

        topic = result.topics[0]
        assert "3 位博主" in topic.stance_distribution
        assert "2 看多" in topic.stance_distribution
        assert "1 看空" in topic.stance_distribution

    @pytest.mark.asyncio
    async def test_brief_one_liner_backfilled_from_summary(self):
        from app.features.twitter_digest import service

        raw = [
            _fake_tweet("b1", "bob", tickers=["TSLA"], summary="TSLA Q2 deliveries 数据"),
        ]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=[],
            briefs=[Brief(
                layer="stock", label="$TSLA", username="bob", display_name="Bob",
                tweet_id="b1", tweet_url="https://x.com/bob/status/b1",
                # one_liner_zh empty — backend should fill
            )],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "bob", "display_name": "Bob"}])):
            result = await service.curate_tweets(raw, ["bob"])

        assert result.briefs[0].one_liner_zh == "TSLA Q2 deliveries 数据"

    @pytest.mark.asyncio
    async def test_brief_dropped_when_no_label_dimension(self):
        """Briefs must have ticker or sector in source enrichment — else dropped."""
        from app.features.twitter_digest import service

        raw = [
            _fake_tweet("b1", "bob", tickers=[], sectors=[]),  # no labels
        ]
        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=[],
            briefs=[_brief("b1", "bob")],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "bob", "display_name": "Bob"}])):
            result = await service.curate_tweets(raw, ["bob"])

        assert result.briefs == []

    @pytest.mark.asyncio
    async def test_caps_applied_topics_briefs_solo(self):
        from app.features.twitter_digest import service

        raw = [_fake_tweet(f"t{i}", "alice", tickers=["NVDA"]) for i in range(40)]

        topics = [
            _topic(f"topic-{i}", "stock", [_key_arg(f"t{i}", "alice")],
                   primary_ticker="NVDA")
            for i in range(20)  # > 15 cap
        ]
        briefs = [
            _brief(f"b{i}", "alice")
            for i in range(40)  # > 25 cap
        ]
        solos = [_solo(f"s{i}", "alice") for i in range(10)]  # > 5 cap

        # Note: the briefs need their tweet_ids in raw — but we want to test caps.
        # Build raw to include brief ids that exist with valid enrichment.
        raw = (
            [_fake_tweet(f"t{i}", "alice", tickers=["NVDA"]) for i in range(20)]
            + [_fake_tweet(f"b{i}", "alice", tickers=["NVDA"]) for i in range(40)]
            + [_fake_tweet(f"s{i}", "alice", tickers=["NVDA"]) for i in range(10)]
        )

        llm_out = CuratedDigestOutput(
            headline="x", intro="x",
            topics=topics, briefs=briefs, solo_voices=solos,
            takeaway=["1", "2", "3", "4", "5", "6", "7"],
            watch_next=["a", "b", "c", "d", "e"],
        )

        with patch.object(service, "_run_agent", AsyncMock(return_value=llm_out)), \
             patch("app.features.twitter_digest.service.get_enabled_kols",
                   new=AsyncMock(return_value=[{"username": "alice", "display_name": "Alice"}])):
            result = await service.curate_tweets(raw, ["alice"])

        assert len(result.topics) <= 15
        # solo overlaps with topics so at most 5 unique remain
        assert len(result.solo_voices) <= 5
        # briefs may be deduped against topics+solos before cap
        assert len(result.briefs) <= 25
        assert len(result.takeaway) <= 5
        assert len(result.watch_next) <= 3


# ---------------------------------------------------------------------------
# generate_daily_digest — top-level orchestration
# ---------------------------------------------------------------------------


class TestGenerateDailyDigest:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        """V4 happy path: generate_daily_digest now produces ticker_theses + macro_threads."""
        from app.features.twitter_digest import service
        from app.features.twitter_digest.models import (
            Argument, CuratedDigestOutputV4, TickerThesis,
        )

        tweets = [_fake_tweet("1", "alice", tickers=["NVDA"]),
                  _fake_tweet("2", "bob", tickers=["NVDA"])]
        usernames = ["alice", "bob"]
        fake_curated = CuratedDigestOutputV4(
            headline="今日主线",
            intro="导言段含具体抓手数字 60% 与具体事件 NVDA Q1 财报。",
            takeaway=["要点 1", "要点 2"],
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
                          AsyncMock(return_value=(tweets, usernames))), \
             patch.object(service, "curate_tweets_v4",
                          AsyncMock(return_value=fake_curated)):
            digest = await service.generate_daily_digest(window_hours=24, persist=False)

        assert isinstance(digest, DailyDigest)
        assert digest.schema_version == "v4"
        assert digest.headline == "今日主线"
        assert len(digest.ticker_theses) == 1
        assert digest.ticker_theses[0].ticker == "NVDA"
        assert digest.tracked_kols == ["alice", "bob"]
        assert digest.input_tweet_count == 2
        assert digest.window_hours == 24
        assert "v4:enrich=" in digest.model_version
        assert "digest=" in digest.model_version

    @pytest.mark.asyncio
    async def test_no_tweets_raises(self):
        from app.features.twitter_digest import service
        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=([], []))):
            with pytest.raises(RuntimeError, match="No high/medium-quality"):
                await service.generate_daily_digest()

    @pytest.mark.asyncio
    async def test_empty_v3_buckets_allowed_when_sparse(self):
        """A sparse day may yield 0 topics/briefs/solos — pipeline must not blow up."""
        from app.features.twitter_digest import service

        tweets = [_fake_tweet("1", "alice", tickers=["NVDA"])]
        empty = CuratedDigestOutput(headline="x", intro="x")

        with patch.object(service, "pull_candidate_tweets",
                          AsyncMock(return_value=(tweets, ["alice"]))), \
             patch.object(service, "curate_tweets",
                          AsyncMock(return_value=empty)):
            digest = await service.generate_daily_digest(persist=False)

        assert digest.topics == []
        assert digest.briefs == []
        assert digest.solo_voices == []


# ---------------------------------------------------------------------------
# Schema invariants — V3 models
# ---------------------------------------------------------------------------


class TestV3SchemaInvariants:
    def test_topic_requires_synthesis_and_title(self):
        with pytest.raises(ValidationError):
            Topic(layer="macro")  # type: ignore[call-arg]

    def test_topic_layer_constrained(self):
        with pytest.raises(ValidationError):
            Topic(
                title="x", layer="other",  # type: ignore[arg-type]
                synthesis_zh="x",
            )

    def test_keyargument_stance_constrained(self):
        with pytest.raises(ValidationError):
            KeyArgument(
                tweet_id="1", username="a", display_name="A",
                stance="confused",  # type: ignore[arg-type]
                tldr_zh="x", tweet_url="https://x.com/",
            )

    def test_brief_one_liner_capped(self):
        # 200 chars — exceeds max_length=120
        with pytest.raises(ValidationError):
            Brief(
                layer="stock", label="$X",
                one_liner_zh="x" * 200,
                username="u", display_name="U",
                tweet_id="t", tweet_url="https://x.com/",
            )

    def test_curated_digest_output_defaults_empty(self):
        out = CuratedDigestOutput(headline="x", intro="x")
        assert out.topics == []
        assert out.briefs == []
        assert out.solo_voices == []
        assert out.takeaway == []
        assert out.watch_next == []
        assert out.crosscut == ""

    def test_daily_digest_default_schema_v2(self):
        d = DailyDigest(
            generated_at="now", window_hours=24, input_tweet_count=0,
            tracked_kols=[], model_version="x",
        )
        assert d.schema_version == "v2"


# ---------------------------------------------------------------------------
# DB layer — V3 write + V2 backward-compat read
# ---------------------------------------------------------------------------


class TestDBV3Roundtrip:
    @pytest.mark.asyncio
    async def test_save_v3_digest_emits_v3_columns(self):
        from app.features.twitter_digest import db as digest_db

        digest = DailyDigest(
            generated_at="2026-05-04T00:00:00Z",
            window_hours=24, input_tweet_count=10, tracked_kols=["alice"],
            model_version="v3:enrich=flash-lite/digest=pro",
            schema_version="v3",
            headline="主线", intro="导言",
            takeaway=["1", "2"],
            topics=[_topic("$NVDA topic", "stock", [_key_arg("1", "alice")],
                           primary_ticker="NVDA")],
            briefs=[],
            solo_voices=[],
            crosscut="跨话题",
            watch_next=["明日"],
        )

        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": {"id": "x", "date": "2026-05-04"}},
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            await digest_db.save_digest(digest, "2026-05-04")

        body = fake_db.call_function.await_args.kwargs["json_body"]
        assert body["schema_version"] == "v3"
        assert body["headline"] == "主线"
        assert body["intro"] == "导言"
        assert len(body["topics"]) == 1
        assert body["briefs"] == []
        assert body["watch_next"] == ["明日"]

    @pytest.mark.asyncio
    async def test_get_digest_reads_v3_row(self):
        from app.features.twitter_digest import db as digest_db

        topic = _topic("$NVDA topic", "stock", [_key_arg("1", "alice")],
                       primary_ticker="NVDA")
        v3_row = {
            "date": "2026-05-04",
            "macro_picks": [], "industry_picks": [], "stock_picks": [],
            "tracked_kols": ["alice"], "takeaway": ["要点"],
            "window_hours": 24, "input_tweet_count": 10,
            "generated_at": "2026-05-04T00:00:00Z",
            "model_version": "v3:enrich=fl/digest=pro",
            "schema_version": "v3",
            "headline": "主线", "intro": "导言",
            "topics": [topic.model_dump()], "briefs": [], "solo_voices": [],
            "crosscut": "跨", "watch_next": ["明日"],
        }
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": v3_row},
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            d = await digest_db.get_digest_by_date("2026-05-04")

        assert d is not None
        assert d.schema_version == "v3"
        assert d.headline == "主线"
        assert len(d.topics) == 1
        assert d.topics[0].title == "$NVDA topic"

    @pytest.mark.asyncio
    async def test_get_digest_reads_v2_row_backward_compat(self):
        """A V2-written row (no V3 columns) reads as schema_version='v2' with empty V3 fields."""
        from app.features.twitter_digest import db as digest_db

        v2_row = {
            "date": "2026-04-25",
            "macro_picks": [{
                "tweet_id": "1", "username": "alice", "display_name": "Alice",
                "created_at": "2026-04-25T00:00:00Z",
                "tweet_type": "original", "url": "https://x.com/alice/1",
                "category": "macro", "interpretation_zh": "解读",
            }],
            "industry_picks": [], "stock_picks": [],
            "tracked_kols": ["alice"], "takeaway": ["v2 要点"],
            "window_hours": 24, "input_tweet_count": 5,
            "generated_at": "2026-04-25T00:00:00Z",
            "model_version": "gemini-3.1-pro-preview",
            # No V3 columns — older row written before the V3 cutover
        }
        fake_db = AsyncMock()
        fake_db.call_function = AsyncMock(return_value={
            "status_code": 200,
            "data": {"success": True, "data": v2_row},
        })
        with patch("app.features.twitter_digest.db.get_insforge_service",
                   return_value=fake_db):
            d = await digest_db.get_digest_by_date("2026-04-25")

        assert d is not None
        assert d.schema_version == "v2"
        assert len(d.macro_picks) == 1
        assert d.macro_picks[0].interpretation_zh == "解读"
        assert d.topics == []
        assert d.briefs == []
        assert d.headline == ""
