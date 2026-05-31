"""
Macro Risk Service Unit Tests

Tests for pure scoring/compute logic in app/features/macro/risk/service.py:
- _score_indicator
- _compute_economic_deterioration
- _compute_credit_risk
- _compute_employment_risk
- _compute_ai_health
- _score_change_based
- _score_nonfarm
- Headline generators
- Cache functions

No network access, no database. All data is constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_macro_risk_unit.py -v
"""

import time
import pytest
from unittest.mock import patch

from app.features.macro.risk.service import (
    _score_indicator,
    _compute_economic_deterioration,
    _compute_credit_risk,
    _compute_employment_risk,
    _compute_ai_health,
    _score_change_based,
    _score_nonfarm,
    _economic_headline,
    _credit_headline,
    _employment_headline,
    _ai_headline,
    _get_cached,
    _set_cached,
    _get_cache,
    _CACHE_TTL,
    _cpi_breakdown_has_values,
    _fill_indicators_from_cached_payload,
    _fill_indicators_from_macro_context,
    _fundamentals_has_indicator_values,
    _fundamentals_indicator_value_count,
    _indicator_has_value,
    _set_indicator_if_missing,
)
from app.features.macro.risk.models import (
    MacroRiskDashboard,
    AIStockInfo,
)


# ===========================================================================
# TestScoreIndicator
# ===========================================================================


class TestScoreIndicator:
    """Tests for _score_indicator core scoring function."""

    def test_low_risk_normal(self):
        """value < low_max returns score in 0-3 range."""
        score = _score_indicator(5, 10, 30)
        assert 0 <= score <= 3

    def test_medium_risk_normal(self):
        """low_max < value < mid_max returns score in 3-6 range."""
        score = _score_indicator(20, 10, 30)
        assert 3 <= score <= 6

    def test_high_risk_normal(self):
        """value > mid_max returns score in 6-10 range."""
        score = _score_indicator(40, 10, 30)
        assert 6 <= score <= 10

    def test_none_returns_neutral(self):
        """value=None returns 5.0 (neutral)."""
        score = _score_indicator(None, 10, 30)
        assert score == 5.0

    def test_inverted_high_value_low_risk(self):
        """invert=True: value above low_max returns low risk (0-3)."""
        # yield_curve >0.5 means low risk
        score = _score_indicator(1.0, 0.5, -0.5, invert=True)
        assert 0 <= score <= 3

    def test_inverted_low_value_high_risk(self):
        """invert=True: value below mid_max returns high risk (6-10)."""
        # yield_curve < -0.5 means high risk
        score = _score_indicator(-1.0, 0.5, -0.5, invert=True)
        assert 6 <= score <= 10

    def test_clamped_to_10(self):
        """Extreme values do not exceed 10.0."""
        score = _score_indicator(1000, 10, 30)
        assert score <= 10.0

    def test_zero_thresholds(self):
        """low_max == mid_max: span defaults to 1.0, no division by zero."""
        score = _score_indicator(5, 0, 0)
        # Should not raise, should return a valid score
        assert 0 <= score <= 10

    def test_boundary_at_low_max(self):
        """Value exactly at low_max boundary."""
        score = _score_indicator(10, 10, 30)
        # At boundary, score should be exactly 3.0 (ratio = 10/10 = 1 -> 3.0)
        assert score == pytest.approx(3.0, abs=0.01)

    def test_boundary_at_mid_max(self):
        """Value exactly at mid_max boundary."""
        score = _score_indicator(30, 10, 30)
        assert score == pytest.approx(6.0, abs=0.01)


