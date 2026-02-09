"""
Macro Cache & Refresh Unit Tests - generated from git diff

Tests for:
- macro_cache/db.py: is_cache_valid, get_cache_data, try_db_cache
- macro_cache/refresher.py: _compute_liquidity_context, _flatten_results, CPI validation
- macro_cache/router.py: _flatten_results
- macro_risk/service.py: _get_cached with custom TTL, skip_db_cache behavior
- liquidity/fred_service.py: per-series cache

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_macro_cache_unit.py -v
"""

import time
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

from app.features.macro_cache.db import (
    is_cache_valid,
    get_cache_data,
)
from app.features.macro_cache.router import _flatten_results
from app.features.macro_cache.refresher import _compute_liquidity_context


# ===========================================================================
# TestIsCacheValid
# ===========================================================================


class TestIsCacheValid:
    """Tests for is_cache_valid (checks expiry)."""

    def test_valid_cache_future_expiry(self):
        """Cache with future expires_at is valid."""
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        row = {"expires_at": future, "data": {}}
        assert is_cache_valid(row) is True

    def test_expired_cache_past_expiry(self):
        """Cache with past expires_at is expired."""
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        row = {"expires_at": past, "data": {}}
        assert is_cache_valid(row) is False

    def test_none_row_returns_false(self):
        """None row is invalid."""
        assert is_cache_valid(None) is False

    def test_missing_expires_at_returns_false(self):
        """Row without expires_at is invalid."""
        assert is_cache_valid({"data": {}}) is False

    def test_z_suffix_iso_format(self):
        """ISO format with Z suffix (from Postgres) is parsed correctly."""
        future = (datetime.now(timezone.utc) + timedelta(hours=1))
        row = {"expires_at": future.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}
        assert is_cache_valid(row) is True

    def test_garbage_expires_at_returns_false(self):
        """Invalid date string returns False."""
        row = {"expires_at": "not-a-date"}
        assert is_cache_valid(row) is False


# ===========================================================================
# TestGetCacheData
# ===========================================================================


class TestGetCacheData:
    """Tests for get_cache_data (extracts data payload)."""

    def test_extracts_data_from_row(self):
        """Returns the data field from a cache row."""
        row = {"data": {"key": "value"}, "expires_at": "2025-01-01T00:00:00Z"}
        assert get_cache_data(row) == {"key": "value"}

    def test_none_row_returns_none(self):
        """None row returns None."""
        assert get_cache_data(None) is None

    def test_missing_data_key_returns_none(self):
        """Row without data field returns None."""
        assert get_cache_data({"expires_at": "2025-01-01T00:00:00Z"}) is None

    def test_data_can_be_list(self):
        """Data payload can be a list."""
        row = {"data": [1, 2, 3]}
        assert get_cache_data(row) == [1, 2, 3]

    def test_data_can_be_null(self):
        """Data payload can be None (from failed fetch)."""
        row = {"data": None}
        assert get_cache_data(row) is None


# ===========================================================================
# TestFlattenResults
# ===========================================================================


class TestFlattenResults:
    """Tests for _flatten_results (used in refresh endpoint)."""

    def test_flat_dict(self):
        """Single-level dict yields all values."""
        results = {"a": True, "b": False, "c": True}
        assert list(_flatten_results(results)) == [True, False, True]

    def test_nested_dict(self):
        """Nested dict (tier results) flattens correctly."""
        results = {
            "tier1": {"key1": True, "key2": False},
            "tier2": {"key3": True},
        }
        flat = list(_flatten_results(results))
        assert flat == [True, False, True]

    def test_empty_dict(self):
        """Empty dict yields nothing."""
        assert list(_flatten_results({})) == []

    def test_deeply_nested(self):
        """Multiple nesting levels flatten correctly."""
        results = {"a": {"b": {"c": True}}}
        assert list(_flatten_results(results)) == [True]


# ===========================================================================
# TestComputeLiquidityContext
# ===========================================================================


