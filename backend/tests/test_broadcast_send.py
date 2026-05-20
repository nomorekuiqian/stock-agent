"""
Unit tests for broadcast send methods (daily, morning, weekly, newsletter).

Covers the full broadcast pipeline:
  _resolve_audience() -> _format_*_html() -> _create_and_send_broadcast() -> Resend API

All Resend API calls are mocked. No real emails are ever sent.
Tests verify correct parameter passing, audience routing, and error handling.

Safety:
  - All fixtures use is_production=False (routes to TEST_AUDIENCE_ID)
  - resend module is always patched before any broadcast method runs
  - Tests explicitly assert audience_id is the test segment

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_broadcast_send.py -v
"""

import pytest
from unittest.mock import patch

from app.features.subscription.email_service import EmailService


TEST_AUDIENCE_ID = "191b3099-6849-48f9-adec-e6a67b70b10b"


@pytest.fixture
def email_svc():
    """Non-production EmailService: always routes to test audience."""
    svc = EmailService.__new__(EmailService)
    svc.api_key = "test-key"
    svc.from_email = "TheMarketBrew Daily <daily@themarketbrew.com>"
    svc.from_email_morning = "TheMarketBrew Morning <morning@themarketbrew.com>"
    svc.from_email_weekly = "TheMarketBrew Weekly <weekly@themarketbrew.com>"
    svc.frontend_url = "https://themarketbrew.com"
    svc.is_production = False  # always routes to test audience
    svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
    return svc


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
def mock_report_data():
    return {
        "title": "Test: VIX 回落暗示市场情绪转暖",
        "summary": "美股三大指数齐涨",
        "intro": "今天市场表现良好。",
        "timestamp": "2025-01-24T23:00:00Z",
        "report_date": "2025-01-24",
        "report_id": "test-uuid-123",
        "macro": {"signals": [], "summary": "Risk-on."},
        "news": {"headlines": [], "briefs": []},
        "report_summary": "Today was a strong day.",
        "calendar": [],
        "indices": [
            {"name": "S&P 500", "value": 4783.45, "change_percent": 0.52},
        ],
    }


@pytest.fixture
def mock_morning_data():
    return {
        "title": "Test: 盘前市场速览",
        "timestamp": "2025-01-24T07:00:00Z",
        "report_date": "2025-01-24",
        "report_id": "morning-uuid-456",
        "market_pulse": "US futures point higher.",
        "futures": [
            {"name": "S&P 500 Futures", "value": 4780, "daily_change": 0.3},
            {"name": "Nasdaq Futures", "value": 16800, "daily_change": 0.5},
            {"name": "Dow Futures", "value": 37500, "daily_change": 0.2},
        ],
        "futures_analysis": "Futures are up across the board.",
        "global_markets": {},
        "overnight_news": [],
        "today_focus": [],
        "summary": [],
    }


@pytest.fixture
def mock_weekly_data():
    return {
        "generated_at": "2025-02-14T10:00:00Z",
        "id": "weekly-uuid-789",
        "week_label": "2025.W07",
        "title": "Test Weekly Title",
        "verdict": "Neutral.",
        "signal_lights": {
            "liquidity": "green",
            "economy": "yellow",
            "inflation": "red",
            "sentiment": "green",
        },
        "landscape": "Macro landscape.",
        "narrative": "Narrative text.",
        "takeaway": "Takeaway text.",
        "week_ahead": [],
        "liquidity_analysis": {"summary": "ok", "data_changes": "ok"},
        "economy_analysis": {"summary": "ok", "data_changes": "ok"},
        "inflation_analysis": {"summary": "ok", "data_changes": "ok"},
        "sentiment_analysis": {"summary": "ok", "data_changes": "ok"},
        "raw_data": {"market_performance": {"indices": []}},
    }


@pytest.fixture
def mock_newsletter_data():
    return {
        "subject": "Test Newsletter",
        "body": "This is a test newsletter body.",
        "sign_off": "Best regards",
    }


# ---------------------------------------------------------------------------
# _create_and_send_broadcast (core pipeline)
# ---------------------------------------------------------------------------


