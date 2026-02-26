"""
Brew Router Unit Tests

Tests for _transform_digest_sections() from app.features.brew.router.
Pure transformation logic only - no network calls, no database access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_brew_router_unit.py -v
"""

import pytest

from app.features.brew.router import _transform_digest_sections
from app.features.brew.models import (
    StockAnalysis,
    DigestHeadlineNews,
    DigestBriefNews,
    DigestNewsSection,
    DigestEvent,
    DigestSummary,
)


@pytest.fixture
def full_digest_data():
    """Full digest data dict with all sections populated."""
    return {
        "stocks": [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "price": 192.50,
                "daily_change": "+1.5%",
                "week_change": "+3.2%",
                "status": "Strong uptrend",
                "quick_take": "iPhone demand remains solid.",
            },
            {
                "symbol": "NVDA",
                "name": "NVIDIA Corp",
                "price": 875.30,
                "daily_change": "+2.8%",
                "week_change": "+5.1%",
                "status": "AI momentum",
                "quick_take": "Data center revenue continues to accelerate.",
            },
        ],
        "news": {
            "headlines": [
                {
                    "title": "Chip stocks rally",
                    "related_symbols": ["NVDA", "AMD"],
                    "fact_summary": "Semiconductor ETF up 3%.",
                    "deep_analysis": "AI infrastructure spend drives sector.",
                    "url": "https://example.com/chips",
                }
            ],
            "briefs": [
                {
                    "title": "Apple supplier guidance",
                    "related_symbols": ["AAPL"],
                    "summary": "Key supplier raises guidance.",
                    "analysis": "Positive for iPhone supply chain.",
                    "url": "https://example.com/aapl-supply",
                }
            ],
        },
        "events": [
            {
                "date": "2025-01-28",
                "event": "Apple Q1 Earnings",
                "related_symbols": ["AAPL"],
                "why_important": "Key test for iPhone 16 cycle.",
            }
        ],
        "summary": {"content": "Both stocks are in bullish territory."},
    }


class TestTransformDigestSections:
    """Test _transform_digest_sections() from brew router."""

    def test_returns_four_elements(self, full_digest_data):
        """Transform returns a 4-element tuple (stocks, news, events, summary)."""
        result = _transform_digest_sections(full_digest_data)
        assert len(result) == 4

    def test_stocks_transformed(self, full_digest_data):
        """Stocks are transformed into StockAnalysis objects with correct data."""
        stocks, _, _, _ = _transform_digest_sections(full_digest_data)
        assert len(stocks) == 2
        assert isinstance(stocks[0], StockAnalysis)
        assert stocks[0].symbol == "AAPL"
        assert stocks[0].price == 192.50
        assert stocks[1].symbol == "NVDA"

    def test_news_headlines_transformed(self, full_digest_data):
        """News headlines are transformed into DigestHeadlineNews objects."""
        _, news, _, _ = _transform_digest_sections(full_digest_data)
        assert isinstance(news, DigestNewsSection)
        assert len(news.headlines) == 1
        assert isinstance(news.headlines[0], DigestHeadlineNews)
        assert news.headlines[0].title == "Chip stocks rally"

    def test_news_briefs_transformed(self, full_digest_data):
        """News briefs are transformed into DigestBriefNews objects."""
        _, news, _, _ = _transform_digest_sections(full_digest_data)
        assert len(news.briefs) == 1
        assert isinstance(news.briefs[0], DigestBriefNews)
        assert news.briefs[0].title == "Apple supplier guidance"

    def test_events_transformed(self, full_digest_data):
        """Events are transformed into DigestEvent objects."""
        _, _, events, _ = _transform_digest_sections(full_digest_data)
        assert len(events) == 1
        assert isinstance(events[0], DigestEvent)
        assert events[0].event == "Apple Q1 Earnings"
        assert events[0].date == "2025-01-28"

    def test_summary_transformed(self, full_digest_data):
        """Summary is transformed into a DigestSummary object."""
        _, _, _, summary = _transform_digest_sections(full_digest_data)
        assert isinstance(summary, DigestSummary)
        assert summary.content == "Both stocks are in bullish territory."

    def test_empty_data(self):
        """Empty dict produces empty defaults for all sections."""
        stocks, news, events, summary = _transform_digest_sections({})
        assert stocks == []
        assert isinstance(news, DigestNewsSection)
        assert news.headlines == []
        assert news.briefs == []
        assert events == []
        assert isinstance(summary, DigestSummary)
        assert summary.content == ""

    def test_news_as_non_dict(self):
        """When news value is not a dict, returns empty news section."""
        data = {"news": "not a dict"}
        _, news, _, _ = _transform_digest_sections(data)
        assert isinstance(news, DigestNewsSection)
        assert news.headlines == []
        assert news.briefs == []

    def test_summary_as_string(self):
        """When summary is a string (not dict), content defaults to empty."""
        data = {"summary": "just a string"}
        _, _, _, summary = _transform_digest_sections(data)
        assert isinstance(summary, DigestSummary)
        assert summary.content == ""

    def test_missing_stock_fields_use_defaults(self):
        """Stock entries missing fields fall back to defaults."""
        data = {"stocks": [{"symbol": "TSLA"}]}
        stocks, _, _, _ = _transform_digest_sections(data)
        assert len(stocks) == 1
        assert stocks[0].symbol == "TSLA"
        assert stocks[0].name == ""
        assert stocks[0].price == 0
        assert stocks[0].daily_change == ""
        assert stocks[0].week_change == ""
        assert stocks[0].status == ""
        assert stocks[0].quick_take == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
