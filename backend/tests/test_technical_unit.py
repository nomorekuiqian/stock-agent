"""
Technical Data Tools Unit Tests

Tests for: _get_cached, _set_cached, _find_support_resistance,
_compute_macd, _compute_bollinger_bands, _compute_derived_signals,
_aggregate_to_weekly, _compute_trend_summary

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_technical_unit.py -v
"""

import threading
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from app.shared.data_tools.technical import (
    _get_cached,
    _set_cached,
    _find_support_resistance,
    _compute_macd,
    _compute_bollinger_bands,
    _compute_derived_signals,
    _aggregate_to_weekly,
    _compute_trend_summary,
)


# ===========================================================================
# TestCaching
# ===========================================================================


class TestCaching:
    """Tests for _get_cached / _set_cached."""

    def test_set_and_get(self):
        cache = {}
        lock = threading.Lock()
        data = {"price": 150.0}

        _set_cached(cache, lock, "AAPL", data, ttl_min=5)
        result = _get_cached(cache, lock, "AAPL")
        assert result == data

    def test_expired_returns_none(self):
        cache = {}
        lock = threading.Lock()

        # Manually insert an expired entry
        cache["AAPL"] = {
            "data": {"price": 150.0},
            "expires": datetime.now() - timedelta(minutes=1),
        }
        result = _get_cached(cache, lock, "AAPL")
        assert result is None

    def test_missing_key_returns_none(self):
        cache = {}
        lock = threading.Lock()
        assert _get_cached(cache, lock, "NONEXIST") is None

    def test_fresh_entry_returned(self):
        cache = {}
        lock = threading.Lock()

        cache["AAPL"] = {
            "data": {"price": 200.0},
            "expires": datetime.now() + timedelta(minutes=10),
        }
        result = _get_cached(cache, lock, "AAPL")
        assert result == {"price": 200.0}


# ===========================================================================
# TestFindSupportResistance
# ===========================================================================


