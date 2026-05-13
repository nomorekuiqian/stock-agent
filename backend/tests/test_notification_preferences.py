"""
Unit tests for notification preference filter (U0-C).

Covers:
  - 3x4 mode x channel matrix (silent/events_only/daily x morning/evening/weekly/event)
  - Stale portfolio force-silent (>90 days since confirmed)
  - Event day detection via ActionBar severity
  - Profile load fallback when not provided
"""

import pytest
from datetime import date, datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from app.features.notification.preferences import should_send_to, Channel
from app.features.notification.event_day import is_event_day_for
from app.features.portfolio.models import ProfileView
from app.features.for_you.models import ActionBar


def _make_profile(
    notify_mode: str = "events_only",
    confirmed_days_ago: int | None = None,
) -> ProfileView:
    confirmed_at = None
    if confirmed_days_ago is not None:
        confirmed_at = datetime.now(timezone.utc) - timedelta(days=confirmed_days_ago)
    return ProfileView(
        user_id="test-user",
        style="passive",
        horizon="long",
        risk_tolerance="moderate",
        notify_mode=notify_mode,
        portfolio_confirmed_at=confirmed_at,
    )


# =============================================================================
# 3x4 mode x channel matrix
# =============================================================================


class TestShouldSendTo:
    """Test the 3x4 mode x channel matrix."""

    @pytest.mark.asyncio
    async def test_silent_all_channels_false(self):
        profile = _make_profile("silent")
        for ch in Channel:
            assert await should_send_to("u1", ch, profile=profile) is False

    @pytest.mark.asyncio
    async def test_daily_all_channels_true(self):
        profile = _make_profile("daily")
        for ch in Channel:
            assert await should_send_to("u1", ch, profile=profile) is True

    @pytest.mark.asyncio
    async def test_events_only_weekly_always_true(self):
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.WEEKLY, profile=profile) is True

    @pytest.mark.asyncio
    async def test_events_only_event_always_true(self):
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.EVENT, profile=profile) is True

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_events_only_morning_event_day_true(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="yellow",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is True

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_events_only_morning_non_event_day_false(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="green",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is False

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_events_only_evening_event_day_true(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="red",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.EVENING, profile=profile) is True

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_events_only_evening_non_event_day_false(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="green",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        profile = _make_profile("events_only")
        assert await should_send_to("u1", Channel.EVENING, profile=profile) is False


# =============================================================================
# Stale portfolio
# =============================================================================


class TestStalePortfolio:
    """R-2: >90 days since portfolio confirmed -> force silent."""

    @pytest.mark.asyncio
    async def test_stale_daily_mode_blocked(self):
        profile = _make_profile("daily", confirmed_days_ago=91)
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is False

    @pytest.mark.asyncio
    async def test_stale_events_only_blocked(self):
        profile = _make_profile("events_only", confirmed_days_ago=100)
        assert await should_send_to("u1", Channel.WEEKLY, profile=profile) is False

    @pytest.mark.asyncio
    async def test_stale_silent_still_false(self):
        profile = _make_profile("silent", confirmed_days_ago=100)
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is False

    @pytest.mark.asyncio
    async def test_89_days_not_stale(self):
        profile = _make_profile("daily", confirmed_days_ago=89)
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is True

    @pytest.mark.asyncio
    async def test_no_confirmed_at_uses_mode(self):
        profile = _make_profile("daily", confirmed_days_ago=None)
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is True

    @pytest.mark.asyncio
    async def test_exactly_90_days_not_stale(self):
        profile = _make_profile("daily", confirmed_days_ago=90)
        assert await should_send_to("u1", Channel.MORNING, profile=profile) is True


# =============================================================================
# Event day detection
# =============================================================================


class TestEventDay:
    """Test is_event_day_for() delegation to build_action_bar."""

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_yellow_is_event_day(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="yellow",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert await is_event_day_for("u1") is True

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_red_is_event_day(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="red",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert await is_event_day_for("u1") is True

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_green_not_event_day(self, mock_bar):
        mock_bar.return_value = ActionBar(
            severity="green",
            headline="test",
            chips=[],
            source="template",
            generated_at=datetime.now(timezone.utc),
        )
        assert await is_event_day_for("u1") is False

    @pytest.mark.asyncio
    @patch(
        "app.features.for_you.service.build_action_bar",
        new_callable=AsyncMock,
    )
    async def test_error_defaults_to_true(self, mock_bar):
        mock_bar.side_effect = Exception("service down")
        assert await is_event_day_for("u1") is True


# =============================================================================
# Profile load fallback
# =============================================================================


class TestProfileLoadFallback:
    """When profile is not passed in, it is loaded from DB."""

    @pytest.mark.asyncio
    @patch(
        "app.features.portfolio.db.get_profile",
        new_callable=AsyncMock,
    )
    async def test_loads_profile_when_not_provided(self, mock_get):
        mock_get.return_value = _make_profile("daily")
        result = await should_send_to("u1", Channel.MORNING)
        mock_get.assert_called_once_with("u1")
        assert result is True
