# V2 灰度 UX 修复计划

> Status: Ready for implementation
> Branch: `claude/improve-exclusive-page-d7FMx`
> Created: 2026-04-24
> Scope: 9 issues, ~4.5d total

## 概述

V2 灰度阶段用户体验走查发现 9 个问题，按优先级从 P0 到 P3 排列。本文件是 task-breakdown 级别的执行计划，包含每个 task 的文件改动、技术细节和验证方式。

---

## Issue 1 · Watchlist + Portfolio 双轨整合 [P0, ~1.5d]

**原则**：两条轨道各有价值——portfolio 侧重**风险和权重**（体检、ActionBar drag 计算），watchlist 侧重**关注和机会**（可以关注未持仓的标的）。不是用一个表取代另一个，而是让消费方看到两者的**并集**，并区分对待。

### Task 1.1 · 前端 V2 symbols 来源改为 portfolio ∪ watchlist

**文件**：`frontend/src/app/for-you/_components/ForYouContentV2.tsx`

**改动**：
- 新增 `usePortfolio(user?.id)` hook 调用（已有 import 路径 `use-portfolio`）
- 合并 symbols 逻辑：
  ```
  watchlistSymbols = watchlistData?.symbols ?? []
  portfolioSymbols = portfolioData?.holdings?.map(h => h.symbol) ?? []
  symbols = deduplicate(portfolioSymbols.concat(watchlistSymbols))
  ```
- `dataLoading` 加入 `portfolioLoading`
- `needsOnboarding` 条件改为：`!profileData?.onboarded_at && symbols.length === 0`（两个来源都空才算需要 onboarding）

**验证**：
- Pro 用户有 watchlist 无 portfolio → symbols 来自 watchlist ✓
- Max 用户有 portfolio 无 watchlist → symbols 来自 portfolio ✓
- 两者都有 → 并集、去重 ✓
- 两者都空 → 显示 onboarding 引导 ✓
- `tsc --noEmit` clean

### Task 1.2 · 后端 Digest 生成读取 portfolio + watchlist 并集

**文件**：`backend/app/features/brew/router.py` → `generate_digest()` endpoint

**改动**：
- 在 `generate_digest` 内、执行 agent 之前加一段：
  ```python
  # Merge portfolio symbols for completeness
  try:
      portfolio_rows = await portfolio_db.list_portfolio(user_id)
      portfolio_syms = [r.symbol for r in portfolio_rows if r.symbol != "$CASH"]
      all_symbols = list(dict.fromkeys(body.symbols + portfolio_syms))[:25]
  except Exception:
      all_symbols = body.symbols
  ```
- 用 `all_symbols` 替代 `body.symbols` 传给 agent

**验证**：
- watchlist 有 [AAPL, NVDA]，portfolio 有 [NVDA, MSFT, $CASH] → digest 分析 [AAPL, NVDA, MSFT]（$CASH 排除）
- portfolio 读取失败 → fallback 到 body.symbols（watchlist only）
- 现有 pytest 不受影响（mock 场景不走 portfolio）

### Task 1.3 · Onboarding portfolio 保存失败时明确提示

**文件**：`frontend/src/app/for-you/onboarding/page.tsx` → `handleComplete()`

**改动**：
- 将 portfolio bulkSave 的空 catch 块改为捕获并记录：
  ```tsx
  try {
    await api.portfolio.bulkSave(portfolioRows);
  } catch {
    // Non-Max users — watchlist already saved, portfolio upgrade prompt
    portfolioSaveFailed = true;
  }
  ```
- 完成跳转时带参数：`router.push('/for-you?just_onboarded=1' + (portfolioSaveFailed ? '&portfolio_skipped=1' : ''))`

**验证**：
- Max 用户保存成功 → 跳转不带 `portfolio_skipped` ✓
- Pro 用户 portfolio 失败 → 跳转带 `portfolio_skipped=1` ✓

### Task 1.4 · 后端 brew agent instruction 区分持仓 vs 关注

**文件**：`backend/app/features/brew/agent.py` → `generate()` method

**改动**：
- 在 `data_for_agent` 中新增 `portfolio_symbols` 和 `watchlist_only_symbols` 字段
- Agent instruction 增加一段：
  ```
  ## 持仓 vs 关注
  - portfolio_symbols: 用户实际持仓的标的，分析时侧重风险、对用户的影响、与画像的匹配
  - watchlist_only_symbols: 用户仅关注但未持仓的标的，侧重机会、时机、是否值得建仓
  - 如果某只股票在 portfolio 里，引用时说"你持有的 X"；如果只在 watchlist，说"你关注的 X"
  ```

