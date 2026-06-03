"""
Screener Unit Tests -- generated from git diff

Tests for: filters.py, suggestions.py, refresher.py pure functions
No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_screener_unit.py -v
"""

import json

import pytest
from app.features.screener.filters import (
    _num, _sort_and_limit,
    filter_volume_surge, filter_high_dividend, filter_momentum,
    filter_oversold_quality, filter_by_sector, filter_custom,
    filter_hot_sectors, filter_value_discovery,
)
from app.features.screener.agent import (
    _current_universe,
    filter_by_tickers,
    get_field_distribution,
    list_available_sectors,
)
from app.features.screener.suggestions import (
    _safe_float, _suggest_sector, _suggest_market_cap_tier,
    _suggest_pe, _suggest_dividend, _suggest_trend,
    compute_narrowing_suggestions,
)
from app.features.screener.refresher import _clean_nan, _compute_sector_stats


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_universe():
    """A small but representative universe of 5 stocks."""
    return [
        {
            "symbol": "AAPL", "sector": "Technology Services",
            "industry": "Software", "price": 180, "daily_change": 2.5,
            "relative_volume": 3.0, "avg_volume_30d": 500_000,
            "dividend_yield": 0.5, "payout_ratio": 15, "dividend_payout_years": 10,
            "pe_ttm": 28, "roe": 25, "rsi": 55, "above_sma50": True,
            "above_sma200": True, "change_3m": 12.0, "market_cap": 3e12,
            "analyst_rating": 1.8, "position_52w": 0.85,
            "high_52w": 200, "low_52w": 140, "market_cap_tier": "mega",
        },
        {
            "symbol": "XOM", "sector": "Energy Minerals",
            "industry": "Oil", "price": 110, "daily_change": 1.2,
            "relative_volume": 1.5, "avg_volume_30d": 300_000,
            "dividend_yield": 3.5, "payout_ratio": 50, "dividend_payout_years": 20,
            "pe_ttm": 12, "roe": 18, "rsi": 45, "above_sma50": True,
            "above_sma200": True, "change_3m": 5.0, "market_cap": 4.5e11,
            "analyst_rating": 2.1, "position_52w": 0.65,
            "high_52w": 130, "low_52w": 90, "market_cap_tier": "large",
        },
        {
            "symbol": "WMT", "sector": "Retail Trade",
            "industry": "Retail", "price": 160, "daily_change": -0.3,
            "relative_volume": 0.8, "avg_volume_30d": 400_000,
            "dividend_yield": 1.4, "payout_ratio": 35, "dividend_payout_years": 25,
            "pe_ttm": 25, "roe": 22, "rsi": 60, "above_sma50": True,
            "above_sma200": False, "change_3m": 8.0, "market_cap": 4e11,
            "analyst_rating": 2.3, "position_52w": 0.70,
            "high_52w": 175, "low_52w": 130, "market_cap_tier": "large",
        },
        {
            "symbol": "PLTR", "sector": "Technology Services",
            "industry": "Software", "price": 25, "daily_change": 5.0,
            "relative_volume": 4.5, "avg_volume_30d": 800_000,
            "dividend_yield": 0, "payout_ratio": 0, "dividend_payout_years": 0,
            "pe_ttm": 120, "roe": 8, "rsi": 30, "above_sma50": False,
            "above_sma200": False, "change_3m": -10.0, "market_cap": 5e10,
            "analyst_rating": 3.0, "position_52w": 0.25,
            "high_52w": 45, "low_52w": 18, "market_cap_tier": "mid",
        },
        {
            "symbol": "JPM", "sector": "Finance",
            "industry": "Banking", "price": 195, "daily_change": 0.8,
            "relative_volume": 2.2, "avg_volume_30d": 600_000,
            "dividend_yield": 2.5, "payout_ratio": 30, "dividend_payout_years": 15,
            "pe_ttm": 11, "roe": 16, "rsi": 28, "above_sma50": True,
            "above_sma200": True, "change_3m": 3.0, "market_cap": 5.5e11,
            "analyst_rating": 1.5, "position_52w": 0.50,
            "high_52w": 210, "low_52w": 150, "market_cap_tier": "large",
        },
    ]


@pytest.fixture
def sector_stats():
    """Sector stats sorted by avg_daily_change descending."""
    return [
        {"sector": "Technology Services", "avg_daily_change": 3.5, "stock_count": 50},
        {"sector": "Energy Minerals", "avg_daily_change": 1.0, "stock_count": 30},
        {"sector": "Finance", "avg_daily_change": 0.5, "stock_count": 40},
        {"sector": "Retail Trade", "avg_daily_change": -0.2, "stock_count": 20},
    ]


