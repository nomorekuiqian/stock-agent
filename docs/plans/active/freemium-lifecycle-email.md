# Freemium 转型 + Lifecycle 邮件系统

## 背景

当前机制: 用户注册 → 自动开 14 天 Max trial → 到期没绑卡 → 降级为 free + entitlements 清空. 转化率偏低, 因为:

1. **14 天对内容型产品太长**, 用户"吃饱"后没付费动机 (aha moment 在前 1-3 次)
2. **trial 时间到了就一刀切**, 失去后续触达机会, 用户被赶走
3. **trial 本质上只是"合法发邮件 14 天"的借口**, 真正的留存杠杆从未被独立设计
4. **付费主战场错位**: 当前 trial 把 Agent (Brew/research) 当主推, 但用户对 AI 工具兴趣有限; 真正掏钱的动机是 **推特日报** (每天聚合大佬观点) + **专属日报** (按持仓生成). 新流程必须把转化路径对准这两条线, Agent 降为辅助配额.

转向 freemium 后, 风险是: 用户订完日报就消失, 不知道网站还有 Brew / 推特日报 / 宏观 dashboard. 必须用 **强制 onboarding + lifecycle 邮件 + 行为触发** 三件套补上 trial 原本承担的"持续教育"功能.

## 目标

- 去掉 14 天 trial, 改为 freemium + 关键能力 paywall
- 重新设计 Free 边界: 限量体验高价值功能, 不直接关门
- **付费主路径对准**: 推特日报 → Max; 专属日报 → Pro. Agent 是配额辅助, 不主推
- 强制 onboarding 把"建自选股 → 引导专属日报"做成转化入口
- 14 天 onboarding 邮件序列 (前 3 封塞完整推特日报种草, 后续转化)
- 设计 reactivation 链路, 把已过期 trial 用户拉回来 (不浪费现有 ~N 个流量)
- 保护现有真付费用户 + lifetime 用户不受影响

## Free / Pro / Max 边界

**Pro 和 Max 功能不变**, 只调整 Free 列:

| 功能 | Free | Pro | Max |
|---|---|---|---|
| `daily_report` (公开版) | 完整 | 完整 | 完整 |
| 宏观 dashboard | 基础视图 | 完整 | 完整 |
| watchlist 数量 | 25 只 | 25 只 | 25 只 |
| Brew / AI 投研 (`ai_research_engine` + `stock_research`) | **每天 2 次** | 每天 2 次 | 无限 |
| 推特日报 (`twitter_digest`) | **注册前 3 封免费完整版**, 之后停 | 锁 | 每天完整 |
| `morning_report_email` / `weekly_report_email` / `personal_digest_email` | 无 | 有 | 有 |
| 个股深度研究 | 无 | 锁 | 无限 |

设计原则:
- **watchlist 对 free 是"钩子, 不是价值"**: free / Pro / Max 全部上限 25 — 数量不是付费卖点. free 用户能加 25 只但收不到任何基于持仓的邮件 (专属日报、自选股大新闻 trigger 邮件都被 Pro/Max entitlement 锁死). 设计意图: 让用户把"自己的股票"录进系统, 投入感拉满, 然后立即引导升级 Pro 才有日常 ROI. **建 watchlist 这个动作本身就是为了转化, 不为了 free 用户价值**.
- **Brew 对 Pro 不差异化**: Free 和 Pro 都是 2 次/天, 只有 Max 无限. **Brew 完全是 Max 独家深度使用功能, 不是 Pro 升级卖点**. Pro 的卖点彻底回归邮件层 (专属日报 + 早报 + 周报); Max 的卖点是推特日报 + Brew 无限 + 个股深度无限.
- **推特日报"前 3 封后停"**: 注册即发完整版, 让用户在前 3 天就感受到完整价值; 第 4 天发邮件问"觉得有用吗", 引导升级 Max
- **专属日报通过 onboarding 流程做转化**: 用户建完自选股后立即弹 modal 引导升级 Pro (见下)

## 用户状态分类与处理

