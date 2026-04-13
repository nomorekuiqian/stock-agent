"""Unit tests for invite code redemption with Stripe trial subscription."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock


VALID_CODES = ["ALPHA2026", "BETAINVITE"]


class TestRedeemCode:
    """Test redeem_code in invites/db.py."""

    # ------------------------------------------------------------------
    # 1. Invalid code
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_invalid_code_returns_error(self):
        """Invalid invite code -> success=False, error=invalid_code."""
        from app.features.invites.db import redeem_code

        result = await redeem_code(
            user_id="user-001",
            user_email="test@example.com",
            code="WRONGCODE",
            valid_codes=VALID_CODES,
        )
        assert result["success"] is False
        assert result["error"] == "invalid_code"

    # ------------------------------------------------------------------
    # 2. Stripe not configured
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    @patch("app.features.invites.db.STRIPE_MAX_PRICE_ID", None)
    @patch("app.features.invites.db.STRIPE_SECRET_KEY", None)
    async def test_stripe_not_configured(self):
        """Missing Stripe config -> success=False, error=payment_not_configured."""
        from app.features.invites.db import redeem_code

        result = await redeem_code(
            user_id="user-002",
            user_email="test@example.com",
            code="ALPHA2026",
            valid_codes=VALID_CODES,
        )
        assert result["success"] is False
        assert result["error"] == "payment_not_configured"

    # ------------------------------------------------------------------
    # 3. Happy path: valid code + Stripe configured
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    @patch("app.features.invites.db.STRIPE_SECRET_KEY", "sk_test_xxx")
    @patch("app.features.invites.db.STRIPE_MAX_PRICE_ID", "price_max_xxx")
    @patch("app.features.invites.db.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_or_create_stripe_customer", new_callable=AsyncMock)
    @patch("app.features.invites.db.stripe")
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock, return_value=None)
    async def test_happy_path_creates_trial(
        self, mock_get_sub, mock_stripe, mock_get_customer, mock_upsert,
    ):
        """Valid code + Stripe -> creates trial sub, writes DB with entitlements."""
        mock_get_customer.return_value = "cus_test_happy"

        # Fake subscription object returned by stripe.Subscription.create
        fake_sub = MagicMock()
        fake_sub.to_dict.return_value = {
            "id": "sub_trial_001",
            "trial_end": 1750000000,  # some future timestamp
        }
        mock_stripe.Subscription.create.return_value = fake_sub

        from app.features.invites.db import redeem_code

        result = await redeem_code(
            user_id="user-003",
            user_email="happy@example.com",
            code="alpha2026",  # lowercase, should be normalized
            valid_codes=VALID_CODES,
            access_days=14,
        )

        assert result["success"] is True
        assert result["subscription_id"] == "sub_trial_001"
        assert "access_expires_at" in result

        # Verify Stripe Subscription.create was called with correct params
        mock_stripe.Subscription.create.assert_called_once()
        create_kwargs = mock_stripe.Subscription.create.call_args.kwargs
        assert create_kwargs["customer"] == "cus_test_happy"
        assert create_kwargs["trial_period_days"] == 14
        assert create_kwargs["metadata"]["tier"] == "max"
        assert create_kwargs["metadata"]["invite_code"] == "invite_redemption"

        # upsert is called twice: once in create_trial_subscription (full write),
        # once in redeem_code (update invite_code to actual code)
        assert mock_upsert.await_count == 2
        first_call_kwargs = mock_upsert.call_args_list[0].kwargs
        assert first_call_kwargs["user_id"] == "user-003"
        assert first_call_kwargs["plan"] == "max"
        assert first_call_kwargs["status"] == "active"
        assert first_call_kwargs["stripe_customer_id"] == "cus_test_happy"
        assert first_call_kwargs["stripe_subscription_id"] == "sub_trial_001"

        # Entitlements should be sorted MAX_FEATURES
        from app.features.payment.entitlements import MAX_FEATURES
        assert first_call_kwargs["entitlements"] == sorted(MAX_FEATURES)

    # ------------------------------------------------------------------
    # 4. Stripe API failure propagates
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    @patch("app.features.invites.db.STRIPE_SECRET_KEY", "sk_test_xxx")
    @patch("app.features.invites.db.STRIPE_MAX_PRICE_ID", "price_max_xxx")
    @patch("app.features.invites.db.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_or_create_stripe_customer", new_callable=AsyncMock)
    @patch("app.features.invites.db.stripe")
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock, return_value=None)
    async def test_stripe_api_failure_falls_back_to_db(
        self, mock_get_sub, mock_stripe, mock_get_customer, mock_upsert,
    ):
        """stripe.Subscription.create raises -> falls back to DB write with stripe_pending."""
        mock_get_customer.return_value = "cus_test_fail"
        mock_stripe.Subscription.create.side_effect = Exception("Stripe API error")

        from app.features.invites.db import redeem_code

        result = await redeem_code(
            user_id="user-004",
            user_email="fail@example.com",
            code="ALPHA2026",
            valid_codes=VALID_CODES,
        )

        assert result["success"] is True
        assert result["stripe_pending"] is True
        assert result["subscription_id"] is None

        # upsert IS called (fallback DB write + invite code update)
        assert mock_upsert.await_count == 2
