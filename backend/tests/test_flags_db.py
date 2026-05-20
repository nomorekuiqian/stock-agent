"""Unit tests for the admin write paths in app.features.flags.db."""

import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.flags import db as flags_db


@pytest.fixture(autouse=True)
def _unmock_flags_db_writes():
    """Restore the real ``upsert_assignment`` / ``delete_assignment`` for tests
    in this module. Conftest's autouse ``mock_db_writes`` fixture patches these
    symbols with AsyncMock stubs; we reload the module to recover the real
    functions, then reload again on teardown so other tests still see the mock.
    """
    importlib.reload(flags_db)
    try:
        yield
    finally:
        importlib.reload(flags_db)


@pytest.mark.asyncio
async def test_list_all_assignments_no_filter():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={
        "data": {"success": True, "data": [
            {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
        ]},
    })
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.list_all_assignments()
    assert result == [
        {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
    ]
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="GET",
        params={"action": "list_all"},
    )


@pytest.mark.asyncio
async def test_list_all_assignments_with_flag_filter():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": []}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        await flags_db.list_all_assignments(flag="for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="GET",
        params={"action": "list_all", "flag": "for_you_v2"},
    )


@pytest.mark.asyncio
async def test_upsert_assignment():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": {"user_id": "u1", "flag": "for_you_v2", "enabled": True}}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.upsert_assignment("u1", "for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="POST",
        params={"action": "upsert"},
        json_body={"user_id": "u1", "flag": "for_you_v2", "enabled": True},
    )
    assert result["flag"] == "for_you_v2"


@pytest.mark.asyncio
async def test_delete_assignment():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": {"deleted": {"user_id": "u1", "flag": "for_you_v2"}}}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.delete_assignment("u1", "for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="DELETE",
        params={"action": "delete", "user_id": "u1", "flag": "for_you_v2"},
    )
    assert result is True


@pytest.mark.asyncio
async def test_list_all_returns_empty_on_ef_failure():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": False, "error": "boom"}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.list_all_assignments()
    assert result == []
