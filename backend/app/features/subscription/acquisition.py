"""Signup attribution (first/last touch) persistence.

The frontend middleware stores first/last touch in the ``tmb_ft`` / ``tmb_lt``
cookies; the first authenticated ``/subscriptions/sync-user`` call forwards
them here. Each user gets exactly one ``user_acquisition`` row, written by the
internal ``user-acquisition`` edge function (the table has RLS with no
policies; the function writes with the project admin key, which never leaves
Insforge). Later syncs hit the primary key and are reported as not recorded.
Recording is best effort and never raises, so it can't break login sync.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.subscription.models import AcquisitionPayload

logger = get_logger(__name__)

FUNCTION = "user-acquisition"


def _touch_dict(touch: Any) -> dict[str, str]:
    if touch is None:
        return {}
    return {k: v for k, v in touch.model_dump().items() if v}


async def record_user_acquisition(
    user_id: str, payload: Optional[AcquisitionPayload]
) -> bool:
    """Insert the user's attribution row once. Returns True only on first insert."""
    if not EDGE_FUNCTION_SECRET:
        logger.warning("user_acquisition skipped: EDGE_FUNCTION_SECRET is not set")
        return False

    first_touch = _touch_dict(payload.first_touch if payload else None)
    last_touch = _touch_dict(payload.last_touch if payload else None)

    try:
        result = await get_insforge_service().call_function(
            FUNCTION,
            method="POST",
            params={"action": "record"},
            json_body={"user_id": user_id, "first_touch": first_touch, "last_touch": last_touch},
            timeout=10.0,
            extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
        )
    except Exception as exc:  # network errors must not break login sync
        logger.warning("user_acquisition call failed user=%s error=%s", user_id, exc)
        return False

    data = result.get("data") or {}
    if result.get("status_code") == 200 and data.get("success"):
        if data.get("recorded"):
            logger.info(
                "user_acquisition recorded user=%s source=%s",
                user_id,
                first_touch.get("utm_source") or first_touch.get("referrer_host") or "direct",
            )
            return True
        return False

    logger.warning(
        "user_acquisition rejected user=%s status=%s body=%s",
        user_id,
        result.get("status_code"),
        str(result.get("text", ""))[:300],
    )
    return False
