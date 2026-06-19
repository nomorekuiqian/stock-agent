"""HTTP routes for the OKX Context MCP adapter."""

from __future__ import annotations

from fastapi import APIRouter

from app.features.okx_mcp.models import (
    OkxDiscoveryResponse,
    OkxEnvelopeResponse,
    OkxMarketDataRequest,
    OkxPersonaContextRequest,
)
from app.features.okx_mcp import service

router = APIRouter(prefix="/api/okx-mcp", tags=["OKX Context MCP"])


@router.get("/discovery", response_model=OkxDiscoveryResponse)
async def okx_discovery():
    """Discover OKX-facing context tools, personas, data sections, and routing."""
    return await service.discovery_payload()


@router.post("/persona-context", response_model=OkxEnvelopeResponse)
async def okx_persona_context(req: OkxPersonaContextRequest):
    """Return persona methodology and historical-evidence context only."""
    return await service.persona_context(req)


@router.post("/market-data", response_model=OkxEnvelopeResponse)
async def okx_market_data(req: OkxMarketDataRequest):
    """Return current market, stock, macro, calendar, report, or news data."""
    return await service.market_data(req)

