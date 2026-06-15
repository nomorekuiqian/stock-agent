"""
Unit tests for payment router helpers and webhook handling.

Tests the Stripe SDK v15 compatibility layer (_to_dict, _get_period)
and webhook event processing with mocked Stripe objects.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Entitlement catalog
# ---------------------------------------------------------------------------


class TestEntitlementCatalog:
    """Static feature catalog regressions."""

    def test_twitter_digest_is_max_only(self):
        from app.features.payment.entitlements import MAX_FEATURES, MAX_ONLY_FEATURES

        assert "twitter_digest" in MAX_ONLY_FEATURES
        assert "twitter_digest" in MAX_FEATURES

    def test_qinbafrank_pack_is_legacy_only(self):
        from app.features.payment.entitlements import (
            KOL_PACK_FEATURES,
            KOL_PACK_QINBAFRANK,
            MAX_FEATURES,
        )

        assert KOL_PACK_QINBAFRANK == "kol_pack_qinbafrank"
        assert KOL_PACK_QINBAFRANK in KOL_PACK_FEATURES
        assert KOL_PACK_QINBAFRANK not in MAX_FEATURES

    def test_qinbafrank_legacy_entitlement_normalizes_to_max_features(self):
        from app.features.payment.entitlements import KOL_PACK_QINBAFRANK
        from app.features.payment.service import _normalize_entitlements

        plan, status, features = _normalize_entitlements([KOL_PACK_QINBAFRANK])

        assert plan == "max"
        assert status == "active"
        assert KOL_PACK_QINBAFRANK not in features
        assert "ai_research_engine" in features
        assert "twitter_digest" in features


# ---------------------------------------------------------------------------
# Checkout session
# ---------------------------------------------------------------------------


class TestCheckoutSession:
    """Checkout URL regressions."""

    @pytest.mark.asyncio
    async def test_success_url_marks_checkout_return_and_tier(self):
        from app.features.payment import service

        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.test/session"

        with patch.object(
            service,
            "STRIPE_MAX_PRICE_ID",
            "price_max_test",
        ), patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_pro_test", "max": "price_max_test"},
        ), patch.object(
            service,
            "FRONTEND_URL",
            "https://themarketbrew.com",
        ), patch(
            "app.features.payment.service.get_or_create_stripe_customer",
            new_callable=AsyncMock,
            return_value="cus_test",
        ), patch(
            "app.features.payment.service._is_active_price",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "app.features.payment.service.stripe.checkout.Session.create",
            return_value=mock_session,
        ) as mock_create:
            url = await service.create_checkout_session(
                user_id="user-1",
                email="test@example.com",
                return_path="/research?agent=kol&persona=qinbafrank",
                tier="max",
            )

        assert url == "https://checkout.stripe.test/session"
        success_url = mock_create.call_args.kwargs["success_url"]
        assert success_url.startswith("https://themarketbrew.com/pricing/success?")
        assert "checkout=success" in success_url
        assert "tier=max" in success_url
        assert "next=%2Fresearch%3Fagent%3Dkol%26persona%3Dqinbafrank" in success_url
        assert "session_id={CHECKOUT_SESSION_ID}" in success_url
        kwargs = mock_create.call_args.kwargs
        assert kwargs["automatic_tax"] == {"enabled": True}
        assert kwargs["billing_address_collection"] == "required"
        assert kwargs["customer_update"] == {
            "address": "auto",
            "name": "auto",
        }
        assert kwargs["tax_id_collection"] == {"enabled": True}

    @pytest.mark.asyncio
    async def test_checkout_return_uses_allowed_request_origin(self):
        from app.features.payment import service

        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.test/session"

        with patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_pro_test", "max": "price_max_test"},
        ), patch.object(
            service,
            "FRONTEND_URL",
            "https://stock-agent-git-codex-qinbafrank-creator-max-the-market-brew.vercel.app",
        ), patch.object(
            service,
            "ALLOWED_ORIGINS",
            ["https://themarketbrew.com"],
        ), patch.object(
            service,
            "CORS_ALLOWED_ORIGIN_REGEX",
            r"https://.*-the-market-brew\.vercel\.app",
        ), patch(
            "app.features.payment.service.get_or_create_stripe_customer",
            new_callable=AsyncMock,
            return_value="cus_test",
        ), patch(
            "app.features.payment.service._is_active_price",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "app.features.payment.service.stripe.checkout.Session.create",
            return_value=mock_session,
        ) as mock_create:
            await service.create_checkout_session(
                user_id="user-1",
                email="test@example.com",
                return_path="/pricing",
                tier="pro",
                frontend_origin="https://stock-agent-37gd2tg7u-the-market-brew.vercel.app",
            )

        kwargs = mock_create.call_args.kwargs
        assert kwargs["success_url"].startswith(
            "https://stock-agent-37gd2tg7u-the-market-brew.vercel.app/pricing/success?"
        )
        assert kwargs["cancel_url"] == (
            "https://stock-agent-37gd2tg7u-the-market-brew.vercel.app/pricing?checkout=cancel"
        )

    @pytest.mark.asyncio
    async def test_checkout_return_rejects_untrusted_request_origin(self):
        from app.features.payment import service

        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.test/session"

        with patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_pro_test", "max": "price_max_test"},
        ), patch.object(
            service,
            "FRONTEND_URL",
            "https://themarketbrew.com",
        ), patch.object(
            service,
            "ALLOWED_ORIGINS",
            ["https://themarketbrew.com"],
        ), patch.object(
            service,
            "CORS_ALLOWED_ORIGIN_REGEX",
            r"https://.*-the-market-brew\.vercel\.app",
        ), patch(
            "app.features.payment.service.get_or_create_stripe_customer",
            new_callable=AsyncMock,
            return_value="cus_test",
        ), patch(
            "app.features.payment.service._is_active_price",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "app.features.payment.service.stripe.checkout.Session.create",
            return_value=mock_session,
        ) as mock_create:
            await service.create_checkout_session(
                user_id="user-1",
                email="test@example.com",
                return_path="/pricing",
                tier="pro",
                frontend_origin="https://evil.example.com",
            )

        kwargs = mock_create.call_args.kwargs
        assert kwargs["success_url"].startswith("https://themarketbrew.com/pricing/success?")
        assert kwargs["cancel_url"] == "https://themarketbrew.com/pricing?checkout=cancel"

    @pytest.mark.asyncio
    async def test_legacy_ultra_checkout_aliases_to_max_metadata(self):
        from app.features.payment import service

        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.test/ultra-session"

        with patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_pro_test", "max": "price_max_test"},
        ), patch.object(
            service,
            "FRONTEND_URL",
            "https://themarketbrew.com",
        ), patch(
            "app.features.payment.service.get_or_create_stripe_customer",
            new_callable=AsyncMock,
            return_value="cus_test",
        ), patch(
            "app.features.payment.service._is_active_price",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "app.features.payment.service.stripe.checkout.Session.create",
            return_value=mock_session,
        ) as mock_create:
            url = await service.create_checkout_session(
                user_id="user-1",
                email="test@example.com",
                return_path="/kol/qinbafrank?welcome=1",
                tier="ultra",
            )

        assert url == "https://checkout.stripe.test/ultra-session"
        kwargs = mock_create.call_args.kwargs
        assert kwargs["line_items"] == [{"price": "price_max_test", "quantity": 1}]
        assert "tier=max" in kwargs["success_url"]
        assert "product=max" in kwargs["success_url"]
        assert "next=%2Fkol%2Fqinbafrank%3Fwelcome%3D1" in kwargs["success_url"]
        assert kwargs["cancel_url"] == "https://themarketbrew.com/kol/qinbafrank?welcome=1&checkout=cancel"
        assert kwargs["metadata"]["tier"] == "max"
        assert kwargs["metadata"]["product"] == "max"
        assert kwargs["subscription_data"]["metadata"]["tier"] == "max"
        assert kwargs["subscription_data"]["metadata"]["product"] == "max"

    def test_legacy_ultra_product_normalizes_to_max(self):
        from app.features.payment import service

        assert service.normalize_checkout_product("ultra", "ultra") == "max"
        assert service.normalize_checkout_product("creator_max_qinbafrank", "pro") == "max"

    @pytest.mark.asyncio
    async def test_price_resolves_from_lookup_key_when_configured_price_inactive(self):
        from app.features.payment import service

        mock_prices = MagicMock()
        mock_prices.to_dict.return_value = {
            "data": [{"id": "price_pro_lookup"}],
        }

        with patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_inactive", "max": "price_max_test"},
        ), patch.object(
            service,
            "_RESOLVED_PRICE_ID_CACHE",
            {},
        ), patch(
            "app.features.payment.service._is_active_price",
            new_callable=AsyncMock,
            return_value=False,
        ), patch(
            "app.features.payment.service.stripe.Price.list",
            return_value=mock_prices,
        ) as mock_list:
            price_id = await service.resolve_price_id_for_product("pro")

        assert price_id == "price_pro_lookup"
        mock_list.assert_called_once_with(
            lookup_keys=["themarketbrew_pro_monthly"],
            active=True,
            limit=1,
        )

    def _client_with_auth(self, user_id: str = "user-1"):
        from app.core.deps import verify_user_token
        from app.main import app

        app.dependency_overrides[verify_user_token] = lambda: user_id
        return app, TestClient(app)

    def test_existing_paid_upgrade_uses_portal_instead_of_checkout(self):
        """Pro -> Max must update the existing Stripe subscription, not create a new one."""
        app, client = self._client_with_auth("user-1")

        try:
            with patch(
                "app.features.payment.router.get_subscription",
                new_callable=AsyncMock,
                return_value={
                    "user_id": "user-1",
                    "plan": "pro",
                    "status": "active",
                    "stripe_customer_id": "cus_123",
                    "stripe_subscription_id": "sub_123",
                    "access_expires_at": None,
                    "is_lifetime": False,
                },
            ), patch(
                "app.features.payment.router.create_portal_session",
                new_callable=AsyncMock,
                return_value="https://billing.stripe.test/session",
            ) as mock_portal, patch(
                "app.features.payment.router.create_checkout_session",
                new_callable=AsyncMock,
            ) as mock_checkout:
                resp = client.post(
                    "/api/payment/checkout-session",
                    json={
                        "user_id": "user-1",
                        "email": "test@example.com",
                        "tier": "max",
                        "product": "max",
                        "return_path": "/pricing",
                    },
                )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json() == {"checkout_url": "https://billing.stripe.test/session"}
        mock_portal.assert_awaited_once_with(
            "user-1",
            return_path="/pricing",
            product="max",
            billing_interval="monthly",
            frontend_origin=None,
        )
        mock_checkout.assert_not_called()

    def test_existing_paid_included_plan_is_rejected(self):
        """A paid Max user cannot open another Checkout for Max/Pro."""
        app, client = self._client_with_auth("user-1")

        try:
            with patch(
                "app.features.payment.router.get_subscription",
                new_callable=AsyncMock,
                return_value={
                    "user_id": "user-1",
                    "plan": "max",
                    "status": "active",
                    "stripe_customer_id": "cus_123",
                    "stripe_subscription_id": "sub_123",
                    "access_expires_at": None,
                    "is_lifetime": False,
                },
            ), patch(
                "app.features.payment.router.create_portal_session",
                new_callable=AsyncMock,
            ) as mock_portal, patch(
                "app.features.payment.router.create_checkout_session",
                new_callable=AsyncMock,
            ) as mock_checkout:
                resp = client.post(
                    "/api/payment/checkout-session",
                    json={
                        "user_id": "user-1",
                        "email": "test@example.com",
                        "tier": "max",
                        "product": "max",
                    },
                )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert resp.json()["detail"] == "Current subscription already includes this plan"
        mock_portal.assert_not_called()
        mock_checkout.assert_not_called()

    @pytest.mark.asyncio
    async def test_upgrade_portal_configuration_updates_to_immediate_proration(self):
        """Upgrade Portal config must immediately invoice prorated differences."""
        from app.features.payment import service

        current_config = {
            "id": "bpc_default",
            "active": True,
            "is_default": True,
            "features": {
                "subscription_update": {
                    "enabled": True,
                    "default_allowed_updates": ["price"],
                    "proration_behavior": "create_prorations",
                }
            },
        }
        updated_config = {
            **current_config,
            "features": {
                "subscription_update": {
                    "enabled": True,
                    "default_allowed_updates": ["price"],
                    "proration_behavior": "always_invoice",
                }
            },
        }

        with patch.object(
            service,
            "_UPGRADE_PORTAL_CONFIGURATION_CACHE",
            {},
        ), patch(
            "app.features.payment.service.stripe.billing_portal.Configuration.list",
            return_value={"data": [current_config]},
        ), patch(
            "app.features.payment.service.stripe.billing_portal.Configuration.modify",
            return_value=updated_config,
        ) as mock_modify:
            config_id = await service._ensure_upgrade_portal_configuration_id()

        assert config_id == "bpc_default"
        mock_modify.assert_called_once_with(
            "bpc_default",
            features={
                "subscription_update": {
                    "proration_behavior": "always_invoice",
                }
            },
        )

    @pytest.mark.asyncio
    async def test_create_portal_session_upgrade_uses_proration_configuration(self):
        """Upgrade sessions are pinned to the always_invoice Portal config."""
        from app.features.payment import service

        mock_session = MagicMock()
        mock_session.url = "https://billing.stripe.test/session"

        with patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={
                "user_id": "user-1",
                "stripe_customer_id": "cus_123",
                "stripe_subscription_id": "sub_123",
            },
        ), patch(
            "app.features.payment.service.resolve_price_id_for_product",
            new_callable=AsyncMock,
            return_value="price_max",
        ), patch(
            "app.features.payment.service._retrieve_subscription",
            new_callable=AsyncMock,
            return_value={
                "id": "sub_123",
                "items": {
                    "data": [
                        {
                            "id": "si_123",
                            "quantity": 1,
                            "price": {"id": "price_pro"},
                        }
                    ]
                },
            },
        ), patch(
            "app.features.payment.service._ensure_upgrade_portal_configuration_id",
            new_callable=AsyncMock,
            return_value="bpc_upgrade_proration",
        ), patch(
            "app.features.payment.service.stripe.billing_portal.Session.create",
            return_value=mock_session,
        ) as mock_create:
            url = await service.create_portal_session(
                "user-1",
                return_path="/pricing",
                product="max",
            )

        assert url == "https://billing.stripe.test/session"
        kwargs = mock_create.call_args.kwargs
        assert kwargs["configuration"] == "bpc_upgrade_proration"
        flow = kwargs["flow_data"]
        assert flow["type"] == "subscription_update_confirm"
        assert flow["subscription_update_confirm"]["subscription"] == "sub_123"
        assert flow["subscription_update_confirm"]["items"] == [
            {"id": "si_123", "price": "price_max", "quantity": 1}
        ]


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
# Expired grant reconciliation DB wrapper
# ---------------------------------------------------------------------------


class TestExpiredGrantDbWrapper:
    """Edge function failures must surface to the cron caller."""

    @pytest.mark.asyncio
    async def test_list_expired_access_grants_raises_on_edge_failure(self):
        from app.features.payment.db import list_expired_access_grants

        mock_service = MagicMock()
        mock_service.call_function = AsyncMock(
            return_value={"data": {"success": False, "error": "edge unavailable"}}
        )
        with patch(
            "app.features.payment.db.get_insforge_service",
            return_value=mock_service,
        ):
            with pytest.raises(RuntimeError, match="edge unavailable"):
                await list_expired_access_grants("2026-06-06T00:00:00+00:00")


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
             patch("app.features.payment.router.stripe.Subscription.retrieve", return_value=mock_stripe_sub) as mock_retrieve, \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.service.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 return_value={"synced": True},
             ) as mock_sync:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_retrieve.assert_called_once_with("sub_abc", expand=["items.data.price"])
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["user_id"] == "user-123"
            assert call_kwargs["plan"] == "pro"
            assert call_kwargs["status"] == "active"
            assert call_kwargs["stripe_customer_id"] == "cus_xyz"
            assert call_kwargs["stripe_subscription_id"] == "sub_abc"
            assert "morning_report_email" in call_kwargs["entitlements"]
            mock_sync.assert_awaited_once_with(
                "cus_xyz",
                user_id="user-123",
                customer_email=None,
                allow_empty=False,
                source="checkout.session.completed",
            )

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
    async def test_subscription_updated_syncs_identity_only_without_customer(self):
        """subscription.updated without customer syncs status/period only."""
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
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            # The service now writes a full local snapshot, not only identity.
            assert call_kwargs["status"] == "canceled"
            assert call_kwargs["plan"] == "free"
            assert call_kwargs["entitlements"] == []

    @pytest.mark.asyncio
    async def test_subscription_updated_compensates_entitlements_when_customer_present(self):
        """subscription.updated also triggers non-destructive entitlement sync."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.updated", {
            "metadata": {"user_id": "user-123"},
            "id": "sub_abc",
            "customer": "cus_xyz",
            "status": "active",
            "items": {"data": [{"current_period_start": 1700000000, "current_period_end": 1702592000}]},
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        existing = {"user_id": "user-123", "stripe_customer_id": "cus_xyz"}
        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=existing), \
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=existing), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.service.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 return_value={"synced": True},
             ) as mock_sync:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            assert mock_upsert.call_args.kwargs["plan"] == "pro"
            assert "morning_report_email" in mock_upsert.call_args.kwargs["entitlements"]
            mock_sync.assert_awaited_once_with(
                "cus_xyz",
                user_id="user-123",
                customer_email=None,
                allow_empty=False,
                source="customer.subscription.updated",
            )

    @pytest.mark.asyncio
    async def test_subscription_updated_persists_scheduled_cancellation(self):
        """Active subscriptions can be scheduled to cancel at period end."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.updated", {
            "metadata": {"user_id": "user-123", "tier": "ultra"},
            "id": "sub_abc",
            "customer": "cus_xyz",
            "status": "active",
            "cancel_at_period_end": False,
            "cancel_at": 1783824523,
            "canceled_at": 1781235280,
            "items": {
                "data": [{
                    "current_period_start": 1781232523,
                    "current_period_end": 1783824523,
                    "price": {"lookup_key": "themarketbrew_ultra_monthly"},
                }]
            },
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b"payload"
        mock_request.headers = {"stripe-signature": "sig"}

        existing = {"user_id": "user-123", "stripe_customer_id": "cus_xyz"}
        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=existing), \
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=existing), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.service.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 return_value={"synced": True},
             ):

            result = await stripe_webhook(mock_request)

        assert result == {"received": True}
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "max"
        assert call_kwargs["status"] == "active"
        assert call_kwargs["cancel_at_period_end"] is False
        assert call_kwargs["cancel_at"] == "2026-07-12T02:48:43+00:00"
        assert call_kwargs["canceled_at"] == "2026-06-12T03:34:40+00:00"
        assert call_kwargs["clear_cancel_at"] is False
        assert call_kwargs["clear_canceled_at"] is False

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
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert:

            result = await stripe_webhook(mock_request)

            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["status"] == "active"
            assert call_kwargs["plan"] == "pro"
            assert "morning_report_email" in call_kwargs["entitlements"]

    @pytest.mark.asyncio
    async def test_subscription_updated_entitlement_sync_failure_keeps_snapshot(self):
        """subscription.updated keeps canonical entitlements if Stripe entitlement sync lags."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.updated", {
            "metadata": {"user_id": "user-123"},
            "id": "sub_abc",
            "customer": "cus_xyz",
            "status": "active",
            "items": {"data": [{"current_period_end": 1702592000}]},
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.get_subscription", new_callable=AsyncMock, return_value=None), \
             patch("app.features.payment.service.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.service.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 side_effect=RuntimeError("stripe unavailable"),
             ):

            result = await stripe_webhook(mock_request)

        assert result == {"received": True}
        assert mock_upsert.call_args.kwargs["plan"] == "pro"
        assert "morning_report_email" in mock_upsert.call_args.kwargs["entitlements"]

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
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.router.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 return_value={"synced": True},
             ) as mock_sync:

            result = await stripe_webhook(mock_request)

            assert result == {"received": True}
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args[1]
            assert call_kwargs["plan"] == "free"
            assert call_kwargs["status"] == "canceled"
            assert call_kwargs["clear_access_expires_at"] is True
            mock_sync.assert_awaited_once_with(
                "cus_xyz",
                user_id="user-123",
                allow_empty=True,
                source="customer.subscription.deleted",
            )

    @pytest.mark.asyncio
    async def test_subscription_deleted_preserves_trialing_replacement_sub(self):
        """A replacement trialing subscription still represents active access."""
        from app.features.payment.router import stripe_webhook

        event = self._make_event("customer.subscription.deleted", {
            "metadata": {"user_id": "user-123"},
            "id": "sub_deleted",
            "customer": "cus_xyz",
        })

        mock_request = AsyncMock()
        mock_request.body.return_value = b'payload'
        mock_request.headers = {"stripe-signature": "sig"}

        active_sub = {
            "id": "sub_trial",
            "status": "trialing",
            "metadata": {"tier": "max"},
            "current_period_start": 1700000000,
            "current_period_end": 1702592000,
            "items": {"data": []},
        }
        mock_active_subs = MagicMock()
        mock_active_subs.data = [active_sub]

        with patch("app.features.payment.router.stripe.Webhook.construct_event", return_value=event), \
             patch("app.features.payment.router.get_subscription", new_callable=AsyncMock, return_value={"stripe_subscription_id": "sub_deleted"}), \
             patch("app.features.payment.router.stripe.Subscription.list", return_value=mock_active_subs), \
             patch("app.features.payment.router.upsert_subscription", new_callable=AsyncMock) as mock_upsert, \
             patch(
                 "app.features.payment.router.sync_entitlements_from_stripe",
                 new_callable=AsyncMock,
                 return_value={"synced": True},
             ):

            result = await stripe_webhook(mock_request)

        assert result == {"received": True}
        call_kwargs = mock_upsert.call_args[1]
        assert call_kwargs["stripe_subscription_id"] == "sub_trial"
        assert call_kwargs["plan"] == "max"
        assert call_kwargs["status"] == "active"
        assert call_kwargs["clear_access_expires_at"] is True

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


