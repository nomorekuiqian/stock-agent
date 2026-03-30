"""
Pure-function email templates for HTML rendering.

Every function is stateless -- no class instance required.  Module-level
constants replace the old ``self.frontend_url`` / ``self.logo_url``.
"""

import re
from datetime import datetime
from typing import Optional

from app.core.config import FRONTEND_URL
from app.utils.timezone import now_pacific, now_iso, today_str, to_pacific

from app.features.subscription.email_styles import (
    CARD_STYLE,
    CARD_STYLE_WIDE,
    SECTION_HEADER_STYLE,
    SECTION_HEADER_STYLE_GREEN,
    SUBSECTION_HEADER_STYLE,
    ANALYSIS_BOX_STYLE,
)

# ---------------------------------------------------------------------------
# Module-level constants (replace self.frontend_url / self.logo_url)
# ---------------------------------------------------------------------------
_FRONTEND_URL: str = FRONTEND_URL if FRONTEND_URL else "https://themarketbrew.com"
_LOGO_URL: str = "https://themarketbrew.com/logo-avatar.png"


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def format_timestamp(timestamp: str, compact: bool = False) -> str:
    """Format ISO timestamp to Pacific time with an explicit timezone label."""
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        pacific_dt = to_pacific(dt)
    except Exception:
        pacific_dt = now_pacific()

    time_label = pacific_dt.strftime("%I:%M %p").lstrip("0")
    if compact:
        date_label = pacific_dt.strftime("%b %d").replace(" 0", " ")
        return f"{date_label} · {time_label} PT"

    return f"{pacific_dt.strftime('%B %d, %Y')} · {time_label} PT"


def render_timestamp_meta(timestamp: str) -> str:
    """Render a compact timestamp row for news items."""
    if not timestamp:
        return ""
    return (
        '<div style="font-size: 11px; color: #a1a1aa; margin-bottom: 6px;">'
        f"{format_timestamp(timestamp, compact=True)}"
        "</div>"
    )


def get_time_greeting() -> str:
    hour = now_pacific().hour
    if 5 <= hour < 12:
        return "早上好"
    elif 12 <= hour < 18:
        return "下午好"
    else:
        return "晚上好"


def format_markdown_to_html(text: str) -> str:
    """Convert basic Markdown to HTML for email."""
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
    text = f'<p style="margin: 12px 0; line-height: 1.7; color: #3f3f46;">{text}</p>'

    return text


def format_change_color(change: float) -> str:
    """Return CSS color for positive/negative change."""
    if change > 0:
        return "#10b981"  # green
    elif change < 0:
        return "#ef4444"  # red
    return "#71717a"  # gray


def format_change_text(change: float) -> str:
    """Format change percentage with sign."""
    sign = "+" if change > 0 else ""
    return f"{sign}{change:.2f}%"


def truncate_at_paragraph(text: str, max_chars: int) -> str:
    """Truncate text at a paragraph boundary, adding '...' if truncated."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_break = truncated.rfind("\n\n")
    if last_break > max_chars * 0.3:
        return truncated[:last_break].rstrip() + "\n\n..."
    last_period = truncated.rfind("\u3002")
    if last_period > max_chars * 0.3:
        return truncated[: last_period + 1] + "..."
    return truncated.rstrip() + "..."


# ---------------------------------------------------------------------------
# Layout components
# ---------------------------------------------------------------------------


def get_email_header(formatted_date: str, title: str = "Daily Brief") -> str:
    """Common email header with THEMARKETBREW branding and logo."""
    return f"""
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 20px 24px;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="vertical-align: middle;">
                        <a href="{_FRONTEND_URL}" style="text-decoration: none;">
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align: middle; padding-right: 12px;">
                                        <img src="{_LOGO_URL}" alt="TheMarketBrew" width="36" height="36" style="display: block; border-radius: 6px;" />
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


def get_feedback_section(
    report_date: str,
    report_id: Optional[str] = None,
    report_type: str = "daily",
) -> str:
    """Generate email feedback survey section."""
    feedback_frontend_url = "https://themarketbrew.com"

    base_params = f"report_date={report_date}&report_type={report_type}"
    if report_id:
        base_params += f"&report_id={report_id}"

    feedback_base = (
        f"{feedback_frontend_url}/feedback?{base_params}&email={{{{{{email}}}}}}"
    )

    if report_type == "digest":
        prompt_text = "今天的专属日报对你有帮助吗?"
    elif report_type == "weekly":
        prompt_text = "本周的宏观周报对你有帮助吗?"
    elif report_type == "morning":
        prompt_text = "今天的盘前早报对你有帮助吗?"
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


