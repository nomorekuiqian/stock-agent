"""Unit tests for the removed onboarding drip campaign."""

from datetime import datetime, timedelta, timezone

import pytest

from app.features.notification.onboarding import (
    DRIP_SCHEDULE,
    ONBOARDING_DRIP_DISABLED_REASON,
    _TEMPLATE_MAP,
    _already_sent,
    _days_since,
    process_onboarding_emails,
)


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


def test_onboarding_drip_schedule_and_templates_are_removed():
    assert DRIP_SCHEDULE == {}
    assert _TEMPLATE_MAP == {}


@pytest.mark.asyncio
async def test_process_onboarding_emails_returns_disabled_noop():
    counters = await process_onboarding_emails()

    assert counters == {
        "processed": 0,
        "sent": 0,
        "skipped_already": 0,
        "skipped_other": 0,
        "errors": 0,
        "disabled": True,
        "reason": ONBOARDING_DRIP_DISABLED_REASON,
    }
