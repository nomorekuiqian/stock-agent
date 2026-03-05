"""
Stock Picker Unit Tests -- generated from git diff

Tests for:
  - agent.py: execute_screener ticker extraction from symbol field
  - router.py: pick_reasons symbol validation logic
  - picker_agent.py: _parse_json_field utility
  - models.py: PickRequest / PickResult validation

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_picker_unit.py -v
"""

import json

import pytest

from app.features.screener.agent import (
    _current_universe,
    execute_screener,
)
from app.features.screener.picker_agent import _parse_json_field
from app.features.screener.models import PickRequest, PickResult


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
    """Tests for the pick_reasons symbol validation logic in router.py.

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
# Tests: _parse_json_field (picker_agent.py)
# ---------------------------------------------------------------------------

class TestParseJsonField:
    """Tests for _parse_json_field utility in picker_agent.py."""

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

class TestPickRequest:
    def test_valid_request(self):
        req = PickRequest(message="I want stable stocks")
        assert req.message == "I want stable stocks"
        assert req.history == []
        assert req.accumulated_filters == []

    def test_with_history(self):
        req = PickRequest(
            message="More please",
            history=[{"role": "user", "content": "hi"}],
            accumulated_filters=[{"field": "roe", "op": "gt", "value": 15}],
        )
        assert len(req.history) == 1
        assert len(req.accumulated_filters) == 1

    def test_message_max_length(self):
        with pytest.raises(Exception):
            PickRequest(message="x" * 501)


class TestPickResult:
    def test_minimal_result(self):
        r = PickResult(success=True)
        assert r.success is True
        assert r.message == ""
        assert r.options == []
        assert r.candidates == []
        assert r.pick_reasons == []

    def test_full_result(self):
        r = PickResult(
            success=True,
            message="Here are my picks",
            options=["A"],
            candidates=[{"symbol": "AAPL"}],
            candidate_count=1,
            universe_size=3680,
            pick_reasons=[{"symbol": "AAPL", "reason": "great"}],
            accumulated_filters=[{"field": "roe", "op": "gt", "value": 15}],
        )
        assert r.candidate_count == 1
        assert r.universe_size == 3680
        assert len(r.pick_reasons) == 1

    def test_reset_results_default_false(self):
        r = PickResult(success=True)
        assert r.reset_results is False

    def test_reset_results_true(self):
        r = PickResult(success=True, reset_results=True)
        assert r.reset_results is True

    def test_options_are_plain_strings(self):
        r = PickResult(
            success=True,
            options=["high dividend", "growth stocks"],
        )
        assert r.options == ["high dividend", "growth stocks"]
        assert all(isinstance(o, str) for o in r.options)
