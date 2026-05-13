# /for-you Portfolio Rollback + Watchlist Health Engineering Plan

> Status: Planning (Rev 2 · 2026-05-12)
> Scope: `/for-you` 专属系统、portfolio/health 后端模块、前端入口与文档
> Related: `frontend/src/app/for-you/.context.md`, `backend/app/features/portfolio/.context.md`, `backend/app/features/for_you/.context.md`, `docs/plans/for-you/p2-ai-copilot.md`
> Source: Consolidated from the rollback draft in `~/.claude/plans/enumerated-seeking-bird.md`, with the updated decision to preserve health scoring as watchlist-native.

## Rev 2 关键决策（2026-05-12）

**保留 `portfolio_health/` 模块、就地改造为 watchlist 等权语义，不新建 `watchlist_health/`。**

理由：`portfolio_health/scoring.py` 的 4 维评分（分散度/表现/宏观适配/稳定性）只通过 `HoldingView.effective_weight_pct` 一个字段读权重，其余全是 `symbol`。把 watchlist 用 `100/n` 等权适配成"伪 HoldingView 列表"即可复用全部纯逻辑，改动集中在三处：

1. `service.generate_from_watchlist(user_id, symbols)` adapter（新增）
2. `agent.py` prompt 改文案（"持仓/$CASH/减仓" → "关注组合/等权假设/研究优先级"）
3. 前端 `/for-you/health` 数据源改 `useWatchlist`，UI 加"基于等权假设"标注

`HoldingView` 仍是内部数据结构，**不再暴露**给用户。命名上后续如坚持 `watchlist_health` 可纯重命名一次。本方案与原 plan 的 Phase D"新建 watchlist_health 模块"二选一，本 Rev 2 选**前者**（改造现有模块），原因：

| 维度 | 新建 `watchlist_health/`（原方案） | 改造 `portfolio_health/`（本方案） |
|---|---|---|
| 代码改动量 | 中（新建 + 迁移 + 删旧） | **小**（改 prompt + adapter + 文案） |
| Git diff | 大（重命名 + 拷贝） | 小（局部编辑） |
| 重命名风险 | 中 | 无 |
| 历史报告兼容 | 需 migration | 自动兼容 |
| 模块语义清晰度 | 高 | 中（命名仍叫 portfolio，可后续重命名） |

## 目标

把 `/for-you` 的用户股票跟踪语义从 **watchlist + 模拟持仓 + 持仓体检** 收敛为 **watchlist + 投资画像 + 记忆反馈 + 关注列表体检**。健康体检能力保留，但语义从”组合 holdings 加权评分”改为”关注列表等权假设评分”。

本计划要达成四件事：

1. 切断 portfolio holdings 的所有用户可达路径（页面、API、Edge Function）。
2. 数据表 soft-archive，不立即 DROP，保留 1-3 个月反悔窗口；**`portfolio_health_reports` 不动**，继续承载新体检报告。
3. 保留 profile、memory、Action Bar、复盘笔记、feature flags、watchlist 等正交基础设施。
4. 把 `portfolio_health/` 模块就地改造为 watchlist-native：`scoring.py` 复用，`agent.py` 改 prompt，`service.py` 加 watchlist 等权 adapter。

## 当前现状（2026-05-12）

当前仓库仍保留 rollback 前的大部分实现：

- 前端仍有 `/for-you/portfolio` 和 `/for-you/health` 页面。
- 前端仍有 `usePortfolio`、`useHealth`、`QuickThesisInput`、portfolio/health Action Bar routing。
- 后端 `features/portfolio/`（含 holdings 逻辑）、`features/portfolio_health/`、`portfolio.js`、`portfolio-health.js` Edge Functions 全部存在。
- `docs/plans/for-you/README.md` 和 `p2-ai-copilot.md` 仍把 U1-B / U2-A/B/C/D 建立在持仓和 health_score 上。

**重要订正（vs Rev 1 plan）**：`backend/app/main.py` 当前**已经**注册了 `portfolio_router`（line 125, 151）和 `portfolio_health_router`（line 126, 152）。Python 后端是生产可达面，rollback 必须同步处理后端 router、Edge Function、前端三层。

## 产品决策