# ---------------------------------------------------------------------------
# _parse_iso_datetime helper
# ---------------------------------------------------------------------------


class TestParseIsoDatetime:
    """Tests for _parse_iso_datetime() — tolerant ISO-8601 parser."""

    def test_none_returns_none(self):
        from app.features.payment.service import _parse_iso_datetime

        assert _parse_iso_datetime(None) is None

    def test_empty_string_returns_none(self):
        from app.features.payment.service import _parse_iso_datetime

        assert _parse_iso_datetime("") is None

    def test_invalid_string_returns_none(self):
        from app.features.payment.service import _parse_iso_datetime

        assert _parse_iso_datetime("not-a-date") is None

    def test_z_suffix_parsed_as_utc(self):
        from app.features.payment.service import _parse_iso_datetime

        parsed = _parse_iso_datetime("2026-06-06T12:00:00Z")
        assert parsed == datetime(2026, 6, 6, 12, 0, 0, tzinfo=timezone.utc)

    def test_naive_timestamp_assumed_utc(self):
        from app.features.payment.service import _parse_iso_datetime

        parsed = _parse_iso_datetime("2026-06-06T12:00:00")
        assert parsed.tzinfo is timezone.utc
        assert parsed == datetime(2026, 6, 6, 12, 0, 0, tzinfo=timezone.utc)

    def test_explicit_offset_preserved(self):
        from app.features.payment.service import _parse_iso_datetime

        parsed = _parse_iso_datetime("2026-06-06T12:00:00+08:00")
        # 12:00 +08:00 == 04:00 UTC
        assert parsed == datetime(2026, 6, 6, 4, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Legacy Ultra sync normalization
# ---------------------------------------------------------------------------


class TestLegacyUltraSync:
    """Legacy Ultra rows are normalized back to Max during active syncs."""

    @pytest.mark.asyncio
    async def test_subscription_sync_normalizes_local_ultra_for_active_stripe_max(self):
        from app.features.payment import service
        from app.features.payment.entitlements import KOL_PACK_QINBAFRANK, MAX_FEATURES

        existing = {
            "user_id": "user-legacy",
            "plan": "ultra",
            "status": "active",
            "stripe_customer_id": "cus_legacy",
            "stripe_subscription_id": "sub_legacy",
            "entitlements": sorted(MAX_FEATURES | {KOL_PACK_QINBAFRANK}),
        }
        stripe_sub = {
            "id": "sub_legacy",
            "customer": "cus_legacy",
            "status": "active",
            "items": {
                "data": [
                    {
                        "id": "si_legacy",
                        "price": {"id": "price_max_test"},
                        "current_period_start": 1781232523,
                        "current_period_end": 1783824523,
                    }
                ]
            },
        }

        with patch.object(
            service,
            "PRICE_ID_MAP",
            {"pro": "price_pro_test", "max": "price_max_test"},
        ), patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value=existing,
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.payment.service.sync_entitlements_from_stripe",
            new_callable=AsyncMock,
            return_value={"synced": True},
        ):
            result = await service.sync_subscription_from_stripe(
                "user-legacy",
                stripe_subscription=stripe_sub,
                source="test",
            )

        assert result["plan"] == "max"
        assert KOL_PACK_QINBAFRANK not in result["entitlements"]
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "max"
        assert KOL_PACK_QINBAFRANK not in call_kwargs["entitlements"]

    @pytest.mark.asyncio
    async def test_entitlement_sync_normalizes_local_ultra_for_active_stripe_max(self):
        from app.features.payment import service
        from app.features.payment.entitlements import KOL_PACK_QINBAFRANK, MAX_FEATURES

        existing = {
            "user_id": "user-legacy",
            "plan": "ultra",
            "status": "active",
            "stripe_customer_id": "cus_legacy",
            "entitlements": sorted(MAX_FEATURES | {KOL_PACK_QINBAFRANK}),
        }
        max_entitlements = [
            {"id": "ent_ai", "lookup_key": "ai_research_engine"},
            {"id": "ent_digest", "lookup_key": "twitter_digest"},
        ]

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value=existing,
        ), patch(
            "app.features.payment.service._list_active_entitlements",
            new_callable=AsyncMock,
            return_value=max_entitlements,
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value=existing,
        ), patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments",
            return_value=[],
        ):
            result = await service.sync_entitlements_from_stripe(
                "cus_legacy",
                customer_email="legacy@example.com",
                source="test",
            )

        assert result["plan"] == "max"
        assert KOL_PACK_QINBAFRANK not in result["entitlements"]
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "max"
        assert KOL_PACK_QINBAFRANK not in call_kwargs["entitlements"]

    @pytest.mark.asyncio
    async def test_empty_entitlement_sync_still_deprovisions_local_ultra(self):
        from app.features.payment import service
        from app.features.payment.entitlements import KOL_PACK_QINBAFRANK, MAX_FEATURES

        existing = {
            "user_id": "user-legacy",
            "plan": "ultra",
            "status": "active",
            "stripe_customer_id": "cus_legacy",
            "entitlements": sorted(MAX_FEATURES | {KOL_PACK_QINBAFRANK}),
        }

        with patch(
            "app.features.payment.service.get_subscription_by_customer",
            new_callable=AsyncMock,
            return_value=existing,
        ), patch(
            "app.features.payment.service._list_active_entitlements",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "app.features.payment.service.upsert_subscription",
            new_callable=AsyncMock,
        ) as mock_upsert, patch(
            "app.features.payment.service.get_subscription",
            new_callable=AsyncMock,
            return_value={"plan": "free", "status": "canceled", "entitlements": []},
        ), patch(
            "app.features.subscription.service.SubscriptionService.sync_resend_segments",
            return_value=[],
        ):
            result = await service.sync_entitlements_from_stripe(
                "cus_legacy",
                customer_email="legacy@example.com",
                allow_empty=True,
                source="test",
            )

        assert result["plan"] == "free"
        assert result["entitlements"] == []
        call_kwargs = mock_upsert.call_args.kwargs
        assert call_kwargs["plan"] == "free"
        assert call_kwargs["status"] == "canceled"
        assert call_kwargs["entitlements"] == []


