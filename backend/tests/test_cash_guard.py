"""
Unit tests for shared/data_tools/_cash_guard.py and its application points
in shared/data_tools/quotes.py + shared/data_tools/fundamentals.py.

Goal: prove $CASH is *never* sent to FMP/yfinance, and that downstream
callers receive a stable virtual response.

Usage:
    cd backend && source venv/bin/activate
    pytest tests/test_cash_guard.py -v
"""

from unittest.mock import MagicMock, patch

import pytest

from app.shared.data_tools._cash_guard import (
    CASH_SYMBOL,
    cash_price,
    cash_profile,
    cash_quote,
    cash_returns,
    inject_cash_prices,
    inject_cash_profile_dict,
    inject_cash_quote,
    inject_cash_returns_series,
    is_cash,
    split_cash,
    without_cash,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


class TestSplitCash:
    def test_no_cash(self):
        symbols, has_cash = split_cash(["AAPL", "MSFT"])
        assert symbols == ["AAPL", "MSFT"]
        assert has_cash is False

    def test_only_cash(self):
        symbols, has_cash = split_cash([CASH_SYMBOL])
        assert symbols == []
        assert has_cash is True

    def test_mixed(self):
        symbols, has_cash = split_cash(["AAPL", CASH_SYMBOL, "MSFT"])
        assert symbols == ["AAPL", "MSFT"]
        assert has_cash is True

    def test_preserves_order(self):
        symbols, _ = split_cash(["NVDA", "AMD", CASH_SYMBOL, "TSLA", "MSFT"])
        assert symbols == ["NVDA", "AMD", "TSLA", "MSFT"]

    def test_empty(self):
        assert split_cash([]) == ([], False)


class TestPredicates:
    def test_is_cash_true(self):
        assert is_cash(CASH_SYMBOL) is True

    def test_is_cash_false(self):
        assert is_cash("AAPL") is False

    def test_is_cash_none(self):
        assert is_cash(None) is False

    def test_without_cash(self):
        assert without_cash(["AAPL", CASH_SYMBOL, "MSFT"]) == ["AAPL", "MSFT"]


class TestVirtualResponses:
    def test_cash_quote_shape(self):
        q = cash_quote()
        assert q["symbol"] == CASH_SYMBOL
        assert q["price"] == 1.0
        assert q["change"] == 0.0
        assert q["is_virtual"] is True

    def test_cash_profile_shape(self):
        p = cash_profile()
        assert p["symbol"] == CASH_SYMBOL
        assert p["sector"] == "Cash"
        assert p["beta"] == 0.0
        assert p["is_virtual"] is True

    def test_cash_price_constant(self):
        assert cash_price() == 1.0

    def test_cash_returns_length(self):
        assert cash_returns(5) == [0.0, 0.0, 0.0, 0.0, 0.0]
        assert cash_returns(0) == []
        assert cash_returns(-1) == []  # defensive


class TestInjectors:
    def test_inject_cash_quote_when_present(self):
        out = inject_cash_quote([{"symbol": "AAPL"}], has_cash=True)
        assert out[-1]["symbol"] == CASH_SYMBOL

    def test_inject_cash_quote_when_absent(self):
        out = inject_cash_quote([{"symbol": "AAPL"}], has_cash=False)
        assert all(q["symbol"] != CASH_SYMBOL for q in out)

    def test_inject_prices(self):
        out = inject_cash_prices({"AAPL": 200.0}, has_cash=True)
        assert out[CASH_SYMBOL] == 1.0

    def test_inject_returns(self):
        out = inject_cash_returns_series({"AAPL": [0.01, 0.02]}, has_cash=True, n=2)
        assert out[CASH_SYMBOL] == [0.0, 0.0]

    def test_inject_profile(self):
        out = inject_cash_profile_dict({}, has_cash=True)
        assert out[CASH_SYMBOL]["sector"] == "Cash"


# ---------------------------------------------------------------------------
# Application points: quotes.get_batch_quotes
# ---------------------------------------------------------------------------


class TestGetBatchQuotesGuard:
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_pure_real_symbols_passes_through(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_batch_quotes

        mock_fmp = MagicMock()
        mock_fmp.get_stock_quotes.return_value = {
            "quotes": [{"symbol": "AAPL", "price": 200}],
            "count": 1,
            "cached": False,
            "source": "fmp",
        }
        mock_get_fmp.return_value = mock_fmp

        out = get_batch_quotes(["AAPL"])

        mock_fmp.get_stock_quotes.assert_called_once_with(["AAPL"], use_cache=True)
        assert out["count"] == 1
        assert all(q["symbol"] != CASH_SYMBOL for q in out["quotes"])

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_cash_alone_does_not_call_fmp(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_batch_quotes

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp

        out = get_batch_quotes([CASH_SYMBOL])

        mock_fmp.get_stock_quotes.assert_not_called()
        assert out["count"] == 1
        assert out["quotes"][0]["symbol"] == CASH_SYMBOL
        assert out["quotes"][0]["price"] == 1.0

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_cash_filtered_from_real_request(self, mock_get_fmp):
        from app.shared.data_tools.quotes import get_batch_quotes

        mock_fmp = MagicMock()
        mock_fmp.get_stock_quotes.return_value = {
            "quotes": [
                {"symbol": "AAPL", "price": 200},
                {"symbol": "MSFT", "price": 400},
            ],
            "count": 2,
            "cached": False,
            "source": "fmp",
        }
        mock_get_fmp.return_value = mock_fmp

        out = get_batch_quotes(["AAPL", CASH_SYMBOL, "MSFT"])

        # FMP must NOT receive $CASH.
        called_args, called_kwargs = mock_fmp.get_stock_quotes.call_args
        assert called_args[0] == ["AAPL", "MSFT"]
        assert CASH_SYMBOL not in called_args[0]

        # Output must include $CASH.
        assert out["count"] == 3
        assert any(q["symbol"] == CASH_SYMBOL for q in out["quotes"])

    def test_empty_symbols_returns_empty(self):
        from app.shared.data_tools.quotes import get_batch_quotes

        out = get_batch_quotes([])
        assert out["count"] == 0
        assert out["quotes"] == []


# ---------------------------------------------------------------------------
# Application points: fundamentals.get_company_profile
# ---------------------------------------------------------------------------


class TestGetCompanyProfileGuard:
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_cash_returns_virtual_without_calling_fmp(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_company_profile

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp

        out = get_company_profile(CASH_SYMBOL)

        mock_fmp.get_company_profile_detail.assert_not_called()
        assert out["symbol"] == CASH_SYMBOL
        assert out["sector"] == "Cash"
        assert out["is_virtual"] is True

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_real_symbol_calls_fmp(self, mock_get_fmp):
        from app.shared.data_tools.fundamentals import get_company_profile

        mock_fmp = MagicMock()
        mock_fmp.get_company_profile_detail.return_value = {
            "symbol": "AAPL", "sector": "Technology",
        }
        mock_get_fmp.return_value = mock_fmp

        out = get_company_profile("AAPL")

        mock_fmp.get_company_profile_detail.assert_called_once_with("AAPL")
        assert out["sector"] == "Technology"
