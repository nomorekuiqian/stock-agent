"""
Technical Data Tools Unit Tests -- generated from git diff

Tests for: detect_exchange, _rating_to_label, _direction, _get_cached,
_set_cached, _find_support_resistance

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
    _direction,
    _get_cached,
    _rating_to_label,
    _set_cached,
    _find_support_resistance,
    detect_exchange,
)


# ===========================================================================
# TestDetectExchange
# ===========================================================================


class TestDetectExchange:
    """Tests for detect_exchange()."""

    def test_known_nyse_stock(self):
        """Known NYSE stock returns NYSE."""
        assert detect_exchange("JPM") == "NYSE"
        assert detect_exchange("GS") == "NYSE"
        assert detect_exchange("DIS") == "NYSE"

    def test_known_nasdaq_stock(self):
        """Known NASDAQ stock returns NASDAQ."""
        assert detect_exchange("AAPL") == "NASDAQ"
        assert detect_exchange("MSFT") == "NASDAQ"
        assert detect_exchange("NVDA") == "NASDAQ"

    def test_case_insensitive(self):
        """Lowercased input is uppercased internally."""
        assert detect_exchange("aapl") == "NASDAQ"
        assert detect_exchange("jpm") == "NYSE"

    def test_unknown_stock_defaults_nasdaq(self):
        """Unknown symbol defaults to NASDAQ."""
        assert detect_exchange("ZZZZ") == "NASDAQ"

    def test_brk_dot_b(self):
        """BRK.B with dot in symbol resolves correctly."""
        assert detect_exchange("BRK.B") == "NYSE"


# ===========================================================================
# TestRatingToLabel
# ===========================================================================


class TestRatingToLabel:
    """Tests for _rating_to_label()."""

    def test_strong_buy(self):
        assert _rating_to_label(0.8) == "STRONG_BUY"
        assert _rating_to_label(0.5) == "STRONG_BUY"

    def test_buy(self):
        assert _rating_to_label(0.3) == "BUY"
        assert _rating_to_label(0.1) == "BUY"

    def test_neutral(self):
        assert _rating_to_label(0.0) == "NEUTRAL"
        assert _rating_to_label(0.05) == "NEUTRAL"
        assert _rating_to_label(-0.05) == "NEUTRAL"

    def test_sell(self):
        assert _rating_to_label(-0.3) == "SELL"
        assert _rating_to_label(-0.1) == "SELL"

    def test_strong_sell(self):
        assert _rating_to_label(-0.8) == "STRONG_SELL"
        assert _rating_to_label(-0.5) == "STRONG_SELL"

    def test_none_returns_neutral(self):
        assert _rating_to_label(None) == "NEUTRAL"

    def test_nan_returns_neutral(self):
        assert _rating_to_label(float("nan")) == "NEUTRAL"


# ===========================================================================
# TestDirection
# ===========================================================================


class TestDirection:
    """Tests for _direction()."""

    def test_rising(self):
        assert _direction(105, 100) == "rising"

    def test_declining(self):
        assert _direction(95, 100) == "declining"

    def test_flat_within_threshold(self):
        assert _direction(101, 100) == "flat"
        assert _direction(99, 100) == "flat"

    def test_zero_previous_returns_flat(self):
        assert _direction(10, 0) == "flat"

    def test_custom_threshold(self):
        # 1% change with 5% threshold -> flat
        assert _direction(101, 100, threshold=0.05) == "flat"
        # 6% change with 5% threshold -> rising
        assert _direction(106, 100, threshold=0.05) == "rising"


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
        """Create a simple OHLCV DataFrame with clear swing highs/lows."""
        np.random.seed(42)
        n = 60
        # Create a sine wave pattern for clear swing points
        t = np.linspace(0, 4 * np.pi, n)
        base = 100 + 10 * np.sin(t)
        df = pd.DataFrame({
            "Open": base - 0.5,
            "High": base + 2,
            "Low": base - 2,
            "Close": base + 0.5,
            "Volume": np.random.randint(1000000, 5000000, n),
        })
        return df

    def test_returns_dict(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        assert isinstance(result, dict)

    def test_contains_current_price(self, sample_ohlcv):
        result = _find_support_resistance(sample_ohlcv)
        assert "current_price" in result

    def test_insufficient_data_returns_empty(self):
        """DataFrame shorter than 2*window returns empty dict."""
        df = pd.DataFrame({
            "Open": [100, 101],
            "High": [102, 103],
            "Low": [98, 99],
            "Close": [101, 102],
        })
        result = _find_support_resistance(df, window=10)
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
