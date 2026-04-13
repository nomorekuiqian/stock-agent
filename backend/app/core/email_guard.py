"""
Global email sending guard.

In non-production environments, intercepts ALL outgoing emails and only
allows sending to whitelisted test addresses. This prevents accidentally
emailing real users during development, regardless of which code path
triggers the send.

Usage: call install() once at app startup (main.py).
"""

import resend

from app.core.config import ENVIRONMENT
from app.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_TEST_EMAILS = {
    "voya.technologies@gmail.com",
    "kedengpan@gmail.com",
    "kedengpan123@gmail.com",
}

_original_send = None
_original_batch_send = None


def _guarded_send(params, *args, **kwargs):
    """Intercept resend.Emails.send — block non-whitelisted recipients in dev."""
    recipients = params.get("to", [])
    if isinstance(recipients, str):
        recipients = [recipients]

    blocked = [r for r in recipients if r not in ALLOWED_TEST_EMAILS]
    if blocked:
        logger.warning(
            "[EMAIL GUARD] BLOCKED send to non-test recipients: %s (env=%s)",
            blocked, ENVIRONMENT,
        )
        return {"id": "blocked_by_email_guard"}

    return _original_send(params, *args, **kwargs)


def _guarded_batch_send(params_list, *args, **kwargs):
    """Intercept resend.Batch.send — filter out non-whitelisted recipients in dev."""
    filtered = []
    blocked_count = 0
    for params in params_list:
        recipients = params.get("to", [])
        if isinstance(recipients, str):
            recipients = [recipients]
        if any(r not in ALLOWED_TEST_EMAILS for r in recipients):
            blocked_count += 1
        else:
            filtered.append(params)

    if blocked_count:
        logger.warning(
            "[EMAIL GUARD] BLOCKED %d batch emails to non-test recipients (env=%s)",
            blocked_count, ENVIRONMENT,
        )

    if not filtered:
        return {"data": []}

    return _original_batch_send(filtered, *args, **kwargs)


def install():
    """Install the email guard. Call once at app startup."""
    global _original_send, _original_batch_send

    if ENVIRONMENT == "production":
        logger.info("[EMAIL GUARD] Production environment, no guard installed")
        return

    _original_send = resend.Emails.send
    _original_batch_send = resend.Batch.send

    resend.Emails.send = _guarded_send
    resend.Batch.send = _guarded_batch_send

    logger.info(
        "[EMAIL GUARD] Installed for env=%s. Only %s can receive emails.",
        ENVIRONMENT, ALLOWED_TEST_EMAILS,
    )
