"""
One-time script to remove 'symbols' from Resend contact metadata.

The personal_digest audience contacts store metadata as JSON in the last_name field.
This script removes the 'symbols' key from that JSON since symbols are now read
exclusively from the Insforge user_watchlists table.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/clean_resend_symbols.py [--dry-run]
"""

import json
import sys
import time
import os

# Add parent dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import resend

from app.core.config import RESEND_API_KEY

RATE_LIMIT_DELAY = 0.55  # 550ms between calls


def main():
    dry_run = "--dry-run" in sys.argv

    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set")
        sys.exit(1)

    resend.api_key = RESEND_API_KEY

    if dry_run:
        print("[DRY RUN] No changes will be made.\n")

    # Find the Personal Digest Daily audience
    time.sleep(RATE_LIMIT_DELAY)
    audiences = resend.Audiences.list()
    audience_id = None
    for aud in audiences.get("data", []):
        if aud.get("name") == "Personal Digest Daily":
            audience_id = aud["id"]
            break

    if not audience_id:
        print("ERROR: 'Personal Digest Daily' audience not found")
        sys.exit(1)

    print(f"Found audience: {audience_id}\n")

    # List all contacts
    time.sleep(RATE_LIMIT_DELAY)
    contacts = resend.Contacts.list(audience_id=audience_id)
    contact_list = contacts.get("data", [])
    print(f"Total contacts: {len(contact_list)}\n")

    updated = 0
    skipped = 0
    errors = 0

    for contact in contact_list:
        email = contact.get("email", "")
        last_name = contact.get("last_name", "")

        if not last_name:
            skipped += 1
            continue

        try:
            metadata = json.loads(last_name)
        except json.JSONDecodeError:
            skipped += 1
            continue

        if "symbols" not in metadata:
            skipped += 1
            continue

        # Remove symbols
        old_symbols = metadata.pop("symbols")
        new_last_name = json.dumps(metadata) if metadata else ""

        print(f"  {email}: removing symbols={old_symbols}")

        if not dry_run:
            try:
                time.sleep(RATE_LIMIT_DELAY)
                resend.Contacts.update({
                    "audience_id": audience_id,
                    "email": email,
                    "last_name": new_last_name,
                })
                updated += 1
            except Exception as e:
                print(f"    ERROR updating {email}: {e}")
                errors += 1
        else:
            updated += 1

    print(f"\nDone! Updated: {updated}, Skipped: {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
