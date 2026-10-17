"""Signup attribution (first/last touch) persistence.

The frontend middleware stores first/last touch in the ``tmb_ft`` / ``tmb_lt``
cookies; the first authenticated ``/subscriptions/sync-user`` call forwards
them here. Each user gets exactly one ``user_acquisition`` row: later syncs hit
the primary key and are ignored. Recording is best effort and never raises, so
it can't break login sync.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.config import INSFORGE_ANON_KEY, INSFORGE_SERVICE_KEY
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.subscription.models import AcquisitionPayload

logger = get_logger(__name__)

TABLE = "user_acquisition"


def _touch_dict(touch: Any) -> dict[str, str]:
    if touch is None:
        return {}
    return {k: v for k, v in touch.model_dump().items() if v}


async def record_user_acquisition(
    user_id: str, payload: Optional[AcquisitionPayload]
) -> bool:
    """Insert the user's attribution row once. Returns True only on first insert."""
    if not INSFORGE_SERVICE_KEY:
        logger.warning("user_acquisition skipped: INSFORGE_SERVICE_KEY is not set")
        return False

    first_touch = _touch_dict(payload.first_touch if payload else None)
    last_touch = _touch_dict(payload.last_touch if payload else None)

    db = get_insforge_service()
    headers = {"Authorization": f"Bearer {INSFORGE_SERVICE_KEY}"}
    if INSFORGE_ANON_KEY:
        headers["apikey"] = INSFORGE_ANON_KEY

    try:
        client = await db._get_client()  # noqa: SLF001 - shared low-level HTTP client
        response = await client.post(
            f"{db.base_url}/api/database/records/{TABLE}",
            json=[{"user_id": user_id, "first_touch": first_touch, "last_touch": last_touch}],
            headers=headers,
            timeout=10.0,
        )
    except Exception as exc:  # network errors must not break login sync
        logger.warning("user_acquisition insert failed user=%s error=%s", user_id, exc)
        return False

    if response.status_code in (200, 201):
        logger.info(
            "user_acquisition recorded user=%s source=%s",
            user_id,
            first_touch.get("utm_source") or first_touch.get("referrer_host") or "direct",
        )
        return True

    if response.status_code == 409 or "duplicate key" in response.text:
        return False

    logger.warning(
        "user_acquisition insert rejected user=%s status=%s body=%s",
        user_id,
        response.status_code,
        response.text[:300],
    )
    return False
