"""
Trial onboarding drip campaign.

Sends 5 guided emails over a 14-day trial period to help users
discover and adopt core features. Day 0 is handled by the unified
welcome email (sent on subscribe), so the drip starts at Day 1.

Schedule:
  Day 1  - Personal digest deep-dive (NVDA example)
  Day 3  - Macro dashboard deep-dive (signal lights)
  Day 7  - AI research engine deep-dive (conversation example)
  Day 11 - 3-day urgency reminder
  Day 14 - Trial ended / upgrade prompt
"""

from datetime import datetime, timezone
from typing import Optional

import resend

from app.core.config import RESEND_API_KEY, ENVIRONMENT
from app.core.database import get_insforge_service
from app.core.logging import get_logger
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

# Mapping: trial day -> onboarding step index (used to avoid resending)
# Day 0 (welcome email) is sent on subscribe, not via this cron job.
DRIP_SCHEDULE = {
    1: 1,
    3: 2,
    7: 3,
    11: 4,
    14: 5,
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


def _day1_email(first_name: str = "") -> tuple[str, str]:
    """Day 1: Personal digest deep-dive — pain point story + example."""
    subject = "[TheMarketBrew]如何只看和自己有关的新闻"
    greeting = "Hi，"
    card_style = CARD_STYLE_WIDE
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        你是不是也每天刷新闻刷到焦虑？我以前就是这样。持仓里有七八只股票，每天早上起来先刷一遍社交媒体，在80%的噪音中寻找20%与自己相关的内容。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        问题是我又不敢不看——万一漏掉了什么重要的呢？就这样每天花非常久的时间处理噪音，却依旧十分焦虑。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 24px 0;">
        所以我做了「专属日报」这个功能：你把自选股加进来，AI 每天只给你看跟这些股票相关的新闻和分析。只告诉你最重要的，其他跟你无关的，一条都不会出现。
    </p>

    <p style="color: #71717a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px 0;">
        比如你持有 NVDA，今天你会看到
    </p>
    <div style="{card_style} background: #f9fafb;">
        <table style="width: 100%; font-size: 13px;" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; width: 24px; vertical-align: top;">1</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>NVDA 盘后下跌 3.2%</strong> -- 出口管制新规限制对华销售 H20 芯片
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; vertical-align: top;">2</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>摩根士丹利下调目标价</strong> -- 从 $150 调至 $135，主要担忧出口收入
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; vertical-align: top;">3</td>
                <td style="padding: 8px 0; color: #3f3f46;">
                    <strong>AI 观点</strong> -- 短期承压，但数据中心需求长期不变，关注下季财报指引
                </td>
            </tr>
        </table>
    </div>

    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 4px 0;">
        花 30 秒添加你的股票，明天就能收到你自己的版本。
    </p>
    {_cta_button("添加我的自选股", f"{_EMAIL_LINK_BASE}/for-you/watchlist")}
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "For You", body)


