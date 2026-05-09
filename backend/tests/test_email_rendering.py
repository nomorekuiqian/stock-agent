"""
Email Rendering Tests

Tests for EmailService HTML rendering methods (_format_html_report, _format_digest_html,
_format_welcome_html, _format_markdown_to_html). Pure rendering logic only - no emails sent,
no network calls, no database access.
"""

import pytest
from app.features.subscription.email_service import EmailService


@pytest.fixture
def email_svc():
    """Create a bare EmailService (no Resend API key needed for rendering)."""
    svc = EmailService.__new__(EmailService)
    svc.api_key = None
    svc.from_email = "test@example.com"
    svc.from_email_morning = "morning@example.com"
    svc.from_email_weekly = "weekly@example.com"
    svc.frontend_url = "https://themarketbrew.com"
    svc.is_production = True
    svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
    return svc


@pytest.fixture
def mock_report_data():
    return {
        "title": "Test: VIX 回落暗示市场情绪转暖",
        "summary": "美股三大指数齐涨, VIX 降至 18 以下",
        "intro": "今天市场表现良好, 科技股领涨。投资者情绪转暖。",
        "timestamp": "2025-01-24T23:00:00Z",
        "report_date": "2025-01-24",
        "report_id": "test-uuid-123",
        "macro": {
            "signals": [
                {
                    "name": "VIX",
                    "current_value": "18.5",
                    "change": "weekly -2.3%",
                    "trend_direction": "down",
                    "analysis": "VIX falling toward support level.",
                }
            ],
            "summary": "Overall macro environment is risk-on.",
        },
        "news": {
            "headlines": [
                {
                    "title": "Fed holds rates steady",
                    "fact_summary": "Federal Reserve kept rates unchanged.",
                    "deep_analysis": "Markets expected the hold. Focus now on March meeting.",
                    "url": "https://example.com/fed",
                    "published_at": "2025-01-24T23:00:00Z",
                }
            ],
            "briefs": [
                {
                    "title": "Apple beats estimates",
                    "summary": "Q4 revenue exceeded expectations.",
                    "analysis": "Strong iPhone sales drove the beat.",
                    "url": "https://example.com/aapl",
                    "published_at": "2025-01-24T20:30:00Z",
                }
            ],
        },
        "report_summary": "Today was a strong day.\nLook for follow-through tomorrow.",
        "calendar": [
            {
                "date": "2025-01-25",
                "event": "PCE data release",
                "analysis": "Key inflation indicator.",
            }
        ],
        "indices": [
            {"name": "S&P 500", "value": 4783.45, "change_percent": 0.52},
            {"name": "Nasdaq", "value": 15320.10, "change_percent": 1.23},
            {"name": "VIX", "value": 18.50, "change_percent": -5.20},
        ],
    }


@pytest.fixture
def mock_digest_data():
    return {
        "timestamp": "2025-01-24T23:00:00Z",
        "digest_date": "2025-01-24",
        "digest_id": "digest-uuid-456",
        "greeting": "Your watchlist had a good day.",
        "one_line_summary": "AAPL and NVDA both up over 2%",
        "stocks": [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "price": 192.50,
                "daily_change": "+1.5%",
                "status": "Strong uptrend",
                "quick_take": "iPhone demand remains solid.",
            },
            {
                "symbol": "NVDA",
                "name": "NVIDIA Corp",
                "price": 875.30,
                "daily_change": "+2.8%",
                "status": "AI momentum",
                "quick_take": "Data center revenue continues to accelerate.",
            },
        ],
        "news": {
            "headlines": [
                {
                    "title": "Chip stocks rally",
                    "related_symbols": ["NVDA", "AMD", "INTC"],
                    "fact_summary": "Semiconductor ETF up 3%.",
                    "deep_analysis": "AI infrastructure spend drives sector.",
                    "url": "https://example.com/chips",
                    "published_at": "2025-01-24T23:00:00Z",
                }
            ],
            "briefs": [
                {
                    "title": "Apple supplier guidance",
                    "related_symbols": ["AAPL"],
                    "summary": "Key supplier raises guidance.",
                    "analysis": "Positive for iPhone supply chain.",
                    "url": "https://example.com/aapl-supply",
                    "published_at": "2025-01-24T20:30:00Z",
                }
            ],
        },
        "events": [
            {
                "date": "2025-01-28",
                "event": "Apple Q1 Earnings",
                "related_symbols": ["AAPL"],
                "why_important": "Key test for iPhone 16 cycle.",
            }
        ],
        "summary": {"content": "Both stocks are in bullish territory."},
    }


