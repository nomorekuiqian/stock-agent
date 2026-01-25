"""
Personalized Digest API Router

Endpoint for generating personalized daily digests based on user watchlists.
Uses PersonalDigest agent (gemini-3-flash) to generate structured digest
with sections: stocks, news (headlines + briefs), events, summary.
"""

import traceback

from fastapi import APIRouter, HTTPException

from app.utils.timezone import today_str, now_iso
from app.features.digest.agent import get_personal_digest
from app.features.digest.db import save_user_digest
from app.features.digest.models import (
    DigestRequest,
    DigestResponse,
    StockAnalysis,
    DigestHeadlineNews,
    DigestBriefNews,
    DigestNewsSection,
    DigestEvent,
    DigestSummary,
)

router = APIRouter(prefix="/api", tags=["digest"])


@router.post("/digest", response_model=DigestResponse)
async def generate_digest(request: DigestRequest):
    """
    Generate a personalized daily digest based on user's stock watchlist.

    Uses PersonalDigest agent (gemini-3-flash) to generate structured digest
    with 5 sections: stocks, news (8-10), events, macro impact, bottom line.

    Personalization is based on user's watchlist stocks.
    """
    try:
        if not request.user_id:
            raise HTTPException(status_code=401, detail="Authentication required. Please sign in to generate personalized digest.")

        if not request.symbols:
            raise HTTPException(status_code=400, detail="No symbols provided")

        # Use PersonalDigest for personalized digest
        digest_agent = get_personal_digest()
        result = await digest_agent.generate(symbols=request.symbols)

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
            "user_id": request.user_id,
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
            print(f"[Digest] Saved digest for user {request.user_id}, ID: {save_result.get('digest_id')}")
        else:
            print(f"[Digest] Failed to save: {save_result.get('error')}")

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
