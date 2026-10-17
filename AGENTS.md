# Stock Agent / TheMarketBrew

用简体中文交流；代码、命令与标识符保留原文。

## Critical Rules

- **Paused products (2026-09-04)**: Portfolio Health, Research-KB, KOL standalone agents, Panda, AI Monitor, MCP and Onboarding are paused. Preserve code/data; enforce `core/feature_pause.py` and frontend `lib/feature-pause.ts`. Do not reactivate access or dedicated schedules without a new user request.
- **Persona chat restored (2026-09-22)**: `/research` may select `qinbafrank` and `aleabitoreddit` through the separate `kol_chat` gate. KOL studio pages/data APIs (`kol_research`), Panda, MCP, indexing and dedicated schedules remain paused. Restore only these two personas' chat, skills and conversation history.

- **Git authorization**: Read-only inspection (`status`, `diff`, `log`, `show`) can proceed as needed. Commit and push only when requested or already authorized for this task; do not ask again for the same authorized operation. Preserve unrelated changes.
- **Dead code zones**: `backend/app/services/` and `backend/app/models/` are pre-refactor dead code. Never import from these paths. Active code lives in `app/features/` and `app/shared/`.
- **Email broadcast safety**: When `ENVIRONMENT` is not `"production"`, all broadcasts auto-route to Resend test segment (`1c300c45-49a7-479e-a4c2-1ed5cfccda1e`). After calling broadcast API in dev, verify the returned `audience_id` is the test segment.
- **Logging**: Use `get_logger(__name__)`, never `print()`. Use `%s` lazy formatting, not f-strings.
- **Auth patterns**: User endpoints use `Depends(verify_user_token)`, cron jobs use `Depends(verify_cron_secret)`. Full auth flow in `docs/constraints/auth.md`.
- **AI model source**: Google ADK generation uses `app.core.ai_models.GENERATIVE_MODEL` (`gemini-3.8-flash`); KOL tweet enrichment uses the shared `CLASSIFICATION_MODEL` (`gemini-3.5-flash-lite`) with minimal thinking. Preserve these shared settings instead of adding per-agent model literals.
- **No emoji in code**: Never write emoji characters in source code files.

## 按任务读取

- 改变模块行为、接口或数据流：读受影响模块的 `.context.md`；需要定位模块时查 [模块索引](docs/agents/module-index.md)。文案或局部小修无需读完整项目地图。
- 认证：读 `docs/constraints/auth.md`；认证、数据保存、广播或环境处理还需查 [生产经验](docs/agents/production-gotchas.md) 中对应章节。
- UI：沿用 `docs/constraints/design-system.md`；页面与组件目录见 `docs/reference/pages.md`、`docs/reference/components.md`。
- 启动、测试、环境配置、ADK 或架构工作：查 [开发参考](docs/agents/development-reference.md) 的相关章节；实际命令以当前配置和测试 fixtures 为准。
- 较大功能或未决架构才需要 `docs/plans/` 方案；普通修复直接完成。

## 完成与验证

完成已授权的修改及必要验证，修复本次引入的问题。验证范围与风险相称：文档小改检查链接与差异；行为变化验证受影响行为；界面变化检查真实页面和相关状态。结果未受后续修改影响时可复用。

本地隔离、无生产访问的检查无需逐步确认。依赖线上服务或会写数据的测试，先核实 fixtures、目标环境和本次授权。不要为验证触发真实邮件、付款或生产写入。

接口、数据流或认证约束变化时同步对应 `.context.md` 或约束文档；纯文字和内部小改无需补齐全套文档。最终说明改动、验证与未解决项。

## 工作流 Skills

在 `.agents/skills/` 按任务使用：`review-changes` 审查、`cover-changes` 补必要测试、`test` 验证、`simplify` 简化、`ready-to-ship` 交付检查、`commit-diffs` 执行已授权提交。子流程复用当前有效证据，避免重复全量检查。

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **TheMarketBrew Production** (API base `https://9wmhxyi4.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Use the relevant guide when implementing or investigating the corresponding InsForge API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
