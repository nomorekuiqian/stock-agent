# Agent Runtime Next 3 Phases Engineering Plan

> Status: Planning
> Related: docs/plans/active/agent-runtime-evolution.md, backend/app/features/agent_runtime/.context.md, frontend/src/app/research/.context.md, backend/app/features/vector/, backend/app/features/memory/
> Vision: 产品策略.md > 方向二：Agent 服务 / 产品模块规划 > 投资者画像

## 目标

把当前已经落地的 durable session/event timeline，继续推进成用户长期拥有的投研 Agent：

1. 前端停止上传完整 history，后端用 `session_id` 自己恢复上下文。
2. 建立 Cloud Workspace，让用户上传/保存的资料成为 agent 可检索的上下文。
3. 建立 Memory System，让 agent 能记住用户长期偏好、投资画像和重要事实。

这三步都不要求真实 sandbox。Sandbox 只在后续 executable skill、文件执行、回测或 Python 任务阶段引入。

## 现状

已完成：

- `agent_sessions` / `agent_session_events` 两张表已作为 durable runtime 底座。
- `agent-sessions` Edge Function 已支持 session upsert、event append、metadata merge、event read。
- Research 和 KOL Research 首轮会预分配稳定 `conversation_id`。
- `agent_sessions.metadata.ui_state` 已保存右侧页面恢复快照。
- `agent_session_events` 已记录 user/assistant message、context snapshot、tool call、UI navigation、error。
- `DefaultContextEngine` 已能做 history window、content context、input guard prompt 组装。
- `backend/app/features/vector/` 已提供通用 document/chunk/index/search 能力。
- `backend/app/features/memory/` 已有 feedback/thesis/suggestion tracking 的轻量 memory block。

主要缺口：

- 前端仍然传 `history`，后端还没有完全接管 conversation reconstruction。
- 右侧 UI 恢复仍主要依赖 `picker_conversations.data`，runtime restore API 尚未成为主入口。
- Workspace 缺少文件 metadata 表、storage key 管理、上传/索引/删除 API。
- Memory 目前是汇总文本，不是可检索、可确认、可删除的长期记忆系统。

## 设计原则

- 继续 additive-only：新增表、Edge Function action、API 和服务；不删除、不改写生产旧表。
- `picker_conversations` 继续作为兼容层，直到 runtime restore API 完整替代。
- Snapshot + Events 并存：session metadata 放当前快照，events 放可审计时间线。
- Workspace 和 Memory 都通过 `ContextEngine` 注入，而不是在每个 agent 里手写拼 prompt。
- 用户长期记忆默认应可见、可删除；高置信自动候选也应有确认/撤销路径。
- Runtime event 写入必须具备幂等性。任何前端 retry、SSE 断线重连或多设备并发都不能生成重复 transcript。
- Context 注入必须由统一预算分配器控制。history、workspace、memory、active context 不能各自独立占预算后简单相加。

## 审计修订结论

外部审计指出的以下问题纳入硬性实施要求：

- Phase 1 必须先补 `turn_id` / `client_event_id` 幂等机制，不能只在 plan 中口头提及。
- `conversation_id` 和 `session_id` 在当前阶段是同一个 UUID 的两个字段名，不引入 mapping 表。
- `ContextEngine` 在 Phase 2/3 前必须引入 `BudgetPlan`，集中分配 history、workspace、memory 和 content context 预算。
- Workspace v1 必须有上传大小、类型、TTL、用户配额和索引成本边界。
- Memory 不复制 portfolio/watchlist 等结构化事实，避免和业务表双写不一致。
- Runtime restore cursor 使用 `(created_at, id)` 二元 cursor，不能只靠单个 timestamp 或倒序 limit。
- 三个阶段都要有观测指标和回滚开关。

## Phase 1: 后端接管 history

### 目标

把 Research/KOL chat 请求从：

```json
{
  "message": "...",
  "history": [...],
  "conversation_id": "...",
  "active_context": {...}
}
```

逐步改成：

```json
{
  "message": "...",
  "session_id": "...",
  "active_context": {...}
}
```

短期兼容：`conversation_id` 和 `history` 仍接受，但后端优先使用 runtime session。

术语约定：