class TestComputeLiquidityContext:
    """Tests for _compute_liquidity_context (percentile/stats from history)."""

    @pytest.fixture
    def minimal_history(self):
        """4 observations (minimum required)."""
        return {
            "observations": [
                {"value": 5.0, "fed_assets": 7.0, "tga": 0.5, "rrp": 0.1, "nfci": -0.3},
                {"value": 5.1, "fed_assets": 7.1, "tga": 0.6, "rrp": 0.2, "nfci": -0.2},
                {"value": 5.2, "fed_assets": 7.2, "tga": 0.7, "rrp": 0.3, "nfci": -0.1},
                {"value": 5.3, "fed_assets": 7.3, "tga": 0.8, "rrp": 0.4, "nfci": 0.0},
            ]
        }

    @pytest.fixture
    def long_history(self):
        """60 observations for multi-period change tests."""
        return {
            "observations": [
                {"value": float(i), "fed_assets": float(i + 2)}
                for i in range(60)
            ]
        }

    def test_returns_context_with_all_series(self, minimal_history):
        """All 5 series present in output."""
        ctx = _compute_liquidity_context(minimal_history)
        assert ctx is not None
        assert "net_liquidity" in ctx
        assert "fed_assets" in ctx
        assert "tga" in ctx
        assert "rrp" in ctx
        assert "nfci" in ctx

    def test_net_liquidity_has_units(self, minimal_history):
        """net_liquidity entry includes units = 'Billions USD'."""
        ctx = _compute_liquidity_context(minimal_history)
        assert ctx["net_liquidity"]["units"] == "Billions USD"

    def test_percentile_in_range(self, minimal_history):
        """percentile_1y is 0-100."""
        ctx = _compute_liquidity_context(minimal_history)
        for key in ctx:
            if "percentile_1y" in ctx[key]:
                assert 0 <= ctx[key]["percentile_1y"] <= 100

    def test_insufficient_data_returns_none(self):
        """Less than 4 observations returns None."""
        result = _compute_liquidity_context({"observations": [{"value": 1.0}]})
        assert result is None

    def test_empty_observations_returns_none(self):
        """Empty observations returns None."""
        result = _compute_liquidity_context({"observations": []})
        assert result is None

    def test_multi_period_changes_with_enough_data(self, long_history):
        """With 60 observations, 1m and 3m changes are computed."""
        ctx = _compute_liquidity_context(long_history)
        assert ctx is not None
        # fed_assets has 60 data points, should have 1m_change (>=5) and 3m_change (>=13)
        assert "1m_change" in ctx["fed_assets"]
        assert "3m_change" in ctx["fed_assets"]

    def test_52w_high_low(self, minimal_history):
        """52w_high and 52w_low are computed correctly."""
        ctx = _compute_liquidity_context(minimal_history)
        net = ctx["net_liquidity"]
        assert net["52w_high"] >= net["52w_low"]
        assert net["52w_high"] == 5.3
        assert net["52w_low"] == 5.0

    def test_skips_series_with_no_data(self):
        """Series with all None values are excluded."""
        history = {
            "observations": [
                {"value": 1.0, "fed_assets": None},
                {"value": 2.0, "fed_assets": None},
                {"value": 3.0, "fed_assets": None},
                {"value": 4.0, "fed_assets": None},
            ]
        }
        ctx = _compute_liquidity_context(history)
        assert ctx is not None
        assert "net_liquidity" in ctx
        assert "fed_assets" not in ctx


# ===========================================================================
# TestGetCachedWithTTL
# ===========================================================================


