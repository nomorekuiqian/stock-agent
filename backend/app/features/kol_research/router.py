"""KOL Research Agent — HTTP endpoints.

Routes:
  GET  /api/kol_research/personas             list available KOL personas
  POST /api/kol_research/chat                 unary chat
  POST /api/kol_research/chat/stream          SSE chat
  GET  /api/kol_research/conversations        list user conversations (agent_kind filter applied client-side)
  GET  /api/kol_research/conversations/{id}   get one conversation
  POST /api/kol_research/conversations        create
  PUT  /api/kol_research/conversations/{id}   update
  DELETE /api/kol_research/conversations/{id} delete

Chat endpoints are gated behind the `kol_research_agent` feature flag.
The existing `/research` UI still owns `picker_conversations` saves, while
KOL chat runs also pass through `features.agent_runtime` and write durable
runtime events to `agent_session_events` via the `agent-sessions` Edge Function.
"""

from __future__ import annotations

import asyncio
import json as _json
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.deps import verify_user_token, verify_user_token_with_email
from app.core.logging import get_logger
import app.core.posthog_client as posthog
from app.core.rate_limit import _get_real_ip
from app.core.sse import with_heartbeat
from app.features.quota.service import consume_quota
from app.features.flags.db import get_user_flags  # pyright: ignore[reportUnusedImport]  # noqa: F401 — kept for kol_research_agent flag rollback (see require_kol_research_flag)
from app.features.kol_research import cockpit, cockpit_v3, mcp_auth, mcp_data, mcp_materials, skill_cockpit
from app.features.kol_research.agent import (
    DEFAULT_PERSONA,
    answer_kol_research,
    stream_kol_research,
)
from app.features.kol_research.models import (
    KolMcpContextRequest,
    KolMcpEvidenceByIdsRequest,
    KolMcpAuthStartRequest,
    KolMcpAuthTokenRequest,
    KolMcpAuthorizeDeviceRequest,
    KolMcpBriefRequest,
    KolMcpLensSearchRequest,
    KolMcpMarketBriefRequest,
    KolMcpMarketDataRequest,
    KolMcpNewsRequest,
    KolMcpSearchRequest,
    KolMcpStockDataRequest,
    KolMcpWorkflowRequest,
    KolMcpWorkflowResponse,
    KolResearchRequest,
    KolResearchResponse,
)
from app.features.vector.models import VectorSearchFilters, VectorSearchRequest
from app.features.vector.service import search as vector_search
from app.features.screener.conversation_db import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)
from app.shared.fmp_service import get_fmp_service
from app.shared.data_tools.briefs import (
    get_industry_brief,
    get_macro_brief,
    get_peer_brief,
    get_stock_brief,
)
from app.shared.kol_persona import get_persona, list_personas
from app.shared.kol_persona.tools import chunk_to_persona_result

logger = get_logger(__name__)

FLAG_KEY = "kol_research_agent"

router = APIRouter(prefix="/api/kol_research", tags=["kol_research"])


# ---------------------------------------------------------------------------
# Flag gating dependency
# ---------------------------------------------------------------------------


async def require_kol_research_flag(
    user_info: dict = Depends(verify_user_token_with_email),
) -> dict:
    """[FLAG ROLLED OUT] kol_research_agent is now available to all signed-in
    callers. The dependency is kept (and still requires a valid bearer token)
    so endpoints don't have to be re-wired for rollback. To re-gate the flag,
    uncomment the FLAG_KEY check below.

    Returns the user_info dict (so the endpoint can pull user_id / email).
    """
    # flags = await get_user_flags(
    #     user_info["user_id"], email=user_info.get("email")
    # )
    # if FLAG_KEY not in flags:
    #     raise HTTPException(
    #         status_code=403,
    #         detail="KOL research agent is not enabled for this account.",
    #     )
    return user_info


# ---------------------------------------------------------------------------
# Personas listing
# ---------------------------------------------------------------------------


@router.get("/personas")
async def list_kol_personas(
    _user: dict = Depends(require_kol_research_flag),
):
    """Return list of personas available to load into the agent."""
    return {"personas": [p.model_dump() for p in list_personas()]}


# ---------------------------------------------------------------------------
# Persona Cockpit (PUBLIC read — the /kol/{username} page browses without login).
# No flag gating here; only the chat endpoints require kol_research_agent.
# ---------------------------------------------------------------------------


async def _fetch_quote(symbol: str) -> dict | None:
    try:
        res = await asyncio.to_thread(get_fmp_service().get_stock_quotes, [symbol])
        quotes = res.get("quotes") or []
        return quotes[0] if quotes else None
    except Exception:  # noqa: BLE001 — FMP flakiness must not break the page
        logger.warning("cockpit quote fetch failed for %s", symbol, exc_info=True)
        return None


async def _fetch_price_series(symbol: str, limit: int = 400) -> list[dict]:
    try:
        res = await asyncio.to_thread(get_fmp_service().get_historical_price, symbol, limit)
        data = res.get("data") or []
        return [
            {"date": d["date"], "close": d["close"]}
            for d in data
            if d.get("close") is not None and d.get("date")
        ]
    except Exception:  # noqa: BLE001
        logger.warning("cockpit price series failed for %s", symbol, exc_info=True)
        return []


async def _fetch_fundamentals(symbol: str) -> dict:
    fmp = get_fmp_service()

    async def _profile() -> dict:
        try:
            return await asyncio.to_thread(fmp.get_company_profile_detail, symbol)
        except Exception:  # noqa: BLE001
            return {}

    async def _metrics() -> dict:
        try:
            return await asyncio.to_thread(fmp.get_key_metrics_ttm, symbol)
        except Exception:  # noqa: BLE001
            return {}

    profile, metrics = await asyncio.gather(_profile(), _metrics())
    sector = (profile.get("classification") or {}).get("sector")
    pe = (metrics.get("metrics") or {}).get("pe_ratio")
    return {"sector": sector, "pe_ttm": pe}


def _is_skill_cockpit(username: str) -> bool:
    """Frank still uses the legacy `skill_cockpit.py` reader. v3 personas
    (Serenity etc.) go through `cockpit_v3.py`."""
    return username.lower() == "qinbafrank"


