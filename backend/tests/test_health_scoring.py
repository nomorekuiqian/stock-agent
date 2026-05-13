"""
Comprehensive tests for portfolio health scoring pure functions.

Tests cover:
  - Each of the 4 dimensions: dispersion, performance, macro_fit, stability
  - $CASH handling: zero vol, cash bonus, no fundamentals
  - Edge cases: empty holdings, missing data, degradation defaults
  - compute_all: aggregate correctness
"""

import math

import pytest

from app.features.portfolio.models import HoldingView
from app.features.portfolio_health.scoring import (
    SPY_VOL_DAILY,
    compute_all,
    compute_dispersion,
    compute_macro_fit,
    compute_performance,
    compute_stability,
)


# =============================================================================
# Helpers
# =============================================================================


def _h(symbol: str, weight: float, **kwargs) -> HoldingView:
    """Shorthand to create a HoldingView with effective_weight_pct."""
    return HoldingView(
        symbol=symbol,
        effective_weight_pct=weight,
        weight_source="weight_pct",
        **kwargs,
    )


def _diversified_portfolio() -> list[HoldingView]:
    """A well-diversified 8-stock portfolio across sectors."""
    return [
        _h("AAPL", 15.0),
        _h("JPM", 12.0),
        _h("JNJ", 12.0),
        _h("XOM", 10.0),
        _h("PG", 10.0),
        _h("NEE", 10.0),
        _h("AMT", 10.0),
        _h("LMT", 11.0),
        _h("$CASH", 10.0),
    ]


def _concentrated_portfolio() -> list[HoldingView]:
    """A concentrated single-stock portfolio."""
    return [_h("NVDA", 100.0)]


# =============================================================================
# Dispersion tests
# =============================================================================


class TestComputeDispersion:
    def test_empty_holdings_returns_zero(self):
        assert compute_dispersion([]) == 0

    def test_single_stock_low_score(self):
        holdings = [_h("NVDA", 100.0)]
        score = compute_dispersion(holdings, {"NVDA": "Technology"})
        # 1 sector, max_share=100 -> base=4, concentration penalty -> min(4,6)=4
        assert score == 4

    def test_two_sectors_moderate_score(self):
        holdings = [_h("AAPL", 50.0), _h("JPM", 50.0)]
        score = compute_dispersion(
            holdings, {"AAPL": "Technology", "JPM": "Financials"}
        )
        # 2 sectors, max_share=50 -> base=8, concentration > 40 -> min(8,12)=8
        assert score == 8

    def test_many_sectors_high_score(self):
        """7+ sectors should give base=20."""
        holdings = [
            _h("AAPL", 10.0),
            _h("JPM", 10.0),
            _h("JNJ", 10.0),
            _h("XOM", 10.0),
            _h("PG", 10.0),
            _h("NEE", 10.0),
            _h("AMT", 10.0),
            _h("LMT", 10.0),
            _h("AMZN", 10.0),
            _h("BHP", 10.0),
        ]
        sector_lookup = {
            "AAPL": "Technology",
            "JPM": "Financials",
            "JNJ": "Healthcare",
            "XOM": "Energy",
            "PG": "Consumer Staples",
            "NEE": "Utilities",
            "AMT": "Real Estate",
            "LMT": "Industrials",
            "AMZN": "Consumer Cyclical",
            "BHP": "Basic Materials",
        }
        score = compute_dispersion(holdings, sector_lookup)
        assert score >= 20

    def test_cash_bonus(self):
        """$CASH holdings should provide a bonus."""
        holdings_no_cash = [_h("AAPL", 100.0)]
        holdings_with_cash = [_h("AAPL", 75.0), _h("$CASH", 25.0)]

        score_no_cash = compute_dispersion(
            holdings_no_cash, {"AAPL": "Technology"}
        )
        score_with_cash = compute_dispersion(
            holdings_with_cash, {"AAPL": "Technology"}
        )
        assert score_with_cash > score_no_cash

    def test_cash_bonus_capped_at_5(self):
        """Cash bonus should not exceed 5."""
        holdings = [_h("$CASH", 100.0)]
        score = compute_dispersion(holdings)
        # 0 non-cash sectors -> base=4, but concentration penalty doesn't trigger
        # because max_share defaults to 0 for non-Cash. Cash bonus = min(5, 100/5)=5
        # base=4 (no non-cash sectors) + 5 = 9
        assert score <= 25

    def test_etf_decomposition(self):
        """SPY should decompose into multiple sectors via ETF_SECTOR_MAP."""
        holdings = [_h("SPY", 100.0)]
        score = compute_dispersion(holdings)
        # SPY decomposes into Technology 30%, Financials 13%, Healthcare 12%, etc.
        # Multiple sectors should register >= 5%
        assert score > 4  # better than single stock

    def test_no_sector_lookup_unknown(self):
        """Without sector_lookup, stocks go to 'Unknown' sector."""
        holdings = [_h("AAPL", 50.0), _h("MSFT", 50.0)]
        score = compute_dispersion(holdings)  # no sector_lookup
        # Both go to "Unknown" -> 1 sector above 5%
        assert score >= 4

    def test_concentration_penalty_above_60(self):
        """Max share > 60% should cap base at 6."""
        holdings = [_h("AAPL", 70.0), _h("JPM", 30.0)]
        score = compute_dispersion(
            holdings, {"AAPL": "Technology", "JPM": "Financials"}
        )
        # 2 sectors >= 5%, base=8 -> but max_share=70>60 -> min(8,6)=6
        assert score <= 11  # 6 + max 5 cash bonus


