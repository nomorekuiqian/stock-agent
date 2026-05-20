# /for-you 改进 · 实施 Checkpoint

> **用途**：跨 session 交接锚点。每个里程碑完成后更新本文件。
> **读法**：未来 session 从这里判断"做到哪、下一步做什么、有什么没解决的坑"，不需要回溯聊天。
> **写法**：只记**对后续决策有影响**的事实；代码细节读 commit 和 .context.md。

---

## 当前状态总览

- **Branch**: `claude/improve-exclusive-page-d7FMx`
- **阶段**: 灰度测试中（feature-flags 框架 + V1/V2 分割已上线）
- **测试**: 后端 71+ tests pass（scoring + cash guard + historical）/ 前端 tsc clean
- **下一步**: 开发者执行剩余 Operator Actions（见下方），然后 E2E 验收

## 阶段划分

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 · 数据地基 (U0-A) | ✅ 完成 + 已部署 | M1-M5, 2026-04-22 |
| P1 · 智能层 (U0-B/C + U1-A/B/C) | ✅ 代码完成 | 2026-04-23, 需 Insforge 部署 |
| Feature Flags 灰度框架 | ✅ 完成 + 已部署 | `feature_flags` 表 + EF 已在 Insforge |
| 外部审计修复 (7 项) | ✅ 代码完成 | 2026-04-23, Fix 4 需 Insforge 部署 |
| P2 · Copilot 层 | ⏳ 未开始 | P1 验证后启动 |

## 需要开发者执行的操作

### 已完成 ✅

| 操作 | 完成日期 |
|------|----------|
| U0-A 建表 (`user_portfolios` + `user_investment_profiles`) | 2026-04-22 |
| `portfolio` Edge Function 部署 | 2026-04-22 |
| `feature_flags` 建表 | 2026-04-23 |
| `feature-flags` Edge Function 部署 | 2026-04-23 |
| 测试用户 `for_you_v2` flag 启用 | 2026-04-23 |

### 待执行 ⏳

| # | 操作 | 命令 | 回滚 |
|---|------|------|------|
| 1 | U1-B 建表 | `npx @insforge/cli db query --file backend/migrations/u1b_health_schema.sql` | `DROP TABLE portfolio_health_reports, portfolio_insights;` |
| 2 | U1-B UNIQUE 约束 | `npx @insforge/cli db query --file backend/migrations/u1b_health_add_unique.sql` | `ALTER TABLE portfolio_health_reports DROP CONSTRAINT health_reports_user_cache_key_unique;` |
| 3 | `portfolio-health` EF 部署 | `npx @insforge/cli functions deploy portfolio-health --file backend/app/edge_functions/portfolio-health.js` | Dashboard 删除 function |
| 4 | U1-C 建表 | `npx @insforge/cli db query --file backend/migrations/u1c_memory_schema.sql` | `DROP TABLE ai_feedback, suggestion_tracking;` |
| 5 | `memory` EF 部署 | `npx @insforge/cli functions deploy memory --file backend/app/edge_functions/memory.js` | Dashboard 删除 function |

执行顺序：1 → 2 → 3 → 4 → 5（串行，每步验证后再下一步）。

## 里程碑进度

| Milestone | 范围 | 状态 | 完成日期 |
|---|---|---|---|
| M1-M5 | U0-A 数据地基 + UX 改造 | ✅ 完成 + 已部署 | 2026-04-22 |
| P1 Units | U0-B/C + U1-A/B/C（Action Bar + 通知 + 事件 + 体检 + 记忆） | ✅ 代码完成 | 2026-04-23 |
| Feature Flags | V1/V2 灰度框架 + Navbar/MobileMenu 集成 | ✅ 完成 + 已部署 | 2026-04-23 |
| 审计修复 | 7 项 (P0×2 + P1×1 + P2×2 + P3×2) | ✅ 代码完成 | 2026-04-23 |

## M1 详情

**范围**：
- A1 · Insforge 建表（含 `portfolio_confirmed_at`）
- A2 · `backend/app/features/portfolio/` 模块 + 7 端点
- A3 · `compute_effective_weights()` 纯函数 + 单测
- A10s · `shared/data_tools/_cash_guard.py` 骨架 + 接入批量接口
- A11s · 老用户 `portfolio_confirmed_at` 回填 SQL

