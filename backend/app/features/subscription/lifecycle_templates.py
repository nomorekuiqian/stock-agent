"""Onboarding lifecycle email templates (14-day post-signup sequence).

| Day | Theme | Primary CTA |
|-----|-------|-------------|
| D0  | Welcome + first daily report + **Twitter Digest #1 intro** | Finish onboarding |
| D1  | Twitter Digest #2 intro                                    | Read on site       |
| D2  | Twitter Digest #3 intro + soft transition                  | Read on site       |
| D4  | "Twitter Digest 怎么样" — Max upsell                      | Upgrade Max        |
| D6  | Personal-digest sample — Pro upsell                        | Upgrade Pro        |
| D8  | AI research feature intro + example query                  | Try research       |
| D11 | Behavior-driven personal upsell (rule-based)               | Upgrade            |
| D14 | 14-day summary + limited-time offer                        | Upgrade            |

D0/D1/D2 expect `twitter_digest_html` content from caller (lifecycle_scheduler).
D6 picks a sample ticker from caller-provided `user_watchlist` or defaults to NVDA.
D11 accepts a `behavior_hint` (one of "max_pitch" / "pro_pitch" / "default").

Plan: docs/plans/active/freemium-lifecycle-email.md
"""

from dataclasses import dataclass
from typing import Optional

from app.core.config import FRONTEND_URL


_EMAIL_LINK_BASE = (FRONTEND_URL or "https://themarketbrew.com").rstrip("/")
_PRICING_PRO_URL = f"{_EMAIL_LINK_BASE}/pricing?plan=pro&source=onboarding"
_PRICING_MAX_URL = f"{_EMAIL_LINK_BASE}/pricing?plan=max&source=onboarding"


@dataclass
class LifecycleEmail:
    subject: str
    html: str
    text: str


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _wrap(title: str, body_html: str, footer_note: str = "") -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <div style="margin-bottom:24px;">
    <p style="font-size:12px;color:#71717a;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 6px;">TheMarketBrew</p>
    <h1 style="font-size:22px;color:#0a0a0a;margin:0;font-weight:600;line-height:1.3;">{title}</h1>
  </div>
  <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:24px;">
    {body_html}
  </div>
  <p style="font-size:11px;color:#a1a1aa;margin:18px 0 0;line-height:1.6;">
    你收到这封邮件，是因为你注册了 TheMarketBrew。{footer_note}
    <br/>
    <a href="{_EMAIL_LINK_BASE}/settings/email-preferences" style="color:#71717a;">管理邮件偏好</a>
  </p>
