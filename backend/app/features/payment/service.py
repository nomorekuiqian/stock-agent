"""
Stripe API service - handles Checkout Sessions, Customer Portal, customer
management, and Stripe entitlement reconciliation.
Uses asyncio.to_thread to avoid blocking the event loop with synchronous Stripe SDK calls.
"""

import asyncio
import re
import time
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import stripe

from app.core.config import (
    ALLOWED_ORIGINS,
    CORS_ALLOWED_ORIGIN_REGEX,
    FRONTEND_URL,
    STRIPE_MAX_PRICE_ID,
    STRIPE_PRO_PRICE_ID,
    STRIPE_SECRET_KEY,
    STRIPE_ULTRA_PRICE_ID,
)
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
    "ultra": STRIPE_ULTRA_PRICE_ID,
}

PRICE_LOOKUP_KEY_MAP = {
    "ultra": "themarketbrew_ultra_monthly",
}

_RESOLVED_PRICE_ID_CACHE: dict[tuple[str, str], str] = {}
UPGRADE_PORTAL_PRORATION_BEHAVIOR = "always_invoice"
_UPGRADE_PORTAL_CONFIGURATION_CACHE: dict[str, str] = {}

LEGACY_CREATOR_MAX_QINBAFRANK_PRODUCT = "creator_max_qinbafrank"
CHECKOUT_PRODUCT_ALIASES = {
    LEGACY_CREATOR_MAX_QINBAFRANK_PRODUCT: "ultra",
}

CHECKOUT_TIERS = frozenset(PRICE_ID_MAP)


def normalize_checkout_product(product: str | None, tier: str = "pro") -> str:
    """Resolve tier-based requests and legacy product aliases."""
    candidate = product or tier
    candidate = CHECKOUT_PRODUCT_ALIASES.get(candidate, candidate)
    if candidate in CHECKOUT_TIERS:
        return candidate
    raise ValueError("Invalid checkout product: %s" % candidate)


def product_plan(product: str) -> str:
    return normalize_checkout_product(product, product)


def price_id_for_product(product: str, billing_interval: str = "monthly") -> str:
    if billing_interval != "monthly":
        return ""
    return PRICE_ID_MAP.get(product, "")


async def resolve_price_id_for_product(product: str, billing_interval: str = "monthly") -> str:
    """Resolve a Stripe Price ID from env, then fallback to a Dashboard lookup key."""
    configured = price_id_for_product(product, billing_interval)
    if configured:
        return configured

    lookup_key = PRICE_LOOKUP_KEY_MAP.get(product)
    if not lookup_key or billing_interval != "monthly":
        return ""

    cache_key = (product, billing_interval)
    if cache_key in _RESOLVED_PRICE_ID_CACHE:
        return _RESOLVED_PRICE_ID_CACHE[cache_key]

    try:
        response = await asyncio.to_thread(
            stripe.Price.list,
            lookup_keys=[lookup_key],
            active=True,
            limit=1,
        )
    except Exception as e:
        logger.warning("Stripe price lookup failed for product=%s: %s", product, e)
        return ""

    data = _to_dict(response) or {}
    prices = data.get("data", []) or []
    if not prices:
        logger.warning(
            "Stripe price lookup returned no active price for product=%s lookup_key=%s",
            product,
            lookup_key,
        )
        return ""

    price_id = (_to_dict(prices[0]) or {}).get("id", "")
    if price_id:
        _RESOLVED_PRICE_ID_CACHE[cache_key] = price_id
    return price_id


def _normalize_return_path(return_path: str | None, default: str = "/for-you") -> str:
    if not return_path or not return_path.startswith("/") or return_path.startswith("//"):
        return default
    return return_path[:512]