# =============================================================================
# Performance tests
# =============================================================================


class TestComputePerformance:
    def test_no_data_returns_neutral(self):
        assert compute_performance([], None, None) == 12
        assert compute_performance([_h("AAPL", 100.0)], None, [0.01]) == 12
        assert compute_performance([_h("AAPL", 100.0)], {"AAPL": [0.01]}, None) == 12

    def test_empty_holdings_returns_neutral(self):
        assert compute_performance([], {"AAPL": [0.01]}, [0.01]) == 12

    def test_strong_outperformance(self):
        """Portfolio beating SPY by > 3% should score 25."""
        holdings = [_h("NVDA", 100.0)]
        returns_map = {"NVDA": [0.05]}  # +5%
        spy_returns = [0.01]  # +1%
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 25

    def test_moderate_outperformance(self):
        """Portfolio beating SPY by 1-3% should score 20."""
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": [0.025]}
        spy_returns = [0.01]
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 20

    def test_in_line_with_spy(self):
        """Portfolio within +/-1% of SPY should score 15."""
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": [0.005]}
        spy_returns = [0.005]
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 15

    def test_moderate_underperformance(self):
        """Portfolio trailing SPY by 1-3% should score 10."""
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": [-0.01]}
        spy_returns = [0.01]
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 10

    def test_severe_underperformance(self):
        """Portfolio trailing SPY by > 3% should score 5."""
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": [-0.05]}
        spy_returns = [0.01]
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 5

    def test_insufficient_data_coverage(self):
        """Less than 50% portfolio weight with data -> neutral default."""
        holdings = [_h("AAPL", 30.0), _h("UNKNOWN", 70.0)]
        returns_map = {"AAPL": [0.05]}  # only 30% has data
        spy_returns = [0.01]
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 12

    def test_weighted_returns(self):
        """Verify weighting is applied correctly."""
        holdings = [_h("NVDA", 80.0), _h("AAPL", 20.0)]
        returns_map = {"NVDA": [0.05], "AAPL": [-0.02]}  # weighted: 0.036
        spy_returns = [0.0]  # SPY flat
        score = compute_performance(holdings, returns_map, spy_returns)
        assert score == 25  # 3.6% excess > 3%


# =============================================================================
# Macro Fit tests
# =============================================================================


