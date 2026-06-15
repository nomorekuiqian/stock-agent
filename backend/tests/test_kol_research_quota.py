"""Quota enforcement on /api/kol_research/chat and /api/kol_research/chat/stream.

The KOL persona chat originally bypassed the daily research quota (free users
got unlimited persona conversations). Non-Qinbafrank personas still use the
general research quota; Qinbafrank uses the Ultra pack gate with 1 lifetime
trial question.
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
                "persona_username": "aleabitoreddit",
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
            persona_username="aleabitoreddit",
            message="ok",
        ),
    ) as mock_answer:
        resp = client.post(
            "/api/kol_research/chat",
            json={
                "message": "test",
                "persona_username": "aleabitoreddit",
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
                "persona_username": "aleabitoreddit",
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


@pytest.mark.asyncio
async def test_qinbafrank_trial_uses_fixed_lifetime_quota_bucket():
    """Qinbafrank trial must not reset daily."""
    from app.features.kol_research import router as kol_router

    with patch(
        "app.features.payment.entitlements.has_entitlement",
        new_callable=AsyncMock,
        return_value=False,
    ) as mock_entitlement, patch(
        "app.features.kol_research.router.get_usage",
        new_callable=AsyncMock,
        return_value=0,
    ) as mock_get_usage, patch(
        "app.features.kol_research.router.increment_usage",
        new_callable=AsyncMock,
        return_value=1,
    ) as mock_increment:
        result = await kol_router._consume_qinbafrank_pack_access("user-1", "1.2.3.4")

    assert result["allowed"] is True
    mock_entitlement.assert_awaited_once_with("user-1", "kol_pack_qinbafrank")
    mock_get_usage.assert_awaited_once_with(
        "kol_pack_qinbafrank_trial:user-1",
        kol_router.QINBAFRANK_TRIAL_USAGE_DATE,
    )
    mock_increment.assert_awaited_once_with(
        "kol_pack_qinbafrank_trial:user-1",
        "user",
        kol_router.QINBAFRANK_TRIAL_USAGE_DATE,
    )


@pytest.mark.asyncio
async def test_qinbafrank_trial_exhaustion_does_not_increment_again():
    from app.features.kol_research import router as kol_router

    with patch(
        "app.features.payment.entitlements.has_entitlement",
        new_callable=AsyncMock,
        return_value=False,
    ), patch(
        "app.features.kol_research.router.get_usage",
        new_callable=AsyncMock,
        return_value=1,
    ) as mock_get_usage, patch(
        "app.features.kol_research.router.increment_usage",
        new_callable=AsyncMock,
    ) as mock_increment:
        result = await kol_router._consume_qinbafrank_pack_access("user-1", "1.2.3.4")

    assert result["allowed"] is False
    mock_get_usage.assert_awaited_once_with(
        "kol_pack_qinbafrank_trial:user-1",
        kol_router.QINBAFRANK_TRIAL_USAGE_DATE,
    )
    mock_increment.assert_not_awaited()
