"""Frank Lens MCP beta endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


class _Chunk:
    def __init__(self, text: str = "mock evidence"):
        self.text = text

    def model_dump(self):
        return {
            "content": self.text,
            "citation_index": 1,
            "metadata": {"tweet_id": "123"},
        }


@pytest.fixture
def client():
    from app.main import app

    yield TestClient(app)


def test_frank_mcp_status_allows_missing_invite(client):
    resp = client.get("/api/kol_research/personas/qinbafrank/mcp/status")

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["requires_invite_for_workflow"] is True
    assert body["beta"]["access"] == "missing"


def test_frank_mcp_workflow_requires_invite(client):
    resp = client.post(
        "/api/kol_research/personas/qinbafrank/mcp/workflow",
        json={
            "workflow": "stock_diagnosis",
            "question": "NVDA 是杀估值还是杀逻辑？",
            "ticker": "NVDA",
        },
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "invite_code_required"


def test_frank_mcp_search_requires_valid_invite(client):
    with patch(
        "app.features.kol_research.router.validate_invite_code",
        new_callable=AsyncMock,
        return_value={"allowed": False, "access": "invalid", "error": "invite_not_found"},
    ):
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/search",
            headers={"X-Frank-Lens-Invite-Code": "bad"},
            json={"query": "NVDA", "k": 2},
        )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "invite_not_found"


def test_frank_mcp_workflow_returns_context_pack_and_records_usage(client):
    invite = {
        "allowed": True,
        "access": "valid",
        "invite_code_id": "invite-1",
        "invite_label": "Beta",
        "remaining_quota": None,
    }
    with patch(
        "app.features.kol_research.router.validate_invite_code",
        new_callable=AsyncMock,
        return_value=invite,
    ), patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ) as mock_search, patch(
        "app.features.kol_research.router._market_brief_payload",
        new_callable=AsyncMock,
        return_value={"brief_type": "stock", "symbol": "NVDA", "payload": {}},
    ) as mock_brief, patch(
        "app.features.kol_research.router.record_usage",
        new_callable=AsyncMock,
    ) as mock_usage:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/workflow",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
            json={
                "workflow": "stock_diagnosis",
                "question": "NVDA 是杀估值还是杀逻辑？",
                "ticker": "NVDA",
                "evidence_limit": 3,
                "include_market_data": True,
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["workflow"] == "stock_diagnosis"
    assert body["ticker"] == "NVDA"
    assert body["retrieval_mode"] == "vector_chunks"
    assert body["market_data_mode"] == "brief_tools"
    assert body["kol_chunks"][0]["content"] == "mock evidence"
    assert body["beta"]["access"] == "valid"
    assert "methodology_context" in body
    assert "suggested_answer_shape" in body
    mock_search.assert_awaited_once()
    mock_brief.assert_awaited_once()
    mock_usage.assert_awaited_once()
    assert mock_usage.await_args.kwargs["status"] == "success"


def test_frank_mcp_compare_requires_two_tickers_and_records_error(client):
    invite = {
        "allowed": True,
        "access": "valid",
        "invite_code_id": "invite-1",
    }
    with patch(
        "app.features.kol_research.router.validate_invite_code",
        new_callable=AsyncMock,
        return_value=invite,
    ), patch(
        "app.features.kol_research.router.record_usage",
        new_callable=AsyncMock,
    ) as mock_usage:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/workflow",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
            json={
                "workflow": "compare",
                "question": "NVDA 和谁更好？",
                "tickers": ["NVDA"],
            },
        )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "at least two tickers are required for compare"
    mock_usage.assert_awaited_once()
    assert mock_usage.await_args.kwargs["status"] == "error"


@pytest.mark.asyncio
async def test_validate_invite_uses_dev_override_without_edge_call(monkeypatch):
    from app.features.kol_research import mcp_beta

    monkeypatch.setattr(mcp_beta, "ENVIRONMENT", "development")
    monkeypatch.setattr(mcp_beta, "FRANK_LENS_DEV_INVITE_CODE", "DEV_INVITE")

    with patch("app.features.kol_research.mcp_beta.get_insforge_service") as mock_service:
        result = await mcp_beta.validate_invite_code("DEV_INVITE")

    assert result == {
        "allowed": True,
        "access": "dev",
        "invite_code_id": "dev",
        "invite_label": "Local dev invite",
        "remaining_quota": None,
    }
    mock_service.assert_not_called()


@pytest.mark.asyncio
async def test_validate_invite_normalizes_edge_denial():
    from app.features.kol_research import mcp_beta

    service = type("Service", (), {})()
    service.call_function = AsyncMock(
        return_value={
            "status_code": 200,
            "data": {
                "success": True,
                "allowed": False,
                "error": "invite_not_found",
                "invite": {},
            },
        }
    )

    with patch("app.features.kol_research.mcp_beta.get_insforge_service", return_value=service):
        result = await mcp_beta.validate_invite_code("UNKNOWN")

    assert result["allowed"] is False
    assert result["access"] == "invalid"
    assert result["invite_code_id"] is None
    call_kwargs = service.call_function.await_args.kwargs
    assert call_kwargs["params"] == {"action": "validate_invite"}
    assert "invite_code" not in call_kwargs["json_body"]
    assert len(call_kwargs["json_body"]["invite_hash"]) == 64


@pytest.mark.asyncio
async def test_record_usage_sends_normalized_payload_to_edge():
    from app.features.kol_research import mcp_beta

    service = type("Service", (), {})()
    service.call_function = AsyncMock(return_value={"status_code": 200, "data": {"success": True}})

    with patch("app.features.kol_research.mcp_beta.get_insforge_service", return_value=service):
        await mcp_beta.record_usage(
            invite={"access": "valid", "invite_code_id": "invite-1"},
            persona_username="qinbafrank",
            tool_name="frank_compare",
            workflow="compare",
            ticker="NVDA",
            tickers=["NVDA", "AVGO"],
            status="success",
            latency_ms=12,
            metadata={"evidence_count": 2},
        )

    call_kwargs = service.call_function.await_args.kwargs
    assert call_kwargs["params"] == {"action": "record_usage"}
    assert call_kwargs["json_body"] == {
        "invite_id": "invite-1",
        "persona_username": "qinbafrank",
        "tool_name": "frank_compare",
        "workflow": "compare",
        "ticker": "NVDA",
        "tickers": ["NVDA", "AVGO"],
        "status": "success",
        "latency_ms": 12,
        "metadata": {"evidence_count": 2},
    }


@pytest.mark.asyncio
async def test_record_usage_failure_does_not_break_workflow():
    from app.features.kol_research import mcp_beta

    service = type("Service", (), {})()
    service.call_function = AsyncMock(return_value={"status_code": 500, "data": {"error": "db down"}})

    with patch("app.features.kol_research.mcp_beta.get_insforge_service", return_value=service):
        await mcp_beta.record_usage(
            invite={"access": "valid", "invite_code_id": "invite-1"},
            persona_username="qinbafrank",
            tool_name="frank_stock_diagnosis",
            workflow="stock_diagnosis",
            status="error",
        )

    service.call_function.assert_awaited_once()