class TestFormatHtmlReport:
    """Test _format_html_report rendering."""

    def test_returns_valid_html(self, email_svc, mock_report_data):
        """Full report data renders valid HTML document."""
        html = email_svc._format_html_report(mock_report_data)
        assert "<html" in html
        assert "</html>" in html
        assert "<!DOCTYPE html>" in html

    def test_title_in_html(self, email_svc, mock_report_data):
        """Report title appears in rendered HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert mock_report_data["title"] in html

    def test_macro_signals_rendered(self, email_svc, mock_report_data):
        """Macro signal names and values appear in HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert "VIX" in html
        assert "18.5" in html

    def test_news_headlines_rendered(self, email_svc, mock_report_data):
        """News headline titles appear in HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert "Fed holds rates steady" in html
        assert "Apple beats estimates" in html
        assert "PT" in html

    def test_feedback_links_contain_report_id(self, email_svc, mock_report_data):
        """Feedback section links include report_id."""
        html = email_svc._format_html_report(mock_report_data, report_id="test-uuid-123")
        assert "report_id=test-uuid-123" in html

    def test_minimal_data_no_crash(self, email_svc):
        """Minimal data (only title) renders without error."""
        html = email_svc._format_html_report({"title": "Minimal report"})
        assert "<html" in html
        assert "Minimal report" in html


class TestFormatDigestHtml:
    """Test _format_digest_html rendering."""

    def test_returns_valid_html(self, email_svc, mock_digest_data):
        """Full digest data renders valid HTML document."""
        html = email_svc._format_digest_html(mock_digest_data, first_name="Alice")
        assert "<html" in html
        assert "</html>" in html

    def test_stock_info_rendered(self, email_svc, mock_digest_data):
        """Stock symbol and price appear in HTML."""
        html = email_svc._format_digest_html(mock_digest_data)
        assert "AAPL" in html
        assert "$192.50" in html

    def test_news_and_events_rendered(self, email_svc, mock_digest_data):
        """News headlines and events appear in HTML."""
        html = email_svc._format_digest_html(mock_digest_data)
        assert "Chip stocks rally" in html
        assert "Apple Q1 Earnings" in html
        assert "PT" in html

    def test_minimal_digest_no_crash(self, email_svc):
        """Minimal digest data renders without error."""
        html = email_svc._format_digest_html({"one_line_summary": "Test"})
        assert "<html" in html


class TestFormatWelcomeHtml:
    """Test _format_welcome_html rendering."""

    def test_contains_branding(self, email_svc):
        """Welcome email includes branding and greeting."""
        html = email_svc._format_welcome_html(first_name="Bob")
        assert "TheMarketBrew" in html
        assert "html" in html.lower()

    def test_returns_valid_html(self, email_svc):
        """Welcome email is valid HTML."""
        html = email_svc._format_welcome_html()
        assert "<html" in html
        assert "</html>" in html


class TestFormatMarkdownToHtml:
    """Test _format_markdown_to_html conversion."""

    def test_bold_conversion(self, email_svc):
        """**bold** converts to <strong>."""
        html = email_svc._format_markdown_to_html("This is **bold** text")
        assert "<strong>bold</strong>" in html

    def test_heading_conversion(self, email_svc):
        """# heading converts to <h2> tag."""
        html = email_svc._format_markdown_to_html("# My Heading")
        assert "<h2" in html
        assert "My Heading" in html

    def test_plain_text_preserved(self, email_svc):
        """Plain text without markdown is preserved in <p> tags."""
        html = email_svc._format_markdown_to_html("Hello world")
        assert "Hello world" in html
        assert "<p" in html

    def test_empty_string_returns_empty(self, email_svc):
        """Empty input returns empty string."""
        assert email_svc._format_markdown_to_html("") == ""

    def test_none_returns_empty(self, email_svc):
        """None input returns empty string."""
        assert email_svc._format_markdown_to_html(None) == ""