class TestMacroFallbackHelpers:
    """Tests for DB/trend fallback helper behavior."""

    def test_fundamentals_indicator_count_ignores_ai_basket(self):
        data = {
            "categories": [
                {"indicators": [{"series_id": "AI_BASKET_DAILY", "value": 3.0}]},
                {"indicators": [{"series_id": "UNRATE", "value": 3.9}]},
            ]
        }

        assert _fundamentals_indicator_value_count(data) == 1

    def test_fill_indicators_from_cached_payload_only_missing_values(self):
        indicators = {
            "unemployment": {"value": None},
            "yield_curve": {"value": 0.5},
        }
        cached = {
            "sub_dimensions": [
                {
                    "indicators": [
                        {"series_id": "UNRATE", "value": 3.9, "source": "macro_cache"},
                        {"series_id": "T10Y2Y", "value": 0.3, "source": "macro_cache"},
                    ]
                }
            ]
        }

        _fill_indicators_from_cached_payload(
            indicators,
            cached,
            {"UNRATE": "unemployment", "T10Y2Y": "yield_curve"},
        )

        assert indicators["unemployment"]["value"] == 3.9
        assert indicators["unemployment"]["source"] == "macro_cache"
        assert indicators["yield_curve"]["value"] == 0.5

    def test_set_indicator_if_missing(self):
        indicators = {"treasury_10y": {"value": None}}

        _set_indicator_if_missing(
            indicators,
            "treasury_10y",
            4.45,
            series_id="DGS10",
            units="Percent",
            source="macro:treasury_rates",
        )

        assert indicators["treasury_10y"]["value"] == 4.45
        assert indicators["treasury_10y"]["source"] == "macro:treasury_rates"

    def test_indicator_has_value_handles_none_and_missing(self):
        assert _indicator_has_value({"value": 1.23}) is True
        assert _indicator_has_value({"value": None}) is False
        assert _indicator_has_value({}) is False
        assert _indicator_has_value(None) is False
        # Zero is still a valid value (e.g. 0% unemployment month-over-month)
        assert _indicator_has_value({"value": 0}) is True

    def test_fundamentals_has_indicator_values_aliases_count(self):
        assert _fundamentals_has_indicator_values(None) is False
        assert _fundamentals_has_indicator_values({}) is False
        assert _fundamentals_has_indicator_values(
            {"categories": [{"indicators": [{"series_id": "UNRATE", "value": 3.9}]}]}
        ) is True

    def test_fundamentals_count_skips_when_value_is_none(self):
        data = {
            "sub_dimensions": [
                {"indicators": [{"series_id": "UNRATE", "value": None}]},
                {"indicators": [{"series_id": "CFNAI", "value": 0.5}]},
            ]
        }
        assert _fundamentals_indicator_value_count(data) == 1

    def test_fundamentals_count_handles_missing_sections(self):
        # Both `sub_dimensions` and `categories` absent -> 0 (and no crash)
        assert _fundamentals_indicator_value_count({"other": "stuff"}) == 0

    def test_cpi_breakdown_has_values_detects_yoy_or_mom(self):
        assert _cpi_breakdown_has_values(None) is False
        assert _cpi_breakdown_has_values({"components": []}) is False
        assert _cpi_breakdown_has_values(
            {"components": [{"yoy_pct": None, "mom_pct": None}]}
        ) is False
        assert _cpi_breakdown_has_values(
            {"components": [{"yoy_pct": 3.1}]}
        ) is True
        assert _cpi_breakdown_has_values(
            {"components": [{"mom_pct": 0.4}]}
        ) is True

    def test_fill_indicators_skips_unknown_series_id(self):
        indicators = {"unemployment": {"value": None}}
        cached = {
            "sub_dimensions": [
                {"indicators": [{"series_id": "UNKNOWN_X", "value": 99.9}]}
            ]
        }
        _fill_indicators_from_cached_payload(
            indicators, cached, {"UNRATE": "unemployment"}
        )
        # No matching series_id -> indicator stays None
        assert indicators["unemployment"]["value"] is None

    def test_fill_indicators_skips_when_cached_value_is_none(self):
        indicators = {"unemployment": {"value": None}}
        cached = {
            "sub_dimensions": [
                {"indicators": [{"series_id": "UNRATE", "value": None}]}
            ]
        }
        _fill_indicators_from_cached_payload(
            indicators, cached, {"UNRATE": "unemployment"}
        )
        assert indicators["unemployment"]["value"] is None

    def test_fill_indicators_accepts_categories_section(self):
        indicators = {"unemployment": {"value": None}}
        cached = {
            "categories": [
                {"indicators": [{"series_id": "UNRATE", "value": 3.9}]}
            ]
        }
        _fill_indicators_from_cached_payload(
            indicators, cached, {"UNRATE": "unemployment"}
        )
        assert indicators["unemployment"]["value"] == 3.9
        # default source applied when not provided by cached payload
        assert indicators["unemployment"]["source"] == "macro_cache"

    def test_fill_indicators_no_op_when_cached_is_none(self):
        indicators = {"unemployment": {"value": None}}
        _fill_indicators_from_cached_payload(indicators, None, {"UNRATE": "unemployment"})
        assert indicators["unemployment"]["value"] is None

    def test_set_indicator_skips_when_value_is_none(self):
        indicators = {"treasury_10y": {"value": None}}
        _set_indicator_if_missing(
            indicators,
            "treasury_10y",
            None,
            series_id="DGS10",
            units="Percent",
            source="macro:treasury_rates",
        )
        assert indicators["treasury_10y"]["value"] is None

    def test_set_indicator_skips_when_existing_value_present(self):
        indicators = {"treasury_10y": {"value": 4.20}}
        _set_indicator_if_missing(
            indicators,
            "treasury_10y",
            4.45,
            series_id="DGS10",
            units="Percent",
            source="macro:treasury_rates",
        )
        # Existing value preserved, not overwritten by fallback
        assert indicators["treasury_10y"]["value"] == 4.20

    def test_set_indicator_skips_when_key_missing(self):
        # Helper only fills keys already declared on the indicators dict
        indicators: dict = {}
        _set_indicator_if_missing(
            indicators,
            "treasury_10y",
            4.45,
            series_id="DGS10",
            units="Percent",
            source="macro:treasury_rates",
        )
        assert "treasury_10y" not in indicators


