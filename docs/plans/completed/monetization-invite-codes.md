# Monetization: 邀请码启动 + Paywall 激活 Engineering Plan

> Status: In Progress (Phase 1 基本完成，Phase 2 准备中)
> Vision: 全功能付费 + 邀请码内测 → 用户帮拉新 → 两周后开收费

## 目标

激活 Paywall（所有功能付费），通过邀请码系统做内测分发。现有 350 订阅者通过：
1. 邀请 1 个新用户 → 获得 14 天免费访问
2. 提交一条真实反馈 → 获得 14 天免费访问

被邀请进来的新用户（Gen 2）兑换邀请码后，自动获得自己的专属推荐链接，可继续裂变。

## 定价结构

| | 月付 |
|--|------|
| **早鸟价（限前 50 人）** | $9.99/月 |
| **标准价** | $19.99/月 |

年付（延后推出）：早鸟 $79.99/年，标准 $149.99/年。

## Free vs Pro（已更新）

**无免费功能。所有功能需要邀请码或付费。**

```
Pro（邀请码 14 天 / 付费订阅）：
  /today          完整日报
  /morning        完整早报
  /stock/[symbol] AI 深度分析卡
  /for-you        AI 个性化摘要 + 自选股
  /macro          宏观仪表盘（流动性、通胀、情绪）
  /screener       AI 选股助手（Research Desk）
```

**注意**：邮件日报广播保持不变，仍发给所有邮件订阅者（邮件和 app 权限独立）。

## 邀请码机制

### 两种码

| 类型 | 用途 | 实现方式 |
|------|------|---------|
| 通用码 | 小红书发帖，任何人可用 | 环境变量 `INVITE_CODES`（可多个，逗号分隔） |
| 专属推荐码 | 每个用户一个，追踪拉新 | `subscriptions.referral_code` 字段 |

### 兑换流程

```
用户输入邀请码（通用码 或 专属推荐码）
  → 后端验证有效
  → upsert subscriptions:
      plan=pro, status=active
      access_expires_at = now() + 14 天
      invite_code = 输入的码
      referred_by = 码的所有者 user_id（如果是专属码）
  → 如果 referred_by != null：referral_count + 1
  → 为兑换者生成 referral_code（如果还没有）
  → 返回 { success: true, access_expires_at, referral_code, referral_link }
```

### 推荐链接展示时机

- 兑换成功后立刻展示（兑换成功页面）
- 第一次 AI 对话完成后再次展示
- 用户 Profile 页面常驻显示

### 反馈换访问（手动处理）

用户提交反馈表单（Tally/Google Form 链接）→ 创始人手动在后台给该用户开通 14 天访问。
不需要自动化，手动处理保证反馈质量。

## 数据库变更

### `subscriptions` 表新增字段

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;
```

### `isPro` 判断逻辑更新

```typescript
// 原来
isPro = !PAYWALL_ENABLED || (plan === 'pro' && status === 'active')

// 更新后（加入 access_expires_at 支持）
isPro = !PAYWALL_ENABLED ||
        (plan === 'pro' && status === 'active' &&
         (!access_expires_at || new Date(access_expires_at) > new Date()))
```

## API 设计

| 端点 | 方法 | 认证 | 描述 |
|------|------|------|------|
| `/api/invites/redeem` | POST | Bearer | 兑换邀请码，返回 access_expires_at + referral_code |
| `/api/invites/my-ref-code` | GET | Bearer | 获取当前用户的推荐码和推荐链接 |
| `/api/invites/generate` | POST | Cron | 批量生成专属推荐码（给邮件订阅者用） |
| `/api/invites/stats` | GET | Cron | 兑换统计（管理员用） |

## 实施步骤

### Phase 1：工程实现（1天）

- [x] **DB**：执行 `subscriptions` 表 ALTER SQL（Insforge）
- [x] **后端**：新建 `features/invites/` 模块（`router.py` + `db.py` + `models.py`）
- [x] **后端**：`POST /api/invites/redeem`
- [x] **后端**：`GET /api/invites/my-ref-code`
- [ ] **后端**：`POST /api/invites/generate`（批量生成专属码，返回 CSV）
- [x] **后端**：`main.py` 注册 invites router
- [x] **前端**：新建 `InviteCodeModal.tsx`
- [x] **前端**：`SubscriptionContext` 加 `redeemInviteCode()` + `myRefCode` + `referralCount`
- [x] **前端**：`PaywallGuard` 更新 FEATURES 数组（全部 Pro，无免费功能）+ 加邀请码入口
- [x] **前端**：`/today` 和 `/morning` 页面加 `PaywallGuard`
- [x] **前端**：`StockAnalysisCard` 加 `isPro` 门控
- [x] **前端**：兑换成功后展示推荐链接（InviteCodeModal 成功页面）
- [ ] **前端**：AI 对话完成后展示推荐链接提示（低优先级，推荐系统暂未启用）

### Phase 2：激活与分发（Phase 1 完成后）

- [ ] 生成 350 个专属推荐码（`POST /api/invites/generate`），导出 CSV
- [ ] 起草邮件：说明转付费时间线 + 每人专属链接 + 反馈表单链接
- [ ] **Vercel**：设置 `NEXT_PUBLIC_ENABLE_PAYWALL=true`
- [ ] **Railway**：设置 `INVITE_CODES=BREW2024`（通用码，用于小红书）
- [ ] 发邮件给 350 订阅者
- [ ] 小红书发帖（展示 AI 对话质量 + 通用邀请码 BREW2024）

### Phase 3：两周后正式收费

- [ ] Stripe 配置早鸟 price（$9.99/月）
- [ ] 发邮件提醒邀请码用户 access_expires_at 临近
- [ ] 引导付费（早鸟价）

## 成功指标

| 指标 | 目标 |
|------|------|
| 邀请码兑换数 | 100+ |
| Gen 2 注册数（推荐来的） | 50+ |
| 14 天内回访率 | >60% |
| 两周后付费转化 | 10+ |
