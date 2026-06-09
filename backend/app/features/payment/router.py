"""
Payment API endpoints - Stripe Checkout, subscription status, portal, and webhooks.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_MAX_PRICE_ID
from app.core.deps import verify_user_token, verify_cron_secret
from app.features.payment.models import (
    CreateCheckoutRequest,
    CheckoutSessionResponse,
    SubscriptionStatusResponse,
    PortalSessionResponse,
)
from app.core.logging import get_logger
from app.features.payment.service import (
    create_checkout_session,
    create_portal_session,
    reconcile_expired_access_grants,
    sync_entitlements_from_stripe,
)
from app.features.payment.db import (
    get_subscription,
    invalidate_subscription_cache,
    upsert_subscription,
)

logger = get_logger(__name__)

import app.core.posthog_client as posthog

stripe.api_key = STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/payment", tags=["payment"])


def _resolve_plan_from_subscription(sub_obj) -> str:
    """Determine plan tier ('pro' or 'max') from a Stripe subscription object.

    Checks metadata.tier first, then falls back to matching price IDs.
    """
    d = _to_dict(sub_obj)
    tier = d.get("metadata", {}).get("tier")
    if tier in ("pro", "max"):
        return tier

    items = d.get("items", {})
    if hasattr(items, "to_dict"):
        items = items.to_dict()
    for item in items.get("data", []):
        item_d = _to_dict(item)
        price = item_d.get("price", {})
        if hasattr(price, "to_dict"):
            price = price.to_dict()
        price_id = price.get("id", "")
        if price_id == STRIPE_MAX_PRICE_ID:
            return "max"
        if price_id == STRIPE_PRO_PRICE_ID:
            return "pro"

    return "pro"


def _to_dict(obj):
    """Convert Stripe object to dict if needed (SDK v15 compat)."""
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _get_period(sub_obj) -> Tuple[Optional[str], Optional[str]]:
    """Extract current_period_start/end from a Stripe subscription object.

    New API versions (2026+) moved these fields from the subscription
    top-level to items.data[*].  Fall back to items when top-level
    keys are absent.
    """
    d = _to_dict(sub_obj)
    start_ts = d.get("current_period_start")
    end_ts = d.get("current_period_end")

    if start_ts is None or end_ts is None:
        items = d.get("items", {})
        if hasattr(items, "to_dict"):
            items = items.to_dict()
        items_data = items.get("data", [])
        if items_data:
            item = _to_dict(items_data[0])
            start_ts = start_ts or item.get("current_period_start")
            end_ts = end_ts or item.get("current_period_end")

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
    if req.tier not in ("pro", "max"):
        raise HTTPException(status_code=400, detail="Invalid tier, must be 'pro' or 'max'")
    try:
        url = await create_checkout_session(req.user_id, req.email, req.return_path, req.tier)
        if posthog.posthog_client:
            posthog.posthog_client.capture(
                distinct_id=token_user_id,
                event="checkout_initiated",
                properties={"tier": req.tier},
            )
        return CheckoutSessionResponse(checkout_url=url)
    except Exception as e:
        logger.error("Checkout session error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
async def api_subscription_status(
    fresh: bool = False,
    user_id: str = Depends(verify_user_token),
):
    """Query subscription status for a user."""
    if fresh:
        invalidate_subscription_cache(user_id)
    sub = await get_subscription(user_id)
    if not sub:
        return SubscriptionStatusResponse(plan="free", status="none")
    return SubscriptionStatusResponse(
        plan=sub.get("plan", "free"),
        status=sub.get("status", "none"),
        current_period_end=sub.get("current_period_end"),
        access_expires_at=sub.get("access_expires_at"),
    )


@router.get("/me/entitlements")
async def api_my_entitlements(
    fresh: bool = False,
    user_id: str = Depends(verify_user_token),
):
    """Return the current user's feature entitlement set and trial eligibility."""
    from app.features.payment.entitlements import get_user_entitlements

    if fresh:
        invalidate_subscription_cache(user_id)
    ents = await get_user_entitlements(user_id)
    # trial_eligible: user has no subscription record yet (never used trial or paid)
    sub = await get_subscription(user_id)
    return {
        "entitlements": sorted(ents),
        "trial_eligible": sub is None,
    }


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


