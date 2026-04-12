#!/usr/bin/env python3
"""
Test script for email broadcasting to Test Broadcast audience.
Sends broadcasts (not individual emails) - safe for testing without affecting production users.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/test_broadcast.py                    # Send both daily report + personal digest broadcasts
    python scripts/test_broadcast.py --daily            # Send only daily report broadcast
    python scripts/test_broadcast.py --digest           # Send only personal digest broadcast
    python scripts/test_broadcast.py --list             # List Test Broadcast subscribers
"""

import os
import sys
import json
import argparse
import asyncio
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import resend
resend.api_key = os.getenv("RESEND_API_KEY")

# Test segment - contains only voya.technologies@gmail.com
TEST_AUDIENCE_ID = "191b3099-6849-48f9-adec-e6a67b70b10b"
TEST_AUDIENCE_NAME = "Test"


def list_test_subscribers():
    """List subscribers in Test Broadcast segment."""
    print(f"\nTest Broadcast Segment ({TEST_AUDIENCE_ID})")
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
    print()


async def broadcast_daily_report():
    """Broadcast latest daily report to Test Broadcast audience."""
    from app.shared.insforge_service import get_insforge_service
    from app.features.subscription.email_service import get_email_service
    from app.utils.timezone import today_str

    print("\n" + "=" * 60)
    print("BROADCASTING DAILY REPORT")
    print(f"Target: {TEST_AUDIENCE_NAME} ({TEST_AUDIENCE_ID})")
    print("=" * 60)

    # Get latest report
    insforge = get_insforge_service()
    report = await insforge.get_report_by_date(today_str())
    if not report:
        report = await insforge.get_latest_report()

    if not report:
        print("ERROR: No daily report found!")
        return False

    print(f"Report Date: {report.get('report_date', 'N/A')}")
    print(f"Title: {report.get('title', '')[:60]}...")

    # Prepare report data for email
    report_data = {
        "report_id": report.get("id"),
        "report_date": report.get("report_date"),
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

    # Broadcast using Resend Broadcasts API
    email_service = get_email_service()
    result = await email_service.broadcast_daily_report(report_data, audience_id=TEST_AUDIENCE_ID)

    if result.get("success"):
        print(f"SUCCESS: Broadcast ID = {result.get('broadcast_id')}")
        return True
    else:
        print(f"FAILED: {result.get('error')}")
        return False


async def send_test_broadcasts():
    """Send daily report broadcast to Test segment."""
    success = await broadcast_daily_report()

    print("\n" + "=" * 60)
    print("BROADCAST SUMMARY")
    print("=" * 60)
    status = "OK" if success else "FAILED"
    print(f"  Daily Report: {status}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Test broadcast to Test segment only")
    parser.add_argument("--list", action="store_true", help="List Test subscribers")
    parser.add_argument("--daily", action="store_true", help="Send daily report broadcast")
    args = parser.parse_args()

    if args.list:
        list_test_subscribers()
    else:
        # Default: send both
        asyncio.run(send_test_broadcasts())


if __name__ == "__main__":
    main()
