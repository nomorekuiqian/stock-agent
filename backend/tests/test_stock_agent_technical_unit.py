"""
Stock Technical Analysis Agent Unit Tests

Tests for: _empty_technical_analysis, _prepare_technical_data_for_agent
No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_stock_agent_technical_unit.py -v
"""

import pytest

from app.features.stock.agent import (
    TECHNICAL_FIELDS,
    _empty_technical_analysis,
    _prepare_technical_data_for_agent,
)


# ===========================================================================
# TestEmptyTechnicalAnalysis
# ===========================================================================


class TestEmptyTechnicalAnalysis:
    """Tests for _empty_technical_analysis()."""

    def test_returns_all_fields(self):
        result = _empty_technical_analysis()
        for field in TECHNICAL_FIELDS:
            assert field in result

    def test_list_fields_are_lists(self):
        """signals and chart_annotations default to empty lists."""
        result = _empty_technical_analysis()
        assert result["signals"] == []
        assert result["chart_annotations"] == []

    def test_string_fields_are_empty_string(self):
        """Non-list fields default to empty strings."""
        result = _empty_technical_analysis()
        for field in ("title", "tldr", "situation", "summary"):
            assert result[field] == "", f"{field} should be empty string"

    def test_expected_fields(self):
        result = _empty_technical_analysis()
        expected = {"title", "tldr", "signals", "situation", "summary", "chart_annotations"}
        assert set(result.keys()) == expected


# ===========================================================================
# TestPrepareTechnicalDataForAgent
# ===========================================================================


class TestPrepareTechnicalDataForAgent:
    """Tests for _prepare_technical_data_for_agent().

    The function extracts current readings, derived signals, trend summary,
    and key levels from the raw technical data dict. It strips None values
    to keep the LLM context compact.
    """

    @pytest.fixture
    def full_technical_data(self):
        """Realistic technical data dict matching get_technical_data() output."""
        return {
            "symbol": "NVDA",
            "current": {
                "price": 135.0,
                "sma_20": 130.0,
                "sma_50": 125.0,
                "sma_200": 110.0,
                "rsi_14": 55.0,
                "macd_level": 1.5,
                "macd_signal": 1.2,
                "macd_histogram": 0.3,
                "adx_14": 25.0,
                "bb_upper": 140.0,
                "bb_lower": 120.0,
                "volume": 50000000,
                "volume_sma_20": 40000000,
            },
            "derived": {
                "above_sma_20": True,
                "rsi_zone": "neutral",
                "macd_cross": "bullish",
            },
            "trend_summary": {
                "direction": "up",
                "strength": "moderate",
                "duration_days": 15,
            },
            "support_resistance": {
                "support_1": 125.0,
                "resistance_1": 145.0,
                "support_2": None,
            },
        }

    def test_preserves_symbol(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert result["symbol"] == "NVDA"

    def test_includes_timeframe(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert result["timeframe"] == "daily"

    def test_includes_current_readings(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "current_readings" in result
        assert result["current_readings"]["rsi_14"] == 55.0
        assert result["current_readings"]["sma_20"] == 130.0

    def test_includes_derived_signals(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "derived_signals" in result
        assert result["derived_signals"]["rsi_zone"] == "neutral"

    def test_includes_recent_trend(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "recent_trend" in result
        assert result["recent_trend"]["direction"] == "up"

    def test_includes_key_levels(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "key_levels" in result
        assert result["key_levels"]["support_1"] == 125.0

    def test_none_values_filtered(self, full_technical_data):
        """None values stripped from each sub-dict to keep LLM context compact."""
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        # support_2 was None in fixture, should not appear
        assert "support_2" not in result.get("key_levels", {})

    def test_empty_data_returns_symbol(self):
        """Minimal data returns at least symbol and timeframe."""
        data = {"symbol": "EMPTY"}
        result = _prepare_technical_data_for_agent(data, timeframe="daily")
        assert result["symbol"] == "EMPTY"
        assert result["timeframe"] == "daily"

    def test_missing_sections_omitted(self):
        """Sections not present in input are simply not in output."""
        data = {"symbol": "TEST"}
        result = _prepare_technical_data_for_agent(data, timeframe="daily")
        assert "current_readings" not in result
        assert "derived_signals" not in result
        assert "recent_trend" not in result
        assert "key_levels" not in result

    def test_weekly_timeframe_label(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="weekly")
        assert result["timeframe"] == "weekly"
