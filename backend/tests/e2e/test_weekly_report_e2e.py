"""
E2E Tests for Weekly Macro Report API Endpoints

Tests 3 endpoint groups via httpx.AsyncClient + ASGITransport:
- GET /api/weekly-report          (get latest / by week, with caching)
- GET /api/weekly-report/list     (pagination)
- POST /api/weekly-report/generate (auth protection)

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_weekly_report_e2e.py -v
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
# TestWeeklyReportGet
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportGet:
    """Tests for GET /api/weekly-report."""

    @pytest.mark.asyncio
    async def test_get_latest_success(self, client):
        """GET /api/weekly-report returns 200 with success=True."""
        resp = await client.get("/api/weekly-report", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_get_latest_data_structure(self, client):
        """When data exists, response contains new schema fields."""
        resp = await client.get("/api/weekly-report", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        # If there's data, verify new schema structure
        if data["data"] is not None:
            report = data["data"]
            assert "week_label" in report
            assert "signal_lights" in report
            # New schema fields
            assert "title" in report
            assert "verdict" in report
            assert "landscape" in report
            assert "narrative" in report
            assert "takeaway" in report
            # Old fields should not be present
            assert "executive_summary" not in report
            assert "investment_implications" not in report

    @pytest.mark.asyncio
    async def test_get_latest_no_raw_data(self, client):
        """GET /api/weekly-report strips raw_data from response."""
        resp = await client.get("/api/weekly-report", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        if data["data"] is not None:
            assert "raw_data" not in data["data"]

    @pytest.mark.asyncio
    async def test_get_by_week_not_found(self, client):
        """GET /api/weekly-report?week=1999.W01 returns 200 with data=null."""
        resp = await client.get(
            "/api/weekly-report",
            params={"week": "1999.W01"},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"] is None

    @pytest.mark.asyncio
    async def test_get_latest_null_data(self, client):
        """Even if DB is empty, returns 200 (not 500) with data field present."""
        resp = await client.get("/api/weekly-report", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "data" in data


# ===========================================================================
# TestWeeklyReportList
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportList:
    """Tests for GET /api/weekly-report/list."""

    @pytest.mark.asyncio
    async def test_list_success(self, client):
        """GET /api/weekly-report/list returns 200 with data as list."""
        resp = await client.get("/api/weekly-report/list", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    @pytest.mark.asyncio
    async def test_list_pagination(self, client):
        """Pagination params limit and offset are accepted."""
        resp = await client.get(
            "/api/weekly-report/list",
            params={"limit": 5, "offset": 0},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    @pytest.mark.asyncio
    async def test_list_validation(self, client):
        """Invalid limit values return 422."""
        # limit=0 is below ge=1
        resp_zero = await client.get(
            "/api/weekly-report/list",
            params={"limit": 0},
            timeout=10,
        )
        assert resp_zero.status_code == 422

        # limit=200 is above le=100
        resp_large = await client.get(
            "/api/weekly-report/list",
            params={"limit": 200},
            timeout=10,
        )
        assert resp_large.status_code == 422


# ===========================================================================
# TestWeeklyReportGenerate
# ===========================================================================


@pytest.mark.e2e
class TestWeeklyReportGenerate:
    """Tests for POST /api/weekly-report/generate (auth only)."""

    @pytest.mark.asyncio
    async def test_generate_no_secret(self, client):
        """POST without X-Cron-Secret header returns 401."""
        resp = await client.post("/api/weekly-report/generate", timeout=10)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_generate_wrong_secret(self, client):
        """POST with incorrect X-Cron-Secret returns 401."""
        resp = await client.post(
            "/api/weekly-report/generate",
            headers={"X-Cron-Secret": "wrong-secret-value"},
            timeout=10,
        )
        assert resp.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
