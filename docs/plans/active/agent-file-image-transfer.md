# Agent File and Image Transfer Engineering Plan

> Status: Planning
> Related: `backend/app/features/agent_runtime/.context.md`, `backend/app/features/vector/.context.md`, `frontend/src/app/research/.context.md`
> Vision: Research Agent 支持用户在对话里上传图片/文件，并让 Agent 能引用、分析、复用这些材料。

## 目标

在 Research / KOL Agent 对话中支持附件传输：用户可以上传图片、PDF、CSV、TXT/Markdown 等文件，消息气泡能展示附件，后端能把附件安全保存到用户/session 范围，并把可用内容注入 Agent 上下文或模型多模态输入。

## 现状

- Research 可见消息和 session metadata 已经落在 `agent_sessions` / `agent_session_events`，右侧面板 UI state 仍通过 `picker_conversations.data` 兼容保存。
- `ContextEngine` 已预留 `attached_workspace` 预算分区，适合承载附件抽取摘要、检索片段和文件元数据。
- 项目已有 `features/vector` 通用 pgvector/RAG 层，适合做长期文件索引。
- 项目已有 `holdings_sync` 的图片/PDF/CSV 上传和解析经验，可复用 MIME/大小校验、PDF 文本抽取、CSV 解析错误处理风格。
- 当前 ADK runner 没有配置 `artifact_service`；ADK Artifacts 适合 agent 内部二进制对象管理，但不能替代产品侧权限、长期存储、下载 URL、审计和删除。

## 外部能力调研

- ADK Artifacts 是 session/user scoped 的命名、版本化二进制数据，需要在 Runner 初始化时配置 ArtifactService；它适合工具间共享/保存二进制结果，但本项目仍需要自己的 storage + DB metadata 做用户权限和生命周期管理。参考: https://adk.dev/artifacts/
- Gemini 文件输入支持多种路径。小文件可以 inline；官方表格给出的 inline 上限是 100MB/request，PDF inline 为 50MB。Files API 适合大文件/复用，但原始文件只保留 48 小时。参考: https://ai.google.dev/gemini-api/docs/file-input-methods
- Gemini Files API 上限是 2GB/file、20GB/project，文件保留 48 小时，期间可取 metadata 但不能下载原文件。它不能作为我们的长期 source of truth。参考: https://ai.google.dev/gemini-api/docs/files
- Gemini 图片理解支持 PNG/JPEG/WEBP/HEIC/HEIF，可做图像问答、分类、检测等。参考: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini PDF 支持最高 50MB 或 1000 页，且每页折算约 258 tokens。参考: https://ai.google.dev/gemini-api/docs/document-processing
- Gemini File Search 可把文件转 embedding 并长期保留索引；原始 File 仍 48 小时删除。考虑到本项目已有 `vector` 层，优先用自有 pgvector，File Search 可作为后续替代方案评估。参考: https://ai.google.dev/gemini-api/docs/file-search

## 推荐设计

### 数据模型

新增 `agent_attachments` 表，建议字段：

| 字段 | 说明 |
|------|------|
| `id` | UUID |
| `user_id` | owner，来自 `verify_user_token` |
| `agent_id` | `research_agent` / `kol_research_agent` |
| `session_id` | 对应 `agent_sessions.session_id` |
| `message_event_id` / `client_event_id` | 附件归属的用户消息，可先用 client id，消息写入后补 event id |
| `filename` / `mime_type` / `size_bytes` | 展示和校验 |
| `storage_key` / `url` | InsForge Storage 返回值；如果 bucket 非公开，URL 仅用于短期 signed/download API |
| `kind` | `image` / `document` / `spreadsheet` / `text` / `other` |
| `status` | `uploaded` / `processed` / `failed` / `deleted` |
| `extracted_text` | 小文档可直接存；大文档只存摘要和 vector refs |
| `summary` | 给历史/上下文快速展示 |
| `metadata` | 页数、图片尺寸、CSV 列名、解析错误等 |
| `created_at` / `deleted_at` | 生命周期 |

`agent_session_events.payload.attachments` 保存轻量引用数组：`id`、`filename`、`mime_type`、`kind`、`size_bytes`、`summary`。不要把原始二进制或长文本塞进 event payload。

### API