- `session_id` 是 runtime API 的正式字段名。
- `conversation_id` 是当前 `/research` UI 和 picker conversation 使用的旧字段名。
- 在 Phase 1 中两者必须是同一个 UUID，不建立 mapping 表。
- 前端迁移完成后保留 `conversation_id` alias 一段时间，只做字段兼容。

### 后端改动

1. API model 增加统一字段：
   - `session_id: Optional[str]`
   - 保留 `conversation_id`，内部映射到 `session_id`
   - 保留 `history`，只作为 fallback 和灰度期间对比输入

2. `AgentRunRequest` 语义调整：
   - `session_id` 是唯一 runtime session key
   - `history` 只代表 client fallback history，不再是默认上下文来源
   - `content_context` 继续代表本轮右侧页面状态

3. `HybridSessionStore.load_session()` 读优先级调整：
   - `agent_sessions` + `agent_session_events`
   - `picker_conversations` fallback
   - request `history` fallback
   - in-memory fallback

4. `SessionSnapshot` 增加/明确字段：
   - `transcript`
   - `metadata`
   - `ui_state`
   - `summary`
   - `source`

5. 增加 runtime restore API：
   - `GET /api/agent-runtime/sessions/{session_id}`
   - 返回 session snapshot、visible messages、latest UI state、timeline event cursor
   - 第一版可以仅服务 `/research`，不需要全平台开放

6. `ContextEngine.assemble()` 改为接收 `SessionSnapshot`：
   - 从 events 转 transcript
   - 使用 session summary + recent turns
   - 拼入 active context
   - 拼入 future workspace/memory context placeholder

7. 写入事件时必须增加幂等保护：
   - 每个用户发送动作由前端预生成 `turn_id`
   - 每条 event 带 `client_event_id`
   - `user_message` / `assistant_message` / tool/error/context events 都挂在同一个 `turn_id`
   - message event payload 内带 client message id / server response id
   - 前端 retry 同一个 `turn_id` 时不得重复写 user/assistant transcript
   - Edge Function 使用 upsert / on conflict do nothing，而不是直接 insert

8. `ContextAssemblyRequest` 兼容演进：
   - 保留现有 DTO，不直接把 `ContextEngine.assemble()` 改成只接收 `SessionSnapshot`
   - 给 `ContextAssemblyRequest` 增加可选 `session: SessionSnapshot`
   - 如果传入 `session`，engine 从 `session.transcript` 取 history；`request.history` 只作为 fallback

9. 增加 feature flag：
   - 前端：`NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY=true|false`
   - 后端：`AGENT_RUNTIME_REQUEST_HISTORY=fallback|primary|disabled`
   - 默认灰度值：前端继续传 compact history，后端以 runtime session 为 primary、request history 为 fallback

### 前端改动

1. `frontend/src/lib/api.ts`：
   - Research request 增加 `session_id`
   - KOL request 增加 `session_id`
   - 保留 `conversation_id` 作为过渡 alias

2. `frontend/src/app/research/page.tsx`：
   - 新会话第一轮仍预分配 UUID
   - 请求只传 `session_id` + `message` + `active_context`
   - 灰度期可以用 feature flag 决定是否继续传 compact history

3. 对话恢复路径：
   - 优先调用 runtime restore API
   - 如果 runtime 无数据，再 fallback 到 `api.screener.conversations.get(id)`
   - 恢复右侧页面优先用 `agent_sessions.metadata.ui_state`

4. 前端 local/session storage：
   - 只作为 UI 快速恢复缓存
   - 不再作为 agent 上下文事实来源

### 数据库/Edge Function

不需要新表，但需要 additive index / column 来支持幂等。扩展 `agent_session_events`：

- 新增 nullable columns：
  - `turn_id text`
  - `client_event_id text`
  - `client_ts timestamptz`
- 新增唯一索引：
  - `(user_id, agent_id, session_id, client_event_id)` where `client_event_id is not null`
  - 如果部分事件没有 client id，则用 `(user_id, agent_id, session_id, turn_id, event_type, role)` 做保底 dedup index
- `created_at` 一律由服务端 `now()` 写入；客户端时间只保存到 `client_ts`

扩展 `agent-sessions` Edge Function action：

- `GET /sessions/{session_id}` 或现有 GET 返回结构扩充：
  - `session`
  - `events`
  - `messages`
  - `ui_state`
  - `summary`
  - `cursor`

