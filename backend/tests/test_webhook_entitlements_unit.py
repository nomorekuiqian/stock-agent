"""Unit tests for Stripe entitlement reconciliation through the webhook endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


class TestEntitlementsWebhook:
    """Test entitlements.active_entitlement_summary.updated webhook handling."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app

        self.app = app
        self.client = TestClient(app)
        yield
        app.dependency_overrides.clear()

    def _build_event(self, customer=None):
        obj = {}
        if customer is not None:
            obj["customer"] = customer
        return {
            "type": "entitlements.active_entitlement_summary.updated",
            "data": {"object": obj},
        }

    def _make_entitlement(self, lookup_key):
        return {"feature": {"lookup_key": lookup_key}, "lookup_key": lookup_key}

    def _post_event(self, event):
        with patch(
            "app.features.payment.router.stripe.Webhook.construct_event",
            return_value=event,
        ):
            return self.client.post(
                "/api/payment/webhook",
                content=b"raw-payload",
                headers={"stripe-signature": "sig_test"},
            )

    def _mock_stripe_entitlements(self, entitlements, email="user@test.com"):
        mock_ent_response = MagicMock()
        mock_ent_response.to_dict.return_value = {"data": entitlements}

        mock_customer = MagicMock()
        mock_customer.to_dict.return_value = {"email": email}

        return (
            patch(
                "app.features.payment.service.stripe.entitlements.ActiveEntitlement.list",
                return_value=mock_ent_response,
            ),
            patch(
                "app.features.payment.service.stripe.Customer.retrieve",
                return_value=mock_customer,
            ),
        )

    def test_max_features_webhook(self):
        """Max features -> plan=max, full Max entitlements, Resend sync."""
        customer_id = "cus_max_123"
        user_id = "user-max-001"

        from app.features.payment.entitlements import MAX_FEATURES

        all_features = sorted(MAX_FEATURES)
        ent_list = [self._make_entitlement(k) for k in all_features]
        list_patch, customer_patch = self._mock_stripe_entitlements(ent_list, "max@test.com")

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "status": "active"},
        ), patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={
                "user_id": user_id,
                "status": "active",
                "plan": "max",
                "entitlements": all_features,
            },
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ) as mock_sync, list_patch, customer_patch:
            resp = self._post_event(self._build_event(customer=customer_id))

        assert resp.status_code == 200
        assert resp.json() == {"received": True}

        mock_upsert.assert_awaited_once()
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["plan"] == "max"
        assert call_kwargs["status"] == "active"
        assert call_kwargs["entitlements"] == all_features
        assert call_kwargs["clear_access_expires_at"] is True

        mock_sync.assert_called_once()
        sync_args = mock_sync.call_args
        assert sync_args[0][0] == "max@test.com"
        assert set(sync_args[0][1].get("entitlements", [])) == set(all_features)

    def test_pro_features_only(self):
        """Pro-only features -> plan=pro."""
        customer_id = "cus_pro_456"
        user_id = "user-pro-002"

        from app.features.payment.entitlements import PRO_FEATURES

        pro_features = sorted(PRO_FEATURES)
        ent_list = [self._make_entitlement(k) for k in pro_features]
        list_patch, customer_patch = self._mock_stripe_entitlements(ent_list, "pro@test.com")

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "status": "active"},
        ), patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "plan": "pro", "entitlements": pro_features},
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ), list_patch, customer_patch:
            resp = self._post_event(self._build_event(customer=customer_id))

        assert resp.status_code == 200
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "pro"
        assert call_kwargs["entitlements"] == pro_features
        assert call_kwargs["clear_access_expires_at"] is True

    def test_empty_entitlements_canceled(self):
        """Empty entitlements -> plan=free, status=canceled."""
        customer_id = "cus_cancel_789"
        user_id = "user-cancel-003"
        list_patch, customer_patch = self._mock_stripe_entitlements([], "cancel@test.com")

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "status": "active"},
        ), patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "plan": "free", "entitlements": []},
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ), list_patch, customer_patch:
            resp = self._post_event(self._build_event(customer=customer_id))

        assert resp.status_code == 200
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "free"
        assert call_kwargs["status"] == "canceled"
        assert call_kwargs["entitlements"] == []
        assert call_kwargs["clear_access_expires_at"] is True

    def test_unknown_customer(self):
        """Unknown customer is acknowledged without writing local state."""
        customer_id = "cus_unknown_000"

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value=None,
        ) as mock_get_sub, patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert:
            resp = self._post_event(self._build_event(customer=customer_id))

        assert resp.status_code == 200
        assert resp.json() == {"received": True}
        mock_get_sub.assert_awaited_once()
        mock_upsert.assert_not_awaited()

    def test_missing_customer_field(self):
        """Missing customer in event is acknowledged without DB lookup."""
        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
        ) as mock_get_sub, patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert:
            resp = self._post_event(self._build_event(customer=None))

        assert resp.status_code == 200
        assert resp.json() == {"received": True}
        mock_get_sub.assert_not_awaited()
        mock_upsert.assert_not_awaited()

    def test_placeholder_status_not_clobbered(self):
        """Regression: placeholder status must not be copied back."""
        customer_id = "cus_race_555"
        user_id = "user-race-006"

        from app.features.payment.entitlements import MAX_FEATURES

        all_features = sorted(MAX_FEATURES)
        ent_list = [self._make_entitlement(k) for k in all_features]
        list_patch, customer_patch = self._mock_stripe_entitlements(ent_list, "race@test.com")

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value={"user_id": user_id, "status": "none"},
        ), patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={
                "user_id": user_id,
                "status": "active",
                "plan": "max",
                "entitlements": all_features,
            },
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ), list_patch, customer_patch:
            resp = self._post_event(self._build_event(customer=customer_id))

        assert resp.status_code == 200
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "max"
        assert call_kwargs["entitlements"] == all_features
        assert call_kwargs["status"] == "active"
