# 推特日报上线 Checklist

> 状态: 2026-05-12 完成代码改动 / 待用户手动操作部署
> 目标: 2026-05-13 上午 08:00 北京时间首次自动 broadcast 给 Daily Report
> audience 全员 (~624 用户)
>
> **方案**: 复用 `TheMarketBrew Daily` audience 作为收件人池
> (`RESEND_AUDIENCE_TWITTER_DIGEST=a0e3508d-894b-4e56-a234-66d277c09916`).
> Tradeoff: 用户退订 twitter digest 会同时退订 daily report
> (Resend unsubscribed 是 audience-scoped). Trial 阶段可接受.

## 已完成（代码 + 资源）

### 后端代码

- **TWITTER_DIGEST channel**: `subscription/service.py` 加 `SubscriptionChannel.TWITTER_DIGEST` + `CHANNEL_CONFIG` 入口
- **env vars**: `core/config.py` 加 `RESEND_AUDIENCE_TWITTER_DIGEST` / `RESEND_SEGMENT_TWITTER_DIGEST`
- **broadcast 重写**: `email_service.broadcast_twitter_digest` 改用 Resend Broadcasts API（segment > audience 优先级），非生产环境拒绝执行（避免误发）
- **QA 单发 helper**: `email_service._qa_send_twitter_digest_to_email(digest, to_email)` 走 Emails.send 单条邮件给指定地址
- **解付费墙**: `twitter_digest/router.py` 的 `/latest` 和 `/{date}` 去掉 `_require_paid_user`，所有登录用户可访问
- **退订链接**: 邮件 footer 已自带 `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder（Resend Broadcasts API 自动渲染）
- **watchpoint 放宽**: 时间窗口 1-21 天 / 单博主提到即可入选 / 类型放宽到产品+里程碑+行业事件，目标 3-4 条
- **stance_summary 字段**: TickerThesis 多元化群体立场描述
- **群体视角综合**: synthesis 不再点名博主，用"多头/空头/谨慎派/乐观派"等群体词

### 运维资源

- **复用 Daily audience**: `TheMarketBrew Daily` (id=`a0e3508d-894b-4e56-a234-66d277c09916`, 624 contacts)
  - 当初误建的空 `TheMarketBrew Twitter Digest` audience 已删除
  - 旧回填脚本已清理；当前用 segment audit/seed 脚本维护名单
- **QA 单发入口**: 使用 `EmailService._qa_send_twitter_digest_to_email()`，避免 dev 环境误触发 broadcast
- **Broadcast cron workflow**: `.github/workflows/twitter-digest-broadcast.yml` 已写好（北京 08:00 工作日）

## 还需用户手动做的步骤

### 1. 生产环境变量

加到 backend 生产 `.env`（或 deployment platform 的环境变量）:

```bash
RESEND_AUDIENCE_TWITTER_DIGEST=a0e3508d-894b-4e56-a234-66d277c09916
# 这就是 Daily Report audience 的 id, 复用同一份联系人池
RESEND_SEGMENT_TWITTER_DIGEST=<twitter-digest-segment-id>
```

### 2. ~~回填~~ 不再需要

(共用 Daily audience, 624 个现有日报订阅者直接就是收件人, 无需回填)

### 3. Commit + push 当前工作区改动

至少包含以下文件:

```
backend/app/core/config.py
backend/app/features/subscription/service.py
backend/app/features/subscription/email_service.py
backend/app/features/subscription/email_templates.py
backend/app/features/twitter_digest/models.py
backend/app/features/twitter_digest/prompts.py
backend/app/features/twitter_digest/router.py
backend/app/features/twitter_digest/service.py
backend/scripts/audit_twitter_digest_segment.py
backend/scripts/seed_twitter_digest_segment.py
.github/workflows/twitter-digest-broadcast.yml
docs/plans/active/twitter-digest-launch-checklist.md
```

### 4. 部署后端到生产

按你的部署流程把 backend 推到生产。验证:

```bash
curl https://<prod>/api/twitter-digest/latest -H "Authorization: Bearer <user_token>"
# 应返回 200 + digest JSON（任何登录用户都能拿到）
```

### 5. 配齐 GitHub Actions secrets

`twitter-digest-broadcast.yml` 依赖:

- `BACKEND_URL` — 生产后端 URL
- `CRON_SECRET` — 已存在（其它 cron 也在用）

GitHub repo settings → Secrets and variables → Actions 里确认两个都齐了。

### 6. 首次手动 QA 触发（必做，不要等明天 08:00 自动）

GitHub Actions → 选 "Twitter KOL Digest Broadcast" workflow → "Run workflow" → date 留空（用 latest）→ Run。

检查:
- workflow 整体 success
- response body 显示 `success=true, total≈416, sent>0`
- 自己邮箱收到一封（如果 kedengpan@gmail.com 在 audience 里）
- 邮件渲染正常、退订链接能点、跳网页按钮能跳

### 7. 24-48h 监控

第一天观察:
- Resend dashboard → audience 的 unsubscribe rate（>5% 要警觉）
- Resend dashboard → 邮件 open rate（健康基线 30-50%）
- GitHub Actions → cron 自动跑成功
- 用户投诉 / 反馈

## 回滚预案

如果上线后发现严重问题:

1. **关闭 cron**: GitHub Actions → workflow → Disable workflow
2. **临时不发**: 撤掉 prod 的 `RESEND_SEGMENT_TWITTER_DIGEST` env var，broadcast 会 return error 不发
3. **撤回已发邮件**: Resend dashboard → Broadcasts → cancel（只对 scheduled 的有用，已发出的拉不回）

## 后续待办（不阻塞上线）

- 新用户注册时自动加入 TWITTER_DIGEST audience（当前只有 backfill，后续要在 signup flow 加自动同步）
- 用户在 `/settings` 能管理订阅偏好（当前只能通过邮件退订链接）
- 上线 2-3 周后基于反馈决定: 保留免费 vs 切回付费墙
- 如果切回付费墙: 重新加 `_require_paid_user` + 改 broadcast 收件人逻辑
