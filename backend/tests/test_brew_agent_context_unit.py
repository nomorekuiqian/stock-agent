"""Tests for the new action_context block that agent.py injects into data_for_agent."""

from app.features.brew.agent import build_action_context


class TestBuildActionContext:
    def test_basic_assembly(self):
        ctx = build_action_context(
            portfolio_holdings=[
                {"symbol": "NVDA", "thesis": ""},
                {"symbol": "AAPL", "thesis": "iPhone 17 cycle"},
                {"symbol": "$CASH", "thesis": None},
            ],
            health_latest_generated_at="2026-04-01T00:00:00Z",
            portfolio_confirmed_at="2026-03-20T00:00:00Z",
            upcoming_events=[
                {"related_symbols": ["NVDA"]},
                {"related_symbols": ["AAPL", "MSFT"]},
            ],
            previous_digests=[
                {"date": "2026-04-21"},
                {"date": "2026-04-22"},
            ],
            now_iso="2026-04-25T12:00:00Z",
        )
        assert ctx["missing_thesis_symbols"] == ["NVDA"]
        assert ctx["days_since_last_health_check"] == 24
        assert ctx["days_since_last_portfolio_update"] == 36
        assert set(ctx["symbols_with_today_events"]) == {"NVDA", "AAPL", "MSFT"}
        assert ctx["previous_digest_dates"] == ["2026-04-21", "2026-04-22"]

    def test_nulls_when_missing(self):
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at=None,
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T12:00:00Z",
        )
        assert ctx["missing_thesis_symbols"] == []
        assert ctx["days_since_last_health_check"] is None
        assert ctx["days_since_last_portfolio_update"] is None
        assert ctx["symbols_with_today_events"] == []
        assert ctx["previous_digest_dates"] == []


class TestDaysSinceNaiveDatetime:
    """Regression: _days_since must handle naive ISO strings (common from DB columns
    without timezone info) without throwing."""

    def test_naive_portfolio_confirmed_at_returns_days(self):
        # Naive ISO (no Z, no +00:00)
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at=None,
            portfolio_confirmed_at="2026-03-20T00:00:00",
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T00:00:00Z",
        )
        assert ctx["days_since_last_portfolio_update"] == 36

    def test_naive_health_generated_at_returns_days(self):
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at="2026-04-10T12:30:00",
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T00:00:00Z",
        )
        assert ctx["days_since_last_health_check"] == 14

    def test_malformed_iso_returns_none(self):
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at="not-a-date",
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T00:00:00Z",
        )
        assert ctx["days_since_last_health_check"] is None


class TestHealthLatestInjection:
    def test_health_latest_passed(self):
        """health_latest_generated_at should come through when provided."""
        ctx = build_action_context(
            portfolio_holdings=[],
            health_latest_generated_at="2026-04-10T00:00:00Z",
            portfolio_confirmed_at=None,
            upcoming_events=[],
            previous_digests=[],
            now_iso="2026-04-25T00:00:00Z",
        )
        assert ctx["days_since_last_health_check"] == 15
