"""Resend webhook ingestion."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

from app.core.config import EDGE_FUNCTION_SECRET, RESEND_WEBHOOK_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _first(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _extract_email(value: Any) -> str | None:
    item = _first(value)
    if isinstance(item, dict):
        return item.get("email") or item.get("address")
    if isinstance(item, str):
        return item
    return None


def infer_resend_channel(data: dict[str, Any]) -> str:
    """Return the explicit Resend channel tag, or unknown.

    Channel attribution should come from send-time tags only. Subject/from
    heuristics are intentionally avoided because copy changes can silently
    misclassify engagement metrics.
    """
    tags = data.get("tags")
    if isinstance(tags, list):
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            name = str(tag.get("name") or "").lower()
            if name in {"channel", "email_channel"} and tag.get("value"):
                return str(tag["value"])
    return "unknown"


def shape_resend_event(event: dict[str, Any], svix_id: str) -> dict[str, Any]:
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    return {
        "svix_id": svix_id,
        "event_type": event.get("type") or "",
        "event_created_at": event.get("created_at"),
        "email_id": data.get("email_id") or data.get("id"),
        "broadcast_id": data.get("broadcast_id"),
        "recipient_email": _extract_email(data.get("to")),
        "subject": data.get("subject"),
        "channel": infer_resend_channel(data),
        "raw_payload": event,
    }


@router.post("/resend")
async def resend_webhook(request: Request):
    """Verify and store Resend webhook events for email engagement metrics."""
    if not RESEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="RESEND_WEBHOOK_SECRET not configured")

    payload = await request.body()
    svix_id = request.headers.get("svix-id") or ""
    headers = {
        "svix-id": svix_id,
        "svix-timestamp": request.headers.get("svix-timestamp") or "",
        "svix-signature": request.headers.get("svix-signature") or "",
    }

    try:
        event = Webhook(RESEND_WEBHOOK_SECRET).verify(payload, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = str(event.get("type") or "")
    if not event_type.startswith("email."):
        logger.info("Ignoring non-email Resend event: %s", event_type)
        return {"success": True, "ignored": True}

    row = shape_resend_event(event, svix_id)
    result = await get_insforge_service().call_function(
        "email-events",
        method="POST",
        params={"action": "insert"},
        json_body=row,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
        timeout=15.0,
    )

    data = result.get("data", {})
    if result.get("status_code") not in (200, 201) or not data.get("success"):
        logger.error("Resend webhook storage failed: status=%s data=%s", result.get("status_code"), data)
        raise HTTPException(status_code=502, detail="Failed to store Resend webhook")

    return {
        "success": True,
        "event_type": row["event_type"],
        "inserted": data.get("inserted", 0),
        "duplicate": data.get("duplicate", False),
    }
