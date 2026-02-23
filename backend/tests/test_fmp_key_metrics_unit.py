"""
FMPService.get_key_metrics_ttm Unit Tests

Tests for the refactored get_key_metrics_ttm in app/shared/fmp_service.py.
Covers: TTM endpoint priority, annual fallback, _extract_first helper,
dividend yield conversion, error handling.

All FMP API calls are mocked. No network access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_fmp_key_metrics_unit.py -v
"""

import pytest
from unittest.mock import patch, MagicMock

from app.shared.fmp_service import FMPService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def service():
    """FMPService instance with mocked API key."""
    with patch.dict("os.environ", {"FMP_API_KEY": "test_key"}):
        svc = FMPService.__new__(FMPService)
        svc.api_key = "test_key"
        svc.base_url = "https://financialmodelingprep.com/api"
        return svc


@pytest.fixture
def ttm_ratios():
    """Sample TTM ratios response from /stable/ratios-ttm."""
    return [{
        "priceToEarningsRatioTTM": 30.5,
        "priceToBookRatioTTM": 45.2,
        "priceToSalesRatioTTM": 7.8,
        "priceToEarningsGrowthRatioTTM": 2.1,
        "grossProfitMarginTTM": 0.4618,
        "operatingProfitMarginTTM": 0.3102,
        "netProfitMarginTTM": 0.2397,
        "currentRatioTTM": 1.07,
        "quickRatioTTM": 1.04,
        "dividendYieldTTM": 0.005,  # 0.5% as decimal
    }]


@pytest.fixture
def ttm_key_metrics():
    """Sample TTM key-metrics response from /stable/key-metrics-ttm."""
    return [{
        "evToEBITDATTM": 24.7,
        "evToSalesTTM": 8.5,
        "returnOnEquityTTM": 1.6,
        "returnOnAssetsTTM": 0.22,
        "returnOnInvestedCapitalTTM": 0.55,
    }]


@pytest.fixture
def annual_ratios():
    """Sample annual ratios response from /stable/ratios."""
    return [{
        "priceToEarningsRatio": 29.0,
        "priceToBookRatio": 42.0,
        "priceToSalesRatio": 7.2,
        "priceToEarningsGrowthRatio": 1.9,
        "grossProfitMargin": 0.45,
        "operatingProfitMargin": 0.30,
        "netProfitMargin": 0.23,
        "currentRatio": 1.1,
        "quickRatio": 1.05,
        "dividendYieldPercentage": 0.5,
    }]


@pytest.fixture
def annual_key_metrics():
    """Sample annual key-metrics response from /stable/key-metrics."""
    return [{
        "evToEBITDA": 23.5,
        "evToSales": 8.0,
        "returnOnEquity": 1.5,
        "returnOnAssets": 0.20,
        "returnOnInvestedCapital": 0.50,
    }]


# ===========================================================================
# TestGetKeyMetricsTTM
# ===========================================================================


