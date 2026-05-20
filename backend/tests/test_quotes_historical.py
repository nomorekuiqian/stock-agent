"""Tests for get_historical_returns_batch."""

from unittest.mock import MagicMock, patch

import pytest

from app.shared.data_tools.quotes import get_historical_returns_batch


def _make_fmp_response(closes: list[float]) -> dict:
    """Build a fake FMP historical price response (newest first)."""
    data = [
        {"date": f"2025-01-{len(closes)-i:02d}", "close": c}
        for i, c in enumerate(closes)
    ]
    return {"status": "success", "data": data}


@pytest.fixture
def mock_fmp():
    with patch("app.shared.fmp_service.get_fmp_service") as m:
        fmp = MagicMock()
        m.return_value = fmp
        yield fmp


class TestHistoricalReturnsBatch:
    def test_basic_return_calculation(self, mock_fmp):
        """Returns computed correctly from close prices."""
        # Chronological closes: 100, 110, 105 -> returns: +10%, -4.545%
        # FMP returns newest first: [105, 110, 100]
        mock_fmp.get_historical_price.return_value = _make_fmp_response(
            [105.0, 110.0, 100.0]
        )

        result = get_historical_returns_batch(["AAPL"], days=7)

        assert "AAPL" in result
        rets = result["AAPL"]
        assert len(rets) == 2
        assert abs(rets[0] - (-5 / 110)) < 1e-9  # newest: 105/110 - 1
        assert abs(rets[1] - (10 / 100)) < 1e-9  # older: 110/100 - 1

    def test_cash_returns_zeros(self, mock_fmp):
        """$CASH returns list of zeros without calling FMP."""
        result = get_historical_returns_batch(["$CASH"], days=5)
        assert result["$CASH"] == [0.0] * 5
        mock_fmp.get_historical_price.assert_not_called()

    def test_missing_symbol_returns_empty(self, mock_fmp):
        """Symbols with no data get empty list."""
        mock_fmp.get_historical_price.return_value = {
            "status": "success",
            "data": [],
        }

        result = get_historical_returns_batch(["FAKE"], days=7)
        assert result["FAKE"] == []

    def test_days_parameter_trims_output(self, mock_fmp):
        """Output trimmed to requested number of days."""
        closes = [100 + i for i in range(15)]  # 15 close prices, newest first
        mock_fmp.get_historical_price.return_value = _make_fmp_response(closes)

        result = get_historical_returns_batch(["AAPL"], days=5)
        assert len(result["AAPL"]) == 5

    def test_zero_close_filtered(self, mock_fmp):
        """Zero close prices are filtered out."""
        mock_fmp.get_historical_price.return_value = _make_fmp_response(
            [105.0, 0.0, 100.0]
        )

        result = get_historical_returns_batch(["AAPL"], days=7)
        rets = result["AAPL"]
        assert len(rets) == 1  # only 2 valid closes -> 1 return
        assert abs(rets[0] - (105 / 100 - 1)) < 1e-9

    def test_single_close_returns_empty(self, mock_fmp):
        """Need at least 2 close prices for 1 return."""
        mock_fmp.get_historical_price.return_value = _make_fmp_response(
            [100.0]
        )

        result = get_historical_returns_batch(["AAPL"], days=7)
        assert result["AAPL"] == []

    def test_fmp_exception_returns_empty(self, mock_fmp):
        """FMP errors produce empty list, don't crash."""
        mock_fmp.get_historical_price.side_effect = Exception("API down")

        result = get_historical_returns_batch(["AAPL"], days=7)
        assert result["AAPL"] == []

    def test_multiple_symbols(self, mock_fmp):
        """Multiple symbols fetched independently."""

        def side_effect(sym, limit):
            if sym == "AAPL":
                return _make_fmp_response([110.0, 100.0])
            return _make_fmp_response([55.0, 50.0])

        mock_fmp.get_historical_price.side_effect = side_effect

        result = get_historical_returns_batch(["AAPL", "GOOG"], days=7)
        assert len(result) == 2
        assert abs(result["AAPL"][0] - 0.1) < 1e-9  # 110/100 - 1
        assert abs(result["GOOG"][0] - 0.1) < 1e-9  # 55/50 - 1
