"""Market Lens MCP endpoints for distilled persona context."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
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
def app():
    from app.main import app

    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    from app.features.kol_research.mcp_auth import verify_mcp_token

    app.dependency_overrides[verify_mcp_token] = lambda: {
        "user_id": "user-123",
        "token_id": "token-123",
        "scopes": ["mcp:persona", "mcp:data"],
        "skip_usage_log": True,
    }
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def public_client(app):
    yield TestClient(app)


def test_market_lens_mcp_status_is_public(public_client):
    resp = public_client.get("/api/kol_research/personas/qinbafrank/mcp/status")

    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"ok", "persona_username", "mode", "persona", "tools", "auth"}
    assert body["ok"] is True
    assert body["mode"] == "backend_first"
    assert body["auth"]["account_required"] is True
    assert "market_lens_get_lens" in body["tools"]
    assert "market_lens_login" in body["tools"]
    assert "market_lens_get_stock_data" in body["tools"]
    assert "market_lens_search_lenses" in body["tools"]
    assert not any(tool.startswith("frank_") for tool in body["tools"])


def test_market_lens_content_requires_account(public_client):
    resp = public_client.get("/api/kol_research/mcp/personas")

    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert detail["code"] == "auth_required"
    assert detail["login_tool"] == "market_lens_login"


def test_market_lens_auth_device_start_route(public_client):
    with patch(
        "app.features.kol_research.router.mcp_auth.start_device_authorization",
        new_callable=AsyncMock,
        return_value={
            "ok": True,
            "status": "authorization_pending",
            "device_code": "device-123",
            "user_code": "ABCD-EFGH",
            "verification_url": "https://themarketbrew.com/mcp/authorize?user_code=ABCD-EFGH",
            "poll_interval_s": 2,
        },
    ) as mock_start:
        resp = public_client.post(
            "/api/kol_research/mcp/auth/device/start",
            json={"client_name": "pytest"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["device_code"] == "device-123"
    assert body["user_code"] == "ABCD-EFGH"
    mock_start.assert_awaited_once_with("pytest")


def test_market_lens_auth_device_token_route_handles_pending_and_expired(public_client):
    with patch(
        "app.features.kol_research.router.mcp_auth.exchange_device_token",
        new_callable=AsyncMock,
        side_effect=[
            {"ok": True, "status": "authorization_pending", "poll_interval_s": 2},
            {"ok": False, "status": "expired", "error": "Authorization code expired"},
        ],
    ) as mock_exchange:
        pending = public_client.post(
            "/api/kol_research/mcp/auth/device/token",
            json={"device_code": "device-code-123456"},
        )
        expired = public_client.post(
            "/api/kol_research/mcp/auth/device/token",
            json={"device_code": "device-code-123456"},
        )

    assert pending.status_code == 200
    assert pending.json()["status"] == "authorization_pending"
    assert expired.status_code == 200
    assert expired.json()["status"] == "expired"
    assert mock_exchange.await_count == 2


def test_market_lens_auth_device_authorize_requires_website_account(app):
    from app.core.deps import verify_user_token

    app.dependency_overrides[verify_user_token] = lambda: "user-123"
    try:
        with patch(
            "app.features.kol_research.router.mcp_auth.authorize_device_code",
            new_callable=AsyncMock,
            return_value={"ok": True, "status": "authorized", "client_name": "pytest"},
        ) as mock_authorize:
            client = TestClient(app)
            resp = client.post(
                "/api/kol_research/mcp/auth/device/authorize",
                json={"user_code": "ABCD-EFGH"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["status"] == "authorized"
    mock_authorize.assert_awaited_once_with(user_code="ABCD-EFGH", user_id="user-123")


def test_market_lens_auth_device_authorize_surfaces_expired_code(app):
    from app.core.deps import verify_user_token

    app.dependency_overrides[verify_user_token] = lambda: "user-123"
    try:
        with patch(
            "app.features.kol_research.router.mcp_auth.authorize_device_code",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=410, detail="Authorization code expired"),
        ):
            client = TestClient(app)
            resp = client.post(
                "/api/kol_research/mcp/auth/device/authorize",
                json={"user_code": "ABCD-EFGH"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 410
    assert resp.json()["detail"] == "Authorization code expired"


def test_market_lens_auth_status_and_revoke_require_mcp_token(client):
    status = client.get("/api/kol_research/mcp/auth/status")

    assert status.status_code == 200
    assert status.json() == {
        "ok": True,
        "authenticated": True,
        "user_id": "user-123",
        "token_id": "token-123",
        "scopes": ["mcp:persona", "mcp:data"],
        "expires_at": None,
        "client_name": None,
    }

    with patch(
        "app.features.kol_research.router.mcp_auth.revoke_mcp_token",
        new_callable=AsyncMock,
        return_value={"ok": True, "revoked": True},
    ) as mock_revoke:
        revoked = client.post(
            "/api/kol_research/mcp/auth/revoke",
            headers={"Authorization": "Bearer raw-mcp-token"},
        )

    assert revoked.status_code == 200
    assert revoked.json()["revoked"] is True
    mock_revoke.assert_awaited_once_with("raw-mcp-token")


def test_market_lens_data_catalog_requires_account_and_returns_tools(client):
    resp = client.get("/api/kol_research/mcp/data/catalog")

    assert resp.status_code == 200
    body = resp.json()
    assert body["tool"] == "data_catalog"
    tools = body["data"]["tools"]
    assert "market_lens_get_brief" in tools
    assert "market_lens_get_stock_data" in tools
    assert "market_lens_get_market_data" in tools
    assert "market_lens_get_news" in tools
    assert body["auth"]["authenticated"] is True


def test_market_lens_data_brief_calls_stock_brief(client):
    with patch(
        "app.features.kol_research.mcp_data.get_stock_brief",
        new_callable=AsyncMock,
        return_value='{"symbol":"NVDA","quote":{"price":100}}',
    ) as mock_brief:
        resp = client.post(
            "/api/kol_research/mcp/data/brief",
            json={"brief_type": "stock", "symbol": "nvda"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["tool"] == "brief"
    assert body["data"]["briefs"][0]["symbol"] == "NVDA"
    assert body["data"]["briefs"][0]["payload"]["quote"]["price"] == 100
    assert body["errors"] == []
    mock_brief.assert_awaited_once_with("NVDA")


def test_market_lens_data_brief_calls_macro_brief(client):
    with patch(
        "app.features.kol_research.mcp_data.get_macro_brief",
        new_callable=AsyncMock,
        return_value='{"risk_summary":{"composite_level":"neutral"}}',
    ) as mock_brief:
        resp = client.post(
            "/api/kol_research/mcp/data/brief",
            json={"brief_type": "macro"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["briefs"][0]["brief_type"] == "macro"
    assert body["data"]["briefs"][0]["payload"]["risk_summary"]["composite_level"] == "neutral"
    mock_brief.assert_awaited_once_with()


def test_market_lens_stock_data_rejects_unknown_section(client):
    resp = client.post(
        "/api/kol_research/mcp/data/stock",
        json={"symbol": "NVDA", "sections": ["quote", "not_a_section"]},
    )

    assert resp.status_code == 422


def test_market_lens_stock_data_partial_failure_returns_section_error(client):
    with patch(
        "app.features.kol_research.mcp_data.research_tools.get_stock_quote",
        new_callable=AsyncMock,
        side_effect=RuntimeError("quote provider down"),
    ), patch(
        "app.features.kol_research.mcp_data.research_tools.get_company_profile",
        new_callable=AsyncMock,
        return_value='{"symbol":"NVDA","name":"NVIDIA"}',
    ):
        resp = client.post(
            "/api/kol_research/mcp/data/stock",
            json={"symbol": "NVDA", "sections": ["quote", "profile"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["tool"] == "stock_data"
    assert body["data"]["sections"]["profile"]["name"] == "NVIDIA"
    assert any(err["section"] == "quote" for err in body["errors"])


def test_market_lens_news_aggregates_dedupes_and_limits(client):
    stock_news = {
        "status": "success",
        "news": [
            {
                "title": "NVDA launches product",
                "publishedDate": "2026-06-11T10:00:00Z",
                "url": "https://example.com/nvda-product",
                "_source": "fmp_ticker",
                "symbol": "NVDA",
            },
            {
                "title": "NVDA earnings preview",
                "publishedDate": "2026-06-10T10:00:00Z",
                "url": "https://example.com/nvda-earnings",
                "_source": "fmp_ticker",
                "symbol": "NVDA",
            },
        ],
    }
    market_news = {
        "status": "success",
        "news": [
            {
                "title": "NVDA launches product duplicate",
                "publishedDate": "2026-06-11T11:00:00Z",
                "url": "https://example.com/nvda-product",
                "_source": "fmp_market",
            },
            {
                "title": "Rates move lower",
                "publishedDate": "2026-06-12T10:00:00Z",
                "url": "https://example.com/rates",
                "_source": "fmp_market",
            },
        ],
    }
    with patch("app.features.kol_research.mcp_data.get_fmp_news", return_value=stock_news), patch(
        "app.features.kol_research.mcp_data.get_combined_market_news",
        return_value=market_news,
    ), patch(
        "app.features.kol_research.mcp_data._press_releases",
        new_callable=AsyncMock,
        return_value={"releases": []},
    ), patch(
        "app.features.kol_research.mcp_data.research_tools.get_twitter_digest",
        new_callable=AsyncMock,
        return_value={"date": "2026-06-09", "summary": "digest"},
    ), patch(
        "app.features.kol_research.mcp_data.research_tools.get_morning_report",
        new_callable=AsyncMock,
        return_value={"date": "2026-06-08", "summary": "morning"},
    ):
        resp = client.post(
            "/api/kol_research/mcp/data/news",
            json={"symbols": ["NVDA"], "scope": "all", "days": 7, "limit": 3},
        )

    assert resp.status_code == 200
    body = resp.json()
    news = body["data"]["news"]
    assert body["tool"] == "news"
    assert body["data"]["count"] == 3
    assert len({item["url"] for item in news if item["url"]}) == 3
    assert news[0]["title"] == "Rates move lower"
    assert all("source" in item and "provenance" in item and "published_at" in item for item in news)


def test_market_lens_personas_lists_material_capabilities(client):
    resp = client.get("/api/kol_research/mcp/personas")

    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"ok", "mode", "personas", "call_guidance"}
    assert body["mode"] == "backend_first"
    assert "default_persona" not in body
    assert "selection_rule" in body["call_guidance"]
    personas = {item["username"]: item for item in body["personas"]}
    assert "qinbafrank" in personas
    assert "aleabitoreddit" in personas
    frank = personas["qinbafrank"]
    assert frank["lens_counts"]["core"] == 1
    assert frank["lens_counts"]["framework"] == 6
    assert frank["lens_counts"]["macro"] == 1
    assert frank["lens_counts"]["sector"] == 7
    assert frank["lens_counts"]["ticker"] >= 33
    serenity = personas["aleabitoreddit"]
    assert serenity["display_name"] == "Serenity"
    assert serenity["material_root"].endswith("twitter/methodologies/aleabitoreddit")
    assert serenity["lens_counts"] == {
        "core": 1,
        "framework": 7,
        "macro": 1,
        "sector": 9,
        "ticker": 36,
    }
    assert "stock_diagnosis" in serenity["supported_workflows"]


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


def test_market_lens_list_lenses_covers_serenity_material(client):
    root = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "twitter"
        / "methodologies"
        / "aleabitoreddit"
    )
    expected = sum(
        len(list((root / layer).glob("*.md")))
        for layer in ("core", "framework", "macro", "sector", "ticker")
    )

    resp = client.get("/api/kol_research/personas/aleabitoreddit/mcp/lenses")

    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Serenity"
    assert body["material_root"].endswith("twitter/methodologies/aleabitoreddit")
    assert body["count"] == expected
    lens_ids = {(item["lens_type"], item["lens_id"]) for item in body["lenses"]}
    assert ("core", "bottleneck-operating-system") in lens_ids
    assert ("framework", "ask-about-stock") in lens_ids
    assert ("macro", "ai-capex-cycle") in lens_ids
    assert ("sector", "photonics-and-cpo") in lens_ids
    assert ("ticker", "SIVE") in lens_ids


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


def test_market_lens_get_lens_returns_serenity_ticker_context_without_frank_bleed(client):
    resp = client.get("/api/kol_research/personas/aleabitoreddit/mcp/lenses/ticker/SIVE")

    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Serenity"
    assert body["lens_type"] == "ticker"
    assert body["lens_id"] == "SIVE"
    assert body["metadata"]["sector"] == "photonics-and-cpo"
    assert body["evidence_tweet_ids"]
    assert "CW DFB" in body["full_body"]
    forbidden = ("qinbafrank", "三杀", "杀估值", "杀业绩", "杀逻辑")
    assert not any(term in body["full_body"] for term in forbidden)


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


def test_market_lens_search_lenses_finds_serenity_material(client):
    resp = client.post(
        "/api/kol_research/personas/aleabitoreddit/mcp/lenses/search",
        json={"query": "CPO SIVE", "lens_types": ["sector", "ticker"], "limit": 5},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Serenity"
    assert body["count"] >= 1
    lens_ids = {(item["lens_type"], item["lens_id"]) for item in body["results"]}
    assert ("ticker", "SIVE") in lens_ids or ("sector", "photonics-and-cpo") in lens_ids


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


def test_market_lens_get_evidence_by_ids_falls_back_to_serenity_local_corpus(client):
    local_row = {
        "id": "1972016308662513748",
        "text": "NeoCloud Thesis: Hyperscaler Capex Funnel",
        "source": "local_material_evidence",
        "persona_username": "aleabitoreddit",
    }
    with patch(
        "app.features.kol_research.router.cockpit.get_evidence_tweets_by_ids",
        new_callable=AsyncMock,
        return_value={"tweets": []},
    ) as mock_reader, patch(
        "app.features.kol_research.router.mcp_materials.get_local_evidence_by_ids",
        return_value=[local_row],
    ) as mock_local:
        resp = client.post(
            "/api/kol_research/personas/aleabitoreddit/mcp/evidence/by-ids",
            json={"tweet_ids": ["1972016308662513748"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["persona_username"] == "aleabitoreddit"
    assert body["tweets"][0]["id"] == "1972016308662513748"
    assert "NeoCloud Thesis" in body["tweets"][0]["text"]
    assert body["tweets"][0]["source"] == "local_material_evidence"
    mock_reader.assert_awaited_once_with("aleabitoreddit", ["1972016308662513748"])
    mock_local.assert_called_once_with("aleabitoreddit", ["1972016308662513748"])


def test_market_lens_search_evidence_requires_account_and_returns_chunks(client):
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


def test_market_lens_workflow_returns_account_gated_context_pack(client):
    with patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ) as mock_search, patch(
        "app.features.kol_research.router.mcp_data.legacy_market_brief_payload",
        new_callable=AsyncMock,
        return_value={
            "brief_type": "stock",
            "symbol": "NVDA",
            "payload": {},
            "mcp_envelope": {
                "tool": "brief",
                "freshness": {"source": "test"},
                "errors": [],
            },
        },
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
        "data_context",
        "news_context",
        "data_freshness",
        "data_errors",
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
    assert body["data_context"][0]["tool"] == "brief"
    assert body["data_errors"] == []
    assert "methodology_context" in body
    assert "suggested_answer_shape" in body
    mock_search.assert_awaited_once()
    mock_brief.assert_awaited_once()


def test_market_lens_workflow_explicit_data_sections_return_data_context(client):
    stock_envelope = {
        "ok": True,
        "tool": "stock_data",
        "request": {"symbol": "NVDA", "sections": ["technical"]},
        "data": {"symbol": "NVDA", "sections": {"technical": {"rsi": 45}}},
        "errors": [],
        "freshness": {"source": "test"},
    }
    with patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ), patch(
        "app.features.kol_research.router.mcp_data.get_stock_data",
        new_callable=AsyncMock,
        return_value=stock_envelope,
    ) as mock_stock_data:
        resp = client.post(
            "/api/kol_research/personas/qinbafrank/mcp/workflow",
            json={
                "workflow": "stock_diagnosis",
                "question": "NVDA 技术面如何？",
                "ticker": "NVDA",
                "include_market_data": True,
                "data_sections": ["technical"],
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["market_context"] == []
    assert body["data_context"] == [stock_envelope]
    assert body["data_freshness"]["stock_data"] == {"source": "test"}
    assert body["data_errors"] == []
    mock_stock_data.assert_awaited_once()


def test_market_lens_workflow_returns_serenity_lens_context_pack(client):
    with patch(
        "app.features.kol_research.router._mcp_search_chunks",
        new_callable=AsyncMock,
        return_value=[_Chunk()],
    ) as mock_search:
        resp = client.post(
            "/api/kol_research/personas/aleabitoreddit/mcp/workflow",
            json={
                "workflow": "stock_diagnosis",
                "question": "SIVE 的验证窗口怎么看？",
                "ticker": "SIVE",
                "evidence_limit": 3,
                "include_market_data": False,
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["persona_username"] == "aleabitoreddit"
    assert body["workflow"] == "stock_diagnosis"
    methodology = body["methodology_context"]
    selected = methodology["selected_lenses"]
    selected_ids = {(item["lens_type"], item["lens_id"]) for item in selected}
    assert ("core", "bottleneck-operating-system") in selected_ids
    assert ("framework", "ask-about-stock") in selected_ids
    assert ("ticker", "SIVE") in selected_ids
    assert ("sector", "photonics-and-cpo") in selected_ids
    joined_bodies = "\n".join(item["full_body"] or "" for item in selected)
    forbidden = ("qinbafrank", "三杀", "杀估值", "杀业绩", "杀逻辑")
    assert not any(term in joined_bodies for term in forbidden)
    assert methodology["ticker_methodology"]["SIVE"]["thesis"]
    mock_search.assert_awaited_once()


def test_market_lens_workflow_rejects_unknown_persona(client):
    resp = client.post(
        "/api/kol_research/personas/unknown-persona/mcp/workflow",
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
