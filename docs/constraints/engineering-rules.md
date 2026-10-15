# Engineering Rules

工程约束和自动化规则，确保代码库一致性和质量。

## Context 自动维护

任务完成后，根据变更类型自动更新相关文档：

| 变更类型                    | 更新目标                                             | 触发条件                                     |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| 新增/修改 API 端点          | 对应 `.context.md`                                   | router.py 有增删改                           |
| 认证变更                    | `docs/constraints/auth.md` 已认证端点清单            | verify_user_token 使用变化                   |
| 修复 bug / 踩坑             | memory/MEMORY.md 的"经验总结"                        | 修复了非显而易见的问题                       |
| 新增 feature 模块           | CLAUDE.md 模块文档列表                               | 新建了 `.context.md`                         |
| 数据库表/Edge Function 变更 | 对应 feature 的 `.context.md`                        | db.py 或 edge function 有改动                |
| 前端页面逻辑变更            | 对应页面的 `.context.md`                             | page.tsx 的数据流/状态管理有变化             |
| 产品想法/用户反馈           | Obsidian `产品/产品思考.md`                          | 用户在对话中提到产品方向、功能想法、用户反馈 |
| 功能上线/产品决策           | Obsidian `产品/产品现状.md`                          | 新功能部署、产品重要决策、关键数字变化       |
| 产品方向变更                | `.context.md` 产品愿景 + Obsidian `产品/产品策略.md` | 用户调整模块方向、里程碑变化                 |

**执行方式**: 不需要用户提醒。完成任务后，静默检查上表，有匹配则自动更新对应文档。更新时只改变化的部分，不重写整个文件。

## 产品策略 → .context.md 同步协议

产品方向有两层存储，需保持一致：

| 层级              | 位置                                      | 内容               | 更新频率          |
| ----------------- | ----------------------------------------- | ------------------ | ----------------- |
| 策略层 (WHY/WHAT) | Obsidian `产品/产品策略.md`               | 完整的模块演进方向 | 低频 (方向调整时) |
| 实施层 (HOW)      | 各 feature `.context.md` 的"产品愿景"章节 | 该模块的方向摘要   | 跟随策略层        |

**同步方向**: 产品策略.md → .context.md（单向，策略层是 source of truth）

**模块映射表**:

| subpage   | 后端 feature                  | .context.md                                                  | 产品策略.md 章节                 |
| --------- | ----------------------------- | ------------------------------------------------------------ | -------------------------------- |
| /today    | daily_report                  | `features/daily_report/.context.md`                          | 现有模块演进 > /today            |
| /for-you  | brew                          | `features/brew/.context.md`                                  | 现有模块演进 > /for-you + 模块 1 |
| /stock    | stock                         | `features/stock/.context.md`                                 | 现有模块演进 > /stock + 模块 3   |
| /macro    | macro/risk, liquidity, weekly | `features/macro/*/.context.md` (3 个)                        | 现有模块演进 > /macro            |
| /screener | screener                      | `features/screener/.context.md` + `app/screener/.context.md` | 模块 4 (机会发现)                |

## Obsidian 产品知识库

产品方向和思考的 source of truth 在 Obsidian vault，Claude Code 可以读写：

