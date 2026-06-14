"""Unit tests for admin dashboard pagination/filter fallback logic.

No network or database access. The SQL RPC is the production path; these tests
lock the Python fallback semantics used when the edge/RPC deployment is behind.
"""

import pytest

from app.features.admin import router as admin_router
from app.features.admin.router import _categorize_users, _page_legacy_dashboard


def _user(
    user_id: str,
    *,
    email: str,
    category: str = "never_trialed",
    entitlements: list[str] | None = None,
    conversations: int = 0,
    feedback_count: int = 0,
    api_calls: int = 0,
    messages: int = 0,
    ops_status: str | None = None,
) -> dict:
    return {
        "user_id": user_id,
        "email": email,
        "name": None,
        "category": category,
        "invite_code": None,
        "entitlements": entitlements or [],
        "personal_digest_subscribed": "personal_digest_email" in (entitlements or []),
        "conversations": conversations,
        "messages": messages,
        "feedback_count": feedback_count,
        "api_calls": api_calls,
        "contact_feedback_count": 0,
        "has_questionnaire": False,
        "ops_status": ops_status,
        "created_at": "2026-01-01T00:00:00Z",
        "last_active_at": None,
    }


def test_dashboard_tags_or_within_group_and_across_groups():
    dashboard = {
        "summary": {},
        "users": [
            _user("u1", email="a@example.com", entitlements=["morning_report_email"], conversations=1),
            _user("u2", email="b@example.com", entitlements=["weekly_report_email"], conversations=2),
            _user("u3", email="c@example.com", entitlements=["morning_report_email"], conversations=0),
            _user("u4", email="d@example.com", entitlements=[], conversations=3),
        ],
    }

    result = _page_legacy_dashboard(
        dashboard,
        page=1,
        page_size=50,
        category="all",
        tags=["m:morning", "m:weekly", "e:conv"],
        search="",
        sort_key="email",
        sort_dir="asc",
    )

    assert [user["user_id"] for user in result["users"]] == ["u1", "u2"]
    assert result["pagination"] == {
        "page": 1,
        "page_size": 50,
        "total": 2,
        "total_pages": 1,
    }


def test_dashboard_category_paid_requires_lifetime_or_stripe_paid():
    result = _categorize_users([
        {
            "user_id": "paid",
            "plan": "ultra",
            "status": "active",
            "stripe_subscription_id": "sub_paid",
            "access_expires_at": None,
            "is_lifetime": False,
        },
        {
            "user_id": "lifetime",
            "plan": "ultra",
            "status": "active",
            "stripe_subscription_id": None,
            "access_expires_at": None,
            "is_lifetime": True,
        },
        {
            "user_id": "grant",
            "plan": "ultra",
            "status": "active",
            "stripe_subscription_id": None,
            "access_expires_at": "2099-01-01T00:00:00+00:00",
            "is_lifetime": False,
        },
        {
            "user_id": "manual",
            "plan": "ultra",
            "status": "active",
            "stripe_subscription_id": None,
            "access_expires_at": None,
            "is_lifetime": False,
        },
    ])

    categories = {user["user_id"]: user["category"] for user in result["users"]}
    assert categories == {
        "paid": "paid",
        "lifetime": "paid",
        "grant": "active_trial",
        "manual": "never_trialed",
    }
    assert result["summary"]["paid"] == 2
    assert result["summary"]["active_trial"] == 1
    assert result["summary"]["never_trialed"] == 1


def test_dashboard_pagination_slices_after_sort_and_filter():
    dashboard = {
        "summary": {},
        "users": [
            _user("u3", email="c@example.com", category="paid", messages=3),
            _user("u1", email="a@example.com", category="paid", messages=1),
            _user("u4", email="d@example.com", category="paid", messages=4),
            _user("u2", email="b@example.com", category="paid", messages=2),
            _user("u5", email="e@example.com", category="active_trial", messages=5),
        ],
    }

    result = _page_legacy_dashboard(
        dashboard,
        page=2,
        page_size=2,
        category="paid",
        tags=[],
        search="example",
        sort_key="email",
        sort_dir="asc",
    )

    assert [user["user_id"] for user in result["users"]] == ["u3", "u4"]
    assert result["pagination"] == {
        "page": 2,
        "page_size": 2,
        "total": 4,
        "total_pages": 2,
    }


@pytest.mark.asyncio
async def test_dashboard_client_refresh_can_skip_activity(monkeypatch):
    calls: list[tuple[str, dict]] = []

    class FakeService:
        async def call_function(self, function_name: str, **kwargs):
            calls.append((function_name, kwargs))
            return {
                "status_code": 200,
                "data": {
                    "success": True,
                    "data": {
                        "summary": {},
                        "engagement": {},
                        "chip_counts": {},
                        "pagination": {
                            "page": 1,
                            "page_size": 50,
                            "total": 0,
                            "total_pages": 1,
                        },
                        "users": [],
                    },
                },
            }

    monkeypatch.setattr(admin_router, "get_insforge_service", lambda: FakeService())

    result = await admin_router.get_dashboard(
        page=1,
        page_size=50,
        category="all",
        tag=None,
        search="",
        sort_key="last_active_at",
        sort_dir="desc",
        include_activity=False,
        _admin={"email": "admin@example.com"},
    )

    assert "activity" not in result
    assert [name for name, _ in calls] == ["subscriptions"]


@pytest.mark.asyncio
async def test_dashboard_activity_uses_lightweight_growth_mode(monkeypatch):
    calls: list[tuple[str, dict]] = []

    class FakeService:
        async def call_function(self, function_name: str, **kwargs):
            calls.append((function_name, kwargs))
            if function_name == "admin-activity":
                return {
                    "status_code": 200,
                    "data": {"success": True, "days": 30, "data": []},
                }
            return {
                "status_code": 200,
                "data": {
                    "success": True,
                    "data": {
                        "summary": {},
                        "engagement": {},
                        "chip_counts": {},
                        "pagination": {
                            "page": 1,
                            "page_size": 50,
                            "total": 0,
                            "total_pages": 1,
                        },
                        "users": [],
                    },
                },
            }

    monkeypatch.setattr(admin_router, "get_insforge_service", lambda: FakeService())

    result = await admin_router.get_dashboard(
        page=1,
        page_size=50,
        category="all",
        tag=None,
        search="",
        sort_key="last_active_at",
        sort_dir="desc",
        include_activity=True,
        _admin={"email": "admin@example.com"},
    )

    activity_call = next(kwargs for name, kwargs in calls if name == "admin-activity")
    assert activity_call["params"]["include_growth"] == "false"
    assert result["activity"]["days"] == 30