class TestFillIndicatorsFromMacroContext:
    """Tests for the async helper that pulls trend/treasury context from cache."""

    @pytest.mark.asyncio
    async def test_fills_trend_context_and_treasury_when_indicators_missing(self):
        trend = {
            "gdp_growth": {"current": 2.5},
            "unemployment": {"current": 3.9},
            "cpi_yoy": {"current": 3.1},
        }
        treasury = {
            "rates": {
                "10Y": {"rate": 4.45, "daily_change_bps": 5.0},
                "2Y": {"rate": 4.80, "daily_change_bps": 2.0},
            }
        }

        async def fake_try_db_cache(key):
            if key == "macro:trend_context":
                return trend, True
            if key == "macro:treasury_rates":
                return treasury, True
            return None, False

        indicators: dict = {
            "gdp_growth": {"value": None},
            "unemployment": {"value": None},
            "cpi": {"value": None},
            "treasury_10y": {"value": None},
            "yield_curve": {"value": None},
        }

        with patch(
            "app.features.macro.risk.service.try_db_cache",
            new=fake_try_db_cache,
        ):
            await _fill_indicators_from_macro_context(indicators)

        assert indicators["gdp_growth"]["value"] == 2.5
        assert indicators["gdp_growth"]["source"] == "macro:trend_context"
        assert indicators["unemployment"]["value"] == 3.9
        assert indicators["cpi"]["value"] == 3.1
        assert indicators["treasury_10y"]["value"] == 4.45
        assert indicators["yield_curve"]["value"] == pytest.approx(-0.35, abs=0.0001)
        # change = (10Y_change_bps - 2Y_change_bps) / 100 = (5.0 - 2.0) / 100
        assert indicators["yield_curve"]["change"] == pytest.approx(0.03, abs=0.0001)

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_indicator_values(self):
        trend = {"unemployment": {"current": 4.5}}

        async def fake_try_db_cache(key):
            if key == "macro:trend_context":
                return trend, True
            return None, False

        indicators = {"unemployment": {"value": 3.9, "source": "fred"}}

        with patch(
            "app.features.macro.risk.service.try_db_cache",
            new=fake_try_db_cache,
        ):
            await _fill_indicators_from_macro_context(indicators)

        # Fresh FRED data wins over trend fallback
        assert indicators["unemployment"]["value"] == 3.9
        assert indicators["unemployment"]["source"] == "fred"

    @pytest.mark.asyncio
    async def test_safe_when_caches_missing(self):
        async def fake_try_db_cache(key):
            return None, False

        indicators = {"treasury_10y": {"value": None}, "yield_curve": {"value": None}}

        with patch(
            "app.features.macro.risk.service.try_db_cache",
            new=fake_try_db_cache,
        ):
            await _fill_indicators_from_macro_context(indicators)

        # No fallback data -> values remain None, no crash
        assert indicators["treasury_10y"]["value"] is None
        assert indicators["yield_curve"]["value"] is None

    @pytest.mark.asyncio
    async def test_skips_yield_curve_change_when_bps_missing(self):
        treasury = {
            "rates": {
                "10Y": {"rate": 4.45},
                "2Y": {"rate": 4.80},
            }
        }

        async def fake_try_db_cache(key):
            if key == "macro:treasury_rates":
                return treasury, True
            return None, False

        indicators = {
            "treasury_10y": {"value": None},
            "yield_curve": {"value": None},
        }

        with patch(
            "app.features.macro.risk.service.try_db_cache",
            new=fake_try_db_cache,
        ):
            await _fill_indicators_from_macro_context(indicators)

        assert indicators["yield_curve"]["value"] == pytest.approx(-0.35, abs=0.0001)
        # No bps change data -> change stays None (not crash)
        assert indicators["yield_curve"]["change"] is None