@router.get("/personas/{username}/profile")
async def cockpit_profile(username: str):
    """Methodology core + sector card fronts."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if _is_skill_cockpit(username):
        sectors = await cockpit.list_sectors(username)
    else:
        sectors = cockpit_v3.list_sectors_v3(username)
    return {
        "persona": {
            "username": persona.username,
            "display_name": persona.display_name,
            "description": persona.description,
        },
        "core": cockpit.get_profile_core(username),
        "sectors": sectors,
    }


@router.get("/personas/{username}/high-conviction")
async def cockpit_high_conviction(username: str):
    """Sector-grouped high-conviction ticker grid for the cockpit hero list.

    Serenity is the primary consumer; Frank doesn't have md-derived high
    conviction yet so returns empty groups for him.
    """
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if _is_skill_cockpit(username):
        return {"groups": []}

    payload = cockpit_v3.list_high_conviction(username)

    # Batch quote priceable tickers across all groups for inline price chips.
    symbols: list[str] = []
    for g in payload["groups"]:
        for t in g["tickers"]:
            if t.get("priceable") and t["ticker"] not in symbols:
                symbols.append(t["ticker"])
    quotes_by_symbol: dict[str, dict] = {}
    if symbols:
        try:
            res = await asyncio.to_thread(get_fmp_service().get_stock_quotes, symbols)
            for q in res.get("quotes") or []:
                quotes_by_symbol[(q.get("symbol") or "").upper()] = q
        except Exception:  # noqa: BLE001
            logger.warning("high-conviction batch quote failed", exc_info=True)
    for g in payload["groups"]:
        for t in g["tickers"]:
            q = quotes_by_symbol.get(t["ticker"].upper())
            t["price"] = q.get("price") if q else None
            t["daily_change"] = q.get("daily_change") if q else None
    return payload


@router.get("/personas/{username}/tickers")
async def cockpit_tickers(username: str):
    """Ticker list with mention counts + current price."""
    if _is_skill_cockpit(username):
        tickers = await cockpit.list_tickers(username)
    else:
        tickers = cockpit_v3.list_tickers_v3(username)
    symbols = [t["ticker"] for t in tickers if t.get("priceable")]
    quotes_by_symbol: dict[str, dict] = {}
    if symbols:
        try:
            res = await asyncio.to_thread(get_fmp_service().get_stock_quotes, symbols)
            for q in res.get("quotes") or []:
                quotes_by_symbol[(q.get("symbol") or "").upper()] = q
        except Exception:  # noqa: BLE001
            logger.warning("cockpit tickers quote batch failed", exc_info=True)
    for t in tickers:
        q = quotes_by_symbol.get(t["ticker"].upper())
        t["price"] = q.get("price") if q else None
        t["daily_change"] = q.get("daily_change") if q else None
        if _is_skill_cockpit(username):
            t["summary"] = skill_cockpit.get_ticker_summary(t["ticker"])
        else:
            t["summary"] = cockpit_v3.get_ticker_summary(username, t["ticker"])
    return {"tickers": tickers}


@router.get("/personas/{username}/sectors")
async def cockpit_sectors(username: str):
    """List skill-backed sectors for the cockpit sidebar."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if _is_skill_cockpit(username):
        return {"sectors": skill_cockpit.list_sectors()}
    return {"sectors": cockpit_v3.list_sectors_v3(username)}


@router.get("/personas/{username}/sectors/{sector_key}")
async def cockpit_sector(username: str, sector_key: str):
    """Detailed sector + ticker prices + resolved representative tweets."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if not _is_skill_cockpit(username):
        detail = cockpit_v3.get_sector_v3(username, sector_key)
        if detail is None:
            raise HTTPException(status_code=404, detail="Sector not found")

        # v3 returns rules as raw strings; the frontend's KolSectorRuleItem
        # contract is `{text, evidence[]}`. Wrap so the UI doesn't have to
        # special-case shape per persona.
        def _wrap_raw(rules: list[str] | None) -> list[dict]:
            if not rules:
                return []
            return [{"text": r, "evidence": []} for r in rules if isinstance(r, str) and r.strip()]

        for field in (
            "core_questions",
            "signals",
            "bull_conditions",
            "bear_triggers",
            "veto",
            "falsifiers",
            "misreadings",
        ):
            detail[field] = _wrap_raw(detail.get(field))

        # Ensure rep_tweets exists (frontend reads detail.rep_tweets directly).
        # v3 macro skills don't have explicit rep_tweet_ids, so leave empty.
        detail["rep_tweets"] = detail.get("rep_tweets") or []
        detail.pop("rep_tweet_ids", None)

        return detail

    detail = skill_cockpit.get_sector(sector_key)
    if detail is None:
        raise HTTPException(status_code=404, detail="Sector not found")

    # Enrich ticker list with current price + cockpit mention counts.
    raw_tickers = detail.pop("tickers", []) or []
    if raw_tickers:
        # Cockpit mention counts (from alias-extracted matches against tweet text)
        cockpit_summaries = await cockpit.list_tickers(username)
        cockpit_count_map = {t["ticker"]: t["count"] for t in cockpit_summaries}

        # Batch quote for priceable tickers in this sector
        priceable_syms = [
            t["ticker"] for t in raw_tickers
            if t["ticker"] not in cockpit.NON_PRICEABLE
        ]
        quotes_by_symbol: dict[str, dict] = {}
        if priceable_syms:
            try:
                res = await asyncio.to_thread(
                    get_fmp_service().get_stock_quotes, priceable_syms
                )
                for q in res.get("quotes") or []:
                    quotes_by_symbol[(q.get("symbol") or "").upper()] = q
            except Exception:  # noqa: BLE001
                logger.warning("sector batch quote failed", exc_info=True)

        enriched = []
        for entry in raw_tickers:
            sym = entry["ticker"]
            q = quotes_by_symbol.get(sym)
            enriched.append({
                **entry,
                "price": q.get("price") if q else None,
                "daily_change": q.get("daily_change") if q else None,
                "priceable": sym not in cockpit.NON_PRICEABLE,
                "cockpit_count": cockpit_count_map.get(sym, 0),
            })
        detail["tickers"] = enriched
    else:
        detail["tickers"] = []

    # Resolve rep_tweet_ids to slim tweet bodies via the cockpit index.
    # These also serve as the candidate pool for rule-level evidence ranking.
    rep_ids = detail.pop("rep_tweet_ids", []) or []
    rep_tweets: list[dict] = []
    candidate_pool: list[dict] = []
    if rep_ids:
        try:
            idx = await cockpit.get_index(username)
            by_id = idx.get("by_id") or {}
            for tid in rep_ids:
                slim = by_id.get(str(tid))
                if slim is None:
                    continue
                candidate_pool.append(slim)
                tweet = {k: v for k, v in slim.items() if k != "in_reply_to_username"}
                rep_tweets.append(tweet)
        except Exception:  # noqa: BLE001
            logger.warning("rep_tweet resolution failed", exc_info=True)
    detail["rep_tweets"] = rep_tweets

    # Enrich each rule with up to 3 evidence tweets (best keyword overlap).
    # Lists were strings; wrap as { text, evidence } so the UI can expand.
    def _wrap(rules: list[str], limit: int = 3) -> list[dict]:
        out: list[dict] = []
        for r in rules:
            if not isinstance(r, str) or not r.strip():
                continue
            evidence_ids = skill_cockpit.rank_tweets_for_rule(r, candidate_pool, limit=limit)
            evidence: list[dict] = []
            for tid in evidence_ids:
                slim = next((s for s in candidate_pool if str(s.get("id")) == tid), None)
                if slim is None:
                    continue
                evidence.append({k: v for k, v in slim.items() if k != "in_reply_to_username"})
            out.append({"text": r, "evidence": evidence})
        return out

    for field in (
        "core_questions",
        "signals",
        "bull_conditions",
        "bear_triggers",
        "veto",
        "falsifiers",
        "misreadings",
    ):
        detail[field] = _wrap(detail.get(field, []) or [])

    return detail


@router.get("/personas/{username}/industry_chain/{board_key}")
async def cockpit_industry_chain(username: str, board_key: str):
    """Industry chain visualization payload.

    Returns a multi-layer board (e.g. AI infra L0->L5) with:
      - per-layer weekly mention timeline (last 12 weeks)
      - per-layer rep_ticker daily price series (last 90 days)
      - per-ticker price + daily change + cockpit mention count + 1-line stance
    """
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")

    board = skill_cockpit.get_industry_chain_definition(board_key)
    if board is None:
        raise HTTPException(status_code=404, detail="Chain not registered for this board")

    # Pull cockpit corpus once (for weekly mentions).
    index = await cockpit.get_index(username)
    all_tweets = index.get("all_tweets") or []
    tickers_idx = index.get("tickers") or {}

    # Collect all priceable tickers (covered + supplements) for batch quote.
    all_chain_tickers: set[str] = set()
    rep_tickers: set[str] = set()
    for layer in board["layers"]:
        for tk in (layer.get("covered") or []) + (layer.get("supplements") or []):
            all_chain_tickers.add(tk)
        if layer.get("rep_ticker"):
            rep_tickers.add(layer["rep_ticker"])
    priceable_syms = [
        t for t in all_chain_tickers if t not in cockpit.NON_PRICEABLE
    ]

    quotes_by_symbol: dict[str, dict] = {}
    if priceable_syms:
        try:
            res = await asyncio.to_thread(
                get_fmp_service().get_stock_quotes, priceable_syms
            )
            for q in res.get("quotes") or []:
                quotes_by_symbol[(q.get("symbol") or "").upper()] = q
        except Exception:  # noqa: BLE001
            logger.warning("industry_chain batch quote failed", exc_info=True)

    # Per-layer price series for rep_ticker (concurrent fetch).
    async def _series(sym: str) -> list[dict]:
        return await _fetch_price_series(sym, limit=90)

    rep_series_map: dict[str, list[dict]] = {}
    if rep_tickers:
        tasks = {sym: _series(sym) for sym in rep_tickers}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        for sym, r in zip(tasks.keys(), results):
            if isinstance(r, list):
                rep_series_map[sym] = r

    # Weekly mention timeline helper.
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    weeks = 12

    def _weekly_mentions(layer_tickers: set[str]) -> list[int]:
        bins = [0] * weeks
        for t in all_tweets:
            iso = t.get("created_at")
            if not iso:
                continue
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except Exception:  # noqa: BLE001
                continue
            delta_days = (now - dt).days
            wk = delta_days // 7
            if wk < 0 or wk >= weeks:
                continue
            t_tickers = set(t.get("tickers") or [])
            if t_tickers & layer_tickers:
                bins[weeks - 1 - wk] += 1
        return bins

    # Build each layer's enriched payload.
    enriched_layers: list[dict] = []
    for layer in board["layers"]:
        covered = layer.get("covered") or []
        supplements = layer.get("supplements") or []

        # Weekly mentions: count only covered tickers (supplements have 0 by definition)
        layer_tickers_set = set(covered)
        total_mentions = sum(
            tickers_idx.get(tk, {}).get("count", 0)
            for tk in layer_tickers_set
        )

        def _enrich(tk: str, coverage: str) -> dict:
            q = quotes_by_symbol.get(tk)
            stance = skill_cockpit.get_ticker_stance(tk) if coverage == "covered" else ""
            summary = skill_cockpit.get_ticker_summary(tk) if coverage == "covered" else None
            name = (q.get("name") if q else None) or (
                skill_cockpit.SUPPLEMENT_NAMES.get(tk) if coverage == "not_covered" else None
            )
            return {
                "ticker": tk,
                "price": q.get("price") if q else None,
                "daily_change": q.get("daily_change") if q else None,
                "name": name,
                "cockpit_count": tickers_idx.get(tk, {}).get("count", 0),
                "priceable": tk not in cockpit.NON_PRICEABLE,
                "stance": stance,
                "frank_coverage": coverage,  # 'covered' | 'not_covered'
                "summary": summary,  # null if not in ticker skill markdown
            }

        ticker_objs: list[dict] = []
        for tk in covered:
            ticker_objs.append(_enrich(tk, "covered"))
        for tk in supplements:
            ticker_objs.append(_enrich(tk, "not_covered"))

        rep_series = rep_series_map.get(layer.get("rep_ticker") or "", [])
        enriched_layers.append({
            "id": layer["id"],
            "label": layer["label"],
            "stance": layer["stance"],
            "primary_question": layer["primary_question"],
            "tickers": ticker_objs,
            "subcategories": layer.get("subcategories") or [],
            "rep_ticker": layer.get("rep_ticker"),
            "rep_ticker_series": rep_series,
            "total_mentions": total_mentions,
            "weekly_mentions": _weekly_mentions(layer_tickers_set),
        })

    return {
        "board": {
            "key": board_key,
            "label": board["label"],
            "eyebrow": board["eyebrow"],
            "intro": board.get("intro", ""),
        },
        "layers": enriched_layers,
        "weeks": weeks,
    }


@router.get("/personas/{username}/feed")
async def cockpit_feed(
    username: str,
    limit: int = 20,
    offset: int = 0,
    sector: str | None = None,
    ticker: str | None = None,
    topic: str | None = None,
):
    """Time-desc tweet feed for the Live Feed module.

    Query params:
      limit  (default 20, max 50)
      offset (default 0)
      sector — group label or short alias: 'AI 算力链' / 'ai' / '加密·稳定币' / 'crypto' / '宏观' / 'macro'
      ticker — exact ticker symbol (case-insensitive), matches via alias dict
      topic  — topic-tree node key: 'industry', 'industry/ai_infra', 'macro', 'rules', ...
               See cockpit.get_topic_tree() for the full set.
    """
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    return await cockpit.get_feed(
        username,
        limit=limit,
        offset=offset,
        sector=sector,
        ticker=ticker,
        topic=topic,
    )


@router.get("/personas/{username}/topics")
async def cockpit_topics(username: str):
    """Topic-filter tree (产业板块 with leaves / 宏观 / 美股规律) with tweet counts."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    return await cockpit.get_topic_tree(username)


