# Cron 迁移：GitHub Actions → Insforge Schedules

**Status:** Active
**Owner:** kedengpan
**Created:** 2026-06-02
**Scope:** 5 个邮件发送类 cron job
**Out of scope:** CI workflow、deprecated workflow、数据生成/抓取类 cron（留待后续 phase）

---

## 1. 目标

把 5 个负责"发送邮件"的 cron job 从 GitHub Actions 迁到 Insforge Schedules（基于 pg_cron），用一个 thin edge function 做转发层，业务逻辑（Render backend 上的 `/api/...` 端点）零改动。

**为什么迁：**
- GHA scheduled workflow 延迟不稳定（5–30 min 常见，UTC 整点偶尔到 2 小时），影响 `daily-report` 落地窗口
- 减少对 GitHub 的运行时依赖，简化 secret 管理（Insforge 已经持有 backend 所需 secret）
- Insforge `function.logs` + `schedules logs` 是更内聚的可观测平面

---

## 2. 迁移范围

| # | 原 workflow | 调度 (UTC) | 目标 endpoint | 备注 |
|---|---|---|---|---|
| 1 | `daily-report.yml` | `0 22 * * 1-5` | `POST /api/subscriptions/daily_report/broadcast?force=true` | 用户可见度最高 |
| 2 | `daily-digest.yml` | `15 22 * * 1-5` | `POST /api/subscriptions/personal_digest/broadcast` | +15 min 错峰避 Resend 限流 |
| 3 | `weekly-report.yml` | `0 17 * * 0` | `POST /api/weekly-report/generate` | 周日 12:00 ET |
| 4 | `twitter-digest-broadcast.yml` | `0 22 * * 1-5` | `POST /api/twitter-digest/broadcast` | 与 daily-report 同槽，需错峰 |
| 5 | `lifecycle-onboarding.yml` | `0 23 * * *` | `POST /api/cron/lifecycle/onboarding-pass` | 每天（非仅工作日） |

**显式不迁：**
- `ci.yml`：PR gating，留 GHA
- `onboarding-drip.yml`：已 deprecated，schedule 已注释
- 数据类 cron（`twitter-digest-generate`、`kol-tweets-fetch`、`kol-list-sync`、`macro-cache-refresh`、`screener-universe-refresh`）：本计划完成验收后另开 phase

---

## 3. 架构

```
Insforge Schedules (pg_cron, 5-field)
    │ 每槽位独立 schedule entry
    │ headers 带 X-Internal-Secret
    ▼
Edge Function: cron-trigger  (新增, backend/app/edge_functions/cron-trigger.js)
    │ 1. 校验 EDGE_FUNCTION_SECRET
    │ 2. 查 JOB_REGISTRY 拿 path + 校验规则
    │ 3. POST backend, 带 X-Cron-Secret
    │ 4. 解析响应做硬失败判定
    │ 5. 失败 → Resend 邮件到 admin
    │ 6. 返回结构化结果给 Insforge schedule logs
    ▼ HTTPS
Render backend /api/...
    │ 现有 verify_cron_secret + 业务逻辑全部不动
    ▼
Resend / DB / ...
```

### 为什么走 edge function 而非 schedule 直连 backend
1. **响应校验集中** — GHA 现在每个 workflow 都有 grep/python 解析 `sent`/`failed`/`success` 字段；下沉到 edge function，schedule 只看 HTTP code
2. **失败告警自管** — GHA 的 `actions/github-script` 创建 issue 没法平移；edge function 直接调 Resend 发 admin 邮件
3. **后端 URL 集中** — Render backend 域名只在 1 个 edge function 里出现，未来切迁不用动 5 个 schedule
4. **可加 retry** — 现在 GHA 用 `curl --retry 3 --retry-delay 30`；edge function 里加一层 fetch retry 更可控

---

## 4. 关键文件 & 改动清单

### 新增
- `backend/app/edge_functions/cron-trigger.js` — 通用 dispatcher（~120 行）

