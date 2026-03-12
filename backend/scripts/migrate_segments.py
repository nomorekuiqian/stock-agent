"""
One-time migration: Add all existing TheMarketBrew Daily contacts to 3 Segments.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/migrate_segments.py

Requires .env with:
    RESEND_API_KEY
    RESEND_SEGMENT_MORNING
    RESEND_SEGMENT_EVENING
    RESEND_SEGMENT_WEEKLY
"""

import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

import resend

resend.api_key = os.getenv("RESEND_API_KEY", "")

# Only migrate to NEW segments (Evening already has all contacts - just renamed)
SEGMENTS = {
    "Morning": "8ac12045-8832-4191-ac09-77898ee09b92",
    "Weekly": "94ac0115-5241-44f6-b7d6-22d5de6d692d",
}

# TheMarketBrew Daily audience (source of existing contacts)
AUDIENCE_ID = "a0e3508d-894b-4e56-a234-66d277c09916"


def main():
    if not resend.api_key:
        print("Missing RESEND_API_KEY")
        sys.exit(1)

    print(f"Source audience: TheMarketBrew Daily ({AUDIENCE_ID})")

    # List all contacts from TheMarketBrew Daily
    time.sleep(0.6)
    contacts = resend.Contacts.list(audience_id=AUDIENCE_ID)
    contact_list = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]
    print(f"Active contacts: {len(contact_list)}")

    # Add each contact to all 3 segments
    success_count = 0
    error_count = 0

    for i, contact in enumerate(contact_list):
        email = contact.get("email")
        if not email:
            continue

        for seg_name, seg_id in SEGMENTS.items():
            try:
                time.sleep(0.6)  # Rate limit: 2 req/s
                resend.ContactSegments.add(
                    {
                        "email": email,
                        "segment_id": seg_id,
                    }
                )
            except Exception as e:
                if "already" in str(e).lower():
                    pass  # Already in segment, skip
                else:
                    print(f"  Error adding {email} to {seg_name}: {e}")
                    error_count += 1

        success_count += 1
        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{len(contact_list)}...")

    print(f"\nDone: {success_count} contacts migrated, {error_count} errors")


if __name__ == "__main__":
    main()