### 决策 1 · 放弃模拟持仓

模拟持仓要求用户输入金额、股数、成本或权重。灰度反馈显示这会提高 onboarding 摩擦，并把 `/for-you` 的核心叙事带向“投资组合管理工具”。本产品当前更适合被动投资者的轻量路径：关注列表 + 画像 + 系统帮用户判断今天是否需要行动。

### 决策 2 · 保留健康体检，改语义（Rev 2 · 不改名）

旧功能”持仓体检”回答的是：

> 你实际或模拟持有的组合是否健康？

新功能”关注列表体检”回答的是：

> 你正在关注的一组股票，在结构、波动、主题集中度和研究覆盖上是否有明显盲点？

默认假设 watchlist 等权。若用户关注 10 只股票，每只按 10% 参与打分。输出必须避免”仓位””持仓””组合建议””调仓””再平衡”等措辞，统一使用”关注结构””研究优先级””风险提示””观察对象”。

**Rev 2**：模块、路径、表名、Action Bar target 都暂不重命名——`features/portfolio_health/`、`/api/portfolio-health/*`、`portfolio_health_reports`、chip target `health` 都保留；只改实现和文案。Phase D 列出可选的后续重命名 PR。

### 决策 3 · Watchlist 是唯一股票跟踪语义

所有用户添加、查看、跳转、Action Bar chips、日报股票集合都以 watchlist 为唯一主语。Profile 和 memory 继续增强个性化，但不再创建 `user_portfolios` ghost rows。

## 保留 / 删除范围

### 保留

| 模块 / 数据 | 状态 | 原因 |
|---|---|---|
| `watchlist_data` | 保留 | 唯一用户股票跟踪语义 |
| `digest_data` | 保留 | 日报存储 |
| `user_investment_profiles` | 保留 | profile 被 brew、notification、onboarding 依赖 |
| `user_investment_profiles.portfolio_confirmed_at` | 保留列，停止消费 | 避免 DB 破坏性变更；R-2 stale 逻辑停用 |
| `ai_feedback` / memory | 保留 | 与持仓解耦，仍支撑记忆闭环 |
| `feature_flags` | 保留 | 通用基础设施 |
| Action Bar 架构 | 保留，target `health` 继续使用 | chips 仍由 agent 输出驱动 |
| 复盘笔记与 section anchors | 保留 | 与持仓无关 |
| `backend/app/features/portfolio_health/` | **保留并改造为 watchlist-native**（Rev 2） | 复用 4 维 scoring，加 `generate_from_watchlist` adapter |
| `/for-you/health` 页面 | **保留并改造**（Rev 2） | 数据源改 watchlist，UI 标注”基于等权假设” |
| `portfolio_health_reports` 表 | 保留并复用 | `weights_signature` 重新定义为 watchlist hash |
| `portfolio-health.js` EF | 保留 | 服务 watchlist-native 体检 |
| `HoldingView` 模型 | 保留为**内部**数据结构 | 仅 portfolio_health 内部用作 scoring 输入容器，不再有 API 暴露 |
| `useHealth` hook | 保留并改造 | 改读 watchlist，移除 holdings 依赖 |

### 删除 / 停用

| 模块 / 路径 | 处理 |
|---|---|
| `/for-you/portfolio` | 删除页面或改为 404/redirect |
| `usePortfolio` holdings hooks | 删除，仅保留 profile hooks |
| `QuickThesisInput` | 删除；未来如需”为什么关注”，另建 watchlist-native thesis-lite |
| `backend/app/features/portfolio/service.py` 中 holdings 部分 | 删除 holdings 权重计算、bulk_replace、patch、delete、touch 等 |
| `backend/app/features/portfolio/exposure_parser.py` | 保留 ETF exposure 逻辑（被 portfolio_health 复用），其余删 |
| `portfolio.js` EF | archive/disabled，并在 Insforge unpublish |
| `suggestion_tracking` | archive；T+7 outcome 跟踪停用 |
| Action Bar target `thesis:<SYMBOL>` | 删除 |
| Action Bar target `portfolio` | 删除 |

## 数据库计划

### Soft Archive

新建 migration：

`backend/migrations/2026-05-rollback_portfolio.sql`

