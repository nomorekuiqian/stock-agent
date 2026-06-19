"""Isolated FastAPI entry point for the OKX Context MCP service."""

from __future__ import annotations

import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from app.core.config import ALLOWED_ORIGINS, CORS_ALLOWED_ORIGIN_REGEX, FMP_API_KEY
from app.core.logging import get_logger, setup_logging
from app.features.okx_mcp.payment import install_okx_payment_middleware, payment_status
from app.features.okx_mcp.router import router as okx_mcp_router

setup_logging()
logger = get_logger(__name__)

app = FastAPI(
    title="TheMarketBrew OKX Context MCP API",
    description=(
        "OKX-facing context/data service. It exposes paid context packs and data "
        "without changing the production TheMarketBrew app entry point."
    ),
    version="0.1.0",
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(okx_mcp_router)
install_okx_payment_middleware(app)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled OKX MCP exception: %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "OKX MCP validation error: %s %s - %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "details": exc.errors()},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/ready")
async def readiness():
    checks = {
        "fmp_api_key": "ok" if FMP_API_KEY else "missing",
        "okx_payment": payment_status(),
    }
    return {
        "status": "ready" if FMP_API_KEY else "degraded",
        "checks": checks,
    }


@app.get("/")
async def root():
    return {
        "message": "TheMarketBrew OKX Context MCP API is running",
        "discovery": "/api/okx-mcp/discovery",
    }

