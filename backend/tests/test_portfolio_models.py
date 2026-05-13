"""Tests for portfolio models and enrich_market_values."""

import pytest

from app.features.portfolio.models import HoldingInput, HoldingView
from app.features.portfolio.service import enrich_market_values


# ---------------------------------------------------------------------------
# HoldingInput
# ---------------------------------------------------------------------------


def test_holding_input_accepts_entry_price():
    h = HoldingInput(symbol="AAPL", cost_basis=1000.0, entry_price=150.0)
    assert h.entry_price == 150.0


def test_holding_input_entry_price_optional():
    h = HoldingInput(symbol="AAPL", cost_basis=1000.0)
    assert h.entry_price is None


# ---------------------------------------------------------------------------
# HoldingView computed fields
# ---------------------------------------------------------------------------


def test_holding_view_computed_fields():
    hv = HoldingView(
        symbol="AAPL",
        effective_weight_pct=50.0,
        weight_source="cost_basis",
        entry_price=150.0,
        market_value=1600.0,
        unrealized_pnl=100.0,
    )
    assert hv.entry_price == 150.0
    assert hv.market_value == 1600.0
    assert hv.unrealized_pnl == 100.0


# ---------------------------------------------------------------------------
# enrich_market_values
# ---------------------------------------------------------------------------


def _make_view(symbol: str, **kwargs) -> HoldingView:
    defaults = dict(
        effective_weight_pct=25.0,
        weight_source="cost_basis",
    )
    defaults.update(kwargs)
    return HoldingView(symbol=symbol, **defaults)


def test_enrich_market_values():
    """AAPL with shares + price -> market_value and pnl computed."""
    h = _make_view("AAPL", shares=10.0, cost_basis=1500.0)
    enrich_market_values([h], {"AAPL": 160.0})
    assert h.market_value == 1600.0
    assert h.unrealized_pnl == 100.0


def test_enrich_market_values_no_price():
    """No price in map -> fields stay None."""
    h = _make_view("TSLA", shares=5.0, cost_basis=2000.0)
    enrich_market_values([h], {})
    assert h.market_value is None
    assert h.unrealized_pnl is None


def test_enrich_market_values_cash_with_shares():
    """$CASH with shares -> market_value = shares."""
    h = _make_view("$CASH", shares=5000.0)
    enrich_market_values([h], {})
    assert h.market_value == 5000.0
    assert h.unrealized_pnl is None


def test_enrich_market_values_cash_no_shares():
    """$CASH with only cost_basis -> market_value = cost_basis."""
    h = _make_view("$CASH", cost_basis=3000.0)
    enrich_market_values([h], {})
    assert h.market_value == 3000.0
    assert h.unrealized_pnl is None
