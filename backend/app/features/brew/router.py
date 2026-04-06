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
)

router = APIRouter(prefix="/api", tags=["brew"])


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

    # Auto-subscribe to Personal Digest email when user saves a non-empty watchlist
    email = body.email or user_email
    if body.symbols and email:
        try:
            from app.features.subscription.service import (
                get_subscription_service,
                SubscriptionChannel,
            )
            import asyncio

            svc = get_subscription_service()
            await asyncio.to_thread(
                svc.subscribe,
                SubscriptionChannel.PERSONAL_DIGEST,
                email,
                {"user_id": user_id, "first_name": ""},
            )
            logger.info(
                "Auto-subscribed %s to personal_digest", email
            )
        except Exception:
            logger.warning(
                "Failed to auto-subscribe %s to personal_digest",
                email,
                exc_info=True,
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

        today = today_str()

        # Check if today's digest already exists
        existing_digest = await get_user_digest(user_id, today)
        if existing_digest:
            # Verify symbols match - regenerate if user changed their watchlist
            cached_symbols = set(s.upper() for s in existing_digest.get("symbols", []))
            request_symbols = set(s.upper() for s in body.symbols)

            if cached_symbols != request_symbols:
                logger.info("Symbols changed for user %s..., regenerating...", user_id[:8])
                existing_digest = None  # Force regeneration
            else:
                logger.info("Found cached digest for user %s..., date: %s", user_id[:8], today)

        if existing_digest:
            digest_data = existing_digest.get("digest_data", {})
            stocks, news, events, summary = _transform_digest_sections(digest_data)

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
                from_cache=True,
            )

        # No cached digest, generate new one
        logger.info("No cached digest found for user %s..., generating new...", user_id[:8])
        digest_agent = get_personal_digest()
        result = await digest_agent.generate(
            symbols=body.symbols,
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
            }
            save_result = await save_user_digest(save_data)
            if save_result.get("success"):
                logger.info("Saved digest for user %s..., ID: %s", user_id[:8], save_result.get('digest_id'))
            else:
                logger.error("Failed to save: %s", save_result.get('error'))
        else:
            logger.info("Dev environment: skipping digest DB save")

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
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating digest")
        raise HTTPException(status_code=500, detail=str(e))
