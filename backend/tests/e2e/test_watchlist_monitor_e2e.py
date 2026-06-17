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
    GeneratePaidUniverseResponse,
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
            "app.features.watchlist_monitor.router.has_feature_entitlement",
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
            summary=MonitorSummary(new_signals=2),
            ticker_rows=[],
            future_watchpoints=[],
            future_event_candidates=[],
            missing_symbols=[],
        )

        with (
            patch(
                "app.features.watchlist_monitor.router.has_feature_entitlement",
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
        assert set(data["summary"]) == {
            "new_signals",
            "next_7d_watchpoints",
            "stale_tickers",
        }
        assert data["summary"]["new_signals"] == 2
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
                headline="AAPL 有待观察",
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

    @pytest.mark.asyncio
    async def test_generate_paid_universe_endpoint_uses_paid_universe_service(self, client):
        app.dependency_overrides[verify_cron_secret] = lambda: None
        payload = GeneratePaidUniverseResponse(
            success=True,
            dry_run=True,
            entitlement_feature="for_you_website",
            entitled_user_count=2,
            processed_user_count=2,
            users_with_watchlist_count=1,
            empty_user_count=1,
            requested_symbols=["AAPL", "MSFT"],
            symbol_count=2,
        )

        with patch(
            "app.features.watchlist_monitor.router.generate_paid_user_universe",
            new_callable=AsyncMock,
            return_value=payload,
        ) as mock_generate:
            resp = await client.post(
                "/api/admin/watchlist-monitor/generate-paid-universe",
                json={
                    "user_limit": 100,
                    "limit_per_user": 25,
                    "force": False,
                    "dry_run": True,
                },
                timeout=30,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["entitlement_feature"] == "for_you_website"
        assert data["symbol_count"] == 2
        mock_generate.assert_awaited_once_with(
            user_limit=100,
            limit_per_user=25,
            force=False,
            dry_run=True,
        )
