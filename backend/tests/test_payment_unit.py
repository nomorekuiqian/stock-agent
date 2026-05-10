"""
Unit tests for payment router helpers and webhook handling.

Tests the Stripe SDK v15 compatibility layer (_to_dict, _get_period)
and webhook event processing with mocked Stripe objects.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# get_user_email_by_id
# ---------------------------------------------------------------------------


class TestGetUserEmailById:
    """Reverse-lookup of email from a user_id via Insforge list_user_profiles.

    Used by set_lifetime to push Resend segment changes when a lifetime
    grant happens — that flow has no other path to the email.
    """

    @pytest.mark.asyncio
    async def test_returns_email_when_user_found(self):
        from app.features.payment.db import get_user_email_by_id

        mock_service = MagicMock()
        mock_service.call_function = AsyncMock(
            return_value={
                "data": {
                    "success": True,
                    "data": [
                        {"user_id": "u-1", "email": "alice@example.com"},
                        {"user_id": "u-2", "email": "bob@example.com"},
                    ],
                }
            }
        )
        with patch(
            "app.features.payment.db.get_insforge_service",
            return_value=mock_service,
        ):
            email = await get_user_email_by_id("u-2")

        assert email == "bob@example.com"

    @pytest.mark.asyncio
    async def test_returns_none_when_user_not_found(self):
        from app.features.payment.db import get_user_email_by_id

        mock_service = MagicMock()
        mock_service.call_function = AsyncMock(
            return_value={
                "data": {
                    "success": True,
                    "data": [{"user_id": "u-1", "email": "alice@example.com"}],
                }
            }
        )
        with patch(
            "app.features.payment.db.get_insforge_service",
            return_value=mock_service,
        ):
            email = await get_user_email_by_id("u-missing")

        assert email is None

    @pytest.mark.asyncio
    async def test_returns_none_when_insforge_call_fails(self):
        """Edge function unavailable / success=False — return None gracefully."""
        from app.features.payment.db import get_user_email_by_id

        mock_service = MagicMock()
        mock_service.call_function = AsyncMock(
            return_value={"data": {"success": False, "error": "boom"}}
        )
        with patch(
            "app.features.payment.db.get_insforge_service",
            return_value=mock_service,
        ):
            email = await get_user_email_by_id("u-1")

        assert email is None

    @pytest.mark.asyncio
    async def test_empty_user_id_returns_none_without_query(self):
        """Cheap guard: empty/None user_id short-circuits before the API call."""
        from app.features.payment.db import get_user_email_by_id

        mock_service = MagicMock()
        mock_service.call_function = AsyncMock()
        with patch(
            "app.features.payment.db.get_insforge_service",
            return_value=mock_service,
        ):
            assert await get_user_email_by_id("") is None
            assert await get_user_email_by_id(None) is None

        mock_service.call_function.assert_not_called()


# ---------------------------------------------------------------------------
# _to_dict helper
# ---------------------------------------------------------------------------

class TestToDict:
    """Tests for _to_dict() — Stripe SDK v15 compat helper."""

    def test_converts_stripe_object_to_dict(self):
        from app.features.payment.router import _to_dict

        mock_obj = MagicMock()
        mock_obj.to_dict.return_value = {"id": "sub_123", "status": "active"}

        result = _to_dict(mock_obj)
        assert result == {"id": "sub_123", "status": "active"}
        mock_obj.to_dict.assert_called_once()

    def test_returns_plain_dict_unchanged(self):
        from app.features.payment.router import _to_dict

        d = {"id": "sub_123", "status": "active"}
        result = _to_dict(d)
        assert result is d  # same object, not copied

    def test_returns_none_as_is(self):
        from app.features.payment.router import _to_dict

        result = _to_dict(None)
        assert result is None


# ---------------------------------------------------------------------------
# _get_period helper
# ---------------------------------------------------------------------------

class TestGetPeriod:
    """Tests for _get_period() — extracts billing period from Stripe subscription."""

    def test_top_level_timestamps(self):
        """Old API: current_period_start/end at top level."""
        from app.features.payment.router import _get_period

        ts_start = 1700000000  # 2023-11-14
        ts_end = 1702592000    # 2023-12-14
        sub = {"current_period_start": ts_start, "current_period_end": ts_end}

        start, end = _get_period(sub)
        assert start is not None
        assert end is not None
        assert "2023-11" in start
        assert "2023-12" in end

    def test_items_level_timestamps(self):
        """2026+ API: period fields moved to items.data[*]."""
        from app.features.payment.router import _get_period

        ts_start = 1700000000
        ts_end = 1702592000
        sub = {
            "current_period_start": None,
            "current_period_end": None,
            "items": {
                "data": [
                    {"current_period_start": ts_start, "current_period_end": ts_end}
                ]
            },
        }

        start, end = _get_period(sub)
        assert start is not None
        assert end is not None

    def test_missing_both_levels(self):
        """No period data at either level returns (None, None)."""
        from app.features.payment.router import _get_period

        sub = {}
        start, end = _get_period(sub)
        assert start is None
        assert end is None

    def test_empty_items_data(self):
        from app.features.payment.router import _get_period

        sub = {"items": {"data": []}}
        start, end = _get_period(sub)
        assert start is None
        assert end is None

    def test_stripe_object_input(self):
        """Accepts a Stripe object (has .to_dict()) not just a plain dict."""
        from app.features.payment.router import _get_period

        mock_sub = MagicMock()
        mock_sub.to_dict.return_value = {
            "current_period_start": 1700000000,
            "current_period_end": 1702592000,
            "items": {"data": []},
        }

        start, end = _get_period(mock_sub)
        assert start is not None
        assert end is not None
        mock_sub.to_dict.assert_called_once()

    def test_items_as_stripe_object(self):
        """items field itself might be a StripeObject."""
        from app.features.payment.router import _get_period

        mock_items = MagicMock()
        mock_items.to_dict.return_value = {
            "data": [{"current_period_start": 1700000000, "current_period_end": 1702592000}]
        }

        sub = {
            "current_period_start": None,
            "current_period_end": None,
            "items": mock_items,
        }

        start, end = _get_period(sub)
        assert start is not None
        assert end is not None

    def test_returns_iso_format(self):
        """Timestamps are converted to ISO 8601 strings."""
        from app.features.payment.router import _get_period

        ts = 1700000000
        sub = {"current_period_start": ts, "current_period_end": ts}

        start, end = _get_period(sub)
        # Should be parseable as ISO datetime
        dt = datetime.fromisoformat(start)
        assert dt.tzinfo is not None  # timezone-aware


# ---------------------------------------------------------------------------
# Webhook handler
# ---------------------------------------------------------------------------

class TestWebhookHandler:
    """Tests for webhook event processing with Stripe SDK v15 objects."""

    def _make_event(self, event_type: str, obj_data: dict):
        """Create a mock Stripe event dict."""
        # Simulate a StripeObject that has .to_dict()
        mock_obj = MagicMock()
        mock_obj.to_dict.return_value = obj_data
        # Make hasattr(obj, "to_dict") return True
        mock_obj.to_dict.__name__ = "to_dict"

        return {
            "type": event_type,
            "data": {"object": mock_obj},
        }

    @pytest.mark.asyncio
    async def test_checkout_completed_with_metadata(self):
        """checkout.session.completed with valid metadata triggers upsert."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("checkout.session.completed", {
            "metadata": {"user_id": "user-123"},
            "subscription": "sub_abc",
            "customer": "cus_xyz",
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        mock_stripe_sub = MagicMock()
        mock_stripe_sub.to_dict.return_value = {
            "current_period_start": 1700000000,
            "current_period_end": 1702592000,
            "items": {"data": []},
        }

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.stripe.Subscription.retrieve", return_value=mock_stripe_sub), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["user_id"] == "user-123"
            assert call_kwargs["plan"] == "pro"
            assert call_kwargs["status"] == "active"
            assert call_kwargs["stripe_customer_id"] == "cus_xyz"
            assert call_kwargs["stripe_subscription_id"] == "sub_abc"

    @pytest.mark.asyncio
    async def test_checkout_completed_missing_metadata(self):
        """checkout.session.completed without user_id logs warning but doesn't crash."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("checkout.session.completed", {
            "metadata": {},
            "subscription": None,
            "customer": None,
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_not_called()

    @pytest.mark.asyncio
    async def test_subscription_updated_syncs_identity_only(self):
        """subscription.updated syncs status/period only (no plan write)."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.updated", {
            "metadata": {"user_id": "user-123"},
            "status": "canceled",
            "items": {"data": [{"current_period_start": 1700000000, "current_period_end": 1702592000}]},
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            # Identity sync: status + period, no plan
            assert call_kwargs["status"] == "canceled"
            assert "plan" not in call_kwargs

    @pytest.mark.asyncio
    async def test_subscription_updated_active_syncs_status(self):
        """subscription.updated with active status syncs identity (no plan write)."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.updated", {
            "metadata": {"user_id": "user-456"},
            "status": "active",
            "items": {"data": []},
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["status"] == "active"
            # Plan is determined by entitlements webhook, not here
            assert "plan" not in call_kwargs

    @pytest.mark.asyncio
    async def test_subscription_deleted_no_active_subs(self):
        """subscription.deleted with no other active subs downgrades to free."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.deleted", {
            "metadata": {"user_id": "user-123"},
            "id": "sub_deleted",
            "customer": "cus_xyz",
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        mock_active_subs = MagicMock()
        mock_active_subs.data = []  # no other active subs

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value={"stripe_subscription_id": "sub_deleted"}), \
             patch("app.features.payment.router.stripe.Subscription.list", return_value=mock_active_subs), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["plan"] == "free"
            assert call_kwargs["status"] == "canceled"

    @pytest.mark.asyncio
    async def test_unhandled_event_returns_ok(self):
        """Unknown event types are acknowledged without error."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("invoice.paid", {"id": "inv_123"})

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event):
            result = await stripe_webhook(mock_request)
            assert result == {"received": True}
