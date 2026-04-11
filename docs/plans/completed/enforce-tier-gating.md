# Enforce Tier Gating + Subscription Sync Architecture

> Status: Planning
> Related: features/subscription/.context.md, features/payment/.context.md, features/invites/.context.md
> Vision: 产品策略.md > 现有模块演进（商业化执行）

## 目标

解决两个相互关联的问题：

1. **短期（本周内）**：在生产环境真正启用已部署但未激活的三档订阅 gating
   - **Free**：只收晚间市场日报（evening segment）
   - **Pro**：全部邮件（晚报 + 早报 + 周报 + 专属持仓日报） + 日报相关网站功能（`/today`、`/for-you`、`/today/archive`）
   - **Max**：Pro 全部权益 + 深度网站功能（`/morning`、`/macro/*`、`/stock/*`、`/research`、`/liquidity`）

2. **长期**：重构订阅状态管理，建立**以 Insforge 数据库为单一真相源（source of truth），Resend segments 作为派生状态**的工程架构，根除"数据库说用户是 free，但还在收 Pro 邮件"这类漂移问题。

## 核心原则（整个方案都服从这三条）

1. **Insforge = 真相，Resend = 缓存**
   - `subscriptions` 表和新建的 `email_preferences` 表共同定义"谁应该收什么邮件"
   - Resend segment 成员资格是从这两张表计算出来的派生状态
   - 任何读查询都可以不读 Resend 就回答（读数据库就够了）

2. **唯一的 Resend 写入点**
   - 只有一个函数 `sync_user_segments(user_id)` 能写 Resend segments
   - 所有其他代码（webhook、API、cron）都通过调用这个函数间接写
   - 这个函数是幂等的：给同一个用户调多次结果一样

3. **任何漂移都是事故（incident）**
   - 稳态下 reconciliation cron 应该发现 0 drift
   - 发现 drift 就是 bug，记 warning 并告警
   - 不是"定期修复"，是"定期体检"

## 现状 vs 目标架构

### 现状（问题所在）

```
    ┌─────────────────────────────────┐
    │     多个独立写入点写 Resend        │
    │                                  │
    │   signup flow  ──┐               │
    │   preferences API ─┤             │
    │   manual edits ────┤─→ Resend    │    ← 多头写入
    │   (nothing at all for invite     │       无协调
    │    expiry / Stripe cancel)       │       无回放
    │                                  │
    └─────────────────────────────────┘
              │
              │    ?   谁在里面？不确定
              ▼
    ┌─────────────────────────────────┐
    │     Resend Segments             │
    │     （被当作真相源）              │    ← 无法审计
    └─────────────────────────────────┘
              │
              ▼
          广播发送
```

**已识别的漂移来源**：
- `update_email_preferences` API 无 Pro 校验 → free 用户可自助加入 Pro segment
- Stripe `subscription.deleted` webhook 只更新 Insforge，**没同步 Resend**
- 邀请码过期无任何 hook → 过期用户仍在 Pro segments 里
- `EMAIL_PRO_GATE` 默认 false → 专属日报无运行时校验
- 任何新功能忘了更新 Resend 都会静默漂移

### 目标

```
    ┌─────────────────────────────────┐
    │        Insforge (真相源)          │
    │                                  │
    │   subscriptions 表                │
    │   email_preferences 表 (新)       │
    │                                  │
    └─────────────────────────────────┘
              │
              │  读
              ▼
    ┌─────────────────────────────────┐
    │   sync_user_segments(user_id)    │    ← 唯一写入点
    │   (唯一写 Resend 的函数)           │       幂等
    │                                  │       可重放
    └─────────────────────────────────┘
              │
              │  写
              ▼
    ┌─────────────────────────────────┐
    │     Resend Segments (派生状态)    │
    │     （广播发送用，不是真相源）      │
    └─────────────────────────────────┘
              ▲
              │
    ┌─────────┴───────────────────────┐
    │  触发 sync 的事件                  │
    │                                   │
    │  • Stripe webhook (upsert/delete) │
    │  • invite redeem                  │
    │  • preferences API                │
    │  • invite expiry cron (daily)     │
    │  • reconciliation cron (6h)       │
    └──────────────────────────────────┘
```

