"""KOL persona RAG tool: search_kol_tweets.

Thin wrapper over `features.vector.service.search` filtered to the active
persona's corpus bindings. Captured chunks are appended to a contextvar buffer
so the calling agent's run loop can read them out and forward to the response
payload / SSE event.
"""

from __future__ import annotations

import contextvars
import asyncio
import re
from dataclasses import dataclass
from typing import List, Optional

from app.core.langfuse import start_langfuse_observation, update_observation
from app.core.logging import get_logger
from app.features.vector.models import (
    VectorChunkResult,
    VectorSearchFilters,
    VectorSearchRequest,
    VectorTextSearchRequest,
)
from app.features.vector.service import search as vector_search
from app.features.vector.service import search_text as vector_text_search
from app.shared.kol_persona.models import CorpusBinding, PersonaChunkResult

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
    md = dict(chunk.metadata or {})
    md.setdefault("source_type", chunk.source_type)
    return PersonaChunkResult(
        citation_index=citation_index,
        source_id=chunk.source_id,
        source_type=chunk.source_type,
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
# at 0.55-0.65 with text-embedding-3-small). Keep vector recall below the
# generic 0.7 threshold, then apply persona-specific relevance gates before
# exposing results to the agent/UI.
_KOL_SEARCH_THRESHOLD = 0.55
_HYBRID_LANE_LIMIT = 8
_HYBRID_TEXT_HIT_SCORE = 0.85
_HYBRID_STRONG_SEMANTIC_SCORE = 0.70
_HYBRID_MIN_SEMANTIC_SCORE = 0.60
_MAX_QUERY_VARIANTS = 8
_UPPERCASE_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])\$?([A-Z]{1,5})(?![A-Za-z0-9])")
_TICKER_SPLIT_RE = re.compile(r"[^A-Za-z0-9]+")
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
    seen: set[tuple[str, str]] = set()
    for item in results:
        key = _chunk_key(item)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


def _chunk_key(item: VectorChunkResult) -> tuple[str, str]:
    return (item.source_type, item.source_id)


def _filter_new_chunks(
    results: list[VectorChunkResult],
    existing: list[VectorChunkResult],
) -> list[VectorChunkResult]:
    seen = {_chunk_key(item) for item in existing}
    fresh: list[VectorChunkResult] = []
    for item in results:
        key = _chunk_key(item)
        if key in seen:
            continue
        seen.add(key)
        fresh.append(item)
    return fresh


def _normalize_ticker(value: object) -> str | None:
    ticker = str(value or "").strip().upper().removeprefix("$")
    if not ticker:
        return None
    return ticker


def _metadata_tickers(item: VectorChunkResult) -> set[str]:
    raw = (item.metadata or {}).get("tickers") or []
    values: list[object] = []
    if isinstance(raw, str):
        values.extend(part for part in _TICKER_SPLIT_RE.split(raw) if part)
    elif isinstance(raw, list | tuple | set):
        values.extend(raw)
    else:
        values.append(raw)
    if item.symbol:
        values.append(item.symbol)
    tickers: set[str] = set()
    for value in values:
        ticker = _normalize_ticker(value)
        if ticker:
            tickers.add(ticker)
    return tickers


def _is_relevant_chunk(item: VectorChunkResult, plan: _HybridQueryPlan) -> bool:
    # Text lane scores start at 0.85; keep explicit keyword/source hits even
    # when ticker enrichment is missing.
    if item.similarity >= _HYBRID_TEXT_HIT_SCORE:
        return True

    query_tickers = set(plan.detected_tickers)
    if query_tickers:
        if _metadata_tickers(item) & query_tickers:
            return True
        # Allow very strong adjacent semantic hits, but do not let low-score
        # vector drift from another sector fill a multi-corpus bucket.
        return item.similarity >= _HYBRID_STRONG_SEMANTIC_SCORE

    return item.similarity >= _HYBRID_MIN_SEMANTIC_SCORE


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
    bindings: list[CorpusBinding],
    k: int,
) -> list[VectorChunkResult]:
    tasks: list[tuple[int, asyncio.Task[list[VectorChunkResult]]]] = []

    for binding_index, binding in enumerate(bindings):
        source_types = list(binding.source_types or ["kol_tweet"])
        base_metadata: dict[str, object] = {
            **dict(binding.metadata or {}),
            "author_username": binding.author_username,
        }

        # Exact keyword lane: catches short symbols / Chinese aliases / source
        # titles that semantic embeddings can miss.
        tasks.append(
            (
                binding_index,
                asyncio.create_task(
                    _safe_text_search(
                        keywords=plan.variants,
                        top_k=max(k, _HYBRID_LANE_LIMIT),
                        source_types=source_types,
                        metadata=base_metadata,
                    )
                ),
            )
        )

        # Metadata lane: for indexed sources with deterministic/enriched ticker
        # tags. Run per ticker so multi-ticker questions do not require every
        # source to contain all mentioned symbols.
        for ticker in plan.detected_tickers[:3]:
            tasks.append(
                (
                    binding_index,
                    asyncio.create_task(
                        _safe_text_search(
                            keywords=plan.variants,
                            top_k=max(k, _HYBRID_LANE_LIMIT),
                            source_types=source_types,
                            metadata={**base_metadata, "tickers": [ticker]},
                        )
                    ),
                )
            )
            tasks.append(
                (
                    binding_index,
                    asyncio.create_task(
                        _safe_vector_search(
                            query=plan.semantic_query,
                            top_k=max(k, _HYBRID_LANE_LIMIT),
                            source_types=source_types,
                            metadata={**base_metadata, "tickers": [ticker]},
                        )
                    ),
                )
            )

        # Semantic lane: still useful for adjacent concepts / fuzzy wording.
        tasks.append(
            (
                binding_index,
                asyncio.create_task(
                    _safe_vector_search(
                        query=plan.semantic_query,
                        top_k=max(k, _HYBRID_LANE_LIMIT),
                        source_types=source_types,
                        metadata=base_metadata,
                    )
                ),
            )
        )

    lane_results = await asyncio.gather(*(task for _, task in tasks))
    by_binding: list[list[VectorChunkResult]] = [[] for _ in bindings]
    for (binding_index, _task), results in zip(tasks, lane_results):
        by_binding[binding_index].extend(results)

    prepared: list[list[VectorChunkResult]] = []
    for results in by_binding:
        relevant = [item for item in results if _is_relevant_chunk(item, plan)]
        relevant.sort(key=lambda item: item.similarity, reverse=True)
        prepared.append(_dedupe_chunks(relevant, limit=k))

    if len(prepared) <= 1:
        return prepared[0][:k] if prepared else []

    # Multi-corpus personas need source diversity. A pure global sort lets large
    # text corpora with many exact hits fill all k slots, hiding a smaller
    # Twitter corpus even when it has a strong exact hit. Round-robin keeps the
    # top result from each binding visible, then fills remaining slots by the
    # same per-binding relevance order.
    merged: list[VectorChunkResult] = []
    seen: set[tuple[str, str]] = set()
    positions = [0 for _ in prepared]
    while len(merged) < k:
        added = False
        for bucket_index, bucket in enumerate(prepared):
            while positions[bucket_index] < len(bucket):
                item = bucket[positions[bucket_index]]
                positions[bucket_index] += 1
                key = (item.source_type, item.source_id)
                if key in seen:
                    continue
                seen.add(key)
                merged.append(item)
                added = True
                break
            if len(merged) >= k:
                break
        if not added:
            break
    return merged


