"""
StockService Unit Tests

Tests for pure logic functions in app/features/stock/service.py:
- _merge_financials
- _build_forward_valuation
- _build_growth
- _is_profile_fresh
- _has_recent_quarter

No network access, no database. All data is mocked.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from app.features.stock.service import StockService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def service():
    """Create StockService instance without singleton, mock openbb."""
    StockService._instance = None
    with patch("app.features.stock.service.get_openbb_service") as mock_openbb:
        mock_openbb.return_value = MagicMock()
        svc = StockService()
        yield svc
    StockService._instance = None


@pytest.fixture
def sample_income():
    """5 quarters of income statement data."""
    dates = ["2024-12-31", "2024-09-30", "2024-06-30", "2024-03-31", "2023-12-31"]
    return [
        {
            "date": d,
            "fiscal_year": 2024 if i < 4 else 2023,
            "fiscal_period": f"Q{4 - i}" if i < 4 else "Q4",
            "revenue": 30_000_000_000 - i * 2_000_000_000,
            "net_income": 10_000_000_000 - i * 1_000_000_000,
            "eps": 5.0 - i * 0.5,
            "ebitda": 15_000_000_000 - i * 1_000_000_000,
            "gross_profit": 20_000_000_000 - i * 1_000_000_000,
            "operating_income": 12_000_000_000 - i * 800_000_000,
        }
        for i, d in enumerate(dates)
    ]


@pytest.fixture
def sample_balance():
    """5 quarters of balance sheet data."""
    dates = ["2024-12-31", "2024-09-30", "2024-06-30", "2024-03-31", "2023-12-31"]
    return [
        {
            "date": d,
            "total_equity": 50_000_000_000 - i * 2_000_000_000,
            "total_assets": 100_000_000_000 - i * 3_000_000_000,
        }
        for i, d in enumerate(dates)
    ]


@pytest.fixture
def sample_cash():
    """5 quarters of cash flow data."""
    dates = ["2024-12-31", "2024-09-30", "2024-06-30", "2024-03-31", "2023-12-31"]
    return [
        {
            "date": d,
            "operating_cash_flow": 12_000_000_000 - i * 1_000_000_000,
            "free_cash_flow": 8_000_000_000 - i * 500_000_000,
        }
        for i, d in enumerate(dates)
    ]


@pytest.fixture
def sample_financials(sample_income, sample_balance, sample_cash, service):
    """Merged financials (5 quarters)."""
    return service._merge_financials(sample_income, sample_balance, sample_cash)


# ===========================================================================
# TestMergeFinancials
# ===========================================================================


class TestMergeFinancials:
    """Tests for StockService._merge_financials."""

    def test_normal_merge(self, service, sample_income, sample_balance, sample_cash):
        """3 statements merge correctly by date."""
        result = service._merge_financials(sample_income, sample_balance, sample_cash)
        assert len(result) == 5
        first = result[0]
        assert first["period"] == "2024-12-31"
        assert first["income_statement"]["revenue"] == 30_000_000_000
        assert first["balance_sheet"]["total_equity"] == 50_000_000_000
        assert first["cash_flow"]["operating_cash_flow"] == 12_000_000_000

    def test_missing_balance_sheet(self, service, sample_income, sample_cash):
        """Missing balance sheet results in empty dict for that field."""
        result = service._merge_financials(sample_income, [], sample_cash)
        assert len(result) == 5
        for item in result:
            assert item["balance_sheet"] == {}
            assert "cash_flow" in item

    def test_missing_cash_flow(self, service, sample_income, sample_balance):
        """Missing cash flow results in empty dict for that field."""
        result = service._merge_financials(sample_income, sample_balance, [])
        assert len(result) == 5
        for item in result:
            assert item["cash_flow"] == {}
            assert "balance_sheet" in item

    def test_empty_income(self, service):
        """Empty income returns empty list."""
        result = service._merge_financials([], [], [])
        assert result == []

    def test_date_mismatch(self, service, sample_income, sample_cash):
        """Balance sheet with different dates results in empty dict for missing dates."""
        balance = [{"date": "2099-01-01", "total_equity": 999}]
        result = service._merge_financials(sample_income, balance, sample_cash)
        assert len(result) == 5
        # First income date won't match balance
        assert result[0]["balance_sheet"] == {}
        # All existing income periods should have cash flow
        assert result[0]["cash_flow"]["operating_cash_flow"] == 12_000_000_000


# ===========================================================================
# TestBuildForwardValuation
# ===========================================================================


class TestBuildForwardValuation:
    """Tests for StockService._build_forward_valuation."""

    def test_normal(self, service):
        """Forward PE and implied EPS growth calculated correctly."""
        forward = {"forward_pe": 24.5, "forward_eps": 7.0, "trailing_eps": 5.0}
        result = service._build_forward_valuation(forward)
        assert result["forward_pe"] == 24.5
        assert result["implied_eps_growth"] == round((7.0 - 5.0) / 5.0, 4)

    def test_no_forward_pe(self, service):
        """Missing forward_pe returns empty dict."""
        forward = {"forward_pe": None, "forward_eps": 7.0, "trailing_eps": 5.0}
        assert service._build_forward_valuation(forward) == {}

    def test_empty_forward(self, service):
        """Empty dict returns empty dict."""
        assert service._build_forward_valuation({}) == {}

    def test_no_trailing_eps(self, service):
        """Missing trailing_eps skips implied_eps_growth."""
        forward = {"forward_pe": 24.5, "forward_eps": 7.0, "trailing_eps": None}
        result = service._build_forward_valuation(forward)
        assert result["forward_pe"] == 24.5
        assert "implied_eps_growth" not in result

    def test_trailing_eps_zero(self, service):
        """Trailing EPS = 0 skips implied_eps_growth (division by zero)."""
        forward = {"forward_pe": 24.5, "forward_eps": 7.0, "trailing_eps": 0}
        result = service._build_forward_valuation(forward)
        assert result["forward_pe"] == 24.5
        assert "implied_eps_growth" not in result

    def test_negative_trailing_eps(self, service):
        """Negative trailing EPS uses abs() for growth calc."""
        forward = {"forward_pe": 24.5, "forward_eps": 2.0, "trailing_eps": -1.0}
        result = service._build_forward_valuation(forward)
        # (2.0 - (-1.0)) / abs(-1.0) = 3.0
        assert result["implied_eps_growth"] == 3.0


# ===========================================================================
# TestBuildGrowth
# ===========================================================================


class TestBuildGrowth:
    """Tests for StockService._build_growth."""

    def test_yoy_only(self, service):
        """YoY from yfinance without financials."""
        yf_growth = {"revenue_yoy": 0.35, "earnings_yoy": 0.50}
        result = service._build_growth(yf_growth, [])
        assert result["revenue_yoy"] == 0.35
        assert result["net_income_yoy"] == 0.50
        assert "eps_yoy" not in result
        assert "revenue_qoq" not in result

    def test_qoq_from_financials(self, service, sample_financials):
        """QoQ calculated from financials when available."""
        yf_growth = {"revenue_yoy": 0.35}
        result = service._build_growth(yf_growth, sample_financials)
        # current_rev=30B, prev_rev=28B
        expected_qoq = round((30_000_000_000 - 28_000_000_000) / 28_000_000_000, 4)
        assert result["revenue_qoq"] == expected_qoq

    def test_empty_yf_growth(self, service, sample_financials):
        """Empty yfinance growth still calculates QoQ from financials."""
        result = service._build_growth({}, sample_financials)
        assert "revenue_yoy" not in result
        expected_qoq = round((30_000_000_000 - 28_000_000_000) / 28_000_000_000, 4)
        assert result["revenue_qoq"] == expected_qoq

    def test_no_data(self, service):
        """No yfinance growth and no financials returns empty dict."""
        result = service._build_growth({}, [])
        assert result == {}

    def test_prev_revenue_zero(self, service):
        """Previous quarter revenue = 0 skips QoQ."""
        financials = [
            {"income_statement": {"revenue": 1000}},
            {"income_statement": {"revenue": 0}},
        ]
        result = service._build_growth({}, financials)
        assert "revenue_qoq" not in result

    def test_single_quarter(self, service):
        """Single quarter financials skips QoQ."""
        financials = [{"income_statement": {"revenue": 1000}}]
        result = service._build_growth({"revenue_yoy": 0.2}, financials)
        assert result["revenue_yoy"] == 0.2
        assert "revenue_qoq" not in result


# ===========================================================================
# TestIsProfileFresh
# ===========================================================================


class TestIsProfileFresh:
    """Tests for StockService._is_profile_fresh."""

    def test_fresh_profile(self, service):
        """Profile updated 5 days ago is fresh."""
        cached = {
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
        }
        assert service._is_profile_fresh(cached) is True

    def test_stale_profile(self, service):
        """Profile updated 35 days ago is stale."""
        cached = {
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=35)).isoformat(),
        }
        assert service._is_profile_fresh(cached) is False

    def test_no_updated_at(self, service):
        """Missing updated_at returns False."""
        assert service._is_profile_fresh({}) is False
        assert service._is_profile_fresh({"updated_at": None}) is False


# ===========================================================================
# TestHasRecentQuarter
# ===========================================================================


class TestHasRecentQuarter:
    """Tests for StockService._has_recent_quarter."""

    def test_recent_quarter(self, service):
        """Quarter from 20 days ago is fresh."""
        cached = [{
            "period_end_date": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
        }]
        assert service._has_recent_quarter(cached) is True

    def test_stale_quarter(self, service):
        """Quarter from 60 days ago is stale."""
        cached = [{
            "period_end_date": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
        }]
        assert service._has_recent_quarter(cached) is False

    def test_empty_list(self, service):
        """Empty list returns False."""
        assert service._has_recent_quarter([]) is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