def get_email_footer(
    unsubscribe_url: Optional[str] = "{{{RESEND_UNSUBSCRIBE_URL}}}",
) -> str:
    """Common email footer with logo."""
    unsubscribe_html = ""
    if unsubscribe_url:
        unsubscribe_html = (
            f'<a href="{unsubscribe_url}" style="color: #10b981; font-size: 11px; '
            'text-decoration: none; font-weight: 500;">Unsubscribe</a>'
        )

    return f"""
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 24px;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="text-align: center; padding-bottom: 16px;">
                        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                            <tr>
                                <td style="vertical-align: middle; padding-right: 8px;">
                                    <img src="{_LOGO_URL}" alt="TheMarketBrew" width="24" height="24" style="display: block; border-radius: 4px;" />
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
                        {unsubscribe_html}
                    </td>
                </tr>
            </table>
        </div>
        """


def get_digest_cta_section() -> str:
    """CTA block promoting personal digest, shown only in daily report emails."""
    watchlist_url = f"{_FRONTEND_URL}/for-you/watchlist"
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


# ---------------------------------------------------------------------------
# Full-page templates
# ---------------------------------------------------------------------------


def format_html_report(
    data: dict, report_date: Optional[str] = None, report_id: Optional[str] = None
) -> str:
    """Format the macro analysis data into an HTML email (Daily Report)."""
    timestamp = data.get("timestamp", now_iso())
    formatted_date = format_timestamp(timestamp)

    feedback_report_date = report_date or data.get("report_date") or today_str()
    feedback_report_id = report_id or data.get("report_id")

    report_url = ""
    if feedback_report_id:
        report_url = f"{_FRONTEND_URL}/today/{feedback_report_id}"

    report_title = data.get("title") or "Daily Market Brief"
    report_summary = data.get("summary", "")
    intro = data.get("intro", "")
    news = data.get("news", {})
    outlook = data.get("report_summary", [])
    calendar = data.get("calendar", [])

    card_style = CARD_STYLE
    section_header_style = SECTION_HEADER_STYLE

    # Build indices section
    indices = data.get("indices", [])
    key_indices = [
        idx
        for idx in indices
        if idx.get("name")
        in ["S&P 500", "Nasdaq", "10Y Treasury", "VIX", "Gold", "US Dollar"]
    ][:6]
    indices_html = ""

    indicator_display_names = {
        "S&P 500": "S&P 500 标普500",
        "Nasdaq": "NASDAQ 纳指",
        "10Y Treasury": "10Y TREASURY 十年美债",
        "VIX": "VIX 恐慌指数",
        "Gold": "GOLD 黄金",
        "US Dollar": "US DOLLAR 美元",
    }

    if key_indices:
        indices_html = '<table style="width: 100%; border-collapse: separate; border-spacing: 6px;"><tr>'
        for i, index in enumerate(key_indices):
            change = index.get("change_percent", 0)
            change_unit = index.get("change_unit", "%")
            color = "#16a34a" if change >= 0 else "#dc2626"
            arrow = "+" if change >= 0 else ""
            value = index.get("value", 0)
            value_str = f"{value:,.0f}" if value > 1000 else f"{value:,.2f}"

            if change_unit == "bps":
                change_str = f"{arrow}{change:.0f} bps"
            else:
                change_str = f"{arrow}{change:.2f}%"

            display_name = indicator_display_names.get(
                index.get("name", ""), index.get("name", "")
            )
            indices_html += f"""
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                        <div style="font-size: 10px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">{display_name}</div>
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
        subsection_style = SUBSECTION_HEADER_STYLE

        headlines_html = ""
        if headlines:
            headlines_items = ""
            for headline in headlines:
                timestamp_html = render_timestamp_meta(headline.get("published_at", ""))
                headlines_items += f"""
                    <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                        <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 6px;">{headline.get('title', '')}</a>
                        {timestamp_html}
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
            for brief in briefs:
                timestamp_html = render_timestamp_meta(brief.get("published_at", ""))
                briefs_items += f"""
                    <div style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #18181b; text-decoration: none;">{brief.get('title', '')}</a>
                        {timestamp_html}
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
        if isinstance(outlook, str):
            try:
                import json as _json

                parsed = _json.loads(outlook)
                if isinstance(parsed, list):
                    outlook = parsed
            except (ValueError, TypeError):
                pass

        subsections_html = ""
        if isinstance(outlook, list):
            for section in outlook:
                if not isinstance(section, dict):
                    continue
                section_title = section.get("title", "")
                section_content = section.get("content", "")
                if not section_content:
                    continue
                paragraphs = [
                    p.strip()
                    for p in section_content.replace("\\n", "\n").split("\n")
                    if p.strip()
                ]
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
            outlook_text = outlook.replace("\\n", "\n").replace("\n", "\n\n")
            subsections_html = format_markdown_to_html(outlook_text)

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
                {get_email_header(formatted_date, "Daily Brief")}

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

                {get_feedback_section(feedback_report_date, feedback_report_id)}
                {get_digest_cta_section()}
                {get_email_footer()}
            </div>
        </body>
        </html>
        """
    return html