**交付物清单**：
- [ ] `backend/migrations/u0a_portfolio_schema.sql`（对 Insforge Postgres 幂等 DDL）
- [ ] `backend/app/features/portfolio/`（`.context.md` / `models.py` / `db.py` / `service.py` / `router.py` / `__init__.py`）
- [ ] `backend/app/shared/data_tools/_cash_guard.py`
- [ ] `backend/app/shared/data_tools/` 批量接口接入点（price / returns / profiles）
- [ ] `backend/tests/test_portfolio_service.py` + `test_cash_guard.py`
- [ ] `backend/app/main.py` 注册 portfolio router
- [ ] `docs/plans/for-you/operator-handbook.md`（手动操作指南）
- [ ] code-review subagent 报告（保存于 checkpoint 附录）

**M1 验收**（实际状态）：
- ✅ 后端 `pytest tests/test_portfolio_service.py tests/test_cash_guard.py tests/test_architecture.py` → **51 passed**（含 24 个新增 + 架构契约 + 数据网关 + 注入攻防回归）
- ✅ 全 unit 套件 **1037 passed**，1 pre-existing failure（`test_funnel_unit.py::test_trial_day_calculation`，UTC 边界 flake，与 M1 无关，main 上同样失败）
- ✅ Code-review subagent 出 1 个 Med 安全漏洞（symbol 注入风险），已就地修复（`models.py` 新增 `_SYMBOL_RE` 正则 + 5 个攻防测试）
- ✅ Operator 部署完成（2026-04-22）：
  - Schema: `user_portfolios` + `user_investment_profiles` 已建（表名改名：原 `user_profiles` 与 CRM 表冲突，改为 `user_investment_profiles`）
  - Edge Function: `portfolio` 已 deploy，7 个 action 全部通过 curl 冒烟（list/bulk/patch/delete/touch/profile/upsert_profile）
  - RLS: 已 DISABLE（与其他 EF 对齐，暂不加安全层）
  - 测试数据已清理（test_user_999）
  - 后端联调（Step 3）跳过，直接进入 M2

**已修复的 review 发现**：
1. [Med] `models.py:_SYMBOL_RE` 正则锁死 symbol 字符集 `[\$A-Z0-9.\-]{1,16}`，防 PostgREST `not.in.(...)` 注入
2. [Med] `db.py::touch_portfolio` 加 `isinstance(iso, str)` 防 EF 返回非字符串崩溃
3. [Low] `portfolio.js` bulk 路径改为 "先 upsert 后 delete"，partial failure 退化为"多余行"而非"丢数据"
4. [Risk] `db.py::get_profile` EF 失败时 `logger.warning` 显式告警，不再静默吞 outage

**未做的 review 建议**（留给后续 milestone 视情况采纳）：
- A6 (frontend) 时考虑加 FastAPI TestClient 的 7 路径集成测试
- CI grep `from app.services` / `from app.models` 防 DEAD 区误 import（架构测试已覆盖大部分）
- `weight_source` Literal 提取到 `models.py` 命名别名（U1-B 用得上时再做）

## 未决事项（对后续 session 重要）

1. ~~**Insforge API key 当前失效**~~：已解决。`insforge login` 后 CLI 正常工作。
2. **Schema 实现方式**：M1 选择用 **SQL migration 文件 + `insforge db query`**（或 admin 控制台粘贴）而非 JS Edge Function。原因：DDL 只需一次执行，Edge Function 适合运行期 CRUD 但 schema 创建用 Edge Function 反而要写一堆脚手架。未来 CRUD 是走 Insforge Service Key 直连 PostgREST 还是新建 Edge Function？**M1 采用 `httpx` + PostgREST 直连**（复用现有 `get_insforge_service()` 模式，和 `feedback/db.py` 一致）；如果 RLS 策略强制要求所有 per-user 写入走 Edge Function，M1 完成前 review 要 flag。
3. **DEAD 区约束**：`backend/app/services/` 和 `backend/app/models/` 禁止 import（CLAUDE.md 规则 2）。新建 `features/portfolio/models.py` 不会跟 DEAD 的 `backend/app/models/` 冲突，但 import 路径务必是 `from app.features.portfolio.models import ...`。
4. **不要 push**：CLAUDE.md 规则 1 明令不自动 git push；每个里程碑 commit 后等用户手动 push。

