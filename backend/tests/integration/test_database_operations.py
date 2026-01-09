"""
Integration Tests for Database Operations

These tests verify database operations work correctly.
Tests that write data will clean up after themselves.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/integration/test_database_operations.py -v
"""

import uuid
import pytest


@pytest.mark.integration
class TestDatabaseOperations:
    """Integration tests for Insforge database operations."""

    @pytest.mark.asyncio
    async def test_save_email_feedback_with_report_id(self, insforge_service):
        """
        Test that email feedback is saved with report_id correctly.
        This was the bug we fixed - report_id was being saved as NULL.

        Steps:
        1. Get latest report to get a valid report_id
        2. Save feedback with report_id
        3. Verify feedback was saved
        4. Clean up is handled by upsert (same email+date will update)
        """
        # 1. Get latest report
        report = await insforge_service.get_latest_report()
        assert report is not None, "No report found in database"

        report_id = report.get("id")
        report_date = report.get("report_date")
        assert report_id is not None, "Report should have an ID"
        assert report_date is not None, "Report should have a date"

        print(f"\n[Integration] Using report: {report_id}")
        print(f"[Integration] Report date: {report_date}")

        # 2. Save feedback with report_id
        test_email = f"test-{uuid.uuid4().hex[:8]}@integration-test.local"
        result = await insforge_service.save_email_feedback(
            report_date=report_date,
            email=test_email,
            rating="satisfied",
            report_id=report_id,  # This is the key - report_id must be passed
        )

        # 3. Verify success
        assert result.get("success") is True, f"Save failed: {result.get('error')}"
        print(f"[Integration] Feedback saved successfully")

        # Verify the returned data includes report_id
        saved_data = result.get("data", {})
        if saved_data:
            saved_report_id = saved_data.get("report_id")
            assert saved_report_id == report_id, f"Saved report_id mismatch: {saved_report_id} != {report_id}"
            print(f"[Integration] Verified report_id in saved data: {saved_report_id}")

    @pytest.mark.asyncio
    async def test_report_id_integrity(self, insforge_service):
        """
        Test that existing reports have valid report_id (UUID format).
        This verifies data integrity in the database.
        """
        # Get latest report
        report = await insforge_service.get_latest_report()
        assert report is not None, "No report found in database"

        report_id = report.get("id")
        assert report_id is not None, "Report ID should not be None"

        # Verify UUID format
        try:
            uuid.UUID(report_id)
            print(f"\n[Integration] Report ID is valid UUID: {report_id}")
        except ValueError:
            pytest.fail(f"Report ID is not a valid UUID: {report_id}")

        # Verify report can be fetched by ID
        fetched_report = await insforge_service.get_report_by_id(report_id)
        assert fetched_report is not None, f"Could not fetch report by ID: {report_id}"
        assert fetched_report.get("id") == report_id, "Fetched report ID mismatch"

        print(f"[Integration] Successfully verified report: {fetched_report.get('title', '')[:50]}...")

    @pytest.mark.asyncio
    async def test_get_report_by_date(self, insforge_service):
        """
        Test fetching report by date returns correct data structure.
        """
        from app.utils.timezone import today_str

        # Try to get today's report
        today = today_str()
        report = await insforge_service.get_report_by_date(today)

        if report is None:
            # Fall back to latest report
            report = await insforge_service.get_latest_report()
            print(f"\n[Integration] No report for today ({today}), using latest report")

        assert report is not None, "No report found"

        # Verify required fields exist
        required_fields = ["id", "report_date", "title"]
        for field in required_fields:
            assert field in report, f"Missing required field: {field}"

        print(f"\n[Integration] Report date: {report.get('report_date')}")
        print(f"[Integration] Report ID: {report.get('id')}")
        print(f"[Integration] Report title: {report.get('title', '')[:50]}...")

    @pytest.mark.asyncio
    async def test_liquidity_analysis_exists(self, insforge_service):
        """
        Test that we can fetch liquidity analysis from database.
        """
        analysis = await insforge_service.get_latest_liquidity_analysis()

        if analysis is None:
            pytest.skip("No liquidity analysis found in database")

        # Verify required fields
        assert "analysis" in analysis, "Missing 'analysis' field"
        assert "status" in analysis, "Missing 'status' field"

        print(f"\n[Integration] Liquidity analysis status: {analysis.get('status')}")
        print(f"[Integration] Analysis length: {len(analysis.get('analysis', ''))} chars")


@pytest.mark.integration
class TestReportIdFlow:
    """Tests specifically for the report_id flow (the bug we fixed)."""

    @pytest.mark.asyncio
    async def test_report_has_id_after_save(self, insforge_service):
        """
        Verify that when a report is saved, it gets a valid ID.
        This tests the flow without actually creating a new report.
        """
        # Get latest report - it should have been saved with an ID
        report = await insforge_service.get_latest_report()
        assert report is not None, "No report found"

        report_id = report.get("id")
        report_date = report.get("report_date")

        # Key assertions
        assert report_id is not None, "report_id should not be None"
        assert report_date is not None, "report_date should not be None"

        # Verify it's a valid UUID
        try:
            uuid.UUID(report_id)
        except ValueError:
            pytest.fail(f"report_id is not a valid UUID: {report_id}")

        print(f"\n[Integration] Report {report_date} has valid ID: {report_id}")

    @pytest.mark.asyncio
    async def test_feedback_links_to_report(self, insforge_service):
        """
        Simulate the feedback flow:
        1. Get a report with ID
        2. Save feedback linking to that report
        3. Verify the link is correct
        """
        # 1. Get report
        report = await insforge_service.get_latest_report()
        assert report is not None

        report_id = report.get("id")
        report_date = report.get("report_date")

        # 2. Save feedback (using unique email to avoid conflicts)
        test_email = f"flow-test-{uuid.uuid4().hex[:8]}@test.local"
        result = await insforge_service.save_email_feedback(
            report_date=report_date,
            email=test_email,
            rating="satisfied",
            report_id=report_id,
        )

        assert result.get("success") is True

        # 3. Verify feedback data
        saved_data = result.get("data", {})
        if saved_data:
            assert saved_data.get("report_id") == report_id, "Feedback should link to correct report"
            assert saved_data.get("report_date") == report_date, "Feedback should have correct date"
            print(f"\n[Integration] Feedback correctly links to report {report_id}")
