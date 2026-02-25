"""
Unit tests for _compute_target_price_inputs().

Tests the tiered Bear/Base/Bull target price computation logic:
- Tier 1: Analyst consensus (>= 5 analysts)
- Tier 2: Thin analyst coverage (2-4 analysts)
- Tier 3: Multiples fallback (0-1 analysts)
- Edge cases: missing fields, zero price, negative EPS
"""

import pytest

from app.features.stock.agent import _compute_target_price_inputs


# ---------------------------------------------------------------------------
# Helpers: build test fixtures
# ---------------------------------------------------------------------------

def _make_fundamentals(
    forward_eps=None,
    net_income_yoy=None,
    analyst_targets=None,
):
    result = {}
    if forward_eps is not None:
        result["forward_eps"] = forward_eps
    growth = {}
    if net_income_yoy is not None:
        growth["net_income_yoy"] = net_income_yoy
    if growth:
        result["growth"] = growth
    if analyst_targets is not None:
        result["analyst_targets"] = analyst_targets
    return result


def _make_valuation_comparison(
    peer_pes=None,
    hist_pes=None,
    industry_pe=None,
    industry_name=None,
):
    vc = {}
    if peer_pes is not None:
        vc["peer_comparison"] = {
            "peers": [
                {"symbol": "PEER%d" % i, "metrics": {"pe_ratio": pe}}
                for i, pe in enumerate(peer_pes)
            ],
        }
    if hist_pes is not None:
        vc["historical_valuation"] = {
            "years": [
                {"year": str(2025 - i), "pe": pe}
                for i, pe in enumerate(hist_pes)
            ],
        }
    if industry_pe is not None:
        vc["industry_valuation"] = {
            "industry_pe": industry_pe,
            "industry": industry_name or "Technology",
        }
    return vc


def _make_analyst_targets(
    target_median=None,
    target_low=None,
    target_high=None,
    target_mean=None,
    number_of_analysts=None,
    recommendation=None,
):
    targets = {}
    if target_median is not None:
        targets["target_median"] = target_median
    if target_low is not None:
        targets["target_low"] = target_low
    if target_high is not None:
        targets["target_high"] = target_high
    if target_mean is not None:
        targets["target_mean"] = target_mean
    if number_of_analysts is not None:
        targets["number_of_analysts"] = number_of_analysts
    if recommendation is not None:
        targets["recommendation"] = recommendation
    return targets


# ---------------------------------------------------------------------------
# Tests: Tier 1 - Rich analyst coverage (>= 5 analysts)
# ---------------------------------------------------------------------------


class TestTier1AnalystConsensus:
    """Tier 1: >= 5 analysts, use consensus targets directly."""

    def test_basic_analyst_consensus(self):
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=160.0,
            target_high=250.0,
            number_of_analysts=15,
            recommendation="buy",
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 180.0)

        assert result is not None
        assert result["source"] == "analyst_consensus"
        assert result["bear"] == 160.0
        assert result["base"] == 200.0
        assert result["bull"] == 250.0
        assert result["number_of_analysts"] == 15
        assert result["recommendation"] == "buy"

    def test_upside_downside_calculation(self):
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=150.0,
            target_high=250.0,
            number_of_analysts=10,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 200.0)

        assert result is not None
        assert result["current_price"] == 200.0
        # upside_to_base = (200-200)/200*100 = 0.0%
        assert result["upside_to_base"] == 0.0
        # upside_to_bull = (250-200)/200*100 = 25.0%
        assert result["upside_to_bull"] == 25.0
        # downside_to_bear = (150-200)/200*100 = -25.0%
        assert result["downside_to_bear"] == -25.0

    def test_exactly_5_analysts(self):
        analyst = _make_analyst_targets(
            target_median=100.0,
            target_low=80.0,
            target_high=120.0,
            number_of_analysts=5,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 90.0)

        assert result is not None
        assert result["source"] == "analyst_consensus"

    def test_no_recommendation_field(self):
        analyst = _make_analyst_targets(
            target_median=100.0,
            target_low=80.0,
            target_high=120.0,
            number_of_analysts=8,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 90.0)

        assert result is not None
        assert "recommendation" not in result


# ---------------------------------------------------------------------------
# Tests: Tier 2 - Thin analyst coverage (2-4 analysts)
# ---------------------------------------------------------------------------