def format_digest_html(
    data: dict,
    first_name: str = "",
    digest_date: Optional[str] = None,
    digest_id: Optional[str] = None,
) -> str:
    """Format personal digest data into an HTML email."""
    timestamp = data.get("timestamp", now_iso())
    formatted_date = format_timestamp(timestamp)

    greeting = data.get("greeting", "")
    one_line_summary = data.get("one_line_summary", "")
    stocks = data.get("stocks", [])
    news = data.get("news", {})
    events = data.get("events", [])
    summary = data.get("summary", {})

    feedback_digest_date = digest_date or data.get("digest_date") or today_str()
    feedback_digest_id = digest_id or data.get("digest_id")

    hi_greeting = f"Hi {first_name}" if first_name else "Hi"

    card_style = CARD_STYLE
    section_header_style = SECTION_HEADER_STYLE_GREEN

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
        subsection_style = SUBSECTION_HEADER_STYLE

        headlines_html = ""
        if headlines:
            headlines_items = ""
            for headline in headlines:
                related = ", ".join(headline.get("related_symbols", [])[:3])
                meta_parts = []
                if related:
                    meta_parts.append(related)
                if headline.get("published_at"):
                    meta_parts.append(
                        format_timestamp(headline.get("published_at", ""), compact=True)
                    )
                meta_html = (
                    f'<div style="font-size: 11px; color: #10b981; margin-bottom: 6px;">{" &middot; ".join(meta_parts)}</div>'
                    if meta_parts
                    else ""
                )
                headlines_items += f"""
                    <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                        <a href="{headline.get('url', '#')}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 4px;">{headline.get('title', '')}</a>
                        {meta_html}
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
                meta_parts = []
                if related:
                    meta_parts.append(related)
                if brief.get("published_at"):
                    meta_parts.append(
                        format_timestamp(brief.get("published_at", ""), compact=True)
                    )
                meta_html = (
                    f'<div style="font-size: 11px; color: #10b981; margin-top: 2px;">{" &middot; ".join(meta_parts)}</div>'
                    if meta_parts
                    else ""
                )
                briefs_items += f"""
                    <div style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <a href="{brief.get('url', '#')}" style="font-size: 13px; font-weight: 500; color: #18181b; text-decoration: none;">{brief.get('title', '')}</a>
                        {meta_html}
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
                {get_email_header(formatted_date, "个性化日报")}

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

                {get_feedback_section(feedback_digest_date, feedback_digest_id, "digest")}
                {get_email_footer()}
            </div>
        </body>
        </html>
        """
    return html


def format_weekly_report_html(
    data: dict,
    report_date: Optional[str] = None,
    report_id: Optional[str] = None,
) -> str:
    """Format weekly macro report data into an HTML email."""
    generated_at = data.get("generated_at", now_iso())
    formatted_date = format_timestamp(generated_at)

    title = data.get("title", "")
    verdict = data.get("verdict", "")
    signal_lights = data.get("signal_lights", {})
    landscape = data.get("landscape", "")
    narrative = data.get("narrative", "")
    takeaway = data.get("takeaway", "")
    week_ahead = data.get("week_ahead", [])

    analyses = {
        "liquidity": data.get("liquidity_analysis", {}),
        "economy": data.get("economy_analysis", {}),
        "inflation": data.get("inflation_analysis", {}),
        "sentiment": data.get("sentiment_analysis", {}),
    }

    feedback_report_date = report_date or today_str()
    feedback_report_id = report_id or data.get("id")

    report_url = f"{_FRONTEND_URL}/macro"

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

    signal_bg_map = {
        "green": {"bg": "#dcfce7", "text": "#15803d"},
        "yellow": {"bg": "#fef3c7", "text": "#92400e"},
        "red": {"bg": "#fee2e2", "text": "#991b1b"},
    }
    signal_cells = []
    for key in ["liquidity", "economy", "inflation", "sentiment"]:
        color_key = (
            signal_lights.get(key, "yellow")
            if isinstance(signal_lights, dict)
            else "yellow"
        )
        label = signal_label_map.get(color_key, "中性")
        name = signal_name_map.get(key, key)
        colors = signal_bg_map.get(color_key, signal_bg_map["yellow"])
        signal_cells.append(
            f"""
                <td style="width: 25%; padding: 6px 4px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 600; color: #52525b; margin-bottom: 6px;">{name}</div>
                    <div style="display: inline-block; padding: 3px 10px; border-radius: 10px; background: {colors['bg']}; color: {colors['text']}; font-size: 11px; font-weight: 600;">{label}</div>
                </td>
            """
        )

    signal_lights_html = f"""
        <table style="width: 100%; border-collapse: separate; border-spacing: 0;" cellpadding="0" cellspacing="0">
            <tr>{signal_cells[0]}{signal_cells[1]}{signal_cells[2]}{signal_cells[3]}</tr>
        </table>
        """

    card_style = CARD_STYLE
    section_header_style = SECTION_HEADER_STYLE

    # Market Performance card
    market_perf_html = ""
    raw_data = data.get("raw_data") or {}
    market_perf = raw_data.get("market_performance") or {}
    indices = market_perf.get("indices", [])

    if indices:
        indicator_labels = {
            "^GSPC": "标普500",
            "^IXIC": "纳斯达克",
            "^VIX": "恐慌指数",
            "GC=F": "黄金",
            "DX-Y.NYB": "美元指数",
            "^TNX": "十年美债",
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
            indicator_cells.append(
                f"""
                    <td style="width: 33.33%; padding: 4px;">
                        <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                            <div style="font-size: 10px; color: #71717a; letter-spacing: 0.05em; margin-bottom: 4px;">{label}</div>
                            <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{last_str}</div>
                            <div style="font-size: 12px; font-weight: 600; color: {color}; margin-top: 2px;">{change_str}</div>
                        </div>
                    </td>
                """
            )

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

    # Landscape section
    landscape_html = ""
    if landscape:
        landscape_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">宏观格局</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {format_markdown_to_html(landscape)}
                </div>
            </div>
            """

    # Narrative section
    narrative_html = ""
    if narrative:
        narrative_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">本周回顾</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {format_markdown_to_html(narrative)}
                </div>
            </div>
            """

    # Takeaway section
    takeaway_html = ""
    if takeaway:
        takeaway_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">策略启示</div>
                <div style="font-size: 14px; color: #3f3f46; line-height: 1.85;">
                    {format_markdown_to_html(takeaway)}
                </div>
            </div>
            """

    # Four-dimension deep dive section
    four_dims_html = ""
    dim_keys = ["liquidity", "economy", "inflation", "sentiment"]
    dim_names = {
        "liquidity": "流动性",
        "economy": "经济",
        "inflation": "通胀",
        "sentiment": "情绪",
    }
    dim_links = {
        "liquidity": f"{_FRONTEND_URL}/macro/liquidity",
        "economy": f"{_FRONTEND_URL}/macro/economy",
        "inflation": f"{_FRONTEND_URL}/macro/inflation-rates",
        "sentiment": f"{_FRONTEND_URL}/macro/sentiment",
    }
    dim_items = []
    for key in dim_keys:
        analysis = analyses.get(key, {})
        if not isinstance(analysis, dict):
            continue
        dim_summary = analysis.get("summary", "")
        data_changes = analysis.get("data_changes", "")
        if not dim_summary and not data_changes:
            continue
        color_key = (
            signal_lights.get(key, "yellow")
            if isinstance(signal_lights, dict)
            else "yellow"
        )
        dot_color = signal_color_map.get(color_key, "#eab308")
        label = signal_label_map.get(color_key, "中性")
        colors = signal_bg_map.get(color_key, signal_bg_map["yellow"])
        link = dim_links.get(key, report_url)
        summary_dim_html = ""
        if dim_summary:
            summary_dim_html = f'<p style="font-size: 13px; color: #3f3f46; line-height: 1.6; margin: 0 0 10px 0; font-weight: 500;">{dim_summary}</p>'
        data_html = ""
        if data_changes:
            data_html = f"""
                <div style="font-size: 12.5px; color: #52525b; line-height: 1.75;">
                    {format_markdown_to_html(data_changes)}
                </div>
                """
        dim_items.append(
            f"""
            <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 18px; margin-bottom: 12px;">
                <a href="{link}" style="text-decoration: none; display: block; margin-bottom: 10px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: {dot_color}; margin-right: 8px; vertical-align: middle;"></span>
                    <span style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-right: 8px; vertical-align: middle;">{dim_names.get(key, key)}</span>
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 8px; background: {colors['bg']}; color: {colors['text']}; font-size: 10px; font-weight: 600; vertical-align: middle;">{label}</span>
                    <span style="font-size: 11px; color: #059669; margin-left: 4px; vertical-align: middle;">&rarr;</span>
                </a>
                {summary_dim_html}
                {data_html}
            </div>
            """
        )
    if dim_items:
        four_dims_html = f"""
            <div style="margin-bottom: 16px;">
                <div style="{section_header_style}">四维解读</div>
                {''.join(dim_items)}
            </div>
            """

    # Week ahead
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
                {get_email_header(formatted_date, "Macro Weekly")}

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

                {get_feedback_section(feedback_report_date, feedback_report_id, "weekly")}
                {get_email_footer()}
            </div>
        </body>
        </html>
        """
    return html


def format_welcome_html(first_name: str = "") -> str:
    """Format welcome email HTML for new subscribers."""
    greeting = f"Hi {first_name}，" if first_name else "Hi，"
    formatted_date = now_pacific().strftime("%B %d, %Y")

    card_style = CARD_STYLE_WIDE
    section_header_style = SECTION_HEADER_STYLE_GREEN

    html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {get_email_header(formatted_date, "Welcome")}

                <!-- Welcome Card -->
                <div style="background: #ffffff; padding: 32px 24px;">
                    <h1 style="color: #0a0a0a; font-size: 24px; font-weight: 600; margin: 0 0 20px 0;">
                        {greeting}欢迎加入 TheMarketBrew！
                    </h1>

                    <!-- Personal story -->
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 12px 0;">
                        我是 Golden，一个在硅谷写代码的程序员，也投了十多年美股。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 12px 0;">
                        我做 TheMarketBrew，是因为我自己也被同样的问题困扰过：信息太多、太分散，每天花大量时间刷新闻，却还是不知道市场在发生什么、跟我的持仓有什么关系。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 28px 0;">
                        TheMarketBrew 让 AI 做那些耗时又重复的工作——筛信息、读财报、追宏观——把清晰的结论直接呈现给你。以下是你现在可以用到的全部功能：
                    </p>

                    <!-- Section 1: Daily flow -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            每日市场情报
                        </div>
                        <table style="width: 100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#9728;&#65039;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">盘前早报</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        开盘前 5 分钟速读：美股期货、全球市场、今日关键新闻。带着判断进场，不再盲目跟风开盘波动。
                                    </p>
                                    <a href="{_FRONTEND_URL}/morning" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        查看今日早报
                                    </a>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding: 0;"><div style="border-top: 1px solid #f4f4f5;"></div></td></tr>
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#127761;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">收盘日报</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        每个交易日收盘后自动发送（美东 ~6pm / 北京时间次日早 7am）。今天发生了什么、为什么、明天值得关注什么——AI 整理好了，你直接读结论。
                                    </p>
                                    <a href="{_FRONTEND_URL}/today" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        查看最新日报
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Section 2: Deep tools -->
                    <div style="{card_style}">
                        <div style="{section_header_style}">
                            深度分析工具
                        </div>
                        <table style="width: 100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#128203;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">个性化摘要</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        把你的自选股加进来，AI 每天只给你看真正跟你持仓相关的新闻和分析。市场有 5000 只股票，但你只需要关注你买的那几只。
                                    </p>
                                    <a href="{_FRONTEND_URL}/for-you" style="display: inline-block; padding: 7px 14px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        设置我的自选股
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
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        搜索任意美股，AI 帮你整理基本面、财务健康度、估值区间和近期催化剂。看财报不再需要从头啃原文。
                                    </p>
                                    <a href="{_FRONTEND_URL}/stock" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        分析一只股票
                                    </a>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding: 0;"><div style="border-top: 1px solid #f4f4f5;"></div></td></tr>
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#127758;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 4px 0;">宏观仪表盘</p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        流动性、通胀、经济、情绪四个维度，信号灯一眼判断大盘底层环境。不再被单一数据带跑，看懂驱动市场的真正变量。
                                    </p>
                                    <a href="{_FRONTEND_URL}/macro" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        查看宏观仪表盘
                                    </a>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding: 0;"><div style="border-top: 1px solid #f4f4f5;"></div></td></tr>
                            <tr>
                                <td style="padding: 12px 0; vertical-align: top; width: 36px;">
                                    <span style="font-size: 20px;">&#129302;</span>
                                </td>
                                <td style="padding: 12px 0;">
                                    <p style="color: #0a0a0a; font-size: 14px; font-weight: 500; margin: 0 0 2px 0;">
                                        AI 投研助手
                                        <span style="display: inline-block; margin-left: 6px; padding: 2px 7px; background: #ecfdf5; color: #059669; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;">Pro</span>
                                    </p>
                                    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 10px 0;">
                                        用自然语言描述你的选股标准，AI 从全市场帮你筛候选。"找盈利增速超过 20%、负债率低的科技股"——说出来就有结果。
                                    </p>
                                    <a href="{_FRONTEND_URL}/research" style="display: inline-block; padding: 7px 14px; border: 1px solid #d4d4d8; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                                        试试 AI 选股
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
                            扫码加入 TheMarketBrew 微信交流群，和其他投资者一起交流市场观点、分享持仓思路。
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                            <tr>
                                <td width="50%" style="padding: 0 6px 0 0; text-align: center; vertical-align: top;">
                                    <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr-0405.jpg"
                                         alt="TheMarketBrew WeChat Group QR Code"
                                         style="width: 100%; max-width: 240px; border-radius: 8px; border: 1px solid #e4e4e7;"
                                    />
                                    <p style="color: #3f3f46; font-size: 12px; margin: 8px 0 0 0;">微信扫码加入社群</p>
                                </td>
                                <td width="50%" style="padding: 0 0 0 6px; text-align: center; vertical-align: top;">
                                    <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-personal-qr.jpg"
                                         alt="Add WeChat Personal Contact"
                                         style="width: 100%; max-width: 240px; border-radius: 8px; border: 1px solid #e4e4e7;"
                                    />
                                    <p style="color: #3f3f46; font-size: 12px; margin: 8px 0 0 0;">群满或过期？加我拉你入群</p>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 24px 0 0 0;">
                        有任何问题或建议，欢迎直接回复这封邮件，我会亲自看每一封。
                    </p>
                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                        祝投资顺利！<br>
                        <span style="color: #0a0a0a; font-weight: 500;">Golden / 金黄</span><br>
                        <span style="color: #a1a1aa; font-size: 13px;">独立开发者 / 十年美股散户</span>
                    </p>
                </div>

                {get_email_footer()}
            </div>
        </body>
        </html>
        """
    return html