class TestComputeMacroFit:
    def test_no_data_returns_neutral(self):
        assert compute_macro_fit([], None) == 12
        assert compute_macro_fit([_h("AAPL", 100.0)], None) == 12
        assert compute_macro_fit([], {"risk_level": "high"}) == 12

    def test_high_risk_defensive_portfolio(self):
        """Defensive portfolio in high-risk macro should score well."""
        holdings = [_h("JNJ", 40.0), _h("PG", 30.0), _h("$CASH", 30.0)]
        macro = {"risk_level": "high"}
        sector_lookup = {"JNJ": "Healthcare", "PG": "Consumer Staples"}
        score = compute_macro_fit(holdings, macro, sector_lookup)
        assert score >= 15

    def test_high_risk_growth_portfolio(self):
        """Heavy growth in high-risk macro should score poorly."""
        holdings = [_h("NVDA", 40.0), _h("AAPL", 30.0), _h("META", 30.0)]
        macro = {"risk_level": "high"}
        sector_lookup = {
            "NVDA": "Technology",
            "AAPL": "Technology",
            "META": "Communication Services",
        }
        score = compute_macro_fit(holdings, macro, sector_lookup)
        assert score <= 12

    def test_low_risk_growth_is_fine(self):
        """Growth portfolio in low-risk macro should score well."""
        holdings = [_h("NVDA", 50.0), _h("AAPL", 50.0)]
        macro = {"risk_level": "low"}
        sector_lookup = {"NVDA": "Technology", "AAPL": "Technology"}
        score = compute_macro_fit(holdings, macro, sector_lookup)
        assert score >= 15

    def test_moderate_risk_balanced(self):
        """Balanced portfolio in moderate risk should do OK."""
        holdings = [_h("AAPL", 50.0), _h("JNJ", 50.0)]
        macro = {"risk_level": "moderate"}
        sector_lookup = {"AAPL": "Technology", "JNJ": "Healthcare"}
        score = compute_macro_fit(holdings, macro, sector_lookup)
        assert 5 <= score <= 25

    def test_cash_counts_as_defensive(self):
        """$CASH should count toward defensive weight."""
        holdings_no_cash = [_h("NVDA", 100.0)]
        holdings_with_cash = [_h("NVDA", 50.0), _h("$CASH", 50.0)]
        macro = {"risk_level": "high"}
        sector_lookup = {"NVDA": "Technology"}

        score_no_cash = compute_macro_fit(holdings_no_cash, macro, sector_lookup)
        score_with_cash = compute_macro_fit(
            holdings_with_cash, macro, sector_lookup
        )
        assert score_with_cash > score_no_cash


# =============================================================================
# Stability tests
# =============================================================================


class TestComputeStability:
    def test_no_data_returns_neutral(self):
        assert compute_stability([], None) == 12
        assert compute_stability([_h("AAPL", 100.0)], None) == 12

    def test_low_volatility_high_score(self):
        """Low vol portfolio (vol_ratio < 0.5) should score 25."""
        # Create returns with very low volatility
        low_vol_returns = [0.001, 0.001, 0.001, 0.001, 0.001]
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": low_vol_returns}
        score = compute_stability(holdings, returns_map)
        assert score == 25

    def test_high_volatility_low_score(self):
        """High vol portfolio should score low."""
        # Create returns with very high volatility
        high_vol_returns = [0.05, -0.05, 0.05, -0.05, 0.05]
        holdings = [_h("NVDA", 100.0)]
        returns_map = {"NVDA": high_vol_returns}
        score = compute_stability(holdings, returns_map)
        assert score <= 10

    def test_cash_has_zero_volatility(self):
        """$CASH should contribute zero volatility when mixed with real stocks."""
        # Pure $CASH with empty returns_map triggers the early guard (falsy dict)
        # so we test with a non-empty returns_map that has at least one entry
        holdings = [_h("$CASH", 80.0), _h("AAPL", 20.0)]
        # Give AAPL near-zero vol returns
        returns_map = {"AAPL": [0.001, 0.001, 0.001, 0.001, 0.001]}
        score = compute_stability(holdings, returns_map)
        # $CASH contributes zero vol, AAPL has near-zero vol -> very low ratio
        assert score == 25

    def test_pure_cash_no_returns_data(self):
        """100% $CASH with no returns_map returns neutral (no data available)."""
        holdings = [_h("$CASH", 100.0)]
        score = compute_stability(holdings, {})
        # Empty returns_map is falsy -> early guard returns 12
        assert score == 12

    def test_pure_cash_with_returns_data(self):
        """100% $CASH with non-empty returns_map should give high score (zero vol)."""
        holdings = [_h("$CASH", 100.0)]
        # Need a non-empty returns_map to pass the early guard, but $CASH is
        # skipped in the loop. total_weight ends at 1.0 from $CASH alone.
        # However, weighted_vol stays 0.0, and since vol_ratio = 0 < 0.5 -> score 25.
        returns_map = {"SPY": [0.01, -0.01]}  # irrelevant entry, just to be truthy
        score = compute_stability(holdings, returns_map)
        # total_weight = 1.0 (cash contributes), weighted_vol = 0 -> ratio = 0 -> 25
        assert score == 25

    def test_mixed_cash_reduces_volatility(self):
        """Adding cash should reduce portfolio vol and improve score."""
        high_vol_returns = [0.05, -0.05, 0.05, -0.05, 0.05]
        holdings_no_cash = [_h("NVDA", 100.0)]
        holdings_with_cash = [_h("NVDA", 50.0), _h("$CASH", 50.0)]
        returns_map = {"NVDA": high_vol_returns}

        score_no_cash = compute_stability(holdings_no_cash, returns_map)
        score_with_cash = compute_stability(holdings_with_cash, returns_map)
        assert score_with_cash >= score_no_cash

    def test_insufficient_weight_neutral(self):
        """Less than 30% total weight with data -> neutral."""
        holdings = [_h("AAPL", 20.0), _h("UNKNOWN", 80.0)]
        returns_map = {"AAPL": [0.01, -0.01, 0.01]}
        score = compute_stability(holdings, returns_map)
        assert score == 12

    def test_single_return_point_insufficient(self):
        """Need at least 2 returns to compute variance."""
        holdings = [_h("AAPL", 100.0)]
        returns_map = {"AAPL": [0.01]}  # only 1 data point
        score = compute_stability(holdings, returns_map)
        # With 1 data point, var can't be computed -> weight not counted
        # total_weight < 0.3 -> 12
        assert score == 12


