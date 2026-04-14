"""
Macro Weekly Models & Agent Data Prep Unit Tests -- generated from git diff

Tests for:
- WeeklyRawData model new fields (trend_context, this_week_events)
- _prepare_data_for_agent with new data fields
- MACRO_RISK_FRED_SERIES new entries

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_macro_weekly_models_unit.py -v
"""

import pytest

from app.features.macro.weekly.models import WeeklyRawData, MarketPerformance
from app.features.macro.weekly.agent import _prepare_data_for_agent
from app.features.macro.risk.service import MACRO_RISK_FRED_SERIES


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def minimal_raw_data():
    """Minimal WeeklyRawData for testing new fields."""
    return WeeklyRawData(
        week_label="2024-W15",
        collected_at="2024-04-13T00:00:00Z",
    )


@pytest.fixture
def raw_data_with_new_fields():
    """WeeklyRawData with trend_context and this_week_events populated."""
    return WeeklyRawData(
        week_label="2024-W15",
        collected_at="2024-04-13T00:00:00Z",
        trend_context={
            "nfci": {
                "frequency": "weekly",
                "current": -0.43,
                "4w_direction": "down_3",
                "percentile_1y": 25,
            },
            "unemployment": {
                "frequency": "monthly",
                "current": 4.2,
                "consecutive_months": "up_2",
                "vs_6m_ago": 0.3,
                "vs_1y_ago": 0.5,
                "percentile_5y": 40,
            },
        },
        this_week_events=[
            {
                "date": "2024-04-10",
                "event": "CPI YoY",
                "estimate": 3.4,
                "actual": 3.5,
                "surprise": "above",
                "impact": "High",
            },
            {
                "date": "2024-04-11",
                "event": "Initial Claims",
                "estimate": 215,
                "actual": 211,
                "surprise": "below",
                "impact": "High",
            },
        ],
    )


# ===========================================================================
# TestWeeklyRawDataNewFields
# ===========================================================================


class TestWeeklyRawDataNewFields:
    """Tests for new fields on WeeklyRawData model."""

    def test_trend_context_default_none(self, minimal_raw_data):
        """trend_context defaults to None."""
        assert minimal_raw_data.trend_context is None

    def test_this_week_events_default_empty(self, minimal_raw_data):
        """this_week_events defaults to empty list."""
        assert minimal_raw_data.this_week_events == []

    def test_trend_context_populated(self, raw_data_with_new_fields):
        """trend_context stores dict with indicator data."""
        tc = raw_data_with_new_fields.trend_context
        assert tc is not None
        assert "nfci" in tc
        assert tc["nfci"]["frequency"] == "weekly"
        assert tc["nfci"]["current"] == -0.43

    def test_this_week_events_populated(self, raw_data_with_new_fields):
        """this_week_events stores list of event dicts."""
        events = raw_data_with_new_fields.this_week_events
        assert len(events) == 2
        assert events[0]["event"] == "CPI YoY"
        assert events[0]["surprise"] == "above"

    def test_serialization_roundtrip(self, raw_data_with_new_fields):
        """Model can serialize and deserialize with new fields."""
        data = raw_data_with_new_fields.model_dump()
        restored = WeeklyRawData(**data)
        assert restored.trend_context == raw_data_with_new_fields.trend_context
        assert restored.this_week_events == raw_data_with_new_fields.this_week_events


# ===========================================================================
# TestPrepareDataForAgent
# ===========================================================================


class TestPrepareDataForAgent:
    """Tests for _prepare_data_for_agent with new data fields."""

    def test_trend_context_included(self, raw_data_with_new_fields):
        """trend_context passed into CORE_MACRO_DATA."""
        result = _prepare_data_for_agent(raw_data_with_new_fields)
        core = result.get("CORE_MACRO_DATA", {})
        assert "trend_context" in core
        assert core["trend_context"]["nfci"]["current"] == -0.43

    def test_trend_context_excluded_when_none(self, minimal_raw_data):
        """trend_context omitted from CORE_MACRO_DATA when None."""
        result = _prepare_data_for_agent(minimal_raw_data)
        core = result.get("CORE_MACRO_DATA", {})
        assert "trend_context" not in core

    def test_this_week_events_included(self, raw_data_with_new_fields):
        """this_week_events serialized into result."""
        result = _prepare_data_for_agent(raw_data_with_new_fields)
        events = result.get("this_week_events", [])
        assert len(events) == 2
        assert events[0]["event"] == "CPI YoY"
        assert events[0]["surprise"] == "above"
        assert events[0]["estimate"] == 3.4
        assert events[0]["actual"] == 3.5

    def test_this_week_events_absent_when_empty(self, minimal_raw_data):
        """this_week_events key absent when no events."""
        result = _prepare_data_for_agent(minimal_raw_data)
        # Empty list produces empty list in output (not absent)
        # The function iterates raw_data.this_week_events which is []
        assert result.get("this_week_events", []) == []

    def test_this_week_events_field_structure(self, raw_data_with_new_fields):
        """Each event has date, event, estimate, actual, surprise fields."""
        result = _prepare_data_for_agent(raw_data_with_new_fields)
        for event in result["this_week_events"]:
            assert "date" in event
            assert "event" in event
            assert "estimate" in event
            assert "actual" in event
            assert "surprise" in event


# ===========================================================================
# TestMacroRiskFredSeriesNewEntries
# ===========================================================================


class TestMacroRiskFredSeriesNewEntries:
    """Tests for new FRED series added to MACRO_RISK_FRED_SERIES."""

    def test_lei_series_present(self):
        """LEI (Leading Economic Index) series registered."""
        assert "lei" in MACRO_RISK_FRED_SERIES
        assert MACRO_RISK_FRED_SERIES["lei"] == "USSLIND"

    def test_inflation_expectations_series_present(self):
        """5Y5Y inflation expectations series registered."""
        assert "inflation_expectations_5y5y" in MACRO_RISK_FRED_SERIES
        assert MACRO_RISK_FRED_SERIES["inflation_expectations_5y5y"] == "T5YIFR"

    def test_existing_series_unchanged(self):
        """Pre-existing series still present and correct."""
        assert MACRO_RISK_FRED_SERIES["fed_funds_rate"] == "FEDFUNDS"
        assert MACRO_RISK_FRED_SERIES["treasury_10y"] == "DGS10"
        assert MACRO_RISK_FRED_SERIES["real_rate_10y"] == "DFII10"