# ===========================================================================
# TestComputeEconomicDeterioration
# ===========================================================================


class TestComputeEconomicDeterioration:
    """Tests for _compute_economic_deterioration."""

    @pytest.fixture
    def healthy_indicators(self):
        """Low risk indicators: low recession prob, positive yield curve."""
        return {
            "recession_prob": {"value": 2, "date": "2025-01-01", "units": "Percent"},
            "yield_curve": {"value": 1.5, "date": "2025-01-01", "units": "Percent"},
            "cfnai": {"value": 0.5, "date": "2025-01-01", "units": "Index"},
            "consumer_sentiment": {"value": 90, "date": "2025-01-01", "units": "Index"},
        }

    @pytest.fixture
    def deteriorating_indicators(self):
        """High risk indicators: high recession prob, inverted yield curve."""
        return {
            "recession_prob": {"value": 50, "date": "2025-01-01", "units": "Percent"},
            "yield_curve": {"value": -1.0, "date": "2025-01-01", "units": "Percent"},
            "cfnai": {"value": -1.0, "date": "2025-01-01", "units": "Index"},
            "consumer_sentiment": {"value": 50, "date": "2025-01-01", "units": "Index"},
        }

    def test_healthy_economy(self, healthy_indicators):
        """Low recession prob + positive yield curve -> low risk score."""
        result = _compute_economic_deterioration(healthy_indicators)
        assert result.risk_score < 4
        assert result.risk_level == "low"

    def test_deteriorating_economy(self, deteriorating_indicators):
        """High recession prob + inverted yield curve -> high risk score."""
        result = _compute_economic_deterioration(deteriorating_indicators)
        assert result.risk_score >= 6
        assert result.risk_level in ("medium", "high")

    def test_missing_data(self):
        """Partial/missing indicators -> neutral-ish score (around 5)."""
        result = _compute_economic_deterioration({})
        # All None -> each scores 5.0 -> weighted avg = 5.0
        assert result.risk_score == pytest.approx(5.0, abs=0.1)

    def test_risk_level_mapping(self, healthy_indicators, deteriorating_indicators):
        """score -> risk_level mapping is correct."""
        low = _compute_economic_deterioration(healthy_indicators)
        assert low.risk_level == "low"

        high = _compute_economic_deterioration(deteriorating_indicators)
        assert high.risk_level in ("medium", "high")

    def test_returns_4_indicators(self, healthy_indicators):
        """Should return exactly 4 RiskIndicator objects."""
        result = _compute_economic_deterioration(healthy_indicators)
        assert len(result.indicators) == 4

    def test_category_metadata(self, healthy_indicators):
        """Category ID and name are correct."""
        result = _compute_economic_deterioration(healthy_indicators)
        assert result.category_id == 1
        assert result.category_name == "Economic Deterioration"


# ===========================================================================
# TestComputeCreditRisk
# ===========================================================================


