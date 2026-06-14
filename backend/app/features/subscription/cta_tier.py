"""Daily report CTA tier classification — single source of truth.

Replaces the hand-curated whitelist in ``paid_cta.py`` with a pure function
that derives "is real paid?" from the subscription record. Used by
``service.py`` to route users into ``RESEND_SEGMENT_DAILY_FREE_CTA`` or
``RESEND_SEGMENT_DAILY_PAID_CTA``.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional


def is_real_paid_sub(sub: Optional[Mapping[str, Any]]) -> bool:
    """Whether this subscription belongs in DAILY_PAID_CTA segment.

    Decision tree:
      1. ``is_lifetime=True`` -> paid.
      2. ``access_expires_at`` set -> not paid (grant/trial window).
      3. ``status`` must be ``active`` and ``stripe_subscription_id`` present.
      4. ``entitlements`` must be non-empty.

    This is intentionally stricter than entitlement access. Non-Stripe grants
    may carry paid features for the app, but they belong in the free/trial CTA
    bucket rather than the real-paid bucket.
    """
    if not sub:
        return False
    if sub.get("is_lifetime"):
        return True
    if sub.get("access_expires_at"):
        return False
    if sub.get("status") != "active":
        return False
    if not sub.get("stripe_subscription_id"):
        return False
    if not sub.get("entitlements"):
        return False
    return True