| 群体 | DB 特征 | 改造处理 |
|---|---|---|
| 真付费 | entitlements 非空 + access_expires_at 空 | 不动 |
| Lifetime | is_lifetime=true | 不动 |
| **当前 trial 中** | entitlements 非空 + access_expires_at 未来 | **优雅退场**: 让现有 trial 自然走完; 期间收到 "我们改了模式" 通知 |
| **过期 trial (未付费)** | 有 subscription 行 + invite_code='AUTO_TRIAL' + entitlements=[] | **reactivation 目标**, 分 3 个 cohort (见下) |
| **新注册 (改造后)** | 无 subscription 行 | 不开 trial, **强制进入 onboarding 流程** |
| **从未付费 / 仅订日报** | 无 subscription 行, 有 newsletter subscription | 进入 onboarding email sequence (起点视注册时间) |

## 强制 Onboarding 流程

改造现有 `frontend/src/app/onboarding/page.tsx` (现 2 step, 改 3 step **必须完成**). 注册后 redirect 到 `/onboarding`, 未完成前访问其他页面自动 redirect 回来. 完成后写 `onboarding_completed_at`.

### Step 1: Welcome

- 替换原"14 天 Max 全功能"banner, 改为价值主张:
  - "今天就能用: 1 次 AI 投研体验 + 首份推特日报 + 自选股提醒"
  - "建好自选股, 解锁每天专属日报"
- CTA → 下一步

### Step 2: 建自选股 (强制, 至少 3 只, 推荐 5-10 只)

- 复用现有 watchlist builder (搜索 + popular groups: Mag 7 / AI & Chips / Cloud & SaaS / Finance)
- **不允许 skip** (现在允许 skip, 改为至少 3 只才能继续)
- UI 鼓励多加 (上限 25 只): 一键加 Mag 7 (7 只) / AI & Chips (10 只) 等组合, 降低多加门槛
- 为后续触发邮件 + 专属日报提供数据基础; **更重要的是: watchlist 投入感本身是 Step 3 转化的核心心理杠杆** — 建得越多, 越舍不得不订专属日报

### Step 3: 专属日报 CTA (核心转化点)

自选股建完后, 立即弹 modal:

- 标题: **"为你的 X 只自选股, 每天生成专属日报"** (X 是用户实际加的数量, 作为营销话术)
- 内容: 解释专属日报 = 每天根据持仓 + 当日新闻生成个性化分析; 嵌一份**通用示例样本** — 从 **Mag 7 热门股票池** (AAPL/MSFT/GOOGL/AMZN/META/NVDA/TSLA) 中按当日热度或轮换选一只, **不基于用户实际持仓 mock**, 简化实现 + 避免越界感
- 双 CTA:
  - 主: **"升级 Pro 立即激活"** → **直接调用 Stripe Checkout Session API** (price_id=Pro), 跳 Stripe 托管页, **不经 `/pricing`** (减少跳转, 转化路径最短)
  - 次: "稍后再说" (跳过, 进入后续邮件再推)

**关键心理**: 用户刚操作完、对持仓有感情, 是高情绪时刻; "都已经设置好了, 顺便订一下"的 conversion 心理最强. **Free 用户 watchlist 没有任何日常邮件价值, 不订专属日报 = watchlist 完全是摆设**, 这个对比要在 modal 文案里点出来.

完成后落地 `/today`, 顶部加配额 widget: "今天还可以: 2 次 AI 投研对话" + (若未升级) "升级 Pro 解锁每天专属日报".

## Onboarding Email Sequence (新用户, 14 天)

缩短到 14 天 (原 30 天太长). 核心策略: **前 3 天密集推送推特日报完整版**做种草, D4 推特日报转化推. **D4 之后 (D6/D8/D11) 走"介绍功能 + 邀请体验"模式, 不做基于用户持仓的总结/分析** — 模板统一, 不个性化生成. 持仓个性化是付费产品 (专属日报) 的核心, 不在 onboarding 邮件里免费提供.