# ---------------------------------------------------------------------------
# Tests: _num
# ---------------------------------------------------------------------------

class TestNum:
    def test_normal_float(self):
        assert _num({"price": 42.5}, "price") == 42.5

    def test_none_returns_default(self):
        assert _num({"price": None}, "price") == 0.0

    def test_missing_key_returns_default(self):
        assert _num({}, "price") == 0.0

    def test_custom_default(self):
        assert _num({}, "price", default=99.9) == 99.9

    def test_string_number_coerced(self):
        assert _num({"price": "123.4"}, "price") == 123.4

    def test_non_numeric_string_returns_default(self):
        assert _num({"price": "not-a-number"}, "price") == 0.0


# ---------------------------------------------------------------------------
# Tests: _sort_and_limit
# ---------------------------------------------------------------------------

class TestSortAndLimit:
    def test_sorts_descending_by_default(self, sample_universe):
        result = _sort_and_limit(sample_universe, "daily_change", limit=3)
        changes = [s["daily_change"] for s in result]
        assert changes == sorted(changes, reverse=True)
        assert len(result) == 3

    def test_sorts_ascending(self, sample_universe):
        result = _sort_and_limit(sample_universe, "daily_change", limit=5, reverse=False)
        changes = [s["daily_change"] for s in result]
        assert changes == sorted(changes)

    def test_excludes_none_values(self):
        stocks = [
            {"sym": "A", "val": 10},
            {"sym": "B", "val": None},
            {"sym": "C", "val": 5},
        ]
        result = _sort_and_limit(stocks, "val", limit=10)
        symbols = [s["sym"] for s in result]
        assert "B" not in symbols
        assert len(result) == 2

    def test_limit_clamps_output(self, sample_universe):
        result = _sort_and_limit(sample_universe, "daily_change", limit=2)
        assert len(result) == 2

    def test_empty_list(self):
        assert _sort_and_limit([], "val", limit=10) == []


# ---------------------------------------------------------------------------
# Tests: filter_volume_surge
# ---------------------------------------------------------------------------

class TestFilterVolumeSurge:
    def test_returns_positive_change_high_volume(self, sample_universe):
        result = filter_volume_surge(sample_universe, ratio_threshold=2.0)
        for s in result:
            assert s["relative_volume"] >= 2.0
            assert s["daily_change"] > 0
            assert s["avg_volume_30d"] >= 100_000

    def test_excludes_negative_daily_change(self, sample_universe):
        # WMT has negative daily_change
        symbols = [s["symbol"] for s in filter_volume_surge(sample_universe)]
        assert "WMT" not in symbols

    def test_sorted_by_relative_volume(self, sample_universe):
        result = filter_volume_surge(sample_universe, ratio_threshold=1.0)
        vols = [s.get("relative_volume", 0) for s in result]
        assert vols == sorted(vols, reverse=True)

    def test_empty_universe(self):
        assert filter_volume_surge([]) == []

    def test_respects_limit(self, sample_universe):
        result = filter_volume_surge(sample_universe, ratio_threshold=1.0, limit=1)
        assert len(result) <= 1


# ---------------------------------------------------------------------------
# Tests: filter_high_dividend
# ---------------------------------------------------------------------------

class TestFilterHighDividend:
    def test_filters_by_yield_payout_years(self, sample_universe):
        result = filter_high_dividend(sample_universe, min_yield=2.0)
        for s in result:
            assert s["dividend_yield"] >= 2.0
            assert s["payout_ratio"] < 80
            assert s["dividend_payout_years"] >= 3
        symbols = [s["symbol"] for s in result]
        assert "XOM" in symbols
        assert "JPM" in symbols
        # AAPL yield=0.5 excluded, PLTR yield=0 excluded
        assert "AAPL" not in symbols
        assert "PLTR" not in symbols

    def test_sorted_by_dividend_yield(self, sample_universe):
        result = filter_high_dividend(sample_universe, min_yield=1.0)
        yields = [s["dividend_yield"] for s in result]
        assert yields == sorted(yields, reverse=True)


# ---------------------------------------------------------------------------
# Tests: filter_momentum
# ---------------------------------------------------------------------------

