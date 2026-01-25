"""
Stock Cache Tests

Part A: Router price history in-memory cache (_get_cached_history, _set_cached_history)
Part B: YFQuoteCache (get, set, get_many, set_many, clear, stats, TTL expiration)

No network access. Uses time mocking for TTL tests.
"""

import time
import pytest
from datetime import datetime, timedelta

from app.features.stock.router import (
    _get_cached_history,
    _set_cached_history,
    _price_history_cache,
    _price_history_lock,
)
from app.shared.yfinance_service import YFQuoteCache


# ===========================================================================
# Part A: Router Price History Cache
# ===========================================================================


class TestPriceHistoryCache:
    """Tests for router-level price history in-memory cache."""

    def setup_method(self):
        """Clear cache before each test."""
        with _price_history_lock:
            _price_history_cache.clear()

    def test_set_then_get(self):
        """Set a value, then get returns it."""
        data = {"success": True, "symbol": "AAPL", "data": [1, 2, 3]}
        _set_cached_history("AAPL", 30, data)
        result = _get_cached_history("AAPL", 30)
        assert result == data

    def test_different_symbols_isolated(self):
        """Different symbols are cached independently."""
        _set_cached_history("AAPL", 30, {"symbol": "AAPL"})
        _set_cached_history("MSFT", 30, {"symbol": "MSFT"})
        assert _get_cached_history("AAPL", 30)["symbol"] == "AAPL"
        assert _get_cached_history("MSFT", 30)["symbol"] == "MSFT"

    def test_different_days_isolated(self):
        """Same symbol with different days are cached independently."""
        _set_cached_history("AAPL", 30, {"days": 30})
        _set_cached_history("AAPL", 365, {"days": 365})
        assert _get_cached_history("AAPL", 30)["days"] == 30
        assert _get_cached_history("AAPL", 365)["days"] == 365

    def test_missing_key_returns_none(self):
        """Non-existent key returns None."""
        assert _get_cached_history("XXXX", 30) is None

    def test_expired_entry_returns_none(self):
        """Expired cache entry returns None."""
        # Set with a past expiry by directly manipulating cache
        key = ("AAPL", 30)
        with _price_history_lock:
            _price_history_cache[key] = {
                "data": {"symbol": "AAPL"},
                "expires": datetime.now() - timedelta(minutes=1),
            }
        result = _get_cached_history("AAPL", 30)
        assert result is None


# ===========================================================================
# Part B: YFQuoteCache
# ===========================================================================


class TestYFQuoteCache:
    """Tests for YFQuoteCache thread-safe TTL cache."""

    def test_get_set_basic(self):
        """Basic set/get cycle works."""
        cache = YFQuoteCache(ttl_seconds=60)
        cache.set("AAPL", {"price": 195.0})
        result = cache.get("AAPL")
        assert result is not None
        assert result["price"] == 195.0

    def test_get_expired_returns_none(self):
        """Expired entries return None."""
        cache = YFQuoteCache(ttl_seconds=1)
        cache.set("AAPL", {"price": 195.0})
        # Manually set timestamp to past
        with cache._lock:
            val, _ = cache._cache["AAPL"]
            cache._cache["AAPL"] = (val, time.time() - 10)
        result = cache.get("AAPL")
        assert result is None

    def test_get_many_separates_cached_and_missing(self):
        """get_many returns cached results and missing keys."""
        cache = YFQuoteCache(ttl_seconds=60)
        cache.set("AAPL", {"price": 195.0})
        cache.set("MSFT", {"price": 420.0})

        cached, missing = cache.get_many(["AAPL", "MSFT", "NVDA"])
        assert "AAPL" in cached
        assert "MSFT" in cached
        assert missing == ["NVDA"]

    def test_get_many_expired_goes_to_missing(self):
        """Expired entries in get_many are treated as missing."""
        cache = YFQuoteCache(ttl_seconds=1)
        cache.set("AAPL", {"price": 195.0})
        # Expire it
        with cache._lock:
            val, _ = cache._cache["AAPL"]
            cache._cache["AAPL"] = (val, time.time() - 10)

        cached, missing = cache.get_many(["AAPL"])
        assert cached == {}
        assert missing == ["AAPL"]

    def test_set_many(self):
        """set_many writes multiple entries."""
        cache = YFQuoteCache(ttl_seconds=60)
        cache.set_many({
            "AAPL": {"price": 195.0},
            "MSFT": {"price": 420.0},
            "NVDA": {"price": 875.0},
        })
        assert cache.get("AAPL")["price"] == 195.0
        assert cache.get("MSFT")["price"] == 420.0
        assert cache.get("NVDA")["price"] == 875.0

    def test_clear(self):
        """clear removes all entries."""
        cache = YFQuoteCache(ttl_seconds=60)
        cache.set("AAPL", {"price": 195.0})
        cache.set("MSFT", {"price": 420.0})
        cache.clear()
        assert cache.get("AAPL") is None
        assert cache.get("MSFT") is None

    def test_stats(self):
        """stats returns correct counts."""
        cache = YFQuoteCache(ttl_seconds=60)
        cache.set("AAPL", {"price": 195.0})
        cache.set("MSFT", {"price": 420.0})
        # Expire one entry
        with cache._lock:
            val, _ = cache._cache["AAPL"]
            cache._cache["AAPL"] = (val, time.time() - 120)

        stats = cache.stats()
        assert stats["total_entries"] == 2
        assert stats["valid_entries"] == 1
        assert stats["expired_entries"] == 1
        assert stats["ttl_seconds"] == 60


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
