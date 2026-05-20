"""
Smoke test for the generic vector pipeline.

Usage:
    conda run -n stock_agent python scripts/test_vector_pipeline.py

Requires:
    - backend/env with OPENROUTER_API_KEY and VECTOR_EMBEDDING_MODEL
    - Insforge vector-store Edge Function deployed
    - vector-store.sql applied
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> None:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)


async def main() -> None:
    _load_env()

    from app.features.vector.models import (
        VectorDocumentInput,
        VectorIndexRequest,
        VectorSearchFilters,
        VectorSearchRequest,
    )
    from app.features.vector.service import index_document, search

    source_id = "smoke-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    content = (
        "# Vector Smoke Test\n\n"
        "The vector pipeline stores chunks in pgvector through Insforge Edge Functions. "
        "This document is about semiconductor capital expenditure, AI infrastructure "
        "demand, and retrieval validation.\n\n"
        "If search works, a query about AI infrastructure capex should retrieve this "
        "chunk with a high similarity score."
    )

    indexed = await index_document(
        VectorIndexRequest(
            document=VectorDocumentInput(
                source_type="vector_smoke_test",
                source_id=source_id,
                title="Vector Smoke Test",
                content=content,
                visibility="public",
                metadata={"test_run": "manual_smoke"},
            ),
            force=True,
        )
    )
    print("INDEX", indexed.model_dump())

    result = await search(
        VectorSearchRequest(
            query="AI infrastructure capex retrieval validation",
            top_k=3,
            threshold=0.2,
            filters=VectorSearchFilters(source_types=["vector_smoke_test"]),
        )
    )
    print("SEARCH_COUNT", result.count)
    for item in result.results:
        print(
            "RESULT",
            {
                "source_type": item.source_type,
                "source_id": item.source_id,
                "similarity": round(item.similarity, 4),
                "title": item.title,
            },
        )


if __name__ == "__main__":
    asyncio.run(main())
