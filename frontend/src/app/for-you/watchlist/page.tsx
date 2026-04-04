'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import StockCard from '@/components/StockCard';
import { Command } from 'cmdk';
import StockSearchDropdown from '@/components/StockSearchDropdown';
import { WatchlistData } from '@/lib/api';
import { clearStaleAuthAction } from '@/app/actions/auth';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { STOCK_NAMES } from '@/lib/stock-names';
import { useStockSearch } from '@/hooks/useStockSearch';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';
import { useStockQuotes } from '@/hooks/queries/use-stock-data';
import { queryKeys } from '@/hooks/queries/query-keys';

const MAX_WATCHLIST_SIZE = 25;

const POPULAR_GROUPS: { label: string; symbols: string[] }[] = [
  { label: 'Mag 7', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'] },
  { label: 'AI & 芯片', symbols: ['AMD', 'AVGO', 'TSM', 'ARM', 'QCOM', 'MU', 'ASML'] },
  { label: '云 & 软件', symbols: ['CRM', 'ORCL', 'NOW', 'PLTR', 'SNOW', 'DDOG', 'NET', 'CRWD'] },
  { label: '金融', symbols: ['JPM', 'GS', 'V', 'MA', 'BRK.B', 'BLK', 'AXP'] },
  { label: '消费', symbols: ['COST', 'WMT', 'MCD', 'SBUX', 'NKE', 'KO', 'PEP'] },
  { label: '中概', symbols: ['BABA', 'PDD', 'BIDU', 'NIO', 'LI', 'XPEV'] },
];

function normalizeSymbols(symbols?: string[]) {
  if (!symbols) return [];
  return [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
}

function isConflictError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return 'status' in error && (error as unknown as { status: number }).status === 409;
}

function WatchlistPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // --- TanStack Query hooks ---
  const {
    data: watchlistData,
    isLoading: watchlistLoading,
    isError: loadFailed,
    isSuccess: watchlistLoaded,
    error: watchlistError,
  } = useWatchlist(user?.id, !!user?.id);
  const saveWatchlistMutation = useSaveWatchlist();

  // Local editing state seeded from query once per authenticated user.
  const [symbols, setSymbols] = useState<string[]>([]);
  const [seededUserId, setSeededUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const lastPersistedRef = useRef<Pick<WatchlistData, 'symbols' | 'updated_at'>>({
    symbols: [],
    updated_at: undefined,
  });
  const saveRequestIdRef = useRef(0);

  const { data: quotesResponse, isLoading: loadingQuotes } = useStockQuotes(symbols);
  const quotes = useMemo(() => {
    const map: Record<string, import('@/lib/api').StockQuote> = {};
    if (quotesResponse?.quotes) {
      for (const q of quotesResponse.quotes) {
        map[q.symbol] = q;
      }
    }
    return map;
  }, [quotesResponse]);

  const loading = watchlistLoading;

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [extraNames, setExtraNames] = useState<Record<string, { en: string; zh: string }>>({});

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const loadErrorMessage = getAuthErrorPresentation(
    watchlistError,
    '无法连接到服务器，请刷新页面重试。为保护你的数据，在加载成功前无法编辑持仓。'
  ).message;

  const atLimit = symbols.length >= MAX_WATCHLIST_SIZE;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you/watchlist');
    }
  }, [authLoading, isAuthenticated, router]);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing external/server state to local editing state */

  // Reset local editing state when user changes (avoid cross-account bleed).
  useEffect(() => {
    setSymbols([]);
    setSeededUserId(null);
    setSaveError(null);
    lastPersistedRef.current = { symbols: [], updated_at: undefined };
    saveRequestIdRef.current = 0;
  }, [user?.id]);

  // Seed symbols from server exactly once per user after watchlist query resolves.
  useEffect(() => {
    if (!user?.id || !watchlistLoaded || loadFailed) return;
    const hasQueuedSave = saveTimeoutRef.current !== null;
    if (seededUserId === user.id && (hasQueuedSave || saveWatchlistMutation.isPending)) return;

    const normalized = normalizeSymbols(watchlistData?.symbols);
    lastPersistedRef.current = {
      symbols: normalized,
      updated_at: watchlistData?.updated_at,
    };
    setSymbols(normalized);
    setSeededUserId(user.id);
    setSaveError(null);
  }, [
    user?.id,
    watchlistData,
    watchlistLoaded,
    loadFailed,
    seededUserId,
    saveWatchlistMutation.isPending,
  ]);

  /* eslint-enable react-hooks/set-state-in-effect */


  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const getDisplayName = (symbol: string) => {
    const names = STOCK_NAMES[symbol] || extraNames[symbol];
    return names?.zh || names?.en || symbol;
  };

  const persist = useCallback((newSymbols: string[]) => {
    if (!user?.id) return;
    // Never save before initial load succeeds -- a failed load leaves symbols=[],
    // which would overwrite the user's real watchlist with empty data.
    if (!watchlistLoaded) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const rollbackSnapshot = {
      symbols: [...lastPersistedRef.current.symbols],
      updated_at: lastPersistedRef.current.updated_at,
    };
    const requestId = ++saveRequestIdRef.current;
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveWatchlistMutation.mutate(
        {
          userId: user.id,
          symbols: newSymbols,
          baseUpdatedAt: rollbackSnapshot.updated_at,
        },
        {
          onSuccess: (result) => {
            if (requestId !== saveRequestIdRef.current) return;
            const serverSymbols = normalizeSymbols(result.data?.symbols || newSymbols);
            lastPersistedRef.current = {
              symbols: serverSymbols,
              updated_at: result.data?.updated_at,
            };
            setSymbols(serverSymbols);
            setSaveError(null);
          },
          onError: async (error) => {
            if (requestId !== saveRequestIdRef.current) return;
            setSymbols(rollbackSnapshot.symbols);
            lastPersistedRef.current = rollbackSnapshot;
            setSaveError(
              isConflictError(error)
                ? '持仓已在其他页面被更新，已恢复到最新保存版本，请刷新后重试。'
                : getAuthErrorPresentation(error, '保存持仓失败，请重试。').message,
            );
            await queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.byUser(user.id) });
          },
        }
      );
    }, 500);
  }, [user, watchlistLoaded, saveWatchlistMutation, queryClient]);

  const handleRemoveSymbol = useCallback((symbolToRemove: string) => {
    const newSymbols = symbols.filter(s => s !== symbolToRemove);
    setSymbols(newSymbols);
    persist(newSymbols);
  }, [symbols, persist]);

  const addSymbol = useCallback((symbol: string, name?: string) => {
    if (symbols.length >= MAX_WATCHLIST_SIZE) return;
    const sym = symbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      const newSymbols = [...symbols, sym];
      setSymbols(newSymbols);
      if (name && !STOCK_NAMES[sym] && !extraNames[sym]) {
        setExtraNames(prev => ({ ...prev, [sym]: { en: name, zh: '' } }));
      }
      persist(newSymbols);
    }
  }, [symbols, persist, extraNames]);

  const handleSearchNavigate = useCallback((result: { symbol: string; name: string }) => {
    router.push(`/stock/${result.symbol}`);
  }, [router]);

  const handleSearchAdd = useCallback((result: { symbol: string; name: string }) => {
    addSymbol(result.symbol, result.name);
  }, [addSymbol]);

  const handleEnterRaw = useCallback((query: string) => {
    addSymbol(query);
  }, [addSymbol]);

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

  const handleSearchAddAndReset = useCallback((result: { symbol: string; name: string }) => {
    handleSearchAdd(result);
    resetAfterSelect();
  }, [handleSearchAdd, resetAfterSelect]);

  const handleSearchNavigateAndReset = useCallback((result: { symbol: string; name: string }) => {
    handleSearchNavigate(result);
    resetAfterSelect();
  }, [handleSearchNavigate, resetAfterSelect]);

  const handleClearAll = () => {
    setSymbols([]);
    persist([]);
    setShowClearConfirm(false);
  };

  const handleReLogin = async () => {
    setIsReauthenticating(true);
    try {
      await clearStaleAuthAction();
    } finally {
      window.location.assign('/login?redirect=/for-you/watchlist');
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
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
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6">
        <Link
          href="/for-you"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          返回专属日报
        </Link>
      </div>

      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">FOR YOU</span>
              <span className="text-muted-foreground text-xs font-medium tracking-[0.15em]">/ WATCHLIST</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">管理持仓</h1>
            <p className="text-muted-foreground text-sm md:text-base">添加或移除你关注的股票</p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      ) : loadFailed ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-400 font-medium">加载持仓数据失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {loadErrorMessage}
            </p>
            <button
              type="button"
              onClick={handleReLogin}
              disabled={isReauthenticating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/20 bg-background/80 text-sm font-medium text-foreground transition-all hover:border-primary/30 hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReauthenticating ? '跳转中...' : '重新登录'}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-10">
          {saveError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {saveError}
            </div>
          )}

          <div ref={searchContainerRef} className="relative">
            <Command shouldFilter={false} loop onKeyDown={(e) => {
              if (e.key === 'Escape') closeDropdown();
              if (e.key === 'Enter' && (!showSearchDropdown || searchResults.length === 0) && searchQuery.trim()) {
                e.preventDefault();
                handleEnterRaw(searchQuery.trim().toUpperCase());
                clearSearch();
              }
            }}>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                atLimit ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-card/80 focus-within:border-primary/40'
              }`}>
                <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Command.Input
                  value={searchQuery}
                  onValueChange={onQueryChange}
                  {...inputHandlers}
                  placeholder="搜索股票代码或公司名称..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ textTransform: 'uppercase' }}
                />
                <span className={`text-xs font-mono tabular-nums shrink-0 ${
                  atLimit ? 'text-amber-400' : 'text-muted-foreground'
                }`}>
                  {symbols.length}/{MAX_WATCHLIST_SIZE}
                </span>
              </div>

              {showSearchDropdown && (
                <StockSearchDropdown
                  results={searchResults}
                  isSearching={isSearching}
                  showEmpty={true}
                  mode="watchlist"
                  inListSymbols={symbols}
                  onSelect={handleSearchNavigateAndReset}
                  onAdd={handleSearchAddAndReset}
                  atLimit={atLimit}
                />
              )}
            </Command>
          </div>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">当前持仓</h2>
                {symbols.length > 0 && (
                  <span className="text-xs text-muted-foreground">{symbols.length} 只</span>
                )}
              </div>
              {symbols.length > 0 && (
                <div className="flex items-center gap-2">
                  {showClearConfirm ? (
                    <>
                      <span className="text-xs text-muted-foreground">确定清空所有持仓?</span>
                      <button
                        onClick={handleClearAll}
                        className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      清空全部
                    </button>
                  )}
                </div>
              )}
            </div>

            {symbols.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  搜索或从下方板块快速添加你关注的股票
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {symbols.map((symbol, idx) => (
                  <StockCard
                    key={symbol}
                    symbol={symbol}
                    quote={quotes[symbol]}
                    displayName={getDisplayName(symbol)}
                    index={idx}
                    isLoading={loadingQuotes}
                    onRemove={() => handleRemoveSymbol(symbol)}
                    onClick={() => router.push(`/stock/${symbol}`)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-5 bg-amber-400 rounded-full" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">热门股票</h2>
            </div>
            <div className="space-y-5">
              {POPULAR_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-xs text-muted-foreground/60 font-medium mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.symbols.map(sym => {
                      const inList = symbols.includes(sym);
                      const name = STOCK_NAMES[sym];
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => inList ? handleRemoveSymbol(sym) : addSymbol(sym, name?.en)}
                          disabled={!inList && atLimit}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            inList
                              ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/5 hover:border-primary/20'
                              : 'border-border/50 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5'
                          }`}
                        >
                          {inList && (
                            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className="font-data font-semibold">{sym}</span>
                          {name?.zh && <span className="text-muted-foreground/70">{name.zh}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function WatchlistPage() {
  return (
    <PaywallGuard>
      <WatchlistPageContent />
    </PaywallGuard>
  );
}
