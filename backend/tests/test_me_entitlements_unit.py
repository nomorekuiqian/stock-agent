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
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_returns_entitlements_for_user(self, mock_get_ents):
        """Authenticated user gets their sorted entitlements list."""
        self._override_auth("user-ent-001")
        mock_get_ents.return_value = {
            "morning_report_email",
            "weekly_report_email",
            "personal_digest_email",
        }

        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 200
        body = resp.json()
        assert body["entitlements"] == [
            "morning_report_email",
            "personal_digest_email",
            "weekly_report_email",
        ]

    # ------------------------------------------------------------------
    # 2. Fresh param invalidates cache
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.invalidate_subscription_cache")
    @patch(
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_fresh_invalidates_cache(self, mock_get_ents, mock_invalidate):
        """?fresh=true should call invalidate_subscription_cache before fetching."""
        self._override_auth("user-ent-002")
        mock_get_ents.return_value = {"today_website"}

        resp = self.client.get("/api/payment/me/entitlements?fresh=true")

        assert resp.status_code == 200
        mock_invalidate.assert_called_once_with("user-ent-002")

    # ------------------------------------------------------------------
    # 3. Empty entitlements for free user
    # ------------------------------------------------------------------

    @patch(
        "app.features.payment.entitlements.get_user_entitlements",
        new_callable=AsyncMock,
    )
    def test_empty_entitlements_for_free_user(self, mock_get_ents):
        """Free user with no entitlements gets empty list."""
        self._override_auth("user-free-003")
        mock_get_ents.return_value = set()

        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 200
        assert resp.json() == {"entitlements": []}

    # ------------------------------------------------------------------
    # 4. Unauthenticated request returns 401
    # ------------------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """No auth token -> 401. Do NOT override dependency."""
        # No dependency override, so the real verify_user_token runs
        resp = self.client.get("/api/payment/me/entitlements")

        assert resp.status_code == 401
