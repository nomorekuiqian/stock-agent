"""
YFinanceService.get_ticker_metrics Unit Tests

Tests for the new get_ticker_metrics method in app/shared/yfinance_service.py.
All yfinance API calls are mocked. No network access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_yfinance_ticker_metrics_unit.py -v
"""

import pytest
from unittest.mock import patch, MagicMock

from app.shared.yfinance_service import YFinanceService, _yf_ticker_info_cache


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear ticker info cache before each test."""
    _yf_ticker_info_cache.clear()
    yield
    _yf_ticker_info_cache.clear()


@pytest.fixture
def service():
    """YFinanceService instance."""
    return YFinanceService()


@pytest.fixture
def full_ticker_info():
    """Realistic yf.Ticker().info data (AAPL-like)."""
    return {
        # TTM
        "totalRevenue": 391_035_000_000,
        "netIncomeToCommon": 93_736_000_000,
        "trailingEps": 6.13,
        "ebitda": 123_000_000_000,
        "operatingCashflow": 110_543_000_000,
        "freeCashflow": 84_726_000_000,
        # Valuation
        "trailingPE": 30.5,
        "priceToSalesTrailing12Months": 7.8,
        "priceToBook": 45.2,
        "enterpriseToEbitda": 24.7,
        "trailingAnnualDividendYield": 0.0039,
        "trailingPegRatio": 2.1,
        # Forward
        "forwardPE": 28.0,
        "forwardEps": 7.5,
        # Profitability
        "grossMargins": 0.4618,
        "operatingMargins": 0.3102,
        "profitMargins": 0.2397,
        "returnOnEquity": 1.6,
        "returnOnAssets": 0.22,
        # Growth
        "revenueGrowth": 0.05,
        "earningsQuarterlyGrowth": 0.12,
        # Balance Sheet
        "currentRatio": 1.04,
        "quickRatio": 0.95,
        "debtToEquity": 181.32,
        "totalDebt": 108_040_000_000,
        "totalCash": 29_965_000_000,
        # Market Data
        "beta": 1.24,
        "shortRatio": 1.87,
        "heldPercentInsiders": 0.0007,
        "heldPercentInstitutions": 0.6127,
    }


@pytest.fixture
def minimal_ticker_info():
    """Ticker info with only price and revenue (no valuation/growth)."""
    return {
        "totalRevenue": 50_000_000_000,
        "trailingEps": 3.0,
    }


# ===========================================================================
# TestGetTickerMetrics
# ===========================================================================


class TestGetTickerMetrics:
    """Tests for YFinanceService.get_ticker_metrics."""

    @patch("app.shared.yfinance_service.yf")
    def test_full_data(self, mock_yf, service, full_ticker_info):
        """All metrics extracted correctly from complete ticker info."""
        mock_ticker = MagicMock()
        mock_ticker.info = full_ticker_info
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("AAPL")

        assert result["source"] == "yfinance"

        # TTM
        assert result["ttm"]["revenue"] == 391_035_000_000
        assert result["ttm"]["net_income"] == 93_736_000_000
        assert result["ttm"]["eps"] == 6.13
        assert result["ttm"]["ebitda"] == 123_000_000_000

        # Valuation
        assert result["valuation"]["pe"] == 30.5
        assert result["valuation"]["ps"] == 7.8
        assert result["valuation"]["pb"] == 45.2
        assert result["valuation"]["ev_to_ebitda"] == 24.7
        assert result["valuation"]["dividend_yield"] == 0.39  # 0.0039 * 100 (displayed as %)
        assert result["valuation"]["peg"] == 2.1
        assert result["valuation"]["forward_pe"] == 28.0

        # Forward
        assert result["forward"]["forward_eps"] == 7.5
        assert result["forward"]["trailing_eps"] == 6.13

        # Profitability
        assert result["profitability"]["gross_margin"] == 0.4618
        assert result["profitability"]["operating_margin"] == 0.3102
        assert result["profitability"]["net_margin"] == 0.2397
        assert result["profitability"]["roe"] == 1.6
        assert result["profitability"]["roa"] == 0.22

        # Growth
        assert result["growth"]["revenue_yoy"] == 0.05
        assert result["growth"]["earnings_yoy"] == 0.12

        # Balance Sheet (new)
        assert result["balance_sheet"]["current_ratio"] == 1.04
        assert result["balance_sheet"]["quick_ratio"] == 0.95
        assert result["balance_sheet"]["debt_to_equity"] == 181.32
        assert result["balance_sheet"]["total_debt"] == 108_040_000_000
        assert result["balance_sheet"]["total_cash"] == 29_965_000_000

        # Market Data (new)
        assert result["market_data"]["beta"] == 1.24
        assert result["market_data"]["short_ratio"] == 1.87
        assert result["market_data"]["insider_ownership"] == 0.0007
        assert result["market_data"]["institutional_ownership"] == 0.6127

    @patch("app.shared.yfinance_service.yf")
    def test_minimal_data(self, mock_yf, service, minimal_ticker_info):
        """Missing fields result in empty sub-dicts, not errors."""
        mock_ticker = MagicMock()
        mock_ticker.info = minimal_ticker_info
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("XYZ")

        assert result["ttm"]["revenue"] == 50_000_000_000
        assert result["ttm"]["eps"] == 3.0
        # No valuation data (trailingPE not in info)
        assert result["valuation"] == {}
        # No growth data
        assert result["growth"] == {}
        # Profitability empty
        assert result["profitability"] == {}
        # Balance sheet and market data empty
        assert result["balance_sheet"] == {}
        assert result["market_data"] == {}

    @patch("app.shared.yfinance_service.yf")
    def test_negative_pe_excluded(self, mock_yf, service):
        """Negative P/E is excluded via _positive_or_none."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"trailingPE": -5.0, "priceToBook": 3.0}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("LOSS")

        assert "pe" not in result["valuation"]
        assert result["valuation"]["pb"] == 3.0

    @patch("app.shared.yfinance_service.yf")
    def test_negative_ev_to_ebitda_excluded(self, mock_yf, service):
        """Negative EV/EBITDA excluded via _positive_or_none."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"enterpriseToEbitda": -10.0, "trailingPE": 25.0}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("NEG")

        assert "ev_to_ebitda" not in result["valuation"]
        assert result["valuation"]["pe"] == 25.0

    @patch("app.shared.yfinance_service.yf")
    def test_api_exception_returns_empty(self, mock_yf, service):
        """yfinance exception returns safe empty structure."""
        mock_yf.Ticker.side_effect = Exception("Network timeout")

        result = service.get_ticker_metrics("ERR")

        assert result["source"] == "yfinance"
        assert result["ttm"] == {}
        assert result["valuation"] == {}
        assert result["forward"] == {}
        assert result["profitability"] == {}
        assert result["growth"] == {}
        assert result["balance_sheet"] == {}
        assert result["market_data"] == {}

    @patch("app.shared.yfinance_service.yf")
    def test_cache_hit(self, mock_yf, service, full_ticker_info):
        """Second call returns cached data without API call."""
        mock_ticker = MagicMock()
        mock_ticker.info = full_ticker_info
        mock_yf.Ticker.return_value = mock_ticker

        # First call fetches
        result1 = service.get_ticker_metrics("AAPL")
        assert mock_yf.Ticker.call_count == 1

        # Second call uses cache
        result2 = service.get_ticker_metrics("AAPL")
        assert mock_yf.Ticker.call_count == 1  # Not called again
        assert result1 == result2

    @patch("app.shared.yfinance_service.yf")
    def test_symbol_uppercased(self, mock_yf, service):
        """Lowercase symbol is uppercased before fetch."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"totalRevenue": 100}
        mock_yf.Ticker.return_value = mock_ticker

        service.get_ticker_metrics("aapl")

        mock_yf.Ticker.assert_called_once_with("AAPL")

    @patch("app.shared.yfinance_service.yf")
    def test_empty_info(self, mock_yf, service):
        """Empty info dict returns structure with None/empty values."""
        mock_ticker = MagicMock()
        mock_ticker.info = {}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("EMPTY")

        assert result["source"] == "yfinance"
        assert result["ttm"]["revenue"] is None
        assert result["ttm"]["eps"] is None
        assert result["valuation"] == {}
        assert result["profitability"] == {}
        assert result["growth"] == {}

    @patch("app.shared.yfinance_service.yf")
    def test_forward_pe_in_valuation(self, mock_yf, service):
        """forward_pe is extracted into valuation dict."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"forwardPE": 28.0, "forwardEps": 5.0, "trailingEps": 4.0}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("TEST")

        assert result["valuation"]["forward_pe"] == 28.0
        assert result["forward"]["forward_eps"] == 5.0
        assert result["forward"]["trailing_eps"] == 4.0

    @patch("app.shared.yfinance_service.yf")
    def test_negative_forward_pe_excluded(self, mock_yf, service):
        """Negative forward_pe is excluded (company expects losses)."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"forwardPE": -15.0, "forwardEps": -2.0, "trailingEps": -1.0}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("TEST")

        assert "forward_pe" not in result["valuation"]


