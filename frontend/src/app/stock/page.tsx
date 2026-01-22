'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// =============================================================================
// Types & Data
// =============================================================================

interface RecentStock {
  symbol: string;
  name: string;
  viewedAt: number;
}

// Curated list - quality over quantity
const FEATURED_STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'JPM', name: 'JPMorgan' },
];

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

export default function StockSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [recentStocks, setRecentStocks] = useState<RecentStock[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRecentStocks(getRecentStocks());
  }, []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const symbol = query.trim().toUpperCase();
    if (symbol) {
      router.push(`/stock/${symbol}`);
    }
  }, [query, router]);

  const handleStockClick = useCallback((symbol: string, name: string) => {
    addRecentStock(symbol, name);
    router.push(`/stock/${symbol}`);
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-36">
          {/* Editorial headline */}
          <div
            className={`text-center transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <h1 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground tracking-tight leading-[1.1] mb-6">
              Individual Stock
              <br />
              <span className="text-muted-foreground/80">Research</span>
            </h1>

            <p className="text-muted-foreground text-lg md:text-xl max-w-md mx-auto mb-12 leading-relaxed">
              财务数据、估值分析、增长指标
            </p>
          </div>

          {/* Search */}
          <form
            onSubmit={handleSearch}
            className={`relative max-w-xl mx-auto transition-all duration-700 delay-100 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter ticker symbol"
              className="w-full h-14 md:h-16 px-6 pl-14 pr-32 bg-card/40 border border-border/50 rounded-2xl text-foreground text-lg placeholder:text-muted-foreground/40 focus:outline-none focus:border-emerald-500/50 focus:bg-card/60 transition-all font-data tracking-wider"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
            />
            <svg
              className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 md:h-12 px-6 bg-emerald-600 text-white rounded-xl font-medium transition-all hover:bg-emerald-500 active:scale-[0.98]"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Recent Stocks - Only show if has history */}
      {recentStocks.length > 0 && (
        <section className="border-t border-border/30">
          <div className="max-w-3xl mx-auto px-6 py-10">
            <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-5">
              Recently Viewed
            </p>
            <div className="flex flex-wrap gap-3">
              {recentStocks.slice(0, 6).map((stock) => (
                <button
                  key={stock.symbol}
                  onClick={() => handleStockClick(stock.symbol, stock.name)}
                  className="group inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/40 hover:border-emerald-500/30 hover:bg-card/50 transition-all"
                >
                  <span className="font-data text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                    {stock.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground/60">
                    {stock.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Popular Stocks */}
      <section className={`border-t border-border/30 ${recentStocks.length === 0 ? '' : ''}`}>
        <div className="max-w-3xl mx-auto px-6 py-14 md:py-20">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-8">
            Popular
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {FEATURED_STOCKS.map((stock, i) => (
              <button
                key={stock.symbol}
                onClick={() => handleStockClick(stock.symbol, stock.name)}
                className={`group text-left p-5 rounded-2xl border border-border/30 hover:border-emerald-500/30 hover:bg-card/40 transition-all duration-300 ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: mounted ? `${150 + i * 50}ms` : '0ms' }}
              >
                <span className="font-data text-xl font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                  {stock.symbol}
                </span>
                <p className="text-sm text-muted-foreground/60 mt-1.5">
                  {stock.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Footer Links */}
      <section className="border-t border-border/30">
        <div className="max-w-3xl mx-auto px-6 py-14 md:py-16">
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
              <span className="text-xs font-data">Market Open</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
