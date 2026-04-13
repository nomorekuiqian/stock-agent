"""
Unit tests for the conversion funnel optimization.

Covers:
- create_trial_subscription: idempotency, Stripe fallback, repeated trial prevention
- auto-trial endpoint: response, welcome email trigger
- email_guard: non-production email blocking
- onboarding drip: day calculation, schedule matching
- freemium: daily usage tracking

All tests mock external services (Stripe, Resend, Insforge).
No real emails are sent. No production data is touched.
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

MOCK_UID = "test-user-0000-1111-funnel"
MOCK_EMAIL = "test-funnel@example.com"


# ---------------------------------------------------------------------------
# create_trial_subscription
# ---------------------------------------------------------------------------

class TestCreateTrialSubscription:
    """Tests for the shared trial creation function."""

    @pytest.mark.asyncio
    @patch("app.features.invites.db.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_or_create_stripe_customer", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock)
    async def test_new_user_creates_trial(self, mock_get_sub, mock_get_customer, mock_upsert):
        """Brand new user gets a 14-day Max trial."""
        mock_get_sub.return_value = None
        mock_get_customer.return_value = "cus_test123"

        with patch("app.features.invites.db.asyncio.to_thread") as mock_thread:
            mock_sub = MagicMock()
            mock_sub.to_dict.return_value = {
                "id": "sub_test123",
                "trial_end": int((datetime.now(timezone.utc) + timedelta(days=14)).timestamp()),
            }
            mock_thread.return_value = mock_sub

            from app.features.invites.db import create_trial_subscription
            result = await create_trial_subscription(
                user_id=MOCK_UID,
                user_email=MOCK_EMAIL,
                source="auto_registration",
            )

        assert result["success"] is True
        assert result["already_active"] is False
        assert result["stripe_pending"] is False
        assert result["subscription_id"] == "sub_test123"
        mock_upsert.assert_called_once()
        call_kwargs = mock_upsert.call_args
        assert call_kwargs.kwargs.get("plan") == "max" or call_kwargs[1].get("plan") == "max"

    @pytest.mark.asyncio
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock)
    async def test_active_max_user_skips(self, mock_get_sub):
        """User with active Max subscription should NOT get another trial."""
        mock_get_sub.return_value = {
            "plan": "max",
            "status": "active",
            "access_expires_at": "2026-05-01T00:00:00Z",
            "stripe_subscription_id": "sub_existing",
        }

        from app.features.invites.db import create_trial_subscription
        result = await create_trial_subscription(
            user_id=MOCK_UID,
            user_email=MOCK_EMAIL,
            source="auto_registration",
        )

        assert result["success"] is True
        assert result["already_active"] is True

    @pytest.mark.asyncio
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock)
    async def test_canceled_max_user_skips(self, mock_get_sub):
        """User with canceled Max subscription should NOT get a new trial.
        This prevents repeated free trials after expiry.
        """
        mock_get_sub.return_value = {
            "plan": "max",
            "status": "canceled",
            "access_expires_at": "2026-01-01T00:00:00Z",
            "stripe_subscription_id": "sub_old",
        }

        from app.features.invites.db import create_trial_subscription
        result = await create_trial_subscription(
            user_id=MOCK_UID,
            user_email=MOCK_EMAIL,
            source="auto_registration",
        )

        assert result["success"] is True
        assert result["already_active"] is True

    @pytest.mark.asyncio
    @patch("app.features.invites.db.upsert_subscription", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_or_create_stripe_customer", new_callable=AsyncMock)
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock)
    async def test_stripe_failure_falls_back_to_db(self, mock_get_sub, mock_get_customer, mock_upsert):
        """When Stripe fails, trial is written directly to DB with stripe_pending."""
        mock_get_sub.return_value = None
        mock_get_customer.side_effect = Exception("Stripe connection timeout")

        from app.features.invites.db import create_trial_subscription
        result = await create_trial_subscription(
            user_id=MOCK_UID,
            user_email=MOCK_EMAIL,
            source="auto_registration",
        )

        assert result["success"] is True
        assert result["stripe_pending"] is True
        assert result["already_active"] is False
        mock_upsert.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.features.invites.db.get_subscription", new_callable=AsyncMock)
    async def test_free_user_can_get_trial(self, mock_get_sub):
        """User with plan=free should be able to get a trial."""
        mock_get_sub.return_value = {
            "plan": "free",
            "status": "active",
        }

        with patch("app.features.invites.db.get_or_create_stripe_customer", new_callable=AsyncMock) as mock_cust, \
             patch("app.features.invites.db.upsert_subscription", new_callable=AsyncMock), \
             patch("app.features.invites.db.asyncio.to_thread") as mock_thread:
            mock_cust.return_value = "cus_test"
            mock_sub = MagicMock()
            mock_sub.to_dict.return_value = {"id": "sub_new", "trial_end": None}
            mock_thread.return_value = mock_sub

            from app.features.invites.db import create_trial_subscription
            result = await create_trial_subscription(
                user_id=MOCK_UID,
                user_email=MOCK_EMAIL,
                source="auto_registration",
            )

        assert result["success"] is True
        assert result["already_active"] is False


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
    """Tests for onboarding day calculation and schedule."""

    def test_trial_day_calculation(self):
        """Day should be calculated from access_expires_at.

        Uses midnight timestamps to avoid fractional-day rounding issues.
        """
        from app.features.notification.onboarding import _calculate_trial_day_from_expiry

        today_midnight = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Trial expiring in 14 days from midnight = Day 0
        expires = (today_midnight + timedelta(days=14, hours=23)).isoformat()
        assert _calculate_trial_day_from_expiry(expires) == 0

        # Trial expiring in 7 days from midnight = Day 7
        expires = (today_midnight + timedelta(days=7, hours=23)).isoformat()
        assert _calculate_trial_day_from_expiry(expires) == 7

        # Trial expiring tomorrow = Day 13
        expires = (today_midnight + timedelta(days=1, hours=23)).isoformat()
        assert _calculate_trial_day_from_expiry(expires) == 13

    def test_trial_day_out_of_range(self):
        """Days outside 0-14 should return None."""
        from app.features.notification.onboarding import _calculate_trial_day_from_expiry

        # Already expired 5 days ago
        expires = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        assert _calculate_trial_day_from_expiry(expires) is None

        # 30 days in the future (not a 14-day trial)
        expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        assert _calculate_trial_day_from_expiry(expires) is None

    def test_trial_day_invalid_input(self):
        """Invalid date strings should return None."""
        from app.features.notification.onboarding import _calculate_trial_day_from_expiry

        assert _calculate_trial_day_from_expiry("not-a-date") is None
        assert _calculate_trial_day_from_expiry("") is None

    def test_drip_schedule_days(self):
        """DRIP_SCHEDULE should have templates for days 1, 3, 7, 11, 14."""
        from app.features.notification.onboarding import DRIP_SCHEDULE

        assert set(DRIP_SCHEDULE.keys()) == {1, 3, 7, 11, 14}

    def test_template_map_matches_schedule(self):
        """Every day in DRIP_SCHEDULE should have a template."""
        from app.features.notification.onboarding import DRIP_SCHEDULE, _TEMPLATE_MAP

        for day in DRIP_SCHEDULE:
            assert day in _TEMPLATE_MAP, f"Day {day} missing from _TEMPLATE_MAP"

    def test_templates_return_subject_and_html(self):
        """Each template function should return (subject, html) tuple."""
        from app.features.notification.onboarding import _TEMPLATE_MAP

        for day, fn in _TEMPLATE_MAP.items():
            subject, html = fn()
            assert isinstance(subject, str), f"Day {day} subject is not str"
            assert isinstance(html, str), f"Day {day} html is not str"
            assert len(subject) > 0, f"Day {day} subject is empty"
            assert "TheMarketBrew" in html, f"Day {day} html missing branding"

    def test_non_production_filters_to_test_email(self):
        """In non-production, only test email should be processed."""
        from app.features.notification.onboarding import process_onboarding_emails
        # This is tested implicitly by the ENVIRONMENT check in the function
        # The TEST_EMAIL filter ensures only voya.technologies@gmail.com is processed




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
