"""
Pure-function email templates for HTML rendering.

Every function is stateless -- no class instance required.  Module-level
constants replace the old ``self.frontend_url`` / ``self.logo_url``.
"""

import re
from datetime import datetime
from typing import Literal, Optional

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
# All user-visible CTA links in emails must point to the production domain,
# regardless of the environment rendering the template. Dev/staging previews
# should still link to production so recipients never land on localhost.
_EMAIL_LINK_BASE: str = "https://themarketbrew.com"


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
    feedback_frontend_url = _EMAIL_LINK_BASE

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


DailyCtaVariant = Literal["upsell", "paid"]
PersonalDigestCtaVariant = Literal["upsell", "paid"]


def _get_paid_digest_cta_section() -> str:
    """Thank-you CTA for paying users at the bottom of the daily report."""
    for_you_url = f"{_EMAIL_LINK_BASE}/for-you"
    stock_url = f"{_EMAIL_LINK_BASE}/stock"
    return f"""
        <style>
            @media only screen and (max-width: 540px) {{
                .tmb-paid-cta-card {{
                    max-width: 100% !important;
                    margin: 0 0 12px !important;
                }}
            }}
        </style>
        <div style="background: #ffffff; padding: 28px 20px 32px; border-top: 1px solid #e4e4e7;">
            <div style="text-align: center; margin-bottom: 22px;">
                <div style="font-size: 11px; font-weight: 600; color: #047857; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">感谢订阅</div>
                <div style="font-size: 16px; color: #0a0a0a; font-weight: 600;">你的会员权益已经开通</div>
            </div>
            <div style="font-size: 0; line-height: 0; text-align: center;">
                <div class="tmb-paid-cta-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #ecfdf5; border: 2px solid #047857; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div style="font-size: 10px; font-weight: 700; color: #047857; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">For You</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; line-height: 1.4; margin-bottom: 10px;">
                            查看你的专属持仓日报
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.75; margin-bottom: 16px;">
                            每天追踪你自选股里的新闻、财报日程和关键变化，不再只看大盘摘要。
                        </div>
                        <a href="{for_you_url}" style="display: block; padding: 11px 20px; background-color: #047857; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #047857; text-align: center;">
                            打开 For You &rarr;
                        </a>
                    </div>
                </div>
                <div class="tmb-paid-cta-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div style="font-size: 10px; font-weight: 700; color: #b45309; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Research</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; line-height: 1.4; margin-bottom: 10px;">
                            深度研究一只股票
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.75; margin-bottom: 16px;">
                            用 AI 投研引擎生成基本面、技术面和估值分析，快速整理你的投资判断。
                        </div>
                        <a href="{stock_url}" style="display: block; padding: 11px 20px; background-color: #b45309; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #b45309; text-align: center;">
                            打开个股研究 &rarr;
                        </a>
                    </div>
                </div>
            </div>
        </div>
        """


def get_digest_cta_section(variant: DailyCtaVariant = "upsell") -> str:
    """Pain-point driven Pro vs Max CTA at the bottom of the free daily report.

    The only promotional surface in the email — no mid-email banners —
    so this block carries the full conversion load. Each tier opens with
    a reflective question ("没看到你持仓的股票?" / "想深度研究一只股票?")
    that maps a specific reader frustration onto a specific feature.
    Readers self-diagnose and click the card that matches their pain.

    Layout / responsiveness (fluid hybrid)
    --------------------------------------
    * Wide viewports (>= 560px): two 272px inline-block cards side-by-side.
    * Narrow viewports (< 540px): embedded media query overrides the
      inline ``max-width: 272px`` with ``100% !important`` so each card
      stretches full-width and the second card wraps to a new line.
    * ``font-size: 0`` outer wrapper kills inter-inline-block whitespace.
    * MSO conditional-comment ``<table>`` fallback for Outlook 2007-2019.

    Card structure (both tiers)
    ---------------------------
    1. Recommended badge (Pro) or spacer div (Max) — keeps optical
       alignment between the two tier labels on desktop; the spacer is
       hidden on mobile since stacked cards no longer need alignment.
    2. Tier label (PRO / MAX).
    3. Pain-point headline — 15px bold, the question the reader is
       silently asking right now.
    4. Solution description — 12px, names the exact feature that answers
       the question, with the feature name bolded in a darker brand tone.
    5. Price — 22px 700 weight as the typographic anchor.
    6. Subscribe button — full-width, brand-colored.
    7. Dashed divider — separates the primary offer from the bonus list.
    8. "以及：…" footnote — 11px muted list of additional included
       features, framed as bonus value on top of the main offer.

    Visual hierarchy / color
    ------------------------
    * Max is the RECOMMENDED tier (left position): amber-700 border
      (2px), amber "推荐" badge. Dominant.
    * Pro is the entry tier (right position): emerald-200 border (1px),
      no badge, emerald-700 accent. Secondary but visually distinct.
    * Tier color identity is preserved (Pro=emerald, Max=amber); only
      the visual prominence (border weight + badge) marks which tier
      we are recommending.
    * All text meets WCAG AA: dark brand tones (emerald-800 ``#065f46``
      / amber-900 ``#78350f``) for feature emphasis in descriptions,
      neutral-600 ``#52525b`` for body copy.
    """
    if variant == "paid":
        return _get_paid_digest_cta_section()

    pro_url = f"{_EMAIL_LINK_BASE}/pricing"
    max_url = f"{_EMAIL_LINK_BASE}/pricing"
    return f"""
        <style>
            @media only screen and (max-width: 540px) {{
                .tmb-tier-card {{
                    max-width: 100% !important;
                    margin: 0 0 12px !important;
                }}
                /* Hide the Pro card's badge-row spacer on mobile:
                   cards stack vertically so we no longer need to
                   optically align the "Pro" label with Max's "Max" label. */
                .tmb-tier-spacer {{
                    display: none !important;
                    height: 0 !important;
                    margin: 0 !important;
                }}
            }}
        </style>
        <div style="background: #ffffff; padding: 28px 20px 32px; border-top: 1px solid #e4e4e7;">
            <div style="text-align: center; margin-bottom: 22px;">
                <div style="font-size: 11px; font-weight: 600; color: #71717a; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">升级订阅</div>
                <div style="font-size: 16px; color: #0a0a0a; font-weight: 600;">解锁更多 · 找到最适合你的方案</div>
            </div>
            <!--[if mso]>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="560" style="width:560px;">
            <tr>
            <td valign="top" width="272" style="padding:0 4px;">
            <![endif]-->
            <div style="font-size: 0; line-height: 0; text-align: center;">
                <!-- Max card (RECOMMENDED) -->
                <div class="tmb-tier-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #fffbeb; border: 2px solid #b45309; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div style="display: inline-block; background: #b45309; color: #ffffff; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; margin-bottom: 12px;">推荐</div>
                        <div style="font-size: 10px; font-weight: 700; color: #b45309; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Max</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.01em; line-height: 1.4; margin-bottom: 10px;">
                            想深度研究一只股票?
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.75; margin-bottom: 16px;">
                            Max 独享 <strong style="color: #78350f; font-weight: 600;">AI 投研引擎</strong>，一键生成基本面、技术面、估值深度分析。
                        </div>
                        <div style="margin-bottom: 14px; line-height: 1;">
                            <span style="font-size: 22px; font-weight: 700; color: #0a0a0a; letter-spacing: -0.02em;">$9.99</span>
                            <span style="font-size: 11px; color: #52525b; font-weight: 500;">&nbsp;/月 早鸟价</span>
                        </div>
                        <a href="{max_url}" style="display: block; padding: 11px 20px; background-color: #b45309; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #b45309; text-align: center; margin-bottom: 16px;">
                            订阅 Max &rarr;
                        </a>
                        <div style="border-top: 1px dashed #fcd34d; padding-top: 12px;">
                            <div style="font-size: 11px; color: #52525b; line-height: 1.7;">
                                <span style="color: #71717a;">以及&nbsp;</span>Pro 全部功能 &middot; AI 深度个股分析 &middot; 宏观仪表盘
                            </div>
                        </div>
                    </div>
                </div>
                <!--[if mso]></td><td valign="top" width="272" style="padding:0 4px;"><![endif]-->
                <!-- Pro card -->
                <div class="tmb-tier-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div class="tmb-tier-spacer" style="height: 18px; margin-bottom: 12px; line-height: 0; font-size: 0;"><!-- spacer to align "Pro" label with Max's "Max" label (matches 18px badge + 12px margin) --></div>
                        <div style="font-size: 10px; font-weight: 700; color: #047857; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Pro</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.01em; line-height: 1.4; margin-bottom: 10px;">
                            没看到你持仓的股票?
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.75; margin-bottom: 16px;">
                            Pro 会员每天多收到一份<strong style="color: #065f46; font-weight: 600;">专属持仓日报</strong>，只分析你自选股里的股票。
                        </div>
                        <div style="margin-bottom: 14px; line-height: 1;">
                            <span style="font-size: 22px; font-weight: 700; color: #0a0a0a; letter-spacing: -0.02em;">$4.99</span>
                            <span style="font-size: 11px; color: #52525b; font-weight: 500;">&nbsp;/月 早鸟价</span>
                        </div>
                        <a href="{pro_url}" style="display: block; padding: 11px 20px; background-color: #047857; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #047857; text-align: center; margin-bottom: 16px;">
                            订阅 Pro &rarr;
                        </a>
                        <div style="border-top: 1px dashed #a7f3d0; padding-top: 12px;">
                            <div style="font-size: 11px; color: #52525b; line-height: 1.7;">
                                <span style="color: #71717a;">以及&nbsp;</span>盘前早报 &middot; 宏观周报 &middot; 自选股 25 只
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!--[if mso]>
            </td>
            </tr>
            </table>
            <![endif]-->
        </div>
        """


