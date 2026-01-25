"""
StockService Unit Tests

Tests for pure logic functions in app/features/stock/service.py:
- _merge_financials
- _calculate_ttm_metrics
- _calculate_valuation
- _calculate_growth
- _calculate_profitability
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
# TestCalculateTTMMetrics
# ===========================================================================


class TestCalculateTTMMetrics:
    """Tests for StockService._calculate_ttm_metrics."""

    def test_normal_4_quarters(self, service, sample_financials):
        """TTM sums first 4 quarters correctly."""
        result = service._calculate_ttm_metrics(sample_financials)
        # revenue: 30B + 28B + 26B + 24B = 108B
        assert result["revenue"] == 108_000_000_000
        # net_income: 10B + 9B + 8B + 7B = 34B
        assert result["net_income"] == 34_000_000_000
        # eps: 5.0 + 4.5 + 4.0 + 3.5 = 17.0
        assert result["eps"] == 17.0
        # ebitda: 15B + 14B + 13B + 12B = 54B
        assert result["ebitda"] == 54_000_000_000

    def test_less_than_4_quarters(self, service, sample_financials):
        """With < 4 quarters, uses available data."""
        two_q = sample_financials[:2]
        result = service._calculate_ttm_metrics(two_q)
        # revenue: 30B + 28B = 58B
        assert result["revenue"] == 58_000_000_000

    def test_all_none_values(self, service):
        """All None values return None."""
        financials = [
            {"income_statement": {}, "cash_flow": {}}
            for _ in range(4)
        ]
        result = service._calculate_ttm_metrics(financials)
        assert result["revenue"] is None
        assert result["net_income"] is None
        assert result["eps"] is None

    def test_mixed_sources(self, service):
        """operating_cash_flow comes from cash_flow dict, revenue from income_statement."""
        financials = [
            {
                "income_statement": {"revenue": 1000},
                "cash_flow": {"operating_cash_flow": 500, "free_cash_flow": 300},
            }
            for _ in range(4)
        ]
        result = service._calculate_ttm_metrics(financials)
        assert result["revenue"] == 4000
        assert result["operating_cash_flow"] == 2000
        assert result["free_cash_flow"] == 1200

    def test_empty_list(self, service):
        """Empty list returns all None metrics."""
        result = service._calculate_ttm_metrics([])
        assert result["revenue"] is None
        assert result["net_income"] is None
        assert result["eps"] is None
        assert result["ebitda"] is None
        assert result["operating_cash_flow"] is None
        assert result["free_cash_flow"] is None


# ===========================================================================
# TestCalculateValuation
# ===========================================================================


class TestCalculateValuation:
    """Tests for StockService._calculate_valuation."""

    def test_normal_calculation(self, service, sample_financials):
        """PE, PS, EV/EBITDA, PB calculated correctly."""
        quote = {"price": 170.0, "market_cap": 2_000_000_000_000}
        ttm = {"eps": 17.0, "revenue": 108_000_000_000, "ebitda": 54_000_000_000}
        result = service._calculate_valuation(quote, ttm, sample_financials)
        assert result["pe"] == round(170.0 / 17.0, 2)
        assert result["ps"] == round(2_000_000_000_000 / 108_000_000_000, 2)
        assert result["ev_to_ebitda"] == round(2_000_000_000_000 / 54_000_000_000, 2)
        # PB: market_cap / total_equity of first quarter
        assert result["pb"] == round(2_000_000_000_000 / 50_000_000_000, 2)

    def test_no_price(self, service):
        """No price returns empty dict."""
        quote = {"market_cap": 1_000_000_000}
        ttm = {"eps": 5.0}
        result = service._calculate_valuation(quote, ttm, [])
        assert result == {}

    def test_negative_eps(self, service):
        """Negative EPS skips PE calculation."""
        quote = {"price": 100.0, "market_cap": 500_000_000_000}
        ttm = {"eps": -2.0, "revenue": 50_000_000_000, "ebitda": 10_000_000_000}
        result = service._calculate_valuation(quote, ttm, [])
        assert "pe" not in result
        assert "ps" in result
        assert "ev_to_ebitda" in result

    def test_no_market_cap(self, service):
        """No market_cap only calculates PE."""
        quote = {"price": 100.0}
        ttm = {"eps": 5.0, "revenue": 50_000_000_000}
        result = service._calculate_valuation(quote, ttm, [])
        assert result["pe"] == 20.0
        assert "ps" not in result
        assert "ev_to_ebitda" not in result

    def test_no_equity(self, service):
        """No equity in balance sheet skips PB."""
        quote = {"price": 100.0, "market_cap": 500_000_000_000}
        ttm = {"eps": 5.0, "revenue": 50_000_000_000, "ebitda": 10_000_000_000}
        financials = [{"balance_sheet": {}}]
        result = service._calculate_valuation(quote, ttm, financials)
        assert "pb" not in result
        assert result["pe"] == 20.0


# ===========================================================================
# TestCalculateGrowth
# ===========================================================================


class TestCalculateGrowth:
    """Tests for StockService._calculate_growth."""

    def test_qoq_with_2_quarters(self, service, sample_financials):
        """QoQ calculated with 2 quarters."""
        two_q = sample_financials[:2]
        result = service._calculate_growth(two_q)
        # current_rev=30B, prev_rev=28B, qoq=(30-28)/28
        expected_qoq = round((30_000_000_000 - 28_000_000_000) / 28_000_000_000, 4)
        assert result["revenue_qoq"] == expected_qoq

    def test_yoy_with_5_quarters(self, service, sample_financials):
        """YoY calculated with 5 quarters."""
        result = service._calculate_growth(sample_financials)
        # current (index 0): rev=30B, ni=10B, eps=5.0
        # yoy (index 4): rev=22B, ni=6B, eps=3.0
        expected_rev_yoy = round((30_000_000_000 - 22_000_000_000) / 22_000_000_000, 4)
        expected_ni_yoy = round((10_000_000_000 - 6_000_000_000) / 6_000_000_000, 4)
        expected_eps_yoy = round((5.0 - 3.0) / 3.0, 4)
        assert result["revenue_yoy"] == expected_rev_yoy
        assert result["net_income_yoy"] == expected_ni_yoy
        assert result["eps_yoy"] == expected_eps_yoy

    def test_less_than_2_quarters(self, service, sample_financials):
        """< 2 quarters returns empty dict."""
        result = service._calculate_growth(sample_financials[:1])
        assert result == {}

    def test_prev_value_zero(self, service):
        """Previous value 0 does not crash (division by zero protection)."""
        financials = [
            {"income_statement": {"revenue": 1000, "net_income": 100, "eps": 1.0}},
            {"income_statement": {"revenue": 0, "net_income": 0, "eps": 0}},
        ]
        result = service._calculate_growth(financials)
        # prev_rev=0, should not have revenue_qoq
        assert "revenue_qoq" not in result

    def test_negative_growth(self, service):
        """Negative growth is calculated correctly."""
        financials = [
            {"income_statement": {"revenue": 80, "net_income": None, "eps": None}},
            {"income_statement": {"revenue": 100, "net_income": None, "eps": None}},
        ]
        result = service._calculate_growth(financials)
        expected = round((80 - 100) / 100, 4)
        assert result["revenue_qoq"] == expected
        assert result["revenue_qoq"] < 0


# ===========================================================================
# TestCalculateProfitability
# ===========================================================================


class TestCalculateProfitability:
    """Tests for StockService._calculate_profitability."""

    def test_normal(self, service, sample_financials):
        """All margins calculated correctly from latest quarter."""
        result = service._calculate_profitability(sample_financials)
        # latest: revenue=30B, gross_profit=20B, operating_income=12B, net_income=10B
        assert result["gross_margin"] == round(20_000_000_000 / 30_000_000_000, 4)
        assert result["operating_margin"] == round(12_000_000_000 / 30_000_000_000, 4)
        assert result["net_margin"] == round(10_000_000_000 / 30_000_000_000, 4)
        # balance_sheet: equity=50B, assets=100B
        assert result["roe"] == round(10_000_000_000 / 50_000_000_000, 4)
        assert result["roa"] == round(10_000_000_000 / 100_000_000_000, 4)

    def test_revenue_zero(self, service):
        """Revenue = 0 returns empty dict."""
        financials = [{"income_statement": {"revenue": 0}, "balance_sheet": {}}]
        result = service._calculate_profitability(financials)
        assert result == {}

    def test_no_balance_sheet(self, service):
        """No balance sheet means no ROE/ROA but margins still calculated."""
        financials = [{
            "income_statement": {
                "revenue": 1000,
                "gross_profit": 600,
                "operating_income": 400,
                "net_income": 300,
            },
            "balance_sheet": {},
        }]
        result = service._calculate_profitability(financials)
        assert result["gross_margin"] == round(600 / 1000, 4)
        assert result["net_margin"] == round(300 / 1000, 4)
        assert "roe" not in result
        assert "roa" not in result

    def test_equity_zero(self, service):
        """Equity = 0 skips ROE, still calculates ROA."""
        financials = [{
            "income_statement": {
                "revenue": 1000,
                "gross_profit": 600,
                "operating_income": 400,
                "net_income": 300,
            },
            "balance_sheet": {"total_equity": 0, "total_assets": 5000},
        }]
        result = service._calculate_profitability(financials)
        assert "roe" not in result
        assert result["roa"] == round(300 / 5000, 4)

    def test_empty_financials(self, service):
        """Empty list returns empty dict."""
        result = service._calculate_profitability([])
        assert result == {}


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
