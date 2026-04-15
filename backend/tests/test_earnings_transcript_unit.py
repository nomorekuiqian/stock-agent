"""
Earnings Transcript Unit Tests -- covers transcript-related changes

Tests for:
- preprocess_transcript (operator line removal, truncation)
- _prepare_earnings_data_for_agent (transcript injection)
- EARNINGS_ANALYSIS_FIELDS (new field names)
- _empty_earnings_analysis (matches fields)
- FMPService fiscal_year fallback (calendarYear -> fiscalYear)
- FMPService analyst estimates field mapping (camelCase -> snake_case)

No network access, no database.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_earnings_transcript_unit.py -v
"""

import pytest

from app.features.stock.agent.earnings import (
    EARNINGS_ANALYSIS_FIELDS,
    _empty_earnings_analysis,
    _prepare_earnings_data_for_agent,
    preprocess_transcript,
)
from app.shared.fmp_service import FMPService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_transcript():
    """Realistic earnings call transcript snippet."""
    return (
        "Operator: Good afternoon, and welcome to the Apple Q1 Fiscal Year 2026 "
        "Earnings Conference Call. Our next question comes from analyst John.\n"
        "Tim Cook: Thank you. Today we are reporting record revenue of $143.8 billion, "
        "up 16% year over year. iPhone had its best-ever quarter.\n"
        "Kevan Parekh: For Q2, we expect revenue between $95 billion and $100 billion, "
        "and gross margin between 47% and 48%.\n"
        "Operator: Our next question comes from Sarah at Goldman Sachs.\n"
        "Sarah: Can you talk about the supply chain?\n"
        "Tim Cook: We feel good about supply. Demand is very strong.\n"
        "Operator: Once again, this does conclude today's conference.\n"
    )


@pytest.fixture
def sample_earnings_data():
    """Minimal earnings data dict matching service output."""
    return {
        "symbol": "AAPL",
        "earnings_history": [
            {"quarter": "2025-12", "eps_actual": 2.84, "eps_estimate": 2.67, "surprise_percent": 6.3},
        ],
        "analyst_estimates": [
            {"date": "2026-03-27", "eps_avg": 1.95, "revenue_avg": 95_000_000_000},
        ],
        "revenue_segments": [],
        "revenue_geo_segments": [],
        "financial_growth": [
            {"date": "2025-12-27", "period": "Q1", "revenueGrowth": 0.16},
        ],
        "next_earnings_date": "2026-04-30",
        "dcf_value": 250.0,
        "stock_price": 230.0,
        "income_statements": [
            {"date": "2025-12-27", "fiscal_period": "Q1", "revenue": 143_800_000_000, "net_income": 42_100_000_000},
        ],
        "cashflow_statements": [
            {"date": "2025-12-27", "operating_cash_flow": 54_000_000_000, "free_cash_flow": 38_000_000_000},
        ],
        "balance_sheets": [
            {"date": "2025-12-27", "cash_and_equivalents": 30_000_000_000, "total_debt": 100_000_000_000},
        ],
    }


@pytest.fixture
def sample_quote_snapshot():
    return {
        "price": 230.0,
        "industry": "Consumer Electronics",
        "sector": "Technology",
        "pe": 35.0,
        "gross_margin": 0.48,
    }


# ---------------------------------------------------------------------------
# EARNINGS_ANALYSIS_FIELDS
# ---------------------------------------------------------------------------


class TestEarningsAnalysisFields:
    """Verify the new field structure after transcript feature."""

    def test_field_count(self):
        assert len(EARNINGS_ANALYSIS_FIELDS) == 7

    def test_contains_guidance_outlook(self):
        assert "guidance_outlook" in EARNINGS_ANALYSIS_FIELDS

    def test_contains_key_drivers(self):
        assert "key_drivers" in EARNINGS_ANALYSIS_FIELDS

    def test_no_legacy_fields(self):
        assert "transcript_insights" not in EARNINGS_ANALYSIS_FIELDS
        assert "key_debates" not in EARNINGS_ANALYSIS_FIELDS
        assert "growth_trends" not in EARNINGS_ANALYSIS_FIELDS

    def test_empty_analysis_matches_fields(self):
        empty = _empty_earnings_analysis()
        assert set(empty.keys()) == set(EARNINGS_ANALYSIS_FIELDS)
        assert all(v == "" for v in empty.values())


