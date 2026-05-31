"""Generic vector indexing and retrieval API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import verify_admin_or_nonprod_or_cron, verify_user_token
from app.core.logging import get_logger
from app.features.vector.models import (
    DeleteVectorSourceResponse,
    KolTweetIndexRequest,
    KolTweetIndexResponse,
    VectorContextRequest,
    VectorContextResponse,
    VectorIndexRequest,
    VectorIndexResponse,
    VectorSearchRequest,
    VectorSearchResponse,
)
from app.features.vector.service import (
    build_context,
    delete_vector_source,
    index_document,
    search,
)
from app.features.vector.kol_tweets import index_kol_tweets

logger = get_logger(__name__)

router = APIRouter(prefix="/api/vector", tags=["vector"])


def _scope_request_to_user(request: VectorSearchRequest, user_id: str) -> VectorSearchRequest:
    """Prevent public API callers from searching another user's private chunks."""
    filters = request.filters.model_copy()

    if filters.user_id and filters.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot search another user's vector data")

    if filters.visibility == "private":
        filters.user_id = user_id
    else:
        # Public search is the default for the external API. Mixed public+private
        # retrieval should be implemented by an internal service call that runs
        # two scoped searches and merges results.
        filters.visibility = "public"
        filters.user_id = None

    return request.model_copy(update={"filters": filters})


@router.post("/index", response_model=VectorIndexResponse)
async def index_endpoint(
    request: VectorIndexRequest,
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """Index a normalized document into the generic vector store."""
    logger.info(
        "vector index request source=%s id=%s auth=%s",
        request.document.source_type,
        request.document.source_id,
        auth_path,
    )
    try:
        return await index_document(request)
    except Exception as exc:
        logger.exception("Vector index failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/index-kol-tweets", response_model=KolTweetIndexResponse)
async def index_kol_tweets_endpoint(
    request: KolTweetIndexRequest,
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """Index selected Twitter/KOL tweets into the generic vector store."""
    logger.info(
        "vector index KOL tweets authors=%s window=%dh limit=%d dry_run=%s auth=%s",
        request.author_usernames or "all_enabled_kols",
        request.window_hours,
        request.limit,
        request.dry_run,
        auth_path,
    )
    try:
        return await index_kol_tweets(request)
    except Exception as exc:
        logger.exception("KOL tweet vector indexing failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/search", response_model=VectorSearchResponse)
async def search_endpoint(
    request: VectorSearchRequest,
    user_id: str = Depends(verify_user_token),
):
    """Search vector chunks using metadata filters plus semantic similarity."""
    try:
        return await search(_scope_request_to_user(request, user_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vector search failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/context", response_model=VectorContextResponse)
async def context_endpoint(
    request: VectorContextRequest,
    user_id: str = Depends(verify_user_token),
):
    """Search and assemble retrieved chunks into an LLM-ready context block."""
    try:
        scoped = _scope_request_to_user(request, user_id)
        return await build_context(scoped)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vector context build failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/source/{source_type}/{source_id}", response_model=DeleteVectorSourceResponse)
async def delete_source_endpoint(
    source_type: str,
    source_id: str,
    auth_path: str = Depends(verify_admin_or_nonprod_or_cron),
):
    """Delete all indexed vector data for one source object."""
    logger.info("vector delete source=%s id=%s auth=%s", source_type, source_id, auth_path)
    try:
        return await delete_vector_source(source_type, source_id)
    except Exception as exc:
        logger.exception("Vector source delete failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
