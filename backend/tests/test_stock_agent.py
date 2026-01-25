"""
Stock Agent Tests

Tests for _prepare_stock_data_for_analyst(), _empty_analysis(), ANALYSIS_FIELDS,
and StockAnalysisOutput schema in stock_agent.py.
Pure data preparation logic - no AI calls, no network access.
"""

import pytest
from agents.stock_agent import (
    _prepare_stock_data_for_analyst,
    _empty_analysis,
    ANALYSIS_FIELDS,
    StockAnalysisOutput,
)


@pytest.fixture
def full_stock_data():
    return {
        "meta": {"symbol": "NVDA"},
        "profile": {
            "symbol": "NVDA",
            "company_name": "NVIDIA Corporation",
            "company_name_zh": "英伟达",
            "classification": {"sector": "Technology", "industry": "Semiconductors"},
            "description": {
                "en": "A" * 800,
                "zh": "B" * 800,
            },
            "company_details": {"employees": 30000, "ipo_date": "1999-01-22"},
        },
        "quote": {
            "price": 875.50,
            "change_percent": 2.5,
            "market_cap": 2150000000000,
            "volume": 25000000,
            "week_52_high": 900.0,
            "week_52_low": 400.0,
        },
        "fundamentals": {
            "ttm": {"pe": 45.2, "pb": 15.3, "ps": 8.5, "roe": 0.35},
            "valuation": {"ev_ebitda": 22.5, "peg_ratio": 1.8},
            "growth": {"revenue_yoy": 0.26, "earnings_yoy": 0.45, "ni_yoy": 0.42},
            "profitability": {"gross_margin": 0.65, "net_margin": 0.55, "roa": 0.28},
        },
        "financials": {
            "latest_quarter": "Q4 2024",
            "quarters": [
                {
                    "period": f"2024-Q{i}",
                    "fiscal_quarter": f"FQ{i}",
                    "income_statement": {
                        "revenue": 60000000000 - i * 5000000000,
                        "net_income": 18000000000 - i * 2000000000,
                        "eps": 7.2 - i * 0.5,
                        "gross_profit_margin": 0.64,
                        "operating_income_margin": 0.48,
                    },
                }
                for i in range(6)
            ],
        },
    }


class TestPrepareStockDataForAnalyst:
    """Test _prepare_stock_data_for_analyst function."""

    def test_output_has_four_keys(self, full_stock_data):
        """Output contains profile, quote, fundamentals, financials."""
        result = _prepare_stock_data_for_analyst(full_stock_data)
        assert set(result.keys()) == {"profile", "quote", "fundamentals", "financials"}

    def test_description_truncated(self, full_stock_data):
        """description_en and description_zh are truncated to 500 chars."""
        result = _prepare_stock_data_for_analyst(full_stock_data)
        assert len(result["profile"]["description_en"]) <= 500
        assert len(result["profile"]["description_zh"]) <= 500

    def test_max_four_quarters(self, full_stock_data):
        """At most 4 quarters are retained."""
        result = _prepare_stock_data_for_analyst(full_stock_data)
        assert len(result["financials"]["quarters"]) == 4

    def test_quarter_fields_flattened(self, full_stock_data):
        """Quarter entries have flattened fields from income_statement."""
        result = _prepare_stock_data_for_analyst(full_stock_data)
        q = result["financials"]["quarters"][0]
        expected_keys = {
            "period",
            "fiscal_quarter",
            "revenue",
            "net_income",
            "eps",
            "gross_margin",
            "operating_margin",
        }
        assert set(q.keys()) == expected_keys

    def test_empty_stock_data_no_crash(self):
        """Empty input dict does not crash."""
        result = _prepare_stock_data_for_analyst({})
        assert "profile" in result
        assert "quote" in result
        assert "fundamentals" in result
        assert "financials" in result
        assert result["financials"]["quarters"] == []

    def test_profile_flattens_classification(self, full_stock_data):
        """Sector and industry are flattened from nested classification."""
        result = _prepare_stock_data_for_analyst(full_stock_data)
        assert result["profile"]["sector"] == "Technology"
        assert result["profile"]["industry"] == "Semiconductors"


class TestEmptyAnalysis:
    """Test _empty_analysis function."""

    def test_keys_match_analysis_fields(self):
        """_empty_analysis() keys match ANALYSIS_FIELDS tuple exactly."""
        result = _empty_analysis()
        assert set(result.keys()) == set(ANALYSIS_FIELDS)
        assert len(result) == len(ANALYSIS_FIELDS)

    def test_all_values_empty_string(self):
        """All values in _empty_analysis() are empty strings."""
        result = _empty_analysis()
        for key, value in result.items():
            assert value == "", f"Expected empty string for '{key}', got '{value}'"


class TestAnalysisFieldsSchemaConsistency:
    """Test ANALYSIS_FIELDS matches StockAnalysisOutput schema."""

    def test_fields_match_pydantic_model(self):
        """ANALYSIS_FIELDS tuple matches StockAnalysisOutput model fields exactly."""
        schema_fields = set(StockAnalysisOutput.model_fields.keys())
        assert set(ANALYSIS_FIELDS) == schema_fields


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
