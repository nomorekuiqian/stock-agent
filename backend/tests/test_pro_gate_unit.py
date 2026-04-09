"""Unit tests for Pro-gating on email preferences and segments."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# 1. SubscriptionService segment logic
# ---------------------------------------------------------------------------

class TestSegmentMethods:
    """Test add_to_default_segments / add_pro_segments / remove_pro_segments."""

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

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_add_pro_segments(self, mock_wait, mock_resend):
        """Pro upgrade should add morning + weekly segments."""
        svc = self._make_service()
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning",
            "daily_report": "seg-evening",
            "weekly_report": "seg-weekly",
        }

        svc.add_pro_segments("pro@test.com")

        calls = mock_resend.ContactSegments.add.call_args_list
        added_segments = {c[0][0]["segment_id"] for c in calls}
        assert added_segments == {"seg-morning", "seg-weekly"}

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_remove_pro_segments(self, mock_wait, mock_resend):
        """Pro downgrade should remove morning + weekly segments."""
        svc = self._make_service()
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning",
            "daily_report": "seg-evening",
            "weekly_report": "seg-weekly",
        }

        svc.remove_pro_segments("ex-pro@test.com")

        calls = mock_resend.ContactSegments.remove.call_args_list
        removed_segments = {c[0][0]["segment_id"] for c in calls}
        assert removed_segments == {"seg-morning", "seg-weekly"}


# ---------------------------------------------------------------------------
# 2. Preferences endpoint Pro-gating
# ---------------------------------------------------------------------------

class TestPreferencesProGate:
    """Test that free users can't enable morning_report / weekly_report."""

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

    @patch("app.features.subscription.router.get_payment_subscription", new_callable=AsyncMock)
    def test_free_user_blocked_morning(self, mock_get_sub):
        """Free user enabling morning_report should get 403."""
        self._override_auth("free-123", "free@test.com")
        mock_get_sub.return_value = None  # No subscription = free

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"morning_report": True},
        )
        assert resp.status_code == 403
        assert "Pro" in resp.json()["detail"]

    @patch("app.features.subscription.router.get_payment_subscription", new_callable=AsyncMock)
    def test_free_user_blocked_weekly(self, mock_get_sub):
        """Free user enabling weekly_report should get 403."""
        self._override_auth("free-123", "free@test.com")
        mock_get_sub.return_value = None

        resp = self.client.post(
            "/api/subscriptions/preferences",
            json={"weekly_report": True},
        )
        assert resp.status_code == 403

    @patch("app.features.subscription.router.get_subscription_service")
    @patch("app.features.subscription.router.get_payment_subscription", new_callable=AsyncMock)
    def test_free_user_can_toggle_daily(self, mock_get_sub, mock_svc):
        """Free user should be able to toggle daily_report (free feature)."""
        self._override_auth("free-123", "free@test.com")
        mock_get_sub.return_value = None

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
    @patch("app.features.subscription.router.get_payment_subscription", new_callable=AsyncMock)
    def test_pro_user_can_enable_morning(self, mock_get_sub, mock_svc):
        """Pro user should be able to enable morning_report."""
        self._override_auth("pro-123", "pro@test.com")
        mock_get_sub.return_value = {"plan": "pro", "status": "active"}

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

    @patch("app.features.subscription.router.get_subscription_service")
    @patch("app.features.subscription.router.get_payment_subscription", new_callable=AsyncMock)
    def test_free_user_can_disable_morning(self, mock_get_sub, mock_svc):
        """Free user should be able to DISABLE morning_report (turning off is allowed)."""
        self._override_auth("free-123", "free@test.com")
        mock_get_sub.return_value = None

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