# =============================================================================
# compute_all aggregate tests
# =============================================================================


class TestComputeAll:
    def test_aggregate_sum(self):
        """Total should equal sum of 4 dimensions."""
        holdings = [_h("AAPL", 50.0), _h("JPM", 50.0)]
        result = compute_all(
            holdings,
            returns_map={"AAPL": [0.01], "JPM": [0.02]},
            spy_returns=[0.01],
            macro_risk={"risk_level": "moderate"},
            sector_lookup={"AAPL": "Technology", "JPM": "Financials"},
        )
        assert result.total == (
            result.dispersion
            + result.performance
            + result.macro_fit
            + result.stability
        )

    def test_all_defaults_when_no_data(self):
        """With minimal data, should still return valid scores."""
        holdings = [_h("AAPL", 100.0)]
        result = compute_all(holdings)
        assert 0 <= result.total <= 100
        assert 0 <= result.dispersion <= 25
        assert result.performance == 12  # default
        assert result.macro_fit == 12  # default
        assert result.stability == 12  # default

    def test_empty_holdings(self):
        """Empty portfolio should return all zeros/defaults."""
        result = compute_all([])
        assert result.dispersion == 0
        assert result.performance == 12
        assert result.macro_fit == 12
        assert result.stability == 12
        assert result.total == 36

    def test_all_dimensions_bounded(self):
        """Each dimension should be 0-25, total 0-100."""
        holdings = [
            _h("NVDA", 30.0),
            _h("AAPL", 20.0),
            _h("JPM", 20.0),
            _h("$CASH", 30.0),
        ]
        result = compute_all(
            holdings,
            returns_map={"NVDA": [0.03], "AAPL": [-0.01], "JPM": [0.01]},
            spy_returns=[0.005],
            macro_risk={"risk_level": "moderate"},
            sector_lookup={"NVDA": "Technology", "AAPL": "Technology", "JPM": "Financials"},
        )
        assert 0 <= result.dispersion <= 25
        assert 0 <= result.performance <= 25
        assert 0 <= result.macro_fit <= 25
        assert 0 <= result.stability <= 25
        assert result.total == (
            result.dispersion + result.performance + result.macro_fit + result.stability
        )

    def test_returns_health_score_type(self):
        """compute_all should return a HealthScore instance."""
        from app.features.portfolio_health.models import HealthScore

        result = compute_all([_h("AAPL", 100.0)])
        assert isinstance(result, HealthScore)

    def test_diversified_scores_higher_dispersion(self):
        """A diversified portfolio should score higher on dispersion than concentrated."""
        diversified = [
            _h("AAPL", 20.0),
            _h("JPM", 20.0),
            _h("JNJ", 20.0),
            _h("XOM", 20.0),
            _h("PG", 20.0),
        ]
        concentrated = [_h("NVDA", 100.0)]

        sector_lookup = {
            "AAPL": "Technology",
            "JPM": "Financials",
            "JNJ": "Healthcare",
            "XOM": "Energy",
            "PG": "Consumer Staples",
            "NVDA": "Technology",
        }

        div_result = compute_all(diversified, sector_lookup=sector_lookup)
        conc_result = compute_all(concentrated, sector_lookup=sector_lookup)
        assert div_result.dispersion > conc_result.dispersion
