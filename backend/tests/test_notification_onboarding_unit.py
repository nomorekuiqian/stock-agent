"""Unit tests for the signup-anchored onboarding drip.

Covers pure helpers (`_days_since`, `_already_sent`) + the day-selection
behaviour of `process_onboarding_emails` (we patch the edge-function fetch /
send / mark calls so nothing leaves the process).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.features.notification.onboarding import (
    DRIP_SCHEDULE,
    _TEMPLATE_MAP,
    _already_sent,
    _days_since,
    process_onboarding_emails,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_days_since_handles_z_suffix():
    five_days_ago = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat().replace("+00:00", "Z")
    assert _days_since(five_days_ago) == 5


def test_days_since_returns_none_on_bad_input():
    assert _days_since("") is None
    assert _days_since("not-a-date") is None


def test_already_sent_treats_str_and_int_keys_as_same():
    state = {"onboarding_sent": {"3": "2026-06-01T00:00:00Z"}}
    assert _already_sent(state, 3) is True
    state_int = {"onboarding_sent": {3: "2026-06-01T00:00:00Z"}}
    assert _already_sent(state_int, 3) is True


def test_already_sent_returns_false_when_state_missing():
    assert _already_sent(None, 1) is False
    assert _already_sent({}, 1) is False
    assert _already_sent({"onboarding_sent": {}}, 1) is False


# ---------------------------------------------------------------------------
# Drip schedule + template contract
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("day", sorted(DRIP_SCHEDULE.keys()))
def test_every_scheduled_day_has_a_template(day):
    template = _TEMPLATE_MAP.get(day)
    assert template is not None
    subject, html = template(first_name="Test")
    assert subject and html
    assert "TheMarketBrew" in subject


def test_onboarding_templates_use_freemium_language():
    """The onboarding sequence should not reference a trial window."""
    subject14, html14 = _TEMPLATE_MAP[14]()
    for day in sorted(_TEMPLATE_MAP.keys()):
        subject, html = _TEMPLATE_MAP[day]()
        assert "试用" not in subject
        assert "试用" not in html
    assert "Free" in html14
    assert "Pro" in html14
    assert "Max" in html14


# ---------------------------------------------------------------------------
# process_onboarding_emails — day selection + idempotency
# ---------------------------------------------------------------------------


def _user_signed_up_days_ago(days: int, **overrides) -> dict:
    iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return {
        "user_id": overrides.get("user_id", "user-" + str(days)),
        "email": overrides.get("email", f"u{days}@example.com"),
        "name": overrides.get("name", "Tester"),
        "auth_created_at": iso,
        "lifecycle_state": overrides.get("lifecycle_state", {}),
    }


@pytest.mark.asyncio
async def test_sends_only_to_users_on_scheduled_days():
    users = [
        _user_signed_up_days_ago(0),   # no template — skipped
        _user_signed_up_days_ago(3),   # Day 3
        _user_signed_up_days_ago(2),   # no template — skipped
        _user_signed_up_days_ago(7),   # Day 7
        _user_signed_up_days_ago(20),  # past schedule — skipped
    ]

    sent_emails: list[tuple[str, str]] = []

    async def fake_send(email, subject, html):
        sent_emails.append((email, subject))
        return True

    with (
        patch("app.features.notification.onboarding._list_all_users", AsyncMock(return_value=users)),
        patch("app.features.notification.onboarding._send_onboarding_email", side_effect=fake_send),
        patch("app.features.notification.onboarding._update_lifecycle_state", AsyncMock(return_value=True)),
        patch("app.features.notification.onboarding.ENVIRONMENT", "production"),
    ):
        counters = await process_onboarding_emails()

    assert counters["sent"] == 2
    assert {e for e, _ in sent_emails} == {"u3@example.com", "u7@example.com"}
    assert counters["skipped_other"] == 3


@pytest.mark.asyncio
async def test_skips_users_already_sent_for_that_day():
    user_already_sent = _user_signed_up_days_ago(
        3, lifecycle_state={"onboarding_sent": {"3": "2026-06-01T00:00:00Z"}}
    )
    user_fresh = _user_signed_up_days_ago(3, user_id="fresh", email="fresh@example.com")

    sent: list[str] = []

    async def fake_send(email, subject, html):
        sent.append(email)
        return True

    with (
        patch("app.features.notification.onboarding._list_all_users", AsyncMock(return_value=[user_already_sent, user_fresh])),
        patch("app.features.notification.onboarding._send_onboarding_email", side_effect=fake_send),
        patch("app.features.notification.onboarding._update_lifecycle_state", AsyncMock(return_value=True)),
        patch("app.features.notification.onboarding.ENVIRONMENT", "production"),
    ):
        counters = await process_onboarding_emails()

    assert sent == ["fresh@example.com"]
    assert counters["sent"] == 1
    assert counters["skipped_already"] == 1


@pytest.mark.asyncio
async def test_successful_send_marks_lifecycle_state_with_existing_sent_days():
    user = _user_signed_up_days_ago(
        7,
        user_id="mark-me",
        email="mark@example.com",
        lifecycle_state={"onboarding_sent": {"3": "2026-06-01T00:00:00Z"}},
    )
    update_state = AsyncMock(return_value=True)

    with (
        patch("app.features.notification.onboarding._list_all_users", AsyncMock(return_value=[user])),
        patch("app.features.notification.onboarding._send_onboarding_email", AsyncMock(return_value=True)),
        patch("app.features.notification.onboarding._update_lifecycle_state", update_state),
        patch("app.features.notification.onboarding.ENVIRONMENT", "production"),
    ):
        counters = await process_onboarding_emails()

    assert counters["sent"] == 1
    update_state.assert_awaited_once()
    user_id, patch_body = update_state.await_args.args
    assert user_id == "mark-me"
    assert set(patch_body["onboarding_sent"].keys()) == {"3", "7"}
    assert patch_body["onboarding_sent"]["3"] == "2026-06-01T00:00:00Z"
    assert patch_body["onboarding_sent"]["7"]


@pytest.mark.asyncio
async def test_failed_send_does_not_mark_lifecycle_state():
    user = _user_signed_up_days_ago(3, user_id="fail-send", email="fail@example.com")
    update_state = AsyncMock(return_value=True)

    with (
        patch("app.features.notification.onboarding._list_all_users", AsyncMock(return_value=[user])),
        patch("app.features.notification.onboarding._send_onboarding_email", AsyncMock(return_value=False)),
        patch("app.features.notification.onboarding._update_lifecycle_state", update_state),
        patch("app.features.notification.onboarding.ENVIRONMENT", "production"),
    ):
        counters = await process_onboarding_emails()

    assert counters["sent"] == 0
    assert counters["errors"] == 1
    update_state.assert_not_called()


@pytest.mark.asyncio
async def test_non_production_filters_to_test_account():
    users = [
        _user_signed_up_days_ago(3, email="random@example.com"),
        _user_signed_up_days_ago(3, email="voya.technologies@gmail.com", user_id="tester"),
    ]

    sent: list[str] = []

    async def fake_send(email, subject, html):
        sent.append(email)
        return True

    with (
        patch("app.features.notification.onboarding._list_all_users", AsyncMock(return_value=users)),
        patch("app.features.notification.onboarding._send_onboarding_email", side_effect=fake_send),
        patch("app.features.notification.onboarding._update_lifecycle_state", AsyncMock(return_value=True)),
        patch("app.features.notification.onboarding.ENVIRONMENT", "development"),
    ):
        counters = await process_onboarding_emails()

    assert sent == ["voya.technologies@gmail.com"]
    assert counters["sent"] == 1
