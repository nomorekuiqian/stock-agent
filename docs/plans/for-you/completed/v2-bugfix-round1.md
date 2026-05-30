# V2 灰度首轮 Bug 修复方案

> Status: Pending review
> Branch: `claude/improve-exclusive-page-d7FMx`
> Created: 2026-04-25
> Scope: 4 bugs reported by early V2 users

## 概览

| # | Bug | 严重度 | 触及文件 |
|---|-----|--------|----------|
| 1 | 持仓编辑器无法删空 | P0 阻断 | `frontend/src/app/for-you/portfolio/page.tsx` |
| 2 | "补充投资论点" chip 无效 | P1 死链 | `backend/app/features/for_you/service.py`, `frontend/src/components/for-you/StockOverviewPanel.tsx` |
| 3 | 观察列表答 thesis 后被错分到"我的持仓" | P0 数据语义 | `backend/app/features/portfolio/{service,models}.py`, `frontend/src/app/for-you/_components/ForYouContentV2.tsx`, `frontend/src/app/for-you/portfolio/page.tsx` |
| 4 | V1 灰度外用户也看到"持仓概览"空态 | P0 错误引导 | `frontend/src/components/for-you/StockOverviewPanel.tsx` |

---

## Bug 1 · 持仓编辑器无法删空

### Root cause
`page.tsx:384` 的 `disabled={holdings.length === 0 || saveMutation.isPending}` 在用户删到最后一只时强制禁用 Save 按钮，导致清空意图无法提交后端。后端 EF (`portfolio.js:102-115`) 已支持 `keepSymbols.length === 0` 时清库，所以放开禁用是安全的。

### Fix

`frontend/src/app/for-you/portfolio/page.tsx`

```diff
- disabled={holdings.length === 0 || saveMutation.isPending}
+ disabled={!dirty || saveMutation.isPending}
```

`handleSave` 的 confirm 增加清空场景文案：

```diff
  if (removed.length > 0) {
-   const ok = window.confirm(`即将移除 ${removed.join(', ')}，确认保存？`);
+   const msg = holdings.length === 0
+     ? `即将清空所有持仓 (${removed.join(', ')})，确认保存？`
+     : `即将移除 ${removed.join(', ')}，确认保存？`;
+   const ok = window.confirm(msg);
    if (!ok) return;
  }
```

### 副作用
- 用户删空 *可见* 持仓后保存，`bulk_replace_portfolio` 会清空所有真实持仓行。**Thesis-only 幽灵行会被 Bug 3D 的 ghost passthrough 安全保留下来**（用户的观察列表观点不受"清空持仓"操作影响）。
- "回到日报页还显示持仓概览"的二次症状会随之消失（真实持仓清空 → `portfolioSymbolSet` 过滤掉 0%/无量化数据的幽灵行 → `hasPortfolio=false`）。

### 验证
- 删到 0，Save 可点，发起 bulk request body=`{rows: []}`，返回 200 + 空数组
- 跳回 `/for-you`，看到 onboarding 引导（State A）
- 编辑现有持仓金额（不删除），Save 仍正常工作（dirty=true）
- 一进编辑器没改任何东西，Save 灰着（!dirty）

---

## Bug 2 · "补充投资论点" chip 点击无效

### Root cause
`for_you/service.py:273-277` 收集 `missing_thesis` 时未与今日 `daily_changes`（即 `digest_data.stocks` 的 symbol 集合）取交集。`templates.green_chips` 取列表第一项拼出 `#stock-{sym}`。`StockOverviewPanel.tsx:319-340` 的 `hashchange` 处理器：

```ts
const exists = sorted.some((s) => s.symbol === sym);
if (!exists) return;  // 静默 no-op，URL 还残留 #stock-GLD
```

如果 holding 是冷门标的（GLD、$CASH）今日不在 digest，chip 直接死链。

### Fix

**后端**：`backend/app/features/for_you/service.py:273-277`

