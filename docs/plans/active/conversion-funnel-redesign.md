# Conversion Funnel Redesign — 用户价值感知与转化漏斗重建

> Status: Planning
> Created: 2026-04-12
> Updated: 2026-04-12
> Related: [email-conversion-hooks.md](email-conversion-hooks.md), [enforce-tier-gating.md](enforce-tier-gating.md)
> Vision: 解决 freemium 死循环——注册即给全功能试用，用体验驱动转化

## 核心问题

当前产品流程存在一个根本矛盾：

```
最好的功能 (AI 引擎、宏观仪表盘、个股研究)
    ↓ 被锁在 Max ($9.99) 后面
    ↓ 邀请码是获取试用的唯一方式（5+步流程门槛高）
    ↓ 免费用户只能看日报（和邮件内容重复）
    ↓ 网站对免费用户零增量价值
    ∴ 用户无法在付费前体验到产品真正的实力
```

### 问题清单（按用户阶段）

| # | 阶段 | 问题 | 优先级 |
|---|------|------|--------|
| 1 | 冷启动访客 | 首页 CTA 指向「低价值终点」（定价页 / 静态日报） | P1 |
| 2 | 冷启动访客 | 6 个功能卡片中 5 个点进去是付费墙，连续碰壁造成挫败 | P1 |
| 3 | 冷启动访客 | 邮件订阅和账号注册是割裂的两套体系 | P1 |
| 4 | 免费邮件用户 | 日报邮件是「死胡同」，没有回流网站的个性化钩子 | P0 |
| 5 | 试用期用户 | 获取试用需要填问卷+邀请码，5+步流程导致流失 | P0 |
| 6 | 试用期用户 | 问卷→兑换码的流程断裂太严重（5+ 步） | P0 |
| 7 | 试用期用户 | 试用期没有引导式 onboarding 旅程 | P2 |
| 8 | 付费决策 | PaywallGuard 弹窗缺乏说服力，只显示「交钱」 | P1 |
| 9 | 横切 | 缺少对未注册访客和试用过期用户的价值展示 | P0 |

## 核心设计决策

1. **注册即试用** — 注册自动获得 14 天 Max 全功能，废除邀请码门控
2. **不做渐进式披露** — 不需要免费额度机制，注册门槛足够低
3. **Pro/Max 分层不变** — Pro = 只要邮件的用户，Max = 也用网站的用户
4. **预览层驱动注册和续费** — 未注册访客和试用过期用户看到真实内容预览 + CTA

## 用户旅程

```
┌─────────────────────────────────────────────────┐
│ 触点 1: 首页                                     │
│ 改造 3: CTA → "免费体验 14 天"                   │
│ 改造 4: 订阅邮箱 → 特殊 welcome → 注册链接       │
└────────────────────┬────────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────────┐
│ 触点 2: 注册 + 试用                              │
│ 改造 1: 注册 = 14 天 Max + 简化 onboarding       │
│   → 全功能解锁                                   │
└────────────────────┬────────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────────┐
│ 触点 3: 试用期引导                               │
│ 改造 6: 6 封引导邮件 (Day 0-14)                  │
│ 改造 5: 日报邮件个性化回流钩子                    │
│   → 用户形成使用习惯                             │
└────────────────────┬────────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────────┐
│ 触点 4: 到期决策                                  │
│  付费 → Pro (邮件) 或 Max (邮件+网站)            │
│  不付费 → 免费 (日报邮件 + /today)               │
│           网站付费页面显示预览层 (改造 2)          │
│           → 持续展示价值，降低再次付费门槛        │
└─────────────────────────────────────────────────┘
```

---

## 设计方案

分两阶段实施，每个阶段内部按改动从小到大排列。

---

### 阶段一：核心转化基础（1-2 周）

#### 改造 1：注册即试用，废除邀请码门控

**解决问题**：#5, #6

**当前流程**：注册 → 填问卷 → 拿邀请码 → 手动兑换 → 试用
**目标流程**：注册 → 自动获得 14 天 Max 试用 → 简化 onboarding

**注册流程改造**：

```
1. 用户注册（邮箱+密码 或 Google OAuth）
2. Insforge auth webhook (user.created) 触发服务端自动执行：
   - 调用 create_trial_subscription(user_id, email, source="auto_registration")
   - subscribe to daily_report email
   - create default email_preferences (all true for trial)
3. 前端检测到 trial 激活后重定向到简化版 onboarding（2 步）：
   - 第 1 步：选 3-5 只关注的股票（设置 watchlist）
   - 第 2 步：选最关心的主题（宏观/个股/AI 分析）
4. 根据选择跳转到最相关的页面
```