增量读取使用 `(created_at, id)` 二元 cursor：

- 首次读取按 `created_at asc, id asc`
- 下一页使用 `after_created_at` + `after_id`
- 查询条件语义为 `(created_at, id) > (after_created_at, after_id)`
- 避免同 timestamp 下事件乱序或漏读

### 验收标准

- 新建普通 Research 对话：前端不传完整 history 也能第二轮正确引用第一轮内容。
- 新建 KOL 对话：第二轮同 ticker 能命中 conversation-scoped tool cache。
- 刷新页面后继续对话：后端能从 `agent_session_events` 恢复消息上下文。
- 删除/隐藏前端 localStorage 后仍可继续对话。
- 旧的 `picker_conversations` 历史对话仍可加载。
- 模拟同一 `turn_id` retry 两次：`agent_session_events` 不出现重复 user/assistant message。
- 两个设备同时写同一 session：事件按服务端时间和 id 稳定排序。

### 验证命令

```bash
cd backend
source venv/bin/activate
pytest tests/test_agent_runtime.py tests/test_research_unit.py tests/test_kol_research_input_guard.py -q
```

```bash
cd frontend
npm run lint
npm run build
npm run test:e2e -- --grep "research"
```

需要新增 Playwright case：

- 创建 research 对话，连续问两轮。
- 强制刷新页面。
- 再问第三轮，确认 agent 能引用前两轮内容。
- 清空 localStorage 后重复恢复，确认后端 runtime 是上下文来源。

### 用户体验结果

用户不会明显看到 UI 大改，但会感受到：

- 多轮对话更稳。
- 刷新后继续问不会像重新拼出来的会话。
- 换设备/隔天回来继续对话更可靠。
- 未来可以显示更完整的 timeline，因为后端知道每一轮发生了什么。

## Phase 2: Cloud Workspace

### 目标

给每个用户一个云端投研资料空间，让 agent 能读取用户保存或上传的资料。

第一版 workspace 是虚拟 workspace：

```text
DB metadata
  + object storage raw file
  + vector index chunks
  + runtime session binding
```

不启动真实 sandbox，不执行用户代码。

### 数据模型

新增表建议：

`agent_workspace_files`

- `id uuid primary key`
- `user_id uuid not null`
- `workspace_id uuid null`
- `source_type text not null`
  - `upload`
  - `saved_report`
  - `saved_chat`
  - `note`
  - `url`
- `title text not null`
- `mime_type text null`
- `size_bytes bigint null`
- `storage_bucket text null`
- `storage_key text null`
- `content_hash text null`
- `status text not null`
  - `pending_upload`
  - `uploaded`
  - `indexing`
  - `ready`
  - `failed`
  - `deleted`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`agent_workspace_bindings`

- `id uuid primary key`
- `user_id uuid not null`
- `session_id uuid null`
- `file_id uuid not null`
- `binding_type text not null`
  - `attached_to_session`
  - `pinned`
  - `auto_retrievable`
- `created_at timestamptz not null default now()`

如果想保持更简化，`workspace_id` 可以先不建独立 workspace 表。默认每个用户一个 implicit workspace。

不保存 `vector_document_id` 作为强依赖字段。向量文档统一通过
`source_type='workspace_file'` + `source_id=file_id` 反查，避免 metadata 和
vector 双写不一致。如果以后为了性能缓存 vector document id，只能作为可重建 cache，
不能作为唯一真实来源。

删除语义：

- `agent_workspace_files.status='deleted'` 保留 metadata 审计行。
- storage object 立即硬删除。
- vector document/chunks 立即硬删除。
- 所有 retrieval 必须过滤 `status != 'deleted'`。

### Storage 方案

第一版优先使用项目当前平台最容易接入的 object storage。无论选 Insforge Storage、S3 或 R2，后端只暴露统一接口：

- `put_object(user_id, file_id, bytes, metadata)`
- `get_signed_url(user_id, file_id)`
- `delete_object(user_id, file_id)`

不要把 provider 细节散落在 router 里。

### V1 limits

Workspace v1 上线前必须有明确限制：

