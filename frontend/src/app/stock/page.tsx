'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { StockQuote } from '@/lib/api';
import { STOCK_NAMES } from '@/lib/stock-names';
import StockCard from '@/components/StockCard';
import StockSearchDropdown from '@/components/StockSearchDropdown';
import { useStockSearch } from '@/hooks/useStockSearch';
import { useStockQuotes } from '@/hooks/queries/use-stock-data';
import PaywallGuard from '@/components/PaywallGuard';

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
  const [recentStocks] = useState<RecentStock[]>(
    () => typeof window !== 'undefined' ? getRecentStocks() : []
  );

  // Combine all track symbols + recent stocks for a single batch quote request
  const allSymbols = useMemo(() => {
    const recentSymbols = recentStocks.map(s => s.symbol);
    return Array.from(new Set([...allTrackSymbols, ...recentSymbols]));
  }, [recentStocks]);

  const { data: quotesResponse, isLoading: isLoadingQuotes } = useStockQuotes(allSymbols);

  const quotes = useMemo(() => {
    const map: Record<string, StockQuote> = {};
    if (quotesResponse?.quotes) {
      for (const q of quotesResponse.quotes) {
        map[q.symbol] = q;
      }
    }
    return map;
  }, [quotesResponse]);

  // Search hook
  const handleSearchSelect = useCallback((result: { symbol: string; name: string }) => {
    addRecentStock(result.symbol, result.name);
    router.push(`/stock/${result.symbol}`);
  }, [router]);

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
  } = useStockSearch();

  const handleSearchSelectAndReset = useCallback((result: { symbol: string; name: string }) => {
    handleSearchSelect(result);
    resetAfterSelect();
  }, [handleSearchSelect, resetAfterSelect]);

  // Navigation helpers
  const handleStockClick = useCallback((symbol: string) => {
    const info = STOCK_NAMES[symbol];
    const name = info?.zh || info?.en || quotes[symbol]?.name || symbol;
    addRecentStock(symbol, name);
    router.push(`/stock/${symbol}`);
  }, [router, quotes]);

  const getDisplayName = (symbol: string): string => {
    const info = STOCK_NAMES[symbol];
    return info?.zh || info?.en || quotes[symbol]?.name || symbol;
  };

  return (
    <PaywallGuard requiredFeature="stock_research">
    <div className="min-h-screen bg-background">
      {/* Hero / Header */}
      <section>
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-16 pb-10 md:pt-24 md:pb-14">
          <div>
            <div className="flex items-center gap-3 mb-4 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Stock Research</span>
            </div>
            <h1 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground tracking-tight leading-[1.1] mb-4 animate-fade-in-up delay-100">
              个股研究
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-lg leading-relaxed mb-10 animate-fade-in-up delay-200">
              按赛道浏览龙头股，实时行情一目了然
            </p>
          </div>

          {/* Search Bar */}
          <div
            ref={searchContainerRef}
            className="relative max-w-xl animate-fade-in-up delay-300"
            style={{ zIndex: 50 }}
          >
            <Command shouldFilter={false} loop onKeyDown={(e) => {
              if (e.key === 'Escape') closeDropdown();
            }}>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-primary/20 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
                  <Command.Input
                    value={searchQuery}
                    onValueChange={onQueryChange}
                    {...inputHandlers}
                    placeholder="搜索股票代码或公司名称..."
                    className="w-full h-14 pl-14 pr-6 bg-card/40 border border-border/50 rounded-2xl text-foreground text-base placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:bg-card/60 transition-all font-data tracking-wider"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ textTransform: 'uppercase' }}
                  />
                  {isSearching && (
                    <div className="absolute right-5 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {showSearchDropdown && (
                <StockSearchDropdown
                  results={searchResults}
                  isSearching={isSearching}
                  mode="navigate"
                  onSelect={handleSearchSelectAndReset}
                />
              )}
            </Command>
          </div>
        </div>
      </section>

      {/* Recently Viewed + Track Sections */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pb-8 space-y-10">
        {recentStocks.length > 0 && (
          <section>
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 dark:bg-amber-400/80 light:bg-amber-600" />
                <span className="text-amber-700 dark:text-amber-400">最近浏览</span>
                <span className="text-muted-foreground/70 font-normal normal-case">Recently Viewed</span>
              </h3>
            </div>

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
          </section>
        )}

        {STOCK_TRACKS.map((track) => (
          <section key={track.id}>
            {/* Subsection Header (amber dot pattern) */}
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 dark:bg-amber-400/80 light:bg-amber-600" />
                <span className="text-amber-700 dark:text-amber-400">{track.name}</span>
                <span className="text-muted-foreground/70 font-normal normal-case">{track.nameEn}</span>
              </h3>
              <p className="text-xs text-muted-foreground/70 mt-1 ml-4">{track.description}</p>
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

      {/* Footer Links */}
      <section className="border-t border-border/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-14 md:py-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
            <div>
              <p className="text-xs text-muted-foreground/70 uppercase tracking-[0.25em] font-semibold mb-3">
                Explore
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Link
                  href="/today"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  市场日报
                </Link>
                <Link
                  href="/macro/liquidity"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  流动性
                </Link>
                <Link
                  href="/for-you"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  个性化
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground/70">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              <span className="text-xs font-data">市场数据</span>
            </div>
          </div>
        </div>
      </section>
    </div>
    </PaywallGuard>
  );
}
