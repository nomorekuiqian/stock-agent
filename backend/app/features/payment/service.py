"""
Stripe API service - handles Checkout Sessions, Customer Portal, customer
management, and Stripe entitlement reconciliation.
Uses asyncio.to_thread to avoid blocking the event loop with synchronous Stripe SDK calls.
"""

import asyncio
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_MAX_PRICE_ID, FRONTEND_URL
from app.core.logging import get_logger
from app.features.payment.db import (
    get_subscription,
    get_subscription_by_customer,
    get_user_email_by_id,
    list_expired_access_grants,
    upsert_subscription,
)

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


def _to_dict(obj):
    """Convert Stripe objects to plain dicts."""
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _extract_entitlement_lookup_key(entitlement) -> str:
    """Read feature lookup_key across Stripe API response shapes."""
    ent = _to_dict(entitlement) or {}
    feature = _to_dict(ent.get("feature")) if ent.get("feature") is not None else None
    if isinstance(feature, dict):
        key = feature.get("lookup_key")
        if key:
            return key
    return ent.get("lookup_key", "") or ""


def _normalize_entitlements(raw_feature_keys: list[str]) -> tuple[str, str, list[str]]:
    """Map Stripe feature keys into the app's canonical tier catalog.

    Stripe determines the tier, but code owns the full feature set for each
    tier so older subscriptions get newly-added product features.
    """
    from app.features.payment.entitlements import MAX_FEATURES, MAX_ONLY_FEATURES, PRO_FEATURES

    has_max_feature = any(feature in MAX_ONLY_FEATURES for feature in raw_feature_keys)
    if has_max_feature:
        return "max", "active", sorted(MAX_FEATURES)
    if raw_feature_keys:
        return "pro", "active", sorted(PRO_FEATURES)
    return "free", "canceled", []


async def _list_active_entitlements(customer_id: str) -> list:
    """Return all active entitlements for a Stripe customer."""
    entitlements: list = []
    params = {"customer": customer_id, "limit": 100}

    while True:
        response = await asyncio.to_thread(
            stripe.entitlements.ActiveEntitlement.list,
            **params,
        )
        data = _to_dict(response) or {}
        page = data.get("data", []) or []
        entitlements.extend(page)

        if not data.get("has_more"):
            break
        if not page:
            break
        last_id = (_to_dict(page[-1]) or {}).get("id")
        if not last_id:
            break
        params["starting_after"] = last_id

    return entitlements


async def sync_entitlements_from_stripe(
    customer_id: str,
    *,
    user_id: str | None = None,
    sub_record: dict | None = None,
    customer_email: str | None = None,
    allow_empty: bool = True,
    source: str = "unknown",
) -> dict:
    """Reconcile Stripe Active Entitlements into ``subscriptions``.

    ``allow_empty=False`` is for compensating calls from checkout/subscription
    events where Stripe may not have materialized entitlements yet. The
    entitlement webhook itself passes ``allow_empty=True`` because an empty list
    there is the authoritative de-provision signal.
    """
    if not customer_id:
        return {"synced": False, "reason": "missing_customer"}

    if sub_record is None:
        sub_record = await get_subscription_by_customer(customer_id)
    if not sub_record:
        logger.warning("entitlement sync skipped: unknown customer %s source=%s", customer_id, source)
        return {"synced": False, "reason": "unknown_customer"}

    user_id = user_id or sub_record.get("user_id")
    if not user_id:
        logger.warning("entitlement sync skipped: missing user_id customer=%s source=%s", customer_id, source)
        return {"synced": False, "reason": "missing_user_id"}

    if sub_record.get("is_lifetime"):
        logger.info("entitlement sync skipped for lifetime user %s source=%s", user_id, source)
        return {"synced": False, "reason": "lifetime"}

    entitlements = await _list_active_entitlements(customer_id)
    raw_feature_keys = sorted({
        key for key in (
            _extract_entitlement_lookup_key(ent) for ent in entitlements
        )
        if key
    })

    if not raw_feature_keys and not allow_empty:
        logger.info(
            "entitlement sync skipped empty result: user=%s customer=%s source=%s",
            user_id[:8],
            customer_id,
            source,
        )
        return {"synced": False, "reason": "empty_entitlements"}

    plan, status, feature_keys = _normalize_entitlements(raw_feature_keys)

    await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        plan=plan,
        status=status,
        entitlements=feature_keys,
        clear_access_expires_at=True,
    )

    try:
        from app.features.subscription.service import SubscriptionService

        email = customer_email
        if not email:
            customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
            email = (_to_dict(customer) or {}).get("email")
        if email:
            fresh_sub = await get_subscription(user_id)
            await asyncio.to_thread(
                SubscriptionService().sync_resend_segments,
                email,
                fresh_sub,
            )
    except Exception as e:
        logger.warning(
            "entitlement sync: Resend sync failed user=%s source=%s: %s",
            user_id[:8],
            source,
            e,
        )

    logger.info(
        "entitlements synced: user=%s plan=%s features=%s source=%s",
        user_id[:8],
        plan,
        feature_keys,
        source,
    )
    return {
        "synced": True,
        "user_id": user_id,
        "plan": plan,
        "status": status,
        "entitlements": feature_keys,
        "raw_entitlements": raw_feature_keys,
    }


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def reconcile_expired_access_grants(now: datetime | None = None) -> dict:
    """Expire non-Stripe grants whose ``access_expires_at`` has passed.

    Read-time entitlement checks remain the safety boundary. This job keeps the
    single ``subscriptions`` table, frontend profile display, and Resend
    segments tidy after an admin/trial grant naturally expires.
    """
    now_dt = now or datetime.now(timezone.utc)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    rows = await list_expired_access_grants(now_dt.isoformat())

    processed = 0
    expired = 0
    skipped = 0
    errors: list[dict] = []

    for row in rows:
        processed += 1
        user_id = row.get("user_id")
        if not user_id:
            skipped += 1
            continue
        if row.get("is_lifetime"):
            skipped += 1
            continue
        expires_at = _parse_iso_datetime(row.get("access_expires_at"))
        if not expires_at or expires_at > now_dt:
            skipped += 1
            continue
        if row.get("plan") == "free" and not (row.get("entitlements") or []):
            skipped += 1
            continue

        try:
            ok = await upsert_subscription(
                user_id=user_id,
                plan="free",
                status="expired",
                entitlements=[],
            )
            if not ok:
                errors.append({"user_id": user_id, "error": "upsert_failed"})
                continue
            expired += 1

            try:
                from app.features.subscription.service import SubscriptionService

                email = await get_user_email_by_id(user_id)
                if email:
                    fresh_sub = await get_subscription(user_id)
                    await asyncio.to_thread(
                        SubscriptionService().sync_resend_segments,
                        email,
                        fresh_sub,
                    )
            except Exception as e:
                logger.warning(
                    "expired grant Resend sync failed user=%s: %s",
                    user_id[:8],
                    e,
                )
        except Exception as e:
            logger.exception("expired grant reconciliation failed user=%s", user_id[:8])
            errors.append({"user_id": user_id, "error": str(e)})

    return {
        "success": not errors,
        "processed": processed,
        "expired": expired,
        "skipped": skipped,
        "errors": errors,
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
    success_params = urlencode({
        "checkout": "success",
        "tier": tier,
        "next": path,
    })

    t1 = time.time()
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/pricing/success?{success_params}",
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
