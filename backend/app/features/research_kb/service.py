"""Retrieve chunks from Insforge vector-store edge function.

Two HTTP calls per query: embed the user message via `?action=embed`,
then search via `?action=search` (which proxies the `match_vector_chunks`
RPC). The edge function lives on Insforge and reuses pgvector + HNSW.
"""

from typing import Optional

from app.core.feature_pause import require_active
from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.research_kb.models import RetrievedChunk

logger = get_logger(__name__)

_FUNCTION_NAME = "vector-store"


def _headers() -> Optional[dict]:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def _embed(query: str) -> Optional[list[float]]:
    headers = _headers()
    if headers is None:
        logger.warning("research_kb: EDGE_FUNCTION_SECRET missing, skip embed")
        return None
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "embed"},
        json_body={"input": query},
        timeout=15.0,
        extra_headers=headers,
    )
    if result["status_code"] != 200:
        logger.warning("research_kb: embed non-200 status=%s text=%s",
                       result["status_code"], (result.get("text") or "")[:200])
        return None
    data = result.get("data") or {}
    if not data.get("success"):
        logger.warning("research_kb: embed failed err=%s", data.get("error"))
        return None
    embeddings = data.get("embeddings") or []
    if not embeddings:
        return None
    return embeddings[0]


async def _search(
    query_embedding: list[float],
    match_count: int,
    match_threshold: float,
    source_types: Optional[list[str]] = None,
) -> list[dict]:
    headers = _headers()
    if headers is None:
        return []
    filters: dict = {}
    if source_types:
        filters["source_types"] = source_types
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "search"},
        json_body={
            "query_embedding": query_embedding,
            "match_count": match_count,
            "match_threshold": match_threshold,
            "filters": filters,
        },
        timeout=15.0,
        extra_headers=headers,
    )
    if result["status_code"] != 200:
        logger.warning("research_kb: search non-200 status=%s text=%s",
                       result["status_code"], (result.get("text") or "")[:200])
        return []
    data = result.get("data") or {}
    if not data.get("success"):
        logger.warning("research_kb: search failed err=%s", data.get("error"))
        return []
    return data.get("data") or []


async def retrieve(
    query: str,
    *,
    match_count: int = 6,
    match_threshold: float = 0.3,
    source_types: Optional[list[str]] = None,
) -> list[RetrievedChunk]:
    """Embed query and return top-k chunks ordered by similarity."""
    require_active("research_kb")
    embedding = await _embed(query)
    if embedding is None:
        return []
    hits = await _search(embedding, match_count, match_threshold, source_types)
    chunks: list[RetrievedChunk] = []
    for h in hits:
        chunks.append(RetrievedChunk(
            content=h.get("content") or "",
            title=h.get("title"),
            source_type=h.get("source_type") or "",
            source_id=h.get("source_id") or "",
            url=h.get("url"),
            similarity=float(h.get("similarity") or 0.0),
        ))
    logger.info("research_kb: retrieved %d chunks for query=%s", len(chunks), query[:60])
    return chunks
