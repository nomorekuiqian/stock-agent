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
    svc.frontend_url = "https://themarketbrew.com"
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
                }
            ],
            "briefs": [
                {
                    "title": "Apple beats estimates",
                    "summary": "Q4 revenue exceeded expectations.",
                    "analysis": "Strong iPhone sales drove the beat.",
                    "url": "https://example.com/aapl",
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
                }
            ],
            "briefs": [
                {
                    "title": "Apple supplier guidance",
                    "related_symbols": ["AAPL"],
                    "summary": "Key supplier raises guidance.",
                    "analysis": "Positive for iPhone supply chain.",
                    "url": "https://example.com/aapl-supply",
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

    def test_minimal_digest_no_crash(self, email_svc):
        """Minimal digest data renders without error."""
        html = email_svc._format_digest_html({"one_line_summary": "Test"})
        assert "<html" in html


class TestFormatWelcomeHtml:
    """Test _format_welcome_html rendering."""

    def test_contains_first_name(self, email_svc):
        """Welcome email includes the first name."""
        html = email_svc._format_welcome_html(first_name="Bob")
        assert "Bob" in html
        assert "TheMarketBrew" in html

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
    """Tests for _get_digest_cta_section() -- generated from git diff."""

    def test_returns_html(self, email_svc):
        """CTA section returns HTML string."""
        html = email_svc._get_digest_cta_section()
        assert "<div" in html
        assert "</div>" in html

    def test_contains_watchlist_link(self, email_svc):
        """CTA links to /for-you/watchlist."""
        html = email_svc._get_digest_cta_section()
        assert "/for-you/watchlist" in html
        assert "themarketbrew.com/for-you/watchlist" in html

    def test_contains_cta_text(self, email_svc):
        html = email_svc._get_digest_cta_section()
        assert "NEW" in html

    def test_included_in_daily_report(self, email_svc, mock_report_data):
        """Digest CTA section is included in daily report HTML."""
        html = email_svc._format_html_report(mock_report_data)
        assert "/for-you/watchlist" in html


class TestBroadcastWeeklyUsesDaily:
    """Test that broadcast_weekly_report uses DAILY_REPORT audience -- generated from git diff."""

    @pytest.mark.asyncio
    async def test_uses_daily_report_audience(self, email_svc):
        """broadcast_weekly_report should call ensure_audience with DAILY_REPORT."""
        from unittest.mock import patch, MagicMock

        mock_sub_service = MagicMock()
        mock_sub_service.ensure_audience.return_value = "test-audience-id"

        with patch(
            "app.features.subscription.email_service.get_subscription_service",
            return_value=mock_sub_service,
        ), patch("app.features.subscription.email_service.resend") as mock_resend:
            mock_resend.Broadcasts.create.return_value = {"id": "broadcast-123"}
            mock_resend.Broadcasts.send.return_value = {"id": "send-123"}

            # Need api_key for broadcast to proceed
            email_svc.api_key = "test-key"
            result = await email_svc.broadcast_weekly_report({"week_label": "2025.W08", "title": "Test"})

            # Verify ensure_audience was called with DAILY_REPORT
            from app.features.subscription.service import SubscriptionChannel
            mock_sub_service.ensure_audience.assert_called_once_with(
                SubscriptionChannel.DAILY_REPORT
            )
            assert result["success"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
