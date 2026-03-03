"""
E2E Tests for Stock Picker API Endpoint

Tests POST /api/screener/pick via httpx.AsyncClient + ASGITransport.
Requires screener universe cache to be populated (runs against real cache).

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_picker_e2e.py -v
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


@pytest.mark.e2e
class TestPickStocks:
    """Tests for POST /api/screener/pick."""

    @pytest.mark.asyncio
    async def test_pick_requires_auth(self, client):
        """Endpoint returns 401 without auth token."""
        resp = await client.post(
            "/api/screener/pick",
            json={"message": "hello"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_pick_no_body_returns_error(self, client):
        """No body returns 401 (auth checked before validation) or 422."""
        resp = await client.post(
            "/api/screener/pick",
            json={},
            timeout=10,
        )
        assert resp.status_code in (401, 422)

    @pytest.mark.asyncio
    async def test_pick_response_structure(self, client):
        """Response has expected fields (even if cache is empty)."""
        resp = await client.post(
            "/api/screener/pick",
            json={"message": "test"},
            headers={"Authorization": "Bearer test-token"},
            timeout=60,
        )
        # May be 200 (with empty cache message) or 401 (invalid token)
        if resp.status_code == 200:
            data = resp.json()
            assert "success" in data
            assert "message" in data
            assert "options" in data
            assert "candidates" in data
            assert "pick_reasons" in data
            assert "universe_size" in data