@router.post("/reconcile-expired-grants")
async def api_reconcile_expired_grants(
    _: str = Depends(verify_cron_secret),
):
    """Expire non-Stripe grants whose access_expires_at has passed."""
    return await reconcile_expired_access_grants()


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
    # Stripe SDK v15 StripeObject no longer has .get() — convert to dict
    if hasattr(obj, "to_dict"):
        obj = obj.to_dict()
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
            plan = _resolve_plan_from_subscription(stripe_sub)
            await upsert_subscription(
                user_id=user_id,
                stripe_customer_id=obj.get("customer"),
                stripe_subscription_id=sub_id,
                plan=plan,
                status="active",
                current_period_start=period_start,
                current_period_end=period_end,
                clear_access_expires_at=True,
            )
            await sync_entitlements_from_stripe(
                obj.get("customer"),
                user_id=user_id,
                allow_empty=False,
                source="checkout.session.completed",
            )
            logger.info("Subscription activated for user %s (plan=%s)", user_id, plan)
            if posthog.posthog_client:
                posthog.posthog_client.set(
                    distinct_id=user_id,
                    properties={"plan": plan},
                )
                posthog.posthog_client.capture(
                    distinct_id=user_id,
                    event="subscription_activated",
                    properties={"plan": plan},
                )

    elif event_type == "customer.subscription.updated":
        # Identity sync first; entitlement sync below is a non-destructive
        # compensation path for webhook ordering or delivery gaps.
        try:
            user_id = obj.get("metadata", {}).get("user_id")
            if user_id:
                existing = await get_subscription(user_id)
                if existing and existing.get("is_lifetime"):
                    logger.info("Skipped subscription.updated for lifetime user %s", user_id)
                    return {"received": True}
                status = obj.get("status", "active")
                _, period_end = _get_period(obj)
                customer_id = obj.get("customer")
                await upsert_subscription(
                    user_id=user_id,
                    stripe_customer_id=customer_id,
                    stripe_subscription_id=obj.get("id"),
                    status=status,
                    current_period_end=period_end,
                )
                if customer_id:
                    await sync_entitlements_from_stripe(
                        customer_id,
                        user_id=user_id,
                        sub_record=existing,
                        allow_empty=False,
                        source="customer.subscription.updated",
                    )
                logger.info("Subscription identity updated for user %s: status=%s", user_id, status)
        except Exception as e:
            logger.exception("subscription.updated handler failed")
            return JSONResponse(
                status_code=502,
                content={"error": "subscription.updated sync failed"},
            )

    elif event_type == "customer.subscription.deleted":
        try:
            user_id = obj.get("metadata", {}).get("user_id")
            deleted_sub_id = obj.get("id")
            if user_id:
                existing = await get_subscription(user_id)
                if existing and existing.get("is_lifetime"):
                    logger.info("Skipped subscription.deleted for lifetime user %s (sub %s)", user_id, deleted_sub_id)
                    return {"received": True}
                stored_sub_id = existing.get("stripe_subscription_id") if existing else None

                if stored_sub_id and stored_sub_id != deleted_sub_id:
                    logger.info("Ignored deletion of old sub %s for user %s (current: %s)", deleted_sub_id, user_id, stored_sub_id)
                else:
                    customer_id = obj.get("customer")
                    has_active = False
                    if customer_id:
                        active_subs = await asyncio.to_thread(
                            stripe.Subscription.list,
                            customer=customer_id, status="all", limit=10,
                        )
                        active_candidates = [
                            sub for sub in active_subs.data
                            if _to_dict(sub).get("status") in ("active", "trialing")
                        ]
                        if active_candidates:
                            has_active = True
                            active_sub = active_candidates[0]
                            period_start, period_end = _get_period(active_sub)
                            active_plan = _resolve_plan_from_subscription(active_sub)
                            await upsert_subscription(
                                user_id=user_id,
                                stripe_customer_id=customer_id,
                                stripe_subscription_id=active_sub["id"],
                                plan=active_plan,
                                status="active",
                                current_period_start=period_start,
                                current_period_end=period_end,
                                clear_access_expires_at=True,
                            )
                            logger.info("Sub %s deleted but user %s has active sub %s, synced pro", deleted_sub_id, user_id, active_sub["id"])

                    if not has_active:
                        await upsert_subscription(
                            user_id=user_id,
                            plan="free",
                            status="canceled",
                            entitlements=[],
                            clear_access_expires_at=True,
                        )
                        logger.info("Subscription %s canceled for user %s, no active subs remain", deleted_sub_id, user_id)
                        if posthog.posthog_client:
                            posthog.posthog_client.capture(
                                distinct_id=user_id,
                                event="subscription_canceled",
                                properties={},
                            )

                # Entitlement sync defends against the entitlement webhook
                # missing or arriving out of order. Falls back to direct Resend
                # sync when Stripe entitlement lookup is unavailable.
                synced = False
                customer_id = obj.get("customer")
                try:
                    if customer_id:
                        result = await sync_entitlements_from_stripe(
                            customer_id,
                            user_id=user_id,
                            allow_empty=True,
                            source="customer.subscription.deleted",
                        )
                        synced = bool(result.get("synced"))
                except Exception as entitlement_err:
                    logger.warning(
                        "subscription.deleted: entitlement sync failed: %s",
                        entitlement_err,
                    )
                if not synced:
                    try:
                        if customer_id:
                            customer = await asyncio.to_thread(
                                stripe.Customer.retrieve, customer_id
                            )
                            email = _to_dict(customer).get("email")
                            if email:
                                from app.features.subscription.service import SubscriptionService
                                fresh_sub = await get_subscription(user_id)
                                await asyncio.to_thread(
                                    SubscriptionService().sync_resend_segments,
                                    email,
                                    fresh_sub,
                                )
                    except Exception as resend_err:
                        logger.warning(
                            "subscription.deleted: Resend sync failed: %s", resend_err
                        )
        except Exception as e:
            logger.exception("subscription.deleted handler failed")
            return JSONResponse(
                status_code=502,
                content={"error": "subscription.deleted sync failed"},
            )

    elif event_type == "entitlements.active_entitlement_summary.updated":
        customer_id = obj.get("customer")
        if not customer_id:
            logger.warning("entitlements webhook missing customer id")
            return {"received": True}

        try:
            await sync_entitlements_from_stripe(
                customer_id,
                allow_empty=True,
                source="entitlements.active_entitlement_summary.updated",
            )
        except Exception as e:
            logger.error(
                "entitlements webhook: sync failed for customer %s: %s",
                customer_id, e,
            )
            return JSONResponse(
                status_code=502,
                content={"error": "Stripe entitlements sync failed"},
            )

    return {"received": True}
