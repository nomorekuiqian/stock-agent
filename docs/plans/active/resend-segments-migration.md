# Resend Segments 迁移计划

## Context

Marketing plan $40/月太贵，原因是 Segment 数量 > 3（免费限额）。目标：两个 plan 都降到免费。

关键发现：`Broadcasts.create()` 不支持 `topic_id`，只支持 `segment_id`。所以 **Topics 不能替代 Segments 用于广播**，不引入 Topics。

## 方案

- 日报（409人）保留 Broadcast + Segment（太多人不能走 Batch.send）
- 早报（21人）和周报（21人）改成 `Batch.send()`，删除对应 Segment
- 用户偏好从 Resend Segments 迁移到数据库 `subscriptions.email_preferences` 列
- 最终只保留 2 个 Segment（Daily + Test），免费 plan 限额 3 个

### 用量验证

| 指标 | 改造后 | 免费限额 |
|------|--------|---------|
| Segments | 2 | 3 |
| Transactional 日峰值 | 91 (70 digest + 21 morning) | 100 |
| Transactional 月总量 | ~2,000 | 3,000 |

## 改动清单

### Step 1: 数据库 — 新增 email_preferences 列

- `ALTER TABLE subscriptions ADD COLUMN email_preferences JSONB DEFAULT '{}'::jsonb`
- Edge Function `subscriptions.js`: 新增 `get_preferences` / `update_preferences` action
- `payment/db.py`: 新增 `get_email_preferences()` / `update_email_preferences()`

### Step 2: 数据迁移脚本

- 读取 Morning/Weekly segment 现有成员
- 写入 `email_preferences: {"morning_report": true, "weekly_report": true}` 到对应用户

### Step 3: 偏好管理迁移

**`subscription/service.py`**:
- `get_email_preferences()`: morning/weekly 改从 DB 读取（daily_report 不变，仍读 Resend segment）
- `update_email_preferences()`: morning/weekly 改写 DB
- `sync_resend_segments()`: 删除 morning/weekly segment 同步
- `SEGMENT_IDS`: 删除 morning_report 和 weekly_report

**`subscription/router.py`**:
- 偏好端点适配新的读写方式

### Step 4: Morning/Weekly 改 Batch.send

**`email_service.py`**:
- 新增 `batch_send_morning_report(data)`:
  - `list_entitled_users("morning_report_email")` 获取用户
  - 过滤 `email_preferences.morning_report == false`
  - `resend.Batch.send()` 发送
  - 非生产环境只发测试账号
- 新增 `batch_send_weekly_report(data)`: 同上逻辑

**调用方适配**:
- `morning_report/router.py`: 调用 `batch_send_morning_report`
- `subscription/router.py` broadcast endpoint: weekly 分支调用 `batch_send_weekly_report`

### Step 5: 清理

**`config.py`**: 删除 `RESEND_SEGMENT_MORNING` 和 `RESEND_SEGMENT_WEEKLY`
**Resend Dashboard**: 删除 Morning 和 Weekly segments
**环境变量**: Railway 删除对应变量
**降级 Marketing plan**

### Step 6: 测试

- 更新 `test_email_preferences_unit.py`: morning/weekly 偏好改为 DB mock
- 更新 `test_sync_resend_unit.py`: 移除 morning/weekly segment 同步测试
- 新增 `test_batch_morning_weekly.py`: 验证 Batch.send 逻辑 + opt-out 过滤

## 不变的部分

- 日报 Broadcast 流程不变（仍用 `RESEND_SEGMENT_EVENING`）
- 专属日报 Batch.send 流程不变
- 前端 Profile 页面 toggle 不需要改（API 签名不变，只是后端存储换了）
- Test segment 不变

## 验证方式

1. `pytest tests/test_email_preferences_unit.py -v`
2. `pytest tests/test_broadcast_send.py -v`
3. 手动: `python scripts/test_broadcast.py --morning` 验证早报 batch send
4. 手动: `python scripts/test_broadcast.py --weekly` 验证周报 batch send
5. 确认 Resend Dashboard segment 数量 <= 3
