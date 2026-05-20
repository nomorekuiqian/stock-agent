from app.features.portfolio.models import HoldingInput
from app.features.portfolio.service import auto_fill_shares


def test_auto_fill_shares_converts_cost_basis():
    rows = [HoldingInput(symbol="NVDA", cost_basis=10000)]
    prices = {"NVDA": 142.50}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is not None
    assert abs(filled[0].shares - 70.175438) < 0.01
    assert filled[0].entry_price == 142.50


def test_auto_fill_shares_skips_cash():
    rows = [HoldingInput(symbol="$CASH", cost_basis=5000)]
    prices = {}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
    assert filled[0].entry_price is None


def test_auto_fill_shares_skips_when_shares_already_set():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000, shares=50)]
    prices = {"AAPL": 200.0}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares == 50
    assert filled[0].entry_price is None


def test_auto_fill_shares_skips_when_no_price():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000)]
    prices = {}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
    assert filled[0].entry_price is None


def test_auto_fill_shares_skips_zero_price():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000)]
    prices = {"AAPL": 0.0}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
