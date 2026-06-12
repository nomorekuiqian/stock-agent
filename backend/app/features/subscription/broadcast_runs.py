"""Production idempotency for scheduled email broadcasts."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str

logger = get_logger(__name__)

_FUNCTION_NAME = "email-broadcast-runs"


async def acquire_broadcast_run(
    channel: str,
    broadcast_date: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lock_token = str(uuid.uuid4())
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "acquire"},
        json_body={
            "channel": channel,
            "broadcast_date": broadcast_date or today_str(),
            "lock_token": lock_token,
            "details": details or {},
        },
        timeout=10.0,
    )

    data = result.get("data") or {}
    if result.get("status_code") != 200 or not data.get("success"):
        logger.warning(
            "Email broadcast lock acquire failed for %s: %s %s",
            channel,
            result.get("status_code"),
            result.get("text"),
        )
        return {"acquired": True, "lock_token": lock_token, "lock_unavailable": True}

    data["lock_token"] = lock_token
    return data


async def complete_broadcast_run(
    channel: str,
    lock_token: str,
    broadcast_date: str | None = None,
    *,
    status: str = "completed",
    broadcast_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "complete"},
        json_body={
            "channel": channel,
            "broadcast_date": broadcast_date or today_str(),
            "lock_token": lock_token,
            "status": status,
            "broadcast_id": broadcast_id,
            "details": details or {},
        },
        timeout=10.0,
    )
    if result.get("status_code") != 200:
        logger.warning(
            "Email broadcast lock complete failed for %s: %s %s",
            channel,
            result.get("status_code"),
            result.get("text"),
        )