## 设计

### 数据模型

#### 新表：`email_preferences`

```sql
CREATE TABLE email_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_report     BOOLEAN NOT NULL DEFAULT true,
    morning_report   BOOLEAN NOT NULL DEFAULT false,
    weekly_report    BOOLEAN NOT NULL DEFAULT false,
    personal_digest  BOOLEAN NOT NULL DEFAULT false,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**设计要点**：
- 每个认证用户一行。匿名（邮箱订阅）用户不存这里，他们只能收 daily_report（free 级别），由 Resend 直接管理。
- 默认值：新用户注册时，`daily_report=true`（免费默认开），其它 false（Pro 专属，需主动开启）
- 布尔字段而不是列表/JSON：简单、快、可 SQL index

#### 现有 `subscriptions` 表（不动）

继续作为 Pro/Max 状态的真相源：
- `plan IN ('pro', 'max') AND status='active' AND (access_expires_at IS NULL OR access_expires_at > now)` ⇒ 用户是 Pro

### 核心函数：`sync_user_segments`

所有 Resend segment 写操作必须通过这一个函数。

**文件**：`backend/app/features/subscription/sync.py` (新)

```python
"""
Segment sync: single source of truth synchronization.

This module is the ONLY place in the codebase that may write to Resend
segments. All other code calls `sync_user_segments(user_id)`.
"""
from dataclasses import dataclass
from typing import List

@dataclass
class SyncResult:
    user_id: str
    email: str
    is_pro: bool
    actions: List[str]  # e.g. ["added to morning", "removed from weekly"]
    drifted: bool       # True if any action was taken

async def sync_user_segments(user_id: str, email: str) -> SyncResult:
    """
    Reconcile Resend segment membership for a user based on Insforge state.

    Idempotent. Safe to call any number of times.

    Called from:
      - Stripe webhook (subscription.updated / subscription.deleted)
      - invite redeem success
      - invite expiry cron
      - preferences API (after DB write)
      - reconciliation cron (full scan)
    """
    sub = await get_payment_subscription(user_id)
    is_pro = _is_pro_user(sub)

    prefs = await get_email_prefs_from_db(user_id)
    # prefs = EmailPreferences(daily_report, morning_report, weekly_report, personal_digest)

    # Desired segment state (truth)
    desired = {
        RESEND_SEGMENT_EVENING: prefs.daily_report,                  # free tier allowed
        RESEND_SEGMENT_MORNING: is_pro and prefs.morning_report,     # Pro gated
        RESEND_SEGMENT_WEEKLY:  is_pro and prefs.weekly_report,      # Pro gated
    }

    # Actual state (cache)
    current = await _get_user_segments_from_resend(email)

    actions = []
    for seg_id, should_be in desired.items():
        is_in = seg_id in current
        if should_be and not is_in:
            await _resend_segment_add(email, seg_id)
            actions.append(f"added to {seg_id}")
        elif not should_be and is_in:
            await _resend_segment_remove(email, seg_id)
            actions.append(f"removed from {seg_id}")

    # personal_digest uses a different audience (not a segment), handled separately
    # It has its own subscribe/unsubscribe calls to the Personal Digest audience.

    if actions:
        logger.info(
            "sync_user_segments: user_id=%s email=%s is_pro=%s actions=%s",
            user_id[:8], email, is_pro, actions,
        )

    return SyncResult(
        user_id=user_id,
        email=email,
        is_pro=is_pro,
        actions=actions,
        drifted=bool(actions),
    )
