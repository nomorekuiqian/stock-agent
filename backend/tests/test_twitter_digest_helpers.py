"""
Unit tests for twitter_digest service helpers.

Covers the ticker-as-topic + 论据指向 pipeline helpers:
- _compute_top_tickers_priors: rank tickers by distinct KOL count
- _compute_other_tickers: tickers NOT in main theses but ≥3 KOL
- _watchpoint_keywords: split title into searchable tokens
- _backfill_watchpoint_evidence: synthesize evidence when LLM omits
- _enforce_provenance: drop hallucinated kol/url, recompute primary_kols
- _enforce_caps: ticker cap, watchpoint drop-no-evidence

Plus split-by-source for the dual-source ingest catalog (twitter.service).

No network, no DB. All inputs constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_twitter_digest_helpers.py -v
"""

from datetime import datetime, timezone, timedelta

import pytest

from app.features.twitter_digest.models import (
    Argument,
    CuratedDigestOutput,
    MacroThread,
    OtherTickerMention,
    TickerThesis,
    WatchpointItem,
)
from app.features.twitter_digest.service import (
    _backfill_watchpoint_evidence,
    _budget_curate_tweets,
    _business_date_et,
    _compute_other_tickers,
    _compute_top_tickers_priors,
    _CURATE_MAX_TWEETS,
    _enforce_caps,
    _enforce_provenance,
    _fallback_stance_summary,
    _fallback_thesis_for_missing,
    _watchpoint_keywords,
)
from app.features.twitter.service import _group_by_list


# ---------------------------------------------------------------------------
# Test data builders
# ---------------------------------------------------------------------------


def _tweet(
    tid: str,
    author: str,
    *,
    tickers: list[str] | None = None,
    sectors: list[str] | None = None,
    quality: str = "keep",
    text: str = "tweet body text",
    likes: int = 100,
    retweets: int = 10,
    replies: int = 0,
    quoted: str | None = None,
    ticker_stances: list | None = None,
) -> dict:
    """Construct a `kol_tweets` row with enrichment under `symbols`.

    Pass either `tickers` (defaults each to stance=neutral) or
    `ticker_stances` ([{ticker, stance}]).
    """
    stances = ticker_stances or [
        {"ticker": tk, "stance": "neutral"} for tk in (tickers or [])
    ]
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
            "ticker_stances": stances,
            "sectors": sectors or [],
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
# _group_by_list (list-only ingest)
# ---------------------------------------------------------------------------


class TestGroupByList:
    """Group catalog entries by Twitter list id; non-list rows surface as orphans."""

    def test_empty_catalog_returns_empty(self):
        list_groups, orphans = _group_by_list([])
        assert list_groups == {}
        assert orphans == []

    def test_list_only(self):
        catalog = [
            {"username": "a", "display_name": "A", "source": "list:1234"},
            {"username": "b", "display_name": "B", "source": "list:1234"},
        ]
        list_groups, orphans = _group_by_list(catalog)  # type: ignore[arg-type]
        assert "1234" in list_groups
        assert len(list_groups["1234"]) == 2
        assert orphans == []

    def test_multiple_lists(self):
        catalog = [
            {"username": "a", "display_name": "A", "source": "list:1"},
            {"username": "b", "display_name": "B", "source": "list:2"},
        ]
        list_groups, orphans = _group_by_list(catalog)  # type: ignore[arg-type]
        assert set(list_groups.keys()) == {"1", "2"}
        assert orphans == []

    def test_non_list_source_surfaces_as_orphan(self):
        """Legacy `manual` rows are returned as orphans so callers can warn."""
        catalog = [
            {"username": "a", "display_name": "A", "source": "list:1"},
            {"username": "b", "display_name": "B", "source": "manual"},
        ]
        list_groups, orphans = _group_by_list(catalog)  # type: ignore[arg-type]
        assert list(list_groups.keys()) == ["1"]
        assert len(orphans) == 1
        assert orphans[0]["username"] == "b"

    def test_missing_source_treated_as_orphan(self):
        """Rows without `source` key are not ingested (no list to dispatch to)."""
        catalog = [{"username": "a", "display_name": "A"}]
        list_groups, orphans = _group_by_list(catalog)  # type: ignore[arg-type]
        assert list_groups == {}
        assert len(orphans) == 1


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
    """Tickers ≥3 KOL mentions but not in main theses (transparency tail)."""

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
# _budget_curate_tweets
# ---------------------------------------------------------------------------