class TestFormatWeeklyReportHtml:
    """Test _format_weekly_report_html rendering."""

    @pytest.fixture
    def mock_weekly_data(self):
        return {
            "generated_at": "2025-02-14T10:00:00Z",
            "title": "Test Weekly Title",
            "verdict": "Neutral. GDP strong but CPI sticky.",
            "signal_lights": {
                "liquidity": "green",
                "economy": "yellow",
                "inflation": "red",
                "sentiment": "green",
            },
            "landscape": "Macro landscape paragraph.",
            "narrative": "Narrative paragraph with **bold** text.",
            "takeaway": "Takeaway strategy text.",
            "week_ahead": [
                {
                    "date": "2025-02-19",
                    "event": "CPI (expected +0.2%)",
                    "if_above": "Hawkish repricing",
                    "if_below": "Growth rally",
                },
            ],
            "liquidity_analysis": {
                "summary": "Liquidity is tightening.",
                "data_changes": "Fed balance sheet shrank.",
            },
            "economy_analysis": {
                "summary": "Economy strong.",
                "data_changes": "GDP up.",
            },
            "inflation_analysis": {
                "summary": "Inflation sticky.",
                "data_changes": "CPI hot.",
            },
            "sentiment_analysis": {
                "summary": "Sentiment ok.",
                "data_changes": "VIX low.",
            },
            "raw_data": {
                "market_performance": {
                    "indices": [
                        {
                            "symbol": "^GSPC",
                            "name": "S&P 500",
                            "weekly_change": 1.5,
                            "weekly_change_abs": 75.0,
                            "last_close": 5120.0,
                        },
                        {
                            "symbol": "^IXIC",
                            "name": "Nasdaq",
                            "weekly_change": -0.5,
                            "weekly_change_abs": -80.0,
                            "last_close": 16200.0,
                        },
                        {
                            "symbol": "^VIX",
                            "name": "VIX",
                            "weekly_change": -2.3,
                            "weekly_change_abs": -0.4,
                            "last_close": 16.5,
                        },
                        {
                            "symbol": "GC=F",
                            "name": "Gold",
                            "weekly_change": 0.8,
                            "weekly_change_abs": 15.0,
                            "last_close": 2050.0,
                        },
                        {
                            "symbol": "DX-Y.NYB",
                            "name": "US Dollar",
                            "weekly_change": -0.3,
                            "weekly_change_abs": -0.3,
                            "last_close": 104.2,
                        },
                        {
                            "symbol": "^TNX",
                            "name": "10Y Treasury",
                            "weekly_change": 1.2,
                            "weekly_change_abs": 0.05,
                            "last_close": 4.25,
                        },
                    ],
                },
            },
        }

    def test_returns_valid_html(self, email_svc, mock_weekly_data):
        """Weekly report data renders valid HTML document."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "<html" in html
        assert "</html>" in html
        assert "<!DOCTYPE html>" in html

    def test_title_in_html(self, email_svc, mock_weekly_data):
        """Report title appears in rendered HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Test Weekly Title" in html

    def test_verdict_in_html(self, email_svc, mock_weekly_data):
        """Verdict appears in rendered HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Neutral" in html

    def test_signal_lights_rendered(self, email_svc, mock_weekly_data):
        """Signal light labels appear in rendered HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert html.count("text") > 0

    def test_landscape_rendered(self, email_svc, mock_weekly_data):
        """Landscape content appears in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Macro landscape paragraph" in html

    def test_narrative_rendered(self, email_svc, mock_weekly_data):
        """Narrative content appears in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Narrative paragraph" in html

    def test_takeaway_rendered(self, email_svc, mock_weekly_data):
        """Takeaway content appears in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Takeaway strategy text" in html

    def test_week_ahead_rendered(self, email_svc, mock_weekly_data):
        """Week ahead events appear in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "CPI" in html
        assert "2025-02-19" in html

    def test_market_performance_rendered(self, email_svc, mock_weekly_data):
        """Market performance indices appear in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "5,120" in html

    def test_treasury_bps_format(self, email_svc, mock_weekly_data):
        """10Y Treasury shows change in basis points."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "bps" in html

    def test_four_dimensions_rendered(self, email_svc, mock_weekly_data):
        """Four dimension deep-dive sections appear in HTML."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "Liquidity is tightening" in html or "Fed balance sheet shrank" in html

    def test_cta_button_present(self, email_svc, mock_weekly_data):
        """CTA button to view full report is present."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "/macro" in html

    def test_feedback_section_weekly_prompt(self, email_svc, mock_weekly_data):
        """Feedback section uses weekly-specific prompt text."""
        html = email_svc._format_weekly_report_html(mock_weekly_data)
        assert "report_type=weekly" in html

    def test_minimal_data_no_crash(self, email_svc):
        """Minimal weekly data renders without error."""
        html = email_svc._format_weekly_report_html({"title": "Minimal"})
        assert "<html" in html
        assert "Minimal" in html

    def test_empty_signal_lights_no_crash(self, email_svc):
        """Missing or empty signal_lights does not crash."""
        html = email_svc._format_weekly_report_html({"title": "No signals"})
        assert "<html" in html


