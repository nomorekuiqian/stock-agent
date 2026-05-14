"""Tests for the /api/admin/flags router."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.features.flags.admin_router import router as _flags_admin_router

# Ensure the router under test is registered for the duration of this test module.
# Task 5 will register it in app/main.py; this guard makes the tests pass either way
# without duplicating routes.
if not any(getattr(r, "path", "").startswith("/api/admin/flags") for r in app.routes):
    app.include_router(_flags_admin_router)


@pytest.fixture
def admin_user():
    return {"user_id": "admin-1", "email": "xuxueyang1994@outlook.com"}


@pytest.fixture
def fake_subscriptions():
    """Mock `subscriptions list_all` -> 3 users."""
    return [
        {"user_id": "u1", "email": "alpha@voya.tech", "name": "Alpha", "plan": "pro"},
        {"user_id": "u2", "email": "beta@example.com", "name": "Beta", "plan": "max"},
        {"user_id": "u3", "email": "voyageur@example.com", "name": "Charlie", "plan": "free"},
    ]


@pytest.fixture
def fake_assignments():
    """Mock `list_all_assignments` -> u1 has for_you_v2, u3 has for_you_v2."""
    return [
        {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
        {"user_id": "u3", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-02"},
    ]


@pytest.fixture
def client_with_admin(admin_user, fake_subscriptions):
    """TestClient with admin auth bypass + subscriptions.list_all mock."""
    from app.core import deps

    async def _admin():
        return admin_user

    app.dependency_overrides[deps.verify_admin_user] = _admin

    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={
        "data": {"success": True, "data": fake_subscriptions}
    })
    with patch("app.features.flags.admin_router.get_insforge_service", return_value=fake_service):
        yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_requires_admin():
    # Without override, hitting the endpoint with no auth header → 401
    with TestClient(app) as c:
        r = c.get("/api/admin/flags")
        assert r.status_code in (401, 403)


def test_get_returns_known_flags_and_assignments(client_with_admin, fake_assignments):
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags")
    assert r.status_code == 200
    body = r.json()
    assert body["known_flags"][0]["key"] == "for_you_v2"
    rows = {row["user_id"]: row for row in body["assignments"]}
    assert rows["u1"]["flags"][0]["flag"] == "for_you_v2"
    assert rows["u2"]["flags"] == []
    assert rows["u3"]["flags"][0]["flag"] == "for_you_v2"


def test_get_email_filter(client_with_admin, fake_assignments):
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags?email=voya")
    assert r.status_code == 200
    emails = sorted(row["email"] for row in r.json()["assignments"])
    # "voya" substring matches alpha@voya.tech and voyageur@example.com
    assert emails == ["alpha@voya.tech", "voyageur@example.com"]


def test_get_flag_filter_keeps_full_flags_per_user(client_with_admin, fake_assignments):
    # Even when filtering by flag, the returned users still carry their full flag list.
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags?flag=for_you_v2")
    assert r.status_code == 200
    user_ids = sorted(row["user_id"] for row in r.json()["assignments"])
    assert user_ids == ["u1", "u3"]


def test_post_requires_known_flag(client_with_admin):
    with patch(
        "app.features.flags.admin_router.upsert_assignment",
        AsyncMock(return_value={"user_id": "u1", "flag": "for_you_v2"}),
    ) as up:
        bad = client_with_admin.post("/api/admin/flags", json={"user_id": "u1", "flag": "bogus"})
        assert bad.status_code == 422
        up.assert_not_awaited()

        good = client_with_admin.post("/api/admin/flags", json={"user_id": "u1", "flag": "for_you_v2"})
        assert good.status_code == 200
        up.assert_awaited_once_with("u1", "for_you_v2", True)


def test_delete_is_idempotent(client_with_admin):
    with patch(
        "app.features.flags.admin_router.delete_assignment",
        AsyncMock(return_value=True),
    ) as dl:
        r = client_with_admin.delete("/api/admin/flags?user_id=u1&flag=for_you_v2")
        assert r.status_code == 200
        dl.assert_awaited_once_with("u1", "for_you_v2")


def test_get_filters_disabled_rows(client_with_admin):
    """A row with enabled=False must not appear in any user's flags list."""
    assignments = [
        {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
        {"user_id": "u2", "flag": "for_you_v2", "enabled": False, "created_at": "2026-01-02"},
    ]
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=assignments),
    ):
        r = client_with_admin.get("/api/admin/flags")
    assert r.status_code == 200
    rows = {row["user_id"]: row for row in r.json()["assignments"]}
    assert rows["u1"]["flags"][0]["flag"] == "for_you_v2"
    assert rows["u2"]["flags"] == [], "enabled=False row leaked into response"


def test_post_returns_502_when_ef_fails(client_with_admin):
    """upsert_assignment raising RuntimeError must surface as 502 (not 500)."""
    with patch(
        "app.features.flags.admin_router.upsert_assignment",
        AsyncMock(side_effect=RuntimeError("ef down")),
    ):
        r = client_with_admin.post(
            "/api/admin/flags",
            json={"user_id": "u1", "flag": "for_you_v2"},
        )
    assert r.status_code == 502


def test_delete_returns_502_when_ef_fails(client_with_admin):
    """delete_assignment raising RuntimeError must surface as 502 (not 500)."""
    with patch(
        "app.features.flags.admin_router.delete_assignment",
        AsyncMock(side_effect=RuntimeError("ef down")),
    ):
        r = client_with_admin.delete("/api/admin/flags?user_id=u1&flag=for_you_v2")
    assert r.status_code == 502
