# 投研助手 RAG（知识库）接入计划

## Context

`vector_documents` 表已在 Insforge 中预留，但项目里还没有任何代码引用，pgvector 扩展也未启用。目标：为现有投研助手（前端 `/research`，后端 `/api/research/chat`）增加一个由**运营/管理员预先填好**的知识库；用户在前端勾选"启用知识库"并选择某个 KB 后，**每条用户消息先在后端做向量检索，把 top-K 片段注入到 LLM prompt**，再由 Gemini Agent 回答。

设计约束：
- 入库者是运营，不做用户上传 UI；前端只做"选择知识库 + 启用开关"。
- 不修改现有 `screener/research_agent.py`（它是对话式选股的语义，混入 RAG 会让 instruction 与 tool set 失控），用**并列的新 feature**承接，前端按开关切换 endpoint。
- 入库和查询必须用同一 embedding 模型；锁定 **OpenAI `text-embedding-3-small`（1536维）**——项目已有 `OPENAI_API_KEY`，成本低，中英文够用。
- 表里的向量是预算好的，但**用户问题的 query 向量必须实时算**，否则没法做 `<=>` 比较。

## 决策小结

| 项 | 选择 | 理由 |
|---|---|---|
| Feature 归属 | 新建 `backend/app/features/research_kb/` | 不污染现有 research_agent |
| Embedding | OpenAI `text-embedding-3-small` (1536) | 已有 key、成本低、维度合理 |
| 注入方式 | 后端预检索 → 注入 system prompt | 用户已确认；不开放 ADK tool 自检索路径 |
| 多轮策略 | 每轮用户消息都重新检索 | 避免后续轮次缺最新上下文 |
| pgvector 索引 | `ivfflat (vector_cosine_ops)` + `lists=100` | 当前规模够用；HNSW 留作后续 |
| 前端入口 | 改 `frontend/src/app/research/page.tsx` 加开关 + 下拉 | 不新建路由，复用对话 UI |
| 鉴权 | upsert/ingest = `X-Internal-Secret`；search = 后端代理（不暴露给前端直连） | 与 `kol-tweets.js`、`portfolio.js` 模式一致 |

## 文件清单

### 新建

1. **`backend/migrations/u3a_vector_documents.sql`**
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `CREATE TABLE IF NOT EXISTS vector_documents (id uuid pk, kb_id text not null, source text, chunk_index int, content text not null, embedding vector(1536) not null, metadata jsonb default '{}'::jsonb, created_at timestamptz default now(), UNIQUE(kb_id, source, chunk_index))`
   - `CREATE INDEX IF NOT EXISTS idx_vector_documents_kb ON vector_documents(kb_id);`
   - `CREATE INDEX IF NOT EXISTS idx_vector_documents_embedding ON vector_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);`
   - 命名遵循 `u2a_entry_price.sql` 的惯例。

2. **`backend/app/edge_functions/vector-search.js`**
   - 模仿 `kol-tweets.js` 的 action-routing + `X-Internal-Secret` 模式。
   - `POST ?action=upsert` body `{kb_id, source, chunks: [{content, embedding, chunk_index, metadata}]}` → 批量 `INSERT ... ON CONFLICT (kb_id, source, chunk_index) DO UPDATE`。**embedding 由后端预先算好传入，edge function 不调 OpenAI**。
   - `POST ?action=search` body `{kb_id, query_embedding, k, filters?}` → `SELECT id, content, source, metadata, 1 - (embedding <=> $1::vector) AS score FROM vector_documents WHERE kb_id=$2 [AND metadata @> $3] ORDER BY embedding <=> $1::vector LIMIT $4;`
   - `GET ?action=list_kbs` → `SELECT DISTINCT kb_id FROM vector_documents;` 给前端下拉用。
   - 响应统一 `{success: bool, data?, error?}`。

3. **`backend/app/shared/embedding_service.py`**
   - 暴露 `async embed_text(text: str) -> list[float]` 和 `async embed_batch(texts: list[str]) -> list[list[float]]`。
   - 内部 `openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)`，model 固定 `text-embedding-3-small`。
   - 用 `tenacity` 重试（429/网络），与 `llm_metering.py` 风格一致；查询路径单条调用，入库路径 batch 100。
   - 加 `EMBEDDING_MODEL` 常量便于以后版本切换，但**注意切模型必须重建索引**（在 docstring 警告）。

4. **`backend/app/features/research_kb/`**（新 feature，遵循项目标准 4 文件结构）
   - `__init__.py` — empty
   - `models.py` — Pydantic：`ResearchKBRequest{kb_id, message, history?}`、`RetrievedChunk{content, source, score, metadata}`、`ResearchKBResponse{answer, chunks_used}`、`KBListResponse{kbs: [{id, doc_count}]}`。
   - `service.py` — `async retrieve(kb_id, query, k=6) -> list[RetrievedChunk]`：embed query → 调 edge function search → 转 model。`async list_kbs() -> list[str]`。
   - `agent.py` — `ResearchKBAgent` 类，holds `LlmAgent(model="gemini-3.1-flash-lite-preview", instruction=...)` + `InMemoryRunner`。`generate(kb_id, message, history)`：先 `retrieve`，把 chunks 渲染成 `<context>...</context>` 段拼到 instruction，再 `runner.run_async()`。`after_model_callback=meter(feature="research_kb", model=MODEL_NAME)`，复用 `llm_metering`（依据 `docs/guides/llm-usage-metering.md`，新 LlmAgent 必须挂 meter）。
   - `router.py` — `POST /api/research-kb/chat` (Depends `verify_user_token`)；`GET /api/research-kb/kbs` 列表。挂载到 `backend/app/main.py` 的 include_router 列表里。