def _get_personal_digest_upsell_cta() -> str:
    """Upsell CTA for trial / free readers of the personal digest.

    Aspirational framing — never tells the reader the version they're
    looking at is "simplified" or "degraded" (that destroys retention),
    only points up to a deeper version they could unlock.

    Max is the recommended tier (amber 2px, 推荐 badge). It bundles the
    digest upgrades with the AI research engine — positioned as the
    "complete analysis workflow" so it feels like the natural pick over
    just-upgrading-the-digest.

    Card copy avoids:
    - Specific model names (today Gemini, tomorrow something else)
    - Watchlist size (same 25 across tiers, so not a differentiator)
    - 盘前早报 / 宏观周报 (separate products with their own CTAs)
    Instead anchors on the four upgrades the reader actually wants:
    更高级的模型 · 更深度的推理 · 持仓监控 · 事件提醒.
    """
    pro_url = f"{_EMAIL_LINK_BASE}/pricing"
    max_url = f"{_EMAIL_LINK_BASE}/pricing"
    return f"""
        <style>
            @media only screen and (max-width: 540px) {{
                .tmb-tier-card {{
                    max-width: 100% !important;
                    margin: 0 0 12px !important;
                }}
                .tmb-tier-spacer {{
                    display: none !important;
                    height: 0 !important;
                    margin: 0 !important;
                }}
            }}
        </style>
        <div style="background: #ffffff; padding: 28px 20px 32px; border-top: 1px solid #e4e4e7;">
            <div style="text-align: center; margin-bottom: 22px;">
                <div style="font-size: 11px; font-weight: 600; color: #71717a; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">升级订阅</div>
                <div style="font-size: 17px; color: #0a0a0a; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 8px;">想看更深度的每日分析?</div>
                <div style="font-size: 12px; color: #52525b; line-height: 1.6;">更高级的模型 &middot; 更深度的推理 &middot; 持仓监控 &middot; 事件提醒</div>
            </div>
            <!--[if mso]>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="560" style="width:560px;">
            <tr>
            <td valign="top" width="272" style="padding:0 4px;">
            <![endif]-->
            <div style="font-size: 0; line-height: 0; text-align: center;">
                <!-- Max card (RECOMMENDED) -->
                <div class="tmb-tier-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #fffbeb; border: 2px solid #b45309; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div style="display: inline-block; background: #b45309; color: #ffffff; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; margin-bottom: 12px;">推荐</div>
                        <div style="font-size: 10px; font-weight: 700; color: #b45309; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Max</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.01em; line-height: 1.4; margin-bottom: 12px;">
                            完整的 AI 投资分析工作流
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.85; margin-bottom: 16px;">
                            <div style="margin-bottom: 4px;"><span style="color: #b45309; font-weight: 700;">&bull;</span>&nbsp;<strong style="color: #78350f; font-weight: 600;">更高级的模型</strong>生成更深度的每日分析</div>
                            <div style="margin-bottom: 4px;"><span style="color: #b45309; font-weight: 700;">&bull;</span>&nbsp;持仓监控 &amp; 个股事件提醒</div>
                            <div><span style="color: #b45309; font-weight: 700;">&bull;</span>&nbsp;<strong style="color: #78350f; font-weight: 600;">AI 投研引擎</strong> — 自己研究任意一只股票</div>
                        </div>
                        <div style="margin-bottom: 14px; line-height: 1;">
                            <span style="font-size: 22px; font-weight: 700; color: #0a0a0a; letter-spacing: -0.02em;">$9.99</span>
                            <span style="font-size: 11px; color: #52525b; font-weight: 500;">&nbsp;/月 早鸟价</span>
                        </div>
                        <a href="{max_url}" style="display: block; padding: 11px 20px; background-color: #b45309; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #b45309; text-align: center;">
                            升级 Max &rarr;
                        </a>
                    </div>
                </div>
                <!--[if mso]></td><td valign="top" width="272" style="padding:0 4px;"><![endif]-->
                <!-- Pro card (secondary) -->
                <div class="tmb-tier-card" style="display: inline-block; width: 100%; max-width: 272px; vertical-align: top; text-align: left; margin: 0 4px 12px; box-sizing: border-box;">
                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 22px 18px; font-size: 14px; line-height: normal;">
                        <div class="tmb-tier-spacer" style="height: 18px; margin-bottom: 12px; line-height: 0; font-size: 0;"><!-- desktop spacer to align Pro label with Max's badge row --></div>
                        <div style="font-size: 10px; font-weight: 700; color: #047857; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Pro</div>
                        <div style="font-size: 15px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.01em; line-height: 1.4; margin-bottom: 12px;">
                            只升级每日日报
                        </div>
                        <div style="font-size: 12px; color: #3f3f46; line-height: 1.75; margin-bottom: 16px;">
                            升级到<strong style="color: #065f46; font-weight: 600;">更高级的模型</strong>，更深度的推理与持仓事件分析。
                        </div>
                        <div style="margin-bottom: 14px; line-height: 1;">
                            <span style="font-size: 22px; font-weight: 700; color: #0a0a0a; letter-spacing: -0.02em;">$4.99</span>
                            <span style="font-size: 11px; color: #52525b; font-weight: 500;">&nbsp;/月 早鸟价</span>
                        </div>
                        <a href="{pro_url}" style="display: block; padding: 11px 20px; background-color: #047857; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; border: 2px solid #047857; text-align: center;">
                            升级 Pro &rarr;
                        </a>
                    </div>
                </div>
            </div>
            <!--[if mso]>
            </td>
            </tr>
            </table>
            <![endif]-->
        </div>
        """


