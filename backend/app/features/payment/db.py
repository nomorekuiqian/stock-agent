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
