"""
Morning Report Unit Tests -- generated from git diff

Tests for:
- _normalize_report_data(): JSON string / literal \\n normalization
- _report_to_response(): DB row -> API response mapping
- FUTURES_TICKERS / ASIA_TICKERS / EUROPE_TICKERS constants

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_morning_report_unit.py -v
"""

import pytest

from app.features.morning_report.router import (
    _normalize_report_data,
    _report_to_response,
)
from app.shared.data_tools.market_data import (
    FUTURES_TICKERS,
    ASIA_TICKERS,
    EUROPE_TICKERS,
    CRYPTO_TICKERS_PREMARKET,
)


# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture
def mock_db_report():
    """Simulated morning report database row."""
    return {
        "id": "morning-uuid-123",
        "report_date": "2026-02-28",
        "timestamp": "2026-02-28T07:00:00Z",
        "title": "Futures Flat Ahead of PCE",
        "market_pulse": "Today looks cautious.",
        "futures": [
            {"name": "S&P 500 Futures", "value": 5100, "daily_change": 0.15},
        ],
        "futures_analysis": "Futures are mildly positive.",
        "global_markets": {
            "asia": [{"name": "Nikkei 225", "value": 39000, "daily_change": -0.3}],
            "europe": [],
            "other": [],
        },
        "global_markets_analysis": "Asian markets mixed.",
        "overnight_news": [{"title": "Fed minutes", "analysis": "No surprises."}],
        "today_focus": [{"title": "PCE Data", "analysis": "Key inflation gauge.", "time": "8:30 AM ET"}],
        "summary": [
            {"title": "overnight_review", "content": "Markets digested Fed."},
            {"title": "today_outlook", "content": "Focus on PCE."},
        ],
        "market_data": {"raw": True},
    }


# ===========================================================================
# TestNormalizeReportData
# ===========================================================================


class TestNormalizeReportData:
    """Tests for _normalize_report_data()."""

    def test_list_summary_unchanged(self):
        """Summary that's already a list stays unchanged."""
        data = {"summary": [{"title": "a", "content": "b"}]}
        result = _normalize_report_data(data)
        assert result["summary"] == [{"title": "a", "content": "b"}]

    def test_json_string_summary_parsed(self):
        """Summary stored as JSON string is parsed into a list."""
        import json
        sections = [{"title": "overnight_review", "content": "Overview."}]
        data = {"summary": json.dumps(sections)}
        result = _normalize_report_data(data)
        assert isinstance(result["summary"], list)
        assert result["summary"][0]["title"] == "overnight_review"

    def test_invalid_json_string_defaults_to_empty(self):
        """Non-JSON string summary defaults to empty list."""
        data = {"summary": "not valid json"}
        result = _normalize_report_data(data)
        assert result["summary"] == []

    def test_literal_backslash_n_in_market_pulse(self):
        """Literal '\\n' in market_pulse is replaced with real newline."""
        data = {"summary": [], "market_pulse": "Line1\\nLine2"}
        result = _normalize_report_data(data)
        assert result["market_pulse"] == "Line1\nLine2"

    def test_literal_backslash_n_in_summary_content(self):
        """Literal '\\n' in summary content is replaced with real newline."""
        data = {"summary": [{"title": "a", "content": "Para1\\nPara2"}]}
        result = _normalize_report_data(data)
        assert result["summary"][0]["content"] == "Para1\nPara2"

    def test_missing_summary_key(self):
        """Missing summary key defaults to empty list."""
        data = {}
        result = _normalize_report_data(data)
        assert result.get("summary", []) == []

    def test_none_market_pulse_untouched(self):
        """Non-string market_pulse is not modified."""
        data = {"summary": [], "market_pulse": None}
        result = _normalize_report_data(data)
        assert result["market_pulse"] is None


# ===========================================================================
# TestReportToResponse
# ===========================================================================