def get_personal_digest_cta_section(
    variant: PersonalDigestCtaVariant = "paid",
) -> str:
    """CTA block at the bottom of the personal digest email.

    - ``upsell``: shown to trial / free readers — Max + Pro upgrade cards.
    - ``paid``: real paying readers see no CTA (they already have access).
    """
    if variant == "paid":
        return ""
    return _get_personal_digest_upsell_cta()


# ---------------------------------------------------------------------------
# Full-page templates
# ---------------------------------------------------------------------------


def format_html_report(
    data: dict,
    report_date: Optional[str] = None,
    report_id: Optional[str] = None,
    show_conversion_hook: bool = False,
    cta_variant: DailyCtaVariant = "upsell",
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

    # Conversion hook for anonymous (non-registered) subscribers only
    conversion_hook_html = ""
    if show_conversion_hook:
        conversion_hook_html = f"""
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; text-align: center;">
                <p style="color: #166534; font-size: 14px; font-weight: 500; margin: 0 0 8px 0;">
                    想要更深入的分析？
                </p>
                <a href="{_EMAIL_LINK_BASE}/login"
                   style="color: #059669; font-size: 14px; font-weight: 600; text-decoration: none;">
                    免费注册，解锁 14 天全功能体验 &rarr;
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
                {get_email_header(formatted_date, "Daily Brief")}

                <!-- Title Card -->
                <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
                    <p style="color: #52525b; font-size: 16px; margin: 0 0 12px 0; line-height: 1.5;">
                        Hi {{{{{{FIRST_NAME}}}}}}
                    </p>
                    <p style="color: #71717a; font-size: 13px; margin: 0 0 20px 0; line-height: 1.6;">
                        新的一天，为你准备了今日的市场简报，一起看看发生了什么吧。
                    </p>
                    {f'<a href="{report_url}" style="text-decoration: none;"><h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{report_title}</h1></a>' if report_url else f'<h1 style="color: #0a0a0a; font-size: 21px; font-weight: 600; margin: 0 0 10px 0; line-height: 1.4;">{report_title}</h1>'}
                    {f'<p style="color: #71717a; font-size: 14px; margin: 0; line-height: 1.6;">{report_summary}</p>' if report_summary else ''}
                </div>

                <!-- Content Area -->
                <div style="background: #f0f0f0; padding: 16px;">
                    {f'<div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 16px;"><div style="{section_header_style}">市场概览</div>{indices_html}<div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed #d4d4d8; text-align: center;"><span style="font-size: 12px; color: #71717a;">想看你持仓的涨跌?</span> <a href="{_EMAIL_LINK_BASE}/for-you/watchlist" style="font-size: 12px; color: #047857; text-decoration: none; font-weight: 600;">添加自选股 &rarr;</a></div></div>' if indices_html else ''}
                    {intro_html}
                    {conversion_hook_html}
                    {news_html}
                    {calendar_html}
                    {outlook_html}
                </div>

                {get_feedback_section(feedback_report_date, feedback_report_id)}
                {get_digest_cta_section(cta_variant)}
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
    cta_variant: PersonalDigestCtaVariant = "paid",
) -> str:
    """Format personal digest data into an HTML email.

    ``cta_variant``:
      - ``upsell``: trial / free readers see the Max+Pro upgrade cards.
      - ``paid`` (default): real paying readers see no CTA.

    Default is ``paid`` so callers that don't pass a variant don't accidentally
    show an upsell to a real paying user. Broadcast paths classify the
    recipient via ``cta_tier.is_real_paid_sub`` and pass the right variant.
    """
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
                {get_personal_digest_cta_section(cta_variant)}
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
                        Hi {{{{{{FIRST_NAME}}}}}}
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


def format_welcome_html(first_name: str = "", email: str = "") -> str:
    """Format the unified welcome email for all new subscribers.

    Sent once — regardless of whether the subscriber already has an account.
    Warm, personal tone from the founder. Introduces the product briefly and
    gives one clear next step (register or set up watchlist).
    """
    from urllib.parse import quote

    greeting = "欢迎加入TheMarketBrew！"
    formatted_date = now_pacific().strftime("%B %d, %Y")
    register_url = (
        f"{_EMAIL_LINK_BASE}/login?email={quote(email)}&trial=true"
        if email
        else f"{_EMAIL_LINK_BASE}/login"
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
                {get_email_header(formatted_date, "Welcome")}

                <div style="background: #ffffff; padding: 32px 24px;">
                    <h1 style="color: #0a0a0a; font-size: 22px; font-weight: 600; margin: 0 0 24px 0;">
                        {greeting}
                    </h1>

                    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
                        我是 Golden，TheMarketBrew 的开发者。感谢你的订阅，从今天起你会在每个交易日收盘后收到一封 AI 整理的市场日报。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
                        做这个产品的初衷很简单——我自己炒了十多年美股，每天花一两个小时刷新闻、翻财报，信息很多，但有用的很少。后来我想，这些重复劳动能不能让 AI 来做？于是就有了 TheMarketBrew。
                    </p>
                    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 28px 0;">
                        除了每天的日报邮件，注册一个免费账号就能解锁 14 天全功能体验，简单介绍一下：
                    </p>

                    <!-- Feature list with CTAs -->
                    <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="padding: 14px 0; vertical-align: top; width: 28px;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #059669; margin-top: 6px;"></span>
                            </td>
                            <td style="padding: 14px 0; border-bottom: 1px solid #f4f4f5;">
                                <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">专属持仓日报</p>
                                <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 8px 0;">
                                    添加你关注的股票，AI 每天帮你盯着，只推送跟你有关的消息。不用再从几百条新闻里自己翻了。
                                </p>
                                <a href="{_EMAIL_LINK_BASE}/for-you/watchlist" style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 500;">设置自选股 &rarr;</a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 14px 0; vertical-align: top;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #059669; margin-top: 6px;"></span>
                            </td>
                            <td style="padding: 14px 0; border-bottom: 1px solid #f4f4f5;">
                                <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">宏观仪表盘</p>
                                <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 8px 0;">
                                    流动性、经济、通胀、情绪四盏信号灯。不用自己追美联储声明和 CPI 数据了，看一眼就知道大环境是偏多还是偏空。
                                </p>
                                <a href="{_EMAIL_LINK_BASE}/macro" style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 500;">查看仪表盘 &rarr;</a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 14px 0; vertical-align: top;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #059669; margin-top: 6px;"></span>
                            </td>
                            <td style="padding: 14px 0; border-bottom: 1px solid #f4f4f5;">
                                <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">AI 投研引擎</p>
                                <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 8px 0;">
                                    想找「PE 低于 20 的高增长科技股」？直接用中文说就行，AI 帮你从全市场筛。
                                </p>
                                <a href="{_EMAIL_LINK_BASE}/research" style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 500;">试试 AI 选股 &rarr;</a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 14px 0; vertical-align: top;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #059669; margin-top: 6px;"></span>
                            </td>
                            <td style="padding: 14px 0;">
                                <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">盘前早报</p>
                                <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 8px 0;">
                                    每天开盘前 5 分钟速读，期货、全球市场、今日关键事件。带着准备进场，比什么都不知道就开盘要好。
                                </p>
                                <a href="{_EMAIL_LINK_BASE}/morning" style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 500;">查看今日早报 &rarr;</a>
                            </td>
                        </tr>
                    </table>

                    <!-- CTA -->
                    <div style="text-align: center; margin: 32px 0 8px 0;">
                        <a href="{register_url}"
                           style="display: inline-block; padding: 14px 36px;
                                  background-color: #059669; color: #ffffff;
                                  text-decoration: none; border-radius: 8px;
                                  font-size: 15px; font-weight: 600;">
                            免费注册，开始 14 天体验
                        </a>
                    </div>
                    <p style="text-align: center; color: #a1a1aa; font-size: 13px; margin: 0 0 28px 0;">
                        无需信用卡 &middot; 14 天后自动结束
                    </p>

                    <!-- Community QR Code -->
                    <div style="border-top: 1px solid #f4f4f5; padding-top: 24px; margin-top: 4px;">
                        <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">加入社群</p>
                        <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
                            扫码加入微信交流群，和其他投资者一起交流市场观点、分享持仓思路。
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                            <tr>
                                <td width="50%" style="padding: 0 6px 0 0; text-align: center; vertical-align: top;">
                                    <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr-0510.jpg"
                                         alt="TheMarketBrew WeChat Group QR Code"
                                         style="width: 100%; max-width: 240px; border-radius: 8px; border: 1px solid #e4e4e7;"
                                    />
                                    <p style="color: #71717a; font-size: 12px; margin: 8px 0 0 0;">微信扫码加入社群</p>
                                </td>
                                <td width="50%" style="padding: 0 0 0 6px; text-align: center; vertical-align: top;">
                                    <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-personal-qr.jpg"
                                         alt="Add WeChat Personal Contact"
                                         style="width: 100%; max-width: 240px; border-radius: 8px; border: 1px solid #e4e4e7;"
                                    />
                                    <p style="color: #71717a; font-size: 12px; margin: 8px 0 0 0;">群满或过期？加我拉你入群</p>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Closing -->
                    <div style="border-top: 1px solid #f4f4f5; padding-top: 24px; margin-top: 24px;">
                        <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 8px 0;">
                            产品还在早期，很多地方还不够好。如果你有任何想法或建议，直接回复这封邮件就行，我每封都会看。
                        </p>
                        <p style="color: #71717a; font-size: 14px; line-height: 1.7; margin: 20px 0 0 0;">
                            祝投资顺利，<br>
                            <span style="color: #0a0a0a; font-weight: 500;">Golden</span><br>
                            <span style="color: #a1a1aa; font-size: 13px;">TheMarketBrew / 硅谷程序员 / 十年美股散户</span>
                        </p>
                    </div>
                </div>

                {get_email_footer()}
            </div>
        </body>
        </html>
        """
    return html


def format_trial_welcome_html(email: str) -> str:
    """Deprecated: now delegates to the unified format_welcome_html."""
    return format_welcome_html(email=email)


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
    paragraphs.append("Hi {{{FIRST_NAME}}},")

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
                Hi {{{{{{FIRST_NAME}}}}}}
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


def _twitter_digest_escape(text: str) -> str:
    """HTML-escape KOL-sourced text. Tweets may contain raw <, >, &."""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )


