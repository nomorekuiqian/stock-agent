'use client';

import { Search, Plus, BarChart3 } from 'lucide-react';
import StockCard, { StockQuoteData } from '@/components/StockCard';

interface SearchResult {
  symbol: string;
  name: string;
}

interface WatchlistPanelProps {
  symbols: string[];
  quotes: Record<string, StockQuoteData>;
  stockNames: Record<string, { zh?: string; en?: string }>;
  maxSize?: number;
  isLoading?: boolean;
  isLoadingQuotes?: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching?: boolean;
  showSearchDropdown?: boolean;
  onSearchChange: (query: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent) => void;
  onSearchFocus: () => void;
  onAddSymbol: (symbol: string, name?: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

// Empty State Component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <BarChart3 className="w-7 h-7 text-primary" />
      </div>

      {/* Text */}
      <h4 className="text-sm font-medium text-muted-foreground mb-2">开始追踪你的投资</h4>
      <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
        搜索股票代码来构建你的个性化关注列表
      </p>
    </div>
  );
}

// Main Watchlist Panel Component
export default function WatchlistPanel({
  symbols,
  quotes,
  stockNames,
  maxSize = 25,
  isLoading = false,
  isLoadingQuotes = false,
  searchQuery,
  searchResults,
  isSearching = false,
  showSearchDropdown = false,
  onSearchChange,
  onSearchKeyDown,
  onSearchFocus,
  onAddSymbol,
  onRemoveSymbol,
  searchContainerRef,
  searchInputRef
}: WatchlistPanelProps) {
  const atLimit = symbols.length >= maxSize;

  return (
    <section className="border-b border-border/50">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Main card */}
        <div className="bg-card/50 border border-border/50 rounded-2xl p-6 md:p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                {/* Animated accent bar */}
                <div className="relative w-1 h-6 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-primary" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-primary animate-pulse-subtle" />
                </div>

                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    关注列表
                  </h3>

                  {/* Count badge */}
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono ${
                    atLimit
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-muted text-muted-foreground border border-border/50'
                  }`}>
                    <span className="tabular-nums">{symbols.length}</span>
                    <span className="text-muted-foreground/70">/</span>
                    <span className="tabular-nums text-muted-foreground/70">{maxSize}</span>
                  </div>
                </div>
              </div>

              {atLimit && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">已达上限</span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
                <span className="text-sm text-muted-foreground">加载关注列表...</span>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Search Section */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative group">
                    {/* Search glow on focus */}
                    <div className="absolute -inset-0.5 bg-primary/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />

                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                        onFocus={onSearchFocus}
                        disabled={atLimit}
                        placeholder={atLimit ? "已达上限，请先移除股票" : "搜索股票代码或公司名称..."}
                        className="w-full pl-11 pr-4 py-3 bg-background border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      {isSearching && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
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
                          onClick={() => onAddSymbol(result.symbol, result.name)}
                          className="w-full px-4 py-3 text-left hover:bg-primary/10 transition-all duration-200 flex items-center justify-between gap-3 border-b border-border/50 last:border-0 group/item animate-fade-in-up"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="font-mono font-semibold text-sm text-foreground shrink-0">{result.symbol}</span>
                            <span className="text-sm text-muted-foreground truncate group-hover/item:text-foreground transition-colors">{result.name}</span>
                          </div>
                          <Plus className="w-4 h-4 text-primary shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stock Cards Grid */}
                {symbols.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {symbols.map((symbol, idx) => {
                      const stockInfo = stockNames[symbol];
                      const quote = quotes[symbol];
                      const displayName = stockInfo?.zh || stockInfo?.en || quote?.name || '';

                      return (
                        <StockCard
                          key={symbol}
                          symbol={symbol}
                          quote={quote}
                          displayName={displayName}
                          onRemove={() => onRemoveSymbol(symbol)}
                          isLoading={isLoadingQuotes}
                          index={idx}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState />
                )}
              </div>
            )}
          </div>
        </div>
    </section>
  );
}
