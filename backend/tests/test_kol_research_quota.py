"""Quota enforcement on /api/kol_research/chat and /api/kol_research/chat/stream.

The KOL persona chat originally bypassed the daily research quota (free users
got unlimited persona conversations). These tests pin that down: both unary
and SSE endpoints must call `consume_quota` and reject when exhausted.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


_EXHAUSTED_QUOTA = {
    "allowed": False,
    "used": 2,
    "limit": 2,
    "remaining": 0,
    "unlimited": False,
}
_ALLOWED_QUOTA = {
    "allowed": True,
    "used": 1,
    "limit": 2,
    "remaining": 1,
    "unlimited": False,
}


@pytest.fixture
def client():
    from app.features.kol_research import router as kol_router
    from app.main import app

    async def fake_flag():
        return {"user_id": "test-user", "email": "test@example.com"}

    app.dependency_overrides[kol_router.require_kol_research_flag] = fake_flag
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(kol_router.require_kol_research_flag, None)


def test_unary_chat_rejects_when_quota_exhausted(client):
    """POST /api/kol_research/chat returns 429 when free user is out of quota."""
    with patch(
        "app.features.kol_research.router.consume_quota",
        new_callable=AsyncMock,
        return_value=_EXHAUSTED_QUOTA,
    ) as mock_consume, patch(
        "app.features.kol_research.router.answer_kol_research",
        new_callable=AsyncMock,
    ) as mock_answer:
        resp = client.post(
            "/api/kol_research/chat",
            json={
                "message": "test",
                "persona_username": "qinbafrank",
                "history": [],
                "turn_id": "t1",
            },
        )

    assert resp.status_code == 429
    assert "今日免费提问次数已用完" in resp.json()["detail"]
    mock_consume.assert_awaited_once()
    mock_answer.assert_not_awaited()


def test_unary_chat_consumes_quota_on_success(client):
    """POST /api/kol_research/chat consumes one quota unit before running the agent."""
    from app.features.kol_research.models import KolResearchResponse

    with patch(
        "app.features.kol_research.router.consume_quota",
        new_callable=AsyncMock,
        return_value=_ALLOWED_QUOTA,
    ) as mock_consume, patch(
        "app.features.kol_research.router.answer_kol_research",
        new_callable=AsyncMock,
        return_value=KolResearchResponse(
            persona_username="qinbafrank",
            message="ok",
        ),
    ) as mock_answer:
        resp = client.post(
            "/api/kol_research/chat",
            json={
                "message": "test",
                "persona_username": "qinbafrank",
                "history": [],
                "turn_id": "t2",
            },
        )

    assert resp.status_code == 200
    mock_consume.assert_awaited_once()
    mock_answer.assert_awaited_once()


def test_stream_chat_emits_quota_error_when_exhausted(client):
    """POST /api/kol_research/chat/stream streams an error event when out of quota."""
    with patch(
        "app.features.kol_research.router.consume_quota",
        new_callable=AsyncMock,
        return_value=_EXHAUSTED_QUOTA,
    ) as mock_consume, patch(
        "app.features.kol_research.router.stream_kol_research",
    ) as mock_stream:
        with client.stream(
            "POST",
            "/api/kol_research/chat/stream",
            json={
                "message": "test",
                "persona_username": "qinbafrank",
                "history": [],
                "turn_id": "t3",
            },
        ) as resp:
            assert resp.status_code == 200
            body = "\n".join(line for line in resp.iter_lines() if line)

    assert '"quota_exceeded": true' in body
    assert "今日免费提问次数已用完" in body
    mock_consume.assert_awaited_once()
    # Agent must not run when quota gate fires.
    mock_stream.assert_not_called()