class TestFilterMomentum:
    def test_requires_positive_3m_change_and_rsi_range(self, sample_universe):
        result = filter_momentum(sample_universe)
        for s in result:
            assert s["change_3m"] > 0
            assert 50 <= s["rsi"] <= 70
            assert s["above_sma50"] is True
            assert s["avg_volume_30d"] >= 200_000

    def test_excludes_low_rsi(self, sample_universe):
        # JPM rsi=28, PLTR rsi=30 -- both outside 50-70
        symbols = [s["symbol"] for s in filter_momentum(sample_universe)]
        assert "JPM" not in symbols
        assert "PLTR" not in symbols


# ---------------------------------------------------------------------------
# Tests: filter_oversold_quality
# ---------------------------------------------------------------------------

class TestFilterOversoldQuality:
    def test_finds_oversold_quality_stocks(self, sample_universe):
        result = filter_oversold_quality(sample_universe)
        for s in result:
            assert s["rsi"] < 35
            assert s["roe"] > 15
            assert s["analyst_rating"] < 2.5
            assert s["market_cap"] >= 1e9
        # JPM: rsi=28, roe=16, analyst_rating=1.5, market_cap=5.5e11
        symbols = [s["symbol"] for s in result]
        assert "JPM" in symbols

    def test_sorted_by_rsi_ascending(self, sample_universe):
        result = filter_oversold_quality(sample_universe)
        rsis = [s.get("rsi", 100) for s in result]
        assert rsis == sorted(rsis)


# ---------------------------------------------------------------------------
# Tests: filter_by_sector
# ---------------------------------------------------------------------------

class TestFilterBySector:
    def test_filters_by_sector_case_insensitive(self, sample_universe):
        result = filter_by_sector(sample_universe, "technology services")
        assert all(s["sector"] == "Technology Services" for s in result)

    def test_nonexistent_sector_returns_empty(self, sample_universe):
        assert filter_by_sector(sample_universe, "Nonexistent") == []


# ---------------------------------------------------------------------------
# Tests: filter_custom
# ---------------------------------------------------------------------------