**路径**: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/TheMarketBrew增长/`

**可写入的文件**:

- `产品/产品思考.md` — 用户提到产品想法时，追加到"想法池"对应日期下
- `产品/产品现状.md` — 功能上线或产品状态变化时，更新对应字段
- `产品/用户反馈.md` — 用户提到用户反馈时，追加到"反馈记录"

**条件可写的文件**（仅在用户确认方向调整时修改）:

- `产品/产品策略.md` — 产品方向与愿景。修改后同步到对应 .context.md 的产品愿景

**只读的文件**（按需查阅，不要修改）:

- `产品/开发日志.md` — git hook 自动写入的累积开发记录
- `产品/商业规划.md` — 定价与商业模式

## 工程计划 (Engineering Plans)

功能开发前的设计文档，存放在 `docs/plans/`。模板见 `docs/plans/_template.md`。

**创建时机**：

- 用户说"帮我写个 plan"、"我要做 XX 功能"、"规划一下怎么实现" → 使用 `/plan` skill
- **Plan Mode 自动保存**：当通过 Plan Mode 生成计划后，在开始实现之前，必须将 plan 内容保存到 `docs/plans/active/{feature-name}.md`。Plan Mode 的产出不能只留在对话里，必须持久化

**文件命名**：`docs/plans/active/{feature-name}.md`，用英文短横线命名。

**Plan 生命周期**：

1. **创建**：通过 `/plan` skill 或 Plan Mode 产生，保存到 `docs/plans/active/`
2. **开发中**：随开发进展更新 Status 和实施步骤的勾选状态
3. **完成后**：Plan 的知识沉淀到对应 `.context.md`，plan 文件移到 `docs/plans/completed/`

## 邮件广播安全

当 `ENVIRONMENT` 不是 `"production"` 时：

- 所有 Broadcast 自动路由到 Resend 测试 segment (`191b3099-6849-48f9-adec-e6a67b70b10b`，仅含 `voya.technologies@gmail.com`)
- `broadcast_personal_digests` (Batch.send) 自动过滤只保留 `voya.technologies@gmail.com`
- 专属日报不使用 Resend 订阅管理，由 entitlements + watchlist 自动决定发送对象

## 测试质量要求

写测试或委托 Agent 写测试时必须遵守。

**核心原则：测试真实代码逻辑，不测 mock 本身。**

1. **Mock 外部服务，不 mock 被测函数**
   - 正确：mock `resend.ContactSegments.list`（外部 API），让 `get_email_preferences` 真正执行
   - 错误：`svc.get_email_preferences = MagicMock(return_value={...})` 然后测 `sync_resend_segments`

2. **验证传参，不只验证"被调用了"**
   - 正确：`mock_has_entitlement.assert_awaited_once_with("user-123", "morning_report_email")`
   - 错误：`mock_has_entitlement.assert_called()`

3. **每个测试必须能捕获真实 bug**
   - 自检方法：如果删掉被测代码的关键行，这个测试会失败吗？如果不会，测试无效

4. **Mock 层级**
   - 单元测试：mock 外部 API（Stripe SDK、Resend SDK、DB 调用）
   - 端点测试：mock 依赖注入（`Depends(verify_user_token)`），让 router 逻辑真正执行
   - 不要同时 mock 输入和输出

5. **前端模块级常量的限制**
   - `PAYWALL_ENABLED`、`API_URL` 等 `const` 在 import 时求值，`vi.stubEnv` 无法改变。这些分支用 E2E 覆盖

6. **测试命名和结构**
   - 测试名说明**场景和期望结果**：`test_free_user_blocked_morning` 而非 `test_case_1`
   - 每个 test class 对应一个逻辑分支

## Git & PR 规范

### 分支策略

- `master` 是主分支，Vercel 自动部署
- 功能开发在 feature 分支上进行，完成后 PR 合并到 master
- 小修复可以直接 commit 到 master

### Commit 规范

格式：`type(scope): description`

常用 type：`feat`, `fix`, `style`, `refactor`, `test`, `chore`, `docs`

示例：
- `feat(brew): add personal digest batch send`
- `fix(auth): handle expired refresh token`
- `style(design): hero CTA min 44px touch targets`

### PR 流程

1. 功能分支开发完成，本地跑 `/test` 确认通过
2. push 到 remote，创建 PR 到 master
3. CI 自动运行（见下方 CI 章节）
4. CI 通过后合并。如果 CI 失败，修复后再合并
5. 合并后 Vercel 自动部署前端，Railway 自动部署后端

### Merge 规则

- 合并前必须 CI 通过
- 不 force push master
- 不 rebase 已 push 的公共分支
- 合并后删除 feature 分支

## CI 流水线

GitHub Actions 配置在 `.github/workflows/ci.yml`，push 或 PR 到 master 时触发。

### 前端 CI (frontend job)

```
npm ci → ESLint → tsc --noEmit → npm test (Vitest) → npm run build
```

### 后端 CI (backend job)

```
pip install → import check → unit tests (*_unit.py) → E2E tests (tests/e2e/) → startup check
```

后端 CI 使用 `ENVIRONMENT=test` + fake API keys，不会调用真实外部服务。

### Pre-commit Hook (本地)

`husky` + `lint-staged`，commit 时自动执行：
- 前端 `.ts/.tsx`：ESLint --fix + tsc --noEmit
- 后端 `.py`：Python AST 语法检查

### Post-commit Hook (本地)

自动将 commit 信息追加到 Obsidian 开发日志。

### Cron Workflows

| Workflow | 用途 | 频率 |
|----------|------|------|
| daily-report.yml | 日报生成+广播 | 每个交易日 |
| morning-report.yml | 早报生成+广播 | 每个交易日 |
| daily-digest.yml | 专属日报生成+发送 | 每个交易日 |
| weekly-report.yml | 周报生成+广播 | 每周日 |
| macro-cache-refresh.yml | 宏观数据缓存刷新 | 定时 |
| screener-universe-refresh.yml | 选股器数据刷新 | 定时 |

## 部署

### 前端 (Vercel)

- push 到 master 自动部署到 `themarketbrew.com`
- PR 自动创建 Preview 部署
- 环境变量在 Vercel Dashboard 管理

### 后端 (Railway)

- push 到 master 自动部署到 `stock-agent-production.up.railway.app`
- 环境变量在 Railway Dashboard 管理
- `ENVIRONMENT=production` 是关键变量，控制邮件广播路由

#### CLI 上传目录约定

`stock-agent` 的 production / staging 服务使用以下目录配置：

- Root Directory: `/backend`
- Railway Config File: `/backend/railway.json`
- Dockerfile: `/backend/Dockerfile`

上传包必须保留 `backend/` 这一层。在已获准部署的情况下，从仓库根目录执行以下命令，并明确指定环境：

```bash
cd /Users/kedeng/projects/stock-agent
railway up ./backend --service stock-agent --environment staging
# staging 验证通过后，按本次任务的部署授权发布 production：
railway up ./backend --service stock-agent --environment production
```

上述命令不使用 `--path-as-root`；该选项会把 `backend/` 的内容提升为上传包根目录，与当前服务的 `/backend` 配置不匹配。若使用临时发布目录，也必须保留 `backend/Dockerfile`、`backend/railway.json` 和应用文件的相对位置。参见 [Railway CLI 上传路径说明](https://docs.railway.com/cli/deploying)。

2026-09-04 PDT 的两次失败部署分别为 production `69217deb-af85-4b5e-8e23-651460e45746`、staging `ff51e9e2-ddd3-4be4-af29-4ff429589617`，均报 `couldn't locate a dockerfile at path backend/Dockerfile in code archive`。失败发生在读取 Dockerfile 前；失败记录的配置文件路径为 `/railway.json`，与服务的 `/backend` 根目录不匹配。

