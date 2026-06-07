"""
Onboarding drip campaign (signup-anchored).

Sends three guided drip emails over the first two weeks after signup. Day 0 is
handled by the unified welcome email, so the full onboarding sequence is four
emails total.

Schedule (anchored on auth_created_at, NOT on any trial expiry):
  Day 3  - 专属日报 activation
  Day 7  - 投研助手 activation
  Day 14 - Free / Pro / Max conversion guide

Idempotent: tracks send state in subscriptions.lifecycle_state.onboarding_sent
(JSONB dict keyed by day_int -> ISO timestamp). Re-running the same day is a
no-op.
"""

from datetime import datetime, timezone
from typing import Optional

import resend

from app.core.config import RESEND_API_KEY, ENVIRONMENT
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.core.resend_tags import resend_channel_tags
from app.features.subscription.email_styles import (
    CARD_STYLE_WIDE,
)
from app.features.subscription.email_templates import (
    get_email_header,
    get_email_footer,
    _EMAIL_LINK_BASE,
)
from app.utils.timezone import now_pacific

logger = get_logger(__name__)

# Mapping: signup day -> onboarding step index (used to avoid resending)
# Day 0 (welcome email) is sent on subscribe, not via this cron job.
DRIP_SCHEDULE = {
    3: 1,
    7: 2,
    14: 3,
}


# ---------------------------------------------------------------------------
# Email template helpers
# ---------------------------------------------------------------------------


def _email_wrapper(formatted_date: str, title: str, body_html: str) -> str:
    """Wrap body content in the standard TheMarketBrew email layout."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 0 auto;">
            {get_email_header(formatted_date, title)}
            <div style="background: #ffffff; padding: 32px 24px;">
                {body_html}
            </div>
            {get_email_footer()}
        </div>
    </body>
    </html>
    """


def _cta_button(text: str, url: str) -> str:
    """Render a primary CTA button."""
    return f"""
    <div style="text-align: center; margin: 24px 0;">
        <a href="{url}"
           style="display: inline-block; padding: 12px 32px;
                  background-color: #059669; color: #ffffff;
                  text-decoration: none; border-radius: 8px;
                  font-size: 15px; font-weight: 600;">
            {text}
        </a>
    </div>
    """


# ---------------------------------------------------------------------------
# Day-specific templates
# ---------------------------------------------------------------------------


def _day3_email(first_name: str = "") -> tuple[str, str]:
    """Day 3: 专属日报 activation and personal holding digest value."""
    subject = "[TheMarketBrew] 你的股票今天发生了什么？"
    greeting = f"Hi {first_name}，" if first_name else "Hi，"
    card_style = CARD_STYLE_WIDE
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        通用市场日报会告诉你今天大盘怎么了。但真正让人分心的，往往是另一个问题：这些事和我手里的股票有没有关系？
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        这就是专属日报要解决的事。你把关注的股票加进去，TheMarketBrew 会把新闻、分析师动作、财报、宏观变化重新按你的持仓排一遍。信息少一点，但更贴着你的仓位。
    </p>
    <p style="color: #71717a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 8px 0;">
        如果你的自选股里有 NVDA，摘要大概会这样写
    </p>
    <div style="{card_style} background: #f9fafb;">
        <table style="width: 100%; font-size: 13px;" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; width: 24px; vertical-align: top;">1</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>股价为什么动</strong> -- 盘后下跌 3.2%，主要因为出口限制消息和半导体板块同步回调
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; vertical-align: top;">2</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>谁改变了看法</strong> -- 摩根士丹利把目标价从 $150 调到 $135，担心短期海外收入
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; vertical-align: top;">3</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>下一步看什么</strong> -- 数据中心需求还在，但下季指引会决定市场愿不愿意继续给高估值
                </td>
            </tr>
        </table>
    </div>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 18px 0 10px 0;">
        Free 用户可以在网页里查看专属日报的核心内容。Pro 会把这份专属持仓日报每天发到邮箱，省掉你自己去刷新闻和对照持仓的时间。
    </p>
    {_cta_button("查看我的专属日报", f"{_EMAIL_LINK_BASE}/for-you")}
    <p style="color: #71717a; font-size: 13px; line-height: 1.7; margin: 18px 0 0 0; border-top: 1px solid #f4f4f5; padding-top: 18px;">
        还没加自选股也没关系，先加 3 到 5 只你真的会看的股票。数量不用多，真实就够了。
    </p>
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "专属日报", body)


