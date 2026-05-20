"""
One-shot QA helper: render the latest Twitter KOL digest and send it to a
single recipient via Resend Emails.send. Bypasses Broadcasts/Audiences so
you can sanity-check the email body before the real broadcast.

Usage:
    # Send latest digest to default QA address (kedengpan@gmail.com)
    python scripts/qa_twitter_digest_send.py

    # Override recipient and/or pick a specific date
    python scripts/qa_twitter_digest_send.py --to me@example.com --date 2026-05-12
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.features.subscription.email_service import get_email_service
from app.features.twitter_digest import db as digest_db

_DEFAULT_TO = "kedengpan@gmail.com"


async def main(to_email: str, date: str | None) -> int:
    digest = (
        await digest_db.get_digest_by_date(date) if date
        else await digest_db.get_latest_digest()
    )
    if not digest:
        print(f"ERROR: no digest found for date={date or 'latest'}", file=sys.stderr)
        return 1

    digest_dict = digest.model_dump()
    if date:
        digest_dict["date"] = date
    else:
        digest_dict["date"] = (digest.generated_at or "")[:10]

    print(f"[qa] sending digest date={digest_dict['date']} to {to_email}")
    print(f"[qa] headline: {digest.headline!r}")

    email_service = get_email_service()
    result = await email_service._qa_send_twitter_digest_to_email(
        digest_dict, to_email,
    )
    print(f"[qa] result: {result}")
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--to", default=_DEFAULT_TO, help=f"recipient email (default: {_DEFAULT_TO})")
    parser.add_argument("--date", default=None, help="ISO YYYY-MM-DD; omit for latest")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.to, args.date)))