def _normalize_origin(origin: str | None) -> str:
    if not origin:
        return ""
    parsed = urlsplit(origin.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        return ""
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _safe_frontend_origin(origin: str | None = None) -> str:
    """Pick a trusted frontend origin for Stripe return URLs."""
    fallback = _normalize_origin(FRONTEND_URL) or "http://localhost:3000"
    candidate = _normalize_origin(origin)
    if not candidate:
        return fallback

    allowed = {_normalize_origin(item) for item in ALLOWED_ORIGINS}
    allowed.add(fallback)
    if candidate in allowed:
        return candidate

    if CORS_ALLOWED_ORIGIN_REGEX and re.fullmatch(CORS_ALLOWED_ORIGIN_REGEX, candidate):
        return candidate

    return fallback


def _frontend_url(
    path: str,
    extra_params: dict[str, str] | None = None,
    frontend_origin: str | None = None,
) -> str:
    safe_path = _normalize_return_path(path)
    parts = urlsplit(safe_path)
    query = parse_qsl(parts.query, keep_blank_values=True)
    if extra_params:
        query.extend(extra_params.items())
    path_with_query = urlunsplit(("", "", parts.path or "/", urlencode(query), parts.fragment))
    return "%s%s" % (_safe_frontend_origin(frontend_origin), path_with_query)


def _canonical_features_for_plan(plan: str) -> list[str]:
    from app.features.payment.entitlements import (
        MAX_FEATURES,
        PRO_FEATURES,
        ULTRA_FEATURES,
    )

    if plan == "ultra":
        return sorted(ULTRA_FEATURES)
    if plan == "max":
        return sorted(MAX_FEATURES)
    if plan == "pro":
        return sorted(PRO_FEATURES)
    return []


def _is_active_subscription_status(status: str | None) -> bool:
    return status in ("active", "trialing")


def _preserve_local_ultra_when_subscription_active(
    sub_record: dict | None,
    plan: str,
    status: str | None,
    feature_keys: list[str],
) -> tuple[str, list[str]]:
    """Keep DB-migrated Ultra users on Ultra while their Stripe sub is active.

    Grandfathered Max users stay on their current Stripe price, so Stripe can
    still report the subscription as Max. Once the app DB has been migrated to
    Ultra, active/trialing Stripe syncs must not downgrade them back to Max.
    Non-active subscription states still de-provision normally.
    """
    if plan == "ultra" or not _is_active_subscription_status(status):
        return plan, feature_keys
    if not sub_record or sub_record.get("plan") != "ultra":
        return plan, feature_keys
    if not _is_active_subscription_status(sub_record.get("status")):
        return plan, feature_keys

    from app.features.payment.entitlements import KOL_PACK_FEATURES, ULTRA_FEATURES

    existing_entitlements = set(sub_record.get("entitlements") or [])
    if not existing_entitlements.intersection(KOL_PACK_FEATURES):
        return plan, feature_keys

    return "ultra", sorted(ULTRA_FEATURES)


def resolve_plan_from_subscription(sub_obj) -> str:
    """Determine plan tier from a Stripe subscription object."""
    d = _to_dict(sub_obj) or {}
    items = _to_dict(d.get("items")) or {}
    for item in items.get("data", []) or []:
        item_d = _to_dict(item) or {}
        price = _to_dict(item_d.get("price")) or {}
        price_id = price.get("id", "")
        lookup_key = price.get("lookup_key", "")
        if price_id and price_id == PRICE_ID_MAP.get("ultra"):
            return "ultra"
        if lookup_key and lookup_key == PRICE_LOOKUP_KEY_MAP.get("ultra"):
            return "ultra"
        if price_id and price_id == PRICE_ID_MAP.get("max"):
            return "max"
        if price_id and price_id == PRICE_ID_MAP.get("pro"):
            return "pro"

    metadata = d.get("metadata", {}) or {}
    tier = metadata.get("tier")
    if tier in ("pro", "max", "ultra"):
        return tier
    product = metadata.get("product")
    if product:
        return product_plan(product)

    return "pro"


def _get_subscription_period(sub_obj) -> tuple[str | None, str | None]:
    d = _to_dict(sub_obj) or {}
    start_ts = d.get("current_period_start")
    end_ts = d.get("current_period_end")

    if start_ts is None or end_ts is None:
        items = _to_dict(d.get("items")) or {}
        items_data = items.get("data", []) or []
        if items_data:
            item = _to_dict(items_data[0]) or {}
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


def _stripe_timestamp_to_iso(value) -> str | None:
    """Convert Stripe timestamp-like values to ISO datetimes."""
    if value in (None, ""):
        return None
    if isinstance(value, str):
        if not value.isdigit():
            return value
        value = int(value)
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def _get_subscription_cancellation(sub_obj) -> tuple[bool, str | None, str | None]:
    """Extract scheduled/immediate cancellation fields from a Stripe subscription."""
    d = _to_dict(sub_obj) or {}
    return (
        bool(d.get("cancel_at_period_end")),
        _stripe_timestamp_to_iso(d.get("cancel_at")),
        _stripe_timestamp_to_iso(d.get("canceled_at")),
    )


def _first_subscription_item(sub_obj) -> dict | None:
    d = _to_dict(sub_obj) or {}
    items = _to_dict(d.get("items")) or {}
    data = items.get("data", []) or []
    if not data:
        return None
    return _to_dict(data[0]) or None


async def _retrieve_subscription(subscription_id: str):
    return await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id,
        expand=["items.data.price"],
    )


