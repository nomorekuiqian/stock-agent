"""Unit tests for shared/kol_persona/ — Phase 1 of kol-persona-research-agent plan.

Loads the real qinbafrank .md files under
`backend/app/features/twitter/methodologies/qinbafrank/` and verifies the
parsed Persona shape + ADK Skill adapter + search_kol_tweets contract.

Vector search is mocked; no Insforge / embedding round-trip happens.
"""

from __future__ import annotations

from typing import List
from unittest.mock import AsyncMock, patch

import pytest

from app.features.vector.models import VectorChunkResult, VectorSearchResponse
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


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_get_persona_loads_qinbafrank():
    persona = get_persona("qinbafrank")
    assert persona is not None
    assert persona.username == "qinbafrank"
    # orchestrator + overview + at least one principle + 4 lenses
    assert persona.orchestrator is not None
    assert persona.overview is not None
    assert len(persona.cross_cutting) >= 1
    assert len(persona.lenses) >= 4
    assert "qinbafrank-on-stocks" in persona.lenses


def test_get_persona_unknown_returns_none():
    assert get_persona("does-not-exist") is None


def test_list_personas_includes_qinbafrank():
    summaries = list_personas()
    usernames = [s.username for s in summaries]
    assert "qinbafrank" in usernames
    qinba = next(s for s in summaries if s.username == "qinbafrank")
    assert qinba.lenses_available  # non-empty
    assert qinba.description  # derived from overview.md


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
    # Signature phrases from overview.md — proof orchestrator+overview+principles are concatenated
    assert "电力的视角去看算力" in text
    # falsifiability principle proof
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


def _fake_chunk(idx: int, *, source_id: str = "tweet-1") -> VectorChunkResult:
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
async def test_search_kol_tweets_continues_numbering_across_calls():
    """Multiple calls in the same agent run share [#N] indices via the buffer."""
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

        # Second call -> starts at [#3]
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
        assert "[#3]" in second
        assert "[#1]" not in second  # not restart
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
    assert "unavailable" in out.lower()


def test_chunk_to_persona_result_preserves_metadata():
    chunk = _fake_chunk(0)
    result = chunk_to_persona_result(chunk, citation_index=7)
    assert result.citation_index == 7
    assert result.author_username == "qinbafrank"
    assert result.tickers == ["NVDA"]
    assert result.source_id == "tweet-1"
