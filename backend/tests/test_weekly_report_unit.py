"""
Unit Tests for Weekly Macro Report Pydantic Models

Pure model validation - no network/database dependencies.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_weekly_report_unit.py -v
"""

import pytest
from pydantic import ValidationError

from app.features.weekly_report.models import (
    SectionAnalysis,
    SignalLights,
    WeekAheadEvent,
    WeeklyReportOutput,
    WeeklyRawData,
)


# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture
def sample_section():
    return {
        "data_changes": "Fed balance sheet shrank by $30B this week.",
        "trend_interpretation": "Quantitative tightening continues at steady pace.",
        "market_implication": "Neutral for equities in the short term.",
    }


@pytest.fixture
def sample_signal_lights():
    return {
        "liquidity": "green",
        "economy": "yellow",
        "inflation": "red",
        "sentiment": "green",
    }


@pytest.fixture
def sample_event():
    return {
        "date": "Wednesday",
        "event": "CPI (expected +0.2% MoM)",
        "if_above": "Hawkish repricing, risk-off",
        "if_below": "Rally in growth stocks",
    }


@pytest.fixture
def sample_full_report(sample_section, sample_signal_lights, sample_event):
    return {
        "executive_summary": "This week's macro environment is cautiously optimistic.",
        "signal_lights": sample_signal_lights,
        "market_recap": "S&P 500 gained 1.2% on strong earnings.",
        "liquidity_analysis": sample_section,
        "economy_analysis": sample_section,
        "inflation_analysis": sample_section,
        "sentiment_analysis": sample_section,
        "investment_implications": "Favor growth over value; watch tech earnings.",
        "week_ahead": [sample_event],
    }


# ===========================================================================
# TestSectionAnalysis
# ===========================================================================


class TestSectionAnalysis:
    """Tests for SectionAnalysis model."""

    def test_valid_construction(self, sample_section):
        """SectionAnalysis with all fields constructs successfully."""
        obj = SectionAnalysis(**sample_section)
        assert obj.data_changes == sample_section["data_changes"]
        assert obj.trend_interpretation == sample_section["trend_interpretation"]
        assert obj.market_implication == sample_section["market_implication"]

    def test_missing_field_raises(self):
        """Missing required field raises ValidationError."""
        with pytest.raises(ValidationError):
            SectionAnalysis(
                data_changes="some data",
                trend_interpretation="some trend",
                # market_implication is missing
            )


# ===========================================================================
# TestSignalLights
# ===========================================================================


class TestSignalLights:
    """Tests for SignalLights model."""

    def test_valid_values(self, sample_signal_lights):
        """SignalLights with green/yellow/red values constructs successfully."""
        obj = SignalLights(**sample_signal_lights)
        assert obj.liquidity == "green"
        assert obj.economy == "yellow"
        assert obj.inflation == "red"
        assert obj.sentiment == "green"

    def test_all_fields_required(self):
        """Missing any field raises ValidationError."""
        with pytest.raises(ValidationError):
            SignalLights(
                liquidity="green",
                economy="yellow",
                # inflation and sentiment missing
            )


# ===========================================================================
# TestWeekAheadEvent
# ===========================================================================


class TestWeekAheadEvent:
    """Tests for WeekAheadEvent model."""

    def test_valid_event(self, sample_event):
        """WeekAheadEvent with all fields constructs successfully."""
        obj = WeekAheadEvent(**sample_event)
        assert obj.date == sample_event["date"]
        assert obj.event == sample_event["event"]
        assert obj.if_above == sample_event["if_above"]
        assert obj.if_below == sample_event["if_below"]

    def test_missing_field_raises(self):
        """Missing required field raises ValidationError."""
        with pytest.raises(ValidationError):
            WeekAheadEvent(
                date="Monday",
                event="FOMC minutes",
                # if_above and if_below missing
            )


# ===========================================================================
# TestWeeklyReportOutput
# ===========================================================================


class TestWeeklyReportOutput:
    """Tests for WeeklyReportOutput model."""

    def test_valid_full_report(self, sample_full_report):
        """Full report with all nested models constructs successfully."""
        obj = WeeklyReportOutput(**sample_full_report)
        assert obj.executive_summary == sample_full_report["executive_summary"]
        assert isinstance(obj.signal_lights, SignalLights)
        assert isinstance(obj.liquidity_analysis, SectionAnalysis)
        assert isinstance(obj.economy_analysis, SectionAnalysis)
        assert isinstance(obj.inflation_analysis, SectionAnalysis)
        assert isinstance(obj.sentiment_analysis, SectionAnalysis)

    def test_week_ahead_is_list(self, sample_full_report):
        """week_ahead field is a list of WeekAheadEvent."""
        obj = WeeklyReportOutput(**sample_full_report)
        assert isinstance(obj.week_ahead, list)
        assert len(obj.week_ahead) == 1
        assert isinstance(obj.week_ahead[0], WeekAheadEvent)


# ===========================================================================
# TestWeeklyRawData
# ===========================================================================


class TestWeeklyRawData:
    """Tests for WeeklyRawData model."""

    def test_defaults(self):
        """Only required fields needed; optional fields default to None/[]."""
        obj = WeeklyRawData(
            week_label="2025.W06",
            collected_at="2025-02-07T10:00:00Z",
        )
        assert obj.week_label == "2025.W06"
        assert obj.macro_risk is None
        assert obj.economy is None
        assert obj.inflation_rates is None
        assert obj.liquidity is None
        assert obj.market_performance is None
        assert obj.economic_calendar == []
        assert obj.earnings_calendar == []

    def test_full_construction(self):
        """Full construction with all fields succeeds."""
        obj = WeeklyRawData(
            week_label="2025.W06",
            collected_at="2025-02-07T10:00:00Z",
            macro_risk={"score": 5.0},
            economy={"gdp": 2.1},
            inflation_rates={"cpi": 3.2},
            liquidity={"net": 5.5},
            economic_calendar=[{"event": "CPI"}],
            earnings_calendar=[{"company": "AAPL"}],
        )
        assert obj.macro_risk == {"score": 5.0}
        assert obj.economy == {"gdp": 2.1}
        assert len(obj.economic_calendar) == 1
        assert len(obj.earnings_calendar) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
