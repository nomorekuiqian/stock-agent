"""Lifecycle onboarding scheduler.

Daily cron job: for every user that signed up N days ago (where N in
LIFECYCLE_DAYS), send the corresponding onboarding email if not already sent.

Idempotent: tracks send state in subscriptions.lifecycle_state.onboarding_sent
(JSONB dict keyed by day_int -> ISO timestamp). Re-running the same day is a
no-op.

Non-production: filters recipients to TEST_EMAIL to avoid spamming real users
from dev/staging cron runs.

Plan: docs/plans/active/freemium-lifecycle-email.md
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

import resend

from app.core.config import RESEND_API_KEY, ENVIRONMENT
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.subscription.lifecycle_templates import (
    LIFECYCLE_DAYS,
    LifecycleEmail,
    render,
)

logger = get_logger(__name__)

TEST_EMAIL = "voya.technologies@gmail.com"
MAG7 = {"AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"}
SAMPLE_POOL = ("NVDA", "TSLA", "AAPL", "MSFT")  # rotated by user.id hash


# ---------------------------------------------------------------------------
# Data fetch helpers
# ---------------------------------------------------------------------------


async def _list_all_users() -> list[dict[str, Any]]:
    """All users joined with subscription metadata (includes auth_created_at)."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data", []) or []
    logger.warning("Failed to fetch users for lifecycle: %s", data.get("error"))
    return []


async def _get_user_watchlist_symbols(user_id: str) -> list[str]:
    """Best-effort watchlist fetch for D6 sample-ticker selection."""
    service = get_insforge_service()
    try:
        result = await service.call_function(
            "user-holdings",
            method="GET",
            params={"action": "watchlist", "user_id": user_id},
        )
        data = result.get("data", {})
        if data.get("success"):
            wl = data.get("data") or {}
            return wl.get("symbols") or []
    except Exception:  # noqa: BLE001
        pass
    return []


async def _update_lifecycle_state(user_id: str, patch: dict[str, Any]) -> bool:
    """Edge function call to shallow-merge patch into lifecycle_state JSONB."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="POST",
        params={"action": "update_lifecycle_state"},
        json_body={"user_id": user_id, "patch": patch},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.warning(
            "update_lifecycle_state failed for %s: %s",
            user_id[:8], data.get("error"),
        )
        return False
    return True


# ---------------------------------------------------------------------------
# Day calculation + state introspection
# ---------------------------------------------------------------------------


def _days_since(iso_timestamp: str) -> Optional[int]:
    """Whole-day delta between iso_timestamp and now (UTC). None on parse error."""
    if not iso_timestamp:
        return None
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - parsed).days
    except Exception:
        return None


def _already_sent(lifecycle_state: dict[str, Any] | None, day: int) -> bool:
    if not lifecycle_state:
        return False
    sent_map = lifecycle_state.get("onboarding_sent") or {}
    # JSONB serialization may store ints as strings — accept both.
    return str(day) in sent_map or day in sent_map


def _pick_sample_ticker(user_id: str, watchlist: list[str]) -> str:
    """Pick a Mag 7 ticker for D6 sample — user's own first, else hash-rotated."""
    for sym in watchlist:
        if sym.upper() in MAG7:
            return sym.upper()
    return SAMPLE_POOL[hash(user_id) % len(SAMPLE_POOL)]


def _behavior_hint(user: dict[str, Any]) -> str:
    """Cheap rule-based hint for D11. Real signals come from activity stats."""
    api_by_type = user.get("api_by_type") or {}
    research_count = int(api_by_type.get("ai_research", 0) or 0)
    if research_count >= 5:
        return "max_pitch"
    if user.get("personal_digest_count_30d", 0) > 0 or research_count >= 2:
        return "pro_pitch"
    return "default"


# ---------------------------------------------------------------------------
# Twitter Digest fetch (D0/D1/D2 content)
# ---------------------------------------------------------------------------