**发送时间基准**: 所有 D0/D1/D2/.../D14 按用户**注册时间的自然日**计算 (D0 = 注册当天, D1 = 次日, 周末也发), 跟推特日报正常发刊日历独立 — 即使周末没有正式推特日报, D0/D1/D2 也照常发送 (复用最近一期内容, 或为 onboarding 专门生成精简版).

| 天数 | 主题 | 目的 | CTA |
|---|---|---|---|
| D0 | 欢迎 + 首份日报 + **推特日报 #1 (完整版)** | 兑现承诺 + 推特日报立即种草 | 完成 onboarding |
| D1 | **推特日报 #2 (完整版)** | 继续推特日报种草 | 感受价值 |
| D2 | **推特日报 #3 (完整版)** + 文末一句 "明天起推特日报会停, 觉得有用?" | 第三次曝光 + 软铺垫 | 感受价值 |
| D4 | "推特日报怎么样? 升级 Max 每天继续收" + 引用前 3 封里他最可能感兴趣的观点 | **第一次推 Max** (推特日报转化主战场) | 升级 Max |
| D6 | "看看专属日报长什么样" + **一份通用样本** (从 Mag 7 池子选一只, 按当日活跃度或轮换) | 介绍专属日报功能 + 让用户认知"个性化分析能做到什么" | **升级 Pro 解锁每天专属日报** (转化主战场) |
| D8 | "今天试试 AI 投研" — 介绍 Brew 功能 + 给一个开箱即用的示例查询 (如 "AAPL 财报怎么看") | 介绍 Brew + 引导消费免费配额 | 用 Brew (登录站点) |
| D11 | 行为驱动: 基于打开/点击/Brew 用量, 推一封个性化最后一推 (推 Max 或 Pro, 视行为) | 个性化触达 | 视行为而定 |
| D14 | "14 天总结 + 限时优惠 X% off" (Pro / Max 都给) | 最后一次转化 | 升级 |

**注意**:
- D0/D1/D2 三封推特日报内容由现有 `twitter_digest` 生成管线复用, 给 free 用户发完整版
- D4 邮件里引用前 3 封中**该用户实际打开/点击过的观点** (高打开率提示真兴趣) — 这是邮件元数据, 不是"基于持仓总结"
- **D6/D8 模板完全统一, 不基于用户 watchlist 生成内容** — 实现成本低、无个人数据合规担忧、复用度高
- D11 用 rule-based 决策: Brew 配额耗尽 ≥ 2 次 → 推 Max; D4 邮件已点击 → 推 Max 限时折扣; 全无动作 → 推 Pro (低门槛兜底)

**每封模板要求**:
- 单一 CTA, 不塞多个功能
- 顶部 1 句 "为什么收到这封": 让用户能 opt-out
- 底部 unsubscribe + 偏好管理链接 (区别于 daily 退订)
- HTML + 纯文本双版本

**实现位置**: `backend/app/features/subscription/lifecycle_templates.py` (新建), 复用 `email_styles.py` 的常量.

## 行为触发邮件 (Phase 2, onboarding 上线后)

时间序列邮件覆盖前 14 天, 之后靠**事件驱动**维持触达. **优先级对准付费主战场** (推特日报 / 专属日报), Brew 触发降权.

| 触发事件 | 邮件内容 | 升级钩子 | 优先级 |
|---|---|---|---|
| 用户打开日报累计 ≥ 5 次 | "你看起来很关注市场, 推特日报每天聚合大佬观点" | Max | **高** |
| 用户自选股触发大新闻 (涨跌 ≥ 5% 或事件) | "你的 NVDA 今天发生了... 专属日报会自动汇总" | Pro (专属日报) | **高** |
| Fed 决议前一天 | "明天 Fed, 升级 Max 看推特日报里 KOL 怎么解读" | Max | **高** |
| 用户自选股进财报周 | "本周你的自选股有 3 家财报, 专属日报会自动汇总" | Pro (专属日报) | **高** |
| 用户在 Brew 同一只股查询 ≥ 3 次 (跨 free + Pro 都触发) | "对这只股感兴趣? Pro 跟 Free 一样 2 次/天, 升级 Max 无限使用" | Max | 中 |
| 注册 60 天 + 0 付费 + 仍活跃 | "Max 限时优惠 / 推荐返佣" | 最后一次升级推 | 中 |

