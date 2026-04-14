"""
Newsletter Unit Tests -- generated from git diff

Tests for:
- email_service._format_newsletter_plaintext: plain text formatting
- models.NewsletterOutput / NewsletterSection: Pydantic validation
- models.NewsletterGenerateRequest / NewsletterSendRequest / NewsletterBroadcastRequest: validation

No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_newsletter_unit.py -v
"""

import pytest
from pydantic import ValidationError

from app.features.subscription.email_service import EmailService
from app.features.subscription.models import (
    NewsletterSection,
    NewsletterOutput,
    NewsletterGenerateRequest,
    NewsletterSendRequest,
    NewsletterBroadcastRequest,
)


# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture
def email_svc():
    """Create a bare EmailService (no API key needed for formatting)."""
    svc = EmailService.__new__(EmailService)
    svc.api_key = None
    svc.from_email = "test@example.com"
    svc.frontend_url = "https://themarketbrew.com"
    svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
    return svc


@pytest.fixture
def newsletter_data():
    """Standard newsletter data dict."""
    return {
        "greeting": "This week has been exciting for the markets.",
        "sections": [
            {
                "title": "Market Update",
                "content": "The **S&P 500** hit a new all-time high. Check [this](https://example.com) for details.",
            },
            {
                "title": "What I'm Watching",
                "content": "Fed meeting next week could shift sentiment.",
            },
        ],
        "closing": "Reply to share your thoughts. Thanks for reading!",
        "sign_off_name": "Golden / test",
        "sign_off_title": "test title",
    }


# ===========================================================================
# TestFormatNewsletterPlaintext
# ===========================================================================