```diff
-        # Find stocks missing thesis
-        missing_thesis = [
-            h.symbol for h in holdings
-            if h.symbol != "$CASH" and not h.thesis
-        ] if holdings else []
+        # Find stocks missing thesis. Filter to symbols that appear in today's
+        # digest so the chip's `#stock-<sym>` anchor target actually exists in
+        # the DOM. Without this guard the chip silently no-ops.
+        missing_thesis = [
+            h.symbol for h in holdings
+            if h.symbol != "$CASH"
+            and not h.thesis
+            and h.symbol in daily_changes
+        ] if holdings else []
```

如果过滤后为空，`templates.green_chips` 的 fallback chain（health → portfolio update → archive）自然兜底。

**前端**：`frontend/src/components/for-you/StockOverviewPanel.tsx:319-340`

```diff
   useEffect(() => {
     const handleHash = () => {
       const hash = window.location.hash;
       if (!hash.startsWith('#stock-')) return;
       const sym = hash.slice(7);
       const exists = sorted.some((s) => s.symbol === sym);
-      if (!exists) return;
+      if (!exists) {
+        // Clear the dead hash so it doesn't linger in the URL bar.
+        history.replaceState(null, '', window.location.pathname + window.location.search);
+        return;
+      }
       setSelectedSymbol(sym);
       requestAnimationFrame(() => { ... });
       history.replaceState(null, '', window.location.pathname + window.location.search);
     };
```

### 验证
- 后端 pytest 新增 `test_green_chips_skip_missing_thesis_not_in_digest`：holdings=[AAPL(无 thesis), GLD(无 thesis)]，digest 只含 AAPL → chip link=`#stock-AAPL`
- 后端新增 `test_green_chips_no_overlap_falls_back`：holdings 都不在 digest → 走 archive 兜底
- 手动：Action Bar green chip 一定能滚到目标卡片，并显示 ring 高亮
- 手动：手动改 URL 加 `#stock-NOTEXIST` 刷新 → 不死链，hash 自动清除

---

## Bug 3 · 观察列表 thesis 写入后被错分到"我的持仓"

### Root cause
PATCH `/portfolio/{symbol}` 是 upsert 语义（`portfolio.js:131-150`），即使只带 `thesis` 也会在 `user_portfolios` 建一行（symbol+user_id 唯一）。`compute_effective_weights` 现行实现把幽灵行（`shares=null, cost_basis=null, weight_pct=null`）和真实行混在一起跑模式选择：

| 场景 | 真实路径 | 幽灵行最终 weight |
|------|----------|-------------------|
| 真实行有 cost_basis | Mode 1 失败 (shares=None break) → Mode 1.5 cost_basis 成功 | **0.0%** |
| 真实行只有 shares | Mode 1 失败 → 1.5 失败 (无 cost) → 2 失败 → Mode 3 等权 | **1/n%** |

工程师之前的诊断只覆盖了第二种 worst case。**关键问题是无论拿到 0% 还是 1/n%，前端 `portfolioSymbolSet`（`ForYouContentV2.tsx:66-69`）只看 symbol 不看权重 → 全部当持仓**。

### Fix（三处协同）

#### 3A · 后端 `compute_effective_weights` 引入 `_is_active`

`backend/app/features/portfolio/service.py`

```python
def _is_active(r: HoldingInput) -> bool:
    """A row is 'active' (real position) iff it has any quantitative field.
    Thesis-only rows (created via PATCH for watchlist symbols) are 'ghost'
    rows that should not influence weight computation and receive 0% effective weight."""
    return (
        r.shares is not None
        or (r.cost_basis is not None and r.cost_basis > 0)
        or (r.weight_pct is not None and r.weight_pct > 0)
    )


def _view_zero(r: HoldingInput) -> HoldingView:
    """Build a 0%-weight HoldingView for a ghost row, preserving thesis/etc."""
    return HoldingView(
        symbol=r.symbol,
        weight_pct=r.weight_pct, shares=r.shares, cost_basis=r.cost_basis,
        thesis=r.thesis, target=r.target, stop_loss=r.stop_loss,
        conviction=r.conviction, entry_price=r.entry_price,
        effective_weight_pct=0.0,
        weight_source="ghost",
    )


def compute_effective_weights(rows, prices_map=None):
    inputs = [...]   # existing normalize block
    n = len(inputs)
    if n == 0:
        return []

    active = [r for r in inputs if _is_active(r)]
    ghost  = [r for r in inputs if not _is_active(r)]

    if not active:
        # All rows are ghosts (or empty). Return all at 0%.
        return [_view_zero(r) for r in inputs]

    # Run the existing 3-mode resolution on `active` only.
    active_views = _resolve_modes(active, prices_map)   # extracted from current body

    # Merge: ghost rows attach at 0%, original input order preserved.
    by_symbol = {v.symbol: v for v in active_views}
    by_symbol.update({r.symbol: _view_zero(r) for r in ghost})
    return [by_symbol[r.symbol] for r in inputs]
```

> **Refactor note (M2 — locked-down contract)**：
> - `_resolve_modes(active_inputs: List[HoldingInput], prices_map: Optional[Dict[str,float]]) -> List[HoldingView]`
> - **前置条件**：`active_inputs` 已是 `HoldingInput`（不会再有 `HoldingRow` 混入），且全部满足 `_is_active(r) is True`；`prices_map` 已 normalize 为 `dict` 且已 `setdefault(CASH_SYMBOL, 1.0)`。
> - **后置条件**：每个 active row 一个 `HoldingView`，顺序与输入对齐，`weight_source ∈ {"shares_x_price","cost_basis","weight_pct","equal"}`。
> - 函数内部保留现有 Mode 1 → 1.5 → 2 → 3 的 fall-through 链；在 cost_basis / weight_pct / equal 三个 mode 末尾仍调用 `_fix_rounding_gap(results)`。
> - **公共入口** `compute_effective_weights` 负责：① `HoldingRow → HoldingInput` 桥接；② `prices.setdefault(CASH_SYMBOL, 1.0)`；③ active/ghost 拆分；④ 调用 `_resolve_modes`；⑤ 合并 ghost + 恢复输入顺序。
> - **现有 pytest 兼容性**：`test_shares_mode_zero_total_falls_through` 和 `test_partial_weight_pct_treats_missing_as_zero` 中所有 row 都是 active（都有 shares 或 weight_pct > 0），因此 fall-through 链行为不变，应仍 pass。CI 跑前必复核。

#### 3B · `HoldingView.weight_source` Literal 扩展

`backend/app/features/portfolio/models.py:84`

```diff
- weight_source: Literal["shares_x_price", "cost_basis", "weight_pct", "equal"]
+ weight_source: Literal["shares_x_price", "cost_basis", "weight_pct", "equal", "ghost"]
```

#### 3C · 前端 `ForYouContentV2.portfolioSymbolSet` 过滤

`frontend/src/app/for-you/_components/ForYouContentV2.tsx:66-69`

```diff
   const portfolioSymbolSet = useMemo(
-    () => new Set((portfolioData?.holdings ?? []).map((h) => h.symbol)),
+    () => new Set(
+      (portfolioData?.holdings ?? [])
+        .filter((h) =>
+          (h.effective_weight_pct ?? 0) > 0
+          || h.shares != null
+          || h.cost_basis != null
+          || h.weight_pct != null
+        )
+        .map((h) => h.symbol)
+    ),
     [portfolioData?.holdings]
   );
```

`thesisMap`（line 58-64）**保持原样**——幽灵行的 thesis 必须仍能透出到观察列表详情面板的"你的观点"。

**M3 修复**：`portfolioWeightMap`（line 71-76）也要过滤掉 0% 行，否则观察列表的 AAPL 会显示 "0.0%" tag。

```diff
   const portfolioWeightMap = useMemo(
     () => Object.fromEntries(
-      (portfolioData?.holdings ?? []).map((h) => [h.symbol, h.effective_weight_pct])
+      (portfolioData?.holdings ?? [])
+        .filter((h) => (h.effective_weight_pct ?? 0) > 0)
+        .map((h) => [h.symbol, h.effective_weight_pct])
     ),
     [portfolioData?.holdings]
   );
```

#### 3D · 持仓编辑器隐藏幽灵行 + Save 时静默回写（M1 修复版本）

`frontend/src/app/for-you/portfolio/page.tsx`

```tsx
// near top (after imports)
const isGhost = (h: HoldingView) =>
  (h.effective_weight_pct ?? 0) === 0
  && h.shares == null
  && h.cost_basis == null
  && h.weight_pct == null;
```

**M1 race-condition 防护**：在 sync effect 里**snapshot** 打开编辑器那一刻服务端就已经是 ghost 的 symbols 到一个 `useRef`。Save 时只把这些 snapshot 过的 ghost 回写，避免"另一个 tab 删了真实持仓 → 当前 tab Save 时被复活"。

```tsx
// state declaration
const ghostHoldingsRef = useRef<HoldingView[]>([]);
```

Sync effect（line 100）：

```diff
-    setHoldings(holdingsToLocal(portfolioData.holdings ?? [], extraNames));
+    const allHoldings = portfolioData.holdings ?? [];
+    const visible = allHoldings.filter((h) => !isGhost(h));
+    setHoldings(holdingsToLocal(visible, extraNames));
+    // Snapshot the ghost rows AT SYNC TIME, not at save time. This prevents
+    // a cross-tab race where another tab deletes a real holding (which then
+    // appears as ghost on refetch) and the editor's Save resurrects it.
+    ghostHoldingsRef.current = allHoldings.filter(isGhost);
```

`handleSave`：把幽灵行作为"只带 thesis 的 passthrough rows"附加到 bulk request：

```diff
  const handleSave = useCallback(() => {
    if (!user?.id) return;

-   const serverSymbols = new Set((portfolioData?.holdings ?? []).map((h: HoldingView) => h.symbol));
+   // Use sync-time snapshot, not live portfolioData (M1 race fix).
+   const ghostHoldings = ghostHoldingsRef.current;
+   const serverHoldings = portfolioData?.holdings ?? [];
+   // Only "visible" server symbols count for the removal confirmation.
+   const serverSymbols = new Set(
+     serverHoldings.filter((h) => !isGhost(h)).map((h) => h.symbol)
+   );
    const localSymbols = new Set(holdings.map((h) => h.symbol));
    const removed = [...serverSymbols].filter((s) => !localSymbols.has(s));
    ...

-   const rows: HoldingInput[] = holdings.map((h) => ({
-     symbol: h.symbol,
-     cost_basis: h.amount,
-     entry_price: h.entry_price ?? null,
-     shares: h.shares ?? null,
-   }));
+   const visibleRows: HoldingInput[] = holdings.map((h) => ({
+     symbol: h.symbol,
+     cost_basis: h.amount,
+     entry_price: h.entry_price ?? null,
+     shares: h.shares ?? null,
+   }));
+   // Pass through thesis-only ghost rows so bulk_replace doesn't drop them
+   // (their PATCH-saved thesis must survive a portfolio Save).
+   const ghostRows: HoldingInput[] = ghostHoldings.map((h) => ({
+     symbol: h.symbol,
+     thesis: h.thesis ?? null,
+     target: h.target ?? null,
+     stop_loss: h.stop_loss ?? null,
+     conviction: h.conviction ?? null,
+     cost_basis: null,
+     entry_price: null,
+     shares: null,
+     weight_pct: null,
+   }));
+   const rows: HoldingInput[] = [...visibleRows, ...ghostRows];
```

> **Note**: `HoldingInput` 当前可能没有暴露 `thesis/target/stop_loss/conviction`。检查 `frontend/src/lib/api.ts` — 如果接口缺字段，需要扩展。后端 Pydantic `HoldingInput` 已经有这些字段（`models.py:32-35`），所以扩展前端接口是无破坏的。

`onSuccess` 计算 `previousSyms` 和 `newSyms` 时也排除幽灵：

```diff
-          const previousSyms = new Set((portfolioData?.holdings ?? []).map((h: HoldingView) => h.symbol));
+          const previousSyms = new Set(
+            (portfolioData?.holdings ?? []).filter((h) => !isGhost(h)).map((h) => h.symbol)
+          );
```

### 验证
**后端 pytest** (`backend/tests/test_portfolio_service.py`)：
- `test_compute_effective_weights_ghost_row_kept_at_zero`：3 真实行 cost_basis=[5000,3000,2000] + AAPL 幽灵 → AAPL=0.0%, 其余 50/30/20%
- `test_compute_effective_weights_all_ghost_returns_zeros`：全幽灵 → 全 0
- `test_compute_effective_weights_ghost_does_not_break_shares_mode`：2 行 shares + 1 行幽灵 → 2 行走 shares×price 模式，幽灵=0
- 现有 mode resolution 用例需要全部仍 pass

**手动**：
- 观察列表 AAPL 答 thesis → AAPL 留在"观察列表"区，不出现在"我的持仓"
- StockDetailPanel 显示"你的观点: ..."
- 进 `/for-you/portfolio`，AAPL **不出现**在持仓列表
- 在编辑器里加一只 NVDA + 保存 → AAPL 的 thesis 仍在 DB（PATCH GET 验证）
- 删除全部可见持仓 + 保存 → 真实行清空，幽灵行（AAPL）仍存（thesis 不丢）

---

## Bug 4 · V1 灰度外用户看到"持仓概览"空态

### Root cause
V2 改造引入的 `<PortfolioEmptyState />` 在 `StockOverviewPanel.tsx:357` 用 `!hasPortfolio` 控制：

```ts
const hasPortfolio = portfolioSymbols != null && portfolioSymbols.size > 0;
{!hasPortfolio && <PortfolioEmptyState />}
```

V1 调用方 (`ForYouContentV1.tsx:233`) 完全不传 `portfolioSymbols`，`undefined` 被 `!hasPortfolio` 误判为"V2 用户但没建仓" → 渲染了一个引导链接到 `/for-you/portfolio`，但 V1 用户没 Max 权限走不进去 → 死链 + 错误叙事。

### Fix
`frontend/src/components/for-you/StockOverviewPanel.tsx`

把"是否启用持仓维度 UI"的开关显式地**绑定 `portfolioSymbols !== undefined`**：

```diff
-  const hasPortfolio = portfolioSymbols != null && portfolioSymbols.size > 0;
+  // V2 callers pass `portfolioSymbols` (possibly empty Set) to opt into the
+  // portfolio sectioning. V1 callers omit it → flat stock list, no portfolio UI.
+  const portfolioMode = portfolioSymbols !== undefined;
+  const hasPortfolio = portfolioMode && portfolioSymbols.size > 0;
```

```diff
-      {!hasPortfolio && (
+      {portfolioMode && !hasPortfolio && (
         <PortfolioEmptyState />
       )}
```

观察列表 section 的标题改用 `portfolioMode` 控制（V1 不显示"观察列表"标题，回到原始扁平列表）：

```diff
   {watchlistStocks.length > 0 && (
-    <div className={hasPortfolio ? 'pt-2' : ''}>
-      {hasPortfolio && (
+    <div className={portfolioMode && hasPortfolio ? 'pt-2' : ''}>
+      {portfolioMode && hasPortfolio && (
         <div className="flex items-center gap-2 mb-3">
           <span className="text-sm font-semibold text-muted-foreground">观察列表</span>
```

`portfolioStocks` / `watchlistStocks` 计算保持原样（V1 mode 下 `portfolioSymbols=undefined` 已经走 `: sorted` 分支，效果不变）。

### 验证
- V1 灰度外用户 `/for-you` → 看到一个扁平股票列表，**没有**"持仓概览"空态、**没有**"我的持仓 / 观察列表"分组标题、**没有** PortfolioHeader 组件
- V2 用户无持仓 → 仍看到 `<PortfolioEmptyState />` + onboarding 引导
- V2 用户有持仓 → 仍看到分组渲染
- V2 用户 portfolio 全部都不在今日 digest → 仍看到 PortfolioHeader + "今日日报暂未包含您的持仓分析"

---

## 实施顺序

```
Phase 1 · P0 修复（独立、可并行 review）
  Step 1: Bug 4 — StockOverviewPanel 渲染 mode 开关  [前端单文件]
  Step 2: Bug 1 — Save 按钮禁用条件 + confirm 文案   [前端单文件]
  Step 3: Bug 2 — 后端 missing_thesis 过滤 + 前端 hash 兜底  [后端 + 前端]
  Step 4: Bug 3 — 后端 _is_active + 前端两处过滤（Editor + ForYouContentV2）+ ghost passthrough  [跨文件，最大]

每步独立 commit。每步完成后启动 subagent verification。
```

## 测试矩阵

| 场景 | 预期 | 关联 bug |
|------|------|----------|
| V1 用户进 `/for-you` | 扁平列表，无持仓相关 UI | 4 |
| V2 用户无持仓 | 看到 PortfolioEmptyState | 4(回归) |
| V2 用户进 `/for-you/portfolio`，删空，Save | 后端清空，跳回 `/for-you` 看到 onboarding | 1 |
| V2 用户编辑金额，Save | 正常保存 | 1(回归) |
| V2 用户没改任何东西 | Save 灰着 | 1 |
| V2 Action Bar green chip 指向 holding 在今日 digest | chip 滚到卡片+ring 高亮 | 2(回归) |
| V2 Action Bar 所有 missing-thesis 持仓都不在今日 digest | chip fallback 到 archive/health/portfolio | 2 |
| V2 观察列表 AAPL 答 thesis | 留在观察列表，"你的观点"显示 | 3 |
| V2 编辑器不显示幽灵 AAPL | 列表里看不到 | 3 |
| V2 编辑器加 NVDA Save，AAPL thesis 不丢 | DB 仍有 AAPL+thesis 行 | 3 |
| V2 持仓 1 真实 + 1 幽灵 | 真实 100%，幽灵 0% | 3 |
| 现有 portfolio service pytest | 全部 pass | 3 (回归) |

## 已核查的前置条件

1. **`HoldingInput` 已含 thesis 字段**：`frontend/src/lib/api.ts:657-667` 已暴露 `thesis/target/stop_loss/conviction`，Bug 3D 的 ghost passthrough 无需扩 API 契约。
2. **PATCH /portfolio 调用方**：仅 `QuickThesisInput.tsx:26` 一处。幽灵行只在"用户答 thesis"流程产生，scope 收敛。
3. **`HoldingView.weight_source` 前端 Literal 也需扩展**：`frontend/src/lib/api.ts:682` 增加 `'ghost'` 选项以匹配后端。

## Open questions

无（前置条件已核查）。

---

## Round 3 follow-up (2026-04-25)

最终审核过程中发现并修复的额外问题，同 branch 合入：

### Post-Save 幽灵 flash（page.tsx）
`handleSave.onSuccess` 之前直接 `setHoldings(holdingsToLocal(serverHoldings, ...))`，未过滤幽灵，视觉上会闪一个 tick 再被 sync effect 重过滤。

**Fix**: `onSuccess` 内同步过滤 `serverHoldings.filter(!isGhost)` 送入 `setHoldings`，并用 save 响应刷新 `ghostHoldingsRef.current`（保证快速连按两次 Save 用 post-Save truth 而非 pre-Save）。不违反 sync-time snapshot 契约——该契约防的是 cross-tab 跑读，从 save 响应刷新仅更严格。

### Navbar 测试断于 QueryClient（Navbar.test.tsx）
`Navbar.tsx` 在 `984463e` / `308d13c` 引入 `useFeatureFlags` / `useEntitlements` 时未更新测试，mount 时 hook throw "No QueryClient set"。

**Fix**: 在 `Navbar.test.tsx` 补齐两个 `vi.mock`（与现有 6 个 stub 同风格）。`hasFlag('for_you_v2') === false` 走 V1 分支，与 smoke test 断言（"日报/专属/个股/宏观/联系"）完全兼容。

### 架构测试跨特性导入（test_architecture.py）
`for_you/service.py:137,148` 懒加载 `brew.db` / `portfolio_health.service`——action bar 本质是 orchestrator。

**Fix**: 把 `for_you` 加入 `ORCHESTRATOR_FEATURES`（与 `notification/morning_report/daily_report/subscription` 同类）；移除 `ALLOWED_PAIRS` 中冗余的 `("for_you", "portfolio")`。

### FMP news 脚本 NoneType crash（scripts/test_fmp_news.py）
FMP 对市场级新闻返回 `{"symbol": null}` 等空值；`.get(key, default)` 在键存在但值为 None 时不回退，后续 `f"{None:5}"` / `None[:N]` / sort 比较都会炸。

**Fix**: 6 处调用点（line 42/55-57/72/77-80/112-115）统一改为 `.get(key) or default`，覆盖缺失与 None 两种情况。

### 最终测试数据
- Backend `pytest` 全量：**1549 passed, 13 skipped**（Round 1 前：1547 passed + 2 failed）
- Frontend `vitest`：**429/429 passed**（Round 1 前：426 passed + 3 failed）
- Frontend `tsc --noEmit`：**exit 0**
