"""One-shot: seed the Twitter Digest segment from a CSV of (email, user_id).

Reads ~/Desktop/twitter_digest_eligible.csv (header: email,user_id), ensures
each contact exists in RESEND_AUDIENCE_TWITTER_DIGEST, then adds it to
RESEND_SEGMENT_TWITTER_DIGEST.

For each user_id we also fetch the Insforge auth profile name and pass it as
Resend's `first_name`, which the broadcast template's `{{{FIRST_NAME}}}` merge
tag substitutes per recipient. Without this the "Hi {name}" greeting on the
twitter digest email renders as an empty/default string.

Idempotent: Resend's create returns 200 for duplicate emails (soft upsert),
so re-running this script after partial failures — or just to refresh names —
is safe.

Usage:
    cd backend && source venv/bin/activate
    python scripts/seed_twitter_digest_segment.py                          # dry-run
    python scripts/seed_twitter_digest_segment.py --apply                  # execute
    python scripts/seed_twitter_digest_segment.py --csv path.csv --apply   # custom CSV
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_AUDIENCE_TWITTER_DIGEST,
    RESEND_SEGMENT_TWITTER_DIGEST,
)
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

DEFAULT_CSV = Path.home() / "Desktop" / "twitter_digest_eligible.csv"
RATE_DELAY = 0.55  # Resend 2 req/s


def _read_csv(path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get("email") or "").strip().lower()
            user_id = (row.get("user_id") or "").strip()
            if email and user_id:
                rows.append((email, user_id))
    return rows


async def _fetch_name_map() -> dict[str, str]:
    """user_id -> auth profile name. Used to populate Resend `first_name`
    so the broadcast template's {{{FIRST_NAME}}} merge tag has something
    to substitute. Missing/blank names fall through to the Resend default."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=120.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        return {}
    out: dict[str, str] = {}
    for u in payload.get("data") or []:
        uid = u.get("user_id")
        name = (u.get("name") or "").strip()
        if uid and name:
            out[uid] = name
    return out


def main(args: argparse.Namespace) -> int:
    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not configured", file=sys.stderr)
        return 1
    if not RESEND_AUDIENCE_TWITTER_DIGEST:
        print("ERROR: RESEND_AUDIENCE_TWITTER_DIGEST not configured", file=sys.stderr)
        return 1
    if not RESEND_SEGMENT_TWITTER_DIGEST:
        print("ERROR: RESEND_SEGMENT_TWITTER_DIGEST not configured", file=sys.stderr)
        return 1

    resend.api_key = RESEND_API_KEY
    audience_id = RESEND_AUDIENCE_TWITTER_DIGEST
    segment_id = RESEND_SEGMENT_TWITTER_DIGEST
    csv_path = Path(args.csv) if args.csv else DEFAULT_CSV

    if not csv_path.exists():
        print(f"ERROR: CSV not found at {csv_path}", file=sys.stderr)
        return 1

    rows = _read_csv(csv_path)
    name_map = asyncio.run(_fetch_name_map())
    with_name = sum(1 for _, uid in rows if name_map.get(uid))
    print(f"Loaded {len(rows)} (email, user_id) pairs from {csv_path}")
    print(f"Resolved names for: {with_name}/{len(rows)}")
    print(f"Target audience: {audience_id}")
    print(f"Target segment : {segment_id}")
    print()

    if not args.apply:
        print("Dry run only. First 5 rows that would be added:")
        for email, uid in rows[:5]:
            print(f"  {email:38s} first_name={name_map.get(uid, '<none>')}")
        if len(rows) > 5:
            print(f"  ... and {len(rows) - 5} more")
        print("\nRe-run with --apply to execute.")
        return 0

    added = 0
    failed = 0
    for i, (email, user_id) in enumerate(rows, start=1):
        params = {
            "audience_id": audience_id,
            "email": email,
            "unsubscribed": False,
            # Stash the Insforge user_id in last_name as JSON so future audits
            # can correlate Resend contacts back to Insforge accounts.
            "last_name": json.dumps({"user_id": user_id}),
        }
        first_name = name_map.get(user_id)
        if first_name:
            params["first_name"] = first_name
        try:
            time.sleep(RATE_DELAY)
            try:
                resend.Contacts.create(params)
            except Exception as e:  # noqa: BLE001
                if "already exists" not in str(e).lower():
                    raise
                time.sleep(RATE_DELAY)
                resend.Contacts.update(params)
            time.sleep(RATE_DELAY)
            try:
                resend.ContactSegments.add({"email": email, "segment_id": segment_id})
            except Exception as e:  # noqa: BLE001
                if "already exists" not in str(e).lower():
                    raise
            added += 1
            if i % 10 == 0 or i == len(rows):
                print(f"  [{i:3d}/{len(rows)}] added={added} failed={failed}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            logger.warning("failed to add %s: %s", email, e)

    print()
    print(f"Done. added={added} failed={failed} total={len(rows)}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=None, help=f"CSV path (default: {DEFAULT_CSV})")
    parser.add_argument("--apply", action="store_true", help="Actually write to Resend")
    sys.exit(main(parser.parse_args()))