- Presigned upload URL TTL：默认 10 分钟。
- 允许 MIME：`text/plain`、`text/markdown`，后续再扩 PDF/HTML/CSV。
- 单文件大小：Free 1MB，Pro/Max 5MB。
- 单用户文件数：Free 20，Pro 100，Max 500。
- 单用户总 storage：Free 20MB，Pro 500MB，Max 2GB。
- 上传完成后后端重新校验 size、MIME 和 content hash，不能只信前端。
- storage key 必须由后端生成，格式包含 user id 和 file id，禁止使用用户传入路径。
- embedding/indexing cost 计入 workspace indexing quota；失败要记录原因并允许用户重试。

### 后端 API

新增 feature：

```text
backend/app/features/agent_workspace/
  router.py
  service.py
  db.py
  models.py
  storage.py
  .context.md
```

API：

- `POST /api/agent-workspace/files/presign`
  - 创建 file metadata，返回 upload URL 或 upload token
- `POST /api/agent-workspace/files/{file_id}/complete`
  - 标记上传完成，触发抽取和向量索引
- `GET /api/agent-workspace/files`
  - 列出用户 workspace files
- `GET /api/agent-workspace/files/{file_id}`
  - 获取 metadata
- `DELETE /api/agent-workspace/files/{file_id}`
  - 软删除 metadata，删除 storage object，删除 vector source
- `POST /api/agent-workspace/files/{file_id}/attach`
  - 把文件绑定到当前 session
- `POST /api/agent-workspace/notes`
  - 保存一段用户笔记并直接索引

### 向量索引

复用 `backend/app/features/vector/service.py`：

- `source_type = "workspace_file"`
- `source_id = file_id`
- `visibility = "private"`
- `user_id = user_id`
- `metadata` 写入 file title、mime、session binding、symbols、tags

文档抽取第一版只支持低风险格式：

- `.txt`
- `.md`
- 简单 text-like content

PDF/HTML/CSV 可以第二版再加，避免一次引入复杂解析和失败模式。

### Agent 接入

`ContextEngine.assemble()` 增加 workspace retrieval 阶段：

```text
message + session_id
  -> search attached workspace files
  -> search user private workspace files
  -> build workspace context block
  -> inject into prompt
```

检索策略：

- attached files 优先，top_k=5
- user private workspace 次优先，top_k=5
- 每轮 workspace 预算由统一 `BudgetPlan` 分配，默认最多 6000 chars
- context block 必须带 source id/title，方便回答引用

第一版不让 agent 自主写 workspace，只让用户显式上传/保存。

### Context budget

Phase 2 必须先扩展 `ContextEngine`：

```python
BudgetPlan(
    total_chars=60000,
    allocations={
        "input_guard": 6000,
        "active_memory": 1800,
        "attached_workspace": 6000,
        "history": 20000,
        "content_context": 8000,
        "inferred_memory": 800,
    },
)
```

预算降级优先级：

1. 本轮用户消息和系统 instruction 不裁剪。
2. input guard / critical active context 优先。
3. user-confirmed memory 优先于 inferred memory。
4. attached workspace 优先于 general workspace。
5. 最近 history 优先于旧 history。
6. 超预算时记录 `context_budget_truncated` event。

### 前端 UX

在 `/research` 右侧或侧栏增加轻量入口：

- Workspace file list
- Upload / Save note
- Attach to current chat
- Attached files pills

对话中用户可以说：

- “基于我上传的这份 memo 分析一下”
- “结合我的 NVDA notes 重新判断”

### 验收标准

- 用户可以上传一段文本或保存 note。
- 文件 metadata 写入 `agent_workspace_files`。
- 内容成功进入 vector index，`visibility=private` 且带 `user_id`。
- 当前 session attach 文件后，agent 第二轮能引用该文件内容。
- 另一个用户无法检索到这个文件。
- 删除文件后，agent 不再检索到对应 chunks。
- 超过文件大小、类型或 quota 限制时，上传被拒绝且不产生孤儿 storage object。

### 用户体验结果

用户会第一次感觉 agent 有自己的“资料库”：

- 不用每次重新粘贴长文档。
- 可以围绕同一批资料连续研究。
- 可以把研究笔记、报告、聊天产物保存成后续上下文。

## Phase 3: Memory System

### 目标

把当前的 lightweight memory block 升级为可管理、可检索、可审计的长期记忆系统。

Memory 和 Workspace 的区别：

