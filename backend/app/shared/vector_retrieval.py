"""Shared vector retrieval helpers."""

from __future__ import annotations

from app.features.vector.models import VectorSearchFilters, VectorSearchRequest, VectorSearchResponse
from app.features.vector.service import search as vector_search


async def search_public_kol_tweet_chunks(
    *,
    query: str,
    top_k: int,
    threshold: float,
) -> VectorSearchResponse:
    """Search public KOL tweet chunks in the shared vector index."""
    return await vector_search(
        VectorSearchRequest(
            query=query,
            top_k=top_k,
            threshold=threshold,
            filters=VectorSearchFilters(
                source_types=["kol_tweet"],
                visibility="public",
            ),
        )
    )