目标（Rev 2：只 archive 真正下线的表，**保留** `portfolio_health_reports`）：

```sql
ALTER TABLE IF EXISTS user_portfolios RENAME TO user_portfolios_archived_2026_05;
ALTER TABLE IF EXISTS portfolio_insights RENAME TO portfolio_insights_archived_2026_05;
ALTER TABLE IF EXISTS suggestion_tracking RENAME TO suggestion_tracking_archived_2026_05;
-- portfolio_health_reports 不动 — 继续承载 watchlist-native 体检报告
```

RLS / policy 要求：

- staging 先查询真实 policy 名称：`SELECT * FROM pg_policies WHERE tablename IN ('user_portfolios_archived_2026_05', 'portfolio_insights_archived_2026_05', 'suggestion_tracking_archived_2026_05')`。
- migration 不使用占位符，必须列出真实 `DROP POLICY IF EXISTS policy_name ON archived_table`。
- archived 表应对 anon key 返回 401/403 或不可读。

### Watchlist Health Storage（复用现有表）

**Rev 2：复用 `portfolio_health_reports` 表，不新建。** 字段语义微调：

| 字段 | 旧语义 | 新语义（Rev 2） |
|---|---|---|
| `weights_signature` | 持仓权重指纹（捕获仓位变化） | watchlist symbols 排序后的 hash（捕获关注列表变化） |
| `holdings_snapshot` | JSON：用户当时的持仓快照 | JSON：用户当时的 watchlist 快照（每只默认 `100/n`） |
| `score_*` / `diagnosis` | 持仓体检结果 | 等权关注列表体检结果 |

历史持仓体检记录保留可读但不再生成新行；新行从此都是 watchlist-native。Tier 升级（如未来允许用户自定义权重）时再考虑迁移。

可选优化：新增 `report_mode` 列（`enum: 'portfolio_legacy' | 'watchlist_equal_weight'`），在 query 时过滤老记录。第一阶段不强制，避免 rollback PR 引入新列。

## 后端计划

### Phase 1 · Portfolio Rollback

#### `app/features/portfolio/` profile-only

保留：

- `ProfileInput`
- `ProfileView`
- `Style`
- `Horizon`
- `RiskTolerance`
- `NotifyMode`
- `get_profile`
- `save_profile` / `upsert_profile`
- onboarding complete 相关 profile 端点

删除：

- `HoldingInput`
- `HoldingRow`
- `HoldingView`
- `BulkPortfolioRequest`
- `PortfolioListResponse`
- `TouchResponse`
- `list_portfolio`
- `bulk_replace_portfolio`
- `patch_holding`
- `delete_holding`
- `touch_portfolio`
- `compute_effective_weights`
- `auto_fill_shares`
- `enrich_market_values`

`.context.md` 需要重写为“profile-only，holdings 已 archived”。

#### `app/features/brew/`

改动：

- `get_personal_digest` 不再读取 portfolio holdings。
- Agent context 只传 `user_symbols` / watchlist symbols。
- 删除 `portfolio_symbols`、`watchlist_only_symbols`、`portfolio_holdings`、`missing_thesis_symbols` 构造。
- **保留** `portfolio_health.service.get_latest` 注入到 `action_context.health_latest_generated_at`，但语义变为"最近一次关注列表体检时间"，用于 Action Bar `health` chip 的过期提示。
- `portfolio_summary` 字段保留向后兼容，但新写入固定为空字符串。
- prompt 删除 `portfolio` / `thesis:<SYM>` target 说明；**保留** `health` target（指向 watchlist 体检）。

#### `app/features/for_you/`

改动：

- `build_action_bar` 不再读取 holdings。
- `action_items.py` target 白名单收敛为：
  - `digest:<UUID>`
  - `section:notes`
  - `section:events`
  - `stock:<SYM>`
  - `watchlist`
  - `health` — **保留**，跳向 `/for-you/health`（watchlist 等权体检）
- 删除 `portfolio`、`thesis:<SYM>`。
- `templates.py` 中 portfolio fallback 文案删除；health fallback 文案改为关注列表语境（"建议刷新关注列表体检"）。

#### `app/features/notification/`

删除 R-2 stale portfolio force-silent：