async def _latest_twitter_digest_html() -> str:
    """Best-effort fetch of latest Twitter Digest as standalone HTML snippet.

    Falls back to empty string if not available — template handles gracefully.
    """
    try:
        # Lazy import to avoid circular: twitter_digest may import subscription.
        from app.features.twitter_digest.db import get_latest_digest

        digest = await get_latest_digest()
        if not digest:
            return ""
        # Use a brief summary block rather than the full digest to keep emails small.
        # If the digest exposes html_body, use it; otherwise render a compact summary.
        if isinstance(digest, dict) and digest.get("html_body"):
            return str(digest["html_body"])
        summary = (digest.get("summary") or "") if isinstance(digest, dict) else ""
        return f'<p style="color:#3f3f46;font-size:14px;line-height:1.7;">{summary}</p>' if summary else ""
    except Exception:  # noqa: BLE001
        return ""


# ---------------------------------------------------------------------------
# Send helper
# ---------------------------------------------------------------------------


async def _send_lifecycle_email(email: str, payload: LifecycleEmail) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY missing — skipping lifecycle send to %s", email)
        return False
    try:
        resend.api_key = RESEND_API_KEY
        result = await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": "Golden from TheMarketBrew <hello@themarketbrew.com>",
                "reply_to": "kedengpan@gmail.com",
                "to": [email],
                "subject": payload.subject,
                "html": payload.html,
                "text": payload.text,
            },
        )
        email_id = (result or {}).get("id")
        if email_id:
            logger.info("Lifecycle email sent to %s: %s", email, email_id)
            return True
        logger.warning("Lifecycle send returned no id for %s", email)
        return False
    except Exception as e:  # noqa: BLE001
        logger.warning("Lifecycle send to %s failed: %s", email, e)
        return False


# ---------------------------------------------------------------------------
# Main pass
# ---------------------------------------------------------------------------


async def run_onboarding_pass() -> dict[str, int]:
    """Daily cron entry point — fire all lifecycle emails due today.

    Returns counters: {scanned, eligible, sent, skipped_already, skipped_other, errors}.
    """
    users = await _list_all_users()

    is_production = ENVIRONMENT == "production"
    if not is_production:
        before = len(users)
        users = [u for u in users if u.get("email") == TEST_EMAIL]
        logger.info(
            "Non-production lifecycle: filtered %d -> %d (test account only)",
            before, len(users),
        )

    counters = {
        "scanned": 0,
        "eligible": 0,
        "sent": 0,
        "skipped_already": 0,
        "skipped_other": 0,
        "errors": 0,
    }

    # Fetch latest twitter digest once per pass (used by D0/D1/D2)
    twitter_digest_html = await _latest_twitter_digest_html()

    for user in users:
        counters["scanned"] += 1
        email = user.get("email") or ""
        user_id = user.get("user_id") or ""
        if not email or not user_id:
            counters["skipped_other"] += 1
            continue

        signup_iso = user.get("auth_created_at") or user.get("created_at")
        day = _days_since(signup_iso) if signup_iso else None
        if day is None or day not in LIFECYCLE_DAYS:
            counters["skipped_other"] += 1
            continue

        counters["eligible"] += 1

        # Skip if already sent (idempotent)
        if _already_sent(user.get("lifecycle_state"), day):
            counters["skipped_already"] += 1
            continue

        # Render template with day-specific kwargs
        name = (user.get("name") or "").split(" ")[0]
        kwargs: dict[str, Any] = {}
        if day in (0, 1, 2):
            kwargs["twitter_digest_html"] = twitter_digest_html
        elif day == 6:
            watchlist = await _get_user_watchlist_symbols(user_id)
            kwargs["sample_ticker"] = _pick_sample_ticker(user_id, watchlist)
        elif day == 11:
            kwargs["behavior_hint"] = _behavior_hint(user)

        payload = render(day, name=name, **kwargs)
        if not payload:
            counters["skipped_other"] += 1
            continue

        ok = await _send_lifecycle_email(email, payload)
        if not ok:
            counters["errors"] += 1
            continue

        # Mark sent — read-modify-write of onboarding_sent nested dict
        existing_state = user.get("lifecycle_state") or {}
        existing_sent = existing_state.get("onboarding_sent") or {}
        existing_sent[str(day)] = datetime.now(timezone.utc).isoformat()
        await _update_lifecycle_state(user_id, {"onboarding_sent": existing_sent})

        counters["sent"] += 1

    logger.info("Lifecycle onboarding pass: %s", counters)
    return counters