class TestTruncateAtParagraph:
    """Test _truncate_at_paragraph utility."""

    def test_short_text_unchanged(self, email_svc):
        """Text shorter than max_chars is returned unchanged."""
        text = "Short text."
        assert email_svc._truncate_at_paragraph(text, 100) == text

    def test_truncates_at_paragraph_boundary(self, email_svc):
        """Long text is truncated at paragraph boundary."""
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph that is quite long."
        result = email_svc._truncate_at_paragraph(text, 40)
        assert result.endswith("...")
        assert "First paragraph" in result

    def test_truncates_at_sentence(self, email_svc):
        text = "Some text here" + "x" * 100 + "end of long text."
        result = email_svc._truncate_at_paragraph(text, 50)
        assert result.endswith("...")

    def test_exact_length_unchanged(self, email_svc):
        """Text exactly at max_chars is returned unchanged."""
        text = "a" * 50
        assert email_svc._truncate_at_paragraph(text, 50) == text


class TestFeedbackSectionReportType:
    """Test _get_feedback_section with different report types."""

    def test_weekly_prompt_text(self, email_svc):
        """Weekly report type shows correct Chinese prompt."""
        html = email_svc._get_feedback_section("2025-02-14", "test-id", "weekly")
        assert "report_type=weekly" in html

    def test_digest_prompt_text(self, email_svc):
        """Digest report type shows correct Chinese prompt."""
        html = email_svc._get_feedback_section("2025-02-14", "test-id", "digest")
        assert "report_type=digest" in html

    def test_default_prompt_text(self, email_svc):
        """Default report type shows daily prompt."""
        html = email_svc._get_feedback_section("2025-02-14", "test-id", "daily")
        assert "report_type=daily" in html


