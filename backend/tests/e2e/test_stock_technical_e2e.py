"""
E2E Tests for Stock Technical Analysis API Endpoints -- generated from git diff

Tests new endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/stocks/{symbol}/technical-snapshot
- POST /api/stocks/{symbol}/technical

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_stock_technical_e2e.py -v
    pytest tests/e2e/test_stock_technical_e2e.py -v --run-generate  # include AI tests
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
# TestTechnicalSnapshot
# ===========================================================================


@pytest.mark.e2e
class TestTechnicalSnapshot:
    """Tests for GET /api/stocks/{symbol}/technical-snapshot."""

    @pytest.mark.asyncio
    async def test_success_aapl(self, client):
        """AAPL snapshot returns 200 with success=True."""
        resp = await client.get("/api/stocks/AAPL/technical-snapshot", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_response_structure(self, client):
        """Response contains expected top-level keys."""
        resp = await client.get("/api/stocks/AAPL/technical-snapshot", timeout=30)
        assert resp.status_code == 200
        data = resp.json()

        expected_keys = [
            "success", "symbol", "ratings", "oscillators", "trend",
            "moving_averages", "volatility", "price_volume",
            "support_resistance", "trend_context", "pattern_signals",
            "derived", "fetched_at",
        ]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"

    @pytest.mark.asyncio
    async def test_ratings_structure(self, client):
        """Ratings contain expected fields."""
        resp = await client.get("/api/stocks/MSFT/technical-snapshot", timeout=30)
        assert resp.status_code == 200
        ratings = resp.json().get("ratings", {})
        assert isinstance(ratings, dict)

    @pytest.mark.asyncio
    async def test_oscillators_have_rsi(self, client):
        """Oscillators include rsi_14."""
        resp = await client.get("/api/stocks/AAPL/technical-snapshot", timeout=30)
        assert resp.status_code == 200
        osc = resp.json().get("oscillators", {})
        assert "rsi_14" in osc

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, client):
        """Overly long symbol returns 400."""
        resp = await client.get("/api/stocks/TOOLONGSYMBOL/technical-snapshot", timeout=10)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_case_insensitive_symbol(self, client):
        """Lowercase symbol is accepted and uppercased."""
        resp = await client.get("/api/stocks/aapl/technical-snapshot", timeout=30)
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "AAPL"


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
        resp = await client.post(
            "/api/stocks/AAPL/technical",
            params={"timeframe": "daily"},
            timeout=120,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "analysis" in data
        assert "meta" in data

        analysis = data["analysis"]
        assert "title" in analysis
        assert "trend_analysis" in analysis
        assert "entry_exit_signals" in analysis
        assert "pattern_analysis" in analysis
        assert "technical_summary" in analysis

    @pytest.mark.asyncio
    async def test_invalid_timeframe(self, client):
        """Invalid timeframe returns 422."""
        resp = await client.post(
            "/api/stocks/AAPL/technical",
            params={"timeframe": "monthly"},
            timeout=10,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_symbol(self, client):
        """Overly long symbol returns 400."""
        resp = await client.post("/api/stocks/TOOLONGSYMBOL/technical", timeout=10)
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