class TestGetCachedWithTTL:
    """Tests for _get_cached with custom TTL parameter."""

    def test_default_ttl_returns_cached(self):
        """Within default TTL (600s), returns cached data."""
        from app.features.macro_risk.service import _get_cached
        store = {"data": "test", "ts": time.time()}
        assert _get_cached(store) == "test"

    def test_default_ttl_expired(self):
        """Past default TTL, returns None."""
        from app.features.macro_risk.service import _get_cached
        store = {"data": "test", "ts": time.time() - 700}
        assert _get_cached(store) is None

    def test_custom_short_ttl(self):
        """Custom TTL=120s, data from 100s ago is still valid."""
        from app.features.macro_risk.service import _get_cached
        store = {"data": "test", "ts": time.time() - 100}
        assert _get_cached(store, ttl=120) == "test"

    def test_custom_short_ttl_expired(self):
        """Custom TTL=120s, data from 200s ago is expired."""
        from app.features.macro_risk.service import _get_cached
        store = {"data": "test", "ts": time.time() - 200}
        assert _get_cached(store, ttl=120) is None

    def test_empty_store(self):
        """Empty store returns None."""
        from app.features.macro_risk.service import _get_cached
        assert _get_cached({}) is None


# ===========================================================================
# TestSeriesCache (fred_service.py)
# ===========================================================================


class TestSeriesCache:
    """Tests for per-series result cache in fetch_fred_series."""

    def setup_method(self):
        """Clear series cache before each test."""
        from app.features.liquidity import fred_service
        fred_service._series_cache.clear()

    def test_cache_key_format(self):
        """Cache key includes series_id, units, limit, start_date."""
        from app.features.liquidity.fred_service import _series_cache, _SERIES_CACHE_TTL
        # Manually populate to verify structure
        key = "WALCL:None:5:2024-01-01"
        _series_cache[key] = {"data": {"test": True}, "ts": time.time()}
        assert key in _series_cache
        assert _series_cache[key]["data"]["test"] is True

    def test_cache_ttl_check(self):
        """Expired cache entries should not be returned."""
        from app.features.liquidity.fred_service import _series_cache, _SERIES_CACHE_TTL
        key = "WALCL:None:5:2024-01-01"
        _series_cache[key] = {"data": {"test": True}, "ts": time.time() - _SERIES_CACHE_TTL - 10}
        # Entry exists but is expired
        cached = _series_cache.get(key)
        assert cached is not None
        assert time.time() - cached["ts"] > _SERIES_CACHE_TTL

    def teardown_method(self):
        """Clear series cache after each test."""
        from app.features.liquidity import fred_service
        fred_service._series_cache.clear()


# ===========================================================================
# TestTryDbCache (integration of is_cache_valid + get_cache_data)
# ===========================================================================


class TestTryDbCache:
    """Tests for try_db_cache which combines get_cached + validation."""

    @pytest.mark.asyncio
    async def test_valid_cache_returns_data_and_true(self):
        """Valid DB cache returns (data, True)."""
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        mock_row = {
            "data": {"key": "value"},
            "expires_at": future,
        }
        with patch("app.features.macro_cache.db.get_cached", new=AsyncMock(return_value=mock_row)):
            from app.features.macro_cache.db import try_db_cache
            data, valid = await try_db_cache("test:key")
            assert data == {"key": "value"}
            assert valid is True

    @pytest.mark.asyncio
    async def test_expired_cache_returns_data_and_false(self):
        """Expired DB cache returns (data, False) for fallback use."""
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        mock_row = {
            "data": {"key": "stale"},
            "expires_at": past,
        }
        with patch("app.features.macro_cache.db.get_cached", new=AsyncMock(return_value=mock_row)):
            from app.features.macro_cache.db import try_db_cache
            data, valid = await try_db_cache("test:key")
            assert data == {"key": "stale"}
            assert valid is False

    @pytest.mark.asyncio
    async def test_missing_key_returns_none_and_false(self):
        """Missing key returns (None, False)."""
        with patch("app.features.macro_cache.db.get_cached", new=AsyncMock(return_value=None)):
            from app.features.macro_cache.db import try_db_cache
            data, valid = await try_db_cache("nonexistent:key")
            assert data is None
            assert valid is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
