# Admin CRM 增强：邮件订阅 + Agent 对话可见性

## 背景

CRM 用户详情页只显示运营档案 + 人工录入交互，不展示用户实际行为：
- 不知道用户订阅了哪些日报
- 不知道是否生成过专属持仓日报
- 看不到用户问 Agent 的具体问题

## 目标

增强用户详情页 + 列表视图，使运营人能直接看到这三类信息。

## 决策（已拍板）

- **Agent 对话展示**：列表 title，点击展开看完整 user+assistant 对话
- **对话数量**：默认 10 条 + 「查看全部」按钮
- **专属日报区块**：轻量版（订阅状态 + 总数 + 最近日期）
- **列表「订阅」列**：只显示早/周/专 3 个图标（基于 entitlements + 近 30 天有 digest），晚报因属用户偏好仅在详情页显示

## 数据源

| 信息 | 来源 | 调用 |
|---|---|---|
| 早/晚/周订阅状态 | Resend Segments | `subscription_service.get_email_preferences(email)` （详情页时调，~550ms） |
| 专属日报订阅 | Resend Audience | 同上 |
| 专属日报总数+最近日期 | `personal_digests` 表 SQL | `crm_router /users/{id}` 内 |
| 列表「订阅」近似值 | `entitlements` + `personal_digests` 30d 聚合 | `subscriptions.js list_all` 增字段 |
| Agent 对话列表 | `picker_conversations` 表（`list` action） | edge function（已支持） |
| 单条对话详情 | `picker_conversations.get` | edge function（已支持） |

注：`picker_conversations` 无 RLS，admin 后端 anon key 跨 user_id 可查（已验证）。

## 改动清单

### 后端
1. `backend/app/edge_functions/subscriptions.js` — `list_all` 输出加：
   - `personal_digest_count_30d`
   - `personal_digest_last_date`
2. `backend/app/features/admin/crm_router.py` — `/users/{user_id}` 追加：
   - `email_subscriptions`: dict（morning/daily/weekly/personal_digest 的订阅 bool）
   - `personal_digest`: dict（count_total, last_date）
   - `conversations`: list（最近 10 条 metadata）
   - 新端点 `/users/{user_id}/conversations` `?limit=N` 拿全部
   - 新端点 `/users/{user_id}/conversations/{conv_id}` 单条详情含 messages

### 前端
3. `frontend/src/app/admin/users/[id]/page.tsx` — types 扩展
4. `frontend/src/app/admin/users/[id]/_components/UserDetail.tsx`
   - + `EmailSubscriptionsSection`
   - + `ConversationsSection`（列表 + 展开单条 + 加载全部）
5. `frontend/src/app/admin/page.tsx` — `UserRecord` 加 4 字段
6. `frontend/src/app/admin/_components/AdminDashboard.tsx` — 表格加「订阅」列

### 文档
7. `backend/app/features/admin/.context.md`（如不存在则创建）— 同步说明
8. 完成后本文件移到 `docs/plans/completed/`

## 性能策略

- 列表页 0 次 Resend 调用，全部走 entitlements + Insforge 聚合
- 详情页 1 次 Resend 调用（~550ms），加载阻塞但单次可接受
- 对话列表用 edge function `list`（不带 data 字段，<20 条记录），单条 `get` 才载完整 messages

## 不做

- 不实时刷新订阅状态（详情页一次加载即可，刷新页面重读）
- 不做对话搜索/全文检索（最近 10 条 + 加载全部已够用）
- 不做对话单条编辑/删除（admin 只读）
