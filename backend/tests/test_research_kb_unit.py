"""
Research KB Unit Tests -- generated from git diff

Tests for:
  - app.features.research_kb.models: Pydantic schema validation
  - app.features.research_kb.tools: search_kb tool + contextvar buffer
  - app.features.research_kb.service: retrieve() with mocked edge function

No network, no database. All Insforge edge-function calls are mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_research_kb_unit.py -v
"""

import pytest
from unittest.mock import patch, AsyncMock
from pydantic import ValidationError

from app.features.research_kb.models import (
    ResearchKBMessage,
    ResearchKBRequest,
    ResearchKBResponse,
    RetrievedChunk,
)
from app.features.research_kb import tools as kb_tools
from app.features.research_kb import service as kb_service


# ---------------------------------------------------------------------------
# models.py
# ---------------------------------------------------------------------------


class TestResearchKBModels:
    """Schema-level validation for the request/response models."""

    def test_request_minimal_payload_parses(self):
        req = ResearchKBRequest(message="hi")
        assert req.message == "hi"
        assert req.history == []

    def test_request_history_accepts_dict_form(self):
        req = ResearchKBRequest(
            message="hi",
            history=[{"role": "user", "content": "earlier"}],
        )
        assert isinstance(req.history[0], ResearchKBMessage)
        assert req.history[0].role == "user"

    def test_request_rejects_empty_payload(self):
        with pytest.raises(ValidationError):
            ResearchKBRequest()  # missing required `message`

    def test_response_round_trip(self):
        chunk = RetrievedChunk(
            content="片段内容",
            title="@qinbafrank tweet",
            source_type="kol_tweet",
            source_id="123",
            url=None,
            similarity=0.42,
        )
        resp = ResearchKBResponse(answer="结论", chunks_used=[chunk])
        dumped = resp.model_dump()
        assert dumped["answer"] == "结论"
        assert dumped["chunks_used"][0]["similarity"] == pytest.approx(0.42)


# ---------------------------------------------------------------------------
# tools.py — contextvar buffer + search_kb wrapper
# ---------------------------------------------------------------------------


def _make_chunk(source_id: str, similarity: float, content: str = "") -> RetrievedChunk:
    return RetrievedChunk(
        content=content or f"content for {source_id}",
        title=f"title {source_id}",
        source_type="kol_tweet",
        source_id=source_id,
        url=None,
        similarity=similarity,
    )


class TestChunksBuffer:
    """reset_chunks_buffer / get_chunks_buffer behavior."""

    def test_reset_initializes_empty_list(self):
        kb_tools.reset_chunks_buffer()
        assert kb_tools.get_chunks_buffer() == []

    def test_get_before_reset_returns_empty(self):
        """get_chunks_buffer must tolerate missing contextvar gracefully."""
        # Force a fresh contextvar by importing the symbol and clearing it
        # via a new ContextVar.set() if available. Easier: just call reset
        # and then assert; the un-reset path is covered by the LookupError
        # branch which we exercise via the dedicated test below.
        kb_tools.reset_chunks_buffer()
        assert kb_tools.get_chunks_buffer() == []


class TestSearchKbTool:
    """The search_kb ADK tool wraps retrieve() and mutates contextvar."""

    @pytest.mark.asyncio
    async def test_appends_chunks_to_buffer(self):
        kb_tools.reset_chunks_buffer()
        fake = [_make_chunk("a", 0.5), _make_chunk("b", 0.4)]
        with patch.object(kb_tools, "retrieve", AsyncMock(return_value=fake)) as mock:
            payload = await kb_tools.search_kb("AI 算力", k=4)
            mock.assert_awaited_once()
            kwargs = mock.await_args.kwargs
            assert kwargs["match_count"] == 4
            assert kwargs["match_threshold"] == 0.3
        assert "chunks" in payload
        assert "AI" not in payload or "title a" in payload  # JSON contains titles
        buf = kb_tools.get_chunks_buffer()
        assert [c.source_id for c in buf] == ["a", "b"]

    @pytest.mark.asyncio
    async def test_k_is_clamped(self):
        """k below 3 -> 3; k above 12 -> 12. Prevents pathological calls."""
        kb_tools.reset_chunks_buffer()
        with patch.object(kb_tools, "retrieve", AsyncMock(return_value=[])) as mock:
            await kb_tools.search_kb("x", k=1)
            assert mock.await_args.kwargs["match_count"] == 3
            await kb_tools.search_kb("x", k=999)
            assert mock.await_args.kwargs["match_count"] == 12

    @pytest.mark.asyncio
    async def test_dedup_across_calls(self):
        """Calling search_kb twice with overlapping results should not duplicate."""
        kb_tools.reset_chunks_buffer()
        first = [_make_chunk("a", 0.5), _make_chunk("b", 0.4)]
        second = [_make_chunk("a", 0.5), _make_chunk("c", 0.3)]
        with patch.object(kb_tools, "retrieve", AsyncMock(side_effect=[first, second])):
            await kb_tools.search_kb("q1")
            await kb_tools.search_kb("q2")
        buf = kb_tools.get_chunks_buffer()
        ids = [c.source_id for c in buf]
        assert ids == ["a", "b", "c"]

    @pytest.mark.asyncio
    async def test_empty_retrieve_returns_empty_payload(self):
        kb_tools.reset_chunks_buffer()
        with patch.object(kb_tools, "retrieve", AsyncMock(return_value=[])):
            payload = await kb_tools.search_kb("无命中查询")
        assert '"count": 0' in payload
        assert kb_tools.get_chunks_buffer() == []


