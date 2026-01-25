"""
Email Rendering Tests

Tests for EmailService HTML rendering methods (_format_html_report, _format_digest_html,
_format_welcome_html, _format_markdown_to_html). Pure rendering logic only - no emails sent,
no network calls, no database access.
"""

import pytest
from app.services.email_service import EmailService


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
