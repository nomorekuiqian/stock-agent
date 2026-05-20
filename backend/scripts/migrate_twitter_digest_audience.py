"""One-off migration: copy daily audience contacts into the new Twitter
Digest audience so existing readers stay opted-in.

Background: Twitter Digest used to share the daily audience for delivery
(`RESEND_AUDIENCE_TWITTER_DIGEST` pointed at the daily audience id). We
carved out a dedicated audience + segment so users can opt-out via the
profile page without dropping the daily report. This script preserves the
existing readership by seeding the new audience with everyone currently
subscribed to the daily report.

Idempotent — Resend's "Create contact" returns 200 for duplicate emails
(soft upsert by email). Re-run safely after partial failures; only
already-unsubscribed contacts are skipped.

Usage:
    cd backend
    source venv/bin/activate
    python -m scripts.migrate_twitter_digest_audience
"""

from __future__ import annotations

import os
import sys
import time

import resend  # type: ignore[import]

SOURCE_AUDIENCE_ID = "a0e3508d-894b-4e56-a234-66d277c09916"  # TheMarketBrew Daily
DEST_AUDIENCE_ID = "531ffab6-25d7-4507-bb87-5cf96d56c884"   # TheMarketBrew Twitter Digest
RATE_DELAY = 0.55  # seconds between API calls (Resend cap: 2 req/sec)


def main() -> int:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        print("RESEND_API_KEY not set", file=sys.stderr)
        return 1
    resend.api_key = api_key

    print(f"Listing contacts in {SOURCE_AUDIENCE_ID}...")
    contacts = resend.Contacts.list(audience_id=SOURCE_AUDIENCE_ID)
    data = contacts.get("data", [])
    print(f"Found {len(data)} contacts in source audience.")

    added = 0
    skipped = 0
    failed = 0

    for i, c in enumerate(data, start=1):
        email = c.get("email")
        if not email:
            continue
        if c.get("unsubscribed"):
            # Honor existing unsubscribe — don't drag them into a new audience.
            skipped += 1
            continue

        params = {
            "audience_id": DEST_AUDIENCE_ID,
            "email": email,
            "first_name": c.get("first_name") or "",
            "last_name": c.get("last_name") or "",
            "unsubscribed": False,
        }
        try:
            resend.Contacts.create(params)
            added += 1
            print(f"[{i}/{len(data)}] added {email}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[{i}/{len(data)}] FAIL {email}: {exc}", file=sys.stderr)
        time.sleep(RATE_DELAY)

    print(
        f"\nDone. added={added} skipped={skipped} failed={failed} "
        f"total_source={len(data)}"
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