**实现位置**: `backend/app/features/subscription/triggers.py` (新建), 由 cron 每日扫表 + 事件 hook 共同驱动. 每个触发器加 cooldown (≥ 14 天) 防垃圾.

**注**: 触发邮件是"事件驱动 + 与持仓相关", 跟 onboarding 邮件 "不基于持仓总结" 的原则不冲突 — 触发邮件只简要提到事件本身, 推升级去获得完整内容 (专属日报 / 推特立场), 不在邮件里生成完整分析.

## Reactivation: 过期 trial 用户

按 trial 结束距今的时间分 3 cohort, 强度递增. (内容相比原 plan 不变, 因为 reactivation 跟新 onboarding 是独立链路.)

### Cohort A: 最近 30 天过期 (warm)

- **状态**: 刚刚降级, 对产品记忆新鲜
- **邮件 1** (T+1 立即发): 主题 "好消息: TheMarketBrew 现在永久免费"
  - 内容: 取消了 trial, 现在日报 + 自选股 (25 只) + Brew 限量永久免费; 你之前能用的 Max 功能 (推特日报、个股深度研究、AI 投研无限) 统一改成付费高级版; Pro 功能 (专属日报 / 早报 / 周报) 独立订阅
  - CTA: 看看现在的免费版有什么
- **邮件 2** (T+3): "试试这个" — 推 Brew 试用 (免费可用)
- **邮件 3** (T+7): 推特日报样本 + 限时 Max 7 折 (30 天有效)
- **后续**: 进入标准 onboarding sequence 的 D6 起点 (跳过早期推特日报种草, 因为他们已经体验过)

### Cohort B: 30-90 天过期 (cool)

- **状态**: 可能已经流失, 但还在邮件列表上
- **邮件 1** (单次 win-back): "好久不见, 我们变了" + 大改进列表 + 永久免费版承诺
  - 包含: 产品迭代摘要 (推特日报、Brew 升级、专属日报等)
  - CTA: 重新登录看看 + Max 限时 5 折 (14 天有效)
- **如果点击**: 进入 Cohort A 的邮件 2/3 流程
- **如果未打开/点击**: 30 天后再试一次, 仍无反应 → 进 Cohort C

### Cohort C: 90 天以上过期 (cold)

- **状态**: 大概率永久流失
- **邮件 1** (单次 last-call): 主题 "最后一封" — 极简, 一句话价值主张 + 一个 CTA
- **未响应**: 标记 `cold_lead=true`, 从所有 lifecycle/触发邮件移除 (仍保留普通日报订阅)

### 执行细节

- **识别 query**: `subscriptions` 表 + `invite_code IS NOT NULL AND entitlements = '[]'` + `access_expires_at < now()`, 按 `access_expires_at` 距今分 cohort
- **一次性脚本**: `backend/scripts/reactivation_initial_send.py` (Phase 2 上线后跑一次)
- **持续机制**: cron 每天扫"刚过期满 1 天"的用户, 自动进 Cohort A 流程

## 改造影响面

