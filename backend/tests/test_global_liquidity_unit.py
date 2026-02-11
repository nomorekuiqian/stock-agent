"""
Global Liquidity Service Unit Tests -- generated from git diff

Tests for:
- global_service._build_metric: metric dict construction
- global_service.find_closest_value (via get_global_liquidity_history internals)
- global_service._get_cached_global: in-memory cache TTL
- global_service.fetch_and_compute_global_m2: unit conversions and formula
- global_service.get_global_liquidity_history: date backbone + observation assembly

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_global_liquidity_unit.py -v
"""

import time
import pytest
from unittest.mock import patch, AsyncMock

from app.features.liquidity.global_service import (
    _get_cached_global,
    _global_cache,
    _CACHE_TTL,
    GLOBAL_M2_SERIES,
    CENTRAL_BANK_SERIES,
    DRAIN_SERIES,
    FX_SERIES,
)


# ===========================================================================
# TestSeriesConstants
# ===========================================================================


class TestSeriesConstants:
    """Tests for FRED series ID constants."""

    def test_global_m2_has_us(self):
        """US M2 series is defined."""
        assert "us_m2" in GLOBAL_M2_SERIES
        assert GLOBAL_M2_SERIES["us_m2"] == "M2SL"

    def test_central_bank_series_complete(self):
        """Fed, ECB, BOJ asset series are defined."""
        assert "fed_assets" in CENTRAL_BANK_SERIES
        assert "ecb_assets" in CENTRAL_BANK_SERIES
        assert "boj_assets" in CENTRAL_BANK_SERIES

    def test_drain_series_complete(self):
        """TGA and RRP drain series are defined."""
        assert "tga" in DRAIN_SERIES
        assert "rrp" in DRAIN_SERIES

    def test_fx_series_complete(self):
        """EUR/USD and USD/JPY FX series are defined."""
        assert "eurusd" in FX_SERIES
        assert "usdjpy" in FX_SERIES


# ===========================================================================
# TestGetCachedGlobal
# ===========================================================================


class TestGetCachedGlobal:
    """Tests for _get_cached_global in-memory cache."""

    def setup_method(self):
        """Clear global cache before each test."""
        _global_cache.clear()

    def test_empty_cache_returns_none(self):
        """Empty cache returns None."""
        assert _get_cached_global() is None

    def test_valid_cache_returns_data(self):
        """Cache within TTL returns data."""
        _global_cache["data"] = {"test": True}
        _global_cache["ts"] = time.time()
        assert _get_cached_global() == {"test": True}

    def test_expired_cache_returns_none(self):
        """Cache past TTL returns None."""
        _global_cache["data"] = {"test": True}
        _global_cache["ts"] = time.time() - _CACHE_TTL - 10
        assert _get_cached_global() is None

    def test_cache_without_ts_returns_none(self):
        """Cache without timestamp returns None (ts=0 default is expired)."""
        _global_cache["data"] = {"test": True}
        # No "ts" key -> .get("ts", 0) -> expired
        assert _get_cached_global() is None

    def teardown_method(self):
        """Restore global cache."""
        _global_cache.clear()


# ===========================================================================
# TestFetchAndComputeGlobalM2
# ===========================================================================


