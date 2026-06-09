"""Market Lens MCP endpoints for distilled persona context."""

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


def test_market_lens_mcp_status_is_public(client):
    resp = client.get("/api/kol_research/personas/qinbafrank/mcp/status")

    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"ok", "persona_username", "mode", "persona", "tools"}
    assert body["ok"] is True
    assert body["mode"] == "backend_first"
    assert "market_lens_get_lens" in body["tools"]
    assert "market_lens_search_lenses" in body["tools"]


def test_market_lens_personas_lists_material_capabilities(client):
    resp = client.get("/api/kol_research/mcp/personas")

    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"ok", "mode", "default_persona", "personas", "call_guidance"}
    assert body["mode"] == "backend_first"
    personas = {item["username"]: item for item in body["personas"]}
    assert "qinbafrank" in personas
    frank = personas["qinbafrank"]
    assert frank["lens_counts"]["core"] == 1
    assert frank["lens_counts"]["framework"] == 6
    assert frank["lens_counts"]["macro"] == 1
    assert frank["lens_counts"]["sector"] == 7
    assert frank["lens_counts"]["ticker"] >= 33


def test_market_lens_list_lenses_covers_all_distilled_markdown(client):
    root = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "twitter"
        / "methodologies"
        / "qinbafrank"
    )
    expected = sum(
        len(list((root / layer).glob("*.md")))
        for layer in ("core", "framework", "macro", "sector", "ticker")
    )

    resp = client.get("/api/kol_research/personas/qinbafrank/mcp/lenses")

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
    resp = client.get("/api/kol_research/personas/qinbafrank/mcp/lenses/ticker/nvda")

    assert resp.status_code == 200
    body = resp.json()
    assert body["lens_type"] == "ticker"
    assert body["lens_id"] == "NVDA"
    assert "Evidence Map" in body["full_body"]
    assert "打脸条件" in body["full_body"]
    assert body["evidence_tweet_ids"]
    assert body["call_guidance"]["when_to_call"]


def test_market_lens_search_lenses_finds_framework_material(client):
    resp = client.post(
        "/api/kol_research/personas/qinbafrank/mcp/lenses/search",
        json={"query": "Veto 一票否决", "lens_types": ["core", "framework"], "limit": 5},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    assert any(item["lens_type"] in {"core", "framework"} for item in body["results"])
    assert body["call_guidance"]["returns_context"]


def test_market_lens_get_evidence_by_ids_uses_cockpit_reader(client):
    with patch(
        "app.features.kol_research.router.cockpit.get_evidence_tweets_by_ids",
        new_callable=AsyncMock,
        return_value={"tweets": [{"id": "123", "text": "historical post"}]},
    ) as mock_reader:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/evidence/by-ids",
            json={"tweet_ids": ["123"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["tweets"][0]["text"] == "historical post"
    assert body["call_guidance"]["when_to_call"]
    mock_reader.assert_awaited_once_with("qinbafrank", ["123"])


def test_market_lens_search_evidence_is_public(client):
    with patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ) as mock_search:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/search",
            json={"query": "NVDA capex", "k": 2},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["retrieval_mode"] == "vector_chunks"
    assert body["chunks"][0]["content"] == "mock evidence"
    mock_search.assert_awaited_once()


def test_market_lens_workflow_returns_public_context_pack(client):
    with patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ) as mock_search, patch(
        "app.features.kol_research.router._market_brief_payload",
        new_callable=AsyncMock,
        return_value={"brief_type": "stock", "symbol": "NVDA", "payload": {}},
    ) as mock_brief:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/workflow",
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
    assert set(body) == {
        "persona_username",
        "workflow",
        "question",
        "ticker",
        "tickers",
        "sector",
        "retrieval_mode",
        "market_data_mode",
        "kol_chunks",
        "market_context",
        "methodology_context",
        "answer_discipline",
        "suggested_answer_shape",
        "share_url",
    }
    assert body["workflow"] == "stock_diagnosis"
    assert body["ticker"] == "NVDA"
    assert body["retrieval_mode"] == "vector_chunks"
    assert body["market_data_mode"] == "brief_tools"
    assert body["kol_chunks"][0]["content"] == "mock evidence"
    assert "methodology_context" in body
    assert "suggested_answer_shape" in body
    mock_search.assert_awaited_once()
    mock_brief.assert_awaited_once()


def test_market_lens_workflow_rejects_persona_without_material_workflows(client):
    resp = client.post(
        "/api/kol_research/personas/aleabitoreddit/mcp/workflow",
        json={
            "workflow": "market_regime",
            "question": "现在 AI capex 怎么看？",
            "include_market_data": False,
        },
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Persona not found"


def test_market_lens_compare_requires_two_tickers(client):
    resp = client.post(
        "/api/kol_research/personas/qinbafrank/mcp/workflow",
        json={
            "workflow": "compare",
            "question": "NVDA 和谁更好？",
            "tickers": ["NVDA"],
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "at least two tickers are required for compare"
