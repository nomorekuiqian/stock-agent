"""Backfill Resend `first_name` from Insforge auth profile name.

Walks configured Resend contact lists (morning, evening, weekly, twitter
digest audience, daily free/paid CTA), finds contacts whose `first_name` is
blank, and updates them from the Insforge auth profile name.

Why this is needed
------------------
Many of our Resend contacts were created via API calls that did not pass
`first_name`. The email broadcast templates use Resend merge tags
(`{{{FIRST_NAME}}}`) to greet users by name — when first_name is empty,
Resend falls back to a generic value (or empty string) so the greeting reads
"Hi " instead of "Hi Daniel".

This script is idempotent and safe to re-run. Contacts that already have a
first_name are skipped. Contacts whose email is not in the Insforge user list
(pure mailing-list signups with no account) are also skipped.

Usage
-----
    cd backend && source venv/bin/activate
    python scripts/backfill_resend_first_names.py                       # dry run
    python scripts/backfill_resend_first_names.py --apply               # execute
    python scripts/backfill_resend_first_names.py --segments morning,weekly --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_AUDIENCE_TWITTER_DIGEST,
    RESEND_SEGMENT_MORNING,
    RESEND_SEGMENT_EVENING,
    RESEND_SEGMENT_WEEKLY,
    RESEND_SEGMENT_DAILY_FREE_CTA,
    RESEND_SEGMENT_DAILY_PAID_CTA,
)
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

RATE_DELAY = 0.55

# label -> contact-list/audience id. Order matters only for printed output.
ALL_CONTACT_LISTS: dict[str, str] = {
    "morning": RESEND_SEGMENT_MORNING,
    "evening": RESEND_SEGMENT_EVENING,
    "weekly": RESEND_SEGMENT_WEEKLY,
    "twitter_digest": RESEND_AUDIENCE_TWITTER_DIGEST,
    "daily_free_cta": RESEND_SEGMENT_DAILY_FREE_CTA,
    "daily_paid_cta": RESEND_SEGMENT_DAILY_PAID_CTA,
}


async def _build_name_map() -> dict[str, str]:
    """email (lowercased) -> Insforge auth profile name."""
    result = await get_insforge_service().call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
        timeout=120.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_user_profiles failed: {payload}")
    out: dict[str, str] = {}
    for p in payload.get("data") or []:
        email = (p.get("email") or "").strip().lower()
        name = (p.get("profile_name") or "").strip()
        if email and name:
            out[email] = name
    return out


def _list_contacts(audience_id: str) -> list[dict]:
    time.sleep(RATE_DELAY)
    result = resend.Contacts.list(audience_id=audience_id)
    return list(result.get("data") or [])


def _update_first_name(
    audience_id: str, contact_id: str, email: str, first_name: str
) -> None:
    """Update first_name. Prefers the global-contact path (id only, no
    audience_id). Falls back to (audience_id, email) for older contacts whose
    row pre-dates the global API.
    """
    time.sleep(RATE_DELAY)
    if contact_id:
        try:
            resend.Contacts.update({"id": contact_id, "first_name": first_name})
            return
        except Exception:
            time.sleep(RATE_DELAY)
    resend.Contacts.update({
        "audience_id": audience_id,
        "email": email,
        "first_name": first_name,
    })


def _process_segment(
    label: str,
    audience_id: str,
    name_map: dict[str, str],
    apply: bool,
) -> tuple[int, int, int, int]:
    """Returns (already_had_name, updated, no_profile_name, failed)."""
    if not audience_id:
        print(f"  [{label}] skipped: env not configured")
        return (0, 0, 0, 0)

    contacts = _list_contacts(audience_id)
    already = 0
    updated = 0
    no_profile = 0
    failed = 0

    for c in contacts:
        email = (c.get("email") or "").strip().lower()
        if not email:
            continue
        if c.get("unsubscribed"):
            # Resend already excludes these from broadcasts. No point
            # updating profile data for someone who won't receive anything.
            continue
        if (c.get("first_name") or "").strip():
            already += 1
            continue
        name = name_map.get(email)
        if not name:
            no_profile += 1
            continue
        if not apply:
            updated += 1
            continue
        try:
            _update_first_name(audience_id, c.get("id") or "", email, name)
            updated += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            logger.warning("[%s] update failed for %s: %s", label, email, e)

    print(
        f"  [{label:14s}] total={len(contacts):4d}  "
        f"had_name={already:4d}  would_update={updated:4d}  "
        f"no_profile={no_profile:4d}  failed={failed:4d}"
    )
    return (already, updated, no_profile, failed)


async def main(args: argparse.Namespace) -> int:
    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not configured", file=sys.stderr)
        return 1
    resend.api_key = RESEND_API_KEY

    if args.segments:
        wanted = {s.strip() for s in args.segments.split(",") if s.strip()}
        unknown = wanted - set(ALL_CONTACT_LISTS.keys())
        if unknown:
            print(f"ERROR: unknown contact-list labels: {unknown}", file=sys.stderr)
            print(f"Available: {sorted(ALL_CONTACT_LISTS.keys())}", file=sys.stderr)
            return 1
        targets = {k: v for k, v in ALL_CONTACT_LISTS.items() if k in wanted}
    else:
        targets = ALL_CONTACT_LISTS

    print(f"Building name map from Insforge...")
    name_map = await _build_name_map()
    print(f"  loaded {len(name_map)} users with a profile name\n")

    print(f"Processing segments (apply={args.apply}):")
    totals = [0, 0, 0, 0]
    for label, audience_id in targets.items():
        a, u, n, f = _process_segment(label, audience_id, name_map, args.apply)
        totals = [totals[0]+a, totals[1]+u, totals[2]+n, totals[3]+f]

    print()
    print("=" * 60)
    print(f"TOTALS: had_name={totals[0]}  "
          f"{'updated' if args.apply else 'would_update'}={totals[1]}  "
          f"no_profile={totals[2]}  failed={totals[3]}")
    if not args.apply:
        print("\nDry run only. Re-run with --apply to write to Resend.")
    return 0 if totals[3] == 0 else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Actually update Resend contacts (default: dry run)")
    parser.add_argument("--segments", default=None,
                        help="Comma-separated subset (e.g. morning,weekly)")
    sys.exit(asyncio.run(main(parser.parse_args())))
