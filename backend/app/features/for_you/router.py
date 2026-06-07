"""
For-You router — Action Bar endpoint.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.payment.entitlements import has_entitlement
from app.features.for_you.models import ActionBar
from app.features.for_you.service import build_action_bar

logger = get_logger(__name__)

router = APIRouter(prefix="/api/for-you", tags=["for-you"])
_FOR_YOU_FEATURE = "for_you_website"


async def _require_for_you_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _FOR_YOU_FEATURE):
        raise HTTPException(status_code=403, detail="For You requires an active entitlement")


@router.get("/action-bar", response_model=ActionBar)
@limiter.limit("30/minute")
async def get_action_bar(
    request: Request,
    user_id: str = Depends(verify_user_token),
):
    await _require_for_you_entitlement(user_id)
    try:
        bar = await build_action_bar(user_id)
        return bar
    except Exception:
        logger.exception("action_bar failed user=%s", user_id[:8])
        # Graceful degradation: return green empty bar
        return ActionBar(
            severity="green",
            headline="",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
