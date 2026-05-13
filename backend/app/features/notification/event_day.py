"""
Event day detection — reuses U0-B ActionBar severity to avoid dual threshold maintenance.

A day is an "event day" if the ActionBar would show yellow or red severity.
"""

from datetime import date
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


async def is_event_day_for(user_id: str, day: Optional[date] = None) -> bool:
    """Check if today is an event day for this user (ActionBar severity >= yellow).

    Reuses build_action_bar() — its result is typically cached, so zero extra cost.
    Falls back to True on error (better to over-send than miss an important day).
    """
    try:
        from app.features.for_you.service import build_action_bar

        bar = await build_action_bar(user_id)
        is_event = bar.severity in ("yellow", "red")
        if is_event:
            logger.info(
                "event_day user=%s severity=%s", user_id[:8], bar.severity
            )
        return is_event
    except Exception:
        logger.warning(
            "event_day check failed user=%s — defaulting to True", user_id[:8]
        )
        return True  # fail-open: send rather than miss