## 历史里程碑

### M1 · 数据地基（代码完成 2026-04-22 · 待 operator 部署）

- **Commits**: `97c5713` (worktree branch `claude/u0a-foundation`，未 push 到 remote)
- **交付清单**：
  - `backend/migrations/u0a_portfolio_schema.sql`（user_portfolios + user_investment_profiles + 触发器 + R-2 回填）
  - `backend/app/edge_functions/portfolio.js`（7 个 action：list/bulk/patch/delete/touch/profile/upsert_profile）
  - `backend/app/features/portfolio/`（.context.md / models.py / db.py / service.py / router.py / __init__.py）
  - `backend/app/shared/data_tools/_cash_guard.py` + 接入 `quotes.py::get_batch_quotes` + `fundamentals.py::get_company_profile`
  - `backend/tests/test_portfolio_service.py`（24 个用例）+ `test_cash_guard.py`（24 个用例）
  - `backend/app/main.py` 注册 `portfolio_router`
- **Operator 操作已完成**（2026-04-22）：
  - [x] `insforge login`（刷新 API key）
  - [x] `insforge db query --file backend/migrations/u0a_portfolio_schema.sql`（表名改为 `user_investment_profiles` 避免与 CRM `user_profiles` 冲突）
  - [x] `insforge functions deploy portfolio --file backend/app/edge_functions/portfolio.js`
  - [x] 7 action curl 冒烟全通过
  - [ ] 后端联调 Step 3（跳过，进入 M2）
- **Code-review 结论**：见 §附录 A
- **下个 milestone 需要 follow-up**：
  - M2 (`inject_profile`) 接入点：`backend/app/features/brew/agent.py` + 同模式 research agent
  - M3 (frontend) 7 端点已就绪，前端 hooks 直接对接 `/api/portfolio*` 和 `/api/profile`
  - M4 (`exposure_parser` + ETF 穿透) 沿用 `_cash_guard.CASH_SYMBOL` 常量，避免硬编码 `"$CASH"` 字面量

### M2 · Agent 画像注入（完成 2026-04-22）

**范围**：A4 · `shared/profile_context.py::inject_profile()` + brew / stock agent 接入

**交付物**：
- `backend/app/shared/profile_context.py` — `inject_profile(instruction, profile)` 纯函数，3 种风格 × 3 种期限 × 3 种风险容忍的中文标签映射
- `backend/app/features/brew/agent.py` — `PersonalDigest.generate()` 增加 Step 4.6 获取用户画像，profile header 注入到 user message
- `backend/app/features/stock/agent.py` — `StockAnalysisAgent.analyze()` 接受可选 `profile` 参数，注入到 prompt
- `backend/tests/test_profile_context.py` — 9 个测试用例全通过
- 55/55 U0-A 相关测试全绿（含 M1 回归）

**设计决策**：
- 画像通过 user message（而非修改 LlmAgent.instruction）注入，因为 ADK `LlmAgent.instruction` 在实例化时固定，动态注入需要走消息层
- stock agent 的 `profile` 参数为 Optional，当前 router 不传（公开接口无 user_id），未来登录用户的个性化分析可以传入

### M3 · 前端 Onboarding & 持仓 UI（完成 2026-04-22）

**范围**：A5 + A6 + A7 + A8

