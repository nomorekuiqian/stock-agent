"""
Email Service using Resend for sending daily market reports.
Supports subscriber management via Resend Contacts and Broadcasts API.
"""

import os
from datetime import datetime
from typing import Optional, List

import resend

from app.utils.timezone import now_pacific, now_iso, today_str, to_pacific


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
        """Format ISO timestamp to human-readable format (Pacific timezone)."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            pacific_dt = to_pacific(dt)
            # Format: December 14, 2025
            return pacific_dt.strftime("%B %d, %Y")
        except Exception:
            return now_pacific().strftime("%B %d, %Y")

    def _format_markdown_to_html(self, text: str) -> str:
        """Convert basic Markdown to HTML for email.

        Design: Black + Silver premium style
        - Clean, minimal spacing
        - Sophisticated typography hierarchy
        """
        import re

        if not text:
            return ""

        # Escape HTML first
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        # Remove empty lines after headers
        text = re.sub(r"^(#{1,3} .+)\n\n+", r"\1\n", text, flags=re.MULTILINE)

        # Convert headers - black/silver theme
        text = re.sub(
            r"^#### (.+)$",
            r'<h4 style="font-size: 14px; font-weight: 600; color: #18181b; margin: 16px 0 6px 0; letter-spacing: 0.02em;">\1</h4>',
            text,
            flags=re.MULTILINE,
        )
        text = re.sub(
            r"^### (.+)$",
            r'<h4 style="font-size: 14px; font-weight: 600; color: #18181b; margin: 16px 0 6px 0; letter-spacing: 0.02em;">\1</h4>',
            text,
            flags=re.MULTILINE,
        )
        text = re.sub(
            r"^## (.+)$",
            r'<h3 style="font-size: 16px; font-weight: 600; color: #0a0a0a; margin: 20px 0 8px 0;">\1</h3>',
            text,
            flags=re.MULTILINE,
        )
        text = re.sub(
            r"^# (.+)$",
            r'<h2 style="font-size: 18px; font-weight: 600; color: #0a0a0a; margin: 24px 0 10px 0;">\1</h2>',
            text,
            flags=re.MULTILINE,
        )

        # Convert bold **text**
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)

        # Convert links [text](url) - subtle underline style
        text = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2" style="color: #18181b; text-decoration: underline; text-decoration-color: #a1a1aa;">\1</a>',
            text,
        )

        # Remove newlines immediately after header tags
        text = re.sub(r"(</h[234]>)\n+", r"\1", text)

        # Convert line breaks
        text = text.replace("\n\n", "</p><p style=\"margin: 8px 0; line-height: 1.7; color: #3f3f46;\">")
        text = text.replace("\n", "<br>")

        # Wrap in paragraph
        text = f'<p style="margin: 8px 0; line-height: 1.7; color: #3f3f46;">{text}</p>'

        return text

    def _format_html_report(self, data: dict) -> str:
        """Format the macro analysis data into an HTML email.

        Design v2: Card-based layout with clear section separation
        - Each section wrapped in a card with background + border
        - Section headers with left accent bar
        - Increased spacing between sections
        - Visual rhythm through alternating styles
        """
        timestamp = data.get("timestamp", now_iso())
        formatted_date = self._format_timestamp(timestamp)

        # Use dynamic title or fallback to default
        report_title = data.get("title") or "Daily Market Brief"
        report_summary = data.get("summary", "")
        quick_take = data.get("quick_take", "")
        market_narrative = data.get("market_narrative", "")
        macro = data.get("macro", {})
        news = data.get("news", {})
        conclusion = data.get("conclusion", "")
        calendar = data.get("calendar", [])

        # Check if we have new structured data
        has_structured_data = bool(
            quick_take or market_narrative or macro or news or conclusion
        )

        # Common styles
        card_style = "background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;"
        section_header_style = "font-size: 12px; font-weight: 600; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #0a0a0a;"

        # Build compact indices section
        indices = data.get("indices", [])
        key_indices = [
            idx for idx in indices
            if idx.get("name") in ["S&P 500", "Nasdaq", "10Y Treasury", "VIX", "Gold", "US Dollar"]
        ][:6]
        indices_html = ""

        if key_indices:
            indices_html = '<table style="width: 100%; border-collapse: separate; border-spacing: 6px;"><tr>'
            for i, index in enumerate(key_indices):
                change = index.get("change_percent", 0)
                color = "#16a34a" if change >= 0 else "#dc2626"
                arrow = "+" if change >= 0 else ""
                value = index.get("value", 0)
                if value > 1000:
                    value_str = f"{value:,.0f}"
                else:
                    value_str = f"{value:,.2f}"

                indices_html += f'''
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                        <div style="font-size: 10px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">{index.get('name', '')}</div>
                        <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{value_str}</div>
                        <div style="font-size: 11px; font-weight: 600; color: {color}; margin-top: 2px;">{arrow}{change:.2f}%</div>
                    </div>
                </td>
                '''
                if (i + 1) % 3 == 0 and i < len(key_indices) - 1:
                    indices_html += "</tr><tr>"

            indices_html += "</tr></table>"

        # Quick Take section removed per user feedback

        # Build Market Narrative section - White card
        narrative_html = ""
        if market_narrative:
            narrative_html = f'''
            <div style="{card_style}">
                <div style="{section_header_style}">Market Narrative</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85; white-space: pre-line;">{market_narrative}</div>
            </div>
            '''

        # Build Macro Signals section - White card with items
        macro_html = ""
        signals = macro.get("signals", []) if macro else []
        macro_summary = macro.get("summary", "") if macro else ""
        if signals:
            signals_items = ""
            for signal in signals[:4]:
                trend = signal.get("trend_direction", "flat")
                trend_color = "#16a34a" if trend == "up" else "#dc2626" if trend == "down" else "#71717a"
                signals_items += f'''
                <div style="padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 13px; font-weight: 600; color: #0a0a0a;">{signal.get('name', '')}</span>
                        <span style="font-size: 12px; font-weight: 600; color: {trend_color}; margin-left: 10px;">{signal.get('current_value', '')} ({signal.get('change', '')})</span>
                    </div>
                    <div style="font-size: 13px; color: #52525b; line-height: 1.6;">{signal.get('analysis', '')}</div>
                </div>
                '''
            macro_html = f'''
            <div style="{card_style}">
                <div style="{section_header_style}">Key Signals</div>
                {signals_items}
                {f'<div style="font-size: 13px; color: #52525b; margin-top: 14px; line-height: 1.7;">{macro_summary}</div>' if macro_summary else ''}
            </div>
            '''

        # Build News section - Light gray card with Headlines and Briefs subsections
        news_html = ""
        headlines = news.get("headlines", []) if news else []
        briefs = news.get("briefs", []) if news else []
        if headlines or briefs:
            # Subsection header style
            subsection_style = "font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 4px;"

            # Headlines section
            headlines_html = ""
            if headlines:
                headlines_items = ""
                for headline in headlines[:2]:
                    headlines_items += f'''
                    <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                        <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 6px;">{headline.get('title', '')}</a>
                        <div style="font-size: 12px; color: #71717a; margin-bottom: 8px;">{headline.get('fact_summary', '')}</div>
                        <div style="font-size: 12px; color: #52525b; background: #f8f8f8; padding: 10px 12px; border-radius: 4px; line-height: 1.6;">{headline.get('deep_analysis', '')}</div>
                    </div>
                    '''
                headlines_html = f'''
                <div style="{subsection_style}">Headlines</div>
                {headlines_items}
                '''

            # Briefs section
            briefs_html = ""
            if briefs:
                briefs_items = ""
                for brief in briefs[:3]:
                    briefs_items += f'''
                    <div style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #18181b; text-decoration: none;">{brief.get('title', '')}</a>
                        <div style="font-size: 12px; color: #71717a; margin-top: 3px;">{brief.get('summary', '')}</div>
                    </div>
                    '''
                briefs_html = f'''
                <div style="{subsection_style} margin-top: 20px;">Briefs</div>
                {briefs_items}
                '''

            news_html = f'''
            <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                <div style="{section_header_style}">News</div>
                {headlines_html}
                {briefs_html}
            </div>
            '''

        # Build Calendar section - White card with date blocks
        calendar_html = ""
        if calendar and len(calendar) > 0:
            calendar_items = ""
            for event in calendar[:5]:
                event_date = event.get("date", "")[:10]
                calendar_items += f'''
                <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="width: 52px; vertical-align: top;">
                            <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 8px 4px; text-align: center;">
                                <div style="font-size: 9px; color: #71717a; text-transform: uppercase;">{event_date[5:7]}月</div>
                                <div style="font-size: 18px; font-weight: 600; color: #0a0a0a;">{event_date[8:10]}</div>
                            </div>
                        </td>
                        <td style="padding-left: 14px; vertical-align: top;">
                            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a; margin-bottom: 4px;">{event.get('event', '')}</div>
                            <div style="font-size: 12px; color: #71717a; line-height: 1.5;">{event.get('analysis', '')}</div>
                        </td>
                    </tr>
                </table>
                '''
            calendar_html = f'''
            <div style="{card_style}">
                <div style="{section_header_style}">Upcoming Events</div>
                {calendar_items}
            </div>
            '''

        # Build Conclusion/Outlook section - White card (consistent style)
        conclusion_html = ""
        if conclusion:
            conclusion_md = self._format_markdown_to_html(conclusion)
            conclusion_html = f'''
            <div style="{card_style}">
                <div style="{section_header_style}">Outlook</div>
                <div style="font-size: 13px; color: #3f3f46; line-height: 1.85;">{conclusion_md}</div>
            </div>
            '''

        # Legacy in-depth analysis fallback
        in_depth_html = ""
        if not has_structured_data and data.get("in_depth_analysis"):
            in_depth_html = f'''
            <div style="{card_style}">
                <div style="{section_header_style}">Analysis</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {self._format_markdown_to_html(data.get("in_depth_analysis", ""))}
                </div>
            </div>
            '''

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                <!-- Header - Gradient with pulse icon -->
                <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 20px 24px;">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="vertical-align: middle;">
                                <table cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="vertical-align: middle; padding-right: 10px;">
                                            <svg width="28" height="18" viewBox="0 0 28 18" style="display: block;">
                                                <path d="M0 9h5l2-7 3 14 2-7h5l2 5 2-5h7" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                                            </svg>
                                        </td>
                                        <td style="vertical-align: middle;">
                                            <span style="color: #ffffff; font-size: 17px; font-weight: 700; letter-spacing: 0.1em;">MARKETPULSE</span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                            <td style="text-align: right; vertical-align: middle;">
                                <div style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Daily Brief</div>
                                <div style="color: #a1a1aa; font-size: 13px; font-weight: 500; margin-top: 2px;">{formatted_date}</div>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Title Card -->
                <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
                    <h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{report_title}</h1>
                    {f'<p style="color: #71717a; font-size: 14px; margin: 0; line-height: 1.6;">{report_summary}</p>' if report_summary else ''}
                </div>

                <!-- Content Area - Gray background -->
                <div style="background: #f0f0f0; padding: 16px;">
                    <!-- Market Indices Card -->
                    {f'<div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 16px;"><div style="{section_header_style}">Market Overview</div>{indices_html}</div>' if indices_html else ''}

                    <!-- Market Narrative -->
                    {narrative_html}

                    <!-- Macro Signals -->
                    {macro_html}

                    <!-- News -->
                    {news_html}

                    <!-- Calendar -->
                    {calendar_html}

                    <!-- Conclusion -->
                    {conclusion_html}

                    <!-- Legacy In-Depth Analysis -->
                    {in_depth_html}
                </div>

                <!-- Footer -->
                <div style="background: #0a0a0a; padding: 24px; text-align: center;">
                    <p style="color: #71717a; font-size: 11px; line-height: 1.6; margin: 0 0 14px 0;">
                        AI-generated report for informational purposes only.<br>
                        Not financial advice. Do your own research.
                    </p>
                    <p style="margin: 0;">
                        <span style="color: #ffffff; font-size: 11px; font-weight: 500; letter-spacing: 0.08em;">MARKETPULSE</span>
                        <span style="color: #52525b; margin: 0 10px;">|</span>
                        <a href="{{{{RESEND_UNSUBSCRIBE_URL}}}}" style="color: #71717a; font-size: 11px; text-decoration: none;">Unsubscribe</a>
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
            today = today_str()  # Pacific timezone

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
            today = today_str()  # Pacific timezone

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
