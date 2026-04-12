"""Unit tests for entitlement-gating on email preferences and segments."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# 1. SubscriptionService segment logic
# ---------------------------------------------------------------------------

class TestSegmentMethods:
    """Test add_to_default_segments (free-tier signup)."""

    def _make_service(self):
        with patch("app.features.subscription.service.RESEND_API_KEY", "test-key"):
            from app.features.subscription.service import SubscriptionService
            svc = SubscriptionService()
            svc.api_key = "test-key"
            return svc

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_default_segments_only_daily(self, mock_wait, mock_resend):
        """Free-tier default should only add daily_report segment."""
        svc = self._make_service()
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning",
            "daily_report": "seg-evening",
            "weekly_report": "seg-weekly",
        }

        svc.add_to_default_segments("user@test.com")

        # Should only add to evening segment
        mock_resend.ContactSegments.add.assert_called_once_with({
            "email": "user@test.com",
            "segment_id": "seg-evening",
        })


# ---------------------------------------------------------------------------
# 2. Preferences endpoint Pro-gating
# ---------------------------------------------------------------------------

class TestPreferencesEntitlementGate:
    """Test that users need the right email entitlements to enable paid toggles."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app
        from app.core.deps import verify_user_token_with_email
        self.app = app
        self.client = TestClient(app)
        yield
        # Clean up overrides
        app.dependency_overrides.clear()

    def _override_auth(self, user_id: str, email: str):
        from app.core.deps import verify_user_token_with_email
        self.app.dependency_overrides[verify_user_token_with_email] = lambda: {
            "user_id": user_id,
            "email": email,
        }

    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_free_user_blocked_morning(self, mock_has_entitlement):
        """User without morning entitlement should get 403.
        Verifies router passes the correct feature name to has_entitlement."""
        self._override_auth("free-123", "free@test.com")
        mock_has_entitlement.return_value = False

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"morning_report": True},
        )
        assert resp.status_code == 403
        assert "entitlement" in resp.json()["detail"]
        # Verify router maps morning_report -> morning_report_email
        mock_has_entitlement.assert_awaited_once_with("free-123", "morning_report_email")

    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_free_user_blocked_weekly(self, mock_has_entitlement):
        """User without weekly entitlement should get 403.
        Verifies router passes the correct feature name."""
        self._override_auth("free-123", "free@test.com")
        mock_has_entitlement.return_value = False

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"weekly_report": True},
        )
        assert resp.status_code == 403
        # Verify router maps weekly_report -> weekly_report_email
        mock_has_entitlement.assert_awaited_once_with("free-123", "weekly_report_email")

    @patch("app.features.subscription.router.get_subscription_service")
    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_free_user_can_toggle_daily(self, mock_has_entitlement, mock_svc):
        """Free user should be able to toggle daily_report (free feature)."""
        self._override_auth("free-123", "free@test.com")

        mock_service = MagicMock()
        mock_service.update_email_preferences.return_value = None
        mock_service.get_email_preferences.return_value = {
            "morning_report": False,
            "daily_report": False,
            "weekly_report": False,
        }
        mock_service.get_status.return_value = {"subscribed": False}
        mock_svc.return_value = mock_service

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"daily_report": False},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @patch("app.features.subscription.router.get_subscription_service")
    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_entitled_user_can_enable_morning(self, mock_has_entitlement, mock_svc):
        """User with morning_report_email entitlement can enable morning_report.
        Verifies the router checks the correct feature name and allows the action."""
        self._override_auth("pro-123", "pro@test.com")
        mock_has_entitlement.return_value = True

        mock_service = MagicMock()
        mock_service.update_email_preferences.return_value = None
        mock_service.get_email_preferences.return_value = {
            "morning_report": True,
            "daily_report": True,
            "weekly_report": True,
        }
        mock_service.get_status.return_value = {"subscribed": False}
        mock_svc.return_value = mock_service

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"morning_report": True},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        # has_entitlement is called twice: once for morning_report gate, once for personal_digest in response
        calls = mock_has_entitlement.await_args_list
        assert any(c.args == ("pro-123", "morning_report_email") for c in calls)

    @patch("app.features.subscription.router.get_subscription_service")
    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_free_user_can_disable_morning(self, mock_has_entitlement, mock_svc):
        """Free user should be able to DISABLE morning_report (turning off is allowed)."""
        self._override_auth("free-123", "free@test.com")

        mock_service = MagicMock()
        mock_service.update_email_preferences.return_value = None
        mock_service.get_email_preferences.return_value = {
            "morning_report": False,
            "daily_report": True,
            "weekly_report": False,
        }
        mock_service.get_status.return_value = {"subscribed": False}
        mock_svc.return_value = mock_service

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"morning_report": False},
        )
        # Disabling is not Pro-gated
        assert resp.status_code == 200

    @patch("app.features.subscription.router.has_entitlement", new_callable=AsyncMock)
    def test_personal_digest_requires_specific_entitlement(self, mock_has_entitlement):
        """personal_digest enable checks its own entitlement, not generic paid status."""
        self._override_auth("free-123", "free@test.com")
        mock_has_entitlement.return_value = False

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"personal_digest": True},
        )

        assert resp.status_code == 403
        mock_has_entitlement.assert_awaited_once_with("free-123", "personal_digest_email")
