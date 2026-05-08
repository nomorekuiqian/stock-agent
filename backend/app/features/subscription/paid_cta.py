"""Paid-user CTA source of truth for daily report emails."""

from __future__ import annotations


# Hand-curated list of actual paying users (post-trial active Stripe + lifetime).
# Provided by the project owner on 2026-05-07; trial users with entitlements are
# excluded because they should still see the upsell CTA.
PAID_DAILY_CTA_EMAILS: set[str] = {
    "kedengpan@gmail.com",
    "wushaoqing1986@gmail.com",
    "jackli9299@gmail.com",
    "sqrt2141@gmail.com",
    "jeanine.rjj@gmail.com",
    "linwenyueonly@outlook.com",
    "xuxy1994@gmail.com",
    "weixiang77@gmail.com",
    "qzhu24@gmail.com",
    "wenyi.wynn@gmail.com",
}


def normalize_email(email: str | None) -> str:
    """Return a lowercase email address for membership checks."""
    return (email or "").strip().lower()


def is_paid_daily_cta_email(email: str | None) -> bool:
    """True when this email should receive the paid-user daily CTA."""
    return normalize_email(email) in PAID_DAILY_CTA_EMAILS
