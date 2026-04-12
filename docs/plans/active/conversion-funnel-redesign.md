# Conversion Funnel Redesign — 用户价值感知与转化漏斗重建

> Status: Planning
> Created: 2026-04-12
> Related: [email-conversion-hooks.md](email-conversion-hooks.md), [enforce-tier-gating.md](enforce-tier-gating.md)
> Vision: 解决 freemium 死循环——最好的功能藏在最深的付费墙后面，用户在付费前无法体验，而免费功能又不够好到驱动转化

## 核心问题

当前产品流程存在一个根本矛盾：

```
最好的功能 (AI 引擎、宏观仪表盘、个股研究)
    ↓ 被锁在 Max ($9.99) 后面
    ↓ 邀请码试用只给 Pro（接触不到这些功能）
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
| 5 | 免费邮件用户 | `/today` 和邮件内容完全重复，网站零增量价值 | P1 |
| 6 | 免费邮件用户 | 没有「升级预览」机制，付费前完全看不到高级功能长什么样 | P1 |
| 7 | 有 watchlist 用户 | `/for-you` 和邮件专属日报的关系模糊 | P2 |
| 8 | 试用期用户 | 邀请码给 Pro 试用，但真正有冲击力的功能在 Max | P0 |
| 9 | 试用期用户 | 问卷→兑换码的流程断裂太严重（5+ 步） | P0 |
| 10 | 试用期用户 | 试用期没有引导式 onboarding 旅程 | P2 |
| 11 | 付费决策 | Pro 层定位尴尬，实质选择是「免费 vs Max」 | P2 |
| 12 | 付费决策 | PaywallGuard 弹窗缺乏说服力，只显示「交钱」 | P1 |
| 13 | 横切 | 导航栏暴露大量免费用户无法使用的功能 | P2 |
| 14 | 横切 | 缺少渐进式价值展示（免费额度机制） | P0 |

## 设计方案

分三阶段实施，每个阶段内部按改动从小到大排列。

---

### 阶段一：立竿见影（1-2 周，改动小，效果直接）

#### 改造 1：邀请码试用从 Pro 升级为 Max

**解决问题**：#8
**改动范围**：仅后端 1 个文件

**当前行为**：
```python
# backend/app/features/invites/router.py → redeem_invite()
await upsert_subscription(user_id=user_id, plan="pro", ...)
```

**目标行为**：
```python
await upsert_subscription(user_id=user_id, plan="max", ...)
```

**验证**：
- [ ] 兑换邀请码后 `/api/payment/me/entitlements` 返回全部 Max 权限
- [ ] 前端 `/research`、`/macro`、`/stock` 对试用用户可访问
- [ ] 试用到期后权限正确回收

**注意**：需同步更新前端文案。当前 request-access 页面写的是「14 天 Pro 免费体验」，应改为「14 天全功能免费体验」：
- `frontend/src/app/request-access/page.tsx` — 问卷页标题和成功提示
- `frontend/src/components/PaywallGuard.tsx` — 邀请码区域文案
- `frontend/src/app/pricing/page.tsx` — 邀请码兑换区域文案

---

#### 改造 2：问卷→兑换码的断裂流程一键打通

**解决问题**：#9

**当前流程**（5+ 步，每步流失）：
```
填问卷 → 拿到码 → 复制 → 去 /pricing 或 paywall → 粘贴码 → 如果未登录还要先注册
```

**方案 A（推荐，短期实施）**：问卷提交后自动兑换

改造 `POST /api/invites/qualify` 和 request-access 页面：

```
已登录用户填问卷 → 后端自动调用 redeem 逻辑 → 返回 { code, auto_redeemed: true }
  → 前端显示 "已激活！14 天全功能体验已开启" + "开始探索" 按钮

未登录用户填问卷 → 返回 code → 前端显示 code
  → "注册并激活" 按钮 → /login?redirect=/api/invites/auto-redeem&code=XXX
  → 登录/注册完成后自动跳转兑换 → 进入产品
