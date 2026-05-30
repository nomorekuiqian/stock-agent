"""
Invites Unit Tests -- generated from git diff (2026-05-30)

Tests for: create_trial_subscription Resend segment sync.

The trial creation flow now calls `SubscriptionService.sync_resend_segments`
inline after the DB upsert, because Stripe does not fire the
`entitlements.active_entitlement_summary.updated` webhook for trial-start
events that are created through `default_incomplete` payment_behavior in our
own code path. Without this sync the Max-only segments (morning, weekly,
twitter_digest) would not pick up the new trial user until an unrelated
webhook touched the account.

No network access, no database — Stripe / Insforge / Resend are mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_invites_unit.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def patched_create_trial_deps():
    """Stub out every external collaborator of create_trial_subscription.

    Yields a dict of the most useful mocks so individual tests can assert
    against them.
    """
    with patch(
        "app.features.invites.db.get_subscription", new=AsyncMock(return_value=None)
    ) as get_sub, patch(
        "app.features.invites.db.upsert_subscription",
        new=AsyncMock(return_value=True),
    ) as upsert, patch(
        "app.features.invites.db.get_or_create_stripe_customer",
        new=AsyncMock(return_value="cus_test"),
    ) as customer, patch(
        "app.features.invites.db.STRIPE_SECRET_KEY", "sk_test"
    ), patch(
        "app.features.invites.db.STRIPE_MAX_PRICE_ID", "price_max"
    ), patch(
        "app.features.invites.db.stripe.Subscription.create",
        return_value=MagicMock(to_dict=lambda: {"id": "sub_test", "trial_end": None}),
    ) as stripe_create, patch(
        "app.features.subscription.service.SubscriptionService.sync_resend_segments"
    ) as sync:
        yield {
            "get_sub": get_sub,
            "upsert": upsert,
            "customer": customer,
            "stripe_create": stripe_create,
            "sync": sync,
        }


class TestCreateTrialSubscriptionResendSync:
    """Trial activation must trigger Resend segment sync inline."""

    @pytest.mark.asyncio
    async def test_sync_called_after_successful_trial(
        self, patched_create_trial_deps,
    ):
        """sync_resend_segments fires once with the new trial user email."""
        from app.features.invites.db import create_trial_subscription

        # Make the post-upsert refetch return a Max sub so sync has data
        patched_create_trial_deps["get_sub"].side_effect = [
            None,  # first call: idempotency check
            {  # second call: refetch after upsert
                "user_id": "u1",
                "entitlements": ["twitter_digest", "morning_report_email"],
            },
        ]

        result = await create_trial_subscription(
            user_id="u1", user_email="new@test.com", source="auto_registration",
        )

        assert result["success"] is True
        sync = patched_create_trial_deps["sync"]
        sync.assert_called_once()
        # Positional args: (email, sub_dict)
        args = sync.call_args[0]
        assert args[0] == "new@test.com"
        assert "twitter_digest" in (args[1] or {}).get("entitlements", [])

    @pytest.mark.asyncio
    async def test_sync_failure_does_not_abort_trial(
        self, patched_create_trial_deps,
    ):
        """A Resend outage must not block the user from getting Max access."""
        from app.features.invites.db import create_trial_subscription

        patched_create_trial_deps["get_sub"].side_effect = [
            None,
            {"user_id": "u1", "entitlements": []},
        ]
        patched_create_trial_deps["sync"].side_effect = RuntimeError(
            "resend api down"
        )

        # Must not raise
        result = await create_trial_subscription(
            user_id="u1", user_email="new@test.com", source="auto_registration",
        )

        assert result["success"] is True
        # Stripe sub still written to DB
        patched_create_trial_deps["upsert"].assert_called_once()

    @pytest.mark.asyncio
    async def test_already_active_user_skips_sync(
        self, patched_create_trial_deps,
    ):
        """Idempotency path returns early — no duplicate Resend writes."""
        from app.features.invites.db import create_trial_subscription

        patched_create_trial_deps["get_sub"].return_value = {
            "plan": "max",
            "status": "active",
            "access_expires_at": "2099-01-01T00:00:00+00:00",
            "stripe_subscription_id": "sub_old",
        }
        # side_effect overrides return_value; clear it
        patched_create_trial_deps["get_sub"].side_effect = None

        result = await create_trial_subscription(
            user_id="u1", user_email="existing@test.com", source="invite_redemption",
        )

        assert result["already_active"] is True
        patched_create_trial_deps["sync"].assert_not_called()
        patched_create_trial_deps["upsert"].assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