</div>
</body></html>"""


def _cta(text: str, url: str, primary: bool = True) -> str:
    bg = "#10b981" if primary else "#ffffff"
    color = "#ffffff" if primary else "#10b981"
    border = "1px solid #10b981" if not primary else "none"
    return (
        f'<a href="{url}" style="display:inline-block;padding:12px 24px;'
        f'background:{bg};color:{color};text-decoration:none;border:{border};'
        f'border-radius:6px;font-size:14px;font-weight:600;">{text}</a>'
    )


def _para(text: str) -> str:
    return (
        f'<p style="color:#3f3f46;font-size:15px;line-height:1.7;margin:0 0 14px;">{text}</p>'
    )


def _meta_intro(name: str) -> str:
    return (
        '<p style="color:#71717a;font-size:13px;margin:0 0 18px;line-height:1.6;">'
        f"Hi{(' ' + name) if name else ''}，这是 onboarding 系列中的一封。"
        '</p>'
    )


# ---------------------------------------------------------------------------
# D0 – Welcome + first Twitter Digest sample
# ---------------------------------------------------------------------------


def render_d0(name: str, twitter_digest_html: str = "") -> LifecycleEmail:
    subject = "[TheMarketBrew] 欢迎加入 + 今日推特日报 (前 3 封免费)"
    digest_block = twitter_digest_html or _para(
        "今天的推特日报正在生成，明天起会准时送达你的邮箱。"
    )
    body = f"""
{_meta_intro(name)}
{_para("欢迎加入 TheMarketBrew。接下来 3 天，你会每天收到一份完整的「推特日报」——华尔街 KOL 当日观点 + AI 立场聚合。我们用这种方式让你感受真实价值，再决定要不要订阅 Max。")}
{_para("下面是今天的推特日报：")}
<div style="border-left:3px solid #10b981;padding-left:16px;margin:16px 0;">
{digest_block}
</div>
{_para("如果还没完成 onboarding，可以现在去添加自选股，每天还能解锁一份只关于你持仓的「专属日报」。")}
<div style="margin-top:18px;">{_cta("完成 onboarding", f"{_EMAIL_LINK_BASE}/onboarding")}</div>
"""
    text = (
        "欢迎加入 TheMarketBrew。接下来 3 天会收到 3 份免费推特日报。"
        f"完成 onboarding: {_EMAIL_LINK_BASE}/onboarding"
    )
    return LifecycleEmail(subject=subject, html=_wrap("欢迎加入 TheMarketBrew", body, "推特日报前 3 封为新用户福利。"), text=text)


# ---------------------------------------------------------------------------
# D1 – Twitter Digest #2
# ---------------------------------------------------------------------------


def render_d1(name: str, twitter_digest_html: str = "") -> LifecycleEmail:
    subject = "[TheMarketBrew] 推特日报 #2 — 今日华尔街 KOL 怎么看"
    digest_block = twitter_digest_html or _para("今天的推特日报正在生成。")
    body = f"""
{_meta_intro(name)}
{_para("这是你的第 2 份推特日报。我们聚合了 27+ 位华尔街 KOL 的当日推文，AI 标注了立场 / 影响个股 / 重点观点。")}
<div style="border-left:3px solid #10b981;padding-left:16px;margin:16px 0;">
{digest_block}
</div>
{_para("如果你觉得这个有用，明天会发最后一份免费版，之后只对 Max 用户开放。")}
"""
    text = "第 2 份免费推特日报。明天发最后一份。"
    return LifecycleEmail(subject=subject, html=_wrap("推特日报 #2", body), text=text)


# ---------------------------------------------------------------------------
# D2 – Twitter Digest #3 + soft transition
# ---------------------------------------------------------------------------


def render_d2(name: str, twitter_digest_html: str = "") -> LifecycleEmail:
    subject = "[TheMarketBrew] 推特日报 #3 — 明天起仅 Max 可见"
    digest_block = twitter_digest_html or _para("今天的推特日报正在生成。")
    body = f"""
{_meta_intro(name)}
{_para("这是你最后一份免费推特日报。明天起，只有 Max 用户能继续每天收。")}
<div style="border-left:3px solid #10b981;padding-left:16px;margin:16px 0;">
{digest_block}
</div>
{_para("我们想让你先免费体验，再决定要不要订阅 — 这比让你交了钱才看到东西要诚实。后天我会发一封邮件，问你：这三份推特日报对你有用吗？")}
"""
    text = "第 3 份也是最后一份免费推特日报。"
    return LifecycleEmail(subject=subject, html=_wrap("推特日报 #3 (最后一份免费)", body), text=text)


# ---------------------------------------------------------------------------
# D4 – Twitter Digest → Max upsell
# ---------------------------------------------------------------------------


def render_d4(name: str) -> LifecycleEmail:
    subject = "[TheMarketBrew] 推特日报怎么样？升级 Max 每天继续收"
    body = f"""
{_meta_intro(name)}
{_para("过去 3 天你收到了 3 份推特日报。我想直接问你：这种「KOL 立场聚合 + AI 解读」对你有用吗？")}
{_para("如果你觉得有用，升级 Max 就能每天继续收。Max 一个月相当于一杯咖啡的钱，但每天能省你 30-60 分钟翻 X 的时间。")}
{_para("Max 还包含：")}
<ul style="color:#3f3f46;font-size:14px;line-height:1.9;margin:0 0 14px;padding-left:20px;">
  <li>AI 投研对话无限使用（Free / Pro 每天 2 次）</li>
  <li>AI 深度个股研究（基本面 + 技术面 + 新闻 + 宏观关联）</li>