class TestFetchAndComputeGlobalM2:
    """Tests for fetch_and_compute_global_m2 unit conversions and formula."""

    @pytest.fixture
    def mock_raw_metrics(self):
        """Raw FRED data for all series."""
        return {
            "us_m2": {"value": 21000.0, "date": "2025-01-01", "change": 100.0},
            "fed_assets": {"value": 7000000.0, "date": "2025-01-02", "change": -50000.0},  # USD Millions
            "ecb_assets": {"value": 6500000.0, "date": "2025-01-02", "change": 10000.0},  # EUR Millions
            "boj_assets": {"value": 7500000.0, "date": "2025-01-02", "change": 5000.0},  # JPY 100M
            "tga": {"value": 750000.0, "date": "2025-01-02", "change": -10000.0},  # USD Millions
            "rrp": {"value": 500.0, "date": "2025-01-02", "change": -20.0},  # USD Billions
            "eurusd": {"value": 1.08, "date": "2025-01-02"},
            "usdjpy": {"value": 150.0, "date": "2025-01-02"},
        }

    @pytest.mark.asyncio
    async def test_compute_all_components(self, mock_raw_metrics):
        """Computes all metrics when all data is available."""
        async def mock_fetch_one(key, series_id):
            return key, mock_raw_metrics.get(key, {"value": None})

        with patch(
            "app.features.liquidity.global_service.get_latest_value",
            new=AsyncMock(side_effect=lambda sid: mock_raw_metrics[
                next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            ]),
        ):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        assert "global_liquidity" in result
        assert "fed_assets" in result
        assert "us_m2" in result
        assert "ecb_assets" in result
        assert "boj_assets" in result
        assert "fx_rates" in result

    @pytest.mark.asyncio
    async def test_fed_conversion_millions_to_billions(self, mock_raw_metrics):
        """Fed assets converts from Millions to Billions (/ 1000)."""
        async def mock_get_latest(sid):
            key = next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            return mock_raw_metrics[key]

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        # 7,000,000 millions / 1000 = 7000 billions
        assert result["fed_assets"]["value"] == 7000.0

    @pytest.mark.asyncio
    async def test_ecb_conversion_with_fx(self, mock_raw_metrics):
        """ECB assets: EUR Millions * EUR/USD / 1000 = USD Billions."""
        async def mock_get_latest(sid):
            key = next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            return mock_raw_metrics[key]

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        # 6,500,000 * 1.08 / 1000 = 7020.0
        assert result["ecb_assets"]["value"] == 7020.0

    @pytest.mark.asyncio
    async def test_boj_conversion_with_fx(self, mock_raw_metrics):
        """BOJ assets: JPY 100M * 1e8 / USD/JPY / 1e9 = USD Billions."""
        async def mock_get_latest(sid):
            key = next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            return mock_raw_metrics[key]

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        # 7,500,000 * 1e8 / 150.0 / 1e9 = 5000.0
        assert result["boj_assets"]["value"] == 5000.0

    @pytest.mark.asyncio
    async def test_global_liquidity_formula(self, mock_raw_metrics):
        """Global Liquidity = Fed + ECB + BOJ - TGA - RRP."""
        async def mock_get_latest(sid):
            key = next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            return mock_raw_metrics[key]

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        fed = 7000.0     # 7,000,000 / 1000
        ecb = 7020.0     # 6,500,000 * 1.08 / 1000
        boj = 5000.0     # 7,500,000 * 1e8 / 150 / 1e9
        tga = 750.0      # 750,000 / 1000
        rrp = 500.0      # already billions
        expected = fed + ecb + boj - tga - rrp  # 17770.0

        assert result["global_liquidity"]["value"] == round(expected, 2)

    @pytest.mark.asyncio
    async def test_missing_fx_rate_ecb_is_none(self):
        """ECB value is None when EUR/USD rate is missing."""
        raw = {
            "us_m2": {"value": 21000.0, "date": "2025-01-01"},
            "fed_assets": {"value": 7000000.0, "date": "2025-01-02"},
            "ecb_assets": {"value": 6500000.0, "date": "2025-01-02"},
            "boj_assets": {"value": 7500000.0, "date": "2025-01-02"},
            "tga": {"value": 750000.0, "date": "2025-01-02"},
            "rrp": {"value": 500.0, "date": "2025-01-02"},
            "eurusd": {"value": None},  # Missing FX rate
            "usdjpy": {"value": 150.0, "date": "2025-01-02"},
        }

        async def mock_get_latest(sid):
            key = next(k for k, v in {**GLOBAL_M2_SERIES, **CENTRAL_BANK_SERIES, **DRAIN_SERIES, **FX_SERIES}.items() if v == sid)
            return raw[key]

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        assert result["ecb_assets"]["value"] is None
        # Global liquidity should also be None since ECB is None
        assert result["global_liquidity"]["value"] is None

    @pytest.mark.asyncio
    async def test_fetch_failure_returns_none_value(self):
        """A failed series fetch results in None value for that metric."""
        async def mock_get_latest(sid):
            if sid == "M2SL":
                raise Exception("FRED timeout")
            return {"value": 1000.0, "date": "2025-01-01"}

        with patch("app.features.liquidity.global_service.get_latest_value", new=AsyncMock(side_effect=mock_get_latest)):
            from app.features.liquidity.global_service import fetch_and_compute_global_m2
            result = await fetch_and_compute_global_m2()

        assert result["us_m2"]["value"] is None


# ===========================================================================
# TestGetGlobalLiquidityHistory
# ===========================================================================


