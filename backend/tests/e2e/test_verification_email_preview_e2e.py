"""
E2E tests for verification email preview endpoint.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.e2e
class TestVerificationEmailPreview:
    @pytest.mark.asyncio
    async def test_preview_returns_html(self, client):
        resp = await client.get(
            "/api/verification-email/preview",
            params={
                "email": "user@example.com",
                "code": "123456",
                "redirect": "/for-you",
            },
            timeout=10,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["email"] == "user@example.com"
        assert data["code"] == "123456"
        assert "html" in data
        assert "<html" in data["html"]
        assert "完成邮箱验证，激活你的账户" in data["html"]
        assert "123456" in data["html"]
