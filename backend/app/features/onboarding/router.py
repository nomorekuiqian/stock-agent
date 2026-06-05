"""Onboarding state API: whether the user finished the in-app onboarding gate."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.features.payment.db import get_subscription, upsert_subscription

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["user"])


@router.get("/user/onboarding-status")
async def get_onboarding_status(user_id: str = Depends(verify_user_token)):
    """Whether the user has completed onboarding (Step 1/2/3 done)."""
    sub = await get_subscription(user_id)
    completed = bool(sub and sub.get("onboarding_completed_at"))
    return {"completed": completed}


@router.post("/user/onboarding/complete")
async def complete_onboarding(user_id: str = Depends(verify_user_token)):
    """Mark onboarding as complete (idempotent — sets timestamp once)."""
    sub = await get_subscription(user_id)
    if sub and sub.get("onboarding_completed_at"):
        return {"completed": True, "completed_at": sub["onboarding_completed_at"]}

    now = datetime.now(timezone.utc).isoformat()
    ok = await upsert_subscription(
        user_id=user_id,
        onboarding_completed_at=now,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="failed_to_mark_complete")
    logger.info("Onboarding completed: user=%s", user_id[:8])
    return {"completed": True, "completed_at": now}
