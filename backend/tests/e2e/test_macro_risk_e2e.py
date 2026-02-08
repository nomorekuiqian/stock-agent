"""
E2E Tests for Macro Risk Dashboard API Endpoints

Tests 3 endpoints via httpx.AsyncClient + ASGITransport:
- GET /api/macro-risk/dashboard
- GET /api/macro-risk/economy
- GET /api/macro-risk/history/{series_id}

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_macro_risk_e2e.py -v
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
# TestMacroRiskDashboard
# ===========================================================================


@pytest.mark.e2e
class TestMacroRiskDashboard:
    """Tests for GET /api/macro-risk/dashboard."""

    @pytest.mark.asyncio
    async def test_dashboard_success(self, client):
        """Dashboard returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_dashboard_structure(self, client):
        """Response contains all expected top-level fields."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "composite_score" in data
        assert "composite_level" in data
        assert "categories" in data
        assert "ai_stocks" in data
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_dashboard_categories_count(self, client):
        """Dashboard returns exactly 4 categories."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["categories"]) == 4

    @pytest.mark.asyncio
    async def test_dashboard_score_range(self, client):
        """composite_score is within 0-10 range."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert 0 <= data["composite_score"] <= 10

    @pytest.mark.asyncio
    async def test_dashboard_level_values(self, client):
        """composite_level is one of low/medium/high."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["composite_level"] in ("low", "medium", "high")

    @pytest.mark.asyncio
    async def test_dashboard_category_structure(self, client):
        """Each category has required fields."""
        resp = await client.get("/api/macro-risk/dashboard", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        for cat in data["categories"]:
            assert "category_id" in cat
            assert "category_name" in cat
            assert "risk_score" in cat
            assert "risk_level" in cat
            assert "headline" in cat
            assert "indicators" in cat
            assert 0 <= cat["risk_score"] <= 10
            assert cat["risk_level"] in ("low", "medium", "high")


# ===========================================================================
# TestEconomicFundamentals
# ===========================================================================


@pytest.mark.e2e
class TestEconomicFundamentals:
    """Tests for GET /api/macro-risk/economy."""

    @pytest.mark.asyncio
    async def test_economy_success(self, client):
        """Economy endpoint returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/economy", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_economy_structure(self, client):
        """Response has data.overall_score and sub_dimensions."""
        resp = await client.get("/api/macro-risk/economy", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "overall_score" in data["data"]
        assert "overall_level" in data["data"]
        assert "overall_headline" in data["data"]
        assert "sub_dimensions" in data["data"]

    @pytest.mark.asyncio
    async def test_economy_sub_dimensions_count(self, client):
        """Economy has exactly 4 sub-dimensions."""
        resp = await client.get("/api/macro-risk/economy", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]["sub_dimensions"]) == 4

    @pytest.mark.asyncio
    async def test_economy_score_range(self, client):
        """overall_score is within 0-10 range."""
        resp = await client.get("/api/macro-risk/economy", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert 0 <= data["data"]["overall_score"] <= 10

    @pytest.mark.asyncio
    async def test_economy_sub_dimension_structure(self, client):
        """Each sub-dimension has required fields."""
        resp = await client.get("/api/macro-risk/economy", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        for dim in data["data"]["sub_dimensions"]:
            assert "name" in dim
            assert "name_zh" in dim
            assert "score" in dim
            assert "risk_level" in dim
            assert "weight" in dim
            assert "headline" in dim
            assert "indicators" in dim
            assert 0 <= dim["score"] <= 10


# ===========================================================================
# TestSeriesHistory
# ===========================================================================


@pytest.mark.e2e
class TestSeriesHistory:
    """Tests for GET /api/macro-risk/history/{series_id}."""

    @pytest.mark.asyncio
    async def test_valid_series(self, client):
        """T10Y2Y returns 200 with data."""
        resp = await client.get("/api/macro-risk/history/T10Y2Y", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "data" in data

    @pytest.mark.asyncio
    async def test_invalid_series(self, client):
        """Unsupported series ID returns 400."""
        resp = await client.get("/api/macro-risk/history/FAKESERIES123", timeout=10)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_custom_days(self, client):
        """days=90 parameter works."""
        resp = await client.get(
            "/api/macro-risk/history/T10Y2Y",
            params={"days": 90},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_days_validation_too_small(self, client):
        """days < 30 returns 422 (validation error)."""
        resp = await client.get(
            "/api/macro-risk/history/T10Y2Y",
            params={"days": 10},
            timeout=10,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_days_validation_too_large(self, client):
        """days > 1825 returns 422 (validation error)."""
        resp = await client.get(
            "/api/macro-risk/history/T10Y2Y",
            params={"days": 5000},
            timeout=10,
        )
        assert resp.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
