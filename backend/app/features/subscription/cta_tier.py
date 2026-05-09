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

    A user is "real paid" when they should see the thank-you CTA instead of
    the upgrade CTA in the daily report email.

    Decision tree:
      1. ``is_lifetime=True`` -> paid (lifetime users always get thank-you).
      2. ``entitlements`` empty -> not paid (free user or expired trial).
      3. ``access_expires_at`` set -> not paid (still in trial window). The
         real paid checkout flow clears this field via
         ``clear_access_expires_at=True`` in payment/router.py; trial flows
         in invites/db.py always set it. So this field is the cleanest
         trial-vs-paid signal even when ``invite_code`` lingers from a
         pre-conversion trial.
      4. Otherwise (entitlements + no access_expires_at) -> real paid.
    """
    if not sub:
        return False
    if sub.get("is_lifetime"):
        return True
    if not sub.get("entitlements"):
        return False
    if sub.get("access_expires_at"):
        return False
    return True
