"""
Send the weekly macro report to the Resend "Test Broadcast" audience only.

Use this to verify rendering + broadcast plumbing without spamming the 154
real Pro subscribers. Only the contacts in the Test Broadcast audience
receive the email — currently kedengpan@gmail.com, kedengpan123@gmail.com,
voya.technologies@gmail.com.

How it works:
  1. Loads the latest stored weekly report from Insforge
     (no LLM regeneration, no DB write).
  2. Renders the same HTML the Sunday cron would render
     (format_weekly_report_html).
  3. Calls the low-level _create_and_send_broadcast() with audience_id
     pointing at Test Broadcast. Bypasses broadcast_weekly_report()'s
     segment-only routing because Test Broadcast is an audience, not a
     segment, in Resend's classification.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/test_weekly_broadcast.py            # dry-run (default)
    python scripts/test_weekly_broadcast.py --send     # actually send
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

TEST_AUDIENCE_ID = "be8e3ede-2dff-4114-a4b3-bccb2f4192bf"  # "Test Broadcast"


async def main(send: bool) -> int:
    from app.features.macro.weekly import db as weekly_db

    print("Loading latest weekly report from Insforge...")
    report = await weekly_db.get_latest_report()
    if not report:
        print("ERROR: No weekly report found in DB.", file=sys.stderr)
        print("Generate one first via POST /api/weekly-report/generate", file=sys.stderr)
        return 1

    week_label = report.get("week_label", "<unknown>")
    title = report.get("title", "<no title>")
    print(f"  week_label: {week_label}")
    print(f"  title:      {title}")
    print(f"  report id:  {report.get('id')}")
    print()

    # Show who would receive the test email
    import resend
    from app.core.config import RESEND_API_KEY
    resend.api_key = RESEND_API_KEY
    test_contacts = resend.Contacts.list(audience_id=TEST_AUDIENCE_ID).get("data", []) or []
    active = [c for c in test_contacts if not c.get("unsubscribed")]
    print(f"Target: Test Broadcast audience ({TEST_AUDIENCE_ID})")
    print(f"  active recipients: {len(active)}")
    for c in active:
        print(f"    - {c.get('email')}")
    print()

    if not send:
        print("DRY-RUN — re-run with --send to actually broadcast.")
        return 0

    from app.features.subscription.email_service import (
        format_weekly_report_html,
        get_email_service,
    )

    html = format_weekly_report_html(report, report_id=report.get("id"))
    title = report.get("title", "")
    week_label = report.get("week_label", "")
    subject = f"[TEST] {title}" if title else f"[TEST] Weekly {week_label}"

    service = get_email_service()
    result = service._create_and_send_broadcast(
        label="WeeklyTEST",
        audience_id=TEST_AUDIENCE_ID,
        segment_id=None,
        subject=subject,
        broadcast_name=f"TEST Weekly {week_label}",
        html=html,
        from_email=service.from_email_weekly,
    )

    print()
    print("Result:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    return 0 if result.get("success") else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--send",
        action="store_true",
        help="Actually send to Test Broadcast segment (otherwise dry-run)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(send=args.send)))
