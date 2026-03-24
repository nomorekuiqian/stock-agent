"""
Invite code database operations via Insforge Edge Functions.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from app.core.database import get_insforge_service
from app.features.payment.db import upsert_subscription


async def redeem_code(
    user_id: str,
    code: str,
    valid_codes: list[str],
    access_days: int = 14,
) -> Dict[str, Any]:
    """
    Validate and redeem a universal invite code for a user.

    Returns a dict with success, access_expires_at, error.
    """
    code_upper = code.strip().upper()
    is_valid = code_upper in [c.strip().upper() for c in valid_codes]

    if not is_valid:
        return {"success": False, "error": "invalid_code"}

    access_expires_at = (
        datetime.now(timezone.utc) + timedelta(days=access_days)
    ).isoformat()

    await upsert_subscription(
        user_id=user_id,
        plan="pro",
        status="active",
        invite_code=code_upper,
        access_expires_at=access_expires_at,
    )

    return {
        "success": True,
        "access_expires_at": access_expires_at,
    }


async def save_qualify_response(
    background: str,
    markets: list[str],
    trading_style: list[str],
    pain_points: list[str],
    feedback: str,
    email: str,
) -> bool:
    """Store questionnaire response in access_requests table."""
    service = get_insforge_service()
    result = await service.call_function(
        "access-requests",
        method="POST",
        params={"action": "insert"},
        json_body={
            "background": background,
            "markets": markets or [],
            "trading_style": trading_style or [],
            "pain_points": pain_points or [],
            "feedback": feedback or None,
            "email": email or None,
        },
    )
    data = result.get("data", {})
    return bool(data.get("success"))
