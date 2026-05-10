"""
Unit tests for V4 / V4.1 / V4.2 / V4.3 twitter_digest service helpers.

Covers the ticker-as-topic + 论据指向 pipeline introduced after V3:
- _compute_top_tickers_priors: rank tickers by distinct KOL count
- _compute_other_tickers: tickers NOT in main theses but ≥3 KOL
- _compute_notable_missed_tweets: high-engagement uncited tweets
- _watchpoint_keywords: split title into searchable tokens
- _backfill_watchpoint_evidence: synthesize evidence when LLM omits
- _enforce_v4_provenance: drop hallucinated kol/url, recompute primary_kols
- _enforce_caps_v4: ticker cap, watchpoint drop-no-evidence

Plus split-by-source for the dual-source ingest catalog (twitter.service).

No network, no DB. All inputs constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_twitter_digest_v4_unit.py -v
"""

from datetime import datetime, timezone, timedelta

import pytest

from app.features.twitter_digest.models import (
    Argument,
    CuratedDigestOutputV4,
    MacroThread,
    NotableTweet,
    OtherTickerMention,
    TickerThesis,
    WatchpointItem,
)
from app.features.twitter_digest.service import (
    _backfill_watchpoint_evidence,
    _compute_notable_missed_tweets,
    _compute_other_tickers,
    _compute_top_tickers_priors,
    _enforce_caps_v4,
    _enforce_v4_provenance,
    _watchpoint_keywords,
)
from app.features.twitter.service import _split_catalog_by_source


# ---------------------------------------------------------------------------
# Test data builders
# ---------------------------------------------------------------------------


def _tweet(
    tid: str,
    author: str,
    *,
    tickers: list[str] | None = None,
    sectors: list[str] | None = None,
    events: list[str] | None = None,
    quality: str = "high",
    summary: str = "梗概",
    text: str = "tweet body text",
    likes: int = 100,
    retweets: int = 10,
    replies: int = 0,
    quoted: str | None = None,
) -> dict:
    """Construct a `kol_tweets` row with V3 enrichment under `symbols`."""
    return {
        "id": tid,
        "author_username": author,
        "text": text,
        "tweet_type": "original",
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "url": f"https://x.com/{author}/status/{tid}",
        "like_count": likes,
        "retweet_count": retweets,
        "reply_count": replies,
        "view_count": 1000,
        "quoted_tweet_text": quoted,
        "in_reply_to_username": None,
        "symbols": {
            "quality": quality,
            "quality_features": ["data"],
            "content_summary_zh": summary,
            "tickers": tickers or [],
            "sectors": sectors or [],
            "events": events or [],
            "enriched_at": datetime.now(timezone.utc).isoformat(),
            "enriched_model": "test",
        },
    }


def _arg(
    kol: str,
    point: str = "具体论据 60 字以上,含有具体数字 12% 和具体事件 2026 年财报。",
    direction: str = "buy",
    url: str | None = None,
) -> Argument:
    return Argument(
        kol=kol.lower(),
        point_zh=point,
        direction=direction,  # type: ignore[arg-type]
        tweet_url=url or f"https://x.com/{kol}/status/1",
    )


# ---------------------------------------------------------------------------
# _split_catalog_by_source (dual-source ingest)
# ---------------------------------------------------------------------------


class TestSplitCatalogBySource:
    """Group catalog entries by source for cron dispatch (list-timeline vs per-KOL)."""

    def test_empty_catalog_returns_empty(self):
        list_groups, manual = _split_catalog_by_source([])
        assert list_groups == {}
        assert manual == []

    def test_manual_only(self):
        catalog = [
            {"username": "alice", "display_name": "A", "source": "manual"},  # type: ignore
            {"username": "bob", "display_name": "B", "source": "manual"},  # type: ignore
        ]
        list_groups, manual = _split_catalog_by_source(catalog)  # type: ignore[arg-type]
        assert list_groups == {}
        assert len(manual) == 2

    def test_list_only(self):
        catalog = [
            {"username": "a", "display_name": "A", "source": "list:1234"},  # type: ignore
            {"username": "b", "display_name": "B", "source": "list:1234"},  # type: ignore
        ]
        list_groups, manual = _split_catalog_by_source(catalog)  # type: ignore[arg-type]
        assert "1234" in list_groups
        assert len(list_groups["1234"]) == 2
        assert manual == []

    def test_mixed_source_routes_separately(self):
        catalog = [
            {"username": "a", "display_name": "A", "source": "list:1"},  # type: ignore
            {"username": "b", "display_name": "B", "source": "manual"},  # type: ignore
            {"username": "c", "display_name": "C", "source": "list:2"},  # type: ignore
        ]
        list_groups, manual = _split_catalog_by_source(catalog)  # type: ignore[arg-type]
        assert set(list_groups.keys()) == {"1", "2"}
        assert len(manual) == 1
        assert manual[0]["username"] == "b"

    def test_missing_source_treated_as_manual(self):
        """Backward compat: catalog rows without `source` key fall to manual."""
        catalog = [{"username": "a", "display_name": "A"}]
        list_groups, manual = _split_catalog_by_source(catalog)  # type: ignore[arg-type]
        assert list_groups == {}
        assert len(manual) == 1


