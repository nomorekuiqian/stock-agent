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

All endpoints are gated behind the `kol_research_agent` feature flag.
Conversation persistence reuses the existing `picker-conversations` edge function;
KOL-specific metadata is embedded in the JSONB `data` field as `agent_kind`,
`persona_username`, and `kol_chunks` — no DB migration required.
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
from app.features.flags.db import get_user_flags
from app.features.kol_research import cockpit
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
    """Ensure the caller has the kol_research_agent flag enabled.

    Returns the user_info dict (so the endpoint can pull user_id / email).
    """
    flags = await get_user_flags(
        user_info["user_id"], email=user_info.get("email")
    )
    if FLAG_KEY not in flags:
        raise HTTPException(
            status_code=403,
            detail="KOL research agent is not enabled for this account.",
        )
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


@router.get("/personas/{username}/sectors/{sector_key}")
async def cockpit_sector(username: str, sector_key: str):
    """Sector detail: curated method + lens body + representative tweet originals."""
    detail = await cockpit.get_sector_detail(username, sector_key)
    if detail is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    return detail


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
    return {"tickers": tickers}


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
    return detail


# ---------------------------------------------------------------------------
# Chat (unary + SSE)
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=KolResearchResponse)
async def kol_research_chat(
    req: KolResearchRequest,
    _user: dict = Depends(require_kol_research_flag),
):
    """Unary KOL research chat."""
    return await answer_kol_research(
        message=req.message,
        history=[m.model_dump() for m in req.history],
        persona_username=req.persona_username or DEFAULT_PERSONA,
        content_context=req.content_context,
    )


@router.post("/chat/stream")
async def kol_research_chat_stream(
    req: KolResearchRequest,
    _user: dict = Depends(require_kol_research_flag),
):
    """SSE streaming KOL research chat.

    Event types:
      - skill_activated   {skill_name, description}
      - tool_call_start   {tool, description}
      - tool_call_end     {tool, duration_ms}
      - final             {data: KolResearchResponse}
      - error             {error}
    """
    async def event_generator():
        async for event in stream_kol_research(
            message=req.message,
            history=[m.model_dump() for m in req.history],
            persona_username=req.persona_username or DEFAULT_PERSONA,
            content_context=req.content_context,
        ):
            yield "data: %s\n\n" % _json.dumps(event, ensure_ascii=False, default=str)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Conversation persistence (reuses picker-conversations table)
# ---------------------------------------------------------------------------


class KolConversationSaveRequest(BaseModel):
    """Conversation envelope shared with /api/research/* — we add agent_kind
    inside `data` so the same table can hold both kinds without migration."""

    title: str = Field(..., min_length=1, max_length=200)
    data: dict[str, Any] = Field(default_factory=dict)
    message_count: int = Field(default=0, ge=0)
    persona_username: str = Field(default=DEFAULT_PERSONA, min_length=1, max_length=80)


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


@router.get("/conversations")
async def kol_research_list_conversations(
    user_info: dict = Depends(require_kol_research_flag),
):
    """List user conversations.

    Returns the raw list (mix of `research` and `kol_research` kinds);
    the frontend filters by `data.agent_kind`.
    """
    return await list_conversations(user_info["user_id"])


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
    )
    if created is None:
        raise HTTPException(status_code=500, detail="create_conversation failed")
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
    )
    if not ok:
        raise HTTPException(status_code=500, detail="update_conversation failed")
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