class TestFilterCustom:
    def test_gt_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "pe_ttm", "op": "gt", "value": 20}],
            "sort_by": "pe_ttm",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["pe_ttm"] > 20 for s in result)

    def test_lt_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "pe_ttm", "op": "lt", "value": 15}],
            "sort_by": "pe_ttm",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["pe_ttm"] < 15 for s in result)

    def test_gte_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "roe", "op": "gte", "value": 22}],
            "sort_by": "roe",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["roe"] >= 22 for s in result)

    def test_lte_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "rsi", "op": "lte", "value": 30}],
            "sort_by": "rsi",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["rsi"] <= 30 for s in result)

    def test_eq_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "sector", "op": "eq", "value": "Finance"}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["sector"] == "Finance" for s in result)
        assert len(result) == 1

    def test_neq_operator(self, sample_universe):
        criteria = {
            "filters": [{"field": "sector", "op": "neq", "value": "Finance"}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["sector"] != "Finance" for s in result)

    def test_in_operator(self, sample_universe):
        criteria = {
            "filters": [
                {"field": "sector", "op": "in",
                 "value": ["Finance", "Retail Trade"]},
            ],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        assert all(s["sector"] in ["Finance", "Retail Trade"] for s in result)

    def test_multiple_filters_combined(self, sample_universe):
        criteria = {
            "filters": [
                {"field": "pe_ttm", "op": "lt", "value": 30},
                {"field": "roe", "op": "gt", "value": 15},
            ],
            "sort_by": "roe",
            "limit": 10,
        }
        result, _ = filter_custom(sample_universe, criteria)
        for s in result:
            assert s["pe_ttm"] < 30
            assert s["roe"] > 15

    def test_empty_criteria_returns_empty(self, sample_universe):
        assert filter_custom(sample_universe, {}) == ([], 0)
        assert filter_custom(sample_universe, None) == ([], 0)

    def test_unknown_op_is_skipped(self, sample_universe):
        criteria = {
            "filters": [{"field": "pe_ttm", "op": "unknown_op", "value": 10}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        # Unknown op filter is skipped, all stocks pass, then sorted/limited
        result, _ = filter_custom(sample_universe, criteria)
        assert len(result) == 5

    def test_returns_total_matches(self, sample_universe):
        criteria = {
            "filters": [{"field": "roe", "op": "gt", "value": 10}],
            "sort_by": "roe",
            "limit": 2,
        }
        result, total = filter_custom(sample_universe, criteria)
        assert len(result) <= 2
        assert total >= len(result)


# ---------------------------------------------------------------------------
# Tests: filter_hot_sectors
# ---------------------------------------------------------------------------

class TestFilterHotSectors:
    def test_returns_stocks_from_top_sectors(self, sample_universe, sector_stats):
        result = filter_hot_sectors(sample_universe, sector_stats, top_n=2)
        sectors = {s["sector"] for s in result}
        # Top 2: Technology Services, Energy Minerals
        assert sectors <= {"Technology Services", "Energy Minerals"}

    def test_empty_sector_stats_returns_empty(self, sample_universe):
        assert filter_hot_sectors(sample_universe, []) == []

    def test_respects_per_sector_limit(self, sample_universe, sector_stats):
        result = filter_hot_sectors(sample_universe, sector_stats, top_n=1, per_sector=1)
        tech_stocks = [s for s in result if s["sector"] == "Technology Services"]
        assert len(tech_stocks) <= 1


# ---------------------------------------------------------------------------
# Tests: filter_value_discovery
# ---------------------------------------------------------------------------

class TestFilterValueDiscovery:
    def test_finds_value_stocks(self):
        """Build a small universe where one stock is clearly a value candidate."""
        universe = [
            # Cheap stock: low PE vs industry median, near 52w low, good ROE
            {
                "symbol": "CHEAP", "industry": "Widgets",
                "pe_ttm": 8, "roe": 20, "position_52w": 0.2,
            },
            # Expensive stock: high PE
            {
                "symbol": "RICH", "industry": "Widgets",
                "pe_ttm": 40, "roe": 20, "position_52w": 0.8,
            },
            # Another average stock to establish industry median
            {
                "symbol": "AVG", "industry": "Widgets",
                "pe_ttm": 20, "roe": 20, "position_52w": 0.5,
            },
        ]
        result = filter_value_discovery(universe)
        symbols = [s["symbol"] for s in result]
        # CHEAP has PE=8 which is well below median=20, >10% discount, roe>=10
        assert "CHEAP" in symbols
        # RICH pe=40 is above median, discount is negative -> excluded
        assert "RICH" not in symbols

    def test_empty_universe(self):
        assert filter_value_discovery([]) == []

    def test_skips_negative_pe(self):
        universe = [
            {"symbol": "LOSS", "industry": "Widgets", "pe_ttm": -5, "roe": 20,
             "position_52w": 0.3},
            {"symbol": "MED", "industry": "Widgets", "pe_ttm": 15, "roe": 20,
             "position_52w": 0.5},
        ]
        result = filter_value_discovery(universe)
        symbols = [s["symbol"] for s in result]
        assert "LOSS" not in symbols


# ---------------------------------------------------------------------------
# Tests: _safe_float (suggestions.py)
# ---------------------------------------------------------------------------

class TestSafeFloat:
    def test_normal_float(self):
        assert _safe_float(42.5) == 42.5

    def test_none_returns_default(self):
        assert _safe_float(None) is None
        assert _safe_float(None, 0.0) == 0.0

    def test_nan_returns_default(self):
        assert _safe_float(float("nan")) is None

    def test_string_number(self):
        assert _safe_float("3.14") == 3.14

    def test_non_numeric_string_returns_default(self):
        assert _safe_float("hello") is None

    def test_int_coerced(self):
        assert _safe_float(7) == 7.0


# ---------------------------------------------------------------------------
# Tests: _suggest_sector
# ---------------------------------------------------------------------------

class TestSuggestSector:
    def test_returns_suggestion_with_3_plus_sectors(self, sample_universe):
        result = _suggest_sector(sample_universe)
        assert result is not None
        assert result["dimension"] == "sector"
        assert result["type"] == "categorical"
        assert len(result["options"]) >= 3

    def test_returns_none_with_fewer_than_3_sectors(self):
        stocks = [
            {"sector": "Finance"},
            {"sector": "Finance"},
            {"sector": "Energy Minerals"},
        ]
        assert _suggest_sector(stocks) is None


# ---------------------------------------------------------------------------
# Tests: _suggest_market_cap_tier
# ---------------------------------------------------------------------------

class TestSuggestMarketCapTier:
    def test_returns_suggestion_with_2_plus_tiers(self, sample_universe):
        result = _suggest_market_cap_tier(sample_universe)
        assert result is not None
        assert result["dimension"] == "market_cap_tier"
        tier_values = [o["value"] for o in result["options"]]
        # Our universe has mega, large, mid
        assert len(tier_values) >= 2

    def test_returns_none_with_single_tier(self):
        stocks = [{"market_cap_tier": "large"}, {"market_cap_tier": "large"}]
        assert _suggest_market_cap_tier(stocks) is None

    def test_ignores_nan_tier(self):
        stocks = [{"market_cap_tier": "nan"}, {"market_cap_tier": "large"}]
        assert _suggest_market_cap_tier(stocks) is None

    def test_tier_order_preserved(self, sample_universe):
        result = _suggest_market_cap_tier(sample_universe)
        tier_values = [o["value"] for o in result["options"]]
        expected_order = ["mega", "large", "mid", "small"]
        filtered_expected = [t for t in expected_order if t in tier_values]
        assert tier_values == filtered_expected


# ---------------------------------------------------------------------------
# Tests: _suggest_pe
# ---------------------------------------------------------------------------

class TestSuggestPe:
    def test_returns_suggestion_with_spread_pe(self, sample_universe):
        result = _suggest_pe(sample_universe)
        assert result is not None
        assert result["dimension"] == "pe_ttm"
        assert result["type"] == "categorical"

    def test_returns_none_with_uniform_pe(self):
        stocks = [{"pe_ttm": 20}, {"pe_ttm": 21}, {"pe_ttm": 20.5},
                  {"pe_ttm": 19.5}, {"pe_ttm": 20.2}]
        # stdev < 5 -> None
        assert _suggest_pe(stocks) is None

    def test_returns_none_with_too_few_valid_pe(self):
        stocks = [{"pe_ttm": None}] * 10 + [{"pe_ttm": 10}]
        # Only 1/11 valid (9%) < 40% threshold
        assert _suggest_pe(stocks) is None


# ---------------------------------------------------------------------------
# Tests: _suggest_dividend
# ---------------------------------------------------------------------------

class TestSuggestDividend:
    def test_skips_for_high_dividend_strategy(self, sample_universe):
        assert _suggest_dividend(sample_universe, "high_dividend") is None

    def test_returns_suggestion_when_mixed(self):
        # Need >= 3 with dividend AND >= 3 without
        stocks = [
            {"dividend_yield": 2.0}, {"dividend_yield": 3.0},
            {"dividend_yield": 1.5}, {"dividend_yield": 0},
            {"dividend_yield": 0}, {"dividend_yield": 0},
        ]
        result = _suggest_dividend(stocks, "volume_surge")
        assert result is not None
        assert result["dimension"] == "dividend_yield"
        options = {o["value"] for o in result["options"]}
        assert "yes" in options
        assert "no" in options

    def test_returns_none_when_all_have_dividend(self):
        stocks = [{"dividend_yield": 2.0}] * 10
        # no_div = 0, fails < 3 check
        assert _suggest_dividend(stocks, "momentum") is None


# ---------------------------------------------------------------------------
# Tests: _suggest_trend
# ---------------------------------------------------------------------------

class TestSuggestTrend:
    def test_returns_suggestion_with_reasonable_split(self, sample_universe):
        result = _suggest_trend(sample_universe)
        assert result is not None
        assert result["dimension"] == "above_sma200"

    def test_returns_none_when_too_lopsided(self):
        stocks = [{"above_sma200": True}] * 19 + [{"above_sma200": False}]
        # ratio = 1/20 = 0.05 < 0.15 -> None
        assert _suggest_trend(stocks) is None

    def test_returns_none_when_no_sma200_data(self):
        stocks = [{"above_sma200": None}] * 10
        # total = 0 -> None
        assert _suggest_trend(stocks) is None


# ---------------------------------------------------------------------------
# Tests: compute_narrowing_suggestions
# ---------------------------------------------------------------------------

class TestComputeNarrowingSuggestions:
    def test_returns_empty_for_fewer_than_5(self, sample_universe):
        assert compute_narrowing_suggestions(sample_universe[:4]) == []

    def test_returns_suggestions_for_large_list(self):
        """Build a 25-item list with enough variety."""
        stocks = []
        sectors = ["Technology Services", "Finance", "Energy Minerals",
                    "Retail Trade", "Health Services"]
        tiers = ["mega", "large", "mid", "small"]
        for i in range(25):
            stocks.append({
                "sector": sectors[i % 5],
                "market_cap_tier": tiers[i % 4],
                "pe_ttm": 5 + i * 3,  # spread: 5, 8, 11, ..., 77
                "dividend_yield": 2.0 if i % 2 == 0 else 0,
                "above_sma200": i % 3 != 0,
                "rsi": 20 + i * 2.5,
                "roe": 10 + i,
                "analyst_rating": 1.0 + (i % 5) * 0.8,
                "analyst_upside": 5.0 + i,
            })
        result = compute_narrowing_suggestions(stocks, strategy="volume_surge")
        assert 1 <= len(result) <= 4
        dims = [s["dimension"] for s in result]
        # With 25 items (>20), should prefer categorical suggestions
        assert any(d in dims for d in ["sector", "market_cap_tier", "pe_ttm"])

    def test_respects_max_suggestions(self, sample_universe):
        result = compute_narrowing_suggestions(sample_universe, max_suggestions=2)
        assert len(result) <= 2


# ---------------------------------------------------------------------------
# Tests: _clean_nan (refresher.py)
# ---------------------------------------------------------------------------

class TestCleanNan:
    def test_none_passthrough(self):
        assert _clean_nan(None) is None

    def test_nan_returns_none(self):
        assert _clean_nan(float("nan")) is None

    def test_inf_returns_none(self):
        assert _clean_nan(float("inf")) is None

    def test_negative_inf_returns_none(self):
        assert _clean_nan(float("-inf")) is None

    def test_normal_float_passthrough(self):
        assert _clean_nan(42.5) == 42.5

    def test_zero_passthrough(self):
        assert _clean_nan(0.0) == 0.0

    def test_int_passthrough(self):
        assert _clean_nan(7) == 7

    def test_string_passthrough(self):
        assert _clean_nan("hello") == "hello"


# ---------------------------------------------------------------------------
# Tests: _compute_sector_stats (refresher.py)
# ---------------------------------------------------------------------------

class TestComputeSectorStats:
    def test_computes_stats_for_each_sector(self):
        import pandas as pd
        df = pd.DataFrame([
            {"sector": "Tech", "daily_change": 2.0, "weekly_change": 5.0,
             "monthly_change": 10.0, "ytd_change": 20.0, "pe_ttm": 25.0,
             "roe": 18.0, "revenue_growth_ttm": 15.0, "market_cap": 1e12,
             "rsi": 55.0},
            {"sector": "Tech", "daily_change": 3.0, "weekly_change": 6.0,
             "monthly_change": 12.0, "ytd_change": 22.0, "pe_ttm": 30.0,
             "roe": 22.0, "revenue_growth_ttm": 20.0, "market_cap": 5e11,
             "rsi": 60.0},
            {"sector": "Finance", "daily_change": 1.0, "weekly_change": 2.0,
             "monthly_change": 5.0, "ytd_change": 10.0, "pe_ttm": 12.0,
             "roe": 14.0, "revenue_growth_ttm": 8.0, "market_cap": 8e11,
             "rsi": 45.0},
        ])
        stats = _compute_sector_stats(df)
        assert len(stats) == 2
        # Sorted by avg_daily_change desc -> Tech first
        assert stats[0]["sector"] == "Tech"
        assert stats[0]["stock_count"] == 2
        assert stats[0]["avg_daily_change"] == pytest.approx(2.5)
        assert stats[1]["sector"] == "Finance"
        assert stats[1]["stock_count"] == 1

    def test_empty_dataframe(self):
        import pandas as pd
        df = pd.DataFrame(columns=["sector", "daily_change"])
        assert _compute_sector_stats(df) == []

    def test_all_nan_sectors(self):
        import pandas as pd
        df = pd.DataFrame([
            {"sector": None, "daily_change": 1.0, "weekly_change": 2.0,
             "monthly_change": 3.0, "ytd_change": 4.0, "pe_ttm": 10.0,
             "roe": 5.0, "revenue_growth_ttm": 3.0, "market_cap": 1e9,
             "rsi": 50.0},
        ])
        stats = _compute_sector_stats(df)
        assert stats == []

    def test_nan_values_cleaned(self):
        import pandas as pd
        df = pd.DataFrame([
            {"sector": "Tech", "daily_change": float("nan"),
             "weekly_change": 5.0, "monthly_change": 10.0,
             "ytd_change": 20.0, "pe_ttm": 25.0, "roe": 18.0,
             "revenue_growth_ttm": 15.0, "market_cap": 1e12, "rsi": 55.0},
        ])
        stats = _compute_sector_stats(df)
        assert len(stats) == 1
        # avg of single NaN is NaN, _clean_nan converts to None
        assert stats[0]["avg_daily_change"] is None


# ---------------------------------------------------------------------------
# Tests: filter_custom with tickers filter (filters.py)
# ---------------------------------------------------------------------------

class TestFilterCustomTickers:
    """Tests for the special tickers filter in filter_custom."""

    @pytest.fixture
    def ticker_universe(self):
        return [
            {"symbol": "NASDAQ:COIN", "name": "Coinbase", "market_cap": 5e10, "sector": "Finance"},
            {"symbol": "NASDAQ:MARA", "name": "Marathon Digital", "market_cap": 5e9, "sector": "Finance"},
            {"symbol": "NASDAQ:AAPL", "name": "Apple", "market_cap": 3e12, "sector": "Technology Services"},
            {"symbol": "NYSE:JPM", "name": "JPMorgan", "market_cap": 5.5e11, "sector": "Finance"},
        ]

    def test_ticker_filter_matches_by_symbol(self, ticker_universe):
        criteria = {
            "filters": [{"field": "tickers", "op": "in", "value": ["COIN", "MARA"]}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, total = filter_custom(ticker_universe, criteria)
        symbols = [s["symbol"].split(":")[-1] for s in result]
        assert "COIN" in symbols
        assert "MARA" in symbols
        assert "AAPL" not in symbols
        assert total == 2

    def test_ticker_filter_case_insensitive(self, ticker_universe):
        criteria = {
            "filters": [{"field": "tickers", "op": "in", "value": ["coin", "Mara"]}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, total = filter_custom(ticker_universe, criteria)
        assert total == 2

    def test_ticker_filter_with_additional_filters(self, ticker_universe):
        criteria = {
            "filters": [
                {"field": "tickers", "op": "in", "value": ["COIN", "MARA", "AAPL"]},
                {"field": "sector", "op": "eq", "value": "Finance"},
            ],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, total = filter_custom(ticker_universe, criteria)
        # AAPL is in tickers but sector != Finance
        symbols = [s["symbol"].split(":")[-1] for s in result]
        assert "COIN" in symbols
        assert "MARA" in symbols
        assert "AAPL" not in symbols
        assert total == 2

    def test_ticker_filter_no_matches(self, ticker_universe):
        criteria = {
            "filters": [{"field": "tickers", "op": "in", "value": ["NONEXIST"]}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, total = filter_custom(ticker_universe, criteria)
        assert total == 0
        assert result == []

    def test_ticker_filter_empty_list(self, ticker_universe):
        criteria = {
            "filters": [{"field": "tickers", "op": "in", "value": []}],
            "sort_by": "market_cap",
            "limit": 10,
        }
        result, total = filter_custom(ticker_universe, criteria)
        assert total == 0


# ---------------------------------------------------------------------------
# Tests: filter_by_tickers tool (agent.py)
# ---------------------------------------------------------------------------

class TestFilterByTickers:
    """Tests for the filter_by_tickers FunctionTool in agent.py."""

    @pytest.fixture
    def crypto_universe(self):
        return [
            {"symbol": "NASDAQ:COIN", "name": "Coinbase", "sector": "Finance",
             "industry": "Crypto Exchange", "price": 250, "market_cap": 5e10,
             "pe_ttm": 30, "roe": 15, "daily_change": 3.2,
             "dividend_yield": 0, "rsi": 62, "analyst_rating": 2.1,
             "revenue_growth_ttm": 45, "change_3m": 25},
            {"symbol": "NASDAQ:MARA", "name": "Marathon Digital", "sector": "Finance",
             "industry": "Crypto Mining", "price": 22, "market_cap": 5e9,
             "pe_ttm": None, "roe": -5, "daily_change": 5.1,
             "dividend_yield": 0, "rsi": 55, "analyst_rating": 3.0,
             "revenue_growth_ttm": 120, "change_3m": 40},
            {"symbol": "NASDAQ:AAPL", "name": "Apple", "sector": "Technology Services",
             "industry": "Consumer Electronics", "price": 180, "market_cap": 3e12,
             "pe_ttm": 28, "roe": 25, "daily_change": 1.5,
             "dividend_yield": 0.5, "rsi": 58, "analyst_rating": 1.8,
             "revenue_growth_ttm": 8, "change_3m": 12},
            {"symbol": "NYSE:SQ", "name": "Block Inc", "sector": "Technology Services",
             "industry": "Fintech", "price": 75, "market_cap": 4e10,
             "pe_ttm": 50, "roe": 8, "daily_change": 2.0,
             "dividend_yield": 0, "rsi": 48, "analyst_rating": 2.5,
             "revenue_growth_ttm": 20, "change_3m": 15},
        ]

    @pytest.mark.asyncio
    async def test_matches_tickers_in_universe(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["COIN", "MARA", "SQ"]))
            assert result["match_count"] == 3
            tickers = [p["ticker"] for p in result["preview"]]
            assert "COIN" in tickers
            assert "MARA" in tickers
            assert "SQ" in tickers
            assert "AAPL" not in tickers
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_reports_not_in_universe(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["COIN", "RIOT", "BTBT"]))
            assert result["match_count"] == 1
            assert "RIOT" in result["not_in_universe"]
            assert "BTBT" in result["not_in_universe"]
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_case_insensitive(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["coin", "Mara"]))
            assert result["match_count"] == 2
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_sorted_by_market_cap_desc(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["COIN", "MARA", "AAPL", "SQ"]))
            caps = [p.get("market_cap", 0) for p in result["preview"]]
            assert caps == sorted(caps, reverse=True)
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_empty_tickers_returns_zero(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers([]))
            assert result["match_count"] == 0
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_preview_includes_industry_field(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["COIN"]))
            preview = result["preview"][0]
            assert "industry" in preview
            assert preview["industry"] == "Crypto Exchange"
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_invalid_input_returns_error(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers("not a list"))
            assert "error" in result
        finally:
            _current_universe.set([])

    @pytest.mark.asyncio
    async def test_whitespace_in_tickers_stripped(self, crypto_universe):
        _current_universe.set(crypto_universe)
        try:
            result = json.loads(await filter_by_tickers(["  COIN  ", " MARA"]))
            assert result["match_count"] == 2
        finally:
            _current_universe.set([])


# ---------------------------------------------------------------------------
# Tests: get_field_distribution (agent.py)
# ---------------------------------------------------------------------------

class TestGetFieldDistribution:
    """Tests for get_field_distribution tool."""

    @pytest.fixture(autouse=True)
    def set_universe(self, sample_universe):
        _current_universe.set(sample_universe)
        yield
        _current_universe.set([])

    @pytest.mark.asyncio
    async def test_numeric_field_stats(self):
        result = json.loads(await get_field_distribution("pe_ttm"))
        assert result["type"] == "numeric"
        assert "min" in result
        assert "max" in result
        assert "mean" in result
        assert "median" in result
        assert result["non_null_count"] > 0

    @pytest.mark.asyncio
    async def test_categorical_field_stats(self):
        result = json.loads(await get_field_distribution("sector"))
        assert result["type"] == "categorical"
        assert "top_values" in result
        assert result["unique_count"] > 0

    @pytest.mark.asyncio
    async def test_boolean_field_stats(self):
        result = json.loads(await get_field_distribution("above_sma50"))
        assert result["type"] == "boolean"
        assert "true_count" in result
        assert "false_count" in result

    @pytest.mark.asyncio
    async def test_nonexistent_field(self):
        result = json.loads(await get_field_distribution("nonexistent_field"))
        assert "error" in result
        assert result["non_null_count"] == 0

    @pytest.mark.asyncio
    async def test_sector_filter(self):
        result = json.loads(await get_field_distribution("pe_ttm", sector="Finance"))
        assert result["type"] == "numeric"
        # Only JPM in Finance sector
        assert result["non_null_count"] == 1


# ---------------------------------------------------------------------------
# Tests: list_available_sectors (agent.py)
# ---------------------------------------------------------------------------

class TestListAvailableSectors:
    """Tests for list_available_sectors tool."""

    @pytest.fixture(autouse=True)
    def set_universe(self, sample_universe):
        _current_universe.set(sample_universe)
        yield
        _current_universe.set([])

    @pytest.mark.asyncio
    async def test_returns_sectors_with_counts(self):
        result = json.loads(await list_available_sectors())
        assert result["total_sectors"] > 0
        assert result["total_stocks"] == 5
        for sector in result["sectors"]:
            assert "sector_en" in sector
            assert "sector_zh" in sector
            assert "count" in sector
            assert sector["count"] > 0

    @pytest.mark.asyncio
    async def test_empty_universe(self, monkeypatch):
        # Setting _current_universe to [] alone isn't enough — the agent's
        # `_ensure_universe()` then falls through to the lazy loader. Mock the
        # loader itself so the function genuinely sees an empty universe.
        async def _empty_loader():
            return []
        from app.features.screener import agent as screener_agent
        monkeypatch.setattr(screener_agent, "_ensure_universe", _empty_loader)
        result = json.loads(await list_available_sectors())
        assert "error" in result
