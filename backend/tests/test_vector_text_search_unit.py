"""
Vector text-search unit tests generated from the current git diff.

Tests for:
- service.search_text blank keyword handling
- PostgREST fallback keyword pattern normalization
- REST fallback text similarity scoring
- source timestamp parsing

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_vector_text_search_unit.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.vector import service as vector_service
from app.features.vector.db import (
    _postgrest_ilike_pattern,
    _source_timestamp,
    _text_similarity,
)
from app.features.vector.models import VectorTextSearchRequest


@pytest.mark.asyncio
async def test_search_text_blank_keywords_returns_empty_without_db_call():
    """Whitespace-only keywords are normalized away before any DB call."""
    with patch.object(
        vector_service.db,
        "search_chunks_by_text",
        AsyncMock(return_value=[]),
    ) as mock_search:
        resp = await vector_service.search_text(
            VectorTextSearchRequest(keywords=[" ", "\t"], top_k=5)
        )

    assert resp.success is True
    assert resp.keywords == []
    assert resp.count == 0
    assert resp.results == []
    mock_search.assert_not_awaited()


def test_postgrest_ilike_pattern_strips_structural_chars():
    """REST fallback keyword patterns should be broad but structurally safe."""
    assert _postgrest_ilike_pattern(" AMD,(MI300) ") == "*AMD MI300*"
    assert _postgrest_ilike_pattern("   ") == ""


def test_text_similarity_scores_title_content_and_metadata_hits():
    """Fallback scoring ranks title hits above content and metadata hits."""
    assert _text_similarity({"title": "AMD note", "content": "", "metadata": {}}, ["AMD"]) == 1.0
    assert (
        _text_similarity(
            {"title": "", "content": "Advanced Micro Devices update", "metadata": {}},
            ["Advanced"],
        )
        == 0.95
    )
    assert (
        _text_similarity(
            {"title": "", "content": "", "metadata": {"tickers": ["AMD"]}},
            ["AMD"],
        )
        == 0.9
    )
    assert _text_similarity({"title": "", "content": "", "metadata": {}}, ["AMD"]) == 0.85


def test_source_timestamp_parses_iso_and_handles_bad_values():
    """Fallback ordering can sort ISO timestamps and ignore invalid values."""
    assert _source_timestamp({"created_at": "2026-05-20T00:00:00Z"}) > 0
    assert _source_timestamp({"created_at": "not-a-date"}) == 0.0
    assert _source_timestamp({}) == 0.0