**关键架构决策（CEO Review）**：
- **服务端触发**：auto-trial 通过 Insforge auth webhook 触发，不依赖客户端 JavaScript。用户关闭浏览器也能正确获得试用。Google OAuth 和邮箱注册走同一个 webhook。
- **Stripe 失败兜底**：尝试创建 Stripe trial subscription → 如果 Stripe 失败，直接写 DB（`stripe_pending=true`）→ 后台 job 重试 Stripe 创建 → reconciliation cron 兜底。
- **幂等性**：endpoint 先查 `get_subscription(user_id)`，已有活跃订阅则直接返回。防止重复创建 Stripe subscription。
- **共享函数**：从 `redeem_code()` 提取 `create_trial_subscription(user_id, email, source, days=14)` 共享函数，两个入口（邀请码兑换 + 自动注册）复用同一逻辑。

**后端改动**：
- `backend/app/features/invites/db.py`：提取 `create_trial_subscription()` 共享函数
- `backend/app/features/invites/router.py`：新增 `POST /api/invites/auto-trial` 端点（webhook 调用）
- 新增 Insforge Edge Function 或 auth webhook handler：`user.created` → 调用 auto-trial
- 现有 `POST /api/invites/qualify`：保留，但问卷变为可选的用户画像采集

**前端改动**：
- `frontend/src/contexts/AuthContext.tsx`：注册后轮询 entitlements 状态（服务端已自动激活）
- 新建 `frontend/src/app/onboarding/page.tsx`：简化 2 步 onboarding（URL 参数持久化步骤）
- `frontend/src/app/request-access/page.tsx`：改为可选调查页，去掉邀请码返回逻辑

**邀请码机制转型**：
- 不再是获取试用的唯一方式
- 变为「延长试用」或「老带新」的营销工具：
  - 邀请 1 个朋友注册 → 双方各加 7 天试用
  - 特殊渠道码（KOL 合作）→ 30 天试用

**文案更新**：
- `frontend/src/app/request-access/page.tsx` — 从「14 天 Pro 免费体验」改为可选调查页
- `frontend/src/components/PaywallGuard.tsx` — 邀请码区域改为「注册即可体验」
- `frontend/src/app/pricing/page.tsx` — 邀请码兑换区域改为「注册开始试用」

**验证**：
- [ ] 注册后 `/api/payment/me/entitlements` 返回全部 Max 权限
- [ ] 前端 `/research`、`/macro`、`/stock` 对试用用户可访问
- [ ] 试用到期后权限正确回收
- [ ] 简化 onboarding 2 步流程正常工作

---

#### 改造 2：PaywallGuard 从「锁」变成「预览+锁」

**解决问题**：#2, #8, #9

**适用对象**：未注册访客 + 试用过期未付费用户

**当前行为**：无权限用户访问付费页面 → 看到锁图标 + 「查看订阅方案」

**目标行为**：无权限用户访问付费页面 → 看到**真实内容的预览** + 渐变遮罩 + CTA

**PaywallGuard 组件改造**：

```tsx
// frontend/src/components/PaywallGuard.tsx — 新增 preview prop

interface PaywallGuardProps {
  children: ReactNode;
  requiredPlan?: 'pro' | 'max';
  requiredFeature?: string;
  preview?: ReactNode;          // 新增：预览内容
}

// 渲染逻辑
if (!hasAccess && preview) {
  return (
    <div className="relative overflow-hidden">
      {/* 预览内容，禁止交互 */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        {preview}
      </div>
      {/* 渐变遮罩 */}
      <div className="absolute inset-x-0 bottom-0 h-80
        bg-gradient-to-t from-background via-background/95 to-transparent" />
      {/* CTA 浮层 — 三种用户状态显示不同文案 */}
      <div className="absolute inset-x-0 bottom-0 text-center pb-12 space-y-3">
        <p className="text-lg font-medium">解锁完整内容</p>
        {!isAuthenticated ? (
          // 状态 1: 未注册访客
          <>
            <p className="text-sm text-muted-foreground">注册即享 14 天全功能免费体验</p>
            <Button asChild><Link href="/login">免费注册</Link></Button>
            <p className="text-xs text-muted-foreground">
              无需信用卡 · 14 天后自动结束
            </p>
          </>
        ) : !hasSubscriptionRecord ? (
          // 状态 2: 已注册但无订阅记录（auto-trial 失败或迁移前用户）
          <>
            <p className="text-sm text-muted-foreground">激活你的 14 天免费试用</p>
            <Button onClick={handleActivateTrial}>开始试用</Button>
          </>
        ) : (
          // 状态 3: 试用过期用户
          <>
            <p className="text-sm text-muted-foreground">你的试用已结束，订阅继续使用</p>
            <Button asChild><Link href="/pricing">查看方案</Link></Button>
          </>
        )}
      </div>
    </div>
  );
}
// 如果没有 preview prop，退回到现有的锁屏行为
```