### 删除（Phase 4 之后）
- `.github/workflows/daily-report.yml`
- `.github/workflows/daily-digest.yml`
- `.github/workflows/weekly-report.yml`
- `.github/workflows/twitter-digest-broadcast.yml`
- `.github/workflows/lifecycle-onboarding.yml`

### 更新
- `docs/constraints/reliability.md` — 把 cron 章节从 GHA 改为 Insforge Schedules，留备用 manual 触发方式
- `backend/app/edge_functions/.context.md` — 新增 cron-trigger 说明
- `CLAUDE.md` 关键规则区如有 "cron job 在 GHA" 措辞需更新

### 不动
- 所有 `backend/app/features/*/router.py` 上的 endpoint，签名/认证/响应 schema 全部保留
- `CRON_SECRET` 在 backend 的校验逻辑（`verify_cron_secret`）
- GitHub Actions 上其他 workflow

---

## 5. Edge Function 设计

`cron-trigger.js` 接受 `POST {"job": "<name>"}`，结构：

```js
const JOB_REGISTRY = {
  daily_report: {
    path: '/api/subscriptions/daily_report/broadcast?force=true',
    timeout_ms: 600_000,
    validate: (body) => {
      if (body.success === false) return 'success=false';
      if (body.sent === 0) return 'sent=0 — 检查 audience';
      return null;
    },
  },
  daily_digest: {
    path: '/api/subscriptions/personal_digest/broadcast',
    timeout_ms: 600_000,
    validate: (body) => {
      if (body.success === false) return 'success=false';
      if ((body.failed || 0) > 2) return `failed=${body.failed} > 2`;
      return null;
    },
  },
  weekly_report: {
    path: '/api/weekly-report/generate',
    timeout_ms: 600_000,
    validate: (body) => {
      if (body.from_cache) return null; // 已有本周报告, broadcast 跳过是正常
      const br = body.broadcast_result;
      if (!br) return 'broadcast_result 缺失（异常抛出）';
      if (br.success !== true) return `broadcast failed: ${br.error}`;
      return null;
    },
  },
  twitter_digest_broadcast: {
    path: '/api/twitter-digest/broadcast',
    timeout_ms: 600_000,
    validate: (body) => {
      if (body.success !== true) return 'success=false';
      if (body.total > 0 && body.sent === 0) return `${body.total} recipients but sent=0`;
      return null; // total=0 允许
    },
  },
  lifecycle_onboarding: {
    path: '/api/cron/lifecycle/onboarding-pass',
    timeout_ms: 300_000,
    validate: () => null, // backend 返回 200 即 OK
  },
};

module.exports = async function(request) {
  // 1. 校验 EDGE_FUNCTION_SECRET
  // 2. 解析 body.job
  // 3. fetch(BACKEND_URL + cfg.path) with X-Cron-Secret
  // 4. cfg.validate(body) — 非 null 走 alertAdmin()
  // 5. 返回 { job, http_code, sent, failed, duration_ms, error? }
};
```

**关键约束：**
- Deno fetch 默认无 timeout，要包 `AbortController` + `setTimeout`
- backend `verify_cron_secret` 读 `X-Cron-Secret` header，沿用
- 失败邮件用 Resend API 直发到 `kedengpan@gmail.com`，不依赖 backend 链路（backend 挂了也能告警）

---

## 6. Insforge Secrets 需求

通过 `npx @insforge/cli secrets list` 核对，缺哪个加哪个：

| Secret | 用途 | 备注 |
|---|---|---|
| `BACKEND_URL` | edge function 拼接 endpoint | Render 域名 |
| `CRON_SECRET` | edge function → backend 鉴权 | 与 backend `.env` 同值 |
| `EDGE_FUNCTION_SECRET` | schedule → edge function 鉴权 | 已存在（其他 edge function 在用）|
| `RESEND_API_KEY` | edge function 发告警邮件 | 已存在（backend 在用，可复用）|
| `ADMIN_ALERT_EMAIL` | 告警收件人 | 新增，默认 `kedengpan@gmail.com` |

---

## 7. 实施步骤（按顺序）

