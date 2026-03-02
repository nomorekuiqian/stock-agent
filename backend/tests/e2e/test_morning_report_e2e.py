"""
E2E Tests for Morning Report API Endpoints -- generated from git diff

Tests 5 endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/morning/reports              (list reports with pagination)
- GET  /api/morning/reports/latest       (most recent report)
- GET  /api/morning/reports/date/{date}  (report by date)
- GET  /api/morning/reports/{report_id}  (report by UUID)
- POST /api/morning-report/send-test     (send test email)

All read endpoints are public (no auth required).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_morning_report_e2e.py -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from app.main import app

TEST_CRON_SECRET = "test-cron-secret-for-e2e"


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===========================================================================
# TestListMorningReports
# ===========================================================================


@pytest.mark.e2e
class TestListMorningReports:
    """Tests for GET /api/morning/reports."""

    @pytest.mark.asyncio
    async def test_returns_200(self, client):
        """List morning reports endpoint returns 200."""
        resp = await client.get("/api/morning/reports", timeout=30)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_response_structure(self, client):
        """Response contains success=True and data as a list."""
        resp = await client.get("/api/morning/reports", timeout=30)
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert "total" in data

    @pytest.mark.asyncio
    async def test_pagination_params(self, client):
        """Pagination parameters are accepted and reflected."""
        resp = await client.get(
            "/api/morning/reports", params={"limit": 5, "offset": 0}, timeout=30
        )
        data = resp.json()
        assert data["success"] is True
        assert data["limit"] == 5
        assert data["offset"] == 0

    @pytest.mark.asyncio
    async def test_invalid_limit(self, client):
        """Invalid limit (0) returns 422."""
        resp = await client.get(
            "/api/morning/reports", params={"limit": 0}, timeout=10
        )
        assert resp.status_code == 422


# ===========================================================================
# TestGetLatestMorningReport
# ===========================================================================


@pytest.mark.e2e
class TestGetLatestMorningReport:
    """Tests for GET /api/morning/reports/latest."""

    @pytest.mark.asyncio
    async def test_returns_200_or_404(self, client):
        """Endpoint returns 200 with data or 404 if none exist."""
        resp = await client.get("/api/morning/reports/latest", timeout=30)
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_response_structure_on_success(self, client):
        """If 200, response contains expected morning report fields."""
        resp = await client.get("/api/morning/reports/latest", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            assert data["success"] is True
            report = data["data"]
            assert "report_id" in report
            assert "report_date" in report
            assert "title" in report
            assert "futures" in report
            assert "overnight_news" in report
            assert "summary" in report


# ===========================================================================
# TestGetMorningReportByDate
# ===========================================================================


@pytest.mark.e2e
class TestGetMorningReportByDate:
    """Tests for GET /api/morning/reports/date/{date}."""

    @pytest.mark.asyncio
    async def test_nonexistent_date_returns_404(self, client):
        """Non-existent date returns 404."""
        resp = await client.get(
            "/api/morning/reports/date/2000-01-01", timeout=10
        )
        assert resp.status_code == 404


# ===========================================================================
# TestGetMorningReportById
# ===========================================================================


@pytest.mark.e2e
class TestGetMorningReportById:
    """Tests for GET /api/morning/reports/{report_id}."""

    @pytest.mark.asyncio
    async def test_nonexistent_id_returns_404(self, client):
        """Non-existent UUID returns 404."""
        resp = await client.get(
            "/api/morning/reports/00000000-0000-0000-0000-000000000000",
            timeout=10,
        )
        assert resp.status_code == 404


# ===========================================================================
# TestSendTestMorningReport
# ===========================================================================


@pytest.mark.e2e
class TestSendTestMorningReport:
    """Tests for POST /api/morning-report/send-test."""

    @pytest.mark.asyncio
    async def test_missing_email_returns_400(self, client):
        """Missing email returns 400."""
        resp = await client.post(
            "/api/morning-report/send-test",
            json={"email": ""},
            timeout=10,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_valid_email_returns_200_or_404(self, client):
        """With valid email, returns 200 (sent) or 404 (no report to send)."""
        resp = await client.post(
            "/api/morning-report/send-test",
            json={"email": "test@example.com"},
            timeout=60,
        )
        # 200 if report exists, 404 if no morning report found
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.json()
            assert data["success"] is True
            assert "email_id" in data


# ===========================================================================
# TestBroadcastMorningReport
# ===========================================================================


@pytest.mark.e2e
class TestBroadcastMorningReport:
    """Tests for POST /api/morning/broadcast."""

    @pytest.fixture(autouse=True)
    def _patch_cron_secret(self):
        """Patch CRON_SECRET so auth tests work regardless of env."""
        with patch("app.core.deps.CRON_SECRET", TEST_CRON_SECRET):
            yield

    @pytest.mark.asyncio
    async def test_missing_cron_secret_returns_401(self, client):
        """Missing X-Cron-Secret header returns 401."""
        resp = await client.post("/api/morning/broadcast", timeout=10)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_cron_secret_returns_401(self, client):
        """Wrong X-Cron-Secret returns 401."""
        resp = await client.post(
            "/api/morning/broadcast",
            headers={"X-Cron-Secret": "wrong-secret"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_quality_gate_rejects_incomplete_report(self, client):
        """Broadcast with incomplete cached report returns 500."""
        incomplete_report = {
            "id": "test-id",
            "report_date": "2026-03-02",
            "title": "",
            "overnight_news": [],
            "summary": [],
        }
        with patch(
            "app.features.morning_report.db.get_morning_report_by_date",
            new=AsyncMock(return_value=incomplete_report),
        ):
            resp = await client.post(
                "/api/morning/broadcast",
                headers={"X-Cron-Secret": TEST_CRON_SECRET},
                timeout=30,
            )
            assert resp.status_code == 500
            assert "quality check" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_quality_gate_rejects_error_report(self, client):
        """Broadcast with error-content report (the March 2 bug) returns 500."""
        error_report = {
            "id": "test-id",
            "report_date": "2026-03-02",
            "title": "",
            "market_pulse": "Data fetched (analysis error: 500 INTERNAL)",
            "overnight_news": [],
            "today_focus": [],
            "summary": [],
        }
        with patch(
            "app.features.morning_report.db.get_morning_report_by_date",
            new=AsyncMock(return_value=error_report),
        ):
            resp = await client.post(
                "/api/morning/broadcast",
                headers={"X-Cron-Secret": TEST_CRON_SECRET},
                timeout=30,
            )
            assert resp.status_code == 500
            assert "quality check" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_broadcast_with_valid_cached_report(self, client):
        """Broadcast with valid cached report calls email service and returns 200."""
        valid_report = {
            "id": "test-id",
            "report_date": "2026-03-02",
            "timestamp": "2026-03-02T07:00:00Z",
            "title": "Market opens higher",
            "market_pulse": "Positive sentiment",
            "overnight_news": [{"title": "Fed speaks", "analysis": "No change"}],
            "today_focus": [{"title": "ISM PMI", "time": "10:00 AM ET"}],
            "summary": [
                {"title": "overnight_review", "content": "Markets rallied."},
                {"title": "today_outlook", "content": "Watch ISM data."},
            ],
        }
        mock_broadcast = AsyncMock(return_value={
            "success": True,
            "total": 10,
            "sent": 10,
            "failed": 0,
        })
        with patch(
            "app.features.morning_report.db.get_morning_report_by_date",
            new=AsyncMock(return_value=valid_report),
        ), patch(
            "app.features.subscription.email_service.EmailService.broadcast_morning_report",
            new=mock_broadcast,
        ):
            resp = await client.post(
                "/api/morning/broadcast",
                headers={"X-Cron-Secret": TEST_CRON_SECRET},
                timeout=30,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["total"] == 10
            mock_broadcast.assert_called_once()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
