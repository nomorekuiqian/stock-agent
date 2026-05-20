"""
Personalized Digest API Router

Endpoint for generating personalized daily digests based on user watchlists.
"""

import re
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from app.core.deps import verify_user_token, verify_user_token_with_email
from app.core.config import ENVIRONMENT
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.utils.timezone import today_str, now_iso

logger = get_logger(__name__)
from app.features.brew.agent import get_personal_digest
from app.features.brew.db import (
    save_user_digest,
    get_user_digest,
    get_user_watchlist,
    save_user_watchlist,
    get_user_digest_by_id,
    list_user_digests,
)
from app.features.brew.models import (
    DigestRequest,
    DigestResponse,
    StockAnalysis,
    DigestHeadlineNews,
    DigestBriefNews,
    DigestNewsSection,
    DigestEvent,
    DigestSummary,
    ActionItem,
)
from app.features.brew.event_selector import select_top_event, TopEvent
from app.features.portfolio import db as portfolio_db
from app.features.portfolio.service import compute_effective_weights

router = APIRouter(prefix="/api", tags=["brew"])


async def _compute_top_event(
    events_data: list[dict],
    user_id: str,
) -> TopEvent | None:
    """Compute the top event for the user from digest events and portfolio.

    Splits DigestEvent dicts into earnings-like and macro-like lists,
    loads the user's portfolio to get effective weights, then calls
    select_top_event().  Returns None on any failure (non-blocking).
    """
    try:
        # Load portfolio holdings
        rows = await portfolio_db.list_portfolio(user_id)
        if not rows:
            return None
        holdings_views = compute_effective_weights(rows, prices_map=None)
        holdings_dict = {h.symbol: h.effective_weight_pct for h in holdings_views}

        # Split events into earnings and macro lists.
        # DigestEvent has: date, event, related_symbols, why_important.
        # Earnings events typically mention a symbol and "财报" / "earnings".
        earnings: list[dict] = []
        macros: list[dict] = []

        for ev in events_data:
            event_text = ev.get("event", "")
            related = ev.get("related_symbols", [])

            # Heuristic: if the event mentions a specific symbol from user
            # holdings and contains earnings keywords, treat as earnings.
            is_earnings = False
            if related:
                for sym in related:
                    sym_upper = (sym or "").upper()
                    if sym_upper in holdings_dict and any(
                        kw in event_text for kw in ("财报", "earnings", "Earnings", "Q1", "Q2", "Q3", "Q4")
                    ):
                        earnings.append({
                            "symbol": sym_upper,
                            "date": ev.get("date", ""),
                            "epsEstimated": None,
                        })
                        is_earnings = True

            if not is_earnings:
                macros.append({
                    "date": ev.get("date", ""),
                    "event": event_text,
                })

        return select_top_event(earnings, macros, holdings_dict)
    except Exception:
        logger.warning("Failed to compute top_event for user %s, skipping", user_id[:8], exc_info=True)
        return None


def _transform_digest_sections(data: Dict[str, Any]) -> tuple:
    """Transform raw digest data dict into (stocks, news, events, summary) model objects.

    Used for both cached database records and fresh agent results to avoid duplication.
    """
    stocks = [
        StockAnalysis(
            symbol=s.get("symbol", ""),
            name=s.get("name", ""),
            price=s.get("price", 0),
            daily_change=s.get("daily_change", ""),
            week_change=s.get("week_change", ""),
            status=s.get("status", ""),
            quick_take=s.get("quick_take", ""),
        )
        for s in data.get("stocks", [])
    ]

    news_data = data.get("news", {})
    if isinstance(news_data, dict):
        headlines = [
            DigestHeadlineNews(
                title=n.get("title", ""),
                related_symbols=n.get("related_symbols", []),
                fact_summary=n.get("fact_summary", ""),
                deep_analysis=n.get("deep_analysis", ""),
                url=n.get("url", ""),
                published_at=n.get("published_at", ""),
            )
            for n in news_data.get("headlines", [])
        ]
        briefs = [
            DigestBriefNews(
                title=n.get("title", ""),
                related_symbols=n.get("related_symbols", []),
                summary=n.get("summary", ""),
                analysis=n.get("analysis", ""),
                url=n.get("url", ""),
                published_at=n.get("published_at", ""),
            )
            for n in news_data.get("briefs", [])
        ]
        news = DigestNewsSection(headlines=headlines, briefs=briefs)
    else:
        news = DigestNewsSection(headlines=[], briefs=[])

    events = [
        DigestEvent(
            date=e.get("date", ""),
            event=e.get("event", ""),
            related_symbols=e.get("related_symbols", []),
            why_important=e.get("why_important", ""),
        )
        for e in data.get("events", [])
    ]

    summary_data = data.get("summary", {})
    summary = DigestSummary(
        content=summary_data.get("content", "") if isinstance(summary_data, dict) else "",
    )

    return stocks, news, events, summary