### Phase 0 — 准备（0.5 天）
- [ ] `npx @insforge/cli current` 确认 project 链接正确
- [ ] `npx @insforge/cli secrets list` 核对上表 secret，缺的用 `secrets add` 补
- [ ] Render backend 用 `curl` + `X-Cron-Secret` 对 5 个 endpoint 各 smoke 一次，确认都能返回预期 JSON

### Phase 1 — 部署 edge function（0.5 天）
- [ ] 写 `backend/app/edge_functions/cron-trigger.js`
- [ ] `npx @insforge/cli functions deploy cron-trigger`
- [ ] `npx @insforge/cli functions invoke cron-trigger --data '{"job":"lifecycle_onboarding"}' --method POST` 端到端跑通最低风险的那个
- [ ] 查 `npx @insforge/cli logs function.logs` 确认调用链路

### Phase 2 — 创建 schedule（暂停态，0.5 天）
为 5 个 job 各创建 schedule，`--active false`：

```bash
npx @insforge/cli schedules create \
  --name "cron-lifecycle-onboarding" \
  --cron "0 23 * * *" \
  --url "${OSS_HOST}/functions/cron-trigger" \
  --method POST \
  --headers '{"X-Internal-Secret":"${{secrets.EDGE_FUNCTION_SECRET}}","Content-Type":"application/json"}' \
  --body '{"job":"lifecycle_onboarding"}'
# 然后立即 schedules update <id> --active false
```

5 个 schedule 全建好后，记 ID 表，存到本计划文件附录。

**错峰调整：** 把 `twitter-digest-broadcast` 从 `0 22 * * 1-5` 改为 `2 22 * * 1-5`，避免与 `daily-report` 同分钟撞 Resend 限流（GHA 时代有调度抖动天然错开，pg_cron 准时反而会撞）。

### Phase 3 — 灰度切换（5 个 cycle，~1.5 周）
按风险从低到高，每次只切 1 个：

| 顺序 | Job | 切换日 | 验证窗口 |
|---|---|---|---|
| 1 | `lifecycle-onboarding` | 任意周一 | 1 个日历日 |
| 2 | `weekly-report` | 切换日的周日 | 1 周 |
| 3 | `daily-digest` | 周二 | 1 个工作日 |
| 4 | `twitter-digest-broadcast` | 周三 | 1 个工作日 |
| 5 | `daily-report` | 周四 | 1 个工作日 |

每个 job 切换流程：
1. `npx @insforge/cli schedules update <id> --active true`
2. 编辑对应 GHA workflow，注释掉 `schedule:` block，保留 `workflow_dispatch:` 作为手动后备
3. push 到 master
4. 等下一个调度窗口
5. **验证三件套：**
   - `npx @insforge/cli schedules logs <id>` → HTTP 200，无 alert
   - Resend dashboard → 投递数与历史 GHA 跑出来的量级吻合
   - Insforge `function.logs` → 无异常 stack
6. 任一项不通过 → 立刻 `schedules update --active false`，把 GHA `schedule:` block 恢复，回滚

### Phase 4 — 清理（0.5 天）
切换全部稳定运行 1 周后：
- [ ] `git rm .github/workflows/{daily-report,daily-digest,weekly-report,twitter-digest-broadcast,lifecycle-onboarding}.yml`
- [ ] **保留** GHA secrets `BACKEND_URL` / `CRON_SECRET`：其他 5 个数据类 workflow 还在用
- [ ] 更新 `docs/constraints/reliability.md`：cron 章节改写为 Insforge Schedules 操作指南（列 schedule ID、`schedules logs` 排障、`schedules update --active` 临时停摆）
- [ ] 更新 `backend/app/edge_functions/.context.md`：新增 cron-trigger 章节
- [ ] 在 `docs/plans/completed/` 归档本计划

---

## 8. 失败告警

**GHA 原方案：** `actions/github-script` 创建带 `ci-failure` label 的 GitHub issue。
**Insforge 方案：** edge function 在 `validate()` 返回非 null 或 fetch 异常时，调 Resend API 直发邮件给 `ADMIN_ALERT_EMAIL`。

