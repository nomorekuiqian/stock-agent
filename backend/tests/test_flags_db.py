"""Unit tests for the admin write paths in app.features.flags.db."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.flags import db as flags_db


@pytest.fixture(autouse=True)
def _unmock_flags_db_writes():
    """Restore the real ``upsert_assignment`` / ``delete_assignment`` for tests
    in this module.

    The global ``mock_db_writes`` autouse fixture in ``conftest.py`` patches
    these symbols with AsyncMock stubs so production DB writes can't leak from
    arbitrary tests. The tests in this file exercise the real helper bodies
    against a mocked ``get_insforge_service`` upstream. We re-execute the
    module source to capture the real function objects, then rebind them
    onto the cached module so they share its namespace (and therefore see
    the ``get_insforge_service`` patches the tests apply).
    """
    import importlib
    import types

    spec = importlib.util.find_spec("app.features.flags.db")
    source = spec.loader.get_source(spec.name)
    code = compile(source, spec.origin, "exec")

    patched_upsert = flags_db.upsert_assignment
    patched_delete = flags_db.delete_assignment
    patched_list_all = flags_db.list_all_assignments

    # Execute the module source inside a throwaway namespace, then rebind the
    # resulting function objects so their ``__globals__`` IS the cached
    # ``flags_db`` module's namespace.
    tmp_ns: dict = {"__name__": spec.name, "__file__": spec.origin}
    exec(code, tmp_ns)

    def _rebind(fn):
        return types.FunctionType(
            fn.__code__,
            flags_db.__dict__,
            fn.__name__,
            fn.__defaults__,
            fn.__closure__,
        )

    flags_db.upsert_assignment = _rebind(tmp_ns["upsert_assignment"])
    flags_db.delete_assignment = _rebind(tmp_ns["delete_assignment"])
    flags_db.list_all_assignments = _rebind(tmp_ns["list_all_assignments"])
    try:
        yield
    finally:
        flags_db.upsert_assignment = patched_upsert
        flags_db.delete_assignment = patched_delete
        flags_db.list_all_assignments = patched_list_all


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
