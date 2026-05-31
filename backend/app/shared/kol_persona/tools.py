"""KOL persona RAG tool: search_kol_tweets.

Thin wrapper over `features.vector.service.search` filtered to
`source_type=kol_tweet` + `metadata.author_username`. Captured chunks
are appended to a contextvar buffer so the calling agent's run loop can
read them out and forward to the response payload / SSE event.
"""

from __future__ import annotations

import contextvars
from typing import List, Optional

from app.core.logging import get_logger
from app.features.vector.models import (
    VectorChunkResult,
    VectorSearchFilters,
    VectorSearchRequest,
)
from app.features.vector.service import search as vector_search
from app.shared.kol_persona.models import PersonaChunkResult

logger = get_logger(__name__)

# Set by the agent run loop before invoking the LLM; cleared on exit.
# Callers read this after run completes to populate response.kol_chunks.
persona_chunks_buffer: contextvars.ContextVar[Optional[List[VectorChunkResult]]] = (
    contextvars.ContextVar("persona_chunks_buffer", default=None)
)


def _format_chunks_for_llm(
    results: List[VectorChunkResult], *, start_index: int = 1
) -> str:
    """Render chunks as `[#N] @user · YYYY-MM-DD: text` lines for LLM prompt.

    The model uses these to cite the analyst's prior takes in its answer
    with stable [#N] indices.

    The wrapper adds an explicit "valid citation range" header so the LLM
    only emits [#N] markers that exist (otherwise the frontend would have
    to strip broken refs after the fact).
    """
    if not results:
        return (
            "No prior tweets matched. The analyst may not have spoken on this "
            "directly. **Do not invent [#N] citations** — only cite what this "
            "or another search_kol_tweets call actually returned."
        )

    end_index = start_index + len(results) - 1
    lines = []
    for idx, item in enumerate(results, start=start_index):
        md = item.metadata or {}
        author = md.get("author_username") or "unknown"
        created = (md.get("created_at") or "")[:10] or "unknown-date"
        tickers = md.get("tickers") or []
        ticker_hint = ""
        if tickers:
            ticker_hint = f" [{', '.join(tickers[:3])}]"
        # Trim long bodies to keep prompt lean. The LLM only needs the gist.
        content = item.content.strip()
        if len(content) > 600:
            content = content[:600].rstrip() + "..."
        lines.append(f"[#{idx}] @{author} · {created}{ticker_hint}: {content}")
    header = (
        f"Valid citation range for this call: [#{start_index}] ~ [#{end_index}]. "
        f"You MAY cite any of these indices inline. **Do not write [#N] for any "
        f"index outside this range** — the frontend strips invalid refs but the "
        f"user-visible draft will still show them mid-stream."
    )
    return f"{header}\n\n" + "\n\n".join(lines)


def chunk_to_persona_result(
    chunk: VectorChunkResult, *, citation_index: int
) -> PersonaChunkResult:
    md = chunk.metadata or {}
    return PersonaChunkResult(
        citation_index=citation_index,
        source_id=chunk.source_id,
        title=chunk.title,
        url=chunk.url,
        content=chunk.content,
        similarity=chunk.similarity,
        author_username=md.get("author_username"),
        created_at=md.get("created_at"),
        tickers=list(md.get("tickers") or []),
        metadata=md,
    )


# Tweets are short, colloquial, mix Chinese + English + tickers, so cosine
# similarity to a natural-language query rarely clears 0.7 (typical hits land
# at 0.55-0.65 with text-embedding-3-small). The vector layer's default
# threshold of 0.7 silently filters everything; use a looser bar here.
_KOL_SEARCH_THRESHOLD = 0.45


async def search_kol_tweets(
    query: str,
    author_username: str = "qinbafrank",
    k: int = 6,
) -> str:
    """检索指定 KOL 的历史推文片段。返回带 [#N] 引用编号的 markdown 段落。

    Use this when answering about specific stocks / sectors / events to retrieve
    the analyst's prior takes. Cite hits with [#N] inline (matching the returned
    indices) and attribute author + date. Only call when a KOL persona is active
    in the system prompt.

    Args:
      query: Search keywords (Chinese or English).
      author_username: KOL username, default "qinbafrank".
      k: Number of chunks to retrieve, default 6.

    Returns:
      Markdown text with [#N] indexed chunks, ready to be cited inline.
    """
    try:
        resp = await vector_search(
            VectorSearchRequest(
                query=query,
                top_k=k,
                threshold=_KOL_SEARCH_THRESHOLD,
                filters=VectorSearchFilters(
                    source_types=["kol_tweet"],
                    metadata={"author_username": author_username},
                ),
            )
        )
    except Exception as exc:  # noqa: BLE001 — degrade gracefully, don't kill agent
        logger.warning("search_kol_tweets failed: %s", exc)
        return "Search temporarily unavailable. Answer from methodology framework only."

    buf = persona_chunks_buffer.get()
    if buf is not None:
        # Use buf length to keep [#N] indices consistent across multiple calls
        # in the same agent run.
        start = len(buf) + 1
        buf.extend(resp.results)
    else:
        start = 1

    return _format_chunks_for_llm(resp.results, start_index=start)
