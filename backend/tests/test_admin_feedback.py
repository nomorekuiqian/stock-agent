"""Tests for the /api/admin/feedback dashboard endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client_with_admin():
    from app.core import deps

    async def _admin():
        return {"user_id": "admin-1", "email": "admin@example.com"}

    app.dependency_overrides[deps.verify_admin_user] = _admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_admin_feedback_requires_admin():
    with TestClient(app) as client:
        response = client.get("/api/admin/feedback")
    assert response.status_code in (401, 403)


def test_admin_feedback_returns_dashboard_payload(client_with_admin):
    stats = {
        "success": True,
        "total": 2,
        "breakdown": {"satisfied": 1, "neutral": 0, "dissatisfied": 1},
        "satisfaction_rate": 0.5,
        "daily": [{"date": "2026-06-01", "satisfied": 1, "dissatisfied": 1}],
    }
    user_feedback = {
        "success": True,
        "data": [{"rating": "helpful", "email": "user@example.com", "message": "Good", "created_at": "2026-06-01T12:00:00Z"}],
        "total": 1,
        "page": 1,
        "page_size": 20,
        "total_pages": 1,
    }
    email_list = {
        "success": True,
        "data": [{"email": "user@example.com", "rating": "satisfied", "report_date": "2026-06-01"}],
        "total_records": 1,
    }

    with (
        patch("app.features.admin.router.get_feedback_stats", AsyncMock(return_value=stats)) as get_stats,
        patch("app.features.admin.router.get_user_feedback_list", AsyncMock(return_value=user_feedback)) as get_user,
        patch("app.features.admin.router.get_email_feedback_list", AsyncMock(return_value=email_list)) as get_email,
    ):
        response = client_with_admin.get(
            "/api/admin/feedback?start_date=2026-06-01&end_date=2026-06-10&page=1&page_size=20"
        )

    assert response.status_code == 200
    body = response.json()
    assert body["date_range"] == {"start_date": "2026-06-01", "end_date": "2026-06-10"}
    assert body["stats"]["total"] == 2
    assert body["userFeedback"]["total"] == 1
    assert body["emailList"]["total_records"] == 1
    assert body["emailList"]["_error"] is None
    get_stats.assert_awaited_once_with(start_date="2026-06-01", end_date="2026-06-10")
    get_user.assert_awaited_once_with(page=1, page_size=20)
    get_email.assert_awaited_once_with(start_date="2026-06-01", end_date="2026-06-10")


def test_admin_feedback_degrades_when_email_list_fails(client_with_admin):
    stats = {
        "success": True,
        "total": 1,
        "breakdown": {"satisfied": 1},
        "satisfaction_rate": 1,
        "daily": [{"date": "2026-06-01", "satisfied": 1}],
    }
    user_feedback = {
        "success": True,
        "data": [],
        "total": 0,
        "page": 1,
        "page_size": 20,
        "total_pages": 0,
    }

    with (
        patch("app.features.admin.router.get_feedback_stats", AsyncMock(return_value=stats)),
        patch("app.features.admin.router.get_user_feedback_list", AsyncMock(return_value=user_feedback)),
        patch(
            "app.features.admin.router.get_email_feedback_list",
            AsyncMock(return_value={"success": False, "error": "edge down"}),
        ),
    ):
        response = client_with_admin.get("/api/admin/feedback")

    assert response.status_code == 200
    body = response.json()
    assert body["stats"]["total"] == 1
    assert body["emailList"]["data"] == []
    assert body["emailList"]["_error"] == "edge down"
