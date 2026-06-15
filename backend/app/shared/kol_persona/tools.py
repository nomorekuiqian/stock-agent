"""KOL persona RAG tool: search_kol_tweets.

Thin wrapper over `features.vector.service.search` filtered to
`source_type=kol_tweet` + `metadata.author_username`. Captured chunks
are appended to a contextvar buffer so the calling agent's run loop can
read them out and forward to the response payload / SSE event.
"""

from __future__ import annotations

import contextvars
import asyncio
import re
from dataclasses import dataclass
from typing import List, Optional

from app.core.logging import get_logger
from app.features.vector.models import (
    VectorChunkResult,
    VectorSearchFilters,
    VectorSearchRequest,
    VectorTextSearchRequest,
)
from app.features.vector.service import search as vector_search
from app.features.vector.service import search_text as vector_text_search
from app.shared.kol_persona.models import PersonaChunkResult

logger = get_logger(__name__)

# Set by the agent run loop before invoking the LLM; cleared on exit.
# Callers read this after run completes to populate response.kol_chunks.
persona_chunks_buffer: contextvars.ContextVar[Optional[List[VectorChunkResult]]] = (
    contextvars.ContextVar("persona_chunks_buffer", default=None)
)


def _format_chunks_for_llm(
    results: List[VectorChunkResult],
    *,
    start_index: int = 1,
    search_plan: str | None = None,
) -> str:
    """Render chunks as `[#N] @user · YYYY-MM-DD: text` lines for LLM prompt.

    The model uses these to cite the analyst's prior takes in its answer
    with stable [#N] indices.

    The wrapper adds an explicit "valid citation range" header so the LLM
    only emits [#N] markers that exist (otherwise the frontend would have
    to strip broken refs after the fact).
    """
    if not results:
        plan = f"\n\nSearch plan attempted: {search_plan}" if search_plan else ""
        return (
            "No prior tweets matched. The analyst may not have spoken on this "
            "directly. **Do not invent [#N] citations** — only cite what this "
            "or another search_kol_tweets call actually returned."
            f"{plan}"
        )

    end_index = start_index + len(results) - 1
    lines = []
    for idx, item in enumerate(results, start=start_index):
        md = item.metadata or {}
        author = md.get("author_username") or "unknown"
        source_author = md.get("source_author_username")
        persona = md.get("persona_username")
        if source_author and persona and source_author != author:
            author_label = f"@{source_author} / persona @{persona}"
        else:
            author_label = f"@{author}"
        created = (md.get("created_at") or "")[:10] or "unknown-date"
        tickers = md.get("tickers") or []
        ticker_hint = ""
        if tickers:
            ticker_hint = f" [{', '.join(tickers[:3])}]"
        # Trim long bodies to keep prompt lean. The LLM only needs the gist.
        content = item.content.strip()
        if len(content) > 600:
            content = content[:600].rstrip() + "..."
        lines.append(f"[#{idx}] {author_label} · {created}{ticker_hint}: {content}")
    header = (
        f"Valid citation range for this call: [#{start_index}] ~ [#{end_index}]. "
        f"You MAY cite any of these indices inline. **Do not write [#N] for any "
        f"index outside this range** — the frontend strips invalid refs but the "
        f"user-visible draft will still show them mid-stream."
    )
    if search_plan:
        header += f"\nHybrid search plan: {search_plan}"
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
_HYBRID_LANE_LIMIT = 8
_MAX_QUERY_VARIANTS = 8
_UPPERCASE_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])\$?([A-Z]{1,5})(?![A-Za-z0-9])")
_TICKER_STOPWORDS = {
    "AI",
    "API",
    "CEO",
    "CFO",
    "CPU",
    "ETF",
    "FY",
    "GPU",
    "IPO",
    "IR",
    "LLM",
    "PE",
    "PS",
    "QA",
    "QOQ",
    "RAG",
    "SEC",
    "UI",
    "US",
    "USA",
    "YOY",
}


@dataclass(frozen=True)
class _HybridQueryPlan:
    original_query: str
    variants: list[str]
    detected_tickers: list[str]
    semantic_query: str

# When a KOL persona agent is active, the server pins tweet retrieval to that
# persona's username via this contextvar (set by kol_research.agent at the start
# of each turn). It TAKES PRECEDENCE over whatever author the LLM passes, so a
# Serenity conversation can never retrieve qinbafrank's tweets — and vice versa —
# even if the model omits or hallucinates the author argument.
_active_kol_author: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_active_kol_author", default=None
)


