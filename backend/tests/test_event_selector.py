"""Tests for brew/event_selector.py — pure event selection logic."""

from datetime import date

import pytest

from app.features.brew.event_selector import (
    MIN_SCORE,
    SEVERITY_BONUS,
    TopEvent,
    select_top_event,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TODAY = date(2026, 5, 1)


def _earnings(symbol: str, days_from_today: int, eps: float | None = None) -> dict:
    d = date.fromordinal(TODAY.toordinal() + days_from_today)
    return {
        "symbol": symbol,
        "date": d.isoformat(),
        "epsEstimated": eps,
    }


def _macro(event_text: str, days_from_today: int) -> dict:
    d = date.fromordinal(TODAY.toordinal() + days_from_today)
    return {
        "date": d.isoformat(),
        "event": event_text,
    }


# ---------------------------------------------------------------------------
# Empty / trivial inputs
# ---------------------------------------------------------------------------


class TestEmptyInputs:

    def test_all_empty(self):
        assert select_top_event([], [], {}, today=TODAY) is None

    def test_no_holdings(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2)],
            macros=[],
            holdings={},
            today=TODAY,
        )
        assert result is None

    def test_no_events(self):
        result = select_top_event(
            earnings=[],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None


# ---------------------------------------------------------------------------
# Earnings selection
# ---------------------------------------------------------------------------


class TestEarningsSelection:

    def test_earnings_within_7_days_selected(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.type == "earnings"
        assert result.symbol == "NVDA"
        assert result.days_until == 2

    def test_earnings_beyond_7_days_ignored(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 8)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_past_earnings_ignored(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", -1)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_holdings_below_1pct_ignored(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2)],
            macros=[],
            holdings={"NVDA": 0.5},
            today=TODAY,
        )
        assert result is None

    def test_earnings_severity_urgent_within_2_days(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 1)],
            macros=[],
            holdings={"NVDA": 20.0},
            today=TODAY,
        )
        assert result is not None
        assert result.severity == "urgent"

    def test_earnings_severity_watch_3_to_5_days(self):
        # Need high weight so score exceeds MIN_SCORE at day 4:
        # score = (1/5) * (60/100 + 0.2) = 0.2 * 0.8 = 0.16 > 0.15
        result = select_top_event(
            earnings=[_earnings("NVDA", 4)],
            macros=[],
            holdings={"NVDA": 60.0},
            today=TODAY,
        )
        assert result is not None
        assert result.severity == "watch"

    def test_earnings_info_severity_far_away_below_threshold(self):
        """Info-severity earnings (day 6-7) can't exceed MIN_SCORE even at 100% weight.
        max score at day 6 = (1/7)*1.0 = 0.143 < 0.15, so result is None."""
        result = select_top_event(
            earnings=[_earnings("NVDA", 7)],
            macros=[],
            holdings={"NVDA": 100.0},
            today=TODAY,
        )
        assert result is None

    def test_earnings_eps_in_why_for_you(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2, eps=3.45)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert "EPS" in result.why_for_you
        assert "$3.45" in result.why_for_you

    def test_earnings_source_id_format(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        expected_date = date.fromordinal(TODAY.toordinal() + 2).isoformat()
        assert result.source_id == f"earnings:NVDA:{expected_date}"

    def test_earnings_link_format(self):
        result = select_top_event(
            earnings=[_earnings("AAPL", 2)],
            macros=[],
            holdings={"AAPL": 20.0},
            today=TODAY,
        )
        assert result is not None
        assert result.link == "/stock/AAPL?tab=earnings"

    def test_earnings_today_is_day_zero(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 0)],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.days_until == 0
        assert result.severity == "urgent"


# ---------------------------------------------------------------------------
# Macro selection
# ---------------------------------------------------------------------------


