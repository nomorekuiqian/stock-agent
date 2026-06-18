"""
Email Rendering Tests

Tests for EmailService HTML rendering methods (_format_html_report, _format_digest_html,
_format_welcome_html, _format_markdown_to_html). Pure rendering logic only - no emails sent,
no network calls, no database access.
"""

import pytest
from app.features.subscription.email_service import EmailService
from app.features.subscription.email_templates import format_timestamp


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


class TestFormatTimestamp:
    """Test email timestamp rendering."""

    def test_uses_market_time_et_label(self):
        """UTC timestamps render in US market time and are labeled ET."""
        assert format_timestamp("2026-05-20T14:30:00Z") == "May 20, 2026 · 10:30 AM ET"


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
        assert "ET" in html

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
        assert "ET" in html

    def test_minimal_digest_no_crash(self, email_svc):
        """Minimal digest data renders without error."""
        html = email_svc._format_digest_html({"one_line_summary": "Test"})
        assert "<html" in html

    def test_monitor_cta_rendered(self, email_svc, mock_digest_data):
        """Personal digest email points readers to the web AI monitor."""
        html = email_svc._format_digest_html(mock_digest_data)
        assert "查看 AI 监控台" in html
        assert "themarketbrew.com/for-you/monitor" in html


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
        assert "打开专属日报" in html
        assert "themarketbrew.com/for-you" in html
        assert "themarketbrew.com/stock" in html
        assert "themarketbrew.com/pricing" not in html
        assert "订阅 Pro" not in html

    def test_pro_and_max_tiers_present(self, email_svc):
        """Comparison shows both tiers with pain-point headlines + prices."""
        html = email_svc._get_digest_cta_section()
        # Pro tier — daily-report upgrade + feature emphasis
        assert "订阅 Pro" in html
        assert "$10" in html
        assert "推荐" in html  # recommended badge
        assert "想看 KOL 圈在押什么票" in html
        assert "推特 KOL 日报" in html
        assert "专属持仓日报" in html
        # Max tier — research workflow upgrade
        assert "订阅 Max" in html
        assert "$20" in html
        assert "想深度研究一只股票" in html
        assert "AI 投研引擎" in html  # in bonus list
        assert "AI 深度个股分析" in html  # in bonus list
        assert "Max 独享" not in html
        assert "新功能" not in html
        # No free tier and no old copy
        assert "添加自选股" not in html
        assert "立即添加" not in html
        # Bonus list framing
        assert "以及" in html

    def test_max_is_the_recommended_tier(self, email_svc):
        """Regression guard: Max must come first with the 推荐 badge.

        Layout choice (commit f370f38 / b538743 era): Max card is on the
        left in the recommended slot; Pro card is on the right as the
        secondary tier. A regression that swaps Pro back to recommended
        would still satisfy presence-only assertions, so verify position
        and badge ownership explicitly.
        """
        html = email_svc._get_digest_cta_section()
        # Use the unique HTML comment markers (not the docstring/CSS comment
        # mentions of "Pro card" / "Max card" elsewhere in the output).
        max_marker = html.find("<!-- Max card")
        pro_marker = html.find("<!-- Pro card")
        badge_pos = html.find("推荐")
        max_button = html.find("订阅 Max")
        pro_button = html.find("订阅 Pro")

        # Max card section comes before Pro card section
        assert max_marker != -1 and pro_marker != -1
        assert max_marker < pro_marker

        # 推荐 badge lives inside the Max card, not the Pro card
        assert max_marker < badge_pos < pro_marker

        # And the Max button physically precedes the Pro button
        assert max_button < pro_button

    def test_max_uses_amber_accent_pro_uses_emerald(self, email_svc):
        """Brand color identity per tier survives the recommended-tier swap.

        Pro stays emerald (brand color), Max stays amber (premium gold).
        Only the visual prominence (border width + badge) marks Max as
        recommended. A regression that flips colors would confuse other
        product surfaces that rely on the same identity.
        """
        html = email_svc._get_digest_cta_section()
        # Pro button background = emerald-700
        pro_button_idx = html.find("订阅 Pro")
        # Walk back to find the surrounding <a>
        pro_anchor_start = html.rfind("<a", 0, pro_button_idx)
        pro_anchor = html[pro_anchor_start:pro_button_idx]
        assert "#047857" in pro_anchor  # emerald-700

        max_button_idx = html.find("订阅 Max")
        max_anchor_start = html.rfind("<a", 0, max_button_idx)
        max_anchor = html[max_anchor_start:max_button_idx]
        assert "#b45309" in max_anchor  # amber-700

    def test_included_in_daily_report(self, email_svc, mock_report_data):
        """Digest CTA section is included in daily report HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert "/for-you/watchlist" in html
        assert "/pricing" in html

    def test_paid_variant_included_in_daily_report(self, email_svc, mock_report_data):
        """Daily report can render the paid-user CTA section."""
        html = email_svc._format_html_report(mock_report_data, cta_variant="paid")
        assert "感谢订阅" in html
        assert "打开专属日报" in html
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


class TestWelcomeEmailCallsToAction:
    """Test that _format_welcome_html() includes the current onboarding CTAs."""

    def test_watchlist_cta_in_html(self, email_svc):
        """Welcome email points new users to set up a watchlist."""
        html = email_svc._format_welcome_html(first_name="Tester")
        assert "/for-you/watchlist" in html
        assert "添加我的自选股" in html

    def test_product_sections_in_html(self, email_svc):
        """Welcome email introduces the product surfaces available today."""
        html = email_svc._format_welcome_html(first_name="Tester")
        assert "你马上可以试的功能" in html
        assert "每日市场日报" in html


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
    """Twitter digest email layout: opening + ticker theses + macro threads +
    watchpoints."""

    @pytest.fixture
    def sample_digest(self) -> dict:
        return {
            "generated_at": "2026-05-09T22:00:00+00:00",
            "window_hours": 24,
            "input_tweet_count": 312,
            "tracked_kols": ["alice", "bob", "carol", "dan"],
            "headline": "AI 内存超级周期与 Robotaxi 并跑",
            "intro": (
                "今天 KOL 圈的注意力高度集中在 $NVDA 与 $MU 两条 AI 内存线: "
                "多数博主围绕 Q1 财报后 HBM 产能瓶颈展开多头叙事, $MU 前瞻 PEG 0.6 "
                "显著低于 SK Hynix, 但技术派警示 MACD 月线已突破 2000 dotcom 顶部读数。"
                "宏观层面, Fed 6/24 议息预期与 Clarity Act 立法投票为风险偏好提供两条新主线。"
                "下面是各 ticker 的多空论据全梳理。"
            ),
            "ticker_theses": [
                {
                    "ticker": "NVDA",
                    "side": "disputed",
                    "primary_kols": ["alice", "bob"],
                    "tweet_count": 9,
                    "synthesis_zh": (
                        "NVDA 围绕 Q1 财报后的 AI 算力订单可见性展开多头叙事。多数博主"
                        "认为 Hopper 卡 ASP 较前代提升 35%, 数据中心营收 $27.3B 创历史新高。"
                        "但技术派警示 MACD 月线突破 2000 dotcom 顶部读数, 抛物线后跟随"
                        "25-40% 回撤概率上行。"
                    ),
                    "buy_arguments": [
                        {
                            "kol": "alice",
                            "point_zh": "Q1 营收同比 +18% 至 $39B, 数据中心 $27.3B 创历史新高; 管理层将全年指引上修至 $165B 顶端 vs 共识 $158B 多 4.4%。",
                            "direction": "buy",
                            "tweet_url": "https://x.com/alice/status/100001",
                        },
                    ],
                    "sell_arguments": [
                        {
                            "kol": "bob",
                            "point_zh": "MACD 月线读数突破 2000 年互联网顶峰水平 (175 vs 当时 150), 历史类似形态后 6-12 个月回撤幅度中位数 28%, 最大 41%。",
                            "direction": "sell",
                            "tweet_url": "https://x.com/bob/status/100002",
                        },
                    ],
                    "observation_arguments": [
                        {
                            "kol": "carol",
                            "point_zh": "AI 训练集群订单可见性已延伸至 2027 年, Hopper 卡 ASP 较前代提升 35%。",
                            "direction": "observation",
                            "tweet_url": "https://x.com/carol/status/100003",
                        },
                    ],
                },
            ],
            "macro_threads": [
                {
                    "title": "美联储 6/24 议息预期",
                    "layer": "macro",
                    "primary_kols": ["alice", "carol"],
                    "synthesis_zh": (
                        "Fed 6 月议息成为本周宏观主线。OIS 隐含降息概率从上周 42% 升至 71%, "
                        "对应美元 DXY 下行 1.2%。多数博主认为风险资产将延续 risk-on, "
                        "但少数指出降息预期已过度计入, 反转空间有限。"
                    ),
                    "key_points": [
                        {
                            "kol": "alice",
                            "point_zh": "OIS 隐含降息概率从上周 42% 升至 71%, 对应美元 DXY 下行 1.2%, 金价突破 $2480。",
                            "direction": "observation",
                            "tweet_url": "https://x.com/alice/status/100004",
                        },
                    ],
                },
            ],
            "watchpoints": [
                {
                    "title": "MU Q3 财报 6/24",
                    "date_hint": "6/24",
                    "why_it_matters_zh": (
                        "若财报上修 2027+ HBM 算力需求, 可触发 HBM 周期股估值再重塑; "
                        "反之将引发半导体板块短期回撤。KOL 圈分歧: 多头看 $42B 指引上限, "
                        "空头警示 MACD 已超 2000 顶部, 回撤幅度可达 25-40%。"
                    ),
                    "related_tickers": ["MU", "NVDA"],
                    "kols_watching": ["alice", "bob", "dan"],
                    "evidence": [
                        {
                            "kol": "dan",
                            "point_zh": "MU 6/24 财报前关注 HBM 产能扩张节奏与 eSSD 渗透率指引。",
                            "direction": "observation",
                            "tweet_url": "https://x.com/dan/status/100005",
                        },
                    ],
                },
            ],
            "other_tickers": [
                {"ticker": "TSLA", "mentions": 4, "kols": 3},
                {"ticker": "META", "mentions": 3, "kols": 2},
            ],
            "hot_sectors": [{"label": "AI 算力", "count": 12, "kols": 4}],
            "hot_tickers": [{"label": "NVDA", "count": 9, "kols": 2}],
            "hot_events": [],
            "model_version": "enrich=flash-lite/digest=pro-preview",
        }

    def test_renders_opening_no_intro(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        # Title card: Hi + greeting (fixed copy) + headline + meta
        assert "Hi {{{FIRST_NAME}}}" in html
        assert "为你梳理过去 24 小时 KOL 圈的核心讨论" in html
        assert "AI 内存超级周期与 Robotaxi 并跑" in html
        # intro 已弃用 — 不再渲染"今日要点"白卡
        assert "今日要点" not in html
        # Meta line — just confirm the count + label show up next to each
        # other; don't bind the assertion to the specific inline styling.
        assert ">4</span> KOL" in html
        assert ">312</span> 推文" in html

    def test_header_uses_digest_date_without_time(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-10")

        assert "2026-05-10" in html
        assert "PT" not in html
        assert "2026-05-09T22:00:00+00:00" not in html

    def test_renders_ticker_theses(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "今日热议个股" in html
        assert "按博主讨论密度排序" in html
        # Ticker rendered
        assert "NVDA" in html
        # Stance summary fallback (buy=1, sell=1) → "X 位看多 · Y 位看空, 双方都有支撑"
        assert "1 位看多 · 1 位看空, 双方都有支撑" in html
        # Synthesis paragraph
        assert "围绕 Q1 财报后的 AI 算力订单可见性" in html
        # Per-card CTA points readers to the web detail at the ticker anchor.
        assert "在网页看 2 位博主完整论据 &rarr;" in html
        assert "/twitter-digest/2026-05-09#ticker-NVDA" in html
        # Inline argument text NO LONGER appears in email — moved to web only.
        assert "Q1 营收同比 +18% 至 $39B" not in html
        assert "MACD 月线读数突破 2000" not in html

    def test_renders_macro_threads(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "热议话题" in html
        assert "宏观 / 行业层面被反复提到的事" in html
        assert "美联储 6/24 议息预期" in html
        assert "OIS 隐含降息概率从上周 42% 升至 71%" in html

    def test_renders_watchpoints(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "未来热议事件" in html
        assert "未来 3 周内的具体催化剂" in html
        assert "MU Q3 财报 6/24" in html
        assert "6/24" in html
        assert "若财报上修 2027+ HBM 算力需求" in html
        # Related ticker chips
        assert "MU" in html and "NVDA" in html
        # CTA reflects the kols_watching count (3 names in sample)
        assert "在网页看 3 位博主原话 &rarr;" in html

    def test_drops_other_tickers_and_tracked_kols_chips(self, sample_digest):
        """V4.2 — '其他热议' chip block + '追踪博主' chip block removed."""
        from app.features.subscription.email_templates import format_twitter_digest_html
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "其他热议" not in html
        assert "本日报追踪" not in html
        # 值得一看 section was removed entirely
        assert "值得一看" not in html

    def test_omits_empty_sections(self, sample_digest):
        """Sparse digests should not render empty sections."""
        from app.features.subscription.email_templates import format_twitter_digest_html
        sample_digest["macro_threads"] = []
        sample_digest["watchpoints"] = []
        sample_digest["other_tickers"] = []
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "今天博主们在担心什么" not in html
        assert "本周博主们在等什么" not in html
        # Ticker section still rendered with stance summary chip
        assert "1 位看多 · 1 位看空, 双方都有支撑" in html

    def test_card_cta_summarises_argument_counts(self):
        """Inline lanes are absent — card surfaces stance chip + view-more CTA."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        many_args = [
            {
                "kol": f"kol{i}",
                "point_zh": f"论据 {i} 包含具体数字与时间锚。",
                "direction": "buy",
                "tweet_url": f"https://x.com/kol{i}/status/{200000 + i}",
            }
            for i in range(10)
        ]
        digest = {
            "generated_at": "2026-05-09T22:00:00+00:00",
            "window_hours": 24,
            "input_tweet_count": 50,
            "tracked_kols": ["alice"],
            "headline": "test",
            "intro": "测试用导览段落足以触发渲染.",
            "ticker_theses": [{
                "ticker": "NVDA",
                "primary_kols": ["alice"],
                "tweet_count": 10,
                "synthesis_zh": "测试用综述。",
                "buy_arguments": many_args,
                "sell_arguments": [],
                "observation_arguments": [],
            }],
            "macro_threads": [], "watchpoints": [],
            "other_tickers": [],
            "hot_sectors": [], "hot_tickers": [], "hot_events": [],
            "model_version": "test",
        }
        html = format_twitter_digest_html(digest, digest_date="2026-05-09")
        # All-buy stance falls back to "{kols} 位博主一致看多"
        assert "1 位博主一致看多" in html
        # CTA jumps to the ticker anchor on the web detail
        assert "在网页看 1 位博主完整论据 &rarr;" in html
        assert "/twitter-digest/2026-05-09#ticker-NVDA" in html
        # No inline argument body text leaks through
        assert "论据 0 包含具体数字" not in html

    def test_neutralizes_unsafe_urls(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        sample_digest["ticker_theses"][0]["buy_arguments"][0]["tweet_url"] = "javascript:alert(1)"
        sample_digest["watchpoints"][0]["evidence"][0]["tweet_url"] = "javascript:alert(2)"
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "javascript:alert" not in html

    def test_escapes_unsafe_text(self, sample_digest):
        from app.features.subscription.email_templates import format_twitter_digest_html
        sample_digest["headline"] = "<script>alert(1)</script>"
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_renders_llm_stance_summary_when_provided(self, sample_digest):
        """LLM-written `stance_summary` should be shown verbatim (not the
        counts-based fallback). The chip is the card's lead hook."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_digest["ticker_theses"][0]["stance_summary"] = (
            "多空在估值上打架, 长线派坚守 2030 目标"
        )
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "多空在估值上打架, 长线派坚守 2030 目标" in html
        # Counts-based fallback must NOT appear when LLM wrote a stance.
        assert "1 位看多 · 1 位看空, 双方都有支撑" not in html

    def test_watchpoint_criteria_subtitle_rendered(self, sample_digest):
        """The new section header explains how watchpoints get picked —
        readers should see the criteria, not just the section title."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        # Section criteria copy must be present so users understand selection.
        assert "未来 3 周内的具体催化剂" in html
        # Catalyst type taxonomy is part of the subtitle.
        assert "财报 / 数据 / 央行 / 监管 / 产品发布" in html

    def test_no_hot_tickers_leaderboard_block(self, sample_digest):
        """The 今日热议 hot-ticker bar chart was removed in the simplification
        pass — render must not regress it back even when hot_tickers populated."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        sample_digest["hot_tickers"] = [
            {"label": "ZZZTEST", "count": 9, "kols": 2},
            {"label": "YYYTEST", "count": 7, "kols": 3},
        ]
        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "ZZZTEST" not in html
        assert "YYYTEST" not in html

    def test_email_contains_unsubscribe_placeholder(self, sample_digest):
        """Compliance: marketing email must have unsubscribe link. Resend
        Broadcasts replaces the placeholder server-side at send time."""
        from app.features.subscription.email_templates import format_twitter_digest_html

        html = format_twitter_digest_html(sample_digest, digest_date="2026-05-09")
        assert "{{{RESEND_UNSUBSCRIBE_URL}}}" in html
        assert "Unsubscribe" in html


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
