'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Command } from 'cmdk';
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
import { Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import PaywallGuard from '@/components/PaywallGuard';
import HoldingsSyncDialog from '@/components/holdings-sync/HoldingsSyncDialog';
import { useStockSearch } from '@/hooks/useStockSearch';
import { usePortfolio, useSavePortfolio } from '@/hooks/queries/use-portfolio';
import StockSearchDropdown from '@/components/StockSearchDropdown';
import { Button } from '@/components/ui/button';
import { STOCK_NAMES } from '@/lib/stock-names';
import { formatStockPrice, getCurrency } from '@/lib/currency';
import type { HoldingInput, HoldingView } from '@/lib/api';
import { QuickThesisInput } from '@/components/memory/QuickThesisInput';

// Track M 决策：持仓上限 30 → 60（与后端 BulkPortfolioRequest.max_length 一致）
const MAX_HOLDINGS = 60;

interface LocalHolding {
  symbol: string;
  name: string;
  amount: number | null;
  currency: string;
  entry_price?: number;
  shares?: number;
}

/**
 * A "ghost" holding row exists in user_portfolios but has no quantitative
 * data — produced when a user answers a thesis prompt on a watchlist symbol
 * (PATCH /portfolio/{symbol} with only `thesis`). It must not appear in the
 * editor UI (would look like an empty mystery row) but its thesis must be
 * preserved on Save (passed through as a non-visible row).
 */
function isGhost(h: HoldingView): boolean {
  return (
    (h.effective_weight_pct ?? 0) === 0
    && h.shares == null
    && h.cost_basis == null
    && h.weight_pct == null
  );
}

function holdingsToLocal(holdings: HoldingView[], extraNames: Record<string, string>): LocalHolding[] {
  return holdings.map((h) => ({
    symbol: h.symbol,
    name: STOCK_NAMES[h.symbol]?.zh || STOCK_NAMES[h.symbol]?.en || extraNames[h.symbol] || h.symbol,
    amount: h.cost_basis ?? null,
    currency: getCurrency(h.symbol).code,
    entry_price: h.entry_price ?? undefined,
    shares: h.shares ?? undefined,
  }));
}

function PortfolioEditorContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { has: hasFlag, isLoading: flagsLoading } = useFeatureFlags();

  const {
    data: portfolioData,
    isLoading: portfolioLoading,
    isError: loadFailed,
  } = usePortfolio(user?.id);

  const saveMutation = useSavePortfolio();

  const [holdings, setHoldings] = useState<LocalHolding[]>([]);
  const [dirty, setDirty] = useState(false);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [thesisPromptSymbols, setThesisPromptSymbols] = useState<string[]>([]);
  const [conversionInfo, setConversionInfo] = useState<Record<string, { shares: number; entry_price: number }>>({});
  const syncedForUser = useRef<string | null>(null);
  /**
   * Snapshot of ghost rows captured at SYNC time (not Save time). This avoids a
   * cross-tab race: if another tab deletes a real holding while the editor is
   * dirty, react-query refetches and its row turns into a ghost (no quantitative
   * data) — Save shouldn't resurrect it via passthrough.
   */
  const ghostHoldingsRef = useRef<HoldingView[]>([]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you/portfolio');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Sync holdings from server data.
  // Runs on: initial load, back-navigation (cache hit), user change, save success (dirty reset).
  // Skipped when user has unsaved local edits (dirty === true).
  useEffect(() => {
    if (!user?.id) return;
    if (loadFailed) return;

    // User changed — reset everything.
    // setState-in-effect is the correct pattern here: we're resetting derived
    // state when the user identity changes, not syncing to an external system.
    if (syncedForUser.current !== null && syncedForUser.current !== user.id) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setHoldings([]);
      setDirty(false);
      setSaveError(null);
      setSaveSuccess(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      syncedForUser.current = user.id;
      return;
    }

    if (dirty) return;
    if (!portfolioData) return;

    syncedForUser.current = user.id;
    const allHoldings = portfolioData.holdings ?? [];
    const visible = allHoldings.filter((h) => !isGhost(h));
    setHoldings(holdingsToLocal(visible, extraNames));
    // Snapshot ghosts AT SYNC TIME — see ghostHoldingsRef comment for rationale.
    ghostHoldingsRef.current = allHoldings.filter(isGhost);
  }, [user?.id, portfolioData, loadFailed, dirty, extraNames]);

  const atLimit = holdings.length >= MAX_HOLDINGS;
  const symbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);

  // Per-currency subtotals
  const currencySubtotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      if (h.amount != null && h.amount > 0) {
        map[h.currency] = (map[h.currency] ?? 0) + h.amount;
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [holdings]);

  // --- Stock search ---
  const {
    query: searchQuery,
    results: searchResults,
    isSearching,
    open: showSearchDropdown,
    containerRef: searchContainerRef,
    onQueryChange,
    inputHandlers,
    resetAfterSelect,
    closeDropdown,
    clearSearch,
  } = useStockSearch();

  const addHolding = useCallback(
    (symbol: string, name?: string) => {
      if (holdings.length >= MAX_HOLDINGS) return;
      const sym = symbol.trim().toUpperCase();
      if (!sym || holdings.some((h) => h.symbol === sym)) return;

      const displayName = STOCK_NAMES[sym]?.zh || STOCK_NAMES[sym]?.en || name || sym;
      if (name && !STOCK_NAMES[sym] && !extraNames[sym]) {
        setExtraNames((prev) => ({ ...prev, [sym]: name }));
      }

      setHoldings((prev) => [
        ...prev,
        { symbol: sym, name: displayName, amount: null, currency: getCurrency(sym).code },
      ]);
      setDirty(true);
    },
    [holdings, extraNames],
  );

  const handleSearchAdd = useCallback(
    (result: { symbol: string; name: string }) => {
      addHolding(result.symbol, result.name);
      resetAfterSelect();
    },
    [addHolding, resetAfterSelect],
  );

  const handleSearchNavigate = useCallback(
    (result: { symbol: string; name: string }) => {
      addHolding(result.symbol, result.name);
      resetAfterSelect();
    },
    [addHolding, resetAfterSelect],
  );

  const handleEnterRaw = useCallback(
    (query: string) => {
      addHolding(query);
      clearSearch();
    },
    [addHolding, clearSearch],
  );

  const handleAmountChange = useCallback((symbol: string, newAmount: number | null) => {
    setHoldings((prev) =>
      prev.map((h) => (h.symbol === symbol ? { ...h, amount: newAmount } : h)),
    );
    setDirty(true);
    setSaveSuccess(false);
  }, []);

  const updateHolding = useCallback((index: number, patch: Partial<LocalHolding>) => {
    setHoldings((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
    setDirty(true);
    setSaveSuccess(false);
  }, []);

  const handleRemove = useCallback(
    (symbol: string) => {
      setHoldings((prev) => prev.filter((h) => h.symbol !== symbol));
      setDirty(true);
      setSaveSuccess(false);
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!user?.id) return;

    // Use sync-time snapshot of ghost rows (see ghostHoldingsRef comment).
    const ghostHoldings = ghostHoldingsRef.current;
    const serverHoldings = portfolioData?.holdings ?? [];
    // Only "visible" (non-ghost) server symbols count for the removal confirm,
    // so the user isn't asked about thesis-only rows they never saw.
    const serverSymbols = new Set(
      serverHoldings.filter((h) => !isGhost(h)).map((h) => h.symbol)
    );
    const localSymbols = new Set(holdings.map((h) => h.symbol));
    const removed = [...serverSymbols].filter((s) => !localSymbols.has(s));
    if (removed.length > 0) {
      const msg =
        holdings.length === 0
          ? `即将清空所有持仓 (${removed.join(', ')})，确认保存？`
          : `即将移除 ${removed.join(', ')}，确认保存？`;
      const ok = window.confirm(msg);
      if (!ok) return;
    }

    setSaveError(null);
    setSaveSuccess(false);

    // Memory fields (thesis/target/stop_loss/conviction) live on every
    // user_portfolios row, but the editor only edits cost/shares/entry_price.
    // bulk_replace is full-overwrite (`thesis ?? null`), so without merging
    // we'd silently NULL out the user's thesis on every Save. Build a map
    // from ALL server rows (active + ghost) so:
    //  - editing a real holding's amount preserves its thesis
    //  - promoting a ghost (typing the same symbol) preserves its thesis
    const serverMemory = new Map(
      serverHoldings.map((h) => [
        h.symbol,
        {
          thesis: h.thesis ?? null,
          target: h.target ?? null,
          stop_loss: h.stop_loss ?? null,
          conviction: h.conviction ?? null,
        },
      ]),
    );

    const visibleRows: HoldingInput[] = holdings.map((h) => {
      const memory = serverMemory.get(h.symbol);
      return {
        symbol: h.symbol,
        cost_basis: h.amount,
        entry_price: h.entry_price ?? null,
        shares: h.shares ?? null,
        ...(memory ?? {}),
      };
    });
    // Pass through thesis-only ghost rows so bulk_replace doesn't drop them
    // (their PATCH-saved thesis must survive a portfolio Save). Skip ghosts
    // whose symbol the user explicitly typed back into the editor — their
    // memory is already merged into the visibleRow above.
    const ghostRows: HoldingInput[] = ghostHoldings
      .filter((g) => !localSymbols.has(g.symbol))
      .map((g) => ({
        symbol: g.symbol,
        thesis: g.thesis ?? null,
        target: g.target ?? null,
        stop_loss: g.stop_loss ?? null,
        conviction: g.conviction ?? null,
        cost_basis: null,
        entry_price: null,
        shares: null,
        weight_pct: null,
      }));
    const rows: HoldingInput[] = [...visibleRows, ...ghostRows];

    saveMutation.mutate(
      { userId: user.id, rows },
      {
        onSuccess: (data) => {
          const serverHoldings = data?.holdings ?? [];
          // Filter ghosts inline so the visible list updates atomically with
          // Save success — without this, raw server rows render for one tick
          // until the sync effect reruns, producing a brief ghost "flash".
          setHoldings(holdingsToLocal(serverHoldings.filter((h: HoldingView) => !isGhost(h)), extraNames));
          // Refresh ghost snapshot from the save response so a rapid second
          // Save uses current truth; the sync effect will reconcile once the
          // invalidated query refetches.
          ghostHoldingsRef.current = serverHoldings.filter(isGhost);
          setDirty(false);
          // newSyms = symbols user typed that weren't *visible* before. Ghost
          // rows count as "new" because the user didn't see them previously,
          // and now they may have been promoted to a real position.
          const previousSyms = new Set(
            (portfolioData?.holdings ?? [])
              .filter((h: HoldingView) => !isGhost(h))
              .map((h: HoldingView) => h.symbol)
          );
          const newSyms = holdings.filter(h => !previousSyms.has(h.symbol) && h.symbol !== '$CASH').map(h => h.symbol);
          if (newSyms.length > 0) {
            setThesisPromptSymbols(newSyms);
          }
          const conversions: Record<string, { shares: number; entry_price: number }> = {};
          for (const h of serverHoldings) {
            if (h.entry_price && h.shares && newSyms.includes(h.symbol)) {
              conversions[h.symbol] = { shares: h.shares, entry_price: h.entry_price };
            }
          }
          if (Object.keys(conversions).length > 0) {
            setConversionInfo(conversions);
          }
          setSaveSuccess(true);
          setSaveError(null);
          setTimeout(() => setSaveSuccess(false), 3000);
        },
        onError: () => {
          setSaveError('保存失败，请重试。');
        },
      },
    );
  }, [user, portfolioData?.holdings, holdings, saveMutation, extraNames]);

  // --- Render ---

  // Feature flag guard: redirect V1 users back to /for-you
  if (!flagsLoading && !hasFlag('for_you_v2')) {
    router.push('/for-you');
    return null;
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 md:px-6 pt-6">
        <ForYouBreadcrumb current="模拟持仓" />
      </div>

      {/* Header */}
      <section className="border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">FOR YOU</span>
              <span className="text-muted-foreground text-xs font-medium tracking-[0.15em]">/ PORTFOLIO</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">模拟持仓</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              输入你在每只股票上的模拟投入金额，我们将据此计算持仓权重
            </p>
            {hasFlag('holdings_sync_import') && !flagsLoading && (
              <div className="pt-2">
                <HoldingsSyncDialog
                  trigger={
                    <button
                      type="button"
                      className="group inline-flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 px-3.5 py-2 text-sm font-medium text-foreground hover:border-border/60 hover:bg-card/70 transition-colors"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 group-hover:bg-emerald-400 transition-colors" />
                      <span>同步持仓</span>
                      <span className="text-muted-foreground text-xs">截图 / 粘贴 / CSV / PDF</span>
                    </button>
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {portfolioLoading ? (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      ) : loadFailed ? (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-400 font-medium">加载持仓数据失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              无法连接到服务器，请刷新页面重试。
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Error / Success feedback */}
          {saveError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
              持仓已保存
            </div>
          )}

          {thesisPromptSymbols.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 space-y-3">
              <p className="text-sm font-medium text-foreground">记录你的投资观点</p>
              {thesisPromptSymbols.length <= 3 ? (
                thesisPromptSymbols.map(sym => (
                  <QuickThesisInput
                    key={sym}
                    symbol={sym}
                    context="just_added"
                    onSave={() => setThesisPromptSymbols(prev => prev.filter(s => s !== sym))}
                    onSkip={() => setThesisPromptSymbols(prev => prev.filter(s => s !== sym))}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  已保存 {thesisPromptSymbols.length} 只新股，可在详情页随时添加观点
                </p>
              )}
              {thesisPromptSymbols.length <= 3 && thesisPromptSymbols.length > 0 && (
                <button
                  type="button"
                  onClick={() => setThesisPromptSymbols([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  全部跳过
                </button>
              )}
            </div>
          )}

          {/* Auto-conversion info */}
          {Object.keys(conversionInfo).length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-2 animate-fade-in-up">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                股数按录入当日价格自动折算。如果实际买入价不同，可以在下方修正成本。
              </p>
              {Object.entries(conversionInfo).map(([sym, info]) => (
                <div key={sym} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{sym}</span>
                  <span className="text-muted-foreground">
                    按 {formatStockPrice(info.entry_price, sym, undefined, { compactPrice: true })} 折算 &rarr; {info.shares.toFixed(2)} 股
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center justify-end">
            <Button
              onClick={handleSave}
              disabled={!dirty || saveMutation.isPending}
              size="sm"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存持仓'
              )}
            </Button>
          </div>

          {/* Quick add $CASH */}
          {!holdings.some((h) => h.symbol === '$CASH') && !atLimit && (
            <button
              type="button"
              onClick={() => addHolding('$CASH', '现金')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/50 bg-card/30 hover:border-primary/30 hover:bg-card/60 text-sm text-muted-foreground hover:text-foreground transition-all w-full"
            >
              <span className="text-base">$</span>
              <span className="font-mono font-medium">添加现金头寸 ($CASH · USD)</span>
            </button>
          )}

          {/* Search bar */}
          <div ref={searchContainerRef} className="relative">
            <Command
              shouldFilter={false}
              loop
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeDropdown();
                if (
                  e.key === 'Enter' &&
                  (!showSearchDropdown || searchResults.length === 0) &&
                  searchQuery.trim()
                ) {
                  e.preventDefault();
                  handleEnterRaw(searchQuery.trim().toUpperCase());
                }
              }}
            >
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  atLimit
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-border/50 bg-card/80 focus-within:border-primary/40'
                }`}
              >
                <svg
                  className="w-5 h-5 text-muted-foreground shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <Command.Input
                  value={searchQuery}
                  onValueChange={onQueryChange}
                  {...inputHandlers}
                  placeholder="搜索股票代码或公司名称..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ textTransform: 'uppercase' }}
                />
                <span
                  className={`text-xs font-mono tabular-nums shrink-0 ${
                    atLimit ? 'text-amber-400' : 'text-muted-foreground'
                  }`}
                >
                  {holdings.length}/{MAX_HOLDINGS}
                </span>
              </div>

              {showSearchDropdown && (
                <StockSearchDropdown
                  results={searchResults}
                  isSearching={isSearching}
                  showEmpty={true}
                  mode="watchlist"
                  inListSymbols={symbols}
                  onSelect={handleSearchNavigate}
                  onAdd={handleSearchAdd}
                  atLimit={atLimit}
                />
              )}
            </Command>
          </div>

          {/* Holdings list */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                当前持仓
              </h2>
              {holdings.length > 0 && (
                <span className="text-xs text-muted-foreground">{holdings.length} 只</span>
              )}
            </div>

            {holdings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  还没有持仓，添加你的第一只股票
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {holdings.map((holding, i) => {
                  const cur = getCurrency(holding.symbol);
                  return (
                    <div
                      key={holding.symbol}
                      className="rounded-xl border border-border/50 bg-card/80 px-4 py-3 space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        {/* Symbol */}
                        <div className="w-16 shrink-0">
                          {holding.symbol === '$CASH' ? (
                            <span className="font-mono font-semibold text-sm text-foreground">
                              {holding.symbol}
                            </span>
                          ) : (
                            <Link
                              href={`/stock/${holding.symbol}`}
                              className="font-mono font-semibold text-sm text-foreground hover:text-primary transition-colors"
                            >
                              {holding.symbol}
                            </Link>
                          )}
                        </div>

                        {/* Name */}
                        <span className="text-sm text-muted-foreground truncate min-w-0 flex-1">
                          {holding.name !== holding.symbol ? holding.name : ''}
                        </span>

                        {/* Currency label */}
                        <span className="text-xs text-muted-foreground font-mono shrink-0 w-8 text-right">
                          {cur.code}
                        </span>

                        {/* Amount input */}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={holding.amount ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleAmountChange(holding.symbol, null);
                            } else {
                              const val = Math.max(0, Math.round(Number(raw)));
                              handleAmountChange(holding.symbol, val);
                            }
                          }}
                          placeholder="金额"
                          className="w-24 text-right text-sm font-data font-semibold tabular-nums text-foreground bg-transparent border border-border/50 rounded-md px-2 py-1 outline-none focus:border-primary/50 placeholder:text-muted-foreground/70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleRemove(holding.symbol)}
                          className="text-muted-foreground/70 hover:text-red-400 transition-colors shrink-0 cursor-pointer p-1"
                          aria-label={`删除 ${holding.symbol}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Entry price edit — only shown when shares exist */}
                      {holding.shares != null && holding.shares > 0 && (
                        <div className="flex items-center gap-2 pl-16">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">买入均价</label>
                          <input
                            type="number"
                            value={holding.entry_price ?? ''}
                            onChange={(e) => {
                              const newPrice = e.target.value ? parseFloat(e.target.value) : undefined;
                              updateHolding(i, {
                                entry_price: newPrice,
                                shares: newPrice && holding.amount ? Number((holding.amount / newPrice).toFixed(6)) : holding.shares,
                              });
                            }}
                            placeholder="自动"
                            className="w-20 text-xs px-2 py-1 rounded border border-border/50 bg-background text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min={0}
                            step={0.01}
                          />
                          {holding.shares != null && (
                            <span className="text-xs text-muted-foreground">
                              = {holding.shares.toFixed(2)} 股
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Per-currency subtotals */}
          {currencySubtotals.length > 0 && (
            <section className="rounded-xl border border-border/50 bg-card/80 px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">小计</span>
                {currencySubtotals.map(([code, total]) => (
                  <span
                    key={code}
                    className="text-sm font-data font-semibold tabular-nums text-foreground"
                  >
                    {code} {total.toLocaleString()}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Hint text */}
          {holdings.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              不填金额 = 等权分配 &middot; 跨币种权重为近似值
            </p>
          )}
        </div>
      )}
    </main>
  );
}

export default function PortfolioPage() {
  return (
    <PaywallGuard requiredPlan="max">
      <PortfolioEditorContent />
    </PaywallGuard>
  );
}
