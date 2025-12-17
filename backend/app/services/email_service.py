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
        """Format the macro analysis data into an HTML email (website-style with structured sections)."""
        timestamp = data.get("timestamp", now_iso())
        formatted_date = self._format_timestamp(timestamp)

        # Use dynamic title or fallback to default
        report_title = data.get("title") or "每日市场简报"
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

        # Build compact indices section (2 per row for email)
        indices = data.get("indices", [])
        # Select key indices for email (keep it compact)
        key_indices = [
            idx for idx in indices
            if idx.get("name") in ["S&P 500", "Nasdaq", "10Y Treasury", "VIX", "Gold", "US Dollar"]
        ][:6]
        indices_html = ""

        if key_indices:
            indices_html = '<table style="width: 100%; border-collapse: separate; border-spacing: 6px;"><tr>'
            for i, index in enumerate(key_indices):
                change = index.get("change_percent", 0)
                color = "#059669" if change >= 0 else "#dc2626"
                arrow = "+" if change >= 0 else ""
                value = index.get("value", 0)
                # Format value based on magnitude
                if value > 1000:
                    value_str = f"{value:,.0f}"
                else:
                    value_str = f"{value:,.2f}"

                indices_html += f'''
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">{index.get('name', '')}</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{value_str}</div>
                        <div style="font-size: 12px; font-weight: 600; color: {color};">{arrow}{change:.2f}%</div>
                    </div>
                </td>
                '''
                # New row every 3 items
                if (i + 1) % 3 == 0 and i < len(key_indices) - 1:
                    indices_html += "</tr><tr>"

            indices_html += "</tr></table>"

        # Build Quick Take section
        quick_take_html = ""
        if quick_take:
            quick_take_html = f'''
            <div style="background: #ecfdf5; border-left: 4px solid #059669; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <div style="font-size: 12px; font-weight: 600; color: #059669; margin-bottom: 8px; text-transform: uppercase;">Quick Take</div>
                <div style="font-size: 15px; color: #1e293b; line-height: 1.6;">{quick_take}</div>
            </div>
            '''

        # Build Market Narrative section
        narrative_html = ""
        if market_narrative:
            narrative_html = f'''
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">市场在交易什么</div>
                <div style="font-size: 14px; color: #4b5563; line-height: 1.7; white-space: pre-line;">{market_narrative}</div>
            </div>
            '''

        # Build Macro Signals section
        macro_html = ""
        signals = macro.get("signals", []) if macro else []
        macro_summary = macro.get("summary", "") if macro else ""
        if signals:
            signals_items = ""
            for signal in signals[:4]:  # Limit to 4 signals for email
                trend = signal.get("trend_direction", "flat")
                trend_color = "#059669" if trend == "up" else "#dc2626" if trend == "down" else "#6b7280"
                signals_items += f'''
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 13px; font-weight: 600; color: #1e293b;">{signal.get('name', '')}</span>
                        <span style="font-size: 12px; color: {trend_color};">{signal.get('current_value', '')} ({signal.get('change', '')})</span>
                    </div>
                    <div style="font-size: 12px; color: #6b7280; line-height: 1.5;">{signal.get('analysis', '')}</div>
                </div>
                '''
            macro_html = f'''
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">关键指标与信号</div>
                {signals_items}
                {f'<div style="font-size: 13px; color: #6b7280; margin-top: 12px; line-height: 1.6;">{macro_summary}</div>' if macro_summary else ''}
            </div>
            '''

        # Build News section
        news_html = ""
        headlines = news.get("headlines", []) if news else []
        briefs = news.get("briefs", []) if news else []
        if headlines or briefs:
            news_items = ""
            # Headlines (major news)
            for headline in headlines[:2]:  # Limit to 2 headlines
                news_items += f'''
                <div style="padding: 14px; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px; margin-bottom: 10px;">
                    <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #1e293b; text-decoration: none; display: block; margin-bottom: 8px;">{headline.get('title', '')}</a>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">{headline.get('fact_summary', '')}</div>
                    <div style="font-size: 12px; color: #4b5563; border-left: 2px solid #059669; padding-left: 10px; line-height: 1.5;">{headline.get('deep_analysis', '')}</div>
                </div>
                '''
            # Briefs (quick news)
            for brief in briefs[:3]:  # Limit to 3 briefs
                news_items += f'''
                <div style="padding: 10px 14px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px;">
                    <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #1e293b; text-decoration: none;">{brief.get('title', '')}</a>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">{brief.get('summary', '')}</div>
                </div>
                '''
            news_html = f'''
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">重要新闻</div>
                {news_items}
            </div>
            '''

        # Build Calendar section
        calendar_html = ""
        if calendar and len(calendar) > 0:
            calendar_items = ""
            for event in calendar[:5]:  # Limit to 5 events
                event_date = event.get("date", "")[:10]  # YYYY-MM-DD
                calendar_items += f'''
                <div style="padding: 10px 14px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px; display: flex;">
                    <div style="flex-shrink: 0; width: 60px; text-align: center; padding-right: 12px; border-right: 1px solid #e5e7eb;">
                        <div style="font-size: 11px; color: #6b7280;">{event_date[5:7]}月</div>
                        <div style="font-size: 18px; font-weight: 700; color: #1e293b;">{event_date[8:10]}</div>
                    </div>
                    <div style="flex: 1; padding-left: 12px;">
                        <div style="font-size: 13px; font-weight: 500; color: #1e293b;">{event.get('event', '')}</div>
                        <div style="font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.4;">{event.get('analysis', '')}</div>
                    </div>
                </div>
                '''
            calendar_html = f'''
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">重要事件</div>
                {calendar_items}
            </div>
            '''

        # Build Conclusion section
        conclusion_html = ""
        if conclusion:
            conclusion_md = self._format_markdown_to_html(conclusion)
            conclusion_html = f'''
            <div style="margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">总结与展望</div>
                <div style="font-size: 13px; color: #4b5563; line-height: 1.7;">{conclusion_md}</div>
            </div>
            '''

        # Legacy in-depth analysis fallback
        in_depth_html = ""
        if not has_structured_data and data.get("in_depth_analysis"):
            in_depth_html = f'''
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">深度分析</div>
                <div style="font-size: 14px; color: #4b5563; line-height: 1.7;">
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
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
                <!-- Header with brand -->
                <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td>
                                <span style="color: #059669; font-size: 18px; font-weight: 700; letter-spacing: -0.5px;">MarketPulse</span>
                            </td>
                            <td style="text-align: right;">
                                <span style="display: inline-block; background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 12px;">{formatted_date}</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Title Section -->
                <div style="padding: 24px 20px 16px 20px;">
                    <h1 style="color: #1e293b; font-size: 20px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3;">{report_title}</h1>
                    {f'<p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.5;">{report_summary}</p>' if report_summary else ''}
                </div>

                <!-- Content -->
                <div style="padding: 0 20px 24px 20px;">
                    <!-- Market Indices -->
                    {f'<div style="margin-bottom: 20px;">{indices_html}</div>' if indices_html else ''}

                    <!-- Quick Take -->
                    {quick_take_html}

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
                <div style="background: #f8fafc; padding: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 11px; text-align: center; line-height: 1.5; margin: 0 0 10px 0;">
                        This report is AI-generated for informational purposes only.<br>
                        Not financial advice. Please do your own research.
                    </p>
                    <p style="text-align: center; margin: 0;">
                        <span style="color: #059669; font-size: 12px; font-weight: 600;">MarketPulse</span>
                        <span style="color: #d1d5db; margin: 0 6px;">|</span>
                        <a href="{{{{RESEND_UNSUBSCRIBE_URL}}}}" style="color: #9ca3af; font-size: 11px; text-decoration: none;">Unsubscribe</a>
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
