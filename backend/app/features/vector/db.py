"""Database operations for generic vector storage via Insforge Edge Functions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET, INSFORGE_ANON_KEY, INSFORGE_SERVICE_KEY
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


async def search_chunks_by_text(
    *,
    keywords: list[str],
    top_k: int,
    filters: VectorSearchFilters,
) -> list[VectorChunkResult]:
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "search_text"},
        json_body={
            "keywords": keywords,
            "match_count": top_k,
            "filters": filters.model_dump(exclude_none=True),
        },
        timeout=30.0,
        extra_headers=internal_headers(),
    )
    payload = result.get("data") or {}
    if result["status_code"] != 200 or not payload.get("success"):
        try:
            return await _search_chunks_by_text_via_rest(
                keywords=keywords,
                top_k=top_k,
                filters=filters,
            )
        except Exception as fallback_exc:  # noqa: BLE001
            logger.warning("vector text REST fallback failed: %s", fallback_exc)
        raise RuntimeError(
            "vector text search failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    rows = payload.get("data") or []
    return [VectorChunkResult.model_validate(row) for row in rows]


async def _search_chunks_by_text_via_rest(
    *,
    keywords: list[str],
    top_k: int,
    filters: VectorSearchFilters,
) -> list[VectorChunkResult]:
    """Read-only PostgREST fallback while `search_text` EF/RPC is rolling out."""
    db = get_insforge_service()
    client = await db._get_client()  # noqa: SLF001 - shared low-level HTTP client
    token = INSFORGE_SERVICE_KEY or INSFORGE_ANON_KEY
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if INSFORGE_ANON_KEY:
        headers["apikey"] = INSFORGE_ANON_KEY

    params: dict[str, str] = {
        "select": (
            "id,document_id,source_type,source_id,chunk_index,content,title,url,"
            "symbol,report_date,visibility,user_id,metadata"
        ),
        "limit": str(max(1, min(max(top_k * 5, 30), 100))),
        "order": "created_at.desc",
    }
    if filters.source_types:
        source_types = ",".join(filters.source_types)
        params["source_type"] = f"in.({source_types})"
    if filters.symbol:
        params["symbol"] = f"eq.{filters.symbol}"
    if filters.visibility:
        params["visibility"] = f"eq.{filters.visibility}"
    if filters.user_id:
        params["user_id"] = f"eq.{filters.user_id}"
    if filters.date_from:
        params["report_date"] = f"gte.{filters.date_from}"
    if filters.date_to:
        params["report_date"] = f"lte.{filters.date_to}"
    if filters.metadata:
        params["metadata"] = "cs." + json.dumps(
            filters.metadata,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # If this lane already pins a ticker in metadata, returning direct ticker
    # mentions is better than requiring every row to also hit a keyword variant.
    metadata_has_ticker = bool((filters.metadata or {}).get("tickers"))
    if keywords and not metadata_has_ticker:
        clauses = []
        for keyword in keywords[:20]:
            pattern = _postgrest_ilike_pattern(keyword)
            if not pattern:
                continue
            clauses.append(f"title.ilike.{pattern}")
            clauses.append(f"content.ilike.{pattern}")
        if clauses:
            params["or"] = f"({','.join(clauses)})"

    result = await client.get(
        f"{db.base_url}/api/database/records/vector_chunks",
        params=params,
        headers=headers,
        timeout=30.0,
    )
    result.raise_for_status()
    rows = result.json() or []
    out: list[VectorChunkResult] = []
    for row in rows:
        row["similarity"] = _text_similarity(row, keywords)
        out.append(VectorChunkResult.model_validate(row))
    out.sort(
        key=lambda item: (
            item.similarity,
            _source_timestamp(item.metadata),
        ),
        reverse=True,
    )
    return out[:top_k]


def _postgrest_ilike_pattern(keyword: str) -> str:
    value = str(keyword or "").strip()
    for char in (",", "(", ")", "{", "}", "[", "]"):
        value = value.replace(char, " ")
    value = " ".join(value.split())
    return f"*{value}*" if value else ""


def _text_similarity(row: dict[str, Any], keywords: list[str]) -> float:
    title = str(row.get("title") or "").lower()
    content = str(row.get("content") or "").lower()
    metadata = json.dumps(row.get("metadata") or {}, ensure_ascii=False).lower()
    for keyword in keywords:
        kw = str(keyword or "").lower()
        if not kw:
            continue
        if kw in title:
            return 1.0
        if kw in content:
            return 0.95
        if kw in metadata:
            return 0.9
    return 0.85


def _source_timestamp(metadata: dict[str, Any]) -> float:
    value = str((metadata or {}).get("created_at") or "").strip()
    if not value:
        return 0.0
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except ValueError:
        return 0.0


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