# Whitelist for tweet URLs we're willing to put inside an `href`. Anything else
# (javascript:, data:, attempts to break out of the attribute, malformed URL)
# resolves to "#" so we never emit a clickable XSS vector. Shape matches X.com
# tweet permalinks: https://x.com/<user>/status/<digits>.
import re as _re_url
_X_TWEET_URL_RE = _re_url.compile(r"^https://(?:www\.)?x\.com/[A-Za-z0-9_]{1,30}/status/\d+/?$")
_X_HANDLE_RE = _re_url.compile(r"^[A-Za-z0-9_]{1,30}$")


def _twitter_digest_safe_tweet_url(url: str) -> str:
    """Validate `url` matches an x.com tweet permalink; otherwise return '#'.

    The href attribute also gets HTML-escaped at the call site via
    `_twitter_digest_escape` to defend against any quotes or `javascript:`
    that slip past upstream validation.
    """
    if not url:
        return "#"
    return url if _X_TWEET_URL_RE.match(url) else "#"


def _twitter_digest_safe_user_url(username: str) -> str:
    """Build a safe x.com profile URL from a sanitized username.

    Username comes from the LLM via the structured field, so we re-validate it
    against the X handle character set ([A-Za-z0-9_], 1-30 chars) before
    interpolating it into the URL.
    """
    if not username or not _X_HANDLE_RE.match(username):
        return "#"
    return f"https://x.com/{username}"


def _twitter_digest_format_count(n: int) -> str:
    """1234 -> '1.2K', 80000 -> '80K', else raw."""
    if n >= 1000:
        return f"{n/1000:.1f}K".replace(".0K", "K")
    return str(n)


