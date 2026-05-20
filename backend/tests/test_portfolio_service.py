"""
Unit tests for features/portfolio/service.py::compute_effective_weights.

Pure function — no DB, no network. Tests the three resolution modes:
  shares*price → weight_pct normalized → equal weight.

Usage:
    cd backend && source venv/bin/activate
    pytest tests/test_portfolio_service.py -v
"""

import pytest

from app.features.portfolio.models import HoldingInput, HoldingRow
from app.features.portfolio.service import CASH_SYMBOL, compute_effective_weights


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def H(symbol, **kw):
    return HoldingInput(symbol=symbol, **kw)


def assert_close(a, b, eps=1e-3):
    assert abs(a - b) < eps, f"{a} vs {b}"


# ---------------------------------------------------------------------------
# Empty / degenerate
# ---------------------------------------------------------------------------


def test_empty_input_returns_empty_list():
    assert compute_effective_weights([]) == []


def test_single_holding_with_no_data_falls_to_equal():
    out = compute_effective_weights([H("AAPL")])
    assert len(out) == 1
    assert out[0].weight_source == "equal"
    assert_close(out[0].effective_weight_pct, 100.0)


# ---------------------------------------------------------------------------
# Mode 1: shares × price
# ---------------------------------------------------------------------------


def test_shares_mode_basic():
    out = compute_effective_weights(
        [H("AAPL", shares=10), H("MSFT", shares=5)],
        prices_map={"AAPL": 200, "MSFT": 400},
    )
    # AAPL notional 2000, MSFT notional 2000 → 50/50
    assert all(r.weight_source == "shares_x_price" for r in out)
    assert_close(out[0].effective_weight_pct, 50.0)
    assert_close(out[1].effective_weight_pct, 50.0)


def test_shares_mode_falls_back_when_one_price_missing():
    # Only AAPL has price → mode 1 ineligible → fall to weight_pct (none) → equal.
    out = compute_effective_weights(
        [H("AAPL", shares=10), H("MSFT", shares=5)],
        prices_map={"AAPL": 200},
    )
    assert all(r.weight_source == "equal" for r in out)


def test_shares_mode_falls_back_when_one_row_missing_shares():
    # AAPL has shares, MSFT doesn't → can't compute notional consistently.
    out = compute_effective_weights(
        [H("AAPL", shares=10), H("MSFT", weight_pct=20)],
        prices_map={"AAPL": 200, "MSFT": 400},
    )
    # Falls to mode 2 (weight_pct), MSFT 20 / 20 = 100%, AAPL 0
    assert all(r.weight_source == "weight_pct" for r in out)
    assert_close(out[0].effective_weight_pct, 0.0)
    assert_close(out[1].effective_weight_pct, 100.0)


def test_shares_mode_zero_total_falls_through():
    # All shares zero → notional total 0 → fall to mode 2 (none) → equal.
    out = compute_effective_weights(
        [H("AAPL", shares=0), H("MSFT", shares=0)],
        prices_map={"AAPL": 200, "MSFT": 400},
    )
    assert all(r.weight_source == "equal" for r in out)


# ---------------------------------------------------------------------------
# Mode 2: weight_pct normalized
# ---------------------------------------------------------------------------


def test_weight_pct_already_sums_to_100():
    out = compute_effective_weights(
        [H("AAPL", weight_pct=60), H("MSFT", weight_pct=40)]
    )
    assert all(r.weight_source == "weight_pct" for r in out)
    assert_close(out[0].effective_weight_pct, 60.0)
    assert_close(out[1].effective_weight_pct, 40.0)


def test_weight_pct_normalizes_when_sum_below_100():
    # Total 50 → AAPL 30/50=60%, MSFT 20/50=40%
    out = compute_effective_weights(
        [H("AAPL", weight_pct=30), H("MSFT", weight_pct=20)]
    )
    assert_close(out[0].effective_weight_pct, 60.0)
    assert_close(out[1].effective_weight_pct, 40.0)


def test_weight_pct_normalizes_when_sum_above_100():
    out = compute_effective_weights(
        [H("AAPL", weight_pct=80), H("MSFT", weight_pct=80)]
    )
    # Each 80/160 = 50%
    assert_close(out[0].effective_weight_pct, 50.0)
    assert_close(out[1].effective_weight_pct, 50.0)


