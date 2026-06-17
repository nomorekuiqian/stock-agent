"""Shared cached ticker-discussion helpers."""

from __future__ import annotations

from typing import Any

from app.features.twitter import db as twitter_db
from app.features.twitter.discussion_summary_agent import (
    generate_chinese_discussion_summary,
)


def normalize_ticker_symbol(symbol: str) -> str:
    """Normalize a ticker symbol for discussion lookup."""
    return twitter_db.normalize_ticker_symbol(symbol)


def is_valid_ticker_symbol(symbol: str) -> bool:
    """Return whether a ticker symbol is valid for discussion lookup."""
    return twitter_db.is_valid_ticker_symbol(symbol)


async def list_ticker_discussion(
    symbol: str,
    *,
    hours: int,
    limit: int,
) -> list[dict[str, Any]]:
    """Return cached KOL discussion rows for one ticker."""
    return await twitter_db.list_ticker_discussion(symbol, hours=hours, limit=limit)


def build_ticker_discussion_summary(
    symbol: str,
    tweets: list[dict[str, Any]],
    *,
    hours: int,
) -> dict[str, Any]:
    """Build the deterministic grouped discussion summary for one ticker."""
    return twitter_db.build_ticker_discussion_summary(symbol, tweets, hours=hours)
