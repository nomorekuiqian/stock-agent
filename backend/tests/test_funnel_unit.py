"""
Unit tests for the conversion funnel optimization.

Covers (post-freemium-transition):
- email_guard: non-production email blocking
- onboarding drip: removed legacy no-op contract
- freemium: daily usage tracking

create_trial_subscription tests deleted — function is a deprecated stub.
See docs/plans/completed/2026-06-04-freemium-lifecycle-email-REVERTED.md.
"""

import pytest  # noqa: F401  -- kept for class-level markers in remaining tests
from datetime import datetime, timezone, timedelta  # noqa: F401
from unittest.mock import AsyncMock, MagicMock, patch  # noqa: F401

MOCK_UID = "test-user-0000-1111-funnel"
MOCK_EMAIL = "test-funnel@example.com"



# ---------------------------------------------------------------------------
# email_guard
# ---------------------------------------------------------------------------

class TestEmailGuard:
    """Tests for the non-production email guard."""

    def test_guard_blocks_non_whitelisted(self):
        """Emails to non-whitelisted addresses should be blocked."""
        from app.core.email_guard import ALLOWED_TEST_EMAILS

        blocked_email = "random-production-user@gmail.com"
        assert blocked_email not in ALLOWED_TEST_EMAILS

    def test_guard_allows_test_emails(self):
        """Test emails should be in the whitelist."""
        from app.core.email_guard import ALLOWED_TEST_EMAILS

        assert "voya.technologies@gmail.com" in ALLOWED_TEST_EMAILS
        assert "kedengpan@gmail.com" in ALLOWED_TEST_EMAILS
        assert "kedengpan123@gmail.com" in ALLOWED_TEST_EMAILS

    def test_guarded_send_blocks_non_test(self):
        """_guarded_send should block non-whitelisted recipients."""
        from app.core import email_guard

        original = email_guard._original_send
        email_guard._original_send = MagicMock(return_value={"id": "real_send"})

        try:
            result = email_guard._guarded_send({
                "to": ["production-user@example.com"],
                "subject": "test",
            })
            assert result["id"] == "blocked_by_email_guard"
            email_guard._original_send.assert_not_called()
        finally:
            email_guard._original_send = original

    def test_guarded_send_allows_test(self):
        """_guarded_send should allow whitelisted recipients."""
        from app.core import email_guard

        original = email_guard._original_send
        email_guard._original_send = MagicMock(return_value={"id": "sent_123"})

        try:
            result = email_guard._guarded_send({
                "to": ["voya.technologies@gmail.com"],
                "subject": "test",
            })
            assert result["id"] == "sent_123"
            email_guard._original_send.assert_called_once()
        finally:
            email_guard._original_send = original


# ---------------------------------------------------------------------------
# Onboarding drip schedule
# ---------------------------------------------------------------------------

class TestOnboardingDrip:
    """Tests for the removed onboarding drip contract."""

    def test_signup_day_calculation(self):
        """Day should be calculated from auth_created_at / signup timestamp."""
        from app.features.notification import onboarding as ob

        fixed_now = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        with patch.object(ob, "datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.fromisoformat.side_effect = datetime.fromisoformat

            signup = (fixed_now - timedelta(hours=23)).isoformat()
            assert ob._days_since(signup) == 0

            signup = (fixed_now - timedelta(days=7, hours=1)).isoformat()
            assert ob._days_since(signup) == 7

            signup = (fixed_now - timedelta(days=14, hours=23)).isoformat()
            assert ob._days_since(signup) == 14

    def test_signup_day_invalid_input(self):
        """Invalid date strings should return None."""
        from app.features.notification.onboarding import _days_since

        assert _days_since("not-a-date") is None
        assert _days_since("") is None

    def test_drip_schedule_days(self):
        """DRIP_SCHEDULE should be empty after drip emails were removed."""
        from app.features.notification.onboarding import DRIP_SCHEDULE

        assert DRIP_SCHEDULE == {}

    def test_template_map_matches_schedule(self):
        """No onboarding drip templates should remain available."""
        from app.features.notification.onboarding import DRIP_SCHEDULE, _TEMPLATE_MAP

        assert _TEMPLATE_MAP == {}
        assert set(DRIP_SCHEDULE.keys()) == set(_TEMPLATE_MAP.keys())

    @pytest.mark.asyncio
    async def test_process_returns_disabled_noop(self):
        """The legacy cron processor should not send onboarding emails."""
        from app.features.notification.onboarding import process_onboarding_emails

        counters = await process_onboarding_emails()
        assert counters["disabled"] is True
        assert counters["sent"] == 0




# ---------------------------------------------------------------------------
# Auto-trial endpoint model
# ---------------------------------------------------------------------------

class TestAutoTrialModel:
    """Tests for the AutoTrialResponse model."""

    def test_model_defaults(self):
        """AutoTrialResponse should have correct defaults."""
        from app.features.invites.models import AutoTrialResponse

        resp = AutoTrialResponse(success=True)
        assert resp.success is True
        assert resp.access_expires_at is None
        assert resp.already_active is False

    def test_model_with_values(self):
        """AutoTrialResponse should accept all fields."""
        from app.features.invites.models import AutoTrialResponse

        resp = AutoTrialResponse(
            success=True,
            access_expires_at="2026-04-27T00:00:00Z",
            already_active=True,
        )
        assert resp.already_active is True
        assert resp.access_expires_at == "2026-04-27T00:00:00Z"


# ---------------------------------------------------------------------------
# Welcome email template
# ---------------------------------------------------------------------------

class TestWelcomeEmailTemplate:
    """Tests for the welcome email template."""

    def test_welcome_html_contains_branding(self):
        """Welcome email should contain TheMarketBrew branding."""
        from app.features.subscription.email_templates import format_welcome_html

        html = format_welcome_html(first_name="Test", email="test@example.com")
        assert "TheMarketBrew" in html
        assert "themarketbrew.com" in html

    def test_welcome_html_contains_cta(self):
        """Welcome email should contain registration/trial CTA."""
        from app.features.subscription.email_templates import format_welcome_html

        html = format_welcome_html(first_name="", email="test@example.com")
        assert "themarketbrew.com" in html

    def test_trial_welcome_delegates(self):
        """format_trial_welcome_html should delegate to format_welcome_html."""
        from app.features.subscription.email_templates import (
            format_welcome_html,
            format_trial_welcome_html,
        )

        result1 = format_welcome_html(email="test@example.com")
        result2 = format_trial_welcome_html(email="test@example.com")
        assert result1 == result2


# ---------------------------------------------------------------------------
# Conversion hook in daily report
# ---------------------------------------------------------------------------

class TestConversionHook:
    """Tests for the email conversion hook."""

    def test_hook_hidden_by_default(self):
        """Conversion hook should NOT appear when show_conversion_hook=False."""
        from app.features.subscription.email_templates import format_html_report

        html = format_html_report(
            {"timestamp": "2026-04-12T00:00:00Z", "indices": []},
            show_conversion_hook=False,
        )
        assert "想要更深入的分析" not in html

    def test_hook_shown_when_enabled(self):
        """Conversion hook should appear when show_conversion_hook=True."""
        from app.features.subscription.email_templates import format_html_report

        html = format_html_report(
            {"timestamp": "2026-04-12T00:00:00Z", "indices": []},
            show_conversion_hook=True,
        )
        assert "想要更深入的分析" in html
        assert "免费注册" in html
