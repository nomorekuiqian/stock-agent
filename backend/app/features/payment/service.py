"""
Stripe API service - handles Checkout Sessions, Customer Portal, and customer management.
Uses asyncio.to_thread to avoid blocking the event loop with synchronous Stripe SDK calls.
"""

import asyncio
import time

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_MAX_PRICE_ID, FRONTEND_URL
from app.core.logging import get_logger
from app.features.payment.db import get_subscription, upsert_subscription

logger = get_logger(__name__)

stripe.api_key = STRIPE_SECRET_KEY


async def get_or_create_stripe_customer(user_id: str, email: str) -> str:
    """
    Look up existing Stripe customer by user_id metadata, or create a new one.
    Returns the Stripe customer ID.
    """
    t0 = time.time()
    sub = await get_subscription(user_id)
    if sub and sub.get("stripe_customer_id"):
        cid = sub["stripe_customer_id"]
        try:
            await asyncio.to_thread(stripe.Customer.retrieve, cid)
            logger.info("get_customer: cache hit %.2fs", time.time() - t0)
            return cid
        except stripe.InvalidRequestError:
            logger.warning("Cached customer %s not found (live/test mode mismatch), creating new", cid)

    t1 = time.time()
    existing = await asyncio.to_thread(stripe.Customer.list, email=email, limit=1)
    logger.info("Customer.list: %.2fs", time.time() - t1)

    if existing.data:
        customer_id = existing.data[0].id
    else:
        t2 = time.time()
        customer = await asyncio.to_thread(
            stripe.Customer.create, email=email, metadata={"user_id": user_id}
        )
        logger.info("Customer.create: %.2fs", time.time() - t2)
        customer_id = customer.id

    t3 = time.time()
    await upsert_subscription(user_id, stripe_customer_id=customer_id)
    logger.info("upsert customer_id: %.2fs", time.time() - t3)
    logger.info("get_or_create total: %.2fs", time.time() - t0)
    return customer_id


PRICE_ID_MAP = {
    "pro": STRIPE_PRO_PRICE_ID,
    "max": STRIPE_MAX_PRICE_ID,
}


async def create_checkout_session(
    user_id: str, email: str, return_path: str | None = None,
    tier: str = "pro",
) -> str:
    """
    Create a Stripe Checkout Session for Pro or Max subscription.
    Returns the checkout URL.
    """
    price_id = PRICE_ID_MAP.get(tier, STRIPE_PRO_PRICE_ID)
    if not price_id:
        raise ValueError("No Stripe Price ID configured for tier: %s" % tier)

    t0 = time.time()
    customer_id = await get_or_create_stripe_customer(user_id, email)

    path = return_path or "/for-you"

    t1 = time.time()
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/pricing/success?next={path}",
        cancel_url=f"{FRONTEND_URL}{path}?checkout=cancel",
        metadata={"user_id": user_id, "tier": tier},
        subscription_data={"metadata": {"user_id": user_id, "tier": tier}},
    )
    logger.info("Session.create: %.2fs", time.time() - t1)
    logger.info("checkout total: %.2fs (tier=%s)", time.time() - t0, tier)
    return session.url


async def create_portal_session(user_id: str) -> str:
    """
    Create a Stripe Customer Portal session for subscription management.
    Returns the portal URL.
    """
    sub = await get_subscription(user_id)
    if not sub or not sub.get("stripe_customer_id"):
        raise ValueError("No Stripe customer found for this user")

    session = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=sub["stripe_customer_id"],
        return_url=f"{FRONTEND_URL}/for-you",
    )
    return session.url
