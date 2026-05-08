"""
One-time migration: populate daily CTA sending lists.

This does not remove anyone from ``TheMarketBrew Daily``. That list remains the
source of truth for who subscribes to the evening daily report. The two CTA
lists only decide which bottom section a subscriber receives:

- Daily Free CTA: free users + trial users receive the upgrade CTA.
- Daily Paid CTA: actual paying users receive the thank-you CTA.

Usage:
    cd backend && source venv/bin/activate
    python scripts/migrate_daily_segment_split.py --dry-run
    python scripts/migrate_daily_segment_split.py
"""

from __future__ import annotations

import argparse
import os
import sys
import warnings

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_SEGMENT_DAILY_FREE_CTA,
    RESEND_SEGMENT_DAILY_PAID_CTA,
    RESEND_SEGMENT_EVENING,
)
from app.core.logging import get_logger  # noqa: E402
from app.features.subscription.paid_cta import (  # noqa: E402
    PAID_DAILY_CTA_EMAILS,
    is_paid_daily_cta_email,
)
from app.features.subscription.service import _rate_limit_wait  # noqa: E402

logger = get_logger(__name__)


def _active_daily_emails() -> list[str]:
    _rate_limit_wait()
    contacts = resend.Contacts.list(audience_id=RESEND_SEGMENT_EVENING)
    emails: list[str] = []
    for contact in contacts.get("data", []):
        if contact.get("unsubscribed"):
            continue
        email = (contact.get("email") or "").strip().lower()
        if email:
            emails.append(email)
    return sorted(set(emails))


def _add(email: str, segment_id: str, dry_run: bool, label: str) -> bool:
    if dry_run:
        logger.info("[dry-run] add %s -> %s", email, label)
        return True
    try:
        _rate_limit_wait()
        resend.ContactSegments.add({"email": email, "segment_id": segment_id})
        return True
    except Exception as e:
        logger.warning("FAILED add %s -> %s: %s", email, label, e)
        return False


def _remove(email: str, segment_id: str, dry_run: bool, label: str) -> bool:
    if dry_run:
        logger.info("[dry-run] remove %s from %s", email, label)
        return True
    try:
        _rate_limit_wait()
        resend.ContactSegments.remove({"email": email, "segment_id": segment_id})
        return True
    except Exception as e:
        if "Audience not found in contact's audience list" in str(e):
            return True
        logger.warning("FAILED remove %s from %s: %s", email, label, e)
        return False


def main(dry_run: bool) -> int:
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY not configured")
        return 1
    if not RESEND_SEGMENT_EVENING:
        logger.error("RESEND_SEGMENT_EVENING not configured")
        return 1
    if not RESEND_SEGMENT_DAILY_FREE_CTA or not RESEND_SEGMENT_DAILY_PAID_CTA:
        logger.error("Daily CTA segment IDs are not configured")
        return 1

    resend.api_key = RESEND_API_KEY
    warnings.filterwarnings("ignore", category=DeprecationWarning)

    daily_emails = set(_active_daily_emails())
    paid_emails = {email for email in PAID_DAILY_CTA_EMAILS if email in daily_emails}
    missing_paid = sorted(PAID_DAILY_CTA_EMAILS - daily_emails)

    logger.info("Active daily subscribers: %d", len(daily_emails))
    logger.info("Paid CTA subscribers found in Daily: %d", len(paid_emails))
    if missing_paid:
        logger.warning("Paid emails not found in Daily: %s", missing_paid)

    added_free = added_paid = removed_free = removed_paid = failures = 0

    for email in sorted(daily_emails):
        if is_paid_daily_cta_email(email):
            if _add(email, RESEND_SEGMENT_DAILY_PAID_CTA, dry_run, "Daily Paid CTA"):
                added_paid += 1
            else:
                failures += 1
            if _remove(email, RESEND_SEGMENT_DAILY_FREE_CTA, dry_run, "Daily Free CTA"):
                removed_free += 1
            else:
                failures += 1
        else:
            if _add(email, RESEND_SEGMENT_DAILY_FREE_CTA, dry_run, "Daily Free CTA"):
                added_free += 1
            else:
                failures += 1
            if _remove(email, RESEND_SEGMENT_DAILY_PAID_CTA, dry_run, "Daily Paid CTA"):
                removed_paid += 1
            else:
                failures += 1

    logger.info("Summary:")
    logger.info("  added to Daily Free CTA:  %d", added_free)
    logger.info("  added to Daily Paid CTA:  %d", added_paid)
    logger.info("  removed from Free CTA:    %d", removed_free)
    logger.info("  removed from Paid CTA:    %d", removed_paid)
    logger.info("  failures:                 %d", failures)

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.exit(main(args.dry_run))
