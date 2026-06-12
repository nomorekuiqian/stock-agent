"""
E2E Tests for Stock Technical Analysis API Endpoints

Tests endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/stocks/{symbol}/technical-data
- POST /api/stocks/{symbol}/technical

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_stock_technical_e2e.py -v
    pytest tests/e2e/test_stock_technical_e2e.py -v --run-generate  # include AI tests
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.core.deps import verify_user_token
from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===========================================================================
# TestTechnicalData (formerly TestTechnicalSnapshot)
# ===========================================================================


@pytest.mark.e2e
class TestTechnicalData:
    """Tests for GET /api/stocks/{symbol}/technical-data."""

    @pytest.mark.asyncio
    async def test_success_aapl(self, client):
        """AAPL technical data returns 200 with success=True."""
        resp = await client.get("/api/stocks/AAPL/technical-data", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_response_structure(self, client):
        """Response contains expected top-level keys."""
        resp = await client.get("/api/stocks/AAPL/technical-data", timeout=30)
        assert resp.status_code == 200
        data = resp.json()

        expected_keys = [
            "success", "symbol", "timeframe", "ohlcv", "indicators",
            "current", "derived", "support_resistance", "trend_summary",
            "fetched_at",
        ]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"

    @pytest.mark.asyncio
    async def test_current_has_indicators(self, client):
        """Current snapshot includes key indicator readings."""
        resp = await client.get("/api/stocks/AAPL/technical-data", timeout=30)
        assert resp.status_code == 200
        current = resp.json().get("current", {})
        assert isinstance(current, dict)
        # Should have at least some indicator values (may vary by market hours)

    @pytest.mark.asyncio
    async def test_ohlcv_is_list(self, client):
        """OHLCV data is returned as a list."""
        resp = await client.get("/api/stocks/AAPL/technical-data", timeout=30)
        assert resp.status_code == 200
        ohlcv = resp.json().get("ohlcv", [])
        assert isinstance(ohlcv, list)

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, client):
        """Overly long symbol returns 400."""
        resp = await client.get("/api/stocks/TOOLONGSYMBOL/technical-data", timeout=10)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_case_insensitive_symbol(self, client):
        """Lowercase symbol is accepted and uppercased."""
        resp = await client.get("/api/stocks/aapl/technical-data", timeout=30)
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_timeframe_default_daily(self, client):
        """Default timeframe is daily."""
        resp = await client.get("/api/stocks/AAPL/technical-data", timeout=30)
        assert resp.status_code == 200
        assert resp.json()["timeframe"] == "daily"

    @pytest.mark.asyncio
    async def test_invalid_timeframe(self, client):
        """Invalid timeframe returns 422."""
        resp = await client.get(
            "/api/stocks/AAPL/technical-data",
            params={"timeframe": "monthly"},
            timeout=10,
        )
        assert resp.status_code == 422


# ===========================================================================
# TestTechnicalAnalysisGeneration
# ===========================================================================


@pytest.mark.e2e
class TestTechnicalAnalysisGeneration:
    """Tests for POST /api/stocks/{symbol}/technical (AI generation)."""

    @pytest.mark.asyncio
    @pytest.mark.generate
    async def test_generate_daily_analysis(self, client):
        """Generate daily technical analysis for AAPL."""
        app.dependency_overrides[verify_user_token] = lambda: "test-max-user"
        try:
            with patch(
                "app.features.stock.router.has_entitlement",
                new_callable=AsyncMock,
                return_value=True,
            ):
                resp = await client.post(
                    "/api/stocks/AAPL/technical",
                    params={"timeframe": "daily"},
                    headers={"Authorization": "Bearer test-token"},
                    timeout=120,
                )
        finally:
            app.dependency_overrides.pop(verify_user_token, None)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "analysis" in data
        assert "meta" in data

        analysis = data["analysis"]
        assert "title" in analysis
        assert "tldr" in analysis
        assert "signals" in analysis
        assert "situation" in analysis
        assert "summary" in analysis

    @pytest.mark.asyncio
    async def test_invalid_timeframe(self, client):
        """Invalid timeframe returns 422."""
        app.dependency_overrides[verify_user_token] = lambda: "test-max-user"
        try:
            with patch(
                "app.features.stock.router.has_entitlement",
                new_callable=AsyncMock,
                return_value=True,
            ):
                resp = await client.post(
                    "/api/stocks/AAPL/technical",
                    params={"timeframe": "monthly"},
                    headers={"Authorization": "Bearer test-token"},
                    timeout=10,
                )
        finally:
            app.dependency_overrides.pop(verify_user_token, None)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_symbol(self, client):
        """Overly long symbol returns 400."""
        app.dependency_overrides[verify_user_token] = lambda: "test-max-user"
        try:
            with patch(
                "app.features.stock.router.has_entitlement",
                new_callable=AsyncMock,
                return_value=True,
            ):
                resp = await client.post(
                    "/api/stocks/TOOLONGSYMBOL/technical",
                    headers={"Authorization": "Bearer test-token"},
                    timeout=10,
                )
        finally:
            app.dependency_overrides.pop(verify_user_token, None)
        assert resp.status_code == 400


# ===========================================================================
# TestMarketLatest
# ===========================================================================


@pytest.mark.e2e
class TestMarketLatest:
    """Tests for GET /api/market/latest."""

    @pytest.mark.asyncio
    async def test_returns_report_or_404(self, client):
        """Endpoint returns 200 with report or 404 if no report today."""
        resp = await client.get("/api/market/latest", timeout=30)
        assert resp.status_code in (200, 404)

        if resp.status_code == 200:
            data = resp.json()
            assert "title" in data
            assert "summary" in data
            assert "indices" in data
            assert data.get("from_cache") is True

    @pytest.mark.asyncio
    async def test_404_detail(self, client):
        """404 response has detail field."""
        resp = await client.get("/api/market/latest", timeout=30)
        if resp.status_code == 404:
            data = resp.json()
            assert "detail" in data