def _twitter_digest_tweet_card(tweet: dict) -> str:
    """One curated tweet card. Bilingual + AI headline + optional TLDR."""
    username = _twitter_digest_escape(tweet.get("username", ""))
    display_name = _twitter_digest_escape(tweet.get("display_name", "")) or username
    tweet_type = _twitter_digest_escape(tweet.get("tweet_type", "") or "")
    url = _twitter_digest_safe_tweet_url(tweet.get("url") or "")
    created_at = tweet.get("created_at", "")
    text_en = _twitter_digest_escape(tweet.get("text_en", "") or "")
    text_zh = _twitter_digest_escape(tweet.get("text_zh", "") or "")
    interpretation = _twitter_digest_escape(tweet.get("interpretation_zh", "") or "")
    tldr = _twitter_digest_escape(tweet.get("tldr_zh", "") or "")
    likes = _twitter_digest_format_count(tweet.get("like_count", 0) or 0)
    rts = _twitter_digest_format_count(tweet.get("retweet_count", 0) or 0)
    views = _twitter_digest_format_count(tweet.get("view_count", 0) or 0)

    time_label = format_timestamp(created_at, compact=True) if created_at else ""
    meta_parts = [p for p in (tweet_type, time_label) if p]
    meta_html = (
        f'<div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">{" &middot; ".join(meta_parts)}</div>'
        if meta_parts else ""
    )

    text_en_html = (
        f'<div style="font-size: 13px; color: #18181b; line-height: 1.65; '
        f'margin-bottom: 8px; font-style: italic;">"{text_en}"</div>'
        if text_en else ""
    )
    text_zh_html = (
        f'<div style="font-size: 13px; color: #3f3f46; line-height: 1.75; '
        f'margin-bottom: 12px;">{text_zh}</div>'
        if text_zh else ""
    )

    interpretation_html = (
        f'<div style="background: #f4f4f5; border-left: 3px solid #059669; '
        f'padding: 10px 12px; border-radius: 4px; margin-bottom: 10px;">'
        f'<div style="font-size: 10px; font-weight: 600; color: #059669; '
        f'text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">AI 解读</div>'
        f'<div style="font-size: 13px; color: #18181b; line-height: 1.65;">{interpretation}</div>'
        f'</div>'
        if interpretation else ""
    )

    tldr_html = (
        f'<div style="font-size: 12px; color: #52525b; line-height: 1.7; '
        f'background: #fafafa; padding: 10px 12px; border-radius: 4px; '
        f'margin-bottom: 10px;">{tldr}</div>'
        if tldr else ""
    )

    engagement_html = (
        f'<span style="font-size: 11px; color: #a1a1aa;">'
        f'{likes} 赞 &middot; {rts} 转 &middot; {views} 阅</span>'
    )

    return f"""
        <div style="padding: 16px 0; border-bottom: 1px solid #f0f0f0;">
            <table style="width: 100%; margin-bottom: 10px;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="vertical-align: top;">
                        <div style="font-size: 13px; font-weight: 600; color: #0a0a0a;">
                            {display_name}
                            <span style="color: #71717a; font-weight: 400; margin-left: 4px;">@{username}</span>
                        </div>
                        {meta_html}
                    </td>
                </tr>
            </table>
            {text_en_html}
            {text_zh_html}
            {interpretation_html}
            {tldr_html}
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="vertical-align: middle;">
                        <a href="{url}" style="font-size: 12px; font-weight: 600; color: #059669; text-decoration: none;">查看原推 &rarr;</a>
                    </td>
                    <td style="text-align: right; vertical-align: middle;">
                        {engagement_html}
                    </td>
                </tr>
            </table>
        </div>
        """


def _twitter_digest_group_block(group_label: str, count: int, cards_html: str) -> str:
    """A grouped block: '$NVDA · 2 条' header + stacked cards."""
    return f"""
        <div style="margin-bottom: 18px;">
            <div style="display: inline-block; background: #f4f4f5; color: #18181b;
                        font-size: 12px; font-weight: 600; padding: 4px 10px;
                        border-radius: 999px; margin-bottom: 8px;">
                {group_label} &middot; {count} 条
            </div>
            {cards_html}
        </div>
        """


def _twitter_digest_section(
    title: str, picks: list, group_key: Optional[str], empty_label: str
) -> str:
    """Render one of the three sections (macro / industry / stock).

    group_key:
      - None   -> render cards as flat list (macro)
      - 'sector'         -> group industry by sector chip
      - 'primary_ticker' -> group stock by ticker chip
    """
    if not picks:
        body = (
            f'<div style="font-size: 12px; color: #a1a1aa; padding: 12px 0;">{empty_label}</div>'
        )
    elif group_key is None:
        body = "".join(_twitter_digest_tweet_card(t) for t in picks)
    else:
        # Group preserving first-seen order; ungrouped items fall under "其他".
        groups: dict[str, list[dict]] = {}
        order: list[str] = []
        for t in picks:
            key = (t.get(group_key) or "").strip() or "其他"
            chip = f"${key}" if group_key == "primary_ticker" and key != "其他" else key
            if chip not in groups:
                groups[chip] = []
                order.append(chip)
            groups[chip].append(t)
        body = "".join(
            _twitter_digest_group_block(chip, len(groups[chip]),
                                        "".join(_twitter_digest_tweet_card(t) for t in groups[chip]))
            for chip in order
        )

    return f"""
        <div style="{CARD_STYLE_WIDE}">
            <div style="{SECTION_HEADER_STYLE_GREEN}">{title}</div>
            {body}
        </div>
        """


def format_twitter_digest_html(
    digest: dict,
    digest_date: Optional[str] = None,
    digest_id: Optional[str] = None,
) -> str:
    """Render the Twitter KOL digest into an HTML email body.

    Branches on `digest['schema_version']`:
      - 'v3' -> new layout (opening + topics + briefs + solo voices + closing)
      - 'v2' (or absent) -> legacy three-section layout, kept for digests
        written before the V3 cutover.
    """
    schema_version = digest.get("schema_version") or "v2"
    if schema_version == "v3":
        return _format_twitter_digest_v3(digest, digest_date, digest_id)
    return _format_twitter_digest_v2(digest, digest_date, digest_id)


# ---------------------------------------------------------------------------
# V2 (legacy) renderer — unchanged from before the V3 cutover. Kept here so
# old digests still render correctly when surfaced via /preview or batch send.
# ---------------------------------------------------------------------------


