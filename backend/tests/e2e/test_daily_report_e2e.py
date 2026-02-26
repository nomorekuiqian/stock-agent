"""
E2E Tests for Daily Report (Market Report) Read-Only API Endpoints

Tests 4 read-only endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/market/reports          (list reports with pagination)
- GET  /api/market/reports/latest   (most recent report)
- GET  /api/market/reports/date/{date}  (report by date)
- GET  /api/market/reports/{report_id}  (report by UUID)

All endpoints are public (no auth required).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_daily_report_e2e.py -v
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
# TestListMarketReports
# ===========================================================================


@pytest.mark.e2e
class TestListMarketReports:
    """Tests for GET /api/market/reports."""

    @pytest.mark.asyncio
    async def test_returns_200(self, client):
        """List reports endpoint returns 200."""
        resp = await client.get("/api/market/reports", timeout=30)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_response_structure(self, client):
        """Response contains success=True and data as a list."""
        resp = await client.get("/api/market/reports", timeout=30)
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    @pytest.mark.asyncio
    async def test_pagination_params(self, client):
        """Response includes limit and offset pagination fields."""
        resp = await client.get(
            "/api/market/reports",
            params={"limit": 5, "offset": 2},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 5
        assert data["offset"] == 2


# ===========================================================================
# TestGetLatestReport
# ===========================================================================


@pytest.mark.e2e
class TestGetLatestReport:
    """Tests for GET /api/market/reports/latest."""

    @pytest.mark.asyncio
    async def test_returns_200_or_404(self, client):
        """Latest report returns 200 if data exists, 404 otherwise."""
        resp = await client.get("/api/market/reports/latest", timeout=30)
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_response_has_report_date(self, client):
        """If 200, the response data contains a report_date field."""
        resp = await client.get("/api/market/reports/latest", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            assert data["success"] is True
            assert "report_date" in data["data"]


# ===========================================================================
# TestGetReportByDate
# ===========================================================================


@pytest.mark.e2e
class TestGetReportByDate:
    """Tests for GET /api/market/reports/date/{date}."""

    @pytest.mark.asyncio
    async def test_invalid_date_returns_404(self, client):
        """A date with no report returns 404."""
        resp = await client.get(
            "/api/market/reports/date/1999-01-01", timeout=30
        )
        assert resp.status_code == 404


# ===========================================================================
# TestGetReportById
# ===========================================================================


@pytest.mark.e2e
class TestGetReportById:
    """Tests for GET /api/market/reports/{report_id}."""

    @pytest.mark.asyncio
    async def test_invalid_id_returns_404(self, client):
        """A non-existent UUID returns 404."""
        resp = await client.get(
            "/api/market/reports/00000000-0000-0000-0000-000000000000",
            timeout=30,
        )
        assert resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
