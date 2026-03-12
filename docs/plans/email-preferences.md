# 邮件订阅偏好系统

> Status: Done (code complete, segments created, 320 contacts migrated, locally verified)
> Related: `backend/app/features/subscription/.context.md`, `backend/app/features/notification/.context.md`
> Vision: 让用户选择接收哪些报纸（早报/晚报/周报/专属日报）

## Context

用户希望能选择接收哪些报纸，目前订阅即收到全部邮件，没有偏好管理能力。

**当前架构：**

- `daily_report` 受众：早报、晚报、周报共用，Broadcast API 全量发送
- `personal_digest` 受众：专属日报，Batch.send 逐人发送（已独立）
- `weekly_report` 受众：存在但周报实际用的是 `daily_report` 受众（`service.py:624` 有 bug）

**核心决策：Resend Segments + Broadcast API**

Resend 原生支持 Segments（受众内分组），且 Broadcast API 可以直接发给 `segment_id`：

```python
resend.Broadcasts.create({
    "segment_id": "...",  # 替代 audience_id
    "from": "...",
    "subject": "...",
    "html": "...",
})
```

联系人通过 API 加入/移出 Segment：

```python
resend.Contacts.Segments.add({
    "email": "user@example.com",
    "segment_id": "...",
})
```

**为什么不用 Batch.send + DB 过滤（旧方案）：**

- Batch.send 不支持 `{{{RESEND_UNSUBSCRIBE_URL}}}`，需自建退订页
- 需要新建 DB 表 + Edge Function + 过滤逻辑，与 Resend 联系人状态双数据源
- 320 人规模下 over-engineering

**Segments 方案的优势：**

- `{{{RESEND_UNSUBSCRIBE_URL}}}` 原生可用，CAN-SPAM 合规零代码
- 联系人只存一份（在 Audience 里），Segment 是标签
- `_create_and_send_broadcast()` 只需加一个 `segment_id` 参数
- 不需要新建 DB 表、Edge Function、过滤逻辑

---

## 架构设计

### Resend 层级结构

```
Audience: TheMarketBrew Daily（现有，不变）
├── Segment: Morning Report    → 早报广播目标
├── Segment: Evening Report    → 晚报广播目标
└── Segment: Weekly Report     → 周报广播目标

Audience: Personal Digest Daily（现有，不变）
└── 专属日报，继续用 Batch.send（per-user 内容不同）
```

### 数据流

```
新用户订阅
    │
    ├── Contacts.create() → TheMarketBrew Daily 受众（现有逻辑不变）
    └── Contacts.Segments.add() × 3 → 加入全部 3 个 Segment（默认全开）

用户关闭早报
    │
    └── Contacts.Segments.remove(email, morning_segment_id)

广播早报
    │
    └── Broadcasts.create(segment_id=morning_segment_id, ...)
        （只发给 Morning Report segment 里的人）
```

---

## Step 1: 创建 Segments（一次性操作）

通过 Resend API 或 Dashboard 创建 3 个 Segment：

```python
morning_seg = resend.Segments.create({"name": "Morning Report"})
evening_seg = resend.Segments.create({"name": "Evening Report"})
weekly_seg  = resend.Segments.create({"name": "Weekly Report"})
```

将 3 个 segment_id 保存到 `backend/app/core/config.py`：

```python
# Resend Segment IDs
RESEND_SEGMENT_MORNING = os.getenv("RESEND_SEGMENT_MORNING", "")
RESEND_SEGMENT_EVENING = os.getenv("RESEND_SEGMENT_EVENING", "")
RESEND_SEGMENT_WEEKLY  = os.getenv("RESEND_SEGMENT_WEEKLY", "")
```

**迁移现有订阅者**：把 `daily_report` 受众的所有联系人加入全部 3 个 Segment（一次性脚本），确保向后兼容。

---

## Step 2: 修改订阅流程 — 新用户默认加入全部 Segments

