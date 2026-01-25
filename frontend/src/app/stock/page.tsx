'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { api, StockQuote, StockSearchResult } from '@/lib/api';
import { STOCK_NAMES } from '@/lib/stock-names';
import StockCard from '@/components/StockCard';

// =============================================================================
// Types & Data
// =============================================================================

interface RecentStock {
  symbol: string;
  name: string;
  viewedAt: number;
}

interface StockTrack {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  symbols: string[];
}

const STOCK_TRACKS: StockTrack[] = [
  {
    id: 'mag7',
    name: 'Mag 7 科技巨头',
    nameEn: 'Magnificent 7',
    description: '占 S&P 500 近 30% 权重，美股风向标',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
  },
  {
    id: 'ai-infra',
    name: 'AI 芯片 & 基础设施',
    nameEn: 'AI Infrastructure',
    description: 'AI 军火商，追踪 AI capex 周期健康度',
    symbols: ['AMD', 'AVGO', 'TSM', 'ARM', 'MRVL', 'ASML'],
  },
  {
    id: 'software',
    name: '企业软件',
    nameEn: 'Enterprise Software',
    description: 'AI 应用层，订阅收入稳定，成长股风向标',
    symbols: ['CRM', 'ORCL', 'ADBE', 'NOW', 'PLTR'],
  },
  {
    id: 'finance',
    name: '银行 & 支付',
    nameEn: 'Banks & Payments',
    description: '利率周期敏感，信贷环境晴雨表',
    symbols: ['JPM', 'GS', 'V', 'MA', 'BAC'],
  },
  {
    id: 'china-adrs',
    name: '中概核心',
    nameEn: 'China ADRs',
    description: '中国经济复苏预期 + 地缘政治风险溢价',
    symbols: ['BABA', 'PDD', 'JD', 'BIDU', 'NIO'],
  },
  {
    id: 'consumer-health',
    name: '消费 & 医药',
    nameEn: 'Consumer & Healthcare',
    description: '防御性配置首选，消费韧性 + 医药创新',
    symbols: ['COST', 'LLY', 'UNH', 'NFLX', 'MCD'],
  },
];

// All unique symbols across tracks (stable reference for useEffect)
const allTrackSymbols = Array.from(
  new Set(STOCK_TRACKS.flatMap(t => t.symbols))
);

// =============================================================================
// Local Storage Utils
// =============================================================================

const RECENT_STOCKS_KEY = 'marketbrew_recent_stocks';

