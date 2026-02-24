"""
Structured logging setup for the application.

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("Something happened")
"""

import logging
import os
import sys


def setup_logging(level: str | None = None):
    """Configure application-wide logging.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR).
               Defaults to LOG_LEVEL env var or INFO.
    """
    log_level = level or os.getenv("LOG_LEVEL", "INFO")
    resolved = getattr(logging, log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=resolved,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger. Mirrors module hierarchy.

    Example:
        get_logger(__name__)  # -> 'app.features.daily_report.router'
    """
    return logging.getLogger(name)