# ---------------------------------------------------------------------------
# _compute_top_tickers_priors
# ---------------------------------------------------------------------------


class TestComputeTopTickersPriors:
    """Top-N tickers by distinct KOL count, fed into LLM as must_include."""

    def test_empty_input(self):
        assert _compute_top_tickers_priors([]) == []

    def test_no_tickers_returns_empty(self):
        assert _compute_top_tickers_priors(
            [_tweet("1", "alice"), _tweet("2", "bob")]
        ) == []

    def test_ranks_by_distinct_kol_count(self):
        # NVDA: 3 KOL (alice/bob/charlie), AMZN: 1 KOL (alice ×3 mentions)
        tweets = [
            _tweet("1", "alice", tickers=["NVDA", "AMZN"]),
            _tweet("2", "alice", tickers=["AMZN"]),
            _tweet("3", "alice", tickers=["AMZN"]),
            _tweet("4", "bob", tickers=["NVDA"]),
            _tweet("5", "charlie", tickers=["NVDA"]),
        ]
        priors = _compute_top_tickers_priors(tweets)
        # NVDA first (3 distinct KOL), AMZN second (1 distinct KOL)
        assert priors[0][0] == "NVDA"
        assert priors[0][2] == 3  # kols
        assert priors[1][0] == "AMZN"
        assert priors[1][2] == 1

    def test_strips_dollar_prefix(self):
        tweets = [
            _tweet("1", "a", tickers=["$NVDA"]),
            _tweet("2", "b", tickers=["NVDA"]),
        ]
        priors = _compute_top_tickers_priors(tweets)
        assert priors[0][0] == "NVDA"
        assert priors[0][2] == 2

    def test_uppercases_tickers(self):
        tweets = [
            _tweet("1", "a", tickers=["nvda"]),
            _tweet("2", "b", tickers=["NVDA"]),
        ]
        priors = _compute_top_tickers_priors(tweets)
        assert priors[0][0] == "NVDA"
        assert priors[0][2] == 2

    def test_top_n_caps_result(self):
        tweets = []
        for i in range(10):
            tweets.append(
                _tweet(str(i), f"u{i}", tickers=[f"T{i}"])
            )
        priors = _compute_top_tickers_priors(tweets, top_n=3)
        assert len(priors) == 3

    def test_skips_non_string_tickers(self):
        tweets = [_tweet("1", "a", tickers=[None, 123, "NVDA"])]  # type: ignore[list-item]
        priors = _compute_top_tickers_priors(tweets)
        assert len(priors) == 1
        assert priors[0][0] == "NVDA"


# ---------------------------------------------------------------------------
# _compute_other_tickers (transparency tail)
# ---------------------------------------------------------------------------


