"""
Email Service using Resend for sending daily market reports and personal digests.
Subscription management is handled by SubscriptionService.
"""

import asyncio
import time
from datetime import datetime
from typing import Optional
from urllib.parse import quote

import resend

from app.core.config import RESEND_API_KEY, FRONTEND_URL, ENVIRONMENT
from app.core.logging import get_logger
from app.utils.timezone import now_pacific, now_iso, today_str, to_pacific
from app.features.subscription.service import (
    get_subscription_service,
    SubscriptionChannel,
)
from app.features.brew.db import save_user_digest, get_user_watchlist

logger = get_logger(__name__)


class EmailService:
    """Service for sending market analysis reports and personal digests via email."""

    def __init__(self):
        self.api_key = RESEND_API_KEY
        if self.api_key:
            resend.api_key = self.api_key
        self.from_email = "MarketBrew Daily <daily@themarketbrew.com>"
        self.frontend_url = FRONTEND_URL if FRONTEND_URL else "https://themarketbrew.com"
        self.is_production = ENVIRONMENT == "production"
        self.logo_url = "https://themarketbrew.com/logo-avatar.png"

    def _format_timestamp(self, timestamp: str) -> str:
        """Format ISO timestamp to human-readable format (Pacific timezone)."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            pacific_dt = to_pacific(dt)
            return pacific_dt.strftime("%B %d, %Y")
        except Exception:
            return now_pacific().strftime("%B %d, %Y")

    def _get_time_greeting(self) -> str:
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
        """Generate email feedback survey section."""
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
        if report_type == "digest":
            prompt_text = "今天的专属日报对你有帮助吗?"
        elif report_type == "weekly":
            prompt_text = "本周的宏观周报对你有帮助吗?"
        else:
            prompt_text = "今天的日报对你有帮助吗?"

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

    def _get_digest_cta_section(self) -> str:
        """CTA block promoting personal digest, shown only in daily report emails."""
        watchlist_url = f"{self.frontend_url}/for-you/watchlist"
        return f"""
        <div style="background: #ffffff; padding: 28px 24px; border-top: 1px solid #e5e7eb;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="text-align: center; padding-bottom: 14px;">
                        <span style="display: inline-block; background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 4px; text-transform: uppercase;">NEW</span>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center; padding-bottom: 6px;">
                        <p style="margin: 0; font-size: 17px; font-weight: 600; color: #0a0a0a;">
                            没看到你最关心的股票?
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center; padding-bottom: 18px;">
                        <p style="margin: 0; font-size: 13px; color: #71717a; line-height: 1.6;">
                            添加你的持仓到 Watchlist，每天收到一份只分析你的股票的专属日报。
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center;">
                        <a href="{watchlist_url}" style="display: inline-block; padding: 12px 28px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                            获取我的专属日报
                        </a>
                    </td>
                </tr>
            </table>
        </div>
        """

    def _format_html_report(
        self, data: dict, report_date: Optional[str] = None, report_id: Optional[str] = None
    ) -> str:
        """Format the macro analysis data into an HTML email (Daily Report)."""
        timestamp = data.get("timestamp", now_iso())
        formatted_date = self._format_timestamp(timestamp)

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
        news = data.get("news", {})
        outlook = data.get("report_summary", [])
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
                change_unit = index.get("change_unit", "%")  # "%" for stocks, "bps" for rates
                color = "#16a34a" if change >= 0 else "#dc2626"
                arrow = "+" if change >= 0 else ""
                value = index.get("value", 0)
                value_str = f"{value:,.0f}" if value > 1000 else f"{value:,.2f}"

                # Format change display based on unit type
                if change_unit == "bps":
                    # Basis points: show as integer with "bps" suffix (e.g., "+5 bps")
                    change_str = f"{arrow}{change:.0f} bps"
                else:
                    # Percentage: show with % suffix (e.g., "+1.27%")
                    change_str = f"{arrow}{change:.2f}%"

                indices_html += f"""
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                        <div style="font-size: 10px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">{index.get('name', '')}</div>
                        <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{value_str}</div>
                        <div style="font-size: 11px; font-weight: 600; color: {color}; margin-top: 2px;">{change_str}</div>
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

        # Outlook section (report_summary is a list of {title, content} dicts)
        outlook_html = ""
        if outlook:
            # Parse JSON string if needed (DB may store list as JSON string)
            if isinstance(outlook, str):
                try:
                    import json as _json
                    parsed = _json.loads(outlook)
                    if isinstance(parsed, list):
                        outlook = parsed
                except (ValueError, TypeError):
                    pass

            subsections_html = ""
            # Handle both list format (new) and string format (legacy)
            if isinstance(outlook, list):
                for section in outlook:
                    if not isinstance(section, dict):
                        continue
                    section_title = section.get("title", "")
                    section_content = section.get("content", "")
                    if not section_content:
                        continue
                    # Render paragraphs from content (split by newlines)
                    paragraphs = [p.strip() for p in section_content.replace("\\n", "\n").split("\n") if p.strip()]
                    paragraphs_html = "".join(
                        f'<p style="margin: 0 0 10px 0; font-size: 13px; color: #3f3f46; line-height: 1.85;">{p}</p>'
                        for p in paragraphs
                    )
                    subsections_html += f"""
                    <div style="margin-bottom: 16px;">
                        <div style="font-size: 12px; font-weight: 600; color: #0a0a0a; margin-bottom: 8px;">{section_title}</div>
                        {paragraphs_html}
                    </div>
                    """
            elif isinstance(outlook, str) and outlook.strip():
                # Legacy string format fallback
                outlook_text = outlook.replace("\\n", "\n").replace("\n", "\n\n")
                subsections_html = self._format_markdown_to_html(outlook_text)

            if subsections_html:
                outlook_html = f"""
                <div style="{card_style}">
                    <div style="{section_header_style}">总结与展望</div>
                    {subsections_html}
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
                        Hi {{{{{{first_name}}}}}}
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
                    {news_html}
                    {calendar_html}
                    {outlook_html}
                </div>

                {self._get_feedback_section(feedback_report_date, feedback_report_id)}
                {self._get_digest_cta_section()}
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
        """Format personal digest data into an HTML email."""
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

        # Build greeting: "Hi [name]" or just "Hi" if no name
        hi_greeting = f"Hi {first_name}" if first_name else "Hi"

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
                        {hi_greeting}
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

    async def send_daily_report(
        self, data: dict, to_email: Optional[str] = None, first_name: Optional[str] = None
    ) -> dict:
        """Send the daily market report email to a single recipient."""
        logger.info("send_daily_report to=%s", to_email)

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

            # Replace template variables for single sends (not broadcast)
            # Get first_name if not provided
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
            # Get digest_date for feedback
            feedback_date = digest_date or data.get("digest_date") or today_str()
            feedback_id = digest_id or data.get("digest_id")

            html_content = self._format_digest_html(
                data, first_name or "", feedback_date, feedback_id
            )

            # Replace email template variable for single sends (not broadcast)
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
                channel.value, forced,
            )
            return forced
        if audience_id:
            return audience_id
        sub_service = get_subscription_service()
        return sub_service.ensure_audience(channel)

    def _create_and_send_broadcast(
        self,
        label: str,
        audience_id: str,
        subject: str,
        broadcast_name: str,
        html: Optional[str] = None,
        text: Optional[str] = None,
        from_email: Optional[str] = None,
    ) -> dict:
        """Create a Resend broadcast, send it, and verify delivery.

        Returns {"success": True, "broadcast_id": ..., "audience_id": ...}
        or {"success": False, "error": ...}.
        """
        create_params: resend.Broadcasts.CreateParams = {
            "from": from_email or self.from_email,
            "audience_id": audience_id,
            "subject": subject,
            "name": broadcast_name,
        }
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
                    logger.warning("%s broadcast create rate limited, retry in %ds...", label, wait)
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
                send_params: resend.Broadcasts.SendParams = {"broadcast_id": broadcast_id}
                send_result = resend.Broadcasts.send(send_params)
                break
            except Exception as e:
                if "Too many requests" in str(e) and attempt < max_retries - 1:
                    wait = (attempt + 1) * 2
                    logger.warning("%s broadcast send rate limited, retry in %ds...", label, wait)
                    time.sleep(wait)
                else:
                    raise

        send_id = send_result.get("id") if send_result else None
        logger.info("%s broadcast send result: %s", label, send_result)

        if not send_id:
            logger.warning("%s send returned unexpected result, verifying status...", label)
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

        logger.info("%s broadcast sent successfully: %s", label, broadcast_id)
        return {
            "success": True,
            "broadcast_id": broadcast_id,
            "audience_id": audience_id,
        }

    async def broadcast_daily_report(self, data: dict, audience_id: Optional[str] = None) -> dict:
        """Send the daily market report using Resend Broadcasts."""
        logger.info("broadcast_daily_report called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
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

            return self._create_and_send_broadcast(
                label="Daily",
                audience_id=audience_id,
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
            audience_id = self._resolve_audience(audience_id, SubscriptionChannel.PERSONAL_DIGEST)
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

    def _format_weekly_report_html(
        self,
        data: dict,
        report_date: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> str:
        """Format weekly macro report data into an HTML email."""
        generated_at = data.get("generated_at", now_iso())
        formatted_date = self._format_timestamp(generated_at)

        title = data.get("title", "")
        verdict = data.get("verdict", "")
        signal_lights = data.get("signal_lights", {})
        landscape = data.get("landscape", "")
        narrative = data.get("narrative", "")
        takeaway = data.get("takeaway", "")
        week_ahead = data.get("week_ahead", [])

        # Four-dimension analysis data (for deep-dive section)
        analyses = {
            "liquidity": data.get("liquidity_analysis", {}),
            "economy": data.get("economy_analysis", {}),
            "inflation": data.get("inflation_analysis", {}),
            "sentiment": data.get("sentiment_analysis", {}),
        }

        feedback_report_date = report_date or today_str()
        feedback_report_id = report_id or data.get("id")

        report_url = f"{self.frontend_url}/macro"

        # Signal light colors and labels
        signal_color_map = {
            "green": "#16a34a",
            "yellow": "#eab308",
            "red": "#dc2626",
        }
        signal_label_map = {
            "green": "利好",
            "yellow": "中性",
            "red": "利空",
        }
        signal_name_map = {
            "liquidity": "流动性",
            "economy": "经济",
            "inflation": "通胀",
            "sentiment": "情绪",
        }

        # Build signal lights HTML (pill badge style)
        signal_bg_map = {
            "green": {"bg": "#dcfce7", "text": "#15803d"},
            "yellow": {"bg": "#fef3c7", "text": "#92400e"},
            "red": {"bg": "#fee2e2", "text": "#991b1b"},
        }
        signal_cells = []
        for key in ["liquidity", "economy", "inflation", "sentiment"]:
            color_key = signal_lights.get(key, "yellow") if isinstance(signal_lights, dict) else "yellow"
            label = signal_label_map.get(color_key, "中性")
            name = signal_name_map.get(key, key)
            colors = signal_bg_map.get(color_key, signal_bg_map["yellow"])
            signal_cells.append(f"""
                <td style="width: 25%; padding: 6px 4px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 600; color: #52525b; margin-bottom: 6px;">{name}</div>
                    <div style="display: inline-block; padding: 3px 10px; border-radius: 10px; background: {colors['bg']}; color: {colors['text']}; font-size: 11px; font-weight: 600;">{label}</div>
                </td>
            """)

        signal_lights_html = f"""
        <table style="width: 100%; border-collapse: separate; border-spacing: 0;" cellpadding="0" cellspacing="0">
            <tr>{signal_cells[0]}{signal_cells[1]}{signal_cells[2]}{signal_cells[3]}</tr>
        </table>
        """

        card_style = "background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;"
        section_header_style = "font-size: 12px; font-weight: 600; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #0a0a0a;"

        # ── Market Performance card (6 key indicators, 2x3 grid) ──
        market_perf_html = ""
        raw_data = data.get("raw_data") or {}
        market_perf = raw_data.get("market_performance") or {}
        indices = market_perf.get("indices", [])

        if indices:
            indicator_labels = {
                "^GSPC": "标普500", "^IXIC": "纳斯达克", "^VIX": "恐慌指数",
                "GC=F": "黄金", "DX-Y.NYB": "美元指数", "^TNX": "十年美债",
            }
            indicator_cells = []
            for idx in indices[:6]:
                symbol = idx.get("symbol", "")
                label = indicator_labels.get(symbol, idx.get("name", symbol))
                change = idx.get("weekly_change", 0)
                last = idx.get("last_close", 0)
                abs_change = idx.get("weekly_change_abs", 0)

                if symbol == "^TNX":
                    last_str = f"{last:.2f}%"
                    bps = round(abs_change * 100)
                    ch_sign = "+" if bps >= 0 else ""
                    change_str = f"{ch_sign}{bps} bps"
                else:
                    last_str = f"{last:,.0f}" if last > 500 else f"{last:,.2f}"
                    ch_sign = "+" if change >= 0 else ""
                    change_str = f"{ch_sign}{change:.2f}%"

                color = "#16a34a" if change >= 0 else "#dc2626"
                indicator_cells.append(f"""
                    <td style="width: 33.33%; padding: 4px;">
                        <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                            <div style="font-size: 10px; color: #71717a; letter-spacing: 0.05em; margin-bottom: 4px;">{label}</div>
                            <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{last_str}</div>
                            <div style="font-size: 12px; font-weight: 600; color: {color}; margin-top: 2px;">{change_str}</div>
                        </div>
                    </td>
                """)

            row1 = "".join(indicator_cells[:3])
            row2_html = ""
            if len(indicator_cells) > 3:
                row2 = "".join(indicator_cells[3:6])
                row2_html = f"""
                <div style="margin-top: 4px;">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 4px;" cellpadding="0" cellspacing="0">
                        <tr>{row2}</tr>
                    </table>
                </div>
                """

            market_perf_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">本周表现</div>
                <table style="width: 100%; border-collapse: separate; border-spacing: 4px;" cellpadding="0" cellspacing="0">
                    <tr>{row1}</tr>
                </table>
                {row2_html}
            </div>
            """

        # ── Landscape section (full content) ──
        landscape_html = ""
        if landscape:
            landscape_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">宏观格局</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {self._format_markdown_to_html(landscape)}
                </div>
            </div>
            """

        # ── Narrative section (full content) ──
        narrative_html = ""
        if narrative:
            narrative_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">本周回顾</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {self._format_markdown_to_html(narrative)}
                </div>
            </div>
            """

        # ── Takeaway section (full content) ──
        takeaway_html = ""
        if takeaway:
            takeaway_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">策略启示</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {self._format_markdown_to_html(takeaway)}
                </div>
            </div>
            """

        # ── Four-dimension deep dive section ──
        four_dims_html = ""
        dim_keys = ["liquidity", "economy", "inflation", "sentiment"]
        dim_names = {"liquidity": "流动性", "economy": "经济", "inflation": "通胀", "sentiment": "情绪"}
        dim_links = {
            "liquidity": f"{self.frontend_url}/macro/liquidity",
            "economy": f"{self.frontend_url}/macro/economy",
            "inflation": f"{self.frontend_url}/macro/inflation-rates",
            "sentiment": f"{self.frontend_url}/macro/sentiment",
        }
        dim_items = []
        for key in dim_keys:
            analysis = analyses.get(key, {})
            if not isinstance(analysis, dict):
                continue
            summary = analysis.get("summary", "")
            data_changes = analysis.get("data_changes", "")
            if not summary and not data_changes:
                continue
            color_key = signal_lights.get(key, "yellow") if isinstance(signal_lights, dict) else "yellow"
            dot_color = signal_color_map.get(color_key, "#eab308")
            label = signal_label_map.get(color_key, "中性")
            colors = signal_bg_map.get(color_key, signal_bg_map["yellow"])
            link = dim_links.get(key, report_url)
            # Summary as lead line
            summary_html = ""
            if summary:
                summary_html = f'<p style="font-size: 13px; color: #3f3f46; line-height: 1.6; margin: 0 0 10px 0; font-weight: 500;">{summary}</p>'
            # Data changes as structured detail
            data_html = ""
            if data_changes:
                data_html = f"""
                <div style="font-size: 12.5px; color: #52525b; line-height: 1.75;">
                    {self._format_markdown_to_html(data_changes)}
                </div>
                """
            dim_items.append(f"""
            <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 18px; margin-bottom: 12px;">
                <a href="{link}" style="text-decoration: none; display: block; margin-bottom: 10px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: {dot_color}; margin-right: 8px; vertical-align: middle;"></span>
                    <span style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-right: 8px; vertical-align: middle;">{dim_names.get(key, key)}</span>
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 8px; background: {colors['bg']}; color: {colors['text']}; font-size: 10px; font-weight: 600; vertical-align: middle;">{label}</span>
                    <span style="font-size: 11px; color: #059669; margin-left: 4px; vertical-align: middle;">&rarr;</span>
                </a>
                {summary_html}
                {data_html}
            </div>
            """)
        if dim_items:
            four_dims_html = f"""
            <div style="margin-bottom: 16px;">
                <div style="{section_header_style}">四维解读</div>
                {''.join(dim_items)}
            </div>
            """

        # ── Week ahead (card-based layout for mobile) ──
        week_ahead_html = ""
        if week_ahead:
            event_cards = ""
            for event in week_ahead[:5]:
                if not isinstance(event, dict):
                    continue
                evt_date = event.get("date", "")
                evt_name = event.get("event", "")
                evt_above = event.get("if_above", "")
                evt_below = event.get("if_below", "")
                event_cards += f"""
                <div style="padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="margin-bottom: 8px;">
                        <span style="font-size: 12px; color: #10b981; font-weight: 600;">{evt_date}</span>
                        <span style="font-size: 13px; color: #0a0a0a; font-weight: 500; margin-left: 8px;">{evt_name}</span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                                <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">高于预期</div>
                                <div style="font-size: 12px; color: #52525b; line-height: 1.5;">{evt_above}</div>
                            </td>
                            <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                                <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">低于预期</div>
                                <div style="font-size: 12px; color: #52525b; line-height: 1.5;">{evt_below}</div>
                            </td>
                        </tr>
                    </table>
                </div>
                """
            if event_cards:
                week_ahead_html = f"""
                <div style="{card_style}">
                    <div style="{section_header_style}">下周关注</div>
                    {event_cards}
                </div>
                """

        # CTA button
        cta_html = f"""
        <div style="text-align: center; padding: 8px 0 16px 0;">
            <a href="{report_url}" style="display: inline-block; padding: 12px 28px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                查看完整周报 &rarr;
            </a>
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
                {self._get_email_header(formatted_date, "Macro Weekly")}

                <!-- Title Card -->
                <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
                    <p style="color: #52525b; font-size: 16px; margin: 0 0 8px 0; line-height: 1.5;">
                        Hi {{{{{{first_name}}}}}}
                    </p>
                    <p style="color: #71717a; font-size: 13px; margin: 0 0 20px 0; line-height: 1.6;">
                        又一周过去了，为你准备了本周的宏观全景回顾，一起来看看吧。
                    </p>
                    <div style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">核心判断</div>
                    <a href="{report_url}" style="text-decoration: none;">
                        <h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{title}</h1>
                    </a>
                    {f'<p style="color: #52525b; font-size: 14px; margin: 0; line-height: 1.6;">{verdict}</p>' if verdict else ''}
                </div>

                <!-- Signal Lights -->
                <div style="background: #ffffff; padding: 12px 20px; border-bottom: 1px solid #e4e4e7;">
                    {signal_lights_html}
                </div>

                <!-- Content Area -->
                <div style="background: #f0f0f0; padding: 16px;">
                    {market_perf_html}
                    {landscape_html}
                    {narrative_html}
                    {takeaway_html}
                    {four_dims_html}
                    {week_ahead_html}
                    {cta_html}
                </div>

                {self._get_feedback_section(feedback_report_date, feedback_report_id, "weekly")}
                {self._get_email_footer()}
            </div>
        </body>
        </html>
        """
        return html

    def _truncate_at_paragraph(self, text: str, max_chars: int) -> str:
        """Truncate text at a paragraph boundary, adding '...' if truncated."""
        if len(text) <= max_chars:
            return text
        # Find the last paragraph break before max_chars
        truncated = text[:max_chars]
        last_break = truncated.rfind("\n\n")
        if last_break > max_chars * 0.3:
            return truncated[:last_break].rstrip() + "\n\n..."
        # Fallback: truncate at last sentence
        last_period = truncated.rfind("。")
        if last_period > max_chars * 0.3:
            return truncated[: last_period + 1] + "..."
        return truncated.rstrip() + "..."

    async def broadcast_weekly_report(
        self, data: dict, audience_id: Optional[str] = None
    ) -> dict:
        """Send the weekly macro report using Resend Broadcasts."""
        logger.info("broadcast_weekly_report called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
            week_label = data.get("week_label", "")
            report_id = data.get("id")
            html_content = self._format_weekly_report_html(data, report_id=report_id)

            title = data.get("title", "")
            subject = (
                f"[TheMarketBrew 周报] {title}"
                if title
                else f"[TheMarketBrew 周报] {week_label}"
            )

            return self._create_and_send_broadcast(
                label="Weekly",
                audience_id=audience_id,
                subject=subject,
                broadcast_name=f"Weekly Report {week_label}",
                html=html_content,
            )

        except Exception as e:
            logger.error("Error broadcasting weekly report: %s", e)
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
            html_content = self._format_weekly_report_html(data, report_id=report_id)

            # Replace template variables for single sends
            display_name = first_name or ""
            html_content = html_content.replace("{{{first_name}}}", display_name)
            html_content = html_content.replace("{{{email}}}", quote(to_email))

            title = data.get("title", "")
            week_label = data.get("week_label", "")
            subject = (
                f"[TheMarketBrew 周报] {title}"
                if title
                else f"[TheMarketBrew 周报] {week_label}"
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

    def _format_newsletter_plaintext(self, data: dict) -> str:
        """Format newsletter data into plain text for maximum deliverability."""
        import re

        greeting = data.get("greeting", "")
        sections = data.get("sections", [])
        closing = data.get("closing", "")
        sign_off_name = data.get("sign_off_name", "Golden / 金黄")
        sign_off_title = data.get("sign_off_title", "独立开发者 / 十年美股散户")

        def _clean_markdown(text: str) -> str:
            """Strip markdown syntax for plain text: **bold** -> bold, [text](url) -> text: url"""
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1: \2", text)
            return text.rstrip()

        # Build paragraphs list - each entry is a clean text block (no trailing newlines).
        # "\n\n".join() will put exactly ONE blank line between paragraphs.
        paragraphs = []

        # Hi {name},
        paragraphs.append("Hi {{{first_name}}},")

        # Greeting
        if greeting:
            paragraphs.append(_clean_markdown(greeting))

        # Sections - title + content form one paragraph block
        for section in sections:
            title = section.get("title", "")
            content = section.get("content", "")
            block = ""
            if title:
                block = title.strip() + "\n"
            if content:
                block += _clean_markdown(content)
            block = block.strip()
            if block:
                paragraphs.append(block)

        # Closing
        if closing:
            paragraphs.append(_clean_markdown(closing))

        # Signature (name + title together, separated by single line break)
        paragraphs.append(sign_off_name + "\n" + sign_off_title)

        return "\n\n".join(paragraphs)

    async def send_newsletter(
        self, data: dict, subject: str, to_email: str, first_name: str = ""
    ) -> dict:
        """Send a newsletter as plain text email to a single recipient."""
        logger.info("send_newsletter to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            text_content = self._format_newsletter_plaintext(data)
            text_content = text_content.replace("{{{first_name}}}", first_name or "朋友")

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

    async def broadcast_newsletter(
        self, data: dict, subject: str, audience_id: Optional[str] = None
    ) -> dict:
        """Broadcast newsletter to all daily report subscribers."""
        logger.info("broadcast_newsletter called, audience_id=%s", audience_id)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            audience_id = self._resolve_audience(audience_id, SubscriptionChannel.DAILY_REPORT)
            text_content = self._format_newsletter_plaintext(data)
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

    def _format_welcome_html(self, first_name: str = "") -> str:
        """Format welcome email HTML for new subscribers."""
        # Build greeting: "Hi [name]，" or just "Hi，" if no name
        greeting = f"Hi {first_name}，" if first_name else "Hi，"
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
                    <h1 style="color: #0a0a0a; font-size: 24px; font-weight: 600; margin: 0 0 20px 0;">
                        {greeting}欢迎加入 TheMarketBrew!
                    </h1>

                    <!-- Personal story -->
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 12px 0;">
                        我是 Golden，一个在硅谷写代码的程序员，也是一个投了十多年美股的散户。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 12px 0;">
                        和你一样，我也曾每天被市场噪音搞得焦虑——涨的时候不知道为什么涨，跌的时候更不知道该不该跑。所以我做了 TheMarketBrew：让 AI 帮我们从噪音中提炼出清晰的逻辑，省下时间和精力，更理性地面对投资。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 28px 0;">
                        这个工具帮我调整了投资心态，希望也能帮到你。以下是你可以用到的功能：
                    </p>

                    <!-- What you get -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            你会收到什么
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0 0 12px 0;">
                            每个<strong>美股交易日</strong>收盘后（约美东下午 6:00 / 北京时间次日早 7:00），你会收到一份市场简报，包含：
                        </p>
                        <table style="width: 100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="padding: 6px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 6px 0; color: #3f3f46; font-size: 14px;">
                                    股指、利率、商品等核心数据速览
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 6px 0; color: #3f3f46; font-size: 14px;">
                                    重要新闻的因果分析，不只是搬运标题
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; vertical-align: top; width: 24px;">
                                    <span style="color: #10b981;">&#10003;</span>
                                </td>
                                <td style="padding: 6px 0; color: #3f3f46; font-size: 14px;">
                                    未来一周值得关注的事件和判断框架
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Explore more features -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            探索更多功能
                        </div>
                        <table style="width: 100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#128203;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">个性化日报</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">添加你的持仓，每天只看跟你相关的新闻和分析</p>
                                    <a href="{self.frontend_url}/for-you" style="display: inline-block; padding: 7px 14px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        设置我的关注列表
                                    </a>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding: 0;"><div style="border-top: 1px solid #f4f4f5;"></div></td></tr>
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#128269;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">个股投研</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">搜索任意美股，AI 帮你拆解基本面和财务数据</p>
                                    <a href="{self.frontend_url}/stock" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        开始个股分析
                                    </a>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding: 0;"><div style="border-top: 1px solid #f4f4f5;"></div></td></tr>
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#127758;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">宏观投研</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">利率、通胀、流动性，看懂影响大盘的底层逻辑</p>
                                    <a href="{self.frontend_url}/macro" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        查看宏观数据
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Community QR Code -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            加入社群
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">
                            扫码加入 TheMarketBrew 微信交流群，和其他投资者一起交流市场观点。
                        </p>
                        <div style="text-align: center;">
                            <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr.jpg"
                                 alt="TheMarketBrew WeChat Group QR Code"
                                 style="width: 100%; max-width: 360px; border-radius: 8px; border: 1px solid #e4e4e7;"
                            />
                        </div>
                    </div>

                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 24px 0 0 0;">
                        如果在使用中有任何想法或建议，欢迎直接回复这封邮件，我会亲自查看每一封。
                    </p>
                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                        祝投资顺利！<br>
                        <span style="color: #0a0a0a; font-weight: 500;">Golden / 金黄</span><br>
                        <span style="color: #a1a1aa; font-size: 13px;">独立开发者 / 十年美股散户</span>
                    </p>
                </div>

                {self._get_email_footer()}
            </div>
        </body>
        </html>
        """
        return html

    async def send_welcome_email(self, to_email: str, first_name: Optional[str] = None) -> dict:
        """Send welcome email to new subscriber."""
        logger.info("send_welcome_email to=%s", to_email)

        if not self.api_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        try:
            html_content = self._format_welcome_html(first_name or "")

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

            if not self.is_production:
                # Dev environment: use test segment contacts instead of production subscribers
                logger.info(
                    "[EmailService] Non-production: "
                    "loading contacts from test segment %s",
                    self.TEST_AUDIENCE_ID,
                )
                import json
                contacts = resend.Contacts.list(audience_id=self.TEST_AUDIENCE_ID)
                active = [c for c in contacts.get("data", []) if not c.get("unsubscribed")]
                subscribers = []
                for c in active:
                    metadata = {}
                    if c.get("last_name"):
                        try:
                            metadata = json.loads(c["last_name"])
                        except Exception:
                            pass
                    subscribers.append({
                        "email": c.get("email", ""),
                        "metadata": {
                            "first_name": c.get("first_name", ""),
                            "user_id": metadata.get("user_id"),
                        },
                    })
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

                html_content = self._format_digest_html(digest_result, first_name or "")
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

            async def get_symbols_for_user(user_id: str, email: str) -> list:
                """Get symbols from Insforge user_watchlists table only."""
                if not user_id:
                    logger.info("No user_id for %s, skipping", email)
                    return []

                watchlist = await get_user_watchlist(user_id)
                if watchlist and watchlist.get("symbols"):
                    symbols = watchlist.get("symbols", [])
                    logger.info("Loaded %d symbols from Insforge for %s", len(symbols), email)
                    return symbols

                logger.info("No watchlist found in Insforge for %s", email)
                return []

            async def process_subscriber(sub: dict) -> dict:
                """Process a single subscriber with retry logic."""
                email = sub.get("email", "")
                metadata = sub.get("metadata", {})
                first_name = metadata.get("first_name", "")
                user_id = metadata.get("user_id")

                symbols = await get_symbols_for_user(user_id, email)
                if not symbols:
                    return {
                        "email": email,
                        "success": False,
                        "error": "No symbols configured",
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

            for r in results:
                if isinstance(r, Exception):
                    errors.append({"error": str(r)})
                elif isinstance(r, dict):
                    if r.get("success") and r.get("params"):
                        email_params_list.append(r["params"])
                    else:
                        errors.append(
                            {"email": r.get("email"), "error": r.get("error")}
                        )

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
                        # Resend Batch.send() uses strict mode by default:
                        # success = all emails accepted, failure = exception thrown.
                        resend.Batch.send(chunk)
                        sent_count += len(chunk)
                        logger.info("Batch %d sent: %d ok", batch_num, len(chunk))
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

            all_errors = errors + send_errors
            failed_count = gen_failed + len(send_errors)

            logger.info(
                "Broadcast complete: %d sent, %d failed (gen=%d, send=%d)",
                sent_count,
                failed_count,
                gen_failed,
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
