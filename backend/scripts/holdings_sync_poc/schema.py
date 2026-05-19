"""PoC schema — mirrors design §3.1 VisionExtractionOutput / RawExtractedHolding.

Intentionally NO P1 fields (thesis/target/stop_loss/conviction): a source
adapter structurally cannot carry them (design's #1 correctness decision).
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class RawExtractedHolding(BaseModel):
    symbol_or_name: str = Field(description="Ticker, abbreviation, or full company name exactly as shown")
    shares: float | None = Field(default=None, description="Quantity of shares/units if shown")
    cost_basis: float | None = Field(default=None, description="Total cost basis if shown")
    entry_price: float | None = Field(default=None, description="Average/entry price per share if shown")
    weight_pct: float | None = Field(default=None, description="Percent of portfolio if shown (0-100)")


class VisionExtractionOutput(BaseModel):
    looks_like_holdings: bool = Field(description="True only if the image is a real brokerage holdings/portfolio list")
    holdings: list[RawExtractedHolding] = Field(default_factory=list, max_length=60)
