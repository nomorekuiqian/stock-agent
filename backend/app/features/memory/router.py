"""
Memory router — feedback + suggestion tracking endpoints.

POST /api/feedback              Record user thumbs-up/thumbs-down
GET  /api/suggestion-tracking/recent   Get recent suggestion tracking rows
"""

from fastapi import APIRouter, Depends, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.memory import db as memory_db
from app.features.memory.models import FeedbackInput

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["memory"])


@router.post("/feedback")
@limiter.limit("60/minute")
async def post_feedback(
    request: Request,
    body: FeedbackInput,
    user_id: str = Depends(verify_user_token),
):
    """Record user feedback on AI-generated content."""
    feedback_data = {
        "target_type": body.target_type,
        "target_id": body.target_id,
        "sentiment": body.sentiment,
        "reason": body.reason,
        "snapshot": body.snapshot,
    }
    feedback_id = await memory_db.save_feedback(user_id, feedback_data)
    if feedback_id:
        return {"success": True, "id": feedback_id}

    # DB might not be deployed yet — accept silently
    logger.info("feedback save returned None (EF may not be deployed)")
    return {"success": True, "id": None}


@router.get("/suggestion-tracking/recent")
async def get_recent_suggestions(
    user_id: str = Depends(verify_user_token),
):
    """Get recent suggestion tracking rows (pending + completed)."""
    rows = await memory_db.get_pending_and_recent(user_id, days=30)
    return {
        "success": True,
        "data": [r.model_dump() for r in rows],
    }