**交付物**：
- `frontend/src/lib/api.ts` — 新增 `api.portfolio.*`（get/bulkSave/touch/patch/delete）+ `api.investmentProfile.*`（get/save）+ 完整 TS 类型
- `frontend/src/hooks/queries/query-keys.ts` — 新增 `portfolio` + `investmentProfile` query key factories
- `frontend/src/hooks/queries/use-portfolio.ts` — `usePortfolio` / `useSavePortfolio` / `useDeleteHolding` / `useTouchPortfolio` / `useInvestmentProfile` / `useSaveInvestmentProfile` TanStack Query hooks
- `frontend/src/app/for-you/onboarding/page.tsx` — 3-step onboarding（style → risk → optional stocks），URL state `?step=1|2|3`，parallel save profile + portfolio on completion
- `frontend/src/app/for-you/portfolio/page.tsx` — 持仓编辑器，slider 权重，stock search，save/delete，empty state
- `frontend/src/app/for-you/_components/ForYouContent.tsx` — 改造：useInvestmentProfile 集成、needsOnboarding 基于 `profile.onboarded_at`、toolbar "管理持仓" → `/for-you/portfolio`、empty state CTA → `/for-you/onboarding`
- shadcn/ui 新增组件：RadioGroup、Slider、Progress
- `npx tsc --noEmit` 全通过，`npm run build` 全通过

### M4 · 业务收尾（完成 2026-04-22）

**范围**：A10u + A12（A9 E2E 需人工验证）

**交付物**：
- `backend/app/features/portfolio/exposure_parser.py` — `ETF_SECTOR_MAP`（40+ ETF 静态分解）+ `get_true_exposure()` 纯函数
- `backend/tests/test_exposure_parser.py` — 10 个测试全通过
- 65/65 后端 U0-A 相关测试全绿

**A9 待人工验证**：
- [ ] 启动前端 dev server，用测试账号走完 onboarding 3 步
- [ ] 在 portfolio editor 添加/删除/调整权重并保存
- [ ] 返回 /for-you 确认 digest 基于新持仓生成
- [ ] 检查 $CASH 符号在 UI 中无异常（不显示涨跌幅等）

### M5 · UX 改造：模拟金额 + 导航 + Paywall（完成 2026-04-22）

**范围**：Portfolio 录入从百分比 slider → 模拟金额输入 + 导航重构 + Paywall + 多币种

**后端交付物**：
- `service.py` — Mode 1.5 (cost_basis 金额比例), 优先级 shares×price > cost_basis > weight_pct > equal
- `models.py` — `weight_source` Literal 加 `"cost_basis"`
- `router.py` — 4 个写入端点加 `has_entitlement` check（临时用 `watchlist_extended`）
- `entitlements.py` — `MAX_ONLY_FEATURES` 加 `portfolio_management`
- `test_portfolio_service.py` — 7 个 Mode 1.5 新测试（29→72 总测试全绿）

**前端交付物**：
- `portfolio/page.tsx` — 全部重写: Slider→金额输入, 币种标签(USD/JPY/HKD), 分币种 subtotal
- `onboarding/page.tsx` — Step 3 每只股票可选金额输入, 完成时 save portfolio (Max only, silent fail)
- `lib/currency.ts` — `getCurrency(symbol)` 工具函数
- `Navbar.tsx` — "专属" 可点击→/for-you + dropdown 三选项 + `href` prop
- `MobileMenu.tsx` — 同步更新导航项
- `ForYouContent.tsx` — "MyBrew · 专属" 标题, toolbar 分层 (锁图标), `useSubscription`
- `watchlist/page.tsx` — 标题 "管理持仓"→"关注列表"
- `api.ts` — `weight_source` 加 `'cost_basis'`

**验证**：`tsc --noEmit` ✅ / `npm run build` ✅ / 72/72 backend tests ✅

**设计决策**：
- 复用 `cost_basis` DB 列 = 无 migration
- 跨币种不换算汇率（近似比例，够用）
- 后端 entitlement 临时用 `watchlist_extended`，待 Stripe 配置 `portfolio_management` 后切换

**Code review 修复**（2026-04-22）：
1. [Critical→Fixed] Onboarding 用 `savePortfolio` 保存 watchlist → 改用 `api.watchlist.save()`
2. [Important→Fixed] Onboarding 金额输入不取整 → 加 `Math.max(0, Math.round())`
3. [Important→Fixed] Mode 2 (weight_pct) 缺少 rounding gap 修正 → 补齐
4. [Documented] 后端 entitlement 临时用 `watchlist_extended`（Pro 级别），前端 `requiredPlan="max"` 为主要门控

**后续追加**：
- Portfolio 页增加 $CASH 快捷添加按钮（搜索栏上方）
- Nice-to-have 清单独立文件：`docs/plans/for-you/nice-to-have.md`

