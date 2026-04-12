"""
Data Tools Delegation & Caching Unit Tests

Tests that data_tools modules correctly delegate to underlying services
and that caching works as expected.

No network access, no database. All external calls are mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_data_tools_unit.py -v
"""

import pytest
import time as _time
from unittest.mock import patch, MagicMock


# ===========================================================================
# Quotes Delegation
# ===========================================================================


class TestQuotesDelegation:
    """Test that quotes.py delegates to fmp_service correctly."""

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_batch_quotes_delegates_to_fmp(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_batch_quotes

        mock_fmp = MagicMock()
        mock_fmp.get_stock_quotes.return_value = {
            "quotes": [{"symbol": "AAPL", "price": 150}],
            "count": 1,
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_batch_quotes(["AAPL"])

        mock_fmp.get_stock_quotes.assert_called_once_with(["AAPL"], use_cache=True)
        assert result["count"] == 1

    def test_get_batch_quotes_empty_symbols(self):
        from app.shared.data_tools.quotes import get_batch_quotes

        result = get_batch_quotes([])
        assert result["quotes"] == []
        assert result["count"] == 0

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_batch_quotes_passes_use_cache_false(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_batch_quotes

        mock_fmp = MagicMock()
        mock_fmp.get_stock_quotes.return_value = {"quotes": [], "count": 0}
        mock_get_fmp.return_value = mock_fmp

        get_batch_quotes(["AAPL"], use_cache=False)

        mock_fmp.get_stock_quotes.assert_called_once_with(["AAPL"], use_cache=False)


# ===========================================================================
# Fundamentals Delegation
# ===========================================================================


class TestFundamentalsDelegation:
    """Test that fundamentals.py delegates correctly."""

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_company_profile(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_company_profile

        mock_fmp = MagicMock()
        mock_fmp.get_company_profile_detail.return_value = {"company_name": "Apple"}
        mock_get_fmp.return_value = mock_fmp

        result = get_company_profile("AAPL")

        mock_fmp.get_company_profile_detail.assert_called_once_with("AAPL")
        assert result["company_name"] == "Apple"

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_income_statements(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_income_statements

        mock_fmp = MagicMock()
        mock_fmp.get_income_statement.return_value = [
            {"date": "2024-09-28", "revenue": 94930000000}
        ]
        mock_get_fmp.return_value = mock_fmp

        result = get_income_statements("AAPL", limit=4, period="quarter")

        mock_fmp.get_income_statement.assert_called_once_with(
            "AAPL", period="quarter", limit=4
        )
        assert len(result) == 1

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_balance_sheets(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_balance_sheets

        mock_fmp = MagicMock()
        mock_fmp.get_balance_sheet.return_value = [{"date": "2024-09-28"}]
        mock_get_fmp.return_value = mock_fmp

        result = get_balance_sheets("AAPL")

        mock_fmp.get_balance_sheet.assert_called_once_with(
            "AAPL", period="quarter", limit=8
        )
        assert len(result) == 1

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_cash_flows(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_cash_flows

        mock_fmp = MagicMock()
        mock_fmp.get_cash_flow_statement.return_value = [{"date": "2024-09-28"}]
        mock_get_fmp.return_value = mock_fmp

        result = get_cash_flows("AAPL")

        mock_fmp.get_cash_flow_statement.assert_called_once_with(
            "AAPL", period="quarter", limit=8
        )
        assert len(result) == 1

    @patch("app.shared.yfinance_service.get_yfinance_service")
    def test_get_ticker_snapshot_delegates_to_yfinance(self, mock_get_yf):
        from app.shared.data_tools.fundamentals import get_ticker_snapshot

        mock_yf = MagicMock()
        mock_yf.get_ticker_metrics.return_value = {"ttm": {"revenue": 100000}}
        mock_get_yf.return_value = mock_yf

        result = get_ticker_snapshot("AAPL")

        mock_yf.get_ticker_metrics.assert_called_once_with("AAPL")
        assert result["ttm"]["revenue"] == 100000

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_historical_metrics(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_historical_metrics

        mock_fmp = MagicMock()
        mock_fmp.get_historical_key_metrics.return_value = {
            "status": "success",
            "metrics": [{"date": "2024-01-01"}],
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_historical_metrics("AAPL", period="annual", limit=20)

        mock_fmp.get_historical_key_metrics.assert_called_once_with(
            "AAPL", period="annual", limit=20
        )
        assert result["status"] == "success"


# ===========================================================================
# Peers Delegation
# ===========================================================================


class TestPeersDelegation:
    """Test that peers.py delegates correctly."""

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_peer_companies_with_industry(self, mock_get_fmp):
        from app.shared.data_tools.peers import get_peer_companies

        mock_fmp = MagicMock()
        mock_fmp.get_industry_peers.return_value = {
            "status": "success",
            "peers": [{"symbol": "MSFT"}],
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_peer_companies("AAPL", industry="Technology")

        mock_fmp.get_industry_peers.assert_called_once_with(
            "Technology", exclude_symbol="AAPL", limit=10
        )
        assert result["peers"][0]["symbol"] == "MSFT"

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_peer_companies_fallback_to_stock_peers(self, mock_get_fmp):
        from app.shared.data_tools.peers import get_peer_companies

        mock_fmp = MagicMock()
        mock_fmp.get_stock_peers.return_value = {
            "status": "success",
            "peers": [{"symbol": "GOOGL"}],
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_peer_companies("AAPL")  # no industry

        mock_fmp.get_stock_peers.assert_called_once_with("AAPL")
        assert result["peers"][0]["symbol"] == "GOOGL"

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_get_peer_companies_industry_empty_falls_back(self, mock_get_fmp):
        """When industry query returns no peers, falls back to stock_peers."""
        from app.shared.data_tools.peers import get_peer_companies

        mock_fmp = MagicMock()
        mock_fmp.get_industry_peers.return_value = {
            "status": "success",
            "peers": [],
        }
        mock_fmp.get_stock_peers.return_value = {
            "status": "success",
            "peers": [{"symbol": "GOOGL"}],
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_peer_companies("AAPL", industry="Obscure Industry")

        # Empty peers list is falsy, so it falls back
        mock_fmp.get_stock_peers.assert_called_once_with("AAPL")
        assert result["peers"][0]["symbol"] == "GOOGL"


# ===========================================================================
# Search Delegation
# ===========================================================================


class TestSearchDelegation:
    """Test that search.py delegates correctly."""

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_search_stocks(self, mock_get_fmp):
        from app.shared.data_tools.search import search_stocks

        mock_fmp = MagicMock()
        mock_fmp.search_stocks.return_value = {
            "status": "success",
            "stocks": [{"symbol": "AAPL"}],
        }
        mock_get_fmp.return_value = mock_fmp

        result = search_stocks("apple", limit=5)

        mock_fmp.search_stocks.assert_called_once_with("apple", limit=5)
        assert result["stocks"][0]["symbol"] == "AAPL"


# ===========================================================================
# Market Data Delegation
# ===========================================================================


class TestMarketDataDelegation:
    """Test that market_data.py standalone methods delegate correctly."""

    @patch("app.shared.data_tools.market_data.get_fmp_service")
    def test_get_treasury_rates(self, mock_get_fmp):
        from app.shared.data_tools.market_data import get_treasury_rates

        mock_fmp = MagicMock()
        mock_fmp.get_treasury_rates_with_change.return_value = {
            "rates": {"10Y": 4.25},
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_treasury_rates()

        mock_fmp.get_treasury_rates_with_change.assert_called_once()
        assert result["rates"]["10Y"] == 4.25

    @patch("app.shared.data_tools.market_data.get_fmp_service")
    def test_get_commodity_quotes(self, mock_get_fmp):
        from app.shared.data_tools.market_data import get_commodity_quotes

        mock_fmp = MagicMock()
        mock_fmp.get_commodity_quotes.return_value = {
            "commodities": {"GCUSD": {"price": 2300}},
        }
        mock_get_fmp.return_value = mock_fmp

        result = get_commodity_quotes(["GCUSD"])

        mock_fmp.get_commodity_quotes.assert_called_once_with(["GCUSD"])
        assert result["commodities"]["GCUSD"]["price"] == 2300


# ===========================================================================
# Key Metrics TTM Cache
# ===========================================================================


class TestKeyMetricsTTMCache:
    """Test that get_key_metrics_ttm caches results for 10 minutes."""

    def setup_method(self):
        """Clear module-level cache before each test."""
        import app.shared.data_tools.fundamentals as mod

        mod._metrics_cache.clear()

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_second_call_uses_cache(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_key_metrics_ttm

        mock_fmp = MagicMock()
        mock_fmp.get_key_metrics_ttm.return_value = {
            "status": "success",
            "metrics": {"pe_ratio": 30},
        }
        mock_get_fmp.return_value = mock_fmp

        # First call hits the service
        result1 = get_key_metrics_ttm("AAPL")
        # Second call should use cache
        result2 = get_key_metrics_ttm("AAPL")

        assert mock_fmp.get_key_metrics_ttm.call_count == 1
        assert result1["metrics"]["pe_ratio"] == 30
        assert result2["metrics"]["pe_ratio"] == 30

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_different_symbols_not_cached(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_key_metrics_ttm

        mock_fmp = MagicMock()
        mock_fmp.get_key_metrics_ttm.return_value = {
            "status": "success",
            "metrics": {},
        }
        mock_get_fmp.return_value = mock_fmp

        get_key_metrics_ttm("AAPL")
        get_key_metrics_ttm("NVDA")

        assert mock_fmp.get_key_metrics_ttm.call_count == 2

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_case_insensitive_cache_key(self, mock_get_fmp):
        """Cache uses uppercased symbol so 'aapl' and 'AAPL' share a slot."""
        from app.shared.data_tools.fundamentals import get_key_metrics_ttm

        mock_fmp = MagicMock()
        mock_fmp.get_key_metrics_ttm.return_value = {
            "status": "success",
            "metrics": {},
        }
        mock_get_fmp.return_value = mock_fmp

        get_key_metrics_ttm("aapl")
        get_key_metrics_ttm("AAPL")

        # Both resolve to "AAPL" key, so only one API call
        assert mock_fmp.get_key_metrics_ttm.call_count == 1

    @patch("app.shared.fmp_service.get_fmp_service")
    @patch("time.time")
    def test_expired_cache_triggers_refresh(self, mock_time, mock_get_fmp):
        """After TTL expires (600s), a new API call is made."""
        import app.shared.data_tools.fundamentals as mod

        mock_fmp = MagicMock()
        mock_fmp.get_key_metrics_ttm.side_effect = [
            {"status": "success", "metrics": {"pe_ratio": 30}},
            {"status": "success", "metrics": {"pe_ratio": 32}},
        ]
        mock_get_fmp.return_value = mock_fmp

        # First call at t=1000
        mock_time.return_value = 1000.0
        result1 = mod.get_key_metrics_ttm("AAPL")

        # Second call at t=1700 (after 600s TTL)
        mock_time.return_value = 1700.0
        result2 = mod.get_key_metrics_ttm("AAPL")

        assert mock_fmp.get_key_metrics_ttm.call_count == 2
        assert result1["metrics"]["pe_ratio"] == 30
        assert result2["metrics"]["pe_ratio"] == 32


# ===========================================================================
# Realtime Quote Cache
# ===========================================================================


class TestRealtimeQuoteCache:
    """Test that get_realtime_quote caches results."""

    def setup_method(self):
        """Clear module-level cache before each test."""
        import app.shared.data_tools.quotes as mod

        mod._realtime_cache.clear()

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_second_call_uses_cache(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_realtime_quote

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = [
            {
                "price": 150,
                "change": 1.5,
                "changesPercentage": 1.0,
                "dayHigh": 152,
                "dayLow": 149,
                "previousClose": 148.5,
                "open": 149,
                "marketCap": 2400000000000,
                "volume": 50000000,
                "avgVolume": 60000000,
                "pe": 30,
                "eps": 5.0,
                "yearHigh": 180,
                "yearLow": 120,
            }
        ]
        mock_fmp._safe_float = lambda v: float(v) if v is not None else None
        mock_get_fmp.return_value = mock_fmp

        # First call hits the API
        result1 = get_realtime_quote("AAPL")
        # Second call should use cache
        result2 = get_realtime_quote("AAPL")

        assert mock_fmp._request.call_count == 1
        assert result1["price"] == 150.0
        assert result2["price"] == 150.0

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_different_symbols_not_cached(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_realtime_quote

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = [
            {
                "price": 100,
                "change": 1.0,
                "changesPercentage": 1.0,
                "dayHigh": 101,
                "dayLow": 99,
                "previousClose": 99,
                "open": 99.5,
                "marketCap": 1000000000,
                "volume": 10000000,
                "avgVolume": 12000000,
                "pe": 25,
                "eps": 4.0,
                "yearHigh": 120,
                "yearLow": 80,
            }
        ]
        mock_fmp._safe_float = lambda v: float(v) if v is not None else None
        mock_get_fmp.return_value = mock_fmp

        get_realtime_quote("AAPL")
        get_realtime_quote("NVDA")

        assert mock_fmp._request.call_count == 2

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_empty_response_returns_empty_dict(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_realtime_quote

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = []
        mock_get_fmp.return_value = mock_fmp

        result = get_realtime_quote("INVALID")

        assert result == {}

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_none_response_returns_empty_dict(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_realtime_quote

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = None
        mock_get_fmp.return_value = mock_fmp

        result = get_realtime_quote("BAD")

        assert result == {}

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_realtime_quote_field_mapping(self, mock_get_fmp):
        """Verify FMP field names are mapped to OpenBB-compatible names."""
        from app.shared.data_tools.quotes import get_realtime_quote

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = [
            {
                "price": 195.5,
                "change": 2.0,
                "changesPercentage": 1.03,
                "dayHigh": 196.2,
                "dayLow": 194.1,
                "previousClose": 193.5,
                "open": 194.0,
                "marketCap": 3000000000000,
                "volume": 54000000,
                "avgVolume": 55000000,
                "pe": 29.5,
                "eps": 6.63,
                "yearHigh": 199.62,
                "yearLow": 164.08,
            }
        ]
        mock_fmp._safe_float = lambda v: float(v) if v is not None else None
        mock_get_fmp.return_value = mock_fmp

        result = get_realtime_quote("AAPL")

        assert result["price"] == 195.5
        assert result["open"] == 194.0
        assert result["high"] == 196.2       # dayHigh -> high
        assert result["low"] == 194.1        # dayLow -> low
        assert result["close"] == 193.5      # previousClose -> close
        assert result["change"] == 2.0
        assert result["change_percent"] == 1.03  # changesPercentage -> change_percent
        assert result["market_cap"] == 3000000000000  # marketCap -> market_cap
        assert result["volume"] == 54000000
        assert result["avg_volume"] == 55000000   # avgVolume -> avg_volume
        assert result["pe_ratio"] == 29.5         # pe -> pe_ratio
        assert result["eps"] == 6.63
        assert result["week_52_high"] == 199.62   # yearHigh -> week_52_high
        assert result["week_52_low"] == 164.08    # yearLow -> week_52_low

    @patch("app.shared.fmp_service.get_fmp_service")
    @patch("time.time")
    def test_expired_cache_triggers_refresh(self, mock_time, mock_get_fmp):
        """After TTL expires (600s), a new API call is made."""
        import app.shared.data_tools.quotes as mod

        mock_fmp = MagicMock()
        mock_fmp._request.return_value = [
            {
                "price": 150,
                "change": 1.0,
                "changesPercentage": 0.67,
                "dayHigh": 151,
                "dayLow": 149,
                "previousClose": 149,
                "open": 149.5,
                "marketCap": 2400000000000,
                "volume": 50000000,
                "avgVolume": 60000000,
                "pe": 30,
                "eps": 5.0,
                "yearHigh": 180,
                "yearLow": 120,
            }
        ]
        mock_fmp._safe_float = lambda v: float(v) if v is not None else None
        mock_get_fmp.return_value = mock_fmp

        # First call at t=1000
        mock_time.return_value = 1000.0
        mod.get_realtime_quote("AAPL")

        # Second call at t=1700 (after 600s TTL)
        mock_time.return_value = 1700.0
        mod.get_realtime_quote("AAPL")

        assert mock_fmp._request.call_count == 2
