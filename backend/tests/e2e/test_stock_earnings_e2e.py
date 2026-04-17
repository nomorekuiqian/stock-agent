"""
E2E Tests for Stock Earnings, News Feed & Insider Trading Endpoints
-- generated from git diff

Tests via httpx.AsyncClient + ASGITransport:
- GET  /api/stocks/{symbol}/earnings-data
- GET  /api/stocks/{symbol}/news-feed
- GET  /api/stocks/{symbol}/insider-trading

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_stock_earnings_e2e.py -v
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
# TestEarningsData
# ===========================================================================


@pytest.mark.e2e
class TestEarningsData:
    """Tests for GET /api/stocks/{symbol}/earnings-data."""

    @pytest.mark.asyncio
    async def test_earnings_data_success(self, client):
        """Endpoint returns 200 with success=True for AAPL."""
        resp = await client.get("/api/stocks/AAPL/earnings-data", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_earnings_data_structure(self, client):
        """Response contains expected fields."""
        resp = await client.get("/api/stocks/AAPL/earnings-data", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        expected_fields = [
            "symbol", "earnings_history", "analyst_estimates",
            "revenue_segments", "revenue_geo_segments",
            "financial_growth", "next_earnings_date",
            "dcf_value", "stock_price",
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"

    @pytest.mark.asyncio
    async def test_earnings_history_is_list(self, client):
        """earnings_history is a list."""
        resp = await client.get("/api/stocks/AAPL/earnings-data", timeout=60)
        data = resp.json()
        assert isinstance(data["earnings_history"], list)

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, client):
        """Invalid symbol format returns 400."""
        resp = await client.get("/api/stocks/INVALID!!!/earnings-data", timeout=10)
        assert resp.status_code == 400


# ===========================================================================
# TestNewsFeed
# ===========================================================================


@pytest.mark.e2e
class TestNewsFeed:
    """Tests for GET /api/stocks/{symbol}/news-feed."""

    @pytest.mark.asyncio
    async def test_news_feed_success(self, client):
        """Endpoint returns 200 with success=True."""
        resp = await client.get("/api/stocks/AAPL/news-feed", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_news_feed_structure(self, client):
        """Response contains expected fields."""
        resp = await client.get("/api/stocks/AAPL/news-feed", timeout=60)
        data = resp.json()
        assert "news" in data
        assert "count" in data
        assert isinstance(data["news"], list)
        assert isinstance(data["count"], int)

    @pytest.mark.asyncio
    async def test_news_feed_custom_days(self, client):
        """days parameter is accepted."""
        resp = await client.get(
            "/api/stocks/AAPL/news-feed", params={"days": 3}, timeout=60
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["days"] == 3

    @pytest.mark.asyncio
    async def test_news_feed_invalid_days(self, client):
        """days out of range returns 422."""
        resp = await client.get(
            "/api/stocks/AAPL/news-feed", params={"days": 100}, timeout=10
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_news_article_structure(self, client):
        """Each article has expected fields."""
        resp = await client.get("/api/stocks/AAPL/news-feed", timeout=60)
        data = resp.json()
        if data["news"]:
            article = data["news"][0]
            for field in ["title", "publishedDate", "source", "url"]:
                assert field in article, f"Missing field in article: {field}"

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, client):
        """Invalid symbol format returns 400."""
        resp = await client.get("/api/stocks/BAD@SYM/news-feed", timeout=10)
        assert resp.status_code == 400


# ===========================================================================
# TestInsiderTrading
# ===========================================================================


@pytest.mark.e2e
class TestInsiderTrading:
    """Tests for GET /api/stocks/{symbol}/insider-trading."""

    @pytest.mark.asyncio
    async def test_insider_trading_success(self, client):
        """Endpoint returns 200 with success=True."""
        resp = await client.get("/api/stocks/AAPL/insider-trading", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbol"] == "AAPL"

    @pytest.mark.asyncio
    async def test_insider_trading_structure(self, client):
        """Response contains trades and statistics lists."""
        resp = await client.get("/api/stocks/AAPL/insider-trading", timeout=60)
        data = resp.json()
        assert "trades" in data
        assert "statistics" in data
        assert isinstance(data["trades"], list)
        assert isinstance(data["statistics"], list)

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, client):
        """Invalid symbol format returns 400."""
        resp = await client.get("/api/stocks/TOOLONGSYMBOL/insider-trading", timeout=10)
        assert resp.status_code == 400
