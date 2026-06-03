# Agent Runtime Phase 1 — Verification Playbook

> Status: Active
> Plan: docs/plans/active/agent-runtime-next-3-phases.md
> Module: backend/app/features/agent_runtime/
> Owner: backend platform

这份文档把 Phase 1 计划里写的所有验收点拆成可执行的验证步骤。每一条都标注
**验证手段**（pytest / curl / 浏览器 / 观测） 和 **预期结果**。验证顺序按
"自动化覆盖 → 本地手测 → e2e → 生产观测" 排，越靠前越快出结论。

整套验证只覆盖 Phase 1。Phase 2 / Phase 3 的验证文档在它们开工前另起。

## 0 · 准备

```bash
# 后端
cd backend
source venv/bin/activate

# 前端
cd frontend
npm install
```

环境变量（`backend/.env`）：

| Key | 默认 | 验证含义 |
|---|---|---|
| `AGENT_RUNTIME_REQUEST_HISTORY` | `fallback` | 灰度档位，见 §6 |
| `AGENT_RUNTIME_HISTORY_FETCH_LIMIT` | `200` | session restore 默认取 200 条 event，上限 500 |
| `AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT` | `60000` | BudgetPlan 全局总预算 |
| `AGENT_RUNTIME_BUDGET_*` | 见 config.py | BudgetPlan 各分段预算 |
| `EDGE_FUNCTION_SECRET` | unset 时不带 header | 本地不带 secret 也能命中 |

前端（`frontend/.env.local`）：

| Key | 默认 | 含义 |
|---|---|---|
| `NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY` | `true` | 设 `false` 让前端停传 history，配合后端 primary 灰度 |

## 1 · 自动化测试套件

### 1.1 后端单元/集成测试

```bash
cd backend
source venv/bin/activate
pytest tests/test_agent_runtime.py \
       tests/test_research_unit.py \
       tests/test_kol_research_input_guard.py \
       tests/test_conversation_unit.py \
       tests/test_architecture.py -q
```

`test_agent_runtime.py` 现在 23 个 case，对应到 plan 的验收点如下：

| Plan 验收点 | 测试用例 |
|---|---|
| Phase 1 §"模拟同一 turn_id retry 两次：agent_session_events 不出现重复 user/assistant message" | `test_runtime_complete_turn_writes_idempotent_turn_events`<br>`test_runtime_complete_turn_is_idempotent_under_retry` |
| Phase 1 §"刷新页面后继续对话：后端能从 agent_session_events 恢复消息上下文" | `test_agent_sessions_store_reads_persistent_events`<br>`test_runtime_restore_router_returns_normalized_session` |
| 审计修订 §"session_exists 短路 picker" | `test_session_exists_short_circuits_picker_lookup` |
| 审计修订 §"runtime restore cursor (created_at, id)" | `test_db_get_session_requires_both_cursor_fields`<br>`test_runtime_restore_router_rejects_partial_cursor` |
| 审计修订 §"BudgetPlan 集中分配" | `test_budget_plan_records_section_truncations_in_metadata`<br>`test_context_budget_truncated_event_emitted_when_truncated` |
| Phase 1 §"AGENT_RUNTIME_REQUEST_HISTORY 灰度档位" | `test_request_history_flag_primary_drops_request_history` |
| Phase 1 §"runtime restore API" | `test_runtime_restore_router_returns_normalized_session`<br>`test_runtime_restore_router_empty_session_returns_empty_payload`<br>`test_runtime_restore_router_rejects_unknown_agent_id` |

预期：`23 passed`。

### 1.2 全量回归

```bash
cd backend && source venv/bin/activate
pytest -q --ignore=tests/test_kol_persona_skills_e2e.py \
          --ignore=tests/test_kol_quality_eval.py
```

预期：全部 pass（最近一次基线 2081+ passed / 40 skipped / 0 failed）。

### 1.3 前端 lint + 类型 + build

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

预期：lint 0 errors（warning 允许）；tsc 静默；build 成功。

## 2 · 本地手测 · Runtime restore HTTP endpoint

### 2.1 启动 backend + frontend

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload
cd frontend && npm run dev
```

### 2.2 用 curl 验证 GET /api/agent-runtime/sessions/{id}

先在浏览器登录拿到 JWT（DevTools → Application → Local Storage →
`insforge.auth.token`）；导出为 `TOKEN`：

```bash
export TOKEN="..."
SESSION_ID="<浏览器里现有 research 对话的 id>"
curl -sS \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=research_agent" \
     | jq '{session_id: .session.session_id, n_entries: (.entries|length), ui: .ui_state, cursor: .cursor, messages_cursor: .messages_cursor}'
