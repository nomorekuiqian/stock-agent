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
      2. ``entitlements`` empty -> not paid (free user or fully-downgraded).
      3. Otherwise -> paid.

    Note: ``access_expires_at`` was a trial signal in the pre-freemium model.
    It is intentionally not checked here — any user with entitlements is
    treated as paid, including the few remaining users on the legacy auto
    trial during the transition window. See
    ``docs/plans/active/freemium-lifecycle-email.md`` ("用户状态分类与处理").
    """
    if not sub:
        return False
    if sub.get("is_lifetime"):
        return True
    if not sub.get("entitlements"):
        return False
    return True
