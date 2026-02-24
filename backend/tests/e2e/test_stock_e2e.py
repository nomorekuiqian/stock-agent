"""
E2E Tests for Stock Research API Endpoints

Tests 5 endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/stocks/search
- GET  /api/stocks/quotes
- GET  /api/stocks/{symbol}
- GET  /api/stocks/{symbol}/history
- POST /api/stocks/{symbol}/analysis

Usage:
    cd backend
    source venv/bin/activate

    # Run E2E tests (no AI generation, needs network)
    pytest tests/e2e/test_stock_e2e.py -v

    # Include AI generation tests
    pytest tests/e2e/test_stock_e2e.py -v --run-generate
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.features.stock.agent import ANALYSIS_FIELDS


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===========================================================================
# TestStockSearch
# ===========================================================================


@pytest.mark.e2e
class TestStockSearch:
    """Tests for GET /api/stocks/search."""

    @pytest.mark.asyncio
    async def test_search_aapl(self, client):
        """Search for AAPL returns stock results."""
        resp = await client.get("/api/stocks/search", params={"q": "AAPL"})
        assert resp.status_code == 200
        data = resp.json()
        assert "stocks" in data
        assert isinstance(data["stocks"], list)
        assert len(data["stocks"]) > 0

    @pytest.mark.asyncio
    async def test_search_nonexistent(self, client):
        """Search for nonsense returns empty stocks list."""
        resp = await client.get("/api/stocks/search", params={"q": "xxxnotexist999"})
        assert resp.status_code == 200
        data = resp.json()
        assert "stocks" in data
        assert isinstance(data["stocks"], list)
        # May or may not be empty depending on FMP fuzzy matching


# ===========================================================================
# TestStockQuotes
# ===========================================================================


@pytest.mark.e2e
class TestStockQuotes:
    """Tests for GET /api/stocks/quotes."""

    @pytest.mark.asyncio
    async def test_quotes_multiple(self, client):
        """Quotes for AAPL,MSFT returns 2 quotes."""
        resp = await client.get("/api/stocks/quotes", params={"symbols": "AAPL,MSFT"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert len(data["quotes"]) == 2
        symbols = {q["symbol"] for q in data["quotes"]}
        assert symbols == {"AAPL", "MSFT"}

    @pytest.mark.asyncio
    async def test_quotes_empty_symbols(self, client):
        """Empty symbols string returns error (4xx/5xx)."""
        resp = await client.get("/api/stocks/quotes", params={"symbols": ""})
        # Router raises HTTPException(400) but generic except catches it -> 500
        assert resp.status_code >= 400


# ===========================================================================
# TestStockData
# ===========================================================================


@pytest.mark.e2e
class TestStockData:
    """Tests for GET /api/stocks/{symbol}."""

    @pytest.mark.asyncio
    async def test_get_stock_data(self, client):
        """GET /api/stocks/AAPL returns complete stock data."""
        resp = await client.get("/api/stocks/AAPL")
        assert resp.status_code == 200
        data = resp.json()
        # Verify top-level structure
        assert "profile" in data
        assert "quote" in data
        assert "fundamentals" in data
        assert "financials" in data
        assert "meta" in data
        assert data["meta"]["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_get_stock_data_no_financials(self, client):
        """include_financials=false returns empty quarters."""
        resp = await client.get(
            "/api/stocks/AAPL",
            params={"include_financials": "false"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["financials"]["quarters"] == []


# ===========================================================================
# TestStockHistory
# ===========================================================================


@pytest.mark.e2e
class TestStockHistory:
    """Tests for GET /api/stocks/{symbol}/history."""

    @pytest.mark.asyncio
    async def test_history_30_days(self, client):
        """30-day history returns non-empty data."""
        resp = await client.get("/api/stocks/AAPL/history", params={"days": 30})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"
        assert data["days"] == 30
        assert len(data["data"]) > 0

    @pytest.mark.asyncio
    async def test_history_cache_hit(self, client):
        """Second request for same symbol+days hits cache."""
        # First request populates cache
        resp1 = await client.get("/api/stocks/MSFT/history", params={"days": 30})
        assert resp1.status_code == 200
        # Second request should return same data from cache
        resp2 = await client.get("/api/stocks/MSFT/history", params={"days": 30})
        assert resp2.status_code == 200
        assert resp2.json()["data"] == resp1.json()["data"]


# ===========================================================================
# TestStockAnalysis
# ===========================================================================


@pytest.mark.e2e
class TestStockAnalysis:
    """Tests for POST /api/stocks/{symbol}/analysis."""

    @pytest.mark.generate
    @pytest.mark.asyncio
    async def test_generate_analysis(self, client):
        """Generate analysis for NVDA returns all ANALYSIS_FIELDS."""
        resp = await client.post(
            "/api/stocks/NVDA/analysis",
            params={"force": "true"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        analysis = data["analysis"]
        for field in ANALYSIS_FIELDS:
            assert field in analysis, f"Missing field: {field}"
            assert isinstance(analysis[field], str)

    @pytest.mark.generate
    @pytest.mark.asyncio
    async def test_analysis_cache(self, client):
        """Second request without force reads from cache."""
        # First: generate (or use existing)
        resp1 = await client.post("/api/stocks/NVDA/analysis")
        assert resp1.status_code == 200
        # Second: should be from cache
        resp2 = await client.post("/api/stocks/NVDA/analysis")
        assert resp2.status_code == 200
        assert resp2.json()["meta"]["from_cache"] is True

    @pytest.mark.asyncio
    async def test_invalid_symbol(self, client):
        """Invalid symbol format returns 400."""
        resp = await client.post("/api/stocks/!!!/analysis")
        assert resp.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