| 层 | 文件 | 改动 |
|---|---|---|
| **去 trial** | | |
| Frontend | `frontend/src/app/auth/callback/route.ts` | 删除 `/invites/auto-trial` 调用 |
| Frontend | `frontend/src/contexts/AuthContext.tsx` | 删除 `AUTO_TRIAL_KEY` 和重试逻辑 |
| Backend | `backend/app/features/invites/router.py` | `/auto-trial` 端点改 410 Gone |
| Backend | `backend/app/features/invites/db.py` | `create_trial_subscription` 标记 deprecated (邀请码当前无环节, 暂不需要替代实现) |
| **Free 边界** | | |
| Backend | `backend/app/features/subscription/entitlements.py` | 新增 `FREE_FEATURES` 集合 (含 `brew_limited`, `twitter_digest_intro` 等限量 flag) |
| Backend | `backend/app/features/brew/router.py` (或对应 Agent 路由) | 加每日次数 quota check; **free + Pro 同样 2 次, Max 无限** (Pro 不差异化 Brew, 详见 Free 边界小节) |
| Backend / Frontend | watchlist 数量限制 | 全员 25, 无差异化 (Pydantic max_length=25 + 前端 MAX_WATCHLIST_SIZE=25) |
| Backend | `backend/app/features/twitter_digest/` | "前 3 封 intro" **已通过 lifecycle scheduler 实现** — `lifecycle_state.onboarding_sent[D0/D1/D2]` 取代了独立 `intro_sent_count`; D0/D1/D2 邮件嵌入完整 digest html, D2 文案明示"明天起仅 Max 可见", Free 用户因不在 `RESEND_SEGMENT_TWITTER_DIGEST` segment 里所以日常 broadcast 不会击中 |
| Frontend | `PaywallGuard.tsx` | 改写 trial 相关文案 ("你的试用已结束" → "升级解锁 X"); 配额耗尽显示新 lock 屏 |
| **强制 Onboarding** | | |
| Frontend | `frontend/src/app/onboarding/page.tsx` | Step 2 不允许 skip (至少 3 只); 新增 Step 3 modal (专属日报 CTA) |
| Frontend | Next.js middleware 或 layout | 未完成 onboarding 的用户访问受限页面 → redirect `/onboarding` |
| Backend | `subscriptions` 表 (或 user profile) | 加 `onboarding_completed_at TIMESTAMP` |
| Backend | API | 加 `/api/user/onboarding-status` 查询端点 |
| **CTA 简化** | | |
| Backend | `backend/app/features/subscription/cta_tier.py` | `is_real_paid_sub` 语义保留, 文案改 "促销访问 vs 真付费" |
| **Lifecycle 系统** | | |
| Backend (新) | `backend/app/features/subscription/lifecycle_templates.py` | 8 个 onboarding HTML 模板 (D0/D1/D2/D4/D6/D8/D11/D14) |
| Backend (新) | `backend/app/features/subscription/lifecycle_scheduler.py` | `run_onboarding_pass()` — 每日扫表, 按 `signup_at + N` 派发 |
| Backend (新) | `backend/app/features/subscription/triggers.py` | 行为触发邮件入口 (Phase 2) |
| Backend | `backend/app/features/subscription/email_service.py` | 加 `send_lifecycle_email(user_id, day_n)` 单发方法 |
| Backend | cron 入口 | 注册 `/api/cron/lifecycle/onboarding-pass` 端点, 走 `verify_cron_secret` |
| **现有 5 封 drip 退役** | `backend/app/features/notification/onboarding.py` | 标记 deprecated, Phase 1 上线即停 (新用户全部走新 sequence) |
| **Reactivation** | | |
| Backend (新) | `backend/app/features/subscription/reactivation.py` | cohort 分类 + 三组邮件模板 |
| Backend (新) | `backend/scripts/reactivation_initial_send.py` | 存量过期 trial 用户一次性发邮件 |
| Backend | cron 入口 | 注册 `/api/cron/lifecycle/reactivation-pass` |
| **DB / Edge** | | |
| Insforge | `subscriptions` 表 | 加 `lifecycle_state JSONB` (`onboarding_sent` dict: day_int -> ISO ts, **同时承担 intro_sent_count 职能** — D0/D1/D2 各发一次即"前 3 封 intro") + `reactivation_state TEXT` (cohort_a/b/c/cold) |
| Insforge | 用户表 | 加 `onboarding_completed_at` |
| Edge | `backend/app/edge_functions/subscriptions.js` | 暴露上述字段 + 加 `update_lifecycle_state` action |
| **Resend Segments** | | |
| Resend Dashboard | | 新建 segments: `onboarding_active` / `reactivation_cohort_a/b/c` |
| Env | `backend/app/core/config.py` + `.env` | 加新 segment id 环境变量 |
| **Docs** | | |
| Docs | `docs/constraints/subscription-model.md` (新) | 记录 freemium 模型 + free 配额规则 + cohort 分类规则 |

## 注册时间字段确认

