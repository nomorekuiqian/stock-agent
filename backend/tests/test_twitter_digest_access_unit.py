"""Unit tests for Twitter Digest access gating and locked-mode shaping.

After the 2026-05 paywall redesign, free/Max users share the same DailyDigest
shape — the backend returns a locked projection (paid content stripped, counts
preserved) for callers without the `twitter_digest` entitlement.
"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_viewer_has_full_access_returns_true_for_entitled_user():
    from app.features.twitter_digest.router import _viewer_has_full_access

    with patch(
        "app.features.twitter_digest.router.has_entitlement",
        new_callable=AsyncMock,
        return_value=True,
    ):
        assert await _viewer_has_full_access("user-1") is True


@pytest.mark.asyncio
async def test_viewer_has_full_access_returns_false_for_non_entitled_user():
    from app.features.twitter_digest.router import _viewer_has_full_access

    with patch(
        "app.features.twitter_digest.router.has_entitlement",
        new_callable=AsyncMock,
        return_value=False,
    ):
        assert await _viewer_has_full_access("user-1") is False


@pytest.mark.asyncio
async def test_viewer_has_full_access_returns_false_for_anonymous():
    """Anonymous (no bearer token) must be treated as locked."""
    from app.features.twitter_digest.router import _viewer_has_full_access

    # Entitlement check should be short-circuited; failing it would still fall
    # through to False, but we explicitly want zero edge-function calls here.
    with patch(
        "app.features.twitter_digest.router.has_entitlement",
        new_callable=AsyncMock,
    ) as mock_has:
        assert await _viewer_has_full_access(None) is False
        mock_has.assert_not_called()


def _sample_digest():
    from app.features.twitter_digest.models import (
        Argument,
        DailyDigest,
        MacroThread,
        TickerThesis,
        WatchpointItem,
    )

    return DailyDigest(
        date="2026-05-29",
        generated_at="2026-05-29T22:00:00Z",
        window_hours=24,
        input_tweet_count=42,
        tracked_kols=["alice", "bob"],
        model_version="test",
        headline="NVDA 分歧升温",
        intro="这是一段很长的开场。" * 20,
        ticker_theses=[
            TickerThesis(
                ticker="NVDA",
                primary_kols=["alice", "bob"],
                tweet_count=4,
                stance_summary="多空在估值上打架",
                synthesis_zh="多空分歧 - 完整论述",
                buy_arguments=[
                    Argument(kol="alice", point_zh="买方论点", direction="buy",
                             tweet_url="https://x.com/a/status/1"),
                    Argument(kol="bob", point_zh="买方论点2", direction="buy",
                             tweet_url="https://x.com/b/status/2"),
                ],
                sell_arguments=[
                    Argument(kol="carol", point_zh="卖方论点", direction="sell",
                             tweet_url="https://x.com/c/status/3"),
                ],
            ),
        ],
        macro_threads=[
            MacroThread(
                title="美联储议息",
                primary_kols=["alice"],
                synthesis_zh="完整宏观论述",
                key_points=[
                    Argument(kol="alice", point_zh="K1", direction="observation",
                             tweet_url="https://x.com/a/status/9"),
                ],
            ),
        ],
        watchpoints=[
            WatchpointItem(
                title="NVDA Q1",
                date_hint="6/24",
                why_it_matters_zh="完整的关注理由论述",
                related_tickers=["NVDA"],
                evidence=[
                    Argument(kol="alice", point_zh="E1", direction="observation",
                             tweet_url="https://x.com/a/status/10"),
                ],
                kols_watching=["alice", "bob"],
            ),
        ],
    )


def test_to_locked_digest_strips_paid_content_and_preserves_counts():
    from app.features.twitter_digest.router import _to_locked_digest

    digest = _sample_digest()
    locked = _to_locked_digest(digest)

    # Structural skeleton preserved
    assert locked.is_locked is True
    assert locked.headline == digest.headline
    assert locked.tracked_kols == digest.tracked_kols
    assert len(locked.ticker_theses) == 1
    assert len(locked.macro_threads) == 1
    assert len(locked.watchpoints) == 1

    # Ticker thesis: counts kept, paid content stripped
    thesis = locked.ticker_theses[0]
    assert thesis.ticker == "NVDA"
    assert thesis.stance_summary == "多空在估值上打架"
    assert thesis.primary_kols == ["alice", "bob"]
    assert thesis.tweet_count == 4
    assert thesis.buy_count == 2
    assert thesis.sell_count == 1
    assert thesis.observation_count == 0
    assert thesis.synthesis_zh == ""
    assert thesis.buy_arguments == []
    assert thesis.sell_arguments == []
    assert thesis.observation_arguments == []

    # Macro thread: title kept, synthesis + key_points stripped
    macro = locked.macro_threads[0]
    assert macro.title == "美联储议息"
    assert macro.primary_kols == ["alice"]
    assert macro.synthesis_zh == ""
    assert macro.key_points == []
    assert macro.key_points_count == 1

    # Watchpoint: title + date + tickers + KOL list kept; reasoning stripped
    wp = locked.watchpoints[0]
    assert wp.title == "NVDA Q1"
    assert wp.date_hint == "6/24"
    assert wp.related_tickers == ["NVDA"]
    assert wp.kols_watching == ["alice", "bob"]
    assert wp.why_it_matters_zh == ""
    assert wp.evidence == []
    assert wp.evidence_count == 1

    # Original digest not mutated
    assert digest.is_locked is False
    assert digest.ticker_theses[0].synthesis_zh == "多空分歧 - 完整论述"
    assert len(digest.ticker_theses[0].buy_arguments) == 2


def test_digest_to_teaser_excludes_full_sections():
    """The lightweight /teaser/latest endpoint still returns the small payload."""
    from app.features.twitter_digest.router import _digest_to_teaser

    teaser = _digest_to_teaser(_sample_digest())

    assert teaser.date == "2026-05-29"
    assert teaser.generated_at == "2026-05-29T22:00:00Z"
    assert teaser.tracked_kol_count == 2
    assert len(teaser.intro_preview) == 180
    assert not hasattr(teaser, "ticker_theses")


def test_archive_dependency_failure_returns_503():
    """Archive dependency failures should not bubble as unhandled 500s."""
    from fastapi.testclient import TestClient
    from app.main import app

    with patch(
        "app.features.twitter_digest.router.db.list_digests",
        new_callable=AsyncMock,
        side_effect=RuntimeError("edge action missing"),
    ):
        resp = TestClient(app).get("/api/twitter-digest/archive")

    assert resp.status_code == 503
    assert resp.json()["detail"] == "Twitter digest archive temporarily unavailable"
