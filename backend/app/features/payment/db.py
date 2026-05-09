"""
Payment database operations using Insforge Edge Functions with in-memory cache.
"""

import time
from typing import Optional, Dict, Any

from app.core.database import get_insforge_service

# In-memory cache: user_id -> (data, timestamp)
_sub_cache: Dict[str, tuple] = {}
_CACHE_TTL = 300  # 5 minutes


async def get_subscription(user_id: str) -> Optional[Dict[str, Any]]:
    """Get subscription record by user_id (with cache)."""
    now = time.time()
    cached = _sub_cache.get(user_id)
    if cached and (now - cached[1]) < _CACHE_TTL:
        return cached[0]

    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "get", "user_id": user_id},
    )
    data = result.get("data", {})
    if data.get("success"):
        sub = data.get("data")
        _sub_cache[user_id] = (sub, now)
        return sub

    _sub_cache[user_id] = (None, now)
    return None


def invalidate_subscription_cache(user_id: str) -> None:
    """Remove cached subscription data so next read hits the DB."""
    _sub_cache.pop(user_id, None)


async def upsert_subscription(
    user_id: str,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    plan: Optional[str] = None,
    status: Optional[str] = None,
    current_period_start: Optional[str] = None,
    current_period_end: Optional[str] = None,
    invite_code: Optional[str] = None,
    access_expires_at: Optional[str] = None,
    clear_access_expires_at: bool = False,
    referred_by: Optional[str] = None,
    referral_code: Optional[str] = None,
    referral_count: Optional[int] = None,
    entitlements: Optional[list] = None,
    is_lifetime: Optional[bool] = None,
) -> bool:
    """Insert or update a subscription record.

    Pass clear_access_expires_at=True to explicitly null out the invite trial
    expiry (e.g. when a real Stripe subscription is activated).
    """
    body: Dict[str, Any] = {"user_id": user_id}
    if stripe_customer_id is not None:
        body["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id is not None:
        body["stripe_subscription_id"] = stripe_subscription_id
    if plan is not None:
        body["plan"] = plan
    if status is not None:
        body["status"] = status
    if current_period_start is not None:
        body["current_period_start"] = current_period_start
    if current_period_end is not None:
        body["current_period_end"] = current_period_end
    if invite_code is not None:
        body["invite_code"] = invite_code
    if access_expires_at is not None:
        body["access_expires_at"] = access_expires_at
    elif clear_access_expires_at:
        body["access_expires_at"] = None
    if referred_by is not None:
        body["referred_by"] = referred_by
    if referral_code is not None:
        body["referral_code"] = referral_code
    if referral_count is not None:
        body["referral_count"] = referral_count
    if entitlements is not None:
        body["entitlements"] = entitlements
    if is_lifetime is not None:
        body["is_lifetime"] = is_lifetime

    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="POST",
        params={"action": "upsert"},
        json_body=body,
    )
    data = result.get("data", {})
    success = data.get("success", False)

    # Invalidate cache so next read gets fresh data
    if success:
        invalidate_subscription_cache(user_id)

    return success


async def set_lifetime(
    user_id: str,
    is_lifetime: bool,
    entitlements: Optional[list] = None,
) -> bool:
    """Mark a user as lifetime (or revoke).

    When granting (is_lifetime=True), pass the full max entitlements list so
    the cached column stays consistent with the lifetime flag.

    On success, also pushes the new state to Resend so the daily report
    paid/free CTA segment membership reflects the change. Lifetime grants
    bypass Stripe webhooks entirely, so this is the only place that can
    trigger Resend sync for lifetime transitions.
    """
    body: Dict[str, Any] = {"user_id": user_id, "is_lifetime": is_lifetime}
    if entitlements is not None:
        body["entitlements"] = entitlements

    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="POST",
        params={"action": "set_lifetime"},
        json_body=body,
    )
    data = result.get("data", {})
    success = data.get("success", False)
    if not success:
        return False

    invalidate_subscription_cache(user_id)

    # Resend sync — lifetime is the one path Stripe webhooks never see.
    try:
        import asyncio
        from app.features.subscription.service import SubscriptionService

        email = await get_user_email_by_id(user_id)
        if email:
            fresh_sub = await get_subscription(user_id)
            await asyncio.to_thread(
                SubscriptionService().sync_resend_segments, email, fresh_sub
            )
    except Exception as e:
        from app.core.logging import get_logger
        get_logger(__name__).warning(
            "set_lifetime: Resend sync failed for user %s: %s",
            user_id[:8] if user_id else "?",
            e,
        )

    return True


async def list_entitled_users(feature: str) -> list:
    """List all users who have a specific entitlement."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_entitled", "feature": feature},
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data", [])
    return []


async def get_user_email_by_id(user_id: str) -> Optional[str]:
    """Look up a user's email by their Insforge user_id.

    Reuses the existing ``list_user_profiles`` edge function action and
    filters in Python — acceptable because callers (lifetime grants,
    drift-audit fixups) are rare and the user list is bounded.
    """
    if not user_id:
        return None
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {})
    if not data.get("success"):
        return None
    for profile in data.get("data", []):
        if profile.get("user_id") == user_id:
            return profile.get("email")
    return None


async def get_subscription_by_customer(stripe_customer_id: str) -> Optional[Dict[str, Any]]:
    """Get subscription by stripe_customer_id."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "get_by_customer", "stripe_customer_id": stripe_customer_id},
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data")
    return None