def format_verification_email_html(
    verification_code: str,
    verify_url: str,
    recipient_email: str = "",
) -> str:
    """Format verification email HTML using the shared TheMarketBrew email style."""
    formatted_date = now_pacific().strftime("%B %d, %Y")
    intro_line = "我们收到了一次 TheMarketBrew 账户注册请求，验证邮箱后即可开始使用。"
    email_line = (
        f"验证对象：<strong>{recipient_email}</strong>"
        if recipient_email
        else "验证完成后，你就可以开始使用 TheMarketBrew。"
    )

    html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {get_email_header(formatted_date, "Verify Email")}

                <div style="background: #ffffff; padding: 32px 24px;">
                    <div style="display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 999px; padding: 6px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px;">
                        ACCOUNT SECURITY
                    </div>

                    <h1 style="color: #0a0a0a; font-size: 24px; font-weight: 600; margin: 0 0 12px 0;">
                        完成邮箱验证，激活你的账户
                    </h1>

                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 10px 0;">
                        {intro_line}
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 28px 0;">
                        {email_line}
                    </p>

                    <div style="{CARD_STYLE_WIDE}">
                        <div style="{SECTION_HEADER_STYLE_GREEN}">
                            你的验证码
                        </div>
                        <p style="color: #71717a; font-size: 13px; line-height: 1.7; margin: 0 0 16px 0;">
                            在注册页面输入下面的 6 位验证码。验证码短时间内有效，请尽快完成验证。
                        </p>
                        <div style="text-align: center; margin: 0 0 18px 0;">
                            <div style="display: inline-block; padding: 14px 22px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 10px; font-size: 32px; line-height: 1; font-weight: 700; color: #0a0a0a; letter-spacing: 0.35em; text-indent: 0.35em;">
                                {verification_code}
                            </div>
                        </div>
                        <p style="color: #71717a; font-size: 12px; line-height: 1.7; margin: 0; text-align: center;">
                            如果你是在手机上注册，也可以点击下方按钮直接完成验证。
                        </p>
                    </div>

                    <div style="{CARD_STYLE}">
                        <div style="{SECTION_HEADER_STYLE}">
                            继续验证
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0 0 18px 0;">
                            点击后会回到 TheMarketBrew，自动完成邮箱验证并进入产品。
                        </p>
                        <div style="text-align: center;">
                            <a href="{verify_url}" style="display: inline-block; padding: 12px 26px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                                验证并进入 TheMarketBrew
                            </a>
                        </div>
                    </div>

                    <div style="{CARD_STYLE}">
                        <div style="{SECTION_HEADER_STYLE}">
                            没有发起这个操作?
                        </div>
                        <p style="color: #3f3f46; font-size: 14px; line-height: 1.7; margin: 0;">
                            如果这不是你本人操作，可以直接忽略这封邮件。只有拿到验证码或点击验证链接的人，才能完成账户激活。
                        </p>
                    </div>
                </div>

                {get_email_footer(None)}
            </div>
        </body>
        </html>
        """
    return html


def format_newsletter_plaintext(data: dict) -> str:
    """Format newsletter data into plain text for maximum deliverability."""
    greeting = data.get("greeting", "")
    sections = data.get("sections", [])
    closing = data.get("closing", "")
    sign_off_name = data.get("sign_off_name", "Golden / 金黄")
    sign_off_title = data.get("sign_off_title", "独立开发者 / 十年美股散户")

    def _clean_markdown(text: str) -> str:
        """Strip markdown syntax for plain text."""
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1: \2", text)
        return text.rstrip()

    paragraphs = []
    paragraphs.append("Hi {{{first_name}}},")

    if greeting:
        paragraphs.append(_clean_markdown(greeting))

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

    if closing:
        paragraphs.append(_clean_markdown(closing))

    paragraphs.append(sign_off_name + "\n" + sign_off_title)

    return "\n\n".join(paragraphs)


def format_morning_report_html(
    data: dict, report_date: str, report_id: Optional[str] = None
) -> str:
    """Generate the morning report HTML email template."""
    formatted_date = format_timestamp(data.get("timestamp", ""))
    title = data.get("title", "Morning Brief")
    market_pulse = data.get("market_pulse", "")
    futures = data.get("futures", [])
    futures_analysis = data.get("futures_analysis", "")
    global_markets = data.get("global_markets", {})
    global_markets_analysis = data.get("global_markets_analysis", "")
    overnight_news = data.get("overnight_news", [])
    today_focus = data.get("today_focus", [])
    summary = data.get("summary", [])

    name_zh = {
        "Nikkei 225": "日经225",
        "Hang Seng": "恒生指数",
        "Shanghai Composite": "上证综指",
        "DAX": "DAX (德国)",
        "FTSE 100": "富时100 (英国)",
        "Gold": "黄金",
        "Crude Oil": "原油",
        "US Dollar": "美元指数",
        "VIX": "VIX 恐慌指数",
        "BTC": "比特币",
    }
    region_zh = {"asia": "亚太", "europe": "欧洲", "other": "其他"}
    summary_titles_zh = {"overnight_review": "隔夜回顾", "today_outlook": "今日展望"}

    report_url = ""
    if report_id:
        report_url = f"{_FRONTEND_URL}/morning/{report_id}"

    card_style = CARD_STYLE
    section_header_style = SECTION_HEADER_STYLE
    subsection_style = SUBSECTION_HEADER_STYLE
    analysis_box_style = ANALYSIS_BOX_STYLE

    # Header
    header = get_email_header(formatted_date, title="TheMarketBrew 早报")

    # Title Card
    title_section = f"""
        <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
            <p style="color: #52525b; font-size: 16px; margin: 0 0 12px 0; line-height: 1.5;">
                Hi {{{{{{first_name}}}}}}
            </p>
            <p style="color: #71717a; font-size: 13px; margin: 0 0 20px 0; line-height: 1.6;">
                新的一天，为你准备了今日的盘前简报，一起看看发生了什么吧。
            </p>
            {f'<a href="{report_url}" style="text-decoration: none;"><h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{title}</h1></a>' if report_url else f'<h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{title}</h1>'}
            {f'<p style="color: #71717a; font-size: 14px; margin: 0; line-height: 1.6;">{market_pulse}</p>' if market_pulse else ''}
        </div>
        """

    # Futures Card
    futures_html = ""
    if futures:
        futures_cells = ""
        for f in futures[:3]:
            name = f.get("name", "")
            display_name = (
                name.replace(" Futures", "")
                .replace("S&P 500", "S&P")
                .replace("Nasdaq", "NQ")
                .replace("Dow", "DOW")
            )
            value = f.get("value", 0)
            change = f.get("daily_change", 0)
            color = format_change_color(change)
            change_text = format_change_text(change)
            futures_cells += f"""
                <td style="vertical-align: top; width: 33.33%;">
                    <div style="background: #f8f8f8; border-radius: 6px; padding: 12px 8px; text-align: center;">
                        <div style="font-size: 10px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">{display_name}</div>
                        <div style="font-size: 17px; font-weight: 600; color: #0a0a0a;">{value:,.0f}</div>
                        <div style="font-size: 11px; font-weight: 600; color: {color}; margin-top: 2px;">{change_text}</div>
                    </div>
                </td>
                """
        futures_analysis_html = ""
        if futures_analysis:
            futures_analysis_html = (
                f'<div style="{analysis_box_style}">{futures_analysis}</div>'
            )
        futures_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">美股期货</div>
                <table style="width: 100%; border-collapse: separate; border-spacing: 6px;" cellpadding="0" cellspacing="0">
                    <tr>{futures_cells}</tr>
                </table>
                {futures_analysis_html}
            </div>
            """

    # Global Markets Card
    def _build_market_rows(items, region_key):
        if not items:
            return ""
        group_label = region_zh.get(region_key, region_key)
        rows = ""
        for item in items:
            raw_name = item.get("name", "")
            display_name = name_zh.get(raw_name, raw_name)
            value = item.get("value", 0)
            change = item.get("daily_change", 0)
            color = format_change_color(change)
            change_text = format_change_text(change)
            val_str = f"{value:,.0f}" if value > 1000 else f"{value:,.2f}"
            rows += f"""
                <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #3f3f46;">{display_name}</td>
                    <td style="padding: 6px 0; font-size: 13px; color: #0a0a0a; text-align: right; font-weight: 500;">{val_str}</td>
                    <td style="padding: 6px 0; font-size: 13px; color: {color}; text-align: right; font-weight: 600; width: 80px;">{change_text}</td>
                </tr>
                """
        return f"""
            <div style="margin-bottom: 14px;">
                <div style="{subsection_style} border-bottom: 1px solid #e8e8e8; padding-bottom: 4px;">{group_label}</div>
                <table style="width: 100%;" cellpadding="0" cellspacing="0">{rows}</table>
            </div>
            """

    asia_items = global_markets.get("asia", [])
    europe_items = global_markets.get("europe", [])
    other_items = global_markets.get("other", [])

    global_html = ""
    markets_content = (
        _build_market_rows(asia_items, "asia")
        + _build_market_rows(europe_items, "europe")
        + _build_market_rows(other_items, "other")
    )
    if markets_content:
        gm_analysis_html = ""
        if global_markets_analysis:
            gm_analysis_html = (
                f'<div style="{analysis_box_style}">{global_markets_analysis}</div>'
            )
        global_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">全球市场</div>
                {markets_content}
                {gm_analysis_html}
            </div>
            """

    # Overnight News Card
    news_html = ""
    if overnight_news:
        news_items = ""
        for n in overnight_news:
            n_title = n.get("title", "")
            n_analysis = n.get("analysis", "")
            n_url = n.get("url", "")
            timestamp_html = render_timestamp_meta(n.get("published_at", ""))
            title_html = (
                f'<a href="{n_url}" style="font-size: 14px; font-weight: 600; color: #0a0a0a; text-decoration: none; display: block; margin-bottom: 6px;">{n_title}</a>'
                if n_url
                else f'<div style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-bottom: 6px;">{n_title}</div>'
            )
            news_items += f"""
                <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                    {title_html}
                    {timestamp_html}
                    <div style="font-size: 12px; color: #52525b; background: #f8f8f8; padding: 10px 12px; border-radius: 4px; line-height: 1.6;">{n_analysis}</div>
                </div>
                """
        news_html = f"""
            <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                <div style="{section_header_style}">隔夜要闻</div>
                {news_items}
            </div>
            """

    # Today Focus Card
    focus_html = ""
    if today_focus:
        focus_items = ""
        for f in today_focus:
            f_title = f.get("title", "")
            f_analysis = f.get("analysis", "")
            f_time = f.get("time", "")
            time_badge = (
                f'<span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 3px; margin-right: 6px; vertical-align: middle;">{f_time}</span>'
                if f_time
                else ""
            )
            focus_items += f"""
                <div style="padding: 14px 0; border-bottom: 1px solid #e8e8e8;">
                    <div style="font-size: 14px; line-height: 1.4; margin-bottom: 6px;">
                        {time_badge}<span style="font-weight: 600; color: #0a0a0a;">{f_title}</span>
                    </div>
                    <div style="font-size: 13px; color: #52525b; line-height: 1.6;">{f_analysis}</div>
                </div>
                """
        focus_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">今日焦点</div>
                {focus_items}
            </div>
            """

    # Summary Card
    summary_html = ""
    if summary:
        subsections_html = ""
        for s in summary:
            s_title = s.get("title", "")
            s_content = s.get("content", "")
            display_title = summary_titles_zh.get(s_title, s_title)
            paragraphs = s_content.replace("\\n", "\n").split("\n\n")
            content_html = "".join(
                f'<p style="margin: 0 0 10px 0; font-size: 13px; color: #3f3f46; line-height: 1.85;">{p.strip()}</p>'
                for p in paragraphs
                if p.strip()
            )
            subsections_html += f"""
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: #0a0a0a; margin-bottom: 8px;">{display_title}</div>
                    {content_html}
                </div>
                """
        summary_html = f"""
            <div style="{card_style}">
                <div style="{section_header_style}">总结与展望</div>
                {subsections_html}
            </div>
            """

    # Read online link
    read_online = ""
    if report_id:
        read_url = f"{_FRONTEND_URL}/morning/{report_id}"
        read_online = f"""
            <div style="padding: 0 16px 16px; text-align: center;">
                <a href="{read_url}" style="display: inline-block; padding: 10px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">
                    在线阅读完整报告
                </a>
            </div>
            """

    # Feedback + Footer
    feedback = get_feedback_section(
        report_date=report_date,
        report_id=report_id,
        report_type="morning",
    )
    footer = get_email_footer()

    return f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {header}
                {title_section}

                <!-- Content Area -->
                <div style="background: #f0f0f0; padding: 16px;">
                    {futures_html}
                    {global_html}
                    {news_html}
                    {focus_html}
                    {summary_html}
                    {read_online}
                </div>

                {feedback}
                {get_digest_cta_section()}
                {footer}
            </div>
        </body>
        </html>
        """
