"""
Email Service using Resend for sending daily market reports.
"""

import os
from datetime import datetime
from typing import Optional

import resend


class EmailService:
    """Service for sending market analysis reports via email."""

    def __init__(self):
        self.api_key = os.getenv("RESEND_API_KEY")
        if self.api_key:
            resend.api_key = self.api_key
        self.from_email = os.getenv("EMAIL_FROM", "Market Report <reports@resend.dev>")
        self.to_email = os.getenv("EMAIL_TO", "")

    def _format_html_report(self, data: dict) -> str:
        """Format the macro analysis data into an HTML email."""
        timestamp = data.get("timestamp", datetime.now().isoformat())

        # Build indices section
        indices_html = ""
        for index in data.get("indices", []):
            change = index.get("change_percent", 0)
            color = "#22c55e" if change >= 0 else "#ef4444"
            arrow = "^" if change >= 0 else "v"
            indices_html += f"""
            <div style="display: inline-block; margin: 8px; padding: 16px; background: #f8fafc; border-radius: 8px; min-width: 120px;">
                <div style="font-size: 12px; color: #64748b;">{index.get('name', '')}</div>
                <div style="font-size: 20px; font-weight: bold; color: #1e293b;">{index.get('value', 0):,.2f}</div>
                <div style="font-size: 14px; color: {color};">{arrow} {abs(change):.2f}%</div>
            </div>
            """

        # Build trends table
        trends_html = ""
        for trend in data.get("trends", []):
            week_color = "#22c55e" if trend.get("week_change", 0) >= 0 else "#ef4444"
            month_color = "#22c55e" if trend.get("month_change", 0) >= 0 else "#ef4444"
            trends_html += f"""
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px; font-weight: 500;">{trend.get('name', '')}</td>
                <td style="padding: 12px; text-align: right; color: {week_color};">
                    {'+' if trend.get('week_change', 0) >= 0 else ''}{trend.get('week_change', 0):.2f}%
                </td>
                <td style="padding: 12px; text-align: right; color: {month_color};">
                    {'+' if trend.get('month_change', 0) >= 0 else ''}{trend.get('month_change', 0):.2f}%
                </td>
                <td style="padding: 12px; text-align: right;">{trend.get('trend', 'Neutral')}</td>
            </tr>
            """

        # Build liquidity section
        liquidity = data.get("liquidity", {})
        yield_curve = liquidity.get("yield_curve", {})
        spreads = liquidity.get("spreads", {})

        yield_html = ""
        for maturity, rate in yield_curve.get("rates", {}).items():
            yield_html += f"""
            <div style="display: inline-block; margin: 4px; padding: 12px; background: #f1f5f9; border-radius: 6px;">
                <div style="font-size: 11px; color: #64748b;">{maturity}</div>
                <div style="font-size: 16px; font-weight: bold;">{rate:.3f}%</div>
            </div>
            """

        inversion_badge = ""
        if spreads.get("inversion_warning"):
            inversion_badge = '<span style="background: #fef2f2; color: #dc2626; padding: 4px 12px; border-radius: 16px; font-size: 12px;">Yield Curve Inverted</span>'
        else:
            inversion_badge = '<span style="background: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 16px; font-size: 12px;">Normal Yield Curve</span>'

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 8px;">Daily Market Report</h1>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">{timestamp}</p>

                <!-- Quick Summary -->
                {f'''<div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                    <h2 style="font-size: 14px; color: #3b82f6; margin: 0 0 8px 0;">Quick Summary</h2>
                    <p style="color: #1e293b; margin: 0; line-height: 1.6;">{data.get("short_analysis", "")}</p>
                </div>''' if data.get("short_analysis") else ""}

                <!-- Market Indices -->
                <h2 style="font-size: 18px; color: #1e293b; margin-bottom: 16px;">Market Indices</h2>
                <div style="margin-bottom: 24px;">
                    {indices_html}
                </div>

                <!-- Trend Analysis -->
                <h2 style="font-size: 18px; color: #1e293b; margin-bottom: 16px;">Trend Analysis</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="padding: 12px; text-align: left; font-size: 12px; color: #64748b;">Index</th>
                            <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b;">1 Week</th>
                            <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b;">1 Month</th>
                            <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b;">Trend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trends_html}
                    </tbody>
                </table>

                <!-- Yield Curve -->
                <h2 style="font-size: 18px; color: #1e293b; margin-bottom: 16px;">Yield Curve</h2>
                <div style="margin-bottom: 16px;">
                    {yield_html}
                </div>
                <div style="margin-bottom: 24px;">
                    {inversion_badge}
                    <span style="margin-left: 16px; color: #64748b; font-size: 13px;">
                        10Y-3M: {spreads.get('10y_3m', 'N/A')}% | 10Y-5Y: {spreads.get('10y_5y', 'N/A')}%
                    </span>
                </div>

                <!-- In-Depth Analysis -->
                {f'''<div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                    <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 12px 0;">In-Depth Analysis</h2>
                    <div style="color: #475569; line-height: 1.7; white-space: pre-wrap;">{data.get("in_depth_analysis", "")}</div>
                </div>''' if data.get("in_depth_analysis") else ""}

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                    Generated by Stock Agent | Powered by AI
                </p>
            </div>
        </body>
        </html>
        """
        return html

    async def send_daily_report(self, data: dict, to_email: str = None) -> dict:
        """Send the daily market report email.

        Args:
            data: The macro analysis data to send
            to_email: Optional recipient email, defaults to EMAIL_TO env var
        """
        print(f"[EmailService] send_daily_report called, to_email={to_email}")
        print(f"[EmailService] api_key configured: {bool(self.api_key)}")

        if not self.api_key:
            print("[EmailService] ERROR: RESEND_API_KEY not configured")
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        recipient = to_email or self.to_email
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
                "subject": f"Daily Market Report - {today}",
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


# Singleton instance
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Get or create the email service singleton."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
