"""
E2E Tests for Email Rendering and Delivery

Sends REAL emails to the test account (voya.technologies@gmail.com) only.
Tests the full pipeline: data fetch -> HTML render -> Resend delivery.

Uses resend.Emails.send() for reliable single-recipient delivery.
Broadcast template variables like {{{FIRST_NAME}}} are replaced manually
since Emails.send() does not support Resend template interpolation.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_broadcast_e2e.py -v
    pytest tests/e2e/test_broadcast_e2e.py::TestEmailE2E::test_personal_digest -v
"""

import time
import pytest
import resend

TEST_EMAIL = "voya.technologies@gmail.com"
TEST_FIRST_NAME = "Test"
FROM_DAILY = "TheMarketBrew Daily <daily@themarketbrew.com>"
FROM_MORNING = "TheMarketBrew Morning <morning@themarketbrew.com>"
FROM_WEEKLY = "TheMarketBrew Weekly <weekly@themarketbrew.com>"
FROM_DIGEST = "TheMarketBrew <digest@themarketbrew.com>"


def _interpolate(html: str) -> str:
    """Replace Resend broadcast template variables for Emails.send().

    Emails.send() does not support {{{VAR}}} interpolation (only Broadcasts do).
    """
    return html.replace("{{{FIRST_NAME}}}", TEST_FIRST_NAME)


@pytest.mark.e2e
class TestEmailE2E:
    """E2E tests: render real report HTML and send to test account."""

    @pytest.mark.asyncio
    async def test_daily_report(self, insforge_service, email_service):
        """Render and send a real daily report email."""
        from app.utils.timezone import today_str
        from app.features.subscription.email_templates import format_html_report

        report = await insforge_service.get_report_by_date(today_str())
        if not report:
            report = await insforge_service.get_latest_report()
        assert report is not None, "No daily report found. Generate one first."

        report_data = {
            "report_id": report.get("id"),
            "report_date": report.get("report_date"),
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "intro": report.get("intro", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "report_summary": report.get("report_summary", ""),
            "calendar": report.get("calendar", []),
        }

        html = _interpolate(format_html_report(
            report_data, report_data["report_date"], report_data["report_id"]
        ))
        assert len(html) > 1000, "HTML too short, likely broken render"
        # Note: {{{FIRST_NAME}}} may remain — it's a Resend Broadcast template
        # variable that only gets interpolated server-side during actual broadcasts.
        # Emails.send() sends it as-is, which is expected for E2E tests.

        title = report_data.get("title", "")
        result = resend.Emails.send({
            "from": FROM_DAILY,
            "to": [TEST_EMAIL],
            "subject": f"[E2E] {title}" if title else f"[E2E] Daily {today_str()}",
            "html": html,
        })
        assert result.get("id"), f"Send failed: {result}"
        print(f"\n[E2E] Daily report sent: {result['id']}")

    @pytest.mark.asyncio
    async def test_weekly_report(self, email_service):
        """Render and send a real weekly report email."""
        time.sleep(2)

        from app.features.macro.weekly import db as weekly_db
        from app.features.subscription.email_templates import format_weekly_report_html

        report = await weekly_db.get_latest_report()
        assert report is not None, "No weekly report found. Generate one first."

        html = _interpolate(format_weekly_report_html(report, report_id=report.get("id")))
        assert len(html) > 1000, "HTML too short"
        # Note: {{{FIRST_NAME}}} may remain — it's a Resend Broadcast template
        # variable that only gets interpolated server-side during actual broadcasts.
        # Emails.send() sends it as-is, which is expected for E2E tests.

        title = report.get("title", "")
        result = resend.Emails.send({
            "from": FROM_WEEKLY,
            "to": [TEST_EMAIL],
            "subject": f"[E2E] {title}" if title else f"[E2E] Weekly {report.get('week_label', '')}",
            "html": html,
        })
        assert result.get("id"), f"Send failed: {result}"
        print(f"\n[E2E] Weekly report sent: {result['id']}")

    @pytest.mark.asyncio
    async def test_morning_report(self, email_service):
        """Render and send a real morning report email."""
        time.sleep(2)

        from app.features.morning_report import db as morning_db
        from app.features.subscription.email_templates import format_morning_report_html

        report = await morning_db.get_latest_morning_report()
        assert report is not None, "No morning report found. Generate one first."

        report_data = {
            "report_id": report.get("id"),
            "report_date": report.get("report_date"),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "market_pulse": report.get("market_pulse", ""),
            "futures": report.get("futures", []),
            "futures_analysis": report.get("futures_analysis", ""),
            "global_markets": report.get("global_markets", {}),
            "global_markets_analysis": report.get("global_markets_analysis", ""),
            "overnight_news": report.get("overnight_news", []),
            "today_focus": report.get("today_focus", []),
            "summary": report.get("summary", []),
        }

        html = _interpolate(format_morning_report_html(report_data, report_data.get("report_id")))
        assert len(html) > 1000, "HTML too short"
        # Note: {{{FIRST_NAME}}} may remain — it's a Resend Broadcast template
        # variable that only gets interpolated server-side during actual broadcasts.
        # Emails.send() sends it as-is, which is expected for E2E tests.

        title = report_data.get("title", "")
        result = resend.Emails.send({
            "from": FROM_MORNING,
            "to": [TEST_EMAIL],
            "subject": f"[E2E] {title}" if title else "[E2E] Morning Report",
            "html": html,
        })
        assert result.get("id"), f"Send failed: {result}"
        print(f"\n[E2E] Morning report sent: {result['id']}")

    @pytest.mark.asyncio
    async def test_welcome_email(self, email_service):
        """Render and send the welcome email."""
        time.sleep(2)

        result = await email_service.send_welcome_email(
            to_email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
        )
        assert result.get("success") is True, f"Welcome email failed: {result.get('error')}"
        print(f"\n[E2E] Welcome email sent to {TEST_EMAIL}")

    @pytest.mark.asyncio
    async def test_personal_digest(self, email_service):
        """Send a real personal digest to the test account.

        Calls broadcast_personal_digests() which, in non-production,
        filters to the test email only.
        """
        time.sleep(2)

        result = await email_service.broadcast_personal_digests(max_concurrent=5)

        assert result.get("success") is True, f"Digest failed: {result.get('error')}"
        assert result["total"] >= 1, (
            f"Expected at least 1 subscriber (test account), got {result['total']}. "
            "Ensure voya.technologies@gmail.com has personal_digest_email entitlement and a watchlist."
        )
        assert result["sent"] >= 1, (
            f"Digest generated but not sent: {result.get('errors')}"
        )
        print(f"\n[E2E] Personal digest: total={result['total']} sent={result['sent']} failed={result['failed']}")