lifecycle scheduler 依赖 `signup_at`. 当前 `subscriptions` 表的 `created_at` 是 subscription 创建时间, **不是用户注册时间**. 用户表 (auth) 的 `created_at` 才是. 需要:

- Edge function `list_all_users` 已返回 auth.created_at (现有 `subscriptions.js:313` 的 RPC 返回字段需确认)
- lifecycle_scheduler 拉取时用 auth.created_at 作为 day 0 基准
- 如未返回, 需在 RPC 补字段 (低风险 schema 变更)

## 落地阶段

### Phase 0: 数据 + 文档 (0.5 天)

1. 写本 plan, 用户审过 (已完成本轮迭代)
2. 确认 auth.created_at 可获取
3. Insforge 加 `lifecycle_state` / `reactivation_state` / `onboarding_completed_at` 字段
4. 落地 `docs/constraints/subscription-model.md` (新模型 contract + free 配额规则)

### Phase 1: 去 trial + Free 边界 + 强制 onboarding (1.5 周)

1. 后端 `/auto-trial` 端点改 410 Gone, 前端两处调用删除
2. Brew 加每日配额 (**free + Pro 都 2 次/天, Max 无限**) + Twitter Digest 加 free intro 状态机 (前 3 封后停, **按注册自然日触发**). watchlist 不动 (全员 25)
3. PaywallGuard 改写文案: "试用已结束" → "升级解锁", 配额耗尽新 lock 屏
4. `cta_tier.py` 语义重命名 + 测试覆盖
5. **强制 onboarding 流程改造**: Step 2 不可 skip + Step 3 专属日报 modal + 未完成 onboarding 的 redirect 拦截
6. 部署 + dry-run (test 账号验证完整流程)
7. **存量真付费用户不受影响**, 当前 trial 用户继续走完 14 天

### Phase 2: 14 天 Onboarding Email Sequence (1 周)

1. 写 8 封模板 (D0/D1/D2/D4/D6/D8/D11/D14)
   - D0/D1/D2: 复用现有 `twitter_digest` 生成管线, 给 free 用户发完整版
   - D8: 基于用户 watchlist 生成 mock 专属日报 (需对接 personal_digest 生成器, 单次 mock 模式)
   - D11: 行为驱动模板 (rule-based: 按打开次数 / Brew 用量 / 推特日报点击决定推 Max 还是 Pro)
2. 写 `lifecycle_scheduler.py` + cron 端点
3. 现有 `notification/onboarding.py` 5 封 drip 停用 (新用户全部走新 sequence)
4. 监控前 4 周 Onboarding 邮件打开率 / 点击率 / 转化漏斗

### Phase 3: Reactivation (1 周)

1. 写 `reactivation.py` cohort 分类 + 3 组模板
2. 一次性脚本跑存量过期 trial 用户 (先 dry-run, 确认 cohort 划分合理)
3. 注册持续 cron, 处理 "新过期" 用户 (Phase 1 启动后 trial 用户陆续走完)
4. 监控每个 cohort 邮件文案表现

### Phase 4: 行为触发邮件 (1 周)

1. 写 `triggers.py` 6 个事件触发器, 按优先级排
2. 接入现有 analytics 事件 (打开日报、Brew 查询、自选股变更、财报日历、Fed 日历)
3. 每个触发器加 cooldown (≥ 14 天) 防垃圾

### Phase 5: 产品端 sticky 钩子 (1-2 周, 可与 Phase 3/4 并行)

