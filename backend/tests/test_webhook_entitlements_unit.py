"""Unit tests for the entitlements webhook handler in the Stripe webhook endpoint."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


class TestEntitlementsWebhook:
    """Test entitlements.active_entitlement_summary.updated webhook handler."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app
        self.app = app
        self.client = TestClient(app)
        yield
        app.dependency_overrides.clear()

    def _build_event(self, customer=None):
        """Build a fake Stripe entitlements webhook event."""
        obj = {}
        if customer is not None:
            obj["customer"] = customer
        return {
            "type": "entitlements.active_entitlement_summary.updated",
            "data": {"object": obj},
        }

    def _make_entitlement(self, lookup_key):
        """Build a fake Stripe ActiveEntitlement object."""
        return {"feature": {"lookup_key": lookup_key}, "lookup_key": lookup_key}

    # ------------------------------------------------------------------
    # 1. Happy path: Max features
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.stripe")
    @patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription_by_customer", new_callable=AsyncMock)
    def test_max_features_webhook(
        self, mock_get_sub, mock_get_sub_full, mock_upsert, mock_stripe,
    ):
        """10 Max features -> plan=max, entitlements synced, resend called."""
        customer_id = "cus_max_123"
        user_id = "user-max-001"

        # get_subscription_by_customer returns a sub record
        mock_get_sub.return_value = {
            "user_id": user_id,
            "status": "active",
        }

        # Build 10 features: 7 Pro + 3 Max-only
        from app.features.payment.entitlements import PRO_FEATURES, MAX_ONLY_FEATURES
        all_features = sorted(PRO_FEATURES | MAX_ONLY_FEATURES)
        ent_list = [self._make_entitlement(k) for k in all_features]

        # get_subscription (post-upsert read) returns the freshly written sub
        # so sync_resend_segments receives the full record (not None).
        mock_get_sub_full.return_value = {
            "user_id": user_id,
            "status": "active",
            "plan": "max",
            "entitlements": all_features,
        }

        # stripe.entitlements.ActiveEntitlement.list
        mock_ent_response = MagicMock()
        mock_ent_response.to_dict.return_value = {"data": ent_list}
        mock_stripe.entitlements.ActiveEntitlement.list.return_value = mock_ent_response

        # stripe.Customer.retrieve (for Resend sync)
        mock_customer = MagicMock()
        mock_customer.to_dict.return_value = {"email": "max@test.com"}
        mock_stripe.Customer.retrieve.return_value = mock_customer

        # stripe.Webhook.construct_event returns our fake event
        event = self._build_event(customer=customer_id)
        mock_stripe.Webhook.construct_event.return_value = event
        mock_stripe.SignatureVerificationError = Exception

        # Mock SubscriptionService.sync_resend_segments
        with patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ) as mock_sync:
            resp = self.client.post(
                "/api/payment/webhook",
                content=b"raw-payload",
                headers={"stripe-signature": "sig_test"},
            )

        assert resp.status_code == 200
        assert resp.json() == {"received": True}

        # Verify upsert was called with max plan and all features
        mock_upsert.assert_awaited_once()
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["plan"] == "max"
        assert call_kwargs["status"] == "active"
        assert call_kwargs["entitlements"] == all_features

        # Verify sync_resend_segments received correct email and the full sub
        # record (the new signature is (email, sub) instead of (email, entitlements_set);
        # the method extracts entitlements from the sub internally).
        mock_sync.assert_called_once()
        sync_args = mock_sync.call_args
        assert sync_args[0][0] == "max@test.com"
        sub_arg = sync_args[0][1]
        assert isinstance(sub_arg, dict)
        assert set(sub_arg.get("entitlements", [])) == set(all_features)

    # ------------------------------------------------------------------
    # 2. Pro features only
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.stripe")
    @patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription_by_customer", new_callable=AsyncMock)
    def test_pro_features_only(
        self, mock_get_sub, mock_upsert, mock_stripe,
    ):
        """7 Pro features (no Max-only) -> plan=pro."""
        customer_id = "cus_pro_456"
        user_id = "user-pro-002"

        mock_get_sub.return_value = {
            "user_id": user_id,
            "status": "active",
        }

        from app.features.payment.entitlements import PRO_FEATURES
        pro_features = sorted(PRO_FEATURES)
        ent_list = [self._make_entitlement(k) for k in pro_features]

        mock_ent_response = MagicMock()
        mock_ent_response.to_dict.return_value = {"data": ent_list}
        mock_stripe.entitlements.ActiveEntitlement.list.return_value = mock_ent_response

        mock_customer = MagicMock()
        mock_customer.to_dict.return_value = {"email": "pro@test.com"}
        mock_stripe.Customer.retrieve.return_value = mock_customer

        event = self._build_event(customer=customer_id)
        mock_stripe.Webhook.construct_event.return_value = event
        mock_stripe.SignatureVerificationError = Exception

        with patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments"
        ):
            resp = self.client.post(
                "/api/payment/webhook",
                content=b"raw-payload",
                headers={"stripe-signature": "sig_test"},
            )

        assert resp.status_code == 200
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "pro"
        assert call_kwargs["entitlements"] == pro_features

    # ------------------------------------------------------------------
    # 3. Empty entitlements (canceled)
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.stripe")
    @patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription_by_customer", new_callable=AsyncMock)
    def test_empty_entitlements_canceled(
        self, mock_get_sub, mock_upsert, mock_stripe,
    ):
        """0 features -> plan=free, status=canceled."""
        customer_id = "cus_cancel_789"
        user_id = "user-cancel-003"

        mock_get_sub.return_value = {
            "user_id": user_id,
            "status": "active",
        }

        # Empty entitlements list
        mock_ent_response = MagicMock()
        mock_ent_response.to_dict.return_value = {"data": []}
        mock_stripe.entitlements.ActiveEntitlement.list.return_value = mock_ent_response

        event = self._build_event(customer=customer_id)
        mock_stripe.Webhook.construct_event.return_value = event
        mock_stripe.SignatureVerificationError = Exception

        resp = self.client.post(
            "/api/payment/webhook",
            content=b"raw-payload",
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "free"
        assert call_kwargs["status"] == "canceled"
        assert call_kwargs["entitlements"] == []

    # ------------------------------------------------------------------
    # 4. Unknown customer
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.stripe")
    @patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription_by_customer", new_callable=AsyncMock)
    def test_unknown_customer(
        self, mock_get_sub, mock_upsert, mock_stripe,
    ):
        """Customer not found in DB -> log warning, return received True, no upsert."""
        customer_id = "cus_unknown_000"

        mock_get_sub.return_value = None  # not found

        event = self._build_event(customer=customer_id)
        mock_stripe.Webhook.construct_event.return_value = event
        mock_stripe.SignatureVerificationError = Exception

        resp = self.client.post(
            "/api/payment/webhook",
            content=b"raw-payload",
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200
        assert resp.json() == {"received": True}
        mock_upsert.assert_not_awaited()

    # ------------------------------------------------------------------
    # 5. Missing customer field
    # ------------------------------------------------------------------

    @patch("app.features.payment.router.stripe")
    @patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.payment.router.get_subscription_by_customer", new_callable=AsyncMock)
    def test_missing_customer_field(
        self, mock_get_sub, mock_upsert, mock_stripe,
    ):
        """No customer in event object -> log warning, return received True."""
        event = self._build_event(customer=None)  # no customer key
        mock_stripe.Webhook.construct_event.return_value = event
        mock_stripe.SignatureVerificationError = Exception

        resp = self.client.post(
            "/api/payment/webhook",
            content=b"raw-payload",
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200
        assert resp.json() == {"received": True}
        mock_get_sub.assert_not_awaited()
        mock_upsert.assert_not_awaited()