def _day3_email(first_name: str = "") -> tuple[str, str]:
    """Day 3: Why macro matters — importance, challenge, solution."""
    subject = "[TheMarketBrew] 如何系统性的追踪宏观环境"
    greeting = "Hi，"
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        不知道你有没有过这种经历：研究了很久，选了一只基本面很好的股票，买入之后却一直跌。后来才发现，不是股票的问题，是整个市场环境变了——流动性收紧、通胀超预期、或者情绪突然转向。宏观环境对股价的影响，往往比财报数据更直接。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        作为一个老韭菜，我很长一段时间也不理解宏观环境所带来的影响。我也深知要系统性的追踪宏观环境并且理解其对自己持仓的影响，真的是太难了。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        所以我做了<a href="{_EMAIL_LINK_BASE}/macro" style="color: #059669; text-decoration: none; font-weight: 500;">宏观仪表盘</a>，把这些数据提炼成四个维度，AI 每周自动解读一次：
    </p>

    <div style="{CARD_STYLE_WIDE} background: #f9fafb;">
        <table style="width: 100%; font-size: 14px;" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 10px 0; width: 28px; vertical-align: top;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #22c55e;"></span>
                </td>
                <td style="padding: 10px 0;">
                    <strong style="color: #0a0a0a;">流动性</strong>
                    <span style="color: #71717a; font-size: 13px;"> -- 市场上的钱多不多</span>
                </td>
            </tr>
            <tr><td colspan="2"><div style="border-top: 1px solid #e4e4e7;"></div></td></tr>
            <tr>
                <td style="padding: 10px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #eab308;"></span>
                </td>
                <td style="padding: 10px 0;">
                    <strong style="color: #0a0a0a;">经济</strong>
                    <span style="color: #71717a; font-size: 13px;"> -- 实体经济在扩张还是收缩</span>
                </td>
            </tr>
            <tr><td colspan="2"><div style="border-top: 1px solid #e4e4e7;"></div></td></tr>
            <tr>
                <td style="padding: 10px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #22c55e;"></span>
                </td>
                <td style="padding: 10px 0;">
                    <strong style="color: #0a0a0a;">通胀</strong>
                    <span style="color: #71717a; font-size: 13px;"> -- 物价压力大不大，影响利率决策</span>
                </td>
            </tr>
            <tr><td colspan="2"><div style="border-top: 1px solid #e4e4e7;"></div></td></tr>
            <tr>
                <td style="padding: 10px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></span>
                </td>
                <td style="padding: 10px 0;">
                    <strong style="color: #0a0a0a;">情绪</strong>
                    <span style="color: #71717a; font-size: 13px;"> -- 市场参与者是贪婪还是恐惧</span>
                </td>
            </tr>
        </table>
    </div>

    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 4px 0;">
        你也可以在<a href="{_EMAIL_LINK_BASE}/research" style="color: #059669; text-decoration: none; font-weight: 500;">投研助手</a>里直接问 AI 宏观相关的问题。
        不论你是长线持有还是中短期趋势投资者，理解宏观环境才能够让你的策略更上一层楼。
    </p>
    {_cta_button("查看宏观仪表盘", f"{_EMAIL_LINK_BASE}/macro")}
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "Macro", body)


def _day7_email(first_name: str = "") -> tuple[str, str]:
    """Day 7: AI research engine deep-dive — show a conversation example."""
    subject = "[TheMarketBrew] 用一句话，让 AI 帮你选股"
    greeting = "Hi，"
    card_style = CARD_STYLE_WIDE
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        传统选股器要你在几十个筛选条件里打勾，用起来很累。TheMarketBrew 的 AI 投研引擎让你用自然语言描述你想要的股票，剩下的交给 AI。
    </p>

    <div style="{card_style} background: #f9fafb;">
        <p style="color: #71717a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 16px 0;">
            对话示例
        </p>

        <!-- User message -->
        <div style="display: flex; margin-bottom: 12px;">
            <div style="background: #059669; color: #ffffff; font-size: 11px; font-weight: 600;
                        width: 24px; height: 24px; border-radius: 50%; text-align: center;
                        line-height: 24px; flex-shrink: 0;">
                You
            </div>
            <div style="margin-left: 10px; background: #ffffff; border: 1px solid #e4e4e7;
                        border-radius: 12px; padding: 10px 14px; font-size: 14px; color: #0a0a0a;">
                帮我找市值 500 亿以上、PE 低于 20、近一年营收增长超过 15% 的科技股
            </div>
        </div>

        <!-- AI response -->
        <div style="display: flex; margin-bottom: 4px;">
            <div style="background: #0a0a0a; color: #ffffff; font-size: 11px; font-weight: 600;
                        width: 24px; height: 24px; border-radius: 50%; text-align: center;
                        line-height: 24px; flex-shrink: 0;">
                AI
            </div>
            <div style="margin-left: 10px; background: #ffffff; border: 1px solid #e4e4e7;
                        border-radius: 12px; padding: 10px 14px; font-size: 13px; color: #3f3f46; line-height: 1.7;">
                根据你的条件，从全市场筛选出 3 只符合的科技股：<br><br>
                <strong style="color: #0a0a0a;">AMAT</strong> -- 应用材料 | PE 17.8 | 营收增长 +21%<br>
                <strong style="color: #0a0a0a;">KLAC</strong> -- 科磊半导体 | PE 19.2 | 营收增长 +18%<br>
                <strong style="color: #0a0a0a;">CDNS</strong> -- 楷登电子 | PE 16.5 | 营收增长 +16%<br><br>
                <span style="color: #71717a;">点击任意股票可查看详细分析报告 ...</span>
            </div>
        </div>
    </div>

    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 4px 0;">
        你也可以问更复杂的问题，比如「最近被机构增持的新能源股有哪些」或者「哪些消费股在经济下行期表现最抗跌」。
    </p>
    {_cta_button("试试 AI 投研引擎", f"{_EMAIL_LINK_BASE}/research")}
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "Research", body)