```

**后端改动**：
- `backend/app/features/invites/router.py`：
  - `qualify` endpoint 增加可选 `user_id` 参数（从 token 获取，未登录时为 None）
  - 如果 `user_id` 存在，自动调 `upsert_subscription(plan="max", ...)`
- 新增 `GET /api/invites/auto-redeem?code=XXX` 端点：登录后自动兑换 + 302 重定向到 `/today`

**前端改动**：
- `frontend/src/app/request-access/page.tsx`：
  - 提交时附带 auth token（如有）
  - 成功后根据 `auto_redeemed` 字段显示不同 UI
  - 未登录时的 CTA 改为「注册并自动激活」，链接到 `/login?redirect=...`

**方案 B（阶段三目标）**：注册即试用，废除邀请码门控。见改造 10。

---

#### 改造 3：日报邮件加入「回流钩子」

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

---

#### 改造 4：PaywallGuard 从「锁」变成「预览+锁」

**解决问题**：#2, #6, #12

**当前行为**：免费用户访问付费页面 → 看到锁图标 + 「查看订阅方案」

**目标行为**：免费用户访问付费页面 → 看到**真实内容的预览** + 渐变遮罩 + CTA

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
      {/* CTA 浮层 */}
      <div className="absolute inset-x-0 bottom-0 text-center pb-12 space-y-3">
        <p className="text-lg font-medium">解锁完整内容</p>
        <p className="text-sm text-muted-foreground">免费体验 14 天全部功能</p>
        <Button onClick={handleTrialStart}>免费试用</Button>
        <p className="text-xs text-muted-foreground">
          已有账号？<Link href="/login">登录</Link>
        </p>
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
- `/macro` 预览：调 API 获取延迟 7 天的真实数据（见改造 7）
- `/stock` 预览：显示静态赛道列表 + 从 FMP 拉基础报价（已有免费端点）
- `/morning` 预览：调 `/api/morning/latest` 只返回 title + 前 2 段（后端新增 `preview=true` 参数）
- `/research` + `/for-you` 预览：用静态截图，放在 `public/previews/` 下

---

### 阶段二：系统性改善（2-4 周）

#### 改造 5：首页 CTA 重新设计

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
- 卡片点击后跳转到对应页面的**预览版**（改造 4 的成果）

---

#### 改造 6：试用期引导邮件序列（Drip Campaign）

**解决问题**：#10

**新建模块**：`backend/app/features/notification/onboarding.py`

**邮件序列**：

| 天数 | 邮件主题 | 内容要点 | 目标行为 |
|------|---------|---------|---------|
| Day 0 | 欢迎！3 件事让你快速上手 | ① 设置 watchlist ② 看今天晨报 ③ 试 AI 引擎 | 激活核心功能 |
| Day 1 | 你的第一份专属日报已生成 | 展示专属日报截图 + 直达链接 | 体验个性化价值 |
| Day 3 | 你的持仓受什么宏观因素影响？ | 宏观仪表盘 + 持仓关联解读 | 使用宏观功能 |
| Day 7 | 试用半程回顾 | 你用了 X 功能，还没试 Y | 提升功能覆盖 |
| Day 11 | 还剩 3 天——你错过了这些 | 列出未使用功能 + 每个的价值 | 制造紧迫感 |
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

---

#### 改造 7：免费用户的「渐进式价值展示」——有限免费额度

**解决问题**：#5, #14

**核心思路**：让免费用户每天能「尝一口」最好的功能，额度用完后引导试用/订阅。

**额度设计**：

| 功能 | 免费额度 | 限制维度 | 实现方式 |
|------|---------|---------|---------|
| AI 研究引擎 | 每天 1 次对话（3 轮） | 按 user_id，未登录按 IP | 后端 rate limit + 前端计数 |
| 个股研究 | 每周 2 篇完整报告 | 按 user_id | 后端计数 |
| 宏观仪表盘 | 显示延迟 7 天的数据 | 数据本身延迟 | 后端 `delayed=true` 参数 |
| 晨报 | 每周 1 篇完整访问 | 按 user_id，未登录按 IP | 后端 rate limit |

**后端实现**：

新建 `backend/app/core/freemium.py`：

```python
"""
Freemium rate limiting for non-subscribers.

Provides limited free access to premium features to demonstrate value.
Counts are stored in-memory with daily/weekly reset.
"""

FREEMIUM_LIMITS = {
    "ai_research_engine": {"limit": 1, "window": "daily"},
    "stock_research": {"limit": 2, "window": "weekly"},
    "morning_website": {"limit": 1, "window": "weekly"},
}

