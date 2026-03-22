# Monetization: 邀请码启动 + Paywall 激活 Engineering Plan

> Status: Planning
> Related: features/payment/.context.md, features/subscription/.context.md, contexts/.context.md
> Vision: 饥饿营销 + 邀请码内测 → 验证付费意愿 → 正式变现

## 目标

通过邀请码系统实现内测分发（250 邮件订阅者 + 小红书粉丝），激活 Paywall 制造稀缺感，在两周内完成产品"展示 AI 有多牛"的第一次公开亮相，同时收集付费意愿信号。

## 产品背景

**目标用户**：在美国炒美股的华人个人投资者。不是职业交易员，有持仓，用券商 App，没有 Bloomberg 或私人分析师。市场信息来源是微信群和半懂的英文财经网站。

**三层价值护城河**：
1. 数据聚合 — 股票、新闻、宏观数据多源整合，一处查阅
2. 理解层 — AI 用中文合成解读，消除语言壁垒
3. 交互层 — 用户可以就自己的持仓提问，信息变成可行动的判断

**变现核心逻辑**：日报（第 1+2 层）是钩子，AI 对话（第 3 层）是产品。Paywall 卡在"读完"和"追问"之间。

## 定价结构

| | 月付 | 年付（省 ~37%，延后推出） |
|--|------|--------------------------|
| **标准价** | $19.99/月 | $149.99/年 |
| **早鸟价** | $9.99/月 | $79.99/年 |

**早鸟机制**：限前 50 人，永久锁定（建议 1 年后可涨价但提前 30 天通知）。早鸟价的作用：
- 50% off → 降低首次付费决策门槛
- 限 50 名 → 稀缺感 + FOMO
- 永久锁定 → 早期用户有被重视感，降低 churn
- 这 50 人的使用数据和反馈价值远超差价

**Stripe 配置**（需要手动创建）：
- Standard price: $19.99/month（`STRIPE_PRO_PRICE_ID` 已指向此价格）
- Early bird price: $9.99/month（独立 price ID 或 coupon，PaywallGuard 现在硬编码 $9.99，上线前需确认指向哪个）

## 成功指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 首月付费用户 | 10+ | 验证"有人会为 AI 对话付费" |
| 转化路径走通 | ≥5 人 | 钩子点击 → 免费额度 → 付费完整路径 |
| D7 留存 | >70% | 付费后一周内仍在使用 |
| AI 对话深度 | >3 轮/session | 付费用户平均对话轮次 |
| NPS | >40 | 付费用户满意度 |

**预期转化（基于 350 邮件订阅者）**：
- 保守 3% → ~10 人 → $100-200/月
- 基准 5% → ~17 人 → $170-340/月
- 乐观 10% → ~35 人 → $350-700/月

## Free vs Pro 功能划分（已确认）

```
Free（无需登录）：
  /today          完整日报（每天更新，是获客钩子）
  /morning        完整早报（同上）
  /stock          个股搜索 + 基本行情 + 价格图表

Pro（邀请码 / 付费）：
  /stock/[symbol] AI 深度分析卡（叠加在免费基础信息上）
  /for-you        AI 个性化摘要 + 自选股管理
  /macro          宏观仪表盘 + 流动性 + 通胀 + 情绪子页面
  /sectors        板块分析
  /screener       AI 选股助手（Research Desk）
```

**设计逻辑**：免费用户读日报 → 想研究某股 → 进 `/stock/NVDA` → 看到基本行情 →
AI 分析卡显示「Pro 解锁」→ 有了第一个付费触发点，且已感受到 AI 的存在。

**`PaywallGuard` FEATURES 数组需同步更新**（当前与实际不符）：

| 功能 | Free | Pro |
|------|------|-----|
| 每日市场速报（/today） | ✓ | ✓ |
| 盘前早报（/morning） | ✓ | ✓ |
| 个股行情与图表（/stock） | ✓ | ✓ |
| AI 个股深度分析 | ✗ | ✓ |
| AI 个性化日报（/for-you） | ✗ | ✓ |
| 宏观仪表盘 + 流动性 | ✗ | ✓ |
| 板块分析 | ✗ | ✓ |
| AI 选股助手（/screener） | ✗ | ✓ |