# --- Watchlist endpoints ---

class WatchlistSaveRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list, max_length=25)
    email: str = ""
    base_updated_at: str | None = None

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, value: list[str]) -> list[str]:
        """Normalize, validate and deduplicate symbols while preserving order."""
        pattern = re.compile(r"^[A-Z0-9.\-^=]{1,12}$")
        normalized: list[str] = []
        seen: set[str] = set()

        for raw in value:
            symbol = (raw or "").strip().upper()
            if not symbol:
                continue
            if not pattern.match(symbol):
                raise ValueError(f"Invalid symbol: {raw}")
            if symbol in seen:
                continue
            seen.add(symbol)
            normalized.append(symbol)

        return normalized


@router.get("/watchlist")
async def get_watchlist(user_id: str = Depends(verify_user_token)):
    """Get the authenticated user's watchlist."""
    watchlist = await get_user_watchlist(user_id)
    if watchlist is None:
        raise HTTPException(status_code=502, detail="Failed to fetch watchlist")
    return {
        "success": True,
        "data": watchlist,
    }


@router.put("/watchlist")
async def save_watchlist(
    body: WatchlistSaveRequest,
    user_info: dict = Depends(verify_user_token_with_email),
):
    """Save (upsert) the authenticated user's watchlist."""
    user_id = user_info["user_id"]
    user_email = user_info.get("email", "")

    result = await save_user_watchlist(
        user_id=user_id,
        symbols=body.symbols,
        email=body.email or user_email,
        base_updated_at=body.base_updated_at,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=result.get("status_code", 500),
            detail=result.get("error", "Failed to save watchlist"),
        )

    return result


# --- Digest read endpoints ---