# ---------------------------------------------------------------------------
# _list_active_entitlements pagination
# ---------------------------------------------------------------------------


class TestListActiveEntitlementsPagination:
    """Tests for _list_active_entitlements() — Stripe pagination loop."""

    @pytest.mark.asyncio
    async def test_single_page_no_pagination(self):
        from app.features.payment.service import _list_active_entitlements

        page = {"data": [{"id": "ent_1"}, {"id": "ent_2"}], "has_more": False}
        with patch(
            "app.features.payment.service.stripe.entitlements.ActiveEntitlement.list",
            return_value=page,
        ) as mock_list:
            result = await _list_active_entitlements("cus_1")

        assert result == [{"id": "ent_1"}, {"id": "ent_2"}]
        mock_list.assert_called_once()
        assert "starting_after" not in mock_list.call_args.kwargs

    @pytest.mark.asyncio
    async def test_multi_page_threads_starting_after(self):
        from app.features.payment.service import _list_active_entitlements

        page1 = {"data": [{"id": "ent_1"}], "has_more": True}
        page2 = {"data": [{"id": "ent_2"}], "has_more": False}
        with patch(
            "app.features.payment.service.stripe.entitlements.ActiveEntitlement.list",
            side_effect=[page1, page2],
        ) as mock_list:
            result = await _list_active_entitlements("cus_1")

        assert result == [{"id": "ent_1"}, {"id": "ent_2"}]
        assert mock_list.call_count == 2
        # The second request must page from the last id of page one.
        assert mock_list.call_args_list[1].kwargs.get("starting_after") == "ent_1"

    @pytest.mark.asyncio
    async def test_empty_page_breaks_loop(self):
        from app.features.payment.service import _list_active_entitlements

        # has_more lies (True) but data is empty — loop must still terminate.
        page = {"data": [], "has_more": True}
        with patch(
            "app.features.payment.service.stripe.entitlements.ActiveEntitlement.list",
            return_value=page,
        ) as mock_list:
            result = await _list_active_entitlements("cus_1")

        assert result == []
        mock_list.assert_called_once()


