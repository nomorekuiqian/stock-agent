"""
Payment API endpoints - Stripe Checkout, subscription status, portal, and webhooks.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, Request, HTTPException, Depends

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
from app.core.deps import verify_user_token, verify_cron_secret
from app.features.payment.models import (
    CreateCheckoutRequest,
    CheckoutSessionResponse,
    SubscriptionStatusResponse,
    PortalSessionResponse,
)
from app.core.logging import get_logger
from app.features.payment.service import create_checkout_session, create_portal_session
from app.features.payment.db import get_subscription, upsert_subscription

logger = get_logger(__name__)

stripe.api_key = STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/payment", tags=["payment"])


def _get_period(sub_obj) -> Tuple[Optional[str], Optional[str]]:
    """Extract current_period_start/end from a Stripe subscription object.

    New API versions (2026+) moved these fields from the subscription
    top-level to items.data[*].  Fall back to items when top-level
    keys are absent.
    """
    start_ts = sub_obj.get("current_period_start")
    end_ts = sub_obj.get("current_period_end")

    if start_ts is None or end_ts is None:
        items = sub_obj.get("items", {}).get("data", [])
        if items:
            start_ts = start_ts or items[0].get("current_period_start")
            end_ts = end_ts or items[0].get("current_period_end")

    period_start = (
        datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()
        if start_ts else None
    )
    period_end = (
        datetime.fromtimestamp(end_ts, tz=timezone.utc).isoformat()
        if end_ts else None
    )
    return period_start, period_end


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
async def api_create_checkout(
    req: CreateCheckoutRequest,
    token_user_id: str = Depends(verify_user_token),
):
    """Create a Stripe Checkout Session and return the URL."""
    if req.user_id != token_user_id:
        raise HTTPException(status_code=403, detail="User ID mismatch")
    try:
        url = await create_checkout_session(req.user_id, req.email, req.return_path)
        return CheckoutSessionResponse(checkout_url=url)
    except Exception as e:
        logger.error("Checkout session error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
async def api_subscription_status(user_id: str = Depends(verify_user_token)):
    """Query subscription status for a user."""
    sub = await get_subscription(user_id)
    if not sub:
        return SubscriptionStatusResponse(plan="free", status="none")
    return SubscriptionStatusResponse(
        plan=sub.get("plan", "free"),
        status=sub.get("status", "none"),
        current_period_end=sub.get("current_period_end"),
        access_expires_at=sub.get("access_expires_at"),
    )


@router.post("/portal-session", response_model=PortalSessionResponse)
async def api_portal_session(user_id: str = Depends(verify_user_token)):
    """Create a Stripe Customer Portal session."""
    try:
        url = await create_portal_session(user_id)
        return PortalSessionResponse(portal_url=url)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Portal session error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create portal session")


@router.post("/sync")
async def api_sync_subscription(
    user_id: str,
    email: str,
    _: str = Depends(verify_cron_secret),
):
    """Manually sync subscription from Stripe for a user (admin-only recovery tool)."""
    try:
        # Try DB-stored customer_id first, fall back to email search
        existing = await get_subscription(user_id)
        customer_id = existing.get("stripe_customer_id") if existing else None

        if not customer_id:
            customers = await asyncio.to_thread(stripe.Customer.list, email=email, limit=1)
            if not customers.data:
                return {"synced": False, "reason": "No Stripe customer found"}
            customer_id = customers.data[0].id

        subs = await asyncio.to_thread(
            stripe.Subscription.list, customer=customer_id, status="active", limit=1
        )
        if not subs.data:
            return {"synced": False, "reason": "No active subscription found"}

        sub = subs.data[0]
        period_start, period_end = _get_period(sub)

        await upsert_subscription(
            user_id=user_id,
            stripe_customer_id=customer_id,
            stripe_subscription_id=sub["id"],
            plan="pro",
            status="active",
            current_period_start=period_start,
            current_period_end=period_end,
            clear_access_expires_at=True,
        )
        logger.info("Manual sync: subscription %s for user %s", sub["id"], user_id)
        return {"synced": True, "subscription_id": sub["id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    obj = event["data"]["object"]
    logger.info("Webhook received: %s", event_type)

    if event_type == "checkout.session.completed":
        # CRITICAL: no try/except - let failures propagate so Stripe retries
        user_id = obj.get("metadata", {}).get("user_id")
        sub_id = obj.get("subscription")
        logger.info("checkout.session.completed: user_id=%s, subscription=%s, customer=%s", user_id, sub_id, obj.get("customer"))
        if not user_id or not sub_id:
            logger.warning("checkout.session.completed missing metadata: user_id=%s, sub_id=%s", user_id, sub_id)
        if user_id and sub_id:
            stripe_sub = await asyncio.to_thread(stripe.Subscription.retrieve, sub_id)
            period_start, period_end = _get_period(stripe_sub)
            await upsert_subscription(
                user_id=user_id,
                stripe_customer_id=obj.get("customer"),
                stripe_subscription_id=sub_id,
                plan="pro",
                status="active",
                current_period_start=period_start,
                current_period_end=period_end,
                clear_access_expires_at=True,
            )
            logger.info("Subscription activated for user %s", user_id)

    elif event_type == "customer.subscription.updated":
        try:
            user_id = obj.get("metadata", {}).get("user_id")
            if user_id:
                status = obj.get("status", "active")
                plan = "free" if status in ("canceled", "unpaid") else "pro"
                _, period_end = _get_period(obj)
                await upsert_subscription(
                    user_id=user_id,
                    plan=plan,
                    status=status,
                    current_period_end=period_end,
                    clear_access_expires_at=(plan == "pro"),
                )
                logger.info("Subscription updated for user %s: %s", user_id, status)
        except Exception as e:
            logger.warning("subscription.updated handler failed: %s", e)

    elif event_type == "customer.subscription.deleted":
        try:
            user_id = obj.get("metadata", {}).get("user_id")
            deleted_sub_id = obj.get("id")
            if user_id:
                existing = await get_subscription(user_id)
                stored_sub_id = existing.get("stripe_subscription_id") if existing else None

                if stored_sub_id and stored_sub_id != deleted_sub_id:
                    logger.info("Ignored deletion of old sub %s for user %s (current: %s)", deleted_sub_id, user_id, stored_sub_id)
                else:
                    customer_id = obj.get("customer")
                    has_active = False
                    if customer_id:
                        active_subs = await asyncio.to_thread(
                            stripe.Subscription.list,
                            customer=customer_id, status="active", limit=1,
                        )
                        if active_subs.data:
                            has_active = True
                            active_sub = active_subs.data[0]
                            period_start, period_end = _get_period(active_sub)
                            await upsert_subscription(
                                user_id=user_id,
                                stripe_customer_id=customer_id,
                                stripe_subscription_id=active_sub["id"],
                                plan="pro",
                                status="active",
                                current_period_start=period_start,
                                current_period_end=period_end,
                            )
                            logger.info("Sub %s deleted but user %s has active sub %s, synced pro", deleted_sub_id, user_id, active_sub["id"])

                    if not has_active:
                        await upsert_subscription(
                            user_id=user_id,
                            plan="free",
                            status="canceled",
                        )
                        logger.info("Subscription %s canceled for user %s, no active subs remain", deleted_sub_id, user_id)
        except Exception as e:
            logger.warning("subscription.deleted handler failed: %s", e)

    return {"received": True}
