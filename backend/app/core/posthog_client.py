"""
PostHog analytics client — singleton instance used across all feature modules.
"""

import atexit

from posthog import Posthog

from app.core.config import POSTHOG_HOST, POSTHOG_PROJECT_TOKEN
from app.core.logging import get_logger

posthog_client: Posthog | None = None
logger = get_logger(__name__)


def _log_posthog_error(error, batch) -> None:
    logger.warning(
        "PostHog upload failed: %s batch_size=%s",
        error,
        len(batch) if batch else 0,
    )


def init_posthog() -> None:
    global posthog_client
    if not POSTHOG_PROJECT_TOKEN:
        logger.info("PostHog analytics disabled: POSTHOG_PROJECT_TOKEN is not set")
        return
    posthog_client = Posthog(
        project_api_key=POSTHOG_PROJECT_TOKEN,
        host=POSTHOG_HOST,
        enable_exception_autocapture=True,
        on_error=_log_posthog_error,
        sync_mode=True,
        timeout=5,
    )
    logger.info(
        "PostHog analytics initialized: host=%s token_len=%s sync_mode=true",
        POSTHOG_HOST,
        len(POSTHOG_PROJECT_TOKEN),
    )
    atexit.register(posthog_client.shutdown)


def shutdown_posthog() -> None:
    if posthog_client:
        posthog_client.shutdown()
