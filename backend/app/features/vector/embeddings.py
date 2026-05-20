"""Embedding client for the generic vector pipeline via InsForge AI gateway."""

from __future__ import annotations

from app.core.config import VECTOR_EMBEDDING_MODEL
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.vector.db import internal_headers

logger = get_logger(__name__)


async def embed_texts(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Generate embeddings for a batch of texts via InsForge AI gateway."""
    if not texts:
        return []

    selected_model = model or VECTOR_EMBEDDING_MODEL
    logger.info("Embedding %d texts with model=%s", len(texts), selected_model)

    db = get_insforge_service()
    result = await db.call_function(
        "vector-store",
        method="POST",
        params={"action": "embed"},
        json_body={"model": selected_model, "input": texts},
        timeout=60.0,
        extra_headers=internal_headers(),
    )

    payload = result.get("data") or {}
    if result["status_code"] != 200 or not payload.get("success"):
        raise RuntimeError(
            "embedding failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )

    vectors = payload.get("embeddings") or []
    if len(vectors) != len(texts):
        raise RuntimeError(
            "Embedding count mismatch: expected %d got %d" % (len(texts), len(vectors))
        )
    return vectors


async def embed_query(query: str, model: str | None = None) -> list[float]:
    vectors = await embed_texts([query], model=model)
    return vectors[0]
