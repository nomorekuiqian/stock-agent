"""
Email Service using Resend for sending daily market reports and personal digests.
Subscription management is handled by SubscriptionService.

HTML rendering lives in email_templates.py; shared CSS constants in email_styles.py.
This module handles send/broadcast orchestration only.
"""

import asyncio
import time
from typing import Optional
from urllib.parse import quote

import resend

from app.core.config import (
    RESEND_API_KEY,
    FRONTEND_URL,
    ENVIRONMENT,
    RESEND_SEGMENT_MORNING,
    RESEND_SEGMENT_EVENING,
    RESEND_SEGMENT_WEEKLY,
)
from app.core.logging import get_logger
from app.utils.timezone import now_iso, today_str
from app.features.subscription.service import (
    get_subscription_service,
    SubscriptionChannel,
)
from app.features.brew.db import save_user_digest, get_user_watchlist

# Import all template functions (used directly + re-exported as proxy methods)
import app.features.subscription.email_templates as email_templates
from app.features.subscription.email_templates import (
    format_html_report,
    format_digest_html,
    format_weekly_report_html,
    format_welcome_html,
    format_verification_email_html,
    format_newsletter_plaintext,
    format_morning_report_html,
    format_timestamp,
    get_time_greeting,
    format_markdown_to_html,
    format_change_color,
    format_change_text,
    truncate_at_paragraph,
    get_email_header,
    get_feedback_section,
    get_email_footer,
    get_digest_cta_section,
)

logger = get_logger(__name__)