5. **`backend/scripts/ingest_vector_docs.py`**
   - 模仿 `grant_lifetime.py` 的 bootstrap（`sys.path.insert` + `get_insforge_service`）。
   - `python -m scripts.ingest_vector_docs --kb research-assistant --path docs/research/` 或单文件 `--file foo.md`。
   - 流程：递归读 `.md`/`.txt`（先不做 PDF）→ 按 ~800 token 切片（`tiktoken` cl100k_base，重叠 100 token）→ `embed_batch` 100 条一组 → 调 edge function `?action=upsert`。
   - 幂等：`source=relative_path`、`chunk_index=i`，跑两次结果一致。
   - 进度日志：`logger.info("kb=%s source=%s chunks=%d", ...)`。
   - 失败行为：单源失败不阻塞整体，最后汇总 `ok / failed` 计数 + 退出码。

### 修改

6. **`backend/app/main.py`** — `include_router(research_kb_router)`。

7. **`backend/app/core/config.py`** — 已有 `OPENAI_API_KEY`，确认即可；若 `EDGE_FUNCTION_SECRET` 未读到则 startup warning。

8. **`frontend/src/lib/api.ts`** — 在 `api.research` 旁新增 `api.researchKb`:
   - `listKbs(): Promise<{id: string; doc_count: number}[]>`
   - `chat(req): Promise<ResearchKBResponse>`（非流式起步；后续再加 stream）。
   - 走 `_authHeaders()` 加 Bearer。

9. **`frontend/src/app/research/page.tsx` + `frontend/src/app/research/_components/ChatPanel.tsx`**
   - 在输入框上方加 `<Switch>` "启用知识库" + 一个轻量下拉（用现有 `DropdownMenu`，无需引入新 shadcn）显示 `kb_id` 列表。
   - state 存 `useReducer` 里：`kbEnabled: boolean`，`kbId: string | null`。持久化到 `localStorage`（沿用现有 `STORAGE_KEY` 机制）。
   - 发送消息时：`kbEnabled && kbId` → 走 `api.researchKb.chat`；否则走原 `api.research.chatStream`。
   - 中文文案：开关 "启用知识库"、下拉 placeholder "选择知识库"、未选时禁用发送按钮的 tooltip "请先选择知识库"。

10. **`backend/.env.example`** 和 **`frontend/.env.example`** — 注释 `OPENAI_API_KEY` 已用于 embedding，不引入新变量。

## 实施顺序

1. 迁移 `u3a_vector_documents.sql` → 用 `insforge-cli` skill 执行 → 验证表存在、pgvector 启用。
2. `vector-search.js` edge function → 用 `insforge functions deploy` → curl 验证 `?action=list_kbs` 返回空数组。
3. `embedding_service.py` → 单测：`embed_text("hello")` 返回 1536 维 float 数组。
4. `ingest_vector_docs.py` → 先做一个 3 文档的小 KB（例如 `docs/constraints/engineering-rules.md`）灌进 `kb_id=test`，sql 查 row count 校验。
5. `research_kb/service.py + agent.py + router.py` → 单测 + 本地 curl `/api/research-kb/chat`。
6. 前端开关 + 下拉 + endpoint 切换 → `npm run dev` 手测：未启用 → 走原路径；启用 → 答复里能看到引用的 source。
7. `playwright` E2E（可选）补一条"启用 + 提问 + 答案包含 source"。

## 验证

- **后端单元**：`pytest backend/tests/test_research_kb.py`（新增），覆盖 `service.retrieve` 的 embedding mock + edge function 返回。
- **后端集成**：本地起 uvicorn，灌一个 test KB，curl `/api/research-kb/chat` 看返回结构。
- **前端**：
  - `npm test` 跑 vitest（新增 `ChatPanel` 的 KB switch 渲染测试）。
  - 浏览器手测 `/research`：开关默认关、打开后 dropdown 出现、选中后发消息回复中带 `chunks_used` 来源。
- **数据库**：`insforge db sql "SELECT kb_id, count(*) FROM vector_documents GROUP BY kb_id;"` 看到预期 KB 与 chunk 数。
- **回归**：现有 `/research` 在开关关闭状态下行为完全不变（用对话历史保存/拉取流程跑一遍）。

## 风险与回退

- pgvector 在 Insforge 上若未自带，需要先确认；若启用失败，方案降级为 `jsonb` + 应用层算余弦（性能差但可跑通 demo）。
- ivfflat 在数据量 < 1000 时 recall 偏低，初期可临时去掉索引走顺序扫描，等数据量起来再加。
- 开关默认关，前端按 feature flag 灰度（参考 `docs/guides/feature-flags-playbook.md`），出问题随时关。
- 切换 embedding 模型必须配合表清空重建——在 `embedding_service.py` 注释中显式标红。
