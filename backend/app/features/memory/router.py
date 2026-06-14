"""
Memory router — feedback + suggestion tracking endpoints.

POST /api/feedback              Record runtime assistant thumbs-up/thumbs-down
GET  /api/suggestion-tracking/recent   Get recent suggestion tracking rows
"""

from fastapi import APIRouter, Depends, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.memory import db as memory_db
from app.features.memory.models import FeedbackInput
import app.core.posthog_client as posthog

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["memory"])


@router.post("/feedback")
@limiter.limit("60/minute")
async def post_feedback(
    request: Request,
    body: FeedbackInput,
    user_id: str = Depends(verify_user_token),
):
    """Record user feedback on runtime assistant content."""
    if (
        body.target_type == "research_agent_answer"
        and body.agent_id
        and body.session_id
        and (body.message_event_id or body.client_event_id or body.turn_id)
    ):
        from app.shared.agent_runtime_feedback import update_agent_message_feedback

        feedback_payload = dict(body.snapshot or {})
        feedback_payload["target_id"] = body.target_id
        updated_event = await update_agent_message_feedback(
            user_id=user_id,
            agent_id=body.agent_id,
            session_id=body.session_id,
            message_event_id=body.message_event_id,
            client_event_id=body.client_event_id,
            turn_id=body.turn_id,
            sentiment=body.sentiment,
            reason=body.reason,
            feedback_payload=feedback_payload,
        )
        if updated_event:
            if posthog.posthog_client:
                posthog.posthog_client.capture(
                    distinct_id=user_id,
                    event="ai_content_feedback_submitted",
                    properties={
                        "target_type": body.target_type,
                        "sentiment": body.sentiment,
                        "storage": "agent_session_events",
                    },
                )
            return {"success": True, "id": updated_event.get("id")}

        logger.info("agent message feedback update returned None")
        return {"success": True, "id": None}

    logger.info(
        "ignored non-runtime feedback target_type=%s has_agent_id=%s has_session_id=%s",
        body.target_type,
        bool(body.agent_id),
        bool(body.session_id),
    )
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