function getRecentStocks(): RecentStock[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_STOCKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentStock(symbol: string, name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentStocks().filter(s => s.symbol !== symbol);
    recent.unshift({ symbol, name, viewedAt: Date.now() });
    localStorage.setItem(RECENT_STOCKS_KEY, JSON.stringify(recent.slice(0, 6)));
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// Main Page
// =============================================================================

export default function StockResearchPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recentStocks, setRecentStocks] = useState<RecentStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize
  useEffect(() => {
    setMounted(true);
    setRecentStocks(getRecentStocks());
  }, []);

  // Fetch quotes for all track symbols + recent stocks
  useEffect(() => {
    const recentSymbols = getRecentStocks().map(s => s.symbol);
    const allSymbols = Array.from(new Set([...allTrackSymbols, ...recentSymbols]));

    if (allSymbols.length === 0) return;

    setIsLoadingQuotes(true);
    api.getStockQuotes(allSymbols)
      .then(res => {
        const map: Record<string, StockQuote> = {};
        for (const q of res.quotes) {
          map[q.symbol] = q;
        }
        setQuotes(map);
      })
      .catch(err => {
        console.error('Failed to fetch quotes:', err);
      })
      .finally(() => {
        setIsLoadingQuotes(false);
      });
  }, []);

  // Debounced search
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value.toUpperCase());

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await api.searchStocks(value, 8);
        setSearchResults(result.stocks);
        setShowSearchDropdown(true);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Navigation helpers
  const handleStockClick = useCallback((symbol: string) => {
    const info = STOCK_NAMES[symbol];
    const name = info?.zh || info?.en || quotes[symbol]?.name || symbol;
    addRecentStock(symbol, name);
    router.push(`/stock/${symbol}`);
  }, [router, quotes]);

  const handleSearchResultClick = useCallback((result: StockSearchResult) => {
    addRecentStock(result.symbol, result.name);
    setShowSearchDropdown(false);
    setSearchQuery('');
    router.push(`/stock/${result.symbol}`);
  }, [router]);

  const getDisplayName = (symbol: string): string => {
    const info = STOCK_NAMES[symbol];
    return info?.zh || info?.en || quotes[symbol]?.name || symbol;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero / Header */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-16 pb-10 md:pt-24 md:pb-14">
          <div
            className={`transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <h1 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground tracking-tight leading-[1.1] mb-4">
              Stock Research
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-lg leading-relaxed mb-10">
              按赛道浏览龙头股，实时行情一目了然
            </p>
          </div>

          {/* Search Bar */}
          <div
            ref={searchContainerRef}
            className={`relative max-w-xl transition-all duration-700 delay-100 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                  placeholder="搜索股票代码或公司名称..."
                  className="w-full h-14 pl-14 pr-6 bg-card/40 border border-border/50 rounded-2xl text-foreground text-base placeholder:text-muted-foreground/40 focus:outline-none focus:border-emerald-500/50 focus:bg-card/60 transition-all font-data tracking-wider"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                />
                {isSearching && (
                  <div className="absolute right-5 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Search dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-popover backdrop-blur-xl border border-border rounded-xl shadow-xl overflow-hidden animate-fade-in">
                {searchResults.map((result, idx) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleSearchResultClick(result)}
                    className="w-full px-4 py-3 text-left hover:bg-emerald-500/10 transition-all duration-200 flex items-center justify-between gap-3 border-b border-border/50 last:border-0 group/item animate-fade-in-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="font-mono font-semibold text-sm text-foreground shrink-0">{result.symbol}</span>
                      <span className="text-sm text-muted-foreground truncate group-hover/item:text-foreground/70 transition-colors">{result.name}</span>
                    </div>
                    <Plus className="w-4 h-4 text-emerald-500 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Track Sections */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pb-8 space-y-10">
        {STOCK_TRACKS.map((track, trackIdx) => (
          <section
            key={track.id}
            className={`transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: mounted ? `${200 + trackIdx * 80}ms` : '0ms' }}
          >
            {/* Subsection Header (amber dot pattern) */}
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 dark:bg-amber-400/80 light:bg-amber-600" />
                <span className="text-amber-700 dark:text-amber-400">{track.name}</span>
                <span className="text-muted-foreground/70 font-normal normal-case">{track.nameEn}</span>
              </h3>
              <p className="text-xs text-muted-foreground/60 mt-1 ml-4">{track.description}</p>
            </div>

            {/* Stock Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {track.symbols.map((symbol, idx) => (
                <StockCard
                  key={symbol}
                  symbol={symbol}
                  quote={quotes[symbol]}
                  displayName={getDisplayName(symbol)}
                  index={idx}
                  isLoading={isLoadingQuotes}
                  onClick={() => handleStockClick(symbol)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Recently Viewed */}
      {recentStocks.length > 0 && (
        <section className="border-t border-border/30">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 dark:bg-amber-400/80 light:bg-amber-600" />
              <span className="text-amber-700 dark:text-amber-400">最近浏览</span>
              <span className="text-muted-foreground/70 font-normal normal-case">Recently Viewed</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {recentStocks.slice(0, 5).map((stock, idx) => (
                <StockCard
                  key={stock.symbol}
                  symbol={stock.symbol}
                  quote={quotes[stock.symbol]}
                  displayName={STOCK_NAMES[stock.symbol]?.zh || stock.name}
                  index={idx}
                  isLoading={isLoadingQuotes}
                  onClick={() => handleStockClick(stock.symbol)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer Links */}
      <section className="border-t border-border/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-14 md:py-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
            <div>
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-3">
                Explore
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Link
                  href="/today"
                  className="text-sm text-muted-foreground hover:text-emerald-400 transition-colors"
                >
                  Daily Report
                </Link>
                <Link
                  href="/liquidity"
                  className="text-sm text-muted-foreground hover:text-emerald-400 transition-colors"
                >
                  Liquidity
                </Link>
                <Link
                  href="/for-you"
                  className="text-sm text-muted-foreground hover:text-emerald-400 transition-colors"
                >
                  For You
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
              <span className="text-xs font-data">Market Data</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
