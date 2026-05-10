"""
One-off backfill: enroll every Pro user in the Weekly segment.

Triggered when the Weekly segment was deleted on Resend and rebuilt — Stripe
webhooks only fire on entitlement changes, so we need a manual sweep to
re-attach existing Pro users.

Source of truth: ``list_entitled_users("weekly_report_email")`` from
Insforge (RPC). Anyone in that list should be in RESEND_SEGMENT_WEEKLY.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/enroll_pro_weekly.py            # dry-run (default)
    python scripts/enroll_pro_weekly.py --apply    # actually write to Resend

Idempotent: re-running after partial completion just no-ops the already-added
contacts.
"""

import argparse
import asyncio
import os
import sys
import time
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import RESEND_API_KEY, RESEND_SEGMENT_WEEKLY  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import list_entitled_users  # noqa: E402

logger = get_logger(__name__)

RATE_LIMIT_DELAY = 0.55  # Resend allows 2 req/s


def _rate_wait() -> None:
    time.sleep(RATE_LIMIT_DELAY)


def _add_to_weekly(email: str, segment_id: str) -> tuple[bool, Optional[str]]:
    """Add one email to the weekly segment. Returns (added, error_msg).

    "added" means a successful API call; "already in" still counts as added
    because the end-state is correct.
    """
    try:
        _rate_wait()
        resend.ContactSegments.add({"email": email, "segment_id": segment_id})
        return True, None
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower():
            return True, None
        return False, msg


async def main(apply: bool) -> int:
    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set", file=sys.stderr)
        return 1
    if not RESEND_SEGMENT_WEEKLY:
        print("ERROR: RESEND_SEGMENT_WEEKLY not set", file=sys.stderr)
        return 1

    resend.api_key = RESEND_API_KEY

    print(f"Target segment: {RESEND_SEGMENT_WEEKLY}")
    print(f"Mode: {'APPLY' if apply else 'DRY-RUN'}")
    print()
    print("Fetching entitled Pro users from Insforge...")
    rows = await list_entitled_users("weekly_report_email")
    print(f"  found {len(rows)} users with weekly_report_email entitlement")

    valid = [r for r in rows if r.get("email")]
    if len(valid) != len(rows):
        print(f"  skipping {len(rows) - len(valid)} rows with no email")
    print()

    if not apply:
        eta = int(len(valid) * RATE_LIMIT_DELAY)
        print(f"DRY-RUN — would enroll {len(valid)} users (~{eta}s with rate limit).")
        print("Re-run with --apply to actually write.")
        return 0

    added = 0
    errors = 0
    error_samples: list[str] = []

    for i, row in enumerate(valid, start=1):
        email = row["email"]
        ok, err = _add_to_weekly(email, RESEND_SEGMENT_WEEKLY)
        if ok:
            added += 1
        else:
            errors += 1
            if len(error_samples) < 5:
                error_samples.append(f"{email}: {err}")

        if i % 25 == 0 or i == len(valid):
            print(f"  progress: {i}/{len(valid)} (added={added}, errors={errors})")

    print()
    print("Done.")
    print(f"  added (incl. already-in):  {added}")
    print(f"  errors:                    {errors}")
    if error_samples:
        print("  first errors:")
        for s in error_samples:
            print(f"    {s}")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write to Resend (otherwise dry-run)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(apply=args.apply)))
