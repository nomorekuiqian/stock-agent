# Agent Runtime Evolution Engineering Plan

> Status: In Progress
> Related: backend/app/features/kol_research/.context.md, backend/app/features/vector/.context.md, backend/app/core/.context.md, docs/plans/active/kol-research-context-mgmt.md
> Vision: 产品策略.md > 方向二：Agent 服务 / 产品模块规划 > 投资者画像

## 目标

把当前按 feature 临时运行的 ADK Agent，逐步演进为用户拥有的长期投研 Agent：具备统一 runtime、durable session、context engine、云端 workspace、memory、installable skills 和可选 sandbox。

## 现状

当前 KOL Research Agent 已经具备最接近平台化 Agent 的能力：

- `backend/app/features/kol_research/agent.py` 使用 ADK `LlmAgent`，整合 KOL persona skills、KOL tweet RAG、market data tools、report tools 和 Google Search。
- `backend/app/shared/kol_persona/` 已经有 skill-like methodology loader，但技能来源固定在代码仓库中，暂不支持用户安装、启用、版本和权限控制。
- `backend/app/features/vector/` 提供通用向量索引和检索，可复用为未来 memory / workspace / skill RAG 的底层。
- 现有 KOL 多轮可靠性修复已完成 prefetch cache、tool result cache、context too long retry 和 prompt char guard。

主要缺口：

- Agent 运行逻辑散落在 feature 模块中，缺少统一 `AgentRuntimeService`。
- ADK session 多数是 per-request 临时创建，缺少 durable transcript / tool calls / summaries。
- Prompt assembly 仍以手动拼接为主，缺少 `ContextEngine.ingest / assemble / after_turn / compact` 生命周期。
- 用户没有自己的 cloud workspace、长期 memory 或可安装 skill registry。
- 用户 skill 一旦允许执行代码，需要单独 sandbox，而不是直接跑在后端环境中。

## 设计

### 目标架构

```text
feature router
  -> AgentRuntimeService.run(...)
      -> AgentDefinition
      -> DurableSessionStore
      -> ContextEngine.assemble(...)
      -> SkillRegistry
      -> ToolRegistry
      -> ADK runner / LLM
      -> ContextEngine.after_turn(...)
      -> transcript / tool calls / memory candidates
```

### 今日范围：前三步 MVP

今天先做可上线的底座，不一次性迁移所有 Agent：

1. 抽统一 Agent Runtime 基础结构。
2. 落 durable session / transcript 的服务接口，优先复用当前 KOL conversation id，不强制新 DB migration。
3. 增加 Context Engine，先服务 KOL prompt assembly，替代散落的 history trimming / context packaging 逻辑。

### 后续范围

4. Cloud Workspace：用 DB + Storage + Vector 做虚拟 workspace，而不是一开始给每个用户开真实 sandbox。
5. Memory System：把现有 feedback memory 升级为长期记忆、检索和删除体系。
6. Installable Skills：先支持 instruction-only skill，再支持经过 allowlist 的 tool skill。
7. Sandbox：仅当用户 skill 需要执行代码、处理上传文件、跑 Python/backtest 时接入 E2B / Daytona / Modal 等 sandbox。

## 实施步骤

1. [x] 新增 `backend/app/features/agent_runtime/`，定义 `AgentRuntimeService`、`AgentRunRequest`、`RuntimeEvent` 和 runtime turn 模型。
2. [x] 新增 `SessionStore` 抽象，提供 session id 解析、transcript 读写接口；MVP 使用 `HybridSessionStore`：优先读写新增 `agent_sessions` / `agent_session_events`，为空时读 `picker_conversations`，并写入内存 fallback。
3. [x] 新增 `ContextEngine` 抽象，提供 `assemble()`；MVP 实现 KOL 所需的 prompt assembly、history budget、summary placeholder。
4. [x] 将 `kol_research/agent.py` 的 `_build_prompt()` 接入 `ContextEngine`，保持 API 响应结构不变。
5. [x] 把 KOL request/session metadata 交给 runtime context 管理；tool/SSE contextvars 仍保留在 KOL run-loop。
6. [x] 增加 focused tests：session store、context engine prompt budget、conversation read fallback。
7. [x] 更新 `.context.md` 和本计划进度。

## 后续阶段

1. [x] Durable session additive DB migration：目标结构改为 `agent_sessions`、`agent_session_events` 两张表。仅新增表和索引，不改现有生产表。两表 schema 已执行，`agent-sessions` Edge Function 已重新部署。
2. [ ] 前端停止上传完整 history，改为传 `session_id` + 当前消息。详细计划见 `docs/plans/active/agent-runtime-next-3-phases.md`。
3. [ ] Cloud workspace：`agent_workspace_files` metadata + object storage key + vector doc binding。详细计划见 `docs/plans/active/agent-runtime-next-3-phases.md`。
4. [ ] Memory tools：`memory_search`、`memory_get`、`memory_write_candidate`。详细计划见 `docs/plans/active/agent-runtime-next-3-phases.md`。
5. [ ] Skill registry：`SKILL.md` manifest、hash、version、trust status、enable/disable。
6. [ ] Sandbox connector：为 executable skills 增加 provider abstraction。

## 待定问题

- Durable session 的第一版是否直接做 Insforge edge function，还是先用现有 `picker-conversations` 兼容层过渡。
- Workspace storage provider 选 S3/R2/Supabase Storage/Insforge Storage 哪一个。
- 用户 memory 是否需要显式确认后才永久保存。
- 用户安装 skill 的第一版是否只允许 instruction-only，不允许执行代码。