```

预期：

- `session_id` 与查询 id 一致；
- `n_entries` ≥ 已发过的轮数 × 2；
- `ui_state.active_content` 反映最后一次右侧面板（stock / screener / macro / daily_report 等）。
- `cursor` / `messages_cursor` 不为 null（除非该 session 0 事件）。

错误路径：

```bash
# 未鉴权 → 401
curl -s -o /dev/null -w "%{http_code}\n" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=research_agent"
# 期望: 401

# 未知 agent_id → 400
curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=foo"
# 期望: 400

# 半截 cursor → 400
curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=research_agent&after_created_at=2026-01-01T00:00:00Z"
# 期望: 400

# 不存在的 session → 200 + 空 shape
curl -sS \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/00000000-0000-4000-8000-000000000000?agent_id=research_agent" \
     | jq '{session, n_entries: (.entries|length)}'
# 期望: {"session": null, "n_entries": 0}
```

### 2.3 Cursor 分页正确性

```bash
# 第一页
curl -sS -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=research_agent&limit=2" \
     | jq '{entries: [.entries[].id], cursor}'
# 假设返回 cursor: {created_at: "...", id: "evt-2"}

CREATED_AT="..."   # 上一页 cursor.created_at
EVT_ID="..."       # 上一页 cursor.id

# 第二页 — 不应包含 evt-2
curl -sS -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/agent-runtime/sessions/$SESSION_ID?agent_id=research_agent&limit=2&after_created_at=$CREATED_AT&after_id=$EVT_ID" \
     | jq '{entries: [.entries[].id]}'
```

预期：第二页里没有 `evt-2`。

## 3 · 本地手测 · 多轮 + 刷新恢复

### 3.1 多轮对话 transcript 落库

操作（浏览器）：

1. 登录测试账号（`voya.technologies@gmail.com` / `123456`）。
2. `/research` 新建对话，问 "高股息蓝筹股有哪些"。
3. 等回答完成。
4. 接着问 "里面市值最大的是哪只"。
5. 再问 "它最近的财报怎么样"。

检查（数据库）：

```bash
cd backend && source venv/bin/activate
python - <<'PY'
import asyncio
from app.features.agent_runtime import db

async def main():
    payload = await db.get_session(
        user_id="<从浏览器 DevTools 复制 user_id>",
        agent_id="research_agent",
        session_id="<刚才那个对话的 conversation_id>",
    )
    print("events:", len(payload["events"]))
    print("entries:", len(payload["entries"]))
    for e in payload["entries"][-6:]:
        print(e["role"], "::", e["content"][:60])

asyncio.run(main())
PY
```

预期：

- `entries` 有 6 条（3 user + 3 assistant）。
- 每条 entry 的 `turn_id` 不重复，`client_event_id` 形如
  `<turn_id>:user_message` / `<turn_id>:assistant_message`。

### 3.2 刷新页面后恢复

仍在那个对话里：

1. **强制刷新页面**（Cmd-Shift-R）。
2. 等对话列表载入，点开刚才那个对话。
3. 观察消息列表是否 3 user + 3 assistant 完整恢复。
4. **再问第四轮**：「按这个思路再给我推 2 只」。
5. 检查模型是否引用前三轮的 ticker / 财报判断。

预期：

- 消息完整、顺序正确。
- 第四轮回答里明确引用前面的股票。
- 右侧面板恢复到第三轮的状态（stock 详情）。

### 3.3 模拟前端 localStorage 被清空

DevTools → Application → Local Storage → 删 `picker:research:*` 之类的本地缓存。
不要登出。刷新页面，重复 3.2 的步骤。

预期：仍然能完整恢复对话。这是 plan §"删除/隐藏前端 localStorage 后仍可继续对话"
的验证点。

### 3.4 模拟同一 turn 重发

在第二轮回答中途，DevTools Network 面板里 abort 当前 `/research/chat/stream`，
然后**用同一个 turn_id 重新发起一次**（最简单：把 SSE 请求 right-click →
"Replay XHR"）。

```bash
# 验证 events 表
python - <<'PY'
import asyncio
from app.features.agent_runtime import db

