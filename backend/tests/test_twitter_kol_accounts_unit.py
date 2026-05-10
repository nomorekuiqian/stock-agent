"""
Unit tests for kol_accounts catalog (V4 dual-source ingest).

Covers:
- db.list_kol_accounts / upsert_kol_accounts / update_kol_account /
  disable_kol_accounts_missing_from — happy + failure paths against the
  edge function client (mocked).
- service.get_enabled_kols — DB-first with hardcoded fallback + 5-min cache
- service.sync_kol_list — orchestrates fetch_list_members + upsert + disable

No network, no real DB. All edge function calls mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_twitter_kol_accounts_unit.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.twitter import db as twitter_db
from app.features.twitter import service as twitter_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_call_function(*, status_code: int = 200, payload: dict | None = None):
    """Build a mocked result matching `get_insforge_service().call_function()`."""
    return {
        "status_code": status_code,
        "data": payload or {"success": True, "data": []},
        "text": "",
    }


# ---------------------------------------------------------------------------
# db.list_kol_accounts
# ---------------------------------------------------------------------------


class TestListKolAccounts:
    @pytest.mark.asyncio
    async def test_returns_rows_on_success(self):
        rows = [
            {"username": "alice", "display_name": "Alice", "source": "manual"},
            {"username": "bob", "display_name": "Bob", "source": "list:1234"},
        ]
        fake = AsyncMock(return_value=_mock_call_function(
            payload={"success": True, "data": rows}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            result = await twitter_db.list_kol_accounts()
        assert result == rows

    @pytest.mark.asyncio
    async def test_returns_empty_on_http_error(self):
        fake = AsyncMock(return_value=_mock_call_function(
            status_code=500, payload={"success": False}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            result = await twitter_db.list_kol_accounts()
        assert result == []

    @pytest.mark.asyncio
    async def test_passes_enabled_only_param(self):
        captured = {}

        async def grab(*args, **kwargs):
            captured["params"] = kwargs.get("params")
            return _mock_call_function(payload={"success": True, "data": []})

        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = grab
            await twitter_db.list_kol_accounts(enabled_only=False)
        assert captured["params"]["enabled_only"] == "false"


# ---------------------------------------------------------------------------
# db.upsert_kol_accounts
# ---------------------------------------------------------------------------


class TestUpsertKolAccounts:
    @pytest.mark.asyncio
    async def test_empty_input_short_circuits(self):
        # No edge function call expected
        with patch.object(twitter_db, "get_insforge_service") as svc:
            n = await twitter_db.upsert_kol_accounts([])
        assert n == 0
        svc.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_upserted_count(self):
        fake = AsyncMock(return_value=_mock_call_function(
            payload={"success": True, "upserted": 3}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            n = await twitter_db.upsert_kol_accounts([
                {"username": "a", "display_name": "A", "source": "manual"},
                {"username": "b", "display_name": "B", "source": "manual"},
                {"username": "c", "display_name": "C", "source": "manual"},
            ])
        assert n == 3

    @pytest.mark.asyncio
    async def test_returns_zero_on_http_error(self):
        fake = AsyncMock(return_value=_mock_call_function(
            status_code=500, payload={"success": False}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            n = await twitter_db.upsert_kol_accounts(
                [{"username": "a", "display_name": "A", "source": "manual"}]
            )
        assert n == 0


# ---------------------------------------------------------------------------
# db.update_kol_account
# ---------------------------------------------------------------------------


class TestUpdateKolAccount:
    @pytest.mark.asyncio
    async def test_returns_false_on_empty_username(self):
        result = await twitter_db.update_kol_account("", enabled=False)
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_patch(self):
        result = await twitter_db.update_kol_account("alice")
        assert result is False

    @pytest.mark.asyncio
    async def test_success(self):
        fake = AsyncMock(return_value=_mock_call_function(
            payload={"success": True}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            ok = await twitter_db.update_kol_account("alice", enabled=False)
        assert ok is True


# ---------------------------------------------------------------------------
# db.disable_kol_accounts_missing_from
# ---------------------------------------------------------------------------


class TestDisableKolAccountsMissingFrom:
    @pytest.mark.asyncio
    async def test_returns_disabled_count(self):
        fake = AsyncMock(return_value=_mock_call_function(
            payload={"success": True, "disabled": 5}
        ))
        with patch.object(twitter_db, "get_insforge_service") as svc:
            svc.return_value.call_function = fake
            n = await twitter_db.disable_kol_accounts_missing_from(
                source="list:123", current_usernames=["a", "b"],
            )
        assert n == 5


# ---------------------------------------------------------------------------
# service.get_enabled_kols + cache
# ---------------------------------------------------------------------------


class TestGetEnabledKols:
    @pytest.mark.asyncio
    async def test_returns_db_rows_when_present(self):
        twitter_service.invalidate_catalog_cache()
        with patch.object(twitter_db, "list_kol_accounts", AsyncMock(return_value=[
            {"username": "alice", "display_name": "Alice",
             "source": "list:123", "enabled": True},
        ])):
            catalog = await twitter_service.get_enabled_kols()
        assert len(catalog) == 1
        assert catalog[0]["username"] == "alice"
        assert catalog[0]["source"] == "list:123"  # type: ignore[typeddict-item]

    @pytest.mark.asyncio
    async def test_falls_back_to_hardcoded_when_db_empty(self):
        twitter_service.invalidate_catalog_cache()
        with patch.object(twitter_db, "list_kol_accounts", AsyncMock(return_value=[])):
            catalog = await twitter_service.get_enabled_kols()
        # Hardcoded list is non-empty
        assert len(catalog) > 0
        assert all(k.get("source") == "manual" for k in catalog)  # type: ignore[typeddict-item]

    @pytest.mark.asyncio
    async def test_caches_result(self):
        """Second call within TTL doesn't hit DB again."""
        twitter_service.invalidate_catalog_cache()
        mock = AsyncMock(return_value=[
            {"username": "alice", "display_name": "Alice",
             "source": "manual", "enabled": True},
        ])
        with patch.object(twitter_db, "list_kol_accounts", mock):
            await twitter_service.get_enabled_kols()
            await twitter_service.get_enabled_kols()
        assert mock.call_count == 1