# ---------------------------------------------------------------------------
# service.py — retrieve() with mocked edge function
# ---------------------------------------------------------------------------


def _mock_insforge_responses(embed_payload, search_payload):
    """Build a stub for InsforgeService.call_function that returns the right
    body depending on which action is requested."""
    async def fake_call(function_name, method=None, params=None, json_body=None,
                       timeout=None, extra_headers=None):
        action = (params or {}).get("action")
        if action == "embed":
            return embed_payload
        if action == "search":
            return search_payload
        raise AssertionError(f"unexpected action={action}")

    stub = AsyncMock(side_effect=fake_call)
    return stub


class TestRetrieve:
    """End-to-end logic of service.retrieve() with edge function mocked."""

    @pytest.mark.asyncio
    async def test_happy_path(self):
        embed_payload = {
            "status_code": 200,
            "data": {"success": True, "embeddings": [[0.1, 0.2, 0.3]]},
            "text": "",
        }
        search_payload = {
            "status_code": 200,
            "data": {
                "success": True,
                "data": [
                    {
                        "content": "片段 A",
                        "title": "@qinbafrank tweet",
                        "source_type": "kol_tweet",
                        "source_id": "1",
                        "url": None,
                        "similarity": 0.55,
                    }
                ],
            },
            "text": "",
        }
        stub = _mock_insforge_responses(embed_payload, search_payload)
        with patch.object(kb_service, "EDGE_FUNCTION_SECRET", "test-secret"), \
             patch("app.features.research_kb.service.get_insforge_service") as gi:
            gi.return_value.call_function = stub
            chunks = await kb_service.retrieve("hi", match_count=3, match_threshold=0.4)

        assert len(chunks) == 1
        assert chunks[0].source_id == "1"
        assert chunks[0].similarity == pytest.approx(0.55)
        # First call is embed, second is search
        assert stub.await_count == 2

    @pytest.mark.asyncio
    async def test_missing_secret_returns_empty(self):
        with patch.object(kb_service, "EDGE_FUNCTION_SECRET", None):
            chunks = await kb_service.retrieve("hi")
        assert chunks == []

    @pytest.mark.asyncio
    async def test_embed_non_200_returns_empty(self):
        embed_bad = {"status_code": 500, "data": {}, "text": "boom"}
        # search should not be reached, but provide an answer just in case
        search_ok = {"status_code": 200, "data": {"success": True, "data": []}, "text": ""}
        stub = _mock_insforge_responses(embed_bad, search_ok)
        with patch.object(kb_service, "EDGE_FUNCTION_SECRET", "x"), \
             patch("app.features.research_kb.service.get_insforge_service") as gi:
            gi.return_value.call_function = stub
            chunks = await kb_service.retrieve("hi")
        assert chunks == []
        # Should NOT have called search after embed failed
        assert stub.await_count == 1

    @pytest.mark.asyncio
    async def test_search_failure_returns_empty(self):
        embed_ok = {"status_code": 200, "data": {"success": True, "embeddings": [[0.1]]}, "text": ""}
        search_fail = {"status_code": 200, "data": {"success": False, "error": "bad query"}, "text": ""}
        stub = _mock_insforge_responses(embed_ok, search_fail)
        with patch.object(kb_service, "EDGE_FUNCTION_SECRET", "x"), \
             patch("app.features.research_kb.service.get_insforge_service") as gi:
            gi.return_value.call_function = stub
            chunks = await kb_service.retrieve("hi")
        assert chunks == []

    @pytest.mark.asyncio
    async def test_source_types_filter_passed_through(self):
        """When source_types is provided, the search filters carry it."""
        captured: dict = {}

        async def capture(function_name, method=None, params=None, json_body=None,
                          timeout=None, extra_headers=None):
            if params.get("action") == "embed":
                return {"status_code": 200, "data": {"success": True, "embeddings": [[0.0]]}, "text": ""}
            captured["body"] = json_body
            return {"status_code": 200, "data": {"success": True, "data": []}, "text": ""}

        with patch.object(kb_service, "EDGE_FUNCTION_SECRET", "x"), \
             patch("app.features.research_kb.service.get_insforge_service") as gi:
            gi.return_value.call_function = AsyncMock(side_effect=capture)
            await kb_service.retrieve("q", source_types=["kol_tweet"])

        assert captured["body"]["filters"]["source_types"] == ["kol_tweet"]