class TestComputeOtherTickers:
    """Tickers ≥3 KOL mentions but not in main theses (V4.1 transparency tail)."""

    def test_excludes_thesis_tickers(self):
        tweets = [
            _tweet(str(i), f"u{i}", tickers=["NVDA"]) for i in range(4)
        ]
        result = _compute_other_tickers(tweets, final_theses_tickers={"NVDA"})
        assert all(r.ticker != "NVDA" for r in result)

    def test_includes_high_kol_non_thesis_tickers(self):
        tweets = [
            _tweet(str(i), f"u{i}", tickers=["AMZN"]) for i in range(4)
        ]
        result = _compute_other_tickers(tweets, final_theses_tickers={"NVDA"})
        assert any(r.ticker == "AMZN" for r in result)

    def test_skips_tickers_below_kol_threshold(self):
        # only 2 distinct KOL — below default threshold of 3
        tweets = [
            _tweet("1", "a", tickers=["XYZ"]),
            _tweet("2", "b", tickers=["XYZ"]),
        ]
        result = _compute_other_tickers(tweets, final_theses_tickers=set())
        assert all(r.ticker != "XYZ" for r in result)

    def test_returns_other_ticker_mention_objects(self):
        tweets = [_tweet(str(i), f"u{i}", tickers=["AMZN"]) for i in range(4)]
        result = _compute_other_tickers(tweets, final_theses_tickers=set())
        assert isinstance(result[0], OtherTickerMention)
        assert result[0].kols == 4


# ---------------------------------------------------------------------------
# _compute_notable_missed_tweets
# ---------------------------------------------------------------------------


class TestComputeNotableMissedTweets:
    """High-engagement quality tweets NOT cited in any thesis/macro."""

    def test_skips_cited_tweets(self):
        cited_url = "https://x.com/alice/status/1"
        tweets = [_tweet("1", "alice", likes=500, summary="重要观点")]
        result = _compute_notable_missed_tweets(tweets, cited_urls={cited_url})
        assert result == []

    def test_includes_uncited_high_engagement(self):
        tweets = [_tweet("1", "alice", likes=500, summary="重要观点")]
        result = _compute_notable_missed_tweets(tweets, cited_urls=set())
        assert len(result) == 1
        assert isinstance(result[0], NotableTweet)
        assert result[0].kol == "alice"

    def test_engagement_floor_filters_low_engagement(self):
        """eng < 100 should not surface."""
        tweets = [_tweet("1", "alice", likes=10, summary="低互动")]
        result = _compute_notable_missed_tweets(tweets, cited_urls=set())
        assert result == []

    def test_skips_tweets_without_summary(self):
        tweets = [_tweet("1", "alice", likes=500, summary="")]
        result = _compute_notable_missed_tweets(tweets, cited_urls=set())
        assert result == []

    def test_sorts_by_engagement_desc(self):
        tweets = [
            _tweet("1", "low", likes=200, summary="low engagement"),
            _tweet("2", "high", likes=2000, summary="high engagement"),
            _tweet("3", "mid", likes=500, summary="mid engagement"),
        ]
        result = _compute_notable_missed_tweets(tweets, cited_urls=set())
        assert result[0].kol == "high"
        assert result[1].kol == "mid"
        assert result[2].kol == "low"

    def test_respects_limit(self):
        tweets = [
            _tweet(str(i), f"u{i}", likes=500, summary=f"summary {i}")
            for i in range(20)
        ]
        result = _compute_notable_missed_tweets(tweets, cited_urls=set(), limit=5)
        assert len(result) == 5


# ---------------------------------------------------------------------------
# _watchpoint_keywords
# ---------------------------------------------------------------------------


class TestWatchpointKeywords:
    """Title → searchable tokens for evidence backfill."""

    def test_simple_title(self):
        kw = _watchpoint_keywords("MU Q3 财报")
        assert "MU" in kw
        assert "Q3" in kw
        assert "财报" in kw

    def test_filters_short_tokens(self):
        """Tokens < 2 chars dropped."""
        kw = _watchpoint_keywords("A B 公司财报")
        assert "A" not in kw
        assert "B" not in kw
        assert "公司财报" in kw

    def test_chinese_punctuation(self):
        kw = _watchpoint_keywords("Clarity Act:参议院投票")
        assert "Clarity" in kw
        assert "Act" in kw
        assert "参议院投票" in kw

    def test_mixed_zh_en(self):
        kw = _watchpoint_keywords("SpaceX IPO 与合并 xAI 动向")
        assert "SpaceX" in kw
        assert "IPO" in kw
        assert "xAI" in kw

    def test_empty_title(self):
        assert _watchpoint_keywords("") == []


# ---------------------------------------------------------------------------
# _backfill_watchpoint_evidence
# ---------------------------------------------------------------------------


