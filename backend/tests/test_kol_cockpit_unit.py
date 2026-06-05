"""KOL Cockpit Unit Tests — generated to cover the topic-tree and
ticker-opinion-timeline additions.

Tests the pure logic in `app.features.kol_research.cockpit`:
  - _classify_tweet_topics: enrichment -> topic node keys
  - _slim_tweet: surfaces enrichment fields onto the slim payload
  - _stance_for: per-ticker stance lookup from ticker_stances list
  - _pick_timeline_items: latest + top-likes + earliest selection, newest-first
  - _default_feed_visible: low-quality reply filter (shared by feed + topic tree)

No network, no DB. All data constructed inline.

Usage:
    cd backend && source venv/bin/activate
    pytest tests/test_kol_cockpit_unit.py -v
"""

from __future__ import annotations

from app.features.kol_research.cockpit import (
    _classify_tweet_topics,
    _default_feed_visible,
    _pick_timeline_items,
    _slim_tweet,
    _stance_for,
)


class TestClassifyTweetTopics:
    """Maps (content_type, sectors) to topic node keys."""

    def test_macro_view_content_type_maps_to_macro(self):
        assert _classify_tweet_topics("macro_view", []) == ["macro"]

    def test_sectors_macro_string_maps_to_macro(self):
        assert _classify_tweet_topics("thesis", ["macro"]) == ["macro"]

    def test_sector_framework_maps_to_rules(self):
        assert _classify_tweet_topics("sector_framework", []) == ["rules"]

    def test_ai_infra_sector_maps_to_industry_leaf(self):
        assert _classify_tweet_topics("thesis", ["AI_infra"]) == ["industry/ai_infra"]

    def test_optical_aggregates_cpo_photonics_transceiver(self):
        # All three source sectors should map to the same 光通信 leaf.
        for src in ("CPO", "photonics", "optical_transceiver"):
            assert _classify_tweet_topics("thesis", [src]) == ["industry/optical"]

    def test_semi_aggregates_power_semi_and_substrates(self):
        assert _classify_tweet_topics("thesis", ["power_semi"]) == ["industry/semi"]
        assert _classify_tweet_topics("thesis", ["substrates"]) == ["industry/semi"]

    def test_multi_sector_tweet_lands_in_multiple_leaves(self):
        topics = _classify_tweet_topics("thesis", ["AI_infra", "CPO"])
        assert "industry/ai_infra" in topics
        assert "industry/optical" in topics

    def test_macro_view_with_industry_sector_appears_in_both(self):
        topics = _classify_tweet_topics("macro_view", ["AI_infra"])
        assert "macro" in topics
        assert "industry/ai_infra" in topics

    def test_unknown_content_type_and_empty_sectors_returns_empty(self):
        assert _classify_tweet_topics("noise", []) == []

    def test_none_inputs_safe(self):
        assert _classify_tweet_topics(None, None) == []


class TestSlimTweet:
    """_slim_tweet should surface enrichment fields onto the slim payload."""

    def test_exposes_enrichment_fields(self):
        raw = {
            "id": "1",
            "text": "test",
            "created_at": "2025-01-01T00:00:00Z",
            "url": "https://x.com/x/1",
            "like_count": 10,
            "retweet_count": 1,
            "reply_count": 0,
            "tweet_type": "original",
            "symbols": {
                "content_type": "thesis",
                "key_claim": "投资逻辑: AI 基建持续景气",
                "sectors": ["AI_infra"],
                "ticker_stances": [{"ticker": "NVDA", "stance": "bull"}],
                "source_author_username": "168X_Fortune",
                "source_kind": "interview_reference",
                "article_title": "Frank interview",
            },
        }
        slim = _slim_tweet(raw, ["NVDA"])
        assert slim["content_type"] == "thesis"
        assert slim["key_claim"] == "投资逻辑: AI 基建持续景气"
        assert slim["topics"] == ["industry/ai_infra"]
        assert slim["ticker_stances"] == [{"ticker": "NVDA", "stance": "bull"}]
        assert slim["source_author_username"] == "168X_Fortune"
        assert slim["source_kind"] == "interview_reference"
        assert slim["article_title"] == "Frank interview"
        assert slim["tickers"] == ["NVDA"]

    def test_missing_symbols_degrades_safely(self):
        raw = {"id": "1", "text": "x"}
        slim = _slim_tweet(raw, [])
        assert slim["content_type"] is None
        assert slim["key_claim"] is None
        assert slim["topics"] == []
        assert slim["ticker_stances"] is None

    def test_non_dict_symbols_treated_as_empty(self):
        raw = {"id": "1", "text": "x", "symbols": "not-a-dict"}
        slim = _slim_tweet(raw, [])
        assert slim["content_type"] is None
        assert slim["topics"] == []

    def test_non_list_sectors_treated_as_none(self):
        raw = {"id": "1", "text": "x", "symbols": {"sectors": "not-a-list"}}
        slim = _slim_tweet(raw, [])
        # No sectors -> no industry topics
        assert slim["topics"] == []


