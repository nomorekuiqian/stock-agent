"""
E2E Tests for Newsletter API Endpoints -- generated from git diff

Tests for new endpoints:
- POST /api/newsletter/preview     (render preview)
- POST /api/newsletter/send-test   (send to single email)
- POST /api/newsletter/broadcast   (broadcast, requires cron secret)

Note: POST /api/newsletter/generate is skipped by default (calls AI API).
Use @pytest.mark.generate to include it.

Tests via httpx.AsyncClient + ASGITransport.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_newsletter_e2e.py -v
"""

import os
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


@pytest.fixture
def newsletter_payload():
    """Standard newsletter request payload."""
    return {
        "subject": "Test Newsletter Subject",
        "greeting": "Markets had a strong week.",
        "sections": [
            {"title": "Market Overview", "content": "The **S&P 500** gained 1.5% this week."},
            {"title": "Looking Ahead", "content": "Fed meeting on Tuesday."},
        ],
        "closing": "Reply with your questions. Thanks!",
        "sign_off_name": "Golden / test",
        "sign_off_title": "test title",
    }


# ===========================================================================
# TestNewsletterPreview - POST /api/newsletter/preview
# ===========================================================================


@pytest.mark.e2e
class TestNewsletterPreview:
    """Tests for POST /api/newsletter/preview."""

    @pytest.mark.asyncio
    async def test_preview_success(self, client, newsletter_payload):
        """Preview returns 200 with plain text content."""
        payload = {**newsletter_payload, "email": "", "first_name": "Alice"}
        resp = await client.post("/api/newsletter/preview", json=payload, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "text" in data
        assert data["subject"] == "Test Newsletter Subject"

    @pytest.mark.asyncio
    async def test_preview_contains_personalized_name(self, client, newsletter_payload):
        """Preview text replaces template with provided first_name."""
        payload = {**newsletter_payload, "email": "", "first_name": "Bob"}
        resp = await client.post("/api/newsletter/preview", json=payload, timeout=10)
        assert resp.status_code == 200
        text = resp.json()["text"]
        assert "Bob" in text

    @pytest.mark.asyncio
    async def test_preview_default_name(self, client, newsletter_payload):
        """Preview with empty first_name uses default."""
        payload = {**newsletter_payload, "email": "", "first_name": ""}
        resp = await client.post("/api/newsletter/preview", json=payload, timeout=10)
        assert resp.status_code == 200
        text = resp.json()["text"]
        assert "\u670b\u53cb" in text  # default name

    @pytest.mark.asyncio
    async def test_preview_strips_markdown(self, client, newsletter_payload):
        """Preview text has markdown stripped."""
        payload = {**newsletter_payload, "email": "", "first_name": "Test"}
        resp = await client.post("/api/newsletter/preview", json=payload, timeout=10)
        assert resp.status_code == 200
        text = resp.json()["text"]
        assert "**" not in text
        assert "S&P 500" in text

    @pytest.mark.asyncio
    async def test_preview_missing_subject(self, client):
        """Missing subject returns 422."""
        payload = {
            "greeting": "Hi",
            "sections": [{"title": "A", "content": "B"}],
            "closing": "Bye",
        }
        resp = await client.post("/api/newsletter/preview", json=payload, timeout=10)
        assert resp.status_code == 422


# ===========================================================================
# TestNewsletterSendTest - POST /api/newsletter/send-test
# ===========================================================================


@pytest.mark.e2e
class TestNewsletterSendTest:
    """Tests for POST /api/newsletter/send-test."""

    @pytest.mark.asyncio
    async def test_send_test_missing_email(self, client, newsletter_payload):
        """Send-test without email returns 400."""
        payload = {**newsletter_payload, "email": "", "first_name": ""}
        resp = await client.post("/api/newsletter/send-test", json=payload, timeout=10)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_send_test_missing_subject(self, client):
        """Missing subject returns 422."""
        payload = {
            "email": "test@example.com",
            "greeting": "Hi",
            "sections": [{"title": "A", "content": "B"}],
            "closing": "Bye",
        }
        resp = await client.post("/api/newsletter/send-test", json=payload, timeout=10)
        assert resp.status_code == 422


# ===========================================================================
# TestNewsletterBroadcast - POST /api/newsletter/broadcast
# ===========================================================================


@pytest.mark.e2e
class TestNewsletterBroadcast:
    """Tests for POST /api/newsletter/broadcast (requires X-Cron-Secret)."""

    @pytest.mark.asyncio
    async def test_broadcast_no_auth(self, client, newsletter_payload):
        """Broadcast without X-Cron-Secret returns 401."""
        resp = await client.post("/api/newsletter/broadcast", json=newsletter_payload, timeout=10)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_broadcast_wrong_secret(self, client, newsletter_payload):
        """Broadcast with wrong secret returns 401."""
        resp = await client.post(
            "/api/newsletter/broadcast",
            json=newsletter_payload,
            headers={"X-Cron-Secret": "wrong-secret"},
            timeout=10,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_broadcast_missing_subject(self, client):
        """Broadcast with missing subject returns 422."""
        cron_secret = os.getenv("CRON_SECRET", "")
        payload = {
            "greeting": "Hi",
            "sections": [{"title": "A", "content": "B"}],
            "closing": "Bye",
        }
        resp = await client.post(
            "/api/newsletter/broadcast",
            json=payload,
            headers={"X-Cron-Secret": cron_secret},
            timeout=10,
        )
        assert resp.status_code in (401, 422)


# ===========================================================================
# TestNewsletterGenerate - POST /api/newsletter/generate (AI - slow)
# ===========================================================================


@pytest.mark.e2e
@pytest.mark.generate
class TestNewsletterGenerate:
    """Tests for POST /api/newsletter/generate (requires AI API, skipped by default)."""

    @pytest.mark.asyncio
    async def test_generate_success(self, client):
        """Generate returns structured newsletter content."""
        payload = {
            "intent": "Share that we launched a new dashboard feature",
            "tone": "warm",
            "language": "zh",
        }
        resp = await client.post("/api/newsletter/generate", json=payload, timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "subject" in data
        assert "sections" in data

    @pytest.mark.asyncio
    async def test_generate_missing_intent(self, client):
        """Generate without intent returns 422."""
        resp = await client.post("/api/newsletter/generate", json={}, timeout=10)
        assert resp.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