**修改** `backend/app/features/subscription/service.py`：

在 `subscribe()` / `subscribe_with_welcome()` 中，创建联系人后，额外调用：

```python
for seg_id in [RESEND_SEGMENT_MORNING, RESEND_SEGMENT_EVENING, RESEND_SEGMENT_WEEKLY]:
    if seg_id:
        resend.Contacts.Segments.add({
            "email": email,
            "segment_id": seg_id,
        })
```

仅对 `daily_report` 频道执行（`personal_digest` 和 `weekly_report` 频道不需要）。

---

## Step 3: 广播改造 — 用 segment_id 替代 audience_id

**修改** `backend/app/features/subscription/email_service.py`：

### 3a. `_create_and_send_broadcast()` 支持 segment_id

```python
def _create_and_send_broadcast(
    self,
    label: str,
    audience_id: str = None,      # 保留，向后兼容
    segment_id: str = None,       # 新增
    subject: str,
    broadcast_name: str,
    html: Optional[str] = None,
    text: Optional[str] = None,
    from_email: Optional[str] = None,
) -> dict:
    create_params: resend.Broadcasts.CreateParams = {
        "from": from_email or self.from_email,
        "subject": subject,
        "name": broadcast_name,
    }
    # segment_id 优先；没有则用 audience_id
    if segment_id:
        create_params["segment_id"] = segment_id
    else:
        create_params["audience_id"] = audience_id

    if html:
        create_params["html"] = html
    if text:
        create_params["text"] = text
    # ... 其余重试/发送/验证逻辑不变
```

### 3b. 修改 3 个广播方法

| 方法                         | 改动                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `broadcast_morning_report()` | 传 `segment_id=RESEND_SEGMENT_MORNING`                                                    |
| `broadcast_daily_report()`   | 传 `segment_id=RESEND_SEGMENT_EVENING`                                                    |
| `broadcast_weekly_report()`  | 传 `segment_id=RESEND_SEGMENT_WEEKLY`（同时修复现有 bug：从 `DAILY_REPORT` 改为正确频道） |

示例改动：

```python
async def broadcast_morning_report(self, data: dict, audience_id=None) -> dict:
    # ...
    segment_id = self._resolve_segment(RESEND_SEGMENT_MORNING)
    return self._create_and_send_broadcast(
        label="Morning",
        segment_id=segment_id,
        subject=subject,
        broadcast_name=f"Morning Report {today}",
        html=html_content,
        from_email="TheMarketBrew Morning <morning@themarketbrew.com>",
    )
```

### 3c. 新增 `_resolve_segment()` 方法

```python
def _resolve_segment(self, segment_id: str) -> str:
    """Non-production 环境路由到 test audience（用 audience_id 兜底）。"""
    if not self.is_production:
        # Segments 在测试环境可能不存在，fallback 到 test audience
        logger.info("Non-production: segment %s → test audience", segment_id)
        return None  # 让调用方 fallback 到 audience_id
    return segment_id
```

非生产环境 fallback 逻辑：`_resolve_segment()` 返回 None 时，`_create_and_send_broadcast()` 使用 `_resolve_audience()` 的 test audience。

### 3d. `broadcast_personal_digests()` 不变

专属日报已经是 Batch.send（per-user 内容不同），保持不变。偏好控制在 Step 5 前端处理——用户关闭"专属日报"时直接从 `personal_digest` 受众退订。

### 3e. `broadcast_newsletter()` 不变

Newsletter 发给整个 `daily_report` 受众（所有订阅者），不需要 segment 过滤。

---

## Step 4: 后端 API — 偏好端点

**修改** `backend/app/features/subscription/models.py`：

