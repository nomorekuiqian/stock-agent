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
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.deps import verify_user_token_with_email
from app.core.logging import get_logger
from app.core.sse import with_heartbeat
from app.features.flags.db import get_user_flags  # pyright: ignore[reportUnusedImport]  # noqa: F401 — kept for kol_research_agent flag rollback (see require_kol_research_flag)
from app.features.kol_research import cockpit, skill_cockpit
from app.features.kol_research.agent import (
    DEFAULT_PERSONA,
    answer_kol_research,
    stream_kol_research,
)
from app.features.kol_research.models import (
    KolResearchRequest,
    KolResearchResponse,
)
from app.features.screener.conversation_db import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)
from app.shared.fmp_service import get_fmp_service
from app.shared.kol_persona import get_persona, list_personas

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


@router.get("/personas/{username}/profile")
async def cockpit_profile(username: str):
    """Methodology core + sector card fronts."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    sectors = await cockpit.list_sectors(username)
    return {
        "persona": {
            "username": persona.username,
            "display_name": persona.display_name,
            "description": persona.description,
        },
        "core": cockpit.get_profile_core(),
        "sectors": sectors,
    }


@router.get("/personas/{username}/tickers")
async def cockpit_tickers(username: str):
    """Ticker list with mention counts + current price."""
    tickers = await cockpit.list_tickers(username)
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
        q = quotes_by_symbol.get(t["ticker"])
        t["price"] = q.get("price") if q else None
        t["daily_change"] = q.get("daily_change") if q else None
        t["summary"] = skill_cockpit.get_ticker_summary(t["ticker"])
    return {"tickers": tickers}


@router.get("/personas/{username}/sectors")
async def cockpit_sectors(username: str):
    """List skill-backed sectors for the cockpit sidebar."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if username.lower() != "qinbafrank":
        return {"sectors": []}
    return {"sectors": skill_cockpit.list_sectors()}


@router.get("/personas/{username}/sectors/{sector_key}")
async def cockpit_sector(username: str, sector_key: str):
    """Detailed sector + ticker prices + resolved representative tweets."""
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
    if username.lower() != "qinbafrank":
        raise HTTPException(status_code=404, detail="No skill distillation for this persona yet")

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


@router.get("/personas/{username}/tickers/{ticker}")
async def cockpit_ticker_detail(username: str, ticker: str):
    """Per-ticker: verbatim tweets + price series + fundamentals."""
    detail = await cockpit.get_ticker_tweets(username, ticker)
    if detail is None:
        raise HTTPException(status_code=404, detail="Ticker not covered")
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
    detail["summary"] = skill_cockpit.get_ticker_summary(sym)
    return detail


@router.get("/personas/{username}/tickers/{ticker}/timeline")
async def cockpit_ticker_timeline(username: str, ticker: str, limit: int = 10):
    """Per-ticker vertical opinion timeline. Picks the most informative
    enrichment-annotated mentions chronologically.
    """
    persona = get_persona(username)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found")
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
    user_info: dict = Depends(require_kol_research_flag),
):
    """Unary KOL research chat."""
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
    user_info: dict = Depends(require_kol_research_flag),
):
    """SSE streaming KOL research chat.

    Event types:
      - skill_activated   {skill_name, description}
      - tool_call_start   {tool, description}
      - tool_call_end     {tool, duration_ms}
      - thinking          {text}                       # chain-of-thought chunk
      - message_delta     {text}                       # incremental answer
      - final             {data: KolResearchResponse}
      - error             {error}
    """
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
