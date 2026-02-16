"""
Market Analysis API - FastAPI Application Entry Point

Registers all feature routers and configures middleware.
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env before importing anything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ALLOWED_ORIGINS

app = FastAPI(title="Market Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.features.market.router import router as market_router
from app.features.digest.router import router as digest_router
from app.features.stock.router import router as stock_router
from app.features.sector.router import router as sector_router
from app.features.liquidity.router import router as liquidity_router
from app.features.subscription.router import router as subscription_router
from app.features.feedback.router import router as feedback_router
from app.features.macro_risk.router import router as macro_risk_router
from app.features.weekly_report.router import router as weekly_report_router
from app.features.macro_cache.router import router as macro_cache_router
from app.features.payment.router import router as payment_router

app.include_router(market_router)
app.include_router(digest_router)
app.include_router(stock_router)
app.include_router(sector_router)
app.include_router(liquidity_router)
app.include_router(subscription_router)
app.include_router(feedback_router)
app.include_router(macro_risk_router)
app.include_router(weekly_report_router)
app.include_router(macro_cache_router)
app.include_router(payment_router)


@app.on_event("startup")
async def _warm_caches():
    """Pre-warm weekly report cache so users never hit Edge Function cold-start."""
    import asyncio

    async def _warm():
        try:
            from app.features.weekly_report import db as weekly_db
            from app.features.weekly_report.router import _cache, _strip_raw_data
            import time

            report = await weekly_db.get_latest_report()
            if report:
                _cache["latest"] = _strip_raw_data(report)
                _cache["ts"] = time.monotonic()
                print(f"[Startup] Weekly report cache warmed: {report.get('week_label')}")
            else:
                print("[Startup] No weekly report to cache")
        except Exception as e:
            print(f"[Startup] Cache warm-up failed (non-fatal): {e}")

    # Run in background so it doesn't block startup
    asyncio.create_task(_warm())


@app.get("/")
async def root():
    return {"message": "Market Analysis API is running"}
