"""Regression tests for the freemium-transition retirements of
`/api/invites/redeem` and `/api/invites/auto-trial`.

Both routes used to create 14-day Max trials; after the freemium switch
(docs/plans/active/freemium-lifecycle-email.md) they must return HTTP 410
so older frontend builds and tooling fail fast instead of silently
believing they granted access.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.deps import verify_user_token


@pytest.fixture
def client():
    async def mock_user():
        return "test-user-id-deadbeef"

    app.dependency_overrides[verify_user_token] = mock_user
    c = TestClient(app)
    yield c
    app.dependency_overrides.pop(verify_user_token, None)


def test_redeem_endpoint_returns_410(client: TestClient):
    resp = client.post(
        "/api/invites/redeem",
        headers={"Authorization": "Bearer test-token"},
        json={"code": "BREW2026"},
    )
    assert resp.status_code == 410
    assert resp.json()["detail"] == "redeem_deprecated"


def test_auto_trial_endpoint_returns_410(client: TestClient):
    resp = client.post(
        "/api/invites/auto-trial",
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == 410
    assert resp.json()["detail"] == "auto_trial_deprecated"


def test_redeem_still_requires_auth():
    """Without a bearer token both deprecated endpoints must 401 before 410."""
    c = TestClient(app)
    resp = c.post("/api/invites/redeem", json={"code": "BREW2026"})
    # FastAPI dependency raises 401/403 (depending on whether the header is
    # missing or malformed); the precise code doesn't matter — only that the
    # endpoint never reaches the 410 branch for an anonymous caller, which
    # would otherwise reveal deprecation to scanners.
    assert resp.status_code in (401, 403)


def test_auto_trial_still_requires_auth():
    c = TestClient(app)
    resp = c.post("/api/invites/auto-trial")
    assert resp.status_code in (401, 403)