class TestBackfillWatchpointEvidence:
    """When LLM omits evidence, synthesize from tweets matching kol+ticker+title."""

    def test_skips_when_evidence_already_present(self):
        wp = WatchpointItem(
            title="MU Q3 财报",
            why_it_matters_zh="x",
            related_tickers=["MU"],
            kols_watching=["alice"],
            evidence=[_arg("alice")],
        )
        out = CuratedDigestOutputV4(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {"1": _tweet("1", "alice", tickers=["MU"], summary="财报观察")}
        _backfill_watchpoint_evidence(out, raw_by_id)
        # Existing evidence preserved, no double-fill
        assert len(out.watchpoints[0].evidence) == 1

    def test_fills_from_kol_and_ticker_match(self):
        wp = WatchpointItem(
            title="美光 Q3 财报",
            why_it_matters_zh="x",
            related_tickers=["MU"],
            kols_watching=["alice", "bob"],
            evidence=[],
        )
        out = CuratedDigestOutputV4(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            "1": _tweet("1", "alice", tickers=["MU"], summary="美光财报六月"),
            "2": _tweet("2", "bob", tickers=["MU"], summary="MU 长线展望"),
            "3": _tweet("3", "stranger", tickers=["MU"], summary="不在 kol_set 里"),
        }
        _backfill_watchpoint_evidence(out, raw_by_id)
        evidence = out.watchpoints[0].evidence
        assert len(evidence) >= 2
        # Stranger filtered out (not in kols_watching)
        assert all(e.kol in {"alice", "bob"} for e in evidence)

    def test_caps_at_three_evidence(self):
        wp = WatchpointItem(
            title="MU 财报",
            why_it_matters_zh="x",
            related_tickers=["MU"],
            kols_watching=[f"u{i}" for i in range(10)],
            evidence=[],
        )
        out = CuratedDigestOutputV4(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            str(i): _tweet(str(i), f"u{i}", tickers=["MU"], summary=f"summary {i}")
            for i in range(10)
        }
        _backfill_watchpoint_evidence(out, raw_by_id)
        assert len(out.watchpoints[0].evidence) == 3

    def test_diversifies_by_author(self):
        """Multiple tweets by same KOL → only one used."""
        wp = WatchpointItem(
            title="MU 财报",
            why_it_matters_zh="x",
            related_tickers=["MU"],
            kols_watching=["alice"],
            evidence=[],
        )
        out = CuratedDigestOutputV4(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            "1": _tweet("1", "alice", tickers=["MU"], summary="s1"),
            "2": _tweet("2", "alice", tickers=["MU"], summary="s2"),
            "3": _tweet("3", "alice", tickers=["MU"], summary="s3"),
        }
        _backfill_watchpoint_evidence(out, raw_by_id)
        assert len(out.watchpoints[0].evidence) == 1


# ---------------------------------------------------------------------------
# _enforce_v4_provenance
# ---------------------------------------------------------------------------


class TestEnforceV4Provenance:
    """Drop arguments whose tweet_url or kol isn't in the input set."""

    def _make_output(self, theses_args: list[Argument]) -> CuratedDigestOutputV4:
        thesis = TickerThesis(
            ticker="NVDA",
            primary_kols=["alice"],
            tweet_count=len(theses_args),
            buy_arguments=theses_args,
        )
        return CuratedDigestOutputV4(
            headline="h",
            intro="i",
            ticker_theses=[thesis],
        )

    def test_drops_args_with_unknown_url(self):
        good = _arg("alice", url="https://x.com/alice/status/1")
        bad = _arg("alice", url="https://x.com/alice/status/HALLUCINATED")
        output = self._make_output([good, bad])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_v4_provenance(output, raw_by_id)
        assert len(output.ticker_theses[0].buy_arguments) == 1

    def test_drops_args_with_unknown_kol(self):
        good = _arg("alice", url="https://x.com/alice/status/1")
        bad = _arg("ghost", url="https://x.com/alice/status/1")  # url ok, kol absent
        output = self._make_output([good, bad])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_v4_provenance(output, raw_by_id)
        kept = output.ticker_theses[0].buy_arguments
        assert len(kept) == 1
        assert kept[0].kol == "alice"

    def test_recomputes_primary_kols_from_surviving_args(self):
        a1 = _arg("alice", url="https://x.com/alice/status/1")
        a2 = _arg("bob", url="https://x.com/bob/status/2")
        output = self._make_output([a1, a2])
        raw_by_id = {
            "1": _tweet("1", "alice"),
            "2": _tweet("2", "bob"),
        }
        _enforce_v4_provenance(output, raw_by_id)
        assert set(output.ticker_theses[0].primary_kols) == {"alice", "bob"}

    def test_filters_watchpoint_evidence_too(self):
        wp = WatchpointItem(
            title="x",
            why_it_matters_zh="x",
            kols_watching=["alice"],
            evidence=[
                _arg("alice", url="https://x.com/alice/status/1"),
                _arg("alice", url="https://x.com/alice/status/HALLUCINATED"),
            ],
        )
        output = CuratedDigestOutputV4(headline="h", intro="i", watchpoints=[wp])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_v4_provenance(output, raw_by_id)
        assert len(output.watchpoints[0].evidence) == 1


# ---------------------------------------------------------------------------
# _enforce_caps_v4
# ---------------------------------------------------------------------------


class TestEnforceCapsV4:
    """V4 caps: ticker thesis cap=8, watchpoint drop-no-evidence + cap=7."""

    def _thesis(self, ticker: str, kols: int, tweets: int = 1) -> TickerThesis:
        return TickerThesis(
            ticker=ticker,
            primary_kols=[f"u{i}" for i in range(kols)],
            tweet_count=tweets,
            buy_arguments=[
                _arg(f"u{i}") for i in range(min(kols, 1))
            ],
        )

    def test_caps_ticker_theses_at_8(self):
        output = CuratedDigestOutputV4(
            headline="h", intro="i",
            ticker_theses=[self._thesis(f"T{i}", 3) for i in range(15)],
        )
        _enforce_caps_v4(output)
        assert len(output.ticker_theses) == 8

    def test_drops_empty_theses(self):
        empty = TickerThesis(ticker="X", primary_kols=[], tweet_count=0)
        keep = self._thesis("Y", 3)
        output = CuratedDigestOutputV4(
            headline="h", intro="i", ticker_theses=[empty, keep],
        )
        _enforce_caps_v4(output)
        assert len(output.ticker_theses) == 1
        assert output.ticker_theses[0].ticker == "Y"

    def test_sorts_theses_by_kol_count_desc(self):
        output = CuratedDigestOutputV4(
            headline="h", intro="i",
            ticker_theses=[
                self._thesis("LOW", 2),
                self._thesis("HIGH", 5),
                self._thesis("MID", 3),
            ],
        )
        _enforce_caps_v4(output)
        kol_counts = [len(t.primary_kols) for t in output.ticker_theses]
        assert kol_counts == sorted(kol_counts, reverse=True)

    def test_drops_watchpoints_without_evidence(self):
        good = WatchpointItem(
            title="A", why_it_matters_zh="x",
            kols_watching=["alice"],
            evidence=[_arg("alice")],
        )
        bad = WatchpointItem(
            title="B", why_it_matters_zh="x",
            kols_watching=["alice"],
            evidence=[],
        )
        output = CuratedDigestOutputV4(
            headline="h", intro="i", watchpoints=[good, bad],
        )
        _enforce_caps_v4(output)
        assert len(output.watchpoints) == 1
        assert output.watchpoints[0].title == "A"

    def test_caps_watchpoints_at_7(self):
        wps = [
            WatchpointItem(
                title=f"WP{i}",
                why_it_matters_zh="x",
                kols_watching=["alice"],
                evidence=[_arg("alice")],
            )
            for i in range(12)
        ]
        output = CuratedDigestOutputV4(
            headline="h", intro="i", watchpoints=wps,
        )
        _enforce_caps_v4(output)
        assert len(output.watchpoints) == 7

    def test_caps_macro_threads_at_6(self):
        threads = [
            MacroThread(title=f"M{i}", layer="macro")
            for i in range(10)
        ]
        output = CuratedDigestOutputV4(
            headline="h", intro="i", macro_threads=threads,
        )
        _enforce_caps_v4(output)
        assert len(output.macro_threads) == 6

    def test_caps_takeaway_at_5(self):
        output = CuratedDigestOutputV4(
            headline="h", intro="i",
            takeaway=[f"line {i}" for i in range(10)],
        )
        _enforce_caps_v4(output)
        assert len(output.takeaway) == 5