class TestTier2ThinCoverage:
    """Tier 2: 2-4 analysts, use targets but flag thin coverage."""

    def test_thin_coverage_4_analysts(self):
        analyst = _make_analyst_targets(
            target_median=50.0,
            target_low=40.0,
            target_high=65.0,
            number_of_analysts=4,
            recommendation="hold",
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 45.0)

        assert result is not None
        assert result["source"] == "analyst_consensus_thin"
        assert result["bear"] == 40.0
        assert result["base"] == 50.0
        assert result["bull"] == 65.0
        assert "coverage_note" in result
        assert "4" in result["coverage_note"]

    def test_thin_coverage_2_analysts(self):
        analyst = _make_analyst_targets(
            target_median=300.0,
            target_low=250.0,
            target_high=350.0,
            number_of_analysts=2,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 280.0)

        assert result is not None
        assert result["source"] == "analyst_consensus_thin"
        assert "2" in result["coverage_note"]

    def test_thin_coverage_3_analysts(self):
        analyst = _make_analyst_targets(
            target_median=75.0,
            target_low=60.0,
            target_high=90.0,
            number_of_analysts=3,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 70.0)

        assert result is not None
        assert result["source"] == "analyst_consensus_thin"


# ---------------------------------------------------------------------------
# Tests: Tier 3 - Multiples fallback (0-1 analysts)
# ---------------------------------------------------------------------------