def _format_twitter_digest_v2(
    digest: dict,
    digest_date: Optional[str],
    digest_id: Optional[str],
) -> str:
    generated_at = digest.get("generated_at") or now_iso()
    formatted_date = format_timestamp(generated_at)

    takeaway: list[str] = digest.get("takeaway") or []
    macro_picks: list[dict] = digest.get("macro_picks") or []
    industry_picks: list[dict] = digest.get("industry_picks") or []
    stock_picks: list[dict] = digest.get("stock_picks") or []
    tracked_kols: list[str] = digest.get("tracked_kols") or []
    input_tweet_count: int = int(digest.get("input_tweet_count") or 0)

    feedback_date = digest_date or today_str()

    takeaway_html = ""
    if takeaway:
        takeaway_items = "".join(
            f'<li style="font-size: 13px; color: #3f3f46; line-height: 1.75; margin-bottom: 4px;">{_twitter_digest_escape(t)}</li>'
            for t in takeaway[:5]
        )
        takeaway_html = f"""
            <div style="background: #fafafa; border-left: 3px solid #059669;
                        padding: 14px 18px; border-radius: 4px; margin-top: 18px;">
                <div style="font-size: 11px; font-weight: 600; color: #059669;
                            text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                    今日要点
                </div>
                <ul style="margin: 0; padding-left: 18px;">
                    {takeaway_items}
                </ul>
            </div>
            """

    title_card = f"""
        <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
            <p style="color: #71717a; font-size: 13px; margin: 0 0 12px 0; line-height: 1.6;">
                来自全球金融博主的当日观点 &middot; 中英对照 &middot; 共 {input_tweet_count} 条原始推文
            </p>
            <h1 style="color: #0a0a0a; font-size: 22px; font-weight: 600; margin: 0; line-height: 1.4;">
                推特 KOL 观点日报
            </h1>
            {takeaway_html}
        </div>
        """

    macro_section = _twitter_digest_section(
        "大盘走势", macro_picks, group_key=None,
        empty_label="今日 KOL 暂无新的大盘观点。",
    )
    industry_section = _twitter_digest_section(
        "行业判断", industry_picks, group_key="sector",
        empty_label="今日 KOL 暂无新的行业观点。",
    )
    stock_section = _twitter_digest_section(
        "个股判断", stock_picks, group_key="primary_ticker",
        empty_label="今日 KOL 暂无新的个股观点。",
    )

    tracked_html = _twitter_digest_tracked_kols_block(tracked_kols)
    read_online_html = _twitter_digest_read_online_block(digest_date)

    feedback = get_feedback_section(
        report_date=feedback_date, report_id=digest_id, report_type="digest",
    )

    return f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {get_email_header(formatted_date, "推特 KOL 观点日报")}
                {title_card}
                <div style="background: #f0f0f0; padding: 16px;">
                    {macro_section}
                    {industry_section}
                    {stock_section}
                    {tracked_html}
                    {read_online_html}
                </div>
                {feedback}
                {get_email_footer()}
            </div>
        </body>
        </html>
        """


# ---------------------------------------------------------------------------
# V3 renderer — opening + topics + briefs + solo voices + closing.
# ---------------------------------------------------------------------------


def _format_twitter_digest_v3(
    digest: dict,
    digest_date: Optional[str],
    digest_id: Optional[str],
) -> str:
    generated_at = digest.get("generated_at") or now_iso()
    formatted_date = format_timestamp(generated_at)

    headline: str = digest.get("headline") or ""
    intro: str = digest.get("intro") or ""
    takeaway: list[str] = digest.get("takeaway") or []
    topics: list[dict] = digest.get("topics") or []
    briefs: list[dict] = digest.get("briefs") or []
    solo_voices: list[dict] = digest.get("solo_voices") or []
    crosscut: str = digest.get("crosscut") or ""
    watch_next: list[str] = digest.get("watch_next") or []
    tracked_kols: list[str] = digest.get("tracked_kols") or []
    input_tweet_count: int = int(digest.get("input_tweet_count") or 0)
    hot_sectors: list[dict] = digest.get("hot_sectors") or []
    hot_tickers: list[dict] = digest.get("hot_tickers") or []
    hot_events: list[dict] = digest.get("hot_events") or []

    feedback_date = digest_date or today_str()

    opening_html = _twitter_digest_v3_opening(
        headline=headline, intro=intro, takeaway=takeaway,
        input_tweet_count=input_tweet_count, kol_count=len(tracked_kols),
    )

    hot_html = _twitter_digest_v3_hot_lists(hot_sectors, hot_tickers, hot_events)
    topics_html = _twitter_digest_v3_topics_section(topics)
    briefs_html = _twitter_digest_v3_briefs_section(briefs)
    solos_html = _twitter_digest_v3_solo_voices_section(solo_voices)
    closing_html = _twitter_digest_v3_closing(crosscut, watch_next)

    tracked_html = _twitter_digest_tracked_kols_block(tracked_kols)
    read_online_html = _twitter_digest_read_online_block(digest_date)

    feedback = get_feedback_section(
        report_date=feedback_date, report_id=digest_id, report_type="digest",
    )

    return f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto;">
                {get_email_header(formatted_date, "推特 KOL 观点日报")}
                {opening_html}
                <div style="background: #f0f0f0; padding: 16px;">
                    {hot_html}
                    {topics_html}
                    {briefs_html}
                    {solos_html}
                    {closing_html}
                    {tracked_html}
                    {read_online_html}
                </div>
                {feedback}
                {get_email_footer()}
            </div>
        </body>
        </html>
        """


def _twitter_digest_v3_opening(
    *, headline: str, intro: str, takeaway: list[str],
    input_tweet_count: int, kol_count: int,
) -> str:
    headline_html = (
        f'<h1 style="color: #0a0a0a; font-size: 22px; font-weight: 600; '
        f'margin: 0 0 12px 0; line-height: 1.4;">{_twitter_digest_escape(headline)}</h1>'
        if headline else
        '<h1 style="color: #0a0a0a; font-size: 22px; font-weight: 600; '
        'margin: 0 0 12px 0; line-height: 1.4;">推特 KOL 观点日报</h1>'
    )
    intro_html = (
        f'<p style="color: #3f3f46; font-size: 14px; margin: 0 0 14px 0; line-height: 1.7;">'
        f'{_twitter_digest_escape(intro)}</p>'
        if intro else ""
    )
    meta_html = (
        f'<p style="color: #71717a; font-size: 12px; margin: 0; line-height: 1.6;">'
        f'{kol_count} 位金融博主 &middot; {input_tweet_count} 条原始推文</p>'
    )
    takeaway_html = ""
    if takeaway:
        items = "".join(
            f'<li style="font-size: 13px; color: #3f3f46; line-height: 1.75; margin-bottom: 4px;">{_twitter_digest_escape(t)}</li>'
            for t in takeaway[:5]
        )
        takeaway_html = f"""
            <div style="background: #fafafa; border-left: 3px solid #059669;
                        padding: 14px 18px; border-radius: 4px; margin-top: 18px;">
                <div style="font-size: 11px; font-weight: 600; color: #059669;
                            text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                    今日要点
                </div>
                <ul style="margin: 0; padding-left: 18px;">{items}</ul>
            </div>
        """

    return f"""
        <div style="background: #ffffff; padding: 28px 24px; border-bottom: 1px solid #e4e4e7;">
            {headline_html}
            {intro_html}
            {meta_html}
            {takeaway_html}
        </div>
    """