class TestFormatNewsletterPlaintext:
    """Tests for _format_newsletter_plaintext rendering."""

    def test_starts_with_greeting_template(self, email_svc, newsletter_data):
        """Output starts with Hi {first_name} template."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert text.startswith("Hi {{{FIRST_NAME}}},")

    def test_contains_greeting_text(self, email_svc, newsletter_data):
        """Greeting text appears after the Hi line."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "This week has been exciting" in text

    def test_section_titles_present(self, email_svc, newsletter_data):
        """Section titles appear in output."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "Market Update" in text
        assert "What I'm Watching" in text

    def test_markdown_bold_stripped(self, email_svc, newsletter_data):
        """**bold** syntax is stripped to plain text."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "**" not in text
        assert "S&P 500" in text

    def test_markdown_links_converted(self, email_svc, newsletter_data):
        """[text](url) converted to text: url."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "[this]" not in text
        assert "this: https://example.com" in text

    def test_closing_present(self, email_svc, newsletter_data):
        """Closing text appears."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "Reply to share your thoughts" in text

    def test_sign_off_present(self, email_svc, newsletter_data):
        """Sign-off name and title appear."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        assert "Golden / test" in text
        assert "test title" in text

    def test_paragraphs_separated_by_double_newline(self, email_svc, newsletter_data):
        """Paragraphs are joined by exactly \\n\\n."""
        text = email_svc._format_newsletter_plaintext(newsletter_data)
        # Should not have triple newlines
        assert "\n\n\n" not in text
        # Should have double newlines between sections
        assert "\n\n" in text

    def test_empty_sections(self, email_svc):
        """Empty sections list still produces valid output."""
        data = {"greeting": "Hello", "sections": [], "closing": "Bye"}
        text = email_svc._format_newsletter_plaintext(data)
        assert "Hi {{{FIRST_NAME}}}," in text
        assert "Hello" in text
        assert "Bye" in text

    def test_empty_greeting(self, email_svc):
        """Missing greeting still produces output."""
        data = {
            "sections": [{"title": "Test", "content": "Content"}],
            "closing": "Bye",
        }
        text = email_svc._format_newsletter_plaintext(data)
        assert "Test" in text
        assert "Content" in text

    def test_default_sign_off(self, email_svc):
        """Default sign-off values are used when not provided."""
        data = {"greeting": "", "sections": [], "closing": ""}
        text = email_svc._format_newsletter_plaintext(data)
        assert "Golden / " in text

    def test_section_without_title(self, email_svc):
        """Section with empty title only shows content."""
        data = {
            "greeting": "",
            "sections": [{"title": "", "content": "Just content"}],
            "closing": "",
        }
        text = email_svc._format_newsletter_plaintext(data)
        assert "Just content" in text


# ===========================================================================
# TestNewsletterModels
# ===========================================================================


class TestNewsletterSection:
    """Tests for NewsletterSection model."""

    def test_valid_section(self):
        """Valid section with title and content."""
        s = NewsletterSection(title="Intro", content="Hello world")
        assert s.title == "Intro"
        assert s.content == "Hello world"

    def test_missing_title_raises(self):
        """Title is required."""
        with pytest.raises(ValidationError):
            NewsletterSection(content="Hello")

    def test_missing_content_raises(self):
        """Content is required."""
        with pytest.raises(ValidationError):
            NewsletterSection(title="Intro")


class TestNewsletterOutput:
    """Tests for NewsletterOutput model."""

    def test_valid_output(self):
        """Full valid output."""
        out = NewsletterOutput(
            subject="Weekly Update",
            greeting="Markets had a great week.",
            sections=[NewsletterSection(title="A", content="B")],
            closing="Thanks for reading!",
        )
        assert out.subject == "Weekly Update"
        assert len(out.sections) == 1
        assert out.sign_off_name == "Golden / " + "\u91d1\u9ec4"

    def test_default_sign_off(self):
        """Default sign-off values are set."""
        out = NewsletterOutput(
            subject="Test",
            greeting="Hi",
            sections=[NewsletterSection(title="A", content="B")],
            closing="Bye",
        )
        assert "Golden" in out.sign_off_name
        assert out.sign_off_title != ""

    def test_missing_subject_raises(self):
        """Subject is required."""
        with pytest.raises(ValidationError):
            NewsletterOutput(
                greeting="Hi",
                sections=[NewsletterSection(title="A", content="B")],
                closing="Bye",
            )


class TestNewsletterGenerateRequest:
    """Tests for NewsletterGenerateRequest model."""

    def test_valid_request(self):
        """Valid request with intent."""
        req = NewsletterGenerateRequest(intent="Share product launch news")
        assert req.intent == "Share product launch news"
        assert req.tone == "warm"
        assert req.language == "zh"

    def test_custom_tone_and_language(self):
        """Custom tone and language override defaults."""
        req = NewsletterGenerateRequest(intent="Test", tone="professional", language="en")
        assert req.tone == "professional"
        assert req.language == "en"

    def test_missing_intent_raises(self):
        """Intent is required."""
        with pytest.raises(ValidationError):
            NewsletterGenerateRequest()


class TestNewsletterSendRequest:
    """Tests for NewsletterSendRequest model."""

    def test_valid_send_request(self):
        """Valid send request with all fields."""
        req = NewsletterSendRequest(
            email="test@example.com",
            first_name="Alice",
            subject="Test Subject",
            greeting="Hi there",
            sections=[{"title": "A", "content": "B"}],
            closing="Thanks",
        )
        assert req.email == "test@example.com"
        assert req.first_name == "Alice"

    def test_default_email_is_empty(self):
        """Email defaults to empty string."""
        req = NewsletterSendRequest(
            subject="Test",
            greeting="Hi",
            sections=[{"title": "A", "content": "B"}],
            closing="Bye",
        )
        assert req.email == ""

    def test_missing_subject_raises(self):
        """Subject is required."""
        with pytest.raises(ValidationError):
            NewsletterSendRequest(
                greeting="Hi",
                sections=[{"title": "A", "content": "B"}],
                closing="Bye",
            )


class TestNewsletterBroadcastRequest:
    """Tests for NewsletterBroadcastRequest model."""

    def test_valid_broadcast_request(self):
        """Valid broadcast request."""
        req = NewsletterBroadcastRequest(
            subject="Broadcast Test",
            greeting="Hi all",
            sections=[{"title": "News", "content": "Big news"}],
            closing="Thanks",
        )
        assert req.subject == "Broadcast Test"
        assert len(req.sections) == 1

    def test_default_sign_off(self):
        """Default sign-off values."""
        req = NewsletterBroadcastRequest(
            subject="Test",
            greeting="Hi",
            sections=[{"title": "A", "content": "B"}],
            closing="Bye",
        )
        assert "Golden" in req.sign_off_name


# ===========================================================================
# TestSendNewsletter
# ===========================================================================


class TestSendNewsletter:
    """Tests for send_newsletter error handling (no real API calls)."""

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(self, email_svc):
        """Returns error when API key is not configured."""
        result = await email_svc.send_newsletter(
            data={"greeting": "", "sections": [], "closing": ""},
            subject="Test",
            to_email="test@example.com",
        )
        assert result["success"] is False
        assert "RESEND_API_KEY" in result["error"]


class TestBroadcastNewsletter:
    """Tests for broadcast_newsletter error handling (no real API calls)."""

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(self, email_svc):
        """Returns error when API key is not configured."""
        result = await email_svc.broadcast_newsletter(
            data={"greeting": "", "sections": [], "closing": ""},
            subject="Test",
        )
        assert result["success"] is False
        assert "RESEND_API_KEY" in result["error"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
