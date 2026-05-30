"""
Unit tests for email preferences feature.

Covers:
  - _resolve_segment() method (dev vs prod, edge cases)
  - _create_and_send_broadcast with segment_id parameter
  - broadcast_* methods in production mode (segment routing)
  - Pydantic models (EmailPreferences, UpdatePreferencesRequest)
  - SubscriptionService segment CRUD (get/update preferences, add_to_default_segments)

All Resend API calls are mocked. No real emails are ever sent.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.features.subscription.email_service import EmailService
from app.features.subscription.models import (
    EmailPreferences,
    UpdatePreferencesRequest,
    PreferencesResponse,
)


TEST_AUDIENCE_ID = "191b3099-6849-48f9-adec-e6a67b70b10b"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def email_svc():
    """Non-production EmailService."""
    svc = EmailService.__new__(EmailService)
    svc.api_key = "test-key"
    svc.from_email = "TheMarketBrew Daily <daily@themarketbrew.com>"
    svc.from_email_morning = "TheMarketBrew Morning <morning@themarketbrew.com>"
    svc.from_email_weekly = "TheMarketBrew Weekly <weekly@themarketbrew.com>"
    svc.frontend_url = "https://themarketbrew.com"
    svc.is_production = False
    svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
    svc.reply_to = "test@example.com"
    return svc


@pytest.fixture
def prod_email_svc(email_svc):
    """Production EmailService."""
    email_svc.is_production = True
    return email_svc


@pytest.fixture
def mock_resend():
    """Patch resend module to prevent any real API calls."""
    with patch("app.features.subscription.email_service.resend") as m:
        m.Broadcasts.create.return_value = {"id": "broadcast-123"}
        m.Broadcasts.send.return_value = {"id": "send-123"}
        m.Broadcasts.get.return_value = {"status": "sent"}
        m.Contacts.list.return_value = {"data": [{"id": "c1"}, {"id": "c2"}]}
        yield m


@pytest.fixture
def mock_service_resend():
    """Patch resend for SubscriptionService tests."""
    with patch("app.features.subscription.service.resend") as m:
        m.ContactSegments.add.return_value = {"id": "seg-add-ok"}
        m.ContactSegments.remove.return_value = {"id": "seg-remove-ok"}
        m.ContactSegments.list.return_value = {
            "data": [
                {"id": "seg-morning-id"},
                {"id": "seg-evening-id"},
            ]
        }
        yield m


# ---------------------------------------------------------------------------
# send_daily_report cta_variant param
# ---------------------------------------------------------------------------


class TestSendDailyReportCtaVariant:
    """Single-send accepts cta_variant and threads it into the rendered HTML.

    The variant param replaced the old behavior of looking up the recipient
    in the paid_cta.py whitelist. With the whitelist gone, callers must
    explicitly pass the variant they want — defaults to upsell.
    """

    @pytest.fixture
    def report_data(self):
        return {
            "title": "Test Report",
            "report_date": "2026-05-09",
            "report_id": "test-id-123",
            "macro": {"signals": [], "summary": "ok"},
            "news": {"headlines": [], "briefs": []},
        }

    @pytest.mark.asyncio
    async def test_default_variant_is_upsell(self, prod_email_svc, mock_resend, report_data):
        """No cta_variant arg -> upsell HTML (free user pricing CTA)."""
        mock_resend.Emails.send.return_value = {"id": "email-1"}
        with patch(
            "app.features.subscription.email_service.get_subscription_service"
        ) as svc_fn:
            svc_fn.return_value.get_status.return_value = {"subscribed": False}
            result = await prod_email_svc.send_daily_report(
                report_data, to_email="user@test.com", first_name="User"
            )

        assert result["success"] is True
        params = mock_resend.Emails.send.call_args[0][0]
        html = params.get("html", "")
        # Upsell: pricing CTA visible, no "感谢订阅"
        assert "/pricing" in html
        assert "感谢订阅" not in html

    @pytest.mark.asyncio
    async def test_explicit_paid_variant_renders_thank_you(
        self, prod_email_svc, mock_resend, report_data
    ):
        """cta_variant='paid' -> thank-you HTML pointing to /for-you and /stock."""
        mock_resend.Emails.send.return_value = {"id": "email-2"}
        with patch(
            "app.features.subscription.email_service.get_subscription_service"
        ) as svc_fn:
            svc_fn.return_value.get_status.return_value = {"subscribed": False}
            result = await prod_email_svc.send_daily_report(
                report_data,
                to_email="paid@test.com",
                first_name="Paid",
                cta_variant="paid",
            )

        assert result["success"] is True
        params = mock_resend.Emails.send.call_args[0][0]
        html = params.get("html", "")
        # Paid variant: thank-you copy, member feature URLs, no upgrade nudge
        assert "感谢订阅" in html
        assert "/for-you" in html
        assert "/stock" in html
        assert "/pricing" not in html

    @pytest.mark.asyncio
    async def test_two_variants_render_distinct_html(
        self, prod_email_svc, mock_resend, report_data
    ):
        """Sanity check: same input + different variant => different HTML.

        Guards against a regression where cta_variant is silently dropped
        before reaching format_html_report (e.g. parameter shadowing).
        """
        mock_resend.Emails.send.return_value = {"id": "email-x"}
        with patch(
            "app.features.subscription.email_service.get_subscription_service"
        ) as svc_fn:
            svc_fn.return_value.get_status.return_value = {"subscribed": False}

            await prod_email_svc.send_daily_report(
                report_data, to_email="x@test.com", cta_variant="upsell"
            )
            html_upsell = mock_resend.Emails.send.call_args[0][0]["html"]

            await prod_email_svc.send_daily_report(
                report_data, to_email="x@test.com", cta_variant="paid"
            )
            html_paid = mock_resend.Emails.send.call_args[0][0]["html"]

        assert html_upsell != html_paid


# ---------------------------------------------------------------------------
# _resolve_segment
# ---------------------------------------------------------------------------


class TestResolveSegment:
    """Test _resolve_segment method."""

    def test_returns_none_in_dev_mode(self, email_svc):
        """Dev mode: any segment_id returns None."""
        assert email_svc._resolve_segment("seg-123") is None

    def test_returns_segment_in_prod_mode(self, prod_email_svc):
        """Prod mode: returns the segment_id as-is."""
        assert prod_email_svc._resolve_segment("seg-123") == "seg-123"

    def test_empty_string_returns_none_in_prod(self, prod_email_svc):
        """Prod mode: empty string returns None."""
        assert prod_email_svc._resolve_segment("") is None

    def test_none_returns_none_in_prod(self, prod_email_svc):
        """Prod mode: None returns None."""
        assert prod_email_svc._resolve_segment(None) is None

    def test_none_returns_none_in_dev(self, email_svc):
        """Dev mode: None input returns None."""
        assert email_svc._resolve_segment(None) is None


# ---------------------------------------------------------------------------
# _create_and_send_broadcast with segment_id
# ---------------------------------------------------------------------------


class TestCreateAndSendBroadcastSegment:
    """Test that _create_and_send_broadcast correctly handles segment_id."""

    def test_segment_id_in_create_params(self, email_svc, mock_resend):
        """When segment_id is provided, it appears in Broadcasts.create params."""
        email_svc._create_and_send_broadcast(
            label="Test",
            segment_id="seg-test-123",
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["segment_id"] == "seg-test-123"
        assert "audience_id" not in create_params

    def test_segment_id_takes_priority_over_audience(self, email_svc, mock_resend):
        """When both segment_id and audience_id are provided, segment_id wins."""
        email_svc._create_and_send_broadcast(
            label="Test",
            audience_id="aud-should-not-appear",
            segment_id="seg-wins",
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["segment_id"] == "seg-wins"
        assert "audience_id" not in create_params

    def test_no_segment_no_audience_returns_error(self, email_svc, mock_resend):
        """Without either segment_id or audience_id, returns failure."""
        result = email_svc._create_and_send_broadcast(
            label="Test",
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
        )

        assert result["success"] is False
        assert "No audience_id or segment_id" in result["error"]
        mock_resend.Broadcasts.create.assert_not_called()


# ---------------------------------------------------------------------------
# broadcast_* methods in production mode (segment routing)
# ---------------------------------------------------------------------------


class TestBroadcastProdSegmentRouting:
    """Test that all broadcast methods use segment_id in production."""

    @pytest.mark.asyncio
    async def test_daily_uses_free_and_paid_cta_segments_in_prod(
        self, prod_email_svc, mock_resend
    ):
        """broadcast_daily_report sends separate CTA variants in prod."""
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_DAILY_FREE_CTA",
            "seg-daily-free-cta",
        ), patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_DAILY_PAID_CTA",
            "seg-daily-paid-cta",
        ):
            result = await prod_email_svc.broadcast_daily_report(
                {"title": "Test", "report_date": "2026-03-11"}
            )

        assert result["success"] is True
        assert mock_resend.Broadcasts.create.call_count == 2
        create_calls = [c[0][0] for c in mock_resend.Broadcasts.create.call_args_list]
        segment_ids = {params.get("segment_id") for params in create_calls}
        assert segment_ids == {"seg-daily-free-cta", "seg-daily-paid-cta"}

        # Verify each broadcast's HTML contains the variant-specific CTA copy.
        by_seg = {params.get("segment_id"): params.get("html", "")
                  for params in create_calls}
        free_html = by_seg["seg-daily-free-cta"]
        paid_html = by_seg["seg-daily-paid-cta"]
        # Free variant: upsell to /pricing
        assert "/pricing" in free_html
        # Paid variant: thank-you, points to /for-you and /stock
        assert "感谢订阅" in paid_html
        assert "/for-you" in paid_html
        # Paid variant must NOT push the user to upgrade.
        assert "/pricing" not in paid_html

    @pytest.mark.asyncio
    async def test_morning_uses_morning_segment_in_prod(
        self, prod_email_svc, mock_resend
    ):
        """broadcast_morning_report sends to RESEND_SEGMENT_MORNING in prod."""
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_MORNING",
            "seg-morning-real",
        ):
            result = await prod_email_svc.broadcast_morning_report(
                {
                    "title": "Test",
                    "report_date": "2026-03-11",
                    "futures": [],
                    "global_markets": {},
                    "overnight_news": [],
                    "today_focus": [],
                    "summary": [],
                }
            )

        assert result["success"] is True
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params.get("segment_id") == "seg-morning-real"
        assert "audience_id" not in create_params

    @pytest.mark.asyncio
    async def test_weekly_uses_weekly_segment_in_prod(
        self, prod_email_svc, mock_resend
    ):
        """broadcast_weekly_report sends to RESEND_SEGMENT_WEEKLY in prod."""
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_WEEKLY",
            "seg-weekly-real",
        ):
            result = await prod_email_svc.broadcast_weekly_report(
                {"week_label": "2026.W10", "title": "Test"}
            )

        assert result["success"] is True
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params.get("segment_id") == "seg-weekly-real"
        assert "audience_id" not in create_params

    @pytest.mark.asyncio
    async def test_empty_segment_config_falls_back_to_audience(
        self, prod_email_svc, mock_resend
    ):
        """If RESEND_SEGMENT is empty in prod, falls back to audience."""
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_DAILY_FREE_CTA", ""
        ), patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_DAILY_PAID_CTA", ""
        ), patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_EVENING", ""
        ):
            result = await prod_email_svc.broadcast_daily_report(
                {"title": "Test", "report_date": "2026-03-11"}
            )

        assert result["success"] is True
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "audience_id" in create_params
        assert "segment_id" not in create_params

    @pytest.mark.asyncio
    async def test_explicit_audience_wins_in_prod(
        self, prod_email_svc, mock_resend
    ):
        """Explicit production test audience sends one broadcast to that audience."""
        result = await prod_email_svc.broadcast_daily_report(
            {"title": "Test", "report_date": "2026-03-11"},
            audience_id="aud-test-only",
        )

        assert result["success"] is True
        assert mock_resend.Broadcasts.create.call_count == 1
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == "aud-test-only"
        assert "segment_id" not in create_params


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TestPreferenceModels:
    """Test new Pydantic models for email preferences."""

    def test_email_preferences_defaults(self):
        """Free/default report preferences default on; Max-only twitter defaults off."""
        prefs = EmailPreferences()
        assert prefs.morning_report is True
        assert prefs.daily_report is True
        assert prefs.weekly_report is True
        assert prefs.personal_digest is True
        assert prefs.twitter_digest is False

    def test_email_preferences_explicit_values(self):
        """Explicit values override defaults."""
        prefs = EmailPreferences(morning_report=False, weekly_report=False)
        assert prefs.morning_report is False
        assert prefs.daily_report is True
        assert prefs.weekly_report is False
        assert prefs.twitter_digest is False

    def test_update_request_all_none_by_default(self):
        """UpdatePreferencesRequest fields are None by default (partial update)."""
        req = UpdatePreferencesRequest()
        assert req.morning_report is None
        assert req.daily_report is None
        assert req.weekly_report is None
        assert req.personal_digest is None

    def test_update_request_partial_update(self):
        """Only specified fields have values."""
        req = UpdatePreferencesRequest(morning_report=False)
        assert req.morning_report is False
        assert req.daily_report is None

    def test_preferences_response_structure(self):
        """PreferencesResponse contains success flag and preferences."""
        resp = PreferencesResponse(
            success=True,
            preferences=EmailPreferences(morning_report=False),
        )
        assert resp.success is True
        assert resp.preferences.morning_report is False
        assert resp.preferences.daily_report is True


# ---------------------------------------------------------------------------
# SubscriptionService segment CRUD
# ---------------------------------------------------------------------------


class TestSubscriptionServicePreferences:
    """Test SubscriptionService segment preference methods."""

    def test_get_email_preferences(self, mock_service_resend):
        """get_email_preferences returns bool dict based on segment membership."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }

        # Mock returns segments that user belongs to
        mock_service_resend.ContactSegments.list.return_value = {
            "data": [
                {"id": "seg-morning-id"},
                {"id": "seg-evening-id"},
                {"id": "seg-twitter-id"},
            ]
        }

        prefs = svc.get_email_preferences("user@test.com")

        assert prefs["morning_report"] is True
        assert prefs["daily_report"] is True
        assert prefs["weekly_report"] is False  # not in returned segments
        assert prefs["twitter_digest"] is True

    def test_get_email_preferences_empty_segment_config(self, mock_service_resend):
        """Missing free segments default on; missing Max segment defaults off."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "",  # not configured
            "daily_report": "seg-evening-id",
            "weekly_report": "",
            "twitter_digest": "",
        }

        mock_service_resend.ContactSegments.list.return_value = {"data": []}

        prefs = svc.get_email_preferences("user@test.com")

        assert prefs["morning_report"] is True  # default True (unconfigured)
        assert prefs["daily_report"] is False  # configured but not in segments
        assert prefs["weekly_report"] is True  # default True (unconfigured)
        assert prefs["twitter_digest"] is False  # Max-only never defaults on

    def test_update_email_preferences_add(self, mock_service_resend):
        """Enabling a preference calls ContactSegments.add."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
        }

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.update_email_preferences("user@test.com", {"morning_report": True})

        mock_service_resend.ContactSegments.add.assert_called_once_with(
            {"email": "user@test.com", "segment_id": "seg-morning-id"}
        )

    def test_update_email_preferences_remove(self, mock_service_resend):
        """Disabling a preference calls ContactSegments.remove."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.update_email_preferences("user@test.com", {"weekly_report": False})

        mock_service_resend.ContactSegments.remove.assert_called_once_with(
            {"email": "user@test.com", "segment_id": "seg-weekly-id"}
        )

    def test_update_twitter_digest_preference_toggles_segment(
        self, mock_service_resend,
    ):
        """Twitter Digest toggle off removes; Max toggle on adds."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.update_email_preferences(
                "user@test.com", {"twitter_digest": False},
            )
        mock_service_resend.ContactSegments.remove.assert_called_once_with(
            {"email": "user@test.com", "segment_id": "seg-twitter-id"}
        )

        mock_service_resend.ContactSegments.reset_mock()
        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.update_email_preferences(
                "user@test.com",
                {"twitter_digest": True},
                sub={"entitlements": ["twitter_digest"]},
            )
        mock_service_resend.ContactSegments.add.assert_called_once_with(
            {"email": "user@test.com", "segment_id": "seg-twitter-id"}
        )

    def test_update_twitter_digest_preference_blocks_non_max(
        self, mock_service_resend,
    ):
        """Non-Max callers cannot add the Twitter Digest segment."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "twitter_digest": "seg-twitter-id",
        }

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.update_email_preferences(
                "user@test.com",
                {"twitter_digest": True},
                sub={"entitlements": []},
            )

        mock_service_resend.ContactSegments.add.assert_not_called()
        mock_service_resend.ContactSegments.remove.assert_called_once_with(
            {"email": "user@test.com", "segment_id": "seg-twitter-id"}
        )

    def test_add_to_default_segments(self, mock_service_resend):
        """add_to_default_segments adds Daily plus the free CTA sending list."""
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }
        svc.DAILY_CTA_SEGMENT_IDS = {
            "free": "seg-free-cta",
            "paid": "seg-paid-cta",
        }

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.add_to_default_segments("new@test.com")

        add_calls = mock_service_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert added == {"seg-evening-id", "seg-free-cta"}
        mock_service_resend.ContactSegments.remove.assert_called_once_with(
            {"email": "new@test.com", "segment_id": "seg-paid-cta"}
        )


# ---------------------------------------------------------------------------
# Preferences endpoints (router-level unit tests)
# ---------------------------------------------------------------------------


class TestPreferencesEndpoints:
    """Test GET/POST /subscriptions/preferences via TestClient."""

    @pytest.fixture
    def client(self):
        """FastAPI test client with mocked auth."""
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.deps import verify_user_token_with_email

        async def mock_auth():
            return {"user_id": "test-user-123", "email": "test@example.com"}

        app.dependency_overrides[verify_user_token_with_email] = mock_auth
        c = TestClient(app)
        yield c
        app.dependency_overrides.pop(verify_user_token_with_email, None)

    def test_get_preferences(self, client):
        """GET /api/subscriptions/preferences returns preferences."""
        with patch(
            "app.features.subscription.router.get_subscription_service"
        ) as mock_svc_fn, patch(
            "app.features.subscription.router.has_entitlement",
            return_value=True,
        ):
            mock_svc = MagicMock()
            mock_svc.get_email_preferences.return_value = {
                "morning_report": True,
                "daily_report": True,
                "weekly_report": False,
            }
            mock_svc_fn.return_value = mock_svc

            resp = client.get(
                "/api/subscriptions/preferences",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["preferences"]["morning_report"] is True
        assert data["preferences"]["weekly_report"] is False
        # personal_digest comes from has_entitlement, not Resend
        assert data["preferences"]["personal_digest"] is True

    def test_post_preferences_update(self, client):
        """POST /api/subscriptions/preferences updates and returns preferences."""
        fake_sub = {
            "user_id": "user-123",
            "entitlements": [],
            "access_expires_at": None,
            "is_lifetime": False,
        }
        with patch(
            "app.features.subscription.router.get_subscription_service"
        ) as mock_svc_fn, patch(
            "app.features.subscription.router.has_entitlement",
            new_callable=AsyncMock,
            return_value=False,
        ), patch(
            "app.features.payment.db.get_subscription",
            new_callable=AsyncMock,
            return_value=fake_sub,
        ):
            mock_svc = MagicMock()
            mock_svc.get_email_preferences.return_value = {
                "morning_report": False,
                "daily_report": True,
                "weekly_report": True,
            }
            mock_svc.get_status.return_value = {"subscribed": True}
            mock_svc_fn.return_value = mock_svc

            resp = client.post(
                "/api/subscriptions/preferences",
                headers={"Authorization": "Bearer test-token"},
                json={"morning_report": False},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["preferences"]["morning_report"] is False
        mock_svc.update_email_preferences.assert_called_once_with(
            "test@example.com", {"morning_report": False}, fake_sub
        )

    def test_get_preferences_no_auth_returns_401(self):
        """GET /api/subscriptions/preferences without auth returns 401."""
        from fastapi.testclient import TestClient
        from app.main import app

        # Clear overrides to test real auth
        original = app.dependency_overrides.copy()
        app.dependency_overrides.clear()
        c = TestClient(app)
        resp = c.get("/api/subscriptions/preferences")
        app.dependency_overrides.update(original)

        assert resp.status_code == 401

    def test_post_preferences_personal_digest_ignored(self, client):
        """POST with personal_digest=false is ignored (auto-managed by entitlement)."""
        with patch(
            "app.features.subscription.router.get_subscription_service"
        ) as mock_svc_fn, patch(
            "app.features.subscription.router.has_entitlement",
            return_value=True,
        ):
            mock_svc = MagicMock()
            mock_svc.get_email_preferences.return_value = {
                "morning_report": True,
                "daily_report": True,
                "weekly_report": True,
            }
            mock_svc_fn.return_value = mock_svc

            resp = client.post(
                "/api/subscriptions/preferences",
                headers={"Authorization": "Bearer test-token"},
                json={"personal_digest": False},
            )

        assert resp.status_code == 200
        # personal_digest is read-only, unsubscribe should NOT be called
        mock_svc.unsubscribe.assert_not_called()
        # personal_digest value comes from entitlement, not request
        assert resp.json()["preferences"]["personal_digest"] is True


# ---------------------------------------------------------------------------
# Twitter Digest paywall regression coverage (added 2026-05-30)
# Covers: sync_resend_segments auto-add, get_email_preferences unsubscribed
# override, ensure_audience env-id branch, channel-scoped unsubscribe.
# ---------------------------------------------------------------------------


class TestGetEmailPreferencesUnsubscribed:
    """`Contacts.unsubscribed=true` is team-wide and must zero every channel.

    Prior to the 2026-05-30 fix this code only read segment membership, so
    a user who clicked the native Resend unsubscribe link still appeared
    `subscribed=true` on /profile even though every broadcast skipped them.
    """

    def _svc(self):
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }
        return svc

    def test_unsubscribed_contact_zeroes_every_channel(self, mock_service_resend):
        svc = self._svc()
        mock_service_resend.ContactSegments.list.return_value = {
            "data": [{"id": "seg-morning-id"}, {"id": "seg-twitter-id"}],
        }
        mock_service_resend.Contacts.get.return_value = {"unsubscribed": True}

        prefs = svc.get_email_preferences("user@test.com")

        assert prefs["morning_report"] is False
        assert prefs["twitter_digest"] is False
        assert prefs["daily_report"] is False
        assert prefs["weekly_report"] is False

    def test_subscribed_contact_reflects_segment_state(self, mock_service_resend):
        """Contacts.unsubscribed=false leaves segment membership as the source of truth."""
        svc = self._svc()
        mock_service_resend.ContactSegments.list.return_value = {
            "data": [{"id": "seg-twitter-id"}],
        }
        mock_service_resend.Contacts.get.return_value = {"unsubscribed": False}

        prefs = svc.get_email_preferences("user@test.com")

        assert prefs["twitter_digest"] is True
        assert prefs["morning_report"] is False

    def test_contacts_get_failure_defaults_to_not_unsubscribed(
        self, mock_service_resend,
    ):
        """Transient lookup failure must not flip every channel to false."""
        svc = self._svc()
        mock_service_resend.ContactSegments.list.return_value = {
            "data": [{"id": "seg-twitter-id"}],
        }
        mock_service_resend.Contacts.get.side_effect = RuntimeError("api down")

        prefs = svc.get_email_preferences("user@test.com")

        assert prefs["twitter_digest"] is True


class TestSyncResendSegmentsTwitterDigest:
    """Webhook-driven sync must add Max users and remove non-Max users.

    The 2026-05-30 change made `twitter_digest` entitlement-controlled —
    parity with morning/weekly. Lifetime users derive entitlements in code,
    so they must be picked up even with an empty `entitlements` array.
    """

    def _svc(self):
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }
        svc.DAILY_CTA_SEGMENT_IDS = {"free": "seg-free-cta", "paid": "seg-paid-cta"}
        return svc

    def test_max_user_added_when_missing(self, mock_service_resend):
        svc = self._svc()
        # Contact not in twitter_digest segment yet
        mock_service_resend.ContactSegments.list.return_value = {"data": []}
        mock_service_resend.Contacts.get.return_value = {"unsubscribed": False}

        with patch("app.features.subscription.service._rate_limit_wait"):
            actions = svc.sync_resend_segments(
                "max@test.com",
                {"entitlements": ["twitter_digest", "morning_report_email"]},
            )

        add_args = [c[0][0]["segment_id"] for c in mock_service_resend.ContactSegments.add.call_args_list]
        assert "seg-twitter-id" in add_args
        assert "seg-morning-id" in add_args
        assert any("twitter_digest" in a for a in actions)

    def test_non_max_user_removed_from_segment(self, mock_service_resend):
        svc = self._svc()
        # Currently in twitter_digest segment but entitlement gone
        mock_service_resend.ContactSegments.list.return_value = {
            "data": [{"id": "seg-twitter-id"}],
        }
        mock_service_resend.Contacts.get.return_value = {"unsubscribed": False}

        with patch("app.features.subscription.service._rate_limit_wait"):
            actions = svc.sync_resend_segments(
                "former-max@test.com",
                {"entitlements": []},
            )

        remove_args = [c[0][0]["segment_id"] for c in mock_service_resend.ContactSegments.remove.call_args_list]
        assert "seg-twitter-id" in remove_args
        assert any("twitter_digest" in a for a in actions)

    def test_lifetime_user_expands_entitlements_to_include_twitter_digest(
        self, mock_service_resend,
    ):
        """Lifetime users may have empty entitlements column but get all MAX features."""
        svc = self._svc()
        mock_service_resend.ContactSegments.list.return_value = {"data": []}
        mock_service_resend.Contacts.get.return_value = {"unsubscribed": False}

        with patch("app.features.subscription.service._rate_limit_wait"):
            svc.sync_resend_segments(
                "lifetime@test.com",
                {"is_lifetime": True, "entitlements": []},
            )

        add_args = [
            c[0][0]["segment_id"]
            for c in mock_service_resend.ContactSegments.add.call_args_list
        ]
        assert "seg-twitter-id" in add_args


class TestEnsureAudienceTwitterDigest:
    """Twitter digest channel must resolve from env config — never name-search.

    Name-based lookup would silently create a new empty audience if the
    real one was renamed/deleted, breaking the unsubscribe path.
    """

    def test_returns_audience_id_from_env(self, monkeypatch):
        from app.features.subscription import service as svc_mod
        from app.features.subscription.service import (
            SubscriptionChannel,
            SubscriptionService,
        )

        monkeypatch.setattr(
            SubscriptionService,
            "_AUDIENCE_ID_ENV",
            {SubscriptionChannel.TWITTER_DIGEST: "aud-twitter-from-env"},
        )

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc._audience_ids = {}

        with patch.object(svc_mod, "resend"):
            result = svc.ensure_audience(SubscriptionChannel.TWITTER_DIGEST)

        assert result == "aud-twitter-from-env"

    def test_missing_env_raises_value_error(self, monkeypatch):
        from app.features.subscription import service as svc_mod
        from app.features.subscription.service import (
            SubscriptionChannel,
            SubscriptionService,
        )

        monkeypatch.setattr(
            SubscriptionService,
            "_AUDIENCE_ID_ENV",
            {SubscriptionChannel.TWITTER_DIGEST: ""},
        )

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc._audience_ids = {}

        with patch.object(svc_mod, "resend"):
            with pytest.raises(ValueError, match="RESEND_AUDIENCE_TWITTER_DIGEST"):
                svc.ensure_audience(SubscriptionChannel.TWITTER_DIGEST)


class TestUnsubscribeChannelScoping:
    """`unsubscribe(TWITTER_DIGEST)` must never set team-wide `unsubscribed=true`.

    Resend's `unsubscribed` flag is global per contact — it stops every
    broadcast for that email, not just the channel being unsubscribed.
    Twitter digest carries an explicit "只退订推特日报" footer link, so
    cross-channel impact would be a UX bug.

    Other channels keep the historical "unsubscribe means everything" behavior.
    """

    def _svc(self):
        from app.features.subscription.service import SubscriptionService

        svc = SubscriptionService.__new__(SubscriptionService)
        svc.api_key = "test-key"
        svc._audience_ids = {}
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning-id",
            "daily_report": "seg-evening-id",
            "weekly_report": "seg-weekly-id",
            "twitter_digest": "seg-twitter-id",
        }
        svc.DAILY_CTA_SEGMENT_IDS = {"free": "seg-free-cta", "paid": "seg-paid-cta"}
        return svc

    def test_twitter_digest_unsubscribe_is_segment_only(self, mock_service_resend):
        """Twitter digest path skips Contacts.update entirely."""
        from app.features.subscription.service import SubscriptionChannel

        svc = self._svc()
        with patch("app.features.subscription.service._rate_limit_wait"):
            result = svc.unsubscribe(SubscriptionChannel.TWITTER_DIGEST, "user@test.com")

        assert result["success"] is True
        # Critical: NO Contacts.update — that would set team-wide unsubscribed
        mock_service_resend.Contacts.update.assert_not_called()
        # Did remove from the twitter segment via update_email_preferences
        remove_args = [
            c[0][0]["segment_id"]
            for c in mock_service_resend.ContactSegments.remove.call_args_list
        ]
        assert "seg-twitter-id" in remove_args

    def test_daily_unsubscribe_still_sets_global_unsubscribed(
        self, mock_service_resend,
    ):
        """Daily report path keeps team-wide unsubscribe behavior."""
        from app.features.subscription.service import SubscriptionChannel

        svc = self._svc()
        # ensure_audience for DAILY_REPORT does name lookup → mock that path
        svc._audience_ids = {SubscriptionChannel.DAILY_REPORT: "aud-daily"}
        with patch("app.features.subscription.service._rate_limit_wait"):
            result = svc.unsubscribe(SubscriptionChannel.DAILY_REPORT, "user@test.com")

        assert result["success"] is True
        mock_service_resend.Contacts.update.assert_called_once()
        call_kwargs = mock_service_resend.Contacts.update.call_args[0][0]
        assert call_kwargs["unsubscribed"] is True
        assert call_kwargs["email"] == "user@test.com"
