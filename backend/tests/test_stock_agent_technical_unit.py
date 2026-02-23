"""
Stock Technical Analysis Agent Unit Tests -- generated from git diff

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

    def test_all_values_empty_string(self):
        result = _empty_technical_analysis()
        for field in TECHNICAL_FIELDS:
            assert result[field] == ""

    def test_expected_fields(self):
        result = _empty_technical_analysis()
        expected = {"title", "trend_analysis", "entry_exit_signals", "pattern_analysis", "technical_summary"}
        assert set(result.keys()) == expected


# ===========================================================================
# TestPrepareTechnicalDataForAgent
# ===========================================================================


class TestPrepareTechnicalDataForAgent:
    """Tests for _prepare_technical_data_for_agent()."""

    @pytest.fixture
    def full_technical_data(self):
        """Realistic technical data dict with both daily and weekly fields."""
        return {
            "symbol": "NVDA",
            "ratings": {
                "daily": {"overall": "BUY", "overall_score": 0.3},
                "weekly": {"overall": "STRONG_BUY", "overall_score": 0.6},
            },
            "oscillators": {
                "rsi_14": 55.0,
                "rsi_14_weekly": 62.0,
                "macd_level": 1.5,
                "macd_signal": 1.2,
                "macd_histogram": 0.3,
                "macd_level_weekly": 2.0,
                "macd_signal_weekly": 1.8,
                "macd_histogram_weekly": 0.2,
            },
            "trend": {
                "adx_14": 25.0,
                "adx_14_weekly": 30.0,
                "adx_plus_di": 20.0,
                "adx_minus_di": 15.0,
            },
            "moving_averages": {
                "sma_20": 130.0,
                "sma_50": 125.0,
                "sma_200": 110.0,
            },
            "volatility": {"atr_14": 5.0, "bb_upper": 140.0, "bb_lower": 120.0},
            "price_volume": {"price": 135.0, "volume": 50000000},
            "derived": {"above_sma_20": True, "rsi_zone": "neutral"},
            "trends": {"rsi_14": {"direction": "rising"}},
            "support_resistance": {"support_1": 125.0, "resistance_1": 145.0},
            "pattern_signals": {"ma_alignment": "bullish"},
        }

    def test_daily_includes_daily_ratings(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "daily" in result["tv_ratings"]
        assert "weekly" not in result["tv_ratings"]

    def test_weekly_includes_weekly_ratings(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="weekly")
        assert "weekly" in result["tv_ratings"]
        assert "daily" not in result["tv_ratings"]

    def test_daily_filters_weekly_oscillators(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        osc = result["oscillators"]
        # Daily should NOT contain *_weekly fields
        for key in osc:
            assert not key.endswith("_weekly"), f"Daily result contains weekly field: {key}"

    def test_weekly_remaps_oscillators(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="weekly")
        osc = result["oscillators"]
        # Weekly RSI should come from rsi_14_weekly
        assert osc["rsi_14"] == 62.0
        # Weekly MACD histogram should come from macd_histogram_weekly
        assert osc["macd_histogram"] == 0.2

    def test_daily_filters_weekly_trend(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        trend = result["trend_indicators"]
        for key in trend:
            assert not key.endswith("_weekly"), f"Daily trend contains weekly field: {key}"

    def test_weekly_remaps_adx(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="weekly")
        trend = result["trend_indicators"]
        assert trend["adx_14"] == 30.0

    def test_preserves_symbol(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert result["symbol"] == "NVDA"

    def test_includes_moving_averages(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "moving_averages" in result
        assert result["moving_averages"]["sma_20"] == 130.0

    def test_includes_volatility(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "volatility" in result

    def test_includes_derived_signals(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "derived_signals" in result
        assert result["derived_signals"]["rsi_zone"] == "neutral"

    def test_includes_support_resistance(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "support_resistance" in result

    def test_includes_pattern_signals(self, full_technical_data):
        result = _prepare_technical_data_for_agent(full_technical_data, timeframe="daily")
        assert "pattern_signals" in result
        assert result["pattern_signals"]["ma_alignment"] == "bullish"

    def test_none_values_filtered(self):
        """Fields with None values should be excluded from oscillators."""
        data = {
            "symbol": "TEST",
            "ratings": {"daily": {}},
            "oscillators": {"rsi_14": 50.0, "macd_level": None, "rsi_14_weekly": None},
            "trend": {},
        }
        result = _prepare_technical_data_for_agent(data, timeframe="daily")
        osc = result.get("oscillators", {})
        assert "macd_level" not in osc
        assert "rsi_14" in osc

    def test_empty_data_returns_symbol(self):
        """Minimal data returns at least symbol."""
        data = {"symbol": "EMPTY"}
        result = _prepare_technical_data_for_agent(data, timeframe="daily")
        assert result["symbol"] == "EMPTY"
