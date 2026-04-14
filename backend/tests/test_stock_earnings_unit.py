"""
Stock Earnings Unit Tests -- generated from git diff

Tests for:
- StockService._compute_yoy_growth (static, pure logic)
- StockService.calculate_financial_health_score (pure scoring)
- _prepare_earnings_data_for_agent (data trimming)
- _empty_earnings_analysis (field list)
- EARNINGS_ANALYSIS_FIELDS constant

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_stock_earnings_unit.py -v
"""

import pytest

from app.features.stock.service import StockService
from app.features.stock.agent.earnings import (
    EARNINGS_ANALYSIS_FIELDS,
    _empty_earnings_analysis,
    _prepare_earnings_data_for_agent,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def service():
    """Create StockService instance without singleton."""
    StockService._instance = None
    svc = StockService()
    yield svc
    StockService._instance = None


@pytest.fixture
def income_stmts_with_yoy():
    """8 quarters of income statements spanning 2 years for YoY comparison."""
    quarters = [
        ("2024-12-31", "Q4", 40_000, 25_000, 15_000, 10_000, 2.0),
        ("2024-09-30", "Q3", 38_000, 23_000, 14_000, 9_500, 1.9),
        ("2024-06-30", "Q2", 36_000, 22_000, 13_000, 9_000, 1.8),
        ("2024-03-31", "Q1", 34_000, 21_000, 12_000, 8_500, 1.7),
        ("2023-12-31", "Q4", 32_000, 20_000, 11_000, 8_000, 1.6),
        ("2023-09-30", "Q3", 30_000, 18_000, 10_000, 7_000, 1.4),
        ("2023-06-30", "Q2", 28_000, 17_000, 9_000, 6_500, 1.3),
        ("2023-03-31", "Q1", 26_000, 16_000, 8_000, 6_000, 1.2),
    ]
    return [
        {
            "date": d,
            "fiscal_period": p,
            "revenue": rev,
            "gross_profit": gp,
            "operating_income": oi,
            "net_income": ni,
            "eps_diluted": eps,
        }
        for d, p, rev, gp, oi, ni, eps in quarters
    ]


@pytest.fixture
def healthy_fundamentals():
    """Fundamentals dict that should score 10/10."""
    return {
        "ttm": {
            "net_income": 50_000,
            "operating_cash_flow": 70_000,
            "revenue": 200_000,
        },
        "profitability": {
            "roe": 0.25,
            "gross_margin": 0.45,
            "net_margin": 0.10,
        },
        "balance_sheet": {
            "debt_to_equity": 0.5,
            "current_ratio": 1.5,
        },
        "growth": {
            "revenue_yoy": 0.15,
        },
    }


@pytest.fixture
def unhealthy_fundamentals():
    """Fundamentals dict that should score 0/10.

    Note: OCF must be less than NI for quality check to fail.
    With both negative, OCF < NI means OCF is more negative.
    """
    return {
        "ttm": {
            "net_income": -5_000,
            "operating_cash_flow": -10_000,
            "revenue": -1,
        },
        "profitability": {
            "roe": -0.10,
            "gross_margin": 0.05,
            "net_margin": -0.10,
        },
        "balance_sheet": {
            "debt_to_equity": 3.0,
            "current_ratio": 0.5,
        },
        "growth": {
            "revenue_yoy": -0.20,
        },
    }


@pytest.fixture
def sample_earnings_data():
    """Earnings data dict matching StockService.get_earnings_data output."""
    return {
        "symbol": "AAPL",
        "earnings_history": [
            {
                "quarter": "2024-12-31",
                "eps_actual": 2.84,
                "eps_estimate": 2.67,
                "surprise_percent": 0.0634,
            },
            {
                "quarter": "2024-09-30",
                "eps_actual": 1.64,
                "eps_estimate": 1.60,
                "surprise_percent": 0.025,
            },
        ],
        "analyst_estimates": [
            {"date": "2025-03-31", "revenue_avg": 95_000_000_000, "eps_avg": 1.72,
             "num_analysts_eps": 30, "num_analysts_revenue": 28},
        ],
        "revenue_segments": [
            {"period": "Q4", "date": "2024-12-31", "data": {"iPhone": 60_000, "Services": 25_000}},
        ],
        "revenue_geo_segments": [
            {"period": "Q4", "date": "2024-12-31", "data": {"Americas": 50_000, "Europe": 25_000}},
        ],
        "financial_growth": [
            {"date": "2024-12-31", "period": "Q4", "revenueGrowth": 0.08, "netIncomeGrowth": 0.12},
        ],
        "next_earnings_date": "2025-04-24",
        "dcf_value": 210.5,
        "stock_price": 195.0,
        "income_statements": [
            {"date": "2024-12-31", "revenue": 94_000, "net_income": 14_000, "fiscal_year": 2024},
            {"date": "2024-09-30", "revenue": 85_000, "net_income": 12_000, "fiscal_year": 2024},
        ],
        "cashflow_statements": [
            {"date": "2024-12-31", "operating_cash_flow": 20_000, "free_cash_flow": 15_000, "fiscal_year": 2024},
        ],
        "balance_sheets": [
            {"date": "2024-12-31", "total_assets": 350_000, "total_debt": 100_000, "fiscal_year": 2024},
        ],
    }


# ===========================================================================
# TestComputeYoyGrowth
# ===========================================================================


class TestComputeYoyGrowth:
    """Tests for StockService._compute_yoy_growth."""

    def test_normal_yoy_growth(self, income_stmts_with_yoy):
        """Computes YoY growth by matching same quarter across years."""
        result = StockService._compute_yoy_growth(income_stmts_with_yoy)
        assert len(result) == 4  # Only 2024 quarters have 2023 counterparts

        # 2024-Q4 vs 2023-Q4: revenue 40000 vs 32000 = 25%
        q4 = next(r for r in result if r["date"] == "2024-12-31")
        assert q4["revenueGrowth"] == pytest.approx(0.25, abs=0.01)
        assert q4["netIncomeGrowth"] == pytest.approx(0.25, abs=0.01)
        assert q4["epsdilutedGrowth"] == pytest.approx(0.25, abs=0.01)

    def test_empty_input(self):
        """Empty list returns empty growth."""
        assert StockService._compute_yoy_growth([]) == []

    def test_none_input(self):
        """None input returns empty growth."""
        assert StockService._compute_yoy_growth(None) == []

    def test_non_list_input(self):
        """Non-list input returns empty growth."""
        assert StockService._compute_yoy_growth("not a list") == []

    def test_single_year_no_prior(self):
        """Only one year of data means no YoY comparison possible."""
        stmts = [
            {"date": "2024-12-31", "revenue": 100, "gross_profit": 50,
             "operating_income": 30, "net_income": 20, "eps_diluted": 1.0},
        ]
        assert StockService._compute_yoy_growth(stmts) == []

    def test_zero_prior_revenue(self):
        """Zero prior value returns None growth (safe division)."""
        stmts = [
            {"date": "2024-12-31", "revenue": 100, "gross_profit": 50,
             "operating_income": 30, "net_income": 20, "eps_diluted": 1.0},
            {"date": "2023-12-31", "revenue": 0, "gross_profit": 0,
             "operating_income": 0, "net_income": 0, "eps_diluted": 0},
        ]
        result = StockService._compute_yoy_growth(stmts)
        # Revenue growth should be None because prior is 0
        assert len(result) == 0  # entry excluded since revenueGrowth is None

    def test_missing_date_skips_quarter(self):
        """Quarters with missing or short dates are skipped."""
        stmts = [
            {"date": "", "revenue": 100},
            {"date": "2024", "revenue": 100},  # too short
        ]
        assert StockService._compute_yoy_growth(stmts) == []

    def test_none_revenue_values(self):
        """None revenue values produce None growth, entry excluded."""
        stmts = [
            {"date": "2024-12-31", "revenue": None, "gross_profit": None,
             "operating_income": None, "net_income": None, "eps_diluted": None},
            {"date": "2023-12-31", "revenue": 100, "gross_profit": 50,
             "operating_income": 30, "net_income": 20, "eps_diluted": 1.0},
        ]
        result = StockService._compute_yoy_growth(stmts)
        assert len(result) == 0


# ===========================================================================
# TestCalculateFinancialHealthScore
# ===========================================================================


class TestCalculateFinancialHealthScore:
    """Tests for StockService.calculate_financial_health_score."""

    def test_perfect_score(self, service, healthy_fundamentals):
        """All conditions met returns 10/10."""
        result = service.calculate_financial_health_score(healthy_fundamentals)
        assert result["score"] == 10
        assert result["max_score"] == 10
        assert len(result["details"]) == 10
        assert all(d["passed"] for d in result["details"])

    def test_zero_score(self, service, unhealthy_fundamentals):
        """All conditions failed returns 0/10."""
        result = service.calculate_financial_health_score(unhealthy_fundamentals)
        assert result["score"] == 0
        assert result["max_score"] == 10
        assert not any(d["passed"] for d in result["details"])

    def test_empty_fundamentals(self, service):
        """Empty dict returns 0/10 -- all None checks fail."""
        result = service.calculate_financial_health_score({})
        assert result["score"] == 0
        assert result["max_score"] == 10

    def test_partial_data(self, service):
        """Only some fields present gives partial score."""
        fundamentals = {
            "ttm": {"net_income": 1000, "operating_cash_flow": 2000, "revenue": 5000},
            "profitability": {},
            "balance_sheet": {},
            "growth": {},
        }
        result = service.calculate_financial_health_score(fundamentals)
        # net_income > 0: pass, OCF > 0: pass, OCF > NI: pass, revenue > 0: pass = 4
        assert result["score"] == 4

    def test_details_have_labels(self, service, healthy_fundamentals):
        """Each detail has label and passed keys."""
        result = service.calculate_financial_health_score(healthy_fundamentals)
        for detail in result["details"]:
            assert "label" in detail
            assert "passed" in detail
            assert isinstance(detail["label"], str)
            assert isinstance(detail["passed"], bool)

    def test_ocf_less_than_net_income_fails_quality(self, service):
        """OCF < Net Income fails earnings quality check."""
        fundamentals = {
            "ttm": {"net_income": 1000, "operating_cash_flow": 500, "revenue": 5000},
            "profitability": {"roe": 0.1, "gross_margin": 0.3, "net_margin": 0.1},
            "balance_sheet": {"debt_to_equity": 0.5, "current_ratio": 1.5},
            "growth": {"revenue_yoy": 0.1},
        }
        result = service.calculate_financial_health_score(fundamentals)
        quality_detail = next(d for d in result["details"] if "Quality" in d["label"])
        assert quality_detail["passed"] is False
        assert result["score"] == 9  # everything except quality


# ===========================================================================
# TestEmptyEarningsAnalysis
# ===========================================================================


class TestEmptyEarningsAnalysis:
    """Tests for _empty_earnings_analysis."""

    def test_returns_all_fields(self):
        """All EARNINGS_ANALYSIS_FIELDS present with empty string values."""
        result = _empty_earnings_analysis()
        for field in EARNINGS_ANALYSIS_FIELDS:
            assert field in result
            assert result[field] == ""

    def test_field_count_matches(self):
        """Number of fields matches constant."""
        result = _empty_earnings_analysis()
        assert len(result) == len(EARNINGS_ANALYSIS_FIELDS)

    def test_expected_fields(self):
        """EARNINGS_ANALYSIS_FIELDS contains expected field names."""
        expected = {
            "title", "earnings_overview", "revenue_breakdown",
            "profitability_cashflow", "balance_sheet_capital",
            "growth_trends", "earnings_verdict",
        }
        assert set(EARNINGS_ANALYSIS_FIELDS) == expected


# ===========================================================================
# TestPrepareEarningsDataForAgent
# ===========================================================================


class TestPrepareEarningsDataForAgent:
    """Tests for _prepare_earnings_data_for_agent."""

    def test_basic_structure(self, sample_earnings_data):
        """Returns symbol, quote_snapshot, and trimmed data."""
        quote = {"price": 195.0, "change_percent": 1.5}
        result = _prepare_earnings_data_for_agent(sample_earnings_data, quote)
        assert result["symbol"] == "AAPL"
        assert result["quote_snapshot"] == quote

    def test_earnings_history_trimmed_to_8(self):
        """Earnings history limited to 8 quarters."""
        data = {
            "symbol": "TEST",
            "earnings_history": [
                {"quarter": f"2024-Q{i}", "eps_actual": float(i), "eps_estimate": float(i)}
                for i in range(12)
            ],
        }
        result = _prepare_earnings_data_for_agent(data, {})
        assert len(result["earnings_history"]) == 8

    def test_analyst_estimates_trimmed_to_4(self):
        """Analyst estimates limited to 4 periods."""
        data = {
            "symbol": "TEST",
            "analyst_estimates": [
                {"date": f"2025-0{i}-30", "revenue_avg": 100, "eps_avg": 1.0,
                 "num_analysts_eps": 10, "num_analysts_revenue": 8}
                for i in range(1, 8)
            ],
        }
        result = _prepare_earnings_data_for_agent(data, {})
        assert len(result["analyst_estimates"]) == 4

    def test_income_statements_trimmed_to_2(self, sample_earnings_data):
        """Income statements limited to 2 quarters."""
        result = _prepare_earnings_data_for_agent(sample_earnings_data, {})
        assert len(result["income_statements"]) == 2

    def test_fiscal_year_stripped_from_income_stmts(self, sample_earnings_data):
        """fiscal_year key removed from income statement entries."""
        result = _prepare_earnings_data_for_agent(sample_earnings_data, {})
        for stmt in result["income_statements"]:
            assert "fiscal_year" not in stmt

    def test_balance_sheet_single_entry(self, sample_earnings_data):
        """Balance sheet reduced to single entry (latest quarter)."""
        result = _prepare_earnings_data_for_agent(sample_earnings_data, {})
        assert "balance_sheet" in result
        assert isinstance(result["balance_sheet"], dict)
        assert "fiscal_year" not in result["balance_sheet"]

    def test_empty_segments_excluded(self):
        """Revenue segments with empty data dicts are excluded."""
        data = {
            "symbol": "TEST",
            "revenue_segments": [
                {"period": "Q1", "date": "2024-03-31", "data": {}},
                {"period": "Q2", "date": "2024-06-30", "data": {"iPhone": 60_000}},
            ],
        }
        result = _prepare_earnings_data_for_agent(data, {})
        assert len(result["revenue_segments"]) == 1

    def test_dcf_and_stock_price_included(self, sample_earnings_data):
        """DCF value and stock price passed through."""
        result = _prepare_earnings_data_for_agent(sample_earnings_data, {})
        assert result["dcf_value"] == 210.5
        assert result["stock_price"] == 195.0

    def test_next_earnings_date_included(self, sample_earnings_data):
        """Next earnings date passed through."""
        result = _prepare_earnings_data_for_agent(sample_earnings_data, {})
        assert result["next_earnings_date"] == "2025-04-24"

    def test_company_context_from_quote(self):
        """Industry/sector context extracted from enriched quote snapshot."""
        data = {"symbol": "TEST"}
        quote = {"price": 100, "industry": "Technology", "sector": "Tech", "pe": 25.0}
        result = _prepare_earnings_data_for_agent(data, quote)
        assert result["company_context"]["industry"] == "Technology"
        assert result["company_context"]["pe"] == 25.0

    def test_empty_input(self):
        """Empty earnings data returns minimal structure."""
        result = _prepare_earnings_data_for_agent({"symbol": "X"}, {})
        assert result["symbol"] == "X"
        assert "earnings_history" not in result
        assert "analyst_estimates" not in result

    def test_none_values_excluded_from_history(self):
        """Earnings history entries with no actual/estimate are excluded."""
        data = {
            "symbol": "TEST",
            "earnings_history": [
                {"quarter": "2024-Q1", "eps_actual": None, "eps_estimate": None},
                {"quarter": "2024-Q2", "eps_actual": 1.5, "eps_estimate": 1.4},
            ],
        }
        result = _prepare_earnings_data_for_agent(data, {})
        assert len(result["earnings_history"]) == 1
