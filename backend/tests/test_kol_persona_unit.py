"""Unit tests for shared/kol_persona/.

Loads the real qinbafrank skill files and verifies the parsed Persona shape,
ADK Skill adapter, and search_kol_tweets contract.

Vector search is mocked; no Insforge / embedding round-trip happens.
"""

from __future__ import annotations

from typing import List
from unittest.mock import AsyncMock, patch

import pytest

from app.features.vector.models import (
    VectorChunkResult,
    VectorSearchResponse,
    VectorTextSearchResponse,
)
from app.shared.kol_persona import (
    Persona,
    build_always_on_instruction,
    build_lens_skills,
    chunk_to_persona_result,
    clear_persona_cache,
    get_persona,
    list_personas,
    persona_chunks_buffer,
    search_kol_tweets,
)


@pytest.fixture(autouse=True)
def _reset_cache():
    clear_persona_cache()
    yield
    clear_persona_cache()


@pytest.fixture(autouse=True)
def _mock_empty_text_search():
    with patch(
        "app.shared.kol_persona.tools.vector_text_search",
        AsyncMock(
            return_value=VectorTextSearchResponse(
                success=True,
                keywords=[],
                count=0,
                results=[],
            )
        ),
    ) as mock:
        yield mock


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_get_persona_loads_qinbafrank():
    persona = get_persona("qinbafrank")
    assert persona is not None
    assert persona.username == "qinbafrank"
    assert persona.orchestrator is not None
    assert len(persona.cross_cutting) >= 1
    assert len(persona.lenses) >= 4
    assert any(
        name.startswith(("sector-", "ticker-", "framework-"))
        for name in persona.lenses
    )


def test_get_persona_unknown_returns_none():
    assert get_persona("does-not-exist") is None


def test_list_personas_includes_qinbafrank():
    summaries = list_personas()
    usernames = [s.username for s in summaries]
    assert "qinbafrank" in usernames
    qinba = next(s for s in summaries if s.username == "qinbafrank")
    assert qinba.lenses_available  # non-empty
    assert qinba.description
    assert "Investor in AI" in qinba.description
    assert "skill distillation" not in qinba.description


def test_pandacircle_binds_zsxq_and_selected_twitter_corpus():
    persona = get_persona("pandacircle")
    assert persona is not None

    bindings = {
        (binding.author_username, tuple(binding.source_types)): binding.metadata
        for binding in persona.corpus_bindings
    }
    assert bindings[("pandacircle", ("zsxq_thread",))] == {}
    assert bindings[("JohnsonZ91127", ("kol_tweet",))] == {"quality": "keep"}
    assert persona.corpus_source_types == ["zsxq_thread", "kol_tweet"]


def test_lens_frontmatter_name_is_spec_compliant():
    """Spec: name must be lowercase + hyphen + digits, no underscore / space."""
    persona = get_persona("qinbafrank")
    assert persona is not None
    for name in persona.lenses:
        assert name == name.lower()
        assert "_" not in name
        assert " " not in name
        assert not name.startswith("-") and not name.endswith("-")


def test_lens_description_under_spec_limit():
    """Spec: description max 1024 chars; we cap at 1000 + ellipsis."""
    persona = get_persona("qinbafrank")
    assert persona is not None
    for doc in persona.lenses.values():
        assert 1 <= len(doc.description) <= 1024


def test_build_always_on_instruction_contains_signature_phrases():
    """The always-on block must surface qinbafrank's signature phrases for the agent."""
    persona = get_persona("qinbafrank")
    assert persona is not None
    text = build_always_on_instruction(persona)
    assert "强信念" in text
    assert "证伪" in text


# ---------------------------------------------------------------------------
# ADK Skill adapter
# ---------------------------------------------------------------------------


def test_build_lens_skills_produces_adk_skill_objects():
    persona = get_persona("qinbafrank")
    assert persona is not None
    skills = build_lens_skills(persona)
    assert len(skills) == len(persona.lenses)
    # Each skill must have a non-empty name + description
    for s in skills:
        assert s.frontmatter.name
        assert s.frontmatter.description
        assert s.instructions  # body present


# ---------------------------------------------------------------------------
# search_kol_tweets
# ---------------------------------------------------------------------------


