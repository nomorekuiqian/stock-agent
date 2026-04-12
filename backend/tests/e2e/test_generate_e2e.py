"""
E2E Tests for Full Generation Flow (AI-powered)

These tests call AI APIs to generate NEW content, then broadcast to Test Broadcast.
They are SLOW (30-60 seconds each) and skipped by default.

Usage:
    cd backend
    source venv/bin/activate

    # Run ONLY generation tests
    pytest tests/e2e/test_generate_e2e.py -v -m generate

    # Run ALL tests including generation
    pytest tests/ -v --run-generate

    # Run specific generation test
    pytest tests/e2e/test_generate_e2e.py::TestGenerateE2E::test_generate_daily_report -v --run-generate
    pytest tests/e2e/test_generate_e2e.py::TestGenerateE2E::test_generate_morning_report -v --run-generate
"""

import os
import time
import pytest
from httpx import AsyncClient, ASGITransport

# Test segment ID (contains only voya.technologies@gmail.com)
TEST_AUDIENCE_ID = "191b3099-6849-48f9-adec-e6a67b70b10b"

# Test user ID for personal digest
TEST_USER_ID = "d00a6201-646a-489f-95a2-aff8f90fe669"


@pytest.mark.e2e
@pytest.mark.generate
class TestGenerateE2E:
    """
    E2E tests that generate NEW content via AI.
    These tests are slow and skipped by default.
    Use --run-generate to run them.
    """

    @pytest.mark.asyncio
    async def test_generate_daily_report(self, email_service):
        """
        Full daily report generation flow:
        1. Call /api/market to generate new report (or use cache if today's exists)
        2. Verify report is saved to database with report_id
        3. Broadcast to Test Broadcast channel
        4. Verify broadcast success

        Note: This test may take 30-60 seconds due to AI generation.
        If today's report already exists, it will use the cached version.
        """
        from app.main import app
        from app.utils.timezone import today_str

        print("\n" + "=" * 60)
        print("GENERATING DAILY REPORT (may take 30-60 seconds)")
        print("=" * 60)

        # 1. Call /api/market to generate report
        # Override auth dependency for this test (we're testing generation, not auth)
        from app.core.deps import verify_user_token
        app.dependency_overrides[verify_user_token] = lambda: TEST_USER_ID

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/market",
                timeout=120.0,  # 2 minute timeout for AI generation
            )
        app.dependency_overrides.pop(verify_user_token, None)

        assert response.status_code == 200, f"API call failed: {response.status_code} - {response.text}"

        data = response.json()
        assert data.get("success") is True, f"Report generation failed: {data.get('error')}"

        # Check if from cache or newly generated
        from_cache = data.get("from_cache", False)
        print(f"[Generate] From cache: {from_cache}")
        print(f"[Generate] Report date: {data.get('report_date', 'N/A')}")
        print(f"[Generate] Title: {data.get('title', '')[:60]}...")

        # 2. Verify report_id exists
        report_id = data.get("report_id")
        assert report_id is not None, "report_id should be returned"
        print(f"[Generate] report_id: {report_id}")

        # 3. Prepare data for broadcast
        report_data = {
            "report_id": report_id,
            "report_date": data.get("report_date", today_str()),
            "indices": data.get("indices", []),
            "timestamp": data.get("timestamp", ""),
            "title": data.get("title", ""),
            "summary": data.get("summary", ""),
            "intro": data.get("intro", ""),
            "macro": data.get("macro"),
            "news": data.get("news"),
            "report_summary": data.get("report_summary", ""),
            "calendar": data.get("calendar", []),
        }

        # Wait to avoid Resend rate limiting
        time.sleep(2)

        # 4. Broadcast to Test Broadcast
        result = await email_service.broadcast_daily_report(
            report_data,
            audience_id=TEST_AUDIENCE_ID
        )

        assert result.get("success") is True, f"Broadcast failed: {result.get('error')}"
        print(f"[Generate] SUCCESS: Broadcast ID = {result.get('broadcast_id')}")

    @pytest.mark.asyncio
    async def test_generate_personal_digest(self, email_service):
        """
        Full personal digest generation flow:
        1. Call /api/digest to generate new digest for test user
        2. Verify digest is generated successfully
        3. Broadcast to Test Broadcast channel
        4. Verify broadcast success

        Note: This test may take 20-30 seconds due to AI generation.
        """
        import resend
        from app.main import app

        print("\n" + "=" * 60)
        print("GENERATING PERSONAL DIGEST (may take 20-30 seconds)")
        print("=" * 60)

        # Initialize resend
        resend.api_key = os.getenv("RESEND_API_KEY")

        # Get first_name from Test Broadcast contacts
        time.sleep(1)  # Avoid rate limiting
        contacts = resend.Contacts.list(audience_id=TEST_AUDIENCE_ID)
        active_contacts = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]
        first_name = active_contacts[0].get("first_name", "") if active_contacts else ""
        print(f"[Generate] Recipient name: {first_name or '(not set)'}")

        # Test symbols for digest generation
        test_symbols = ["AAPL", "NVDA", "TSLA"]
        print(f"[Generate] Generating digest for symbols: {test_symbols}")

        # 1. Call /api/digest to generate new digest
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/digest",
                json={"symbols": test_symbols},
                timeout=120.0,  # 2 minute timeout for AI generation
            )

        assert response.status_code == 200, f"API call failed: {response.status_code} - {response.text}"

        data = response.json()
        assert data.get("success") is True, f"Digest generation failed: {data.get('error')}"

        print(f"[Generate] Symbols used: {data.get('symbols', [])}")
        print(f"[Generate] Summary: {data.get('one_line_summary', '')[:60]}...")

        # 2. Prepare data for broadcast
        email_data = {
            "success": True,
            "symbols": data.get("symbols", test_symbols),
            "greeting": data.get("greeting", ""),
            "one_line_summary": data.get("one_line_summary", ""),
            "stocks": data.get("stocks", []),
            "news": data.get("news", {}),
            "events": data.get("events", []),
            "summary": data.get("summary", {}),
        }

        # Personal digest broadcast removed — broadcast_personal_digests (Batch.send)
        # is the active code path, tested separately in test_broadcast_batch.py
        print(f"[Generate] Digest generated successfully, skipping broadcast (uses Batch.send)")

    @pytest.mark.asyncio
    async def test_generate_morning_report(self, email_service):
        """
        Full morning report generation flow:
        1. Call /api/morning to generate new report (or use cache if today's exists)
        2. Verify report structure (title, futures, overnight_news, summary)
        3. Broadcast to Test Broadcast channel
        4. Verify broadcast success

        Note: This test may take 30-60 seconds due to AI generation.
        If today's report already exists, it will use the cached version.
        """
        from app.main import app
        from app.core.deps import verify_user_token

        print("\n" + "=" * 60)
        print("GENERATING MORNING REPORT (may take 30-60 seconds)")
        print("=" * 60)

        # 1. Call /api/morning to generate report
        # Override auth dependency (testing generation, not auth)
        app.dependency_overrides[verify_user_token] = lambda: TEST_USER_ID

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/morning",
                timeout=120.0,
            )
        app.dependency_overrides.pop(verify_user_token, None)

        assert response.status_code == 200, (
            f"API call failed: {response.status_code} - {response.text}"
        )

        data = response.json()
        from_cache = data.get("from_cache", False)
        print(f"[Generate] From cache: {from_cache}")
        print(f"[Generate] Report date: {data.get('report_date', 'N/A')}")
        print(f"[Generate] Title: {data.get('title', '')[:60]}...")

        # 2. Verify morning report structure
        assert data.get("title"), "Morning report should have a title"
        assert isinstance(data.get("futures"), list), "futures should be a list"
        assert isinstance(data.get("overnight_news"), list), "overnight_news should be a list"
        assert isinstance(data.get("summary"), list), "summary should be a list"

        report_id = data.get("report_id")
        print(f"[Generate] report_id: {report_id}")

        # 3. Prepare data for broadcast
        report_data = {
            "report_id": report_id,
            "report_date": data.get("report_date", ""),
            "timestamp": data.get("timestamp", ""),
            "title": data.get("title", ""),
            "market_pulse": data.get("market_pulse", ""),
            "futures": data.get("futures", []),
            "futures_analysis": data.get("futures_analysis", ""),
            "global_markets": data.get("global_markets", {}),
            "global_markets_analysis": data.get("global_markets_analysis", ""),
            "overnight_news": data.get("overnight_news", []),
            "today_focus": data.get("today_focus", []),
            "summary": data.get("summary", []),
        }

        # Wait to avoid Resend rate limiting
        time.sleep(2)

        # 4. Broadcast to Test Broadcast
        result = await email_service.broadcast_morning_report(
            report_data,
            audience_id=TEST_AUDIENCE_ID,
        )

        assert result.get("success") is True, f"Broadcast failed: {result.get('error')}"
        print(f"[Generate] SUCCESS: Broadcast ID = {result.get('broadcast_id')}")
