# Freemium 转型 + Lifecycle 邮件系统

## 背景

当前机制: 用户注册 → 自动开 14 天 Max trial → 到期没绑卡 → 降级为 free + entitlements 清空. 转化率偏低, 因为:

1. **14 天对内容型产品太长**, 用户"吃饱"后没付费动机 (aha moment 在前 1-3 次)
2. **trial 时间到了就一刀切**, 失去后续触达机会, 用户被赶走
3. **trial 本质上只是"合法发邮件 14 天"的借口**, 真正的留存杠杆从未被独立设计

转向 freemium 后, 风险是: 用户订完日报就消失, 不知道网站还有 Brew/推特日报/宏观 dashboard. 必须用 **lifecycle 邮件 + 行为触发 + sticky 产品钩子** 三件套补上 trial 原本承担的"持续教育"功能.

## 目标

- 去掉 14 天 trial, 改为 freemium + 关键能力 paywall
- 新建 lifecycle 邮件系统 (onboarding sequence + 行为触发) 承接教育和转化功能
- 设计 reactivation 链路, 把已过期 trial 用户拉回来 (不浪费现有 ~N 个流量)
- 保护现有真付费用户 + lifetime 用户不受影响

## 用户状态分类与处理

| 群体 | DB 特征 | 改造处理 |
|---|---|---|
| 真付费 | entitlements 非空 + access_expires_at 空 | 不动 |
| Lifetime | is_lifetime=true | 不动 |
| **当前 trial 中** | entitlements 非空 + access_expires_at 未来 | **优雅退场**: 让现有 trial 自然走完, 不强制提前结束; 期间收到 "我们改了模式" 通知 |
| **过期 trial (未付费)** | 有 subscription 行 + invite_code 含 AUTO_TRIAL/邀请码 + entitlements=[] | **reactivation 目标**, 分 3 个 cohort (见下) |
| **新注册 (改造后)** | 无 subscription 行 | 不开 trial, 进入 freemium onboarding sequence |
| **从未付费 / 仅订日报** | 无 subscription 行, 有 newsletter subscription | 进入 onboarding sequence (起点视注册时间) |

## Onboarding Email Sequence (新用户)

替代 trial 的"14 天教育窗口". 30 天序列, 每封只推一个新功能, 避免信息过载.

| 天数 | 主题 | 目的 | CTA |
|---|---|---|---|
| D0 | 欢迎 + 第一份日报 | 兑现订阅承诺 | 收日报 |
| D2 | "今天日报里这只股, 试试 AI 深度分析" | 引到 Brew | 点击进 Brew 页 |
| D4 | "建一个自选股, 让日报更懂你" | 触发上网站 + 后续个性化 | 进 watchlist 页 |
| D7 | 周末: "本周宏观大事 + 我们的解读" | 引到 macro dashboard | 看 dashboard |
| D10 | "看看华尔街大佬这周怎么说" + 推特日报样本 (节选) | 推特日报种草 (Max) | 看完整推特日报 (Max 升级) |
| D14 | "你已经收了 14 天日报, 看看更深的功能" + 个性化日报样本 | 第一次软升级推 (Pro) | 升级 Pro |
| D21 | 行为驱动: 基于点击/打开/自选股选个性化内容 | 个性化触达 | 视行为而定 |
| D30 | "Max 帮你做这些, 这周限时优惠 X% off" | 第二次升级推 (Max), 带具体用例 | 升级 Max |

**每封模板要求**:
- 单一 CTA, 不塞多个功能
- 顶部 1 句 "为什么收到这封": 让用户能 opt-out
- 底部 unsubscribe + 偏好管理链接 (区别于 daily 退订)
- HTML + 纯文本双版本

**实现位置**: `backend/app/features/subscription/lifecycle_templates.py` (新建), 复用 `email_styles.py` 的常量.

## 行为触发邮件 (Phase 2, onboarding 上线后)

时间序列邮件覆盖前 30 天, 之后靠**事件驱动**维持触达. 这是 trial 永远做不到的, 也是真正高转化的:

| 触发事件 | 邮件内容 | 升级钩子 |
|---|---|---|
| 用户打开日报累计 ≥ 5 次 | "你看起来很关注市场, 推特日报每天聚合大佬观点" | Max |
| 用户在 Brew 同一只股查询 ≥ 3 次 | "这只股的深度分析 + 财报解读" | Pro/Max |
| 用户自选股触发大新闻 (涨跌 ≥ 5% 或事件) | "你的 NVDA 今天发生了..." | 留存触发, 无升级 |
| Fed 决议前一天 | "明天 Fed, 升级 Max 看推特立场聚合" | Max |
| 用户自选股进财报周 | "本周你的自选股有 3 家财报" | Pro (深度报告) |
| 注册 60 天 + 0 付费 + 仍活跃 | "Max 限时优惠 / 推荐返佣" | 最后一次升级推 |

**实现位置**: `backend/app/features/subscription/triggers.py` (新建), 由 cron 每日扫表 + 事件 hook 共同驱动.