async def _find_active_subscription_for_customer(customer_id: str):
    response = await asyncio.to_thread(
        stripe.Subscription.list,
        customer=customer_id,
        status="all",
        limit=10,
        expand=["data.items.data.price"],
    )
    data = _to_dict(response) or {}
    for sub in data.get("data", []) or []:
        sub_d = _to_dict(sub) or {}
        if _is_active_subscription_status(sub_d.get("status")):
            return sub
    return None


async def sync_subscription_from_stripe(
    user_id: str,
    *,
    customer_id: str | None = None,
    subscription_id: str | None = None,
    stripe_subscription=None,
    customer_email: str | None = None,
    source: str = "unknown",
) -> dict:
    """Refresh local subscription state from Stripe Subscription + catalog."""
    sub_record = await get_subscription(user_id)
    if sub_record and sub_record.get("is_lifetime"):
        logger.info("subscription sync skipped for lifetime user %s source=%s", user_id, source)
        return {"synced": False, "reason": "lifetime"}

    customer_id = customer_id or (sub_record or {}).get("stripe_customer_id")
    subscription_id = subscription_id or (sub_record or {}).get("stripe_subscription_id")

    if stripe_subscription is None:
        if subscription_id:
            stripe_subscription = await _retrieve_subscription(subscription_id)
        elif customer_id:
            stripe_subscription = await _find_active_subscription_for_customer(customer_id)

    if stripe_subscription is None:
        return {"synced": False, "reason": "missing_subscription"}

    sub_d = _to_dict(stripe_subscription) or {}
    status = sub_d.get("status", "active")
    customer_id = customer_id or sub_d.get("customer")
    subscription_id = sub_d.get("id") or subscription_id
    plan = resolve_plan_from_subscription(sub_d)
    period_start, period_end = _get_subscription_period(sub_d)
    cancel_at_period_end, cancel_at, canceled_at = _get_subscription_cancellation(sub_d)
    feature_keys = _canonical_features_for_plan(plan) if _is_active_subscription_status(status) else []
    plan, feature_keys = _preserve_local_ultra_when_subscription_active(
        sub_record,
        plan,
        status,
        feature_keys,
    )

    await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        plan=plan if feature_keys else "free",
        status=status,
        current_period_start=period_start,
        current_period_end=period_end,
        cancel_at_period_end=cancel_at_period_end,
        cancel_at=cancel_at,
        canceled_at=canceled_at,
        clear_cancel_at=cancel_at is None,
        clear_canceled_at=canceled_at is None,
        entitlements=feature_keys,
        clear_access_expires_at=True,
    )

    if customer_id and feature_keys:
        try:
            await sync_entitlements_from_stripe(
                customer_id,
                user_id=user_id,
                customer_email=customer_email,
                allow_empty=False,
                source=source,
            )
        except Exception as e:
            logger.warning(
                "subscription sync entitlement reconciliation failed user=%s source=%s: %s",
                user_id[:8],
                source,
                e,
            )

    logger.info(
        "subscription synced: user=%s plan=%s status=%s source=%s",
        user_id[:8],
        plan,
        status,
        source,
    )
    return {
        "synced": True,
        "user_id": user_id,
        "customer_id": customer_id,
        "subscription_id": subscription_id,
        "plan": plan if feature_keys else "free",
        "status": status,
        "entitlements": feature_keys,
    }


def _to_dict(obj):
    """Convert Stripe objects to plain dicts."""
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _subscription_update_feature(config: dict) -> dict:
    features = config.get("features") or {}
    return features.get("subscription_update") or {}


def _supports_subscription_price_update(config: dict) -> bool:
    update = _subscription_update_feature(config)
    if not update.get("enabled"):
        return False
    allowed_updates = set(update.get("default_allowed_updates") or [])
    return not allowed_updates or "price" in allowed_updates


def _upgrade_portal_configuration_cache_key() -> str:
    key_mode = "live" if STRIPE_SECRET_KEY.startswith(("sk_live", "rk_live")) else "test"
    return key_mode


