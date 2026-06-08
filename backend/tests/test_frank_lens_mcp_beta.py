"""Market Lens MCP beta endpoints for the Frank persona."""

from __future__ import annotations

from pathlib import Path
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
    assert "market_lens_get_lens" in body["tools"]
    assert "market_lens_search_lenses" in body["tools"]


def test_market_lens_personas_lists_material_capabilities(client):
    resp = client.get("/api/kol_research/mcp/personas")

    assert resp.status_code == 200
    body = resp.json()
    personas = {item["username"]: item for item in body["personas"]}
    assert "qinbafrank" in personas
    frank = personas["qinbafrank"]
    assert frank["lens_counts"]["core"] == 1
    assert frank["lens_counts"]["framework"] == 6
    assert frank["lens_counts"]["macro"] == 1
    assert frank["lens_counts"]["sector"] == 7
    assert frank["lens_counts"]["ticker"] >= 33


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


def test_market_lens_list_lenses_covers_all_distilled_markdown(client):
    invite = {
        "allowed": True,
        "access": "valid",
        "invite_code_id": "invite-1",
    }
    root = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "twitter"
        / "methodologies"
        / "qinbafrank"
    )
    expected = sum(len(list((root / layer).glob("*.md"))) for layer in ("core", "framework", "macro", "sector", "ticker"))
    with patch(
        "app.features.kol_research.router.validate_invite_code",
        new_callable=AsyncMock,
        return_value=invite,
    ), patch(
        "app.features.kol_research.router.record_usage",
        new_callable=AsyncMock,
    ):
        resp = client.get(
            "/api/kol_research/personas/qinbafrank/mcp/lenses",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == expected
    lens_ids = {(item["lens_type"], item["lens_id"]) for item in body["lenses"]}
    assert ("core", "operating-system") in lens_ids
    assert ("framework", "ask-about-stock") in lens_ids
    assert ("macro", "macro-regime") in lens_ids
    assert ("sector", "ai-infrastructure") in lens_ids
    assert ("ticker", "NVDA") in lens_ids


def test_market_lens_get_lens_returns_full_ticker_context(client):
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
    ):
        resp = client.get(
            "/api/kol_research/personas/qinbafrank/mcp/lenses/ticker/nvda",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["lens_type"] == "ticker"
    assert body["lens_id"] == "NVDA"
    assert "Evidence Map" in body["full_body"]
    assert "打脸条件" in body["full_body"]
    assert body["evidence_tweet_ids"]
    assert body["call_guidance"]["when_to_call"]


def test_market_lens_search_lenses_finds_framework_material(client):
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
    ):
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/lenses/search",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
            json={"query": "Veto 一票否决", "lens_types": ["core", "framework"], "limit": 5},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    assert any(item["lens_type"] in {"core", "framework"} for item in body["results"])
    assert body["call_guidance"]["returns_context"]


def test_market_lens_invite_persona_allowlist_is_enforced(client):
    invite = {
        "allowed": True,
        "access": "valid",
        "invite_code_id": "invite-1",
        "allowed_personas": ["serenity"],
        "allowed_workflows": [],
    }
    with patch(
        "app.features.kol_research.router.validate_invite_code",
        new_callable=AsyncMock,
        return_value=invite,
    ), patch(
        "app.features.kol_research.router.record_usage",
        new_callable=AsyncMock,
    ) as mock_usage:
        resp = client.get(
            "/api/kol_research/personas/qinbafrank/mcp/lenses",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
        )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "persona_not_allowed_for_invite"
    mock_usage.assert_not_awaited()


def test_market_lens_get_evidence_by_ids_uses_cockpit_reader(client):
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
        "app.features.kol_research.router.cockpit.get_evidence_tweets_by_ids",
        new_callable=AsyncMock,
        return_value={"tweets": [{"id": "123", "text": "historical post"}]},
    ) as mock_reader, patch(
        "app.features.kol_research.router.record_usage",
        new_callable=AsyncMock,
    ):
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/evidence/by-ids",
            headers={"X-Frank-Lens-Invite-Code": "beta"},
            json={"tweet_ids": ["123"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["tweets"][0]["text"] == "historical post"
    assert body["call_guidance"]["when_to_call"]
    mock_reader.assert_awaited_once_with("qinbafrank", ["123"])


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
        "allowed_personas": [],
        "allowed_workflows": [],
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
