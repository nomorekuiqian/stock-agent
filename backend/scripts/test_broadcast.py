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

# Test Broadcast segment - ONLY use this for testing
TEST_AUDIENCE_ID = "1c300c45-49a7-479e-a4c2-1ed5cfccda1e"
TEST_AUDIENCE_NAME = "Test Broadcast"


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
    from app.services.insforge_service import get_insforge_service
    from app.services.email_service import get_email_service
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


async def broadcast_personal_digest():
    """Broadcast latest personal digest to Test Broadcast audience."""
    import httpx
    from app.services.email_service import get_email_service

    print("\n" + "=" * 60)
    print("BROADCASTING PERSONAL DIGEST")
    print(f"Target: {TEST_AUDIENCE_NAME} ({TEST_AUDIENCE_ID})")
    print("=" * 60)

    # Get latest personal digest via edge function
    # Using a known digest_id from database
    base_url = os.getenv("NEXT_PUBLIC_INSFORGE_URL", "https://9wmhxyi4.us-east.insforge.app")
    anon_key = os.getenv("INSFORGE_ANON_KEY", "")

    # Latest digest ID (from database query)
    latest_digest_id = "8838f0a8-ff19-4094-a220-293c15eab19f"

    url = f"{base_url}/functions/user-digests?digest_id={latest_digest_id}"
    headers = {
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            print(f"ERROR: Failed to fetch digest, status={resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        result = resp.json()

    if not result.get("success") or not result.get("data"):
        print(f"ERROR: No personal digest found! Response: {result}")
        return False

    digest = result["data"]
    print(f"Digest Date: {digest.get('digest_date', 'N/A')}")
    print(f"Symbols: {digest.get('symbols', [])}")
    print(f"Summary: {digest.get('one_line_summary', '')[:60]}...")

    # Prepare digest data for email
    digest_data = {
        "success": True,
        "symbols": digest.get("symbols", []),
        "greeting": digest.get("greeting", ""),
        "one_line_summary": digest.get("one_line_summary", ""),
        "analysis": digest.get("analysis", ""),
        "bottom_line": digest.get("bottom_line", ""),
        "news_items": digest.get("news_data", []),
        "digest_data": digest.get("digest_data", {}),
    }

    # Broadcast using Resend Broadcasts API
    email_service = get_email_service()
    result = await email_service.broadcast_personal_digest(digest_data, audience_id=TEST_AUDIENCE_ID)

    if result.get("success"):
        print(f"SUCCESS: Broadcast ID = {result.get('broadcast_id')}")
        return True
    else:
        print(f"FAILED: {result.get('error')}")
        return False


async def send_test_broadcasts(daily: bool = True, digest: bool = True):
    """Send broadcasts to Test Broadcast audience."""
    results = []

    if daily:
        success = await broadcast_daily_report()
        results.append(("Daily Report", success))

        if digest:
            # Wait between broadcasts to avoid rate limiting
            print("\nWaiting 3 seconds before next broadcast...")
            time.sleep(3)

    if digest:
        success = await broadcast_personal_digest()
        results.append(("Personal Digest", success))

    # Summary
    print("\n" + "=" * 60)
    print("BROADCAST SUMMARY")
    print("=" * 60)
    for name, success in results:
        status = "OK" if success else "FAILED"
        print(f"  {name}: {status}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Test broadcast to Test Broadcast segment only")
    parser.add_argument("--list", action="store_true", help="List Test Broadcast subscribers")
    parser.add_argument("--daily", action="store_true", help="Send only daily report broadcast")
    parser.add_argument("--digest", action="store_true", help="Send only personal digest broadcast")
    args = parser.parse_args()

    if args.list:
        list_test_subscribers()
    elif args.daily:
        asyncio.run(send_test_broadcasts(daily=True, digest=False))
    elif args.digest:
        asyncio.run(send_test_broadcasts(daily=False, digest=True))
    else:
        # Default: send both
        asyncio.run(send_test_broadcasts(daily=True, digest=True))


if __name__ == "__main__":
    main()
