"""
Entitlements Gateway.

Single source of truth for 'does this user have feature X'.
Reads from Layer 2 (Insforge subscriptions.entitlements column),
which is populated by the entitlements.active_entitlement_summary.updated
webhook from Stripe (Layer 1).
"""
from typing import Set

from app.core.logging import get_logger

logger = get_logger(__name__)

# Feature catalog - kept in sync with Stripe dashboard
PRO_FEATURES: Set[str] = {
    "morning_report_email",
    "weekly_report_email",
    "personal_digest_email",
    "watchlist_extended",
    "today_website",
    "for_you_website",
    "morning_website",
}

MAX_ONLY_FEATURES: Set[str] = {
    "stock_research",
    "ai_research_engine",
}

MAX_FEATURES: Set[str] = PRO_FEATURES | MAX_ONLY_FEATURES
ALL_FEATURES: Set[str] = MAX_FEATURES


async def has_entitlement(user_id: str, feature: str) -> bool:
    """Check whether a user has access to a feature.

    Reads the entitlements JSONB column from Insforge (Layer 2 cache).
    This column is written exclusively by the Stripe entitlements webhook.
    """
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return False

    entitlements = sub.get("entitlements") or []
    return feature in entitlements


async def get_user_entitlements(user_id: str) -> Set[str]:
    """Return the full set of entitlements for /api/me/entitlements."""
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return set()

    return set(sub.get("entitlements") or [])