**验证**：
- 手动 curl 生成 digest，检查输出中持仓标的和关注标的的措辞差异
- 不需要新测试——agent 行为由 instruction 驱动，非纯函数

---

## Issue 2 · Onboarding 完成后即时反馈 [P0, ~0.5d]

### Task 2.1 · 主页检测 onboarded query param 显示 banner

**文件**：`frontend/src/app/for-you/_components/ForYouContentV2.tsx`

**改动**：
- 引入 `useSearchParams`（已在 Suspense 下），检测 `just_onboarded=1`
- 渲染一个一次性 success banner（在 ActionBar 位置之前）：
  - 有股票："投资画像已设置完成！首份专属日报将在今晚收盘后自动生成"
  - 无股票 + portfolio_skipped："画像已设置完成！添加关注股票后开始接收专属分析"+ CTA 按钮
  - 无股票："画像已设置完成！添加你的第一只关注股票"+ CTA 按钮
- 显示后立即用 `window.history.replaceState(null, '', '/for-you')` 清除 param（不用 `router.replace`——后者会触发 RSC re-render，仅清 query param 无需 React 参与）
- Banner 使用 emerald success 色调，3 秒后自动淡出或用户点击关闭

**验证**：
- 从 onboarding 完成跳回 → 看到 banner ✓
- 刷新页面 → banner 不再出现（param 已清除）✓
- 手动访问 `/for-you?just_onboarded=1` → 显示 banner ✓（无害）

### Task 2.2 · ActionBar 无 digest 时返回空 headline

**文件**：`backend/app/features/for_you/service.py` → `build_action_bar()`

**改动**：
- 在 stable fallback 分支（Rule 4）里，如果 `portfolio_daily_change is None`（意味着无 digest 数据）且 `health_latest` 也为空，将 headline 设为空字符串：
  ```python
  if not signals:
      portfolio_change = ...
      if portfolio_change is None and not health_latest:
          # No data yet — suppress ActionBar
          return ActionBar(severity="green", headline="", chips=[], source="template", generated_at=utcnow())
      signals.append(Signal(kind="stable", severity="green", data={"portfolio_daily_change": portfolio_change}))
  ```
- 前端已有 `if (data && !data.headline) return null` → ActionBar 自然隐藏

**验证**：
- 新增 pytest 用例：`test_action_bar_no_digest_no_health_returns_empty_headline`
- 有 digest 但 daily_change=0 → 仍显示"组合今日涨 0.0%"（不受影响）

---

## Issue 3 · QuickThesisInput 嵌入 [P1, ~0.75d]

### Task 3.1 · StockDetailPanel 底部嵌入 QuickThesisInput

**文件**：`frontend/src/components/for-you/StockDetailPanel.tsx`

**改动**：
- 接收新 prop：`thesis?: string | null`
- 在"查看完整分析"链接下方，当 `thesis` 为 null/undefined 时渲染 `<QuickThesisInput>`：
  ```tsx
  {!thesis && (
    <QuickThesisInput
      symbol={stock.symbol}
      context="detail_expand"
      onSave={(text) => onThesisSaved?.(stock.symbol, text)}
      onSkip={() => {}}
    />
  )}
  {thesis && (
    <p className="text-xs text-muted-foreground mt-3 italic">你的观点: {thesis}</p>
  )}
  ```
- 新增 prop: `onThesisSaved?: (symbol: string, thesis: string) => void`

**文件**：`frontend/src/components/for-you/StockOverviewPanel.tsx`
- 需要把 thesis 数据传递到 `StockDetailPanel` 和 `MobileStockItem`
- 新增 prop: `thesisMap?: Record<string, string>` — 从 portfolio holdings 提取

**文件**：`frontend/src/components/for-you/DigestInlineReport.tsx`
- 从 portfolio 数据构造 `thesisMap`，传给 `StockOverviewPanel`
- 新增 `usePortfolio` 调用或通过 prop 接收

**回调链**：`QuickThesisInput.onSave` → `api.portfolio.patch(symbol, { thesis })` → invalidate portfolio query → thesis 下次渲染时显示

**验证**：
- 展开一只无 thesis 的股票 → 看到 QuickThesisInput ✓
- 选预设"看好长期增长"→ 显示"已记住"→ 刷新后显示"你的观点: 看好长期增长"✓
- 展开已有 thesis 的股票 → 只显示 thesis 文本，不显示输入框 ✓
- $CASH symbol → 不显示 QuickThesisInput（无需 thesis）✓