## 现状

**已建好（无需重做）：**
- `PaywallGuard` 完整实现：$9.99/月定价、Free vs Pro 对比、FAQ
- `SubscriptionContext`：`isPro = !PAYWALL_ENABLED || (plan==='pro' && status==='active')`
- `PAYWALL_ENABLED = NEXT_PUBLIC_ENABLE_PAYWALL === 'true'`（当前 false，所有用户皆 Pro）
- Stripe checkout + webhook + portal 全部工作
- `payment/db.py`：`upsert_subscription(user_id, plan, status, source)` 已有，直接可用
- `subscriptions` Edge Function 支持 GET + POST(upsert)
- `/for-you`、`/macro`、`/sectors`、`/screener` 已通过 middleware 要求登录

**缺口（需要新建）：**
1. `invite_codes` 表 + Edge Function — 邀请码存储与兑换逻辑
2. 后端：管理员生成码 + 用户兑换码端点
3. 前端：邀请码兑换 UI（嵌入 PaywallGuard）
4. **`/stock/[symbol]` AI 分析卡 Pro 门控**：`StockAnalysisCard` 加 `isPro` 检查，不是 Pro 则显示解锁 CTA 而非调用 API
5. **`PaywallGuard` FEATURES 数组更新**：与实际 Free/Pro 划分对齐（加入早报、个股行情为 Free）
6. 环境变量：`NEXT_PUBLIC_ENABLE_PAYWALL=true`（激活 paywall）
7. 日报 🔒 钩子（邮件模板 + /today 页面）
8. 早鸟计数器（已接受的 cherry-pick）
9. 转化漏斗埋点（已接受的 cherry-pick）

## 设计

### 邀请码类型与流程

```
两种用户来源：

A. 邮件订阅者（250人，高质量）
   管理员批量生成唯一码 → 每人一码嵌入邮件
   用户登录后输入邀请码 → 兑换 Pro 30 天
   兑换后获得个人推荐链接 → 推荐 1 人 = 延长 2 周

B. 小红书粉丝（7000人，低信任但高势能）
   发"展示帖"展示 AI 对话质量
   前 50 名私信获码 → 兑换 Pro 14 天
   要求：发一条体验笔记（内容营销杠杆）
```

### 数据库设计

**新建 `invite_codes` 表：**

```sql
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,               -- BREW-XKM-847 格式
  created_for_email TEXT,              -- 发给谁的（可为空，表示通用码）
  redeemed_by_user_id TEXT,            -- 谁兑换了
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,              -- 该码本身的有效期（生成后 30 天可兑换）
  access_days INTEGER DEFAULT 30,      -- 兑换后给多少天访问权限
  source TEXT DEFAULT 'email',         -- 'email' | 'xiaohongshu' | 'admin'
  referrer_user_id TEXT,               -- 谁推荐的（推荐链接带来的）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`subscriptions` 表新增字段（通过 upsert 写入）：**
- `source TEXT` — 已有，改为写入 `'invite_code'`
- `invite_code TEXT` — 新增，记录兑换的哪个码
- `access_expires_at TIMESTAMPTZ` — 新增，邀请码访问到期时间

### 数据流

```
管理员调用 generate 端点
  -> 批量生成 N 个 BREW-XXX 码
  -> 写入 invite_codes 表
  -> 返回 CSV（复制到邮件工具）

用户收到邮件 / 看到小红书 -> 注册/登录
  -> 进入任意 Pro 功能页 -> PaywallGuard 显示
  -> PaywallGuard 底部：「有邀请码？立即兑换」
  -> 点击 -> 弹出 InviteCodeModal
  -> POST /api/invites/redeem { code }
  -> 后端验证 code 有效 + 未被使用
  -> upsert_subscription(plan=pro, status=active, source=invite_code, access_expires_at=+30天)
  -> mark invite_codes.redeemed_by_user_id = user_id
  -> 前端 refreshSubscription() -> isPro=true -> 进入功能