@router.get("/personas/{username}/tweets/by-ids")
async def cockpit_tweets_by_ids(username: str, ids: str):
    """Full-text tweets for curated evidence ids, preserving requested order."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    requested = [item.strip() for item in ids.split(",") if item.strip()]
    if len(requested) > 30:
        raise HTTPException(status_code=400, detail="Too many tweet ids")
    return await cockpit.get_evidence_tweets_by_ids(username, requested)


# ---------------------------------------------------------------------------
# MCP live context bridge for local MCP adapter clients
# ---------------------------------------------------------------------------


def _market_lens_tool_names() -> list[str]:
    return [
        "market_lens_status",
        "market_lens_login",
        "market_lens_auth_status",
        "market_lens_logout",
        "market_lens_personas",
        "market_lens_list_lenses",
        "market_lens_get_lens",
        "market_lens_search_lenses",
        "market_lens_search_evidence",
        "market_lens_get_evidence_by_ids",
        "market_lens_data_catalog",
        "market_lens_get_brief",
        "market_lens_get_stock_data",
        "market_lens_get_market_data",
        "market_lens_get_news",
        "market_lens_build_context",
        "market_lens_stock_diagnosis",
        "market_lens_market_regime",
        "market_lens_compare",
        "market_lens_research_memo",
    ]


def _frank_answer_discipline() -> list[str]:
    return [
        "Do not impersonate qinbafrank.",
        "Only cite returned kol_chunks as direct historical evidence.",
        "Separate historical evidence, live market data, and methodology inference.",
        "Do not provide direct buy/sell/add/reduce position instructions.",
        "Do not output exact price targets.",
    ]


def _persona_answer_discipline(username: str) -> list[str]:
    if username.lower() == DEFAULT_PERSONA:
        return _frank_answer_discipline()
    return [
        "Do not impersonate the selected persona.",
        "Only cite returned kol_chunks as direct historical evidence.",
        "Separate historical evidence, live market data, and methodology inference.",
        "Do not borrow another persona's framework or vocabulary.",
        "Do not provide direct buy/sell/add/reduce position instructions.",
        "Do not output exact price targets.",
    ]


def _workflow_answer_shape(workflow: str, username: str) -> list[str]:
    lens_label = "selected persona lens"
    base = [
        "Use this context pack as source material. The user agent writes the final answer.",
        f"Start with a plain-language conclusion, then explain which {lens_label} applies.",
        "Explicitly label direct historical evidence versus methodology inference.",
        "Name 2-3 confirmation or falsification signals.",
    ]
    if workflow == "compare":
        return [
            *base,
            "Compare by industry-chain position, evidence strength, valuation/earnings/logic risk, and falsifiers.",
            "If the user asks to pick one, give a direct conditional pick instead of avoiding the choice.",
        ]
    if workflow == "research_memo":
        return [
            *base,
            "Organize the answer as a research memo: question, evidence, market facts, thesis path, risks, falsifiers.",
        ]
    return base


_WORKFLOW_FRAMEWORK_CANDIDATES: dict[str, tuple[str, ...]] = {
    "build_context": ("ask-about-method", "ask-about-stock", "ask-about-sector"),
    "stock_diagnosis": ("ask-about-stock", "ask-about-method"),
    "market_regime": ("ask-about-macro", "ask-about-sector", "ask-about-method"),
    "compare": ("ask-to-compare", "ask-about-positioning", "ask-for-top-picks"),
    "research_memo": ("ask-about-method", "ask-news-decoder", "ask-about-stock"),
}


def _lens_brief(lens: dict[str, Any]) -> dict[str, Any]:
    return {
        "lens_type": lens.get("lens_type"),
        "lens_id": lens.get("lens_id"),
        "title": lens.get("title"),
        "description": lens.get("description"),
        "metadata": lens.get("metadata") or {},
        "evidence_tweet_ids": lens.get("evidence_tweet_ids") or [],
        "full_body": lens.get("full_body"),
    }


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


def _search_lens(username: str, lens_type: str, query: str | None) -> dict[str, Any] | None:
    normalized = (query or "").strip()
    if not normalized:
        return None
    exact = _try_get_lens(username, lens_type, normalized)
    if exact is not None:
        return exact
    try:
        result = mcp_materials.search_lenses(
            username,
            query=normalized,
            lens_types=[lens_type],
            limit=1,
            include_body=False,
        )
    except (FileNotFoundError, ValueError):
        return None
    matches = result.get("results") or []
    if not matches:
        return None
    return _try_get_lens(username, lens_type, str(matches[0].get("lens_id") or ""))


def _add_lens(selected: list[dict[str, Any]], lens: dict[str, Any] | None) -> None:
    if lens is None:
        return
    key = (lens.get("lens_type"), lens.get("lens_id"))
    if any((item.get("lens_type"), item.get("lens_id")) == key for item in selected):
        return
    selected.append(_lens_brief(lens))


def _infer_sector_from_lens(lens: dict[str, Any] | None) -> str | None:
    if lens is None:
        return None
    metadata = lens.get("metadata") or {}
    for key in ("parent_sector", "sector"):
        value = metadata.get(key)
        if value:
            return str(value)
    return None


def _methodology_lens_selection(
    *,
    username: str,
    workflow: str,
    ticker: str | None,
    tickers: list[str],
    sector: str | None,
    question: str | None = None,
) -> dict[str, Any]:
    selected: list[dict[str, Any]] = []
    inferred_sectors: list[str] = []

    _add_lens(selected, _first_lens(username, "core"))
    _add_lens(selected, _first_lens(username, "macro"))

    for candidate in _WORKFLOW_FRAMEWORK_CANDIDATES.get(workflow, ()):
        framework = _try_get_lens(username, "framework", candidate)
        if framework is not None:
            _add_lens(selected, framework)
            break

    unique_tickers = []
    for symbol in [ticker or "", *tickers]:
        normalized = symbol.strip().upper()
        if normalized and normalized not in unique_tickers:
            unique_tickers.append(normalized)

    for symbol in unique_tickers[:4]:
        lens = _try_get_lens(username, "ticker", symbol)
        _add_lens(selected, lens)
        inferred_sector = _infer_sector_from_lens(lens)
        if inferred_sector and inferred_sector not in inferred_sectors:
            inferred_sectors.append(inferred_sector)

    sector_queries = []
    if sector:
        sector_queries.append(sector)
    sector_queries.extend(inferred_sectors)
    if not sector_queries and question:
        sector_queries.append(question)

    for sector_query in sector_queries[:3]:
        sector_lens = _search_lens(username, "sector", sector_query)
        _add_lens(selected, sector_lens)

    return {
        "selected_lenses": selected,
        "inferred_sectors": inferred_sectors,
        "lens_selection_rule": (
            "core and macro are included first; workflow picks one framework; "
            "ticker lenses are exact-match by symbol; sector lenses come from explicit sector, "
            "ticker metadata, or question search."
        ),
    }


def _methodology_context(
    *,
    username: str,
    workflow: str,
    ticker: str | None,
    tickers: list[str],
    sector: str | None,
    question: str | None = None,
) -> dict[str, Any]:
    unique_tickers = []
    for symbol in [ticker or "", *tickers]:
        normalized = symbol.strip().upper()
        if normalized and normalized not in unique_tickers:
            unique_tickers.append(normalized)

    lens_selection = _methodology_lens_selection(
        username=username,
        workflow=workflow,
        ticker=ticker,
        tickers=tickers,
        sector=sector,
        question=question,
    )

    inferred_sector = sector or ""
    if not inferred_sector and lens_selection["inferred_sectors"]:
        inferred_sector = str(lens_selection["inferred_sectors"][0])

    if username.lower() == DEFAULT_PERSONA:
        ticker_summaries = {
            symbol: skill_cockpit.get_ticker_summary(symbol)
            for symbol in unique_tickers
        }
        if not inferred_sector:
            for summary in ticker_summaries.values():
                if summary and summary.get("parent_sector"):
                    inferred_sector = str(summary["parent_sector"])
                    break
        return {
            "workflow": workflow,
            "persona": DEFAULT_PERSONA,
            "selected_lenses": lens_selection["selected_lenses"],
            "lens_selection_rule": lens_selection["lens_selection_rule"],
            "ticker_methodology": ticker_summaries,
            "sector_methodology": skill_cockpit.get_sector(inferred_sector) if inferred_sector else None,
            "answer_discipline": _frank_answer_discipline(),
            "suggested_answer_shape": _workflow_answer_shape(workflow, username),
            "notice": (
                "This backend context pack contains qinbafrank methodology context. "
                "It is not qinbafrank speaking and is not investment advice."
            ),
        }

    ticker_summaries = {
        symbol: cockpit_v3.get_ticker_summary(username, symbol)
        for symbol in unique_tickers
    }
    return {
        "workflow": workflow,
        "persona": username,
        "selected_lenses": lens_selection["selected_lenses"],
        "lens_selection_rule": lens_selection["lens_selection_rule"],
        "ticker_methodology": ticker_summaries,
        "sector_methodology": cockpit_v3.get_sector_v3(username, inferred_sector) if inferred_sector else None,
        "answer_discipline": _persona_answer_discipline(username),
        "suggested_answer_shape": _workflow_answer_shape(workflow, username),
        "notice": (
            "This backend context pack contains selected persona context. "
            "It is not the persona speaking and is not investment advice."
        ),
    }


def _workflow_query(
    req: KolMcpWorkflowRequest,
    ticker: str | None,
    tickers: list[str],
    username: str,
) -> str:
    parts = [req.question, ticker or "", req.sector or "", *tickers]
    is_frank = username.lower() == DEFAULT_PERSONA
    if req.workflow == "stock_diagnosis" and is_frank:
        parts.extend(["杀估值", "杀业绩", "杀逻辑", "打脸条件"])
    elif req.workflow == "stock_diagnosis":
        parts.extend(["验证", "客户导入", "供应链", "瓶颈", "打脸条件"])
    elif req.workflow == "market_regime" and is_frank:
        parts.extend(["宏观", "流动性", "风险等级", "市场行情"])
    elif req.workflow == "market_regime":
        parts.extend(["宏观", "资本开支", "AI", "供应链", "风险"])
    elif req.workflow == "compare":
        parts.extend(["比较", "产业链", "证据强度", "弹性", "打脸条件"])
    else:
        parts.extend(["研究", "证据", "产业链", "原始判断", "打脸条件"])
    return " ".join(part for part in parts if part)


async def _mcp_search_chunks(
    *,
    username: str,
    query: str,
    k: int,
    threshold: float,
):
    """Search indexed vector_chunks for KOL tweet evidence."""
    result = await vector_search(
        VectorSearchRequest(
            query=query,
            top_k=k,
            threshold=threshold,
            filters=VectorSearchFilters(
                source_types=["kol_tweet"],
                metadata={"author_username": username},
            ),
        )
    )
    return [
        chunk_to_persona_result(chunk, citation_index=index)
        for index, chunk in enumerate(result.results, start=1)
    ]


def _json_or_text(raw: str) -> dict[str, Any]:
    try:
        parsed = _json.loads(raw)
    except Exception:  # noqa: BLE001
        return {"raw": raw}
    if isinstance(parsed, dict):
        return parsed
    return {"data": parsed}


async def _market_brief_payload(
    *,
    brief_type: str,
    symbol: str | None,
) -> dict[str, Any]:
    normalized_symbol = (symbol or "").strip().upper()
    if brief_type != "macro" and not normalized_symbol:
        raise HTTPException(status_code=400, detail="symbol is required for this brief_type")

    if brief_type == "stock":
        raw = await get_stock_brief(normalized_symbol)
    elif brief_type == "peer":
        raw = await get_peer_brief(normalized_symbol)
    elif brief_type == "industry":
        raw = await get_industry_brief(normalized_symbol)
    elif brief_type == "macro":
        raw = await get_macro_brief()
    else:
        raise HTTPException(status_code=400, detail="Unsupported brief_type")

    return {
        "brief_type": brief_type,
        "symbol": normalized_symbol or None,
        "payload": _json_or_text(raw),
    }


def _question_needs_macro(question: str) -> bool:
    q = question.lower()
    macro_terms = (
        "macro",
        "fed",
        "fomc",
        "cpi",
        "pce",
        "rate",
        "rates",
        "liquidity",
        "treasury",
        "yield",
        "美元",
        "美联储",
        "利率",
        "流动性",
        "通胀",
        "关税",
        "地缘",
        "宏观",
    )
    return any(term in q for term in macro_terms)


def _question_needs_news(question: str) -> bool:
    q = question.lower()
    news_terms = (
        "news",
        "latest",
        "recent",
        "today",
        "catalyst",
        "headline",
        "breaking",
        "新闻",
        "最新",
        "今天",
        "催化",
        "发生",
    )
    return any(term in q for term in news_terms)


def _default_data_sections(
    *,
    workflow: str,
    question: str,
    ticker: str | None,
    tickers: list[str],
) -> list[str]:
    sections: list[str] = []
    if workflow == "stock_diagnosis":
        sections.append("stock_brief")
        if any(term in question.lower() for term in ("technical", "rsi", "macd", "support", "resistance", "技术", "支撑", "压力")):
            sections.append("technical")
        if _question_needs_news(question):
            sections.append("news")
        if _question_needs_macro(question):
            sections.append("macro_brief")
    elif workflow == "market_regime":
        sections.extend(["macro_brief", "market_overview", "economic_calendar"])
        if _question_needs_news(question):
            sections.append("market_news")
    elif workflow == "compare":
        sections.append("stock_brief")
        if len(tickers) <= 3:
            sections.append("peer_brief")
    elif workflow == "research_memo":
        sections.append("stock_brief" if ticker or tickers else "macro_brief")
        sections.append("news")
    else:
        if ticker:
            sections.append("stock_brief")
        if _question_needs_macro(question):
            sections.append("macro_brief")
        if _question_needs_news(question):
            sections.append("news")
    return list(dict.fromkeys(sections))


def _merge_envelope_context(
    *,
    envelope: dict[str, Any],
    data_context: list[dict[str, Any]],
    news_context: list[dict[str, Any]],
    data_freshness: dict[str, Any],
    data_errors: list[dict[str, Any]],
) -> None:
    tool = envelope.get("tool") or "unknown"
    target = news_context if tool == "news" else data_context
    target.append(envelope)
    data_freshness[tool] = envelope.get("freshness") or {}
    for err in envelope.get("errors") or []:
        data_errors.append({"tool": tool, **err})


async def _mcp_data_context(
    *,
    workflow: str,
    question: str,
    ticker: str | None,
    tickers: list[str],
    include_market_data: bool,
    data_sections: list[str],
    news_days: int,
    mcp_user: dict,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    if not include_market_data:
        return [], [], [], {}, []

    sections = data_sections or _default_data_sections(
        workflow=workflow,
        question=question,
        ticker=ticker,
        tickers=tickers,
    )
    symbols = tickers or ([ticker] if ticker else [])
    data_context: list[dict[str, Any]] = []
    news_context: list[dict[str, Any]] = []
    data_freshness: dict[str, Any] = {}
    data_errors: list[dict[str, Any]] = []
    market_context: list[dict[str, Any]] = []

    async def add_envelope(envelope: dict[str, Any]) -> None:
        _merge_envelope_context(
            envelope=envelope,
            data_context=data_context,
            news_context=news_context,
            data_freshness=data_freshness,
            data_errors=data_errors,
        )

    for section in sections[:8]:
        if section == "stock_brief":
            for symbol in symbols:
                req = KolMcpBriefRequest(brief_type="stock", symbol=symbol)
                legacy = await mcp_data.legacy_market_brief_payload(req, mcp_user)
                market_context.append({
                    "brief_type": legacy["brief_type"],
                    "symbol": legacy["symbol"],
                    "payload": legacy["payload"],
                })
                await add_envelope(legacy["mcp_envelope"])
        elif section == "peer_brief":
            for symbol in symbols[:3]:
                req = KolMcpBriefRequest(brief_type="peer", symbol=symbol)
                await add_envelope(await mcp_data.get_brief(req, mcp_user))
        elif section == "industry_brief" and (ticker or symbols):
            req = KolMcpBriefRequest(brief_type="industry", symbol=ticker or symbols[0])
            await add_envelope(await mcp_data.get_brief(req, mcp_user))
        elif section == "macro_brief":
            req = KolMcpBriefRequest(brief_type="macro")
            legacy = await mcp_data.legacy_market_brief_payload(req, mcp_user)
            market_context.append({
                "brief_type": legacy["brief_type"],
                "symbol": None,
                "payload": legacy["payload"],
            })
            await add_envelope(legacy["mcp_envelope"])
        elif section in {"news", "stock_news"}:
            await add_envelope(await mcp_data.get_news(
                KolMcpNewsRequest(symbols=symbols, scope="stock", days=news_days),
                mcp_user,
            ))
        elif section == "market_news":
            await add_envelope(await mcp_data.get_news(
                KolMcpNewsRequest(scope="market", days=news_days),
                mcp_user,
            ))
        elif section in {"all_news"}:
            await add_envelope(await mcp_data.get_news(
                KolMcpNewsRequest(symbols=symbols, scope="all", days=news_days),
                mcp_user,
            ))
        elif section in {
            "quote",
            "profile",
            "fundamentals",
            "forward_valuation",
            "historical_valuation",
            "technical",
            "earnings_calendar",
            "price_history",
            "earnings_data",
            "transcript",
            "insider_trading",
            "press_releases",
        } and symbols:
            for symbol in symbols[:3]:
                await add_envelope(await mcp_data.get_stock_data(
                    KolMcpStockDataRequest(symbol=symbol, sections=[section]),
                    mcp_user,
                ))
        elif section in {
            "market_overview",
            "macro_risk",
            "liquidity",
            "sentiment",
            "economic_calendar",
            "earnings_calendar",
            "morning_report",
            "weekly_report",
            "twitter_digest",
        }:
            await add_envelope(await mcp_data.get_market_data(
                KolMcpMarketDataRequest(sections=[section], days=news_days),
                mcp_user,
            ))
        else:
            data_errors.append({"tool": "data_sections", "section": section, "error": "unsupported data section"})

    return market_context, data_context, news_context, data_freshness, data_errors


@router.post("/mcp/auth/device/start")
async def mcp_auth_device_start(req: KolMcpAuthStartRequest):
    """Start browser/device auth for a local TheMarketBrew MCP adapter."""
    try:
        return await mcp_auth.start_device_authorization(req.client_name)
    except RuntimeError as exc:
        logger.warning("mcp auth start failed: %s", exc)
        raise HTTPException(status_code=502, detail="MCP auth service unavailable") from exc


@router.post("/mcp/auth/device/token")
async def mcp_auth_device_token(req: KolMcpAuthTokenRequest):
    """Poll device auth and exchange an approved device code for an MCP token."""
    return await mcp_auth.exchange_device_token(req.device_code)


@router.post("/mcp/auth/device/authorize")
async def mcp_auth_device_authorize(
    req: KolMcpAuthorizeDeviceRequest,
    user_id: str = Depends(verify_user_token),
):
    """Approve a device code from a logged-in TheMarketBrew web session."""
    return await mcp_auth.authorize_device_code(user_code=req.user_code, user_id=user_id)


@router.get("/mcp/auth/status")
async def mcp_auth_status(
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Return current MCP account token status."""
    return {
        "ok": True,
        "authenticated": True,
        "user_id": mcp_user.get("user_id"),
        "token_id": mcp_user.get("token_id"),
        "scopes": mcp_user.get("scopes") or [],
        "expires_at": mcp_user.get("expires_at"),
        "client_name": mcp_user.get("client_name"),
    }