**每个页面的预览内容方案**：

| 页面 | Preview 组件 | 可见内容 | 模糊/锁定内容 |
|------|-------------|----------|--------------|
| `/macro` | `<MacroPreview />` | 四维度卡片标题 + 信号灯颜色 + 上周数据 | 实时数值、周报全文、子页面 |
| `/stock` | `<StockPreview />` | 六赛道分类 + 股票列表 + 基础报价 | AI 分析、详情页 |
| `/research` | `<ResearchPreview />` | 示例 AI 对话截图/GIF（静态图片） | 实际交互 |
| `/morning` | `<MorningPreview />` | 今日早报标题 + 前 2 段 | 剩余全文 |
| `/for-you` | `<ForYouPreview />` | 示例专属日报截图（带虚拟持仓数据） | 真实个人数据 |

**Preview 组件的数据来源**：
- `/macro` 预览：调 API 获取公开摘要数据（信号灯颜色 + 卡片标题）
- `/stock` 预览：显示静态赛道列表 + 从 FMP 拉基础报价（已有免费端点）
- `/morning` 预览：调 `/api/morning/latest` 只返回 title + 前 2 段（后端新增 `preview=true` 参数）
- `/research` + `/for-you` 预览：用静态截图，放在 `public/previews/` 下

**验证**：
- [ ] 未登录用户访问 `/macro` 看到预览 + 「免费注册」CTA
- [ ] 试用过期用户访问 `/macro` 看到预览 + 「查看方案」CTA
- [ ] 预览内容不可交互（pointer-events-none）
- [ ] 各页面预览数据正常加载

---

#### 改造 3：首页 CTA 重新设计

**解决问题**：#1

**当前 CTA**：
```
主 CTA: "查看定价方案" → /pricing
辅 CTA: "先看一份样本报告" → /today
```

**改造后 CTA**：
```
主 CTA: "免费体验 14 天" → /login?trial=true  (注册后自动试用)
辅 CTA: "先看今天的市场" → /today  (不变，降低视觉优先级)
```

**改动文件**：`frontend/src/app/page.tsx`

**Hero 区域调整**：
- 主按钮改为 `bg-primary` 实心按钮：「免费体验 14 天全部功能」
- 辅按钮改为 `variant="outline"`：「先看今天的市场」
- 信任标记下方新增一行：「无需信用卡 · 14 天后自动结束」

**6 功能卡片调整**：
- 每张卡片增加一行**动态数据预告**（从缓存 API 拉取，SSR）：
  - 宏观卡片：「流动性 🟢 经济 🟡 通胀 🟢 情绪 🔴」
  - 个股卡片：「今日热门: NVDA +5.2%  TSLA -3.1%」
  - AI 引擎卡片：「今日已回答 47 个投研问题」
  - 晨报卡片：「今日焦点: 非农数据 + 美联储议息会议」
- 卡片点击后跳转到对应页面的**预览版**（改造 2 的成果）

**验证**：
- [ ] 主 CTA 跳转到注册页
- [ ] 功能卡片动态数据正常显示
- [ ] 卡片点击跳转到预览页面

---

### 阶段二：邮件驱动与体验闭环（2-4 周）

#### 改造 4：合并邮件订阅和账号注册

**解决问题**：#3

**当前问题**：首页 SubscribeForm 只做 Resend 邮件订阅，和网站账号是两套系统。

**改造后流程**：

```
用户输入邮箱 → 点「免费订阅」
  ↓
后端 /api/subscriptions/daily_report/subscribe
  ├─ 邮箱已有账号 → 订阅邮件 + 返回 { is_new: false, has_account: true }
  │   → 前端显示 "已订阅! 登录解锁更多功能"
  │
  └─ 邮箱无账号 → 订阅邮件 + 返回 { is_new: true, has_account: false }
      → 发送特殊欢迎邮件（不同于普通 welcome email）
```

**特殊欢迎邮件内容**：

