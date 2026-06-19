"""OKX Context MCP adapter tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_okx_discovery_returns_three_tool_surface():
    from app.okx_main import app

    client = TestClient(app)
    resp = client.get("/api/okx-mcp/discovery")

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    tools = body["data"]["tools"]
    assert set(tools) == {
        "themarketbrew_discovery",
        "themarketbrew_persona_context",
        "themarketbrew_market_data",
    }
    assert body["data"]["auth"]["account_required"] is False
    assert body["data"]["payment"]["provider"] == "okx_x402"
    assert any(persona["username"] == "qinbafrank" for persona in body["data"]["personas"])


def test_okx_persona_context_returns_context_without_llm_or_account_auth():
    from app.okx_main import app

    client = TestClient(app)
    resp = client.post(
        "/api/okx-mcp/persona-context",
        json={
            "question": "NVDA AI capex 框架怎么看？",
            "persona": "qinbafrank",
            "ticker": "NVDA",
            "include_evidence_map": False,
            "include_vector_evidence": False,
            "include_lens_body": False,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["tool"] == "themarketbrew_persona_context"
    data = body["data"]
    assert data["auth"]["account_required"] is False
    assert data["selected_persona"]["username"] == "qinbafrank"
    assert data["selected_lenses"]
    assert data["kol_chunks"] == []
    assert data["notice"].startswith("This is a paid OKX context pack")
    assert body["safety"]["no_final_answer_generated"] is True


def test_okx_market_data_catalog_rewrites_auth_metadata():
    from app.okx_main import app

    client = TestClient(app)
    resp = client.post("/api/okx-mcp/market-data", json={"data_type": "catalog"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["tool"] == "themarketbrew_market_data"
    envelope = body["data"]
    assert envelope["auth"]["account_required"] is False
    assert envelope["data"]["auth"]["required"] is False
    assert "market_lens_get_stock_data" in envelope["data"]["tools"]


def test_okx_payment_defaults_to_disabled():
    from app.features.okx_mcp.payment import payment_status

    status = payment_status()

    assert status["enabled"] is False
    assert status["mode"] == "sdk"
    assert "POST /api/okx-mcp/persona-context" in status["paid_routes"]