class TestReportToResponse:
    """Tests for _report_to_response()."""

    def test_maps_id_to_report_id(self, mock_db_report):
        """DB row 'id' maps to response 'report_id'."""
        result = _report_to_response(mock_db_report)
        assert result["report_id"] == "morning-uuid-123"

    def test_includes_report_date(self, mock_db_report):
        """Response includes report_date from DB row."""
        result = _report_to_response(mock_db_report)
        assert result["report_date"] == "2026-02-28"

    def test_includes_from_cache_true(self, mock_db_report):
        """Response sets from_cache=True for DB reads."""
        result = _report_to_response(mock_db_report)
        assert result["from_cache"] is True

    def test_includes_all_expected_fields(self, mock_db_report):
        """Response includes all morning report fields."""
        result = _report_to_response(mock_db_report)
        expected_keys = {
            "report_id", "report_date", "timestamp", "title",
            "market_pulse", "futures", "futures_analysis",
            "global_markets", "global_markets_analysis",
            "overnight_news", "today_focus", "summary",
            "market_data", "from_cache",
        }
        assert expected_keys.issubset(result.keys())

    def test_missing_fields_default_safely(self):
        """Minimal DB row produces safe defaults."""
        result = _report_to_response({"id": "abc"})
        assert result["report_id"] == "abc"
        assert result["report_date"] == ""
        assert result["title"] == ""
        assert result["futures"] == []
        assert result["overnight_news"] == []
        assert result["summary"] == []

    def test_normalizes_during_mapping(self):
        """_report_to_response applies normalization (e.g. JSON string summary)."""
        import json
        report = {
            "id": "xyz",
            "summary": json.dumps([{"title": "a", "content": "text\\nmore"}]),
        }
        result = _report_to_response(report)
        assert isinstance(result["summary"], list)
        assert result["summary"][0]["content"] == "text\nmore"


# ===========================================================================
# TestPremarketTickers
# ===========================================================================


class TestPremarketTickers:
    """Tests for pre-market ticker constant dicts."""

    def test_futures_tickers_contains_sp500(self):
        """FUTURES_TICKERS includes S&P 500 futures."""
        assert "S&P 500 Futures" in FUTURES_TICKERS
        assert FUTURES_TICKERS["S&P 500 Futures"] == "ES=F"

    def test_futures_tickers_contains_three(self):
        """FUTURES_TICKERS has exactly 3 indices."""
        assert len(FUTURES_TICKERS) == 3

    def test_asia_tickers_contains_nikkei(self):
        """ASIA_TICKERS includes Nikkei 225."""
        assert "Nikkei 225" in ASIA_TICKERS

    def test_europe_tickers_contains_dax(self):
        """EUROPE_TICKERS includes DAX."""
        assert "DAX" in EUROPE_TICKERS

    def test_crypto_premarket_contains_btc(self):
        """CRYPTO_TICKERS_PREMARKET includes BTC."""
        assert "BTC" in CRYPTO_TICKERS_PREMARKET
        assert CRYPTO_TICKERS_PREMARKET["BTC"] == "BTC-USD"


# ===========================================================================
# TestPrepareDataForMorningAgent
# ===========================================================================