## 附录 A · Code-review 报告存档

### M1 · 2026-04-22 · superpowers:code-reviewer subagent

**Verdict**: Mostly matches design, 1 Med bug + 5 minor items. Sign-off: "Fix bug #4 first" → 已修复后重测全绿。

**Bugs (按严重度)**:
1. [Med→Fixed] `portfolio.js:79` SQL injection via interpolated symbols in `not.in.(...)` filter — 修复：`models.py` 加 `_SYMBOL_RE = ^[\$A-Z0-9.\-]{1,16}$` + 5 个攻防 test
2. [Med→Fixed] `db.py:touch_portfolio` 未做 `isinstance(iso, str)` 校验，EF 返回非字符串会 AttributeError — 修复：包装 isinstance 守卫
3. [Med] PATCH `/portfolio/{symbol}` 校验路径与 DELETE `/portfolio/{symbol}` 校验略不一致（DELETE 直接 `.upper()`，PATCH 走 HoldingInput validator）。Reviewer 认为不破，未修
4. [Low→Fixed] bulk 顺序非原子 — 修复：`portfolio.js` 改为先 upsert 后 delete，partial failure 退化为多余行
5. [Low] `portfolio.js:208` `onboarded_at` 在每次 upsert 时 COALESCE，符合 LLD 意图，未改

**Risks/smells (5 项)**:
- `weight_pct=0` 与 `weight_pct=null` 等价但语义易混淆（reviewer 建议文档化，未代码改）
- `service.py:notional[i]` 索引耦合 `inputs[i]`，扩展时小心（未改）
- `db.py::get_profile` EF 失败时静默回默认 — **已加 logger.warning**
- `portfolio.js` 用 ANON_KEY 而非 SERVICE_KEY；未来加 RLS 时需切换（已在 `.context.md` 注明"无 RLS"约束）
- `cash_returns(n)` 用 `max(0,n)` 静默吞负数（未改，调用方都传正整数）

**Suggestions (5 项)**:
- 已采纳：bug #4 的 regex 修复
- 未采纳但记录：FastAPI TestClient 集成测、CI grep DEAD 区、`weight_source` Literal 别名抽离 — 留给 M3/M4 视情况

**最终验证**: 51 tests passed (worktree-only)；1037/1038 unit suite passed (1 pre-existing flake)。

---

## P0/P1 第二批 · U0-B + U0-C + U1-A + U1-B + U1-C（代码完成 2026-04-23）

### U1-A · 事件整合（完成）

**交付物**：
- `backend/app/features/brew/macro_map.py` — 30 条宏观事件→板块映射 + `match_macro_key()` 关键词匹配
- `backend/app/features/brew/event_selector.py` — `select_top_event()` 纯函数 + `TopEvent` Pydantic 模型
- `backend/app/features/brew/models.py` — `DigestResponse.top_event` 新字段（Optional，向后兼容）
- `backend/app/features/brew/router.py` — `_compute_top_event()` 辅助函数注入到 digest 响应
- 93 个新测试全通过（34 event_selector + 59 macro_map）

### U0-B · Action Bar（完成）

**后端交付物**：
- `backend/app/features/for_you/` — 新 feature module（models / templates / service / router）
- `GET /api/for-you/action-bar` — 三态 ActionBar 端点（green/yellow/red）
- `compute_max_drag()` — 双阈值大跌检测（整体+单票拖累）
- 规则引擎：drawdown → health → event → staleness → stable 优先级
- V1 使用 templates（跳过 LLM polish，`source` 字段支持未来 LLM）
- 56 个新测试全通过

**前端交付物**：
- `frontend/src/components/for-you/ActionBar.tsx` — 三态组件 + ActionChipButton
- `frontend/src/hooks/queries/use-action-bar.ts` — TanStack Query hook
- `frontend/src/lib/api.ts` — `ActionBarResponse` 类型 + `api.forYou.getActionBar()`
- ForYouContent 顶部集成 ActionBar

### U0-C · 通知偏好（完成）

**后端交付物**：
- `backend/app/features/notification/preferences.py` — `should_send_to()` 过滤函数（3×4 mode×channel 矩阵）
- `backend/app/features/notification/event_day.py` — `is_event_day_for()` 复用 ActionBar 判定
- R-2: 90 天过期强制静默
- 19 个新测试全通过

**前端交付物**：
- `frontend/src/app/settings/page.tsx` — 邮件通知偏好设置页（静默/事件触发/每日）

### U1-B · 持仓体检（完成）

**后端交付物**：
- `backend/app/features/portfolio_health/` — 新 feature module
- `scoring.py` — 4 维纯函数（分散度/表现/宏观适配/稳定性，各 0-25）
- `agent.py` — DiagnosisAgent（gemini-3.1-flash-lite-preview）+ lint 校验
- `POST /api/portfolio-health` + `GET /api/portfolio-health/latest`
- **注意**: 路径从 `/api/portfolio/health` 改为 `/api/portfolio-health`（避免与 `PATCH /api/portfolio/{symbol}` 路由冲突）
- `backend/migrations/u1b_health_schema.sql` — `portfolio_health_reports` + `portfolio_insights` 建表 DDL
- `backend/app/edge_functions/portfolio-health.js` — Edge Function（待部署）
- 39 个新测试全通过

**前端交付物**：
- `frontend/src/app/for-you/health/page.tsx` — 体检页（4 维评分卡 + AI 诊断 + 状态机）
- `frontend/src/hooks/queries/use-health.ts` — TanStack Query hooks
- ForYouContent toolbar 增加"持仓体检"导航

### U1-C · 记忆/反馈（完成）

**后端交付物**：
- `backend/app/features/memory/` — 新 feature module
- `POST /api/feedback` — 👍/👎 反馈端点
- `GET /api/suggestion-tracking/recent` — 建议追踪
- `service.py` — `get_user_memory()` 聚合函数（thesis + feedback + tracking → ≤1050 token）
- `outcome.py` — `compute_outcome()` T+7 方向判定纯函数
- `backend/migrations/u1c_memory_schema.sql` — `ai_feedback` + `suggestion_tracking` 建表 DDL
- `backend/app/edge_functions/memory.js` — Edge Function（待部署）
- 43 个新测试全通过

**前端交付物**：
- `frontend/src/components/memory/FeedbackBar.tsx` — 👍/👎 反馈组件
- `frontend/src/components/memory/QuickThesisInput.tsx` — 轻量 thesis 输入
- `frontend/src/hooks/queries/use-feedback.ts` — TanStack mutation hook
- Health page DiagnosisPanel 集成 FeedbackBar

### 测试汇总

- 后端: **1323 passed**, 3 skipped, 0 failures（排除 e2e）
- 前端: `npx next build` 编译成功，所有 45 页面生成通过
- 架构测试: 5/5 通过（新增 cross-feature 对已注册）

### 需要人工操作（Hard Blockers）

1. **U1-B Insforge 建表**: 
   - 运行 `insforge db query --file backend/migrations/u1b_health_schema.sql`
   - 部署 `insforge functions deploy portfolio-health --file backend/app/edge_functions/portfolio-health.js`
2. **U1-C Insforge 建表**: 
   - 运行 `insforge db query --file backend/migrations/u1c_memory_schema.sql`
   - 部署 `insforge functions deploy memory --file backend/app/edge_functions/memory.js`
3. 两个操作前，U1-B/U1-C 的 DB 层会 graceful degrade（返回 None/空），不会崩溃

### 人工验证 Checklist

启动前后端后验证：
- [ ] `/for-you` 页面顶部出现 ActionBar（绿态："组合今日涨/跌 X%，没有需要关注的事"）
- [ ] 点击 ActionBar chip 能正确跳转
- [ ] `/for-you/health` 页面显示"生成我的第一份体检"按钮
- [ ] 点击生成后显示 4 维评分 + AI 诊断（需 GOOGLE_API_KEY）
- [ ] `/settings` 页面可以切换通知偏好（静默/事件触发/每日）
- [ ] Health 页 DiagnosisPanel 底部有 👍/👎 图标
- [ ] Digest 生成时 `top_event` 字段有值（如果持仓中有近期财报的股票）
- [ ] ActionBar 在持仓 60+ 天未更新时显示黄态 staleness 提示

