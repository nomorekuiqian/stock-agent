"""Generic vector indexing and retrieval orchestration."""

from __future__ import annotations

from app.core.config import VECTOR_EMBEDDING_MODEL
from app.core.logging import get_logger
from app.features.vector.chunking import chunk_document, content_hash
from app.features.vector.embeddings import embed_query, embed_texts
from app.features.vector import db
from app.features.vector.models import (
    DeleteVectorSourceResponse,
    VectorContextResponse,
    VectorIndexRequest,
    VectorIndexResponse,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorTextSearchRequest,
    VectorTextSearchResponse,
)

logger = get_logger(__name__)


async def index_document(request: VectorIndexRequest) -> VectorIndexResponse:
    doc = request.document
    doc_hash = content_hash(doc.content)

    if not request.force:
        existing = await db.get_document_by_hash(
            source_type=doc.source_type,
            source_id=doc.source_id,
            content_hash=doc_hash,
        )
        if existing:
            return VectorIndexResponse(
                success=True,
                document_id=existing.get("id"),
                source_type=doc.source_type,
                source_id=doc.source_id,
                chunk_count=int(existing.get("chunk_count") or 0),
                skipped=True,
                reason="same content already indexed",
            )

    chunks = chunk_document(
        doc.content,
        title=doc.title,
        source_type=doc.source_type,
        source_id=doc.source_id,
        base_metadata=doc.metadata,
    )
    if not chunks:
        return VectorIndexResponse(
            success=False,
            source_type=doc.source_type,
            source_id=doc.source_id,
            chunk_count=0,
            reason="document produced no chunks",
        )

    document_row = await db.upsert_document(
        {
            "source_type": doc.source_type,
            "source_id": doc.source_id,
            "title": doc.title,
            "url": doc.url,
            "symbol": doc.symbol,
            "report_date": doc.report_date,
            "visibility": doc.visibility,
            "user_id": doc.user_id,
            "metadata": doc.metadata,
            "content_hash": doc_hash,
        }
    )
    document_id = document_row["id"]

    embeddings = await embed_texts([c.content for c in chunks])
    chunk_rows = []
    for chunk, embedding in zip(chunks, embeddings):
        chunk_rows.append(
            {
                "document_id": document_id,
                "source_type": doc.source_type,
                "source_id": doc.source_id,
                "chunk_index": chunk.index,
                "content": chunk.content,
                "content_hash": chunk.content_hash,
                "token_count": chunk.token_count,
                "title": doc.title,
                "url": doc.url,
                "symbol": doc.symbol,
                "report_date": doc.report_date,
                "visibility": doc.visibility,
                "user_id": doc.user_id,
                "metadata": chunk.metadata,
                "embedding": embedding,
                "embedding_model": VECTOR_EMBEDDING_MODEL,
            }
        )

    count = await db.upsert_chunks(chunk_rows)
    logger.info(
        "Indexed vector document source=%s id=%s chunks=%d",
        doc.source_type, doc.source_id, count,
    )
    return VectorIndexResponse(
        success=True,
        document_id=document_id,
        source_type=doc.source_type,
        source_id=doc.source_id,
        chunk_count=count,
    )


async def search(request: VectorSearchRequest) -> VectorSearchResponse:
    query_vector = await embed_query(request.query)
    results = await db.search_chunks(
        query_embedding=query_vector,
        top_k=request.top_k,
        threshold=request.threshold,
        filters=request.filters,
    )
    return VectorSearchResponse(
        success=True,
        query=request.query,
        count=len(results),
        results=results,
    )


async def search_text(request: VectorTextSearchRequest) -> VectorTextSearchResponse:
    keywords = [kw.strip() for kw in request.keywords if kw.strip()]
    if not keywords:
        return VectorTextSearchResponse(
            success=True,
            keywords=[],
            count=0,
            results=[],
        )

    results = await db.search_chunks_by_text(
        keywords=keywords,
        top_k=request.top_k,
        filters=request.filters,
    )
    return VectorTextSearchResponse(
        success=True,
        keywords=keywords,
        count=len(results),
        results=results,
    )


def _build_context(results, max_chars: int) -> str:
    parts: list[str] = []
    total = 0
    for idx, item in enumerate(results, start=1):
        source = item.title or f"{item.source_type}:{item.source_id}"
        header = (
            f"[{idx}] {source}\n"
            f"source_type={item.source_type} source_id={item.source_id} "
            f"similarity={item.similarity:.3f}"
        )
        if item.symbol:
            header += f" symbol={item.symbol}"
        if item.report_date:
            header += f" date={item.report_date}"
        if item.url:
            header += f"\nurl={item.url}"
        block = f"{header}\n\n{item.content}".strip()
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)
    return "\n\n---\n\n".join(parts)


async def build_context(request) -> VectorContextResponse:
    search_response = await search(request)
    context = _build_context(search_response.results, request.max_context_chars)
    return VectorContextResponse(
        **search_response.model_dump(),
        context=context,
    )


async def delete_vector_source(source_type: str, source_id: str) -> DeleteVectorSourceResponse:
    result = await db.delete_source(source_type, source_id)
    return DeleteVectorSourceResponse(success=True, **result)
