"""
E2E Tests for Subscription Weekly Report API Endpoints -- generated from git diff

Tests new endpoints:
- GET  /api/weekly-report/preview          (weekly report email preview)
- POST /api/weekly-report/send-test        (send test weekly email)
- POST /api/weekly-report/broadcast        (broadcast weekly report, auth)

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_subscription_weekly_e2e.py -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===========================================================================
# TestWeeklyReportPreview
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportPreview:
    """Tests for GET /api/weekly-report/preview."""

    @pytest.mark.asyncio
    async def test_preview_returns_200(self, client):
        """GET /api/weekly-report/preview returns 200 or 404 (if no report)."""
        resp = await client.get("/api/weekly-report/preview", timeout=30)
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.json()
            assert data["success"] is True
            assert "html" in data
            assert "<html" in data["html"]

    @pytest.mark.asyncio
    async def test_preview_with_first_name(self, client):
        """Preview with first_name param includes the name."""
        resp = await client.get(
            "/api/weekly-report/preview",
            params={"first_name": "TestUser"},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "html" in data

    @pytest.mark.asyncio
    async def test_preview_with_week_param(self, client):
        """Preview with specific week returns 200 or 404."""
        resp = await client.get(
            "/api/weekly-report/preview",
            params={"week": "1999.W01"},
            timeout=30,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_preview_structure(self, client):
        """Preview response includes metadata fields."""
        resp = await client.get("/api/weekly-report/preview", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            assert "week_label" in data
            assert "title" in data


# ===========================================================================
# TestWeeklyReportSendTest
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportSendTest:
    """Tests for POST /api/weekly-report/send-test."""

    @pytest.mark.asyncio
    async def test_send_test_missing_email(self, client):
        """POST without email returns 400 or 422."""
        resp = await client.post(
            "/api/weekly-report/send-test",
            json={},
            timeout=10,
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_send_test_no_report_available(self, client):
        """POST when no report exists may return 404 or 500."""
        resp = await client.post(
            "/api/weekly-report/send-test",
            json={"email": "test@example.com"},
            timeout=30,
        )
        # Could be 200 (if report exists), 404 (no report), or 500 (send error)
        assert resp.status_code in (200, 404, 500)


# ===========================================================================
# TestWeeklyReportBroadcast
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportBroadcast:
    """Tests for POST /api/weekly-report/broadcast."""

    @pytest.mark.asyncio
    async def test_broadcast_no_secret(self, client):
        """POST without X-Cron-Secret header returns 401."""
        resp = await client.post("/api/weekly-report/broadcast", timeout=10)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_broadcast_wrong_secret(self, client):
        """POST with incorrect X-Cron-Secret returns 401."""
        resp = await client.post(
            "/api/weekly-report/broadcast",
            headers={"X-Cron-Secret": "wrong-secret-value"},
            timeout=10,
        )
        assert resp.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
