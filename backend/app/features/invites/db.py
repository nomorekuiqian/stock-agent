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
from app.features.payment.db import upsert_subscription
from app.features.payment.entitlements import MAX_FEATURES
from app.features.payment.service import get_or_create_stripe_customer

logger = get_logger(__name__)

stripe.api_key = STRIPE_SECRET_KEY


async def redeem_code(
    user_id: str,
    user_email: str,
    code: str,
    valid_codes: list[str],
    access_days: int = 14,
) -> Dict[str, Any]:
    """Redeem invite code by creating a Stripe Max trial subscription.

    Stripe is the single source of truth. The trial subscription triggers
    webhooks that update Layer 2 (Insforge entitlements) and Layer 3
    (Resend segments) automatically. We also write to DB directly for
    immediate availability (webhook may arrive with slight delay).

    If Stripe is not configured or fails, returns an error — no silent
    fallback to direct DB write, as that would bypass Stripe and cause
    the trial to never auto-expire.
    """
    code_upper = code.strip().upper()
    is_valid = code_upper in [c.strip().upper() for c in valid_codes]
    if not is_valid:
        return {"success": False, "error": "invalid_code"}

    if not STRIPE_SECRET_KEY or not STRIPE_MAX_PRICE_ID:
        logger.error("redeem_code: STRIPE_SECRET_KEY or STRIPE_MAX_PRICE_ID not configured")
        return {"success": False, "error": "payment_not_configured"}

    # Ensure Stripe Customer exists
    customer_id = await get_or_create_stripe_customer(user_id, user_email)

    # Create trial subscription (no payment method required)
    subscription = await asyncio.to_thread(
        stripe.Subscription.create,
        customer=customer_id,
        items=[{"price": STRIPE_MAX_PRICE_ID}],
        trial_period_days=access_days,
        trial_settings={
            "end_behavior": {"missing_payment_method": "cancel"}
        },
        payment_behavior="default_incomplete",
        metadata={
            "user_id": user_id,
            "tier": "max",
            "source": "invite_redemption",
            "invite_code": code_upper,
        },
    )
    sub_dict = (
        subscription.to_dict()
        if hasattr(subscription, "to_dict")
        else dict(subscription)
    )

    trial_end = sub_dict.get("trial_end")
    access_expires_at = (
        datetime.fromtimestamp(trial_end, tz=timezone.utc).isoformat()
        if trial_end
        else (datetime.now(timezone.utc) + timedelta(days=access_days)).isoformat()
    )

    # Write to DB for immediate availability (webhook confirms later)
    await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        stripe_subscription_id=sub_dict.get("id"),
        plan="max",
        status="active",
        invite_code=code_upper,
        access_expires_at=access_expires_at,
        current_period_end=access_expires_at,
        entitlements=sorted(MAX_FEATURES),
    )

    logger.info(
        "Invite redeemed via Stripe trial: user=%s sub=%s trial_end=%s",
        user_id[:8], sub_dict.get("id"), access_expires_at[:10],
    )

    return {
        "success": True,
        "access_expires_at": access_expires_at,
        "subscription_id": sub_dict.get("id"),
    }


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