</ul>
<div style="margin-top:18px;">{_cta("升级 Max — 每天继续推特日报", _PRICING_MAX_URL)}</div>
"""
    text = f"3 份推特日报已发完。升级 Max 每天继续收: {_PRICING_MAX_URL}"
    return LifecycleEmail(subject=subject, html=_wrap("推特日报怎么样？", body), text=text)


# ---------------------------------------------------------------------------
# D6 – Personal digest sample → Pro upsell
# ---------------------------------------------------------------------------


_SAMPLE_TICKERS = {
    "NVDA": {
        "name": "NVIDIA",
        "headline": "数据中心 GPU 需求超预期 / 估值压力上升",
        "insight": "短期: AI 资本开支信号偏暖。中期: hyperscaler 订单节奏 + 中美芯片关税演绎。",
    },
    "AAPL": {
        "name": "Apple",
        "headline": "iPhone 17 销售温和 / 服务业务持续强劲",
        "insight": "短期: 中国份额承压但服务利润率扩张。中期: AI on-device 节奏决定明年估值。",
    },
    "TSLA": {
        "name": "Tesla",
        "headline": "Cybercab 落地节奏 / 中国销量回暖",
        "insight": "短期: 4Q 交付指引乐观。中期: FSD 订阅渗透 + 储能业务双引擎。",
    },
}


def render_d6(name: str, sample_ticker: str = "NVDA") -> LifecycleEmail:
    sample = _SAMPLE_TICKERS.get(sample_ticker, _SAMPLE_TICKERS["NVDA"])
    subject = "[TheMarketBrew] 看看专属日报长什么样 (示例: " + sample["name"] + ")"
    body = f"""
{_meta_intro(name)}
{_para("「专属日报」每天根据你的持仓 + 当日新闻，AI 生成一份只关于你股票的分析。下面是一份示例:")}
<div style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:6px;padding:16px;margin:14px 0;">
  <p style="font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">{sample['name']} ({sample_ticker})</p>
  <p style="font-size:14px;color:#0a0a0a;font-weight:600;margin:0 0 6px;">{sample['headline']}</p>
  <p style="font-size:13px;color:#52525b;line-height:1.7;margin:0;">{sample['insight']}</p>
</div>
{_para("注: 这是示例。如果你升级 Pro，明天起每天收到一份只关于你自己持仓的版本。")}
<div style="margin-top:18px;">{_cta("升级 Pro — 解锁每天专属日报", _PRICING_PRO_URL)}</div>
"""
    text = f"专属日报示例。升级 Pro 解锁: {_PRICING_PRO_URL}"
    return LifecycleEmail(subject=subject, html=_wrap("专属日报长什么样", body), text=text)


# ---------------------------------------------------------------------------
# D8 – AI research intro
# ---------------------------------------------------------------------------


def render_d8(name: str) -> LifecycleEmail:
    subject = "[TheMarketBrew] 今天试试 AI 投研 — 一个示例查询"
    body = f"""
{_meta_intro(name)}
{_para("今天介绍另一个功能: AI 投研对话。你可以用自然语言问任何关于个股 / 宏观 / 财报的问题，AI 会立刻给答案 + 数据来源。")}
{_para("Free / Pro 用户每天 2 次免费。一个不错的开胃菜:")}
<div style="background:#f9fafb;border-left:3px solid #10b981;padding:14px 16px;margin:14px 0;">
  <p style="font-size:13px;color:#3f3f46;line-height:1.7;margin:0;font-style:italic;">
    "AAPL 下周财报，市场预期是什么？最大的几个风险点？"
  </p>
</div>
{_para("点下面进站试试。如果觉得 2 次不够用，可以升级 Max 解锁无限。")}
<div style="margin-top:18px;">{_cta("打开 AI 投研", f"{_EMAIL_LINK_BASE}/research")}</div>
"""
    text = f"试试 AI 投研: {_EMAIL_LINK_BASE}/research"
    return LifecycleEmail(subject=subject, html=_wrap("今天试试 AI 投研", body), text=text)


# ---------------------------------------------------------------------------
# D11 – Behavior-driven personal upsell
# ---------------------------------------------------------------------------


def render_d11(name: str, behavior_hint: str = "default") -> LifecycleEmail:
    """behavior_hint:
       - "max_pitch": user engaged heavily (Brew quota exhausted ≥2 times or D4 click)
       - "pro_pitch": user engaged moderately
       - "default": low engagement — soft Pro pitch
    """
    if behavior_hint == "max_pitch":
        subject = "[TheMarketBrew] 你已经用过几次 AI 投研，要不要解锁无限？"
        body = f"""
{_meta_intro(name)}
{_para("注意到你最近用了几次 AI 投研，但每天 2 次的限额是为了控制成本。如果你想无限使用 + 每天看推特日报 + 解锁个股深度研究，升级 Max 是为你设计的。")}
<div style="margin-top:18px;">{_cta("升级 Max", _PRICING_MAX_URL)}</div>
"""
        text = f"升级 Max 解锁无限: {_PRICING_MAX_URL}"
    elif behavior_hint == "pro_pitch":
        subject = "[TheMarketBrew] 把自选股变成日报，每天 30 秒读完"
        body = f"""
{_meta_intro(name)}
{_para("你已经建了自选股 — 升级 Pro 就能每天收到一份只关于你持仓的「专属日报」+ 早报 + 周报。30 秒读完，比刷一小时新闻效率高得多。")}
<div style="margin-top:18px;">{_cta("升级 Pro", _PRICING_PRO_URL)}</div>
"""
        text = f"升级 Pro 拿专属日报: {_PRICING_PRO_URL}"
    else:
        subject = "[TheMarketBrew] 注册第 11 天 — 哪些功能还没试？"
        body = f"""
{_meta_intro(name)}
{_para("你已经注册 11 天了。这里是一些你可能还没试过的功能:")}
<ul style="color:#3f3f46;font-size:14px;line-height:1.9;margin:0 0 14px;padding-left:20px;">
  <li><a href="{_EMAIL_LINK_BASE}/macro" style="color:#10b981;text-decoration:none;">宏观仪表盘</a> — 流动性、经济、通胀、情绪四维信号灯</li>
  <li><a href="{_EMAIL_LINK_BASE}/research" style="color:#10b981;text-decoration:none;">AI 投研对话</a> — 自然语言问问题</li>
  <li><a href="{_EMAIL_LINK_BASE}/for-you" style="color:#10b981;text-decoration:none;">For You 中心</a> — 你的自选股活动</li>
