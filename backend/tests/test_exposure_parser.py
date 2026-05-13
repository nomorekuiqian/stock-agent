"""Tests for portfolio/exposure_parser.py::get_true_exposure()."""

import pytest

from app.features.portfolio.models import HoldingView
from app.features.portfolio.exposure_parser import (
    ETF_SECTOR_MAP,
    get_true_exposure,
)


def _holding(symbol: str, weight: float, source: str = "weight_pct") -> HoldingView:
    return HoldingView(
        symbol=symbol, effective_weight_pct=weight, weight_source=source,
        weight_pct=weight, shares=None, cost_basis=None,
        thesis=None, target=None, stop_loss=None, conviction=None,
    )


class TestGetTrueExposure:

    def test_empty_holdings(self):
        assert get_true_exposure([]) == {}

    def test_single_stock(self):
        result = get_true_exposure(
            [_holding("AAPL", 100.0)],
            sector_lookup={"AAPL": "Technology"},
        )
        assert result == {"Technology": 100.0}

    def test_cash_goes_to_cash_sector(self):
        result = get_true_exposure([_holding("$CASH", 40.0)])
        assert result == {"Cash": 40.0}

    def test_etf_decomposed(self):
        result = get_true_exposure([_holding("XLK", 50.0)])
        assert result == {"Technology": 50.0}

    def test_spy_decomposed(self):
        result = get_true_exposure([_holding("SPY", 100.0)])
        assert abs(sum(result.values()) - 100.0) < 0.01
        assert result["Technology"] == pytest.approx(30.0, abs=0.01)

    def test_mixed_portfolio(self):
        result = get_true_exposure(
            [
                _holding("$CASH", 20.0),
                _holding("SPY", 50.0),
                _holding("AAPL", 30.0),
            ],
            sector_lookup={"AAPL": "Technology"},
        )
        assert result["Cash"] == 20.0
        tech = 50.0 * 0.30 + 30.0  # SPY tech portion + AAPL
        assert result["Technology"] == pytest.approx(tech, abs=0.01)
        assert abs(sum(result.values()) - 100.0) < 0.1

    def test_unknown_stock_without_lookup(self):
        result = get_true_exposure([_holding("ZZZZ", 100.0)])
        assert result == {"Unknown": 100.0}

    def test_zero_weight_ignored(self):
        result = get_true_exposure([_holding("AAPL", 0.0)], sector_lookup={"AAPL": "Technology"})
        assert result == {}

    def test_etf_sector_map_values_sum_to_one(self):
        for etf, sectors in ETF_SECTOR_MAP.items():
            total = sum(sectors.values())
            assert abs(total - 1.0) < 0.001, f"{etf} sector weights sum to {total}, expected 1.0"

    def test_multiple_etfs(self):
        result = get_true_exposure([
            _holding("XLK", 50.0),
            _holding("XLF", 50.0),
        ])
        assert result["Technology"] == 50.0
        assert result["Financials"] == 50.0
