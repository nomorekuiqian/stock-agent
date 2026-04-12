"""
FMP Financial Statement Serialization Unit Tests

Tests that _serialize_income_stmt/_serialize_balance_stmt/_serialize_cash_flow_stmt
produce output field names compatible with stock/service.py consumers.
These methods were copied from OpenBB's serialization logic during the data layer unification.

If field names are wrong, stock analysis pages show empty data.

All tests use hardcoded FMP API JSON response fixtures (realistic AAPL data).
No network access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_fmp_serialization_unit.py -v
"""

import pytest

from app.shared.fmp_service import FMPService


# ---------------------------------------------------------------------------
# Fixtures: realistic FMP API responses (AAPL FY2024 Q4)
# ---------------------------------------------------------------------------

SAMPLE_FMP_INCOME = {
    "date": "2024-09-28",
    "calendarYear": "2024",
    "period": "Q4",
    "revenue": 94_930_000_000,
    "costOfRevenue": 52_000_000_000,
    "grossProfit": 42_930_000_000,
    "operatingExpenses": 14_500_000_000,
    "operatingIncome": 28_430_000_000,
    "netIncome": 14_736_000_000,
    "eps": 0.97,
    "epsdiluted": 0.96,
    "ebitda": 32_502_000_000,
    "researchAndDevelopmentExpenses": 7_766_000_000,
}

SAMPLE_FMP_BALANCE = {
    "date": "2024-09-28",
    "calendarYear": "2024",
    "period": "Q4",
    "totalAssets": 364_980_000_000,
    "totalLiabilities": 308_030_000_000,
    "totalStockholdersEquity": 56_950_000_000,
    "cashAndCashEquivalents": 29_943_000_000,
    "shortTermInvestments": 35_228_000_000,
    "totalCurrentAssets": 152_987_000_000,
    "totalCurrentLiabilities": 176_392_000_000,
    "longTermDebt": 98_071_000_000,
    "totalDebt": 106_629_000_000,
    "retainedEarnings": 4_336_000_000,
    "commonStock": 15_115_000_000,
}

SAMPLE_FMP_CASH_FLOW = {
    "date": "2024-09-28",
    "calendarYear": "2024",
    "period": "Q4",
    "operatingCashFlow": 29_943_000_000,
    "capitalExpenditure": -2_907_000_000,
    "freeCashFlow": 27_036_000_000,
    "dividendsPaid": -3_811_000_000,
    "commonStockRepurchased": -25_000_000_000,
    "netCashUsedForInvestingActivites": -8_505_000_000,
    "netCashUsedProvidedByFinancingActivities": -21_621_000_000,
    "depreciationAndAmortization": 2_907_000_000,
}


# ---------------------------------------------------------------------------
# Income Statement Tests
# ---------------------------------------------------------------------------