```python
class EmailPreferences(BaseModel):
    morning_report: bool = True
    daily_report: bool = True
    weekly_report: bool = True
    personal_digest: bool = True

class PreferencesResponse(BaseModel):
    success: bool
    preferences: EmailPreferences

class UpdatePreferencesRequest(BaseModel):
    morning_report: Optional[bool] = None
    daily_report: Optional[bool] = None
    weekly_report: Optional[bool] = None
    personal_digest: Optional[bool] = None
```

**修改** `backend/app/features/subscription/router.py` — 新增 2 个端点：

```
GET  /api/subscriptions/preferences      — Bearer token
POST /api/subscriptions/preferences      — Bearer token
```

### GET /api/subscriptions/preferences

SDK 已验证：`resend.ContactSegments.list({"email": "..."})` 可直接返回联系人所在的全部 segments。一次 API 调用即可获取所有偏好状态，无需逐 segment 查询。

```python
@router.get("/api/subscriptions/preferences")
async def get_preferences(user_id: str = Depends(verify_user_token)):
    email = get_user_email(user_id)  # 从 Insforge auth API 获取

    # 一次 API 调用获取该联系人所在的全部 segments
    contact_segments = resend.ContactSegments.list({"email": email})
    segment_ids = {s["id"] for s in contact_segments.get("data", [])}

    # 检查 personal_digest 受众成员状态
    is_digest_subscriber = check_contact_in_audience(email, "personal_digest")

    prefs = {
        "morning_report": RESEND_SEGMENT_MORNING in segment_ids,
        "daily_report": RESEND_SEGMENT_EVENING in segment_ids,
        "weekly_report": RESEND_SEGMENT_WEEKLY in segment_ids,
        "personal_digest": is_digest_subscriber,
    }
    return {"success": True, "preferences": prefs}
```

**不需要 DB 表**：Resend 是 single source of truth。Profile 页面低频访问，一次 API 调用延迟可接受。

### POST /api/subscriptions/preferences

```python
@router.post("/api/subscriptions/preferences")
async def update_preferences(
    req: UpdatePreferencesRequest,
    user_id: str = Depends(verify_user_token),
):
    email = get_user_email(user_id)
    segment_map = {
        "morning_report": RESEND_SEGMENT_MORNING,
        "daily_report": RESEND_SEGMENT_EVENING,
        "weekly_report": RESEND_SEGMENT_WEEKLY,
    }

    for field, seg_id in segment_map.items():
        value = getattr(req, field, None)
        if value is None:
            continue
        if value:
            resend.Contacts.Segments.add({"email": email, "segment_id": seg_id})
        else:
            resend.Contacts.Segments.remove({"email": email, "segment_id": seg_id})

    # personal_digest: 加入/退出整个 personal_digest 受众
    if req.personal_digest is not None:
        if req.personal_digest:
            subscribe_to_channel(email, "personal_digest", user_id=user_id)
        else:
            unsubscribe_from_channel(email, "personal_digest")

    return {"success": True, "preferences": await get_current_preferences(email)}
```

---

## Step 5: 前端 — Profile 页面偏好 UI

**修改** `frontend/src/lib/api.ts`：

```typescript
interface EmailPreferences {
  morning_report: boolean;
  daily_report: boolean;
  weekly_report: boolean;
  personal_digest: boolean;
}

subscriptions: {
  ...existing,
  getPreferences(): Promise<{ success: boolean; preferences: EmailPreferences }>,
  updatePreferences(prefs: Partial<EmailPreferences>): Promise<{ success: boolean; preferences: EmailPreferences }>,
}
```

**修改** `frontend/src/app/profile/page.tsx`：

在昵称表单下方新增独立区块：

```
邮件订阅偏好
├── 早报  [toggle]   每个交易日早上发送
├── 晚报  [toggle]   每个交易日收盘后发送
├── 周报  [toggle]   每周日发送
└── 专属日报 [toggle]  根据你的持仓每日定制
```

- 页面加载时 `GET /api/subscriptions/preferences`
- Toggle 切换时立即 `POST /api/subscriptions/preferences`
- 乐观更新 + error rollback + toast 提示

