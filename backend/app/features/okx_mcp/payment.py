"""Optional OKX x402 payment middleware for the isolated OKX MCP app."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from app.core import config
from app.core.logging import get_logger

logger = get_logger(__name__)

PAID_ROUTES = {
    "POST /api/okx-mcp/persona-context": {
        "price": config.OKX_MCP_PERSONA_CONTEXT_PRICE,
        "description": "TheMarketBrew persona methodology and historical evidence context pack.",
    },
    "POST /api/okx-mcp/market-data": {
        "price": config.OKX_MCP_MARKET_DATA_PRICE,
        "description": "TheMarketBrew stock, macro, calendar, report, and news data envelope.",
    },
}


def payment_status() -> dict[str, Any]:
    return {
        "enabled": config.OKX_MCP_PAYMENT_ENABLED,
        "mode": config.OKX_MCP_PAYMENT_MODE,
        "network": config.OKX_MCP_NETWORK,
        "pay_to_configured": bool(config.OKX_MCP_PAY_TO_ADDRESS),
        "okx_api_configured": all(
            [
                config.OKX_API_KEY,
                config.OKX_SECRET_KEY,
                config.OKX_PASSPHRASE,
            ]
        ),
        "paid_routes": PAID_ROUTES,
    }


def install_okx_payment_middleware(app: FastAPI) -> None:
    """Install OKX's SDK middleware when explicitly enabled.

    The SDK import is intentionally lazy so normal backend tests and the
    production web app do not require the OKX package or credentials.
    """
    if not config.OKX_MCP_PAYMENT_ENABLED:
        logger.info("OKX MCP payment middleware disabled")
        return
    if config.OKX_MCP_PAYMENT_MODE != "sdk":
        logger.info("OKX MCP payment mode=%s expects external proxy", config.OKX_MCP_PAYMENT_MODE)
        return
    if not config.OKX_MCP_PAY_TO_ADDRESS:
        raise RuntimeError("OKX_MCP_PAY_TO_ADDRESS or PAYMENT_RECIPIENT is required when OKX payment is enabled")
    missing = [
        name
        for name, value in {
            "OKX_API_KEY": config.OKX_API_KEY,
            "OKX_SECRET_KEY": config.OKX_SECRET_KEY,
            "OKX_PASSPHRASE": config.OKX_PASSPHRASE,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError("Missing OKX Web3 API credentials: %s" % ", ".join(missing))

    try:
        from x402.http import (  # type: ignore[import-not-found]
            OKXAuthConfig,
            OKXFacilitatorClient,
            OKXFacilitatorConfig,
            PaymentOption,
        )
        from x402.http.middleware.fastapi import PaymentMiddlewareASGI  # type: ignore[import-not-found]
        from x402.http.types import RouteConfig  # type: ignore[import-not-found]
        from x402.mechanisms.evm.exact.server import ExactEvmScheme  # type: ignore[import-not-found]
        from x402.server import x402ResourceServer  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "OKX x402 SDK is required when OKX_MCP_PAYMENT_ENABLED=true. "
            "Install backend requirements including okxweb3-app-x402."
        ) from exc

    facilitator = OKXFacilitatorClient(
        OKXFacilitatorConfig(
            auth=OKXAuthConfig(
                api_key=config.OKX_API_KEY,
                secret_key=config.OKX_SECRET_KEY,
                passphrase=config.OKX_PASSPHRASE,
            ),
            base_url=config.OKX_BASE_URL,
            sync_settle=True,
        )
    )
    server = x402ResourceServer(facilitator)
    server.register(config.OKX_MCP_NETWORK, ExactEvmScheme())

    routes = {
        route: RouteConfig(
            accepts=[
                PaymentOption(
                    scheme="exact",
                    price=meta["price"],
                    network=config.OKX_MCP_NETWORK,
                    pay_to=config.OKX_MCP_PAY_TO_ADDRESS,
                    max_timeout_seconds=config.OKX_MCP_MAX_TIMEOUT_SECONDS,
                )
            ],
            description=meta["description"],
            mime_type="application/json",
        )
        for route, meta in PAID_ROUTES.items()
    }
    app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
    logger.info("OKX MCP payment middleware enabled for %d routes", len(routes))

