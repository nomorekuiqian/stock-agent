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
        """weekly_report audience name is MarketBrew Weekly."""
        config = CHANNEL_CONFIG[SubscriptionChannel.WEEKLY_REPORT]
        assert config["audience_name"] == "MarketBrew Weekly"

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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