@router.post("/mcp/auth/revoke")
async def mcp_auth_revoke(
    authorization: str | None = Header(None),
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Revoke the current MCP token."""
    token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing MCP token")
    return await mcp_auth.revoke_mcp_token(token)


@router.get("/mcp/data/catalog")
async def mcp_data_catalog(
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Catalog of TheMarketBrew MCP data capabilities."""
    return await mcp_data.data_catalog(mcp_user)


@router.post("/mcp/data/brief")
async def mcp_data_brief(
    req: KolMcpBriefRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Coarse-grained stock/peer/macro/industry brief for MCP clients."""
    return await mcp_data.get_brief(req, mcp_user)


@router.post("/mcp/data/stock")
async def mcp_data_stock(
    req: KolMcpStockDataRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Fine-grained stock data sections for MCP clients."""
    return await mcp_data.get_stock_data(req, mcp_user)


@router.post("/mcp/data/market")
async def mcp_data_market(
    req: KolMcpMarketDataRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Market, macro, calendar, and report data sections for MCP clients."""
    return await mcp_data.get_market_data(req, mcp_user)


@router.post("/mcp/data/news")
async def mcp_data_news(
    req: KolMcpNewsRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Unified news feed for MCP clients."""
    return await mcp_data.get_news(req, mcp_user)


@router.get("/personas/{username}/mcp/status")
async def mcp_status(username: str):
    """Market Lens backend status."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")

    persona_summary = next(
        (item for item in mcp_materials.list_material_personas() if item["username"] == username),
        None,
    )
    return {
        "ok": True,
        "persona_username": username,
        "mode": "backend_first",
        "persona": persona_summary,
        "tools": _market_lens_tool_names(),
        "auth": {
            "account_required": True,
            "content_tools_require_token": True,
            "login_tool": "market_lens_login",
        },
    }


@router.get("/mcp/personas")
async def mcp_personas(
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """List personas that have distilled material available to Market Lens MCP."""
    return {
        "ok": True,
        "mode": "backend_first",
        "personas": mcp_materials.list_material_personas(),
        "call_guidance": {
            "when_to_call": (
                "Call before selecting a persona, especially when the user did not name one."
            ),
            "selection_rule": (
                "Choose the persona whose methodology and available lens coverage best match "
                "the user's query, then pass persona explicitly to later tools."
            ),
            "returns_context": (
                "Persona capability metadata only; use list_lenses/get_lens for distilled material."
            ),
        },
    }


@router.get("/personas/{username}/mcp/lenses")
async def mcp_list_lenses(
    username: str,
    lens_type: str | None = None,
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Index of all distilled material lenses for one persona."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    try:
        return mcp_materials.list_lenses(username, lens_type=lens_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/personas/{username}/mcp/lenses/{lens_type}/{lens_id}")
async def mcp_get_lens(
    username: str,
    lens_type: str,
    lens_id: str,
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Full distilled lens content for one persona/layer/id."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    try:
        return mcp_materials.get_lens(username, lens_type=lens_type, lens_id=lens_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/personas/{username}/mcp/lenses/search")
async def mcp_search_lenses(
    username: str,
    req: KolMcpLensSearchRequest,
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Lexical search over all distilled material lenses."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    try:
        return mcp_materials.search_lenses(
            username,
            query=req.query,
            lens_types=req.lens_types,
            limit=req.limit,
            include_body=req.include_body,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/personas/{username}/mcp/evidence/by-ids")
async def mcp_evidence_by_ids(
    username: str,
    req: KolMcpEvidenceByIdsRequest,
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Retrieval of historical tweets referenced by lens Evidence Maps."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    out = await cockpit.get_evidence_tweets_by_ids(username, req.tweet_ids)
    tweets = out.get("tweets") or []
    found_ids = {str(tweet.get("id")) for tweet in tweets if tweet.get("id")}
    missing_ids = [tweet_id for tweet_id in req.tweet_ids if str(tweet_id) not in found_ids]
    if missing_ids:
        fallback = mcp_materials.get_local_evidence_by_ids(username, missing_ids)
        if fallback:
            by_id = {str(tweet.get("id")): tweet for tweet in tweets if tweet.get("id")}
            by_id.update({str(tweet.get("id")): tweet for tweet in fallback if tweet.get("id")})
            tweets = [by_id[tweet_id] for tweet_id in req.tweet_ids if tweet_id in by_id]
    return {
        "persona_username": username,
        "tweet_ids": req.tweet_ids,
        "tweets": tweets,
        "call_guidance": {
            "when_to_call": "Call after get_lens returns Evidence Map tweet IDs and the user needs the original historical posts.",
            "returns_context": "Full-text historical tweet evidence for the requested IDs, preserving request order when found.",
        },
    }


@router.post("/personas/{username}/mcp/search")
async def mcp_live_search(
    username: str,
    req: KolMcpSearchRequest,
    _mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Live MCP vector search over KOL tweet embeddings."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    chunks = await _mcp_search_chunks(
        username=username,
        query=req.query,
        k=req.k,
        threshold=req.threshold,
    )
    return {
        "persona_username": username,
        "query": req.query,
        "retrieval_mode": "vector_chunks",
        "count": len(chunks),
        "chunks": [chunk.model_dump() for chunk in chunks],
    }


@router.post("/personas/{username}/mcp/market-brief")
async def mcp_market_brief(
    username: str,
    req: KolMcpMarketBriefRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Live MCP bridge to KOL agent brief tools."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    return await mcp_data.legacy_market_brief_payload(req, mcp_user)


@router.post("/personas/{username}/mcp/context")
async def mcp_live_context(
    username: str,
    req: KolMcpContextRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Live MCP context with vector evidence and optional market data."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")

    ticker = (req.ticker or "").strip().upper()
    sector = (req.sector or "").strip()
    search_query = " ".join(part for part in (req.question, ticker, sector) if part)
    chunks = await _mcp_search_chunks(
        username=username,
        query=search_query,
        k=req.evidence_limit,
        threshold=0.45,
    )

    (
        market_context,
        data_context,
        news_context,
        data_freshness,
        data_errors,
    ) = await _mcp_data_context(
        workflow="build_context",
        question=req.question,
        ticker=ticker or None,
        tickers=[ticker] if ticker else [],
        include_market_data=req.include_market_data,
        data_sections=req.data_sections,
        news_days=req.news_days,
        mcp_user=mcp_user,
    )

    return {
        "persona_username": username,
        "question": req.question,
        "ticker": ticker or None,
        "sector": sector or None,
        "retrieval_mode": "vector_chunks",
        "market_data_mode": "brief_tools",
        "kol_chunks": [chunk.model_dump() for chunk in chunks],
        "market_context": market_context,
        "data_context": data_context,
        "news_context": news_context,
        "data_freshness": data_freshness,
        "data_errors": data_errors,
        "methodology_context": _methodology_context(
            username=username,
            workflow="build_context",
            ticker=ticker or None,
            tickers=[ticker] if ticker else [],
            sector=sector or None,
            question=req.question,
        ),
        "ticker_methodology": (
            skill_cockpit.get_ticker_summary(ticker)
            if ticker and username.lower() == DEFAULT_PERSONA
            else None
        ),
        "answer_discipline": _persona_answer_discipline(username),
    }


@router.post("/personas/{username}/mcp/workflow", response_model=KolMcpWorkflowResponse)
async def mcp_workflow_context(
    username: str,
    req: KolMcpWorkflowRequest,
    mcp_user: dict = Depends(mcp_auth.verify_mcp_token),
):
    """Market Lens workflow context pack for user-owned agents."""
    if not mcp_materials.material_persona_exists(username):
        raise HTTPException(status_code=404, detail="Persona not found")
    supported = mcp_materials.supported_workflows(username)
    if req.workflow not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"workflow_not_supported:{req.workflow}",
        )
    started = time.perf_counter()
    ticker = (req.ticker or "").strip().upper() or None
    tickers: list[str] = []

    for symbol in req.tickers:
        normalized = symbol.strip().upper()
        if normalized and normalized not in tickers:
            tickers.append(normalized)
    if ticker and ticker not in tickers:
        tickers.insert(0, ticker)

    if req.workflow == "stock_diagnosis" and not ticker:
        raise HTTPException(status_code=400, detail="ticker is required for stock_diagnosis")
    if req.workflow == "compare" and len(tickers) < 2:
        raise HTTPException(status_code=400, detail="at least two tickers are required for compare")

    query = _workflow_query(req, ticker, tickers, username)
    chunks = await _mcp_search_chunks(
        username=username,
        query=query,
        k=req.evidence_limit,
        threshold=0.45,
    )

    (
        market_context,
        data_context,
        news_context,
        data_freshness,
        data_errors,
    ) = await _mcp_data_context(
        workflow=req.workflow,
        question=req.question,
        ticker=ticker,
        tickers=tickers,
        include_market_data=req.include_market_data,
        data_sections=req.data_sections,
        news_days=req.news_days,
        mcp_user=mcp_user,
    )

    methodology_context = _methodology_context(
        username=username,
        workflow=req.workflow,
        ticker=ticker,
        tickers=tickers,
        sector=(req.sector or "").strip() or None,
        question=req.question,
    )
    response = KolMcpWorkflowResponse(
        persona_username=username,
        workflow=req.workflow,
        question=req.question,
        ticker=ticker,
        tickers=tickers,
        sector=(req.sector or "").strip() or None,
        retrieval_mode="vector_chunks",
        market_data_mode="brief_tools" if req.include_market_data else "disabled",
        kol_chunks=[chunk.model_dump() for chunk in chunks],
        market_context=market_context,
        data_context=data_context,
        news_context=news_context,
        data_freshness=data_freshness,
        data_errors=data_errors,
        methodology_context=methodology_context,
        answer_discipline=_persona_answer_discipline(username),
        suggested_answer_shape=_workflow_answer_shape(req.workflow, username),
        share_url=None,
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "market_lens workflow persona=%s workflow=%s ticker=%s tickers=%s evidence=%d market=%d latency_ms=%d",
        username,
        req.workflow,
        ticker,
        ",".join(tickers),
        len(chunks),
        len(market_context),
        latency_ms,
    )
    return response


@router.get("/personas/{username}/tickers/{ticker}")
async def cockpit_ticker_detail(username: str, ticker: str):
    """Per-ticker: verbatim tweets + price series + fundamentals + decoder."""
    if _is_skill_cockpit(username):
        detail = await cockpit.get_ticker_tweets(username, ticker)
        if detail is None:
            raise HTTPException(status_code=404, detail="Ticker not covered")
    else:
        # v3 personas: build detail from md frontmatter; no live tweet ingestion.
        persona = get_persona(username)
        if persona is None:
            raise HTTPException(status_code=404, detail="Persona not found")
        sym_upper = ticker.upper()
        ticker_entry = next(
            (t for t in cockpit_v3.list_tickers_v3(username) if t["ticker"].upper() == sym_upper),
            None,
        )
        if ticker_entry is None:
            raise HTTPException(status_code=404, detail="Ticker not covered")
        detail = {
            "ticker": ticker_entry["ticker"],
            "aliases": [],
            "count": ticker_entry["count"],
            "first": None,
            "latest": None,
            "priceable": ticker_entry["priceable"],
            "tweets": [],
            "region": ticker_entry["region"],
            "coverage": ticker_entry["coverage"],
            "sector_key": ticker_entry["sector"],
            "decoder": cockpit_v3.get_ticker_decoder(username, ticker_entry["ticker"]),
        }
    sym = detail["ticker"]
    if detail.get("priceable"):
        price_series, quote, fundamentals = await asyncio.gather(
            _fetch_price_series(sym),
            _fetch_quote(sym),
            _fetch_fundamentals(sym),
        )
    else:
        price_series, quote, fundamentals = [], None, {}
    detail["price_series"] = price_series
    detail["market"] = {
        "name": quote.get("name") if quote else None,
        "price": quote.get("price") if quote else None,
        "daily_change": quote.get("daily_change") if quote else None,
        "sector": fundamentals.get("sector"),
        "pe_ttm": fundamentals.get("pe_ttm"),
    }
    if _is_skill_cockpit(username):
        detail["summary"] = skill_cockpit.get_ticker_summary(sym)
    else:
        detail["summary"] = cockpit_v3.get_ticker_summary(username, sym)
    return detail


@router.get("/personas/{username}/tickers/{ticker}/timeline")
async def cockpit_ticker_timeline(username: str, ticker: str, limit: int = 10):
    """Per-ticker vertical opinion timeline. Picks the most informative
    enrichment-annotated mentions and returns them newest-first.

    Only available for personas with a live tweet index (Frank). v3 personas
    don't have ingested tweets yet — returns 204 No Content semantics
    (empty list) instead of 404 to keep the UI simple.
    """
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if not _is_skill_cockpit(username):
        return {"ticker": ticker.upper(), "items": []}
    limit = max(3, min(limit, 20))
    result = await cockpit.get_ticker_timeline(username, ticker, limit=limit)
    if result is None:
        raise HTTPException(status_code=404, detail="Ticker not covered")
    return result


# ---------------------------------------------------------------------------
# Chat (unary + SSE)
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=KolResearchResponse)
async def kol_research_chat(
    req: KolResearchRequest,
    request: Request,
    user_info: dict = Depends(require_kol_research_flag),
):
    """Unary KOL research chat. Shares the research daily quota (2/day for
    free + Pro; Max unlimited) so persona mode can't be used to bypass it."""
    client_ip = _get_real_ip(request)
    quota = await consume_quota(user_info["user_id"], client_ip)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=429,
            detail="今日免费提问次数已用完，升级 Max 解锁无限使用",
        )
    if posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_info["user_id"],
            event="kol_research_chat_sent",
            properties={
                "persona_username": req.persona_username or DEFAULT_PERSONA,
                "is_stream": False,
            },
        )
    return await answer_kol_research(
        message=req.message,
        history=[m.model_dump() for m in req.history],
        persona_username=req.persona_username or DEFAULT_PERSONA,
        content_context=req.content_context,
        conversation_id=req.session_id or req.conversation_id,
        user_id=user_info["user_id"],
        turn_id=req.turn_id,
    )


@router.post("/chat/stream")
async def kol_research_chat_stream(
    req: KolResearchRequest,
    request: Request,
    user_info: dict = Depends(require_kol_research_flag),
):
    """SSE streaming KOL research chat. Shares the research daily quota
    (2/day for free + Pro; Max unlimited) so persona mode can't be used to
    bypass it.

    Event types:
      - skill_activated   {skill_name, description}
      - tool_call_start   {tool, description}
      - tool_call_end     {tool, duration_ms}
      - thinking          {text}                       # chain-of-thought chunk
      - message_delta     {text}                       # incremental answer
      - final             {data: KolResearchResponse}
      - error             {error}
    """
    client_ip = _get_real_ip(request)
    quota = await consume_quota(user_info["user_id"], client_ip)
    if not quota["allowed"]:
        async def quota_error():
            yield "data: %s\n\n" % _json.dumps(
                {
                    "type": "error",
                    "message": "今日免费提问次数已用完，升级 Max 解锁无限使用",
                    "quota_exceeded": True,
                },
                ensure_ascii=False,
            )
        return StreamingResponse(quota_error(), media_type="text/event-stream")

    if posthog.posthog_client:
        posthog.posthog_client.capture(
            distinct_id=user_info["user_id"],
            event="kol_research_chat_sent",
            properties={
                "persona_username": req.persona_username or DEFAULT_PERSONA,
                "is_stream": True,
            },
        )

    async def event_generator():
        async for event in stream_kol_research(
            message=req.message,
            history=[m.model_dump() for m in req.history],
            persona_username=req.persona_username or DEFAULT_PERSONA,
            content_context=req.content_context,
            conversation_id=req.session_id or req.conversation_id,
            user_id=user_info["user_id"],
            turn_id=req.turn_id,
        ):
            yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)

    return StreamingResponse(
        with_heartbeat(event_generator(), stream_name="kol_research_chat"),
        media_type="text/event-stream",
    )