class TestSerializeIncomeStmt:
    def setup_method(self):
        # Create FMPService without __init__ (skip API key check)
        self.svc = FMPService.__new__(FMPService)

    def test_all_fields_present(self):
        result = self.svc._serialize_income_stmt(SAMPLE_FMP_INCOME)
        expected_fields = [
            "date", "fiscal_year", "fiscal_period",
            "revenue", "cost_of_revenue", "gross_profit", "gross_profit_margin",
            "operating_expenses", "operating_income", "operating_income_margin",
            "net_income", "net_income_margin",
            "eps", "eps_diluted", "ebitda", "research_and_development",
        ]
        for field in expected_fields:
            assert field in result, f"Missing field: {field}"

    def test_values_correct(self):
        result = self.svc._serialize_income_stmt(SAMPLE_FMP_INCOME)
        assert result["date"] == "2024-09-28"
        assert result["fiscal_year"] == "2024"
        assert result["fiscal_period"] == "Q4"
        assert result["revenue"] == 94_930_000_000
        assert result["cost_of_revenue"] == 52_000_000_000
        assert result["gross_profit"] == 42_930_000_000
        assert result["operating_expenses"] == 14_500_000_000
        assert result["operating_income"] == 28_430_000_000
        assert result["net_income"] == 14_736_000_000
        assert result["eps"] == 0.97
        assert result["eps_diluted"] == 0.96
        assert result["ebitda"] == 32_502_000_000
        assert result["research_and_development"] == 7_766_000_000

    def test_margins_calculated(self):
        result = self.svc._serialize_income_stmt(SAMPLE_FMP_INCOME)
        # gross_profit_margin = gross_profit / revenue
        assert result["gross_profit_margin"] == round(42_930_000_000 / 94_930_000_000, 4)
        assert result["operating_income_margin"] == round(28_430_000_000 / 94_930_000_000, 4)
        assert result["net_income_margin"] == round(14_736_000_000 / 94_930_000_000, 4)

    def test_eps_diluted_fallback_to_camelcase(self):
        """epsDiluted (camelCase) should also work if epsdiluted is absent."""
        data = {**SAMPLE_FMP_INCOME}
        del data["epsdiluted"]
        data["epsDiluted"] = 0.95
        result = self.svc._serialize_income_stmt(data)
        assert result["eps_diluted"] == 0.95

    def test_missing_fields_return_none(self):
        sparse = {"date": "2024-09-28", "calendarYear": "2024", "period": "Q4"}
        result = self.svc._serialize_income_stmt(sparse)
        assert result["date"] == "2024-09-28"
        assert result["fiscal_year"] == "2024"
        assert result["fiscal_period"] == "Q4"
        assert result["revenue"] is None
        assert result["cost_of_revenue"] is None
        assert result["gross_profit"] is None
        assert result["operating_expenses"] is None
        assert result["operating_income"] is None
        assert result["net_income"] is None
        assert result["eps"] is None
        assert result["eps_diluted"] is None
        assert result["ebitda"] is None
        assert result["research_and_development"] is None
        # Margins should be None when numerator/denominator are None
        assert result["gross_profit_margin"] is None
        assert result["operating_income_margin"] is None
        assert result["net_income_margin"] is None

    def test_empty_date_fallback(self):
        """Missing date should fall back to empty string, not None."""
        data = {**SAMPLE_FMP_INCOME}
        del data["date"]
        result = self.svc._serialize_income_stmt(data)
        assert result["date"] == ""

    def test_field_count(self):
        """Ensure no extra or missing fields in output."""
        result = self.svc._serialize_income_stmt(SAMPLE_FMP_INCOME)
        assert len(result) == 16


# ---------------------------------------------------------------------------
# Balance Sheet Tests
# ---------------------------------------------------------------------------


class TestSerializeBalanceStmt:
    def setup_method(self):
        self.svc = FMPService.__new__(FMPService)

    def test_all_fields_present(self):
        result = self.svc._serialize_balance_stmt(SAMPLE_FMP_BALANCE)
        expected_fields = [
            "date", "fiscal_year", "fiscal_period",
            "total_assets", "total_liabilities", "total_equity",
            "cash_and_equivalents", "short_term_investments",
            "total_current_assets", "total_current_liabilities",
            "long_term_debt", "total_debt", "retained_earnings",
            "shares_outstanding",
        ]
        for field in expected_fields:
            assert field in result, f"Missing field: {field}"

    def test_values_correct(self):
        result = self.svc._serialize_balance_stmt(SAMPLE_FMP_BALANCE)
        assert result["date"] == "2024-09-28"
        assert result["fiscal_year"] == "2024"
        assert result["fiscal_period"] == "Q4"
        assert result["total_assets"] == 364_980_000_000
        assert result["total_liabilities"] == 308_030_000_000
        assert result["total_equity"] == 56_950_000_000
        assert result["cash_and_equivalents"] == 29_943_000_000
        assert result["short_term_investments"] == 35_228_000_000
        assert result["total_current_assets"] == 152_987_000_000
        assert result["total_current_liabilities"] == 176_392_000_000
        assert result["long_term_debt"] == 98_071_000_000
        assert result["total_debt"] == 106_629_000_000
        assert result["retained_earnings"] == 4_336_000_000
        assert result["shares_outstanding"] == 15_115_000_000

    def test_equity_from_totalStockholdersEquity(self):
        """When only totalStockholdersEquity exists, total_equity should use it."""
        data = {
            "date": "2024-09-28",
            "calendarYear": "2024",
            "period": "Q4",
            "totalStockholdersEquity": 56_950_000_000,
        }
        result = self.svc._serialize_balance_stmt(data)
        assert result["total_equity"] == 56_950_000_000

    def test_equity_prefers_totalEquity(self):
        """When totalEquity is present, it takes priority over totalStockholdersEquity."""
        data = {
            "date": "2024-09-28",
            "calendarYear": "2024",
            "period": "Q4",
            "totalEquity": 60_000_000_000,
            "totalStockholdersEquity": 56_950_000_000,
        }
        result = self.svc._serialize_balance_stmt(data)
        assert result["total_equity"] == 60_000_000_000

    def test_missing_fields_return_none(self):
        sparse = {"date": "2024-09-28", "calendarYear": "2024", "period": "Q4"}
        result = self.svc._serialize_balance_stmt(sparse)
        assert result["total_assets"] is None
        assert result["total_liabilities"] is None
        assert result["total_equity"] is None
        assert result["cash_and_equivalents"] is None
        assert result["short_term_investments"] is None
        assert result["total_current_assets"] is None
        assert result["total_current_liabilities"] is None
        assert result["long_term_debt"] is None
        assert result["total_debt"] is None
        assert result["retained_earnings"] is None
        assert result["shares_outstanding"] is None

    def test_field_count(self):
        result = self.svc._serialize_balance_stmt(SAMPLE_FMP_BALANCE)
        assert len(result) == 14