```
Subject: 你的市场日报已就绪 — 注册解锁 14 天全功能体验

你的市场日报已订阅成功

除了每日邮件，我们还为你准备了：
  AI 投研引擎 — 对话式个股分析
  宏观仪表盘 — 流动性/经济/通胀/情绪四维监控
  专属持仓日报 — 只分析你关心的股票

点击下方按钮，一键注册并开启 14 天免费体验：

   [一键注册，开始体验]
   (链接: /login?email={email}&trial=true)

无需信用卡 · 14 天后自动结束
```

**关键架构决策（CEO Review）**：
- **邮件发送失败兜底**：subscribe 成功后发送 welcome email 失败 → 返回 success（订阅本身已成功）+ 后台队列重试 welcome email。用户不会因为邮件发送失败而看到错误。
- **has_account 查询失败兜底**：Insforge auth 查询失败 → 默认 `has_account=false`，发标准 welcome email，记 warning 日志。

**后端改动**：
- `backend/app/features/subscription/router.py`：subscribe 端点增加 `has_account` 返回字段（查 Insforge auth users 表）
- `backend/app/features/subscription/email_templates.py`：新增 `format_trial_welcome_html()` 模板
- `backend/app/features/subscription/email_service.py`：新账号走新模板

**前端改动**：
- `frontend/src/components/SubscribeForm.tsx`：根据 `has_account` 字段显示不同成功提示
  - 已有活跃试用的用户：显示"你已经拥有全功能体验，去登录"

**验证**：
- [ ] 已有账号的邮箱订阅后提示登录
- [ ] 新邮箱订阅后收到特殊欢迎邮件
- [ ] 欢迎邮件中的注册链接正确跳转
- [ ] 邮件发送失败时用户仍看到订阅成功

---

#### 改造 5：日报邮件加入「回流钩子」

**解决问题**：#4
**与现有计划关系**：**本改造与 `email-conversion-hooks.md` 有重叠**。该计划已设计了 5 个钩子的具体位置和内容，应以该计划为主执行。本改造补充一个该计划未覆盖的维度：**按用户状态差异化邮件内容**。

**补充设计**：在 `broadcast_daily_report()` 中，为不同 segment 生成不同版本的钩子内容：

| 用户类型 | 钩子内容策略 |
|----------|------------|
| 匿名邮件订阅者 | 通用钩子：热门股票分析预览 + 宏观信号灯 + 「注册解锁更多」|
| 已注册免费用户 | 个性化钩子（如有 watchlist）：「你的 NVDA 今天 -3.2%」+ 「查看专属分析」|
| Pro/Max 用户 | 完整个性化钩子 + 直达对应功能的深链接 |

**实现方式**：
- 方案 1：Resend 模板变量（`{{{hook_section}}}`），广播时按 segment 替换不同 HTML
- 方案 2：分 segment 发送不同 broadcast（代码更简单但多消耗 API 调用）

**建议先执行 `email-conversion-hooks.md` 中的 P0 钩子（Hook 1 + Hook 5），再迭代差异化逻辑。**

**验证**：
- [ ] 匿名订阅者收到通用钩子版本
- [ ] 已注册用户收到个性化钩子版本
- [ ] 钩子链接正确跳转到网站对应页面

---

#### 改造 6：试用期引导邮件序列（Drip Campaign）

**解决问题**：#7

**新建模块**：`backend/app/features/notification/onboarding.py`

**邮件序列**：

| 天数 | 邮件主题 | 内容要点 | 目标行为 |
|------|---------|---------|---------|
| Day 0 | 3 件事让你快速上手 | 1. 设置 watchlist 2. 看今天晨报 3. 试 AI 引擎 | 激活核心功能 |
| Day 1 | 你的第一份专属日报已生成 | 展示专属日报截图 + 直达链接 | 体验个性化价值 |
| Day 3 | 你的持仓受什么宏观因素影响？ | 宏观仪表盘 + 持仓关联解读 | 使用宏观功能 |
| Day 7 | 试用半程回顾 | 你用了 X 功能，还没试 Y | 提升功能覆盖 |
| Day 11 | 还剩 3 天 | 列出未使用功能 + 每个的价值 | 制造紧迫感 |
| Day 14 | 试用结束 | 免费 vs 付费对比 + 订阅链接 | 转化 |

**实现**：
- 新增 cron 端点 `POST /api/cron/onboarding-emails`（每天跑一次）
- 查 `subscriptions` 表中 `access_expires_at` 在 14 天内的用户
- 计算 `day = 14 - (access_expires_at - now).days`
- 按天数匹配邮件模板并发送
- 在 `subscriptions` 表新增 `onboarding_step` 字段（或用独立表），记录已发送步骤，防重发

**模板位置**：`backend/app/features/notification/onboarding_templates.py`