# ---------------------------------------------------------------------------
# Conversation persistence (reuses picker-conversations table)
# ---------------------------------------------------------------------------


class KolConversationSaveRequest(BaseModel):
    """Conversation envelope shared with /api/research/* — we add agent_kind
    inside `data` so the same table can hold both kinds without migration."""

    id: str | None = Field(default=None, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    data: dict[str, Any] = Field(default_factory=dict)
    message_count: int = Field(default=0, ge=0)
    persona_username: str = Field(default=DEFAULT_PERSONA, min_length=1, max_length=80)
    touch: bool = Field(
        default=True,
        description="When false, save UI-only state without advancing updated_at.",
    )


def _stamp_kol_metadata(
    data: dict[str, Any],
    *,
    persona_username: str,
) -> dict[str, Any]:
    """Embed agent_kind + persona_username into the conversation's JSONB data."""
    out = dict(data or {})
    out["agent_kind"] = "kol_research"
    out["persona_username"] = persona_username
    return out


async def _sync_kol_runtime_ui_state(
    *,
    user_id: str,
    conversation_id: str | None,
    title: str | None,
    data: dict[str, Any] | None,
    persona_username: str,
    source: str,
) -> None:
    if not conversation_id:
        return
    try:
        from app.features.agent_runtime.events import sync_ui_state
        from app.features.kol_research.agent import APP_NAME

        await sync_ui_state(
            user_id=user_id,
            agent_id=APP_NAME,
            session_id=conversation_id,
            agent_kind="kol_research",
            title=title,
            data=data,
            persona_username=persona_username,
            source=source,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "kol runtime ui sync failed conversation_id=%s",
            conversation_id,
        )


@router.get("/conversations")
async def kol_research_list_conversations(
    user_info: dict = Depends(require_kol_research_flag),
    limit: int = 20,
    offset: int = 0,
):
    """List user conversations.

    Returns the raw list (mix of `research` and `kol_research` kinds);
    the frontend filters by `data.agent_kind`.
    """
    result = await list_conversations(user_info["user_id"], limit=limit, offset=offset)
    return {
        "conversations": result["items"],
        "has_more": result["has_more"],
    }


@router.get("/conversations/{conversation_id}")
async def kol_research_get_conversation(
    conversation_id: str,
    user_info: dict = Depends(require_kol_research_flag),
):
    conv = await get_conversation(conversation_id, user_info["user_id"])
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/conversations", status_code=201)
async def kol_research_create_conversation(
    req: KolConversationSaveRequest,
    user_info: dict = Depends(require_kol_research_flag),
):
    stamped = _stamp_kol_metadata(req.data, persona_username=req.persona_username)
    created = await create_conversation(
        user_id=user_info["user_id"],
        title=req.title,
        data=stamped,
        message_count=req.message_count,
        conversation_id=req.id,
    )
    if created is None:
        raise HTTPException(status_code=500, detail="create_conversation failed")
    await _sync_kol_runtime_ui_state(
        user_id=user_info["user_id"],
        conversation_id=created.get("id"),
        title=req.title,
        data=stamped,
        persona_username=req.persona_username,
        source="conversation_create",
    )
    return created


@router.put("/conversations/{conversation_id}")
async def kol_research_update_conversation(
    conversation_id: str,
    req: KolConversationSaveRequest,
    user_info: dict = Depends(require_kol_research_flag),
):
    stamped = _stamp_kol_metadata(req.data, persona_username=req.persona_username)
    ok = await update_conversation(
        conversation_id=conversation_id,
        user_id=user_info["user_id"],
        title=req.title,
        data=stamped,
        message_count=req.message_count,
        touch=req.touch,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="update_conversation failed")
    await _sync_kol_runtime_ui_state(
        user_id=user_info["user_id"],
        conversation_id=conversation_id,
        title=req.title,
        data=stamped,
        persona_username=req.persona_username,
        source="conversation_update",
    )
    return {"success": True}


@router.delete("/conversations/{conversation_id}")
async def kol_research_delete_conversation(
    conversation_id: str,
    user_info: dict = Depends(require_kol_research_flag),
):
    ok = await delete_conversation(conversation_id, user_info["user_id"])
    if not ok:
        raise HTTPException(status_code=500, detail="delete_conversation failed")
    return {"success": True}