async def main():
    payload = await db.get_session(
        user_id="...", agent_id="research_agent", session_id="...",
    )
    by_turn = {}
    for e in payload["events"]:
        tid = (e.get("turn_id") or e.get("payload", {}).get("turn_id"))
        if not tid:
            continue
        key = (tid, e["event_type"], e.get("role"))
        by_turn[key] = by_turn.get(key, 0) + 1
    for key, n in by_turn.items():
        if n > 1:
            print("DUP", key, n)
    print("max dup:", max(by_turn.values()))

asyncio.run(main())
PY
```

预期：`max dup: 1`，没有 `DUP` 输出。Unique index 把第二次写吞掉了。

## 4 · 本地手测 · BudgetPlan 截断事件

### 4.1 触发 input_guard 超额

临时把 input_guard 预算压成极小值，然后跑一轮带 prefetched data 的 KOL 对话：

```bash
export AGENT_RUNTIME_BUDGET_INPUT_GUARD=200
uvicorn app.main:app --reload
```

在 `/research` KOL 模式（qinbafrank）问 "怎么看 NVDA 当前估值"。

完成后查 events：

```python
python - <<'PY'
import asyncio
from app.features.agent_runtime import db

async def main():
    p = await db.get_session(user_id="...", agent_id="kol_research_agent", session_id="...")
    for e in p["events"]:
        if e["event_type"] == "context_budget_truncated":
            print(e["payload"])
            return
    print("no truncation event")

asyncio.run(main())
PY
```

预期：看到 `context_budget_truncated` event，`payload.sections.input_guard.actual >
payload.sections.input_guard.limit`。

记得恢复环境变量：`unset AGENT_RUNTIME_BUDGET_INPUT_GUARD`。

## 5 · 本地手测 · session_exists 短路 picker（影子历史防护）

模拟 "新建 runtime session + 同 id 有旧 picker 数据" 的迁移期场景：

```python
python - <<'PY'
import asyncio
from app.features.agent_runtime.session_store import HybridSessionStore
from app.features.agent_runtime.models import AgentRunRequest, SessionSnapshot, TranscriptEntry

class ExistsButEmpty:
    async def load_session(self, req):
        return SessionSnapshot(
            session_id=req.session_id, agent_id=req.agent_id, user_id=req.user_id,
            transcript=[],
            metadata={"session_exists": True, "source": "agent_sessions_empty", "persistable": True},
        )
    async def append_entries(self, s, e):
        return True

class GhostPicker:
    async def load_session(self, req):
        return SessionSnapshot(
            session_id=req.session_id, agent_id=req.agent_id, user_id=req.user_id,
            transcript=[TranscriptEntry(role="user", content="OLD")],
            metadata={"source": "picker_conversations"},
        )
    async def append_entries(self, s, e):
        return None

async def main():
    from app.features.agent_runtime.session_store import InMemorySessionStore
    store = HybridSessionStore(primary=ExistsButEmpty(), picker=GhostPicker(), fallback=InMemorySessionStore())
    snap = await store.load_session(AgentRunRequest(agent_id="research_agent", user_id="u", session_id="s", message="?"))
    print("source:", snap.metadata["source"])
    print("transcript:", snap.chat_history())

asyncio.run(main())
PY
```

预期输出：

```
source: agent_sessions_empty
transcript: []
```

即使 picker 有旧消息，新 session 也不读它。

## 6 · Feature flag 灰度

| 灰度组合 | 期望行为 | 验证步骤 |
|---|---|---|
| `NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY=true` + `AGENT_RUNTIME_REQUEST_HISTORY=fallback`（默认） | 前端发 history，后端优先 session，session 空时回退 history | 跑 §3 流程，无视行为差异 |
| `NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY=true` + `AGENT_RUNTIME_REQUEST_HISTORY=primary` | 前端发 history，后端忽略它（session 空时也不回退） | DevTools 阻断 agent-sessions Edge Function 接口（mock 500），刷新后发新一轮，模型应该看不到前几轮 history |
| `NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY=false` + `AGENT_RUNTIME_REQUEST_HISTORY=primary` | 前端完全不发 history，后端只信 session | 跑 §3，应当正常工作；DevTools Network 面板里 `/research/chat/stream` payload 不应包含 `history` 字段 |
| `AGENT_RUNTIME_REQUEST_HISTORY=disabled` | 后端在 runtime 边界就 drop 掉 history | 跟 primary 行为应当一致；用日志确认 `_request_history_for_runtime` 返回 `[]` |

切档操作：

```bash
# backend
echo "AGENT_RUNTIME_REQUEST_HISTORY=primary" >> backend/.env
# 重启 uvicorn

