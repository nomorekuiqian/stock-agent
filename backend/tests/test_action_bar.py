"""
Unit tests for features/for_you — Action Bar service, templates, and models.

Pure unit tests: all DB/network calls are mocked.

Usage:
    cd backend && source venv/bin/activate
    pytest tests/test_action_bar.py -v
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.features.for_you.models import ActionBar, ActionChip, DragResult, Signal
from app.features.for_you.service import (
    OVERALL_THRESHOLDS,
    SINGLE_DRAG_THRESHOLD,
    compute_max_drag,
    _max_severity,
    _build_chip,
    build_action_bar,
)
from app.features.for_you import templates
from app.features.portfolio.models import HoldingView, ProfileView


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_holding(symbol: str, weight_pct: float = 50.0) -> HoldingView:
    return HoldingView(
        symbol=symbol,
        effective_weight_pct=weight_pct,
        weight_source="equal",
    )


def make_profile(**overrides) -> ProfileView:
    defaults = dict(
        user_id="test-user-id",
        style="passive",
        horizon="long",
        risk_tolerance="moderate",
        notify_mode="events_only",
    )
    defaults.update(overrides)
    return ProfileView(**defaults)


# ---------------------------------------------------------------------------
# compute_max_drag
# ---------------------------------------------------------------------------


class TestComputeMaxDrag:
    def test_overall_threshold_triggered(self):
        """Portfolio-wide drag exceeds threshold."""
        holdings = [make_holding("AAPL", 60.0), make_holding("MSFT", 40.0)]
        changes = {"AAPL": -8.0, "MSFT": -5.0}
        result = compute_max_drag(holdings, changes)
        # overall = 0.6*(-8) + 0.4*(-5) = -4.8 -2.0 = -6.8
        assert result.overall == -6.8

    def test_single_drag_threshold_with_culprit(self):
        """Single stock with >=10% weight and daily <=-10% triggers single drag."""
        holdings = [make_holding("AAPL", 50.0), make_holding("MSFT", 50.0)]
        changes = {"AAPL": -15.0, "MSFT": 1.0}
        result = compute_max_drag(holdings, changes)
        # AAPL: w=0.5, daily=-15, drag=-7.5; MSFT: w=0.5, daily=1 > -10 → skip
        assert result.worst_single == -7.5
        assert result.culprit == "AAPL"

    def test_no_heavy_holdings_skip_single_drag(self):
        """Holdings with weight < 10% are skipped for single drag."""
        holdings = [make_holding("A", 5.0), make_holding("B", 95.0)]
        changes = {"A": -20.0, "B": -0.5}
        result = compute_max_drag(holdings, changes)
        # A: w=0.05 < 0.10 → skip. B: daily=-0.5 > -10 → skip.
        assert result.worst_single == 0.0
        assert result.culprit is None

    def test_daily_above_minus_ten_skipped(self):
        """Holdings with daily change > -10% are skipped for single drag."""
        holdings = [make_holding("AAPL", 50.0)]
        changes = {"AAPL": -9.0}
        result = compute_max_drag(holdings, changes)
        assert result.worst_single == 0.0

    def test_empty_holdings(self):
        result = compute_max_drag([], {"AAPL": -5.0})
        assert result.overall == 0.0
        assert result.worst_single == 0.0

    def test_no_changes(self):
        holdings = [make_holding("AAPL", 100.0)]
        result = compute_max_drag(holdings, {})
        assert result.overall == 0.0

    def test_value_is_min_of_overall_and_worst(self):
        holdings = [make_holding("AAPL", 50.0), make_holding("MSFT", 50.0)]
        changes = {"AAPL": -12.0, "MSFT": -12.0}
        result = compute_max_drag(holdings, changes)
        assert result.value == min(result.overall, result.worst_single)

    def test_positive_changes_no_drag(self):
        holdings = [make_holding("AAPL", 60.0), make_holding("MSFT", 40.0)]
        changes = {"AAPL": 3.0, "MSFT": 2.0}
        result = compute_max_drag(holdings, changes)
        assert result.overall > 0
        assert result.worst_single == 0.0
        assert result.culprit is None


# ---------------------------------------------------------------------------
# _max_severity
# ---------------------------------------------------------------------------


class TestMaxSeverity:
    def test_empty_returns_green(self):
        assert _max_severity([]) == "green"

    def test_single_green(self):
        assert _max_severity([Signal(kind="stable", severity="green")]) == "green"

    def test_yellow_beats_green(self):
        signals = [
            Signal(kind="stable", severity="green"),
            Signal(kind="health", severity="yellow"),
        ]
        assert _max_severity(signals) == "yellow"

    def test_red_beats_yellow(self):
        signals = [
            Signal(kind="health", severity="yellow"),
            Signal(kind="drawdown", severity="red"),
        ]
        assert _max_severity(signals) == "red"


# ---------------------------------------------------------------------------
# _build_chip
# ---------------------------------------------------------------------------


class TestBuildChip:
    def test_drawdown_chip(self):
        s = Signal(kind="drawdown", severity="red", data={})
        chip = _build_chip(s)
        assert chip.link == "/for-you"
        assert chip.label == "查看持仓"
        assert chip.kind == "drawdown"

    def test_event_chip_with_symbol(self):
        s = Signal(kind="event", severity="yellow", data={"symbol": "AAPL", "link": "/stock/AAPL"})
        chip = _build_chip(s)
        assert chip.link == "/stock/AAPL"
        assert chip.label == "查看 AAPL"
        assert chip.kind == "event"

    def test_event_chip_no_symbol(self):
        s = Signal(kind="event", severity="yellow", data={"link": "/for-you"})
        chip = _build_chip(s)
        assert chip.label == "查看事件"

    def test_health_chip(self):
        s = Signal(kind="health", severity="yellow", data={})
        chip = _build_chip(s)
        assert chip.link == "/for-you/health"
        assert chip.label == "持仓体检"

    def test_staleness_chip_kind_is_research(self):
        s = Signal(kind="staleness", severity="yellow", data={})
        chip = _build_chip(s)
        assert chip.kind == "research"

    def test_custom_label_overrides(self):
        s = Signal(kind="drawdown", severity="red", data={})
        chip = _build_chip(s, label="自定义标签")
        assert chip.label == "自定义标签"


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class TestTemplates:
    def test_fallback_headline_drawdown_portfolio_wide(self):
        signals = [Signal(kind="drawdown", severity="red", data={"cause": "portfolio_wide", "overall_pct": -5.2})]
        result = templates.fallback_headline(signals, "passive")
        assert "-5.2" in result

    def test_fallback_headline_drawdown_single_drag(self):
        signals = [Signal(kind="drawdown", severity="red", data={"cause": "single_drag", "culprit_symbol": "TSLA", "drag_pct": -3.5})]
        result = templates.fallback_headline(signals, "passive")
        assert "TSLA" in result
        assert "3.5%" in result

    def test_fallback_headline_event(self):
        signals = [Signal(kind="event", severity="yellow", data={"title": "FOMC 会议", "days_until": 3})]
        result = templates.fallback_headline(signals, "passive")
        assert "T-3" in result
        assert "FOMC" in result

    def test_fallback_headline_health(self):
        signals = [Signal(kind="health", severity="yellow", data={"health_score": 35})]
        result = templates.fallback_headline(signals, "passive")
        assert "35" in result

    def test_fallback_headline_empty_signals(self):
        result = templates.fallback_headline([], "passive")
        assert "有需要关注的事项" in result

    def test_fallback_chip_labels_mixed(self):
        signals = [
            Signal(kind="drawdown", severity="red", data={}),
            Signal(kind="event", severity="yellow", data={"symbol": "AAPL"}),
            Signal(kind="health", severity="yellow", data={}),
        ]
        labels = templates.fallback_chip_labels(signals)
        assert labels == ["查看持仓", "查看 AAPL", "持仓体检"]


# ---------------------------------------------------------------------------
# build_action_bar — integrated rules engine
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="legacy rule-engine removed — see round2 design")
@pytest.mark.asyncio
class TestBuildActionBar:
    """All tests mock DB/network dependencies."""

    async def test_green_state_no_signals(self):
        """No holdings, no events, no health → green with empty headline."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
            digest_data=None,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "green"
        assert bar.source == "template"
        assert bar.headline == ""
        assert bar.chips == []

    async def test_green_state_with_portfolio_change(self):
        """Holdings with mild changes → green."""
        holdings = [make_holding("AAPL", 60.0), make_holding("MSFT", 40.0)]
        digest = {"stocks": [
            {"symbol": "AAPL", "daily_change": "+0.5%"},
            {"symbol": "MSFT", "daily_change": "-0.2%"},
        ]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(),
            digest_data=digest,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "green"
        assert "涨" in bar.headline or "跌" in bar.headline or "没有" in bar.headline

    async def test_green_state_active_user_no_chip(self):
        """Active users get no stable chip."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(style="active"),
            digest_data=None,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "green"
        assert len(bar.chips) == 0

    async def test_red_state_drawdown_portfolio_wide(self):
        """Portfolio-wide drawdown exceeds threshold → red."""
        holdings = [make_holding("AAPL", 60.0), make_holding("MSFT", 40.0)]
        digest = {"stocks": [
            {"symbol": "AAPL", "daily_change": "-8.0%"},
            {"symbol": "MSFT", "daily_change": "-6.0%"},
        ]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(risk_tolerance="moderate"),
            digest_data=digest,
            top_event=None,
            health_latest=None,
        )
        # overall = 0.6*(-8) + 0.4*(-6) = -7.2, threshold -4.0 → red
        assert bar.severity == "red"
        assert bar.source == "template"

    async def test_red_state_single_drag(self):
        """Single stock single drag → red."""
        holdings = [make_holding("TSLA", 50.0), make_holding("MSFT", 50.0)]
        digest = {"stocks": [
            {"symbol": "TSLA", "daily_change": "-15.0%"},
            {"symbol": "MSFT", "daily_change": "+1.0%"},
        ]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(),
            digest_data=digest,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "red"
        assert any("持仓" in c.label for c in bar.chips)

    async def test_yellow_state_health(self):
        """Low health score → yellow."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
            digest_data=None,
            top_event=None,
            health_latest={"health_score": 30, "top_risk": "集中度过高"},
        )
        assert bar.severity == "yellow"
        assert "30" in bar.headline

    async def test_health_above_40_no_signal(self):
        """Health score >= 40 does not trigger signal."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
            digest_data=None,
            top_event=None,
            health_latest={"health_score": 65},
        )
        assert bar.severity == "green"

    async def test_yellow_state_event_watch(self):
        """Watch event → yellow."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
            digest_data=None,
            top_event={"severity": "watch", "title": "FOMC", "days_until": 2, "symbol": "SPY"},
            health_latest=None,
        )
        assert bar.severity == "yellow"
        assert "FOMC" in bar.headline

    async def test_red_state_urgent_event_low_risk(self):
        """Urgent event + low risk tolerance → red."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(risk_tolerance="low"),
            digest_data=None,
            top_event={"severity": "urgent", "title": "关税升级", "days_until": 1, "symbol": None},
            health_latest=None,
        )
        assert bar.severity == "red"

    async def test_yellow_state_urgent_event_high_risk(self):
        """Urgent event + high risk tolerance → yellow (not red)."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(risk_tolerance="high"),
            digest_data=None,
            top_event={"severity": "urgent", "title": "关税升级", "days_until": 1, "symbol": None},
            health_latest=None,
        )
        assert bar.severity == "yellow"

    async def test_staleness_signal(self):
        """Portfolio not confirmed in >60 days → yellow staleness."""
        old_date = datetime.now(timezone.utc) - timedelta(days=90)
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(portfolio_confirmed_at=old_date),
            digest_data=None,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "yellow"
        assert "90" in bar.headline
        assert "未更新" in bar.headline

    async def test_staleness_not_triggered_within_60_days(self):
        """Portfolio confirmed 30 days ago → green."""
        recent_date = datetime.now(timezone.utc) - timedelta(days=30)
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(portfolio_confirmed_at=recent_date),
            digest_data=None,
            top_event=None,
            health_latest=None,
        )
        assert bar.severity == "green"

    async def test_staleness_suppressed_by_other_signals(self):
        """Staleness only fires if no other signals exist."""
        old_date = datetime.now(timezone.utc) - timedelta(days=90)
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(portfolio_confirmed_at=old_date),
            digest_data=None,
            top_event={"severity": "watch", "title": "CPI", "days_until": 1},
            health_latest=None,
        )
        # Event takes priority; staleness is suppressed
        assert bar.severity == "yellow"
        assert "CPI" in bar.headline

    async def test_multiple_signals_red_wins(self):
        """Health (yellow) + event (red) → overall red."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(risk_tolerance="low"),
            digest_data=None,
            top_event={"severity": "urgent", "title": "Crash", "days_until": 0},
            health_latest={"health_score": 25},
        )
        assert bar.severity == "red"

    async def test_chips_max_three(self):
        """At most 3 chips even with many signals."""
        bar = await build_action_bar(
            "user-1",
            holdings=[make_holding("AAPL", 50.0), make_holding("MSFT", 50.0)],
            profile=make_profile(risk_tolerance="low"),
            digest_data={"stocks": [
                {"symbol": "AAPL", "daily_change": "-12.0%"},
                {"symbol": "MSFT", "daily_change": "-12.0%"},
            ]},
            top_event={"severity": "urgent", "title": "Event", "days_until": 0, "symbol": "SPY"},
            health_latest={"health_score": 20, "top_risk": "risk"},
        )
        assert len(bar.chips) <= 3

    async def test_generated_at_is_utc(self):
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
        )
        assert bar.generated_at.tzinfo is not None

    async def test_action_bar_no_data_returns_empty_headline(self):
        """Empty holdings + no digest + no health → green with empty headline."""
        bar = await build_action_bar(
            "user-1",
            holdings=[],
            profile=make_profile(),
            digest_data=None,
            top_event=None,
            health_latest=None,
        )
        assert bar.headline == ""
        assert bar.severity == "green"
        assert bar.chips == []
        assert bar.source == "template"

    async def test_digest_percentage_parsing(self):
        """Verify daily_change strings like '+0.5%' and '-2.3%' are parsed."""
        holdings = [make_holding("AAPL", 100.0)]
        digest = {"stocks": [{"symbol": "AAPL", "daily_change": "+0.5%"}]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(),
            digest_data=digest,
        )
        # +0.5% is not a drawdown
        assert bar.severity == "green"

    async def test_missing_thesis_chip_only_includes_digest_symbols(self):
        """Bug 2 regression: action chip `#stock-<sym>` must point to a symbol
        that's actually rendered in today's digest, otherwise it's a dead
        anchor. holdings=[AAPL, GLD] both lack thesis; digest only has AAPL.
        Expect chip to link to AAPL, not GLD."""
        holdings = [make_holding("AAPL", 50.0), make_holding("GLD", 50.0)]
        digest = {"stocks": [{"symbol": "AAPL", "daily_change": "+0.2%"}]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(),
            digest_data=digest,
        )
        # Should hit green stable branch with the AAPL thesis chip
        assert bar.severity == "green"
        thesis_chips = [c for c in bar.chips if c.label == "补充投资论点"]
        assert len(thesis_chips) == 1
        assert thesis_chips[0].link == "#stock-AAPL"

    async def test_missing_thesis_chip_falls_back_when_no_overlap(self):
        """Bug 2 regression: if every missing-thesis holding is absent from
        today's digest, the chip should fall through to the next priority
        (health/portfolio update/archive) rather than emit a dead `#stock-` link."""
        holdings = [make_holding("GLD", 50.0), make_holding("TLT", 50.0)]
        digest = {"stocks": [{"symbol": "AAPL", "daily_change": "+0.2%"}]}
        bar = await build_action_bar(
            "user-1",
            holdings=holdings,
            profile=make_profile(),
            digest_data=digest,
        )
        assert bar.severity == "green"
        # No `#stock-` chip should be emitted (no overlap → fall through)
        for chip in bar.chips:
            assert not chip.link.startswith("#stock-"), (
                f"chip points to non-rendered symbol: {chip.link}"
            )


# ---------------------------------------------------------------------------
# build_action_bar — DB loading path (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="legacy rule-engine removed — see round2 design")
@pytest.mark.asyncio
class TestBuildActionBarDBPath:
    """Test the DB-loading fallback path in build_action_bar."""

    async def test_profile_load_failure_uses_defaults(self):
        """If profile load fails, use default profile."""
        with patch("app.features.portfolio.db.get_profile", new_callable=AsyncMock, side_effect=Exception("DB down")), \
             patch("app.features.portfolio.db.list_portfolio", new_callable=AsyncMock, return_value=[]):
            bar = await build_action_bar("user-1")
            assert bar.severity == "green"
            assert bar.source == "template"

    async def test_holdings_load_failure_graceful(self):
        """If holdings load fails, degrade to green."""
        with patch("app.features.portfolio.db.get_profile", new_callable=AsyncMock, return_value=make_profile()), \
             patch("app.features.portfolio.db.list_portfolio", new_callable=AsyncMock, side_effect=Exception("DB down")):
            bar = await build_action_bar("user-1")
            assert bar.severity == "green"


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


class TestModels:
    def test_action_bar_model(self):
        bar = ActionBar(
            severity="green",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert bar.severity == "green"

    def test_drag_result_defaults(self):
        dr = DragResult()
        assert dr.overall == 0.0
        assert dr.worst_single == 0.0
        assert dr.culprit is None
        assert dr.value == 0.0

    def test_signal_model(self):
        s = Signal(kind="drawdown", severity="red", data={"cause": "test"})
        assert s.kind == "drawdown"
        assert s.data["cause"] == "test"

    def test_action_chip_model(self):
        c = ActionChip(label="测试", link="/test", kind="stable")
        assert c.label == "测试"

    def test_action_chip_guide_kind(self):
        c = ActionChip(label="补充投资论点", link="#stock-AAPL", kind="guide")
        assert c.kind == "guide"


# ---------------------------------------------------------------------------
# Green headline + green chips (new templates)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="rule-engine removed — green_headline/green_chips deleted in round2")
class TestGreenHeadlineV2:
    def test_green_headline_positive_with_contributor(self):
        pass

    def test_green_headline_negative_with_dragger(self):
        pass

    def test_green_headline_small_change(self):
        pass

    def test_green_headline_no_data(self):
        pass


@pytest.mark.skip(reason="rule-engine removed — green_chips deleted in round2")
class TestGreenChips:
    def test_green_chips_missing_thesis_first(self):
        pass

    def test_green_chips_health_stale(self):
        pass

    def test_green_chips_portfolio_stale(self):
        pass

    def test_green_chips_fallback(self):
        pass


# ---------------------------------------------------------------------------
# Router integration (smoke test with TestClient)
# ---------------------------------------------------------------------------


class TestRouter:
    def test_action_bar_endpoint_requires_auth(self):
        """Endpoint returns 401 without auth token."""
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.get("/api/for-you/action-bar")
        assert resp.status_code == 401

    def test_action_bar_endpoint_with_mocked_auth(self):
        """Endpoint returns 200 with mocked auth + mocked DB."""
        from fastapi.testclient import TestClient
        from app.main import app

        with patch("app.features.for_you.router.verify_user_token", return_value="test-user"), \
             patch("app.features.for_you.router.has_entitlement", new_callable=AsyncMock, return_value=True), \
             patch("app.features.portfolio.db.get_profile", new_callable=AsyncMock, return_value=make_profile()), \
             patch("app.features.portfolio.db.list_portfolio", new_callable=AsyncMock, return_value=[]):

            # Override the dependency
            from app.core.deps import verify_user_token
            app.dependency_overrides[verify_user_token] = lambda: "test-user"
            try:
                client = TestClient(app)
                resp = client.get("/api/for-you/action-bar")
                assert resp.status_code == 200
                data = resp.json()
                assert data["severity"] in ("green", "yellow", "red")
                assert "headline" in data
                assert "chips" in data
                assert "source" in data
            finally:
                app.dependency_overrides.clear()


class TestActionBarVisibility:
    def test_action_bar_default_visibility_visible(self):
        from app.features.for_you.models import ActionBar
        bar = ActionBar(
            severity="green", headline="", chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert bar.visibility == "visible"

    def test_action_bar_hidden(self):
        from app.features.for_you.models import ActionBar
        bar = ActionBar(
            severity="green", headline="", chips=[],
            source="template", visibility="hidden",
            generated_at=datetime.now(timezone.utc),
        )
        assert bar.visibility == "hidden"

    def test_action_chip_target_field(self):
        from app.features.for_you.models import ActionChip
        chip = ActionChip(label="补 NVDA 论点", target="thesis:NVDA", kind="thesis")
        assert chip.target == "thesis:NVDA"


# ---------------------------------------------------------------------------
# build_action_bar — agent-driven path (round2 redesign)
# ---------------------------------------------------------------------------


class TestBuildActionBarAgentDriven:
    @pytest.mark.asyncio
    async def test_hidden_when_no_items_no_summary(self):
        from app.features.for_you.service import build_action_bar
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.portfolio.db.list_portfolio", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.get_user_digest", new=AsyncMock(return_value=None)), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data={"action_items": [], "portfolio_summary": ""},
                holdings=[],
            )
        assert bar.visibility == "hidden"

    @pytest.mark.asyncio
    async def test_visible_with_portfolio_summary_only(self):
        from app.features.for_you.service import build_action_bar
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data={
                    "action_items": [],
                    "portfolio_summary": "组合今日涨 1.4%，NVDA 领涨",
                },
                holdings=[],
            )
        assert bar.visibility == "visible"
        assert bar.headline == "组合今日涨 1.4%，NVDA 领涨"
        assert bar.chips == []

    @pytest.mark.asyncio
    async def test_chips_from_agent_action_items(self):
        from app.features.for_you.service import build_action_bar
        holdings = [make_holding("NVDA", 60), make_holding("AAPL", 40)]
        digest = {
            "action_items": [
                {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "x", "priority": 1},
                {"label": "看体检", "target": "health", "reason": "y", "priority": 2},
            ],
            "portfolio_summary": "组合稳健",
        }
        # NVDA has no thesis; mark missing
        holdings[0].thesis = None
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar(
                "user-1",
                digest_data=digest,
                holdings=holdings,
            )
        assert bar.visibility == "visible"
        assert len(bar.chips) == 1
        assert [c.target for c in bar.chips] == ["thesis:NVDA"]
        assert bar.source == "agent"

    @pytest.mark.asyncio
    async def test_invalid_targets_dropped(self):
        from app.features.for_you.service import build_action_bar
        digest = {
            "action_items": [
                {"label": "买入", "target": "buy:NVDA", "reason": "x", "priority": 1},
                {"label": "看体检", "target": "health", "reason": "y", "priority": 1},
            ],
            "portfolio_summary": "",
        }
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])
        assert bar.chips == []
        assert bar.visibility == "hidden"

    @pytest.mark.asyncio
    async def test_non_string_portfolio_summary_does_not_crash(self):
        from app.features.for_you.service import build_action_bar
        # Simulate malformed cached digest
        digest_data = {"action_items": [], "portfolio_summary": {"bad": "shape"}}
        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[])):
            bar = await build_action_bar("user-1", digest_data=digest_data, holdings=[])
        # Non-string summary is dropped; bar is hidden (both chips and headline empty)
        assert bar.visibility == "hidden"

    @pytest.mark.asyncio
    async def test_whitespace_thesis_treated_as_missing(self):
        """Service must agree with agent: thesis='   ' (whitespace only) means missing.

        Previously the service-side missing_thesis check used `not thesis`
        which treats "   " as Truthy — so `thesis:<SYM>` chips the agent
        legitimately emitted were rejected at the validator.
        """
        from app.features.for_you.service import build_action_bar

        holdings = [make_holding("NVDA", 60), make_holding("AAPL", 40)]
        holdings[0].thesis = "   "  # whitespace only — agent treats as missing
        holdings[1].thesis = "Real thesis"

        digest = {
            "action_items": [
                {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "x", "priority": 1},
            ],
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=holdings)

        assert len(bar.chips) == 1
        assert bar.chips[0].target == "thesis:NVDA"

    @pytest.mark.asyncio
    async def test_action_items_as_dict_coerced_to_list(self):
        """LLM hallucinates action_items as dict → coerce to single-element list.

        Without coercion, `for raw in raw_items` iterates dict keys (strings)
        and every ActionItem.model_validate raises, silently dropping the chip.
        """
        from app.features.for_you.service import build_action_bar

        digest = {
            "action_items": {"label": "补论点", "target": "portfolio", "reason": "test", "priority": 1},
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])

        assert len(bar.chips) == 1
        assert bar.chips[0].target == "portfolio"

    @pytest.mark.asyncio
    async def test_resolve_falls_through_to_db_when_cached_row_lacks_id(self):
        """When the cached_recent row with matching date has no digest_id/id,
        _resolve must fall through to resolve_digest_id_by_date instead of
        returning None (previously it returned None inside the loop)."""
        from app.features.for_you.service import build_action_bar

        # cached_recent contains the target date but no id fields on that row
        cached = [
            {"digest_date": "2026-04-21"},  # matches target but no digest_id/id
            {"digest_id": "uuid-other", "digest_date": "2026-01-01"},
        ]

        resolve_mock = AsyncMock(return_value="uuid-fresh")

        digest = {
            "action_items": [
                {"label": "回看日报", "target": "digest:2026-04-21", "reason": "x", "priority": 1},
            ],
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=cached)), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=resolve_mock):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])

        # Fallthrough called once with the target date
        assert resolve_mock.await_count == 1
        resolve_mock.assert_awaited_with("user-1", "2026-04-21")
        # Chip made it through with the resolved uuid
        assert len(bar.chips) == 1
        assert bar.chips[0].target == "digest:uuid-fresh"