```

**关键特性**：
- 幂等：连调 10 次和调 1 次结果相同
- 读取都是真相源（Insforge），不信任 Resend 作为输入
- Resend 操作封装在 `_resend_*` 内部函数，未来换邮件服务可独立替换
- 返回 `SyncResult` 让调用方能审计和记录

### 事件触发点（5 个）

每个真相源变化的地方都要调 sync。

| # | 触发点 | 位置 | 当前状态 |
|---|---|---|---|
| 1 | Stripe webhook `subscription.updated` / `checkout.session.completed` | `payment/router.py` | 只 upsert DB，**未同步 Resend** |
| 2 | Stripe webhook `subscription.deleted` | `payment/router.py` | 只 upsert DB，**未同步 Resend** |
| 3 | 邀请码兑换成功 | `invites/db.py redeem_code` | 只 upsert DB，**未同步 Resend** |
| 4 | 用户修改偏好 | `subscription/router.py update_email_preferences` | 直接写 Resend，**绕过 DB**（反的） |
| 5 | 邀请码过期 | **不存在** | 需新建 daily cron |

每个点改造后都是"写 DB → 调 sync_user_segments"。

### Reconciliation Cron（安全网）

**路径**：`POST /api/cron/reconcile-segments`，Cron Secret 保护
**调度**：每 6 小时一次（GitHub Actions 或 Railway cron）
**行为**：
```python
async def reconcile_all_users():
    users = await db.list_users_with_email_preferences()
    total, drifted = 0, 0
    for user in users:
        result = await sync_user_segments(user.id, user.email)
        total += 1
        if result.drifted:
            drifted += 1
            logger.warning("DRIFT: %s", result)

    logger.info("Reconciliation: scanned=%d drifted=%d", total, drifted)

    # Alert on drift — steady state should be 0
    if drifted > 0:
        logger.error("DRIFT DETECTED: %d users required reconciliation", drifted)
        # Optional: send alert to Discord/email