@router.get("/digests")
async def list_digests(
    user_id: str = Depends(verify_user_token),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List the authenticated user's digests with pagination."""
    # Fetch enough records to handle offset + limit
    fetch_limit = offset + limit
    digests = await list_user_digests(user_id, limit=fetch_limit)
    sliced = digests[offset:offset + limit]
    return {
        "success": True,
        "data": sliced,
        "total": len(digests),
    }


@router.get("/digests/{digest_id}")
async def get_digest_by_id(
    digest_id: str,
    user_id: str = Depends(verify_user_token),
):
    """Get a specific digest by its UUID. Requires authentication and ownership."""
    digest = await get_user_digest_by_id(digest_id)
    if not digest or digest.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Digest not found")
    return {"success": True, "data": digest}


@router.post("/digest", response_model=DigestResponse)
@limiter.limit("5/minute")
async def generate_digest(
    request: Request,
    body: DigestRequest,
    user_id: str = Depends(verify_user_token),
):
    """
    Generate a personalized daily digest based on user's stock watchlist.

    If today's digest already exists for this user, returns cached data.
    Otherwise generates a new digest using PersonalDigest agent.

    Personalization is based on user's watchlist stocks.
    """
    try:
        if not body.symbols:
            raise HTTPException(status_code=400, detail="No symbols provided")

        # Merge portfolio symbols into analysis set
        try:
            portfolio_rows = await portfolio_db.list_portfolio(user_id)
            portfolio_syms = [r.symbol for r in portfolio_rows if r.symbol != "$CASH"]
            # Union: preserve order, watchlist first, then portfolio-only symbols
            all_symbols = list(dict.fromkeys(body.symbols + portfolio_syms))[:25]
        except Exception:
            logger.warning("digest: portfolio merge failed user=%s, using watchlist only", user_id[:8])
            all_symbols = body.symbols

        today = today_str()

        # Check if today's digest already exists
        existing_digest = await get_user_digest(user_id, today)
        if existing_digest:
            # Verify symbols match - regenerate if user changed their watchlist
            cached_symbols = set(s.upper() for s in existing_digest.get("symbols", []))
            request_symbols = set(s.upper() for s in all_symbols)

            if cached_symbols != request_symbols:
                logger.info("Symbols changed for user %s..., regenerating...", user_id[:8])
                existing_digest = None  # Force regeneration
            else:
                logger.info("Found cached digest for user %s..., date: %s", user_id[:8], today)

        if existing_digest:
            digest_data = existing_digest.get("digest_data", {})
            stocks, news, events, summary = _transform_digest_sections(digest_data)

            # Compute top event from cached events + user portfolio
            cached_events_raw = digest_data.get("events", [])
            top_event = await _compute_top_event(cached_events_raw, user_id)

            # Cached digests may predate action_items or have malformed entries
            # from earlier schema revisions. Drop bad items individually rather
            # than 500ing the whole response.
            cached_action_items_raw = digest_data.get("action_items") or []
            # LLM hallucination safety: a dict at this position would iterate
            # its keys. Coerce single-dict to list; log+skip other non-list
            # shapes.
            if isinstance(cached_action_items_raw, dict):
                cached_action_items_raw = [cached_action_items_raw]
            elif not isinstance(cached_action_items_raw, list):
                logger.warning(
                    "Cached action_items has unexpected type %s for user %s..., ignoring",
                    type(cached_action_items_raw).__name__,
                    user_id[:8] if user_id else "unknown",
                )
                cached_action_items_raw = []

            cached_action_items: list[ActionItem] = []
            for item in cached_action_items_raw:
                if isinstance(item, ActionItem):
                    cached_action_items.append(item)
                    continue
                try:
                    cached_action_items.append(ActionItem.model_validate(item))
                except Exception as exc:  # pydantic ValidationError is subclass; keep broad
                    logger.warning(
                        "Dropping malformed cached action_item for user %s...: %s",
                        user_id[:8] if user_id else "unknown", exc,
                    )

            return DigestResponse(
                success=True,
                timestamp=existing_digest.get("created_at", now_iso()),
                symbols_used=existing_digest.get("symbols", []),
                greeting=existing_digest.get("greeting", ""),
                one_line_summary=existing_digest.get("one_line_summary", ""),
                stocks=stocks,
                news=news,
                events=events,
                summary=summary,
                action_items=cached_action_items,
                portfolio_summary=digest_data.get("portfolio_summary", "") or "",
                from_cache=True,
                top_event=top_event,
            )

        # No cached digest, generate new one
        logger.info("No cached digest found for user %s..., generating new...", user_id[:8])
        digest_agent = get_personal_digest()
        result = await digest_agent.generate(
            symbols=all_symbols,
            user_id=user_id,
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed to generate digest")
            raise HTTPException(status_code=500, detail=error_msg)

        stocks, news, events, summary = _transform_digest_sections(result)

        # Save to database (production only to avoid overwriting live data)
        if ENVIRONMENT == "production":
            save_data = {
                "user_id": user_id,
                "digest_date": today_str(),
                "timestamp": result.get("timestamp", now_iso()),
                "symbols": result.get("symbols_used", []),
                "greeting": result.get("greeting", ""),
                "one_line_summary": result.get("one_line_summary", ""),
                "stocks": result.get("stocks", []),
                "news": result.get("news", {}),
                "events": result.get("events", []),
                "summary": result.get("summary", {}),
                "action_items": result.get("action_items", []),
                "portfolio_summary": result.get("portfolio_summary", ""),
            }
            save_result = await save_user_digest(save_data)
            if save_result.get("success"):
                logger.info("Saved digest for user %s..., ID: %s", user_id[:8], save_result.get('digest_id'))
            else:
                logger.error("Failed to save: %s", save_result.get('error'))
        else:
            logger.info("Dev environment: skipping digest DB save")

        # Compute top event from fresh events + user portfolio
        fresh_events_raw = result.get("events", [])
        top_event = await _compute_top_event(fresh_events_raw, user_id)

        action_items_raw = result.get("action_items") or []
        # Dict-coercion guard (matches cache-hit path): ADK/Pydantic should
        # reject dict-shaped action_items at validation time, but if an older
        # ADK version or a custom runner bypasses that, we still want to
        # surface the single action instead of iterating dict keys.
        if isinstance(action_items_raw, dict):
            action_items_raw = [action_items_raw]
        elif not isinstance(action_items_raw, list):
            logger.warning(
                "Fresh action_items has unexpected type %s for user %s..., ignoring",
                type(action_items_raw).__name__,
                user_id[:8] if user_id else "unknown",
            )
            action_items_raw = []

        action_items: list[ActionItem] = []
        for item in action_items_raw:
            if isinstance(item, ActionItem):
                action_items.append(item)
                continue
            try:
                action_items.append(ActionItem.model_validate(item))
            except Exception as exc:
                logger.warning(
                    "Dropping malformed agent action_item for user %s...: %s",
                    user_id[:8] if user_id else "unknown", exc,
                )

        return DigestResponse(
            success=True,
            timestamp=result.get("timestamp", now_iso()),
            symbols_used=result.get("symbols_used", []),
            greeting=result.get("greeting", ""),
            one_line_summary=result.get("one_line_summary", ""),
            stocks=stocks,
            news=news,
            events=events,
            summary=summary,
            action_items=action_items,
            portfolio_summary=result.get("portfolio_summary", "") or "",
            top_event=top_event,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating digest")
        raise HTTPException(status_code=500, detail=str(e))