def test_partial_weight_pct_treats_missing_as_zero():
    out = compute_effective_weights(
        [H("AAPL", weight_pct=30), H("MSFT")]  # MSFT has nothing
    )
    # Mode 2 on the active row (AAPL) → AAPL 100%, MSFT 0%.
    # Post-Bug-3 fix: MSFT has no quantitative data of its own → classified as
    # ghost, weight_source="ghost" (rather than "weight_pct"). Numerical
    # outcome is unchanged.
    assert out[0].weight_source == "weight_pct"
    assert out[1].weight_source == "ghost"
    assert_close(out[0].effective_weight_pct, 100.0)
    assert_close(out[1].effective_weight_pct, 0.0)


# ---------------------------------------------------------------------------
# Mode 3: equal fallback
# ---------------------------------------------------------------------------


def test_equal_fallback_three_holdings():
    out = compute_effective_weights([H("A"), H("B"), H("C")])
    assert all(r.weight_source == "equal" for r in out)
    for r in out:
        assert_close(r.effective_weight_pct, 100.0 / 3)


# ---------------------------------------------------------------------------
# $CASH handling
# ---------------------------------------------------------------------------


def test_cash_symbol_default_price_one():
    """compute_effective_weights must treat $CASH as price 1.0 even if not in prices_map."""
    out = compute_effective_weights(
        [H("AAPL", shares=10), H(CASH_SYMBOL, shares=1000)],
        prices_map={"AAPL": 100},  # no $CASH price
    )
    # AAPL notional 1000, $CASH notional 1000 → 50/50
    assert all(r.weight_source == "shares_x_price" for r in out)
    assert_close(out[0].effective_weight_pct, 50.0)
    assert_close(out[1].effective_weight_pct, 50.0)


def test_cash_in_weight_pct_mode():
    out = compute_effective_weights(
        [H("AAPL", weight_pct=70), H(CASH_SYMBOL, weight_pct=30)]
    )
    assert_close(out[0].effective_weight_pct, 70.0)
    assert_close(out[1].effective_weight_pct, 30.0)


# ---------------------------------------------------------------------------
# Order preservation
# ---------------------------------------------------------------------------


def test_input_order_preserved():
    syms = ["NVDA", "AMD", "TSLA", "AAPL", "MSFT"]
    out = compute_effective_weights([H(s) for s in syms])
    assert [h.symbol for h in out] == syms


# ---------------------------------------------------------------------------
# HoldingRow → HoldingInput bridge
# ---------------------------------------------------------------------------


def test_accepts_holdingrow():
    rows = [
        HoldingRow(user_id="u1", symbol="AAPL", weight_pct=60),
        HoldingRow(user_id="u1", symbol="MSFT", weight_pct=40),
    ]
    out = compute_effective_weights(rows)
    assert [h.symbol for h in out] == ["AAPL", "MSFT"]
    assert all(r.weight_source == "weight_pct" for r in out)


def test_rejects_unknown_type():
    with pytest.raises(TypeError):
        compute_effective_weights([{"symbol": "AAPL"}])  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Symbol normalization (HoldingInput validator)
# ---------------------------------------------------------------------------


def test_symbol_uppercased():
    h = HoldingInput(symbol="aapl")
    assert h.symbol == "AAPL"


def test_symbol_strips_whitespace():
    h = HoldingInput(symbol="  msft  ")
    assert h.symbol == "MSFT"


def test_symbol_allows_cash():
    h = HoldingInput(symbol="$CASH")
    assert h.symbol == CASH_SYMBOL


# ---------------------------------------------------------------------------
# Mode 1.5: cost_basis (amount) mode
# ---------------------------------------------------------------------------


def test_cost_basis_mode_basic():
    rows = [H("AAPL", cost_basis=5000), H("NVDA", cost_basis=3000), H("MSFT", cost_basis=2000)]
    result = compute_effective_weights(rows)
    assert result[0].weight_source == "cost_basis"
    assert_close(result[0].effective_weight_pct, 50.0)
    assert_close(result[1].effective_weight_pct, 30.0)
    assert_close(result[2].effective_weight_pct, 20.0)
    assert_close(sum(r.effective_weight_pct for r in result), 100.0)


def test_cost_basis_partial_rows():
    """Rows without cost_basis get 0 weight."""
    rows = [H("AAPL", cost_basis=8000), H("NVDA")]
    result = compute_effective_weights(rows)
    assert result[0].weight_source == "cost_basis"
    assert_close(result[0].effective_weight_pct, 100.0)
    assert_close(result[1].effective_weight_pct, 0.0)