- Workspace 是资料：文件、笔记、报告、聊天片段。
- Memory 是用户画像：偏好、持仓事实、投资原则、禁忌、长期关注方向。

### 数据模型

新增表建议：

`agent_memories`

- `id uuid primary key`
- `user_id uuid not null`
- `memory_type text not null`
  - `preference`
  - `investment_principle`
  - `watchlist_interest`
  - `communication_style`
  - `risk_constraint`
  - `correction`
- `content text not null`
- `summary text null`
- `symbols text[] not null default '{}'`
- `topics text[] not null default '{}'`
- `confidence numeric null`
- `status text not null`
  - `candidate`
  - `active`
  - `dismissed`
  - `archived`
- `source_type text not null`
  - `user_confirmed`
  - `agent_inferred`
  - `feedback`
  - `conversation`
- `source_ref_id text null`
- `last_used_at timestamptz null`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`agent_memory_events`

- `id uuid primary key`
- `memory_id uuid not null`
- `user_id uuid not null`
- `event_type text not null`
  - `proposed`
  - `confirmed`
  - `edited`
  - `used`
  - `dismissed`
  - `archived`
- `payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

Memory 也可以进入 vector index：

- `source_type = "agent_memory"`
- `source_id = memory_id`
- `visibility = "private"`
- `user_id = user_id`

结构化事实边界：

- `portfolio.thesis`、watchlist、subscription、profile 等业务事实继续从原业务表读取。
- `agent_memories` 不复制这些事实，避免用户改 portfolio 后 memory 过期。
- `agent_memories` 只承载用户行为推断或用户明确确认的偏好、原则、纠正和表达风格。
- `get_user_memory()` 负责 union legacy memory、业务表事实和 new active memories。

### 后端服务

新增或扩展：

```text
backend/app/features/memory/
  models.py
  db.py
  service.py
  router.py
```

核心 service：

- `search_memories(user_id, query, filters, top_k)`
- `get_memory_context(user_id, message, max_chars)`
- `propose_memory_candidate(user_id, session_id, turn)`
- `confirm_memory(user_id, memory_id)`
- `dismiss_memory(user_id, memory_id)`
- `archive_memory(user_id, memory_id)`
- `record_memory_used(user_id, memory_id, session_id)`

### Agent tools

给 runtime 暴露三个受控工具：

- `memory_search(query)`
  - agent 查询用户记忆
- `memory_get(memory_id)`
  - agent 获取单条记忆详情
- `memory_write_candidate(content, memory_type, reason)`
  - agent 只能提出候选，不能直接写 active memory

第一版建议由后端 `after_turn` 自动生成 candidate，而不是完全交给 LLM tool call：

```text
turn transcript
  -> cheap rule extraction
  -> optional LLM extraction
  -> candidate memory
  -> user confirms
```

Candidate extraction v1 采用白名单规则：

- 只在用户显式表达时提 candidate，例如“我偏好 X”“不要再推荐 Y”“以后用 X 风格回答”“我主要关注 X”。
- 不从敏感推断、单次模糊表达或 assistant 自己的结论里生成 candidate。
- dedupe key：`(user_id, memory_type, normalized_content)`。
- dismissed cooldown：同语义 dismiss 后 30 天内不再提议。
- candidate 上限：每用户最多 50 条 pending；每 turn 最多生成 2 条。

### ContextEngine 接入

`ContextEngine.assemble()` 增加 memory retrieval：

```text
message
  -> active memories exact filters by symbols/topics
  -> semantic memory search
  -> portfolio thesis existing memory
  -> render compact memory block
