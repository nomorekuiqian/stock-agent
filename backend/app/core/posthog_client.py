"""
PostHog analytics client — singleton instance used across all feature modules.
"""

import atexit

from posthog import Posthog

from app.core.config import POSTHOG_HOST, POSTHOG_PROJECT_TOKEN

posthog_client: Posthog | None = None


def init_posthog() -> None:
    global posthog_client
    if not POSTHOG_PROJECT_TOKEN:
        return
    posthog_client = Posthog(
        project_api_key=POSTHOG_PROJECT_TOKEN,
        host=POSTHOG_HOST,
        enable_exception_autocapture=True,
    )
    atexit.register(posthog_client.shutdown)


def shutdown_posthog() -> None:
    if posthog_client:
        posthog_client.shutdown()