def test_cost_basis_with_cash():
    rows = [H("AAPL", cost_basis=6000), H("$CASH", cost_basis=4000)]
    result = compute_effective_weights(rows)
    assert result[0].weight_source == "cost_basis"
    assert_close(result[0].effective_weight_pct, 60.0)
    assert_close(result[1].effective_weight_pct, 40.0)


def test_cost_basis_all_zero_falls_through():
    """cost_basis all zero → fall through to weight_pct or equal."""
    rows = [H("AAPL", cost_basis=0), H("NVDA", cost_basis=0)]
    result = compute_effective_weights(rows)
    assert result[0].weight_source == "equal"


def test_cost_basis_overrides_weight_pct():
    """cost_basis takes priority over weight_pct."""
    rows = [H("AAPL", cost_basis=7000, weight_pct=20), H("NVDA", cost_basis=3000, weight_pct=80)]
    result = compute_effective_weights(rows)
    assert result[0].weight_source == "cost_basis"
    assert_close(result[0].effective_weight_pct, 70.0)


def test_cost_basis_sums_to_100():
    """Rounding gap correction."""
    rows = [H("A", cost_basis=1000), H("B", cost_basis=1000), H("C", cost_basis=1000)]
    result = compute_effective_weights(rows)
    assert_close(sum(r.effective_weight_pct for r in result), 100.0, eps=0.001)


def test_shares_mode_overrides_cost_basis():
    """Mode 1 (shares*price) takes priority over cost_basis."""
    rows = [H("AAPL", shares=10, cost_basis=5000), H("NVDA", shares=5, cost_basis=3000)]
    prices = {"AAPL": 200.0, "NVDA": 100.0}
    result = compute_effective_weights(rows, prices_map=prices)
    assert result[0].weight_source == "shares_x_price"


def test_symbol_allows_dot_and_dash():
    # BRK.B and BF-B are real tickers
    assert HoldingInput(symbol="BRK.B").symbol == "BRK.B"
    assert HoldingInput(symbol="BF-B").symbol == "BF-B"


def test_symbol_rejects_quotes_and_commas():
    """Lock the SQL-injection vector at the API edge."""
    for bad in ['A","X', "A;DROP", "A B", "()", "AAPL'", '"AAPL"']:
        with pytest.raises(Exception):
            HoldingInput(symbol=bad)


def test_symbol_rejects_too_long():
    with pytest.raises(Exception):
        HoldingInput(symbol="A" * 17)


# ---------------------------------------------------------------------------
# Bug 3 regression: ghost rows from thesis-only PATCH
# ---------------------------------------------------------------------------


def test_ghost_row_kept_at_zero_with_real_cost_basis_holdings():
    """A thesis-only row (no shares/cost_basis/weight_pct) alongside real
    holdings must NOT pollute mode selection or steal weight.

    Real path that triggered the bug: user has [NVDA(cost=5k), MSFT(cost=3k),
    SPY(cost=2k)] portfolio, then answers a thesis on watchlist AAPL via PATCH.
    Result must be: real 3 split 100% by cost_basis; AAPL=0%/ghost.
    """
    rows = [
        H("NVDA", cost_basis=5000),
        H("MSFT", cost_basis=3000),
        H("SPY", cost_basis=2000),
        H("AAPL", thesis="long-term AI bet"),  # ghost row
    ]
    out = compute_effective_weights(rows)
    by_sym = {h.symbol: h for h in out}
    assert by_sym["AAPL"].weight_source == "ghost"
    assert by_sym["AAPL"].effective_weight_pct == 0.0
    assert by_sym["AAPL"].thesis == "long-term AI bet"
    # Real holdings split by cost_basis: 50/30/20
    assert by_sym["NVDA"].weight_source == "cost_basis"
    assert_close(by_sym["NVDA"].effective_weight_pct, 50.0)
    assert_close(by_sym["MSFT"].effective_weight_pct, 30.0)
    assert_close(by_sym["SPY"].effective_weight_pct, 20.0)


