"""
Research Agent Unit Tests -- generated from git diff

Tests for:
  - agent.py: execute_screener ticker extraction from symbol field
  - router.py: recommendations symbol validation logic
  - research_agent.py: _parse_json_field utility
  - models.py: ResearchRequest / ResearchResult validation

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_research_unit.py -v
"""

import json

import pytest

from app.features.screener.agent import (
    _current_universe,
    execute_screener,
)
from app.features.screener.research_agent import _parse_json_field
from app.features.screener.models import ResearchRequest, ResearchResult


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mini_universe():
    """Small universe with exchange-prefixed symbols for ticker extraction tests."""
    return [
        {
            "symbol": "NASDAQ:AAPL", "name": "Apple Inc.",
            "sector": "Technology Services", "price": 180,
            "market_cap": 3e12, "pe_ttm": 28, "roe": 25,
        },
        {
            "symbol": "NYSE:VRT", "name": "Vertiv Holdings, LLC",
            "sector": "Producer Manufacturing", "price": 95,
            "market_cap": 3.5e10, "pe_ttm": 35, "roe": 20,
        },
        {
            "symbol": "NASDAQ:MSFT", "name": "Microsoft Corporation",
            "sector": "Technology Services", "price": 420,
            "market_cap": 3.1e12, "pe_ttm": 32, "roe": 35,
        },
        {
            "symbol": "NYSE:JPM", "name": "JPMorgan Chase & Co.",
            "sector": "Finance", "price": 195,
            "market_cap": 5.5e11, "pe_ttm": 11, "roe": 16,
        },
    ]


# ---------------------------------------------------------------------------
# Tests: execute_screener ticker extraction (agent.py bug fix)
# ---------------------------------------------------------------------------

class TestExecuteScreenerTickerExtraction:
    """Tests that execute_screener extracts clean tickers from symbol field."""

    def test_strips_exchange_prefix(self, mini_universe):
        """NASDAQ:AAPL -> AAPL in preview ticker field."""
        _current_universe.set(mini_universe)
        try:
            result = json.loads(execute_screener("[]"))
            preview = result["preview"]
            tickers = [p["ticker"] for p in preview]
            assert "AAPL" in tickers
            assert "VRT" in tickers
            assert "MSFT" in tickers
            assert "JPM" in tickers
            # No exchange prefix in tickers
            for t in tickers:
                assert ":" not in t
        finally:
            _current_universe.set([])

    def test_empty_symbol_produces_empty_ticker(self):
        """Stock with no symbol field produces empty ticker."""
        universe = [{"name": "NoSymbol", "market_cap": 1e9}]
        _current_universe.set(universe)
        try:
            result = json.loads(execute_screener("[]"))
            assert result["preview"][0]["ticker"] == ""
        finally:
            _current_universe.set([])

    def test_symbol_without_prefix(self):
        """Symbol without exchange prefix is kept as-is."""
        universe = [{"symbol": "TSLA", "name": "Tesla", "market_cap": 8e11}]
        _current_universe.set(universe)
        try:
            result = json.loads(execute_screener("[]"))
            assert result["preview"][0]["ticker"] == "TSLA"
        finally:
            _current_universe.set([])

    def test_filtered_results_have_clean_tickers(self, mini_universe):
        """Filtered results also have clean tickers."""
        _current_universe.set(mini_universe)
        try:
            filters = json.dumps([{"field": "sector", "op": "eq", "value": "Technology Services"}])
            result = json.loads(execute_screener(filters))
            assert result["match_count"] == 2
            tickers = [p["ticker"] for p in result["preview"]]
            assert "AAPL" in tickers
            assert "MSFT" in tickers
            assert "VRT" not in tickers
        finally:
            _current_universe.set([])


# ---------------------------------------------------------------------------
# Tests: symbol validation logic (router.py)
# ---------------------------------------------------------------------------