## Reactivation: 过期 trial 用户

按 trial 结束距今的时间分 3 cohort, 强度递增:

### Cohort A: 最近 30 天过期 (warm)

- **状态**: 刚刚降级, 对产品记忆新鲜
- **邮件 1** (T+1 立即发): 主题 "好消息: TheMarketBrew 现在永久免费"
  - 内容: 我们听了你的反馈, 取消了 trial 制度, 现在日报 + 自选股 + Brew 试用永久免费; 你之前能用的 Max 功能 (推特日报、深度分析、宏观)统一改成付费高级版
  - CTA: 看看现在的免费版有什么 (进网站)
- **邮件 2** (T+3): "试试这个" — 推 Brew 试用 (免费可用)
- **邮件 3** (T+7): 推特日报样本 + 限时 Max 7 折 (30 天有效)
- **后续**: 进入标准 onboarding sequence 的 D14 起点 (跳过早期介绍)

### Cohort B: 30-90 天过期 (cool)

- **状态**: 可能已经流失, 但还在邮件列表上
- **邮件 1** (单次 win-back): "好久不见, 我们变了" + 大改进列表 + 永久免费版承诺
  - 包含: 产品迭代摘要 (推特日报、Brew 升级、自选股深度等)
  - CTA: 重新登录看看 + Max 限时 5 折 (14 天有效)
- **如果点击**: 进入 Cohort A 的邮件 2/3 流程
- **如果未打开/点击**: 30 天后再试一次 (邮件 2), 仍无反应 → 进 Cohort C

### Cohort C: 90 天以上过期 (cold)

- **状态**: 大概率永久流失
- **邮件 1** (单次 last-call): 主题 "最后一封" — 极简, 一句话价值主张 + 一个 CTA
  - CTA: 回来看看 (直接给 dashboard 链接)
- **未响应**: 标记 `cold_lead=true`, 从所有 lifecycle/触发邮件移除 (仍保留普通日报订阅, 因为这是他们主动订的)

### 执行细节

- **识别 query**: `subscriptions` 表 + `invite_code IS NOT NULL AND entitlements = '[]'` + `access_expires_at < now()`
  - 按 `access_expires_at` 距今的时间分 cohort
- **一次性脚本**: `backend/scripts/reactivation_initial_send.py` (Phase 1 上线后立即跑一次, 覆盖存量过期用户)
- **持续机制**: cron 每天扫"刚过期满 1 天"的用户, 自动进 Cohort A 流程

## 改造影响面

| 层 | 文件 | 改动 |
|---|---|---|
| **去 trial** | | |
| Frontend | `frontend/src/app/auth/callback/route.ts` | 删除 `/invites/auto-trial` 调用 |
| Frontend | `frontend/src/contexts/AuthContext.tsx` | 删除 `AUTO_TRIAL_KEY` 和重试逻辑 |
| Backend | `backend/app/features/invites/router.py` | `/auto-trial` 端点改为 410 Gone 或软删除 (邀请码兑换 `/redeem` 保留, 改为给 Max 一次性 30 天体验, 见下) |
| Backend | `backend/app/features/invites/db.py` | `create_trial_subscription` 改为 `create_promo_access` (邀请码场景用, 30 天而非 14, 且明确标注 source) |
| **CTA 简化** | | |
| Backend | `backend/app/features/subscription/cta_tier.py` | `is_real_paid_sub` 逻辑保留 (邀请码用户仍是 "试用"), 但语义改成 "试用 vs 真付费" → "促销访问 vs 真付费" |
| **Lifecycle 系统** | | |
| Backend (新) | `backend/app/features/subscription/lifecycle_templates.py` | 7-10 个 onboarding HTML 模板 (D0/D2/D4/D7/D10/D14/D21/D30) |
| Backend (新) | `backend/app/features/subscription/lifecycle_scheduler.py` | `run_onboarding_pass()` — 每日扫表, 按 `signup_at + N` 派发 |
| Backend (新) | `backend/app/features/subscription/triggers.py` | 行为触发邮件入口 (Phase 2) |
| Backend | `backend/app/features/subscription/email_service.py` | 加 `send_lifecycle_email(user_id, day_n)` 单发方法 |
| Backend | `backend/app/main.py` 或 cron 入口 | 注册 `/api/cron/lifecycle/onboarding-pass` 端点, 走 `verify_cron_secret` |
| **Reactivation** | | |
| Backend (新) | `backend/app/features/subscription/reactivation.py` | cohort 分类 + 三组邮件模板 |
| Backend (新) | `backend/scripts/reactivation_initial_send.py` | 存量过期 trial 用户一次性发邮件 |
| Backend | cron 入口 | 注册 `/api/cron/lifecycle/reactivation-pass` |
| **DB / Edge** | | |
| Insforge | `subscriptions` 表 | 加 `lifecycle_state JSONB` (记录已发哪些 onboarding day) 和 `reactivation_state TEXT` (cohort_a/b/c/cold) |
| Edge | `backend/app/edge_functions/subscriptions.js` | 暴露上述字段 + 加 `update_lifecycle_state` action |
| **Resend Segments** | | |
| Resend Dashboard | | 新建 segments: `onboarding_active` / `reactivation_cohort_a/b/c` |
| Env | `backend/app/core/config.py` + `.env` | 加新 segment id 环境变量 |
| **Docs / 状态归档** | | |
| Docs | `docs/constraints/subscription-model.md` (新) | 记录 freemium 模型 + cohort 分类规则 |