def _ticker_aliases() -> dict[str, list[str]]:
    """Load the curated ticker alias dictionary used by KOL/circle corpora."""
    try:
        from app.features.kol_research.cockpit import TICKER_ALIASES

        return {ticker.upper(): list(aliases) for ticker, aliases in TICKER_ALIASES.items()}
    except Exception as exc:  # noqa: BLE001 - retrieval must keep working
        logger.warning("ticker alias lookup failed: %s", exc)
        return {}


def _query_tickers(query: str) -> list[str]:
    aliases = _ticker_aliases()
    text = query or ""
    found: list[str] = []
    for match in _UPPERCASE_TOKEN_RE.finditer(text):
        token = match.group(1).upper()
        if token not in _TICKER_STOPWORDS and token not in found:
            found.append(token)
    for ticker, names in aliases.items():
        patterns = {ticker, *names}
        for name in patterns:
            if not name:
                continue
            if _contains_alias(text, name):
                if ticker not in found:
                    found.append(ticker)
                break
    return found


def _contains_alias(text: str, alias: str) -> bool:
    if any(ord(ch) > 0x2E80 for ch in alias):
        return alias in text
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", text) is not None


def _expand_ticker_query(query: str, tickers: list[str]) -> str:
    if not tickers:
        return query
    aliases = _ticker_aliases()
    parts = [query.strip()]
    for ticker in tickers[:3]:
        for alias in aliases.get(ticker, [])[:5]:
            if alias and alias not in parts:
                parts.append(alias)
    return " ".join(part for part in parts if part).strip() or query


def _clean_query_variants(query: str, query_variants: Optional[List[str]]) -> list[str]:
    variants: list[str] = []
    for item in [query, *(query_variants or [])]:
        value = str(item or "").strip()
        if not value:
            continue
        if value not in variants:
            variants.append(value)
        if len(variants) >= _MAX_QUERY_VARIANTS:
            break
    return variants or [query.strip()]


def _build_hybrid_query_plan(
    query: str, query_variants: Optional[List[str]]
) -> _HybridQueryPlan:
    variants = _clean_query_variants(query, query_variants)
    detected_tickers = _query_tickers(" ".join(variants))
    semantic_query = _expand_ticker_query(" ".join(variants), detected_tickers)
    if semantic_query and semantic_query not in variants:
        variants.append(semantic_query)
    return _HybridQueryPlan(
        original_query=query,
        variants=variants[:_MAX_QUERY_VARIANTS],
        detected_tickers=detected_tickers[:5],
        semantic_query=semantic_query or query,
    )


def _plan_summary(plan: _HybridQueryPlan) -> str:
    tickers = ", ".join(plan.detected_tickers) if plan.detected_tickers else "none"
    variants = " | ".join(plan.variants[:_MAX_QUERY_VARIANTS])
    return f"variants=[{variants}], detected_tickers=[{tickers}], lanes=text+metadata+vector"


def _dedupe_chunks(results: list[VectorChunkResult], *, limit: int) -> list[VectorChunkResult]:
    deduped: list[VectorChunkResult] = []
    seen: set[tuple[str, str, int | None]] = set()
    for item in results:
        key = (item.source_type, item.source_id, item.chunk_index)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


async def _safe_text_search(
    *,
    keywords: list[str],
    top_k: int,
    source_types: list[str],
    metadata: dict[str, object],
) -> list[VectorChunkResult]:
    try:
        resp = await vector_text_search(
            VectorTextSearchRequest(
                keywords=keywords,
                top_k=top_k,
                filters=VectorSearchFilters(
                    source_types=source_types,
                    metadata=metadata,
                ),
            )
        )
        return resp.results
    except Exception as exc:  # noqa: BLE001 - hybrid search should degrade
        logger.warning("persona text search failed: %s", exc)
        return []


async def _safe_vector_search(
    *,
    query: str,
    top_k: int,
    source_types: list[str],
    metadata: dict[str, object],
) -> list[VectorChunkResult]:
    try:
        resp = await vector_search(
            VectorSearchRequest(
                query=query,
                top_k=top_k,
                threshold=_KOL_SEARCH_THRESHOLD,
                filters=VectorSearchFilters(
                    source_types=source_types,
                    metadata=metadata,
                ),
            )
        )
        return resp.results
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning("persona vector search failed: %s", exc)
        return []