def _twitter_digest_v3_topic_card(topic: dict) -> str:
    """Render a topic card for email — V3.2 minimalist redesign.

    Visual rules:
      - One muted meta-line above title (layer + sector/event/ticker + KOL count)
        instead of stacked colored chips.
      - Stance distribution merged into the meta-line (no separate styled row).
      - Synthesis paragraph (unchanged).
      - At most 2 KOL arguments shown inline; remainder linked to web.
      - Each argument row: thin colored left border for stance (no badge),
        tldr is the only clickable text, KOL signed em-dash style.
      - No `@username · 原推 →` footer per row — the row text IS the link.
    """
    title = _twitter_digest_escape(topic.get("title", ""))
    layer = topic.get("layer", "")
    primary_ticker = (topic.get("primary_ticker") or "").strip()
    sector = (topic.get("sector") or "").strip()
    event = (topic.get("event") or "").strip()
    stance_dist = (topic.get("stance_distribution") or "").strip()
    synthesis = _twitter_digest_escape(topic.get("synthesis_zh", "") or "")
    args = topic.get("key_arguments") or []

    layer_label = {"macro": "宏观", "industry": "行业", "stock": "个股"}.get(layer, "")
    meta_bits: list[str] = []
    if layer_label:
        meta_bits.append(layer_label)
    # Use the single most-specific dimension chip — no multi-chip pile.
    if primary_ticker:
        meta_bits.append(f"${_twitter_digest_escape(primary_ticker)}")
    elif sector:
        meta_bits.append(_twitter_digest_escape(sector))
    elif event:
        meta_bits.append(_twitter_digest_escape(event))
    if stance_dist:
        meta_bits.append(_twitter_digest_escape(stance_dist))
    meta_line = (
        '<div style="font-size: 11px; color: #71717a; margin-bottom: 4px; '
        'letter-spacing: 0.02em;">'
        f'{" &middot; ".join(meta_bits)}'
        '</div>'
        if meta_bits else ""
    )

    args_html = ""
    if args:
        stance_color = {
            "bullish": "#059669",  # green
            "bearish": "#dc2626",  # red
            "neutral": "#d97706",  # amber
        }
        rows = []
        for a in args:  # V3.3: show all args inline, no folding
            stance = a.get("stance", "neutral")
            color = stance_color.get(stance, "#71717a")
            tldr = _twitter_digest_escape(a.get("tldr_zh", "") or "")
            raw_username = a.get("username", "") or ""
            display_name = _twitter_digest_escape(
                a.get("display_name") or raw_username
            )
            url = _twitter_digest_safe_tweet_url(a.get("tweet_url") or "")
            rows.append(f"""
                <div style="padding: 10px 0 10px 12px; margin: 6px 0;
                            border-left: 3px solid {color};">
                    <a href="{url}" style="color: #18181b; text-decoration: none;
                                          font-size: 13px; line-height: 1.65;
                                          display: block;">{tldr}</a>
                    <div style="font-size: 11px; color: #71717a; margin-top: 4px;
                                font-style: italic;">— {display_name}</div>
                </div>
            """)
        args_html = f'<div style="margin-top: 10px;">{"".join(rows)}</div>'

    return f"""
        <div style="background: #ffffff; border-radius: 6px; padding: 18px 18px 14px;
                    margin-bottom: 12px; border: 1px solid #e4e4e7;">
            {meta_line}
            <h3 style="font-size: 16px; font-weight: 600; color: #0a0a0a;
                       margin: 0 0 10px 0; line-height: 1.35;">{title}</h3>
            <div style="font-size: 13px; color: #3f3f46; line-height: 1.75;
                        white-space: pre-line;">{synthesis}</div>
            {args_html}
        </div>
    """


def _twitter_digest_v3_topics_section(topics: list[dict]) -> str:
    if not topics:
        return ""
    cards = "".join(_twitter_digest_v3_topic_card(t) for t in topics)
    return f"""
        <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a;
                        margin-bottom: 12px; padding: 0 4px;">
                热门话题 &middot; {len(topics)} 个
            </div>
            {cards}
        </div>
    """


def _twitter_digest_v3_brief_row(brief: dict) -> str:
    label = _twitter_digest_escape(brief.get("label", "") or "")
    one_liner = _twitter_digest_escape(brief.get("one_liner_zh", "") or "(无梗概)")
    why_it_matters_raw = (brief.get("why_it_matters_zh") or "").strip()
    why_it_matters_html = ""
    if why_it_matters_raw:
        why_it_matters_html = f"""
            <div style="font-size: 12px; color: #71717a; line-height: 1.5; margin-top: 4px;">
                &rarr; {_twitter_digest_escape(why_it_matters_raw)}
            </div>
        """
    raw_username = brief.get("username", "") or ""
    username = _twitter_digest_escape(raw_username)
    url = _twitter_digest_safe_tweet_url(brief.get("tweet_url") or "")
    user_url = _twitter_digest_safe_user_url(raw_username)

    display_name = _twitter_digest_escape(
        brief.get("display_name") or raw_username or ""
    )
    del username, user_url  # V3.2: row-as-link replaces split @user / 原推 dance
    return f"""
        <a href="{url}" style="display: block; padding: 10px 0;
                              border-bottom: 1px solid #f0f0f0;
                              text-decoration: none; color: inherit;">
            <div style="font-size: 13px; color: #3f3f46; line-height: 1.6;">
                <span style="display: inline-block; min-width: 64px;
                             font-size: 11px; font-weight: 600; color: #18181b;
                             margin-right: 8px;">{label}</span>
                {one_liner}
            </div>
            {why_it_matters_html}
            <div style="font-size: 11px; color: #a1a1aa; margin-top: 4px;
                        font-style: italic;">— {display_name}</div>
        </a>
    """


def _twitter_digest_v3_briefs_section(briefs: list[dict]) -> str:
    if not briefs:
        return ""
    rows = "".join(_twitter_digest_v3_brief_row(b) for b in briefs)
    return f"""
        <div style="background: #ffffff; border-radius: 6px; padding: 16px;
                    margin-bottom: 16px; border: 1px solid #e4e4e7;">
            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a;
                        margin-bottom: 8px;">
                快讯 &middot; {len(briefs)} 条
            </div>
            {rows}
        </div>
    """


