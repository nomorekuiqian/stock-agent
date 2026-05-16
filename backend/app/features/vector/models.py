"""
Generic vector indexing and retrieval schemas.

This feature is intentionally domain-agnostic. Reports, transcripts, user
notes, and future knowledge sources should all enter through the same
normalized document/chunk contract.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


Visibility = Literal["public", "private"]


class VectorDocumentInput(BaseModel):
    source_type: str = Field(..., min_length=1, max_length=80)
    source_id: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)
    title: Optional[str] = Field(default=None, max_length=500)
    url: Optional[str] = Field(default=None, max_length=2000)
    symbol: Optional[str] = Field(default=None, max_length=20)
    report_date: Optional[str] = Field(default=None, description="ISO YYYY-MM-DD when applicable")
    visibility: Visibility = "public"
    user_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class VectorIndexRequest(BaseModel):
    document: VectorDocumentInput
    force: bool = Field(
        default=False,
        description="When true, reindex even if the same source/content hash already exists.",
    )


class VectorIndexResponse(BaseModel):
    success: bool
    document_id: Optional[str] = None
    source_type: str
    source_id: str
    chunk_count: int
    skipped: bool = False
    reason: Optional[str] = None


class VectorSearchFilters(BaseModel):
    source_types: Optional[List[str]] = None
    symbol: Optional[str] = None
    user_id: Optional[str] = None
    visibility: Optional[Visibility] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Exact-match metadata filters. Edge function/RPC support may be added per key.",
    )


class VectorSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=8, ge=1, le=50)
    threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    filters: VectorSearchFilters = Field(default_factory=VectorSearchFilters)


class VectorChunkResult(BaseModel):
    id: str
    document_id: str
    source_type: str
    source_id: str
    chunk_index: Optional[int] = None
    content: str
    title: Optional[str] = None
    url: Optional[str] = None
    symbol: Optional[str] = None
    report_date: Optional[str] = None
    visibility: Optional[Visibility] = None
    user_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    similarity: float


class VectorSearchResponse(BaseModel):
    success: bool
    query: str
    count: int
    results: List[VectorChunkResult]


class VectorContextRequest(VectorSearchRequest):
    max_context_chars: int = Field(default=8000, ge=1000, le=30000)


class VectorContextResponse(VectorSearchResponse):
    context: str


class DeleteVectorSourceRequest(BaseModel):
    source_type: str
    source_id: str


class DeleteVectorSourceResponse(BaseModel):
    success: bool
    deleted_documents: int = 0
    deleted_chunks: int = 0