class TestBudgetCurateTweets:
    """Pro input must be capped without silently dropping must_include coverage."""

    def test_no_op_when_under_cap(self):
        tweets = [_tweet(str(i), "alice", tickers=["NVDA"]) for i in range(50)]
        result = _budget_curate_tweets(tweets, must_include=["NVDA"])
        assert result == tweets

    def test_caps_total_at_max(self):
        tweets = [
            _tweet(str(i), f"u{i % 20}", tickers=["GENERIC"], likes=i)
            for i in range(_CURATE_MAX_TWEETS * 2)
        ]
        result = _budget_curate_tweets(tweets, must_include=[])
        assert len(result) <= _CURATE_MAX_TWEETS

    def test_must_include_tickers_preserved(self):
        # 100 NVDA tweets, then 500 noise tweets — must_include tweets must
        # all (or up to 60% cap) survive even if engagement is low.
        nvda_tweets = [
            _tweet(f"n{i}", f"u{i}", tickers=["NVDA"], likes=1)
            for i in range(100)
        ]
        noise_tweets = [
            _tweet(f"x{i}", f"v{i}", tickers=["OTHER"], likes=10000)
            for i in range(500)
        ]
        result = _budget_curate_tweets(
            nvda_tweets + noise_tweets, must_include=["NVDA"],
        )
        nvda_kept = sum(
            1 for t in result if "NVDA" in [s["ticker"] for s in t["symbols"]["ticker_stances"]]
        )
        # must_include path keeps up to 60% of budget = 240 slots; 100 NVDA all fit.
        assert nvda_kept == 100

    def test_per_kol_diversity_in_rest_pass(self):
        # One KOL with 100 high-engagement tweets shouldn't eat the whole budget.
        spam = [
            _tweet(f"s{i}", "spammer", tickers=["X"], likes=10000)
            for i in range(100)
        ]
        variety = [
            _tweet(f"v{i}", f"kol{i % 30}", tickers=["X"], likes=50)
            for i in range(_CURATE_MAX_TWEETS)
        ]
        result = _budget_curate_tweets(spam + variety, must_include=[])
        spammer_count = sum(
            1 for t in result if t["author_username"] == "spammer"
        )
        # Soft cap is 25 — spammer should not exceed it.
        assert spammer_count <= 25


# ---------------------------------------------------------------------------
# _fallback_thesis_for_missing
# ---------------------------------------------------------------------------


class TestFallbackThesisForMissing:
    """Rescue must_include tickers the LLM silently dropped."""

    def test_returns_none_when_only_neutral_mentions(self):
        tweets = [
            _tweet(
                "1", "alice",
                ticker_stances=[{"ticker": "NVDA", "stance": "neutral"}],
            ),
            _tweet(
                "2", "bob",
                ticker_stances=[{"ticker": "NVDA", "stance": "neutral"}],
            ),
        ]
        assert _fallback_thesis_for_missing("NVDA", tweets) is None

    def test_returns_none_when_no_mentions(self):
        tweets = [
            _tweet("1", "alice", ticker_stances=[{"ticker": "AMD", "stance": "bull"}]),
        ]
        assert _fallback_thesis_for_missing("NVDA", tweets) is None

    def test_builds_thesis_from_bull_mentions(self):
        tweets = [
            _tweet(
                "1", "alice", likes=500, text="NVDA 押 Hopper 到 Blackwell 切换",
                ticker_stances=[{"ticker": "NVDA", "stance": "bull"}],
            ),
            _tweet(
                "2", "bob", likes=100, text="NVDA 长期看多",
                ticker_stances=[{"ticker": "NVDA", "stance": "bull"}],
            ),
        ]
        thesis = _fallback_thesis_for_missing("NVDA", tweets)
        assert thesis is not None
        assert thesis.ticker == "NVDA"
        assert len(thesis.buy_arguments) == 2
        # Higher engagement first
        assert thesis.buy_arguments[0].kol == "alice"
        assert "alice" in thesis.primary_kols
        assert "bob" in thesis.primary_kols
        assert thesis.tweet_count == 2

    def test_caps_buy_and_sell_args_at_two_each(self):
        bulls = [
            _tweet(
                f"b{i}", f"u{i}", likes=1000 - i,
                ticker_stances=[{"ticker": "MU", "stance": "bull"}],
            )
            for i in range(5)
        ]
        bears = [
            _tweet(
                f"s{i}", f"v{i}", likes=900 - i,
                ticker_stances=[{"ticker": "MU", "stance": "bear"}],
            )
            for i in range(5)
        ]
        thesis = _fallback_thesis_for_missing("MU", bulls + bears)
        assert thesis is not None
        assert len(thesis.buy_arguments) == 2
        assert len(thesis.sell_arguments) == 2

    def test_strips_dollar_prefix(self):
        tweets = [
            _tweet(
                "1", "alice", likes=500,
                ticker_stances=[{"ticker": "NVDA", "stance": "bull"}],
            ),
        ]
        thesis = _fallback_thesis_for_missing("$NVDA", tweets)
        assert thesis is not None
        assert thesis.ticker == "NVDA"