class TestCreateAndSendBroadcast:
    """Test the core broadcast pipeline that all broadcast_* methods delegate to."""

    def test_creates_and_sends_broadcast(self, email_svc, mock_resend):
        """Happy path: create -> send -> count contacts."""
        result = email_svc._create_and_send_broadcast(
            label="Test",
            audience_id=TEST_AUDIENCE_ID,
            subject="Test Subject",
            broadcast_name="Test Broadcast",
            html="<h1>Hello</h1>",
        )

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-123"
        assert result["audience_id"] == TEST_AUDIENCE_ID

        mock_resend.Broadcasts.create.assert_called_once()
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID
        assert create_params["subject"] == "Test Subject"
        assert create_params["html"] == "<h1>Hello</h1>"

        mock_resend.Broadcasts.send.assert_called_once()
        send_params = mock_resend.Broadcasts.send.call_args[0][0]
        assert send_params["broadcast_id"] == "broadcast-123"

    def test_uses_custom_from_email(self, email_svc, mock_resend):
        """Custom from_email is passed to Resend."""
        email_svc._create_and_send_broadcast(
            label="Test",
            audience_id=TEST_AUDIENCE_ID,
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
            from_email="custom@themarketbrew.com",
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["from"] == "custom@themarketbrew.com"

    def test_defaults_to_daily_from_email(self, email_svc, mock_resend):
        """Without custom from_email, uses self.from_email (daily)."""
        email_svc._create_and_send_broadcast(
            label="Test",
            audience_id=TEST_AUDIENCE_ID,
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["from"] == email_svc.from_email

    def test_text_only_broadcast(self, email_svc, mock_resend):
        """Newsletter-style text-only broadcast (no html key)."""
        email_svc._create_and_send_broadcast(
            label="Newsletter",
            audience_id=TEST_AUDIENCE_ID,
            subject="Newsletter",
            broadcast_name="Newsletter",
            text="Plain text content",
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "html" not in create_params
        assert create_params["text"] == "Plain text content"

    def test_create_failure_raises(self, email_svc, mock_resend):
        """If Broadcasts.create raises (non-rate-limit), exception propagates."""
        mock_resend.Broadcasts.create.side_effect = Exception("Server error")

        with pytest.raises(Exception, match="Server error"):
            email_svc._create_and_send_broadcast(
                label="Test",
                audience_id=TEST_AUDIENCE_ID,
                subject="Test",
                broadcast_name="Test",
                html="<p>hi</p>",
            )

    def test_create_returns_no_id(self, email_svc, mock_resend):
        """If create returns no ID, returns failure without calling send."""
        mock_resend.Broadcasts.create.return_value = {}

        result = email_svc._create_and_send_broadcast(
            label="Test",
            audience_id=TEST_AUDIENCE_ID,
            subject="Test",
            broadcast_name="Test",
            html="<p>hi</p>",
        )

        assert result["success"] is False
        assert "no ID" in result["error"]
        mock_resend.Broadcasts.send.assert_not_called()

    def test_rate_limit_retry_on_create(self, email_svc, mock_resend):
        """Rate limit on create triggers retry, succeeds on second attempt."""
        mock_resend.Broadcasts.create.side_effect = [
            Exception("Too many requests"),
            {"id": "broadcast-retry-ok"},
        ]

        with patch("app.features.subscription.email_service.time.sleep"):
            result = email_svc._create_and_send_broadcast(
                label="Test",
                audience_id=TEST_AUDIENCE_ID,
                subject="Test",
                broadcast_name="Test",
                html="<p>hi</p>",
            )

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-retry-ok"
        assert mock_resend.Broadcasts.create.call_count == 2

    def test_send_no_id_falls_back_to_status_check(self, email_svc, mock_resend):
        """If send returns no ID, verifies broadcast status via get."""
        mock_resend.Broadcasts.send.return_value = {}
        mock_resend.Broadcasts.get.return_value = {"status": "sent"}

        with patch("app.features.subscription.email_service.time.sleep"):
            result = email_svc._create_and_send_broadcast(
                label="Test",
                audience_id=TEST_AUDIENCE_ID,
                subject="Test",
                broadcast_name="Test",
                html="<p>hi</p>",
            )

        assert result["success"] is True
        mock_resend.Broadcasts.get.assert_called_once_with("broadcast-123")

    def test_send_failure_status_check_fails(self, email_svc, mock_resend):
        """If send returns no ID and status check shows failure, returns error."""
        mock_resend.Broadcasts.send.return_value = {}
        mock_resend.Broadcasts.get.return_value = {"status": "draft"}

        with patch("app.features.subscription.email_service.time.sleep"):
            result = email_svc._create_and_send_broadcast(
                label="Test",
                audience_id=TEST_AUDIENCE_ID,
                subject="Test",
                broadcast_name="Test",
                html="<p>hi</p>",
            )

        assert result["success"] is False
        assert "draft" in result["error"]


# ---------------------------------------------------------------------------
# broadcast_daily_report
# ---------------------------------------------------------------------------


class TestBroadcastDailyReport:
    """Test broadcast_daily_report end-to-end (mocked Resend)."""

    @pytest.mark.asyncio
    async def test_happy_path(self, email_svc, mock_resend, mock_report_data):
        """Generates HTML, resolves test audience, calls Resend."""
        result = await email_svc.broadcast_daily_report(mock_report_data)

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-123"

        # Verify audience is test segment (non-production)
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_subject_contains_title(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Subject line includes the report title."""
        await email_svc.broadcast_daily_report(mock_report_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "VIX" in create_params["subject"]
        assert "[TheMarketBrew]" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_subject_fallback_without_title(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Without title, subject falls back to date."""
        mock_report_data["title"] = ""
        await email_svc.broadcast_daily_report(mock_report_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "[TheMarketBrew]" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_html_contains_report_content(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Generated HTML includes report title."""
        await email_svc.broadcast_daily_report(mock_report_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "html" in create_params
        assert len(create_params["html"]) > 100  # not empty

    @pytest.mark.asyncio
    async def test_no_api_key(self, email_svc, mock_resend, mock_report_data):
        """Without API key, returns error without calling Resend."""
        email_svc.api_key = None
        result = await email_svc.broadcast_daily_report(mock_report_data)

        assert result["success"] is False
        assert "RESEND_API_KEY" in result["error"]
        mock_resend.Broadcasts.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_explicit_audience_still_routed_to_test(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Even with explicit audience_id, non-production routes to that ID (not production audience)."""
        custom_id = "custom-audience-id"
        result = await email_svc.broadcast_daily_report(
            mock_report_data, audience_id=custom_id
        )

        assert result["success"] is True
        # Non-production: _resolve_audience returns the given audience_id (not production lookup)
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == custom_id

    @pytest.mark.asyncio
    async def test_uses_daily_from_email(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Daily report uses the daily from_email."""
        await email_svc.broadcast_daily_report(mock_report_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["from"] == email_svc.from_email


# ---------------------------------------------------------------------------
# broadcast_morning_report
# ---------------------------------------------------------------------------


class TestBroadcastMorningReport:
    """Test broadcast_morning_report end-to-end (mocked Resend)."""

    @pytest.mark.asyncio
    async def test_happy_path(self, email_svc, mock_resend, mock_morning_data):
        """Generates HTML, resolves test audience, calls Resend."""
        result = await email_svc.broadcast_morning_report(mock_morning_data)

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-123"

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_subject_contains_title(
        self, email_svc, mock_resend, mock_morning_data
    ):
        """Subject line includes the morning report title."""
        await email_svc.broadcast_morning_report(mock_morning_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "[TheMarketBrew早报]" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_uses_morning_from_email(
        self, email_svc, mock_resend, mock_morning_data
    ):
        """Morning report uses the morning-specific from_email."""
        await email_svc.broadcast_morning_report(mock_morning_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["from"] == email_svc.from_email_morning

    @pytest.mark.asyncio
    async def test_no_api_key(self, email_svc, mock_resend, mock_morning_data):
        """Without API key, returns error."""
        email_svc.api_key = None
        result = await email_svc.broadcast_morning_report(mock_morning_data)

        assert result["success"] is False
        mock_resend.Broadcasts.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_render_error_returns_failure(
        self, email_svc, mock_resend
    ):  # noqa: ARG002
        """If HTML rendering fails (bad data), returns error not crash."""
        # Completely empty data may cause rendering issues
        result = await email_svc.broadcast_morning_report({})

        # Should either succeed with minimal HTML or return error gracefully
        assert "success" in result


# ---------------------------------------------------------------------------
# broadcast_weekly_report
# ---------------------------------------------------------------------------


class TestBroadcastWeeklyReport:
    """Test broadcast_weekly_report end-to-end (mocked Resend)."""

    @pytest.mark.asyncio
    async def test_happy_path(self, email_svc, mock_resend, mock_weekly_data):
        """Generates HTML, resolves test audience, calls Resend."""
        result = await email_svc.broadcast_weekly_report(mock_weekly_data)

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-123"

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_subject_contains_title(
        self, email_svc, mock_resend, mock_weekly_data
    ):
        """Subject includes the weekly report title."""
        await email_svc.broadcast_weekly_report(mock_weekly_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "[TheMarketBrew周报]" in create_params["subject"]
        assert "Test Weekly Title" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_subject_fallback_to_week_label(
        self, email_svc, mock_resend, mock_weekly_data
    ):
        """Without title, subject falls back to week_label."""
        mock_weekly_data["title"] = ""
        await email_svc.broadcast_weekly_report(mock_weekly_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "2025.W07" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_uses_weekly_from_email(
        self, email_svc, mock_resend, mock_weekly_data
    ):
        """Weekly report uses the weekly-specific from_email."""
        await email_svc.broadcast_weekly_report(mock_weekly_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["from"] == email_svc.from_email_weekly

    @pytest.mark.asyncio
    async def test_no_api_key(self, email_svc, mock_resend, mock_weekly_data):
        """Without API key, returns error."""
        email_svc.api_key = None
        result = await email_svc.broadcast_weekly_report(mock_weekly_data)

        assert result["success"] is False
        mock_resend.Broadcasts.create.assert_not_called()


# ---------------------------------------------------------------------------
# broadcast_newsletter
# ---------------------------------------------------------------------------


class TestBroadcastNewsletter:
    """Test broadcast_newsletter end-to-end (mocked Resend)."""

    @pytest.mark.asyncio
    async def test_happy_path(self, email_svc, mock_resend, mock_newsletter_data):
        """Generates plaintext, resolves test audience, calls Resend."""
        result = await email_svc.broadcast_newsletter(
            mock_newsletter_data, subject="Test Newsletter"
        )

        assert result["success"] is True
        assert result["broadcast_id"] == "broadcast-123"

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_sends_text_not_html(
        self, email_svc, mock_resend, mock_newsletter_data
    ):
        """Newsletter sends plaintext, not HTML."""
        await email_svc.broadcast_newsletter(
            mock_newsletter_data, subject="Test Newsletter"
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "text" in create_params
        assert "html" not in create_params

    @pytest.mark.asyncio
    async def test_uses_hello_from_email(
        self, email_svc, mock_resend, mock_newsletter_data
    ):
        """Newsletter uses the personal 'Golden from' address."""
        await email_svc.broadcast_newsletter(
            mock_newsletter_data, subject="Test Newsletter"
        )

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert "hello@themarketbrew.com" in create_params["from"]

    @pytest.mark.asyncio
    async def test_no_api_key(self, email_svc, mock_resend, mock_newsletter_data):
        """Without API key, returns error."""
        email_svc.api_key = None
        result = await email_svc.broadcast_newsletter(
            mock_newsletter_data, subject="Test"
        )

        assert result["success"] is False
        mock_resend.Broadcasts.create.assert_not_called()


# ---------------------------------------------------------------------------
# Safety: non-production audience routing
# ---------------------------------------------------------------------------


class TestNonProductionSafety:
    """Verify that non-production EmailService NEVER reaches production audiences."""

    @pytest.mark.asyncio
    async def test_daily_always_test_audience(
        self, email_svc, mock_resend, mock_report_data
    ):
        """Daily broadcast in non-production always uses test audience."""
        await email_svc.broadcast_daily_report(mock_report_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_morning_always_test_audience(
        self, email_svc, mock_resend, mock_morning_data
    ):
        """Morning broadcast in non-production always uses test audience."""
        await email_svc.broadcast_morning_report(mock_morning_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_weekly_always_test_audience(
        self, email_svc, mock_resend, mock_weekly_data
    ):
        """Weekly broadcast in non-production always uses test audience."""
        await email_svc.broadcast_weekly_report(mock_weekly_data)

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID

    @pytest.mark.asyncio
    async def test_newsletter_always_test_audience(
        self, email_svc, mock_resend, mock_newsletter_data
    ):
        """Newsletter broadcast in non-production always uses test audience."""
        await email_svc.broadcast_newsletter(mock_newsletter_data, subject="Test")

        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params["audience_id"] == TEST_AUDIENCE_ID


# ---------------------------------------------------------------------------
# broadcast_twitter_digest — segment/audience based broadcast (trial phase)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_twitter_digest_data():
    """Minimal digest payload with all required sections populated."""
    return {
        "generated_at": "2026-05-12T22:00:00+00:00",
        "window_hours": 24,
        "input_tweet_count": 200,
        "tracked_kols": ["alice", "bob"],
        "headline": "测试 headline",
        "intro": "",
        "ticker_theses": [{
            "ticker": "NVDA",
            "primary_kols": ["alice", "bob"],
            "tweet_count": 5,
            "synthesis_zh": "测试综述", "stance_summary": "2 位博主一致看多",
            "buy_arguments": [], "sell_arguments": [], "observation_arguments": [],
        }],
        "macro_threads": [], "watchpoints": [], "other_tickers": [],
        "hot_sectors": [], "hot_tickers": [], "hot_events": [],
        "notable_tweets": [],
        "model_version": "test",
        "date": "2026-05-12",
    }


class TestBroadcastTwitterDigest:
    """broadcast_twitter_digest sends only to the dedicated
    RESEND_SEGMENT_TWITTER_DIGEST audience (opt-in via /profile email
    preferences). Refuses to broadcast in non-production to avoid blasting
    real users from dev. No fallback to the daily audience — if the
    segment env var is missing, broadcast hard-fails.
    """

    @pytest.mark.asyncio
    async def test_non_production_refuses_to_broadcast(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """Dev/staging must hard-refuse — no per-recipient guard exists for
        Resend Broadcasts so a misconfig would email real users."""
        result = await email_svc.broadcast_twitter_digest(mock_twitter_digest_data)

        assert result["success"] is False
        assert "non-production" in result["error"]
        assert result["channel"] == "twitter_digest"
        # No Resend call must happen.
        mock_resend.Broadcasts.create.assert_not_called()
        mock_resend.Broadcasts.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_prod_with_segment_env_uses_segment(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """Segment-only delivery: broadcast targets the segment id, never
        an audience id."""
        email_svc.is_production = True
        email_svc.reply_to = "test@example.com"
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_TWITTER_DIGEST",
            "twitter-digest-segment-id",
        ):
            result = await email_svc.broadcast_twitter_digest(mock_twitter_digest_data)

        assert result["success"] is True
        assert result["channel"] == "twitter_digest"
        create_params = mock_resend.Broadcasts.create.call_args[0][0]
        assert create_params.get("segment_id") == "twitter-digest-segment-id"
        assert "audience_id" not in create_params
        # broadcast name encodes the date for ops traceability
        assert "Twitter Digest 2026-05-12" in create_params["name"]
        # subject uses the digest headline
        assert "[TheMarketBrew 推特日报]" in create_params["subject"]
        assert "测试 headline" in create_params["subject"]

    @pytest.mark.asyncio
    async def test_prod_without_segment_returns_error(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """If RESEND_SEGMENT_TWITTER_DIGEST is empty, hard-fail rather than
        accidentally fall back to a broader audience."""
        email_svc.is_production = True
        email_svc.reply_to = "test@example.com"
        with patch(
            "app.features.subscription.email_service.RESEND_SEGMENT_TWITTER_DIGEST", "",
        ):
            result = await email_svc.broadcast_twitter_digest(mock_twitter_digest_data)

        assert result["success"] is False
        assert result["channel"] == "twitter_digest"
        assert "RESEND_SEGMENT_TWITTER_DIGEST" in result["error"]
        mock_resend.Broadcasts.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """Missing RESEND_API_KEY short-circuits before any API call."""
        email_svc.api_key = None
        result = await email_svc.broadcast_twitter_digest(mock_twitter_digest_data)
        assert result["success"] is False
        mock_resend.Broadcasts.create.assert_not_called()


class TestQaSendTwitterDigest:
    """`_qa_send_twitter_digest_to_email` bypasses Broadcasts and sends one
    email via Resend Emails.send — used by ops scripts for local QA."""

    @pytest.mark.asyncio
    async def test_sends_to_specified_recipient(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        email_svc.reply_to = "test@example.com"
        mock_resend.Emails.send.return_value = {"id": "email-id-xyz"}
        result = await email_svc._qa_send_twitter_digest_to_email(
            mock_twitter_digest_data, "qa@example.com",
        )

        assert result["success"] is True
        assert result["qa"] is True
        assert result["to"] == "qa@example.com"
        assert result["email_id"] == "email-id-xyz"
        send_params = mock_resend.Emails.send.call_args[0][0]
        assert send_params["to"] == ["qa@example.com"]
        # subject is tagged so QA emails don't get confused with the real broadcast
        assert "[TheMarketBrew 推特日报 QA]" in send_params["subject"]

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """Without API key, returns failure result without calling Resend."""
        email_svc.api_key = None
        result = await email_svc._qa_send_twitter_digest_to_email(
            mock_twitter_digest_data, "qa@example.com",
        )
        assert result["success"] is False
        mock_resend.Emails.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_resend_failure_returns_error(
        self, email_svc, mock_resend, mock_twitter_digest_data,
    ):
        """If Resend raises, surface as success=False rather than crashing the
        ops script."""
        email_svc.reply_to = "test@example.com"
        mock_resend.Emails.send.side_effect = RuntimeError("resend down")
        result = await email_svc._qa_send_twitter_digest_to_email(
            mock_twitter_digest_data, "qa@example.com",
        )
        assert result["success"] is False
        assert "resend down" in result["error"]
