# Frank Lens Backend-First MCP Engineering Plan

> Status: Done
> Related: `mcp/market-lens/.context.md`, `backend/app/features/kol_research/.context.md`, `docs/reference/market-lens-mcp.md`
> Vision: 产品策略.md > 方向二：Agent 服务 -- 把分析能力卖给 AI

> Rename note: after this plan shipped, the public NPM adapter was renamed from
> Frank Lens MCP to Market Lens MCP so the same package can support additional
> personas. Frank remains the first beta persona and several backend internals
> still use `frank_lens_*` names.

## 目标

把 Frank Lens MCP 从“本地打包完整 Frank 方法论资产的双模式 package”改成“薄本地 NPM adapter + backend Frank workflow engine”：内测期用户免费使用完整效果，但核心 assets、workflow、证据库、质量控制和未来付费能力都留在 backend。

## 现状

当前 `mcp/frank-lens` 是一个可安装 stdio MCP package，支持 offline 和 live 两组工具：

- Offline：`frank_list_lenses`、`frank_get_methodology`、`frank_search_evidence`、`frank_get_ticker_lens`、`frank_get_sector_lens`、`frank_build_context`、`frank_stock_diagnosis`、`frank_market_regime`
- Live：`frank_live_status`、`frank_live_search_evidence`、`frank_live_market_brief`、`frank_live_build_context`、`frank_live_stock_diagnosis`、`frank_live_market_regime`

当前 package 会把 `mcp/frank-lens/assets/` 打进 npm 包。该目录包含完整 qinbafrank distilled assets：

- `core`: 1
- `framework`: 6
- `macro`: 1
- `sector`: 7
- `ticker`: 33

这些 markdown 已经包含完整判断链条、支持/削弱信号、打脸条件、Evidence Map 和 ticker/sector playbook。若原样发布，本地用户会拿到核心投研资产，和“未来用 backend workflow 收费”的商业路径冲突。

Backend 当前已有 public read MCP bridge：

```text
POST /api/kol_research/personas/{u}/mcp/search
POST /api/kol_research/personas/{u}/mcp/market-brief
POST /api/kol_research/personas/{u}/mcp/context
```

这些 endpoint 目前主要返回 context/evidence，不是完整 workflow answer；也还没有 invite code、rate limit、usage logging、share result、beta feedback 等内测需要的产品能力。

## 设计

### 产品边界

Frank Lens Beta 采用一个 NPM 包，但这个包只是 adapter：

```text
User MCP Client
  -> local frank-lens-mcp stdio adapter
  -> TheMarketBrew backend
  -> Frank workflow engine / assets / vector DB / market data
  -> final briefing + citations + optional share URL
```

本地 NPM 包只保留：

- MCP tool schema
- backend API client
- `FRANK_LENS_BACKEND_URL`
- `FRANK_LENS_INVITE_CODE` 或后续 `FRANK_LENS_API_KEY`
- `FRANK_LENS_PERSONA`
- status/setup error handling
- smoke test / install docs

本地 NPM 包不保留：

- `core/operating-system.md`
- `macro/macro-regime.md`
- sector playbooks
- ticker playbooks
- Evidence Map
- Frank workflow prompt chain
- eval/rubric
- local markdown search / local diagnosis builders

### Data Flow

```text
MCP tool call
  -> src/index.ts validates arguments
  -> src/live.ts sends HTTPS request with invite header
  -> backend validates beta access
  -> backend runs workflow:
       input guard / ticker resolution
       Frank methodology skills
       vector evidence search
       market brief tools
       safety + citation discipline
  -> backend returns:
       markdown message
       evidence chunks
       tool calls / metadata
       share URL if enabled
  -> MCP adapter returns text/json to client agent
```

### Tool Surface

User-facing tools should not expose offline/live split. Prefer one stable tool name per user job:

```text
frank_status
frank_stock_diagnosis
frank_market_regime
frank_compare
frank_research_memo
frank_search_evidence
```

MVP can ship only:

```text
frank_status
frank_stock_diagnosis
frank_market_regime
frank_search_evidence
```

`frank_compare` and `frank_research_memo` are the first extension candidates once the backend workflow endpoint shape is stable.

### Backend API Changes

Add beta-gated workflow endpoints under the existing KOL research namespace or a new Frank Lens namespace. Preferred incremental path:

```text
GET  /api/kol_research/personas/{u}/mcp/status
POST /api/kol_research/personas/{u}/mcp/workflow
POST /api/kol_research/personas/{u}/mcp/feedback
```

`mcp/workflow` request:

```json
{
  "workflow": "stock_diagnosis | market_regime | compare | research_memo",
  "question": "按 Frank 框架看 NVDA 这次回调是杀估值、杀业绩还是杀逻辑？",
  "ticker": "NVDA",
  "tickers": ["NVDA", "AVGO"],
  "sector": "ai-infrastructure",
  "include_market_data": true,
  "share": true
}
```

