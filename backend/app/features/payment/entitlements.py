"""
Entitlements Gateway.

Single source of truth for 'does this user have feature X'.
Reads from Layer 2 (Insforge subscriptions.entitlements column),
which is populated by the entitlements.active_entitlement_summary.updated
webhook from Stripe (Layer 1).
"""
from datetime import datetime, timezone
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
    "portfolio_management",
    "twitter_digest",
}

KOL_PACK_QINBAFRANK = "kol_pack_qinbafrank"

KOL_PACK_FEATURES: Set[str] = {
    KOL_PACK_QINBAFRANK,
}

MAX_FEATURES: Set[str] = PRO_FEATURES | MAX_ONLY_FEATURES
ULTRA_FEATURES: Set[str] = MAX_FEATURES | KOL_PACK_FEATURES
ALL_FEATURES: Set[str] = MAX_FEATURES | KOL_PACK_FEATURES


def _is_access_expired(access_expires_at: str | None) -> bool:
    """True when an invite-trial `access_expires_at` has passed.

    Invite redemptions (AUTO_TRIAL) populate `entitlements` directly because
    no Stripe entitlement summary owns those rows. Once the trial expires, the
    Stripe webhook never fires to clear the array, so we apply the gate at
    read time. Mirrors `_is_access_expired` in quota/service.py and the
    frontend `isExpired` check in SubscriptionContext.tsx.
    """
    if not access_expires_at:
        return False
    try:
        expires = datetime.fromisoformat(access_expires_at.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires <= datetime.now(timezone.utc)


async def has_entitlement(user_id: str, feature: str) -> bool:
    """Check whether a user has access to a feature.

    Reads the entitlements JSONB column from Insforge (Layer 2 cache).
    This column is written exclusively by the Stripe entitlements webhook.

    Lifetime users (is_lifetime=true) bypass the entitlements column and
    always have access to every max feature, even if the column was cleared.
    """
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return False

    if sub.get("is_lifetime"):
        return feature in MAX_FEATURES

    if _is_access_expired(sub.get("access_expires_at")):
        return False

    entitlements = sub.get("entitlements") or []
    return feature in entitlements


async def get_user_entitlements(user_id: str) -> Set[str]:
    """Return the full set of entitlements for /api/me/entitlements.

    Lifetime users always receive the full MAX_FEATURES set.
    """
    from app.features.payment.db import get_subscription

    sub = await get_subscription(user_id)
    if not sub:
        return set()

    if sub.get("is_lifetime"):
        return set(MAX_FEATURES)

    if _is_access_expired(sub.get("access_expires_at")):
        return set()

    return set(sub.get("entitlements") or [])
