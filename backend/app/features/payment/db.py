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
) -> bool:
    """Insert or update a subscription record."""
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