- 不再因 `portfolio_confirmed_at > 90d` 禁止 morning/evening/weekly/event 邮件。
- 保留 `notify_mode`、event day、unsubscribe 等其他过滤。

### Phase 2 · Watchlist-Native Health（改造 `portfolio_health/`，Rev 2）

**不新建模块。** 就地改造 `backend/app/features/portfolio_health/`：

```text
portfolio_health/         # 模块名暂不改（后续可纯重命名 commit）
├── .context.md           # 重写：说明现在是 watchlist-native，HoldingView 仅作内部适配容器
├── models.py             # 增加 WatchlistHealthInput，复用 HealthScore / DiagnosisOutput
├── scoring.py            # 不动 — 4 维评分纯函数继续以 list[HoldingView] 为输入
├── service.py            # 新增 generate_from_watchlist()，旧 generate_from_portfolio 删除
├── agent.py              # 改 prompt：删持仓/$CASH 段，加”等权假设”约束
└── router.py             # 端点路径保持 /api/portfolio-health/* 不变（前端无需改 API URL）
```

#### Adapter：watchlist → 伪 HoldingView

新增 `service.watchlist_to_equal_weight_holdings(symbols: list[str]) -> list[HoldingView]`：

```python
def watchlist_to_equal_weight_holdings(symbols: list[str]) -> list[HoldingView]:
    n = len(symbols)
    if n == 0:
        return []
    w = round(100.0 / n, 2)
    # HoldingView 字段：symbol, shares=0, cost_basis=0, effective_weight_pct=w, ...
    # shares/cost 设 0；scoring 只读 effective_weight_pct + symbol，不会读这些
    return [
        HoldingView(symbol=s, effective_weight_pct=w, shares=0, cost_basis=0)
        for s in symbols
    ]
```

新主入口：

```python
async def generate_from_watchlist(user_id: str, force_refresh: bool = False) -> HealthReport:
    symbols = await get_user_watchlist(user_id)  # 直接读 watchlist_data
    holdings = watchlist_to_equal_weight_holdings(symbols)
    profile = await portfolio_db.get_profile(user_id)
    score = compute_health_score(holdings, ...)   # 完全复用现有 scoring.py
    diagnosis = await run_diagnosis(score, holdings_summary, exposure, profile, ...)
    return persist_and_return(user_id, score, diagnosis, watchlist_signature)
```

#### 输入

- watchlist symbols（来自 `watchlist_data`）
- profile（来自 `user_investment_profiles`）
- quotes / 14d or 30d returns（已有 `quotes_historical`）
- sector / industry / ETF exposure（已有 `exposure_parser`）
- recent news / earnings events（可选，agent prompt 用）

#### 等权假设

- `n = len(symbols)`
- 每个 symbol 的 `effective_weight_pct = 100 / n`
- `$CASH` 不再作为用户输入；scoring 内部 `cash_bonus` 路径自然返回 0
- **`scoring.py:46` cash bonus 处理**：保留代码但 watchlist 路径下 exposure 不含 `”Cash”` 键，bonus 自动为 0。需要补偿 watchlist 模式因此损失的 5 分时，在 `compute_dispersion` 内加判断：若 `holdings` 标记为等权模式（通过新 flag 传入），dispersion base 上调 +3，避免所有用户都拿不到分散度满分。

#### 复用 vs 改写

| 文件 | 改动量 | 说明 |
|---|---|---|
| `scoring.py` | **0** | 4 维纯函数完全复用 |
| `models.py` | 小 | 加 `WatchlistHealthInput`；`HealthScore` / `DiagnosisOutput` / `HealthReport` 不变 |
| `service.py` | 中 | 新增 adapter + `generate_from_watchlist`；删 `generate_from_portfolio`（如果存在） |
| `agent.py` | 中 | prompt 改文案（见下） |
| `router.py` | 小 | endpoint 从读 portfolio 改为读 watchlist；路径不变 |
| `db.py` | 0 | 表结构不变 |

#### Agent prompt 改造（`agent.py:12-48`）

具体替换：