class TestMacroSelection:

    def test_fomc_matched(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("FOMC Rate Decision", 1)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.type == "macro"
        assert result.severity == "urgent"  # critical -> urgent
        assert "全市场" in result.why_for_you

    def test_macro_beyond_5_days_ignored(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("FOMC Rate Decision", 6)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_macro_past_events_ignored(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("FOMC Rate Decision", -1)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_unrecognized_macro_ignored(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("Random Conference", 1)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_low_impact_far_away_skipped(self):
        """info severity + > 3 days away should be skipped."""
        result = select_top_event(
            earnings=[],
            macros=[_macro("Housing Starts Report", 4)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_macro_source_id_format(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("FOMC Rate Decision", 2)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        expected_date = date.fromordinal(TODAY.toordinal() + 2).isoformat()
        assert result.source_id == f"macro:FOMC:{expected_date}"

    def test_macro_link_is_macro(self):
        result = select_top_event(
            earnings=[],
            macros=[_macro("US CPI Data", 1)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.link == "/macro"


# ---------------------------------------------------------------------------
# Scoring & ranking
# ---------------------------------------------------------------------------


class TestScoring:

    def test_higher_weight_earnings_wins(self):
        """Earnings for a 40% holding should beat earnings for a 5% holding on the same day."""
        result = select_top_event(
            earnings=[
                _earnings("NVDA", 3),
                _earnings("AAPL", 3),
            ],
            macros=[],
            holdings={"NVDA": 40.0, "AAPL": 5.0},
            today=TODAY,
        )
        assert result is not None
        assert result.symbol == "NVDA"

    def test_closer_event_wins_over_farther(self):
        """An event tomorrow should score higher than one in 7 days, same weight."""
        result = select_top_event(
            earnings=[
                _earnings("NVDA", 1),
                _earnings("AAPL", 7),
            ],
            macros=[],
            holdings={"NVDA": 20.0, "AAPL": 20.0},
            today=TODAY,
        )
        assert result is not None
        assert result.symbol == "NVDA"

    def test_fomc_tomorrow_beats_low_weight_earnings(self):
        """FOMC tomorrow (critical) should beat 5% holding earnings in 5 days."""
        result = select_top_event(
            earnings=[_earnings("XYZ", 5)],
            macros=[_macro("FOMC Rate Decision", 1)],
            holdings={"XYZ": 5.0},
            today=TODAY,
        )
        assert result is not None
        assert result.type == "macro"

    def test_high_weight_earnings_today_beats_macro_in_3_days(self):
        """30% holding earnings today should beat FOMC in 3 days."""
        result = select_top_event(
            earnings=[_earnings("NVDA", 0)],
            macros=[_macro("FOMC Rate Decision", 3)],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.type == "earnings"
        assert result.symbol == "NVDA"


# ---------------------------------------------------------------------------
# Score threshold
# ---------------------------------------------------------------------------


class TestScoreThreshold:

    def test_very_low_weight_far_away_below_threshold(self):
        """1% holding at day 7 => score is very low, should return None."""
        result = select_top_event(
            earnings=[_earnings("XYZ", 7)],
            macros=[],
            holdings={"XYZ": 1.0},
            today=TODAY,
        )
        # score = (1/8) * (1/100 + 0.0) = 0.00125 — well below 0.15
        assert result is None

    def test_decent_weight_nearby_above_threshold(self):
        """20% holding at day 2 => score well above threshold."""
        result = select_top_event(
            earnings=[_earnings("NVDA", 2)],
            macros=[],
            holdings={"NVDA": 20.0},
            today=TODAY,
        )
        # score = (1/3) * (20/100 + 0.2) = 0.333 * 0.4 = 0.133
        # Actually with severity watch for days=2: sev is "urgent" since days <= 2
        # score = (1/3) * (20/100 + 0.4) = 0.333 * 0.6 = 0.2
        assert result is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:

    def test_symbol_case_insensitive(self):
        result = select_top_event(
            earnings=[{"symbol": "nvda", "date": date.fromordinal(TODAY.toordinal() + 2).isoformat()}],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.symbol == "NVDA"

    def test_missing_symbol_skipped(self):
        result = select_top_event(
            earnings=[{"symbol": "", "date": date.fromordinal(TODAY.toordinal() + 2).isoformat()}],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_bad_date_format_skipped(self):
        result = select_top_event(
            earnings=[{"symbol": "NVDA", "date": "not-a-date"}],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_missing_date_skipped(self):
        result = select_top_event(
            earnings=[{"symbol": "NVDA"}],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is None

    def test_date_as_date_object(self):
        d = date.fromordinal(TODAY.toordinal() + 2)
        result = select_top_event(
            earnings=[{"symbol": "NVDA", "date": d}],
            macros=[],
            holdings={"NVDA": 30.0},
            today=TODAY,
        )
        assert result is not None
        assert result.symbol == "NVDA"

    def test_top_event_model_fields(self):
        result = select_top_event(
            earnings=[_earnings("NVDA", 2, eps=1.5)],
            macros=[],
            holdings={"NVDA": 25.0},
            today=TODAY,
        )
        assert result is not None
        assert isinstance(result, TopEvent)
        assert result.type == "earnings"
        assert result.symbol == "NVDA"
        assert result.title == "NVDA 财报"
        assert result.days_until == 2
        assert "仓位" in result.why_for_you
        assert result.severity in ("info", "watch", "urgent")
        assert result.link.startswith("/stock/")
        assert result.source_id.startswith("earnings:")
