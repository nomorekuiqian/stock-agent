"""Unit tests for GET /api/payment/me/entitlements endpoint."""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient


class TestMeEntitlements:
    """Test the /api/payment/me/entitlements endpoint."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app
        from app.core.deps import verify_user_token
        self.app = app
        self.client = TestClient(app)
        yield
        app.dependency_overrides.clear()

    def _override_auth(self, user_id: str):
        from app.core.deps import verify_user_token
        self.app.dependency_overrides[verify_user_token] = lambda: user_id

    # ------------------------------------------------------------------
    # 1. Returns entitlements for authenticated user
    # ------------------------------------------------------------------

    @patch(
        "app.features.payment.router.get_subscription",
        new_callable=AsyncMock,
    )
    @patch(
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_returns_entitlements_for_user(self, mock_get_ents, mock_get_sub):
        """Authenticated user gets their sorted entitlements list."""
        self._override_auth("user-ent-001")
        mock_get_ents.return_value = {
            "morning_report_email",
            "weekly_report_email",
            "personal_digest_email",
        }
        mock_get_sub.return_value = {"plan": "max", "status": "active"}

        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 200
        body = resp.json()
        assert body["entitlements"] == [
            "morning_report_email",
            "personal_digest_email",
            "weekly_report_email",
        ]
        # User has a subscription record -> not trial-eligible
        assert body["trial_eligible"] is False

    # ------------------------------------------------------------------
    # 2. Fresh param invalidates cache
    # ------------------------------------------------------------------

    @patch(
        "app.features.payment.router.get_subscription",
        new_callable=AsyncMock,
    )
    @patch(
        "app.features.payment.router.sync_subscription_from_stripe",
        new_callable=AsyncMock,
    )
    @patch("app.features.payment.router.invalidate_subscription_cache")
    @patch(
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_fresh_invalidates_cache(
        self,
        mock_get_ents,
        mock_invalidate,
        mock_sync_subscription,
        mock_get_sub,
    ):
        """?fresh=true should invalidate cache and sync Stripe before fetching."""
        self._override_auth("user-ent-002")
        mock_get_ents.return_value = {"today_website"}
        mock_get_sub.return_value = {"plan": "pro", "status": "active"}

        resp = self.client.get("/api/payment/me/entitlements?fresh=true")

        assert resp.status_code == 200
        mock_invalidate.assert_called_once_with("user-ent-002")
        mock_sync_subscription.assert_awaited_once_with(
            "user-ent-002",
            source="me-entitlements.fresh",
        )

    # ------------------------------------------------------------------
    # 3. Empty entitlements for free user
    # ------------------------------------------------------------------

    @patch(
        "app.features.payment.router.get_subscription",
        new_callable=AsyncMock,
    )
    @patch(
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_empty_entitlements_for_free_user(self, mock_get_ents, mock_get_sub):
        """Free user with no subscription record gets empty entitlements + trial_eligible=true."""
        self._override_auth("user-free-003")
        mock_get_ents.return_value = set()
        mock_get_sub.return_value = None

        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 200
        assert resp.json() == {"entitlements": [], "trial_eligible": True}

    # ------------------------------------------------------------------
    # 4. Unauthenticated request returns 401
    # ------------------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """No auth token -> 401. Do NOT override dependency."""
        # No dependency override, so the real verify_user_token runs
        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 401


class TestSubscriptionStatus:
    """Test the /api/payment/subscription-status endpoint."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app
        self.app = app
        self.client = TestClient(app)
        yield
        app.dependency_overrides.clear()

    def _override_auth(self, user_id: str):
        from app.core.deps import verify_user_token
        self.app.dependency_overrides[verify_user_token] = lambda: user_id

    @patch(
        "app.features.payment.router.get_subscription",
        new_callable=AsyncMock,
    )
    @patch("app.features.payment.router.invalidate_subscription_cache")
    def test_fresh_invalidates_cache(self, mock_invalidate, mock_get_sub):
        """?fresh=true should bypass the 5-minute subscription cache."""
        self._override_auth("user-sub-001")
        mock_get_sub.return_value = {
            "plan": "max",
            "status": "active",
            "current_period_end": None,
            "access_expires_at": None,
            "stripe_price_id": "price_early_bird",
            "billing_amount_cents": 1000,
            "billing_currency": "usd",
            "billing_interval": "month",
            "billing_interval_count": 1,
        }

        resp = self.client.get("/api/payment/subscription-status?fresh=true")

        assert resp.status_code == 200
        assert resp.json()["plan"] == "max"
        assert resp.json()["stripe_price_id"] == "price_early_bird"
        assert resp.json()["billing_amount_cents"] == 1000
        assert resp.json()["billing_currency"] == "usd"
        assert resp.json()["billing_interval"] == "month"
        mock_invalidate.assert_called_once_with("user-sub-001")