# ---------------------------------------------------------------------------
# Cash Flow Statement Tests
# ---------------------------------------------------------------------------


class TestSerializeCashFlowStmt:
    def setup_method(self):
        self.svc = FMPService.__new__(FMPService)

    def test_all_fields_present(self):
        result = self.svc._serialize_cash_flow_stmt(SAMPLE_FMP_CASH_FLOW)
        expected_fields = [
            "date", "fiscal_year", "fiscal_period",
            "operating_cash_flow", "capital_expenditure", "free_cash_flow",
            "dividends_paid", "stock_repurchase",
            "net_cash_from_investing", "net_cash_from_financing",
            "depreciation",
        ]
        for field in expected_fields:
            assert field in result, f"Missing field: {field}"

    def test_values_correct(self):
        result = self.svc._serialize_cash_flow_stmt(SAMPLE_FMP_CASH_FLOW)
        assert result["date"] == "2024-09-28"
        assert result["fiscal_year"] == "2024"
        assert result["fiscal_period"] == "Q4"
        assert result["operating_cash_flow"] == 29_943_000_000
        assert result["capital_expenditure"] == -2_907_000_000
        assert result["free_cash_flow"] == 27_036_000_000
        assert result["dividends_paid"] == -3_811_000_000
        assert result["stock_repurchase"] == -25_000_000_000
        assert result["net_cash_from_investing"] == -8_505_000_000
        assert result["net_cash_from_financing"] == -21_621_000_000
        assert result["depreciation"] == 2_907_000_000

    def test_operating_cash_flow_fallback(self):
        """When operatingCashFlow is missing, should fall back to netCashProvidedByOperatingActivities."""
        data = {
            "date": "2024-09-28",
            "calendarYear": "2024",
            "period": "Q4",
            "netCashProvidedByOperatingActivities": 29_943_000_000,
        }
        result = self.svc._serialize_cash_flow_stmt(data)
        assert result["operating_cash_flow"] == 29_943_000_000

    def test_missing_fields_return_none(self):
        sparse = {"date": "2024-09-28", "calendarYear": "2024", "period": "Q4"}
        result = self.svc._serialize_cash_flow_stmt(sparse)
        assert result["operating_cash_flow"] is None
        assert result["capital_expenditure"] is None
        assert result["free_cash_flow"] is None
        assert result["dividends_paid"] is None
        assert result["stock_repurchase"] is None
        assert result["net_cash_from_investing"] is None
        assert result["net_cash_from_financing"] is None
        assert result["depreciation"] is None

    def test_field_count(self):
        result = self.svc._serialize_cash_flow_stmt(SAMPLE_FMP_CASH_FLOW)
        assert len(result) == 11


# ---------------------------------------------------------------------------
# _safe_divide_val Tests
# ---------------------------------------------------------------------------


class TestSafeDivideVal:
    def setup_method(self):
        self.svc = FMPService.__new__(FMPService)

    def test_normal(self):
        assert self.svc._safe_divide_val(100, 200) == 0.5

    def test_none_numerator(self):
        assert self.svc._safe_divide_val(None, 200) is None

    def test_none_denominator(self):
        assert self.svc._safe_divide_val(100, None) is None

    def test_zero_denominator(self):
        assert self.svc._safe_divide_val(100, 0) is None

    def test_both_none(self):
        assert self.svc._safe_divide_val(None, None) is None

    def test_rounding(self):
        result = self.svc._safe_divide_val(1, 3)
        assert result == 0.3333

    def test_negative_values(self):
        result = self.svc._safe_divide_val(-100, 200)
        assert result == -0.5

    def test_large_numbers(self):
        result = self.svc._safe_divide_val(42_930_000_000, 94_930_000_000)
        assert result == round(42_930_000_000 / 94_930_000_000, 4)
