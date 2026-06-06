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

from app.core.config import (
    ALLOWED_ORIGINS,
    CORS_ALLOWED_ORIGIN_REGEX,
    GOOGLE_API_KEY,
    FMP_API_KEY,
)
from app.core.logging import setup_logging, get_logger
from app.core.rate_limit import limiter

# --- Logging ---
setup_logging()
logger = get_logger(__name__)

# --- Email safety guard (blocks non-test emails in dev) ---
from app.core.email_guard import install as install_email_guard
install_email_guard()

# --- Frank Lens MCP (Streamable HTTP sub-app, mounted at /frank/mcp/) ---
from contextlib import asynccontextmanager

from app.frank_mcp.server import mcp as frank_mcp

frank_mcp_app = frank_mcp.http_app(path="/mcp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The FastMCP session manager must run for the mounted MCP endpoint. The app's
    # existing startup/shutdown logic runs inside this lifespan, because FastAPI
    # ignores @app.on_event handlers once a lifespan is provided.
    async with frank_mcp_app.lifespan(app):
        await _startup()
        try:
            yield
        finally:
            await _shutdown()


# --- App ---
app = FastAPI(title="Market Analysis API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
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

    # Track authenticated API calls
    from app.core.activity import track_api_call, SKIP_PATHS as ACTIVITY_SKIP
    if request.url.path not in ACTIVITY_SKIP:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
            from app.core.deps import _token_cache
            cached = _token_cache.get(token)
            if cached:
                track_api_call(cached[0], request.url.path, request.method, response.status_code)

    return response


# ---------------------------------------------------------------------------
# Feature routers
# ---------------------------------------------------------------------------

from app.features.daily_report.router import router as daily_report_router
from app.features.brew.router import router as brew_router
from app.features.stock.router import router as stock_router, legacy_router as stock_legacy_router
from app.features.macro.liquidity.router import router as liquidity_router
from app.features.subscription.router import router as subscription_router
from app.features.feedback.router import router as feedback_router
from app.features.macro.risk.router import router as macro_risk_router
from app.features.macro.weekly.router import router as weekly_report_router
from app.features.macro.cache.router import router as macro_cache_router
from app.features.notification.router import router as notification_router
from app.features.morning_report.router import router as morning_report_router
from app.features.payment.router import router as payment_router
from app.features.invites.router import router as invites_router
from app.features.screener.router import router as screener_router
from app.features.screener.router import research_router
from app.features.kol_research.router import router as kol_research_router
from app.features.research_kb.router import router as research_kb_router
from app.features.wechat.router import router as wechat_router
from app.features.admin.router import router as admin_router
from app.features.admin.crm_router import router as crm_router
from app.features.twitter.router import router as twitter_router
from app.features.twitter_digest.router import router as twitter_digest_router
from app.features.vector.router import router as vector_router
from app.features.portfolio.router import router as portfolio_router
from app.features.holdings_sync.router import router as holdings_sync_router
from app.features.for_you.router import router as for_you_router
from app.features.portfolio_health.router import router as portfolio_health_router
from app.features.memory.router import router as memory_router
from app.features.flags.router import router as flags_router
from app.features.flags.admin_router import router as flags_admin_router
from app.features.onboarding.router import router as onboarding_router
from app.features.agent_runtime.router import router as agent_runtime_router

app.include_router(daily_report_router)
app.include_router(brew_router)
app.include_router(stock_router)
app.include_router(stock_legacy_router)
app.include_router(liquidity_router)
app.include_router(subscription_router)
app.include_router(feedback_router)
app.include_router(macro_risk_router)
app.include_router(weekly_report_router)
app.include_router(macro_cache_router)
app.include_router(notification_router)
app.include_router(payment_router)
app.include_router(invites_router)
app.include_router(morning_report_router)
app.include_router(agent_runtime_router)
app.include_router(screener_router)
app.include_router(research_router)
app.include_router(kol_research_router)
app.include_router(research_kb_router)
app.include_router(wechat_router)
app.include_router(admin_router)
app.include_router(crm_router)
app.include_router(twitter_router)
app.include_router(twitter_digest_router)
app.include_router(vector_router)
app.include_router(portfolio_router)
app.include_router(holdings_sync_router)
app.include_router(for_you_router)
app.include_router(portfolio_health_router)
app.include_router(memory_router)
app.include_router(flags_router)
app.include_router(flags_admin_router)
app.include_router(onboarding_router)


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

async def _startup():
    # Validate required API keys
    if not GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY is not set - AI features will fail")
    if not FMP_API_KEY:
        logger.warning("FMP_API_KEY is not set - financial data features will fail")

    logger.info("Market Analysis API starting up")

    import asyncio

    # Start activity flush loop
    from app.core.activity import start_flush_loop
    asyncio.create_task(start_flush_loop())

    # Pre-warm weekly report cache (non-blocking)

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

    # Pre-warm KOL cockpit index so first visit doesn't pay the cold-cache cost
    # (Insforge edge-function paginated fetch of all tweets, ~1-2s warm).
    async def _warm_kol():
        try:
            from app.features.kol_research import cockpit as kol_cockpit
            await kol_cockpit.get_index("qinbafrank")
            logger.info("KOL cockpit cache warmed: qinbafrank")
        except Exception as e:  # noqa: BLE001
            logger.warning("KOL cache warm-up failed (non-fatal): %s", e)

    asyncio.create_task(_warm_kol())


async def _shutdown():
    logger.info("Market Analysis API shutting down")
    # Flush remaining activity events
    try:
        from app.core.activity import flush as flush_activities
        await flush_activities()
    except Exception as e:
        logger.warning("Error flushing activities: %s", e)
    try:
        from app.core.database import get_insforge_service
        await get_insforge_service().close()
        logger.info("Insforge HTTP client closed")
    except Exception as e:
        logger.warning("Error closing Insforge client: %s", e)


@app.get("/")
async def root():
    return {"message": "Market Analysis API is running"}


# --- Mount Frank Lens MCP (Streamable HTTP) at /frank/mcp/ ---
app.mount("/frank", frank_mcp_app)
