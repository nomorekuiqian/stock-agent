"""
Portfolio models - Pydantic models for portfolio + profile endpoints.

LLD: docs/plans/for-you/p0-foundation.md §LLD U0-A.
"""

import re
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Portfolio rows
# =============================================================================


_SYMBOL_RE = re.compile(r"^[\$A-Z0-9.\-]{1,16}$")


class HoldingInput(BaseModel):
    """One row in a bulk save / single patch request."""

    symbol: str = Field(..., min_length=1, max_length=16)
    weight_pct: Optional[float] = Field(None, ge=0, le=100)
    shares: Optional[float] = Field(None, ge=0)
    cost_basis: Optional[float] = Field(None, ge=0)
    entry_price: Optional[float] = Field(None, ge=0)

    # P1 memory fields (kept here for forward compat, frontend may omit)
    thesis: Optional[str] = Field(None, max_length=140)
    target: Optional[float] = Field(None, ge=0)
    stop_loss: Optional[float] = Field(None, ge=0)
    conviction: Optional[int] = Field(None, ge=1, le=5)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("symbol must not be empty")
        # Lock the character set so the symbol is safe to interpolate downstream
        # (e.g. PostgREST .not.in.("X","Y") in the bulk Edge Function).
        if not _SYMBOL_RE.match(v):
            raise ValueError("symbol must match [$A-Z0-9.-] and be 1-16 chars")
        return v


class HoldingRow(BaseModel):
    """A row as returned by the database (no effective_weight applied)."""

    id: Optional[str] = None
    user_id: str
    symbol: str
    weight_pct: Optional[float] = None
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    thesis: Optional[str] = None
    target: Optional[float] = None
    stop_loss: Optional[float] = None
    conviction: Optional[int] = None
    entry_price: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class HoldingView(BaseModel):
    """Portfolio row enriched with derived effective_weight_pct (0-100)."""

    symbol: str
    weight_pct: Optional[float] = None
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    thesis: Optional[str] = None
    target: Optional[float] = None
    stop_loss: Optional[float] = None
    conviction: Optional[int] = None
    entry_price: Optional[float] = None
    market_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    # Current live price (last batch quote at fetch time). Exposed so the UI
    # can render "shares × price = value" without divide-by-zero / fractional-
    # shares precision loss from reconstructing it client-side. $CASH stays
    # None — cash has no quote.
    price: Optional[float] = None

    effective_weight_pct: float
    weight_source: Literal["shares_x_price", "cost_basis", "weight_pct", "equal", "ghost"]


class BulkPortfolioRequest(BaseModel):
    rows: List[HoldingInput] = Field(default_factory=list, max_length=30)


class PortfolioListResponse(BaseModel):
    holdings: List[HoldingView]
    total_weight_pct: float  # always 100.0 after normalization (sanity)


class TouchResponse(BaseModel):
    confirmed_at: datetime


# =============================================================================
# Profile
# =============================================================================


Style = Literal["passive", "balanced", "active"]
Horizon = Literal["short", "mid", "long"]
RiskTolerance = Literal["low", "moderate", "high"]
NotifyMode = Literal["silent", "events_only", "daily"]


class ProfileInput(BaseModel):
    """Profile fields that can be updated. All optional."""

    style: Optional[Style] = None
    horizon: Optional[Horizon] = None
    risk_tolerance: Optional[RiskTolerance] = None
    notify_mode: Optional[NotifyMode] = None


class ProfileView(BaseModel):
    """Profile as exposed to caller. Defaults applied when row absent."""

    user_id: str
    style: Style = "passive"
    horizon: Horizon = "long"
    risk_tolerance: RiskTolerance = "moderate"
    notify_mode: NotifyMode = "events_only"
    version: int = 1
    onboarded_at: Optional[datetime] = None
    portfolio_confirmed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
