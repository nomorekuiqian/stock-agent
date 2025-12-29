#!/usr/bin/env python3
"""
Test script for email broadcasting.
Only sends to "Test Broadcast" segment - safe for testing without affecting production users.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/test_broadcast.py              # Send both daily report + personal digest
    python scripts/test_broadcast.py --list       # List Test Broadcast subscribers
"""

import os
import sys
import json
import argparse
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import resend
resend.api_key = os.getenv("RESEND_API_KEY")

# Test Broadcast segment - ONLY use this for testing
TEST_AUDIENCE_ID = "1c300c45-49a7-479e-a4c2-1ed5cfccda1e"
TEST_AUDIENCE_NAME = "Test Broadcast"


def list_test_subscribers():
    """List subscribers in Test Broadcast segment."""
    print(f"Test Broadcast Segment ({TEST_AUDIENCE_ID})")
    print("-" * 50)

    contacts = resend.Contacts.list(audience_id=TEST_AUDIENCE_ID)
    active = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]

    print(f"Active subscribers: {len(active)}")
    for c in active:
        # Parse metadata from last_name field
        metadata = {}
        if c.get("last_name"):
            try:
                metadata = json.loads(c.get("last_name"))
            except:
                pass

        print(f"  - {c.get('email')} ({c.get('first_name', 'N/A')})")
        if metadata.get("symbols"):
            print(f"    Symbols: {metadata.get('symbols')}")


async def send_test_broadcasts():
    """Send both daily report and personal digest to Test Broadcast subscribers."""
    from app.services.insforge_service import get_insforge_service
    from app.services.email_service import get_email_service
    from agents.personal_digest import get_personal_digest
    from app.utils.timezone import today_str, now_iso

    print("=" * 60)
    print(f"TEST BROADCAST TO: {TEST_AUDIENCE_NAME}")
    print("=" * 60)

    # Get test subscribers
    contacts = resend.Contacts.list(audience_id=TEST_AUDIENCE_ID)
    subscribers = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]

    if not subscribers:
        print("No subscribers in Test Broadcast segment!")
        return

    print(f"Subscribers: {len(subscribers)}")

    # Get latest report
    insforge = get_insforge_service()
    report = await insforge.get_report_by_date(today_str())
    if not report:
        report = await insforge.get_latest_report()

    if not report:
        print("ERROR: No daily report found!")
        return

    print(f"Report: {report.get('title', '')[:50]}...")

    email_service = get_email_service()
    digest_agent = get_personal_digest()

    for contact in subscribers:
        email = contact.get("email")
        first_name = contact.get("first_name", "")

        # Parse metadata
        metadata = {}
        if contact.get("last_name"):
            try:
                metadata = json.loads(contact.get("last_name"))
            except:
                pass

        symbols = metadata.get("symbols", [])

        print(f"\n--- {email} ---")

        # 1. Send Daily Report
        print("  [1] Sending Daily Report...")
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "quick_take": report.get("quick_take", ""),
            "market_narrative": report.get("market_narrative", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "conclusion": report.get("conclusion", ""),
            "calendar": report.get("calendar", []),
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
        }

        dr_result = await email_service.send_daily_report(
            report_data,
            to_email=email,
            first_name=first_name
        )
        print(f"      {'OK' if dr_result.get('success') else 'FAILED'}: {dr_result.get('email_id', dr_result.get('error', ''))}")

        # 2. Send Personal Digest (if symbols configured)
        if symbols:
            print(f"  [2] Generating Personal Digest for {symbols}...")
            gen_result = await digest_agent.generate(symbols=symbols)

            if gen_result.get("success"):
                print(f"      Summary: {gen_result.get('one_line_summary', '')[:40]}...")
                pd_result = await email_service.send_personal_digest(
                    gen_result,
                    to_email=email,
                    first_name=first_name
                )
                print(f"      {'OK' if pd_result.get('success') else 'FAILED'}: {pd_result.get('email_id', pd_result.get('error', ''))}")
            else:
                print(f"      FAILED to generate: {gen_result.get('error')}")
        else:
            print("  [2] Skipping Personal Digest (no symbols configured)")

    print("\n" + "=" * 60)
    print("TEST BROADCAST COMPLETE")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Test broadcast to Test Broadcast segment only")
    parser.add_argument("--list", action="store_true", help="List Test Broadcast subscribers")
    args = parser.parse_args()

    if args.list:
        list_test_subscribers()
    else:
        asyncio.run(send_test_broadcasts())


if __name__ == "__main__":
    main()
