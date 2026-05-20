"""Database operations for generic vector storage via Insforge Edge Functions."""

from __future__ import annotations

from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.vector.models import VectorChunkResult, VectorSearchFilters

logger = get_logger(__name__)

_FUNCTION_NAME = "vector-store"


def internal_headers() -> dict | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def get_document_by_hash(
    *,
    source_type: str,
    source_id: str,
    content_hash: str,
) -> dict[str, Any] | None:
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "get_document_by_hash",
            "source_type": source_type,
            "source_id": source_id,
            "content_hash": content_hash,
        },
        timeout=20.0,
    )
    if result["status_code"] != 200:
        return None
    payload = result.get("data") or {}
    if not payload.get("success"):
        return None
    return payload.get("data")


async def upsert_document(document: dict[str, Any]) -> dict[str, Any]:
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_document"},
        json_body=document,
        timeout=30.0,
        extra_headers=internal_headers(),
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "upsert_document failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


async def upsert_chunks(chunks: list[dict[str, Any]]) -> int:
    if not chunks:
        return 0
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_chunks"},
        json_body={"chunks": chunks},
        timeout=60.0,
        extra_headers=internal_headers(),
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "upsert_chunks failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return int(payload.get("count") or 0)


async def search_chunks(
    *,
    query_embedding: list[float],
    top_k: int,
    threshold: float,
    filters: VectorSearchFilters,
) -> list[VectorChunkResult]:
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "search"},
        json_body={
            "query_embedding": query_embedding,
            "match_count": top_k,
            "match_threshold": threshold,
            "filters": filters.model_dump(exclude_none=True),
        },
        timeout=30.0,
        extra_headers=internal_headers(),
    )
    payload = result.get("data") or {}
    if result["status_code"] != 200 or not payload.get("success"):
        raise RuntimeError(
            "vector search failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    rows = payload.get("data") or []
    return [VectorChunkResult.model_validate(row) for row in rows]


async def delete_source(source_type: str, source_id: str) -> dict[str, int]:
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="DELETE",
        params={
            "action": "delete_source",
            "source_type": source_type,
            "source_id": source_id,
        },
        timeout=30.0,
        extra_headers=internal_headers(),
    )
    payload = result.get("data") or {}
    if result["status_code"] != 200 or not payload.get("success"):
        raise RuntimeError(
            "delete_source failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return {
        "deleted_documents": int(payload.get("deleted_documents") or 0),
        "deleted_chunks": int(payload.get("deleted_chunks") or 0),

    }
