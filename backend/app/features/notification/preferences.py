"""
Notification preference filter — single source of truth for "should this user receive this email?"

Every email-sending code path (morning/evening broadcast, weekly report, event alerts, health weekly)
MUST call should_send_to() before sending. CI can grep for enforcement.

LLD: docs/plans/for-you/p0-foundation.md §LLD U0-C
"""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from app.core.logging import get_logger
from app.features.portfolio.models import ProfileView

logger = get_logger(__name__)


class Channel(str, Enum):
    MORNING = "morning"
    EVENING = "evening"
    WEEKLY = "weekly"
    EVENT = "event"


async def should_send_to(
    user_id: str,
    channel: Channel,
    today: Optional[date] = None,
    *,
    profile: Optional[ProfileView] = None,
) -> bool:
    """Determine whether to send an email to this user on this channel.

    Args:
        user_id: The user to check
        channel: Which email channel (morning/evening/weekly/event)
        today: Override date for testing
        profile: Pre-loaded profile to avoid redundant DB call

    Returns:
        True if the email should be sent, False otherwise
    """
    if profile is None:
        from app.features.portfolio import db as portfolio_db

        profile = await portfolio_db.get_profile(user_id)

    # R-2: Stale portfolio force-silent (>90 days since confirmed)
    if profile.portfolio_confirmed_at:
        confirmed_date = profile.portfolio_confirmed_at
        # Ensure timezone-aware comparison using UTC consistently
        if confirmed_date.tzinfo is None:
            confirmed_date = confirmed_date.replace(tzinfo=timezone.utc)
        today_utc = datetime.now(timezone.utc).date()
        days = (today_utc - confirmed_date.date()).days
        if days > 90:
            logger.info(
                "skip_send reason=stale_portfolio user=%s days=%d channel=%s",
                user_id[:8],
                days,
                channel.value,
            )
            return False

    mode = profile.notify_mode  # "silent" | "events_only" | "daily"

    if mode == "silent":
        logger.info(
            "skip_send reason=silent user=%s channel=%s", user_id[:8], channel.value
        )
        return False

    if mode == "daily":
        return True

    # events_only
    if channel == Channel.WEEKLY:
        return True  # weekly always sent (low frequency, not annoying)

    if channel == Channel.EVENT:
        return True  # event emails are by definition event-day

    # MORNING / EVENING: only on event days
    from app.features.notification.event_day import is_event_day_for

    return await is_event_day_for(user_id, today or date.today())