新增 endpoints 放在 `features/agent_runtime` 更合理：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/agent-runtime/attachments` | `multipart/form-data` 上传附件；body 带 `agent_id/session_id/client_event_id` |
| `GET` | `/api/agent-runtime/attachments/{id}` | 返回 metadata 和安全下载 URL |
| `DELETE` | `/api/agent-runtime/attachments/{id}` | 软删除 DB row，并删除/隐藏 storage object |
| `POST` | `/api/research/chat/stream` | 请求体新增 `attachment_ids?: string[]`；后端校验这些附件属于同一 user/session |

上传先通过 FastAPI 接收文件并使用 service key 写 Storage，避免浏览器直接拿过宽权限。后续如果要大文件直传，再加 pre-signed upload flow。

### Agent 输入路径

按文件类型分流：

1. **图片**：MVP 直接读取 storage bytes，构造 Gemini image `Part` 随本轮用户消息一起发送；同时在 event payload 写 attachment ref。
2. **PDF/TXT/Markdown/CSV 小文件**：后端先抽文本，按 `attached_workspace` 预算注入 `ContextEngine`；必要时把 PDF inline/File API 交给 Gemini 做视觉级理解。
3. **大文档或需跨轮复用的文件**：抽取文本 -> chunk -> 写 `vector_documents` / chunks，query 时按当前问题检索片段，注入 `attached_workspace`。
4. **Agent 生成文件**：作为第二阶段支持。工具生成 CSV/PDF/图片后写 Storage + `agent_attachments`，assistant message payload 引用附件，前端渲染下载 chip。

### 前端

- `ChatInput` 增加附件按钮、拖拽上传、粘贴图片上传。
- 发送前展示 attachment chips：文件名、大小、状态、删除按钮；图片显示小缩略图。
- `ChatMessage` 渲染用户/助手附件；图片可点击预览，文件可下载。
- 上传失败不要阻断纯文本发送，除非用户本轮明确依赖该附件。
- 限制建议：MVP 每条消息最多 5 个附件；图片 10MB/张；PDF 50MB；TXT/CSV 10MB；总请求 attachment bytes 不超过后端配置。

## 实施步骤

1. [ ] 新增 `agent_attachments` migration 和 edge/db helper；建立 user/session/agent/message 维度索引。
2. [ ] 新增 `/api/agent-runtime/attachments` 上传/读取/删除 endpoints，复用 `verify_user_token`。
3. [ ] 配置 InsForge Storage bucket，并实现 service-mediated upload/download；保存 `url` + `key`。
4. [ ] 更新 `ResearchRequest` / KOL request 支持 `attachment_ids`，后端校验 ownership 并把附件 refs 写入 runtime event payload。
5. [ ] 为图片路径接入 Gemini multimodal input；先支持 PNG/JPEG/WEBP/HEIC/HEIF。
6. [ ] 为 PDF/TXT/CSV 做文本抽取和 `attached_workspace` context 注入；小文件先不进 vector。
7. [ ] 前端 `ChatInput`/`ChatMessage` 增加上传、预览、删除、发送状态。
8. [ ] 增加单测和 e2e：上传鉴权、MIME/size 校验、附件归属校验、stream 请求带 attachment、历史恢复展示附件。
9. [ ] 第二阶段接入 `features/vector`：文档 chunk/index/search，把检索片段作为 `attached_workspace` 注入。

## 复杂度判断

- **图片 + 小文件 MVP**：中等复杂度。主要是上传 API、Storage、前端上传 UI、runtime event payload、Gemini 多模态输入串起来。预计 4-7 个工作日。
- **可复用文档 workspace**：中高复杂度。需要文件解析、chunk、向量索引、检索排序、预算裁剪、删除级联、权限和失败恢复。预计 1.5-3 周。
- **完整生产级文件系统**：高复杂度。包括大文件直传、病毒/内容扫描、signed URL、配额、后台 processing queue、OCR、Excel、多会话 workspace、agent 生成文件下载。预计 3-5 周。

## 风险和约束

- 不能依赖 Gemini Files API 做长期存储；48 小时删除意味着我们必须保存自己的原始文件或可重建材料。
- 不要把完整大文档塞进 `agent_session_events.payload` 或 prompt；用 metadata + summary + vector refs。
- 文件下载必须过用户鉴权；如果 Storage URL 是公开 URL，需要改为 service-mediated download 或 signed URL。
- 附件删除要同时处理 storage object、DB metadata、vector chunks；至少先做软删除，避免历史消息断裂。
- 图片/PDF 进入模型会显著增加 token/latency；需要前端限制和后端预算保护。

## 待定问题

1. InsForge Storage 当前是否支持私有 bucket 和 signed URL；如果不支持，下载必须走后端 proxy。
2. 是否需要支持跨 session 的用户 workspace，还是先只支持 session-scoped attachments。
3. 是否要在 MVP 支持 agent 生成文件下载，还是只做用户上传。
4. 是否引入后台 job queue 做大文件抽取/OCR；没有 queue 时只能做同步小文件处理。
5. 是否要对 PDF/图片做 OCR 或直接交给 Gemini；这会影响成本、延迟和可检索性。