class TestGetKeyMetricsTTM:
    """Tests for FMPService.get_key_metrics_ttm."""

    def test_ttm_success(self, service, ttm_ratios, ttm_key_metrics):
        """TTM endpoints return data, annual endpoints not called."""
        call_count = 0

        def mock_request(path, params):
            nonlocal call_count
            call_count += 1
            if path == "/stable/ratios-ttm":
                return ttm_ratios
            if path == "/stable/key-metrics-ttm":
                return ttm_key_metrics
            # Annual endpoints should NOT be reached
            raise AssertionError(f"Unexpected request: {path}")

        service._request = mock_request

        result = service.get_key_metrics_ttm("AAPL")

        assert result["status"] == "success"
        assert result["source"] == "fmp_ttm"
        assert result["symbol"] == "AAPL"
        assert call_count == 2  # Only TTM endpoints called

        m = result["metrics"]
        assert m["pe_ratio"] == 30.5
        assert m["pb_ratio"] == 45.2
        assert m["ps_ratio"] == 7.8
        assert m["ev_to_ebitda"] == 24.7
        assert m["roe"] == 1.6
        assert m["roic"] == 0.55

    def test_ttm_dividend_yield_conversion(self, service, ttm_ratios, ttm_key_metrics):
        """TTM dividend yield is converted from decimal to percentage."""
        service._request = lambda path, params: (
            ttm_ratios if "ratios" in path else ttm_key_metrics
        )

        result = service.get_key_metrics_ttm("AAPL")

        # 0.005 * 100 = 0.5 (percentage)
        assert result["metrics"]["dividend_yield"] == 0.5

    def test_fallback_to_annual(self, service, annual_ratios, annual_key_metrics):
        """TTM endpoints empty, falls back to annual endpoints."""
        call_paths = []

        def mock_request(path, params):
            call_paths.append(path)
            if path == "/stable/ratios-ttm":
                return []  # Empty TTM
            if path == "/stable/key-metrics-ttm":
                return []  # Empty TTM
            if path == "/stable/ratios":
                return annual_ratios
            if path == "/stable/key-metrics":
                return annual_key_metrics
            return None

        service._request = mock_request

        result = service.get_key_metrics_ttm("XYZ")

        assert result["status"] == "success"
        assert result["source"] == "fmp_annual"
        assert len(call_paths) == 4  # All 4 endpoints called

        m = result["metrics"]
        assert m["pe_ratio"] == 29.0
        assert m["ev_to_ebitda"] == 23.5
        assert m["dividend_yield"] == 0.5  # Already in percentage from annual

    def test_both_empty_returns_error(self, service):
        """All endpoints return empty, returns error status."""
        service._request = lambda path, params: []

        result = service.get_key_metrics_ttm("FAKE")

        assert result["status"] == "error"
        assert result["symbol"] == "FAKE"
        assert "error" in result

    def test_ttm_ratios_only(self, service, ttm_ratios):
        """TTM ratios available but key-metrics empty."""
        def mock_request(path, params):
            if path == "/stable/ratios-ttm":
                return ttm_ratios
            return []

        service._request = mock_request

        result = service.get_key_metrics_ttm("AAPL")

        assert result["status"] == "success"
        assert result["source"] == "fmp_ttm"
        assert result["metrics"]["pe_ratio"] == 30.5
        # Missing key-metrics fields
        assert result["metrics"]["ev_to_ebitda"] is None
        assert result["metrics"]["roe"] is None

    def test_ttm_key_metrics_only(self, service, ttm_key_metrics):
        """TTM key-metrics available but ratios empty."""
        def mock_request(path, params):
            if path == "/stable/key-metrics-ttm":
                return ttm_key_metrics
            if path == "/stable/ratios-ttm":
                return []
            return []

        service._request = mock_request

        result = service.get_key_metrics_ttm("AAPL")

        assert result["status"] == "success"
        assert result["source"] == "fmp_ttm"
        assert result["metrics"]["ev_to_ebitda"] == 24.7
        # Missing ratios fields
        assert result["metrics"]["pe_ratio"] is None

    def test_ttm_data_as_dict(self, service):
        """TTM data returned as dict (not list) is handled by _extract_first."""
        ttm_dict = {
            "priceToEarningsRatioTTM": 25.0,
            "dividendYieldTTM": 0.01,
        }

        def mock_request(path, params):
            if path == "/stable/ratios-ttm":
                return ttm_dict
            return {}

        service._request = mock_request

        result = service.get_key_metrics_ttm("DICT")

        assert result["status"] == "success"
        assert result["metrics"]["pe_ratio"] == 25.0
        # 0.01 * 100 = 1.0
        assert result["metrics"]["dividend_yield"] == 1.0

    def test_ttm_none_response(self, service, annual_ratios, annual_key_metrics):
        """TTM endpoints return None (not empty list), falls back to annual."""
        def mock_request(path, params):
            if "ttm" in path:
                return None
            if path == "/stable/ratios":
                return annual_ratios
            if path == "/stable/key-metrics":
                return annual_key_metrics
            return None

        service._request = mock_request

        result = service.get_key_metrics_ttm("NULL")

        assert result["status"] == "success"
        assert result["source"] == "fmp_annual"

    def test_null_dividend_yield_not_converted(self, service):
        """None dividend yield is not converted (no crash)."""
        ttm_data = [{"priceToEarningsRatioTTM": 20.0}]

        def mock_request(path, params):
            if path == "/stable/ratios-ttm":
                return ttm_data
            return []

        service._request = mock_request

        result = service.get_key_metrics_ttm("NODIV")

        assert result["metrics"]["dividend_yield"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