后续恢复目录布局后的 production `aa9fcfd7-7606-460d-935f-34902682146e`、staging `00f23062-ca99-45ff-9646-1efc0d22a143` 均为 `SUCCESS`，构建日志确认加载 `backend/Dockerfile` 且健康检查通过。本次排查还复核了两个环境的 `/` 均返回 HTTP 200；历史失败记录保留不代表当前部署仍失败。

### 部署前检查清单

- [ ] 本地 `/test` 通过
- [ ] 如果改了环境变量，Railway/Vercel 上已同步
- [ ] 如果改了 Edge Function，已通过 Insforge CLI 部署
- [ ] 如果改了邮件模板，用 `scripts/test_broadcast.py` 验证过

## 错误处理规范

### 后端

- 外部服务调用（Resend、Stripe、Insforge、AI API）必须有 try-catch + logger
- 关键路径（广播、支付）必须有重试机制（至少 2 次，间隔 3 秒）
- 用 `logger.exception` 记录完整 traceback，不用 `logger.error`
- 用 `get_logger(__name__)` 获取 logger，禁止 `print()`
- 区分"查询结果为空"和"查询本身失败"（参见 MEMORY.md 中 watchlist 数据丢失的教训）

### 前端

- API 调用失败时向用户显示错误提示，不静默吞掉
- 乐观更新（optimistic update）必须有 `onError` 回调处理失败情况
- 认证状态异步恢复时，用 `isLoading=true` 阻塞 auth guard，避免闪烁重定向