def test_ghost_row_does_not_break_shares_mode():
    """If real rows use shares mode, a thesis-only ghost row must not force
    fall-through to cost_basis or equal."""
    prices = {"NVDA": 100.0, "MSFT": 200.0}
    rows = [
        H("NVDA", shares=10),
        H("MSFT", shares=5),
        H("AAPL", thesis="watchlist conviction"),  # ghost
    ]
    out = compute_effective_weights(rows, prices_map=prices)
    by_sym = {h.symbol: h for h in out}
    assert by_sym["NVDA"].weight_source == "shares_x_price"
    assert by_sym["MSFT"].weight_source == "shares_x_price"
    # NVDA: 10*100=1000, MSFT: 5*200=1000 → 50/50
    assert_close(by_sym["NVDA"].effective_weight_pct, 50.0)
    assert_close(by_sym["MSFT"].effective_weight_pct, 50.0)
    assert by_sym["AAPL"].weight_source == "ghost"
    assert by_sym["AAPL"].effective_weight_pct == 0.0


def test_all_ghost_rows_falls_back_to_equal_weight():
    """No active rows at all: should NOT zero everyone out (would degrade
    onboarding-style flows where users list symbols without amounts). Falls
    back to equal-weight mode resolution on the full input list."""
    rows = [H("A"), H("B"), H("C")]
    out = compute_effective_weights(rows)
    assert all(r.weight_source == "equal" for r in out)
    for r in out:
        assert_close(r.effective_weight_pct, 100.0 / 3)


def test_ghost_does_not_break_weight_pct_mode():
    """Real row uses weight_pct, ghost row attaches at 0%/ghost."""
    rows = [
        H("AAPL", weight_pct=60),
        H("MSFT", weight_pct=40),
        H("GLD", thesis="hedge"),  # ghost
    ]
    out = compute_effective_weights(rows)
    by_sym = {h.symbol: h for h in out}
    assert by_sym["AAPL"].weight_source == "weight_pct"
    assert_close(by_sym["AAPL"].effective_weight_pct, 60.0)
    assert_close(by_sym["MSFT"].effective_weight_pct, 40.0)
    assert by_sym["GLD"].weight_source == "ghost"
    assert by_sym["GLD"].effective_weight_pct == 0.0


def test_ghost_preserves_input_order():
    """Output order matches input order even when ghost rows are interleaved."""
    rows = [
        H("AAPL", thesis="t"),       # ghost first
        H("NVDA", cost_basis=1000),  # active
        H("MSFT", thesis="t"),       # ghost second
    ]
    out = compute_effective_weights(rows)
    assert [h.symbol for h in out] == ["AAPL", "NVDA", "MSFT"]


# ---------------------------------------------------------------------------
# enrich_market_values — exposes live price + market_value to UI
# ---------------------------------------------------------------------------


def test_enrich_populates_price_and_market_value():
    """Holding with shares + live price → row carries price + market_value."""
    from app.features.portfolio.service import enrich_market_values

    rows = [H("AAPL", shares=10, cost_basis=1500)]
    out = compute_effective_weights(rows, prices_map={"AAPL": 200.0})
    enrich_market_values(out, {"AAPL": 200.0})

    assert out[0].price == 200.0
    assert out[0].market_value == 2000.0
    assert out[0].unrealized_pnl == 500.0


def test_enrich_populates_price_even_without_shares():
    """Watchlist-style ghost row (no shares) still gets the live price so the
    UI can render a current quote next to it."""
    from app.features.portfolio.service import enrich_market_values

    rows = [H("NVDA", thesis="watching")]  # ghost — no quantitative data
    out = compute_effective_weights(rows, prices_map={"NVDA": 800.0})
    enrich_market_values(out, {"NVDA": 800.0})

    assert out[0].price == 800.0
    assert out[0].market_value is None  # no shares → no market value


def test_enrich_skips_cash_price():
    """$CASH has no quote; its market_value comes from shares/cost_basis."""
    from app.features.portfolio.service import enrich_market_values

    rows = [H(CASH_SYMBOL, cost_basis=5000)]
    out = compute_effective_weights(rows, prices_map={CASH_SYMBOL: 1.0})
    enrich_market_values(out, {})  # no prices needed for cash

    assert out[0].price is None
    assert out[0].market_value == 5000.0


def test_enrich_missing_price_leaves_price_none():
    """Quote API failure → price stays None, no crash."""
    from app.features.portfolio.service import enrich_market_values

    rows = [H("AAPL", shares=10)]
    out = compute_effective_weights(rows, prices_map={"AAPL": 200.0})
    enrich_market_values(out, {})  # empty — simulates upstream failure

    assert out[0].price is None
    assert out[0].market_value is None