# frontend
echo "NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY=false" >> frontend/.env.local
# 重启 npm run dev
```

## 7 · Playwright e2e

`frontend/tests/e2e/` 目录下需要新增 `research-runtime-restore.spec.ts`，
覆盖 plan §验证命令里的四个 case：

```ts
import { test, expect } from '@playwright/test';

test('research runtime restore round trip', async ({ page, context }) => {
  await page.goto('/research');
  // 假设已通过 storageState 完成登录

  // 第一轮
  await page.getByPlaceholder(/和投研助手聊聊/).fill('帮我找高股息蓝筹');
  await page.keyboard.press('Enter');
  await page.waitForResponse(r => r.url().includes('/api/research/chat/stream'));

  // 第二轮
  await page.getByPlaceholder(/和投研助手聊聊/).fill('里面市值最大的是哪只');
  await page.keyboard.press('Enter');
  await page.waitForResponse(r => r.url().includes('/api/research/chat/stream'));

  // 强制刷新
  await page.reload();
  const sidebar = page.getByTestId('research-sidebar');
  await sidebar.locator('text=高股息').first().click();

  // 第三轮 — 应该能引用前两轮
  await page.getByPlaceholder(/和投研助手聊聊/).fill('它的财报怎么样');
  await page.keyboard.press('Enter');
  const resp = await page.waitForResponse(r => r.url().includes('/api/research/chat/stream'));

  // 确认 runtime restore 命中
  const sessions = await page.waitForRequest(r => r.url().includes('/api/agent-runtime/sessions/'));
  expect(sessions.url()).toContain('agent_id=research_agent');

  // 确认 message 列表里能看到三轮内容
  const messages = page.getByTestId('research-message');
  await expect(messages).toHaveCount(6); // 3 user + 3 assistant
});

test('clearing localStorage does not break restore', async ({ page, context }) => {
  await page.goto('/research');
  // 先做两轮
  // ...
  await context.clearCookies();    // 保留 jwt 看具体实现
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // 点开同一对话，应该能恢复
});
```

跑：

```bash
cd frontend
npm run test:e2e -- --grep "research runtime"
```

预期：两个 case 全部 pass。

## 8 · 生产 / staging 观测指标

Plan §Milestone A 列出的指标，落地到 dashboard / log query：

| 指标 | 数据源 | 查询 |
|---|---|---|
| runtime restore hit rate | `app.main` 日志 + `app.features.agent_runtime` info | `count_over_time({sourceFromTag="runtime"} \|= "source=agent_sessions" [1d]) / count_over_time(... [1d])` |
| picker fallback hit rate | 同上 | `... \|= "source=picker_conversations" / total` |
| event append failure rate | `agent runtime primary session append failed` log | `count_over_time({...} \|= "primary session append failed" [1h])` |
| duplicate event conflict | Insforge / Postgres slow query 日志 | `count_over_time({db="insforge"} \|~ "duplicate key value violates unique constraint .*agent_session_events.*" [1d])` |
| average context chars | events.payload.char_count | `histogram_quantile(0.95, sum by (le) (rate(agent_context_chars_bucket[5m])))` 若有 metric；或离线查 `agent_session_events.payload.char_count` |
| truncated turns | `context_budget_truncated` event | `select count(*) from agent_session_events where event_type='context_budget_truncated' and created_at > now() - interval '1 day'` |

建议在 Grafana / Insforge dashboards 加一行 panel：

- "Runtime restore vs picker" 双线 stacked area。
- "Daily duplicate event conflict" 单值。
- "Truncated turns (24h)" 单值。

## 9 · Sanity checklist （上线前最后过一遍）

- [ ] `pytest -q` 全过。
- [ ] `npm run lint && npm run build && npx tsc --noEmit` 干净。
- [ ] `curl /api/agent-runtime/sessions/<id>?agent_id=research_agent` 在本地能返回完整 shape。
- [ ] §3.2 刷新恢复手测通过。
- [ ] §3.4 同 turn 重发不写重复 message。
- [ ] §4 truncation 触发后写了 `context_budget_truncated` event。
- [ ] §5 session_exists 短路确认。
- [ ] §6 灰度档位中 `primary` 真切断 history。
- [ ] Edge Function 已重新部署（`insforge functions deploy agent-sessions` 等同的命令）。
- [ ] Migration 已应用（`u4a_agent_runtime_schema.sql` 在 prod schema 里）。
- [ ] `.context.md` 与代码状态一致。
- [ ] 观测面板新增了 §8 的指标。

完成上面所有项之后，Phase 1 才算真正可灰度上线。Phase 2 / 3 在独立的 plan
文档里推进。