class TestStanceFor:
    """Per-ticker stance lookup from the ticker_stances enrichment list."""

    def test_finds_matching_ticker(self):
        stances = [{"ticker": "NVDA", "stance": "bull"}, {"ticker": "TSM", "stance": "neutral"}]
        assert _stance_for("NVDA", stances) == "bull"
        assert _stance_for("TSM", stances) == "neutral"

    def test_case_insensitive_lookup(self):
        assert _stance_for("nvda", [{"ticker": "NVDA", "stance": "bear"}]) == "bear"

    def test_unknown_ticker_returns_none(self):
        assert _stance_for("MSFT", [{"ticker": "NVDA", "stance": "bull"}]) is None

    def test_empty_or_none_stances_returns_none(self):
        assert _stance_for("NVDA", None) is None
        assert _stance_for("NVDA", []) is None

    def test_malformed_entries_skipped(self):
        stances = ["not-a-dict", {"ticker": "NVDA", "stance": "bull"}]
        assert _stance_for("NVDA", stances) == "bull"


class TestPickTimelineItems:
    """Selects ~limit informative tweets for the per-ticker timeline."""

    def _make_tweet(self, *, id_: str, days_ago: int, likes: int = 0, key_claim: str = "投资逻辑: x",
                    content_type: str = "thesis", stances: list | None = None) -> dict:
        # 2026-01-01 base; subtract days_ago days.
        from datetime import datetime, timedelta, timezone
        d = datetime(2026, 1, 1, tzinfo=timezone.utc) - timedelta(days=days_ago)
        return {
            "id": id_,
            "created_at": d.isoformat(),
            "url": f"https://x.com/x/{id_}",
            "like_count": likes,
            "content_type": content_type,
            "key_claim": key_claim,
            "ticker_stances": stances,
        }

    def test_filters_out_tweets_without_key_claim(self):
        tweets = [
            self._make_tweet(id_="a", days_ago=10, key_claim=""),
            self._make_tweet(id_="b", days_ago=5, key_claim="x"),
        ]
        items = _pick_timeline_items(tweets, "NVDA", limit=10)
        assert [i["id"] for i in items] == ["b"]

    def test_filters_out_disallowed_content_types(self):
        tweets = [
            self._make_tweet(id_="noise", days_ago=10, content_type="noise"),
            self._make_tweet(id_="macro", days_ago=8, content_type="macro_view"),
            self._make_tweet(id_="thesis", days_ago=5, content_type="thesis"),
            self._make_tweet(id_="catalyst", days_ago=3, content_type="catalyst"),
        ]
        ids = [i["id"] for i in _pick_timeline_items(tweets, "NVDA", limit=10)]
        assert "noise" not in ids
        assert "macro" not in ids
        assert "thesis" in ids and "catalyst" in ids

    def test_returns_all_when_under_limit(self):
        tweets = [
            self._make_tweet(id_=str(i), days_ago=10 - i, likes=i) for i in range(5)
        ]
        items = _pick_timeline_items(tweets, "NVDA", limit=10)
        assert len(items) == 5

    def test_preserves_earliest_and_latest_when_over_limit(self):
        # 20 tweets; limit 5. earliest (days_ago=19) + latest (days_ago=0) must stay.
        tweets = [
            self._make_tweet(id_=str(i), days_ago=19 - i, likes=10) for i in range(20)
        ]
        items = _pick_timeline_items(tweets, "NVDA", limit=5)
        assert len(items) == 5
        ids = [i["id"] for i in items]
        assert ids[0] == "19"  # latest first
        assert ids[-1] == "0"  # earliest last

    def test_middle_picks_top_by_likes(self):
        # 6 tweets; limit 4 => earliest + top-2 by likes from middle + latest.
        tweets = [
            self._make_tweet(id_="early", days_ago=10, likes=1),
            self._make_tweet(id_="mid_lo", days_ago=8, likes=2),
            self._make_tweet(id_="mid_hi1", days_ago=7, likes=99),
            self._make_tweet(id_="mid_hi2", days_ago=6, likes=88),
            self._make_tweet(id_="mid_meh", days_ago=4, likes=3),
            self._make_tweet(id_="late", days_ago=1, likes=1),
        ]
        ids = [i["id"] for i in _pick_timeline_items(tweets, "NVDA", limit=4)]
        # earliest + 2 highest-likes (mid_hi1=99, mid_hi2=88) + latest,
        # final list sorted descending by date (latest/current view first).
        assert ids == ["late", "mid_hi2", "mid_hi1", "early"]

    def test_output_sorted_descending_by_date(self):
        tweets = [
            self._make_tweet(id_="late", days_ago=1, likes=10),
            self._make_tweet(id_="mid", days_ago=5, likes=5),
            self._make_tweet(id_="early", days_ago=10, likes=1),
        ]
        items = _pick_timeline_items(tweets, "NVDA", limit=10)
        dates = [i["created_at"] for i in items]
        assert dates == sorted(dates, reverse=True)

    def test_attaches_stance_for_target_ticker(self):
        tweets = [
            self._make_tweet(
                id_="a", days_ago=5,
                stances=[{"ticker": "NVDA", "stance": "bull"}, {"ticker": "TSM", "stance": "bear"}],
            ),
        ]
        items = _pick_timeline_items(tweets, "NVDA", limit=10)
        assert items[0]["stance"] == "bull"

    def test_empty_eligible_returns_empty(self):
        assert _pick_timeline_items([], "NVDA", limit=10) == []
        # All filtered out:
        only_noise = [self._make_tweet(id_="x", days_ago=1, content_type="noise")]
        assert _pick_timeline_items(only_noise, "NVDA", limit=10) == []


class TestDefaultFeedVisible:
    """Shared low-quality-reply filter used by both feed and topic tree."""

    def test_keeps_originals(self):
        items = [{"tweet_type": "original", "text": "hi"}]
        assert _default_feed_visible(items, "frank") == items

    def test_drops_short_reply_to_others(self):
        # Reply to OTHER user, short text -> dropped.
        items = [{
            "tweet_type": "reply",
            "in_reply_to_username": "someone_else",
            "text": "lol",
        }]
        assert _default_feed_visible(items, "frank") == []

    def test_keeps_long_reply_to_others(self):
        # Reply to other user but >= _LONG_REPLY_MIN_LEN chars -> substantive, kept.
        items = [{
            "tweet_type": "reply",
            "in_reply_to_username": "someone_else",
            "text": "x" * 200,
        }]
        assert _default_feed_visible(items, "frank") == items

    def test_keeps_short_reply_to_self_thread(self):
        # Reply to self (thread continuation) — always kept regardless of length.
        items = [{
            "tweet_type": "reply",
            "in_reply_to_username": "Frank",  # case-insensitive match
            "text": "ok",
        }]
        assert _default_feed_visible(items, "frank") == items