def _day7_email(first_name: str = "") -> tuple[str, str]:
    """Day 7: 投研助手 activation."""
    subject = "[TheMarketBrew] 试试投研助手：直接问它"
    greeting = f"Hi {first_name}，" if first_name else "Hi，"
    card_style = CARD_STYLE_WIDE
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        如果你已经看过日报和专属日报，下一步可以试试<strong>投研助手</strong>。不用重新学一套筛选器，你把问题丢进去就行。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 18px 0;">
        比如你脑子里只有一个模糊想法：想找现金流稳一点的 AI 基建股，或者想知道 GOOGL 这季财报到底有没有问题。直接问就行。
    </p>

    <div style="{card_style} background: #f9fafb;">
        <p style="color: #71717a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 16px 0;">
            可以直接复制这些问题
        </p>
        <table style="width: 100%; font-size: 13px;" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 9px 0; color: #3f3f46; border-bottom: 1px solid #e4e4e7;">
                    帮我找市值 500 亿以上、PE 低于 20、近一年营收增长超过 15% 的半导体股
                </td>
            </tr>
            <tr>
                <td style="padding: 9px 0; color: #3f3f46; border-bottom: 1px solid #e4e4e7;">
                    用 qinbafrank 的框架看一下 NVDA，现在最该盯哪个风险点？
                </td>
            </tr>
            <tr>
                <td style="padding: 9px 0; color: #3f3f46;">
                    如果利率继续维持高位，我的科技股持仓里谁最容易被估值压缩？
                </td>
            </tr>
        </table>
    </div>

    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 16px 0 4px 0;">
        投研助手会尽量把问题拆成可查的数据：全市场筛选、个股研究、宏观信号、KOL 历史观点。右侧面板会跟着切换，不用你在几个页面之间来回跳。
    </p>
    {_cta_button("打开投研助手", f"{_EMAIL_LINK_BASE}/research")}

    <p style="color: #71717a; font-size: 13px; line-height: 1.7; margin: 16px 0 0 0;">
        Free 和 Pro 每天有 2 次体验额度。Max 适合重度使用：投研助手无限调用，个股深度分析也不限次数。
    </p>
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "投研助手", body)


def _day14_email(first_name: str = "") -> tuple[str, str]:
    """Day 14: Scenario-based conversion guide."""
    subject = "[TheMarketBrew] 你适合 Free、Pro 还是 Max？"
    greeting = f"Hi {first_name}，" if first_name else "Hi，"

    def _plan_card(name: str, color: str, desc: str, bullets: list[str], href: str, cta: str) -> str:
        bullet_html = "".join([
            f'<li style="margin: 0 0 6px 0; color: #3f3f46;">{bullet}</li>'
            for bullet in bullets
        ])
        return f"""
        <div style="border: 1px solid #e4e4e7; border-left: 3px solid {color}; border-radius: 8px; padding: 16px; margin: 0 0 12px 0;">
            <p style="color: {color}; font-size: 12px; font-weight: 700; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.08em;">{name}</p>
            <p style="color: #0a0a0a; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">{desc}</p>
            <ul style="padding-left: 18px; margin: 0 0 12px 0; font-size: 13px; line-height: 1.6;">
                {bullet_html}
            </ul>
            <a href="{href}" style="color: {color}; font-size: 13px; font-weight: 600; text-decoration: none;">{cta} &rarr;</a>
        </div>
        """

    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        这两周的引导邮件到这里就结束了。你不需要为了“用完功能”而升级，真正该看的只有一件事：TheMarketBrew 有没有帮你少做一些重复功课。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 20px 0;">
        如果你还在犹豫，我会按使用方式这样选：
    </p>
    {_plan_card(
        "Free",
        "#047857",
        "适合每天快速看一眼市场。",
        [
            "每日市场日报网站版",
            "宏观仪表盘",
            "25 只自选股管理",
            "投研助手每天 2 次体验",
        ],
        f"{_EMAIL_LINK_BASE}/today",
        "继续使用 Free",
    )}
    {_plan_card(
        "Pro",
        "#059669",
        "适合希望邮件主动找你的人。",
        [
            "盘前早报",
            "每日市场日报邮件",
            "专属持仓日报邮件",
            "宏观周报邮件",
        ],
        f"{_EMAIL_LINK_BASE}/pricing?plan=pro&utm_source=email&utm_campaign=day14",
        "查看 Pro",
    )}
    {_plan_card(
        "Max",
        "#c2410c",
        "适合把 TheMarketBrew 当投研工作台的人。",
        [
            "投研助手无限使用",
            "AI 深度个股分析",
            "推特 KOL 日报",
            "包含 Pro 的所有邮件",
        ],
        f"{_EMAIL_LINK_BASE}/pricing?plan=max&utm_source=email&utm_campaign=day14",
        "查看 Max",
    )}

    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 16px; margin: 22px 0;">
        <p style="color: #9a3412; font-size: 13px; font-weight: 600; margin: 0 0 6px 0;">早期用户锁价</p>
        <p style="color: #7c2d12; font-size: 13px; line-height: 1.7; margin: 0;">
            Pro 和 Max 现在是抢先体验价。订阅后会锁定当前价格，后续涨价不影响你。
        </p>
    </div>

    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        当然，如果你觉得现在的 Free 已经够用，就继续用 Free。我更在意的是，它能不能真的变成你每天会打开、会读、会追问的工具。
    </p>
    <p style="color: #71717a; font-size: 14px; line-height: 1.7; margin: 20px 0 0 0;">
        如果你有任何反馈，直接回这封邮件。每一封我都会看。<br><br>
        <span style="color: #0a0a0a; font-weight: 500;">Golden</span><br>
        <span style="color: #a1a1aa; font-size: 13px;">TheMarketBrew / 硅谷程序员 / 十年美股散户</span>
    </p>
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "Day 14", body)