用户兑换后 -> 显示个人推荐链接
  GET /api/invites/my-ref-code
  -> 返回用户的 invite_code（即他兑换的那个码）
  -> 前端展示：「分享你的链接，朋友通过你的链接注册即可延长你的访问」
```

### API 设计

**后端新增路由 `features/invites/router.py`：**

| 端点 | 方法 | 认证 | 描述 |
|------|------|------|------|
| `/api/invites/generate` | POST | Cron | 批量生成邀请码，参数：count、source、access_days |
| `/api/invites/redeem` | POST | Bearer | 兑换邀请码 |
| `/api/invites/my-ref-code` | GET | Bearer | 获取当前用户的推荐码 |
| `/api/invites/stats` | GET | Cron | 查看兑换率统计（管理员用） |

**`POST /api/invites/redeem` 请求/响应：**

```python
# 请求
{ "code": "BREW-XKM-847" }

# 响应（成功）
{ "success": true, "access_expires_at": "2026-04-21T00:00:00Z", "access_days": 30 }

# 响应（失败）
{ "success": false, "error": "invalid_code" | "already_used" | "expired" }
```

### 前端变更

**`PaywallGuard.tsx`：**
- 底部加「有邀请码？点击兑换」链接
- 点击打开 `InviteCodeModal` 组件

**新建 `InviteCodeModal.tsx`：**
- 单个输入框（大写、去空格）
- 兑换按钮 + loading 状态
- 成功后自动关闭、刷新订阅状态

**`SubscriptionContext.tsx`：**
- 新增 `redeemInviteCode(code: string): Promise<{success: boolean, error?: string}>`

**早鸟计数器（已接受 cherry-pick）：**
- `GET /api/invites/stats` 返回已兑换数量
- `PaywallGuard` 显示「已有 XX 位早鸟用户 · 还剩 XX 名额（共 50）」

### 免费 AI 对话配额（非邀请码用户的转化路径）

邀请码用户直接获得 Pro 访问。**没有邀请码的普通注册用户**走配额路径：

```
注册 → 获得 5 次免费 AI 对话
  ├── 有剩余额度 → 进入 AI 对话（消耗 1 次 session）
  ├── 额度用完  → 显示 PaywallGuard
  │   "你已体验了 5 次 AI 对话，升级 Pro 获得无限对话"
  └── Pro 用户  → 无限对话，不消耗配额
```

**为什么按 session（而非消息条数）**：按天用户可能当天没空用浪费额度；5 条消息太少无法体验价值；5 个 session 足够让用户得出"AI 能回答我的问题"的结论。

**实现方式**：
- `users` 表或独立 `user_quotas` 表加 `free_ai_chats_remaining INTEGER DEFAULT 5`
- 每次调用 `/api/screener/pick`（AI 对话入口）前检查：`isPro OR free_chats > 0`
- 非 Pro 且调用成功后 `-1`（后端原子扣减，防并发超支）
- 前端 `SubscriptionContext` 暴露 `freeChatsRemaining` 状态（可在 UI 显示"剩余 X 次"）

**本期实现范围**：邀请码内测阶段这个路径不是主流，但需要建好，否则没有邀请码的自然流量用户撞上 Paywall 时体验断裂。

### AI 模型策略

| 用户类型 | 使用模型 | 每次对话成本 | 月最大成本（重度用户） |
|----------|---------|-------------|----------------------|
| 免费配额（5 次） | `gemini-3.1-flash-lite-preview` | ~$0.001 | N/A |
| Pro 用户 | `gemini-3.1-flash-lite-preview`（当前） | ~$0.006 | ~$0.90 |

**不做积分制的原因**：Token 成本可忽略（最极端用户月成本 <$1），积分制会让用户每次追问都在纠结"值不值"，降低互动频率 = 降低价值感受 = churn 上升。

**软上限（防滥用）**：后端加每日 50 条消息的 soft cap，99.9% 用户永远不会触及，只防机器人或异常使用。

**未来升级路径**：付费用户 >100 且验证 Pro 模型质量提升明显后，将 Pro 从 flash-lite 升级到 flash/pro 模型，成本仍可控（$0.90 → $7.50/月重度用户，标准价毛利 >62%）。

### 日报 🔒 钩子设计

**触发逻辑**（钩子不是广告，是用户本来就在想的问题的入口）：

```
## 重点个股
▸ NVDA -5.2% — 英伟达出口管制担忧加剧...
  🔒 问 AI：这对我的持仓有什么影响？