# ---------------------------------------------------------------------------
# preprocess_transcript
# ---------------------------------------------------------------------------


class TestPreprocessTranscript:
    """Tests for transcript text preprocessing."""

    def test_removes_operator_lines(self, sample_transcript):
        result = preprocess_transcript(sample_transcript)
        assert "Our next question comes from" not in result
        assert "this does conclude" not in result

    def test_preserves_speaker_content(self, sample_transcript):
        result = preprocess_transcript(sample_transcript)
        assert "record revenue of $143.8 billion" in result
        assert "Tim Cook" in result
        assert "Kevan Parekh" in result

    def test_preserves_qa_content(self, sample_transcript):
        result = preprocess_transcript(sample_transcript)
        assert "supply chain" in result
        assert "Demand is very strong" in result

    def test_empty_input(self):
        assert preprocess_transcript("") == ""
        assert preprocess_transcript(None) == ""

    def test_truncation(self):
        long_text = "A" * 100_000
        result = preprocess_transcript(long_text, max_chars=1000)
        assert len(result) <= 1100  # some slack for truncation message
        assert "[Transcript truncated]" in result

    def test_no_truncation_when_under_limit(self):
        short_text = "Hello world. This is a short transcript."
        result = preprocess_transcript(short_text, max_chars=60000)
        assert "[Transcript truncated]" not in result

    def test_collapses_blank_lines(self):
        text = "Line 1\n\n\n\n\nLine 2"
        result = preprocess_transcript(text)
        assert "\n\n\n" not in result
        assert "Line 1" in result
        assert "Line 2" in result


# ---------------------------------------------------------------------------
# _prepare_earnings_data_for_agent (transcript integration)
# ---------------------------------------------------------------------------


class TestPrepareEarningsDataWithTranscript:
    """Tests for transcript injection into agent data."""

    def test_without_transcript(self, sample_earnings_data, sample_quote_snapshot):
        result = _prepare_earnings_data_for_agent(sample_earnings_data, sample_quote_snapshot)
        assert result["has_transcript"] is False
        assert "transcript" not in result

    def test_with_transcript(self, sample_earnings_data, sample_quote_snapshot, sample_transcript):
        result = _prepare_earnings_data_for_agent(
            sample_earnings_data, sample_quote_snapshot, sample_transcript
        )
        assert result["has_transcript"] is True
        assert "transcript" in result
        assert len(result["transcript"]) > 0

    def test_with_empty_transcript(self, sample_earnings_data, sample_quote_snapshot):
        result = _prepare_earnings_data_for_agent(
            sample_earnings_data, sample_quote_snapshot, ""
        )
        assert result["has_transcript"] is False

    def test_preserves_existing_data(self, sample_earnings_data, sample_quote_snapshot, sample_transcript):
        result = _prepare_earnings_data_for_agent(
            sample_earnings_data, sample_quote_snapshot, sample_transcript
        )
        assert result["symbol"] == "AAPL"
        assert "earnings_history" in result
        assert "financial_growth" in result
        assert "income_statements" in result


# ---------------------------------------------------------------------------
# FMPService fiscal_year fallback
# ---------------------------------------------------------------------------