def _day11_email(first_name: str = "") -> tuple[str, str]:
    """Day 11: 3-day urgency reminder."""
    subject = "[TheMarketBrew] 你的试用还剩 3 天"
    greeting = "Hi，"
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        你的 14 天全功能体验还剩 3 天就要结束了。试用期过后，部分高级功能将不再可用。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.8; margin: 0 0 12px 0;">
        在剩下的时间里，确保你已经体验了这些功能：
    </p>
    <ul style="color: #52525b; font-size: 14px; line-height: 2; padding-left: 20px; margin: 0 0 12px 0;">
        <li><a href="{_EMAIL_LINK_BASE}/for-you" style="color: #059669; text-decoration: none;">专属日报</a> - 你的自选股专属分析</li>
        <li><a href="{_EMAIL_LINK_BASE}/research" style="color: #059669; text-decoration: none;">AI 投研引擎</a> - 自然语言选股</li>
        <li><a href="{_EMAIL_LINK_BASE}/stock" style="color: #059669; text-decoration: none;">个股投研</a> - 深度分析任意股票</li>
        <li><a href="{_EMAIL_LINK_BASE}/macro" style="color: #059669; text-decoration: none;">宏观仪表盘</a> - 四维度环境判断</li>
    </ul>
    <p style="color: #71717a; font-size: 14px; line-height: 1.8; margin: 0 0 4px 0;">
        如果觉得有价值，可以随时升级 Pro 继续使用全部功能。
    </p>
    {_cta_button("查看订阅方案", f"{_EMAIL_LINK_BASE}/pricing")}
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "Trial Ending", body)


def _day14_email(first_name: str = "") -> tuple[str, str]:
    """Day 14: Trial ended — feedback, community, comparison, soft CTA."""
    subject = "[TheMarketBrew] 试用结束 -- 聊聊你的体验？"
    greeting = "Hi，"
    body = f"""
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        {greeting}
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        你的 14 天试用今天结束了。不管你用了多少功能，我都很想听听你的真实感受——哪些功能对你有帮助？哪些地方觉得不好用或者缺了什么？
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 14px 0;">
        产品还很早期，很多决策我自己也在摸索。用户的反馈是我最重要的参考，哪怕只是一句「日报太长了」或者「宏观那个功能没看懂」，对我都非常有价值。
    </p>
    <p style="color: #52525b; font-size: 15px; line-height: 1.9; margin: 0 0 24px 0;">
        <strong>直接回复这封邮件就行</strong>，我每封都会亲自看。
    </p>

    <!-- Community QR Code -->
    <div style="border-top: 1px solid #f4f4f5; padding-top: 24px; margin-bottom: 24px;">
        <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">加入社群，持续交流</p>
        <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
            试用结束不代表断联。加入微信群，和其他用户一起聊市场、提需求，我也在群里。
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
                <td width="50%" style="padding: 0 6px 0 0; text-align: center; vertical-align: top;">
                    <img src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr-0421.jpg"
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

    <!-- Comparison table -->
    <div style="border-top: 1px solid #f4f4f5; padding-top: 24px;">
        <p style="color: #0a0a0a; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">如果觉得有价值</p>
        <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
            以下是各方案的对比。即使不升级，你仍然可以继续收到每天的收盘日报邮件。
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;" cellpadding="0" cellspacing="0">
            <tr style="background: #f8f8f8;">
                <td style="padding: 10px 12px; font-weight: 600; color: #0a0a0a; border-bottom: 2px solid #e4e4e7;">功能</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #0a0a0a; text-align: center; border-bottom: 2px solid #e4e4e7;">免费</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #059669; text-align: center; border-bottom: 2px solid #059669;">Pro</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #d97706; text-align: center; border-bottom: 2px solid #d97706;">Max</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">收盘日报（邮件）</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">盘前早报（邮件）</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">专属持仓日报（邮件）</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">宏观周报（邮件）</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">自选股管理</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">市场日报网站</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">AI 深度个股分析</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46; border-bottom: 1px solid #f4f4f5;">AI 投研引擎</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626; border-bottom: 1px solid #f4f4f5;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a; border-bottom: 1px solid #f4f4f5;">&#10003;</td>
            </tr>
            <tr>
                <td style="padding: 10px 12px; color: #3f3f46;">宏观仪表盘</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #dc2626;">&#10007;</td>
                <td style="padding: 10px 12px; text-align: center; color: #16a34a;">&#10003;</td>
            </tr>
        </table>
        {_cta_button("查看订阅方案", f"{_EMAIL_LINK_BASE}/pricing")}
    </div>

    <p style="color: #71717a; font-size: 14px; line-height: 1.7; margin: 20px 0 0 0;">
        感谢你这两周的陪伴，<br>
        <span style="color: #0a0a0a; font-weight: 500;">Golden</span><br>
        <span style="color: #a1a1aa; font-size: 13px;">TheMarketBrew / 硅谷程序员 / 十年美股散户</span>
    </p>
    """
    formatted_date = now_pacific().strftime("%B %d, %Y")
    return subject, _email_wrapper(formatted_date, "Trial Ended", body)


