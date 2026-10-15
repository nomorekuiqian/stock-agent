"""Bound the lifetime of sessions used by one-shot agent jobs."""

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from app.core.logging import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def temporary_agent_session(
    runner: Any, *, app_name: str, user_id: str
) -> AsyncIterator[Any]:
    """Release transient state after result extraction, failure or cancellation.

    Use only for one-shot generation. Durable user conversation sessions have
    a separate lifecycle and must not use this helper.
    """
    session = await runner.session_service.create_session(
        app_name=app_name, user_id=user_id
    )
    try:
        yield session
    finally:
        try:
            await runner.session_service.delete_session(
                app_name=app_name, user_id=user_id, session_id=session.id
            )
        except Exception:
            # Cleanup failure must not discard a valid report or hide the
            # original generation error. Cancellation still propagates.
            logger.warning(
                "Temporary agent session cleanup failed: app=%s", app_name, exc_info=True
            )
