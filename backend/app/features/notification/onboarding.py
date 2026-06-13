"""
Legacy onboarding drip campaign.

The Day 3/7/14 onboarding email sequence has been removed. The legacy cron
endpoint still imports this module so existing Insforge schedules can return a
clear no-op response instead of sending mail.
"""

from datetime import datetime, timezone
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

ONBOARDING_DRIP_DISABLED_REASON = "onboarding_drip_emails_removed"

# Kept empty for callers/tests that inspect the legacy schedule contract.
DRIP_SCHEDULE: dict[int, int] = {}
_TEMPLATE_MAP: dict[int, object] = {}


def _days_since(iso_ts: str) -> Optional[int]:
    """Return whole UTC days since an ISO timestamp."""
    if not iso_ts:
        return None
    try:
        normalized = iso_ts.replace("Z", "+00:00")
        created = datetime.fromisoformat(normalized)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return max(0, (now - created.astimezone(timezone.utc)).days)
    except Exception:
        return None


def _already_sent(lifecycle_state: Optional[dict], day: int) -> bool:
    """Return whether legacy lifecycle state recorded a send for the day."""
    if not lifecycle_state:
        return False
    sent_map = lifecycle_state.get("onboarding_sent") or {}
    return str(day) in sent_map or day in sent_map


async def process_onboarding_emails() -> dict:
    """Legacy cron processor: onboarding drip emails are disabled."""
    logger.info("Onboarding drip emails disabled; returning no-op counters")
    return {
        "processed": 0,
        "sent": 0,
        "skipped_already": 0,
        "skipped_other": 0,
        "errors": 0,
        "disabled": True,
        "reason": ONBOARDING_DRIP_DISABLED_REASON,
    }
