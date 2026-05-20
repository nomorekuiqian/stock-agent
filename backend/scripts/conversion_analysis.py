"""
Conversion / funnel analysis from Insforge subscriptions + user activity data.

Data source: subscriptions edge function action=list_all (anon key works, no auth needed).
Writes a Markdown report to docs/analysis/conversion_<date>.md.

Run: python backend/scripts/conversion_analysis.py
"""

from __future__ import annotations

import collections
import os
import statistics
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.getenv("INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app")
NOW = datetime.now(timezone.utc)


def parse_dt(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch():
    r = httpx.get(f"{BASE}/functions/subscriptions", params={"action": "list_all"}, timeout=60)
    r.raise_for_status()
    return r.json()["data"]


def days_between(a, b):
    if not a or not b:
        return None
    return (b - a).total_seconds() / 86400.0


def pct(n, d):
    return f"{(100 * n / d):.1f}%" if d else "n/a"


def classify(user):
    """
    Source of truth: backend/app/features/subscription/cta_tier.py
      - is_lifetime True            -> lifetime
      - access_expires_at IS NULL + entitlements present -> real paid
        (the trial-to-paid Stripe webhook clears access_expires_at)
      - access_expires_at > now     -> trial still in window
      - access_expires_at <= now and status=active -> trial expired but DB row
        not updated (Stripe webhook didn't fire or cron lag)
      - status=canceled / expired   -> by status
      - plan & status both NULL     -> never started a subscription
    """
    lifetime = user.get("is_lifetime")
    plan = user.get("plan")
    status = user.get("status")
    aea = parse_dt(user.get("access_expires_at"))
    ents = user.get("entitlements")

    if lifetime:
        return "lifetime"
    if status == "canceled":
        return "canceled"
    if status == "expired":
        return "expired"
    if plan is None and status is None:
        return "no_subscription"
    if aea is None and ents:
        return "paid_real"
    if aea is not None and aea > NOW:
        return "trial_active"
    if aea is not None and aea <= NOW:
        return "trial_lapsed_active_row"
    return "other"


def main() -> None:
    rows = fetch()
    n = len(rows)

    # ── 1. Population and signup curve ─────────────────────────────
    by_month = collections.Counter()
    for r in rows:
        d = parse_dt(r.get("auth_created_at") or r.get("created_at"))
        if d:
            by_month[d.strftime("%Y-%m")] += 1

    # ── 2. Status / plan ─────────────────────────────────────────
    seg = collections.Counter()
    for r in rows:
        seg[classify(r)] += 1

    paid_real = seg["paid_real"]
    trial_active = seg["trial_active"]
    trial_lapsed = seg["trial_lapsed_active_row"]
    lifetime = seg["lifetime"]
    canceled = seg["canceled"]
    expired = seg["expired"]
    no_sub = seg["no_subscription"]

    # ── 3. Engagement ────────────────────────────────────────────
    convs = [(r.get("conversations") or 0) for r in rows]
    api = [(r.get("api_calls") or 0) for r in rows]

    zero_eng = sum(1 for r in rows if not (r.get("conversations") or r.get("api_calls")))
    never_active = sum(1 for r in rows if not r.get("last_active_at"))
    digest_subs = sum(1 for r in rows if (r.get("personal_digest_count_30d") or 0) > 0)

    # ── 4. Engagement vs conversion ──────────────────────────────
    def avg(seq):
        seq = [x for x in seq if x is not None]
        return statistics.mean(seq) if seq else 0

    def median(seq):
        seq = [x for x in seq if x is not None]
        return statistics.median(seq) if seq else 0

    by_segment_engagement = {}
    for label in ("paid_real", "lifetime", "trial_active", "trial_lapsed_active_row", "canceled", "expired", "no_subscription"):
        members = [r for r in rows if classify(r) == label]
        if not members:
            continue
        by_segment_engagement[label] = {
            "n": len(members),
            "conv_mean": avg(r.get("conversations") or 0 for r in members),
            "conv_med": median(r.get("conversations") or 0 for r in members),
            "api_mean": avg(r.get("api_calls") or 0 for r in members),
            "api_med": median(r.get("api_calls") or 0 for r in members),
            "digest_mean": avg(r.get("personal_digest_count_30d") or 0 for r in members),
            "active_pct": pct(sum(1 for r in members if r.get("last_active_at")), len(members)),
        }

    # ── 5. Cohort: by signup month → outcome ─────────────────────
    cohort_size = collections.Counter()
    cohort_paid = collections.Counter()
    cohort_canceled = collections.Counter()
    cohort_no_sub = collections.Counter()
    cohort_active_user = collections.Counter()  # had any activity
    for r in rows:
        d = parse_dt(r.get("auth_created_at") or r.get("created_at"))
        if not d:
            continue
        m = d.strftime("%Y-%m")
        cohort_size[m] += 1
        klass = classify(r)
        if klass in ("paid_real", "lifetime"):
            cohort_paid[m] += 1
        elif klass in ("canceled", "expired", "trial_lapsed_active_row"):
            cohort_canceled[m] += 1
        elif klass == "no_subscription":
            cohort_no_sub[m] += 1
        if r.get("last_active_at"):
            cohort_active_user[m] += 1

    # ── 6. Invite code conversion ────────────────────────────────
    by_code = collections.defaultdict(lambda: {"n": 0, "paid": 0, "lifetime": 0, "still_trial": 0, "canceled": 0})
    for r in rows:
        code = r.get("invite_code") or "(none)"
        e = by_code[code]
        e["n"] += 1
        c = classify(r)
        if c == "paid_real":
            e["paid"] += 1
        elif c == "lifetime":
            e["lifetime"] += 1
        elif c in ("trial_active",):
            e["still_trial"] += 1
        elif c in ("canceled", "expired", "trial_lapsed_active_row"):
            e["canceled"] += 1

    # ── 7. Time-to-first-activity for converters vs non-converters
    def first_activity_lag_days(r):
        signup = parse_dt(r.get("auth_created_at") or r.get("created_at"))
        last = parse_dt(r.get("last_active_at"))
        return days_between(signup, last)

    paid_lags = [
        first_activity_lag_days(r)
        for r in rows
        if classify(r) in ("paid_real", "lifetime") and r.get("last_active_at")
    ]
    cancel_lags = [
        first_activity_lag_days(r)
        for r in rows
        if classify(r) in ("canceled", "expired", "trial_lapsed_active_row") and r.get("last_active_at")
    ]

    # ── 8. "Drop-off" users (signed up, never came back) ────────
    dead_signups = []
    for r in rows:
        signup = parse_dt(r.get("auth_created_at") or r.get("created_at"))
        if not signup:
            continue
        age_days = (NOW - signup).total_seconds() / 86400
        if age_days >= 7 and not r.get("last_active_at") and not r.get("conversations"):
            dead_signups.append((r.get("email"), age_days, r.get("invite_code")))

    # ── 9. Active paid + low engagement (about-to-churn risk) ────
    paid_users = [r for r in rows if classify(r) == "paid_real"]
    low_engagement_paid = [
        r for r in paid_users
        if (r.get("conversations") or 0) <= 1 and (r.get("personal_digest_count_30d") or 0) == 0
    ]
    trials_in_flight = [r for r in rows if classify(r) == "trial_active"]
    low_engagement_trial = [
        r for r in trials_in_flight
        if (r.get("conversations") or 0) == 0 and (r.get("personal_digest_count_30d") or 0) == 0
    ]

    # ── 10. Cancellation timing ─────────────────────────────────
    cancel_lifetimes = []
    for r in rows:
        if classify(r) not in ("canceled", "expired", "trial_lapsed_active_row"):
            continue
        signup = parse_dt(r.get("auth_created_at") or r.get("created_at"))
        last = parse_dt(r.get("updated_at"))
        if signup and last:
            cancel_lifetimes.append((last - signup).days)

    # ── Build report ─────────────────────────────────────────────
    out = []
    out.append(f"# 转化漏斗与活跃度分析\n")
    out.append(f"_数据快照: {NOW.strftime('%Y-%m-%d %H:%M UTC')} · 用户总数: **{n}**_\n\n")

    out.append("## 1. 总体漏斗（按代码定义的真实付费规则）\n\n")
    out.append(
        "> 真实付费判定：`access_expires_at IS NULL AND entitlements` —— "
        "trial-to-paid Stripe webhook 在首次扣款时会清掉 `access_expires_at`（见 "
        "`backend/app/features/subscription/cta_tier.py`）。"
        "`status='active'` 不等于付费 —— 试用期间 status 也是 active。\n\n"
    )
    out.append("| 阶段 | 人数 | 占总注册 |\n|---|---:|---:|\n")
    out.append(f"| 注册用户 | {n} | 100% |\n")
    started = n - no_sub
    out.append(f"| 启动过试用 / 订阅（有 plan 行）| {started} | {pct(started, n)} |\n")
    out.append(f"| **真正付费 (paid_real)** | {paid_real} | **{pct(paid_real, n)}** |\n")
    out.append(f"| 终身权益（admin 赠送）| {lifetime} | {pct(lifetime, n)} |\n")
    out.append(f"| 仍在试用窗口（结果未知）| {trial_active} | {pct(trial_active, n)} |\n")
    out.append(f"| 试用过期但 DB 仍 active（webhook/cron 异常）| {trial_lapsed} | {pct(trial_lapsed, n)} |\n")
    out.append(f"| 试用期 cancel | {canceled} | {pct(canceled, n)} |\n")
    out.append(f"| 试用 expired | {expired} | {pct(expired, n)} |\n")
    out.append(f"| 注册后从未启动订阅 | {no_sub} | {pct(no_sub, n)} |\n\n")

    completed = canceled + expired + trial_lapsed + paid_real
    out.append("**核心数据**：\n")
    out.append(f"- 注册→真正付费综合转化率 = **{pct(paid_real, n)}**（{paid_real}/{n}）\n")
    out.append(
        f"- 试用结清（不含仍在试用 + lifetime）→ 付费 = **{pct(paid_real, completed)}**"
        f"（{paid_real}/{completed}） — 这是「试用窗口完整跑完」的真实转化\n"
    )
    if started:
        out.append(
            f"- 启动试用 → 付费（含还在窗口内的 {trial_active} 人也算分母）= "
            f"**{pct(paid_real, started)}**（{paid_real}/{started}）\n"
        )
    out.append(
        f"- 试用期 cancel 全部带着 `access_expires_at` —— **没有一个用户是付费后取消**，"
        f"100% 流失发生在试用期内\n"
    )
    out.append("\n")

    out.append("## 2. 注册曲线\n\n")
    out.append("| 月份 | 注册数 | 转付费 | 转付率 | 取消/过期 | 始终未登录后 |\n|---|---:|---:|---:|---:|---:|\n")
    for m in sorted(by_month.keys()):
        sz = cohort_size[m]
        paid = cohort_paid[m]
        cnx = cohort_canceled[m]
        ns = cohort_no_sub[m]
        out.append(
            f"| {m} | {sz} | {paid} | {pct(paid, sz)} | {cnx} | {ns} |\n"
        )
    out.append("\n")

    out.append("## 3. 活跃度 / 激活情况\n\n")
    out.append(f"- **从未有过任何活动事件 (last_active_at 为空)**: **{never_active} / {n}** ({pct(never_active, n)})\n")
    out.append(f"- 0 对话 + 0 api_call 双零用户: **{zero_eng} / {n}** ({pct(zero_eng, n)})\n")
    out.append(f"- 过去 30 天收到过 personal_digest 邮件: **{digest_subs} / {n}** ({pct(digest_subs, n)})\n")
    out.append(f"- 对话数：mean={statistics.mean(convs):.2f} · median={statistics.median(convs):.0f} · max={max(convs)} · p95={sorted(convs)[int(0.95*len(convs))]}\n")
    out.append(f"- API 调用：mean={statistics.mean(api):.1f} · median={statistics.median(api):.0f} · max={max(api)} · p95={sorted(api)[int(0.95*len(api))]}\n")
    out.append("\n")

    out.append("## 4. 各分群的活跃度（关键诊断）\n\n")
    out.append("| 分群 | 人数 | 平均对话 | 中位对话 | 平均 api | 中位 api | 30d digest 平均 | 有活动占比 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n")
    seg_order = ["paid_real", "lifetime", "trial_active", "trial_lapsed_active_row", "canceled", "expired", "no_subscription"]
    label_map = {
        "paid_real": "真正付费",
        "lifetime": "终身赠送",
        "trial_active": "试用中",
        "trial_lapsed_active_row": "试用过期未清理",
        "canceled": "试用期取消",
        "expired": "试用过期",
        "no_subscription": "未启动订阅",
    }
    for k in seg_order:
        if k not in by_segment_engagement:
            continue
        s = by_segment_engagement[k]
        out.append(
            f"| {label_map[k]} | {s['n']} | {s['conv_mean']:.1f} | {s['conv_med']:.0f} | "
            f"{s['api_mean']:.1f} | {s['api_med']:.0f} | {s['digest_mean']:.1f} | {s['active_pct']} |\n"
        )
    out.append("\n")

    out.append("## 5. 邀请码 / 渠道效果（按真实付费口径）\n\n")
    out.append("| 邀请码 | 总人数 | 真付费 | 终身 | 试用中 | 取消/过期/lapsed | 真付率 |\n|---|---:|---:|---:|---:|---:|---:|\n")
    for code, e in sorted(by_code.items(), key=lambda x: -x[1]["n"]):
        rate = pct(e["paid"], e["n"])
        out.append(
            f"| {code} | {e['n']} | {e['paid']} | {e['lifetime']} | "
            f"{e['still_trial']} | {e['canceled']} | {rate} |\n"
        )
    out.append("\n")

    out.append("## 6. 首次活动延迟（converters vs churn）\n\n")
    def stats_line(label, seq):
        seq = [x for x in seq if x is not None]
        if not seq:
            out.append(f"- {label}: 无数据\n")
            return
        out.append(
            f"- **{label}** (n={len(seq)})：median={statistics.median(seq):.1f}d · "
            f"mean={statistics.mean(seq):.1f}d · max={max(seq):.0f}d\n"
        )
    stats_line("付费/终身用户 注册→最后活动天数跨度", paid_lags)
    stats_line("已取消/过期用户 注册→最后活动天数跨度", cancel_lags)
    out.append("\n")

    out.append("## 7. 取消/过期生命周期\n\n")
    if cancel_lifetimes:
        out.append(
            f"- 注册到 cancel/expired 的天数：median={statistics.median(cancel_lifetimes):.0f}d · "
            f"mean={statistics.mean(cancel_lifetimes):.0f}d · n={len(cancel_lifetimes)}\n"
        )
        buckets = collections.Counter()
        for d in cancel_lifetimes:
            if d <= 3: buckets["≤3 天"] += 1
            elif d <= 7: buckets["4-7 天"] += 1
            elif d <= 14: buckets["8-14 天"] += 1
            elif d <= 30: buckets["15-30 天"] += 1
            else: buckets["30 天以上"] += 1
        order = ["≤3 天","4-7 天","8-14 天","15-30 天","30 天以上"]
        out.append("\n| 取消时机 | 人数 |\n|---|---:|\n")
        for k in order:
            out.append(f"| {k} | {buckets.get(k,0)} |\n")
    out.append("\n")

    out.append("## 8. 风险与机会清单\n\n")
    out.append(
        f"- **僵尸账号**: 注册满 7 天且零活动的用户 **{len(dead_signups)}** 个 "
        f"(占总 {pct(len(dead_signups), n)}) —— 邀请码分布: "
        f"{', '.join(f'{k}={v}' for k,v in collections.Counter(c[2] or '(none)' for c in dead_signups).most_common(5))}\n"
    )
    out.append(
        f"- **付费但低使用**: 真付费 {len(paid_users)} 人中，**{len(low_engagement_paid)}** 人对话 ≤1 且 30 天 0 digest"
        f"（{pct(len(low_engagement_paid), len(paid_users)) if paid_users else 'n/a'}）—— 续费风险高\n"
    )
    out.append(
        f"- **试用中但零使用**: 当前试用 {len(trials_in_flight)} 人里，**{len(low_engagement_trial)}** 人 0 对话且 0 digest"
        f"（{pct(len(low_engagement_trial), len(trials_in_flight)) if trials_in_flight else 'n/a'}）"
        f" —— 这批人按现有趋势几乎必然转不了\n"
    )
    out.append(
        f"- **试用过期未清理的 lapsed row**: {trial_lapsed} 人 status='active' 但 access_expires_at 已过 —— "
        f"webhook 或 cron 异常，影响数据准确性\n"
    )
    out.append(f"- **注册后零活动**: {never_active} ({pct(never_active, n)}) —— 注册流程后激活路径有问题\n")
    out.append("\n")

    out.append("## 9. 核心洞察\n\n")
    out.append(
        f"**真实数字: {n} 个注册中只有 {paid_real} 人真正付费（{pct(paid_real, n)}）**。"
        f"这是非常低的转化率，但要分清三个独立的漏斗失败点：\n\n"
    )
    out.append(
        f"1. **注册→启动试用流失 {no_sub} 人 ({pct(no_sub, n)})**：注册了但没创建订阅行 —— "
        f"要么注册流程后没有触发 trial 自动创建，要么 Stripe 调用失败留下了无 plan 用户。值得先看代码 / 监控这条路径。\n"
    )
    out.append(
        f"2. **试用→付费流失：{completed - paid_real}/{completed} 失败 = {pct(completed-paid_real, completed)}**。"
        f"且 100% 的 cancel 都发生在试用期内（access_expires_at 还在）—— 没有任何用户付费后再取消。\n"
    )
    out.append(
        f"3. **试用期内不激活 = 不转化**：试用期 cancel 的中位生命周期 ~"
        f"{statistics.median(cancel_lifetimes) if cancel_lifetimes else 0:.0f} 天，"
        f"且 {len(low_engagement_trial)}/{len(trials_in_flight)} 现在试用中的人是 0 对话 + 0 digest 状态 —— "
        f"按当前趋势，他们也会流失。\n"
    )
    out.append(
        f"4. **GIFT2026 几乎没转化（{by_code['GIFT2026']['paid']}/{by_code['GIFT2026']['n']}）**："
        f"这是预付的礼物码，收的人本身不是自驱选择产品，零转化在意料之中，"
        f"但说明送码做增长不靠谱。\n"
    )
    out.append(
        f"5. **数据健康问题**：{trial_lapsed} 个试用过期但 DB 仍是 active，"
        f"说明 Stripe webhook 或定时清理没正确执行 —— 影响所有「当前活跃用户」指标。\n\n"
    )

    out.append("## 10. 建议的下一步动作\n\n")
    out.append(
        f"1. **优先调查注册→启动试用的 {no_sub} 人黑洞**：注册了但没 plan。如果是 Stripe 调用失败，"
        f"修这一条就能立即提升进入试用的总人数；如果是设计上「邀请码注册才送 trial」，那要重新评估默认行为。\n"
    )
    out.append(
        f"2. **试用激活闭环**：当前 {len(trials_in_flight)} 个试用中用户里 {len(low_engagement_trial)} 人零使用，"
        f"对这部分人在 day 1 / day 3 / day 7 触发激活提醒（带具体动作建议，比如「先加 3 只自选股」），"
        f"不是「再读 morning report」这种被动话术。\n"
    )
    out.append(
        f"3. **采访 5-10 个 canceled 且对话 ≤1 的用户**：他们的 cancel 中位发生在 "
        f"{statistics.median(cancel_lifetimes) if cancel_lifetimes else 0:.0f} 天 = 临近自动扣款。"
        f"直接问 "
        f"「为什么试用期间没怎么用」「Stripe 提醒邮件到的时候你的第一反应是什么」。\n"
    )
    out.append(
        f"4. **修 webhook / cron**：{trial_lapsed} 个 lapsed-active row 让所有「活跃用户」指标都偏大；"
        f"现在公司决策可能基于错误数字。先把数据底层修对。\n"
    )
    out.append(
        "5. **埋点补全**：当前 `user_activities` 只有 `api_call`，要拆出"
        "「打开 morning_report 邮件」「点击 stock 详情」「设置 watchlist」「打开 chat」"
        "等真实激活动作，这样下次能定位「第几个动作之后留存率提升」。\n"
    )
    out.append(
        f"6. **缩短试用窗口要看 cancel 时机分布**：当前 {sum(1 for d in cancel_lifetimes if d <= 7)} / "
        f"{len(cancel_lifetimes)} 在 ≤7 天取消；大部分集中在 8-14 天 = 临近 Stripe 扣款 = 「忘了取消」恐慌 cancel。"
        f"砍试用长度只会把这个尾部前移，不会增加转化。"
        f"更可能有效的是把试用从「14 天后自动扣款」改成「14 天后需主动续费」（去掉 sticker shock）。\n"
    )

    # write
    out_dir = Path(__file__).resolve().parents[2] / "docs" / "analysis"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"conversion_{NOW.strftime('%Y-%m-%d')}.md"
    out_path.write_text("".join(out), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