class TestBalanceSheetExtraction:
    """Tests for balance_sheet field extraction in get_ticker_metrics."""

    @patch("app.shared.yfinance_service.yf")
    def test_partial_balance_sheet(self, mock_yf, service):
        """Only available balance sheet fields are extracted."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"currentRatio": 2.5, "totalCash": 1_000_000}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("PARTIAL")

        assert result["balance_sheet"]["current_ratio"] == 2.5
        assert result["balance_sheet"]["total_cash"] == 1_000_000
        assert "quick_ratio" not in result["balance_sheet"]
        assert "debt_to_equity" not in result["balance_sheet"]


class TestMarketDataExtraction:
    """Tests for market_data field extraction in get_ticker_metrics."""

    @patch("app.shared.yfinance_service.yf")
    def test_partial_market_data(self, mock_yf, service):
        """Only available market data fields are extracted."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"beta": 0.85, "heldPercentInstitutions": 0.75}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("STABLE")

        assert result["market_data"]["beta"] == 0.85
        assert result["market_data"]["institutional_ownership"] == 0.75
        assert "short_ratio" not in result["market_data"]
        assert "insider_ownership" not in result["market_data"]

    @patch("app.shared.yfinance_service.yf")
    def test_none_values_excluded(self, mock_yf, service):
        """None values from yfinance are not included in output."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"beta": None, "shortRatio": 2.5}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("NONE")

        assert "beta" not in result["market_data"]
        assert result["market_data"]["short_ratio"] == 2.5


class TestDividendYieldSource:
    """Tests for dividend_yield using trailingAnnualDividendYield."""

    @patch("app.shared.yfinance_service.yf")
    def test_trailing_annual_dividend_yield(self, mock_yf, service):
        """trailingAnnualDividendYield is used for dividend_yield."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"trailingAnnualDividendYield": 0.02}
        mock_yf.Ticker.return_value = mock_ticker

        result = service.get_ticker_metrics("DIV")

        assert result["valuation"]["dividend_yield"] == 2.0  # 0.02 * 100


class TestCacheStats:
    """Tests for updated cache_stats method."""

    def test_dual_cache_stats(self, service):
        """cache_stats returns both quotes and ticker_info stats."""
        stats = service.cache_stats()
        assert "quotes" in stats
        assert "ticker_info" in stats
        assert "total_entries" in stats["quotes"]
        assert "total_entries" in stats["ticker_info"]


class TestClearCache:
    """Tests for updated clear_cache method."""

    @patch("app.shared.yfinance_service.yf")
    def test_clear_removes_ticker_cache(self, mock_yf, service, full_ticker_info):
        """clear_cache removes ticker info cache entries."""
        mock_ticker = MagicMock()
        mock_ticker.info = full_ticker_info
        mock_yf.Ticker.return_value = mock_ticker

        service.get_ticker_metrics("AAPL")
        assert _yf_ticker_info_cache.get("AAPL") is not None

        service.clear_cache()
        assert _yf_ticker_info_cache.get("AAPL") is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