def _twitter_digest_v3_solo_voice_card(voice: dict) -> str:
    title = _twitter_digest_escape(voice.get("title", "") or "")
    tweet_type = _twitter_digest_escape(voice.get("tweet_type", "") or "")
    primary_ticker = _twitter_digest_escape(voice.get("primary_ticker", "") or "")
    tldr = _twitter_digest_escape(voice.get("tldr_zh", "") or "")
    interp = _twitter_digest_escape(voice.get("interpretation_zh", "") or "")
    raw_username = voice.get("username", "") or ""
    username = _twitter_digest_escape(raw_username)
    display_name = _twitter_digest_escape(voice.get("display_name", "") or username)
    url = _twitter_digest_safe_tweet_url(voice.get("tweet_url") or "")

    type_label = {"thread": "Thread", "article": "Article"}.get(tweet_type, tweet_type)
    chips = []
    if type_label:
        chips.append(
            f'<span style="display: inline-block; background: #f4f4f5; color: #71717a; '
            f'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 3px; '
            f'text-transform: uppercase; letter-spacing: 0.06em; margin-right: 6px;">{type_label}</span>'
        )
    if primary_ticker:
        chips.append(
            f'<span style="display: inline-block; background: #f4f4f5; color: #18181b; '
            f'font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; '
            f'margin-right: 6px;">${primary_ticker}</span>'
        )
    chips_html = "".join(chips) if chips else ""

    interp_html = (
        f'<div style="background: #fafafa; border-left: 2px solid #059669; '
        f'padding: 8px 12px; margin-top: 10px; font-size: 12px; color: #52525b; '
        f'font-style: italic; line-height: 1.65;">{interp}</div>'
        if interp else ""
    )

    return f"""
        <div style="background: #ffffff; border-radius: 6px; padding: 16px;
                    margin-bottom: 12px; border: 1px solid #e4e4e7;">
            <div style="margin-bottom: 6px;">{chips_html}</div>
            <h3 style="font-size: 15px; font-weight: 600; color: #0a0a0a;
                       margin: 0 0 8px 0; line-height: 1.4;">{title}</h3>
            <div style="font-size: 13px; color: #3f3f46; line-height: 1.7;
                        white-space: pre-line;">{tldr}</div>
            {interp_html}
            <div style="font-size: 11px; color: #71717a; margin-top: 12px; padding-top: 8px;
                        border-top: 1px solid #f0f0f0;">
                {display_name} <span style="color: #a1a1aa;">@{username}</span>
                &nbsp;&middot;&nbsp;
                <a href="{url}" style="color: #059669; text-decoration: none; font-weight: 600;">查看完整 {type_label} &rarr;</a>
            </div>
        </div>
    """


def _twitter_digest_v3_solo_voices_section(voices: list[dict]) -> str:
    if not voices:
        return ""
    cards = "".join(_twitter_digest_v3_solo_voice_card(v) for v in voices)
    return f"""
        <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a;
                        margin-bottom: 12px; padding: 0 4px;">
                独家声音 &middot; {len(voices)} 篇
            </div>
            {cards}
        </div>
    """


def _twitter_digest_v3_closing(crosscut: str, watch_next: list[str]) -> str:
    """Closing block — fully deprecated in V3.1.

    Both `crosscut` and `watch_next` are no longer rendered. The function
    keeps its signature so callers don't need updating and old digest rows
    that still carry these fields don't break the render.
    """
    del crosscut, watch_next
    return ""


_HOT_BAR_MAX_PX = 56  # max bar width per column; 6px tall solid block


def _twitter_digest_v3_hot_lists(
    hot_sectors: list[dict],
    hot_tickers: list[dict],
    hot_events: list[dict],
) -> str:
    """V3.3: 'today's hot list' with proportional bars.

    Each item gets a thin horizontal bar whose width scales to count / max in
    that column. Inline with count so reader sees the visual ranking at a
    glance instead of needing to compare numbers. Renders nothing when all
    three lists are empty.
    """
    if not hot_sectors and not hot_tickers and not hot_events:
        return ""

    def _column(title: str, items: list[dict], is_ticker: bool = False) -> str:
        if not items:
            return ""
        max_count = max((int(it.get("count", 0)) for it in items), default=1) or 1
        row_html: list[str] = []
        for it in items:
            label = _twitter_digest_escape(it.get("label", ""))
            count = int(it.get("count", 0))
            bar_px = max(2, round(count / max_count * _HOT_BAR_MAX_PX))
            display_label = f"${label}" if is_ticker else label
            row_html.append(f"""
                <tr>
                    <td style="font-size: 13px; color: #18181b; padding: 5px 0 5px 0;
                               vertical-align: middle; line-height: 1.4;">
                        {display_label}
                    </td>
                    <td style="vertical-align: middle; padding: 5px 0 5px 8px;
                               white-space: nowrap; text-align: right;">
                        <span style="display: inline-block; background: #d1fae5;
                                     height: 6px; width: {bar_px}px;
                                     vertical-align: middle; margin-right: 6px;
                                     border-radius: 1px;"></span>
                        <span style="font-size: 12px; color: #52525b;
                                     font-variant-numeric: tabular-nums;
                                     vertical-align: middle;">{count}</span>
                    </td>
                </tr>
            """)
        return f"""
            <td style="vertical-align: top; padding-right: 16px; width: 33%;">
                <div style="font-size: 11px; font-weight: 600; color: #71717a;
                            text-transform: uppercase; letter-spacing: 0.08em;
                            margin-bottom: 8px;">{title}</div>
                <table style="width: 100%; border-collapse: collapse;">
                    {"".join(row_html)}
                </table>
            </td>
        """

    # V3.3: '事件' column removed — too many near-duplicate event labels
    # (Q1 财报 / Q1财报 / 财报) made it noisy. The data is still persisted
    # in `hot_events` for any future use; the renderer simply ignores it.
    del hot_events
    return f"""
        <div style="background: #ffffff; border-radius: 6px; padding: 16px;
                    margin-bottom: 16px; border: 1px solid #e4e4e7;">
            <div style="font-size: 13px; font-weight: 600; color: #0a0a0a;
                        margin-bottom: 12px;">今日热议</div>
            <table style="width: 100%; border-collapse: collapse;"><tr>
                {_column("赛道", hot_sectors)}
                {_column("个股", hot_tickers, is_ticker=True)}
            </tr></table>
        </div>
    """


# ---------------------------------------------------------------------------
# Shared helpers used by both V2 and V3 renderers.
# ---------------------------------------------------------------------------


def _twitter_digest_tracked_kols_block(tracked_kols: list[str]) -> str:
    if not tracked_kols:
        return ""
    chips = " ".join(
        f'<span style="display: inline-block; background: #f4f4f5; color: #52525b; '
        f'font-size: 11px; padding: 2px 8px; border-radius: 999px; margin: 0 4px 4px 0;">@'
        f'{_twitter_digest_escape(u)}</span>'
        for u in tracked_kols
    )
    return f"""
        <div style="{CARD_STYLE}">
            <div style="font-size: 11px; font-weight: 600; color: #71717a;
                        text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">
                本日报追踪 {len(tracked_kols)} 位博主
            </div>
            <div>{chips}</div>
        </div>
        """


def _twitter_digest_read_online_block(digest_date: Optional[str]) -> str:
    if not digest_date:
        return ""
    read_url = f"{_EMAIL_LINK_BASE}/twitter-digest/{digest_date}"
    return f"""
        <div style="padding: 0 16px 16px; text-align: center;">
            <a href="{read_url}" style="display: inline-block; padding: 10px 24px;
                      background: #059669; color: #ffffff; text-decoration: none;
                      border-radius: 6px; font-size: 13px; font-weight: 600;">
                在网页查看完整日报
            </a>
        </div>
        """
