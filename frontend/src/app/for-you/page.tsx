'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Coffee, Search, X, Plus, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, DigestResponse, StockAnalysis, DigestHeadlineNews, DigestBriefNews, DigestEvent, StockSearchResult, StockQuote } from '@/lib/api';
import { getUserWatchlist, saveUserWatchlist, getUserDigests, UserDigest } from '@/lib/insforge';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific, formatDateShort } from '@/lib/timezone';

// Stock name mapping (English + Chinese)
const STOCK_NAMES: Record<string, { en: string; zh: string }> = {
  'AAPL': { en: 'Apple Inc.', zh: '苹果' },
  'MSFT': { en: 'Microsoft Corp.', zh: '微软' },
  'NVDA': { en: 'NVIDIA Corp.', zh: '英伟达' },
  'GOOGL': { en: 'Alphabet Inc.', zh: '谷歌' },
  'GOOG': { en: 'Alphabet Inc.', zh: '谷歌' },
  'AMZN': { en: 'Amazon.com Inc.', zh: '亚马逊' },
  'META': { en: 'Meta Platforms', zh: 'Meta' },
  'TSLA': { en: 'Tesla Inc.', zh: '特斯拉' },
  'AMD': { en: 'AMD Inc.', zh: 'AMD' },
  'INTC': { en: 'Intel Corp.', zh: '英特尔' },
  'AVGO': { en: 'Broadcom Inc.', zh: '博通' },
  'TSM': { en: 'TSMC', zh: '台积电' },
  'BABA': { en: 'Alibaba Group', zh: '阿里巴巴' },
  'JD': { en: 'JD.com Inc.', zh: '京东' },
  'PDD': { en: 'PDD Holdings', zh: '拼多多' },
  'BIDU': { en: 'Baidu Inc.', zh: '百度' },
  'NIO': { en: 'NIO Inc.', zh: '蔚来' },
  'LI': { en: 'Li Auto Inc.', zh: '理想' },
  'XPEV': { en: 'XPeng Inc.', zh: '小鹏' },
  'JPM': { en: 'JPMorgan Chase', zh: '摩根大通' },
  'BAC': { en: 'Bank of America', zh: '美国银行' },
  'GS': { en: 'Goldman Sachs', zh: '高盛' },
  'MS': { en: 'Morgan Stanley', zh: '摩根士丹利' },
  'WFC': { en: 'Wells Fargo', zh: '富国银行' },
  'V': { en: 'Visa Inc.', zh: 'Visa' },
  'MA': { en: 'Mastercard', zh: '万事达' },
  'BRK.B': { en: 'Berkshire Hathaway', zh: '伯克希尔' },
  'UNH': { en: 'UnitedHealth', zh: '联合健康' },
  'JNJ': { en: 'Johnson & Johnson', zh: '强生' },
  'XOM': { en: 'Exxon Mobil', zh: '埃克森美孚' },
  'CVX': { en: 'Chevron Corp.', zh: '雪佛龙' },
  'COST': { en: 'Costco', zh: '好市多' },
  'WMT': { en: 'Walmart', zh: '沃尔玛' },
  'HD': { en: 'Home Depot', zh: '家得宝' },
  'MCD': { en: 'McDonald\'s', zh: '麦当劳' },
  'SBUX': { en: 'Starbucks', zh: '星巴克' },
  'DIS': { en: 'Walt Disney', zh: '迪士尼' },
  'NFLX': { en: 'Netflix', zh: '奈飞' },
  'CRM': { en: 'Salesforce', zh: 'Salesforce' },
  'ORCL': { en: 'Oracle Corp.', zh: '甲骨文' },
  'ADBE': { en: 'Adobe Inc.', zh: 'Adobe' },
  'NOW': { en: 'ServiceNow', zh: 'ServiceNow' },
  'COIN': { en: 'Coinbase', zh: 'Coinbase' },
  'PLTR': { en: 'Palantir', zh: 'Palantir' },
  'SNOW': { en: 'Snowflake', zh: 'Snowflake' },
  'ARM': { en: 'Arm Holdings', zh: 'Arm' },
  'UBER': { en: 'Uber Technologies', zh: 'Uber' },
  'ABNB': { en: 'Airbnb', zh: 'Airbnb' },
};