### Task 3.2 · Portfolio 页保存后对新增 symbol 提示填写 thesis

**文件**：`frontend/src/app/for-you/portfolio/page.tsx`

**改动**：
- 在 `handleSave` 的 `onSuccess` 回调中，计算新增 symbols：
  ```tsx
  const previousSymbols = new Set((portfolioData?.holdings ?? []).map(h => h.symbol));
  const newSymbols = holdings.filter(h => !previousSymbols.has(h.symbol) && h.symbol !== '$CASH').map(h => h.symbol);
  if (newSymbols.length > 0) {
    setThesisPromptSymbols(newSymbols);
  }
  ```
- 新增 state: `thesisPromptSymbols: string[]`
- **上限 3 只**：如果 `newSymbols.length > 3`，不铺满输入框，改为一行提示"已保存 N 只新股，可在详情页随时添加观点"（避免批量导入时界面过长）
- `newSymbols.length <= 3` 时，在成功 banner 下方显示 QuickThesisInput 列表（每只新股一个，可逐个填或跳过）
- 全部完成/跳过后清空 `thesisPromptSymbols`

**验证**：
- 添加 2 只新股 + 保存 → 成功后看到 2 个 thesis 输入框 ✓
- 添加 5 只新股 + 保存 → 成功后看到一行文字提示（不铺输入框）✓
- 填一个、跳过一个 → 填的那个写入 DB ✓
- 编辑已有股票的金额但不添加新股 → 不显示 thesis 提示 ✓

### Task 3.3 · nice-to-have.md 加入更多 thesis 埋点想法

**文件**：`docs/plans/for-you/nice-to-have.md`

**新增条目**：
```markdown
## QuickThesisInput 更多埋点位置

**已实现**：
- StockDetailPanel 底部（context: detail_expand）
- Portfolio 页保存后新增 symbol（context: just_added）

**候选埋点**（按 ROI 排序）：
- ActionBar 红态 drawdown 时对 culprit_symbol 弹出（context: red_alert，"你当初为什么买 X？"）
- 板块体检结果页（未来 U2 scope）：对板块级别的观察
- 月度复盘 modal（U2-D scope）：对整个组合的年度 thesis
- digest 头条新闻下方：对特定事件的观点记录（需新 context: news_reaction）
- 研究页 /research 分析完成后：对研究结论的观点

**数据结构可扩展性**：
- `user_portfolios.thesis` 当前是 TEXT 字段（≤140 字）
- 未来考虑迁移到 `user_annotations` 表，支持:
  - 多种 annotation_type: thesis / sector_view / event_reaction
  - 关联到 symbol / sector / event_id
  - 时间戳 + 过期/归档机制
- 但 V1 阶段 TEXT 字段足够，迁移等数据量支撑后再做
```

---

## Issue 4 · FeedbackBar 嵌入 digest [P1, ~0.5d]

### Task 4.1 · StockDetailPanel / MobileStockItem 嵌入 FeedbackBar（阶段 1）

**文件**：`frontend/src/components/for-you/StockDetailPanel.tsx`

**改动**：
- 在 thesis 区域下方（或无 thesis 时在"查看完整分析"下方）加入：
  ```tsx
  <FeedbackBar
    targetType="digest_quick_take"
    targetId={`quick_take:${stock.symbol}:${digestDate}`}
    snapshot={{ text: stock.quick_take?.slice(0, 200) }}
  />
  ```
- 需要新增 prop: `digestDate: string`（从 DigestInlineReport 传入）

**文件**：`frontend/src/components/for-you/StockOverviewPanel.tsx`
- `MobileStockItem` 展开态底部同样嵌入 FeedbackBar
- 需要传入 `digestDate` prop

**验证**：
- 展开股票详情 → 底部看到 👍/👎 图标（opacity 0.4）✓
- 点 👍 → 变 brand 色 + "已记录"✓
- 点 👎 → 出现"不准/已知/不相关"三选 ✓
- `POST /api/feedback` 请求体 `target_type=digest_quick_take` ✓

### Task 4.2 · DigestInlineReport headline news 下方嵌入 FeedbackBar（阶段 2）

**文件**：`frontend/src/components/for-you/DigestInlineReport.tsx`

**改动**：
- 在 headlines section 每条 news 的 `deep_analysis` 段下方加入 FeedbackBar：
  ```tsx
  <FeedbackBar
    targetType="digest_headline"
    targetId={`digest_headline:${digest.timestamp.split('T')[0]}:${index}`}
    snapshot={{ text: item.fact_summary?.slice(0, 200) }}
  />
  ```