| 旧 prompt 内容 | 新 prompt 内容 |
|---|---|
| “你是用户的投资组合健康分析师” | “你是用户的关注列表健康分析师。你的分析基于用户关注列表的**等权假设**，并非真实持仓。” |
| “用户持仓及权重” | “用户关注列表（等权假设：每只 `100/n`）” |
| “## $CASH 处理规则” 整段 | 删除 |
| “考虑、研究、了解、评估、关注”（继续允许） | 保留 |
| “买入、卖出、加仓、减仓”（禁用） | 保留并扩展：”调仓”、”再平衡”、”配置” 也禁用 |
| 输出示例 | 改为关注列表语境，例如 `one_line`: “你关注的 10 只里 7 只 AI 半导体，研究覆盖偏单一” |

输出 schema (`DiagnosisOutput`) **不变**：`one_line` / `diagnosis_markdown` / `top_risk` / `sector_dna` / `macro_sensitivity_tag` / `next_action`。`next_action.type` 从 `rebalance / research / none` 改为 `research / explore / none`（去除 rebalance）。

文案守则：

- 允许：”你的关注列表近期高度集中在 AI 半导体，适合优先补一两个防御性观察对象。”
- 允许：”研究优先级：NVDA 上次相关新闻已 14 天，建议主动了解最新进展。”
- 禁止：”你应该减仓 NVDA。”
- 禁止：”你的组合仓位过高。”
- 禁止把等权假设包装成真实持仓。
- 强制：每篇 `diagnosis_markdown` 开头隐式或显式提及”基于等权假设”。

#### API（路径**不变**，避免前端 URL/类型改动）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/portfolio-health/latest` | 读取最近一次（自动 fallback 到按需生成） |
| POST | `/api/portfolio-health` | 生成 / 强制刷新（input: 无需 body，从 watchlist 推导） |

请求/响应 schema 保持 `HealthReport`。所有端点使用 `Depends(verify_user_token)`。

后续重命名（可选）：稳定后单独开 PR 把 `portfolio_health/` → `watchlist_health/`、路径 `/api/portfolio-health/*` → `/api/watchlist-health/*`，搭配前端 type 重命名，纯机械改名 commit。

## 前端计划

### Phase 1 · 删除旧 portfolio UI（保留 `/for-you/health`）

删除：

- `frontend/src/app/for-you/portfolio/`
- `frontend/src/hooks/queries/use-portfolio.ts` 中 holdings 部分（`useHoldings` / `useBulkSavePortfolio` / `usePatchHolding` 等），保留 profile 相关
- `frontend/src/components/memory/QuickThesisInput.tsx`

**保留并改造**：

- `frontend/src/app/for-you/health/page.tsx`：
  - 移除 `usePortfolio` 调用
  - 数据源改为 `useHealthReport` / `useGenerateHealthCheck`（后端自己读 watchlist）
  - 页面标题改为”关注列表体检”
  - 在 `TotalScore` 上方加一行明显的灰色提示：”基于关注列表等权假设（每只 100/n），不代表真实持仓”
  - `DIMENSION_LABELS.dispersion.desc` 改为”关注结构板块分布”
  - 移除任何 holdings/cost_basis/shares 显示
- `frontend/src/hooks/queries/use-health.ts`：API URL 不变，response type 不变；hook 不再依赖 portfolio
- `frontend/src/lib/api.ts`：`HealthScore` / `DiagnosisOutput` 类型保留；删 `NextAction.type === 'rebalance'`

重构：

- `Navbar.tsx`：V2 dropdown 保留 `专属日报` / `投资画像` / `关注列表` / **`关注体检`**（链接到 `/for-you/health`），移除 `模拟持仓`、`持仓体检`。
- `MobileMenu.tsx` 同步。
- `ForYouContentV2.tsx`：不再加载 portfolio，不传 portfolio props。
- `DigestInlineReport.tsx`：删除 portfolio props。
- `StockOverviewPanel.tsx`：恢复为单一 watchlist/digest 股票列表，不分”我的持仓 / 观察列表”。
- `StockDetailPanel.tsx`：删除 thesis 编辑链路，保留只读详情。
- `action-bar-routing.ts`：删除 `portfolio`、`thesis` 路由；**保留** `health` 路由（指向 `/for-you/health`）。

### Phase 2 · 新 Watchlist Health UI

