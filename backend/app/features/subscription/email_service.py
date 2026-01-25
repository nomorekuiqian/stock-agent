"""
Email Service using Resend for sending daily market reports and personal digests.
Subscription management is handled by SubscriptionService.
"""

import json
import asyncio
from datetime import datetime
from typing import Optional

import resend

from app.core.config import RESEND_API_KEY, FRONTEND_URL
from app.utils.timezone import now_pacific, now_iso, today_str, to_pacific
from app.features.subscription.service import (
    get_subscription_service,
    SubscriptionChannel,
)
from app.features.digest.db import save_user_digest, get_user_watchlist


class EmailService:
    """Service for sending market analysis reports and personal digests via email."""

    def __init__(self):
        self.api_key = RESEND_API_KEY
        if self.api_key:
            resend.api_key = self.api_key
        self.from_email = "MarketBrew Daily <daily@themarketbrew.com>"
        # Frontend URL for logo and other assets
        self.frontend_url = (FRONTEND_URL or "https://themarketbrew.com").rstrip("/")
        self.logo_url = f"{self.frontend_url}/logo-avatar.png"

    # =========================================================================
    # Email Formatting - Common Utilities
    # =========================================================================

    def _format_timestamp(self, timestamp: str) -> str:
        """Format ISO timestamp to human-readable format (Pacific timezone)."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            pacific_dt = to_pacific(dt)
            return pacific_dt.strftime("%B %d, %Y")
        except Exception:
            return now_pacific().strftime("%B %d, %Y")

    def _get_time_greeting(self) -> str:
        """Get time-based greeting in Chinese (Pacific timezone)."""
        hour = now_pacific().hour
        if 5 <= hour < 12:
            return "早上好"
        elif 12 <= hour < 18:
            return "下午好"
        else:
            return "晚上好"

    def _format_markdown_to_html(self, text: str) -> str:
        """Convert basic Markdown to HTML for email."""
        import re

        if not text:
            return ""

        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        text = re.sub(r"^(#{1,3} .+)\n\n+", r"\1\n", text, flags=re.MULTILINE)

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
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2" style="color: #18181b; text-decoration: underline; text-decoration-color: #a1a1aa;">\1</a>',
            text,
        )
        text = re.sub(r"(</h[234]>)\n+", r"\1", text)
        text = text.replace(
            "\n\n", '</p><p style="margin: 12px 0; line-height: 1.7; color: #3f3f46;">'
        )
        text = text.replace("\n", "<br>")
        text = (
            f'<p style="margin: 12px 0; line-height: 1.7; color: #3f3f46;">{text}</p>'
        )

        return text

    # =========================================================================
    # Email Templates
    # =========================================================================

    def _get_email_header(self, formatted_date: str, title: str = "Daily Brief") -> str:
        """Common email header with THEMARKETBREW branding and logo."""
        return f"""
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 20px 24px;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="vertical-align: middle;">
                        <a href="{self.frontend_url}" style="text-decoration: none;">
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align: middle; padding-right: 12px;">
                                        <img src="{self.logo_url}" alt="TheMarketBrew" width="36" height="36" style="display: block; border-radius: 6px;" />
                                    </td>
                                    <td style="vertical-align: middle;">
                                        <span style="color: #ffffff; font-size: 17px; font-weight: 700; letter-spacing: 0.1em;">THEMARKETBREW</span>
                                    </td>
                                </tr>
                            </table>
                        </a>
                    </td>
                    <td style="text-align: right; vertical-align: middle;">
                        <div style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">{title}</div>
                        <div style="color: #a1a1aa; font-size: 13px; font-weight: 500; margin-top: 2px;">{formatted_date}</div>
                    </td>
                </tr>
            </table>
        </div>
        """

    def _get_feedback_section(
        self,
        report_date: str,
        report_id: Optional[str] = None,
        report_type: str = "daily",
    ) -> str:
        """Generate email feedback survey section.

        Args:
            report_date: Report date in YYYY-MM-DD format
            report_id: Optional report UUID
            report_type: Type of report ("daily" or "digest")

        Returns:
            HTML string for feedback section
        """
        # Always use production frontend URL for feedback links
        # This allows local dev emails to test production feedback flow
        feedback_frontend_url = "https://themarketbrew.com"

        # Build feedback base URL with report_date, report_type and optional report_id
        # Email will be dynamically filled by Resend template variable
        base_params = f"report_date={report_date}&report_type={report_type}"
        if report_id:
            base_params += f"&report_id={report_id}"

        # Link directly to frontend - frontend will async save feedback
        # Use Resend's template variable for email (for broadcasts)
        # Will be replaced with actual email for single sends
        feedback_base = (
            f"{feedback_frontend_url}/feedback?{base_params}&email={{{{{{email}}}}}}"
        )

        # Different prompt text based on report type
        prompt_text = (
            "今天的专属日报对你有帮助吗?"
            if report_type == "digest"
            else "今天的日报对你有帮助吗?"
        )

        return f"""
        <div style="background: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="text-align: center; padding-bottom: 16px;">
                        <p style="margin: 0; font-size: 14px; color: #6b7280;">
                            {prompt_text}
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center;">
                        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                            <tr>
                                <td style="padding: 0 8px;">
                                    <a href="{feedback_base}&rating=satisfied"
                                       style="display: inline-block; padding: 10px 24px;
                                              background-color: #f3f4f6; color: #374151;
                                              text-decoration: none; border-radius: 6px;
                                              font-size: 14px; border: 1px solid #d1d5db;">
                                        &#128077; 有帮助
                                    </a>
                                </td>
                                <td style="padding: 0 8px;">
                                    <a href="{feedback_base}&rating=dissatisfied"
                                       style="display: inline-block; padding: 10px 24px;
                                              background-color: #f3f4f6; color: #374151;
                                              text-decoration: none; border-radius: 6px;
                                              font-size: 14px; border: 1px solid #d1d5db;">
                                        &#128078; 没帮助
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
        """

    def _get_email_footer(
        self, unsubscribe_url: str = "{{{RESEND_UNSUBSCRIBE_URL}}}"
    ) -> str:
        """Common email footer with logo."""
        return f"""
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 24px;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="text-align: center; padding-bottom: 16px;">
                        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                            <tr>
                                <td style="vertical-align: middle; padding-right: 8px;">
                                    <img src="{self.logo_url}" alt="TheMarketBrew" width="24" height="24" style="display: block; border-radius: 4px;" />
                                </td>
                                <td style="vertical-align: middle;">
                                    <span style="color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 0.08em;">THEMARKETBREW</span>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center; padding-bottom: 14px;">
                        <p style="color: #71717a; font-size: 11px; line-height: 1.6; margin: 0;">
                            AI-generated report for informational purposes only.<br>
                            Not financial advice. Do your own research.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center;">
                        <a href="{unsubscribe_url}" style="color: #10b981; font-size: 11px; text-decoration: none; font-weight: 500;">Unsubscribe</a>
                    </td>
                </tr>
            </table>
        </div>
        """

    def _format_html_report(
        self, data: dict, report_date: Optional[str] = None, report_id: Optional[str] = None
    ) -> str:
        """Format the macro analysis data into an HTML email (Daily Report).

        Args:
            data: Report data dictionary
            report_date: Report date for feedback URL (defaults to today)
            report_id: Report UUID for feedback URL (optional)
        """
        timestamp = data.get("timestamp", now_iso())
        formatted_date = self._format_timestamp(timestamp)
        time_greeting = self._get_time_greeting()

        # Get report_date for feedback section
        feedback_report_date = report_date or data.get("report_date") or today_str()
        feedback_report_id = report_id or data.get("report_id")

        # Build report URL for title link
        report_url = ""
        if feedback_report_id:
            report_url = f"{self.frontend_url}/today/{feedback_report_id}"

        report_title = data.get("title") or "Daily Market Brief"
        report_summary = data.get("summary", "")
        intro = data.get("intro", "")
        macro = data.get("macro", {})
        news = data.get("news", {})
        outlook = data.get("report_summary", "")
        calendar = data.get("calendar", [])

        card_style = "background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;"
        section_header_style = "font-size: 12px; font-weight: 600; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #0a0a0a;"

        # Build indices section
        indices = data.get("indices", [])
        key_indices = [
            idx
            for idx in indices
            if idx.get("name")
            in ["S&P 500", "Nasdaq", "10Y Treasury", "VIX", "Gold", "US Dollar"]
        ][:6]
        indices_html = ""

        if key_indices:
            indices_html = '<table style="width: 100%; border-collapse: separate; border-spacing: 6px;"><tr>'
            for i, index in enumerate(key_indices):
                change = index.get("change_percent", 0)
                color = "#16a34a" if change >= 0 else "#dc2626"
                arrow = "+" if change >= 0 else ""
                value = index.get("value", 0)
                value_str = f"{value:,.0f}" if value > 1000 else f"{value:,.2f}"

                indices_html += f"""
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                        <div style="font-size: 10px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">{index.get('name', '')}</div>
                        <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{value_str}</div>
                        <div style="font-size: 11px; font-weight: 600; color: {color}; margin-top: 2px;">{arrow}{change:.2f}%</div>
                    </div>
                </td>
                """
                if (i + 1) % 3 == 0 and i < len(key_indices) - 1:
                    indices_html += "</tr><tr>"
            indices_html += "</tr></table>"

        # Intro section
        intro_html = ""
        if intro:
            intro_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">今日要点</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85; white-space: pre-line;">{intro}</div>
            </div>
            """

        # Macro Signals section
        macro_html = ""
        signals = macro.get("signals", []) if macro else []
        macro_summary = macro.get("summary", "") if macro else ""
        if signals:
            signals_items = ""
            for signal in signals[:4]:
                trend = signal.get("trend_direction", "flat")
                trend_color = (
                    "#16a34a"
                    if trend == "up"
                    else "#dc2626" if trend == "down" else "#71717a"
                )
                signals_items += f"""
                <div style="padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 13px; font-weight: 600; color: #0a0a0a;">{signal.get('name', '')}</span>
                        <span style="font-size: 12px; font-weight: 600; color: {trend_color}; margin-left: 10px;">{signal.get('current_value', '')} ({signal.get('change', '')})</span>
                    </div>
                    <div style="font-size: 13px; color: #52525b; line-height: 1.6;">{signal.get('analysis', '')}</div>
                </div>
                """
            macro_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">关键信号</div>
                {signals_items}
                {f'<div style="font-size: 13px; color: #52525b; margin-top: 14px; line-height: 1.7;">{macro_summary}</div>' if macro_summary else ''}
            </div>
            """

        # News section
        news_html = ""
        headlines = news.get("headlines", []) if news else []
        briefs = news.get("briefs", []) if news else []
        if headlines or briefs:
            subsection_style = "font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 4px;"

            headlines_html = ""
            if headlines:
                headlines_items = ""
                for headline in headlines:
                    headlines_items += f"""
                    <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                        <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 6px;">{headline.get('title', '')}</a>
                        <div style="font-size: 12px; color: #71717a; margin-bottom: 8px;">{headline.get('fact_summary', '')}</div>
                        <div style="font-size: 12px; color: #52525b; background: #f8f8f8; padding: 10px 12px; border-radius: 4px; line-height: 1.6;">{headline.get('deep_analysis', '')}</div>
                    </div>
                    """
                headlines_html = f"""
                <div style="{subsection_style}">头条</div>
                {headlines_items}
                """

            briefs_html = ""
            if briefs:
                briefs_items = ""
                for brief in briefs:  # Show all briefs (8-12)
                    briefs_items += f"""
                    <div style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #18181b; text-decoration: none;">{brief.get('title', '')}</a>
                        <div style="font-size: 12px; color: #71717a; margin-top: 3px;">{brief.get('summary', '')}</div>
                    </div>
                    """
                briefs_html = f"""
                <div style="{subsection_style} margin-top: 20px;">快讯</div>
                {briefs_items}
                """

            news_html = f"""
            <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                <div style="{section_header_style}">新闻</div>
                {headlines_html}
                {briefs_html}
            </div>
            """

        # Calendar section
        calendar_html = ""
        if calendar:
            calendar_items = ""
            for event in calendar:
                event_date = event.get("date", "")[:10]
                # Format month as Chinese (e.g., "12月")
                month_num = event_date[5:7].lstrip("0") if len(event_date) >= 7 else ""
                calendar_items += f"""
                <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="width: 52px; vertical-align: top;">
                            <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 8px 4px; text-align: center;">
                                <div style="font-size: 10px; color: #71717a;">{month_num}月</div>
                                <div style="font-size: 18px; font-weight: 600; color: #0a0a0a;">{event_date[8:10]}</div>
                            </div>
                        </td>
                        <td style="padding-left: 14px; vertical-align: top;">
                            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a; margin-bottom: 4px;">{event.get('event', '')}</div>
                            <div style="font-size: 12px; color: #71717a; line-height: 1.5;">{event.get('analysis', '')}</div>
                        </td>
                    </tr>
                </table>
                """
            calendar_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">近期事件</div>
                {calendar_items}
            </div>
            """

        # Outlook section
        outlook_html = ""
        if outlook:
            # Convert single newlines to double for proper paragraph spacing
            outlook_text = outlook.replace("\n", "\n\n")
            outlook_md = self._format_markdown_to_html(outlook_text)
            outlook_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">总结展望</div>
                <div style="font-size: 13px; color: #3f3f46; line-height: 1.85;">{outlook_md}</div>
            </div>
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {self._get_email_header(formatted_date, "Daily Brief")}

                <!-- Title Card -->
                <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
                    <p style="color: #52525b; font-size: 16px; margin: 0 0 12px 0; line-height: 1.5;">
                        {time_greeting}，{{{{{{first_name|朋友}}}}}}
                    </p>
                    <p style="color: #71717a; font-size: 13px; margin: 0 0 20px 0; line-height: 1.6;">
                        新的一天，为你准备了今日的市场简报，一起看看发生了什么吧。
                    </p>
                    {f'<a href="{report_url}" style="text-decoration: none;"><h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{report_title}</h1></a>' if report_url else f'<h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{report_title}</h1>'}
                    {f'<p style="color: #71717a; font-size: 14px; margin: 0; line-height: 1.6;">{report_summary}</p>' if report_summary else ''}
                </div>

                <!-- Content Area -->
                <div style="background: #f0f0f0; padding: 16px;">
                    {f'<div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 16px;"><div style="{section_header_style}">市场概览</div>{indices_html}</div>' if indices_html else ''}
                    {intro_html}
                    {macro_html}
                    {news_html}
                    {calendar_html}
                    {outlook_html}
                </div>

                {self._get_feedback_section(feedback_report_date, feedback_report_id)}
                {self._get_email_footer()}
            </div>
        </body>
        </html>
        """
        return html

    def _format_digest_html(
        self,
        data: dict,
        first_name: str = "",
        digest_date: Optional[str] = None,
        digest_id: Optional[str] = None,
    ) -> str:
        """Format personal digest data into an HTML email.

        Args:
            data: Digest data dictionary
            first_name: User's first name for greeting
            digest_date: Digest date for feedback URL (defaults to today)
            digest_id: Digest UUID for feedback URL (optional)
        """
        timestamp = data.get("timestamp", now_iso())
        formatted_date = self._format_timestamp(timestamp)

        greeting = data.get("greeting", "")
        one_line_summary = data.get("one_line_summary", "")
        stocks = data.get("stocks", [])
        news = data.get("news", {})
        events = data.get("events", [])
        summary = data.get("summary", {})

        # Get digest_date for feedback section
        feedback_digest_date = digest_date or data.get("digest_date") or today_str()
        feedback_digest_id = digest_id or data.get("digest_id")

        display_name = first_name or "pengyou"

        card_style = "background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;"
        section_header_style = "font-size: 12px; font-weight: 600; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #10b981;"

        # Stocks section
        stocks_html = ""
        if stocks:
            stocks_rows = ""
            for stock in stocks:
                change_str = stock.get("daily_change", "0%")
                is_positive = not change_str.startswith("-")
                change_color = "#16a34a" if is_positive else "#dc2626"

                stocks_rows += f"""
                <div style="padding: 16px 0; border-bottom: 1px solid #f0f0f0;">
                    <!-- Stock header row -->
                    <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="vertical-align: middle;">
                                <span style="font-size: 16px; font-weight: 700; color: #0a0a0a;">{stock.get('symbol', '')}</span>
                                <span style="font-size: 13px; color: #71717a; margin-left: 8px;">{stock.get('name', '')}</span>
                            </td>
                            <td style="text-align: right; vertical-align: middle;">
                                <span style="font-size: 16px; font-weight: 600; color: #0a0a0a;">${stock.get('price', 0):.2f}</span>
                                <span style="font-size: 14px; font-weight: 600; color: {change_color}; margin-left: 10px;">{change_str}</span>
                            </td>
                        </tr>
                    </table>
                    <!-- Status -->
                    <div style="font-size: 13px; color: #10b981; font-weight: 500; margin-bottom: 8px;">{stock.get('status', '')}</div>
                    <!-- Analysis -->
                    <div style="font-size: 13px; color: #52525b; line-height: 1.7;">{stock.get('quick_take', '')}</div>
                </div>
                """

            stocks_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">你的关注</div>
                {stocks_rows}
            </div>
            """

        # News section
        news_html = ""
        headlines = news.get("headlines", []) if isinstance(news, dict) else []
        briefs = news.get("briefs", []) if isinstance(news, dict) else []

        if headlines or briefs:
            subsection_style = "font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 4px;"

            headlines_html = ""
            if headlines:
                headlines_items = ""
                for headline in headlines:
                    related = ", ".join(headline.get("related_symbols", [])[:3])
                    headlines_items += f"""
                    <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                        <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 4px;">{headline.get('title', '')}</a>
                        <div style="font-size: 11px; color: #10b981; margin-bottom: 6px;">{related}</div>
                        <div style="font-size: 12px; color: #71717a; margin-bottom: 8px;">{headline.get('fact_summary', '')}</div>
                        <div style="font-size: 13px; color: #52525b; line-height: 1.7;">{headline.get('deep_analysis', '')}</div>
                    </div>
                    """
                headlines_html = (
                    f'<div style="{subsection_style}">头条</div>{headlines_items}'
                )

            briefs_html = ""
            if briefs:
                briefs_items = ""
                for brief in briefs:
                    related = ", ".join(brief.get("related_symbols", [])[:3])
                    briefs_items += f"""
                    <div style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #18181b; text-decoration: none;">{brief.get('title', '')}</a>
                        <div style="font-size: 11px; color: #10b981; margin-top: 2px;">{related}</div>
                        <div style="font-size: 12px; color: #71717a; margin-top: 4px;">{brief.get('analysis', brief.get('summary', ''))}</div>
                    </div>
                    """
                briefs_html = f'<div style="{subsection_style} margin-top: 20px;">更多新闻</div>{briefs_items}'

            news_html = f"""
            <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                <div style="{section_header_style}">相关新闻</div>
                {headlines_html}
                {briefs_html}
            </div>
            """

        # Events section
        events_html = ""
        if events:
            events_items = ""
            for event in events[:5]:
                event_date = event.get("date", "")[:10]
                related = ", ".join(event.get("related_symbols", [])[:3])
                # Format month as Chinese (e.g., "12月")
                month_num = event_date[5:7].lstrip("0") if len(event_date) >= 7 else ""
                events_items += f"""
                <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="width: 52px; vertical-align: top;">
                            <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 8px 4px; text-align: center;">
                                <div style="font-size: 10px; color: #71717a;">{month_num}月</div>
                                <div style="font-size: 18px; font-weight: 600; color: #0a0a0a;">{event_date[8:10]}</div>
                            </div>
                        </td>
                        <td style="padding-left: 14px; vertical-align: top;">
                            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a; margin-bottom: 2px;">{event.get('event', '')}</div>
                            <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">{related}</div>
                            <div style="font-size: 12px; color: #71717a; line-height: 1.5;">{event.get('why_important', '')}</div>
                        </td>
                    </tr>
                </table>
                """
            events_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">未来事件</div>
                {events_items}
            </div>
            """

        # Summary section
        summary_html = ""
        summary_content = (
            summary.get("content", "") if isinstance(summary, dict) else str(summary)
        )
        if summary_content:
            summary_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">总结</div>
                <div style="font-size: 13px; color: #3f3f46; line-height: 1.85; white-space: pre-line;">{summary_content}</div>
            </div>
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {self._get_email_header(formatted_date, "个性化日报")}

                <!-- Title Card -->
                <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
                    <p style="color: #52525b; font-size: 16px; margin: 0 0 8px 0; line-height: 1.5;">
                        Hi {display_name}
                    </p>
                    <p style="color: #71717a; font-size: 13px; margin: 0 0 20px 0; line-height: 1.6;">
                        {greeting}
                    </p>
                    <h1 style="color: #0a0a0a; font-size: 18px; font-weight: 600; margin: 0; line-height: 1.5;">{one_line_summary}</h1>
                </div>

                <!-- Content Area -->
                <div style="background: #f0f0f0; padding: 16px;">
                    {stocks_html}
                    {news_html}
                    {events_html}
                    {summary_html}
                </div>

                {self._get_feedback_section(feedback_digest_date, feedback_digest_id, "digest")}
                {self._get_email_footer()}
            </div>
        </body>
        </html>
        """
        return html

    # =========================================================================
    # Email Sending
    # =========================================================================

    async def send_daily_report(
        self, data: dict, to_email: Optional[str] = None, first_name: Optional[str] = None
    ) -> dict:
        """Send the daily market report email to a single recipient."""
        print(f"[EmailService] send_daily_report to={to_email}")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        recipient = to_email or ""
        if not recipient:
            return {"success": False, "error": "No recipient email specified"}

        try:
            # Get report_date and report_id for feedback URL
            report_date = data.get("report_date") or today_str()
            report_id = data.get("report_id")
            html_content = self._format_html_report(data, report_date, report_id)

            # Replace template variables for single emails
            display_name = first_name
            if not display_name:
                # Look up from subscription service
                sub_service = get_subscription_service()
                status = sub_service.get_status(
                    SubscriptionChannel.DAILY_REPORT, recipient
                )
                if status.get("subscribed"):
                    display_name = status.get("metadata", {}).get("first_name")
            display_name = display_name or "朋友"
            html_content = html_content.replace("{{{first_name|朋友}}}", display_name)
            # Replace email template variable for single sends (not broadcast)
            from urllib.parse import quote

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
            print(f"[EmailService] Email sent: {email.get('id')}")
            return {"success": True, "email_id": email.get("id"), "sent_to": recipient}

        except Exception as e:
            print(f"[EmailService] Error sending email: {e}")
            return {"success": False, "error": str(e)}

    async def send_personal_digest(
        self,
        data: dict,
        to_email: str,
        first_name: Optional[str] = None,
        digest_date: Optional[str] = None,
        digest_id: Optional[str] = None,
    ) -> dict:
        """Send a personal digest email to a single recipient.

        Args:
            data: Digest data dictionary
            to_email: Recipient email address
            first_name: User's first name for greeting
            digest_date: Digest date for feedback URL (defaults to today)
            digest_id: Digest UUID for feedback URL (optional)
        """
        print(f"[EmailService] send_personal_digest to={to_email}")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            # Get digest_date for feedback
            feedback_date = digest_date or data.get("digest_date") or today_str()
            feedback_id = digest_id or data.get("digest_id")

            html_content = self._format_digest_html(
                data, first_name or "", feedback_date, feedback_id
            )

            # Replace email template variable for single sends (not broadcast)
            from urllib.parse import quote

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
            print(f"[EmailService] Digest email sent: {email.get('id')}")
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            print(f"[EmailService] Error sending digest email: {e}")
            return {"success": False, "error": str(e)}

    async def broadcast_daily_report(self, data: dict, audience_id: Optional[str] = None) -> dict:
        """Send the daily market report using Resend Broadcasts.

        Args:
            data: Report data to send
            audience_id: Optional specific audience ID (e.g., Test Broadcast audience).
                        If not provided, uses the default daily_report audience.
        """
        print(
            f"[EmailService] broadcast_daily_report called, audience_id={audience_id}"
        )

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            # Use provided audience_id or get default
            if not audience_id:
                sub_service = get_subscription_service()
                audience_id = sub_service.ensure_audience(
                    SubscriptionChannel.DAILY_REPORT
                )

            # Get report_date and report_id for feedback URL
            today = today_str()
            report_date = data.get("report_date") or today
            report_id = data.get("report_id")
            html_content = self._format_html_report(data, report_date, report_id)

            report_title = data.get("title", "")
            subject = (
                f"[TheMarketBrew] {report_title}"
                if report_title
                else f"[TheMarketBrew] {today}"
            )

            create_params: resend.Broadcasts.CreateParams = {
                "from": self.from_email,
                "audience_id": audience_id,
                "subject": subject,
                "html": html_content,
                "name": f"Daily Report {today}",
            }

            broadcast = resend.Broadcasts.create(create_params)
            broadcast_id = broadcast.get("id")
            if not broadcast_id:
                print(f"[EmailService] ERROR: Broadcast create returned no id: {broadcast}")
                return {"success": False, "error": "Broadcast creation returned no ID"}
            print(f"[EmailService] Broadcast created: {broadcast_id}")

            send_params: resend.Broadcasts.SendParams = {"broadcast_id": broadcast_id}
            send_result = resend.Broadcasts.send(send_params)
            send_id = send_result.get("id") if send_result else None
            print(f"[EmailService] Broadcast send result: {send_result}")

            if not send_id:
                print(f"[EmailService] WARNING: Send returned unexpected result, verifying status...")
                # Verify broadcast was actually sent by checking its status
                import time
                time.sleep(1)  # Brief wait for status update
                verify = resend.Broadcasts.get(broadcast_id)
                status = verify.get("status") if verify else None
                print(f"[EmailService] Broadcast status after send: {status}")
                if status not in ("sent", "queued"):
                    return {
                        "success": False,
                        "error": f"Broadcast send failed, status: {status}",
                        "broadcast_id": broadcast_id,
                    }

            print(f"[EmailService] Broadcast sent successfully: {broadcast_id}")

            return {
                "success": True,
                "broadcast_id": broadcast_id,
                "audience_id": audience_id,
            }

        except Exception as e:
            print(f"[EmailService] Error broadcasting: {e}")
            return {"success": False, "error": str(e)}

    async def broadcast_personal_digest(
        self, data: dict, audience_id: Optional[str] = None, first_name: str = ""
    ) -> dict:
        """Broadcast a personal digest using Resend Broadcasts.

        Args:
            data: Digest data to send (from database or agent)
            audience_id: Optional specific audience ID (e.g., Test Broadcast audience).
                        If not provided, uses the default personal_digest audience.
            first_name: Optional first name for greeting personalization.
        """
        print(
            f"[EmailService] broadcast_personal_digest called, audience_id={audience_id}"
        )

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            # Use provided audience_id or get default
            if not audience_id:
                sub_service = get_subscription_service()
                audience_id = sub_service.ensure_audience(
                    SubscriptionChannel.PERSONAL_DIGEST
                )

            today = today_str()
            digest_date = data.get("digest_date") or today
            digest_id = data.get("digest_id")
            html_content = self._format_digest_html(
                data, first_name=first_name, digest_date=digest_date, digest_id=digest_id
            )

            one_line = data.get("one_line_summary", "")
            subject = (
                f"[TheMarketBrew专属日报] {one_line[:50]}"
                if one_line
                else f"[TheMarketBrew专属日报] {today}"
            )

            create_params: resend.Broadcasts.CreateParams = {
                "from": self.from_email,
                "audience_id": audience_id,
                "subject": subject,
                "html": html_content,
                "name": f"Personal Digest {today}",
            }

            broadcast = resend.Broadcasts.create(create_params)
            broadcast_id = broadcast.get("id")
            if not broadcast_id:
                print(f"[EmailService] ERROR: Digest broadcast create returned no id: {broadcast}")
                return {"success": False, "error": "Broadcast creation returned no ID"}
            print(f"[EmailService] Digest broadcast created: {broadcast_id}")

            send_params: resend.Broadcasts.SendParams = {"broadcast_id": broadcast_id}
            send_result = resend.Broadcasts.send(send_params)
            send_id = send_result.get("id") if send_result else None
            print(f"[EmailService] Digest broadcast send result: {send_result}")

            if not send_id:
                print(f"[EmailService] WARNING: Digest send returned unexpected result, verifying status...")
                import time
                time.sleep(1)
                verify = resend.Broadcasts.get(broadcast_id)
                status = verify.get("status") if verify else None
                print(f"[EmailService] Digest broadcast status after send: {status}")
                if status not in ("sent", "queued"):
                    return {
                        "success": False,
                        "error": f"Digest broadcast send failed, status: {status}",
                        "broadcast_id": broadcast_id,
                    }

            print(f"[EmailService] Digest broadcast sent successfully: {broadcast_id}")

            return {
                "success": True,
                "broadcast_id": broadcast_id,
                "audience_id": audience_id,
            }

        except Exception as e:
            print(f"[EmailService] Error broadcasting digest: {e}")
            return {"success": False, "error": str(e)}

    # =========================================================================
    # Welcome Email
    # =========================================================================

    def _format_welcome_html(self, first_name: str = "") -> str:
        """Format welcome email HTML for new subscribers."""
        display_name = first_name or "朋友"
        formatted_date = now_pacific().strftime("%B %d, %Y")

        card_style = "background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 24px; margin-bottom: 16px;"
        section_header_style = "font-size: 12px; font-weight: 600; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #10b981;"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {self._get_email_header(formatted_date, "Welcome")}

                <!-- Welcome Card -->
                <div style="background: #ffffff; padding: 32px 24px;">
                    <h1 style="color: #0a0a0a; font-size: 24px; font-weight: 600; margin: 0 0 16px 0;">
                        Hi {display_name}，欢迎加入 TheMarketBrew!
                    </h1>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
                        从今天起，你将在每个交易日收到我们精心准备的市场简报，帮助你快速了解市场动态。
                    </p>

                    <!-- What we track -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            每日简报包含
                        </div>
                        <table style="width: 100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 8px 0; color: #3f3f46; font-size: 14px;">
                                    主要股指和波动率 (S&P 500, Nasdaq, VIX)
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 8px 0; color: #3f3f46; font-size: 14px;">
                                    宏观环境解读
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 8px 0; color: #3f3f46; font-size: 14px;">
                                    重要财经新闻解读
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 8px 0; color: #3f3f46; font-size: 14px;">
                                    未来一周关键事件
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- When we send -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            发送时间
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0;">
                            每个<strong>美股交易日</strong>收盘后，约<strong>下午 6:00 (美东时间)</strong> / 次日早上 7:00 (北京时间) 发送。周末和美国节假日休市不发送。
                        </p>
                    </div>

                    <!-- Personal Digest -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            个性化日报
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">
                            想要追踪特定股票？开启<strong>个性化日报</strong>，我们会根据你的关注列表，每天为你筛选相关新闻和事件。
                        </p>
                        <a href="{self.frontend_url}/for-you" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
                            设置我的关注列表
                        </a>
                    </div>

                    <!-- Quick start -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            快速指引
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0;">
                            <a href="{self.frontend_url}" style="color: #10b981; text-decoration: none; font-weight: 500;">访问网站</a> 查看完整报告和历史数据
                        </p>
                    </div>

                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
                        祝投资顺利！<br>
                        <span style="color: #0a0a0a; font-weight: 500;">TheMarketBrew 团队</span>
                    </p>
                </div>

                {self._get_email_footer()}
            </div>
        </body>
        </html>
        """
        return html

    async def send_welcome_email(self, to_email: str, first_name: Optional[str] = None) -> dict:
        """Send welcome email to new subscriber.

        Args:
            to_email: Recipient email address
            first_name: Optional first name for personalization

        Returns:
            dict with success status and email_id
        """
        print(f"[EmailService] send_welcome_email to={to_email}")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            html_content = self._format_welcome_html(first_name or "")

            params = {
                "from": self.from_email,
                "to": [to_email],
                "subject": "[TheMarketBrew] 欢迎加入 - 开始你的每日市场简报之旅",
                "html": html_content,
            }

            email = resend.Emails.send(params)
            print(f"[EmailService] Welcome email sent: {email.get('id')}")
            return {"success": True, "email_id": email.get("id"), "sent_to": to_email}

        except Exception as e:
            print(f"[EmailService] Error sending welcome email: {e}")
            return {"success": False, "error": str(e)}

    async def broadcast_personal_digests(self, max_concurrent: int = 5) -> dict:
        """
        Generate and send personal digests to all subscribers in parallel.

        Uses asyncio.gather with semaphore for controlled concurrency.
        Each subscriber gets a personalized digest based on their watchlist.
        """
        print("[EmailService] broadcast_personal_digests called")

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            from app.features.digest.agent import get_personal_digest

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

            print(f"[EmailService] Broadcasting to {len(subscribers)} subscribers")

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
                    print(f"[EmailService] Saved digest to DB for {email}")
                except Exception as db_err:
                    print(f"[EmailService] DB save failed for {email}: {db_err}")

            async def generate_and_send(
                email: str, first_name: str, user_id: str, symbols: list
            ) -> dict:
                """Generate digest and send email. Returns success dict."""
                digest_result = await digest_agent.generate(symbols)
                if not digest_result.get("success"):
                    raise Exception(digest_result.get("error", "Generation failed"))

                send_result = await self.send_personal_digest(
                    digest_result, email, first_name
                )
                if not send_result.get("success"):
                    raise Exception(send_result.get("error", "Send failed"))

                if user_id:
                    await save_digest_to_db(user_id, email, digest_result, symbols)

                return {"email": email, "success": True}

            async def get_symbols_for_user(
                user_id: str, metadata: dict, email: str
            ) -> list:
                """Get symbols from Insforge, fallback to Resend metadata."""
                if user_id:
                    watchlist = await get_user_watchlist(user_id)
                    if watchlist and watchlist.get("symbols"):
                        symbols = watchlist.get("symbols", [])
                        print(
                            f"[EmailService] Loaded {len(symbols)} symbols from Insforge for {email}"
                        )
                        return symbols

                symbols = metadata.get("symbols", [])
                if isinstance(symbols, str):
                    try:
                        symbols = json.loads(symbols)
                    except json.JSONDecodeError:
                        symbols = []
                if symbols:
                    print(
                        f"[EmailService] Using fallback {len(symbols)} symbols from Resend for {email}"
                    )
                return symbols

            async def process_subscriber(sub: dict) -> dict:
                """Process a single subscriber with retry logic."""
                email = sub.get("email", "")
                metadata = sub.get("metadata", {})
                first_name = metadata.get("first_name", "")
                user_id = metadata.get("user_id")

                symbols = await get_symbols_for_user(user_id, metadata, email)
                if not symbols:
                    return {
                        "email": email,
                        "success": False,
                        "error": "No symbols configured",
                    }

                async with semaphore:
                    try:
                        return await generate_and_send(
                            email, first_name, user_id, symbols
                        )
                    except Exception as e:
                        print(f"[EmailService] First attempt failed for {email}: {e}")

                    await asyncio.sleep(2)
                    try:
                        return await generate_and_send(
                            email, first_name, user_id, symbols
                        )
                    except Exception as retry_error:
                        print(
                            f"[EmailService] Retry failed for {email}: {retry_error}"
                        )
                        return {
                            "email": email,
                            "success": False,
                            "error": str(retry_error),
                        }

            results = await asyncio.gather(
                *[process_subscriber(sub) for sub in subscribers],
                return_exceptions=True,
            )

            sent_count = 0
            failed_count = 0
            errors = []

            for result in results:
                if isinstance(result, Exception):
                    failed_count += 1
                    errors.append({"error": str(result)})
                elif isinstance(result, dict):
                    if result.get("success"):
                        sent_count += 1
                    else:
                        failed_count += 1
                        errors.append(
                            {"email": result.get("email"), "error": result.get("error")}
                        )

            print(
                f"[EmailService] Broadcast complete: {sent_count} sent, {failed_count} failed"
            )

            return {
                "success": True,
                "channel": "personal_digest",
                "total": len(subscribers),
                "sent": sent_count,
                "failed": failed_count,
                "errors": errors[:10],
            }

        except Exception as e:
            print(f"[EmailService] Error in broadcast_personal_digests: {e}")
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