class EmailService:
    """Service for sending market analysis reports and personal digests via email."""

    def __init__(self):
        self.api_key = RESEND_API_KEY
        if self.api_key:
            resend.api_key = self.api_key
        self.from_email = "TheMarketBrew Daily <daily@themarketbrew.com>"
        self.from_email_morning = "TheMarketBrew Morning <morning@themarketbrew.com>"
        self.from_email_weekly = "TheMarketBrew Weekly <weekly@themarketbrew.com>"
        self.frontend_url = (
            FRONTEND_URL if FRONTEND_URL else "https://themarketbrew.com"
        )
        self.is_production = ENVIRONMENT == "production"
        self.logo_url = "https://themarketbrew.com/logo-avatar.png"

    @property
    def frontend_url(self) -> str:
        return self._frontend_url

    @frontend_url.setter
    def frontend_url(self, value: str):
        self._frontend_url = value
        email_templates._FRONTEND_URL = value

    @property
    def logo_url(self) -> str:
        return self._logo_url

    @logo_url.setter
    def logo_url(self, value: str):
        self._logo_url = value
        email_templates._LOGO_URL = value

    # ------------------------------------------------------------------
    # Backward-compatible proxy methods (tests call svc._format_xxx)
    # ------------------------------------------------------------------

    def _format_timestamp(self, timestamp: str) -> str:
        return format_timestamp(timestamp)

    def _get_time_greeting(self) -> str:
        return get_time_greeting()

    def _format_markdown_to_html(self, text: str) -> str:
        return format_markdown_to_html(text)

    def _get_email_header(self, formatted_date: str, title: str = "Daily Brief") -> str:
        return get_email_header(formatted_date, title)

    def _get_feedback_section(
        self,
        report_date: str,
        report_id: Optional[str] = None,
        report_type: str = "daily",
    ) -> str:
        return get_feedback_section(report_date, report_id, report_type)

    def _get_email_footer(
        self,
        unsubscribe_url: Optional[str] = "{{{RESEND_UNSUBSCRIBE_URL}}}",
    ) -> str:
        return get_email_footer(unsubscribe_url)

    def _get_digest_cta_section(self) -> str:
        return get_digest_cta_section()

    def _format_html_report(
        self,
        data: dict,
        report_date: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> str:
        return format_html_report(data, report_date, report_id)

    def _format_digest_html(
        self,
        data: dict,
        first_name: str = "",
        digest_date: Optional[str] = None,
        digest_id: Optional[str] = None,
    ) -> str:
        return format_digest_html(data, first_name, digest_date, digest_id)

    def _format_weekly_report_html(
        self,
        data: dict,
        report_date: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> str:
        return format_weekly_report_html(data, report_date, report_id)

    def _truncate_at_paragraph(self, text: str, max_chars: int) -> str:
        return truncate_at_paragraph(text, max_chars)

    def _format_welcome_html(self, first_name: str = "") -> str:
        return format_welcome_html(first_name)

    def _format_verification_email_html(
        self,
        verification_code: str,
        verify_url: str,
        recipient_email: str = "",
    ) -> str:
        return format_verification_email_html(
            verification_code=verification_code,
            verify_url=verify_url,
            recipient_email=recipient_email,
        )

    def _format_newsletter_plaintext(self, data: dict) -> str:
        return format_newsletter_plaintext(data)

    def _format_change_color(self, change: float) -> str:
        return format_change_color(change)

    def _format_change_text(self, change: float) -> str:
        return format_change_text(change)

    def _format_morning_report_html(
        self, data: dict, report_date: str, report_id: Optional[str] = None
    ) -> str:
        return format_morning_report_html(data, report_date, report_id)

    # ------------------------------------------------------------------
    # Audience resolution + broadcast helper
    # ------------------------------------------------------------------

    # Test Broadcast audience - used automatically in non-production environments
    TEST_AUDIENCE_ID = "1c300c45-49a7-479e-a4c2-1ed5cfccda1e"

    def _resolve_audience(
        self,
        audience_id: Optional[str],
        channel: SubscriptionChannel,
    ) -> str:
        """Return the given audience_id, or look up the default for the channel.

        In non-production environments, always routes to TEST_AUDIENCE_ID
        to prevent accidentally emailing real subscribers.
        """
        if not self.is_production:
            forced = audience_id or self.TEST_AUDIENCE_ID
            logger.info(
                "[EmailService] Non-production: routing %s broadcast "
                "to test audience %s",
                channel.value,
                forced,
            )
            return forced
        if audience_id:
            return audience_id
        sub_service = get_subscription_service()
        return sub_service.ensure_audience(channel)

    def _resolve_segment(self, segment_id: str) -> Optional[str]:
        """Return segment_id in production, None in non-production (fallback to audience)."""
        if not segment_id:
            return None
        if not self.is_production:
            logger.info(
                "Non-production: segment %s -> test audience fallback",
                segment_id,
            )
            return None
        return segment_id

    def _create_and_send_broadcast(
        self,
        label: str,
        audience_id: Optional[str] = None,
        subject: str = "",
        broadcast_name: str = "",
        html: Optional[str] = None,
        text: Optional[str] = None,
        from_email: Optional[str] = None,
        segment_id: Optional[str] = None,
    ) -> dict:
        """Create a Resend broadcast, send it, and verify delivery.

        Uses segment_id if provided (for targeted sends), otherwise audience_id.

        Returns {"success": True, "broadcast_id": ..., "audience_id": ...}
        or {"success": False, "error": ...}.
        """
        create_params: resend.Broadcasts.CreateParams = {
            "from": from_email or self.from_email,
            "subject": subject,
            "name": broadcast_name,
        }
        if segment_id:
            create_params["segment_id"] = segment_id
        elif audience_id:
            create_params["audience_id"] = audience_id
        else:
            return {"success": False, "error": "No audience_id or segment_id provided"}
        if html:
            create_params["html"] = html
        if text:
            create_params["text"] = text

        max_retries = 3
        broadcast = None
        for attempt in range(max_retries):
            try:
                broadcast = resend.Broadcasts.create(create_params)
                break
            except Exception as e:
                if "Too many requests" in str(e) and attempt < max_retries - 1:
                    wait = (attempt + 1) * 2
                    logger.warning(
                        "%s broadcast create rate limited, retry in %ds...", label, wait
                    )
                    time.sleep(wait)
                else:
                    raise

        broadcast_id = broadcast.get("id") if broadcast else None
        if not broadcast_id:
            logger.error("%s broadcast create returned no id: %s", label, broadcast)
            return {"success": False, "error": "Broadcast creation returned no ID"}
        logger.info("%s broadcast created: %s", label, broadcast_id)

        # Resend rate limit is 2 req/s, wait to avoid hitting it
        time.sleep(1)

        send_result = None
        for attempt in range(max_retries):
            try:
                send_params: resend.Broadcasts.SendParams = {
                    "broadcast_id": broadcast_id
                }
                send_result = resend.Broadcasts.send(send_params)
                break
            except Exception as e:
                if "Too many requests" in str(e) and attempt < max_retries - 1:
                    wait = (attempt + 1) * 2
                    logger.warning(
                        "%s broadcast send rate limited, retry in %ds...", label, wait
                    )
                    time.sleep(wait)
                else:
                    raise

        send_id = send_result.get("id") if send_result else None
        logger.info("%s broadcast send result: %s", label, send_result)

        if not send_id:
            logger.warning(
                "%s send returned unexpected result, verifying status...", label
            )
            time.sleep(1)
            verify = resend.Broadcasts.get(broadcast_id)
            status = verify.get("status") if verify else None
            logger.info("%s broadcast status after send: %s", label, status)
            if status not in ("sent", "queued"):
                return {
                    "success": False,
                    "error": f"{label} broadcast send failed, status: {status}",
                    "broadcast_id": broadcast_id,
                }

        # Count audience contacts for monitoring (only when audience_id is available)
        total = 0
        if audience_id:
            try:
                contacts = resend.Contacts.list(audience_id=audience_id)
                total = len(
                    [c for c in contacts.get("data", []) if not c.get("unsubscribed")]
                )
            except Exception as e:
                logger.warning("%s failed to count audience contacts: %s", label, e)

        logger.info(
            "%s broadcast sent successfully: %s (%s: %s)",
            label,
            broadcast_id,
            "segment" if segment_id else "audience",
            segment_id if segment_id else "%d contacts" % total,
        )
        return {
            "success": True,
            "broadcast_id": broadcast_id,
            "audience_id": audience_id,
            "segment_id": segment_id,
            "total": total,
            "sent": total,
            "failed": 0,
        }

    # ------------------------------------------------------------------
    # Single-send methods
    # ------------------------------------------------------------------

    async def send_daily_report(
        self,
        data: dict,
        to_email: Optional[str] = None,
        first_name: Optional[str] = None,
    ) -> dict:
        """Send the daily market report email to a single recipient."""
        logger.info("send_daily_report to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        recipient = to_email or ""
        if not recipient:
            return {"success": False, "error": "No recipient email specified"}

        try:
            report_date = data.get("report_date") or today_str()
            report_id = data.get("report_id")
            html_content = format_html_report(data, report_date, report_id)

            display_name = first_name
            if not display_name:
                sub_service = get_subscription_service()
                status = sub_service.get_status(
                    SubscriptionChannel.DAILY_REPORT, recipient
                )
                if status.get("subscribed"):
                    display_name = status.get("metadata", {}).get("first_name", "")

            html_content = html_content.replace("{{{first_name}}}", display_name or "")
            html_content = html_content.replace("{{{email}}}", quote(recipient))

            today = today_str()
            report_title = data.get("title", "")
            subject = (
                f"[TheMarketBrew] {report_title}"
                if report_title
                else f"[TheMarketBrew] {today}"
            )

            params = {
                "from": self.from_email,
                "to": [recipient],
                "subject": subject,
                "html": html_content,
            }

            email = resend.Emails.send(params)
            logger.info("Email sent: %s", email.get("id"))
            return {"success": True, "email_id": email.get("id"), "sent_to": recipient}

        except Exception as e:
            logger.error("Error sending email: %s", e)
            return {"success": False, "error": str(e)}

    async def send_personal_digest(
        self,
        data: dict,
        to_email: str,
        first_name: Optional[str] = None,
        digest_date: Optional[str] = None,
        digest_id: Optional[str] = None,
    ) -> dict:
        """Send a personal digest email to a single recipient."""
        logger.info("send_personal_digest to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            feedback_date = digest_date or data.get("digest_date") or today_str()
            feedback_id = digest_id or data.get("digest_id")

            html_content = format_digest_html(
                data, first_name or "", feedback_date, feedback_id
            )

            html_content = html_content.replace("{{{email}}}", quote(to_email))

            today = today_str()
            one_line = data.get("one_line_summary", "")[:50]
            subject = (
                f"[TheMarketBrew专属日报] {one_line}"
                if one_line
                else f"[TheMarketBrew专属日报] {today}"
            )

            params = {
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }

            email = resend.Emails.send(params)
            logger.info("Digest email sent: %s", email.get("id"))
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            logger.error("Error sending digest email: %s", e)
            return {"success": False, "error": str(e)}

    async def send_weekly_report(
        self, data: dict, to_email: str, first_name: Optional[str] = None
    ) -> dict:
        """Send the weekly macro report email to a single recipient."""
        logger.info("send_weekly_report to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            report_id = data.get("id")
            html_content = format_weekly_report_html(data, report_id=report_id)

            display_name = first_name or ""
            html_content = html_content.replace("{{{first_name}}}", display_name)
            html_content = html_content.replace("{{{email}}}", quote(to_email))

            title = data.get("title", "")
            week_label = data.get("week_label", "")
            subject = (
                f"[TheMarketBrew周报] {title}"
                if title
                else f"[TheMarketBrew周报] {week_label}"
            )

            params = {
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }

            email = resend.Emails.send(params)
            logger.info("Weekly report email sent: %s", email.get("id"))
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            logger.error("Error sending weekly report email: %s", e)
            return {"success": False, "error": str(e)}

    async def send_newsletter(
        self, data: dict, subject: str, to_email: str, first_name: str = ""
    ) -> dict:
        """Send a newsletter as plain text email to a single recipient."""
        logger.info("send_newsletter to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            text_content = format_newsletter_plaintext(data)
            text_content = text_content.replace(
                "{{{first_name}}}", first_name or "朋友"
            )

            params = {
                "from": "Golden from TheMarketBrew <hello@themarketbrew.com>",
                "to": [to_email],
                "subject": subject,
                "text": text_content,
            }

            email = resend.Emails.send(params)
            logger.info("Newsletter sent: %s", email.get("id"))
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            logger.error("Error sending newsletter: %s", e)
            return {"success": False, "error": str(e)}

    async def send_welcome_email(
        self, to_email: str, first_name: Optional[str] = None
    ) -> dict:
        """Send welcome email to new subscriber."""
        logger.info("send_welcome_email to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            html_content = format_welcome_html(first_name or "")

            params = {
                "from": "Golden from TheMarketBrew <hello@themarketbrew.com>",
                "to": [to_email],
                "subject": "欢迎加入 TheMarketBrew",
                "html": html_content,
            }

            email = resend.Emails.send(params)
            logger.info("Welcome email sent: %s", email.get("id"))
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            logger.error("Error sending welcome email: %s", e)
            return {"success": False, "error": str(e)}

    async def send_morning_report(
        self, data: dict, to_email: str, first_name: Optional[str] = None
    ) -> dict:
        """Send the morning report email to a single recipient (for testing)."""
        logger.info("send_morning_report to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            today = today_str()
            report_date = data.get("report_date") or today
            report_id = data.get("report_id")
            html_content = format_morning_report_html(data, report_date, report_id)

            display_name = first_name or ""
            html_content = html_content.replace("{{{first_name}}}", display_name)
            html_content = html_content.replace("{{{email}}}", quote(to_email))

            report_title = data.get("title", "")
            subject = (
                f"[TheMarketBrew早报] {report_title}"
                if report_title
                else f"[TheMarketBrew早报] {today}"
            )

            params = {
                "from": self.from_email_morning,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }

            result = resend.Emails.send(params)
            email_id = result.get("id") if result else None

            if email_id:
                logger.info("Morning report sent to %s: %s", to_email, email_id)
                return {"success": True, "email_id": email_id}
            else:
                return {"success": False, "error": "No email ID returned"}

        except Exception as e:
            logger.error("Error sending morning report to %s: %s", to_email, e)
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Broadcast methods
    # ------------------------------------------------------------------

    async def broadcast_daily_report(
        self, data: dict, audience_id: Optional[str] = None
    ) -> dict:
        """Send the daily market report using Resend Broadcasts."""
        logger.info("broadcast_daily_report called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            today = today_str()
            report_date = data.get("report_date") or today
            report_id = data.get("report_id")
            html_content = format_html_report(data, report_date, report_id)

            report_title = data.get("title", "")
            subject = (
                f"[TheMarketBrew] {report_title}"
                if report_title
                else f"[TheMarketBrew] {today}"
            )

            # Use segment for targeted send, fallback to audience
            segment_id = self._resolve_segment(RESEND_SEGMENT_EVENING)
            fallback_audience = (
                self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
                if not segment_id
                else None
            )

            return self._create_and_send_broadcast(
                label="Daily",
                audience_id=fallback_audience,
                segment_id=segment_id,
                subject=subject,
                broadcast_name=f"Daily Report {today}",
                html=html_content,
            )

        except Exception as e:
            logger.error("Error broadcasting: %s", e)
            return {"success": False, "error": str(e)}

    async def broadcast_personal_digest(
        self, data: dict, audience_id: Optional[str] = None, first_name: str = ""
    ) -> dict:
        """Broadcast a personal digest using Resend Broadcasts."""
        logger.info("broadcast_personal_digest called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self._resolve_audience(
                audience_id, SubscriptionChannel.PERSONAL_DIGEST
            )
            today = today_str()
            digest_date = data.get("digest_date") or today
            digest_id = data.get("digest_id")
            html_content = format_digest_html(
                data,
                first_name=first_name,
                digest_date=digest_date,
                digest_id=digest_id,
            )

            one_line = data.get("one_line_summary", "")
            subject = (
                f"[TheMarketBrew专属日报] {one_line[:50]}"
                if one_line
                else f"[TheMarketBrew专属日报] {today}"
            )

            return self._create_and_send_broadcast(
                label="Digest",
                audience_id=audience_id,
                subject=subject,
                broadcast_name=f"Personal Digest {today}",
                html=html_content,
            )

        except Exception as e:
            logger.error("Error broadcasting digest: %s", e)
            return {"success": False, "error": str(e)}

    async def broadcast_weekly_report(
        self, data: dict, audience_id: Optional[str] = None
    ) -> dict:
        """Send the weekly macro report using Resend Broadcasts."""
        logger.info("broadcast_weekly_report called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            week_label = data.get("week_label", "")
            report_id = data.get("id")
            html_content = format_weekly_report_html(data, report_id=report_id)

            title = data.get("title", "")
            subject = (
                f"[TheMarketBrew周报] {title}"
                if title
                else f"[TheMarketBrew周报] {week_label}"
            )

            # Use segment for targeted send, fallback to audience
            segment_id = self._resolve_segment(RESEND_SEGMENT_WEEKLY)
            fallback_audience = (
                self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
                if not segment_id
                else None
            )

            return self._create_and_send_broadcast(
                label="Weekly",
                audience_id=fallback_audience,
                segment_id=segment_id,
                subject=subject,
                broadcast_name=f"Weekly Report {week_label}",
                html=html_content,
                from_email=self.from_email_weekly,
            )

        except Exception as e:
            logger.error("Error broadcasting weekly report: %s", e)
            return {"success": False, "error": str(e)}

    async def broadcast_newsletter(
        self, data: dict, subject: str, audience_id: Optional[str] = None
    ) -> dict:
        """Broadcast newsletter to all daily report subscribers."""
        logger.info("broadcast_newsletter called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self._resolve_audience(
                audience_id, SubscriptionChannel.DAILY_REPORT
            )
            text_content = format_newsletter_plaintext(data)
            today = today_str()

            return self._create_and_send_broadcast(
                label="Newsletter",
                audience_id=audience_id,
                subject=subject,
                broadcast_name=f"Newsletter {today}",
                text=text_content,
                from_email="Golden from TheMarketBrew <hello@themarketbrew.com>",
            )

        except Exception as e:
            logger.error("Error broadcasting newsletter: %s", e)
            return {"success": False, "error": str(e)}

    async def broadcast_morning_report(
        self, data: dict, audience_id: Optional[str] = None
    ) -> dict:
        """Send the morning report using Resend Broadcasts."""
        logger.info("broadcast_morning_report called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            today = today_str()
            report_date = data.get("report_date") or today
            report_id = data.get("report_id")
            html_content = format_morning_report_html(data, report_date, report_id)

            report_title = data.get("title", "")
            subject = (
                f"[TheMarketBrew早报] {report_title}"
                if report_title
                else f"[TheMarketBrew早报] {today}"
            )

            # Use segment for targeted send, fallback to audience
            segment_id = self._resolve_segment(RESEND_SEGMENT_MORNING)
            fallback_audience = (
                self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
                if not segment_id
                else None
            )

            return self._create_and_send_broadcast(
                label="Morning",
                audience_id=fallback_audience,
                segment_id=segment_id,
                subject=subject,
                broadcast_name=f"Morning Report {today}",
                html=html_content,
                from_email=self.from_email_morning,
            )

        except Exception as e:
            logger.error("Error broadcasting morning report: %s", e)
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Batch personal digests (complex orchestration -- stays here)
    # ------------------------------------------------------------------

    async def broadcast_personal_digests(self, max_concurrent: int = 5) -> dict:
        """
        Generate and batch-send personal digests to all subscribers.

        Phase 1: Parallel generation with semaphore-controlled concurrency.
        Phase 2: Batch send via resend.Batch.send() (up to 100 emails per call).
        """
        logger.info("broadcast_personal_digests called")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            from app.features.brew.agent import get_personal_digest

            # Canary check: verify Insforge connectivity before processing
            canary_result = await get_user_watchlist(
                "14204862-26b9-4f24-b8ff-7f98e2f3fe1d"  # voya test account
            )
            if canary_result is None:
                logger.error(
                    "Insforge canary check FAILED: cannot reach "
                    "user-watchlists Edge Function"
                )
            else:
                logger.info(
                    "Insforge canary check OK: %d symbols",
                    len(canary_result.get("symbols", [])),
                )

            if not self.is_production:
                # Dev environment: use test segment contacts instead of production subscribers
                logger.info(
                    "[EmailService] Non-production: "
                    "loading contacts from test segment %s",
                    self.TEST_AUDIENCE_ID,
                )
                import json

                contacts = resend.Contacts.list(audience_id=self.TEST_AUDIENCE_ID)
                active = [
                    c for c in contacts.get("data", []) if not c.get("unsubscribed")
                ]
                subscribers = []
                for c in active:
                    metadata = {}
                    if c.get("last_name"):
                        try:
                            metadata = json.loads(c["last_name"])
                        except Exception:
                            pass
                    subscribers.append(
                        {
                            "email": c.get("email", ""),
                            "metadata": {
                                "first_name": c.get("first_name", ""),
                                "user_id": metadata.get("user_id"),
                            },
                        }
                    )
            else:
                sub_service = get_subscription_service()
                result = sub_service.list_subscribers(
                    SubscriptionChannel.PERSONAL_DIGEST, limit=500
                )

                if not result.get("success"):
                    return {
                        "success": False,
                        "error": result.get("error", "Failed to list subscribers"),
                    }

                subscribers = result.get("subscribers", [])
            if not subscribers:
                return {
                    "success": True,
                    "channel": "personal_digest",
                    "total": 0,
                    "sent": 0,
                    "failed": 0,
                    "errors": [],
                }

            logger.info("Broadcasting to %d subscribers", len(subscribers))

            semaphore = asyncio.Semaphore(max_concurrent)
            digest_agent = get_personal_digest()

            async def save_digest_to_db(
                user_id: str, email: str, digest_result: dict, symbols: list
            ) -> None:
                """Save digest to database (fire-and-forget, errors logged only)."""
                try:
                    save_data = {
                        "user_id": user_id,
                        "digest_date": today_str(),
                        "timestamp": digest_result.get("timestamp", now_iso()),
                        "symbols": digest_result.get("symbols_used", symbols),
                        "greeting": digest_result.get("greeting", ""),
                        "one_line_summary": digest_result.get("one_line_summary", ""),
                        "stocks": digest_result.get("stocks", []),
                        "news": digest_result.get("news", {}),
                        "events": digest_result.get("events", []),
                        "summary": digest_result.get("summary", {}),
                    }
                    await save_user_digest(save_data)
                    logger.info("Saved digest to DB for %s", email)
                except Exception as db_err:
                    logger.error("DB save failed for %s: %s", email, db_err)

            async def prepare_digest_email(
                email: str, first_name: str, user_id: str, symbols: list
            ) -> dict:
                """Generate digest, format HTML, save DB. Return email params (no send)."""
                digest_result = await digest_agent.generate(symbols)
                if not digest_result.get("success"):
                    raise Exception(digest_result.get("error", "Generation failed"))

                html_content = format_digest_html(digest_result, first_name or "")
                html_content = html_content.replace("{{{email}}}", quote(email))

                today = today_str()
                one_line = digest_result.get("one_line_summary", "")[:50]
                subject = (
                    f"[TheMarketBrew专属日报] {one_line}"
                    if one_line
                    else f"[TheMarketBrew专属日报] {today}"
                )

                if user_id:
                    await save_digest_to_db(user_id, email, digest_result, symbols)

                return {
                    "email": email,
                    "success": True,
                    "params": {
                        "from": self.from_email,
                        "to": [email],
                        "subject": subject,
                        "html": html_content,
                    },
                }

            async def get_symbols_for_user(
                user_id: str, email: str
            ) -> tuple[list, str]:
                """Get symbols from Insforge user_watchlists table only.

                Returns:
                    (symbols_list, error_reason) - empty reason means success
                """
                if not user_id:
                    logger.info("No user_id for %s, skipping", email)
                    return [], "No user_id in subscription metadata"

                watchlist = await get_user_watchlist(user_id)
                if watchlist is None:
                    logger.warning(
                        "Watchlist query failed for %s (user_id=%s), "
                        "likely Insforge API issue",
                        email,
                        user_id[:8],
                    )
                    return [], "Watchlist query failed (Insforge API error)"

                symbols = watchlist.get("symbols", [])
                if not symbols:
                    logger.info("No watchlist found in Insforge for %s", email)
                    return [], "No symbols configured"

                logger.info(
                    "Loaded %d symbols from Insforge for %s",
                    len(symbols),
                    email,
                )
                return symbols, ""

            async def process_subscriber(sub: dict) -> dict:
                """Process a single subscriber with retry logic."""
                email = sub.get("email", "")
                metadata = sub.get("metadata", {})
                first_name = metadata.get("first_name", "")
                user_id = metadata.get("user_id")

                symbols, reason = await get_symbols_for_user(user_id, email)
                if not symbols:
                    return {
                        "email": email,
                        "success": False,
                        "error": reason,
                    }

                async with semaphore:
                    try:
                        return await prepare_digest_email(
                            email, first_name, user_id, symbols
                        )
                    except Exception as e:
                        logger.warning("First attempt failed for %s: %s", email, e)

                    await asyncio.sleep(2)
                    try:
                        return await prepare_digest_email(
                            email, first_name, user_id, symbols
                        )
                    except Exception as retry_error:
                        logger.error("Retry failed for %s: %s", email, retry_error)
                        return {
                            "email": email,
                            "success": False,
                            "error": str(retry_error),
                        }

            # --- Phase 1: parallel generation ---
            results = await asyncio.gather(
                *[process_subscriber(sub) for sub in subscribers],
                return_exceptions=True,
            )

            email_params_list: list[dict] = []
            errors: list[dict] = []
            failed_subs: list[dict] = []

            for idx, r in enumerate(results):
                if isinstance(r, Exception):
                    errors.append({"error": str(r)})
                    failed_subs.append(subscribers[idx])
                elif isinstance(r, dict):
                    if r.get("success") and r.get("params"):
                        email_params_list.append(r["params"])
                    else:
                        errors.append(
                            {"email": r.get("email"), "error": r.get("error")}
                        )
                        failed_subs.append(subscribers[idx])

            gen_failed = len(errors)
            logger.info(
                "Phase 1 complete: %d emails prepared, %d generation failures",
                len(email_params_list),
                gen_failed,
            )

            # --- Phase 2: batch send ---
            sent_count = 0
            send_errors: list[dict] = []
            batch_size = 100

            for i in range(0, len(email_params_list), batch_size):
                chunk = email_params_list[i : i + batch_size]
                batch_num = i // batch_size + 1

                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = resend.Batch.send(chunk)
                        batch_errors = (
                            response.get("errors", [])
                            if isinstance(response, dict)
                            else []
                        )
                        if batch_errors:
                            for err in batch_errors:
                                idx = err.get("index", -1)
                                email_addr = (
                                    chunk[idx]["to"][0]
                                    if 0 <= idx < len(chunk)
                                    else "unknown"
                                )
                                send_errors.append(
                                    {
                                        "email": email_addr,
                                        "error": err.get("message", "validation error"),
                                    }
                                )
                            sent_count += len(chunk) - len(batch_errors)
                        else:
                            sent_count += len(chunk)
                        logger.info(
                            "Batch %d sent: %d ok",
                            batch_num,
                            len(chunk) - len(batch_errors),
                        )
                        break
                    except Exception as e:
                        err_str = str(e)
                        if "Too many requests" in err_str and attempt < max_retries - 1:
                            wait = (attempt + 1) * 3
                            logger.warning(
                                "Batch %d rate limited, retry in %ds...",
                                batch_num,
                                wait,
                            )
                            time.sleep(wait)
                        else:
                            logger.error("Batch %d send failed: %s", batch_num, e)
                            for p in chunk:
                                send_errors.append(
                                    {"email": p["to"][0], "error": err_str}
                                )
                            break

                # pause between batches to respect rate limits
                if i + batch_size < len(email_params_list):
                    time.sleep(1)

            # --- Phase 3: retry failed subscribers ---
            if failed_subs:
                logger.info(
                    "Phase 3: retrying %d failed subscribers after 5s delay",
                    len(failed_subs),
                )
                await asyncio.sleep(5)

                retry_results = await asyncio.gather(
                    *[process_subscriber(sub) for sub in failed_subs],
                    return_exceptions=True,
                )

                retry_params: list[dict] = []
                retry_errors: list[dict] = []
                for r in retry_results:
                    if isinstance(r, Exception):
                        retry_errors.append({"error": str(r)})
                    elif isinstance(r, dict):
                        if r.get("success") and r.get("params"):
                            retry_params.append(r["params"])
                        else:
                            retry_errors.append(
                                {"email": r.get("email"), "error": r.get("error")}
                            )

                logger.info(
                    "Phase 3 complete: %d recovered, %d still failed",
                    len(retry_params),
                    len(retry_errors),
                )

                # Batch send recovered emails
                for i in range(0, len(retry_params), batch_size):
                    chunk = retry_params[i : i + batch_size]
                    try:
                        response = resend.Batch.send(chunk)
                        batch_errors = (
                            response.get("errors", [])
                            if isinstance(response, dict)
                            else []
                        )
                        sent_count += len(chunk) - len(batch_errors)
                        for err in batch_errors:
                            eidx = err.get("index", -1)
                            email_addr = (
                                chunk[eidx]["to"][0]
                                if 0 <= eidx < len(chunk)
                                else "unknown"
                            )
                            send_errors.append(
                                {
                                    "email": email_addr,
                                    "error": err.get("message", "retry send error"),
                                }
                            )
                    except Exception as e:
                        logger.error("Phase 3 batch send failed: %s", e)
                        for p in chunk:
                            send_errors.append({"email": p["to"][0], "error": str(e)})

                # Replace Phase 1 errors with only the still-failed ones
                errors = retry_errors

            all_errors = errors + send_errors
            failed_count = len(errors) + len(send_errors)

            logger.info(
                "Broadcast complete: %d sent, %d failed (gen=%d, send=%d)",
                sent_count,
                failed_count,
                len(errors),
                len(send_errors),
            )

            return {
                "success": True,
                "channel": "personal_digest",
                "total": len(subscribers),
                "sent": sent_count,
                "failed": failed_count,
                "errors": all_errors[:10],
            }

        except Exception as e:
            logger.exception("Error in broadcast_personal_digests")
            return {"success": False, "error": str(e)}


_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