# Map day to template function
_TEMPLATE_MAP = {
    1: _day1_email,
    3: _day3_email,
    7: _day7_email,
    11: _day11_email,
    14: _day14_email,
}


# ---------------------------------------------------------------------------
# Core drip logic (cron — Day 1, 3, 7, 11, 14)
# ---------------------------------------------------------------------------


async def _get_trial_users() -> list[dict]:
    """Fetch all users with active trials (access_expires_at in the future)."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_trials"},
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data", [])
    logger.warning("Failed to fetch trial users: %s", data.get("error"))
    return []


def _calculate_trial_day_from_expiry(access_expires_at: str, trial_length: int = 14) -> Optional[int]:
    """Calculate trial day from access_expires_at.

    Day 0 = registration day, Day 14 = expiry day.
    Example: if trial expires in 12 days, today is Day 2.
    """
    try:
        expires = datetime.fromisoformat(access_expires_at.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        days_remaining = (expires - now).days
        trial_day = trial_length - days_remaining
        return trial_day if 0 <= trial_day <= trial_length else None
    except Exception:
        return None


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
    """Main cron handler: send drip emails to trial users.

    Returns summary of actions taken.
    """
    trial_users = await _get_trial_users()
    if not trial_users:
        logger.info("No active trial users found for onboarding")
        return {"processed": 0, "sent": 0, "skipped": 0, "errors": 0}

    # Non-production safety: only send to test account
    TEST_EMAIL = "voya.technologies@gmail.com"
    is_production = ENVIRONMENT == "production"
    if not is_production:
        before_count = len(trial_users)
        trial_users = [u for u in trial_users if u.get("email") == TEST_EMAIL]
        logger.info(
            "Non-production: filtered onboarding recipients %d -> %d (test account only)",
            before_count, len(trial_users),
        )

    processed = 0
    sent = 0
    skipped = 0
    errors = 0

    for user in trial_users:
        processed += 1
        user_email: str = user.get("email", "")
        first_name: str = user.get("first_name", "")
        access_expires_at: str = user.get("access_expires_at", "")

        if not user_email or not access_expires_at:
            skipped += 1
            continue

        # Calculate trial day from access_expires_at (14 days before expiry = Day 0)
        trial_day = _calculate_trial_day_from_expiry(access_expires_at)
        if trial_day is None:
            skipped += 1
            continue

        # Only send if today matches a scheduled day exactly
        template_fn = _TEMPLATE_MAP.get(trial_day)
        if not template_fn:
            skipped += 1
            continue

        subject, html = template_fn(first_name=first_name)

        success = await _send_onboarding_email(user_email, subject, html)
        if success:
            sent += 1
        else:
            errors += 1

    logger.info(
        "Onboarding drip complete: processed=%d sent=%d skipped=%d errors=%d",
        processed,
        sent,
        skipped,
        errors,
    )
    return {
        "processed": processed,
        "sent": sent,
        "skipped": skipped,
        "errors": errors,
    }
