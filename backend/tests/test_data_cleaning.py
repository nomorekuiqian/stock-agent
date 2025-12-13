"""
Data Cleaning Functions Tests

Tests for _prepare_data_for_analyst and _clean_market_data functions.
These tests do NOT call Gemini API - they only test data transformation logic.
"""

import pytest
from agents.agent import _prepare_data_for_analyst, _clean_market_data


class TestCleanMarketData:
    """Test _clean_market_data function"""

    def test_removes_month_change(self):
        """month_change field should be removed from all assets"""
        data = {
            "equities": {
                "S&P 500": {
                    "value": 4783.45,
                    "daily_change": 0.52,
                    "week_change": 1.23,
                    "month_change": 2.15,
                }
            }
        }

        result = _clean_market_data(data)

        assert "month_change" not in result["equities"]["S&P 500"]
        assert result["equities"]["S&P 500"]["value"] == 4783.45
        assert result["equities"]["S&P 500"]["daily_change"] == 0.52
        assert result["equities"]["S&P 500"]["week_change"] == 1.23

    def test_preserves_status_and_report_date(self):
        """status and report_date should be preserved as-is"""
        data = {
            "status": "success",
            "report_date": {"date": "2024-03-01", "weekday": "Friday"},
            "equities": {"SPY": {"value": 100, "month_change": 5}},
        }

        result = _clean_market_data(data)

        assert result["status"] == "success"
        assert result["report_date"]["date"] == "2024-03-01"

    def test_handles_nested_rates_structure(self):
        """rates structure with yield_curve and spreads should be handled"""
        data = {
            "rates": {
                "yield_curve": {
                    "10Y": {"rate": 4.14, "daily_change": 0.03, "month_change": 0.1}
                },
                "spreads": {"10y_3m": -0.31},
            }
        }

        result = _clean_market_data(data)

        assert "month_change" not in result["rates"]["yield_curve"]["10Y"]
        assert result["rates"]["yield_curve"]["10Y"]["rate"] == 4.14
        assert result["rates"]["spreads"]["10y_3m"] == -0.31


class TestPrepareDataForAnalyst:
    """Test _prepare_data_for_analyst function"""

    def test_cleans_news_fields(self):
        """News should only have: title, text, source, url, publishedDate"""
        news = [
            {
                "title": "Fed signals pause",
                "text": "Federal Reserve...",
                "source": "Bloomberg",
                "url": "https://example.com",
                "publishedDate": "2024-03-01T14:00:00Z",
                "image": "https://img.com/1.jpg",  # Should be removed
                "symbol": "SPY",  # Should be removed
                "type": "macro",  # Should be removed
                "_source": "fmp",  # Should be removed
            }
        ]

        result = _prepare_data_for_analyst({}, news, [], [])

        assert len(result["news"]) == 1
        cleaned = result["news"][0]
        assert "title" in cleaned
        assert "text" in cleaned
        assert "source" in cleaned
        assert "url" in cleaned
        assert "publishedDate" in cleaned
        # Removed fields
        assert "image" not in cleaned
        assert "symbol" not in cleaned
        assert "type" not in cleaned
        assert "_source" not in cleaned

    def test_filters_news_without_url(self):
        """News without URL should be filtered out"""
        news = [
            {"title": "Has URL", "text": "...", "source": "A", "url": "https://a.com"},
            {"title": "No URL", "text": "...", "source": "B"},  # Missing url
            {"title": "Empty URL", "text": "...", "source": "C", "url": ""},  # Empty url
        ]

        result = _prepare_data_for_analyst({}, news, [], [])

        assert len(result["news"]) == 1
        assert result["news"][0]["title"] == "Has URL"

    def test_cleans_calendar_fields(self):
        """Calendar should only have: date, event, previous, estimate, is_key_event"""
        calendar = [
            {
                "date": "2024-03-08",
                "event": "Non-Farm Payrolls",
                "country": "US",  # Should be removed
                "currency": "USD",  # Should be removed
                "impact": "High",  # Should be removed
                "previous": 353000,
                "estimate": 200000,
                "actual": None,  # Should be removed
                "change": None,  # Should be removed
                "changePercentage": None,  # Should be removed
                "is_key_event": True,
            }
        ]

        result = _prepare_data_for_analyst({}, [], calendar, [])

        assert len(result["economic_calendar"]) == 1
        cleaned = result["economic_calendar"][0]
        assert cleaned["date"] == "2024-03-08"
        assert cleaned["event"] == "Non-Farm Payrolls"
        assert cleaned["previous"] == 353000
        assert cleaned["estimate"] == 200000
        assert cleaned["is_key_event"] is True
        # Removed fields
        assert "country" not in cleaned
        assert "currency" not in cleaned
        assert "impact" not in cleaned
        assert "actual" not in cleaned
        assert "change" not in cleaned
        assert "changePercentage" not in cleaned

    def test_cleans_earnings_fields(self):
        """Earnings should only have: symbol, date, epsEstimated, revenueEstimated, is_ai_related"""
        earnings = [
            {
                "symbol": "NVDA",
                "date": "2024-08-28",
                "epsEstimated": 0.64,
                "epsActual": None,  # Should be removed
                "revenueEstimated": 28000000000,
                "revenueActual": None,  # Should be removed
                "lastUpdated": "2024-02-29",  # Should be removed
                "is_ai_related": True,
            }
        ]

        result = _prepare_data_for_analyst({}, [], [], earnings)

        assert len(result["earnings_calendar"]) == 1
        cleaned = result["earnings_calendar"][0]
        assert cleaned["symbol"] == "NVDA"
        assert cleaned["date"] == "2024-08-28"
        assert cleaned["epsEstimated"] == 0.64
        assert cleaned["revenueEstimated"] == 28000000000
        assert cleaned["is_ai_related"] is True
        # Removed fields
        assert "epsActual" not in cleaned
        assert "revenueActual" not in cleaned
        assert "lastUpdated" not in cleaned

    def test_full_integration(self):
        """Test complete data cleaning pipeline"""
        market_data = {
            "status": "success",
            "equities": {
                "S&P 500": {"value": 4783, "daily_change": 0.5, "week_change": 1.2, "month_change": 2.1}
            },
        }
        news = [
            {"title": "News 1", "text": "...", "source": "A", "url": "https://a.com", "image": "img.jpg"}
        ]
        calendar = [{"date": "2024-03-08", "event": "CPI", "country": "US", "is_key_event": True}]
        earnings = [{"symbol": "AAPL", "date": "2024-07-25", "epsEstimated": 1.5, "lastUpdated": "x"}]

        result = _prepare_data_for_analyst(market_data, news, calendar, earnings)

        # Verify all sections are present
        assert "market_data" in result
        assert "news" in result
        assert "economic_calendar" in result
        assert "earnings_calendar" in result

        # Verify cleaning
        assert "month_change" not in result["market_data"]["equities"]["S&P 500"]
        assert "image" not in result["news"][0]
        assert "country" not in result["economic_calendar"][0]
        assert "lastUpdated" not in result["earnings_calendar"][0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
