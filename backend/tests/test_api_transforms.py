"""
API Data Transform Tests

Tests for transform_market_data_to_indices() in main.py.
Pure data transformation logic - no network calls, no database access.
"""

import pytest
from app.main import transform_market_data_to_indices


@pytest.fixture
def full_market_data():
    return {
        "equities": {
            "S&P 500": {"value": 4783.45, "daily_change": 0.52},
            "Nasdaq": {"value": 15320.10, "daily_change": 1.23},
        },
        "volatility": {
            "VIX": {"value": 18.5, "daily_change": -5.20},
        },
        "commodities": {
            "Gold": {"value": 2050.0, "daily_change": 0.25},
        },
        "currencies": {
            "US Dollar": {"value": 105.2, "daily_change": 0.10},
        },
        "credit": {
            "HYG": {"value": 95.3, "daily_change": -0.10},
        },
        "financials": {
            "XLF": {"value": 43.2, "daily_change": 0.50},
        },
        "rates": {
            "yield_curve": {
                "2Y": {"rate": 4.50, "daily_change": 0.02},
                "5Y": {"rate": 4.30, "daily_change": 0.01},
                "10Y": {"rate": 4.14, "daily_change": 0.03},
                "30Y": {"rate": 4.35, "daily_change": -0.01},
            }
        },
    }


class TestTransformMarketDataToIndices:
    """Test transform_market_data_to_indices function."""

    def test_standard_categories(self, full_market_data):
        """Equities, volatility, commodities, currencies, credit, financials all converted."""
        result = transform_market_data_to_indices(full_market_data)
        names = [idx["name"] for idx in result]
        assert "S&P 500" in names
        assert "VIX" in names
        assert "Gold" in names
        assert "US Dollar" in names
        assert "HYG" in names
        assert "XLF" in names

    def test_output_format(self, full_market_data):
        """Each index entry has name, value, change_percent keys."""
        result = transform_market_data_to_indices(full_market_data)
        for idx in result:
            assert "name" in idx
            assert "value" in idx
            assert "change_percent" in idx

    def test_treasury_rates_only_2y_10y(self, full_market_data):
        """Only 2Y and 10Y treasuries are included, displayed as '2Y Treasury'."""
        result = transform_market_data_to_indices(full_market_data)
        names = [idx["name"] for idx in result]
        assert "2Y Treasury" in names
        assert "10Y Treasury" in names
        assert "5Y Treasury" not in names
        assert "30Y Treasury" not in names

    def test_treasury_rate_values(self, full_market_data):
        """Treasury rate values come from 'rate' field, not 'value'."""
        result = transform_market_data_to_indices(full_market_data)
        ten_y = next(idx for idx in result if idx["name"] == "10Y Treasury")
        assert ten_y["value"] == 4.14
        assert ten_y["change_percent"] == 0.03

    def test_empty_dict_returns_empty_list(self):
        """Empty market_data returns empty list."""
        assert transform_market_data_to_indices({}) == []

    def test_missing_categories(self):
        """Partial data with missing categories does not crash."""
        partial = {
            "equities": {
                "S&P 500": {"value": 4783.45, "daily_change": 0.52},
            }
        }
        result = transform_market_data_to_indices(partial)
        assert len(result) == 1
        assert result[0]["name"] == "S&P 500"

    def test_missing_daily_change_defaults_zero(self):
        """Missing daily_change defaults to 0."""
        data = {
            "equities": {
                "SPY": {"value": 480.0},
            }
        }
        result = transform_market_data_to_indices(data)
        assert result[0]["change_percent"] == 0

    def test_treasury_missing_daily_change(self):
        """Treasury rate with missing daily_change defaults to 0."""
        data = {
            "rates": {
                "yield_curve": {
                    "10Y": {"rate": 4.14},
                }
            }
        }
        result = transform_market_data_to_indices(data)
        assert len(result) == 1
        assert result[0]["change_percent"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