# ---------------------------------------------------------------------------
# service.sync_kol_list
# ---------------------------------------------------------------------------


class TestSyncKolList:
    @pytest.mark.asyncio
    async def test_empty_members_returns_failure(self):
        with patch.object(twitter_service, "fetch_list_members",
                          AsyncMock(return_value=[])):
            result = await twitter_service.sync_kol_list("12345")
        assert result["success"] is False
        assert "0 members" in result["error"]

    @pytest.mark.asyncio
    async def test_success_path_orchestrates_correctly(self):
        members = [
            {"userName": "alice", "name": "Alice", "followers": 1000,
             "description": "desc"},
            {"userName": "bob", "name": "Bob", "followers": 2000,
             "description": ""},
        ]
        upsert_calls: list = []
        disable_calls: list = []

        async def fake_upsert(accounts):
            upsert_calls.append(accounts)
            return len(accounts)

        async def fake_disable(*, source, current_usernames):
            disable_calls.append((source, current_usernames))
            return 0

        with patch.object(twitter_service, "fetch_list_members",
                          AsyncMock(return_value=members)):
            with patch.object(twitter_db, "upsert_kol_accounts", fake_upsert):
                with patch.object(twitter_db, "disable_kol_accounts_missing_from",
                                  fake_disable):
                    result = await twitter_service.sync_kol_list("12345")

        assert result["success"] is True
        assert result["upserted"] == 2
        assert result["members_fetched"] == 2

        # Verify upsert payload shape
        assert len(upsert_calls) == 1
        accounts = upsert_calls[0]
        assert accounts[0]["username"] == "alice"
        assert accounts[0]["source"] == "list:12345"
        assert accounts[0]["enabled"] is True

        # Verify disable_missing called with correct source + usernames
        assert len(disable_calls) == 1
        source, names = disable_calls[0]
        assert source == "list:12345"
        assert set(names) == {"alice", "bob"}

    @pytest.mark.asyncio
    async def test_skips_members_without_username(self):
        members = [
            {"userName": "alice", "name": "Alice"},
            {"userName": "", "name": "Empty"},  # invalid
            {"name": "NoUsername"},  # no userName key
        ]
        upsert_payload: list = []

        async def fake_upsert(accounts):
            upsert_payload.extend(accounts)
            return len(accounts)

        with patch.object(twitter_service, "fetch_list_members",
                          AsyncMock(return_value=members)):
            with patch.object(twitter_db, "upsert_kol_accounts", fake_upsert):
                with patch.object(twitter_db, "disable_kol_accounts_missing_from",
                                  AsyncMock(return_value=0)):
                    await twitter_service.sync_kol_list("12345")

        assert len(upsert_payload) == 1
        assert upsert_payload[0]["username"] == "alice"

    @pytest.mark.asyncio
    async def test_invalidates_catalog_cache(self):
        """sync_kol_list should bust the in-memory catalog cache so subsequent
        get_enabled_kols re-reads DB."""
        # Prime the cache
        twitter_service.invalidate_catalog_cache()
        with patch.object(twitter_db, "list_kol_accounts",
                          AsyncMock(return_value=[
                              {"username": "old", "display_name": "Old",
                               "source": "manual", "enabled": True},
                          ])):
            await twitter_service.get_enabled_kols()

        # Run sync
        with patch.object(twitter_service, "fetch_list_members",
                          AsyncMock(return_value=[
                              {"userName": "alice", "name": "Alice"},
                          ])):
            with patch.object(twitter_db, "upsert_kol_accounts",
                              AsyncMock(return_value=1)):
                with patch.object(twitter_db, "disable_kol_accounts_missing_from",
                                  AsyncMock(return_value=0)):
                    await twitter_service.sync_kol_list("12345")

        # Now cache should be invalidated — next get_enabled_kols hits DB anew
        new_mock = AsyncMock(return_value=[
            {"username": "alice", "display_name": "Alice",
             "source": "list:12345", "enabled": True},
        ])
        with patch.object(twitter_db, "list_kol_accounts", new_mock):
            catalog = await twitter_service.get_enabled_kols()
        assert new_mock.call_count == 1
        assert catalog[0]["username"] == "alice"
