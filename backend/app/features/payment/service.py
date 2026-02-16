"""
Stripe API service - handles Checkout Sessions, Customer Portal, and customer management.
Uses asyncio.to_thread to avoid blocking the event loop with synchronous Stripe SDK calls.
"""

import asyncio
import time

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, FRONTEND_URL
from app.features.payment.db import get_subscription, upsert_subscription

stripe.api_key = STRIPE_SECRET_KEY


async def get_or_create_stripe_customer(user_id: str, email: str) -> str:
    """
    Look up existing Stripe customer by user_id metadata, or create a new one.
    Returns the Stripe customer ID.
    """
    t0 = time.time()
    sub = await get_subscription(user_id)
    if sub and sub.get("stripe_customer_id"):
        print(f"[Payment] get_customer: cache hit {time.time()-t0:.2f}s")
        return sub["stripe_customer_id"]

    t1 = time.time()
    existing = await asyncio.to_thread(stripe.Customer.list, email=email, limit=1)
    print(f"[Payment] Customer.list: {time.time()-t1:.2f}s")

    if existing.data:
        customer_id = existing.data[0].id
    else:
        t2 = time.time()
        customer = await asyncio.to_thread(
            stripe.Customer.create, email=email, metadata={"user_id": user_id}
        )
        print(f"[Payment] Customer.create: {time.time()-t2:.2f}s")
        customer_id = customer.id

    t3 = time.time()
    await upsert_subscription(user_id, stripe_customer_id=customer_id)
    print(f"[Payment] upsert customer_id: {time.time()-t3:.2f}s")
    print(f"[Payment] get_or_create total: {time.time()-t0:.2f}s")
    return customer_id


async def create_checkout_session(
    user_id: str, email: str, return_path: str | None = None
) -> str:
    """
    Create a Stripe Checkout Session for Pro subscription.
    Returns the checkout URL.
    """
    t0 = time.time()
    customer_id = await get_or_create_stripe_customer(user_id, email)

    path = return_path or "/for-you"

    t1 = time.time()
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": STRIPE_PRO_PRICE_ID, "quantity": 1}],
        success_url=f"{FRONTEND_URL}{path}?checkout=success",
        cancel_url=f"{FRONTEND_URL}{path}?checkout=cancel",
        metadata={"user_id": user_id},
        subscription_data={"metadata": {"user_id": user_id}},
    )
    print(f"[Payment] Session.create: {time.time()-t1:.2f}s")
    print(f"[Payment] checkout total: {time.time()-t0:.2f}s")
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
