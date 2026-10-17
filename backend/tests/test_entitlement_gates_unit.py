"""Unit tests for For-You and Portfolio-Health entitlement gates.

These endpoints are the security boundary — the frontend PaywallGuard is display
only. Each gate must reject anonymous callers (401) and callers lacking the
required entitlement (403), even when the request body/route is otherwise valid.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_entitlement_gates_unit.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.deps import verify_user_token
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_auth_override():
    app.dependency_overrides.pop(verify_user_token, None)
    yield
    app.dependency_overrides.pop(verify_user_token, None)


# ---------------------------------------------------------------------------
# For You — /api/for-you/action-bar requires for_you_website
# ---------------------------------------------------------------------------


class TestForYouEntitlementGate:
    """GET /api/for-you/action-bar."""

    PATH = "/api/for-you/action-bar"

    def test_rejects_anonymous_user(self):
        resp = client.get(self.PATH)
        assert resp.status_code == 401

    def test_rejects_user_without_entitlement(self):
        app.dependency_overrides[verify_user_token] = lambda: "free-user"

        with patch(
            "app.features.for_you.router.has_entitlement",
            new_callable=AsyncMock,
            return_value=False,
        ) as mock_has_entitlement:
            resp = client.get(self.PATH, headers={"Authorization": "Bearer t"})

        assert resp.status_code == 403
        mock_has_entitlement.assert_awaited_once_with("free-user", "for_you_website")
        # Entitled/happy path is covered by test_action_bar.py::TestRouter.


# ---------------------------------------------------------------------------
# Watchlist Monitor — requires for_you_website
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# Portfolio Health — requires portfolio_management
# ---------------------------------------------------------------------------