## 注册时间字段确认

lifecycle scheduler 依赖 `signup_at`. 当前 `subscriptions` 表的 `created_at` 是 subscription 创建时间, **不是用户注册时间**. 用户表 (auth) 的 `created_at` 才是. 需要:

- Edge function `list_all_users` 已返回 auth.created_at (现有 `subscriptions.js:313` 的 RPC 返回字段需确认)
- lifecycle_scheduler 拉取时用 auth.created_at 作为 day 0 基准
- 如未返回, 需在 RPC 补字段 (低风险 schema 变更)

## 落地阶段

### Phase 0: 数据 + 文档 (0.5 天)
1. 写本 plan, 用户审过
2. 确认 auth.created_at 可获取
3. Insforge 加 `lifecycle_state` / `reactivation_state` 字段
4. 落地 `docs/constraints/subscription-model.md` (新模型 contract)

### Phase 1: 去 trial + 基础 onboarding (1 周)
1. 后端 `/auto-trial` 端点改 410 Gone, 前端两处调用删除
2. `cta_tier.py` 语义重命名 + 测试覆盖
3. 写 `lifecycle_templates.py` 的 D0/D2/D4/D7/D14 五封 (先少不贪)
4. 写 `lifecycle_scheduler.py` + cron 端点
5. 部署 + dry-run (非生产环境只发 test 账号)
6. **存量真付费用户在此阶段不受影响**, 当前 trial 用户继续走完 14 天

### Phase 2: Reactivation (1 周)
1. 写 `reactivation.py` cohort 分类 + 3 组模板
2. 一次性脚本跑存量过期 trial 用户 (先 dry-run, 用户确认 cohort 划分合理)
3. 注册持续 cron, 处理 "新过期" 用户 (Phase 1 启动后 trial 用户陆续走完)
4. 监控打开率/点击率/升级率, 评估每个 cohort 邮件文案

### Phase 3: 行为触发邮件 (1 周)
1. 写 `triggers.py` 6 个事件触发器
2. 接入现有 analytics 事件 (打开日报、Brew 查询、自选股变更)
3. 每个触发器加 cooldown (防垃圾邮件)

### Phase 4: 产品端 sticky 钩子 (1-2 周, 可并行)
1. 个人 dashboard: 显示自选股表现 + 即将事件 (需上网站才能看)
2. 保存的 Brew 分析: 用户研究库
3. Brew Q&A: 对一份分析继续问 (邮件做不到)

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 现有 trial 用户被改造误伤 | Phase 1 只动新注册路径, trial 中用户自然走完; reactivation 只针对已过期 |
| Lifecycle 邮件量太大被 Gmail 标 spam | 每个 segment 加发送频率上限; 用户偏好页可关闭 onboarding/触发邮件 |
| Reactivation Cohort B/C 用户感到打扰 | 单次 win-back + 不响应即降频; cold_lead 标记后停止 |
| 改 `cta_tier.py` 破坏 daily_report 的 free/paid CTA 分流 | 改造前先跑测试; 灰度先在 dev 环境验证 |
| 去 trial 后 LTV 下降 (Pro 转化率短期不达预期) | 监控指标: 注册→Pro 转化率 / Max 转化率 / 30 日留存; 如 Pro 转化连续 2 周 < 旧 trial 模型的 50%, 回滚 trial 但缩短到 7 天 |

## 监控指标

实施前后对比, 至少跑 6 周后判断:

- **激活率**: 注册 → 收到第一封日报的比例
- **D7 留存**: 注册第 7 天仍打开邮件的比例
- **D30 留存**: 同上, 30 天
- **Pro 转化率**: 注册 → Pro 付费的比例 (按 cohort 区分: 新注册 / Cohort A 复活 / Cohort B 复活)
- **Max 转化率**: 同上
- **Lifecycle 邮件打开率/点击率**: 每封单独追踪
- **Reactivation 转化率**: Cohort A/B/C 邮件 → 注册回访 → 付费 漏斗

## 后续未决问题

- D21 个性化邮件的"行为驱动"内容生成机制 (是否需要单独的 LLM agent? 还是 rule-based 模板)
- 邀请码 (`/redeem`) 改造后的定位 (30 天 Max 体验? 永久 Pro 解锁? 一次性优惠码?)
- 推特日报的免费节选 vs Max 完整版的界限 (邮件里给多少免费内容才既种草又不被白嫖)
