"""Unit tests for FRED service caching and error handling."""

import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.features.macro.liquidity import fred_service


class _FailingFredClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        request = httpx.Request("GET", url, params=params)
        return httpx.Response(429, request=request, json={"error_message": "rate limited"})


class _UnexpectedFredClient:
    async def __aenter__(self):
        raise AssertionError("FRED client should not be opened when DB cache is valid")

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _CountingFredClient:
    calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        self.__class__.calls.append((url, params))
        await asyncio.sleep(0.01)
        request = httpx.Request("GET", url, params=params)
        if url.endswith("/series"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "seriess": [
                        {
                            "title": "Fed Assets",
                            "units": "Millions of U.S. Dollars",
                            "frequency": "Weekly",
                            "last_updated": "2026-01-02",
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            request=request,
            json={
                "observations": [
                    {"date": "2026-01-01", "value": "1.0"},
                    {"date": "2025-12-25", "value": "0.9"},
                ]
            },
        )


@pytest.fixture(autouse=True)
def _reset_fred_cache(monkeypatch):
    fred_service._series_cache.clear()
    fred_service._series_locks.clear()
    _CountingFredClient.calls.clear()
    monkeypatch.setattr(fred_service, "FRED_API_KEY", "test-key")
    yield
    fred_service._series_cache.clear()
    fred_service._series_locks.clear()


@pytest.mark.asyncio
async def test_fetch_fred_series_returns_valid_db_cache_without_network(monkeypatch):
    cached = {
        "series_id": "WALCL",
        "observations": [{"date": "2026-01-01", "value": 1.0}],
    }
    monkeypatch.setattr(
        fred_service,
        "try_db_cache",
        AsyncMock(return_value=(cached, True)),
    )
    monkeypatch.setattr(fred_service.httpx, "AsyncClient", _UnexpectedFredClient)

    result = await fred_service.fetch_fred_series(
        "WALCL",
        start_date="2026-01-01",
        end_date="2026-02-01",
        limit=500,
    )

    assert result == cached


@pytest.mark.asyncio
async def test_fetch_fred_series_returns_stale_db_cache_on_rate_limit(monkeypatch):
    stale = {
        "series_id": "WALCL",
        "observations": [{"date": "2026-01-01", "value": 1.0}],
    }
    monkeypatch.setattr(
        fred_service,
        "try_db_cache",
        AsyncMock(return_value=(stale, False)),
    )
    monkeypatch.setattr(fred_service.httpx, "AsyncClient", _FailingFredClient)

    result = await fred_service.fetch_fred_series(
        "WALCL",
        start_date="2026-01-01",
        end_date="2026-02-01",
        limit=500,
    )

    assert result == stale


@pytest.mark.asyncio
async def test_fetch_fred_series_sanitizes_rate_limit_errors(monkeypatch):
    monkeypatch.setattr(
        fred_service,
        "try_db_cache",
        AsyncMock(return_value=(None, False)),
    )
    monkeypatch.setattr(fred_service.httpx, "AsyncClient", _FailingFredClient)

    with pytest.raises(RuntimeError) as exc_info:
        await fred_service.fetch_fred_series(
            "WALCL",
            start_date="2026-01-01",
            end_date="2026-02-01",
            limit=500,
        )

    message = str(exc_info.value)
    assert "rate limited" in message
    assert "test-key" not in message
    assert "api_key" not in message
    assert exc_info.value.__cause__ is None


@pytest.mark.asyncio
async def test_fetch_fred_series_coalesces_concurrent_requests(monkeypatch):
    monkeypatch.setattr(
        fred_service,
        "try_db_cache",
        AsyncMock(return_value=(None, False)),
    )
    monkeypatch.setattr(fred_service, "set_cached", AsyncMock(return_value=True))
    monkeypatch.setattr(fred_service.httpx, "AsyncClient", _CountingFredClient)

    first, second = await asyncio.gather(
        fred_service.fetch_fred_series(
            "WALCL",
            start_date="2026-01-01",
            end_date="2026-02-01",
            limit=500,
        ),
        fred_service.fetch_fred_series(
            "WALCL",
            start_date="2026-01-01",
            end_date="2026-02-01",
            limit=500,
        ),
    )

    assert first == second
    assert first["observations"][0]["value"] == 1.0
    assert len(_CountingFredClient.calls) == 2
