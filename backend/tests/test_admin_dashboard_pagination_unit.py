"""Unit tests for admin dashboard pagination/filter fallback logic.

No network or database access. The SQL RPC is the production path; these tests
lock the Python fallback semantics used when the edge/RPC deployment is behind.
"""

from app.features.admin.router import _page_legacy_dashboard


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