class TestFindSupportResistance:
    """Tests for _find_support_resistance()."""

    @pytest.fixture
    def sample_ohlcv(self):
        """Create a simple OHLCV list of dicts with clear swing highs/lows."""
        np.random.seed(42)
        n = 60
        # Create a sine wave pattern for clear swing points
        t = np.linspace(0, 4 * np.pi, n)
        base = 100 + 10 * np.sin(t)
        ohlcv = []
        for i in range(n):
            ohlcv.append({
                "date": "2025-01-%02d" % (i + 1) if i < 28 else "2025-02-%02d" % (i - 27),
                "open": float(base[i] - 0.5),
                "high": float(base[i] + 2),
                "low": float(base[i] - 2),
                "close": float(base[i] + 0.5),
                "volume": int(np.random.randint(1000000, 5000000)),
            })
        return ohlcv

    def test_returns_dict(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        assert isinstance(result, dict)

    def test_contains_current_price(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        assert "current_price" in result

    def test_insufficient_data_returns_empty(self):
        """Data shorter than 2*window returns empty dict."""
        ohlcv = [
            {"date": "2025-01-01", "open": 100, "high": 102, "low": 98, "close": 101, "volume": 100},
            {"date": "2025-01-02", "open": 101, "high": 103, "low": 99, "close": 102, "volume": 100},
        ]
        result = _find_support_resistance(ohlcv, window=10)
        assert result == {}

    def test_support_below_price(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        current = result.get("current_price", 0)
        if "support_1" in result:
            assert result["support_1"] < current

    def test_resistance_above_price(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        current = result.get("current_price", 0)
        if "resistance_1" in result:
            assert result["resistance_1"] > current


# ===========================================================================
# TestComputeMACD
# ===========================================================================


class TestComputeMACD:
    """Tests for _compute_macd()."""

    @pytest.fixture
    def ema_series(self):
        """Create synthetic EMA 12 and EMA 26 series."""
        dates = ["2025-01-%02d" % (i + 1) for i in range(28)]
        ema_12 = [{"date": d, "value": 100 + i * 0.5} for i, d in enumerate(dates)]
        ema_26 = [{"date": d, "value": 99 + i * 0.3} for i, d in enumerate(dates)]
        return ema_12, ema_26

    def test_returns_list(self, ema_series):
        ema_12, ema_26 = ema_series
        result = _compute_macd(ema_12, ema_26)
        assert isinstance(result, list)

    def test_result_has_macd_signal_histogram(self, ema_series):
        ema_12, ema_26 = ema_series
        result = _compute_macd(ema_12, ema_26)
        assert len(result) > 0
        entry = result[0]
        assert "macd" in entry
        assert "signal" in entry
        assert "histogram" in entry
        assert "date" in entry

    def test_empty_input_returns_empty(self):
        assert _compute_macd([], []) == []

    def test_macd_equals_ema12_minus_ema26(self, ema_series):
        ema_12, ema_26 = ema_series
        result = _compute_macd(ema_12, ema_26)
        # First entry: MACD should equal EMA(12) - EMA(26)
        expected_macd = ema_12[0]["value"] - ema_26[0]["value"]
        assert abs(result[0]["macd"] - expected_macd) < 0.01


# ===========================================================================
# TestComputeBollingerBands
# ===========================================================================


class TestComputeBollingerBands:
    """Tests for _compute_bollinger_bands()."""

    @pytest.fixture
    def sample_ohlcv(self):
        n = 40
        return [
            {
                "date": "2025-01-%02d" % (i + 1) if i < 28 else "2025-02-%02d" % (i - 27),
                "open": 100 + i * 0.1,
                "high": 101 + i * 0.1,
                "low": 99 + i * 0.1,
                "close": 100.5 + i * 0.1,
                "volume": 1000000,
            }
            for i in range(n)
        ]

    def test_returns_list(self, sample_ohlcv):
        result = _compute_bollinger_bands(sample_ohlcv, period=20)
        assert isinstance(result, list)

    def test_upper_above_middle_above_lower(self, sample_ohlcv):
        result = _compute_bollinger_bands(sample_ohlcv, period=20)
        for entry in result:
            assert entry["upper"] >= entry["middle"]
            assert entry["middle"] >= entry["lower"]

    def test_insufficient_data_returns_empty(self):
        ohlcv = [{"date": "2025-01-01", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 100}]
        result = _compute_bollinger_bands(ohlcv, period=20)
        assert result == []


# ===========================================================================
# TestAggregateToWeekly
# ===========================================================================


class TestAggregateToWeekly:
    """Tests for _aggregate_to_weekly()."""

    def test_aggregation_produces_fewer_rows(self):
        # 10 trading days -> 2 weeks
        ohlcv = [
            {
                "date": "2025-01-%02d" % (d + 6),
                "open": 100.0 + d,
                "high": 102.0 + d,
                "low": 98.0 + d,
                "close": 101.0 + d,
                "volume": 1000000,
            }
            for d in range(10)
        ]
        result = _aggregate_to_weekly(ohlcv)
        assert len(result) <= 3  # At most 3 weeks from 10 consecutive days

    def test_empty_input(self):
        assert _aggregate_to_weekly([]) == []

    def test_weekly_has_required_fields(self):
        ohlcv = [
            {"date": "2025-01-06", "open": 100, "high": 105, "low": 95, "close": 102, "volume": 1000},
            {"date": "2025-01-07", "open": 102, "high": 108, "low": 101, "close": 106, "volume": 2000},
        ]
        result = _aggregate_to_weekly(ohlcv)
        assert len(result) > 0
        entry = result[0]
        for key in ["date", "open", "high", "low", "close", "volume"]:
            assert key in entry


# ===========================================================================
# TestComputeTrendSummary
# ===========================================================================


class TestComputeTrendSummary:
    """Tests for _compute_trend_summary()."""

    @pytest.fixture
    def indicators_and_ohlcv(self):
        n = 25
        dates = ["2025-01-%02d" % (i + 1) for i in range(n)]
        rsi = [{"date": d, "value": 50 + i * 0.5} for i, d in enumerate(dates)]
        macd = [
            {"date": d, "macd": 1.0 + i * 0.1, "signal": 0.8 + i * 0.08, "histogram": 0.2 + i * 0.02}
            for i, d in enumerate(dates)
        ]
        ohlcv = [
            {
                "date": d,
                "open": 100 + i * 0.5,
                "high": 101 + i * 0.5,
                "low": 99 + i * 0.5,
                "close": 100.5 + i * 0.5,
                "volume": 1000000 + i * 10000,
            }
            for i, d in enumerate(dates)
        ]
        indicators = {"rsi_14": rsi, "macd": macd}
        return indicators, ohlcv

    def test_returns_dict(self, indicators_and_ohlcv):
        indicators, ohlcv = indicators_and_ohlcv
        result = _compute_trend_summary(indicators, ohlcv, lookback=20)
        assert isinstance(result, dict)

    def test_contains_expected_keys(self, indicators_and_ohlcv):
        indicators, ohlcv = indicators_and_ohlcv
        result = _compute_trend_summary(indicators, ohlcv, lookback=20)
        assert "rsi_20d_ago" in result
        assert "rsi_direction" in result
        assert "macd_histogram_direction" in result
        assert "price_change_5d" in result
        assert "price_change_20d" in result
        assert "volume_vs_avg" in result


# ===========================================================================
# TestComputeDerivedSignals
# ===========================================================================


class TestComputeDerivedSignals:
    """Tests for _compute_derived_signals()."""

    def test_bullish_alignment(self):
        current = {"price": 110, "sma_20": 105, "sma_50": 100, "sma_200": 90, "rsi_14": 55, "adx_14": 30, "bb_upper": 115, "bb_lower": 95}
        ohlcv = [{"date": "2025-01-%02d" % (i + 1), "close": 100 + i, "volume": 1000000} for i in range(25)]
        result = _compute_derived_signals(current, ohlcv, {}, [])
        assert result["ma_alignment"] == "bullish"

    def test_bearish_alignment(self):
        current = {"price": 80, "sma_20": 85, "sma_50": 90, "sma_200": 100, "rsi_14": 40, "adx_14": 20, "bb_upper": 95, "bb_lower": 75}
        ohlcv = [{"date": "2025-01-%02d" % (i + 1), "close": 80, "volume": 1000000} for i in range(25)]
        result = _compute_derived_signals(current, ohlcv, {}, [])
        assert result["ma_alignment"] == "bearish"

    def test_overbought_rsi(self):
        current = {"price": 110, "sma_20": 105, "sma_50": 100, "sma_200": 90, "rsi_14": 75, "adx_14": 25, "bb_upper": 115, "bb_lower": 95}
        result = _compute_derived_signals(current, [], {}, [])
        assert result["rsi_zone"] == "overbought"

    def test_oversold_rsi(self):
        current = {"price": 80, "sma_20": 85, "sma_50": 90, "sma_200": 100, "rsi_14": 25, "adx_14": 25, "bb_upper": 95, "bb_lower": 75}
        result = _compute_derived_signals(current, [], {}, [])
        assert result["rsi_zone"] == "oversold"
