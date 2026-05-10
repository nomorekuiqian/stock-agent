"""
Unit tests for app.shared.profile_cache.

Tests:
- summarize_for_prompt: shape and field selection
- _is_db_fresh: TTL boundary
- get_profile_cached: memory hit, DB hit, FMP fallback paths
- get_profiles_cached: batch with mixed success / failure / empty

No network, no real DB. All external calls mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_profile_cache_unit.py -v
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

import pytest

from app.shared import profile_cache
from app.shared.profile_cache import (
    _is_db_fresh,
    get_profile_cached,
    get_profiles_cached,
    summarize_for_prompt,
)


@pytest.fixture(autouse=True)
def _clear_memory_cache():
    """Each test starts with an empty in-process memory cache."""
    profile_cache._memory_cache.clear()
    yield
    profile_cache._memory_cache.clear()


# ---------------------------------------------------------------------------
# summarize_for_prompt
# ---------------------------------------------------------------------------


class TestSummarizeForPrompt:
    def test_empty_input_returns_empty(self):
        assert summarize_for_prompt({}) == {}
        assert summarize_for_prompt(None) == {}

    def test_full_profile_extracted(self):
        result = summarize_for_prompt({
            "company_name": "Everpure, Inc.",
            "company_name_zh": "永储",
            "classification": {"sector": "Technology", "industry": "Data Storage"},
            "description": {"en": "Data infrastructure company.", "zh": "数据基础设施公司。"},
            "company_details": {"ceo": "Charles Giancarlo"},  # ignored
        })
        assert result == {
            "company_name": "Everpure, Inc.",
            "company_name_zh": "永储",
            "sector": "Technology",
            "industry": "Data Storage",
            "description": "数据基础设施公司。",
        }

    def test_falls_back_to_english_description_when_zh_missing(self):
        result = summarize_for_prompt({
            "company_name": "Acme",
            "classification": {"sector": "Tech", "industry": "Software"},
            "description": {"en": "Acme makes things.", "zh": None},
        })
        assert result["description"] == "Acme makes things."

    def test_description_truncated_at_150(self):
        long_zh = "测" * 500
        result = summarize_for_prompt({
            "company_name": "X",
            "classification": {},
            "description": {"zh": long_zh, "en": ""},
        })
        assert len(result["description"]) == 150

    def test_missing_classification_returns_none_fields(self):
        result = summarize_for_prompt({
            "company_name": "X",
            "description": {"en": "y"},
        })
        assert result["sector"] is None
        assert result["industry"] is None


# ---------------------------------------------------------------------------
# _is_db_fresh
# ---------------------------------------------------------------------------


class TestIsDbFresh:
    def test_recent_updated_at_is_fresh(self):
        recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        assert _is_db_fresh({"updated_at": recent}) is True

    def test_old_updated_at_is_stale(self):
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        assert _is_db_fresh({"updated_at": old}) is False

    def test_missing_updated_at_is_stale(self):
        assert _is_db_fresh({}) is False

    def test_non_string_updated_at_is_stale(self):
        assert _is_db_fresh({"updated_at": 12345}) is False

    def test_z_suffix_iso_string_parsed(self):
        recent = "2099-01-01T00:00:00Z"
        assert _is_db_fresh({"updated_at": recent}) is True

    def test_malformed_updated_at_is_stale(self):
        assert _is_db_fresh({"updated_at": "not-a-date"}) is False


# ---------------------------------------------------------------------------
# get_profile_cached: tier interactions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetProfileCached:
    async def test_empty_symbol_returns_empty(self):
        assert await get_profile_cached("") == {}

    async def test_memory_hit_skips_db_and_api(self):
        profile_cache._memory_set("PSTG", {"company_name": "Everpure, Inc."})
        with patch.object(profile_cache, "_db_get", new=AsyncMock()) as db_mock, \
             patch.object(profile_cache, "get_company_profile") as fmp_mock:
            result = await get_profile_cached("pstg")
        assert result["company_name"] == "Everpure, Inc."
        db_mock.assert_not_awaited()
        fmp_mock.assert_not_called()

    async def test_db_fresh_hit_caches_and_skips_api(self):
        recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        db_payload = {"company_name": "Everpure, Inc.", "updated_at": recent}
        with patch.object(profile_cache, "_db_get", new=AsyncMock(return_value=db_payload)), \
             patch.object(profile_cache, "get_company_profile") as fmp_mock:
            result = await get_profile_cached("PSTG")
        assert result["company_name"] == "Everpure, Inc."
        fmp_mock.assert_not_called()
        # Subsequent call hits memory now
        with patch.object(profile_cache, "_db_get", new=AsyncMock()) as db_mock2, \
             patch.object(profile_cache, "get_company_profile") as fmp_mock2:
            await get_profile_cached("PSTG")
        db_mock2.assert_not_awaited()
        fmp_mock2.assert_not_called()

    async def test_db_stale_falls_through_to_fmp(self):
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        stale = {"company_name": "Old Name", "updated_at": old}
        fresh = {
            "company_name": "Everpure, Inc.",
            "classification": {"sector": "Tech", "industry": "Storage"},
            "description": {"en": "infra", "zh": None},
        }
        with patch.object(profile_cache, "_db_get", new=AsyncMock(return_value=stale)), \
             patch.object(profile_cache, "get_company_profile", return_value=fresh), \
             patch.object(profile_cache, "_db_upsert", new=AsyncMock()):
            result = await get_profile_cached("PSTG")
        assert result["company_name"] == "Everpure, Inc."

    async def test_fmp_returns_empty_returns_empty_dict(self):
        with patch.object(profile_cache, "_db_get", new=AsyncMock(return_value=None)), \
             patch.object(profile_cache, "get_company_profile", return_value=None):
            result = await get_profile_cached("UNKNOWN")
        assert result == {}


# ---------------------------------------------------------------------------
# get_profiles_cached: batch behavior
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetProfilesCached:
    async def test_empty_list_returns_empty(self):
        assert await get_profiles_cached([]) == {}

    async def test_batch_dedupes_and_uppercases(self):
        calls: list[str] = []

        async def fake_one(symbol: str):
            calls.append(symbol)
            return {"company_name": f"{symbol} Co"}

        with patch.object(profile_cache, "get_profile_cached", side_effect=fake_one):
            result = await get_profiles_cached(["aapl", "AAPL", "msft"])
        assert set(result.keys()) == {"AAPL", "MSFT"}
        assert sorted(calls) == ["AAPL", "MSFT"]

    async def test_batch_skips_failures_and_empty(self):
        async def fake_one(symbol: str):
            if symbol == "BAD":
                raise RuntimeError("boom")
            if symbol == "EMPTY":
                return {}
            return {"company_name": f"{symbol} Co"}

        with patch.object(profile_cache, "get_profile_cached", side_effect=fake_one):
            result = await get_profiles_cached(["GOOD", "BAD", "EMPTY"])
        assert "GOOD" in result
        assert "BAD" not in result
        assert "EMPTY" not in result
