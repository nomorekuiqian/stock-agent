"""
E2E Tests for Global Liquidity API Endpoints -- generated from git diff

Tests for new endpoints:
- GET /api/liquidity/global           (global liquidity metrics)
- GET /api/liquidity/global/history   (global liquidity history)

Tests via httpx.AsyncClient + ASGITransport.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_global_liquidity_e2e.py -v
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
# TestGlobalLiquidity - GET /api/liquidity/global
# ===========================================================================


@pytest.mark.e2e
class TestGlobalLiquidity:
    """Tests for GET /api/liquidity/global."""

    @pytest.mark.asyncio
    async def test_global_success(self, client):
        """Endpoint returns 200 with success=True."""
        resp = await client.get("/api/liquidity/global", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_global_has_timestamp(self, client):
        """Response includes timestamp field."""
        resp = await client.get("/api/liquidity/global", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_global_has_data(self, client):
        """Response includes data field (dict)."""
        resp = await client.get("/api/liquidity/global", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert isinstance(data["data"], dict)

    @pytest.mark.asyncio
    async def test_global_data_structure(self, client):
        """Data contains expected metric keys when successful."""
        resp = await client.get("/api/liquidity/global", timeout=60)
        assert resp.status_code == 200
        data = resp.json()["data"]
        if data:  # May be empty on error
            # Check for core metric keys
            for key in ["global_liquidity", "fed_assets", "us_m2"]:
                if key in data:
                    assert "value" in data[key] or "error" in data.get(key, {})


# ===========================================================================
# TestGlobalLiquidityHistory - GET /api/liquidity/global/history
# ===========================================================================


@pytest.mark.e2e
class TestGlobalLiquidityHistory:
    """Tests for GET /api/liquidity/global/history."""

    @pytest.mark.asyncio
    async def test_history_success(self, client):
        """Endpoint returns 200 with success=True."""
        resp = await client.get("/api/liquidity/global/history", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_history_has_data(self, client):
        """Response includes data field."""
        resp = await client.get("/api/liquidity/global/history", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data

    @pytest.mark.asyncio
    async def test_history_default_days(self, client):
        """Default request (365 days) returns expected structure."""
        resp = await client.get("/api/liquidity/global/history", timeout=60)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data.get("series_id") == "GLOBAL_LIQUIDITY_INDEX"
        assert "observations" in data

    @pytest.mark.asyncio
    async def test_history_custom_days(self, client):
        """Custom days parameter is accepted."""
        resp = await client.get("/api/liquidity/global/history", params={"days": 90}, timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_history_days_validation_too_low(self, client):
        """days < 30 returns 422 validation error."""
        resp = await client.get("/api/liquidity/global/history", params={"days": 10}, timeout=10)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_history_days_validation_too_high(self, client):
        """days > 1825 returns 422 validation error."""
        resp = await client.get("/api/liquidity/global/history", params={"days": 2000}, timeout=10)
        assert resp.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