class TestGetGlobalLiquidityHistory:
    """Tests for get_global_liquidity_history date alignment and computation."""

    @pytest.fixture
    def mock_fred_responses(self):
        """Fake FRED series responses for history."""
        dates = ["2024-06-01", "2024-07-01", "2024-08-01"]

        def make_obs(values):
            return {"observations": [{"date": d, "value": v} for d, v in zip(dates, values)]}

        return {
            "WALCL": make_obs([7000000.0, 7100000.0, 7200000.0]),  # Fed: Millions
            "ECBASSETSW": make_obs([6500000.0, 6600000.0, 6700000.0]),  # ECB: EUR Millions
            "JPNASSETS": make_obs([7500000.0, 7600000.0, 7700000.0]),  # BOJ: JPY 100M
            "WDTGAL": make_obs([750000.0, 760000.0, 770000.0]),  # TGA: Millions
            "RRPONTSYD": make_obs([500.0, 490.0, 480.0]),  # RRP: Billions
            "DEXUSEU": make_obs([1.08, 1.09, 1.10]),  # EUR/USD
            "DEXJPUS": make_obs([150.0, 148.0, 146.0]),  # USD/JPY
        }

    @pytest.mark.asyncio
    async def test_history_returns_observations(self, mock_fred_responses):
        """History returns sorted observations with time and value."""
        async def mock_fetch(series_id, start_date, end_date, limit=500):
            return mock_fred_responses.get(series_id, {"series_id": series_id, "observations": []})

        with patch("app.features.liquidity.global_service.fetch_fred_series", new=AsyncMock(side_effect=mock_fetch)):
            with patch("app.features.liquidity.global_service.try_db_cache", new=AsyncMock(return_value=(None, False))):
                from app.features.liquidity.global_service import get_global_liquidity_history
                result = await get_global_liquidity_history(days=365)

        assert result["series_id"] == "GLOBAL_LIQUIDITY_INDEX"
        assert len(result["observations"]) == 3
        # Sorted by time
        assert result["observations"][0]["time"] == "2024-06-01"
        assert result["observations"][-1]["time"] == "2024-08-01"

    @pytest.mark.asyncio
    async def test_history_observation_values_are_computed(self, mock_fred_responses):
        """Each observation value follows the Global Liquidity formula."""
        async def mock_fetch(series_id, start_date, end_date, limit=500):
            return mock_fred_responses.get(series_id, {"series_id": series_id, "observations": []})

        with patch("app.features.liquidity.global_service.fetch_fred_series", new=AsyncMock(side_effect=mock_fetch)):
            with patch("app.features.liquidity.global_service.try_db_cache", new=AsyncMock(return_value=(None, False))):
                from app.features.liquidity.global_service import get_global_liquidity_history
                result = await get_global_liquidity_history(days=365)

        obs0 = result["observations"][0]
        assert obs0["value"] is not None
        # Manual check for first date:
        # fed = 7000000/1000 = 7000, ecb = 6500000*1.08/1000 = 7020
        # boj = 7500000*1e8/150/1e9 = 5000, tga = 750000/1000 = 750, rrp = 500
        # total = 7000 + 7020 + 5000 - 750 - 500 = 17770
        assert obs0["value"] == 17770.0

    @pytest.mark.asyncio
    async def test_history_with_missing_component_returns_none_value(self):
        """Observation value is None when a component series is missing."""
        dates = ["2024-06-01"]

        async def mock_fetch(series_id, start_date, end_date, limit=500):
            if series_id == "WALCL":
                return {"observations": [{"date": "2024-06-01", "value": 7000000.0}]}
            return {"observations": []}  # No data for other series

        with patch("app.features.liquidity.global_service.fetch_fred_series", new=AsyncMock(side_effect=mock_fetch)):
            with patch("app.features.liquidity.global_service.try_db_cache", new=AsyncMock(return_value=(None, False))):
                from app.features.liquidity.global_service import get_global_liquidity_history
                result = await get_global_liquidity_history(days=365)

        assert len(result["observations"]) == 1
        assert result["observations"][0]["value"] is None

    @pytest.mark.asyncio
    async def test_history_uses_db_cache_for_365_days(self):
        """For 365-day requests, DB cache is checked first."""
        cached_data = {
            "series_id": "GLOBAL_LIQUIDITY_INDEX",
            "observations": [{"time": "2024-01-01", "value": 15000.0}],
        }

        with patch("app.features.liquidity.global_service.try_db_cache", new=AsyncMock(return_value=(cached_data, True))):
            from app.features.liquidity.global_service import get_global_liquidity_history
            result = await get_global_liquidity_history(days=365)

        assert result == cached_data

    @pytest.mark.asyncio
    async def test_history_skips_db_cache_for_non_365(self):
        """Non-365-day requests skip DB cache."""
        async def mock_fetch(series_id, start_date, end_date, limit=500):
            return {"observations": []}

        with patch("app.features.liquidity.global_service.fetch_fred_series", new=AsyncMock(side_effect=mock_fetch)):
            from app.features.liquidity.global_service import get_global_liquidity_history
            result = await get_global_liquidity_history(days=90)

        assert result["series_id"] == "GLOBAL_LIQUIDITY_INDEX"
        assert result["observations"] == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