### 审计修复 Round 1（2026-04-23, commit `1d79eb1`）

8 项安全/UX 修复：IDOR 防护、onboarding 数据覆盖、rounding gap 等。详见 commit message。

### 审计修复 Round 2（2026-04-23, 外部 Bar Raiser 审计）

| # | 问题 | 严重度 | 状态 | 修复内容 |
|---|------|--------|------|---------|
| 1 | 历史收益率只有单日 → 稳定性/表现分数虚假 | P0 | ✅ 已修 | `quotes.py` 新增 `get_historical_returns_batch()`, 7 天收益率序列 |
| 2 | Event loop 阻塞（同步 HTTP 在 async 中） | P0 | ✅ 已修 | `asyncio.to_thread()` + `Semaphore(10)` 并发控制 |
| 3 | 老用户 Onboarding Banner 缺失 | P2 | ✅ 已修 | V2 页面 ActionBar 下方 amber 提示条 |
| 4 | DB UNIQUE 约束缺失 + insert→upsert | P1 | ✅ 代码完成 | 需执行 `u1b_health_add_unique.sql` + 重新部署 EF |
| 5 | $CASH prompt 幻觉风险 | P2 | ✅ 已修 | agent.py 追加护栏指令 |
| 6 | Staleness LLM 护栏注释 | P3 | ✅ 已修 | INVARIANT 注释 |
| 7 | 手动 cash 过滤 → `without_cash()` | P3 | ✅ 已修 | 统一调用 `_cash_guard` |

### Feature Flags 灰度框架（2026-04-23）

| 组件 | 状态 |
|------|------|
| `feature_flags` 表 | ✅ 已部署 |
| `feature-flags` Edge Function | ✅ 已部署 |
| `GET /api/flags` 后端端点 | ✅ 代码完成 |
| `useFeatureFlags` 前端 hook | ✅ 代码完成 |
| ForYouContent V1/V2 分割 | ✅ 代码完成 |
| Navbar/MobileMenu 灰度适配 | ✅ 代码完成 |
| onboarding/portfolio 页面守卫 | ✅ 代码完成 |

灰度清理 TODO 见 `backend/app/features/flags/.context.md`。

## 未完成 / 延后项

1. **LLM headline polish** (U0-B V1.1): ActionBar 全用 template，可后续加 LLM polish
2. **brew agent insights 注入** (U1-B B7): `ENABLE_HEALTH_INJECTION` flag 预留
3. **Weekly health cron** (U1-B B10): 周度体检邮件
4. **T+7 outcome cron** (U1-C C8): 建议追踪自动回填
5. **Memory 注入到 agents** (U1-C C10): `ENABLE_MEMORY_INJECTION` flag 预留

## 人工验证 Checklist

启动前后端 dev server 后验证：

**灰度框架**:
- [ ] V2 用户：Navbar "专属" 为直链（无 dropdown）
- [ ] V1 用户：Navbar "专属" 有 dropdown（专属日报 + 我的自选股）
- [ ] V1 用户手动访问 `/for-you/onboarding` → 重定向回 `/for-you`

**V2 页面体验**:
- [ ] `/for-you` 显示 "MyBrew · 专属日报" 标题 + 新工具栏
- [ ] 有持仓但未完成画像 → 出现 amber "完成投资画像" 横幅
- [ ] 完成画像后横幅消失
- [ ] ActionBar 显示绿态 / 黄态（取决于持仓状况）

**持仓体检**（需先部署 U1-B）:
- [ ] 点 "持仓体检" → `/for-you/health` 正常加载
- [ ] 生成体检 → 4 维评分 + AI 诊断显示
- [ ] stability 分数非 12（证明历史收益率修复生效）
- [ ] 快速连点 "生成" → DB 中只有 1 条报告（UNIQUE 约束生效）

## 如何从这里继续

1. **执行待办 Operator Actions**（见 §待执行）
2. **人工验收**（见 §人工验证 Checklist）
3. **灰度扩量**：验证无误后给更多用户启用 `for_you_v2` flag
4. **全量发布**：按 `backend/app/features/flags/.context.md` 的清理 TODO 执行
5. **P2 启动**：P1 验证后开始 U2-x，见 `p2-ai-copilot.md`