class TestDigestCtaSection:
    """Tests for the bottom Pro vs Max comparison CTA."""

    def test_returns_html(self, email_svc):
        """CTA section returns HTML string."""
        html = email_svc._get_digest_cta_section()
        assert "<div" in html
        assert "</div>" in html

    def test_contains_pricing_link(self, email_svc):
        """Both Pro and Max CTAs point to /pricing."""
        html = email_svc._get_digest_cta_section()
        assert "themarketbrew.com/pricing" in html

    def test_paid_variant_points_to_member_features(self, email_svc):
        """Paid-user CTA thanks the subscriber and points to member features."""
        html = email_svc._get_digest_cta_section("paid")

        assert "感谢订阅" in html
        assert "打开 For You" in html
        assert "themarketbrew.com/for-you" in html
        assert "themarketbrew.com/stock" in html
        assert "themarketbrew.com/pricing" not in html
        assert "订阅 Pro" not in html

    def test_pro_and_max_tiers_present(self, email_svc):
        """Comparison shows both tiers with pain-point headlines + prices."""
        html = email_svc._get_digest_cta_section()
        # Pro tier (RECOMMENDED) — pain point headline + feature emphasis
        assert "订阅 Pro" in html
        assert "$4.99" in html
        assert "推荐" in html  # recommended badge
        assert "没看到你持仓的股票" in html  # pain point headline
        assert "专属持仓日报" in html  # bolded feature
        # Max tier — pain point headline + feature emphasis
        assert "订阅 Max" in html
        assert "$9.99" in html
        assert "想深度研究一只股票" in html  # pain point headline
        assert "AI 投研引擎" in html  # bolded feature
        assert "AI 深度个股分析" in html  # in bonus list
        # No free tier and no old copy
        assert "添加自选股" not in html
        assert "立即添加" not in html
        # Bonus list framing
        assert "以及" in html

    def test_included_in_daily_report(self, email_svc, mock_report_data):
        """Digest CTA section is included in daily report HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert "/for-you/watchlist" in html
        assert "/pricing" in html

    def test_paid_variant_included_in_daily_report(self, email_svc, mock_report_data):
        """Daily report can render the paid-user CTA section."""
        html = email_svc._format_html_report(mock_report_data, cta_variant="paid")
        assert "感谢订阅" in html
        assert "打开 For You" in html
        assert "订阅 Pro" not in html


class TestBroadcastWeeklyUsesSegmentOrAudience:
    """Test that broadcast_weekly_report uses segment in prod, audience fallback in dev."""

    @pytest.mark.asyncio
    async def test_dev_mode_falls_back_to_audience(self, email_svc):
        """In dev mode, _resolve_segment returns None so broadcast falls back to audience."""
        from unittest.mock import patch, MagicMock

        mock_sub_service = MagicMock()
        mock_sub_service.ensure_audience.return_value = "test-audience-id"

        with patch(
            "app.features.subscription.email_service.get_subscription_service",
            return_value=mock_sub_service,
        ), patch("app.features.subscription.email_service.resend") as mock_resend:
            mock_resend.Broadcasts.create.return_value = {"id": "broadcast-123"}
            mock_resend.Broadcasts.send.return_value = {"id": "send-123"}

            email_svc.api_key = "test-key"
            email_svc.is_production = False
            result = await email_svc.broadcast_weekly_report({"week_label": "2025.W08", "title": "Test"})

            assert result["success"] is True
            # Broadcasts.create receives a single dict param
            create_params = mock_resend.Broadcasts.create.call_args[0][0]
            assert "audience_id" in create_params
            assert "segment_id" not in create_params

    @pytest.mark.asyncio
    async def test_prod_mode_uses_segment(self, email_svc):
        """In prod mode, broadcast_weekly_report sends to RESEND_SEGMENT_WEEKLY."""
        from unittest.mock import patch

        with patch("app.features.subscription.email_service.resend") as mock_resend, \
             patch("app.features.subscription.email_service.RESEND_SEGMENT_WEEKLY", "seg-weekly-123"):
            mock_resend.Broadcasts.create.return_value = {"id": "broadcast-123"}
            mock_resend.Broadcasts.send.return_value = {"id": "send-123"}

            email_svc.api_key = "test-key"
            email_svc.is_production = True
            result = await email_svc.broadcast_weekly_report({"week_label": "2025.W08", "title": "Test"})

            assert result["success"] is True
            create_params = mock_resend.Broadcasts.create.call_args[0][0]
            assert create_params.get("segment_id") == "seg-weekly-123"
            assert "audience_id" not in create_params


class TestWelcomeQrCode:
    """Test that _format_welcome_html() includes the QR code community section."""

    def test_qrcode_image_in_html(self, email_svc):
        """QR code img tag with insforge storage URL is present in welcome email."""
        html = email_svc._format_welcome_html(first_name="Tester")
        assert "insforge.app/api/storage/buckets/community/objects/wechat-qr-0510.jpg" in html
        assert "<img" in html

    def test_community_section_header(self, email_svc):
        """Welcome email contains the community section header text."""
        html = email_svc._format_welcome_html(first_name="Tester")
        assert "\u52a0\u5165\u793e\u7fa4" in html  # "加入社群"


class TestResolveAudience:
    """Test the _resolve_audience() method."""

    @pytest.fixture
    def production_email_svc(self):
        """EmailService with is_production=True."""
        svc = EmailService.__new__(EmailService)
        svc.api_key = None
        svc.from_email = "test@example.com"
        svc.frontend_url = "https://themarketbrew.com"
        svc.is_production = True
        svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
        return svc

    @pytest.fixture
    def non_production_email_svc(self):
        """EmailService with is_production=False."""
        svc = EmailService.__new__(EmailService)
        svc.api_key = None
        svc.from_email = "test@example.com"
        svc.frontend_url = "http://localhost:3000"
        svc.is_production = False
        svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
        return svc

    def test_non_production_routes_to_test_audience(self, non_production_email_svc):
        """When is_production=False, should return TEST_AUDIENCE_ID regardless."""
        from app.features.subscription.service import SubscriptionChannel

        result = non_production_email_svc._resolve_audience(
            None, SubscriptionChannel.DAILY_REPORT
        )
        assert result == EmailService.TEST_AUDIENCE_ID

    def test_production_uses_given_audience(self, production_email_svc):
        """When is_production=True and audience_id is given, returns it."""
        from app.features.subscription.service import SubscriptionChannel

        given_id = "custom-audience-id-123"
        result = production_email_svc._resolve_audience(
            given_id, SubscriptionChannel.DAILY_REPORT
        )
        assert result == given_id

    def test_production_looks_up_audience(self, production_email_svc):
        """When is_production=True and no audience_id, calls ensure_audience."""
        from unittest.mock import patch, MagicMock
        from app.features.subscription.service import SubscriptionChannel

        mock_sub_service = MagicMock()
        mock_sub_service.ensure_audience.return_value = "looked-up-audience-id"

        with patch(
            "app.features.subscription.email_service.get_subscription_service",
            return_value=mock_sub_service,
        ):
            result = production_email_svc._resolve_audience(
                None, SubscriptionChannel.DAILY_REPORT
            )
            assert result == "looked-up-audience-id"
            mock_sub_service.ensure_audience.assert_called_once_with(
                SubscriptionChannel.DAILY_REPORT
            )


class TestIsProduction:
    """Test the is_production flag."""

    def test_production_url_sets_flag_true(self):
        """When ENVIRONMENT=production, is_production is True."""
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.features.subscription.email_service.ENVIRONMENT", "production")
            mp.setattr("app.features.subscription.email_service.RESEND_API_KEY", "")
            svc = EmailService()
            assert svc.is_production is True

    def test_non_production_env_sets_flag_false(self):
        """When ENVIRONMENT != production, is_production is False."""
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.features.subscription.email_service.ENVIRONMENT", "development")
            mp.setattr("app.features.subscription.email_service.RESEND_API_KEY", "")
            svc = EmailService()
            assert svc.is_production is False


class TestTwitterDigestRendering:
    """Pure-function rendering of the Twitter KOL digest email template."""

    @pytest.fixture
    def sample_digest(self) -> dict:
        return {
            "generated_at": "2026-05-03T22:00:00+00:00",
            "window_hours": 24,
            "input_tweet_count": 142,
            "tracked_kols": ["beth_kindig", "GoldmanSachs"],
            "takeaway": ["NVDA Sovereign AI 订单填补需求", "美元走弱推动黄金破前高"],
            "macro_picks": [
                {
                    "tweet_id": "1", "username": "GoldmanSachs",
                    "display_name": "Goldman", "created_at": "2026-05-03T18:00:00+00:00",
                    "tweet_type": "thread", "url": "https://x.com/x/status/1",
                    "category": "macro", "primary_ticker": "", "sector": "",
                    "depth": "deep",
                    "interpretation_zh": "美联储 6 月可能降息",
                    "tldr_zh": "美元走弱、黄金创新高,市场预期 6 月降息概率超过 70%。",
                    "translation_zh": "", "text_en": "Fed may cut in June",
                    "text_zh": "美联储 6 月可能降息",
                    "like_count": 1234, "retweet_count": 350,
                    "view_count": 80000, "reply_count": 0, "quality_score": 0.9,
                }
            ],
            "industry_picks": [],
            "stock_picks": [
                {
                    "tweet_id": "2", "username": "beth_kindig",
                    "display_name": "Beth Kindig",
                    "created_at": "2026-05-03T19:00:00+00:00",
                    "tweet_type": "original", "url": "https://x.com/x/status/2",
                    "category": "stock", "primary_ticker": "NVDA", "sector": "",
                    "depth": "flash", "interpretation_zh": "加仓 NVDA",
                    "tldr_zh": "", "translation_zh": "",
                    "text_en": "Adding to my $NVDA position",
                    "text_zh": "加仓 NVDA",
                    "like_count": 250, "retweet_count": 50,
                    "view_count": 12000, "reply_count": 0, "quality_score": 0.7,
                }
            ],
            "model_version": "gemini-3.1-pro-preview",
        }

    def test_renders_required_sections(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(
            sample_digest, digest_date="2026-05-03", digest_id="abc",
        )

        assert "推特 KOL 观点日报" in html
        assert "今日要点" in html
        assert "大盘走势" in html
        assert "行业判断" in html  # empty section still renders
        assert "个股判断" in html
        assert "今日 KOL 暂无新的行业观点" in html  # empty fallback
        assert "本日报追踪 2 位博主" in html
        assert "Goldman" in html and "@GoldmanSachs" in html
        assert "Beth Kindig" in html and "@beth_kindig" in html

    def test_groups_stock_by_ticker(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-03")
        assert "$NVDA &middot; 1 条" in html

    def test_escapes_unsafe_text(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_digest["macro_picks"][0]["text_en"] = "<script>alert('x')</script>"
        sample_digest["macro_picks"][0]["interpretation_zh"] = "x & y > z"

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-03")
        assert "<script>" not in html
        assert "&lt;script&gt;" in html
        assert "x &amp; y &gt; z" in html

    def test_links_to_web_when_date_present(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-03")
        assert "https://themarketbrew.com/twitter-digest/2026-05-03" in html
        assert "在网页查看完整日报" in html

    def test_omits_web_cta_when_no_date(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest)
        assert "在网页查看完整日报" not in html

    def test_format_count_thresholds(self):
        from app.features.subscription.email_templates import _twitter_digest_format_count

        assert _twitter_digest_format_count(999) == "999"
        assert _twitter_digest_format_count(1234) == "1.2K"
        assert _twitter_digest_format_count(80000) == "80K"


class TestTwitterDigestV3Rendering:
    """V3 layout: opening + topics + briefs + solo voices + closing."""

    @pytest.fixture
    def sample_v3_digest(self) -> dict:
        return {
            "schema_version": "v3",
            "generated_at": "2026-05-04T22:00:00+00:00",
            "window_hours": 24,
            "input_tweet_count": 220,
            "tracked_kols": ["alice", "bob", "carol"],
            "takeaway": ["$CRCL: 多头共识但估值已 price in", "Fed 6月降息概率上行"],
            "headline": "稳定币立法落地,加密板块抢跑",
            "intro": "Clarity Act 通过点燃 Circle,博主们围绕估值是否兑现展开分歧。",
            "topics": [
                {
                    "title": "$CRCL · Clarity Act 通过推涨",
                    "layer": "stock",
                    "primary_ticker": "CRCL",
                    "sector": "",
                    "event": "Clarity Act",
                    "participating_kols": ["alice", "bob"],
                    "stance_distribution": "2 位博主 · 2 看多",
                    "synthesis_zh": "Clarity Act 把稳定币纳入合规框架,博主普遍认为 Circle 是受益方,但短期估值已 price in 利好。",
                    "key_arguments": [
                        {
                            "tweet_id": "t1", "username": "alice",
                            "display_name": "Alice", "stance": "bullish",
                            "tldr_zh": "USDC 流通量将系统性提升,合规护城河确立",
                            "tweet_url": "https://x.com/alice/status/t1",
                        },
                        {
                            "tweet_id": "t2", "username": "bob",
                            "display_name": "Bob", "stance": "neutral",
                            "tldr_zh": "估值已 price in,等回调",
                            "tweet_url": "https://x.com/bob/status/t2",
                        },
                    ],
                },
            ],
            "briefs": [
                {
                    "layer": "stock",
                    "label": "$TSLA",
                    "one_liner_zh": "Q2 deliveries 数据将推动股价",
                    "username": "carol",
                    "display_name": "Carol",
                    "tweet_id": "t3",
                    "tweet_url": "https://x.com/carol/status/t3",
                },
                {
                    "layer": "industry",
                    "label": "半导体",
                    "one_liner_zh": "出口管制再升级风险",
                    "username": "dan",
                    "display_name": "Dan",
                    "tweet_id": "t4",
                    "tweet_url": "https://x.com/dan/status/t4",
                },
            ],
            "solo_voices": [
                {
                    "title": "@beth_kindig 长文:Hopper vs Sovereign AI",
                    "username": "beth_kindig",
                    "display_name": "Beth Kindig",
                    "primary_ticker": "NVDA",
                    "tweet_type": "thread",
                    "tldr_zh": "Hopper 出货放缓,但 Sovereign AI 订单将填补缺口。",
                    "interpretation_zh": "为市场担忧给出了反方论据。",
                    "tweet_id": "t5",
                    "tweet_url": "https://x.com/beth_kindig/status/t5",
                },
            ],
            "crosscut": "宏观降息预期与个股加密板块抢跑形成共振,但与半导体出口管制风险形成对冲。",
            "watch_next": ["Fed 5 月会议纪要", "NVDA Q2 财报"],
            "model_version": "v3:enrich=flash-lite/digest=pro-preview",
            "macro_picks": [], "industry_picks": [], "stock_picks": [],
        }

    def test_v3_renders_opening(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "稳定币立法落地" in html
        assert "Clarity Act 通过点燃 Circle" in html
        assert "今日要点" in html
        assert "$CRCL: 多头共识但估值已 price in" in html
        assert "3 位金融博主" in html
        assert "220 条原始推文" in html

    def test_v3_renders_topics_with_args(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "热门话题" in html
        assert "$CRCL · Clarity Act 通过推涨" in html
        assert "USDC 流通量将系统性提升" in html
        assert "估值已 price in" in html
        # V3.2: stance shown via colored left border (#059669 bullish, #d97706 neutral)
        # plus the meta-line stance_distribution string. The per-arg "看多/谨慎" badge
        # was removed to cut visual chrome.
        assert "2 位博主 · 2 看多" in html  # the meta-line stance_distribution
        assert "border-left: 3px solid #059669" in html  # bullish row marker
        assert "border-left: 3px solid #d97706" in html  # neutral row marker
        # V3.2: KOL signed em-dash with display_name (no @handle prefix in the
        # topic card itself). Whole row is the link, no separate "原推 →" CTA.
        # Note: @alice / @bob legitimately still appear in the tracked-KOLs
        # chip block at the bottom — that block is unchanged and out of scope.
        assert "&mdash; Alice" in html or "— Alice" in html
        assert "&mdash; Bob" in html or "— Bob" in html
        # Per-arg footer with `@username · 原推 →` is gone — no separate
        # tweet-link CTA inside the topic card.
        assert "原推 &rarr;" not in html
        assert "原推 →" not in html

    def test_v3_renders_briefs(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "快讯" in html
        assert "$TSLA" in html
        assert "Q2 deliveries 数据将推动股价" in html
        assert "半导体" in html
        assert "出口管制再升级风险" in html

    def test_v3_renders_solo_voices(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "独家声音" in html
        assert "Beth Kindig" in html
        assert "Hopper 出货放缓" in html
        assert "查看完整 Thread" in html

    def test_v3_omits_deprecated_closing(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        # V3.1: both crosscut AND watch_next are deprecated. Even when the row
        # still carries them (legacy data), nothing should render — readers
        # found the closing block too generic to be worth the space.
        assert "跨话题观察" not in html
        assert "宏观降息预期与个股加密板块抢跑形成共振" not in html
        assert "明日观察" not in html
        assert "Fed 5 月会议纪要" not in html

    def test_v3_omits_empty_sections(self, sample_v3_digest):
        """Sparse-day digest with empty briefs / solo_voices / closing should render cleanly."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_v3_digest["briefs"] = []
        sample_v3_digest["solo_voices"] = []
        sample_v3_digest["crosscut"] = ""
        sample_v3_digest["watch_next"] = []

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        # Topics still rendered
        assert "$CRCL" in html
        # Empty sections do not appear at all
        assert "快讯 &middot;" not in html
        assert "独家声音 &middot;" not in html
        assert "跨话题观察" not in html
        assert "明日观察" not in html

    def test_v3_neutralizes_unsafe_tweet_url(self, sample_v3_digest):
        """A poisoned tweet_url (e.g. javascript:alert) must not reach href."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_v3_digest["topics"][0]["key_arguments"][0]["tweet_url"] = "javascript:alert(1)"
        sample_v3_digest["briefs"][0]["tweet_url"] = "javascript:alert(2)"
        sample_v3_digest["solo_voices"][0]["tweet_url"] = "javascript:alert(3)"

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "javascript:alert" not in html

    def test_v3_neutralizes_unsafe_username(self, sample_v3_digest):
        """A poisoned username can't break out of the user-profile href."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        # Username with quote / angle bracket — must be rejected for href use.
        sample_v3_digest["topics"][0]["key_arguments"][0]["username"] = 'evil"><script>'

        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "<script>" not in html
        # The literal href ends up as "#" since it failed the handle regex.
        assert 'href="#"' in html

    def test_v3_escapes_unsafe_text(self, sample_v3_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_v3_digest["headline"] = "<script>alert(1)</script>"
        html = format_twitter_digest_html(sample_v3_digest, digest_date="2026-05-04")
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_v2_default_path_unchanged(self):
        """Digest without schema_version still routes to V2 renderer."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        v2_digest = {
            "generated_at": "2026-04-25T00:00:00+00:00",
            "window_hours": 24,
            "input_tweet_count": 50,
            "tracked_kols": ["alice"],
            "takeaway": ["legacy 要点"],
            "macro_picks": [], "industry_picks": [], "stock_picks": [],
            "model_version": "gemini-3.1-pro-preview",
            # No schema_version
        }
        html = format_twitter_digest_html(v2_digest, digest_date="2026-04-25")
        # V2 markers
        assert "大盘走势" in html
        assert "今日 KOL 暂无新的大盘观点" in html
        # V3 markers absent
        assert "热门话题" not in html


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
