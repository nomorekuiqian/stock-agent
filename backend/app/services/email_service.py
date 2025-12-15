"""
Email Service using Resend for sending daily market reports.
Supports subscriber management via Resend Contacts and Broadcasts API.
"""

import os
from datetime import datetime
from typing import Optional, List

import resend


class EmailService:
    """Service for sending market analysis reports via email with subscriber management."""

    def __init__(self):
        self.api_key = os.getenv("RESEND_API_KEY")
        if self.api_key:
            resend.api_key = self.api_key
        self.from_email = os.getenv("EMAIL_FROM", "Market Report <reports@resend.dev>")
        self.audience_id = os.getenv("RESEND_AUDIENCE_ID", "")
        self.audience_name = "MarketPulse Daily Subscribers"

    # =========================================================================
    # Subscriber Management (Resend Contacts + Audiences)
    # =========================================================================

    def ensure_audience(self) -> str:
        """Ensure the subscriber audience exists, create if not."""
        if not self.api_key:
            raise ValueError("RESEND_API_KEY not configured")

        # If audience_id is configured, use it
        if self.audience_id:
            return self.audience_id

        try:
            # Try to find existing audience
            audiences = resend.Audiences.list()
            for aud in audiences.get("data", []):
                if aud.get("name") == self.audience_name:
                    self.audience_id = aud["id"]
                    print(f"[EmailService] Found existing audience: {self.audience_id}")
                    return self.audience_id

            # Create new audience if not found
            audience = resend.Audiences.create({"name": self.audience_name})
            self.audience_id = audience["id"]
            print(f"[EmailService] Created new audience: {self.audience_id}")
            return self.audience_id

        except Exception as e:
            print(f"[EmailService] Error ensuring audience: {e}")
            raise

    def add_subscriber(self, email: str, first_name: str = None) -> dict:
        """
        Add a new subscriber to the mailing list.

        Args:
            email: Subscriber's email address
            first_name: Optional first name for personalization

        Returns:
            dict with success status and contact_id or error
        """
        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self.ensure_audience()

            # Create contact in audience
            params: resend.Contacts.CreateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,
            }
            if first_name:
                params["first_name"] = first_name

            contact = resend.Contacts.create(params)
            print(f"[EmailService] Subscriber added: {email} -> {contact.get('id')}")

            return {
                "success": True,
                "contact_id": contact.get("id"),
                "email": email,
            }

        except Exception as e:
            error_msg = str(e)
            # Handle duplicate contact
            if "already exists" in error_msg.lower():
                return {
                    "success": False,
                    "error": "Email already subscribed",
                    "code": "DUPLICATE",
                }
            print(f"[EmailService] Error adding subscriber: {e}")
            return {"success": False, "error": error_msg}

    def remove_subscriber(self, email: str) -> dict:
        """
        Remove a subscriber from the mailing list.

        Args:
            email: Subscriber's email address

        Returns:
            dict with success status
        """
        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self.ensure_audience()
            resend.Contacts.remove(audience_id=audience_id, email=email)
            print(f"[EmailService] Subscriber removed: {email}")
            return {"success": True, "email": email}

        except Exception as e:
            print(f"[EmailService] Error removing subscriber: {e}")
            return {"success": False, "error": str(e)}

    def unsubscribe(self, email: str) -> dict:
        """
        Mark a subscriber as unsubscribed (soft delete).

        Args:
            email: Subscriber's email address

        Returns:
            dict with success status
        """
        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self.ensure_audience()
            update_params: resend.Contacts.UpdateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": True,
            }
            resend.Contacts.update(update_params)
            print(f"[EmailService] Subscriber unsubscribed: {email}")
            return {"success": True, "email": email}

        except Exception as e:
            print(f"[EmailService] Error unsubscribing: {e}")
            return {"success": False, "error": str(e)}

    def list_subscribers(self, limit: int = 100) -> dict:
        """
        List all active subscribers.

        Args:
            limit: Maximum number of subscribers to return

        Returns:
            dict with subscribers list and count
        """
        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self.ensure_audience()
            result = resend.Contacts.list(audience_id=audience_id)

            # Filter only subscribed contacts
            subscribers = [
                {
                    "email": c.get("email"),
                    "first_name": c.get("first_name"),
                    "subscribed": not c.get("unsubscribed", False),
                }
                for c in result.get("data", [])
                if not c.get("unsubscribed", False)
            ]

            return {
                "success": True,
                "subscribers": subscribers,
                "count": len(subscribers),
            }

        except Exception as e:
            print(f"[EmailService] Error listing subscribers: {e}")
            return {"success": False, "error": str(e)}

    # =========================================================================
    # Email Formatting
    # =========================================================================

    def _format_timestamp(self, timestamp: str) -> str:
        """Format ISO timestamp to human-readable format."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            # Format: December 14, 2025
            return dt.strftime("%B %d, %Y")
        except Exception:
            return datetime.now().strftime("%B %d, %Y")

    def _format_markdown_to_html(self, text: str) -> str:
        """Convert basic Markdown to HTML for email.

        Spacing system:
        - Paragraphs: 6px vertical margin
        - h4 (###): 14px top, 2px bottom - sub-sections
        - h3 (##): 16px top, 2px bottom - major sections (18px font)
        - h2 (#): 20px top, 4px bottom - top-level headers (20px font)
        """
        import re

        if not text:
            return ""

        # Escape HTML first
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        # Remove empty lines after headers (AI sometimes adds unnecessary blank lines)
        text = re.sub(r"^(#{1,3} .+)\n\n+", r"\1\n", text, flags=re.MULTILINE)

        # Convert headers - larger font sizes for section titles, minimal bottom margin
        text = re.sub(
            r"^### (.+)$",
            r'<h4 style="font-size: 15px; font-weight: 600; color: #059669; margin: 12px 0 0 0;">\1</h4>',
            text,
            flags=re.MULTILINE,
        )
        text = re.sub(
            r"^## (.+)$",
            r'<h3 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 14px 0 0 0;">\1</h3>',
            text,
            flags=re.MULTILINE,
        )
        text = re.sub(
            r"^# (.+)$",
            r'<h2 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 16px 0 0 0;">\1</h2>',
            text,
            flags=re.MULTILINE,
        )

        # Convert bold **text**
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)

        # Convert links [text](url)
        text = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2" style="color: #059669; text-decoration: none;">\1</a>',
            text,
        )

        # Remove newlines immediately after header tags (prevents extra <br> spacing)
        text = re.sub(r"(</h[234]>)\n+", r"\1", text)

        # Convert line breaks with tighter paragraph spacing
        text = text.replace("\n\n", "</p><p style=\"margin: 6px 0; line-height: 1.6;\">")
        text = text.replace("\n", "<br>")

        # Wrap in paragraph
        text = f'<p style="margin: 6px 0; line-height: 1.6;">{text}</p>'

        return text

    def _format_html_report(self, data: dict) -> str:
        """Format the macro analysis data into an HTML email (website-style)."""
        timestamp = data.get("timestamp", datetime.now().isoformat())
        formatted_date = self._format_timestamp(timestamp)

        # Use dynamic title or fallback to default
        report_title = data.get("title") or "每日市场简报"
        report_summary = data.get("summary", "")

        # Build indices section - website style with border cards
        indices = data.get("indices", [])
        indices_count = len(indices)
        indices_html = ""

        if indices:
            indices_html = '<table style="width: 100%; border-collapse: separate; border-spacing: 8px;"><tr>'
            for i, index in enumerate(indices):
                change = index.get("change_percent", 0)
                color = "#059669" if change >= 0 else "#dc2626"
                arrow = "+" if change >= 0 else ""

                # Website style: white background, subtle gray border
                indices_html += f'''
                <td style="vertical-align: top; width: 25%;">
                    <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">{index.get('name', '')}</div>
                        <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">{index.get('value', 0):,.2f}</div>
                        <div style="font-size: 14px; font-weight: 600; color: {color};">{arrow}{change:.2f}%</div>
                    </div>
                </td>
                '''
                # New row every 4 items
                if (i + 1) % 4 == 0 and i < len(indices) - 1:
                    indices_html += "</tr><tr>"

            indices_html += "</tr></table>"

        # Format in-depth analysis with Markdown conversion
        in_depth_html = ""
        if data.get("in_depth_analysis"):
            in_depth_html = self._format_markdown_to_html(data.get("in_depth_analysis", ""))

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
            <div style="max-width: 640px; margin: 0 auto; background: #ffffff;">
                <!-- Header with brand -->
                <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td>
                                <span style="color: #059669; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">MarketPulse</span>
                            </td>
                            <td style="text-align: right;">
                                <span style="display: inline-block; background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 16px;">{formatted_date}</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Title Section -->
                <div style="padding: 32px 24px 24px 24px; text-align: center;">
                    <h1 style="color: #1e293b; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;">{report_title}</h1>
                    {f'<p style="color: #6b7280; font-size: 15px; margin: 0; line-height: 1.6; max-width: 520px; margin-left: auto; margin-right: auto;">{report_summary}</p>' if report_summary else ''}
                </div>

                <!-- Content -->
                <div style="padding: 0 24px 32px 24px;">
                    <!-- Market Overview Section -->
                    <div style="margin-bottom: 32px;">
                        <table style="width: 100%; margin-bottom: 16px;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td>
                                    <span style="font-size: 16px; font-weight: 600; color: #1e293b;">Market Overview</span>
                                </td>
                                <td style="text-align: right;">
                                    <span style="font-size: 13px; color: #9ca3af;">{indices_count} indices</span>
                                </td>
                            </tr>
                        </table>
                        {indices_html}
                    </div>

                    <!-- In-Depth Analysis Section -->
                    {f'''<div>
                        <div style="margin-bottom: 16px;">
                            <span style="font-size: 16px; font-weight: 600; color: #1e293b;">In-Depth Analysis</span>
                            <span style="font-size: 13px; color: #9ca3af; margin-left: 8px;">AI-generated market report</span>
                        </div>
                        <div style="color: #374151; font-size: 15px; line-height: 1.7;">
                            {in_depth_html}
                        </div>
                    </div>''' if data.get("in_depth_analysis") else ""}
                </div>

                <!-- Footer -->
                <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6; margin: 0 0 12px 0;">
                        This report is AI-generated for informational purposes only.<br>
                        Not financial advice. Please do your own research.
                    </p>
                    <p style="text-align: center; margin: 0;">
                        <span style="color: #059669; font-size: 13px; font-weight: 600;">MarketPulse</span>
                        <span style="color: #d1d5db; margin: 0 8px;">|</span>
                        <a href="{{{{RESEND_UNSUBSCRIBE_URL}}}}" style="color: #9ca3af; font-size: 12px; text-decoration: none;">Unsubscribe</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        return html

    # =========================================================================
    # Email Sending
    # =========================================================================

    async def send_daily_report(self, data: dict, to_email: str = None) -> dict:
        """Send the daily market report email to a single recipient.

        Args:
            data: The macro analysis data to send
            to_email: Optional recipient email, defaults to EMAIL_TO env var
        """
        print(f"[EmailService] send_daily_report called, to_email={to_email}")
        print(f"[EmailService] api_key configured: {bool(self.api_key)}")

        if not self.api_key:
            print("[EmailService] ERROR: RESEND_API_KEY not configured")
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        recipient = to_email or os.getenv("EMAIL_TO", "")
        print(f"[EmailService] recipient: {recipient}")
        if not recipient:
            print("[EmailService] ERROR: No recipient email specified")
            return {"success": False, "error": "No recipient email specified"}

        try:
            html_content = self._format_html_report(data)
            today = datetime.now().strftime("%Y-%m-%d")

            params = {
                "from": self.from_email,
                "to": [recipient],
                "subject": f"MarketPulse Daily Report - {today}",
                "html": html_content,
            }

            print(f"[EmailService] Sending email from {self.from_email} to {recipient}")
            email = resend.Emails.send(params)
            print(f"[EmailService] Email sent successfully, id: {email.get('id')}")
            return {"success": True, "email_id": email.get("id"), "sent_to": recipient}

        except Exception as e:
            print(f"[EmailService] ERROR sending email: {e}")
            import traceback

            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def broadcast_daily_report(self, data: dict) -> dict:
        """
        Send the daily market report to all subscribers using Resend Broadcasts.

        Args:
            data: The macro analysis data to send

        Returns:
            dict with success status, broadcast_id, and recipient count
        """
        print("[EmailService] broadcast_daily_report called")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self.ensure_audience()
            html_content = self._format_html_report(data)
            today = datetime.now().strftime("%Y-%m-%d")

            # Create broadcast
            create_params: resend.Broadcasts.CreateParams = {
                "from": self.from_email,
                "audience_id": audience_id,
                "subject": f"MarketPulse Daily Report - {today}",
                "html": html_content,
                "name": f"Daily Report {today}",
            }

            broadcast = resend.Broadcasts.create(create_params)
            broadcast_id = broadcast.get("id")
            print(f"[EmailService] Broadcast created: {broadcast_id}")

            # Send immediately
            send_params: resend.Broadcasts.SendParams = {
                "broadcast_id": broadcast_id,
            }
            resend.Broadcasts.send(send_params)
            print(f"[EmailService] Broadcast sent: {broadcast_id}")

            return {
                "success": True,
                "broadcast_id": broadcast_id,
                "audience_id": audience_id,
            }

        except Exception as e:
            print(f"[EmailService] ERROR broadcasting: {e}")
            import traceback

            traceback.print_exc()
            return {"success": False, "error": str(e)}


# Singleton instance
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Get or create the email service singleton."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