# ---------------------------------------------------------------------------
# reconcile_expired_access_grants
# ---------------------------------------------------------------------------


class TestReconcileExpiredAccessGrants:
    """Tests for reconcile_expired_access_grants() — expired-grant cron job."""

    _PAST = "2026-06-01T00:00:00+00:00"
    _FUTURE = "2027-01-01T00:00:00+00:00"
    _NOW = datetime(2026, 6, 6, 0, 0, 0, tzinfo=timezone.utc)

    def _patches(self, rows, upsert_return=True):
        """Patch the service collaborators used by the reconcile loop."""
        return (
            patch(
                "app.features.payment.service.list_expired_access_grants",
                new_callable=AsyncMock,
                return_value=rows,
            ),
            patch(
                "app.features.payment.service.upsert_subscription",
                new_callable=AsyncMock,
                return_value=upsert_return,
            ),
            patch(
                "app.features.payment.service.get_user_email_by_id",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.features.payment.service.get_subscription",
                new_callable=AsyncMock,
                return_value={},
            ),
        )

    @pytest.mark.asyncio
    async def test_expires_eligible_grant(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [
            {
                "user_id": "u1",
                "plan": "max",
                "status": "active",
                "entitlements": ["ai_research_engine"],
                "access_expires_at": self._PAST,
            }
        ]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows)
        with list_p, upsert_p as mock_upsert, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result == {
            "success": True,
            "processed": 1,
            "expired": 1,
            "skipped": 0,
            "errors": [],
        }
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["user_id"] == "u1"
        assert kwargs["plan"] == "free"
        assert kwargs["status"] == "expired"
        assert kwargs["entitlements"] == []

    @pytest.mark.asyncio
    async def test_skips_lifetime_user(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [
            {
                "user_id": "u1",
                "is_lifetime": True,
                "plan": "max",
                "entitlements": ["x"],
                "access_expires_at": self._PAST,
            }
        ]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows)
        with list_p, upsert_p as mock_upsert, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result["expired"] == 0
        assert result["skipped"] == 1
        mock_upsert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_missing_user_id(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [{"plan": "max", "access_expires_at": self._PAST}]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows)
        with list_p, upsert_p as mock_upsert, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result["skipped"] == 1
        mock_upsert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_not_yet_expired(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [
            {
                "user_id": "u1",
                "plan": "max",
                "entitlements": ["x"],
                "access_expires_at": self._FUTURE,
            }
        ]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows)
        with list_p, upsert_p as mock_upsert, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result["skipped"] == 1
        mock_upsert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_already_free_without_entitlements(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [
            {
                "user_id": "u1",
                "plan": "free",
                "entitlements": [],
                "access_expires_at": self._PAST,
            }
        ]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows)
        with list_p, upsert_p as mock_upsert, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result["skipped"] == 1
        mock_upsert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_upsert_failure_recorded_as_error(self):
        from app.features.payment.service import reconcile_expired_access_grants

        rows = [
            {
                "user_id": "u1",
                "plan": "max",
                "entitlements": ["x"],
                "access_expires_at": self._PAST,
            }
        ]
        list_p, upsert_p, _email_p, _sub_p = self._patches(rows, upsert_return=False)
        with list_p, upsert_p, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=self._NOW)

        assert result["success"] is False
        assert result["expired"] == 0
        assert result["errors"] == [{"user_id": "u1", "error": "upsert_failed"}]

    @pytest.mark.asyncio
    async def test_naive_now_normalized_to_utc(self):
        from app.features.payment.service import reconcile_expired_access_grants

        list_p, upsert_p, _email_p, _sub_p = self._patches([])
        naive_now = datetime(2026, 6, 6, 0, 0, 0)  # no tzinfo
        with list_p as mock_list, upsert_p, _email_p, _sub_p:
            result = await reconcile_expired_access_grants(now=naive_now)

        assert result["processed"] == 0
        # The query timestamp passed to the edge function must be tz-aware UTC.
        passed_iso = mock_list.call_args.args[0]
        assert passed_iso.endswith("+00:00")
