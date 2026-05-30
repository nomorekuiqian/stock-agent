"""
Invite code operations — creates Stripe Trial Subscriptions.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_MAX_PRICE_ID
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.payment.db import get_subscription, upsert_subscription
from app.features.payment.entitlements import MAX_FEATURES
from app.features.payment.service import get_or_create_stripe_customer

logger = get_logger(__name__)

stripe.api_key = STRIPE_SECRET_KEY


async def create_trial_subscription(
    user_id: str,
    user_email: str,
    source: str,
    days: int = 14,
) -> Dict[str, Any]:
    """Create a Stripe Max trial subscription for a user.

    Shared logic used by both invite redemption and auto-trial flows.

    Idempotency: if the user already has an active pro/max subscription,
    returns early with existing data instead of creating a duplicate.

    If Stripe is not configured or fails, falls back to a direct DB write
    with stripe_pending=true so the user gets immediate access while Stripe
    can be reconciled later.

    Returns dict with: success, access_expires_at, subscription_id,
    stripe_pending, already_active.
    """
    # -- Idempotency: skip if user already has any subscription record --
    # This prevents expired/canceled users from getting repeated free trials.
    existing = await get_subscription(user_id)
    if existing:
        plan = existing.get("plan")
        if plan in ("pro", "max"):
            logger.info(
                "create_trial_subscription: user %s already has %s subscription (status=%s), skipping",
                user_id[:8], plan, existing.get("status"),
            )
            return {
                "success": True,
                "access_expires_at": existing.get("access_expires_at"),
                "subscription_id": existing.get("stripe_subscription_id"),
                "stripe_pending": False,
                "already_active": True,
            }

    invite_code = "AUTO_TRIAL" if source == "auto_registration" else source

    # -- Try Stripe trial creation --
    stripe_pending = False
    subscription_id = None
    access_expires_at = (
        datetime.now(timezone.utc) + timedelta(days=days)
    ).isoformat()

    try:
        # If Stripe is not configured, we immediately trigger the exception block
        if not STRIPE_SECRET_KEY or not STRIPE_MAX_PRICE_ID:
            raise ValueError("STRIPE_SECRET_KEY or STRIPE_MAX_PRICE_ID not configured")

        customer_id = await get_or_create_stripe_customer(user_id, user_email)

        subscription = await asyncio.to_thread(
            stripe.Subscription.create,
            customer=customer_id,
            items=[{"price": STRIPE_MAX_PRICE_ID}],
            trial_period_days=days,
            trial_settings={
                "end_behavior": {"missing_payment_method": "cancel"}
            },
            payment_behavior="default_incomplete",
            metadata={
                "user_id": user_id,
                "tier": "max",
                "source": source,
                "invite_code": invite_code,
            },
        )
        sub_dict = (
            subscription.to_dict()
            if hasattr(subscription, "to_dict")
            else dict(subscription)
        )

        subscription_id = sub_dict.get("id")
        trial_end = sub_dict.get("trial_end")
        if trial_end:
            access_expires_at = datetime.fromtimestamp(
                trial_end, tz=timezone.utc
            ).isoformat()

    except Exception:
        logger.exception(
            "create_trial_subscription: Stripe failed for user %s, "
            "falling back to direct DB write",
            user_id[:8],
        )
        stripe_pending = True
        customer_id = None

    # -- Write to DB for immediate availability --
    await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id if not stripe_pending else None,
        stripe_subscription_id=subscription_id,
        plan="max",
        status="active",
        invite_code=invite_code,
        access_expires_at=access_expires_at,
        current_period_end=access_expires_at,
        entitlements=sorted(MAX_FEATURES),
    )

    # Resend segment sync — trial activation bypasses the Stripe
    # `entitlements.active_entitlement_summary.updated` webhook (no real
    # subscription update event fires), so the Max-only segments
    # (morning, weekly, twitter_digest) would not pick up the new user
    # until the next webhook unrelated to this account. Mirror the
    # set_lifetime() pattern and trigger sync inline.
    try:
        from app.features.subscription.service import SubscriptionService

        fresh_sub = await get_subscription(user_id)
        await asyncio.to_thread(
            SubscriptionService().sync_resend_segments, user_email, fresh_sub
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "create_trial_subscription: Resend sync failed for user %s: %s",
            user_id[:8], e,
        )

    logger.info(
        "Trial subscription created: user=%s sub=%s source=%s stripe_pending=%s expires=%s",
        user_id[:8], subscription_id, source, stripe_pending,
        access_expires_at[:10],
    )

    return {
        "success": True,
        "access_expires_at": access_expires_at,
        "subscription_id": subscription_id,
        "stripe_pending": stripe_pending,
        "already_active": False,
    }


async def redeem_code(
    user_id: str,
    user_email: str,
    code: str,
    valid_codes: list[str],
    access_days: int = 14,
) -> Dict[str, Any]:
    """Redeem invite code by creating a Stripe Max trial subscription.

    Validates the invite code, then delegates to create_trial_subscription()
    for the actual Stripe trial creation and DB write.
    """
    code_upper = code.strip().upper()
    is_valid = code_upper in [c.strip().upper() for c in valid_codes]
    if not is_valid:
        return {"success": False, "error": "invalid_code"}

    result = await create_trial_subscription(
        user_id=user_id,
        user_email=user_email,
        source="invite_redemption",
        days=access_days,
    )

    # If the shared function wrote invite_code as the source label,
    # update with the actual invite code for tracking.
    if result.get("success") and not result.get("already_active"):
        await upsert_subscription(
            user_id=user_id,
            invite_code=code_upper,
        )

    return result


async def save_qualify_response(
    background: str,
    markets: list[str],
    trading_style: list[str],
    pain_points: list[str],
    feedback: str,
    email: str,
) -> bool:
    """Store questionnaire response in access_requests table."""
    service = get_insforge_service()
    result = await service.call_function(
        "access-requests",
        method="POST",
        params={"action": "insert"},
        json_body={
            "background": background,
            "markets": markets or [],
            "trading_style": trading_style or [],
            "pain_points": pain_points or [],
            "feedback": feedback or None,
            "email": email or None,
        },
    )
    data = result.get("data", {})
    return bool(data.get("success"))