class TestPrepareDataForMorningAgent:
    """Tests for _prepare_data_for_morning_agent()."""

    def _call(self, premarket_data=None, news=None, economic_calendar=None,
              earnings_calendar=None):
        """Helper to call _prepare_data_for_morning_agent with defaults."""
        from app.features.morning_report.agent import _prepare_data_for_morning_agent
        return _prepare_data_for_morning_agent(
            premarket_data=premarket_data or {},
            news=news or [],
            economic_calendar=economic_calendar or [],
            earnings_calendar=earnings_calendar or [],
        )

    # -- Spam filtering --

    def test_filters_deadline_alert(self):
        """News with 'DEADLINE ALERT' in title is removed."""
        news = [{"title": "DEADLINE ALERT: Firm Files Suit", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_class_action(self):
        """News with 'CLASS ACTION' in title is removed."""
        news = [{"title": "CLASS ACTION filed against XYZ", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_rosen_comma(self):
        """News with 'ROSEN,' in title is removed."""
        news = [{"title": "ROSEN, A Global Firm, Encourages", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_investors_with_losses(self):
        """News with 'INVESTORS WITH LOSSES' in title is removed."""
        news = [{"title": "INVESTORS WITH LOSSES Should Contact", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_encourages(self):
        """News with 'ENCOURAGES' in title is removed."""
        news = [{"title": "Law firm Encourages investors to act", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_lawsuit(self):
        """News with 'LAWSUIT' in title is removed."""
        news = [{"title": "Lawsuit Filed Against Tech Corp", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    def test_filters_case_insensitive(self):
        """Spam filtering is case-insensitive (title.upper() comparison)."""
        news = [{"title": "deadline alert: something", "url": "http://x.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    # -- article_id assignment --

    def test_article_id_uses_original_index(self):
        """article_id uses original list index, not sequential clean index."""
        news = [
            {"title": "DEADLINE ALERT: spam", "url": "http://spam.com"},
            {"title": "Real news about AAPL", "url": "http://real.com"},
            {"title": "More real news", "url": "http://real2.com"},
        ]
        result = self._call(news=news)
        # Item 0 filtered, items 1 and 2 kept with original indices
        assert len(result["news"]) == 2
        assert result["news"][0]["article_id"] == 1
        assert result["news"][1]["article_id"] == 2

    def test_article_id_starts_from_zero_when_no_spam(self):
        """When no items are filtered, article_id starts from 0."""
        news = [
            {"title": "Apple earnings beat", "url": "http://a.com"},
            {"title": "Fed holds rates", "url": "http://b.com"},
        ]
        result = self._call(news=news)
        assert result["news"][0]["article_id"] == 0
        assert result["news"][1]["article_id"] == 1

    # -- Non-spam items pass through --

    def test_non_spam_news_passes_through(self):
        """Normal news items are included with expected fields."""
        news = [
            {
                "title": "NVIDIA posts record revenue",
                "text": "Details here",
                "source": "Reuters",
                "url": "http://reuters.com/nvda",
                "publishedDate": "2026-02-28",
            }
        ]
        result = self._call(news=news)
        assert len(result["news"]) == 1
        item = result["news"][0]
        assert item["title"] == "NVIDIA posts record revenue"
        assert item["text"] == "Details here"
        assert item["source"] == "Reuters"
        assert item["url"] == "http://reuters.com/nvda"
        assert item["publishedDate"] == "2026-02-28"

    def test_empty_title_items_skipped(self):
        """News items with empty or missing title are skipped."""
        news = [{"title": "", "url": "http://x.com"}, {"url": "http://y.com"}]
        result = self._call(news=news)
        assert result["news"] == []

    # -- Economic calendar filtering --

    def test_economic_calendar_only_today(self):
        """Only today's economic events are kept."""
        from unittest.mock import patch
        calendar = [
            {"date": "2026-02-28 08:30:00", "event": "PCE", "previous": 2.6},
            {"date": "2026-02-27 10:00:00", "event": "GDP", "previous": 3.1},
            {"date": "2026-03-01 14:00:00", "event": "FOMC", "previous": None},
        ]
        with patch(
            "app.features.morning_report.agent.today_str",
            return_value="2026-02-28",
        ):
            result = self._call(economic_calendar=calendar)
        assert len(result["economic_calendar"]) == 1
        assert result["economic_calendar"][0]["event"] == "PCE"

    def test_economic_calendar_empty_input(self):
        """Empty economic calendar produces empty list."""
        result = self._call(economic_calendar=[])
        assert result["economic_calendar"] == []

    # -- Earnings calendar filtering --

    def test_earnings_calendar_only_today(self):
        """Only today's earnings are kept."""
        from unittest.mock import patch
        earnings = [
            {"date": "2026-02-28", "symbol": "AAPL", "time": "BMO"},
            {"date": "2026-03-01", "symbol": "MSFT", "time": "AMC"},
        ]
        with patch(
            "app.features.morning_report.agent.today_str",
            return_value="2026-02-28",
        ):
            result = self._call(earnings_calendar=earnings)
        assert len(result["earnings_calendar"]) == 1
        assert result["earnings_calendar"][0]["symbol"] == "AAPL"

    def test_earnings_calendar_empty_input(self):
        """Empty earnings calendar produces empty list."""
        result = self._call(earnings_calendar=[])
        assert result["earnings_calendar"] == []

    # -- Empty/None inputs --

    def test_empty_news_returns_empty(self):
        """Empty news list returns empty clean news."""
        result = self._call(news=[])
        assert result["news"] == []

    def test_premarket_data_passed_through(self):
        """premarket_data is passed through unchanged."""
        pdata = {"futures": [{"name": "ES", "value": 5100}]}
        result = self._call(premarket_data=pdata)
        assert result["premarket_data"] == pdata


# ===========================================================================
# TestResolveArticleUrls
# ===========================================================================


class TestResolveArticleUrls:
    """Tests for MorningReportAgent._resolve_article_urls()."""

    def _make_resolver(self):
        """Create a minimal object with the _resolve_article_urls method.

        MorningReportAgent.__init__ creates an InMemoryRunner which requires
        Google ADK setup. We avoid that by calling the unbound method directly
        on a bare object that shares the class.
        """
        from app.features.morning_report.agent import MorningReportAgent
        # Create a bare instance without triggering __init__/__new__ side effects
        obj = object.__new__(MorningReportAgent)
        return obj

    def test_numeric_id_resolves_to_url(self):
        """Numeric article_id '0' resolves to the URL from source_news[0]."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": "0"}]
        source_news = [{"url": "http://reuters.com/article1"}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == "http://reuters.com/article1"

    def test_numeric_id_resolves_multiple(self):
        """Multiple numeric article_ids resolve correctly."""
        resolver = self._make_resolver()
        news_items = [
            {"title": "A", "url": "0"},
            {"title": "B", "url": "2"},
        ]
        source_news = [
            {"url": "http://a.com"},
            {"url": "http://b.com"},
            {"url": "http://c.com"},
        ]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == "http://a.com"
        assert result[1]["url"] == "http://c.com"

    def test_valid_url_kept_as_is(self):
        """Already-valid URLs that exist in source_news are kept."""
        resolver = self._make_resolver()
        real_url = "http://reuters.com/article1"
        news_items = [{"title": "Test", "url": real_url}]
        source_news = [{"url": real_url}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == real_url

    def test_http_url_not_in_source_cleared(self):
        """HTTP URL not matching any source_news URL is cleared to empty."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": "http://unknown.com/fake"}]
        source_news = [{"url": "http://real.com/article"}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == ""

    def test_out_of_range_numeric_id_cleared(self):
        """Numeric article_id beyond source_news range is cleared to empty."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": "99"}]
        source_news = [{"url": "http://a.com"}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == ""

    def test_empty_news_items_returns_empty(self):
        """Empty news_items list returns empty list."""
        resolver = self._make_resolver()
        result = resolver._resolve_article_urls([], [{"url": "http://a.com"}])
        assert result == []

    def test_empty_source_news_returns_items_unchanged(self):
        """Empty source_news returns news_items as-is (no resolution possible)."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": "0"}]
        result = resolver._resolve_article_urls(news_items, [])
        # With empty source_news, function returns news_items unchanged
        assert result == news_items

    def test_non_url_non_numeric_string_cleared(self):
        """Non-URL, non-numeric string in url field is cleared to empty."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": "some-random-text"}]
        source_news = [{"url": "http://a.com"}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == ""

    def test_empty_url_field_stays_empty(self):
        """Empty string url field stays empty without errors."""
        resolver = self._make_resolver()
        news_items = [{"title": "Test", "url": ""}]
        source_news = [{"url": "http://a.com"}]
        result = resolver._resolve_article_urls(news_items, source_news)
        assert result[0]["url"] == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