# Map day to template function
_TEMPLATE_MAP = {
    3: _day3_email,
    7: _day7_email,
    14: _day14_email,
}


# ---------------------------------------------------------------------------
# Core drip logic (cron — Day 3, 7, 14)
# ---------------------------------------------------------------------------


TEST_EMAIL = "voya.technologies@gmail.com"


async def _list_all_users() -> list[dict]:
    """All users joined with subscription metadata (includes auth_created_at + lifecycle_state)."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data", []) or []
    logger.warning("Failed to fetch users for onboarding drip: %s", data.get("error"))
    return []


async def _update_lifecycle_state(user_id: str, patch: dict) -> bool:
    """Shallow-merge patch into subscriptions.lifecycle_state JSONB via edge function."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="POST",
        params={"action": "update_lifecycle_state"},
        json_body={"user_id": user_id, "patch": patch},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.warning(
            "update_lifecycle_state failed for %s: %s",
            user_id[:8], data.get("error"),
        )
        return False
    return True


def _days_since(iso_timestamp: str) -> Optional[int]:
    """Whole-day delta between iso_timestamp and now (UTC). None on parse error."""
    if not iso_timestamp:
        return None
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - parsed).days
    except Exception:
        return None


def _already_sent(lifecycle_state: dict | None, day: int) -> bool:
    if not lifecycle_state:
        return False
    sent_map = lifecycle_state.get("onboarding_sent") or {}
    # JSONB serialization may store ints as strings — accept both.
    return str(day) in sent_map or day in sent_map


async def _send_onboarding_email(email: str, subject: str, html: str) -> bool:
    """Send a single onboarding email via Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping onboarding email")
        return False

    try:
        resend.api_key = RESEND_API_KEY
        params = {
            "from": "Golden from TheMarketBrew <hello@themarketbrew.com>",
            "reply_to": "kedengpan@gmail.com",
            "to": [email],
            "subject": subject,
            "html": html,
            "tags": resend_channel_tags("onboarding_drip"),
        }
        result = resend.Emails.send(params)
        email_id = result.get("id") if result else None
        if email_id:
            logger.info("Onboarding email sent to %s: %s", email, email_id)
            return True
        logger.warning("Onboarding email send returned no id for %s", email)
        return False
    except Exception as e:
        logger.warning("Failed to send onboarding email to %s: %s", email, e)
        return False


async def process_onboarding_emails() -> dict:
    """Daily cron: fire Day 3/7/14 drip emails based on signup age.

    Anchored on `auth_created_at` (registration timestamp) — NOT on any trial
    expiry. Idempotent via `subscriptions.lifecycle_state.onboarding_sent`.

    Non-production: filters recipients to TEST_EMAIL to avoid spamming real users
    from dev/staging cron runs.
    """
    users = await _list_all_users()

    is_production = ENVIRONMENT == "production"
    if not is_production:
        before = len(users)
        users = [u for u in users if u.get("email") == TEST_EMAIL]
        logger.info(
            "Non-production onboarding drip: filtered %d -> %d (test account only)",
            before, len(users),
        )

    counters = {
        "processed": 0,
        "sent": 0,
        "skipped_already": 0,
        "skipped_other": 0,
        "errors": 0,
    }

    for user in users:
        counters["processed"] += 1
        user_email = user.get("email") or ""
        user_id = user.get("user_id") or ""
        if not user_email or not user_id:
            counters["skipped_other"] += 1
            continue

        signup_iso = user.get("auth_created_at") or user.get("created_at")
        day = _days_since(signup_iso) if signup_iso else None
        if day is None or day not in DRIP_SCHEDULE:
            counters["skipped_other"] += 1
            continue

        if _already_sent(user.get("lifecycle_state"), day):
            counters["skipped_already"] += 1
            continue

        template_fn = _TEMPLATE_MAP.get(day)
        if not template_fn:
            counters["skipped_other"] += 1
            continue

        first_name = (user.get("name") or "").split(" ")[0]
        subject, html = template_fn(first_name=first_name)

        success = await _send_onboarding_email(user_email, subject, html)
        if not success:
            counters["errors"] += 1
            continue

        # Mark sent — read-modify-write of onboarding_sent nested dict
        existing_state = user.get("lifecycle_state") or {}
        existing_sent = dict(existing_state.get("onboarding_sent") or {})
        existing_sent[str(day)] = datetime.now(timezone.utc).isoformat()
        await _update_lifecycle_state(user_id, {"onboarding_sent": existing_sent})

        counters["sent"] += 1

    logger.info("Onboarding drip pass: %s", counters)
    return counters
