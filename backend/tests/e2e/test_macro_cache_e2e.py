"""
E2E Tests for Macro Cache API Endpoints - generated from git diff

Tests:
- GET  /api/macro-cache/status
- POST /api/macro-cache/refresh (auth required)
- GET  /api/macro-risk/cpi-breakdown
- GET  /api/macro-risk/inflation-rates
- GET  /api/macro-risk/sentiment
- GET  /api/macro-risk/treasury-commodities

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_macro_cache_e2e.py -v
"""

import os
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
# TestCacheStatus
# ===========================================================================


@pytest.mark.e2e
class TestCacheStatus:
    """Tests for GET /api/macro-cache/status."""

    @pytest.mark.asyncio
    async def test_status_success(self, client):
        """Status returns 200 with success=True."""
        resp = await client.get("/api/macro-cache/status", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_status_has_entries(self, client):
        """Status includes entries list and count."""
        resp = await client.get("/api/macro-cache/status", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert "count" in data
        assert isinstance(data["entries"], list)
        assert isinstance(data["count"], int)


# ===========================================================================
# TestCacheRefreshAuth
# ===========================================================================


@pytest.mark.e2e
class TestCacheRefreshAuth:
    """Tests for POST /api/macro-cache/refresh (auth)."""

    @pytest.mark.asyncio
    async def test_refresh_requires_auth(self, client):
        """Refresh without X-Cron-Secret returns 401/403."""
        resp = await client.post("/api/macro-cache/refresh", timeout=10)
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_refresh_with_wrong_secret(self, client):
        """Refresh with wrong secret returns 401/403."""
        resp = await client.post(
            "/api/macro-cache/refresh",
            headers={"X-Cron-Secret": "wrong-secret"},
            timeout=10,
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_refresh_tier_validation(self, client):
        """Refresh with invalid tier returns 422."""
        cron_secret = os.getenv("CRON_SECRET", "")
        resp = await client.post(
            "/api/macro-cache/refresh?tier=invalid",
            headers={"X-Cron-Secret": cron_secret},
            timeout=10,
        )
        assert resp.status_code == 422


# ===========================================================================
# TestCpiBreakdown
# ===========================================================================


@pytest.mark.e2e
class TestCpiBreakdown:
    """Tests for GET /api/macro-risk/cpi-breakdown."""

    @pytest.mark.asyncio
    async def test_cpi_success(self, client):
        """CPI breakdown returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/cpi-breakdown", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_cpi_has_5_components(self, client):
        """CPI breakdown has 5 components."""
        resp = await client.get("/api/macro-risk/cpi-breakdown", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["components"]) == 5

    @pytest.mark.asyncio
    async def test_cpi_component_structure(self, client):
        """Each CPI component has required fields."""
        resp = await client.get("/api/macro-risk/cpi-breakdown", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        for comp in data["components"]:
            assert "series_id" in comp
            assert "name" in comp
            assert "name_zh" in comp
            assert "date" in comp
            assert "yoy_pct" in comp
            assert "mom_pct" in comp

    @pytest.mark.asyncio
    async def test_cpi_series_ids(self, client):
        """CPI includes expected series IDs."""
        resp = await client.get("/api/macro-risk/cpi-breakdown", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        series_ids = {c["series_id"] for c in data["components"]}
        assert "CPIAUCSL" in series_ids
        assert "CPILFESL" in series_ids
        assert "CPIUFDSL" in series_ids
        assert "CPIENGSL" in series_ids


# ===========================================================================
# TestInflationRates
# ===========================================================================


@pytest.mark.e2e
class TestInflationRates:
    """Tests for GET /api/macro-risk/inflation-rates."""

    @pytest.mark.asyncio
    async def test_inflation_success(self, client):
        """Inflation rates returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/inflation-rates", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_inflation_has_sub_dimensions(self, client):
        """Inflation rates has 2 sub-dimensions (inflation, rates)."""
        resp = await client.get("/api/macro-risk/inflation-rates", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        dims = data["data"]["sub_dimensions"]
        assert len(dims) == 2
        names = {d["name"] for d in dims}
        assert "inflation" in names
        assert "rates" in names


# ===========================================================================
# TestMarketSentiment
# ===========================================================================


@pytest.mark.e2e
class TestMarketSentiment:
    """Tests for GET /api/macro-risk/sentiment."""

    @pytest.mark.asyncio
    async def test_sentiment_success(self, client):
        """Sentiment returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/sentiment", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_sentiment_has_expected_sub_dimensions(self, client):
        """Sentiment has cnn_indicators, volatility, and breadth_options.
        Note: may return 3 (fresh) or 4 (old cache with credit) sub-dimensions."""
        resp = await client.get("/api/macro-risk/sentiment", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        dims = data["data"]["sub_dimensions"]
        assert len(dims) >= 3
        names = {d["name"] for d in dims}
        assert "cnn_indicators" in names
        assert "volatility" in names
        assert "breadth_options" in names

    @pytest.mark.asyncio
    async def test_sentiment_score_range(self, client):
        """overall_score is within 0-100 range (CNN scale)."""
        resp = await client.get("/api/macro-risk/sentiment", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        score = data["data"]["overall_score"]
        assert 0 <= score <= 100


# ===========================================================================
# TestTreasuryCommodities
# ===========================================================================


@pytest.mark.e2e
class TestTreasuryCommodities:
    """Tests for GET /api/macro-risk/treasury-commodities."""

    @pytest.mark.asyncio
    async def test_treasury_commodities_success(self, client):
        """Treasury-commodities returns 200 with success=True."""
        resp = await client.get("/api/macro-risk/treasury-commodities", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_treasury_commodities_structure(self, client):
        """Response has treasury, commodities, and dollar fields."""
        resp = await client.get("/api/macro-risk/treasury-commodities", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "treasury" in data
        assert "commodities" in data
        assert "dollar" in data
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_commodities_has_gold(self, client):
        """Commodities include gold."""
        resp = await client.get("/api/macro-risk/treasury-commodities", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        commodities = data["commodities"]
        # Gold may appear as "GCUSD" or "Gold" depending on the FMP mapping
        assert any(k in commodities for k in ("GCUSD", "Gold"))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