// Preset portfolios
const PRESET_PORTFOLIOS = [
  {
    id: 'mag7',
    name: 'Magnificent 7',
    nameZh: '科技七巨头',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
  },
  {
    id: 'chips',
    name: 'Semiconductors',
    nameZh: '芯片股',
    symbols: ['NVDA', 'AMD', 'INTC', 'AVGO', 'TSM', 'ARM'],
  },
  {
    id: 'china',
    name: 'China ADRs',
    nameZh: '中概股',
    symbols: ['BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'LI'],
  },
  {
    id: 'finance',
    name: 'Financials',
    nameZh: '金融股',
    symbols: ['JPM', 'BAC', 'GS', 'MS', 'WFC'],
  },
];

// Get stock display name
const getStockName = (symbol: string): string => {
  const info = STOCK_NAMES[symbol];
  if (info) {
    return `${info.en} (${info.zh})`;
  }
  return symbol;
};

// Get short stock name (just Chinese if available)
const getStockNameShort = (symbol: string): string => {
  const info = STOCK_NAMES[symbol];
  return info ? info.zh : '';
};

export default function ForYouPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<UserDigest[]>([]);
  const [totalHistory, setTotalHistory] = useState(0);

  // Stock quotes state
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const result = await api.searchStocks(query, 8);
      // Filter out already added symbols
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

  // Handle search input change with debounce
  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value.toUpperCase());

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Fetch stock quotes when symbols change
  useEffect(() => {
    const fetchQuotes = async () => {
      if (symbols.length === 0) {
        setQuotes({});
        return;
      }

      setLoadingQuotes(true);
      try {
        const result = await api.getStockQuotes(symbols);
        const quotesMap: Record<string, StockQuote> = {};
        result.quotes.forEach((q) => {
          quotesMap[q.symbol] = q;
        });
        setQuotes(quotesMap);
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      } finally {
        setLoadingQuotes(false);
      }
    };

    fetchQuotes();
  }, [symbols]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user's watchlist and history
  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) return;

      setLoadingWatchlist(true);
      try {
        // Load watchlist
        const watchlist = await getUserWatchlist(user.id);
        if (watchlist?.symbols) {
          setSymbols(watchlist.symbols);
        }

        // Load history
        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
          setTotalHistory(historyResult.total);

          // Load the latest digest if available
          if (historyResult.data.length > 0) {
            loadHistoricalDigest(historyResult.data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load user data:', err);
      } finally {
        setLoadingWatchlist(false);
      }
    };

    if (user?.id) {
      loadUserData();
    }
  }, [user?.id]);

  // Add symbol from search result
  const handleAddSymbol = (symbol: string, name?: string) => {
    const sym = symbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      const newSymbols = [...symbols, sym];
      setSymbols(newSymbols);
      // Update STOCK_NAMES if we got a name from search
      if (name && !STOCK_NAMES[sym]) {
        STOCK_NAMES[sym] = { en: name, zh: '' };
      }
      if (user?.id) {
        saveUserWatchlist(user.id, newSymbols);
      }
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  // Add preset portfolio
  const handleAddPortfolio = (portfolio: typeof PRESET_PORTFOLIOS[0]) => {
    const newSymbols = [...new Set([...symbols, ...portfolio.symbols])];
    setSymbols(newSymbols);
    if (user?.id) {
      saveUserWatchlist(user.id, newSymbols);
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    const newSymbols = symbols.filter((s) => s !== symbolToRemove);
    setSymbols(newSymbols);
    if (user?.id) {
      saveUserWatchlist(user.id, newSymbols);
    }
  };

  const handleGenerateDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.generateDigest(symbols, user?.id);
      setDigest(result);

      // Refresh history
      if (user?.id) {
        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
          setTotalHistory(historyResult.total);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalDigest = (historyItem: UserDigest) => {
    const digestData = historyItem.digest_data || {};
    const digestFromHistory: DigestResponse = {
      success: true,
      timestamp: historyItem.created_at || '',
      symbols_used: historyItem.symbols,
      greeting: historyItem.greeting || '',
      one_line_summary: historyItem.one_line_summary || '',
      stocks: digestData.stocks || [],
      news: digestData.news || { headlines: [], briefs: [] },
      events: digestData.events || [],
      summary: digestData.summary || {
        content: historyItem.bottom_line || historyItem.analysis || '',
      },
    };
    setDigest(digestFromHistory);
  };

  const getStatusColor = (status: string) => {
    if (status.includes('up') || status.includes('strong') || status.includes('rise')) {
      return 'text-emerald-500 bg-emerald-500/10';
    } else if (status.includes('down') || status.includes('weak') || status.includes('fall')) {
      return 'text-red-500 bg-red-500/10';
    }
    return 'text-muted-foreground bg-secondary';
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      // If there's a search result, add the first one
      if (searchResults.length > 0) {
        handleAddSymbol(searchResults[0].symbol, searchResults[0].name);
      } else {
        // Otherwise just add the query as a symbol
        handleAddSymbol(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Title + Status */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                <Coffee className="w-5 h-5 text-emerald-500" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">For You</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {symbols.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {symbols.length} stocks tracked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      No watchlist
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleGenerateDigest}
              disabled={loading || symbols.length === 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Watchlist Panel */}
      <section className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
          {/* Watchlist */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Watchlist</h3>
                  {symbols.length > 0 && (
                    <span className="text-xs text-muted-foreground">({symbols.length})</span>
                  )}
                </div>

                {loadingWatchlist ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Search input with autocomplete */}
                    <div ref={searchContainerRef} className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          onFocus={() => searchQuery && setShowSearchDropdown(true)}
                          placeholder="Search stocks (e.g. AAPL, Apple)"
                          className="w-full pl-9 pr-3 py-2 border border-border bg-background rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                        {isSearching && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                          </div>
                        )}
                      </div>

                      {/* Search dropdown */}
                      {showSearchDropdown && searchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                          {searchResults.map((result) => (
                            <button
                              key={result.symbol}
                              onClick={() => handleAddSymbol(result.symbol, result.name)}
                              className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors flex items-center justify-between gap-2 first:rounded-t-lg last:rounded-b-lg"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-foreground shrink-0">{result.symbol}</span>
                                <span className="text-sm text-muted-foreground truncate">{result.name}</span>
                              </div>
                              <Plus className="w-4 h-4 text-emerald-500 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Preset portfolios */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Quick Add</p>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_PORTFOLIOS.map((portfolio) => {
                          const addedCount = portfolio.symbols.filter(s => symbols.includes(s)).length;
                          const allAdded = addedCount === portfolio.symbols.length;
                          return (
                            <button
                              key={portfolio.id}
                              onClick={() => handleAddPortfolio(portfolio)}
                              disabled={allAdded}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                allAdded
                                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-default'
                                  : 'bg-secondary text-foreground hover:bg-secondary/80'
                              }`}
                            >
                              <span>{portfolio.nameZh}</span>
                              <span className="text-muted-foreground">({portfolio.symbols.length})</span>
                              {allAdded && <span className="text-emerald-500">done</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Current symbols - card style */}
                    {symbols.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {symbols.map((symbol) => {
                          const stockInfo = STOCK_NAMES[symbol];
                          const quote = quotes[symbol];
                          // Use Chinese name if available, otherwise English from mapping or API
                          const displayName = stockInfo?.zh || stockInfo?.en || quote?.name || '';
                          const price = quote?.price;
                          const dailyChange = quote?.daily_change;
                          const isPositive = dailyChange !== undefined && dailyChange >= 0;

                          return (
                            <div
                              key={symbol}
                              className="group relative bg-secondary/50 hover:bg-secondary rounded-lg p-2.5 transition-colors"
                            >
                              <button
                                onClick={() => handleRemoveSymbol(symbol)}
                                className="absolute top-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                              <div className="flex items-center justify-between pr-6">
                                <div className="font-semibold text-foreground text-sm">{symbol}</div>
                                {price !== undefined && (
                                  <div className="text-xs font-medium text-foreground">
                                    ${price.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between pr-6 mt-0.5">
                                {displayName ? (
                                  <div className="text-xs text-muted-foreground truncate">{displayName}</div>
                                ) : (
                                  <div className="text-xs text-muted-foreground/50">-</div>
                                )}
                                {dailyChange !== undefined && (
                                  <div className={`text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
                                  </div>
                                )}
                              </div>
                              {loadingQuotes && !quote && (
                                <div className="absolute inset-0 bg-secondary/80 rounded-lg flex items-center justify-center">
                                  <div className="w-3 h-3 rounded-full border border-border border-t-emerald-500 animate-spin" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">Search or use quick add to build your watchlist</p>
                    )}
                  </div>
                )}
              </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Analyzing your portfolio...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDateChinese(digest.timestamp)}</span>
              <span className="text-muted-foreground/50">|</span>
              <span>{formatTimePacific(digest.timestamp)}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {digest.greeting}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {digest.one_line_summary}
            </p>
          </section>

          {/* Portfolio Overview */}
          {digest.stocks.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Portfolio Overview</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.stocks.map((stock: StockAnalysis) => (
                  <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground">{stock.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                        {stock.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-2">
                      <span className="text-foreground font-medium">${stock.price.toFixed(2)}</span>
                      <span className={stock.daily_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.daily_change}
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span className={stock.week_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.week_change} (week)
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Headlines News */}
          {digest.news?.headlines?.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Headlines</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.news.headlines.map((item: DigestHeadlineNews, index: number) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground hover:text-emerald-500 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols?.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-foreground mb-2">{item.fact_summary}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.deep_analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Brief News */}
          {digest.news?.briefs?.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">More News</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.news.briefs.map((item: DigestBriefNews, index: number) => (
                  <div key={index} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-emerald-500 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols?.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.summary}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{item.analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Events */}
          {digest.events.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Key Events</h3>
              </div>
              <div className="space-y-4">
                {digest.events.map((event: DigestEvent, index: number) => {
                  const dateStr = event.date.split('T')[0];
                  const calendarDate = formatCalendarDate(dateStr);
                  const isToday = isTodayPacific(dateStr);

                  return (
                    <div key={index} className="flex gap-4">
                      <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center ${
                        isToday
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-secondary border border-border'
                      }`}>
                        <p className={`text-xs uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {calendarDate.month}
                        </p>
                        <p className={`text-xl font-semibold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                          {calendarDate.day}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-foreground text-sm">{event.event}</span>
                          {event.related_symbols.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {event.related_symbols.map((sym: string) => (
                                <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{event.why_important}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Summary */}
          {digest.summary?.content && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Summary</h3>
              </div>
              <div className="space-y-4">
                {digest.summary.content.split('\n\n').map((paragraph, index) => (
                  paragraph.trim() && (
                    <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                      {paragraph.trim()}
                    </p>
                  )
                ))}
              </div>
            </section>
          )}

          {/* Disclaimer */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              AI-generated report for informational purposes only. Not financial advice.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center">
              <Coffee className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Create Your Personalized Report</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {symbols.length === 0
                  ? 'Add stocks to your watchlist above, then generate your personalized digest.'
                  : 'Click Generate to create a personalized market analysis for your watchlist.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      {history.length > 0 && (
        <section className="border-t border-border mt-8">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Past Reports</h3>
                  <p className="text-xs text-muted-foreground">{totalHistory} reports available</p>
                </div>
              </div>
              <Link
                href="/for-you/archive"
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadHistoricalDigest(item)}
                  className="group bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 transition-all text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                      {formatDateShort(item.digest_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.symbols.slice(0, 3).map((sym) => (
                      <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                        {sym}
                      </span>
                    ))}
                    {item.symbols.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{item.symbols.length - 3}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.one_line_summary || `${item.symbols.length} stocks analyzed`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