async def _ensure_upgrade_portal_configuration_id() -> str:
    """Return a Billing Portal configuration that immediately invoices prorations.

    Stripe Portal controls upgrade proration through the Customer Portal
    configuration, not per-session flow_data. For paid-tier upgrades we require
    `always_invoice` so users pay the prorated difference now instead of getting
    a pending invoice item at the next renewal.
    """
    cache_key = _upgrade_portal_configuration_cache_key()
    cached = _UPGRADE_PORTAL_CONFIGURATION_CACHE.get(cache_key)
    if cached:
        return cached

    response = await asyncio.to_thread(
        stripe.billing_portal.Configuration.list,
        limit=100,
    )
    configs = [
        _to_dict(config) or {}
        for config in (_to_dict(response) or {}).get("data", []) or []
        if (_to_dict(config) or {}).get("active")
    ]
    upgrade_configs = [
        config for config in configs if _supports_subscription_price_update(config)
    ]
    ready_configs = [
        config for config in upgrade_configs
        if _subscription_update_feature(config).get("proration_behavior")
        == UPGRADE_PORTAL_PRORATION_BEHAVIOR
    ]
    chosen = next((config for config in ready_configs if config.get("is_default")), None)
    chosen = chosen or (ready_configs[0] if ready_configs else None)
    if chosen and chosen.get("id"):
        _UPGRADE_PORTAL_CONFIGURATION_CACHE[cache_key] = chosen["id"]
        return chosen["id"]

    target = next((config for config in upgrade_configs if config.get("is_default")), None)
    target = target or (upgrade_configs[0] if upgrade_configs else None)
    if not target or not target.get("id"):
        raise RuntimeError("No active Billing Portal configuration allows subscription price updates")

    updated = await asyncio.to_thread(
        stripe.billing_portal.Configuration.modify,
        target["id"],
        features={
            "subscription_update": {
                "proration_behavior": UPGRADE_PORTAL_PRORATION_BEHAVIOR,
            }
        },
    )
    updated_dict = _to_dict(updated) or {}
    updated_feature = _subscription_update_feature(updated_dict)
    if updated_feature.get("proration_behavior") != UPGRADE_PORTAL_PRORATION_BEHAVIOR:
        raise RuntimeError("Billing Portal configuration did not persist always_invoice proration")

    config_id = updated_dict.get("id") or target["id"]
    _UPGRADE_PORTAL_CONFIGURATION_CACHE[cache_key] = config_id
    logger.info(
        "Billing Portal upgrade configuration ready: id=%s proration_behavior=%s",
        config_id,
        UPGRADE_PORTAL_PRORATION_BEHAVIOR,
    )
    return config_id


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
    from app.features.payment.entitlements import (
        KOL_PACK_QINBAFRANK,
        MAX_FEATURES,
        MAX_ONLY_FEATURES,
        PRO_FEATURES,
        ULTRA_FEATURES,
    )

    if KOL_PACK_QINBAFRANK in raw_feature_keys:
        return "ultra", "active", sorted(ULTRA_FEATURES)
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
    plan, feature_keys = _preserve_local_ultra_when_subscription_active(
        sub_record,
        plan,
        status,
        feature_keys,
    )

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
    product: str | None = None,
    billing_interval: str = "monthly",
    frontend_origin: str | None = None,
) -> str:
    """
    Create a Stripe Checkout Session for Pro, Max, or Ultra subscription.
    Returns the checkout URL.
    """
    checkout_product = normalize_checkout_product(product, tier)
    plan = product_plan(checkout_product)
    price_id = await resolve_price_id_for_product(checkout_product, billing_interval)
    if not price_id:
        raise ValueError("No Stripe Price ID configured for product: %s" % checkout_product)

    t0 = time.time()
    customer_id = await get_or_create_stripe_customer(user_id, email)

    path = _normalize_return_path(return_path)
    success_params = urlencode({
        "checkout": "success",
        "tier": plan,
        "product": checkout_product,
        "next": path,
    })
    frontend_base_url = _safe_frontend_origin(frontend_origin)
    success_url = (
        f"{frontend_base_url}/pricing/success?"
        f"{success_params}&session_id={{CHECKOUT_SESSION_ID}}"
    )

    t1 = time.time()
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=_frontend_url(path, {"checkout": "cancel"}, frontend_origin),
        metadata={
            "user_id": user_id,
            "tier": plan,
            "product": checkout_product,
            "billing_interval": "monthly",
        },
        subscription_data={
            "metadata": {
                "user_id": user_id,
                "tier": plan,
                "product": checkout_product,
                "billing_interval": "monthly",
            }
        },
    )
    logger.info("Session.create: %.2fs", time.time() - t1)
    logger.info("checkout total: %.2fs (product=%s plan=%s)", time.time() - t0, checkout_product, plan)
    return session.url