class TestTier3MultiplesFallback:
    """Tier 3: No/insufficient analyst data, fallback to multiples."""

    def test_peer_and_historical(self):
        """Two multiples methods: peer + historical."""
        fundamentals = _make_fundamentals(forward_eps=8.0)
        valuation = _make_valuation_comparison(
            peer_pes=[20.0, 25.0],  # median = 22.5
            hist_pes=[15.0, 18.0, 20.0],  # median = 18
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 160.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"
        assert result["methods_used"] == 2
        assert result["forward_eps"] == 8.0
        # targets: peer=22.5*8=180, hist=18*8=144, median=162
        # bear = 162 * 0.85 = 137.7, bull = 162 * 1.20 = 194.4
        assert result["bear"] == 137.7
        assert result["base"] == 162.0
        assert result["bull"] == 194.4

    def test_peer_and_industry(self):
        """Two multiples methods: peer + industry."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(
            peer_pes=[30.0, 35.0],  # median = 32.5
            industry_pe=28.0,
            industry_name="Semiconductors",
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 150.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"
        assert result["methods_used"] == 2
        method_names = [m["method"] for m in result["methods"]]
        assert "peer_median_pe" in method_names
        assert "industry_avg_pe" in method_names

    def test_historical_and_industry(self):
        """Two multiples methods: historical + industry."""
        fundamentals = _make_fundamentals(forward_eps=4.0)
        valuation = _make_valuation_comparison(
            hist_pes=[20.0, 22.0, 25.0],  # median = 22
            industry_pe=18.0,
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 80.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"
        assert result["methods_used"] == 2

    def test_all_three_multiples(self):
        """All three multiples methods available."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(
            peer_pes=[25.0, 30.0, 35.0],  # median = 30
            hist_pes=[18.0, 20.0, 22.0, 24.0, 26.0],  # median = 22
            industry_pe=25.0,
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 120.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"
        assert result["methods_used"] == 3
        # targets: peer=30*5=150, hist=22*5=110, industry=25*5=125
        # median of [110, 125, 150] = 125
        # bear = 125 * 0.85 = 106.25, bull = 125 * 1.20 = 150.0
        assert result["base"] == 125.0
        assert result["bear"] == 106.25
        assert result["bull"] == 150.0

    def test_bear_base_bull_ordering(self):
        """bear <= base <= bull ordering is always guaranteed."""
        fundamentals = _make_fundamentals(forward_eps=7.0)
        valuation = _make_valuation_comparison(
            peer_pes=[40.0, 50.0],  # median = 45
            hist_pes=[25.0, 30.0, 35.0],  # median = 30
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 200.0)

        assert result is not None
        assert result["bear"] <= result["base"] <= result["bull"]

    def test_one_analyst_triggers_fallback(self):
        """1 analyst -> not enough for Tier 1/2, should use fallback."""
        analyst = _make_analyst_targets(
            target_median=100.0,
            target_low=80.0,
            target_high=120.0,
            number_of_analysts=1,
        )
        fundamentals = _make_fundamentals(
            forward_eps=5.0,
            analyst_targets=analyst,
        )
        valuation = _make_valuation_comparison(
            peer_pes=[20.0, 25.0],
            hist_pes=[18.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"


# ---------------------------------------------------------------------------
# Tests: Insufficient data -> None
# ---------------------------------------------------------------------------


class TestInsufficientData:
    """Returns None when not enough data for any tier."""

    def test_no_analyst_no_multiples(self):
        """No analyst data, no multiples data."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        result = _compute_target_price_inputs(fundamentals, {}, 100.0)
        assert result is None

    def test_only_one_multiples_method(self):
        """Only peers, no historical, no industry."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(peer_pes=[20.0, 25.0])
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)
        assert result is None

    def test_no_forward_eps_for_fallback(self):
        """No forward EPS means multiples fallback can't work."""
        fundamentals = _make_fundamentals()
        valuation = _make_valuation_comparison(
            peer_pes=[20.0, 25.0],
            hist_pes=[18.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)
        assert result is None

    def test_negative_forward_eps(self):
        """Negative forward EPS means multiples fallback can't work."""
        fundamentals = _make_fundamentals(forward_eps=-2.0)
        valuation = _make_valuation_comparison(
            peer_pes=[20.0, 25.0],
            hist_pes=[18.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)
        assert result is None

    def test_zero_forward_eps(self):
        fundamentals = _make_fundamentals(forward_eps=0)
        valuation = _make_valuation_comparison(
            peer_pes=[20.0, 25.0],
            hist_pes=[18.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)
        assert result is None


# ---------------------------------------------------------------------------
# Tests: Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_analyst_no_current_price(self):
        """Analyst consensus with no current price -> no upside/downside."""
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=160.0,
            target_high=250.0,
            number_of_analysts=10,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, None)

        assert result is not None
        assert result["source"] == "analyst_consensus"
        assert "current_price" not in result
        assert "upside_to_base" not in result

    def test_analyst_current_price_zero(self):
        """current_price=0 -> no upside/downside fields."""
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=160.0,
            target_high=250.0,
            number_of_analysts=10,
        )
        fundamentals = _make_fundamentals(analyst_targets=analyst)
        result = _compute_target_price_inputs(fundamentals, {}, 0.0)

        assert result is not None
        assert "current_price" not in result

    def test_multiples_no_current_price(self):
        """Multiples fallback with no current price."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(
            peer_pes=[25.0],
            hist_pes=[20.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, None)

        assert result is not None
        assert result["source"] == "multiples_fallback"
        assert "current_price" not in result

    def test_negative_peer_pe_excluded(self):
        """Negative P/E ratios in peers are filtered out."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(
            peer_pes=[-10.0, 0, 25.0, 30.0],  # negative and zero excluded
            hist_pes=[20.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)

        assert result is not None
        peer_method = next(m for m in result["methods"] if m["method"] == "peer_median_pe")
        assert peer_method["peer_count"] == 2  # only 25 and 30

    def test_negative_historical_pe_excluded(self):
        """Negative/zero historical P/E values are filtered out."""
        fundamentals = _make_fundamentals(forward_eps=5.0)
        valuation = _make_valuation_comparison(
            peer_pes=[25.0],
            hist_pes=[-5.0, 0, 20.0, 22.0],  # negative and zero excluded
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)

        assert result is not None
        hist_method = next(m for m in result["methods"] if m["method"] == "historical_median_pe")
        assert hist_method["years_used"] == 2  # only 20 and 22

    def test_analyst_missing_target_low(self):
        """Missing target_low -> fallback to multiples."""
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_high=250.0,
            number_of_analysts=10,
            # target_low is missing
        )
        fundamentals = _make_fundamentals(
            forward_eps=5.0,
            analyst_targets=analyst,
        )
        valuation = _make_valuation_comparison(
            peer_pes=[25.0, 30.0],
            hist_pes=[20.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"

    def test_analyst_target_low_zero(self):
        """target_low=0 -> fallback to multiples."""
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=0.0,
            target_high=250.0,
            number_of_analysts=10,
        )
        fundamentals = _make_fundamentals(
            forward_eps=5.0,
            analyst_targets=analyst,
        )
        valuation = _make_valuation_comparison(
            peer_pes=[25.0, 30.0],
            hist_pes=[20.0, 22.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 100.0)

        assert result is not None
        assert result["source"] == "multiples_fallback"

    def test_empty_fundamentals(self):
        result = _compute_target_price_inputs({}, {}, 100.0)
        assert result is None

    def test_analyst_preempts_multiples(self):
        """When analyst data is sufficient, multiples data is ignored."""
        analyst = _make_analyst_targets(
            target_median=200.0,
            target_low=160.0,
            target_high=250.0,
            number_of_analysts=10,
        )
        fundamentals = _make_fundamentals(
            forward_eps=5.0,
            analyst_targets=analyst,
        )
        valuation = _make_valuation_comparison(
            peer_pes=[10.0, 12.0],  # very different from analyst targets
            hist_pes=[8.0, 10.0],
        )
        result = _compute_target_price_inputs(fundamentals, valuation, 180.0)

        assert result is not None
        assert result["source"] == "analyst_consensus"
        assert result["base"] == 200.0  # analyst median, not multiples
        assert "methods" not in result  # no multiples methods
