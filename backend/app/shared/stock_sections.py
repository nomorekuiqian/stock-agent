"""Shared stock data section helpers.

These wrappers expose stock feature data to other features without creating
feature-to-feature imports at call sites.
"""

from __future__ import annotations

from typing import Any

from app.features.stock.service import get_stock_service


async def get_stock_earnings_data(symbol: str) -> dict[str, Any]:
    """Return the aggregated earnings-data payload used by stock views."""
    return await get_stock_service().get_earnings_data(symbol)


async def get_stock_transcript(symbol: str, year: int, quarter: int) -> dict[str, Any]:
    """Return one earnings-call transcript payload."""
    return await get_stock_service().get_transcript(symbol, year, quarter)