class TestComputeCreditRisk:
    """Tests for _compute_credit_risk."""

    @pytest.fixture
    def tight_spreads(self):
        """Low risk: tight credit spreads."""
        return {
            "hy_oas": {"value": 2.0, "date": "2025-01-01", "units": "Percent"},
            "bbb_spread": {"value": 1.0, "date": "2025-01-01", "units": "Percent"},
            "cre_delinquency": {"value": 1.0, "date": "2025-01-01", "units": "Percent"},
            "business_delinquency": {"value": 0.5, "date": "2025-01-01", "units": "Percent"},
        }

    @pytest.fixture
    def wide_spreads(self):
        """High risk: wide credit spreads."""
        return {
            "hy_oas": {"value": 7.0, "date": "2025-01-01", "units": "Percent"},
            "bbb_spread": {"value": 4.0, "date": "2025-01-01", "units": "Percent"},
            "cre_delinquency": {"value": 6.0, "date": "2025-01-01", "units": "Percent"},
            "business_delinquency": {"value": 5.0, "date": "2025-01-01", "units": "Percent"},
        }

    def test_tight_spreads(self, tight_spreads):
        """Low spreads -> low risk score."""
        result = _compute_credit_risk(tight_spreads)
        assert result.risk_score < 4
        assert result.risk_level == "low"

    def test_wide_spreads(self, wide_spreads):
        """Wide spreads -> high risk score."""
        result = _compute_credit_risk(wide_spreads)
        assert result.risk_score >= 6
        assert result.risk_level in ("medium", "high")

    def test_indicator_count(self, tight_spreads):
        """Returns exactly 4 indicators."""
        result = _compute_credit_risk(tight_spreads)
        assert len(result.indicators) == 4

    def test_category_metadata(self, tight_spreads):
        """Category ID=2, name correct."""
        result = _compute_credit_risk(tight_spreads)
        assert result.category_id == 2
        assert result.category_name == "Credit / Default Risk"


# ===========================================================================
# TestComputeEmploymentRisk
# ===========================================================================


class TestComputeEmploymentRisk:
    """Tests for _compute_employment_risk."""

    @pytest.fixture
    def strong_labor(self):
        """Strong labor market data."""
        return {
            "sahm_rule": {"value": 0.1, "date": "2025-01-01"},
            "unemployment": {"value": 3.5, "date": "2025-01-01"},
            "initial_claims": {"value": 200, "date": "2025-01-01"},
            "nonfarm_payrolls": {"value": 155000, "date": "2025-01-01", "change": 0.2},
        }

    @pytest.fixture
    def weak_labor(self):
        """Weak labor market data."""
        return {
            "sahm_rule": {"value": 0.8, "date": "2025-01-01"},
            "unemployment": {"value": 6.0, "date": "2025-01-01"},
            "initial_claims": {"value": 350000, "date": "2025-01-01"},
            "nonfarm_payrolls": {"value": 140000, "date": "2025-01-01", "change": -0.2},
        }

    def test_strong_labor_market(self, strong_labor):
        """Low unemployment + low Sahm -> low risk."""
        result = _compute_employment_risk(strong_labor)
        assert result.risk_score < 4
        assert result.risk_level == "low"

    def test_weak_labor_market(self, weak_labor):
        """High unemployment + high Sahm -> high risk."""
        result = _compute_employment_risk(weak_labor)
        assert result.risk_score >= 6
        assert result.risk_level in ("medium", "high")

    def test_claims_conversion(self):
        """initial_claims > 1000 automatically converted to thousands."""
        indicators = {
            "sahm_rule": {"value": 0.3},
            "unemployment": {"value": 4.0},
            "initial_claims": {"value": 250000},  # raw value, should be /1000 -> 250
            "nonfarm_payrolls": {"change": 0.05},
        }
        result = _compute_employment_risk(indicators)
        # Should not crash, claims_k = 250 which is > 225 low_max
        assert 0 <= result.risk_score <= 10

    def test_missing_data_neutral(self):
        """All missing data -> neutral score."""
        result = _compute_employment_risk({})
        assert result.risk_score == pytest.approx(5.0, abs=0.1)

    def test_returns_4_indicators(self, strong_labor):
        """Returns exactly 4 indicators."""
        result = _compute_employment_risk(strong_labor)
        assert len(result.indicators) == 4


# ===========================================================================
# TestComputeAIHealth
# ===========================================================================