class TestFiscalYearFallback:
    """Test that fiscal_year falls back to fiscalYear when calendarYear is None."""

    def test_calendar_year_present(self):
        fmp = FMPService.__new__(FMPService)
        item = {
            "date": "2025-09-27",
            "calendarYear": "2025",
            "fiscalYear": "2025",
            "period": "Q4",
            "revenue": 100,
            "costOfRevenue": 50,
            "grossProfit": 50,
            "operatingIncome": 30,
            "netIncome": 20,
        }
        result = fmp._serialize_income_stmt(item)
        assert result["fiscal_year"] == "2025"

    def test_calendar_year_none_falls_back(self):
        """AAPL-like case: calendarYear is None, fiscalYear has value."""
        fmp = FMPService.__new__(FMPService)
        item = {
            "date": "2025-12-27",
            "calendarYear": None,
            "fiscalYear": 2026,
            "period": "Q1",
            "revenue": 143_800_000_000,
            "costOfRevenue": 74_000_000_000,
            "grossProfit": 69_800_000_000,
            "operatingIncome": 50_000_000_000,
            "netIncome": 42_100_000_000,
        }
        result = fmp._serialize_income_stmt(item)
        assert result["fiscal_year"] == 2026

    def test_both_none(self):
        fmp = FMPService.__new__(FMPService)
        item = {"date": "2025-12-27", "calendarYear": None, "fiscalYear": None, "period": "Q1"}
        result = fmp._serialize_income_stmt(item)
        assert result["fiscal_year"] is None


# ---------------------------------------------------------------------------
# FMPService analyst estimates field mapping
# ---------------------------------------------------------------------------


class TestAnalystEstimatesMapping:
    """Test that FMP camelCase fields are mapped to snake_case."""

    @pytest.fixture
    def fmp_raw_estimate(self):
        """Realistic FMP analyst-estimates API response item."""
        return {
            "symbol": "AAPL",
            "date": "2027-12-27",
            "epsAvg": 3.12,
            "epsLow": 2.90,
            "epsHigh": 3.35,
            "revenueAvg": 153_000_000_000,
            "revenueLow": 148_000_000_000,
            "revenueHigh": 158_000_000_000,
            "ebitdaAvg": 55_000_000_000,
            "ebitdaLow": 52_000_000_000,
            "ebitdaHigh": 58_000_000_000,
            "netIncomeAvg": 42_000_000_000,
            "netIncomeLow": 40_000_000_000,
            "netIncomeHigh": 44_000_000_000,
            "numAnalystsEps": 30,
            "numAnalystsRevenue": 25,
        }

    def test_mapping_produces_snake_case(self, fmp_raw_estimate):
        from unittest.mock import patch, MagicMock

        fmp = FMPService.__new__(FMPService)
        fmp.api_key = "fake"
        fmp._api_semaphore = MagicMock()

        with patch.object(fmp, "_request", return_value=[fmp_raw_estimate]):
            result = fmp.get_quarterly_analyst_estimates("AAPL", limit=1)

        assert result["status"] == "success"
        est = result["estimates"][0]

        # Core EPS fields
        assert est["eps_avg"] == 3.12
        assert est["eps_low"] == 2.90
        assert est["eps_high"] == 3.35

        # Revenue fields
        assert est["revenue_avg"] == 153_000_000_000
        assert est["revenue_low"] == 148_000_000_000
        assert est["revenue_high"] == 158_000_000_000

        # EBITDA fields
        assert est["ebitda_avg"] == 55_000_000_000

        # Net Income fields
        assert est["net_income_avg"] == 42_000_000_000

        # Analyst count
        assert est["num_analysts_eps"] == 30
        assert est["num_analysts_revenue"] == 25

    def test_no_camel_case_keys_in_output(self, fmp_raw_estimate):
        from unittest.mock import patch, MagicMock

        fmp = FMPService.__new__(FMPService)
        fmp.api_key = "fake"
        fmp._api_semaphore = MagicMock()

        with patch.object(fmp, "_request", return_value=[fmp_raw_estimate]):
            result = fmp.get_quarterly_analyst_estimates("AAPL", limit=1)

        est = result["estimates"][0]
        camel_keys = ["epsAvg", "epsLow", "epsHigh", "revenueAvg", "numAnalystsEps"]
        for key in camel_keys:
            assert key not in est, f"camelCase key '{key}' should not be in output"