```

注入预算：

- memory block 预算由统一 `BudgetPlan` 分配，默认最多 1800 chars
- 高置信 user-confirmed memory 优先
- 最近使用过但不相关的 memory 不注入
- 每次注入 memory event 记录 `memory_used`

### 前端 UX

新增轻量 Memory 管理入口，第一版可以在 `/settings` 或 `/research` sidebar：

- “Agent 记住了什么”
- Candidate memories 待确认
- Active memories
- Edit / delete / archive

对话内可以有小提示：

- “我可以记住：你偏好现金流稳定的公司”
- 用户点“记住”或“不要记”

不要在第一版自动静默保存所有 inferred memory。

### 与现有 memory 模块的关系

现有 `get_user_memory(user_id)` 继续保留，作为兼容 memory block。

新系统上线后：

1. 先把 portfolio thesis、feedback tendency、suggestion tracking 渲染成 memory context。
2. 只把用户明确偏好、纠正、表达风格等行为推断写入 `agent_memories`。
3. 最后让 `get_user_memory()` 改为组合 legacy memory + new active memories。
4. 删除/归档 memory 时同步删除 `source_type='agent_memory'` 的 vector chunks。
5. 增加 memory export API，允许用户导出全部 active/candidate/archived memory。

### 验收标准

- 用户可以看到 memory candidates。
- 用户确认后，memory 进入 active 状态。
- 下一轮 agent 回答能使用 active memory。
- 用户删除/归档 memory 后，后续回答不再使用。
- memory 仅当前用户可见。
- agent 不会直接把敏感推断静默写成 active memory。
- 用户 export memory 时能看到所有 active/candidate/archived memory。
- 删除/归档 memory 后，对应 vector chunks 同步不可检索。

### 用户体验结果

用户会感觉 agent 开始“认识我”：

- 回答会符合用户投资风格。
- 不需要反复解释自己关注什么。
- 用户可以控制 agent 记住什么、忘记什么。

## 三阶段顺序和里程碑

默认执行顺序仍为 Phase 1 -> Phase 2 -> Phase 3。若产品目标是先验证“agent
长期认识用户”的体验，可以采用低风险变体：Phase 1 -> Phase 3 candidate MVP
（不做 vector，仅 propose/confirm/dismiss + text injection）-> Phase 2 workspace。
这个变体牺牲 workspace 资料库能力，但更快验证 memory 产品价值。

### Milestone A: Runtime context ownership

范围：Phase 1。

结果：前端不再负责 agent history 真相，后端 runtime 成为上下文来源。

上线风险：中等。主要风险是旧会话恢复和重复消息。

回滚方式：feature flag 恢复传 `history`，后端继续接受 request history fallback。

观测指标：

- runtime restore hit rate
- picker fallback hit rate
- event append failure rate
- duplicate event conflict count
- average context chars / truncated turns

### Milestone B: User workspace retrieval

范围：Phase 2 的 text/note MVP。

结果：用户有自己的 cloud workspace，agent 可以基于用户资料回答。

上线风险：中等偏高。主要风险是文件权限、索引失败、storage provider 差异。

回滚方式：关闭 workspace retrieval 注入，不影响 chat runtime。

观测指标：

- file upload success/failure rate
- indexing success rate
- retrieval p50/p95 latency
- attached workspace injection hit rate
- average workspace injected chars per turn
- storage/indexing quota rejection count

### Milestone C: User-controlled memory

范围：Phase 3 的 candidate/active memory MVP。

结果：agent 有长期用户画像，但用户可确认、删除、控制。

上线风险：中等。主要风险是记忆误写、过度个性化和隐私边界。

回滚方式：关闭 memory injection，保留 memory 管理数据。

观测指标：

- candidate proposed / confirmed / dismissed counts
- memory injection hit rate
- memory used count per session
- memory injection 后用户负反馈率
- dismissed cooldown hit count

## 建议排期

1. Phase 1: 2-4 天
   - API 兼容改造
   - runtime restore API
   - 前端灰度停止传 history
   - 回归测试

2. Phase 2: 4-7 天
   - workspace schema/Edge Function/API
   - storage adapter
   - text/note indexing
   - `/research` attach UX
   - private vector retrieval 验证

3. Phase 3: 4-7 天
   - memory schema/API
   - candidate extraction
   - memory management UI
   - ContextEngine memory injection
   - privacy/delete 验证

## 待定问题

- Workspace storage provider 先选 Insforge Storage、S3 还是 R2。
- Workspace 第一版是否支持 PDF，还是先严格限制 text/note。
- Runtime restore API 是否做成独立 `/api/agent-runtime/*`，还是继续挂在 `/api/research/*` 下灰度。
- Memory candidate 是否需要每次显式用户确认，还是允许某些低风险 preference 自动 active。
- Memory 是否要支持组织级共享，还是 MVP 严格只做 per-user private。
- `picker_conversations` 退场阈值：建议 runtime restore hit rate 连续 30 天 > 99%，且 picker fallback hit rate 连续 30 天为 0 后，才进入下线候选。