**验证**：
- 头条新闻下方看到 👍/👎 ✓
- target_id 包含日期和 index，同一天不同新闻不冲突 ✓

---

## Issue 5 · Health targetId 改为稳定 UUID [P1, ~0.25d]

### Task 5.1 · 后端 HealthResponse 加入 report_id

**文件**：`backend/app/features/portfolio_health/models.py`

**改动**：
- `HealthResponse` 新增：`report_id: Optional[str] = None`

**文件**：`backend/app/features/portfolio_health/service.py`

**改动**：
- 保存报告后从 DB 返回的行中提取 `id`（UUID），赋给 response 的 `report_id`
- 缓存命中时同样从缓存数据中提取 `report_id`

**文件**：`frontend/src/lib/api.ts`

**改动**：
- `HealthResponse` interface 加 `report_id?: string`

### Task 5.2 · 前端 health page 使用 report_id 作为 targetId

**文件**：`frontend/src/app/for-you/health/page.tsx`

**改动**：
```tsx
// Before:
targetId={`health:${diagnosis.one_line.slice(0, 20)}`}
// After:
targetId={`health:${displayReport?.report_id || displayReport?.generated_at || 'unknown'}`}
```

**验证**：
- 生成体检 → FeedbackBar 的 targetId 是 `health:<uuid>` 格式 ✓
- 旧缓存无 report_id → fallback 到 generated_at ✓
- 同一报告多次反馈 → 同一个 targetId ✓

---

## Issue 6 · Portfolio 删除改为 Save 时统一提交 [P2, ~0.5d]

### Task 6.1 · 重构 portfolio page 删除逻辑

**文件**：`frontend/src/app/for-you/portfolio/page.tsx`

**改动**：
- `handleRemove` 不再调 `deleteMutation.mutate()`，仅更新本地 state：
  ```tsx
  const handleRemove = useCallback((symbol: string) => {
    setHoldings(prev => prev.filter(h => h.symbol !== symbol));
    setDirty(true);
    setSaveSuccess(false);
  }, []);
  ```
- `handleSave` 的 `window.confirm` 保留——现在它是真正的确认了，因为删除尚未发生
- bulk save 是 full-replace 语义，发送当前 holdings 列表即可——不在列表中的 symbol 自动被后端删除
- 移除 `useDeleteHolding()` hook 的导入和使用（此页面不再需要）
- **新增 `beforeunload` 拦截**：当 `dirty === true` 时阻止用户离开页面（包括浏览器后退、关闭标签页、点其他导航）：
  ```tsx
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  ```
  这样用户编辑了持仓但忘记点 Save 就跳走时，浏览器会弹出确认提示。

**验证**：
- 删除一只股票 → UI 移除但不发 API 请求 ✓
- 点 Save → confirm 弹出 → 确认 → bulk save 发送（不含已删的 symbol）✓
- 点 Save → confirm → 取消 → 已删的 symbol 仍不在 UI 中（需要页面刷新恢复）
  - 这是可接受行为：用户选择取消后，可以继续编辑或刷新重来
- 添加 + 删除 + Save → 只保存最终列表 ✓
- 编辑后未保存 + 关闭标签 → 浏览器弹出"确定要离开？"✓
- 保存后 dirty=false + 关闭标签 → 无拦截 ✓

**注意**：`useDeleteHolding` hook 本身不删除——它仍被其他地方使用（如果有的话）。检查一下：
```bash
grep -rn "useDeleteHolding" frontend/src/ --include="*.tsx" --include="*.ts"
```
如果只在 portfolio page 使用，考虑保留 hook 但不在此页面用。

---

## Issue 7 · ActionBar 移动端响应式布局 [P2, ~0.25d]

### Task 7.1 · ActionBar 垂直布局适配

**文件**：`frontend/src/components/for-you/ActionBar.tsx`

**改动**：
- 外层 flex 加 breakpoint：
  ```tsx
  // Before:
  <div className="flex items-center gap-3 px-4 py-3 ...">
  // After:
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 ...">
  ```
- headline 移除 `truncate`，改为 `line-clamp-2 sm:truncate`（移动端允许 2 行）
- chips 区域加 `mt-1 sm:mt-0`

**验证**：
- 桌面（>640px）→ 一行布局不变 ✓
- 手机（<640px）→ headline 上、chips 下，headline 最多 2 行 ✓
- staleness headline（长文本）+ 2 chips → 手机上完整显示 ✓