`mcp/workflow` response:

```json
{
  "persona_username": "qinbafrank",
  "workflow": "stock_diagnosis",
  "message": "Markdown final answer",
  "kol_chunks": [],
  "market_context": [],
  "tool_calls": [],
  "share_url": "https://themarketbrew.com/frank/share/...",
  "beta": {
    "invite_code_id": "...",
    "remaining_quota": null
  }
}
```

The backend can initially reuse `answer_kol_research()` for final answer generation, with system prompt / content_context set from workflow inputs. It should not depend on a normal user JWT in beta; invite code access is a separate boundary from website login.

### Beta Access

Use a simple beta gate first:

- Adapter reads `FRANK_LENS_INVITE_CODE`.
- Adapter sends `X-Frank-Lens-Invite-Code`.
- Backend validates invite code before running MCP workflow.
- Backend logs tool name, persona, workflow, ticker(s), latency, status, and cost-relevant flags.

Do not implement billing in this phase. The goal is feedback and willingness-to-pay validation, not payment enforcement.

### Share / Virality

Workflow responses should eventually support `share_url`, but this can be staged:

1. P0: return markdown only.
2. P1: persist generated result and return share URL.
3. P2: add feedback / thumbs up/down / “run this for another ticker” CTA on the hosted share page.

Sharing should happen on generated results, not by exposing local knowledge assets.

## 实施步骤

1. [x] Update product/docs boundary: rewrite `mcp/frank-lens/.context.md`, `docs/reference/frank-lens-mcp.md`, and `mcp/frank-lens/README.md` from “offline + live dual mode” to “thin local adapter + backend Frank engine”.
2. [x] Remove core assets from the NPM package: delete `assets/` from `package.json.files`, stop copying/publishing `mcp/frank-lens/assets/qinbafrank`, and remove local full-asset tooling from the public path.
3. [x] Refactor `mcp/frank-lens/src/index.ts` tool surface: replace paired offline/live tools with stable user-facing tools (`frank_status`, `frank_stock_diagnosis`, `frank_market_regime`, `frank_search_evidence`, `frank_compare`, `frank_research_memo`).
4. [x] Refactor `mcp/frank-lens/src/live.ts` into the only runtime backend client: add invite-code header support, consistent backend URL normalization, error messages for missing invite/backend, and typed workflow calls.
5. [x] Add backend beta access dependency for MCP workflow endpoints: validate `X-Frank-Lens-Invite-Code`, return clear 401/403 messages, and keep local dev override explicit.
6. [x] Add backend workflow request/response models in `backend/app/features/kol_research/models.py`.
7. [x] Add `GET /mcp/status` and `POST /mcp/workflow` backend endpoints. `search`, `market-brief`, and `context` are now beta-gated too.
8. [x] Wire `mcp/workflow` to backend Frank context logic: vector evidence, market brief tools, and backend-only methodology context. It returns context pack, not final answer.
9. [x] Add usage logging for beta validation: workflow, ticker(s), latency, invite id/hash, success/failure, and coarse cost flags. Use `get_logger(__name__)`, no `print()`.
10. [x] Update MCP smoke tests: add a no-backend/missing-invite setup test and a mocked-backend adapter smoke test; keep live smoke for real backend beta validation.
11. [x] Add backend tests for invite enforcement, workflow request validation, and failure behavior when Frank workflow errors.
12. [x] Keep share-result endpoint/table out of P0; defer to P1 after workflow validation.
13. [x] Update `.context.md` docs after implementation: `backend/app/features/kol_research/.context.md`, `mcp/frank-lens/.context.md`, and reference docs.

## 待定问题

1. [x] Invite codes 存 Insforge table，通过 `frank-lens-beta` Edge Function 校验。
2. [x] Beta 期间允许无 invite code 调 `frank_status`；workflow/evidence tools 必须有 invite code。
3. [x] Backend workflow 返回 context pack，让用户自己的 Agent 写最终答案。
4. [x] 第一批工具都提供：`frank_status`、`frank_search_evidence`、`frank_stock_diagnosis`、`frank_market_regime`、`frank_compare`、`frank_research_memo`。
5. [x] Share page 不进入 P0。
6. [x] 暂时保留 backend `/frank/mcp/` FastMCP remote endpoint，但不主推。

## 验收标准

1. 发布后的 NPM tarball 不包含完整 Frank distilled markdown assets。
2. 本地 MCP 包没有 backend/invite code 时不会输出完整 Frank analysis，只返回 setup/status。
3. 有有效 invite code 时，用户可以通过 MCP 得到 backend 生成的 Frank stock diagnosis 和 market regime answer。
4. Backend workflow 能区分历史证据、实时市场数据、方法论推断，不冒充 qinbafrank，不输出直接买卖指令。
5. Backend 对 MCP workflow 有基本访问控制、错误处理和 usage logging。
6. 文档不再宣传 offline/full-local mode，避免用户误解本地包包含完整知识库。