两种可选入口：

#### 推荐 A · 嵌入 `/for-you/watchlist`

在关注列表页顶部或右侧增加“关注体检”摘要：

- 总分
- 4 个维度小条
- top 2 risk
- top 3 research priorities
- “重新体检”按钮

优点：语义最清楚，不增加新的独立页面。

#### 可选 B · 新增 `/for-you/watchlist-health`

适合展示完整诊断报告和历史趋势。

缺点：rollback 后又新增一个页面，初期可能过重。

第一版选择 A。

## Action Bar 目标收敛

Rollback 后 Action Bar chips 的合法目标：

| Target | 行为 |
|---|---|
| `digest:<UUID>` | 跳到历史日报 |
| `section:notes` | 滚到复盘笔记 |
| `section:events` | 滚到重要事件 |
| `stock:<SYM>` | 跳到个股页 |
| `watchlist` | 跳到关注列表 |
| `health` | **保留**，跳到 `/for-you/health`（watchlist 等权体检） |

删除：`portfolio`、`thesis:<SYM>`。

Rev 2 决策：复用 `health` target 而非新建 `watchlist-health`，因为体检页路径仍是 `/for-you/health`（前端只改内容不改 URL）。后续若把模块和路径整体重命名为 `watchlist_health`，再同步把 chip target 改名。

## P2 Copilot 状态调整

| 单元 | Rollback 后状态 | Watchlist Health 后状态 |
|---|---|---|
| U2-A What-If 模拟 | 废弃 | 仍废弃。等权 watchlist 下 What-If 容易制造虚假”调仓”感 |
| U2-B 跨持仓连线 | 重做 | 改为 watchlist 跨股连线，可复用 portfolio_health 的结构暴露和研究优先级 |
| U2-C Crisis Mode | 重做 | 可基于等权 watchlist drawdown、VIX/SPY、top symbol 单日大跌触发 |
| U2-D 月度 AI 回顾 | 改造保留 | 可加入 `portfolio_health_reports.score_total` 时序，但不再使用 portfolio snapshot / suggestion outcomes |

新增后续机会：

- U3：投资者画像深度调查（渐进披露）
- U4：watchlist “为什么关注”一句话（thesis-lite，不写 `user_portfolios`）

## 测试计划

### 后端

删除或改写：

- 删除 `test_portfolio_service.py`（holdings 部分）
- **保留并扩展** `test_health_scoring.py`：现有 `HoldingView` 输入用例不删，新增等权 watchlist 输入用例覆盖 `watchlist_to_equal_weight_holdings` adapter
- 删除 `e2e/test_health_e2e.py` 中依赖用户提交 holdings 的端到端用例；保留体检流程 e2e，改为 watchlist-only 触发
- 改写 `test_portfolio_models.py`，只保留 `ProfileView` / `ProfileInput`
- 改写 `test_action_bar.py`
- 改写 `test_action_items_validator.py`
- 改写 `test_for_you_action_integration.py`
- 改写 `test_brew_router_unit.py`
- 改写 `test_brew_db_unit.py`
- 改写 `test_notification_preferences.py`
- 改写 `test_architecture.py`

新增：

- `test_health_watchlist_adapter.py`（新文件，约 6 个用例）
  - `watchlist_to_equal_weight_holdings([])` → `[]`
  - 5 symbols → 每个 `effective_weight_pct = 20.0`
  - 100 symbols → `1.00`（边界）
  - 整合 `compute_dispersion` 端到端：5 同 sector → 集中度扣分
  - 整合 `compute_performance` 端到端：等权回报 == 简单平均
  - 整合 `compute_stability` 端到端：等权波动率可复现
- 改写 `test_health_scoring.py` 增加：
  - 空 watchlist 返回无体检 / 引导态
  - 1 只股票返回”覆盖不足”而不是假分散
  - 缺 quote 时降级，不 500
- `test_health_router.py` 改写：
  - 用户认证
  - watchlist 读取失败处理
  - response schema（保持 `HealthReport`）
- `test_health_agent.py` 新增/改写：
  - prompt 中包含”等权假设”字样
  - 禁用词测试：`减仓` / `调仓` / `再平衡` 出现时 `_lint_diagnosis` 告警