def _persona_source_types(author_username: str) -> List[str]:
    """Compatibility helper: summarize source_type values across corpus bindings."""
    out: list[str] = []
    for binding in _persona_corpus_bindings(author_username):
        for source_type in binding.source_types:
            if source_type not in out:
                out.append(source_type)
    return out or ["kol_tweet"]


def _persona_corpus_bindings(author_username: str) -> list[CorpusBinding]:
    """Resolve the exact vector corpus bindings for the active persona."""
    try:
        from app.shared.kol_persona.registry import get_persona

        persona = get_persona(author_username)
        bindings = getattr(persona, "corpus_bindings", None)
        if bindings:
            return list(bindings)

        source_types = getattr(persona, "corpus_source_types", None)
        if source_types:
            return [
                CorpusBinding(
                    author_username=author_username,
                    source_types=list(source_types),
                )
            ]
    except Exception as exc:  # noqa: BLE001 - never break retrieval on lookup
        logger.warning("persona corpus binding lookup failed for %s: %s", author_username, exc)
    return [CorpusBinding(author_username=author_username, source_types=["kol_tweet"])]


def _bindings_summary(bindings: list[CorpusBinding]) -> str:
    return ", ".join(
        (
            f"{binding.author_username}:"
            f"{'/'.join(binding.source_types or ['kol_tweet'])}"
            f"{' metadata=' + str(binding.metadata) if binding.metadata else ''}"
        )
        for binding in bindings
    )


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
    bindings = _persona_corpus_bindings(author)
    plan = _build_hybrid_query_plan(query, query_variants)
    with start_langfuse_observation(
        name="kol_persona.search_kol_tweets",
        as_type="span",
        input={
            "query": query,
            "query_variants": query_variants or [],
            "author_username": author_username,
            "active_author": author,
            "k": k,
        },
        metadata={
            "tool": "search_kol_tweets",
            "author_username": author,
            "k": k,
            "bindings": _bindings_summary(bindings),
            "search_plan": _plan_summary(plan),
        },
        tags=["kol_research", "retrieval"],
    ) as langfuse_observation:
        results = await _hybrid_search_persona_chunks(
            plan=plan,
            bindings=bindings,
            k=k,
        )
        update_observation(
            langfuse_observation,
            output={
                "result_count": len(results),
                "source_ids": [item.source_id for item in results[:10]],
                "source_types": [item.source_type for item in results[:10]],
            },
            metadata={
                "tool": "search_kol_tweets",
                "author_username": author,
                "k": k,
                "bindings": _bindings_summary(bindings),
                "search_plan": _plan_summary(plan),
                "result_count": len(results),
            },
        )
    if not results:
        logger.info(
            "persona hybrid search returned no results: author=%s bindings=%s plan=%s",
            author,
            _bindings_summary(bindings),
            _plan_summary(plan),
        )

    buf = persona_chunks_buffer.get()
    if buf is not None:
        original_count = len(results)
        results = _filter_new_chunks(results, buf)
        # Use buf length to keep [#N] indices consistent across multiple calls
        # in the same agent run.
        start = len(buf) + 1
        buf.extend(results)
        if original_count > 0 and not results:
            return (
                "This search only returned sources already cited earlier in "
                "this turn. Do not create new citation IDs; reuse the earlier "
                f"citation numbers if needed.\n\nSearch plan attempted: {_plan_summary(plan)}"
            )
    else:
        start = 1

    return _format_chunks_for_llm(
        results,
        start_index=start,
        search_plan=_plan_summary(plan),
    )
