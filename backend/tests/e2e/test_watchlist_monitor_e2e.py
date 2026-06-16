"""
E2E Tests for Watchlist Monitor API Endpoints.

Tests via httpx.AsyncClient + ASGITransport with database and LLM calls mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_watchlist_monitor_e2e.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.deps import verify_cron_secret, verify_user_token
from app.features.watchlist_monitor.models import (
    GenerateTickerResult,
    MonitorSummary,
    WatchlistMonitorResponse,
)
from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def restore_dependency_overrides():
    original = dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(original)


@pytest.mark.e2e
class TestWatchlistMonitorRead:
    """Tests for GET /api/watchlist-monitor."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/watchlist-monitor", timeout=30)

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_user_without_for_you_entitlement_returns_403(self, client):
        app.dependency_overrides[verify_user_token] = lambda: "free-user"

        with patch(
            "app.features.watchlist_monitor.router.has_entitlement",
            new_callable=AsyncMock,
            return_value=False,
        ) as mock_has_entitlement:
            resp = await client.get(
                "/api/watchlist-monitor",
                headers={"Authorization": "Bearer test-token"},
                timeout=30,
            )

        assert resp.status_code == 403
        mock_has_entitlement.assert_awaited_once_with("free-user", "for_you_website")

    @pytest.mark.asyncio
    async def test_entitled_user_receives_cached_monitor_payload(self, client):
        app.dependency_overrides[verify_user_token] = lambda: "pro-user"
        payload = WatchlistMonitorResponse(
            as_of="2026-06-16T16:00:00Z",
            symbols=["AAPL"],
            summary=MonitorSummary(needs_attention=1, new_signals=2),
            priority_items=[],
            ticker_rows=[],
            future_watchpoints=[],
            future_event_candidates=[],
            missing_symbols=[],
        )

        with (
            patch(
                "app.features.watchlist_monitor.router.has_entitlement",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_has_entitlement,
            patch(
                "app.features.watchlist_monitor.router.compose_monitor_for_user",
                new_callable=AsyncMock,
                return_value=payload,
            ) as mock_compose,
        ):
            resp = await client.get(
                "/api/watchlist-monitor",
                headers={"Authorization": "Bearer test-token"},
                timeout=30,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["symbols"] == ["AAPL"]
        assert data["summary"]["needs_attention"] == 1
        mock_has_entitlement.assert_awaited_once_with("pro-user", "for_you_website")
        mock_compose.assert_awaited_once_with("pro-user")


@pytest.mark.e2e
class TestWatchlistMonitorGenerate:
    """Tests for POST /api/admin/watchlist-monitor/generate-active-tickers."""

    @pytest.mark.asyncio
    async def test_generate_endpoint_uses_resolved_symbols_and_returns_results(self, client):
        app.dependency_overrides[verify_cron_secret] = lambda: None
        generated = [
            GenerateTickerResult(
                symbol="AAPL",
                success=True,
                status="watch",
                headline="AAPL 有待观察",
                priority_score=42,
            )
        ]

        with (
            patch(
                "app.features.watchlist_monitor.router.resolve_symbols_for_generation",
                new_callable=AsyncMock,
                return_value=["AAPL"],
            ) as mock_resolve,
            patch(
                "app.features.watchlist_monitor.router.generate_for_symbols",
                new_callable=AsyncMock,
                return_value=(generated, []),
            ) as mock_generate,
        ):
            resp = await client.post(
                "/api/admin/watchlist-monitor/generate-active-tickers",
                json={"symbols": ["aapl"], "limit": 5, "force": False},
                timeout=30,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["requested_symbols"] == ["AAPL"]
        assert data["generated"][0]["symbol"] == "AAPL"
        mock_resolve.assert_awaited_once_with(
            symbols=["AAPL"],
            user_id=None,
            limit=5,
        )
        mock_generate.assert_awaited_once_with(["AAPL"], force=False)