## 宏观风向
10年期国债收益率上升至 4.5%...
  🔒 问 AI：利率上升对成长股意味着什么？
```

**邮件模板** (`subscription/email_templates.py`)：
在"重点个股"和"宏观风向"段落后插入：

```html
<a href="{FRONTEND_URL}/screener?report={date}&question={预设问题}" style="...">
  🔒 问 AI：这对我的持仓有什么影响？
</a>
```

链接带 `question` 参数，进入 /screener 后自动填入问题作为对话起点（已有 `activeContent` 机制支持）。

**`/today` 页面** (`app/today/page.tsx`)：
在日报关键段落后加 `<AskAIButton />` 组件：
```
🔒 问 AI → 跳转到 /screener（已登录 Pro 直接进，未登录先登录，有码先兑换）
```

**钩子问题是硬编码还是动态生成**：Phase 3 先用硬编码通用问题（快），后期可让 Agent 在生成日报时同步生成 3-5 个 follow-up questions 写入 DB，邮件读取动态问题。

### 转化漏斗埋点（已接受 cherry-pick）

后端在以下时机写日志（结构化，便于后期统计）：

```python
logger.info("funnel_event", extra={
  "event": "hook_click" | "invite_redeemed" | "paywall_shown" | "checkout_started",
  "user_id": user_id,
  "source": "email_hook" | "web_hook" | "direct",
  "code": invite_code,  # 仅 invite_redeemed 时
})
```

## 实施步骤

### Phase 1：邀请码核心 + Paywall 基础（目标：1-2天完成）

1. [ ] **DB**：创建 `invite_codes` 表 + `subscriptions` 表加 `invite_code`、`access_expires_at` 字段 + 用户配额字段 `free_ai_chats_remaining`（Insforge SQL + Edge Function 更新）
2. [ ] **后端**：新建 `features/invites/` 模块（router + db + models）
3. [ ] **后端**：实现 `POST /api/invites/generate`（Cron 认证，生成 BREW-XXX 格式码，写 DB，返回 JSON/CSV）
4. [ ] **后端**：实现 `POST /api/invites/redeem`（验证码有效 → upsert_subscription → mark redeemed）
5. [ ] **后端**：在 `main.py` 注册 invites router
6. [ ] **后端**：`/api/screener/pick` 加配额检查门控（isPro 或 free_chats > 0，成功后原子 -1）
7. [ ] **前端**：`SubscriptionContext` 加 `redeemInviteCode()` + `freeChatsRemaining` 状态
8. [ ] **前端**：新建 `InviteCodeModal.tsx` 组件
9. [ ] **前端**：`PaywallGuard.tsx` 底部加「有邀请码？点击兑换」入口
10. [ ] **前端**：更新 `PaywallGuard` FEATURES 数组（与 Free/Pro 实际划分对齐）
11. [ ] **前端**：`StockAnalysisCard` 加 `isPro` 判断：非 Pro 显示「Pro 解锁 AI 深度分析」CTA，不调用 API

### Phase 2：激活 Paywall + 邀请码分发（目标：Phase 1 完成后立即）

11. [ ] **环境变量**：Vercel 设置 `NEXT_PUBLIC_ENABLE_PAYWALL=true`，Railway 无需改动
12. [ ] **操作**：调用 generate 端点生成 250+50 个码（250 邮件订阅者每人一码，50 小红书备用）
13. [ ] **操作**：发邮件给 250 个订阅者（每人专属码，附注册链接）
14. [ ] **操作**：发小红书展示帖（展示 AI 对话截图，私信获码，要求发体验笔记）

### Phase 3：增强（目标：第二周）

15. [ ] **日报邮件**：在"重点个股"和"宏观风向"段落后加 🔒 链接（`email_templates.py`）
16. [ ] **`/today` 页面**：在日报关键段落后加 `AskAIButton` 组件，跳转 `/screener`
17. [ ] **早鸟计数器**：`GET /api/invites/stats` 端点 + `PaywallGuard` 显示「已有 XX 位 · 还剩 XX 名额」
18. [ ] **推荐链接**：`GET /api/invites/my-ref-code` + 用户兑换成功后显示推荐链接
19. [ ] **转化漏斗埋点**：后端各关键节点加结构化日志（hook_click / invite_redeemed / paywall_shown / checkout_started）

## Milestones

---

### Milestone 1 — 基础设施就绪
**前提**：无依赖，现在就可以开始。登录修复期间并行推进。

**目标**：把所有不需要用户登录就能完成的工作做完，等登录稳定后直接进入联调。

#### 代码工作

- [ ] **DB**：`invite_codes` 表建表 SQL + `subscriptions` 表加 `invite_code`、`access_expires_at` 字段 + 用户配额 `free_ai_chats_remaining`（Insforge SQL + Edge Function 更新）
- [ ] **后端**：新建 `features/invites/` 模块（`router.py` + `db.py` + `models.py`）
- [ ] **后端**：`POST /api/invites/generate`（Cron 认证，批量生成 BREW-XXX 码，写 DB，返回 JSON）
- [ ] **后端**：`POST /api/invites/redeem` 逻辑层（验证有效 + 未使用 + 未过期 → upsert_subscription → mark redeemed）
- [ ] **后端**：`GET /api/invites/stats`（已兑换数量、剩余名额）
- [ ] **后端**：在 `main.py` 注册 invites router
- [ ] **前端**：`PaywallGuard` FEATURES 数组更新（与 Free/Pro 实际划分对齐）
- [ ] **前端**：`StockAnalysisCard` 加 `isPro` 判断（非 Pro 显示解锁 CTA，不调用 API）

#### 非代码准备

- [ ] 起草邀请邮件文案（含"第一步做这三件事"使用指南）
- [ ] 起草小红书展示帖文案 + 准备 AI 对话截图素材

**完成标志**：后端 generate/redeem 端点可以用 curl 调通；前端静态改动不影响现有功能（PAYWALL_ENABLED=false 保护）；邮件文案草稿写好。

---

### Milestone 2 — 端到端联调 + 内部验证
**前提**：登录功能修复完成，Milestone 1 全部完成。

**目标**：自己先走一遍完整流程，保证每个节点不断、不卡、不报错。发给真实用户之前先过自己这关。

#### 代码工作

- [ ] **前端**：`SubscriptionContext` 加 `redeemInviteCode()` + `freeChatsRemaining` 状态
- [ ] **前端**：新建 `InviteCodeModal.tsx`（输入框 + 兑换 + 成功/失败反馈 + 自动刷新订阅状态）
- [ ] **前端**：`PaywallGuard` 底部加「有邀请码？点击兑换」入口
- [ ] **后端**：`/api/screener/pick` 加配额门控（isPro 或 free_chats > 0，成功后原子 -1）
- [ ] **早鸟计数器**：`PaywallGuard` 调 `/api/invites/stats` 展示「已有 XX 位 · 还剩 XX 名额（共 50）」

#### 验证清单（自测）

- [ ] 生成 5 个测试码，用自己账号完整走一遍：登录 → 进 /screener 遇 Paywall → 输码 → isPro=true → 进入 AI 对话
- [ ] 非 Pro 账号：用完 5 次免费额度后确认 Paywall 正确出现
- [ ] `StockAnalysisCard` 门控：非 Pro 看到解锁 CTA，Pro 看到 AI 分析
- [ ] 找 2-3 个信任的用户（不是订阅者，是朋友）内测，收集"进去之后懵不懵"的反馈

**完成标志**：自己从零走完完整流程不卡壳；至少 2 个真实用户（非你自己）完成了兑换并成功使用 AI 功能；没有明显的 UX 断点（比如兑换成功但页面没反应）。

---

### Milestone 3 — 正式分发 + 激活
**前提**：Milestone 2 完成，你自己对产品体验满意。

**目标**：翻转 Paywall 开关，向 250 个订阅者发码，小红书同步发帖，完成第一次公开亮相。

#### 发布前准备

- [ ] **Stripe**：确认 `STRIPE_PRO_PRICE_ID` 指向正确价格（早鸟 $9.99 或标准 $19.99），PaywallGuard 定价文案与实际一致
- [ ] **生成码**：调用 `POST /api/invites/generate` 生成 300 个码（250 邮件 + 50 小红书备用），导出 CSV
- [ ] **邮件**：将每人专属码嵌入邀请邮件，通过 Resend 发送给 250 个订阅者
- [ ] **环境变量**：Vercel 设置 `NEXT_PUBLIC_ENABLE_PAYWALL=true`（这是最后一步，发邮件前翻）

#### 发布后第一周

- [ ] **小红书**：发 AI 对话展示帖，评论区引导私信获码（前 50 名）
- [ ] **日报钩子**：在邮件模板"重点个股"和"宏观风向"段落后加 🔒 链接（`email_templates.py`）
- [ ] **`/today` 钩子**：日报网页对应位置加 `AskAIButton` 组件
- [ ] **推荐链接**：用户兑换成功后显示个人推荐链接（推荐 1 人延长 2 周）
- [ ] **转化漏斗埋点**：后端各节点加结构化日志，开始收集数据

#### 发布后监控（第 1 周每天看一次）

- 兑换率：发出 250 个码，有多少被兑换了？
- 活跃率：兑换后有没有真正使用 AI 功能？（看 /api/screener/pick 调用量）
- 反馈：有没有人主动来说好用 / 有 bug / 有问题？
- 付费意愿信号：有没有人问"内测结束后怎么续费"？

**完成标志**：250 封邮件发出；Paywall 在生产环境激活；至少 10 人兑换邀请码；第一条用户反馈收到。

---

## 待定问题

1. **邀请码有效期**：生成后 30 天内可兑换，兑换后 30 天访问权限 — 确认是否合适？
2. **邀请码格式**：`BREW-{3位字母}-{3位数字}` 共 ~17576 种组合，够用。要不要用更短的（如 6 位全大写字母）？
3. **推荐激励**：推荐 1 个朋友 = 延长 2 周。这个规则要在本期实现还是 Phase 3 再做？
4. **小红书用户路径**：他们不一定有邮件账号，landing page 需不需要加 Google OAuth 引导？
5. **`access_expires_at` vs Stripe 到期**：邀请码用户到期后怎么引导付费？是否需要到期前 3 天发邮件？（暂时跳过，靠用户自发）
6. **Stripe 早鸟 price 配置**：早鸟 $9.99 用独立 price ID 还是 coupon？PaywallGuard 当前硬编码 $9.99，上线前需确认 `STRIPE_PRO_PRICE_ID` 指向哪个价格。
7. **免费配额 session 定义**：5 次 = 5 个 conversation session（每 session 可多轮），还是 5 条消息？设计文档建议用 session，避免 5 条消息太浅体验不到价值。
8. **钩子问题**：🔒 后面的问题先硬编码（通用问题），还是 Phase 3 再做动态生成（Agent 生成报告时同步生成 follow-up questions）？建议先硬编码，快速上线验证钩子有没有人点。
9. **早鸟"永久锁定"**：建议实际含义是"锁定 1 年，到期前 30 天通知可能调价"，避免永远不能涨价的承诺。
