"""Business logic for the OKX Context MCP adapter.

This layer deliberately returns context and data only. It does not call the
website chat agents and does not spend TheMarketBrew LLM tokens.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.core.logging import get_logger
from app.features.kol_research import cockpit, mcp_data, mcp_materials
from app.features.kol_research.models import (
    KolMcpBriefRequest,
    KolMcpMarketDataRequest,
    KolMcpNewsRequest,
    KolMcpStockDataRequest,
)
from app.features.okx_mcp.models import (
    OkxMarketDataRequest,
    OkxPersonaContextRequest,
)
from app.features.vector.models import VectorSearchFilters, VectorSearchRequest
from app.features.vector.service import search as vector_search
from app.shared.kol_persona.tools import chunk_to_persona_result

logger = get_logger(__name__)

DEFAULT_PERSONA = "qinbafrank"


def okx_auth_context() -> dict[str, Any]:
    return {
        "user_id": "okx-context-mcp",
        "token_id": "okx-x402",
        "scopes": ["okx:context", "okx:data"],
        "skip_usage_log": True,
        "payment_provider": "okx_x402",
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_symbol(symbol: str | None) -> str:
    return (symbol or "").strip().upper()


def _normalize_symbols(*items: Any, limit: int = 8) -> list[str]:
    out: list[str] = []
    for item in items:
        if isinstance(item, list):
            candidates = item
        else:
            candidates = [item]
        for candidate in candidates:
            normalized = _normalize_symbol(str(candidate or ""))
            if normalized and normalized not in out:
                out.append(normalized)
            if len(out) >= limit:
                return out
    return out


def _public_auth() -> dict[str, Any]:
    return {
        "account_required": False,
        "authenticated": True,
        "provider": "okx_x402",
        "note": "OKX x402 payment authorizes access; no TheMarketBrew account token is required.",
    }


def _safety_contract() -> dict[str, Any]:
    return {
        "not_investment_advice": True,
        "no_trade_execution": True,
        "no_final_answer_generated": True,
        "agent_token_usage": "none_by_themarketbrew",
        "answer_rules": [
            "External agents should write the final answer with their own model.",
            "Separate methodology context, direct historical evidence, current market facts, and inference.",
            "Do not impersonate a persona or present historical posts as current advice.",
            "Do not provide direct buy/sell/add/reduce instructions or exact price targets.",
        ],
    }


def _tool_catalog(data_catalog: dict[str, Any]) -> dict[str, Any]:
    return {
        "themarketbrew_discovery": {
            "endpoint": "GET /api/okx-mcp/discovery",
            "pricing": "free",
            "purpose": "Discover personas, data sections, limits, and how to route follow-up calls.",
        },
        "themarketbrew_persona_context": {
            "endpoint": "POST /api/okx-mcp/persona-context",
            "pricing": "OKX x402 one-time payment when middleware/proxy is enabled",
            "purpose": "Return selected persona methodology, lens context, Evidence Map posts, and optional vector corpus hits.",
            "does_not": ["generate final answers", "call website chat agents", "use TheMarketBrew LLM tokens"],
        },
        "themarketbrew_market_data": {
            "endpoint": "POST /api/okx-mcp/market-data",
            "pricing": "OKX x402 one-time payment when middleware/proxy is enabled",
            "purpose": "Return stock, macro, calendar, report, and news data envelopes.",
            "data_capabilities": (data_catalog.get("data") or {}).get("tools") or {},
        },
    }


def _rewrite_auth(envelope: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(envelope, dict):
        return envelope
    envelope["auth"] = _public_auth()
    data = envelope.get("data")
    if isinstance(data, dict) and isinstance(data.get("auth"), dict):
        data["auth"] = {
            **data["auth"],
            "required": False,
            "status_tool": None,
            "provider": "okx_x402",
        }
    return envelope


async def discovery_payload() -> dict[str, Any]:
    catalog = _rewrite_auth(await mcp_data.data_catalog(okx_auth_context()))
    personas = mcp_materials.list_material_personas()
    return {
        "ok": True,
        "tool": "themarketbrew_discovery",
        "mode": "okx_context_mcp",
        "data": {
            "auth": _public_auth(),
            "payment": {
                "provider": "okx_x402",
                "unpaid_behavior": "Paid endpoints return HTTP 402 before business logic when OKX middleware or reverse proxy is enabled.",
                "free_endpoints": ["GET /api/okx-mcp/discovery"],
                "paid_endpoints": [
                    "POST /api/okx-mcp/persona-context",
                    "POST /api/okx-mcp/market-data",
                ],
            },
            "tools": _tool_catalog(catalog),
            "personas": personas,
            "data_catalog": catalog,
            "routing_guidance": [
                "Call discovery first to inspect available personas and data sections.",
                "Call persona-context for blogger/persona methodology, lens context, and historical evidence.",
                "Call market-data for current facts such as quote/profile/fundamentals/valuation/technical/news/calendar/reports.",
                "Use the external agent's own model to synthesize the final user-facing answer.",
            ],
            "safety": _safety_contract(),
            "freshness": {
                "as_of": _now(),
                "persona_material": "filesystem-promoted methodology roots",
                "market_data": "section-specific backend data cache/source freshness",
            },
        },
    }


def _persona_exists(username: str) -> bool:
    return bool(username and mcp_materials.material_persona_exists(username))


def _try_get_lens(username: str, lens_type: str, lens_id: str) -> dict[str, Any] | None:
    try:
        return mcp_materials.get_lens(username, lens_type=lens_type, lens_id=lens_id)
    except (FileNotFoundError, KeyError, ValueError):
        return None


def _first_lens(username: str, lens_type: str) -> dict[str, Any] | None:
    try:
        index = mcp_materials.list_lenses(username, lens_type=lens_type)
    except (FileNotFoundError, ValueError):
        return None
    for item in index.get("lenses") or []:
        lens_id = item.get("lens_id")
        if lens_id:
            return _try_get_lens(username, lens_type, str(lens_id))
    return None


def _search_lenses(
    *,
    username: str,
    query: str,
    lens_types: list[str] | None,
    limit: int,
    include_body: bool,
) -> dict[str, Any]:
    return mcp_materials.search_lenses(
        username,
        query=query,
        lens_types=lens_types or [],
        limit=limit,
        include_body=include_body,
    )


def _lens_brief(lens: dict[str, Any] | None, *, include_body: bool) -> dict[str, Any] | None:
    if lens is None:
        return None
    out = {
        "lens_type": lens.get("lens_type"),
        "lens_id": lens.get("lens_id"),
        "title": lens.get("title"),
        "description": lens.get("description"),
        "metadata": lens.get("metadata") or {},
        "sections": lens.get("sections") or {},
        "evidence_tweet_ids": lens.get("evidence_tweet_ids") or [],
        "call_guidance": lens.get("call_guidance") or {},
    }
    if include_body:
        out["full_body"] = lens.get("full_body")
    return out


def _add_lens(selected: list[dict[str, Any]], lens: dict[str, Any] | None, *, include_body: bool) -> None:
    brief = _lens_brief(lens, include_body=include_body)
    if brief is None:
        return
    key = (brief.get("lens_type"), brief.get("lens_id"))
    if any((item.get("lens_type"), item.get("lens_id")) == key for item in selected):
        return
    selected.append(brief)


def _selection_query(req: OkxPersonaContextRequest, tickers: list[str]) -> str:
    parts = [req.question, req.sector or "", *tickers]
    return " ".join(part for part in parts if part).strip()


def _score_persona(username: str, query: str, tickers: list[str]) -> tuple[int, dict[str, Any]]:
    score = 0
    reasons: list[str] = []
    exact_tickers: list[str] = []
    for ticker in tickers:
        if _try_get_lens(username, "ticker", ticker):
            score += 12
            exact_tickers.append(ticker)
    if exact_tickers:
        reasons.append("exact_ticker_lens:%s" % ",".join(exact_tickers))

    try:
        matches = _search_lenses(
            username=username,
            query=query,
            lens_types=[],
            limit=3,
            include_body=False,
        ).get("results") or []
    except (FileNotFoundError, ValueError):
        matches = []
    if matches:
        score += min(10, sum(int(item.get("score") or 1) for item in matches))
        reasons.append("material_search_hits:%d" % len(matches))

    return score, {"username": username, "score": score, "reasons": reasons}


def _select_persona(req: OkxPersonaContextRequest, tickers: list[str]) -> tuple[str, list[dict[str, Any]]]:
    requested = (req.persona or "").strip().lower()
    if requested:
        if not _persona_exists(requested):
            raise HTTPException(status_code=404, detail="Persona not found")
        return requested, [{"username": requested, "score": 999, "reasons": ["requested"]}]

    query = _selection_query(req, tickers)
    candidates = mcp_materials.list_material_personas()
    scored: list[dict[str, Any]] = []
    for persona in candidates:
        username = str(persona.get("username") or "")
        score, row = _score_persona(username, query, tickers)
        scored.append({**row, "display_name": persona.get("display_name")})
    scored.sort(key=lambda item: (-int(item.get("score") or 0), str(item.get("username") or "")))
    if scored and int(scored[0].get("score") or 0) > 0:
        return str(scored[0]["username"]), scored[:5]
    if _persona_exists(DEFAULT_PERSONA):
        return DEFAULT_PERSONA, scored[:5]
    if candidates:
        return str(candidates[0]["username"]), scored[:5]
    raise HTTPException(status_code=503, detail="No persona material is available")


def _selected_lenses(
    *,
    username: str,
    req: OkxPersonaContextRequest,
    tickers: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    selected: list[dict[str, Any]] = []
    query = _selection_query(req, tickers)
    allowed_types = [str(item) for item in req.lens_types]

    _add_lens(selected, _first_lens(username, "core"), include_body=req.include_lens_body)
    _add_lens(selected, _first_lens(username, "macro"), include_body=req.include_lens_body)
    for ticker in tickers[:4]:
        _add_lens(selected, _try_get_lens(username, "ticker", ticker), include_body=req.include_lens_body)

    searched = _search_lenses(
        username=username,
        query=query,
        lens_types=allowed_types,
        limit=req.lens_limit,
        include_body=req.include_lens_body,
    )
    matches = searched.get("results") or []
    for match in matches:
        if len(selected) >= req.lens_limit:
            break
        lens_type = str(match.get("lens_type") or "")
        lens_id = str(match.get("lens_id") or "")
        _add_lens(
            selected,
            _try_get_lens(username, lens_type, lens_id),
            include_body=req.include_lens_body,
        )

    selection_rule = {
        "query": query,
        "rule": (
            "core and macro are included first; exact ticker lenses are added; "
            "remaining slots come from lexical material search over requested or all lens types."
        ),
        "lens_limit": req.lens_limit,
        "include_body": req.include_lens_body,
    }
    return selected[: req.lens_limit], selection_rule, matches


async def _evidence_from_map(username: str, lenses: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ids: list[str] = []
    for lens in lenses:
        for tweet_id in lens.get("evidence_tweet_ids") or []:
            normalized = str(tweet_id).strip()
            if normalized and normalized not in ids:
                ids.append(normalized)
            if len(ids) >= 20:
                break
    if not ids:
        return [], []
    try:
        out = await cockpit.get_evidence_tweets_by_ids(username, ids)
        tweets = out.get("tweets") or []
        found_ids = {str(tweet.get("id")) for tweet in tweets if tweet.get("id")}
        missing_ids = [tweet_id for tweet_id in ids if tweet_id not in found_ids]
        if missing_ids:
            fallback = mcp_materials.get_local_evidence_by_ids(username, missing_ids)
            if fallback:
                by_id = {str(tweet.get("id")): tweet for tweet in tweets if tweet.get("id")}
                by_id.update({str(tweet.get("id")): tweet for tweet in fallback if tweet.get("id")})
                tweets = [by_id[tweet_id] for tweet_id in ids if tweet_id in by_id]
        return tweets, []
    except Exception as exc:  # noqa: BLE001 - optional evidence map hydration
        logger.warning("okx evidence map fetch failed for persona=%s: %s", username, exc)
        return [], [{"section": "evidence_map", "error": str(exc)[:200]}]


async def _vector_evidence(username: str, query: str, limit: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if limit <= 0:
        return [], []
    try:
        result = await vector_search(
            VectorSearchRequest(
                query=query,
                top_k=limit,
                threshold=0.45,
                filters=VectorSearchFilters(
                    source_types=["kol_tweet"],
                    metadata={"author_username": username},
                ),
            )
        )
        chunks = [
            chunk_to_persona_result(chunk, citation_index=index).model_dump()
            for index, chunk in enumerate(result.results, start=1)
        ]
        return chunks, []
    except Exception as exc:  # noqa: BLE001 - vector corpus is optional context
        logger.warning("okx vector evidence failed for persona=%s: %s", username, exc)
        return [], [{"section": "vector_evidence", "error": str(exc)[:200]}]


async def persona_context(req: OkxPersonaContextRequest) -> dict[str, Any]:
    started = time.perf_counter()
    tickers = _normalize_symbols(req.ticker, req.tickers, limit=8)
    username, alternatives = _select_persona(req, tickers)
    query = _selection_query(req, tickers)
    selected_lenses, lens_selection, lens_matches = _selected_lenses(
        username=username,
        req=req,
        tickers=tickers,
    )

    errors: list[dict[str, Any]] = []
    evidence_map_tweets: list[dict[str, Any]] = []
    if req.include_evidence_map:
        evidence_map_tweets, map_errors = await _evidence_from_map(username, selected_lenses)
        errors.extend(map_errors)

    kol_chunks: list[dict[str, Any]] = []
    if req.include_vector_evidence and req.evidence_limit > 0:
        kol_chunks, vector_errors = await _vector_evidence(username, query, req.evidence_limit)
        errors.extend(vector_errors)

    persona_summary = next(
        (item for item in mcp_materials.list_material_personas() if item.get("username") == username),
        {"username": username},
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    return {
        "ok": True,
        "tool": "themarketbrew_persona_context",
        "request": req.model_dump(),
        "data": {
            "auth": _public_auth(),
            "selected_persona": persona_summary,
            "persona_selection": {
                "requested": req.persona,
                "selected": username,
                "alternatives": alternatives,
            },
            "question": req.question,
            "tickers": tickers,
            "sector": req.sector,
            "lens_selection": lens_selection,
            "selected_lenses": selected_lenses,
            "lens_search_matches": lens_matches,
            "evidence_map_tweets": evidence_map_tweets,
            "kol_chunks": kol_chunks,
            "answer_discipline": _safety_contract()["answer_rules"],
            "suggested_answer_shape": [
                "Start with a concise conclusion.",
                "Then label methodology context, historical evidence, current facts, and inference separately.",
                "Name confirmation and falsification signals.",
                "Avoid direct trade commands and exact price targets.",
            ],
            "notice": (
                "This is a paid OKX context pack. It is not the selected persona speaking "
                "and it is not a final investment answer."
            ),
        },
        "errors": errors,
        "freshness": {
            "as_of": _now(),
            "persona_material": "promoted methodology markdown",
            "vector_evidence": "latest indexed vector_chunks when available",
        },
        "safety": _safety_contract(),
        "latency_ms": latency_ms,
    }


def _require_symbol(req: OkxMarketDataRequest) -> str:
    symbol = _normalize_symbol(req.symbol)
    if not symbol and req.symbols:
        symbol = _normalize_symbol(req.symbols[0])
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required for this data_type")
    return symbol


async def market_data(req: OkxMarketDataRequest) -> dict[str, Any]:
    started = time.perf_counter()
    auth = okx_auth_context()

    if req.data_type == "catalog":
        envelope = await mcp_data.data_catalog(auth)
    elif req.data_type == "brief":
        envelope = await mcp_data.get_brief(
            KolMcpBriefRequest(
                brief_type=req.brief_type,
                symbol=_normalize_symbol(req.symbol) or None,
                symbols=_normalize_symbols(req.symbols, limit=5),
                include_market_data=True,
            ),
            auth,
        )
    elif req.data_type == "stock":
        symbol = _require_symbol(req)
        sections = [str(item) for item in req.stock_sections] or ["quote", "profile", "fundamentals", "news"]
        envelope = await mcp_data.get_stock_data(
            KolMcpStockDataRequest(
                symbol=symbol,
                sections=sections,
                days=req.days,
                history_days=req.history_days,
                year=req.year,
                quarter=req.quarter,
                limit=req.limit,
            ),
            auth,
        )
    elif req.data_type == "market":
        sections = [str(item) for item in req.market_sections] or ["market_overview", "macro_brief", "sentiment"]
        envelope = await mcp_data.get_market_data(
            KolMcpMarketDataRequest(sections=sections, days=req.days),
            auth,
        )
    elif req.data_type == "news":
        envelope = await mcp_data.get_news(
            KolMcpNewsRequest(
                symbols=_normalize_symbols(req.symbol, req.symbols, limit=10),
                scope=req.news_scope,
                days=req.days,
                limit=min(req.limit, 50),
            ),
            auth,
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported data_type")

    envelope = _rewrite_auth(envelope)
    return {
        "ok": True,
        "tool": "themarketbrew_market_data",
        "request": req.model_dump(),
        "data": envelope,
        "errors": envelope.get("errors") or [],
        "freshness": envelope.get("freshness") or {"as_of": _now()},
        "safety": _safety_contract(),
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }
