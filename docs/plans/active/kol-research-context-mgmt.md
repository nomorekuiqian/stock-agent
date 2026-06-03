# KOL Research Agent · Context 管理与多轮可靠性

## 背景

`features/kol_research` agent 在用户连续聊 3-6 轮后频繁失效，前端显示"出错了请再试"。
排查 `agent.py` / `input_guard.py` / `_build_prompt` / 前端 `buildCompactHistory` 后，
根因是 prompt 每轮线性膨胀，撞 Gemini 单次 context 上限：

1. `_build_prompt` 把 `history[-12:]`、`content_context`、`input_guard.prompt_section`
   全部拼进单条 user message
2. `input_guard.build_input_guard_context` 每轮重新跑 `get_stock_brief` /
   `get_macro_brief`，把完整 brief JSON（截断阈值高达 12000 字符 ≈ 3-4K token）
   塞进 prompt
3. history 里 assistant 回答 800-1500 字 × N 轮线性增长
4. agent 在 LLM 视角下又会重新 call `search_kol_tweets`，召回 chunks 再次塞进
   context

失效呈现为 `code=context_too_long` / `agent_timeout`，被前端 `getAgentErrorMessage`
统一映射为"AI 助手出了点问题"。

## 成熟方案分层

| 层 | 内容 | 缓存策略 |
|---|---|---|
| Static instruction | 角色、tool rules、output schema | Gemini implicit cache |
| Conversation state | history 轮次 | sliding window + summary |
| Per-turn ephemeral | 本轮 user question + 新拉数据 | 不缓存，下轮丢 |

四个工业级模式：
- **分层 context** — instruction 永不变；history 可压缩；本轮数据用完即弃
- **Sliding window + 摘要折叠** — 老轮次异步压成一段，新轮次保原文
- **Tool result memoization** — 同 args 5 min 内复用上次结果
- **Just-in-time retrieval** — 不预注入 data 本体；agent 按需调 tool，结果走 tool channel 不入 history

## 落地计划

### Phase 1 · 立即止血（已完成）

- [x] **P1.1 input_guard prefetch 加 TTL cache** — module-level
  `_PREFETCH_CACHE`，key=(tool, args)，TTL 300s。
- [x] **P1.2 prompt_section 瘦身** — 阈值 12000 → 3500；`_slim_brief_payload`
  截短长字符串、限制列表条数、剥嵌套大对象。
- [x] **P1.3 多轮跳过 prefetch 注入** — `_symbols_in_history` 检测老话题；
  history ≥ 2 轮且 symbol 已讨论过时只传 parsed hint，不再 dump data body。
- [x] `build_input_guard_context` 接受 `history` 参数；`agent.py` 两处调用透传。

### Phase 2 · 多轮 tool dedup（已完成）

- [x] **P2.1 + P2.2 conversation-scoped tool result cache** — `agent.py` 加
  `_active_conversation_id` contextvar + module-level `_TOOL_RESULT_CACHE`，
  key = `(conversation_id, tool, args_hash)`，TTL 300s。
  `_before_tool_callback` 命中直接 short-circuit + 发 SSE `tool_call_start`/
  `end` 并标注"命中缓存"；`_after_tool_callback` 把 cacheable tool 结果存进
  cache。覆盖 `get_stock_brief` / `get_peer_brief` / `get_macro_brief` /
  `get_industry_brief` / `get_technical_analysis` / `get_report_by_date` /
  `list_recent_reports` / `search_kol_tweets`。
- [x] 前端 `KolResearchRequest` 新增 `conversation_id`，由
  `latestStateRef.current.conversationId` 填充，并打通 backend
  `KolResearchRequest` + router + `answer_kol_research` / `stream_kol_research`。
- [x] **P2.3 自动 retry on context_too_long** — `stream_kol_research` 出错路径
  专门拦截 `context_too_long`：丢到只剩最后 2 轮 history + `history_keep=2`
  重建 prompt 跑一次；retry 仍失败时上报"请新建对话"。其他错误码不 retry。

### Phase 3 · history 体积控制（部分完成）

- [x] **P3.3 token budget guard (char-level proxy)** — `_build_prompt` 加
  `_PROMPT_CHAR_SOFT_LIMIT = 60000`（≈ 15K token），超阈值时从最老一轮
  开始丢，保证至少保留最后 4 轮；日志 `kol prompt history truncated:
  kept=X dropped=Y`。比 `count_tokens` 的 SDK 调用便宜，足够当 emergency guard。
- [ ] **P3.1 后台 summarizer** — 推迟。理由：需要新的 LLM 调用路径 +
  新失败模式 + 增加首轮延迟。在 Phase 2 cache + Phase 3.3 truncation
  上线后看真实失败率再决定。
- [ ] **P3.2 前端 conversationSummary state** — 同上推迟，依赖 P3.1。

### Phase 4 · 重构成熟方案（单独立项，未排期）

> 当前 Phase 1+2+3.3 已覆盖 90%+ 案例，Phase 4 是中期重构而不是 bug fix。
> 等当前修复上线后看真实失败率再决定是否启动。

- [ ] **P4.1 复用 ADK SessionService** — 把 `InMemoryRunner` 换成持久化
  `DatabaseSessionService`，`session_id` 落 picker-conversations 表。
  好处：不再每轮重发 full history，LLM 自己管 KV cache。
  代价：DB schema 调整、跨 deploy session 一致性、已有对话迁移。
- [ ] **P4.2 Conversation memory 抽层** — 从 history 抽 facts / entities /
  goals 三类 lightweight memory 替代原始 history。需要新 memory feature、
  跨 agent 共享。
- [ ] **P4.3 Streaming 断线续传** — server-side resume token + frontend
  reconnect。涉及 SSE 协议升级，前后端联调。

## 验证

```bash
# 1. 单测
cd backend && source venv/bin/activate
pytest tests/test_kol_research_input_guard.py tests/test_kol_research_eval.py -q

# 2. 本地连续多轮跑 — 监控日志
tail -f /tmp/uvicorn-frank.log | grep -E "kol chat|truncated"
# 期望:
# - 连续 8-10 轮无 code=context_too_long / agent_timeout
# - 第二轮起同 ticker 看到 tool_call_start 描述带"命中缓存"
# - 极端长 history 出现 "kol prompt history truncated"
# - 即便 retry 触发也是单次 retry 后恢复, 而不是直接报错
```

## 失败信号

- 前端 console `[KOL Research] backend error event: code=context_too_long`
- 后端 `kol chat failed: ... code=context_too_long` 且 retry 也失败
  → 升级 Phase 3.1/3.2 summarizer
- 后端 `kol chat timeout: ... elapsed=120.xs`
  → 收紧 cache 覆盖范围或调小 `_MAX_KOL_TWEET_SEARCH_PER_TURN`