def _fake_chunk(idx: int, *, source_id: str | None = None) -> VectorChunkResult:
    source_id = source_id or f"tweet-{idx + 1}"
    return VectorChunkResult(
        id=f"chunk-{idx}",
        document_id=f"doc-{idx}",
        source_type="kol_tweet",
        source_id=source_id,
        chunk_index=idx,
        content=f"Fake chunk #{idx} content about NVDA.",
        title=f"@qinbafrank tweet {source_id}",
        url=f"https://x.com/qinbafrank/status/{source_id}",
        metadata={
            "author_username": "qinbafrank",
            "created_at": "2026-04-12T10:00:00Z",
            "tickers": ["NVDA"],
        },
        similarity=0.9 - idx * 0.05,
    )


def _fake_reference_chunk() -> VectorChunkResult:
    return VectorChunkResult(
        id="chunk-ref",
        document_id="doc-ref",
        source_type="kol_tweet",
        source_id="2062463349573718318",
        chunk_index=0,
        content="Frank interview reference about AI commercialization.",
        title="@qinbafrank interview_reference 2026-06-04",
        url="https://x.com/168X_Fortune/status/2062463349573718318",
        metadata={
            "author_username": "qinbafrank",
            "persona_username": "qinbafrank",
            "source_author_username": "168X_Fortune",
            "created_at": "2026-06-04T09:15:55Z",
            "tickers": ["NVDA"],
        },
        similarity=0.88,
    )


@pytest.mark.asyncio
async def test_search_kol_tweets_returns_indexed_markdown():
    fake_chunks: List[VectorChunkResult] = [_fake_chunk(i) for i in range(3)]
    fake_resp = VectorSearchResponse(
        success=True, query="NVDA", count=len(fake_chunks), results=fake_chunks
    )
    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(return_value=fake_resp),
    ):
        out = await search_kol_tweets("NVDA", author_username="qinbafrank", k=3)
    assert "[#1]" in out and "[#2]" in out and "[#3]" in out
    assert "@qinbafrank" in out
    assert "2026-04-12" in out
    assert "NVDA" in out


@pytest.mark.asyncio
async def test_search_kol_tweets_labels_reference_source_author():
    fake_resp = VectorSearchResponse(
        success=True,
        query="AI",
        count=1,
        results=[_fake_reference_chunk()],
    )
    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(return_value=fake_resp),
    ):
        out = await search_kol_tweets("AI", author_username="qinbafrank", k=1)

    assert "@168X_Fortune / persona @qinbafrank" in out
    assert "Frank interview reference" in out


@pytest.mark.asyncio
async def test_search_kol_tweets_expands_single_ticker_query_for_zsxq_persona(
    _mock_empty_text_search,
):
    """Short ticker-only queries need aliases + ticker metadata to retrieve zsxq posts."""
    fake_text_resp = VectorTextSearchResponse(
        success=True,
        keywords=["AMD"],
        count=1,
        results=[_fake_chunk(0, source_id="zsxq-amd")],
    )
    _mock_empty_text_search.return_value = fake_text_resp
    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(
            return_value=VectorSearchResponse(
                success=True,
                query="AMD",
                count=0,
                results=[],
            )
        ),
    ):
        out = await search_kol_tweets(
            "AMD",
            author_username="pandacircle",
            k=5,
            query_variants=["Advanced Micro Devices", "超威半导体", "MI300"],
        )

    assert "[#1]" in out
    text_requests = [call.args[0] for call in _mock_empty_text_search.await_args_list]
    assert any("Advanced Micro Devices" in req.keywords for req in text_requests)
    assert any("超威半导体" in req.keywords for req in text_requests)
    assert any("MI300" in req.keywords for req in text_requests)
    assert any(req.filters.source_types == ["zsxq_thread"] for req in text_requests)
    assert any(
        req.filters.metadata == {
            "author_username": "pandacircle",
            "tickers": ["AMD"],
        }
        for req in text_requests
    )
    assert any(req.filters.source_types == ["kol_tweet"] for req in text_requests)
    assert any(
        req.filters.metadata == {
            "author_username": "JohnsonZ91127",
            "quality": "keep",
            "tickers": ["AMD"],
        }
        for req in text_requests
    )


