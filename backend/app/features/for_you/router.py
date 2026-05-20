"""
For-You router — Action Bar endpoint.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.for_you.models import ActionBar
from app.features.for_you.service import build_action_bar

logger = get_logger(__name__)

router = APIRouter(prefix="/api/for-you", tags=["for-you"])


@router.get("/action-bar", response_model=ActionBar)
@limiter.limit("30/minute")
async def get_action_bar(
    request: Request,
    user_id: str = Depends(verify_user_token),
):
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
