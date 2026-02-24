"""
E2E Tests for Health / Readiness / Exception-Handler Endpoints -- generated from git diff

Tests via httpx.AsyncClient + ASGITransport.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_health_e2e.py -v
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


# ============================================================
# GET /health
# ============================================================


@pytest.mark.e2e
class TestHealthEndpoint:
    """Tests for GET /health."""

    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        """Health endpoint returns 200."""
        resp = await client.get("/health", timeout=10)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_response_shape(self, client):
        """Response contains status and timestamp."""
        resp = await client.get("/health", timeout=10)
        data = resp.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))

    @pytest.mark.asyncio
    async def test_health_timestamp_is_recent(self, client):
        """Timestamp is a recent unix epoch (after 2025-01-01)."""
        import time
        resp = await client.get("/health", timeout=10)
        ts = resp.json()["timestamp"]
        # Must be after 2025-01-01 and not too far in the future
        assert ts > 1_735_689_600  # 2025-01-01
        assert ts < time.time() + 60


# ============================================================
# GET /ready
# ============================================================


@pytest.mark.e2e
class TestReadinessEndpoint:
    """Tests for GET /ready."""

    @pytest.mark.asyncio
    async def test_ready_returns_status(self, client):
        """Readiness endpoint returns 200 or 503 with status field."""
        resp = await client.get("/ready", timeout=15)
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "status" in data
        assert data["status"] in ("ready", "degraded")

    @pytest.mark.asyncio
    async def test_ready_contains_checks(self, client):
        """Response includes checks dict with expected keys."""
        resp = await client.get("/ready", timeout=15)
        data = resp.json()
        checks = data.get("checks", {})
        assert "insforge" in checks
        assert "google_api_key" in checks
        assert "fmp_api_key" in checks

    @pytest.mark.asyncio
    async def test_ready_check_values_are_valid(self, client):
        """Each check value is one of ok, degraded, missing, error."""
        resp = await client.get("/ready", timeout=15)
        checks = resp.json().get("checks", {})
        valid_values = {"ok", "degraded", "missing", "error"}
        for key, val in checks.items():
            assert val in valid_values, f"checks[{key}] = {val!r} not in {valid_values}"


# ============================================================
# GET / (root)
# ============================================================


@pytest.mark.e2e
class TestRootEndpoint:
    """Tests for GET / (basic smoke test)."""

    @pytest.mark.asyncio
    async def test_root_returns_200(self, client):
        """Root endpoint returns 200."""
        resp = await client.get("/", timeout=10)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_root_has_message(self, client):
        """Root response contains a message field."""
        resp = await client.get("/", timeout=10)
        data = resp.json()
        assert "message" in data


# ============================================================
# Validation error handler (422)
# ============================================================


@pytest.mark.e2e
class TestValidationErrorHandler:
    """Tests for custom validation error handler."""

    @pytest.mark.asyncio
    async def test_invalid_body_returns_422(self, client):
        """POST with completely wrong content-type triggers validation error."""
        # Send a non-JSON body to an endpoint that expects JSON
        resp = await client.post(
            "/api/subscriptions/daily_report/subscribe",
            content=b"not json",
            headers={"content-type": "application/json"},
            timeout=10,
        )
        assert resp.status_code == 422
        data = resp.json()
        assert "error" in data or "detail" in data