**个性化数据来源**：
- Day 1：从 `personal_digests` edge function 查是否生成了第一份 digest
- Day 7：从后端日志或访问记录中统计功能使用情况（如无，可简化为固定推荐）

**验证**：
- [ ] 注册后 Day 0 收到欢迎引导邮件
- [ ] 各天数邮件按时发送且不重发
- [ ] Day 14 邮件包含正确的订阅链接

---

## 实施优先级与依赖关系

```
阶段一 (Week 1-2)
  改造 1 (注册即试用)           ← 核心，最先开始
  改造 2 (PaywallGuard 预览层)  ← 独立，可与改造 1 并行
  改造 3 (首页 CTA)             ← 轻度依赖改造 2（功能卡片跳转到预览页）

阶段二 (Week 3-6)
  改造 4 (合并订阅和注册)       ← 独立
  改造 5 (邮件回流钩子)         ← 与 email-conversion-hooks.md 协同
  改造 6 (引导邮件序列)         ← 依赖改造 1（试用 = Max 才有意义引导全功能）
```

## 与现有计划的关系

| 现有计划 | 关系 | 协同方式 |
|---------|------|---------|
| `email-conversion-hooks.md` | 改造 5 是其超集 | 先执行该计划的 5 个钩子，再叠加用户差异化逻辑 |
| `enforce-tier-gating.md` | 改造 2 的预览层需配合权限判断 | 该计划的 Phase A（止血）先行，预览层复用其权限逻辑 |

## 成功指标

| 指标 | 当前估计 | 阶段一目标 | 阶段二目标 |
|------|---------|-----------|-----------|
| 邮件→网站点击率 | ~2% | 5% | 10% |
| 注册转化率（访客→注册） | ~3% | 8% | 12% |
| 试用激活率（注册→试用） | ~30%（需问卷+邀请码） | 95%（注册即试用） | 95% |
| 试用→付费转化率 | 未知 | 建立基线 | 10% |
| 免费用户日均网站访问 | ~0.1 次 | 0.3 次 | 0.5 次 |

## 待定问题

1. **邀请码转型细节**：老带新机制的具体奖励规则（+7 天？+14 天？）和 KOL 渠道码的管理方式？
2. **邮件差异化（改造 5）**：Resend 是否支持同一次 broadcast 中按 contact 属性插入不同内容？如果不支持，需要分 segment 多次发送。
3. **预览内容的 SEO 影响**：预览层用 `aria-hidden` 会不会影响搜索引擎收录？需要 SSR 时根据 bot UA 返回完整内容？
4. **Onboarding 问卷去留**：保留为可选的用户画像采集（放在 /profile 或 Day 3 邮件中引导），用于个性化推荐。

## CEO Review 决策记录 (2026-04-12)

**审查模式**：HOLD SCOPE（全量 6 改造，不扩展不缩减）

### 架构决策

| # | 决策 | 原因 |
|---|------|------|
| 1 | Auto-trial 通过服务端 webhook 触发，不依赖客户端 | 用户关闭浏览器也能获得试用；Google OAuth 走同一路径 |
| 2 | Stripe 失败时 DB 直写兜底 + 后台重试 | 首次体验不能因第三方服务故障而失败 |
| 3 | Auto-trial endpoint 幂等（先查再创建） | 防止重复创建 Stripe subscription |
| 4 | 提取 `create_trial_subscription()` 共享函数 | DRY，邀请码兑换和自动注册复用同一逻辑 |
| 5 | Welcome email 失败返回 success + 后台重试 | 订阅本身已成功，不因邮件故障阻断用户 |
| 6 | PaywallGuard 三种 CTA 模式 | 未注册/已注册无订阅/试用过期 各需不同引导 |
| 7 | Preview API 失败时显示静态 skeleton | 预览层不应因 API 故障显示空白 |
| 8 | Onboarding cron 幂等（按 onboarding_step 防重发） | cron 重复执行不应导致重复邮件 |

### 问题清单修正

- 原问题 #5 描述为「邀请码给 Pro 试用」，但代码 `db.py:84` 已使用 `plan="max"`。修正为「获取试用需要填问卷+邀请码，5+步流程导致流失」。

### 安全决策

- 试用滥用防护：当前用户规模（~100）下暂不处理，依赖 Stripe 原生去重。

### 部署策略

每个改造独立部署，无 DB migration 依赖。`PAYWALL_ENABLED` 作为紧急关闭开关。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps (1 double-failure edge case mitigated) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** CEO CLEARED -- eng review required before implementation.
