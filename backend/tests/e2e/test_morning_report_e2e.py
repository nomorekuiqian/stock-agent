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

from app.main import app


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