```

**重要**：稳态下 `drifted` 应该恒等于 0。任何非零都意味着事件驱动 sync 漏了某个点 → 追溯日志，修 bug。

### 匿名订阅者（landing page 邮箱订阅）

这些用户没有 user_id，只在 Resend 里有一条 contact。

**规则**：
- 永远只在 `RESEND_SEGMENT_EVENING`（免费日报）里
- 不出现在 `email_preferences` 表里
- Reconciliation cron **跳过**他们（按 `user_id IS NOT NULL` 过滤）
- 如果某个匿名订阅者后来注册账号 → `/api/subscriptions/sync-user` 创建 `email_preferences` 行 → 调 sync

### 前端 PaywallGuard 等级（选项 B，当前即目标）

不需要改代码。决策已确认：

| 页面 | `requiredPlan` | 状态 |
|---|---|---|
| `/today`, `/today/archive` | `pro` | ✅ 符合目标 |
| `/for-you`, `/for-you/watchlist` | `pro` | ✅ 符合目标 |
| `/morning`, `/morning/archive` | `max` | ✅ 符合目标 |
| `/macro/*`(layout) | `max` | ✅ 符合目标 |
| `/stock`, `/stock/[symbol]` | `max` | ✅ 符合目标 |
| `/research` | `max` | ✅ 符合目标 |
| `/liquidity` (layout) | `max` | ✅ 符合目标 |

但 pricing 页面文案要修（见 Phase A 第 4 步）。

## 实施阶段

### Part 1：短期止血（本周）

#### Phase A — 堵住漏洞（今天可完成）

**目标**：不再产生新的漂移。不动数据，不改架构，只补 API 校验 + 激活已有的 dead branch。

A1. **后端 `update_email_preferences` 加 Pro 校验**（已部分完成）
   - ✅ 已 import `get_payment_subscription`、新增 `_is_pro_user`（router.py 顶部）
   - [ ] 在 `update_email_preferences` 函数里实际调用校验，对尝试开启 morning/weekly/personal_digest 的 free 用户返回 403
   - [ ] 只校验"开启"，"关闭"永远允许（防止 Pro 降级后无法退订）

A2. **跑 `test_pro_gate_unit.py` 验证**
   - [ ] 确认 4 个测试 case 都过
   - [ ] 把该文件从 untracked 转为 committed

A3. **Railway 设 `EMAIL_PRO_GATE=true`**
   - [ ] 添加环境变量
   - [ ] 重启后端
   - [ ] 手动触发一次 personal_digest 广播验证 "Pro gate: skipping" 日志出现

A4. **修 pricing 页面文案**
   - [ ] `pricing/page.tsx` 的 `PRO_FEATURES[1]`："盘前早报 + 盘后晚报" 描述改为 "每日邮件推送晚报和早报"（去掉"网站查看"，因为 `/morning` 是 Max-only）
   - [ ] FAQ "Pro 和 Max 有什么区别" 的回答明确网站深度功能是 Max 独享

**Phase A 结束后的状态**：新漂移被阻止，但**历史漂移仍存在**（可能有 free 用户已经在 Pro segments 里收邮件）。Phase B 处理这部分。

#### Phase B — 历史漂移清理（你手动发邮件）

**目标**：列出当前 Pro segments 里的非 Pro 用户，生成通知内容给你手动发送；7 天后执行移除。

B1. **写识别脚本 `backend/scripts/audit_pro_segments.py`**
   - 输入：无参数或 `--output-dir`
   - 行为：
     1. 从 Resend 拉取 `RESEND_SEGMENT_MORNING` 和 `RESEND_SEGMENT_WEEKLY` 的全部 contacts
     2. 对每个 contact，从 `last_name` JSON 提取 user_id
     3. 反查 Insforge `subscriptions`，判断是否 Pro
     4. 生成两份输出文件到 `docs/reports/pro-segment-cleanup-{YYYY-MM-DD}/`：
        - `recipients.csv` — `email, first_name, user_id, segments_affected, status`
        - `notification.md` — 一份 Markdown 文件，包含统一的邮件 subject + HTML + plain text 模板，以及 recipients 列表
   - **不发邮件**。只输出文件。
   - Dry-run 模式默认开启输出到 stdout；加 `--write` 才落盘

B2. **你审阅文件 → 手动发送**
   - 打开 `docs/reports/pro-segment-cleanup-{date}/recipients.csv` 审阅名单
   - 从 `notification.md` 复制 subject + body
   - 通过你选择的方式发送：
     - **推荐**：在 Resend dashboard 建一个临时 audience，上传 CSV，创建 broadcast，一键发送（保持品牌一致性）
     - 备选：你自己的邮件工具逐个发
   - 发送后在某处记录发送日期（用于 7 天后的第二步）

B3. **7 天后执行移除脚本 `--execute-removal`**
   - 输入：`--execute-removal --notified-at YYYY-MM-DD`（你填发送日期）
   - 行为：
     1. 重新从 Resend 拉两个 Pro segment 的当前成员
     2. 对每个成员**重新**反查 Insforge（不看老的 CSV，直接查当下状态）
     3. 如果现在是 Pro（用户已升级）→ skip，标为"转化"
     4. 如果仍然非 Pro → 从 segment 移除
     5. 输出报告：`扫描 N 个 / 已升级转化 M 个 / 已移除 K 个`
   - **安全性**：不依赖第一步的 CSV，永远以"当下 Insforge 状态"为准。即使你发送邮件那天的名单和今天的名单不同也没关系。

B4. **记录转化数据**
   - [ ] 更新 Obsidian `产品/产品现状.md`，记录："X 日邮件通知 N 人，7 天内 M 人升级 Pro"
   - [ ] 如果有 Pro 转化，在 `docs/reports/pro-segment-cleanup-{date}/outcome.md` 写一份总结

**Phase B 结束后**：Pro segments 里只有真实 Pro 用户。但架构仍是"Resend segment 为真相源"的老架构，下次还会漂移。Part 2 解决根因。

---

### Part 2：长期架构（接下来 2-3 周，分 Phase 推进）

#### Phase C — email_preferences 表落地

C1. **设计 + 创建表**
   - [ ] 在 Insforge 创建 `email_preferences` 表（schema 见上）
   - [ ] 在 `backend/app/edge_functions/` 创建 `email-preferences.js` Edge Function（get/upsert 两个 action）
   - [ ] 部署到 Insforge

C2. **后端 DB 层**
   - [ ] `backend/app/features/subscription/preferences_db.py` 新文件
   - [ ] 函数：`get_email_prefs(user_id)`、`upsert_email_prefs(user_id, ...)`
   - [ ] 加内存缓存（5 分钟，同 payment.db 模式）

C3. **一次性回填**
   - [ ] `backend/scripts/backfill_email_preferences.py`
   - [ ] 对每个 Insforge users 表里的用户：
     - 查 Resend 当前 segment 成员资格
     - 查 subscriptions 表，判断 Pro 状态
     - 如果是 Pro：原样复制 Resend 状态到 email_preferences
     - 如果是 Free：daily_report=True 其它全 False（强制 reset，因为非法状态）
   - [ ] Dry-run 默认，`--execute` 才写入

#### Phase D — sync_user_segments 函数 + 替换现有读写

D1. **新建 `backend/app/features/subscription/sync.py`**
   - [ ] 实现 `sync_user_segments(user_id, email)` 核心函数
   - [ ] 实现 `_get_user_segments_from_resend(email)` 拉取当前 segment 成员（使用 `resend.Contacts.list` 批量）
   - [ ] 实现 `_resend_segment_add(email, seg_id)` / `_resend_segment_remove(email, seg_id)`
   - [ ] 单元测试：mock Resend，测试幂等、加/删、no-op 三种场景

D2. **`update_email_preferences` 改成 DB 优先**
   - [ ] 先写 `email_preferences` 表
   - [ ] 再调 `sync_user_segments`
   - [ ] 旧的 `service.update_email_preferences` (直接写 Resend segment) 标记为 `@deprecated` 并在下一轮 PR 删除
   - [ ] 更新单元测试

D3. **`get_email_preferences` 改成 DB 读**
   - [ ] 从 `email_preferences` 表读
   - [ ] 如果查不到（历史遗留用户），按 "daily_report=true, 其它 false" 返回默认值并立即 upsert
   - [ ] 不再查 Resend

#### Phase E — 事件驱动 sync 接入

E1. **Stripe webhook**
   - [ ] `payment/router.py` 的 `checkout.session.completed` handler：upsert_subscription 成功后调 `sync_user_segments`
   - [ ] 同上，`subscription.updated` handler
   - [ ] 同上，`subscription.deleted` handler（降级后需要从 Pro segments 移除）

E2. **邀请码兑换**
   - [ ] `invites/router.py` 的 `api_redeem_invite` success path：upsert 后调 sync
   - [ ] 需要拿到 email：修改 `verify_user_token` 为 `verify_user_token_with_email` 或额外查一次

E3. **sync-user 端点**
   - [ ] `subscriptions/sync-user` 把匿名订阅者转成认证用户时：创建 email_preferences 行（使用 Resend 的当前状态，按 Pro 过滤），然后调 sync

#### Phase F — 邀请码过期 Cron

F1. **新端点**：`POST /api/cron/expire-invites`
   - [ ] 文件：`backend/app/features/invites/router.py`
   - [ ] 认证：`verify_cron_secret`
   - [ ] 行为：
     ```python
     expired = await find_expired_invite_trials()  # WHERE access_expires_at <= now AND plan IN ('pro','max')
     for user in expired:
         await upsert_subscription(user_id=user.id, plan='free', status='expired', clear_access_expires_at=True)
         await sync_user_segments(user.id, user.email)
     return {"expired_count": len(expired)}
     ```

F2. **GitHub Actions workflow**
   - [ ] 新 workflow：`.github/workflows/expire-invites.yml`
   - [ ] 每天 00:15 UTC 触发（刚过 UTC 天边界，确保前一天过期的都被处理）
   - [ ] 调 `POST /api/cron/expire-invites`

#### Phase G — Reconciliation Cron

G1. **新端点**：`POST /api/cron/reconcile-segments`
   - [ ] 文件：`backend/app/features/subscription/router.py`
   - [ ] 认证：`verify_cron_secret`
   - [ ] 行为见上面设计部分
   - [ ] 返回：`{"scanned": N, "drifted": M, "details": [...]}`

G2. **GitHub Actions workflow**
   - [ ] 新 workflow：`.github/workflows/reconcile-segments.yml`
   - [ ] 每 6 小时触发一次
   - [ ] 调 `POST /api/cron/reconcile-segments`，响应 drifted > 0 时写 workflow summary

#### Phase H — 可观测性

H1. **结构化日志**
   - [ ] `sync_user_segments` 每次有 action 都 `logger.info` 带 user_id/email/actions
   - [ ] Reconcile cron 跑完输出汇总 log
   - [ ] Drift 日志用 `logger.warning`，稳态下应该 0

H2. **告警**
   - [ ] 如果 reconciliation 发现 drift > 5 或 drift rate > 5%，发告警
   - [ ] 告警渠道：**待定**（Discord webhook? 邮件? 简单 log 写入 Obsidian？）
   - [ ] 最简方案：Railway logs → Papertrail / Logtail 设关键词告警

H3. **每日汇总**
   - [ ] 每天一次，把 reconciliation 的汇总发到 Obsidian `产品/产品现状.md` 或追加到一个 `docs/reports/sync-health.log`

## 工程细节与边界情况

### 为什么 `email_preferences` 里默认 morning/weekly/digest 是 false？

这些是 Pro 专属邮件，**没订阅过 Pro 的用户不应该默认收到**。免费用户升级到 Pro 之后，Pro 欢迎邮件里可以告知"在 Profile 页面开启早报、周报、专属日报"。

替代方案是"升级为 Pro 后自动全开"——但这会让降级场景更复杂，且剥夺用户选择权。

### Stripe webhook 怎么拿到 email？

目前 `upsert_subscription` 只有 `user_id`。要调 sync 就必须拿到 email。两个选项：

- (A) 从 Stripe webhook 的 `checkout.session.completed` 事件里直接拿（Stripe 事件体里有 `customer_email`）
- (B) 用 user_id 反查 Insforge users 表拿 email

(A) 更直接，无额外请求。推荐 (A)，并在 `sync_user_segments` 内部也支持 `email: Optional[str] = None` + 内部 fallback 到 (B)。

### 性能：Reconciliation 对 Resend 的压力

假设 500 个活跃认证用户，每 6 小时全扫一次。

- 拉取 3 个 segment 的全量成员：3 次 API 调用（一次性）
- 在内存里 build `email -> set[segment_id]` 映射
- 对每个用户，diff 期望状态和实际状态，稳态下都是 no-op → 0 写调用
- 总 API 调用数：3（在 rate limit 内远远不够，Resend 是 2 req/s）

不是问题。即使规模到 10k 用户，每 6h 也就 3 次拉取 + 少量写，完全 ok。

### Personal Digest 为什么不走 segment？

`personal_digest` 用的是**独立 audience**（"Personal Digest Daily"），不在共享的三 segment 系统里。因为每封专属日报内容都不一样，不能走 Resend broadcast。

现状：`broadcast_personal_digests` 已经是逐用户生成+发送，`EMAIL_PRO_GATE=true` 激活后就有 Pro 校验了（Phase A 已覆盖）。长期架构下，`sync_user_segments` 里**只处理 3 个共享 segment**，不管 personal_digest audience。personal_digest 的 subscribe/unsubscribe 独立通过 `/api/subscriptions/personal_digest/subscribe` 管理，并通过 `email_preferences.personal_digest` 字段同步。

### 回滚策略

Phase A：改错了就 revert PR，无数据风险
Phase B：移除脚本有 dry-run，且 7 天缓冲，误移除可以重新 add
Phase C-D：email_preferences 表是新建，不动老表；如果回填有问题，可以清空表重跑
Phase E-F：事件驱动 sync 挂掉最多导致漂移，reconcile cron 会修；最坏情况 disable webhook 调用，手动 reconcile
Phase G：reconcile cron 本身出错不影响生产邮件，只是不再自动修漂移

每个 Phase 都可以独立 ship 和回滚。

## 实施顺序决策

**建议顺序**：Phase A → Phase B（第 1 步）→ 等 7 天（期间做 Phase C、D）→ Phase B（第 3 步）→ Phase E-G。

**依据**：
- Phase A 立即止血
- Phase B 第 1 步只是生成报告，零风险，完成后你可以马上发通知
- Phase C、D 可以在等待 7 天时并行做
- Phase B 第 3 步执行移除和 Phase C 的 backfill 效果重叠，所以 Phase C 必须在 Phase B 第 3 步之后，否则 backfill 会把待移除用户又写回 email_preferences

**替代顺序**：如果你不介意先把老架构清干净再开始新架构，可以顺序 A → B → (7天) → B → C → D → E → F → G。**默认推荐这条**，因为心智负担小。

## 待定问题

1. **告警渠道**：reconciliation 发现 drift 时告警发到哪里？Discord webhook？个人邮件？先记日志，后续补？
2. **`email_preferences` 表是否也要存 `updated_by`（谁改的）**？审计用，但多一列。MVP 先不存。
3. **Phase B 第 1 步发送邮件的时机**：工作日上午还是周末？打开率/转化率会有差异。
4. **Phase F 邀请码过期时，是否同时发一封"你的试用已结束"邮件**？当前 plan 不发（静默降级）。需要你决定。
5. **未来新增邮件类型时**：需要新增 `email_preferences` 字段 + `sync_user_segments` 里加一个 segment 映射。这是一个"每次加新邮件都要改 3 处"的模式，可以考虑用配置表驱动，但 MVP 不做。

## 执行检查表（用来盯进度）

### Part 1 — 短期

- [ ] A1. `update_email_preferences` 补 Pro 校验 ← 正在做
- [ ] A2. `test_pro_gate_unit.py` 通过 + 提交
- [ ] A3. Railway `EMAIL_PRO_GATE=true`
- [ ] A4. Pricing 文案修正
- [ ] B1. `audit_pro_segments.py` 识别脚本
- [ ] B2. 用户手动发送通知邮件
- [ ] B3. 7 天后执行移除
- [ ] B4. 记录转化数据

### Part 2 — 长期

- [ ] C1. `email_preferences` 表 + Edge Function
- [ ] C2. 后端 DB 层
- [ ] C3. 一次性回填
- [ ] D1. `sync.py` + `sync_user_segments`
- [ ] D2. `update_email_preferences` 改 DB 优先
- [ ] D3. `get_email_preferences` 改 DB 读
- [ ] E1. Stripe webhook 3 个事件接入 sync
- [ ] E2. 邀请码兑换接入 sync
- [ ] E3. sync-user 端点接入 sync
- [ ] F1. 邀请码过期 cron 端点
- [ ] F2. GitHub Actions workflow（每天）
- [ ] G1. Reconciliation cron 端点
- [ ] G2. GitHub Actions workflow（每 6h）
- [ ] H1. 结构化日志
- [ ] H2. 告警
- [ ] H3. 每日健康汇总
