"""
Subscription Service Unit Tests -- generated from git diff

Tests for: SubscriptionChannel enum, CHANNEL_CONFIG weekly_report entry.
No network access, no database.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_subscription_unit.py -v
"""

import pytest

from app.features.subscription.service import (
    SubscriptionChannel,
    CHANNEL_CONFIG,
)


class TestSubscriptionChannel:
    """Tests for SubscriptionChannel enum."""

    def test_weekly_report_exists(self):
        """WEEKLY_REPORT enum value exists."""
        assert SubscriptionChannel.WEEKLY_REPORT == "weekly_report"

    def test_all_channels(self):
        """All expected channels are present."""
        values = [c.value for c in SubscriptionChannel]
        assert "daily_report" in values
        assert "personal_digest" in values
        assert "weekly_report" in values

    def test_channel_count(self):
        """Total channel count is 3."""
        assert len(SubscriptionChannel) == 3


class TestChannelConfig:
    """Tests for CHANNEL_CONFIG dictionary."""

    def test_weekly_report_config_exists(self):
        """CHANNEL_CONFIG has weekly_report entry."""
        assert SubscriptionChannel.WEEKLY_REPORT in CHANNEL_CONFIG

    def test_weekly_report_audience_name(self):
        """weekly_report audience name is TheMarketBrew Weekly."""
        config = CHANNEL_CONFIG[SubscriptionChannel.WEEKLY_REPORT]
        assert config["audience_name"] == "TheMarketBrew Weekly"

    def test_weekly_report_no_auth_required(self):
        """weekly_report does not require authentication."""
        config = CHANNEL_CONFIG[SubscriptionChannel.WEEKLY_REPORT]
        assert config["requires_auth"] is False

    def test_weekly_report_metadata_fields(self):
        """weekly_report metadata includes first_name."""
        config = CHANNEL_CONFIG[SubscriptionChannel.WEEKLY_REPORT]
        assert "first_name" in config["metadata_fields"]

    def test_all_channels_have_config(self):
        """Every SubscriptionChannel has a config entry."""
        for channel in SubscriptionChannel:
            assert channel in CHANNEL_CONFIG, f"Missing config for {channel}"

    def test_all_configs_have_required_keys(self):
        """Every config has audience_name, metadata_fields, requires_auth."""
        for channel, config in CHANNEL_CONFIG.items():
            assert "audience_name" in config, f"{channel} missing audience_name"
            assert "metadata_fields" in config, f"{channel} missing metadata_fields"
            assert "requires_auth" in config, f"{channel} missing requires_auth"


class TestPersonalDigestConfig:
    """Tests for personal_digest channel configuration."""

    def test_no_symbols_in_metadata_fields(self):
        """personal_digest metadata_fields should NOT contain 'symbols'."""
        config = CHANNEL_CONFIG[SubscriptionChannel.PERSONAL_DIGEST]
        assert "symbols" not in config["metadata_fields"]

    def test_user_id_in_metadata_fields(self):
        """personal_digest metadata_fields should contain 'user_id'."""
        config = CHANNEL_CONFIG[SubscriptionChannel.PERSONAL_DIGEST]
        assert "user_id" in config["metadata_fields"]


class TestSubscriptionModels:
    """Tests for subscription Pydantic models."""

    def test_subscribe_request_no_symbols_field(self):
        """SubscribeRequest model should not have 'symbols' in its fields."""
        from app.features.subscription.models import SubscribeRequest

        assert "symbols" not in SubscribeRequest.model_fields

    def test_update_request_no_symbols_field(self):
        """SubscriptionUpdateRequest should not have 'symbols' in its fields."""
        from app.features.subscription.models import SubscriptionUpdateRequest

        assert "symbols" not in SubscriptionUpdateRequest.model_fields


class TestEmailFormatHelpers:
    """Tests for EmailService._format_change_color and _format_change_text.

    These are instance methods on EmailService. We create a minimal instance
    (RESEND_API_KEY may be empty in test env, which is fine -- __init__ just
    sets attributes without calling external APIs).
    """

    @pytest.fixture
    def svc(self):
        """Create an EmailService instance for testing helper methods."""
        from app.features.subscription.email_service import EmailService

        return EmailService()

    # -- _format_change_color --

    def test_positive_change_is_green(self, svc):
        """Positive change returns green color (#10b981)."""
        assert svc._format_change_color(1.5) == "#10b981"

    def test_negative_change_is_red(self, svc):
        """Negative change returns red color (#ef4444)."""
        assert svc._format_change_color(-0.75) == "#ef4444"

    def test_zero_change_is_gray(self, svc):
        """Zero change returns gray color (#71717a)."""
        assert svc._format_change_color(0.0) == "#71717a"

    def test_large_positive_is_green(self, svc):
        """Large positive change is still green."""
        assert svc._format_change_color(15.0) == "#10b981"

    def test_small_negative_is_red(self, svc):
        """Small negative change is still red."""
        assert svc._format_change_color(-0.01) == "#ef4444"

    # -- _format_change_text --

    def test_positive_change_has_plus_sign(self, svc):
        """Positive change text starts with +."""
        result = svc._format_change_text(1.5)
        assert result == "+1.50%"

    def test_negative_change_has_minus_sign(self, svc):
        """Negative change text starts with -."""
        result = svc._format_change_text(-0.75)
        assert result == "-0.75%"

    def test_zero_change_text(self, svc):
        """Zero change text has no sign prefix (0.00%)."""
        result = svc._format_change_text(0.0)
        assert result == "0.00%"

    def test_format_two_decimal_places(self, svc):
        """Change text always has exactly 2 decimal places."""
        assert svc._format_change_text(3.1) == "+3.10%"
        assert svc._format_change_text(-10.123) == "-10.12%"

    def test_from_email_morning_attribute(self, svc):
        """EmailService has from_email_morning attribute set correctly."""
        assert "morning" in svc.from_email_morning.lower()
        assert "themarketbrew.com" in svc.from_email_morning


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
