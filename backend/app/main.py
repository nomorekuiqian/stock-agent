"""
Market Analysis API - FastAPI Application Entry Point

Registers all feature routers and configures middleware.
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env before importing anything else

import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import ALLOWED_ORIGINS, GOOGLE_API_KEY, FMP_API_KEY
from app.core.logging import setup_logging, get_logger
from app.core.rate_limit import limiter

# --- Logging ---
setup_logging()
logger = get_logger(__name__)

# --- App ---
app = FastAPI(title="Market Analysis API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception: %s %s", request.method, request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "Validation error: %s %s - %s", request.method, request.url.path, exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "details": exc.errors()},
    )


# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------

SKIP_LOG_PATHS = {"/health", "/ready", "/favicon.ico"}

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    if request.url.path in SKIP_LOG_PATHS:
        return await call_next(request)

    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = (time.monotonic() - start) * 1000

    log_msg = "%s %s %d %.0fms"
    log_args = (request.method, request.url.path, response.status_code, elapsed_ms)

    if elapsed_ms > 5000:
        logger.warning(log_msg + " [SLOW]", *log_args)
    else:
        logger.info(log_msg, *log_args)

    return response


# ---------------------------------------------------------------------------
# Feature routers
# ---------------------------------------------------------------------------

from app.features.daily_report.router import router as daily_report_router
from app.features.brew.router import router as brew_router
from app.features.stock.router import router as stock_router, legacy_router as stock_legacy_router
from app.features.sector.router import router as sector_router
from app.features.macro.liquidity.router import router as liquidity_router
from app.features.subscription.router import router as subscription_router
from app.features.feedback.router import router as feedback_router
from app.features.macro.risk.router import router as macro_risk_router
from app.features.macro.weekly.router import router as weekly_report_router
from app.features.macro.cache.router import router as macro_cache_router
from app.features.notification.router import router as notification_router
from app.features.payment.router import router as payment_router

app.include_router(daily_report_router)
app.include_router(brew_router)
app.include_router(stock_router)
app.include_router(stock_legacy_router)
app.include_router(sector_router)
app.include_router(liquidity_router)
app.include_router(subscription_router)
app.include_router(feedback_router)
app.include_router(macro_risk_router)
app.include_router(weekly_report_router)
app.include_router(macro_cache_router)
app.include_router(notification_router)
app.include_router(payment_router)


# ---------------------------------------------------------------------------
# Health & readiness
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/ready")
async def readiness():
    checks: dict = {}

    # Insforge connectivity
    try:
        from app.core.database import get_insforge_service
        svc = get_insforge_service()
        client = await svc._get_client()
        checks["insforge"] = "ok" if client and not client.is_closed else "degraded"
    except Exception:
        checks["insforge"] = "error"

    # Required API keys
    checks["google_api_key"] = "ok" if GOOGLE_API_KEY else "missing"
    checks["fmp_api_key"] = "ok" if FMP_API_KEY else "missing"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={"status": "ready" if all_ok else "degraded", "checks": checks},
    )


# ---------------------------------------------------------------------------
# Startup & shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup():
    # Validate required API keys
    if not GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY is not set - AI features will fail")
    if not FMP_API_KEY:
        logger.warning("FMP_API_KEY is not set - financial data features will fail")

    logger.info("Market Analysis API starting up")

    # Pre-warm weekly report cache (non-blocking)
    import asyncio

    async def _warm():
        try:
            from app.features.macro.weekly import db as weekly_db
            from app.features.macro.weekly.router import _cache, _strip_raw_data

            report = await weekly_db.get_latest_report()
            if report:
                _cache["latest"] = _strip_raw_data(report)
                _cache["ts"] = time.monotonic()
                logger.info("Weekly report cache warmed: %s", report.get("week_label"))
            else:
                logger.info("No weekly report to cache")
        except Exception as e:
            logger.warning("Cache warm-up failed (non-fatal): %s", e)

    asyncio.create_task(_warm())


@app.on_event("shutdown")
async def _shutdown():
    logger.info("Market Analysis API shutting down")
    try:
        from app.core.database import get_insforge_service
        await get_insforge_service().close()
        logger.info("Insforge HTTP client closed")
    except Exception as e:
        logger.warning("Error closing Insforge client: %s", e)


@app.get("/")
async def root():
    return {"message": "Market Analysis API is running"}
