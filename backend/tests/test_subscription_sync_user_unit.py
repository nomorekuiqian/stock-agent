"""Unit tests for authenticated Resend user sync endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.deps import verify_user_token_with_email
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_auth_override():
    app.dependency_overrides.pop(verify_user_token_with_email, None)
    yield
    app.dependency_overrides.pop(verify_user_token_with_email, None)


def test_sync_user_rejects_anonymous_request():
    resp = client.post(
        "/api/subscriptions/sync-user",
        json={"user_id": "u-1", "email": "user@example.com"},
    )
    assert resp.status_code == 401


def test_sync_user_rejects_identity_mismatch():
    app.dependency_overrides[verify_user_token_with_email] = lambda: {
        "user_id": "u-token",
        "email": "token@example.com",
    }

    resp = client.post(
        "/api/subscriptions/sync-user",
        json={"user_id": "u-body", "email": "body@example.com"},
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 403


def test_sync_user_uses_token_identity():
    app.dependency_overrides[verify_user_token_with_email] = lambda: {
        "user_id": "u-token",
        "email": "token@example.com",
    }
    service = MagicMock()
    service.sync_user.return_value = {
        "success": True,
        "email": "token@example.com",
        "user_id": "u-token",
        "synced_channels": [],
        "errors": [],
    }

    with patch(
        "app.features.subscription.router.get_subscription_service",
        return_value=service,
    ), patch(
        "app.features.subscription.router.record_user_acquisition",
        new=AsyncMock(return_value=False),
    ):
        resp = client.post(
            "/api/subscriptions/sync-user",
            json={"user_id": "u-token", "email": "token@example.com", "first_name": "Token"},
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    assert resp.json()["success"] is True
    service.sync_user.assert_called_once_with(
        user_id="u-token",
        email="token@example.com",
        first_name="Token",
    )


def test_sync_user_forwards_acquisition_with_token_identity():
    app.dependency_overrides[verify_user_token_with_email] = lambda: {
        "user_id": "u-token",
        "email": "token@example.com",
    }
    service = MagicMock()
    service.sync_user.return_value = {"success": True, "synced_channels": [], "errors": []}
    record = AsyncMock(return_value=True)

    with patch(
        "app.features.subscription.router.get_subscription_service",
        return_value=service,
    ), patch("app.features.subscription.router.record_user_acquisition", new=record):
        resp = client.post(
            "/api/subscriptions/sync-user",
            json={
                "user_id": "u-token",
                "email": "token@example.com",
                "acquisition": {
                    "first_touch": {"utm_source": "x", "landing_path": "/", "bogus": "dropped"},
                    "last_touch": {"ref": "frank"},
                },
            },
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    user_id, payload = record.await_args.args
    assert user_id == "u-token"
    assert payload.first_touch.utm_source == "x"
    assert not hasattr(payload.first_touch, "bogus")
    assert payload.last_touch.ref == "frank"


def test_sync_user_still_succeeds_without_acquisition():
    app.dependency_overrides[verify_user_token_with_email] = lambda: {
        "user_id": "u-token",
        "email": "token@example.com",
    }
    service = MagicMock()
    service.sync_user.return_value = {"success": True, "synced_channels": [], "errors": []}
    record = AsyncMock(return_value=False)

    with patch(
        "app.features.subscription.router.get_subscription_service",
        return_value=service,
    ), patch("app.features.subscription.router.record_user_acquisition", new=record):
        resp = client.post(
            "/api/subscriptions/sync-user",
            json={"user_id": "u-token", "email": "token@example.com"},
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    assert record.await_args.args == ("u-token", None)
