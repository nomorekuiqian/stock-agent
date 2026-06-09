"""Unit tests for Stock AI entitlement gates."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.deps import verify_user_token
from app.main import app


client = TestClient(app)


AI_ENDPOINTS = [
    ("GET", "/api/stocks/AAPL/analysis/cache"),
    ("POST", "/api/stocks/AAPL/analysis"),
    ("POST", "/api/stocks/AAPL/technical"),
    ("POST", "/api/stocks/AAPL/news"),
    ("POST", "/api/stocks/AAPL/macro"),
    ("GET", "/api/stocks/AAPL/market-analysis"),
    ("POST", "/api/stocks/AAPL/market-analysis"),
    ("POST", "/api/stocks/AAPL/earnings"),
]


@pytest.fixture(autouse=True)
def _clear_auth_override():
    app.dependency_overrides.pop(verify_user_token, None)
    yield
    app.dependency_overrides.pop(verify_user_token, None)


def _request(method: str, path: str):
    if method == "GET":
        return client.get(path)
    return client.post(path)


@pytest.mark.parametrize(("method", "path"), AI_ENDPOINTS)
def test_stock_ai_endpoints_reject_anonymous_users(method: str, path: str):
    resp = _request(method, path)
    assert resp.status_code == 401


@pytest.mark.parametrize(("method", "path"), AI_ENDPOINTS)
def test_stock_ai_endpoints_require_stock_research_entitlement(method: str, path: str):
    app.dependency_overrides[verify_user_token] = lambda: "free-user"

    with patch(
        "app.features.stock.router.has_entitlement",
        new_callable=AsyncMock,
        return_value=False,
    ) as mock_has_entitlement:
        resp = _request(method, path)

    assert resp.status_code == 403
    mock_has_entitlement.assert_awaited_once_with("free-user", "stock_research")


def test_stock_analysis_cache_allows_entitled_user():
    app.dependency_overrides[verify_user_token] = lambda: "max-user"

    cached = {
        "content": {"title": "AAPL analysis"},
        "generated_at": "2026-06-06T00:00:00+00:00",
    }
    with patch(
        "app.features.stock.router.has_entitlement",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.features.stock.router.get_stock_analysis",
        new_callable=AsyncMock,
        return_value=cached,
    ) as mock_get:
        resp = client.get(
            "/api/stocks/AAPL/analysis/cache",
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    assert resp.json()["analysis"] == {"title": "AAPL analysis"}
    mock_get.assert_awaited_once_with("AAPL", analysis_type="comprehensive")


def test_stock_analysis_generation_cache_hit_allows_entitled_user():
    app.dependency_overrides[verify_user_token] = lambda: "max-user"

    cached = {
        "content": {"title": "Cached analysis"},
        "model": "gemini-test",
        "generated_at": "2026-06-06T00:00:00+00:00",
    }
    with patch(
        "app.features.stock.router.has_entitlement",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.features.stock.router.get_stock_analysis",
        new_callable=AsyncMock,
        return_value=cached,
    ) as mock_get:
        resp = client.post(
            "/api/stocks/AAPL/analysis",
            headers={"Authorization": "Bearer test-token"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis"] == {"title": "Cached analysis"}
    assert body["meta"]["from_cache"] is True
    mock_get.assert_awaited_once_with("AAPL", analysis_type="comprehensive")