async def _hybrid_search_persona_chunks(
    *,
    plan: _HybridQueryPlan,
    author: str,
    source_types: list[str],
    k: int,
) -> list[VectorChunkResult]:
    base_metadata: dict[str, object] = {"author_username": author}
    tasks: list[asyncio.Task[list[VectorChunkResult]]] = []

    # Exact keyword lane: catches short symbols / Chinese aliases / source titles
    # that semantic embeddings can miss.
    tasks.append(
        asyncio.create_task(
            _safe_text_search(
                keywords=plan.variants,
                top_k=max(k, _HYBRID_LANE_LIMIT),
                source_types=source_types,
                metadata=base_metadata,
            )
        )
    )

    # Metadata lane: for indexed sources with deterministic/enriched ticker tags.
    # Run per ticker so multi-ticker questions do not require every source to
    # contain all mentioned symbols.
    for ticker in plan.detected_tickers[:3]:
        tasks.append(
            asyncio.create_task(
                _safe_text_search(
                    keywords=plan.variants,
                    top_k=max(k, _HYBRID_LANE_LIMIT),
                    source_types=source_types,
                    metadata={**base_metadata, "tickers": [ticker]},
                )
            )
        )
        tasks.append(
            asyncio.create_task(
                _safe_vector_search(
                    query=plan.semantic_query,
                    top_k=max(k, _HYBRID_LANE_LIMIT),
                    source_types=source_types,
                    metadata={**base_metadata, "tickers": [ticker]},
                )
            )
        )

    # Semantic lane: still useful for adjacent concepts / fuzzy wording.
    tasks.append(
        asyncio.create_task(
            _safe_vector_search(
                query=plan.semantic_query,
                top_k=max(k, _HYBRID_LANE_LIMIT),
                source_types=source_types,
                metadata=base_metadata,
            )
        )
    )

    lane_results = await asyncio.gather(*tasks)
    merged: list[VectorChunkResult] = []
    for results in lane_results:
        merged.extend(results)
    return _dedupe_chunks(merged, limit=k)


def _persona_source_types(author_username: str) -> List[str]:
    """Resolve which vector `source_type`s the active persona's corpus lives in.

    Twitter personas keep the historical default ['kol_tweet']. Personas backed
    by a different corpus (e.g. zsxq exports indexed as 'zsxq_thread') declare
    `corpus_source_types` in the registry, so retrieval is pinned to the right
    source_type instead of silently searching the Twitter corpus. Lookup is
    lazy + best-effort: any failure falls back to ['kol_tweet'] so a registry
    issue can never break retrieval.
    """
    try:
        from app.shared.kol_persona.registry import get_persona

        persona = get_persona(author_username)
        source_types = getattr(persona, "corpus_source_types", None)
        if source_types:
            return list(source_types)
    except Exception as exc:  # noqa: BLE001 - never break retrieval on lookup
        logger.warning("persona source_type lookup failed for %s: %s", author_username, exc)
    return ["kol_tweet"]


async def search_kol_tweets(
    query: str,
    author_username: str = "qinbafrank",
    k: int = 6,
    query_variants: Optional[List[str]] = None,
) -> str:
    """Hybrid 检索指定 KOL/persona 的历史观点片段，返回带 [#N] 的 markdown。

    Use this when answering about specific stocks / sectors / events to retrieve
    the analyst's prior takes. For ticker/company questions, think of multiple
    names yourself and pass them in query_variants: ticker, English company name,
    Chinese name, product names, and close event keywords. The backend runs
    hybrid retrieval across exact text, indexed metadata, and vector semantic
    search, then dedupes evidence. Cite hits with [#N] inline and attribute
    author + date. Only call when a KOL persona is active in the system prompt.

    Args:
      query: Main search query (Chinese or English).
      author_username: KOL username, default "qinbafrank".
      k: Number of chunks to retrieve, default 6.
      query_variants: Optional alternative names / products / event keywords
        that should be searched together, e.g. ["AMD", "Advanced Micro Devices",
        "超威半导体", "Instinct", "MI300"].

    Returns:
      Markdown text with [#N] indexed chunks, ready to be cited inline.
    """
    # The active persona (if any) wins over the LLM-supplied author so retrieval
    # stays pinned to the current KOL — never leaks another persona's tweets.
    author = _active_kol_author.get(None) or author_username
    source_types = _persona_source_types(author)
    plan = _build_hybrid_query_plan(query, query_variants)
    results = await _hybrid_search_persona_chunks(
        plan=plan,
        author=author,
        source_types=source_types,
        k=k,
    )
    if not results:
        logger.info(
            "persona hybrid search returned no results: author=%s plan=%s",
            author,
            _plan_summary(plan),
        )

    buf = persona_chunks_buffer.get()
    if buf is not None:
        # Use buf length to keep [#N] indices consistent across multiple calls
        # in the same agent run.
        start = len(buf) + 1
        buf.extend(results)
    else:
        start = 1

    return _format_chunks_for_llm(
        results,
        start_index=start,
        search_plan=_plan_summary(plan),
    )
