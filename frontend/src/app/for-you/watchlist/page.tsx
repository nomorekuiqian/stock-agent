'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import StockCard from '@/components/StockCard';
import StockSearchDropdown from '@/components/StockSearchDropdown';
import { api, SectorInfo, WatchlistData } from '@/lib/api';
import { STOCK_NAMES } from '@/lib/stock-names';
import { useStockSearch } from '@/hooks/useStockSearch';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';
import { useStockQuotes } from '@/hooks/queries/use-stock-data';
import { queryKeys } from '@/hooks/queries/query-keys';

const MAX_WATCHLIST_SIZE = 25;

const SECTOR_CATEGORIES: { label: string; ids: string[] }[] = [
  { label: '核心科技', ids: ['mag7', 'ai', 'chips', 'software'] },
  { label: '金融消费', ids: ['finance', 'payments', 'consumer'] },
  { label: '行业板块', ids: ['ev', 'healthcare', 'energy', 'defense'] },
  { label: '热门主题', ids: ['china', 'crypto', 'streaming'] },
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
  const { data: watchlistData, isLoading: watchlistLoading, isError: loadFailed, isSuccess: watchlistLoaded } = useWatchlist(user?.id, !!user?.id);
  const saveWatchlistMutation = useSaveWatchlist();

  // Local editing state seeded from query once per authenticated user.
  const [symbols, setSymbols] = useState<string[]>([]);
  const [seededUserId, setSeededUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const loading = watchlistLoading;

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [extraNames, setExtraNames] = useState<Record<string, { en: string; zh: string }>>({});

  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmingSectorRemove, setConfirmingSectorRemove] = useState<string | null>(null);
  const sectorRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Load sectors (no TanStack Query hook for this)
  useEffect(() => {
    const loadSectors = async () => {
      try {
        const sectorList = await api.sectors.list();
        setSectors(sectorList);
      } catch (err) {
        console.error('Failed to load sectors:', err);
      }
    };
    if (user?.id) loadSectors();
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (sectorRemoveTimerRef.current) clearTimeout(sectorRemoveTimerRef.current);
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
                : error instanceof Error
                  ? error.message
                  : '保存持仓失败，请重试。',
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
    results: searchResults,
    isSearching,
    showDropdown: showSearchDropdown,
    highlightedIndex,
    containerRef: searchContainerRef,
    inputProps: searchInputProps,
  } = useStockSearch({
    onSelect: handleSearchAdd,
    onEnterRaw: handleEnterRaw,
  });

  const handleAddSectorSymbols = (sectorSymbols: string[]) => {
    const toAdd = sectorSymbols.filter(s => !symbols.includes(s));
    if (toAdd.length === 0) return;
    const available = MAX_WATCHLIST_SIZE - symbols.length;
    const adding = toAdd.slice(0, available);
    const newSymbols = [...symbols, ...adding];
    setSymbols(newSymbols);
    persist(newSymbols);
  };

  const handleClearAll = () => {
    setSymbols([]);
    persist([]);
    setShowClearConfirm(false);
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
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
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">FOR YOU</span>
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
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
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
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              无法连接到服务器，请刷新页面重试。为保护你的数据，在加载成功前无法编辑持仓。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/50 text-sm text-foreground hover:border-emerald-500/30 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新页面
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
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              atLimit ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-card/80 focus-within:border-emerald-500/40'
            }`}>
              <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                {...searchInputProps}
                placeholder="搜索股票代码或公司名称..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
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
                highlightedIndex={highlightedIndex}
                isSearching={isSearching}
                showEmpty={true}
                mode="watchlist"
                inListSymbols={symbols}
                onSelect={handleSearchNavigate}
                onAdd={handleSearchAdd}
                atLimit={atLimit}
              />
            )}
          </div>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
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
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {sectors.length > 0 && (
            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-amber-400 rounded-full" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">按板块添加</h2>
                <span className="text-xs text-muted-foreground font-data">{sectors.length} 个板块</span>
              </div>

              {SECTOR_CATEGORIES.map(category => {
                const categorySectors = category.ids
                  .map(id => sectors.find(s => s.id === id))
                  .filter((s): s is SectorInfo => !!s);
                if (categorySectors.length === 0) return null;

                return (
                  <div key={category.label}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 max-w-[40px] bg-border/50" />
                      <span className="text-xs text-muted-foreground tracking-widest uppercase">{category.label}</span>
                      <div className="h-px flex-1 bg-border/30" />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {categorySectors.map((sector, idx) => {
                        const inWatchlist = sector.symbols.filter(s => symbols.includes(s)).length;
                        const allAdded = inWatchlist === sector.symbols.length;
                        const isExpanded = expandedSector === sector.id;
                        const progress = sector.symbols.length > 0 ? inWatchlist / sector.symbols.length : 0;

                        return (
                          <div
                            key={sector.id}
                            className="group relative animate-fade-in-up"
                            style={{ animationDelay: `${idx * 40}ms` }}
                          >
                            <div className={`absolute -inset-0.5 rounded-xl transition-opacity duration-500 blur-sm ${
                              isExpanded
                                ? 'opacity-100 bg-emerald-500/25'
                                : allAdded
                                  ? 'opacity-0'
                                  : 'opacity-0 group-hover:opacity-100 bg-emerald-500/15'
                            }`} />

                            <button
                              onClick={() => {
                                setExpandedSector(isExpanded ? null : sector.id);
                                setConfirmingSectorRemove(null);
                                if (sectorRemoveTimerRef.current) {
                                  clearTimeout(sectorRemoveTimerRef.current);
                                  sectorRemoveTimerRef.current = null;
                                }
                              }}
                              className={`relative w-full text-left bg-card/80 backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 cursor-pointer ${
                                isExpanded
                                  ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                                  : allAdded
                                    ? 'border-border/30 opacity-60 hover:opacity-80'
                                    : 'border-border/50 group-hover:border-emerald-500/30 group-hover:translate-y-[-2px] group-hover:shadow-lg group-hover:shadow-black/10'
                              }`}
                            >
                              {allAdded && (
                                <div className="absolute top-2 right-2 p-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}

                              <div className="font-semibold text-sm text-foreground mb-0.5 pr-6">{sector.name_zh}</div>
                              <div className="text-xs text-muted-foreground mb-3 group-hover:text-foreground/70 transition-colors">{sector.name_en}</div>

                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-data">{sector.symbol_count} 只股票</span>
                                {inWatchlist > 0 && !allAdded && (
                                  <span className="text-xs font-data text-emerald-400">{inWatchlist}/{sector.symbols.length}</span>
                                )}
                              </div>

                              <div className="h-1 rounded-full bg-border/50 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    allAdded ? 'bg-emerald-500/40' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${progress * 100}%` }}
                                />
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {expandedSector && categorySectors.some(s => s.id === expandedSector) && (() => {
                      const sector = sectors.find(s => s.id === expandedSector);
                      if (!sector) return null;

                      const notAdded = sector.symbols.filter(s => !symbols.includes(s));
                      const remaining = MAX_WATCHLIST_SIZE - symbols.length;
                      const canAdd = Math.min(notAdded.length, remaining);

                      return (
                        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-card/60 backdrop-blur-sm p-5 animate-fade-in-up">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                              <h3 className="text-sm font-semibold text-foreground">{sector.name_zh}</h3>
                              <span className="text-xs text-muted-foreground font-data">{sector.symbol_count} 只</span>
                            </div>
                            {notAdded.length > 0 ? (
                              <button
                                onClick={() => handleAddSectorSymbols(notAdded)}
                                disabled={atLimit}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                添加全部 (+{canAdd})
                              </button>
                            ) : (
                              <span className="text-xs text-emerald-400/60">已全部添加</span>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground mb-4 ml-3 leading-relaxed">{sector.description}</p>

                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                            {sector.symbols.map(sym => {
                              const inList = symbols.includes(sym);
                              const isConfirming = confirmingSectorRemove === sym;
                              const name = STOCK_NAMES[sym];

                              const handleSectorStockClick = () => {
                                if (inList) {
                                  if (isConfirming) {
                                    if (sectorRemoveTimerRef.current) clearTimeout(sectorRemoveTimerRef.current);
                                    setConfirmingSectorRemove(null);
                                    handleRemoveSymbol(sym);
                                  } else {
                                    setConfirmingSectorRemove(sym);
                                    sectorRemoveTimerRef.current = setTimeout(() => {
                                      setConfirmingSectorRemove(null);
                                    }, 3000);
                                  }
                                } else {
                                  addSymbol(sym);
                                }
                              };

                              return (
                                <button
                                  key={sym}
                                  onClick={handleSectorStockClick}
                                  disabled={!inList && atLimit}
                                  className={`group flex flex-col items-center gap-1 p-2.5 rounded-lg text-center transition-all border ${
                                    isConfirming
                                      ? 'border-red-400/40 bg-red-500/10 cursor-pointer'
                                      : inList
                                        ? 'border-emerald-500/30 bg-emerald-500/10 cursor-pointer'
                                        : 'border-border/40 bg-muted/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                                  }`}
                                >
                                  <span className={`font-mono text-xs font-semibold flex items-center gap-0.5 ${
                                    isConfirming ? 'text-red-400' : inList ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                                  }`}>
                                    {isConfirming ? (
                                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    ) : inList ? (
                                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : null}
                                    {isConfirming ? '移除?' : sym}
                                  </span>
                                  {!isConfirming && name && (
                                    <span className={`text-[10px] truncate w-full ${inList ? 'text-emerald-400/60' : 'text-muted-foreground'}`}>{name.zh || name.en}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </section>
          )}
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
