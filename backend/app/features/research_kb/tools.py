"""Research-KB agent tools.

The primary tool is `search_kb`, which embeds the user's query and
retrieves top-k chunks from the vector store. A contextvar accumulates
chunks across tool calls within a single answer() invocation so the
HTTP response can include them as `chunks_used` for the UI.
"""

import contextvars
import json

from app.core.logging import get_logger
from app.features.research_kb.models import RetrievedChunk
from app.features.research_kb.service import retrieve

logger = get_logger(__name__)

# Per-request buffer. Reset by agent.answer() before runner starts so each
# request gets its own list even when the module-level agent is shared.
_chunks_buffer: contextvars.ContextVar[list[RetrievedChunk]] = contextvars.ContextVar(
    "research_kb_chunks_buffer"
)


def reset_chunks_buffer() -> None:
    _chunks_buffer.set([])


def get_chunks_buffer() -> list[RetrievedChunk]:
    try:
        return list(_chunks_buffer.get())
    except LookupError:
        return []


async def search_kb(query: str, k: int = 6) -> str:
    """Search the historical-views knowledge base for tweets relevant to the query.

    This is the PRIMARY tool. Call it for ANY user question to fetch relevant
    博主历史观点 (KOL historical opinions) before composing the answer.

    Args:
        query: A natural-language search query in Chinese or English.
            Use the user's question directly, or rewrite it to focus on the
            ticker / sector / topic they actually asked about.
        k: Number of chunks to return (default 6, range 3-12).

    Returns:
        JSON string with `chunks` array. Each chunk has: content, title,
        author_date (inferred from title), similarity. Empty array means
        knowledge base has no relevant content — say so in the answer.
    """
    k = max(3, min(12, k))
    chunks = await retrieve(query, match_count=k, match_threshold=0.3)

    # Mutate the existing list in place so the change propagates back to the
    # parent context (the request handler). Calling .set() would only update
    # the child task's context copy and the parent would see nothing.
    try:
        buf = _chunks_buffer.get()
    except LookupError:
        buf = []
        _chunks_buffer.set(buf)
    seen = {(c.source_id, c.similarity) for c in buf}
    for c in chunks:
        key = (c.source_id, c.similarity)
        if key not in seen:
            buf.append(c)
            seen.add(key)

    payload = {
        "chunks": [
            {
                "title": c.title,
                "content": c.content,
                "similarity": round(c.similarity, 3),
                "source_id": c.source_id,
            }
            for c in chunks
        ],
        "count": len(chunks),
    }
    return json.dumps(payload, ensure_ascii=False)
