"""Shared entitlement accessors.

Feature modules should depend on this shared boundary instead of importing the
payment feature directly.
"""

from __future__ import annotations

from typing import Any

from app.features.payment import db as payment_db
from app.features.payment.entitlements import has_entitlement


async def has_feature_entitlement(user_id: str, feature: str) -> bool:
    """Return whether a user currently has the requested feature entitlement."""
    return await has_entitlement(user_id, feature)


async def list_users_with_entitlement(feature: str) -> list[dict[str, Any]]:
    """Return rows for users with the requested entitlement feature."""
    return await payment_db.list_entitled_users(feature)
