"""
Access-request form storage. Trial / invite code creation is removed
during the freemium transition.
"""

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)


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
