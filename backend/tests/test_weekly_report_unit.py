"""
Unit Tests for Weekly Macro Report Models and Agent Utilities

Pure model validation and utility function tests - no network/database dependencies.

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
    MarketPerformance,
)
from app.features.weekly_report.agent import (
    _prepare_data_for_agent,
    WeeklyReportAgent,
)


# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture
def sample_section():
    return {
        "summary": "Liquidity is tightening, net liquidity at $5.7T.",
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
        "title": "Strong economy meets high rates",
        "verdict": "Neutral -- GDP strong but inflation sticky.",
        "signal_lights": sample_signal_lights,
        "landscape": "Current macro shows tension between growth and inflation.",
        "narrative": "This week the story was about cross-currents.",
        "takeaway": "Lean defensive until CPI clarity.",
        "liquidity_analysis": sample_section,
        "economy_analysis": sample_section,
        "inflation_analysis": sample_section,
        "sentiment_analysis": sample_section,
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
        assert obj.summary == sample_section["summary"]
        assert obj.data_changes == sample_section["data_changes"]
        assert obj.trend_interpretation == sample_section["trend_interpretation"]
        assert obj.market_implication == sample_section["market_implication"]

    def test_missing_summary_raises(self):
        """Missing summary field raises ValidationError."""
        with pytest.raises(ValidationError):
            SectionAnalysis(
                data_changes="some data",
                trend_interpretation="some trend",
                market_implication="some implication",
                # summary is missing
            )

    def test_missing_market_implication_raises(self):
        """Missing required field raises ValidationError."""
        with pytest.raises(ValidationError):
            SectionAnalysis(
                summary="summary",
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
    """Tests for WeeklyReportOutput model (new schema)."""

    def test_valid_full_report(self, sample_full_report):
        """Full report with all nested models constructs successfully."""
        obj = WeeklyReportOutput(**sample_full_report)
        assert obj.title == sample_full_report["title"]
        assert obj.verdict == sample_full_report["verdict"]
        assert obj.landscape == sample_full_report["landscape"]
        assert obj.narrative == sample_full_report["narrative"]
        assert obj.takeaway == sample_full_report["takeaway"]
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

    def test_missing_title_raises(self, sample_full_report):
        """Missing title field raises ValidationError."""
        data = {**sample_full_report}
        del data["title"]
        with pytest.raises(ValidationError):
            WeeklyReportOutput(**data)

    def test_missing_verdict_raises(self, sample_full_report):
        """Missing verdict field raises ValidationError."""
        data = {**sample_full_report}
        del data["verdict"]
        with pytest.raises(ValidationError):
            WeeklyReportOutput(**data)


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


# ===========================================================================
# TestPrepareDataForAgent
# ===========================================================================


class TestPrepareDataForAgent:
    """Tests for _prepare_data_for_agent utility."""

    def test_core_data_grouped(self):
        """Core macro data placed under CORE_MACRO_DATA key."""
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
            liquidity={"net": 5.7},
            economy={"gdp": 4.4},
            inflation_rates={"cpi": 2.6},
            sentiment={"vix": 16},
        )
        result = _prepare_data_for_agent(raw)
        assert "CORE_MACRO_DATA" in result
        core = result["CORE_MACRO_DATA"]
        assert core["liquidity"] == {"net": 5.7}
        assert core["economy"] == {"gdp": 4.4}
        assert core["inflation_rates"] == {"cpi": 2.6}
        assert core["sentiment"] == {"vix": 16}

    def test_macro_risk_in_core(self):
        """macro_risk is placed inside CORE_MACRO_DATA."""
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
            macro_risk={"score": 5.0},
        )
        result = _prepare_data_for_agent(raw)
        assert result["CORE_MACRO_DATA"]["macro_risk"] == {"score": 5.0}

    def test_index_performance_extracted(self):
        """Market performance indices appear as index_performance (not full market_performance)."""
        perf = MarketPerformance(
            indices=[{"symbol": "^GSPC", "weekly_change": 1.5}],
            sectors=[{"symbol": "XLE", "weekly_change": 3.0}],
        )
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
            market_performance=perf,
        )
        result = _prepare_data_for_agent(raw)
        assert "index_performance" in result
        assert result["index_performance"] == perf.indices
        # Sectors should NOT be in the output (only indices)
        assert "market_performance" not in result

    def test_empty_performance_no_key(self):
        """No index_performance key when market_performance has no indices."""
        perf = MarketPerformance()  # empty indices
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
            market_performance=perf,
        )
        result = _prepare_data_for_agent(raw)
        assert "index_performance" not in result

    def test_calendar_fields_extracted(self):
        """Economic and earnings calendars are extracted with correct fields."""
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
            economic_calendar=[
                {"date": "2025-02-18", "event": "CPI", "previous": "2.5", "estimate": "2.6", "is_key_event": True, "extra_field": "ignored"},
            ],
            earnings_calendar=[
                {"symbol": "NVDA", "date": "2025-02-19", "epsEstimated": 0.75, "revenueEstimated": 20e9, "is_ai_related": True, "extra": "ignored"},
            ],
        )
        result = _prepare_data_for_agent(raw)
        eco = result["economic_calendar"]
        assert len(eco) == 1
        assert eco[0]["date"] == "2025-02-18"
        assert eco[0]["is_key_event"] is True
        assert "extra_field" not in eco[0]

        earn = result["earnings_calendar"]
        assert len(earn) == 1
        assert earn[0]["symbol"] == "NVDA"
        assert "extra" not in earn[0]

    def test_minimal_raw_data(self):
        """Minimal raw data produces valid output with empty CORE_MACRO_DATA."""
        raw = WeeklyRawData(
            week_label="2025.W07",
            collected_at="2025-02-14T10:00:00Z",
        )
        result = _prepare_data_for_agent(raw)
        assert result["week_label"] == "2025.W07"
        assert result["CORE_MACRO_DATA"] == {}
        assert result["economic_calendar"] == []
        assert result["earnings_calendar"] == []


# ===========================================================================
# TestWeeklyReportAgentHelpers
# ===========================================================================


class TestWeeklyReportAgentHelpers:
    """Tests for WeeklyReportAgent static/helper methods."""

    def test_empty_section_has_summary(self):
        """_empty_section includes summary field."""
        section = WeeklyReportAgent._empty_section()
        assert "summary" in section
        assert section["summary"] == ""
        assert section["data_changes"] == ""
        assert section["trend_interpretation"] == ""
        assert section["market_implication"] == ""

    def test_default_signal_lights(self):
        """_default_signal_lights returns all yellow."""
        lights = WeeklyReportAgent._default_signal_lights()
        assert lights == {
            "liquidity": "yellow",
            "economy": "yellow",
            "inflation": "yellow",
            "sentiment": "yellow",
        }

    def test_empty_report_structure(self):
        """_empty_report has new schema fields (title, verdict, landscape, narrative, takeaway)."""
        agent = WeeklyReportAgent.__new__(WeeklyReportAgent)
        report = agent._empty_report()
        assert "title" in report
        assert "verdict" in report
        assert "landscape" in report
        assert "narrative" in report
        assert "takeaway" in report
        assert "week_ahead" in report
        assert report["week_ahead"] == []
        # Old fields should NOT be present
        assert "executive_summary" not in report
        assert "market_recap" not in report
        assert "investment_implications" not in report

    def test_extract_report_new_schema(self):
        """_extract_report extracts new schema fields correctly from session state."""
        agent = WeeklyReportAgent.__new__(WeeklyReportAgent)

        class FakeSession:
            state = {
                "report": {
                    "title": "Test Title",
                    "verdict": "Test Verdict",
                    "signal_lights": {
                        "liquidity": "green",
                        "economy": "yellow",
                        "inflation": "red",
                        "sentiment": "green",
                    },
                    "landscape": "Macro landscape...",
                    "narrative": "Story of the week...",
                    "takeaway": "Lean defensive.",
                    "liquidity_analysis": {
                        "summary": "Liquidity ok.",
                        "data_changes": "Fed shrank.",
                        "trend_interpretation": "QT continues.",
                        "market_implication": "Neutral.",
                    },
                    "economy_analysis": {
                        "summary": "Economy strong.",
                        "data_changes": "GDP up.",
                        "trend_interpretation": "Growth steady.",
                        "market_implication": "Bullish.",
                    },
                    "inflation_analysis": {
                        "summary": "Inflation sticky.",
                        "data_changes": "CPI hot.",
                        "trend_interpretation": "Rates rising.",
                        "market_implication": "Bearish.",
                    },
                    "sentiment_analysis": {
                        "summary": "Sentiment ok.",
                        "data_changes": "VIX low.",
                        "trend_interpretation": "Calm.",
                        "market_implication": "Watch complacency.",
                    },
                    "week_ahead": [
                        {"date": "Wed", "event": "CPI", "if_above": "Bad", "if_below": "Good"},
                    ],
                }
            }

        result = agent._extract_report(FakeSession())
        assert result["title"] == "Test Title"
        assert result["verdict"] == "Test Verdict"
        assert result["landscape"] == "Macro landscape..."
        assert result["narrative"] == "Story of the week..."
        assert result["takeaway"] == "Lean defensive."
        assert result["liquidity_analysis"]["summary"] == "Liquidity ok."
        assert len(result["week_ahead"]) == 1

    def test_extract_report_missing_fields_safe(self):
        """_extract_report handles missing/empty session state gracefully."""
        agent = WeeklyReportAgent.__new__(WeeklyReportAgent)
        result = agent._extract_report(None)
        assert result["title"] == ""
        assert result["verdict"] == ""
        assert result["landscape"] == ""
        assert result["narrative"] == ""
        assert result["takeaway"] == ""
        assert result["signal_lights"] == WeeklyReportAgent._default_signal_lights()
        assert result["week_ahead"] == []


# ===========================================================================
# TestStripRawData
# ===========================================================================


class TestStripRawData:
    """Tests for _strip_raw_data utility in router."""

    def test_removes_raw_data(self):
        """raw_data key is removed from report dict."""
        from app.features.weekly_report.router import _strip_raw_data

        report = {"week_label": "2025.W07", "title": "Test", "raw_data": {"big": "payload"}}
        result = _strip_raw_data(report)
        assert "raw_data" not in result
        assert result["week_label"] == "2025.W07"
        assert result["title"] == "Test"

    def test_no_raw_data_passthrough(self):
        """Report without raw_data passes through unchanged."""
        from app.features.weekly_report.router import _strip_raw_data

        report = {"week_label": "2025.W07", "title": "Test"}
        result = _strip_raw_data(report)
        assert result == report

    def test_none_like_input(self):
        """Falsy input passes through."""
        from app.features.weekly_report.router import _strip_raw_data

        assert _strip_raw_data({}) == {}

    def test_empty_dict_passthrough(self):
        """Empty dict passes through unchanged."""
        from app.features.weekly_report.router import _strip_raw_data

        assert _strip_raw_data({}) == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