async def complete_checkout_session(user_id: str, session_id: str) -> dict:
    """Verify a completed Checkout Session and sync local subscription state."""
    session = await asyncio.to_thread(
        stripe.checkout.Session.retrieve,
        session_id,
        expand=["subscription.items.data.price"],
    )
    session_d = _to_dict(session) or {}
    metadata = session_d.get("metadata", {}) or {}
    if metadata.get("user_id") != user_id:
        raise ValueError("Checkout session does not belong to this user")
    if session_d.get("mode") != "subscription":
        raise ValueError("Checkout session is not a subscription")
    if session_d.get("status") != "complete":
        return {"synced": False, "reason": "checkout_incomplete"}

    subscription = session_d.get("subscription")
    subscription_id = (
        (_to_dict(subscription) or {}).get("id")
        if not isinstance(subscription, str)
        else subscription
    )
    customer = session_d.get("customer")
    customer_id = (
        (_to_dict(customer) or {}).get("id")
        if not isinstance(customer, str)
        else customer
    )
    if not subscription_id:
        raise ValueError("Checkout session has no subscription")

    customer_email = (
        (_to_dict(session_d.get("customer_details")) or {}).get("email")
        or session_d.get("customer_email")
    )
    return await sync_subscription_from_stripe(
        user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        stripe_subscription=subscription if not isinstance(subscription, str) else None,
        customer_email=customer_email,
        source="checkout.success.return",
    )


async def create_portal_session(
    user_id: str,
    return_path: str | None = None,
    product: str | None = None,
    billing_interval: str = "monthly",
    frontend_origin: str | None = None,
) -> str:
    """
    Create a Stripe Customer Portal session for subscription management.
    Returns the portal URL.
    """
    sub = await get_subscription(user_id)
    if not sub or not sub.get("stripe_customer_id"):
        raise ValueError("No Stripe customer found for this user")

    safe_return_path = _normalize_return_path(return_path)
    return_url = _frontend_url(safe_return_path, frontend_origin=frontend_origin)
    portal_kwargs = {
        "customer": sub["stripe_customer_id"],
        "return_url": return_url,
    }

    if product:
        checkout_product = normalize_checkout_product(product, product)
        plan = product_plan(checkout_product)
        price_id = await resolve_price_id_for_product(checkout_product, billing_interval)
        if not price_id:
            raise ValueError("No Stripe Price ID configured for product: %s" % checkout_product)
        subscription_id = sub.get("stripe_subscription_id")
        if subscription_id:
            stripe_sub = await _retrieve_subscription(subscription_id)
            item = _first_subscription_item(stripe_sub)
            item_id = item.get("id") if item else None
            if item_id:
                portal_kwargs["configuration"] = await _ensure_upgrade_portal_configuration_id()
                success_params = urlencode({
                    "checkout": "success",
                    "tier": plan,
                    "product": checkout_product,
                    "next": safe_return_path,
                })
                frontend_base_url = _safe_frontend_origin(frontend_origin)
                portal_kwargs["flow_data"] = {
                    "type": "subscription_update_confirm",
                    "subscription_update_confirm": {
                        "subscription": subscription_id,
                        "items": [{
                            "id": item_id,
                            "price": price_id,
                            "quantity": item.get("quantity") or 1,
                        }],
                    },
                    "after_completion": {
                        "type": "redirect",
                        "redirect": {
                            "return_url": f"{frontend_base_url}/pricing/success?{success_params}",
                        },
                    },
                }

    try:
        session = await asyncio.to_thread(
            stripe.billing_portal.Session.create,
            **portal_kwargs,
        )
    except stripe.InvalidRequestError as e:
        if "flow_data" not in portal_kwargs:
            raise
        logger.warning(
            "Portal subscription update flow unavailable for user=%s: %s",
            user_id[:8],
            e,
        )
        raise
    return session.url