class TestComputeAIHealth:
    """Tests for _compute_ai_health."""

    @pytest.fixture
    def all_up_quotes(self):
        """All stocks up 2%+."""
        return [
            {"symbol": s, "price": 100, "daily_change": 2.5, "name": s}
            for s in ["NVDA", "MSFT", "GOOGL", "META", "AMD"]
        ]

    @pytest.fixture
    def all_down_quotes(self):
        """All stocks down 3%+."""
        return [
            {"symbol": s, "price": 100, "daily_change": -4.0, "name": s}
            for s in ["NVDA", "MSFT", "GOOGL", "META", "AMD"]
        ]

    @pytest.fixture
    def mixed_quotes(self):
        """Mixed performance."""
        return [
            {"symbol": "NVDA", "price": 100, "daily_change": 2.0, "name": "NVDA"},
            {"symbol": "MSFT", "price": 100, "daily_change": -1.0, "name": "MSFT"},
            {"symbol": "GOOGL", "price": 100, "daily_change": 0.5, "name": "GOOGL"},
            {"symbol": "META", "price": 100, "daily_change": -0.5, "name": "META"},
            {"symbol": "AMD", "price": 100, "daily_change": 1.0, "name": "AMD"},
        ]

    def test_all_stocks_up(self, all_up_quotes):
        """All up -> low risk."""
        category, ai_stocks = _compute_ai_health(all_up_quotes)
        assert category.risk_score < 4
        assert category.risk_level == "low"

    def test_all_stocks_down(self, all_down_quotes):
        """All down -> high risk."""
        category, ai_stocks = _compute_ai_health(all_down_quotes)
        assert category.risk_score >= 7
        assert category.risk_level == "high"

    def test_mixed_performance(self, mixed_quotes):
        """Mixed -> medium risk."""
        category, ai_stocks = _compute_ai_health(mixed_quotes)
        assert 2 <= category.risk_score <= 8

    def test_returns_ai_stocks_list(self, all_up_quotes):
        """Returns list of AIStockInfo with correct symbols."""
        category, ai_stocks = _compute_ai_health(all_up_quotes)
        assert len(ai_stocks) == 5
        assert all(isinstance(s, AIStockInfo) for s in ai_stocks)
        symbols = {s.symbol for s in ai_stocks}
        assert "NVDA" in symbols
        assert "MSFT" in symbols

    def test_empty_quotes(self):
        """Empty quotes list doesn't crash."""
        category, ai_stocks = _compute_ai_health([])
        assert ai_stocks == []
        assert 0 <= category.risk_score <= 10

    def test_category_metadata(self, all_up_quotes):
        """Category ID=4, name correct."""
        category, _ = _compute_ai_health(all_up_quotes)
        assert category.category_id == 4
        assert category.category_name == "AI Company Health"


# ===========================================================================
# TestScoreChangeBased
# ===========================================================================


class TestScoreChangeBased:
    """Tests for _score_change_based."""

    def test_higher_risk_low_change(self):
        """Low inflation change -> low score (higher risk direction)."""
        indicators = {"cpi": {"change": 0.1}}
        score = _score_change_based(indicators, "cpi", (0.15, 0.25, 0.35, 0.50), "higher")
        assert score == 1.5  # Below first threshold

    def test_higher_risk_high_change(self):
        """High inflation change -> high score."""
        indicators = {"cpi": {"change": 0.6}}
        score = _score_change_based(indicators, "cpi", (0.15, 0.25, 0.35, 0.50), "higher")
        assert score == 8.5  # Above last threshold

    def test_lower_risk_direction(self):
        """Retail sales growing -> low risk."""
        indicators = {"retail_sales": {"change": 1.0}}
        score = _score_change_based(indicators, "retail_sales", (0.5, 0.0, -0.3, -1.0), "lower")
        assert score == 1.5  # Above first threshold in lower direction

    def test_none_change_returns_neutral(self):
        """Missing change -> 5.0 neutral."""
        indicators = {"cpi": {"value": 300}}  # No "change" key
        score = _score_change_based(indicators, "cpi", (0.15, 0.25, 0.35, 0.50), "higher")
        assert score == 5.0

    def test_missing_key_returns_neutral(self):
        """Key not in indicators -> 5.0 neutral."""
        score = _score_change_based({}, "nonexistent", (0.15, 0.25, 0.35, 0.50), "higher")
        assert score == 5.0


# ===========================================================================
# TestScoreNonfarm
# ===========================================================================


class TestScoreNonfarm:
    """Tests for _score_nonfarm."""

    def test_strong_growth(self):
        """change > 0.1 -> 2.0."""
        score = _score_nonfarm({"nonfarm_payrolls": {"change": 0.2}})
        assert score == 2.0

    def test_moderate_growth(self):
        """0 < change < 0.1 -> 4.0."""
        score = _score_nonfarm({"nonfarm_payrolls": {"change": 0.05}})
        assert score == 4.0

    def test_slight_decline(self):
        """-0.1 < change < 0 -> 6.0."""
        score = _score_nonfarm({"nonfarm_payrolls": {"change": -0.05}})
        assert score == 6.0

    def test_sharp_decline(self):
        """change < -0.1 -> 8.0."""
        score = _score_nonfarm({"nonfarm_payrolls": {"change": -0.2}})
        assert score == 8.0

    def test_none_returns_neutral(self):
        """None change -> 5.0."""
        score = _score_nonfarm({"nonfarm_payrolls": {}})
        assert score == 5.0

    def test_missing_key(self):
        """Missing nonfarm_payrolls key -> 5.0."""
        score = _score_nonfarm({})
        assert score == 5.0