1. 个人 dashboard: 显示自选股表现 + 即将事件 (需上网站才能看)
2. 保存的 Brew 分析: 用户研究库
3. Brew Q&A: 对一份分析继续问 (邮件做不到)

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 现有 trial 用户被改造误伤 | Phase 1 只动新注册路径, trial 中用户自然走完; reactivation 只针对已过期 |
| Free 给推特日报前 3 封被白嫖 | lifecycle scheduler 用 `lifecycle_state.onboarding_sent` 幂等控制 D0/D1/D2 各只发一次; Free 用户不在 `RESEND_SEGMENT_TWITTER_DIGEST` segment 内, 日常 broadcast 自然漏掉; D2 邮件文案明确告知"明天起仅 Max 可见" |
| 14 天发 8 封邮件过密被 Gmail 标 spam | 每个 segment 加发送频率上限; 用户偏好页可降频或部分退订; 监控 spam 投诉率 |
| **Free 用户加完 25 只 watchlist 后没体验到价值就流失** (因为 watchlist 不发任何邮件) | Step 3 modal 立即转化是最关键的一环; 站内 `/today` 持续提示 "升级 Pro 收专属日报"; D6 邮件展示样本反复种草; 触发邮件捕捉 watchlist 事件时点 |
| 强制 onboarding 卡掉新用户 (skip 不掉) | Step 2 加"快速选 Mag 7"一键加 7 只; Step 3 modal "稍后再说" 不强制升级 |
| Reactivation Cohort B/C 用户感到打扰 | 单次 win-back + 不响应即降频; cold_lead 标记后停止 |
| 改 `cta_tier.py` 破坏 daily_report 的 free/paid CTA 分流 | 改造前先跑测试; 灰度先在 dev 环境验证 |
| 去 trial 后 Max 转化率短期下降 (推特日报转化未起量) | 监控指标: 推特日报前 3 封打开率 / D4 邮件转化率 / Max 转化率; 如 Max 转化连续 2 周 < 旧 trial 模型的 40%, 调整前 3 封节奏 (加到 5 封 / 提高样本质量) |
| 专属日报 onboarding modal 转化率不达预期 | A/B 测试 modal 文案 + mock 样本质量; 监控 Step 3 modal 点击率 |

## 监控指标

实施前后对比, 至少跑 6 周后判断:

- **激活率**: 注册 → 完成 onboarding (含 Step 2 自选股) 的比例
- **Onboarding 转化率**: Step 3 modal "升级 Pro" 点击率 → 实际转化率
- **D7 留存**: 注册第 7 天仍打开邮件的比例
- **D14 留存**: 注册第 14 天仍打开邮件的比例
- **推特日报种草效果**: D0/D1/D2 三封推特日报的打开率 / 点击率
- **D4 邮件转化**: "推特日报怎么样" → Max 升级转化率
- **D6 邮件转化**: "专属日报样本" → Pro 升级转化率
- **D8 邮件体验率**: "试试 AI 投研" → 点击进站使用 Brew 比例 (体验率, 不直接付费)
- **Pro 转化率**: 注册 → Pro 付费 (按来源区分: onboarding Step 3 modal / D6 邮件 / 触发邮件 / Cohort A/B/C)
- **Max 转化率**: 同上 (主要来源: D4 邮件 / Fed 触发 / Brew 配额耗尽触发 / Cohort)
- **Brew 配额耗尽率**: free + Pro 用户多少比例每天用完 2 次配额 (评估 "Brew → Max 无限" 转化潜力)
- **Reactivation 转化率**: Cohort A/B/C 邮件 → 注册回访 → 付费 漏斗

## 决策记录

**2026-05-31 用户敲定**:

- 推特日报"前 3 封" 起算: **注册起算的 3 个自然日** (周末也发, 跟推特日报正常发刊日历独立; 无新内容时复用最近一期或专门生成 onboarding 精简版)
- Step 3 modal 主 CTA "升级 Pro 立即激活": **直接调用 Stripe Checkout Session API**, 跳 Stripe 托管页, 不经 `/pricing` (减少转化路径上的跳转)
- D6 邮件 / Step 3 modal 通用样本: 从 **Mag 7 池子** (AAPL / MSFT / GOOGL / AMZN / META / NVDA / TSLA) 中按当日活跃度或轮换选一只
- Brew 配额: **每天 2 次对话** (free + Pro 同, Max 无限) — 当前 Brew 是单次分析模式, "1 次对话" = "1 次完整分析"; Phase 5 上线 Brew Q&A 多轮后可能需要重定义配额单位
- watchlist 数量限制: **全员 25** (Free / Pro / Max 一致, watchlist 数量不作为付费分级卖点 — 2026-05-31 user 推翻 Max 解锁方案)
