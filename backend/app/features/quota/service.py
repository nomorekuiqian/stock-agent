"""
Research quota service.

Rules:
- Users with the Max `ai_research_engine` entitlement: unlimited
- Everyone else (anonymous / free / Pro): 2 questions per day
- Only user-sent messages count (not AI responses)
- Daily reset at midnight UTC

Note: Pro is NOT differentiated from free here — only Max gets unlimited.
See docs/constraints/subscription-model.md ("AI 投研对话 Pro 不差异化").
"""

from app.core.logging import get_logger
from app.features.quota.db import get_usage, increment_usage
from app.utils.timezone import today_str

logger = get_logger(__name__)

DAILY_LIMIT = 2
UNLIMITED_QUOTA_FEATURE = "ai_research_engine"


async def _is_max_user(user_id: str) -> bool:
    """Check if user has Max research access (unlimited quota)."""
    from app.features.payment.db import get_subscription
    from app.features.payment.entitlements import MAX_FEATURES

    sub = await get_subscription(user_id)
    if not sub:
        return False

    if sub.get("is_lifetime"):
        return UNLIMITED_QUOTA_FEATURE in MAX_FEATURES

    entitlements = set(sub.get("entitlements") or [])
    if UNLIMITED_QUOTA_FEATURE in entitlements:
        return True

    # Backward-compatible fallback for older/dev rows where Stripe entitlements
    # have not been synced yet but the Max plan/status fields are present.
    return (
        sub.get("plan") == "max"
        and sub.get("status") == "active"
    )


def _make_identifier(user_id: str | None, client_ip: str | None) -> tuple[str, str]:
    """Return (identifier, identifier_type) for quota tracking."""
    if user_id:
        return user_id, "user"
    return f"ip:{client_ip or 'unknown'}", "ip"


async def check_quota(
    user_id: str | None,
    client_ip: str | None,
) -> dict:
    """
    Check remaining quota without consuming.

    Returns:
        {"allowed": bool, "used": int, "limit": int, "remaining": int, "unlimited": bool}
    """
    if user_id:
        if await _is_max_user(user_id):
            return {"allowed": True, "used": 0, "limit": 0, "remaining": 0, "unlimited": True}

    identifier, _ = _make_identifier(user_id, client_ip)
    date = today_str()
    used = await get_usage(identifier, date)

    remaining = max(0, DAILY_LIMIT - used)
    return {
        "allowed": used < DAILY_LIMIT,
        "used": used,
        "limit": DAILY_LIMIT,
        "remaining": remaining,
        "unlimited": False,
    }


async def consume_quota(
    user_id: str | None,
    client_ip: str | None,
) -> dict:
    """
    Check and consume one unit of quota.

    Returns:
        {"allowed": bool, "used": int, "limit": int, "remaining": int, "unlimited": bool}
    """
    if user_id:
        if await _is_max_user(user_id):
            return {"allowed": True, "used": 0, "limit": 0, "remaining": 0, "unlimited": True}

    identifier, identifier_type = _make_identifier(user_id, client_ip)
    date = today_str()

    # Check first
    used = await get_usage(identifier, date)
    if used >= DAILY_LIMIT:
        return {
            "allowed": False,
            "used": used,
            "limit": DAILY_LIMIT,
            "remaining": 0,
            "unlimited": False,
        }

    # Consume
    new_count = await increment_usage(identifier, identifier_type, date)
    if not isinstance(new_count, int) or new_count < 0:
        # DB error — allow the request (fail open)
        logger.warning("Quota increment failed, allowing request (fail open)")
        return {"allowed": True, "used": used, "limit": DAILY_LIMIT, "remaining": DAILY_LIMIT - used, "unlimited": False}

    remaining = max(0, DAILY_LIMIT - new_count)
    return {
        "allowed": True,
        "used": new_count,
        "limit": DAILY_LIMIT,
        "remaining": remaining,
        "unlimited": False,
    }