class TestSymbolValidation:
    """Tests for the recommendations symbol validation logic in router.py.

    We test the logic inline since it's not extracted as a function.
    We replicate the same algorithm here to verify correctness.
    """

    @pytest.fixture
    def universe(self):
        return [
            {"symbol": "NASDAQ:AAPL", "name": "Apple Inc."},
            {"symbol": "NYSE:VRT", "name": "Vertiv Holdings, LLC"},
            {"symbol": "NASDAQ:MSFT", "name": "Microsoft Corporation"},
        ]

    @pytest.fixture
    def lookup_tables(self, universe):
        """Build the same lookup tables as router.py."""
        ticker_set = set()
        name_to_ticker = {}
        for s in universe:
            raw_sym = s.get("symbol", "")
            ticker = raw_sym.split(":")[-1] if raw_sym else ""
            if ticker:
                ticker_set.add(ticker.upper())
            name = s.get("name", "")
            if name and ticker:
                name_to_ticker[name.lower()] = ticker
        return ticker_set, name_to_ticker

    def _resolve_symbol(self, sym, ticker_set, name_to_ticker):
        """Replicate router.py symbol resolution logic."""
        sym = sym.strip()

        # Direct ticker match
        if sym.upper() in ticker_set:
            return sym.upper()

        # Strip exchange prefix
        if ":" in sym:
            stripped = sym.split(":")[-1].upper()
            if stripped in ticker_set:
                return stripped

        # Name lookup
        name_lower = sym.lower()
        if name_lower in name_to_ticker:
            return name_to_ticker[name_lower]

        # Fuzzy name match
        for name, ticker in name_to_ticker.items():
            if name_lower in name or name in name_lower:
                return ticker

        return None

    def test_direct_ticker_match(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("AAPL", ticker_set, name_to_ticker) == "AAPL"

    def test_direct_ticker_case_insensitive(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("aapl", ticker_set, name_to_ticker) == "AAPL"

    def test_exchange_prefix_stripped(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("NASDAQ:AAPL", ticker_set, name_to_ticker) == "AAPL"

    def test_company_name_to_ticker(self, lookup_tables):
        """Company name 'Vertiv Holdings, LLC' resolves to 'VRT'."""
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("Vertiv Holdings, LLC", ticker_set, name_to_ticker) == "VRT"

    def test_company_name_case_insensitive(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("apple inc.", ticker_set, name_to_ticker) == "AAPL"

    def test_fuzzy_name_match(self, lookup_tables):
        """Partial name match works."""
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("Microsoft", ticker_set, name_to_ticker) == "MSFT"

    def test_unresolvable_returns_none(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("NonexistentCompany", ticker_set, name_to_ticker) is None

    def test_whitespace_stripped(self, lookup_tables):
        ticker_set, name_to_ticker = lookup_tables
        assert self._resolve_symbol("  VRT  ", ticker_set, name_to_ticker) == "VRT"


# ---------------------------------------------------------------------------
# Tests: _parse_json_field (research_agent.py)
# ---------------------------------------------------------------------------

class TestParseJsonField:
    """Tests for _parse_json_field utility in research_agent.py."""

    def test_valid_json_string(self):
        result = _parse_json_field('[{"a": 1}]', [])
        assert result == [{"a": 1}]

    def test_invalid_json_returns_fallback(self):
        result = _parse_json_field("not json", ["fallback"])
        assert result == ["fallback"]

    def test_already_list_passthrough(self):
        data = [{"symbol": "AAPL"}]
        result = _parse_json_field(data, [])
        assert result is data

    def test_none_returns_fallback(self):
        result = _parse_json_field(None, "default")
        assert result == "default"

    def test_empty_json_array(self):
        result = _parse_json_field("[]", ["fallback"])
        assert result == []

    def test_int_returns_fallback(self):
        result = _parse_json_field(42, "default")
        assert result == "default"


# ---------------------------------------------------------------------------
# Tests: Pydantic models (models.py)
# ---------------------------------------------------------------------------

class TestResearchRequest:
    def test_valid_request(self):
        req = ResearchRequest(message="I want stable stocks")
        assert req.message == "I want stable stocks"
        assert req.history == []
        assert req.accumulated_filters == []

    def test_with_history(self):
        req = ResearchRequest(
            message="More please",
            history=[{"role": "user", "content": "hi"}],
            accumulated_filters=[{"field": "roe", "op": "gt", "value": 15}],
        )
        assert len(req.history) == 1
        assert len(req.accumulated_filters) == 1

    def test_message_max_length(self):
        with pytest.raises(Exception):
            ResearchRequest(message="x" * 501)


class TestResearchResult:
    def test_minimal_result(self):
        r = ResearchResult(success=True)
        assert r.success is True
        assert r.message == ""
        assert r.options == []
        assert r.candidates == []
        assert r.recommendations == []

    def test_full_result(self):
        r = ResearchResult(
            success=True,
            message="Here are my recommendations",
            options=["A"],
            candidates=[{"symbol": "AAPL"}],
            candidate_count=1,
            universe_size=3680,
            recommendations=[{"symbol": "AAPL", "reason": "great"}],
            accumulated_filters=[{"field": "roe", "op": "gt", "value": 15}],
        )
        assert r.candidate_count == 1
        assert r.universe_size == 3680
        assert len(r.recommendations) == 1

    def test_reset_results_default_false(self):
        r = ResearchResult(success=True)
        assert r.reset_results is False

    def test_reset_results_true(self):
        r = ResearchResult(success=True, reset_results=True)
        assert r.reset_results is True

    def test_options_are_plain_strings(self):
        r = ResearchResult(
            success=True,
            options=["high dividend", "growth stocks"],
        )
        assert r.options == ["high dividend", "growth stocks"]
        assert all(isinstance(o, str) for o in r.options)

    def test_navigate_field_default_none(self):
        r = ResearchResult(success=True)
        assert r.navigate is None

    def test_navigate_field_set(self):
        r = ResearchResult(
            success=True,
            navigate={"type": "stock", "params": {"symbol": "AAPL"}},
        )
        assert r.navigate["type"] == "stock"

    def test_data_freshness_and_is_stale(self):
        r = ResearchResult(
            success=True,
            data_freshness="2026-03-18T12:00:00Z",
            is_stale=True,
        )
        assert r.data_freshness == "2026-03-18T12:00:00Z"
        assert r.is_stale is True


# ---------------------------------------------------------------------------
# Tests: _format_daily_report_context (research_agent.py)
# ---------------------------------------------------------------------------

from app.features.screener.research_agent import (
    _format_daily_report_context,
    _format_macro_context,
    _format_brew_context,
    _recent_reports,
    get_report_by_date,
    list_recent_reports,
)


class TestFormatDailyReportContext:
    """Tests for _format_daily_report_context formatting function."""

    def test_full_context(self):
        ctx = {
            "date": "2026-03-18",
            "title": "Markets Rally on Fed Decision",
            "summary": "S&P 500 gained 1.5%",
            "intro": "Key points about the market today",
            "news": {
                "headlines": [
                    {"title": "Fed cuts rates"},
                    {"title": "Tech stocks surge"},
                ],
                "briefs": [
                    {"title": "Oil prices steady"},
                ],
            },
            "report_summary": [
                {"title": "Sector Overview", "content": "Tech led the rally"},
            ],
            "calendar": [
                {"date": "2026-03-19", "event": "CPI release"},
            ],
        }
        result = _format_daily_report_context(ctx)
        assert "2026-03-18 Daily Report" in result
        assert "Markets Rally on Fed Decision" in result
        assert "S&P 500 gained 1.5%" in result
        assert "Key points about the market today" in result
        assert "Fed cuts rates" in result
        assert "Tech stocks surge" in result
        assert "Oil prices steady" in result
        assert "Sector Overview" in result
        assert "Tech led the rally" in result
        assert "CPI release" in result

    def test_minimal_context(self):
        ctx = {"date": "2026-03-18"}
        result = _format_daily_report_context(ctx)
        assert "2026-03-18 Daily Report" in result
        # No extra sections for missing fields
        assert "Title" not in result
        assert "Summary" not in result

    def test_empty_context(self):
        result = _format_daily_report_context({})
        assert "latest Daily Report" in result

    def test_none_news(self):
        ctx = {"date": "2026-03-18", "news": None}
        result = _format_daily_report_context(ctx)
        assert "Headlines" not in result

    def test_empty_news(self):
        ctx = {"date": "2026-03-18", "news": {"headlines": [], "briefs": []}}
        result = _format_daily_report_context(ctx)
        assert "Headlines" not in result
        assert "Market Briefs" not in result

    def test_headlines_string_fallback(self):
        """Headlines can be plain strings instead of dicts."""
        ctx = {
            "news": {
                "headlines": ["plain headline"],
            },
        }
        result = _format_daily_report_context(ctx)
        assert "plain headline" in result

    def test_report_summary_non_list(self):
        """report_summary that's not a list is ignored."""
        ctx = {"report_summary": "just a string"}
        result = _format_daily_report_context(ctx)
        # Should not crash, and should not contain the string section
        assert "Summary" not in result

    def test_calendar_string_items(self):
        """Calendar items can be plain strings."""
        ctx = {"calendar": ["FOMC meeting March 20"]}
        result = _format_daily_report_context(ctx)
        assert "FOMC meeting March 20" in result

    def test_headlines_truncated_to_5(self):
        ctx = {
            "news": {
                "headlines": [{"title": "h%d" % i} for i in range(10)],
            },
        }
        result = _format_daily_report_context(ctx)
        assert "h4" in result
        assert "h5" not in result


# ---------------------------------------------------------------------------
# Tests: _format_macro_context (research_agent.py)
# ---------------------------------------------------------------------------


class TestFormatMacroContext:
    """Tests for _format_macro_context formatting function."""

    def test_full_context(self):
        ctx = {
            "week_label": "Mar 11 - Mar 15",
            "verdict": "Cautious optimism",
            "signal_lights": {
                "liquidity": "green",
                "economy": "yellow",
                "inflation": "red",
                "sentiment": "green",
            },
            "landscape": "Global markets stable",
            "narrative": "Fed remains cautious",
            "takeaway": "Stay diversified",
        }
        result = _format_macro_context(ctx)
        assert "Macro Risk Dashboard" in result
        assert "Mar 11 - Mar 15" in result
        assert "Cautious optimism" in result
        assert "Liquidity: Positive (green)" in result
        assert "Economy: Neutral (yellow)" in result
        assert "Inflation: Negative (red)" in result
        assert "Sentiment: Positive (green)" in result
        assert "Global markets stable" in result
        assert "Fed remains cautious" in result
        assert "Stay diversified" in result

    def test_empty_context(self):
        result = _format_macro_context({})
        assert "Macro Risk Dashboard" in result
        assert "Signal Lights" not in result

    def test_unknown_signal_color(self):
        ctx = {
            "signal_lights": {"liquidity": "purple"},
        }
        result = _format_macro_context(ctx)
        assert "Liquidity: purple (purple)" in result

    def test_unknown_dimension(self):
        ctx = {
            "signal_lights": {"geopolitics": "red"},
        }
        result = _format_macro_context(ctx)
        # Unknown dimension uses raw name
        assert "geopolitics: Negative (red)" in result

    def test_signal_lights_not_dict(self):
        ctx = {"signal_lights": "not a dict"}
        result = _format_macro_context(ctx)
        assert "Signal Lights" not in result


# ---------------------------------------------------------------------------
# Tests: _format_brew_context (research_agent.py)
# ---------------------------------------------------------------------------


class TestFormatBrewContext:
    """Tests for _format_brew_context formatting function."""

    def test_full_context(self):
        ctx = {
            "digest_date": "2026-03-18",
            "symbols_used": ["AAPL", "MSFT", "NVDA"],
            "greeting": "Good morning!",
            "one_line_summary": "Markets are mixed today",
            "stocks": [
                {
                    "symbol": "AAPL",
                    "name": "Apple",
                    "price": "180",
                    "daily_change": "1.5",
                    "quick_take": "Steady growth",
                },
            ],
            "news": {
                "headlines": [
                    {"title": "Apple announces new product"},
                ],
            },
            "summary_content": "Overall positive day for tech",
        }
        result = _format_brew_context(ctx)
        assert "Personalized Daily Digest" in result
        assert "2026-03-18" in result
        assert "AAPL, MSFT, NVDA" in result
        assert "Good morning!" in result
        assert "Markets are mixed today" in result
        assert "AAPL (Apple)" in result
        assert "Steady growth" in result
        assert "Apple announces new product" in result
        assert "Overall positive day for tech" in result

    def test_empty_context(self):
        result = _format_brew_context({})
        assert "Personalized Daily Digest" in result
        assert "watchlist" not in result

    def test_symbols_not_list(self):
        ctx = {"symbols_used": "AAPL"}
        result = _format_brew_context(ctx)
        assert "watchlist" not in result

    def test_stocks_truncated_to_10(self):
        ctx = {
            "stocks": [
                {"symbol": "S%d" % i, "name": "Stock%d" % i}
                for i in range(15)
            ],
        }
        result = _format_brew_context(ctx)
        assert "S9" in result
        assert "S10" not in result

    def test_news_none(self):
        ctx = {"news": None}
        result = _format_brew_context(ctx)
        assert "Headlines" not in result

    def test_news_headlines_not_list(self):
        ctx = {"news": {"headlines": "not a list"}}
        result = _format_brew_context(ctx)
        assert "Headlines" not in result


# ---------------------------------------------------------------------------
# Tests: get_report_by_date (research_agent.py)
# ---------------------------------------------------------------------------


class TestGetReportByDate:
    """Tests for get_report_by_date tool function."""

    def test_found(self):
        reports = [
            {
                "report_date": "2026-03-18",
                "title": "Daily Report",
                "summary": "Markets up",
                "intro": "Key info",
                "news": {"headlines": []},
                "report_summary": [],
                "calendar": [],
            },
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(get_report_by_date("2026-03-18"))
            assert result["found"] is True
            assert result["date"] == "2026-03-18"
            assert result["title"] == "Daily Report"
            assert result["summary"] == "Markets up"
        finally:
            _recent_reports.reset(token)

    def test_not_found(self):
        reports = [
            {"report_date": "2026-03-18"},
            {"report_date": "2026-03-17"},
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(get_report_by_date("2026-03-15"))
            assert result["found"] is False
            assert "2026-03-15" in result["error"]
            assert "2026-03-18" in result["error"]
            assert "2026-03-17" in result["error"]
        finally:
            _recent_reports.reset(token)

    def test_empty_reports(self):
        token = _recent_reports.set([])
        try:
            result = json.loads(get_report_by_date("2026-03-18"))
            assert result["found"] is False
        finally:
            _recent_reports.reset(token)

    def test_default_empty(self):
        """Default ContextVar value is empty list."""
        # When no token set in this context, default is []
        result = json.loads(get_report_by_date("2026-03-18"))
        assert result["found"] is False


# ---------------------------------------------------------------------------
# Tests: list_recent_reports (research_agent.py)
# ---------------------------------------------------------------------------


class TestListRecentReports:
    """Tests for list_recent_reports tool function."""

    def test_returns_recent_reports(self):
        reports = [
            {
                "report_date": "2026-03-18",
                "title": "Day 1",
                "summary": "Summary 1",
                "news": {"headlines": [{"title": "h1"}], "briefs": [{"title": "b1"}]},
            },
            {
                "report_date": "2026-03-17",
                "title": "Day 2",
                "summary": "Summary 2",
                "news": {"headlines": [], "briefs": []},
            },
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(list_recent_reports(7))
            assert result["count"] == 2
            assert result["reports"][0]["date"] == "2026-03-18"
            assert result["reports"][0]["headline_count"] == 1
            assert result["reports"][0]["brief_count"] == 1
            assert result["reports"][1]["headline_count"] == 0
        finally:
            _recent_reports.reset(token)

    def test_days_limit(self):
        reports = [
            {"report_date": "2026-03-18", "title": "Day 1"},
            {"report_date": "2026-03-17", "title": "Day 2"},
            {"report_date": "2026-03-16", "title": "Day 3"},
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(list_recent_reports(2))
            assert result["count"] == 2
            assert result["reports"][0]["date"] == "2026-03-18"
            assert result["reports"][1]["date"] == "2026-03-17"
        finally:
            _recent_reports.reset(token)

    def test_max_14_days(self):
        reports = [{"report_date": "2026-03-%02d" % d} for d in range(1, 20)]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(list_recent_reports(20))
            assert result["count"] == 14
        finally:
            _recent_reports.reset(token)

    def test_empty_reports(self):
        token = _recent_reports.set([])
        try:
            result = json.loads(list_recent_reports(7))
            assert result["count"] == 0
            assert result["reports"] == []
        finally:
            _recent_reports.reset(token)

    def test_news_not_dict(self):
        reports = [
            {"report_date": "2026-03-18", "news": "not a dict"},
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(list_recent_reports(7))
            assert result["reports"][0]["headline_count"] == 0
            assert result["reports"][0]["brief_count"] == 0
        finally:
            _recent_reports.reset(token)

    def test_news_none(self):
        reports = [
            {"report_date": "2026-03-18", "news": None},
        ]
        token = _recent_reports.set(reports)
        try:
            result = json.loads(list_recent_reports(7))
            assert result["reports"][0]["headline_count"] == 0
        finally:
            _recent_reports.reset(token)