# ---------------------------------------------------------------------------
# _business_date_et
# ---------------------------------------------------------------------------


class TestBusinessDateEt:
    """digest date must be the ET market calendar day."""

    def test_post_close_utc_same_et_day_edt(self):
        # 20:30 UTC on 2026-05-12 = 16:30 ET (EDT) — actual cron firing time.
        t = datetime(2026, 5, 12, 20, 30, tzinfo=timezone.utc)
        assert _business_date_et(t) == "2026-05-12"

    def test_post_close_utc_same_et_day_est(self):
        # 20:30 UTC on 2026-01-15 = 15:30 ET (EST) — winter cron firing time.
        t = datetime(2026, 1, 15, 20, 30, tzinfo=timezone.utc)
        assert _business_date_et(t) == "2026-01-15"

    def test_early_utc_morning_rolls_to_previous_et_day(self):
        # 03:00 UTC on 2026-05-12 = 23:00 ET on 2026-05-11 (EDT, UTC-4).
        t = datetime(2026, 5, 12, 3, 0, tzinfo=timezone.utc)
        assert _business_date_et(t) == "2026-05-11"


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
        out = CuratedDigestOutput(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {"1": _tweet("1", "alice", tickers=["MU"], text="财报观察")}
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
        out = CuratedDigestOutput(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            "1": _tweet("1", "alice", tickers=["MU"], text="美光财报六月"),
            "2": _tweet("2", "bob", tickers=["MU"], text="MU 长线展望"),
            "3": _tweet("3", "stranger", tickers=["MU"], text="不在 kol_set 里"),
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
        out = CuratedDigestOutput(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            str(i): _tweet(str(i), f"u{i}", tickers=["MU"], text=f"summary {i}")
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
        out = CuratedDigestOutput(
            headline="x", intro="x", watchpoints=[wp]
        )
        raw_by_id = {
            "1": _tweet("1", "alice", tickers=["MU"], text="s1"),
            "2": _tweet("2", "alice", tickers=["MU"], text="s2"),
            "3": _tweet("3", "alice", tickers=["MU"], text="s3"),
        }
        _backfill_watchpoint_evidence(out, raw_by_id)
        assert len(out.watchpoints[0].evidence) == 1


# ---------------------------------------------------------------------------
# _enforce_provenance
# ---------------------------------------------------------------------------


class TestEnforceProvenance:
    """Drop arguments whose tweet_url or kol isn't in the input set."""

    def _make_output(self, theses_args: list[Argument]) -> CuratedDigestOutput:
        thesis = TickerThesis(
            ticker="NVDA",
            primary_kols=["alice"],
            tweet_count=len(theses_args),
            buy_arguments=theses_args,
        )
        return CuratedDigestOutput(
            headline="h",
            intro="i",
            ticker_theses=[thesis],
        )

    def test_drops_args_with_unknown_url(self):
        good = _arg("alice", url="https://x.com/alice/status/1")
        bad = _arg("alice", url="https://x.com/alice/status/HALLUCINATED")
        output = self._make_output([good, bad])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_provenance(output, raw_by_id)
        assert len(output.ticker_theses[0].buy_arguments) == 1

    def test_drops_args_with_unknown_kol(self):
        good = _arg("alice", url="https://x.com/alice/status/1")
        bad = _arg("ghost", url="https://x.com/alice/status/1")  # url ok, kol absent
        output = self._make_output([good, bad])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_provenance(output, raw_by_id)
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
        _enforce_provenance(output, raw_by_id)
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
        output = CuratedDigestOutput(headline="h", intro="i", watchpoints=[wp])
        raw_by_id = {"1": _tweet("1", "alice")}
        _enforce_provenance(output, raw_by_id)
        assert len(output.watchpoints[0].evidence) == 1


# ---------------------------------------------------------------------------
# _enforce_caps
# ---------------------------------------------------------------------------


class TestEnforceCaps:
    """Caps: ticker thesis cap=8, watchpoint drop-no-evidence + cap=7."""

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
        output = CuratedDigestOutput(
            headline="h", intro="i",
            ticker_theses=[self._thesis(f"T{i}", 3) for i in range(15)],
        )
        _enforce_caps(output)
        assert len(output.ticker_theses) == 8

    def test_drops_empty_theses(self):
        empty = TickerThesis(ticker="X", primary_kols=[], tweet_count=0)
        keep = self._thesis("Y", 3)
        output = CuratedDigestOutput(
            headline="h", intro="i", ticker_theses=[empty, keep],
        )
        _enforce_caps(output)
        assert len(output.ticker_theses) == 1
        assert output.ticker_theses[0].ticker == "Y"

    def test_drops_theses_with_only_observation_arguments(self):
        """A ticker mentioned by ≥2 KOL but only in 'observation' form (no
        directional bull/bear take) should not become a card — the reader has
        no decision signal. It will resurface in other_tickers tail."""
        obs_only = TickerThesis(
            ticker="OBS",
            primary_kols=["a", "b"],
            tweet_count=2,
            observation_arguments=[
                _arg("a", direction="observation"),
                _arg("b", direction="observation"),
            ],
        )
        directional = self._thesis("DIR", 3)
        output = CuratedDigestOutput(
            headline="h", intro="i", ticker_theses=[obs_only, directional],
        )
        _enforce_caps(output)
        tickers = [t.ticker for t in output.ticker_theses]
        assert "OBS" not in tickers
        assert "DIR" in tickers

    def test_sorts_theses_by_kol_count_desc(self):
        output = CuratedDigestOutput(
            headline="h", intro="i",
            ticker_theses=[
                self._thesis("LOW", 2),
                self._thesis("HIGH", 5),
                self._thesis("MID", 3),
            ],
        )
        _enforce_caps(output)
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
        output = CuratedDigestOutput(
            headline="h", intro="i", watchpoints=[good, bad],
        )
        _enforce_caps(output)
        assert len(output.watchpoints) == 1
        assert output.watchpoints[0].title == "A"

    def test_caps_watchpoints_at_5(self):
        wps = [
            WatchpointItem(
                title=f"WP{i}",
                why_it_matters_zh="x",
                kols_watching=["alice"],
                evidence=[_arg("alice")],
            )
            for i in range(12)
        ]
        output = CuratedDigestOutput(
            headline="h", intro="i", watchpoints=wps,
        )
        _enforce_caps(output)
        assert len(output.watchpoints) == 5

    def test_caps_macro_threads_at_5(self):
        threads = [
            MacroThread(title=f"M{i}", layer="macro")
            for i in range(10)
        ]
        output = CuratedDigestOutput(
            headline="h", intro="i", macro_threads=threads,
        )
        _enforce_caps(output)
        assert len(output.macro_threads) == 5

    def test_caps_macro_key_points_at_12_and_recomputes_kols(self):
        thread = MacroThread(
            title="Clarity Act",
            layer="industry",
            primary_kols=[f"old{i}" for i in range(20)],
            key_points=[_arg(f"u{i}") for i in range(15)],
        )
        output = CuratedDigestOutput(
            headline="h", intro="i", macro_threads=[thread],
        )

        _enforce_caps(output)

        kept = output.macro_threads[0]
        assert len(kept.key_points) == 12
        assert set(kept.primary_kols) == {f"u{i}" for i in range(12)}

    def test_clears_intro(self):
        # intro is deprecated — _enforce_caps must scrub LLM bleed.
        output = CuratedDigestOutput(
            headline="h", intro="some lingering intro paragraph",
        )
        _enforce_caps(output)
        assert output.intro == ""

    def test_classifies_disputed_when_both_sides_have_two_or_more(self):
        from app.features.twitter_digest.models import TickerThesis
        thesis = TickerThesis(
            ticker="MU",
            primary_kols=["a", "b", "c"],
            tweet_count=5,
            buy_arguments=[_arg("a", direction="buy"), _arg("b", direction="buy")],
            sell_arguments=[_arg("c", direction="sell"), _arg("d", direction="sell")],
        )
        output = CuratedDigestOutput(headline="h", intro="i", ticker_theses=[thesis])
        _enforce_caps(output)
        assert output.ticker_theses[0].side == "disputed"

    def test_classifies_bull_when_no_sell(self):
        from app.features.twitter_digest.models import TickerThesis
        thesis = TickerThesis(
            ticker="NVDA",
            primary_kols=["a"],
            tweet_count=2,
            buy_arguments=[_arg("a", direction="buy"), _arg("b", direction="buy")],
        )
        output = CuratedDigestOutput(headline="h", intro="i", ticker_theses=[thesis])
        _enforce_caps(output)
        assert output.ticker_theses[0].side == "bull"

    def test_classifies_bear_when_no_buy(self):
        from app.features.twitter_digest.models import TickerThesis
        thesis = TickerThesis(
            ticker="HIMS",
            primary_kols=["a"],
            tweet_count=2,
            sell_arguments=[_arg("a", direction="sell")],
        )
        output = CuratedDigestOutput(headline="h", intro="i", ticker_theses=[thesis])
        _enforce_caps(output)
        assert output.ticker_theses[0].side == "bear"

    # takeaway field removed from CuratedDigestOutput — intro carries the
    # editorial briefing paragraph now. Cap test no longer applies.


# ---------------------------------------------------------------------------
# _fallback_stance_summary — counts-based prose when LLM omits stance_summary
# ---------------------------------------------------------------------------


class TestFallbackStanceSummary:
    """Generated `stance_summary` shouldn't be empty even when the LLM forgets.

    `_enforce_caps` invokes `_fallback_stance_summary(thesis)` whenever the LLM
    leaves the field blank. The output is purposely bland (counts-based) so the
    UI never shows an empty chip below the ticker.
    """

    def test_disputed_both_sides_have_args(self):
        thesis = TickerThesis(
            ticker="MU",
            primary_kols=["a", "b", "c"],
            tweet_count=3,
            buy_arguments=[_arg("a", direction="buy"), _arg("b", direction="buy")],
            sell_arguments=[_arg("c", direction="sell")],
        )
        assert _fallback_stance_summary(thesis) == "2 位看多 · 1 位看空, 双方都有支撑"

    def test_unanimous_bull(self):
        thesis = TickerThesis(
            ticker="NVDA",
            primary_kols=["a", "b", "c", "d"],
            tweet_count=4,
            buy_arguments=[_arg(f"u{i}", direction="buy") for i in range(4)],
        )
        assert _fallback_stance_summary(thesis) == "4 位博主一致看多"

    def test_unanimous_bear(self):
        thesis = TickerThesis(
            ticker="HIMS",
            primary_kols=["a", "b"],
            tweet_count=2,
            sell_arguments=[
                _arg("a", direction="sell"), _arg("b", direction="sell"),
            ],
        )
        assert _fallback_stance_summary(thesis) == "2 位博主一致看空"

    def test_observation_only(self):
        thesis = TickerThesis(
            ticker="AMZN",
            primary_kols=["a", "b"],
            tweet_count=2,
            observation_arguments=[_arg("a", direction="observation")],
        )
        result = _fallback_stance_summary(thesis)
        assert result == "2 位博主在跟踪进展, 暂无明确方向"

    def test_no_arguments_at_all(self):
        thesis = TickerThesis(
            ticker="UNKNOWN",
            primary_kols=["a"],
            tweet_count=1,
        )
        assert _fallback_stance_summary(thesis) == "1 位博主在讨论"

    def test_enforce_caps_populates_blank_stance(self):
        """enforce_caps should auto-fill blank stance_summary via fallback."""
        thesis = TickerThesis(
            ticker="NVDA",
            primary_kols=["a", "b"],
            tweet_count=2,
            buy_arguments=[_arg("a"), _arg("b")],
            stance_summary="",  # blank — should trigger fallback
        )
        output = CuratedDigestOutput(headline="h", intro="i", ticker_theses=[thesis])
        _enforce_caps(output)
        assert output.ticker_theses[0].stance_summary == "2 位博主一致看多"

    def test_enforce_caps_preserves_llm_stance(self):
        """Non-blank LLM-written stance_summary must NOT be overwritten."""
        thesis = TickerThesis(
            ticker="MU",
            primary_kols=["a", "b"],
            tweet_count=2,
            buy_arguments=[_arg("a"), _arg("b")],
            stance_summary="多空在估值上打架, 长线派坚守 2030 目标",
        )
        output = CuratedDigestOutput(headline="h", intro="i", ticker_theses=[thesis])
        _enforce_caps(output)
        assert (
            output.ticker_theses[0].stance_summary
            == "多空在估值上打架, 长线派坚守 2030 目标"
        )
