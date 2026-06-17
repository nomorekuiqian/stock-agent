"""Shared user watchlist accessors."""

from __future__ import annotations

from typing import Any

from app.features.brew.db import get_user_watchlist as _get_user_watchlist


async def get_user_watchlist(user_id: str) -> dict[str, Any] | None:
    """Return a user's watchlist payload, or None when the upstream read fails."""
    return await _get_user_watchlist(user_id)