async def check_freemium_access(user_id: str | None, feature: str, ip: str) -> FreemiumResult:
    """Returns (allowed: bool, remaining: int, limit: int, resets_at: datetime)"""
    ...

async def consume_freemium_quota(user_id: str | None, feature: str, ip: str) -> None:
    """Decrement quota after successful access."""
    ...
```

**前端实现**：

PaywallGuard 新增 freemium 逻辑：

```tsx
// 在 PaywallGuard 中，当用户无订阅但有免费额度时
if (!hasAccess && freemiumQuota && freemiumQuota.remaining > 0) {
  return (
    <>
      {/* 顶部提示条 */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4
        flex items-center justify-between">
        <span>免费体验（今日剩余 {freemiumQuota.remaining} 次）</span>
        <Button variant="outline" size="sm" asChild>
          <Link href="/pricing">解锁无限使用</Link>
        </Button>
      </div>
      {/* 正常内容 */}
      {children}
    </>
  );
}

// 额度用完时
if (!hasAccess && freemiumQuota && freemiumQuota.remaining === 0) {
  return (
    <div className="text-center py-16 space-y-4">
      <p>今天的免费体验次数已用完</p>
      <p className="text-sm text-muted-foreground">
        {freemiumQuota.window === 'daily' ? '明天再来' : '下周刷新'}
        ，或者开通试用解锁无限使用
      </p>
      <Button>免费试用 14 天</Button>
    </div>
  );
}
```

**宏观仪表盘延迟数据**：

修改 `/api/macro/risk` 等端点：
- 付费用户：返回实时数据
- 免费用户（无订阅 + 无试用）：返回 7 天前的数据
- 前端在延迟数据模式下显示提示：「数据延迟 7 天，订阅查看实时数据」

---

#### 改造 8：合并邮件订阅和账号注册

**解决问题**：#3

**当前问题**：首页 SubscribeForm 只做 Resend 邮件订阅，和网站账号是两套系统。

**改造后流程**：

```
用户输入邮箱 → 点「免费订阅」
  ↓
后端 /api/subscriptions/daily_report/subscribe
  ├─ 邮箱已有账号 → 订阅邮件 + 返回 { is_new: false, has_account: true }
  │   → 前端显示 "已订阅！登录解锁更多功能"
  │
  └─ 邮箱无账号 → 订阅邮件 + 返回 { is_new: true, has_account: false }
      → 发送特殊欢迎邮件（不同于普通 welcome email）
```

**特殊欢迎邮件内容**：

```
Subject: 欢迎加入 TheMarketBrew — 你的 14 天全功能体验已就绪

你的市场日报已订阅成功 ✓

除了每日邮件，我们还为你准备了：
• AI 投研引擎 — 对话式个股分析
• 宏观仪表盘 — 流动性/经济/通胀/情绪四维监控
• 专属持仓日报 — 只分析你关心的股票

点击下方按钮，一键注册并开启 14 天免费体验：

   [一键注册，开始体验 →]
   （链接：/login?email={email}&trial=true）

无需信用卡 · 14 天后自动结束
```

**后端改动**：
- `backend/app/features/subscription/router.py`：subscribe 端点增加 `has_account` 返回字段（查 Insforge auth users 表）
- `backend/app/features/subscription/email_templates.py`：新增 `format_trial_welcome_html()` 模板
- `backend/app/features/subscription/email_service.py`：新账号走新模板

**前端改动**：
- `frontend/src/components/SubscribeForm.tsx`：根据 `has_account` 字段显示不同成功提示

---

### 阶段三：战略级改造（4-8 周）

#### 改造 9：重新定义 Pro 和 Max 的价值分层

**解决问题**：#11

**当前问题**：Pro ≈ 多几封邮件，Max = 全部功能。用户真实选择是「免费 vs Max」，Pro 层尴尬。

**推荐方案：重新分配功能，让 Pro = 数据+报告，Max = AI 智能分析**

```
Free       → 日报邮件 + /today 网页
Pro ($X)   → Free 全部
             + 晨报（邮件 + 网站）
             + 专属持仓日报（邮件 + 网站）
             + 宏观仪表盘（只读数据，无 AI 分析）
             + 个股页面（基础数据 + 财报，无 AI 深度）
             + 宏观周报邮件

Max ($Y)   → Pro 全部
             + AI 研究引擎（核心差异化）
             + 个股 AI 深度分析
             + 宏观 AI 分析 + 智能周报
             + 优先数据更新
```

**核心逻辑**：
- Pro 的价值主张：「数据和报告，帮你省时间」
- Max 的价值主张：「AI 帮你分析，帮你做决策」
- 这两个是不同的用户画像，不是简单的「多 vs 少」

**改动范围**：
- `backend/app/features/payment/entitlements.py`：重新定义 PRO_FEATURES 和 MAX_ONLY_FEATURES
- `frontend/src/components/PaywallGuard.tsx`：`MAX_ONLY_FEATURES` set 更新
- `frontend/src/app/pricing/page.tsx`：功能对比表更新
- `frontend/src/app/macro/page.tsx`：拆分为只读数据（Pro）和 AI 分析（Max）
- `frontend/src/app/stock/page.tsx`：拆分为基础数据（Pro）和 AI 分析（Max）

**注意**：此改造涉及已有 `enforce-tier-gating.md` 计划中定义的权限分配。实施时需同步更新该计划中的 PaywallGuard 等级表。

---

#### 改造 10：注册即试用，废除邀请码门控

**解决问题**：#8, #9 的终极方案

**当前流程**：注册 → 填问卷 → 拿邀请码 → 手动兑换 → 试用
**目标流程**：注册 → 自动获得 14 天 Max 试用 → 简化 onboarding

**注册流程改造**：

```
1. 用户注册（邮箱+密码 或 Google OAuth）
2. 注册成功回调中自动执行：
   - upsert_subscription(plan="max", access_expires_at=now+14d)
   - subscribe to daily_report email
   - create default email_preferences (all true for trial)
3. 重定向到简化版 onboarding（2 步，不是 5 步问卷）：
   - 第 1 步：选 3-5 只关注的股票（设置 watchlist）
   - 第 2 步：选最关心的主题（宏观/个股/AI 分析）
4. 根据选择跳转到最相关的页面

问卷保留但改为可选：
- 在 /profile 中展示
- 或在 Day 3 引导邮件中引导填写
- 用于个性化推荐，不门控任何功能
```

**后端改动**：
- `backend/app/features/invites/router.py`：新增 `POST /api/invites/auto-trial` 端点（注册回调使用）
- 现有 `POST /api/invites/qualify`：保留，但问卷变为可选的用户画像采集

**前端改动**：
- `frontend/src/contexts/AuthContext.tsx`：注册成功后自动调用 auto-trial
- 新建 `frontend/src/app/onboarding/page.tsx`：简化 2 步 onboarding
- `frontend/src/app/request-access/page.tsx`：改为可选调查页，去掉邀请码返回逻辑

**邀请码机制转型**：
- 不再是获取试用的唯一方式
- 变为「延长试用」或「老带新」的营销工具：
  - 邀请 1 个朋友注册 → 双方各加 7 天试用
  - 特殊渠道码（KOL 合作）→ 30 天试用

---

#### 改造 11：导航栏对免费用户的体验优化

**解决问题**：#13

**原则**：不隐藏导航项（隐藏会让产品显得单薄），而是改变点击后的体验。

**依赖**：改造 4（预览层）+ 改造 7（免费额度）完成后，此改造自然生效。

**补充改动**：在导航项旁标注状态徽章

```tsx
// Navbar 中，对未订阅用户显示功能状态
<NavItem href="/research">
  投研助手
  {!isMax && <Badge variant="outline" className="ml-1 text-[10px]">试用</Badge>}
</NavItem>

<NavItem href="/macro">
  宏观
  {!isMax && <Badge variant="outline" className="ml-1 text-[10px]">延迟</Badge>}
</NavItem>
```

**效果**：用户知道可以点进去看，不会有「点了白点」的挫败感。

---

#### 改造 12：完整漏斗串联

前面所有改造组合成一个完整的用户旅程：

```
┌─────────────────────────────────────────────┐
│ 触点 1: 首页                                 │
│ 改造 5: CTA → "免费体验 14 天"               │
│ 改造 8: 订阅邮箱 → 特殊 welcome → 注册链接   │
└────────────────────┬────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────┐
│ 触点 2: 每日日报邮件                          │
│ 改造 3 + email-conversion-hooks:             │
│   个性化钩子（持仓/热股/宏观信号灯）           │
│   → 点击来到网站                              │
└────────────────────┬────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────┐
│ 触点 3: 网站免费体验                          │
│ 改造 4: 预览层（看到但摸不到）                 │
│ 改造 7: 有限免费额度（尝一口最好的功能）       │
│   → 用户内心: "这个有用但不够"                 │
└────────────────────┬────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────┐
│ 触点 4: 注册 + 试用                           │
│ 改造 1: 试用 = Max（全功能）                   │
│ 改造 2/10: 流程极简（注册即试用）              │
│   → 全功能解锁                                │
└────────────────────┬────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────┐
│ 触点 5: 试用期引导                            │
│ 改造 6: 7 封引导邮件，推动功能探索             │
│   → 用户形成使用习惯                          │
└────────────────────┬────────────────────────┘
                     ↓
┌────────────────────┴────────────────────────┐
│ 触点 6: 到期转化                              │
│ 改造 6 Day 14 邮件 + PaywallGuard 提醒       │
│ 改造 9: 清晰的 Pro/Max 价值分层               │
│   → 基于 14 天真实使用体验做付费决策           │
└─────────────────────────────────────────────┘
```

---

## 实施优先级与依赖关系

```
阶段一 (Week 1-2)
  改造 1 (邀请码 Pro→Max)     ← 独立，可立即开始
  改造 2 (问卷自动兑换)        ← 依赖改造 1
  改造 3 (邮件回流钩子)        ← 与 email-conversion-hooks.md 协同
  改造 4 (PaywallGuard 预览)   ← 独立，可立即开始

阶段二 (Week 3-6)
  改造 5 (首页 CTA)            ← 轻度依赖改造 4（功能卡片跳转到预览页）
  改造 6 (引导邮件序列)         ← 依赖改造 1（试用 = Max 才有意义引导全功能）
  改造 7 (免费额度)             ← 独立，但建议改造 4 之后
  改造 8 (合并订阅和注册)       ← 独立

阶段三 (Week 7-12)
  改造 9  (Pro/Max 重分层)      ← 需与 enforce-tier-gating.md 同步
  改造 10 (注册即试用)          ← 依赖改造 9（分层确定后才能决定试用范围）
  改造 11 (导航优化)            ← 依赖改造 4 + 7
  改造 12 (漏斗串联)            ← 以上全部完成
```

## 与现有计划的关系

| 现有计划 | 关系 | 协同方式 |
|---------|------|---------|
| `email-conversion-hooks.md` | 改造 3 是其超集 | 先执行该计划的 5 个钩子，再叠加用户差异化逻辑 |
| `enforce-tier-gating.md` | 改造 9 需重新定义权限分配 | 该计划的 Phase A（止血）先行，改造 9 在阶段三修正长期架构 |

## 成功指标

| 指标 | 当前估计 | 阶段一目标 | 阶段二目标 | 阶段三目标 |
|------|---------|-----------|-----------|-----------|
| 邮件→网站点击率 | ~2% | 5% | 10% | 15% |
| 注册转化率（访客→注册） | ~3% | 5% | 8% | 12% |
| 试用激活率（注册→试用） | ~30%（需问卷+邀请码） | 60% | 80% | 95%（注册即试用） |
| 试用→付费转化率 | 未知 | 建立基线 | 10% | 15% |
| 免费用户日均网站访问 | ~0.1 次 | 0.3 次 | 0.5 次 | 1 次 |

## 待定问题

1. **改造 7 免费额度的反滥用**：未登录用户按 IP 限制，是否需要更强的防刷机制（如 fingerprint）？
2. **改造 9 Pro/Max 重分层**：是否需要给现有 Pro 用户一个迁移期？还是直接扩大 Pro 权限（向上兼容）？
3. **改造 10 注册即试用**：是否完全废除问卷，还是保留为可选的用户画像采集？保留可以帮助个性化推荐。
4. **邮件差异化（改造 3）**：Resend 是否支持同一次 broadcast 中按 contact 属性插入不同内容？如果不支持，需要分 segment 多次发送。
5. **延迟数据的法律合规**：宏观数据延迟 7 天显示给免费用户，数据源的 license 是否允许？
6. **预览内容的 SEO 影响**：预览层用 `aria-hidden` 会不会影响搜索引擎收录？需要 SSR 时根据 bot UA 返回完整内容？