---

## Step 6: AuthSubscriptionSync 适配

**修改** `frontend/src/components/AuthSubscriptionSync.tsx`：

在 `syncUserWithSubscriptions` 中，新用户首次同步时，额外调用 Segments.add 将用户加入 3 个 segment（与 Step 2 后端逻辑一致）。

已有 `hasBeenAutoSubscribed` 检查，仅首次执行。

---

## 关键文件清单

| 操作   | 文件                                                 | 改动                                                                              |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| 一次性 | Resend Dashboard / API                               | 创建 3 个 Segments + 迁移现有联系人                                               |
| 配置   | `backend/app/core/config.py`                         | 3 个 Segment ID 环境变量                                                          |
| 配置   | Railway / `.env`                                     | 设置 3 个 Segment ID                                                              |
| 修改   | `backend/app/features/subscription/service.py`       | 订阅时加入 Segments                                                               |
| 修改   | `backend/app/features/subscription/email_service.py` | `_create_and_send_broadcast()` 支持 `segment_id`，3 个 broadcast 方法使用 segment |
| 修改   | `backend/app/features/subscription/models.py`        | 新增偏好模型                                                                      |
| 修改   | `backend/app/features/subscription/router.py`        | 新增 2 个偏好端点                                                                 |
| 修改   | `frontend/src/lib/api.ts`                            | 偏好 API 方法 + 类型                                                              |
| 修改   | `frontend/src/app/profile/page.tsx`                  | 偏好 toggle UI                                                                    |
| 修改   | `frontend/src/components/AuthSubscriptionSync.tsx`   | 首次同步加入 Segments                                                             |
| 修改   | `backend/app/features/subscription/.context.md`      | 文档更新                                                                          |

## 与旧方案对比

| 维度         | 旧方案 (Batch.send + DB)                          | 新方案 (Segments)                         |
| ------------ | ------------------------------------------------- | ----------------------------------------- |
| 新建文件     | 3 个（DB 表 + Edge Function + preferences_db.py） | 0 个                                      |
| 退订合规     | 自建退订页 + 自定义链接                           | `{{{RESEND_UNSUBSCRIBE_URL}}}` 原生       |
| 数据源       | 双数据源（Resend + 我们 DB）                      | 单数据源（Resend）                        |
| 广播代码改动 | 新写 `_batch_send_filtered()`                     | `_create_and_send_broadcast()` 加一个参数 |
| 发送效率     | O(n/100) API 调用                                 | O(1) 一次 Broadcast                       |

## 验证方案

1. **Segments 创建**：通过 Resend Dashboard 确认 3 个 Segments 已创建，现有联系人已迁入
2. **订阅测试**：新用户订阅 → 确认同时在 Audience + 3 个 Segments 中
3. **偏好切换**：Profile 页面关闭"早报" → 确认从 Morning Segment 移除
4. **广播测试**（dev 环境）：
   - 用户在 Morning Segment → 收到早报
   - 用户不在 Morning Segment → 不收到早报
   - 晚报、周报同理
5. **回归**：Newsletter 仍发给整个受众（不受 Segment 影响）
6. **退订链接**：邮件中退订链接正常工作

## 已确认事项

- [x] Resend Python SDK v2.19.0 完全支持 Segments API
  - `resend.ContactSegments.add({"email": ..., "segment_id": ...})` — 加入 segment
  - `resend.ContactSegments.remove({"email": ..., "segment_id": ...})` — 移出 segment
  - `resend.ContactSegments.list({"email": ...})` — 列出联系人所在全部 segments
  - `resend.Segments.create({"name": ...})` — 创建 segment
- [x] `resend.Broadcasts.CreateParams` 支持 `segment_id: NotRequired[str]`，与 `audience_id` 二选一
- [ ] 非生产环境 Segment 行为：test audience 是否支持 Segments，或需要 fallback（实施时验证）