邮件正文模板：
```
Subject: [Cron Alert] {job} failed at {ts}
Body:
  Job: {job}
  Cron: {schedule_id}
  HTTP: {http_code}
  Error: {validate_reason or exception message}
  Backend response (first 1KB): {body_excerpt}
```

**为什么不存 DB / 不接 Slack：**
- 邮件已经是用户日常入口，告警链路与产品本身解耦
- Insforge `schedules logs` 已保留执行历史，邮件只做"需要立刻看一眼"的推送

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Insforge edge function 默认 timeout < broadcast 实际耗时 | 长任务被掐 | 实测 `daily-report`/`twitter-digest-broadcast` 真实耗时；如确实 >60s，验证 Insforge edge function 支持长出站 HTTP（必要时把 `cron-trigger` 做成 fire-and-forget：返回 202 给 schedule，异步等 backend 完成） |
| pg_cron 准时触发与 Resend 限流（2 req/s）撞车 | `daily-report` + `twitter-digest-broadcast` 同槽双发 | 已在 Phase 2 把 twitter 错峰到 `02 22`；daily-digest 保留 `15 22` |
| Backend 短时间宕机时 cron 静默失败 | 错过一次发送 | edge function 内置 1 次 retry（间隔 30s）；仍失败则告警邮件 |
| 切换期间 schedule 与 GHA 双跑 | 用户收到 2 封同样的邮件 | Phase 3 强约束：先停 GHA、后开 Insforge 是错的；正确顺序是**先开 Insforge → 立刻停 GHA**，并把 GHA `schedule:` 替换为注释而非删 workflow，便于回滚时一行恢复 |
| Insforge schedule 无人值守、长期没人看 logs | 静默退化 | `schedules logs` 排障写进 `docs/constraints/reliability.md` 的 "每周运维检查项" |
| `weekly-report` 的 `from_cache=true` 在 edge function 被判定为成功 | 真的失败被吞 | `validate()` 显式区分：`from_cache=true` → 返回 null（成功跳过），`from_cache=false && broadcast_result.success!=true` → 报错 |

---

## 10. 验收标准

- [ ] 5 个 schedule 在 Insforge 全部 `isActive=true`，`schedules logs` 连续 7 天每次执行返回 200
- [ ] Resend dashboard 上 5 类邮件的日/周投递量与迁移前 14 天均值偏差 < 5%
- [ ] 至少触发过 1 次 "validate 失败 → 告警邮件" 演练（可以临时 mock backend 返回 success=false 测试链路）
- [ ] 5 个 GHA workflow 文件已从 master 删除
- [ ] `docs/constraints/reliability.md` 与 `backend/app/edge_functions/.context.md` 已更新

---

## 11. 估时

| 阶段 | 工作量 | 日历时间 |
|---|---|---|
| Phase 0–2 | 1.5 天编码+部署 | 1.5 天 |
| Phase 3 | 灰度，每个 cycle 等 1–7 天 | ~1.5 周 |
| Phase 4 | 0.5 天清理 | 0.5 天 |
| **合计** | **~2 天纯开发** | **~2 周** |

---

## 附录 A — schedule ID 表

迁移后填入：

| Job | Schedule ID | Cron | 切换日期 |
|---|---|---|---|
| lifecycle_onboarding | TBD | `0 23 * * *` | |
| weekly_report | TBD | `0 17 * * 0` | |
| daily_digest | TBD | `15 22 * * 1-5` | |
| twitter_digest_broadcast | TBD | `2 22 * * 1-5` | |
| daily_report | TBD | `0 22 * * 1-5` | |

## 附录 B — 回滚剧本

某个 schedule 跑挂时：
1. `npx @insforge/cli schedules update <id> --active false`
2. 编辑对应 GHA workflow，去掉 `schedule:` block 的 `#` 注释
3. `git commit -am "rollback: re-enable GHA cron for <job>"` & push
4. 在 `docs/plans/active/cron-migration-gha-to-insforge.md` 顶部加 "BLOCKED: <reason>"
5. 排障，修完重走 Phase 3 该 job 的切换流程