### 前端

删除或改写：

- `Navbar.test.tsx`（dropdown 新组合：日报/画像/关注列表/关注体检）
- `ActionBar.test.tsx`（health chip 仍合法）
- `DigestInlineReport.test.tsx`
- `StockOverviewPanel.test.tsx`
- `action-bar-routing.test.ts`（删 portfolio/thesis；保留 health → `/for-you/health`）

新增/改写：

- `for-you/health/page.test.tsx`（或现有 `HealthPage.test.tsx` 改写）：
  - loading
  - empty watchlist 显示引导态
  - score breakdown 渲染
  - “基于等权假设” 标注可见
  - refresh error fallback

### 验收命令

后端：

```bash
cd backend
pytest -v
```

前端：

```bash
cd frontend
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## 手工验收

| 场景 | 期望 |
|---|---|
| 已 onboarded 用户访问 `/for-you` | 显示当日 digest + 关注列表，无持仓概览 |
| 新用户完成 onboarding | 只采集画像 + watchlist，不采集金额/股数 |
| Navbar V2 dropdown | 显示：专属日报 / 投资画像 / 关注列表 / 关注体检；不再有模拟持仓 |
| 直接访问 `/for-you/portfolio` | 404 / redirect `/for-you` |
| 访问 `/for-you/health` | 渲染 watchlist 等权体检；顶部明显标注”基于等权假设” |
| 空 watchlist 触发体检 | 展示引导态：”先添加几只关注的股票” |
| Action Bar chip `watchlist` | 跳关注列表 |
| Action Bar chip `health` | 跳 `/for-you/health`，显示当前 watchlist 体检 |
| 关注列表体检 | 不出现”持仓 / 仓位 / 调仓 / 减仓 / 再平衡”等词 |
| 邮件发送 | 不再因 `portfolio_confirmed_at` 过旧静默 |

## 执行阶段

### Phase A · Plan Landing + Safety Scan

1. [x] 保存本计划到 repo。
2. [ ] 用 `rg` 列出所有 portfolio/thesis 引用（health 不需要扫除）。
3. [ ] 确认 `portfolio_router` / `portfolio_health_router` 在 `main.py` 的注册状态（当前都已注册，line 125-126、151-152）。
4. [ ] 标记 `scoring.py` 中可复用的纯函数（结论：4 维全部可复用）。

### Phase B · Portfolio Rollback + portfolio_health 改造（同 PR）

1. [ ] 新建 DB archive migration（**不动** `portfolio_health_reports` 表）。
2. [ ] `features/portfolio/` 改为 profile-only；保留 `exposure_parser` 供 portfolio_health 用。
3. [ ] **改造 `features/portfolio_health/`**：
   - `service.py` 新增 `watchlist_to_equal_weight_holdings` + `generate_from_watchlist`
   - `agent.py` 改 prompt（删 $CASH 段、加等权假设约束、禁词扩展）
   - `router.py` endpoint 改读 watchlist、路径不变
   - `models.py` 增加 `WatchlistHealthInput`
   - `scoring.py` 视情况在 `compute_dispersion` 加 watchlist 模式 +3 补偿
4. [ ] brew / for_you / notification 删除 portfolio 依赖；保留 health chip 路由。
5. [ ] 后端测试改写到通过。

### Phase C · Frontend Rollback + `/for-you/health` 改造（同 PR）

1. [ ] 删除 portfolio 页面和 hooks。
2. [ ] **改造 `/for-you/health/page.tsx`**：移除 `usePortfolio`、加"基于等权假设"标注、文案 watchlist 化。
3. [ ] 简化 `/for-you` V2 数据流。
4. [ ] 简化 StockOverviewPanel / DigestInlineReport / StockDetailPanel。
5. [ ] Navbar / MobileMenu 保留"关注体检"入口；Action Bar routing 保留 `health` chip，删 `portfolio` / `thesis`。
6. [ ] 前端测试、类型检查、lint、build 到通过。

### Phase D · 可选 · 模块改名（不在 rollback PR 内）

只有在 Phase B+C ship 稳定 1-2 周后才考虑：

1. [ ] `backend/app/features/portfolio_health/` → `backend/app/features/watchlist_health/`
2. [ ] API 路径 `/api/portfolio-health/*` → `/api/watchlist-health/*`，前端 `lib/api.ts` 同步
3. [ ] DB 表 `portfolio_health_reports` → `watchlist_health_reports`（带 view 兼容旧客户端）
4. [ ] Action Bar target `health` → `watchlist-health`

纯机械重命名，单独 PR；如未来确实要做。

### Phase E · Docs + Deploy

1. [ ] 更新 `docs/plans/for-you/README.md`。
2. [ ] 更新 `docs/plans/for-you/p2-ai-copilot.md` 状态 banner。
3. [ ] 更新 `docs/plans/for-you/v2-round2-summary.md` deprecation note。
4. [ ] 更新 `docs/plans/for-you/completed/checkpoint.md`。
5. [ ] 更新 `backend/app/features/portfolio_health/.context.md`：明确 watchlist-native + 等权假设。
6. [ ] 更新 `backend/app/features/portfolio/.context.md`：profile-only，holdings 已 archived。
7. [ ] staging 执行 migration，验证 archived 表（user_portfolios / portfolio_insights / suggestion_tracking）不可读；验证 `portfolio_health_reports` 仍可读写。
8. [ ] production 低峰执行 migration。
9. [ ] Insforge unpublish `portfolio.js`；**保留** `portfolio-health.js`。

## 风险与缓解

| 风险 | 概率 | 缓解 |
|---|---:|---|
| 一次 PR 同时 rollback + health 改造，diff 较大 | 中 | Rev 2 改造比新建模块小很多；如仍嫌大，可拆 PR：先 rollback portfolio + 注释 health 入口，再 PR 启 health 改造 |
| 用户误解等权体检是投资建议 | 中 | `/for-you/health` 顶部明显标注；agent prompt 强制提示；禁词 lint 兜底 |
| 旧 digest 缓存含 `portfolio_summary` / `thesis:<SYM>` chip | 中 | 前端不渲染 portfolio_summary；unknown chip 降级不跳转；`health` chip 仍合法 |
| Scoring 复用时残留持仓语义 | 中 | adapter 强制 `shares=0, cost_basis=0`；agent prompt 增禁词 lint（调仓/再平衡/配置） |
| `cash_bonus` 缺失导致所有用户分散度低分 | 中 | `compute_dispersion` 加 watchlist 模式 +3 base 补偿；上线后对比分布 |
| DB policy migration 失败 | 中 | staging 查询真实 policy，migration 使用 IF EXISTS |
| 历史 `portfolio_health_reports` 行混入新 watchlist 行 | 低 | 第一阶段允许混存；列表 query 加 `generated_at >= rollback_date` 过滤；后续可加 `report_mode` 列 |
| notification 发件量上升 | 低 | 上线后 24h 监控发件量与 V2 round2 后水平 ±20% |

## DoD

- [ ] portfolio holdings 用户路径切断；`/for-you/portfolio` 404/redirect。
- [ ] `user_portfolios`、`portfolio_insights`、`suggestion_tracking` 已 soft-archive。**`portfolio_health_reports` 保留**。
- [ ] `/for-you/health` 渲染 watchlist 等权体检，顶部显示”基于等权假设”。
- [ ] `portfolio_health` 后端使用 watchlist 等权输入，`HoldingView` 仅作内部 adapter 容器。
- [ ] Agent prompt 已删除 $CASH 段、加入等权假设约束、扩展禁用词。
- [ ] profile、watchlist、memory、Action Bar、复盘笔记正常工作。
- [ ] Action Bar 合法 chip：`digest:<UUID>` / `section:*` / `stock:<SYM>` / `watchlist` / `health`。
- [ ] 后端 pytest 通过；新增 `watchlist_to_equal_weight_holdings` 用例。
- [ ] 前端 vitest、tsc、lint、build 通过；`/for-you/health` 测试覆盖等权标注可见性。
- [ ] 文档同步说明 P2-A 废弃、P2-B/C/D watchlist-native 改造。
- [ ] 旧 URL `/for-you/portfolio` 行为明确；`/for-you/health` 通过手工验收（含等权标注、空 watchlist 引导态、Action Bar `health` chip 跳转）。