---

## Issue 8 · Digest symbol pills 改为可点击链接 [P2, ~0.1d]

### Task 8.1

**文件**：`frontend/src/components/for-you/DigestInlineReport.tsx`

**改动**：
```tsx
// Before (line 55-59):
<span key={sym} className="px-2 py-1 bg-primary/10 ...">
  {sym}
</span>

// After:
import Link from 'next/link';
// ...
{sym === '$CASH' ? (
  <span key={sym} className="px-2 py-1 bg-primary/10 ...">
    {sym}
  </span>
) : (
  <Link key={sym} href={`/stock/${sym}`} className="px-2 py-1 bg-primary/10 ... hover:bg-primary/20 transition-colors">
    {sym}
  </Link>
)}
```

**验证**：
- 点击 NVDA pill → 跳转 `/stock/NVDA` ✓
- $CASH pill → 不可点击（无链接）✓
- hover 态有视觉变化 ✓

---

## Issue 9 · 删除死组件 [P3, ~0.1d]

### Task 9.1

**删除文件**：
- `frontend/src/components/for-you/PortfolioSnapshotBar.tsx`
- `frontend/src/components/for-you/OnboardingSection.tsx`
- `frontend/src/components/for-you/FeatureCards.tsx`
- `frontend/src/lib/portfolio-templates.ts`（仅被 OnboardingSection 引用）

**验证前先确认**：
```bash
grep -rn "PortfolioSnapshotBar\|OnboardingSection\|FeatureCards\|portfolio-templates" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "components/for-you/Portfolio\|components/for-you/Onboarding\|components/for-you/Feature\|lib/portfolio-templates"
```
确认无外部引用后再删。

**验证**：
- `tsc --noEmit` clean ✓
- `npm run build` 成功 ✓

---

## 实施顺序

按依赖关系和优先级排序：

```
Phase 1 · P0 必修（~2d）
  Task 2.2 → Issue 2 后端 ActionBar 空 headline（独立，先做，最快见效）
  Task 1.1 → Issue 1 前端 symbols 并集
  Task 1.2 → Issue 1 后端 digest symbols 并集
  Task 1.3 → Issue 1 onboarding 保存提示
  Task 1.4 → Issue 1 brew instruction 区分
  Task 2.1 → Issue 2 前端 onboarded banner

Phase 2 · P1 闭环（~1.5d）
  Task 5.1 + 5.2 → Issue 5 health targetId（小改动，先清理）
  Task 4.1 → Issue 4 FeedbackBar 嵌入 stock detail
  Task 4.2 → Issue 4 FeedbackBar 嵌入 headline news
  Task 3.1 → Issue 3 QuickThesisInput 嵌入 stock detail
  Task 3.2 → Issue 3 QuickThesisInput 嵌入 portfolio save
  Task 3.3 → Issue 3 nice-to-have 更新

Phase 3 · P2 打磨（~0.85d）
  Task 6.1 → Issue 6 portfolio 删除逻辑
  Task 7.1 → Issue 7 ActionBar 响应式
  Task 8.1 → Issue 8 symbol pills 链接

Phase 4 · P3 卫生（~0.1d）
  Task 9.1 → Issue 9 删除死组件
```

## 测试计划

每个 Phase 完成后：
1. `tsc --noEmit` — 零 TypeScript 错误
2. `npm run build` — 构建成功
3. 后端 `pytest tests/test_action_bar.py tests/test_portfolio_service.py` — 回归无 failure
4. 手动走一遍对应的 user story

全部完成后：
5. 完整 E2E walkthrough（新用户 + 回访用户两条线）
6. 移动端浏览器测试（ActionBar 布局、FeedbackBar 交互）

---

## 外部审核意见处理

| # | 建议 | 决定 | 理由 | 影响的 Task |
|---|------|------|------|-------------|
| 1 | Issue 2.1 用 `window.history.replaceState` 替代 `router.replace` 清除 URL param | **接受** | `router.replace` 触发 RSC re-render，仅清 query param 不需要 React 参与 | Task 2.1 已更新 |
| 2 | Issue 3.2 thesis 提示限制上限 3 只，超出改为一行提示 | **接受** | 批量导入 10+ 只股票时铺满输入框会压垮界面 | Task 3.2 已更新 |
| 3 | Issue 6.1 顺手加 `beforeunload` 脏数据离开拦截 | **接受** | `dirty` state 已有，一个 `useEffect` 即可，防"编辑了忘记保存就跳走" | Task 6.1 已更新 |
