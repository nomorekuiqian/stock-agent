"""E2E tests for onboarding drip cron endpoint.

Uses httpx.AsyncClient + ASGITransport; the cron dependency and drip processor
are mocked so the test never sends email or touches Insforge.
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.deps import verify_cron_secret
from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.e2e
class TestOnboardingEmailCron:
    """Tests for POST /api/cron/onboarding-emails."""

    @pytest.mark.asyncio
    async def test_onboarding_email_cron_returns_new_counter_shape(self, client):
        async def mock_cron_secret():
            return "test-secret"

        app.dependency_overrides[verify_cron_secret] = mock_cron_secret
        try:
            with patch(
                "app.features.notification.onboarding.process_onboarding_emails",
                AsyncMock(return_value={
                    "processed": 2,
                    "sent": 1,
                    "skipped_already": 1,
                    "skipped_other": 0,
                    "errors": 0,
                }),
            ):
                resp = await client.post(
                    "/api/cron/onboarding-emails",
                    headers={"X-Cron-Secret": "test-secret"},
                )
        finally:
            app.dependency_overrides.pop(verify_cron_secret, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data == {
            "success": True,
            "processed": 2,
            "sent": 1,
            "skipped_already": 1,
            "skipped_other": 0,
            "errors": 0,
        }
        assert "deprecated" not in data
        assert "skipped" not in data
