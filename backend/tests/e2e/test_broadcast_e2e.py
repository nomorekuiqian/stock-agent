"""
E2E Tests for Broadcast Functionality

These tests send REAL emails to the Test Broadcast channel.
The Test Broadcast channel should only have test subscribers (e.g., your own email).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_broadcast_e2e.py -v

    # Run only daily report test
    pytest tests/e2e/test_broadcast_e2e.py::TestBroadcastE2E::test_broadcast_daily_report -v

    # Run only personal digest test
    pytest tests/e2e/test_broadcast_e2e.py::TestBroadcastE2E::test_broadcast_personal_digest -v
"""

import os
import time
import pytest
import httpx

# Test Broadcast audience ID (fixed test channel)
TEST_AUDIENCE_ID = "1c300c45-49a7-479e-a4c2-1ed5cfccda1e"

# Test user ID for personal digest (pengyou's account with real digest data)
TEST_USER_ID = "d00a6201-646a-489f-95a2-aff8f90fe669"


@pytest.mark.e2e
class TestBroadcastE2E:
    """E2E tests for broadcasting to Test Broadcast channel."""

    @pytest.mark.asyncio
    async def test_broadcast_daily_report(self, insforge_service, email_service):
        """
        Test standard daily report broadcast flow:
        1. Fetch latest report from database (no new generation)
        2. Call email_service.broadcast_daily_report()
        3. Verify broadcast_id is returned
        4. Verify report_id is included in report data
        """
        from app.utils.timezone import today_str

        # 1. Get latest report from database
        report = await insforge_service.get_report_by_date(today_str())
        if not report:
            report = await insforge_service.get_latest_report()

        assert report is not None, "No daily report found in database. Please generate one first via /api/market"

        print(f"\n[E2E] Using report from: {report.get('report_date', 'N/A')}")
        print(f"[E2E] Report title: {report.get('title', '')[:60]}...")

        # 2. Prepare report data (same structure as test_broadcast.py)
        report_data = {
            "report_id": report.get("id"),  # Critical: must include report_id
            "report_date": report.get("report_date"),
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "intro": report.get("intro", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "report_summary": report.get("report_summary", ""),
            "calendar": report.get("calendar", []),
        }

        # Verify report_id is present
        assert report_data.get("report_id") is not None, "report_id should not be None"
        print(f"[E2E] report_id: {report_data.get('report_id')}")

        # 3. Broadcast to Test Broadcast channel
        result = await email_service.broadcast_daily_report(
            report_data,
            audience_id=TEST_AUDIENCE_ID
        )

        # 4. Verify success
        assert result.get("success") is True, f"Broadcast failed: {result.get('error')}"
        assert result.get("broadcast_id") is not None, "broadcast_id should be returned"

        print(f"[E2E] SUCCESS: Broadcast ID = {result.get('broadcast_id')}")
        print(f"[E2E] Audience ID = {result.get('audience_id')}")

    @pytest.mark.asyncio
    async def test_broadcast_personal_digest(self, email_service):
        """
        Test personal digest broadcast flow:
        1. Fetch test user's digest from database (no new generation)
        2. Call email_service.broadcast_personal_digest()
        3. Verify broadcast_id is returned
        """
        import resend

        # Wait to avoid Resend rate limiting (2 requests/second limit)
        time.sleep(2)

        # Initialize resend with API key
        resend.api_key = os.getenv("RESEND_API_KEY")

        # 1. Get first_name from Resend contacts in Test Broadcast audience
        contacts = resend.Contacts.list(audience_id=TEST_AUDIENCE_ID)
        active_contacts = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]
        first_name = ""
        if active_contacts:
            first_name = active_contacts[0].get("first_name", "")
        print(f"\n[E2E] Recipient name: {first_name or '(not set)'}")

        # 2. Fetch user's latest digest via Insforge Edge Function
        base_url = os.getenv("NEXT_PUBLIC_INSFORGE_URL", "https://9wmhxyi4.us-east.insforge.app")
        anon_key = os.getenv("INSFORGE_ANON_KEY", "")

        url = f"{base_url}/functions/user-digests?user_id={TEST_USER_ID}&limit=1"
        headers = {
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            assert resp.status_code == 200, f"Failed to fetch digest, status={resp.status_code}, response={resp.text}"
            result = resp.json()

        assert result.get("success") is True, f"API call failed: {result}"

        data = result.get("data", [])
        assert data and len(data) > 0, "No personal digest found for test user"

        digest = data[0] if isinstance(data, list) else data
        print(f"[E2E] Digest date: {digest.get('digest_date', 'N/A')}")
        print(f"[E2E] Symbols: {digest.get('symbols', [])}")
        print(f"[E2E] Summary: {digest.get('one_line_summary', '')[:60]}...")

        # 3. Prepare digest data for email
        stored_data = digest.get("digest_data", {})

        email_data = {
            "success": True,
            "symbols": digest.get("symbols", []),
            "greeting": digest.get("greeting", ""),
            "one_line_summary": digest.get("one_line_summary", ""),
            "stocks": stored_data.get("stocks", []),
            "news": stored_data.get("news", {}),
            "events": stored_data.get("events", []),
            "summary": stored_data.get("summary", {}),
        }

        print(f"[E2E] Stocks: {len(email_data.get('stocks', []))} items")
        print(f"[E2E] News headlines: {len(email_data.get('news', {}).get('headlines', []))} items")

        # 4. Broadcast to Test Broadcast channel
        result = await email_service.broadcast_personal_digest(
            email_data,
            audience_id=TEST_AUDIENCE_ID,
            first_name=first_name
        )

        # 5. Verify success
        assert result.get("success") is True, f"Broadcast failed: {result.get('error')}"
        assert result.get("broadcast_id") is not None, "broadcast_id should be returned"

        print(f"[E2E] SUCCESS: Broadcast ID = {result.get('broadcast_id')}")
        print(f"[E2E] Audience ID = {result.get('audience_id')}")