# ===========================================================================
# TestHeadlines
# ===========================================================================


class TestHeadlines:
    """Tests for headline generator functions."""

    # Economic headlines
    def test_economic_high_risk(self):
        """score >= 7 -> recession warning."""
        headline = _economic_headline(8.0, 50, -0.5)
        assert "警告" in headline

    def test_economic_medium_risk(self):
        """4 <= score < 7 -> mixed signals."""
        headline = _economic_headline(5.0, 15, -0.2)
        assert "信号混合" in headline

    def test_economic_low_risk(self):
        """score < 4 -> healthy."""
        headline = _economic_headline(2.0, 2, 1.0)
        assert "健康" in headline

    def test_economic_medium_with_details(self):
        """Medium risk includes recession prob and yield curve details."""
        headline = _economic_headline(5.0, 15, -0.2)
        assert "衰退概率" in headline
        assert "倒挂" in headline

    # Credit headlines
    def test_credit_high_risk(self):
        """score >= 7 -> spread widening."""
        headline = _credit_headline(8.0, 6.0)
        assert "扩大" in headline

    def test_credit_medium_risk(self):
        """4 <= score < 7 -> moderate tightening."""
        headline = _credit_headline(5.0, 4.0)
        assert "偏紧" in headline

    def test_credit_low_risk(self):
        """score < 4 -> stable."""
        headline = _credit_headline(2.0, 2.0)
        assert "稳定" in headline

    # Employment headlines
    def test_employment_high_risk(self):
        """score >= 7 -> labor market deterioration."""
        headline = _employment_headline(8.0, 0.8, 5.5)
        assert "恶化" in headline

    def test_employment_medium_risk(self):
        """4 <= score < 7 -> softening."""
        headline = _employment_headline(5.0, 0.3, 4.2)
        assert "走软" in headline

    def test_employment_low_risk(self):
        """score < 4 -> resilient."""
        headline = _employment_headline(2.0, 0.1, 3.5)
        assert "韧性" in headline

    # AI headlines
    def test_ai_high_risk(self):
        """score >= 7 -> AI sector under pressure."""
        headline = _ai_headline(8.0, -3.0, 8, 10)
        assert "承压" in headline

    def test_ai_medium_risk(self):
        """4 <= score < 7 -> divergence."""
        headline = _ai_headline(5.0, 0.5, 4, 10)
        assert "分化" in headline

    def test_ai_low_risk(self):
        """score < 4 -> healthy."""
        headline = _ai_headline(2.0, 2.0, 1, 10)
        assert "健康" in headline


# ===========================================================================
# TestCacheFunctions
# ===========================================================================


class TestCacheFunctions:
    """Tests for generic cache get/set functions."""

    def setup_method(self):
        """Clear cache before each test."""
        _get_cache("dashboard").clear()

    def test_set_and_get_cached(self):
        """Set cache then get returns same data."""
        dashboard = MacroRiskDashboard(
            timestamp="2025-01-01T00:00:00Z",
            composite_score=5.0,
            composite_level="medium",
            categories=[],
        )
        store = _get_cache("dashboard")
        _set_cached(store, dashboard)
        result = _get_cached(store)
        assert result is not None
        assert result.composite_score == 5.0
        assert result.composite_level == "medium"

    def test_cache_expired(self):
        """Cache returns None after TTL expires."""
        dashboard = MacroRiskDashboard(
            timestamp="2025-01-01T00:00:00Z",
            composite_score=5.0,
            composite_level="medium",
            categories=[],
        )
        store = _get_cache("dashboard")
        _set_cached(store, dashboard)
        # Manually set timestamp to past
        store["ts"] = time.time() - _CACHE_TTL - 1
        result = _get_cached(store)
        assert result is None

    def test_empty_cache(self):
        """Empty cache returns None."""
        store = _get_cache("dashboard")
        result = _get_cached(store)
        assert result is None

    def teardown_method(self):
        """Clear cache after each test."""
        _get_cache("dashboard").clear()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
