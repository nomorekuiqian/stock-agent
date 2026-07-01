"""Unit tests for onboarding state endpoints.

Covers GET /api/user/onboarding-status and POST /api/user/onboarding/complete.
Database operations are mocked; no real Insforge calls.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.deps import verify_user_token
from app.features.payment.db import SubscriptionLookupError


TEST_USER_ID = "user-onboarding-test"


@pytest.fixture
def client():
    async def mock_user():
        return TEST_USER_ID

    app.dependency_overrides[verify_user_token] = mock_user
    c = TestClient(app)
    yield c
    app.dependency_overrides.pop(verify_user_token, None)


# ---------------------------------------------------------------------------
# GET /api/user/onboarding-status
# ---------------------------------------------------------------------------


def test_status_returns_false_when_no_subscription(client: TestClient):
    """New user (no subscription row) -> not completed."""
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resp = client.get(
            "/api/user/onboarding-status",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"completed": False}


def test_status_returns_false_when_completed_at_missing(client: TestClient):
    """Subscription row exists but no onboarding_completed_at -> not completed."""
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value={"user_id": TEST_USER_ID, "onboarding_completed_at": None},
    ):
        resp = client.get(
            "/api/user/onboarding-status",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"completed": False}


def test_status_returns_true_when_timestamp_set(client: TestClient):
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value={
            "user_id": TEST_USER_ID,
            "onboarding_completed_at": "2026-05-31T12:00:00Z",
        },
    ):
        resp = client.get(
            "/api/user/onboarding-status",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"completed": True}


def test_status_returns_503_when_subscription_lookup_fails(client: TestClient):
    """Lookup failure is not the same as incomplete onboarding."""
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        side_effect=SubscriptionLookupError("timeout"),
    ):
        resp = client.get(
            "/api/user/onboarding-status",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "subscription_lookup_failed"


# ---------------------------------------------------------------------------
# POST /api/user/onboarding/complete
# ---------------------------------------------------------------------------


def test_complete_writes_timestamp_when_missing(client: TestClient):
    """First completion -> upsert is called and response carries timestamp."""
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "app.features.onboarding.router.upsert_subscription",
        new_callable=AsyncMock,
        return_value=True,
    ) as upsert_mock:
        resp = client.post(
            "/api/user/onboarding/complete",
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["completed"] is True
    assert body["completed_at"]  # non-empty ISO timestamp

    upsert_mock.assert_awaited_once()
    kwargs = upsert_mock.await_args.kwargs
    assert kwargs["user_id"] == TEST_USER_ID
    assert "onboarding_completed_at" in kwargs
    assert kwargs["onboarding_completed_at"]


def test_complete_is_idempotent_when_already_completed(client: TestClient):
    """If timestamp already set, return it without calling upsert again."""
    existing = "2026-04-01T00:00:00+00:00"
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value={
            "user_id": TEST_USER_ID,
            "onboarding_completed_at": existing,
        },
    ), patch(
        "app.features.onboarding.router.upsert_subscription",
        new_callable=AsyncMock,
        return_value=True,
    ) as upsert_mock:
        resp = client.post(
            "/api/user/onboarding/complete",
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"completed": True, "completed_at": existing}
    upsert_mock.assert_not_called()


def test_complete_500s_when_upsert_fails(client: TestClient):
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "app.features.onboarding.router.upsert_subscription",
        new_callable=AsyncMock,
        return_value=False,
    ):
        resp = client.post(
            "/api/user/onboarding/complete",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 500
    assert resp.json()["detail"] == "failed_to_mark_complete"


def test_complete_returns_503_when_subscription_lookup_fails(client: TestClient):
    """Do not create/update onboarding state when the read path is unavailable."""
    with patch(
        "app.features.onboarding.router.get_subscription",
        new_callable=AsyncMock,
        side_effect=SubscriptionLookupError("timeout"),
    ), patch(
        "app.features.onboarding.router.upsert_subscription",
        new_callable=AsyncMock,
    ) as upsert_mock:
        resp = client.post(
            "/api/user/onboarding/complete",
            headers={"Authorization": "Bearer test-token"},
        )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "subscription_lookup_failed"
    upsert_mock.assert_not_called()
