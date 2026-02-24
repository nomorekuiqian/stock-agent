"""
Personalized Digest API Router

Endpoint for generating personalized daily digests based on user watchlists.
Uses PersonalDigest agent (gemini-3-flash) to generate structured digest
with sections: stocks, news (headlines + briefs), events, summary.
"""

from fastapi import APIRouter, HTTPException, Request
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.utils.timezone import today_str, now_iso

logger = get_logger(__name__)
from app.features.brew.agent import get_personal_digest
from app.features.brew.db import save_user_digest, get_user_digest
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


@router.post("/digest", response_model=DigestResponse)
@limiter.limit("5/minute")
async def generate_digest(request: Request, body: DigestRequest):
    """
    Generate a personalized daily digest based on user's stock watchlist.

    If today's digest already exists for this user, returns cached data.
    Otherwise generates a new digest using PersonalDigest agent.

    Personalization is based on user's watchlist stocks.
    """
    try:
        if not body.user_id:
            raise HTTPException(status_code=401, detail="Authentication required. Please sign in to generate personalized digest.")

        if not body.symbols:
            raise HTTPException(status_code=400, detail="No symbols provided")

        today = today_str()

        # Check if today's digest already exists
        existing_digest = await get_user_digest(body.user_id, today)
        if existing_digest:
            # Verify symbols match - regenerate if user changed their watchlist
            cached_symbols = set(s.upper() for s in existing_digest.get("symbols", []))
            request_symbols = set(s.upper() for s in body.symbols)

            if cached_symbols != request_symbols:
                logger.info("Symbols changed for user %s..., regenerating...", body.user_id[:8])
                existing_digest = None  # Force regeneration
            else:
                logger.info("Found cached digest for user %s..., date: %s", body.user_id[:8], today)

        if existing_digest:
            digest_data = existing_digest.get("digest_data", {})

            # Transform cached data to response model
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
                for s in digest_data.get("stocks", [])
            ]

            news_data = digest_data.get("news", {})
            if isinstance(news_data, dict):
                headlines = [
                    DigestHeadlineNews(
                        title=n.get("title", ""),
                        related_symbols=n.get("related_symbols", []),
                        fact_summary=n.get("fact_summary", ""),
                        deep_analysis=n.get("deep_analysis", ""),
                        url=n.get("url", ""),
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
                for e in digest_data.get("events", [])
            ]

            summary_data = digest_data.get("summary", {})
            summary = DigestSummary(
                content=summary_data.get("content", "") if isinstance(summary_data, dict) else "",
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
                from_cache=True,
            )

        # No cached digest, generate new one
        logger.info("No cached digest found for user %s..., generating new...", body.user_id[:8])
        digest_agent = get_personal_digest()
        result = await digest_agent.generate(
            symbols=body.symbols,
            user_id=body.user_id,
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed to generate digest")
            raise HTTPException(status_code=500, detail=error_msg)

        # Transform to response model
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
            for s in result.get("stocks", [])
        ]

        # Transform news section (headlines + briefs)
        news_data = result.get("news", {})
        if isinstance(news_data, dict):
            headlines = [
                DigestHeadlineNews(
                    title=n.get("title", ""),
                    related_symbols=n.get("related_symbols", []),
                    fact_summary=n.get("fact_summary", ""),
                    deep_analysis=n.get("deep_analysis", ""),
                    url=n.get("url", ""),
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
            for e in result.get("events", [])
        ]

        # Transform summary
        summary_data = result.get("summary", {})
        summary = DigestSummary(
            content=summary_data.get("content", "") if isinstance(summary_data, dict) else "",
        )

        # Save to database (always save, user_id is required)
        save_data = {
            "user_id": body.user_id,
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
            logger.info("Saved digest for user %s..., ID: %s", body.user_id[:8], save_result.get('digest_id'))
        else:
            logger.error("Failed to save: %s", save_result.get('error'))

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
