"""
Structured logging setup for the application.

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("Something happened")

Turn-scoped tracing:
    from app.core.logging import use_turn_context

    with use_turn_context(turn_id=tid, session_id=sid, agent_id=aid):
        logger.info("...")  # output prefixed with [turn=tid session=sid agent=aid]

Any log line emitted while a turn context is active gets a prefix containing
turn/session/agent ids, so a single trace can be grepped out of uvicorn logs
without each callsite having to remember to include them.
"""

import contextlib
import contextvars
import logging
import os
import sys


_turn_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "log_turn_id", default=None
)
_session_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "log_session_id", default=None
)
_agent_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "log_agent_id", default=None
)


class _TurnContextFilter(logging.Filter):
    """Inject turn / session / agent ids into every record's message."""

    def filter(self, record: logging.LogRecord) -> bool:
        bits: list[str] = []
        turn_id = _turn_id_var.get(None)
        session_id = _session_id_var.get(None)
        agent_id = _agent_id_var.get(None)
        if turn_id:
            bits.append("turn=%s" % turn_id[:12])
        if session_id:
            bits.append("session=%s" % session_id[:12])
        if agent_id:
            bits.append("agent=%s" % agent_id)
        if bits:
            try:
                msg = record.getMessage()
            except Exception:  # noqa: BLE001
                msg = str(record.msg)
            record.msg = "[%s] %s" % (" ".join(bits), msg)
            record.args = ()
        return True


@contextlib.contextmanager
def use_turn_context(
    *,
    turn_id: str | None = None,
    session_id: str | None = None,
    agent_id: str | None = None,
):
    """Bind turn/session/agent identifiers to logger output for the block.

    No-op if all three args are falsy, so callers can pass through without
    branching when an identifier isn't known yet.
    """
    tokens = []
    if turn_id:
        tokens.append(_turn_id_var.set(turn_id))
    else:
        tokens.append(None)
    if session_id:
        tokens.append(_session_id_var.set(session_id))
    else:
        tokens.append(None)
    if agent_id:
        tokens.append(_agent_id_var.set(agent_id))
    else:
        tokens.append(None)
    try:
        yield
    finally:
        if tokens[0] is not None:
            _turn_id_var.reset(tokens[0])
        if tokens[1] is not None:
            _session_id_var.reset(tokens[1])
        if tokens[2] is not None:
            _agent_id_var.reset(tokens[2])


def setup_logging(level: str | None = None):
    """Configure application-wide logging.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR).
               Defaults to LOG_LEVEL env var or INFO.
    """
    log_level = level or os.getenv("LOG_LEVEL", "INFO")
    resolved = getattr(logging, log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_TurnContextFilter())

    logging.basicConfig(
        level=resolved,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[handler],
        force=True,
    )

    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("stripe").setLevel(logging.WARNING)
    # ADK emits a cosmetic "app name mismatch" warning when LlmAgent is
    # instantiated outside a project-local agents/ directory (e.g. installed
    # via pip).  The check is purely advisory and doesn't affect runtime.
    logging.getLogger("google_adk").setLevel(logging.ERROR)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger. Mirrors module hierarchy.

    Example:
        get_logger(__name__)  # -> 'app.features.daily_report.router'
    """
    return logging.getLogger(name)