@pytest.mark.asyncio
async def test_pandacircle_search_keeps_twitter_hits_visible_when_zsxq_has_many_exact_hits(
    _mock_empty_text_search,
):
    """Multi-corpus Panda retrieval should not let zsxq fill all citation slots."""
    zsxq_chunks = [
        VectorChunkResult(
            id=f"zsxq-chunk-{idx}",
            document_id=f"zsxq-doc-{idx}",
            source_type="zsxq_thread",
            source_id=f"zsxq-{idx}",
            chunk_index=0,
            content=f"ZSXQ exact hit #{idx}",
            title=f"zsxq {idx}",
            url=f"https://wx.zsxq.com/dweb2/index/topic_detail/{idx}",
            metadata={"author_username": "pandacircle", "created_at": "2026-06-01T00:00:00Z"},
            similarity=0.85,
        )
        for idx in range(8)
    ]
    twitter_chunk = VectorChunkResult(
        id="tweet-chunk",
        document_id="tweet-doc",
        source_type="kol_tweet",
        source_id="2064265925122253011",
        chunk_index=0,
        content="JohnsonZ91127 tweet about SNOW NOW PANW CRWD AI 底座.",
        title="@JohnsonZ91127 tweet 2064265925122253011",
        url="https://x.com/JohnsonZ91127/status/2064265925122253011",
        metadata={
            "author_username": "JohnsonZ91127",
            "quality": "keep",
            "created_at": "2026-06-09T08:38:43Z",
            "tickers": ["SNOW", "NOW", "PANW", "CRWD"],
        },
        similarity=0.85,
    )

    async def fake_text_search(req):
        metadata = req.filters.metadata
        if metadata.get("author_username") == "pandacircle":
            return VectorTextSearchResponse(
                success=True,
                keywords=req.keywords,
                count=len(zsxq_chunks),
                results=zsxq_chunks,
            )
        if metadata.get("author_username") == "JohnsonZ91127":
            return VectorTextSearchResponse(
                success=True,
                keywords=req.keywords,
                count=1,
                results=[twitter_chunk],
            )
        return VectorTextSearchResponse(success=True, keywords=req.keywords, count=0, results=[])

    _mock_empty_text_search.side_effect = fake_text_search
    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(
            return_value=VectorSearchResponse(
                success=True,
                query="SNOW",
                count=0,
                results=[],
            )
        ),
    ):
        buf: list[VectorChunkResult] = []
        token = persona_chunks_buffer.set(buf)
        try:
            out = await search_kol_tweets(
                "软件股 SNOW NOW PANW CRWD",
                author_username="pandacircle",
                k=6,
            )
        finally:
            persona_chunks_buffer.reset(token)

    assert "2064265925122253011" in {chunk.source_id for chunk in buf}
    assert any(chunk.source_type == "kol_tweet" for chunk in buf)
    assert "@JohnsonZ91127" in out


@pytest.mark.asyncio
async def test_pandacircle_query_drops_weak_semantic_hit_without_sector_rules(
    _mock_empty_text_search,
):
    """Broad queries should use vector relevance, not hand-written sector mapping."""
    relevant_chunk = VectorChunkResult(
        id="tweet-relevant-chunk",
        document_id="tweet-relevant-doc",
        source_type="kol_tweet",
        source_id="tweet-relevant",
        chunk_index=0,
        content="JohnsonZ91127 tweet discussing enterprise software monetization.",
        title="@JohnsonZ91127 tweet tweet-relevant",
        url="https://x.com/JohnsonZ91127/status/tweet-relevant",
        metadata={
            "author_username": "JohnsonZ91127",
            "quality": "keep",
            "created_at": "2026-06-09T08:38:43Z",
        },
        similarity=0.62,
    )
    spacex_chunk = VectorChunkResult(
        id="tweet-spacex-chunk",
        document_id="tweet-spacex-doc",
        source_type="kol_tweet",
        source_id="tweet-spacex",
        chunk_index=0,
        content="JohnsonZ91127 tweet about SpaceX IPO and xAI infrastructure.",
        title="@JohnsonZ91127 tweet tweet-spacex",
        url="https://x.com/JohnsonZ91127/status/tweet-spacex",
        metadata={
            "author_username": "JohnsonZ91127",
            "quality": "keep",
            "created_at": "2026-06-08T08:38:43Z",
            "tickers": ["SPACEX", "XAI"],
        },
        similarity=0.56,
    )

    async def fake_vector_search(req):
        metadata = req.filters.metadata
        if metadata.get("author_username") != "JohnsonZ91127":
            return VectorSearchResponse(
                success=True,
                query=req.query,
                count=0,
                results=[],
            )
        if "tickers" not in metadata:
            return VectorSearchResponse(
                success=True,
                query=req.query,
                count=2,
                results=[relevant_chunk, spacex_chunk],
            )
        return VectorSearchResponse(
            success=True,
            query=req.query,
            count=0,
            results=[],
        )

    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(side_effect=fake_vector_search),
    ) as mock_vector_search:
        buf: list[VectorChunkResult] = []
        token = persona_chunks_buffer.set(buf)
        try:
            out = await search_kol_tweets(
                "软件股怎么看",
                author_username="pandacircle",
                k=4,
            )
        finally:
            persona_chunks_buffer.reset(token)

    source_ids = {chunk.source_id for chunk in buf}
    assert "tweet-relevant" in source_ids
    assert "tweet-spacex" not in source_ids
    assert "enterprise software monetization" in out
    assert "SpaceX IPO" not in out
    vector_requests = [call.args[0] for call in mock_vector_search.await_args_list]
    assert all(
        "tickers" not in req.filters.metadata
        for req in vector_requests
        if req.filters.metadata.get("author_username") == "JohnsonZ91127"
    )


