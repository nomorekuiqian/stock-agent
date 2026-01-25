"""
FMP News Service Tests

This file contains tests and real examples of FMP news data structure.
"""

import pytest
from unittest.mock import patch

# =============================================================================
# Real News Examples (captured from FMP API on 2025-12-09)
# =============================================================================

REAL_NEWS_EXAMPLES = [
    {
        "title": "Natural Gas and Oil Forecast: Traders Brace for EIA and OPEC+ Reports to Set 2025 Tone",
        "text": "Oil and natural gas retreat as growing supply forecasts, weak momentum signals, and bearish technical patterns raise downside risks ahead of key EIA and OPEC+ updates.",
        "source": "FXEmpire",
        "publishedDate": "2025-12-09 01:20:22",
        "url": "https://www.fxempire.com/forecasts/article/natural-gas-and-oil-forecast-traders-brace-for-eia-and-opec-reports-to-set-2025-tone-1487366",
        "image": "https://responsive.fxempire.com/v7/_fxempire_/2024/03/shutterstock_2165069127.jpg",
        "symbol": "USO",
        "type": "macro",
    },
    {
        "title": "Oil and Natural Gas Technical Analysis As Markets Eye Peace Talks and Fed Shift",
        "text": "Oil remains weak amid rising Iraqi supply and uncertain peace talks, while natural gas maintains bullish momentum.",
        "source": "FXEmpire",
        "publishedDate": "2025-12-08 22:02:43",
        "url": "https://www.fxempire.com/forecasts/article/oil-and-natural-gas-technical-analysis-as-markets-eye-peace-talks-and-fed-shift-1487271",
        "image": "https://responsive.fxempire.com/v7/_fxempire_/2024/03/shutterstock_2165069127.jpg",
        "symbol": "USO",
        "type": "macro",
    },
    {
        "title": "Top 50 High-Quality Dividend Growth Stocks For December 2025",
        "text": "I track a custom universe of 50 high-quality dividend growth stocks to identify timely, attractive investment opportunities based on valuation and forward return potential. 28 of these stocks currently offer estimated future returns of at least 10%, with 18 appearing potentially undervalued per my Free Cash Flow model. Top-ranked names like ResMed, Mastercard, and MSCI combine strong projected EPS growth with reasonable valuations.",
        "source": "Seeking Alpha",
        "publishedDate": "2025-12-08 21:03:44",
        "url": "https://seekingalpha.com/article/4745678-top-50-high-quality-dividend-growth-stocks-for-december-2025",
        "image": "https://static.seekingalpha.com/cdn/s3/uploads/getty_images/1411887222/image_1411887222.jpg",
        "symbol": "SPY",
        "type": "macro",
    },
]

# =============================================================================
# What the news data structure looks like
# =============================================================================
"""
FMP API returns news with these fields (see fmp_service.py:253-276):

{
    "title": str,           # News headline
    "text": str,            # Article summary/excerpt (truncated to 500 chars)
    "source": str,          # Publisher name (e.g., "Seeking Alpha", "FXEmpire")
    "publishedDate": str,   # ISO format datetime
    "url": str,             # Link to full article
    "image": str,           # Thumbnail image URL
    "symbol": str,          # Related ticker (e.g., "SPY", "USO")
    "type": str,            # Always "macro" for this service
}

Key observations about the "text" field:
- It's a summary/excerpt, NOT the full article
- Length varies: 100-500 characters typically
- Quality varies by source:
  - FXEmpire: Brief technical analysis summaries
  - Seeking Alpha: More detailed investment thesis excerpts
  - Bloomberg/Reuters: Factual news summaries
- The analyst agent does NOT fetch full articles from URLs
"""


# =============================================================================
# Tests
# =============================================================================


class TestFMPNewsStructure:
    """Test that FMP news has expected structure"""

    def test_news_has_required_fields(self):
        """Each news item should have all required fields"""
        required_fields = [
            "title",
            "text",
            "source",
            "publishedDate",
            "url",
            "symbol",
            "type",
        ]

        for news in REAL_NEWS_EXAMPLES:
            for field in required_fields:
                assert field in news, f"Missing field: {field}"

    def test_text_is_summary_not_full_article(self):
        """Text field should be a summary (< 500 chars), not full article"""
        for news in REAL_NEWS_EXAMPLES:
            text_length = len(news["text"])
            assert text_length <= 500, f"Text too long: {text_length} chars"
            assert text_length > 50, f"Text too short: {text_length} chars"

    def test_text_content_examples(self):
        """Show what the text summaries look like"""
        print("\n=== FMP News Text Examples ===\n")

        for i, news in enumerate(REAL_NEWS_EXAMPLES, 1):
            print(f"--- Example {i}: {news['symbol']} ---")
            print(f"Title: {news['title']}")
            print(f"Source: {news['source']}")
            print(f"Text ({len(news['text'])} chars):")
            print(f"  \"{news['text']}\"")
            print()


class TestFMPService:
    """Test FMP service functionality"""

    @patch("app.shared.fmp_service.httpx.Client")
    def test_parse_fmp_news_truncates_text(self, mock_client):
        """Test that text is truncated to 500 characters"""
        from app.shared.fmp_service import FMPService

        service = FMPService.__new__(FMPService)
        service.api_key = "test_key"

        # Simulate API response with very long text
        raw_news = [
            {
                "title": "Test News",
                "text": "A" * 1000,  # 1000 characters
                "publisher": "Test Source",
                "publishedDate": "2025-12-09 10:00:00",
                "url": "https://example.com/news",
                "image": "",
                "symbol": "SPY",
            }
        ]

        parsed = service._parse_fmp_news(raw_news)

        assert len(parsed) == 1
        assert len(parsed[0]["text"]) == 500  # Truncated to 500

    @patch("app.shared.fmp_service.httpx.Client")
    def test_parse_fmp_news_handles_empty_text(self, mock_client):
        """Test handling of news items with empty text"""
        from app.shared.fmp_service import FMPService

        service = FMPService.__new__(FMPService)
        service.api_key = "test_key"

        raw_news = [
            {
                "title": "News Without Text",
                "text": None,
                "publisher": "Test Source",
                "publishedDate": "2025-12-09 10:00:00",
                "url": "https://example.com/news",
                "image": "",
                "symbol": "QQQ",
            }
        ]

        parsed = service._parse_fmp_news(raw_news)

        assert len(parsed) == 1
        assert parsed[0]["text"] == ""


class TestNewsForAnalyst:
    """Test how news is passed to analyst agent"""

    def test_analyst_receives_summary_not_full_article(self):
        """
        Analyst agent receives the 'text' field which is a summary,
        NOT the full article content.

        The analyst agent does NOT have tools to fetch URLs,
        so it cannot access the full article.
        """
        # This is what the analyst agent sees in {news_data}
        news_for_analyst = {
            "count": len(REAL_NEWS_EXAMPLES),
            "articles": REAL_NEWS_EXAMPLES,
            "filters": {
                "date_from": "2025-12-09T00:00:00+00:00",
                "date_to": "2025-12-09T06:00:00+00:00",
            },
        }

        # Verify structure
        assert news_for_analyst["count"] == 3
        assert len(news_for_analyst["articles"]) == 3

        # Verify each article has summary text
        for article in news_for_analyst["articles"]:
            assert "text" in article
            assert len(article["text"]) <= 500
            # Analyst can see URL but cannot fetch it
            assert "url" in article


if __name__ == "__main__":
    # Run with: python -m pytest tests/test_fmp_news.py -v -s
    pytest.main([__file__, "-v", "-s"])
