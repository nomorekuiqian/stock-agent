# Engineering Rules

工程约束和自动化规则，确保代码库一致性和质量。

## Context 自动维护

任务完成后，根据变更类型自动更新相关文档：

| 变更类型 | 更新目标 | 触发条件 |
|----------|----------|----------|
| 新增/修改 API 端点 | 对应 `.context.md` | router.py 有增删改 |
| 认证变更 | `docs/constraints/auth.md` 已认证端点清单 | verify_user_token 使用变化 |
| 修复 bug / 踩坑 | memory/MEMORY.md 的"经验总结" | 修复了非显而易见的问题 |
| 新增 feature 模块 | CLAUDE.md 模块文档列表 | 新建了 `.context.md` |
| 数据库表/Edge Function 变更 | 对应 feature 的 `.context.md` | db.py 或 edge function 有改动 |
| 前端页面逻辑变更 | 对应页面的 `.context.md` | page.tsx 的数据流/状态管理有变化 |
| 产品想法/用户反馈 | Obsidian `产品/产品思考.md` | 用户在对话中提到产品方向、功能想法、用户反馈 |
| 功能上线/产品决策 | Obsidian `产品/产品现状.md` | 新功能部署、产品重要决策、关键数字变化 |
| 产品方向变更 | `.context.md` 产品愿景 + Obsidian `产品/产品策略.md` | 用户调整模块方向、里程碑变化 |

**执行方式**: 不需要用户提醒。完成任务后，静默检查上表，有匹配则自动更新对应文档。更新时只改变化的部分，不重写整个文件。

## 产品策略 → .context.md 同步协议

产品方向有两层存储，需保持一致：

| 层级 | 位置 | 内容 | 更新频率 |
|------|------|------|----------|
| 策略层 (WHY/WHAT) | Obsidian `产品/产品策略.md` | 完整的模块演进方向 | 低频 (方向调整时) |
| 实施层 (HOW) | 各 feature `.context.md` 的"产品愿景"章节 | 该模块的方向摘要 | 跟随策略层 |

**同步方向**: 产品策略.md → .context.md（单向，策略层是 source of truth）

**触发同步的场景**:
1. 用户确认了某模块方向调整 → 先更新产品策略.md，再同步到对应 .context.md
2. 开发新功能前 → 读产品策略.md 对应章节，确认 .context.md 的产品愿景是否需要更新
3. 里程碑状态变化 → 同步更新产品策略.md 和受影响模块的 .context.md

**模块映射表**:

| subpage | 后端 feature | .context.md | 产品策略.md 章节 |
|---------|-------------|-------------|----------------|
| /today | daily_report | `features/daily_report/.context.md` | 现有模块演进 > /today |
| /for-you | brew | `features/brew/.context.md` | 现有模块演进 > /for-you + 模块 1 |
| /stock | stock | `features/stock/.context.md` | 现有模块演进 > /stock + 模块 3 |
| /macro | macro/risk, liquidity, weekly | `features/macro/*/.context.md` (3 个) | 现有模块演进 > /macro |
| /screener | screener | `features/screener/.context.md` + `app/screener/.context.md` | 模块 4 (机会发现) |

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

**写入原则**:
- 主动写入，不要等用户要求
- 追加内容，不覆盖已有内容
- 保持现有文件格式和结构

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

当 `ENVIRONMENT` 不是 `"production"` 时，所有 broadcast 自动路由到 Resend 测试 segment (`1c300c45-49a7-479e-a4c2-1ed5cfccda1e`)。Claude 在开发环境调用广播 API 后，必须检查返回的 `audience_id` 确认是测试 segment。

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

## 日常开发 Workflow

### 知识管理三层架构

| 层级 | 存储位置 | 内容 | 更新方式 |
|------|----------|------|----------|
| **产品方向** (WHY) | Obsidian `产品/产品策略.md` | 模块愿景、演进方向 | 用户确认方向调整时 |
| **工程实现** (HOW) | 代码库 `.context.md` + `docs/plans/` | 模块现状 + 工程计划 | 代码变更后自动 / plan 手动 |
| **日常捕获** (WHAT) | Obsidian `产品思考.md` / `用户反馈.md` | 想法、反馈 | 对话中提到时自动写入 |

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

| 场景 | 命令 | 覆盖范围 |
|------|------|----------|
| 完整测试 | `/test` 或 `/test all` | lint + unit + e2e + build，前后端全跑 |
| 只跑前端 | `/test frontend` | ESLint + TSC + Vitest + Playwright + next build |
| 只跑后端 | `/test backend` | import + unit + E2E + integration + startup |
| 快速 lint | `/test lint` | 前端 ESLint + TSC + 后端 import check |
| 单元测试 | `/test unit` | 前端 Vitest + 后端 unit tests |
| E2E 测试 | `/test e2e` | 后端 E2E + integration + 前端 Playwright |
| 构建验证 | `/test build` | 前端 next build + 后端 startup check |
| 代码审查 | `/review-changes` | 自动质检 + 多 agent 并行 review |
| 补测试 | `/cover-changes` | 分析 git diff，生成对应测试 |
| 文档审计 | `/audit-docs` | 扫描文档 vs 代码，自动修复 drift |
| 提交 | `/commit-diffs` | 自动分组提交 |
| 工程规划 | `/plan [feature]` | 创建 engineering plan |
