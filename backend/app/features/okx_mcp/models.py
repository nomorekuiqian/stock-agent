"""Schemas for the OKX Context MCP adapter."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


LensType = Literal["core", "framework", "macro", "sector", "ticker"]
StockDataSection = Literal[
    "quote",
    "profile",
    "fundamentals",
    "forward_valuation",
    "historical_valuation",
    "technical",
    "news",
    "earnings_calendar",
    "price_history",
    "earnings_data",
    "transcript",
    "insider_trading",
    "press_releases",
    "market_overview",
]
MarketDataSection = Literal[
    "market_overview",
    "macro_brief",
    "macro_risk",
    "liquidity",
    "sentiment",
    "economic_calendar",
    "earnings_calendar",
    "morning_report",
    "weekly_report",
    "twitter_digest",
]


class OkxDiscoveryResponse(BaseModel):
    """Capability payload returned by the public discovery endpoint."""

    ok: bool = True
    tool: str = "themarketbrew_discovery"
    mode: str = "okx_context_mcp"
    data: dict[str, Any] = Field(default_factory=dict)


class OkxPersonaContextRequest(BaseModel):
    """Request for persona methodology and historical-evidence context."""

    question: str = Field(..., min_length=1, max_length=2000)
    persona: str | None = Field(
        default=None,
        max_length=80,
        description="Optional persona username. If absent, backend selects by lens coverage.",
    )
    ticker: str | None = Field(default=None, max_length=20)
    tickers: list[str] = Field(default_factory=list, max_length=8)
    sector: str | None = Field(default=None, max_length=120)
    lens_types: list[LensType] = Field(default_factory=list, max_length=5)
    lens_limit: int = Field(default=6, ge=1, le=12)
    evidence_limit: int = Field(default=6, ge=0, le=12)
    include_lens_body: bool = True
    include_evidence_map: bool = True
    include_vector_evidence: bool = True
    language: Literal["zh", "en", "auto"] = "auto"


class OkxMarketDataRequest(BaseModel):
    """Single aggregated market/data tool request."""

    data_type: Literal["catalog", "brief", "stock", "market", "news"] = "catalog"
    symbol: str | None = Field(default=None, max_length=20)
    symbols: list[str] = Field(default_factory=list, max_length=10)
    brief_type: Literal["stock", "peer", "macro", "industry"] = "stock"
    stock_sections: list[StockDataSection] = Field(default_factory=list, max_length=8)
    market_sections: list[MarketDataSection] = Field(default_factory=list, max_length=8)
    news_scope: Literal[
        "stock",
        "market",
        "press_releases",
        "twitter_digest",
        "morning_report",
        "all",
    ] = "all"
    days: int = Field(default=7, ge=1, le=30)
    history_days: int = Field(default=365, ge=5, le=1825)
    year: int | None = None
    quarter: int | None = Field(default=None, ge=1, le=4)
    limit: int = Field(default=30, ge=1, le=100)


class OkxEnvelopeResponse(BaseModel):
    """Generic OKX MCP response envelope."""

    ok: bool = True
    tool: str
    request: dict[str, Any] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    freshness: dict[str, Any] = Field(default_factory=dict)
    safety: dict[str, Any] = Field(default_factory=dict)

