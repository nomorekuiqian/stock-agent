"""
Twitter Digest segment drift audit.

Twitter Digest is a Max-only, explicit opt-in email channel. This script is
read-only by default and checks that the Resend delivery segment does not
contain users who lack the `twitter_digest` entitlement or who explicitly
turned the channel off in app-side email preferences.

Usage:
    cd backend && source venv/bin/activate
    python scripts/audit_twitter_digest_segment.py
    python scripts/audit_twitter_digest_segment.py --apply
"""

import argparse
import asyncio
import os
import sys
import time
from dataclasses import dataclass
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_SEGMENT_TWITTER_DIGEST,
)
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import get_subscription  # noqa: E402

logger = get_logger(__name__)

RATE_LIMIT_DELAY = 0.55


@dataclass
class TwitterDigestSegmentRow:
    email: str
    user_id: Optional[str]
    entitled: bool
    preference: Optional[bool]
    in_segment: bool

    @property
    def should_remove(self) -> bool:
        return self.in_segment and (not self.entitled or self.preference is False)


def _rate_wait() -> None:
    time.sleep(RATE_LIMIT_DELAY)


async def _list_users() -> list[dict]:
    result = await get_insforge_service().call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_all failed: {payload}")
    return payload.get("data") or []


def _segments_for_email(email: str) -> set[str]:
    _rate_wait()
    try:
        result = resend.ContactSegments.list({"email": email})
    except Exception as e:  # noqa: BLE001
        logger.warning("segments lookup failed for %s: %s", email, e)
        return set()
    return {seg.get("id", "") for seg in result.get("data", []) or []}


async def collect() -> list[TwitterDigestSegmentRow]:
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not set")
    if not RESEND_SEGMENT_TWITTER_DIGEST:
        raise RuntimeError("RESEND_SEGMENT_TWITTER_DIGEST not set")
    resend.api_key = RESEND_API_KEY

    users = await _list_users()
    rows: list[TwitterDigestSegmentRow] = []
    for index, user in enumerate(users, start=1):
        email = (user.get("email") or "").strip().lower()
        user_id = user.get("user_id")
        if not email or not user_id:
            continue

        sub = await get_subscription(user_id)
        entitlements = set((sub or {}).get("entitlements") or [])
        entitled = bool((sub or {}).get("is_lifetime")) or "twitter_digest" in entitlements
        preference = ((sub or {}).get("email_preferences") or {}).get("twitter_digest")
        in_segment = RESEND_SEGMENT_TWITTER_DIGEST in _segments_for_email(email)

        rows.append(
            TwitterDigestSegmentRow(
                email=email,
                user_id=user_id,
                entitled=entitled,
                preference=preference,
                in_segment=in_segment,
            )
        )
        if index % 50 == 0:
            logger.info("processed %d/%d", index, len(users))

    return rows


def summarize(rows: list[TwitterDigestSegmentRow]) -> list[TwitterDigestSegmentRow]:
    to_remove = [row for row in rows if row.should_remove]
    max_users = [row for row in rows if row.entitled]
    opted_in = [row for row in max_users if row.in_segment]
    explicit_opt_out = [row for row in max_users if row.preference is False]

    print("\n=== Twitter Digest Segment Audit ===")
    print(f"Total users checked     : {len(rows)}")
    print(f"Max-entitled users      : {len(max_users)}")
    print(f"Max users in segment    : {len(opted_in)}")
    print(f"Explicit Max opt-outs   : {len(explicit_opt_out)}")
    print(f"Needs removal           : {len(to_remove)}")
    print()

    if to_remove:
        print("Rows to remove:")
        for row in to_remove[:50]:
            reason = "not_entitled" if not row.entitled else "preference_false"
            print(f"  - {row.email:42s} {reason}")
        if len(to_remove) > 50:
            print(f"  ... and {len(to_remove) - 50} more")

    return to_remove


def apply_removals(rows: list[TwitterDigestSegmentRow]) -> int:
    removed = 0
    failed = 0
    for row in rows:
        try:
            _rate_wait()
            resend.ContactSegments.remove(
                {
                    "email": row.email,
                    "segment_id": RESEND_SEGMENT_TWITTER_DIGEST,
                }
            )
            removed += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            logger.warning("remove failed for %s: %s", row.email, e)
    print(f"\nApplied removals: removed={removed} failed={failed}")
    return 0 if failed == 0 else 2


async def main(apply: bool) -> int:
    try:
        rows = await collect()
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    to_remove = summarize(rows)
    if apply and to_remove:
        return apply_removals(to_remove)
    if not apply:
        print("Dry run only. Re-run with --apply to remove drift rows.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Remove non-entitled or explicitly opted-out users from the segment",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(apply=args.apply)))
