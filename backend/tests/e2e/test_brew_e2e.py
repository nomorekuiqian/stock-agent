"""
E2E Tests for Brew (Personalized Digest) API Endpoints

Tests 4 authenticated endpoints via httpx.AsyncClient + ASGITransport:
- GET  /api/watchlist              (get user watchlist)
- PUT  /api/watchlist              (save user watchlist)
- GET  /api/digests                (list user digests)
- GET  /api/digests/{digest_id}    (get digest by ID)

All endpoints require authentication via verify_user_token (Bearer token).
Unauthenticated requests should return 401.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_brew_e2e.py -v
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
# TestGetWatchlist
# ===========================================================================


@pytest.mark.e2e
class TestGetWatchlist:
    """Tests for GET /api/watchlist."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_error(self, client):
        """Request without Authorization header returns 401."""
        resp = await client.get("/api/watchlist", timeout=30)
        assert resp.status_code == 401


# ===========================================================================
# TestSaveWatchlist
# ===========================================================================


@pytest.mark.e2e
class TestSaveWatchlist:
    """Tests for PUT /api/watchlist."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_error(self, client):
        """Request without Authorization header returns 401."""
        resp = await client.put(
            "/api/watchlist",
            json={"symbols": ["AAPL", "MSFT"], "email": "test@example.com"},
            timeout=30,
        )
        assert resp.status_code == 401


# ===========================================================================
# TestListDigests
# ===========================================================================


@pytest.mark.e2e
class TestListDigests:
    """Tests for GET /api/digests."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_error(self, client):
        """Request without Authorization header returns 401."""
        resp = await client.get("/api/digests", timeout=30)
        assert resp.status_code == 401


# ===========================================================================
# TestGetDigestById
# ===========================================================================


@pytest.mark.e2e
class TestGetDigestById:
    """Tests for GET /api/digests/{digest_id}."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_error(self, client):
        """Request without Authorization header returns 401."""
        resp = await client.get(
            "/api/digests/00000000-0000-0000-0000-000000000000",
            timeout=30,
        )
        assert resp.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
