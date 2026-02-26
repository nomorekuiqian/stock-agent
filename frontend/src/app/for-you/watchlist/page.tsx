'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import StockCard from '@/components/StockCard';
import { api, SectorInfo, StockSearchResult, StockQuote } from '@/lib/api';
import { STOCK_NAMES } from '@/lib/stock-names';

const MAX_WATCHLIST_SIZE = 25;

// Sector category grouping (display-only, keyed by sector id)
const SECTOR_CATEGORIES: { label: string; ids: string[] }[] = [
  { label: '核心科技', ids: ['mag7', 'ai', 'chips', 'software'] },
  { label: '金融消费', ids: ['finance', 'payments', 'consumer'] },
  { label: '行业板块', ids: ['ev', 'healthcare', 'energy', 'defense'] },
  { label: '热门主题', ids: ['china', 'crypto', 'streaming'] },
];

function WatchlistPageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // Core
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Guard: only allow saves after watchlist has been successfully loaded
  const watchlistLoadedRef = useRef(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extraNamesRef = useRef<Record<string, { en: string; zh: string }>>({});

  // Sector expand
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Clear confirm
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const atLimit = symbols.length >= MAX_WATCHLIST_SIZE;

  // --- Auth redirect ---
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you/watchlist');
    }
  }, [authLoading, isAuthenticated, router]);

  // --- Load data ---
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      setLoading(true);
      setLoadFailed(false);
      try {
        // Load watchlist independently from sectors so a sectors failure
        // does not prevent displaying the user's existing watchlist
        const watchlist = await api.watchlist.get(user.id);
        if (watchlist && watchlist.symbols && watchlist.symbols.length > 0) {
          const uniqueSymbols = [...new Set(watchlist.symbols.map((s: string) => s.toUpperCase()))];
          setSymbols(uniqueSymbols);
        }
        watchlistLoadedRef.current = true;
      } catch (err) {
        console.error('Failed to load watchlist:', err);
        setLoadFailed(true);
      }
      try {
        const sectorList = await api.sectors.list();
        setSectors(sectorList);
      } catch (err) {
        console.error('Failed to load sectors:', err);
      }
      setLoading(false);
    };
    if (user?.id) loadData();
  }, [user?.id]);

  // --- Fetch quotes when symbols change ---
  useEffect(() => {
    const fetchQuotes = async () => {
      if (symbols.length === 0) {
        setQuotes({});
        return;
      }
      setLoadingQuotes(true);
      try {
        const result = await api.getStockQuotes(symbols);
        const map: Record<string, StockQuote> = {};
        result.quotes.forEach(q => { map[q.symbol] = q; });
        setQuotes(map);
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      } finally {
        setLoadingQuotes(false);
      }
    };
    fetchQuotes();
  }, [symbols]);

  // --- Click outside search ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // --- Helpers ---
  const getDisplayName = (symbol: string) => {
    const names = STOCK_NAMES[symbol] || extraNamesRef.current[symbol];
    return names?.zh || names?.en || symbol;
  };

  const persist = useCallback((newSymbols: string[]) => {
    if (!user?.id) return;
    // CRITICAL: Never save unless we confirmed the initial load succeeded.
    // Without this guard, a failed load (auth/network issue) leaves symbols=[],
    // and any subsequent save would overwrite the user's real watchlist with empty data.
    if (!watchlistLoadedRef.current) return;
    // Debounce saves to avoid race conditions when rapid add/remove operations
    // fire concurrent requests that can overwrite each other
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      api.watchlist.save(user.id, newSymbols);
    }, 500);
  }, [user?.id]);

  // --- Search ---
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const result = await api.searchStocks(query, 8);
      const filtered = result.stocks.filter(s => !symbols.includes(s.symbol));
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [symbols]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value.toUpperCase());
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const handleAddSymbol = useCallback((symbol: string, name?: string) => {
    if (symbols.length >= MAX_WATCHLIST_SIZE) return;
    const sym = symbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      const newSymbols = [...symbols, sym];
      setSymbols(newSymbols);
      if (name && !STOCK_NAMES[sym] && !extraNamesRef.current[sym]) {
        extraNamesRef.current[sym] = { en: name, zh: '' };
      }
      persist(newSymbols);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  }, [symbols, persist]);

  const handleRemoveSymbol = useCallback((symbolToRemove: string) => {
    const newSymbols = symbols.filter(s => s !== symbolToRemove);
    setSymbols(newSymbols);
    persist(newSymbols);
  }, [symbols, persist]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleAddSymbol(searchResults[0].symbol, searchResults[0].name);
      } else {
        handleAddSymbol(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  // --- Sector actions ---
  const handleAddSectorSymbols = (sectorSymbols: string[]) => {
    const toAdd = sectorSymbols.filter(s => !symbols.includes(s));
    if (toAdd.length === 0) return;
    const available = MAX_WATCHLIST_SIZE - symbols.length;
    const adding = toAdd.slice(0, available);
    const newSymbols = [...symbols, ...adding];
    setSymbols(newSymbols);
    persist(newSymbols);
  };

  // --- Clear all ---
  const handleClearAll = () => {
    setSymbols([]);
    setQuotes({});
    persist([]);
    setShowClearConfirm(false);
  };

  // --- Auth loading ---
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
      {/* Back link */}
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

      {/* Header */}
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
          {/* Search */}
          <div ref={searchContainerRef} className="relative">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              atLimit ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-card/80 focus-within:border-emerald-500/40'
            }`}>
              <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchQuery && setShowSearchDropdown(true)}
                placeholder={atLimit ? '已达上限' : '搜索股票代码或公司名称...'}
                disabled={atLimit}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none disabled:cursor-not-allowed"
              />
              <span className={`text-xs font-mono tabular-nums shrink-0 ${
                atLimit ? 'text-amber-400' : 'text-muted-foreground'
              }`}>
                {symbols.length}/{MAX_WATCHLIST_SIZE}
              </span>
            </div>

            {/* Search dropdown */}
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden">
                {isSearching ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">搜索中...</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">无结果</div>
                ) : (
                  searchResults.map(stock => (
                    <button
                      key={stock.symbol}
                      onClick={() => handleAddSymbol(stock.symbol, stock.name)}
                      disabled={atLimit}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm font-medium text-foreground">{stock.symbol}</span>
                        <span className="text-xs text-muted-foreground truncate">{stock.name}</span>
                      </div>
                      <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Current holdings */}
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

          {/* Sector quick-add */}
          {sectors.length > 0 && (
            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-amber-400 rounded-full" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">按板块添加</h2>
                <span className="text-xs text-muted-foreground font-data">{sectors.length} 个板块</span>
              </div>

              {/* Category groups */}
              {SECTOR_CATEGORIES.map(category => {
                const categorySectors = category.ids
                  .map(id => sectors.find(s => s.id === id))
                  .filter((s): s is SectorInfo => !!s);
                if (categorySectors.length === 0) return null;

                return (
                  <div key={category.label}>
                    {/* Category label */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 max-w-[40px] bg-border/50" />
                      <span className="text-xs text-muted-foreground tracking-widest uppercase">{category.label}</span>
                      <div className="h-px flex-1 bg-border/30" />
                    </div>

                    {/* Sector cards in this category */}
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
                            {/* Glow */}
                            <div className={`absolute -inset-0.5 rounded-xl transition-opacity duration-500 blur-sm ${
                              isExpanded
                                ? 'opacity-100 bg-emerald-500/25'
                                : allAdded
                                  ? 'opacity-0'
                                  : 'opacity-0 group-hover:opacity-100 bg-emerald-500/15'
                            }`} />

                            <button
                              onClick={() => setExpandedSector(isExpanded ? null : sector.id)}
                              className={`relative w-full text-left bg-card/80 backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 cursor-pointer ${
                                isExpanded
                                  ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                                  : allAdded
                                    ? 'border-border/30 opacity-60 hover:opacity-80'
                                    : 'border-border/50 group-hover:border-emerald-500/30 group-hover:translate-y-[-2px] group-hover:shadow-lg group-hover:shadow-black/10'
                              }`}
                            >
                              {/* All-added badge */}
                              {allAdded && (
                                <div className="absolute top-2 right-2 p-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}

                              {/* Name */}
                              <div className="font-semibold text-sm text-foreground mb-0.5 pr-6">{sector.name_zh}</div>
                              <div className="text-xs text-muted-foreground mb-3 group-hover:text-foreground/70 transition-colors">{sector.name_en}</div>

                              {/* Stats row */}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-data">{sector.symbol_count} 只股票</span>
                                {inWatchlist > 0 && !allAdded && (
                                  <span className="text-xs font-data text-emerald-400">{inWatchlist}/{sector.symbols.length}</span>
                                )}
                              </div>

                              {/* Progress bar */}
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

                    {/* Expanded sector detail panel (render within its category) */}
                    {expandedSector && categorySectors.some(s => s.id === expandedSector) && (() => {
                      const sector = sectors.find(s => s.id === expandedSector);
                      if (!sector) return null;

                      const notAdded = sector.symbols.filter(s => !symbols.includes(s));
                      const remaining = MAX_WATCHLIST_SIZE - symbols.length;
                      const canAdd = Math.min(notAdded.length, remaining);

                      return (
                        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-card/60 backdrop-blur-sm p-5 animate-fade-in-up">
                          {/* Header */}
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

                          {/* Description */}
                          <p className="text-xs text-muted-foreground mb-4 ml-3 leading-relaxed">{sector.description}</p>

                          {/* Stock grid */}
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                            {sector.symbols.map(sym => {
                              const inList = symbols.includes(sym);
                              const name = STOCK_NAMES[sym];
                              return (
                                <button
                                  key={sym}
                                  onClick={() => inList ? handleRemoveSymbol(sym) : handleAddSymbol(sym)}
                                  disabled={!inList && atLimit}
                                  className={`group flex flex-col items-center gap-1 p-2.5 rounded-lg text-center transition-all border ${
                                    inList
                                      ? 'border-emerald-500/30 bg-emerald-500/10 hover:border-red-400/40 hover:bg-red-500/10 cursor-pointer'
                                      : 'border-border/40 bg-muted/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                                  }`}
                                >
                                  <span className={`font-mono text-xs font-semibold flex items-center gap-0.5 ${inList ? 'text-emerald-400 group-hover:text-red-400' : 'text-muted-foreground hover:text-foreground'}`}>
                                    {inList && (
                                      <>
                                        <svg className="w-3 h-3 shrink-0 group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <svg className="w-3 h-3 shrink-0 hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </>
                                    )}
                                    {sym}
                                  </span>
                                  {name && (
                                    <span className={`text-[10px] truncate w-full ${inList ? 'text-emerald-400/60 group-hover:text-red-400/60' : 'text-muted-foreground'}`}>{name.zh || name.en}</span>
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