## API 设计规范

- 用户端点用 `Depends(verify_user_token)` 或 `Depends(verify_user_token_with_email)`
- 定时任务端点用 `Depends(verify_cron_secret)`
- 响应格式统一：`{"success": bool, "data": ..., "error": ...}`
- 广播类接口返回 `total`、`sent`、`failed` 计数，不能只返回 `success: true` 而 total 为 0

## 数据安全规范

- `.env` / `.env.local` 文件在 `.gitignore` 中，不能提交
- 执行 worktree 操作或文件批量清理后，检查 `.env*` 文件是否完整
- Edge Function 本地修改后必须部署到线上（`create-function`/`update-function`）
- 新增写操作时检查 RLS 策略是否允许写入
- Resend Contact 的 `last_name` 字段是覆盖式更新，写入前必须先读取再 merge

## 日常开发 Workflow

### 知识管理三层架构

| 层级                | 存储位置                               | 内容                | 更新方式                   |
| ------------------- | -------------------------------------- | ------------------- | -------------------------- |
| **产品方向** (WHY)  | Obsidian `产品/产品策略.md`            | 模块愿景、演进方向  | 用户确认方向调整时         |
| **工程实现** (HOW)  | 代码库 `.context.md` + `docs/plans/`   | 模块现状 + 工程计划 | 代码变更后自动 / plan 手动 |
| **日常捕获** (WHAT) | Obsidian `产品思考.md` / `用户反馈.md` | 想法、反馈          | 对话中提到时自动写入       |

### 自动化触发

**全自动（不需要任何操作）：**

- `git commit` → Obsidian 开发日志（post-commit hook）
- 改了 router.py / db.py → 对应 `.context.md` 自动更新
- 修了隐蔽 bug → `memory/MEMORY.md` 自动记录

**对话中自动（只要说出来）：**

- 提到产品想法 → Obsidian `产品思考.md`
- 提到用户反馈 → Obsidian `用户反馈.md`
- 功能上线 → Obsidian `产品现状.md`
- 方向调整 → Obsidian `产品策略.md` + 对应 `.context.md` 产品愿景

### 代码质量防线

**写代码时 (实时)**：Claude 编辑 `.ts/.tsx` 文件后自动跑 ESLint（PostToolUse hook）。

**提交前 (自动)**：`git commit` → husky pre-commit → lint-staged：

- 前端: ESLint --fix + tsc --noEmit
- 后端: Python AST 语法检查

**按需检查 (skills)**：

| 场景      | 命令                   | 覆盖范围                                        |
| --------- | ---------------------- | ----------------------------------------------- |
| 完整测试  | `/test` 或 `/test all` | lint + unit + e2e + build，前后端全跑           |
| 只跑前端  | `/test frontend`       | ESLint + TSC + Vitest + Playwright + next build |
| 只跑后端  | `/test backend`        | import + unit + E2E + integration + startup     |
| 快速 lint | `/test lint`           | 前端 ESLint + TSC + 后端 import check           |
| 单元测试  | `/test unit`           | 前端 Vitest + 后端 unit tests                   |
| E2E 测试  | `/test e2e`            | 后端 E2E + integration + 前端 Playwright        |
| 构建验证  | `/test build`          | 前端 next build + 后端 startup check            |
| 代码审查  | `/review-changes`      | 自动质检 + 多 agent 并行 review                 |
| 补测试    | `/cover-changes`       | 分析 git diff，生成对应测试                     |
| 文档审计  | `/audit-docs`          | 扫描文档 vs 代码，自动修复 drift                |
| 提交      | `/commit-diffs`        | 自动分组提交                                    |
| 工程规划  | `/plan [feature]`      | 创建 engineering plan                           |