</ul>
{_para("升级 Pro 就能每天收到「专属日报」+ 早报 + 周报。")}
<div style="margin-top:18px;">{_cta("升级 Pro", _PRICING_PRO_URL)}</div>
"""
        text = f"哪些功能还没试? 升级 Pro: {_PRICING_PRO_URL}"
    return LifecycleEmail(subject=subject, html=_wrap("第 11 天 — 行为驱动推送", body), text=text)


# ---------------------------------------------------------------------------
# D14 – 14-day summary + limited offer
# ---------------------------------------------------------------------------


def render_d14(name: str, discount_pct: Optional[int] = 20) -> LifecycleEmail:
    discount = discount_pct or 20
    subject = f"[TheMarketBrew] 14 天总结 + 限时 {discount}% off"
    body = f"""
{_meta_intro(name)}
{_para("过去 14 天，你试用了 TheMarketBrew 的核心功能。这是最后一封 onboarding 邮件。")}
{_para(f"如果想升级，今天起 7 天内 Pro/Max 限时 {discount}% off。这是给 onboarding 期用户的一次性优惠，错过就没了。")}
<div style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:6px;padding:16px;margin:14px 0;">
  <p style="font-size:13px;color:#71717a;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Pro</p>
  <p style="font-size:14px;color:#3f3f46;line-height:1.7;margin:0 0 14px;">每天专属日报 + 早报 + 周报 + 完整网站</p>
  <p style="font-size:13px;color:#71717a;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Max</p>
  <p style="font-size:14px;color:#3f3f46;line-height:1.7;margin:0;">Pro 全部 + 推特日报 + AI 投研无限 + 个股深度研究无限</p>
</div>
<div style="margin-top:18px;">{_cta(f"升级 Pro (限时 {discount}% off)", _PRICING_PRO_URL)} {_cta(f"升级 Max", _PRICING_MAX_URL, primary=False)}</div>
"""
    text = f"14 天 onboarding 结束。限时 {discount}% off: {_PRICING_PRO_URL}"
    return LifecycleEmail(subject=subject, html=_wrap(f"14 天总结 — 限时 {discount}% off", body), text=text)


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------

# Maps day_int -> render function. Used by lifecycle_scheduler to pick the
# right template for a given user's signup-age.
LIFECYCLE_DAYS = (0, 1, 2, 4, 6, 8, 11, 14)


def render(day: int, name: str = "", **kwargs) -> Optional[LifecycleEmail]:
    """Dispatch render by day_int. Returns None if day is not a lifecycle day."""
    if day == 0:
        return render_d0(name, twitter_digest_html=kwargs.get("twitter_digest_html", ""))
    if day == 1:
        return render_d1(name, twitter_digest_html=kwargs.get("twitter_digest_html", ""))
    if day == 2:
        return render_d2(name, twitter_digest_html=kwargs.get("twitter_digest_html", ""))
    if day == 4:
        return render_d4(name)
    if day == 6:
        return render_d6(name, sample_ticker=kwargs.get("sample_ticker", "NVDA"))
    if day == 8:
        return render_d8(name)
    if day == 11:
        return render_d11(name, behavior_hint=kwargs.get("behavior_hint", "default"))
    if day == 14:
        return render_d14(name, discount_pct=kwargs.get("discount_pct", 20))
    return None