@pytest.mark.asyncio
async def test_search_kol_tweets_buffers_chunks_in_contextvar():
    fake_chunks = [_fake_chunk(i) for i in range(2)]
    fake_resp = VectorSearchResponse(
        success=True, query="HBM", count=2, results=fake_chunks
    )
    buf: list[VectorChunkResult] = []
    token = persona_chunks_buffer.set(buf)
    try:
        with patch(
            "app.shared.kol_persona.tools.vector_search",
            AsyncMock(return_value=fake_resp),
        ):
            await search_kol_tweets("HBM")
        assert len(buf) == 2
        assert buf[0].source_type == "kol_tweet"
    finally:
        persona_chunks_buffer.reset(token)


@pytest.mark.asyncio
async def test_search_kol_tweets_dedupes_and_continues_numbering_across_calls():
    """Multiple calls share [#N] indices and do not re-add the same source."""
    buf: list[VectorChunkResult] = []
    token = persona_chunks_buffer.set(buf)
    try:
        # First call -> 2 hits
        with patch(
            "app.shared.kol_persona.tools.vector_search",
            AsyncMock(
                return_value=VectorSearchResponse(
                    success=True,
                    query="A",
                    count=2,
                    results=[_fake_chunk(i) for i in range(2)],
                )
            ),
        ):
            first = await search_kol_tweets("A")
        assert "[#1]" in first and "[#2]" in first

        # Second call returns an already-cited source -> no new citation.
        with patch(
            "app.shared.kol_persona.tools.vector_search",
            AsyncMock(
                return_value=VectorSearchResponse(
                    success=True,
                    query="B",
                    count=1,
                    results=[_fake_chunk(0, source_id="tweet-2")],
                )
            ),
        ):
            second = await search_kol_tweets("B")
        assert "already cited earlier" in second
        assert "[#3]" not in second
        assert len(buf) == 2

        # Third call returns a new source -> numbering continues at [#3].
        with patch(
            "app.shared.kol_persona.tools.vector_search",
            AsyncMock(
                return_value=VectorSearchResponse(
                    success=True,
                    query="C",
                    count=1,
                    results=[_fake_chunk(0, source_id="tweet-3")],
                )
            ),
        ):
            third = await search_kol_tweets("C")
        assert "[#3]" in third
        assert "[#1]" not in third  # not restart
        assert len(buf) == 3
    finally:
        persona_chunks_buffer.reset(token)


@pytest.mark.asyncio
async def test_search_kol_tweets_degrades_on_vector_failure():
    """Vector layer error must not propagate — caller should keep going."""
    with patch(
        "app.shared.kol_persona.tools.vector_search",
        AsyncMock(side_effect=RuntimeError("vector EF down")),
    ):
        out = await search_kol_tweets("NVDA")
    assert "No prior tweets matched" in out


def test_chunk_to_persona_result_preserves_metadata():
    chunk = _fake_chunk(0)
    result = chunk_to_persona_result(chunk, citation_index=7)
    assert result.citation_index == 7
    assert result.author_username == "qinbafrank"
    assert result.tickers == ["NVDA"]
    assert result.source_id == "tweet-1"
    assert result.source_type == "kol_tweet"
    assert result.metadata["source_type"] == "kol_tweet"
