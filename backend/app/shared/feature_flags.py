"""Shared feature-flag accessors."""

from __future__ import annotations

from typing import Any

from app.features.flags import db as flags_db


async def list_feature_flag_assignments(flag: str) -> list[dict[str, Any]]:
    """Return all user assignments for one feature flag."""
    return await flags_db.list_all_assignments(flag=flag)
