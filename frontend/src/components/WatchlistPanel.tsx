'use client';

import { Search, Plus, X, TrendingUp, Sparkles, BarChart3 } from 'lucide-react';

// Types
interface StockQuote {
  symbol: string;
  price?: number;
  daily_change?: number;
  name?: string;
  sparkline?: number[]; // Mini price history for sparkline
}

interface PresetPortfolio {
  id: string;
  name: string;
  nameZh: string;
  symbols: string[];
  icon?: string;
}

interface SearchResult {
  symbol: string;
  name: string;
}

interface WatchlistPanelProps {
  symbols: string[];
  quotes: Record<string, StockQuote>;
  stockNames: Record<string, { zh?: string; en?: string }>;
  presetPortfolios: PresetPortfolio[];
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
  onAddPortfolio: (portfolio: PresetPortfolio) => void;
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

// Mini Sparkline Component
function MiniSparkline({
  data,
  isPositive,
  width = 60,
  height = 24
}: {
  data?: number[];
  isPositive: boolean;
  width?: number;
  height?: number;
}) {
  // Generate fake data if none provided
  const chartData = data || Array.from({ length: 12 }, (_, i) =>
    50 + Math.sin(i * 0.5) * 20 + Math.random() * 10
  );

  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;

  const points = chartData.map((val, i) => {
    const x = (i / (chartData.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const pathD = `M ${points.split(' ').join(' L ')}`;

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Gradient definition */}
      <defs>
        <linearGradient id={`sparkline-gradient-${isPositive ? 'up' : 'down'}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={`${pathD} L ${width},${height} L 0,${height} Z`}
        fill={`url(#sparkline-gradient-${isPositive ? 'up' : 'down'})`}
        className="animate-fade-in"
      />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={isPositive ? '#10B981' : '#EF4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw-line"
        style={{
          strokeDasharray: 200,
          strokeDashoffset: 200,
          animation: 'draw-line 1s ease-out forwards'
        }}
      />

      {/* End dot */}
      <circle
        cx={width}
        cy={height - ((chartData[chartData.length - 1] - min) / range) * height}
        r="2"
        fill={isPositive ? '#10B981' : '#EF4444'}
        className="animate-pulse-subtle"
      />
    </svg>
  );
}

// Stock Card Component
function StockCard({
  symbol,
  quote,
  displayName,
  onRemove,
  isLoading,
  index
}: {
  symbol: string;
  quote?: StockQuote;
  displayName: string;
  onRemove: () => void;
  isLoading?: boolean;
  index: number;
}) {
  const price = quote?.price;
  const dailyChange = quote?.daily_change;
  const isPositive = dailyChange !== undefined && dailyChange >= 0;

  return (
    <div
      className="group relative animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Glow effect on hover */}
      <div className={`absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm ${
        isPositive ? 'bg-emerald-500/20' : dailyChange !== undefined ? 'bg-red-500/20' : 'bg-emerald-500/10'
      }`} />

      {/* Card */}
      <div className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-4 transition-all duration-300 group-hover:border-emerald-500/30 group-hover:translate-y-[-2px] group-hover:shadow-lg group-hover:shadow-black/10 dark:group-hover:shadow-black/20">
        {/* Remove button */}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/50 border border-border/50 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-200 z-10"
          aria-label={`Remove ${symbol}`}
        >
          <X className="w-3 h-3" />
        </button>

        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold font-mono text-sm text-foreground tracking-tight">{symbol}</span>
          </div>

          {/* Sparkline */}
          <div className="opacity-60 group-hover:opacity-100 transition-opacity">
            <MiniSparkline data={quote?.sparkline} isPositive={isPositive} />
          </div>
        </div>

        {/* Name */}
        <div className="text-xs text-muted-foreground truncate mb-3 pr-6 group-hover:text-foreground/70 transition-colors">
          {displayName || '-'}
        </div>

        {/* Price and change row */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            {price !== undefined ? (
              <span className="font-mono text-base font-medium text-foreground tabular-nums">
                ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/50">--</span>
            )}
          </div>

          {dailyChange !== undefined && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}>
              <TrendingUp className={`w-3 h-3 ${!isPositive && 'rotate-180'}`} />
              <span className="font-mono text-xs font-medium tabular-nums">
                {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {isLoading && !quote && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// Preset Portfolio Button
function PresetButton({
  portfolio,
  addedCount,
  totalCount,
  isDisabled,
  allAdded,
  onClick,
  index
}: {
  portfolio: PresetPortfolio;
  addedCount: number;
  totalCount: number;
  isDisabled: boolean;
  allAdded: boolean;
  onClick: () => void;
  index: number;
}) {
  const progress = addedCount / totalCount;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`group relative px-4 py-2 rounded-lg text-xs font-medium transition-all duration-300 overflow-hidden animate-fade-in-up ${
        allAdded
          ? 'text-emerald-600 dark:text-emerald-400 cursor-default'
          : isDisabled
          ? 'text-muted-foreground/50 cursor-not-allowed'
          : 'text-foreground/70 hover:text-foreground'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Background */}
      <div className={`absolute inset-0 transition-all duration-300 ${
        allAdded
          ? 'bg-emerald-500/10 border border-emerald-500/30'
          : isDisabled
          ? 'bg-muted/30 border border-border/30'
          : 'bg-muted/50 border border-border/50 group-hover:bg-emerald-500/5 group-hover:border-emerald-500/30'
      } rounded-lg`} />

      {/* Progress bar (bottom) */}
      {!allAdded && addedCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/50 overflow-hidden rounded-b-lg">
          <div
            className="h-full bg-emerald-500/50 transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Content */}
      <span className="relative flex items-center gap-2">
        <span>{portfolio.nameZh}</span>
        <span className={`font-mono transition-colors ${
          allAdded ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-muted-foreground'
        }`}>
          {addedCount}/{totalCount}
        </span>
        {allAdded && (
          <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    </button>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      {/* Animated icon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center">
          <BarChart3 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>

      {/* Text */}
      <h4 className="text-sm font-medium text-foreground/80 mb-2">开始追踪你的投资</h4>
      <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
        搜索股票代码或使用快速添加按钮来构建你的个性化关注列表
      </p>

      {/* Decorative elements */}
      <div className="flex items-center gap-2 mt-6">
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        <Sparkles className="w-3 h-3 text-emerald-500/50" />
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      </div>
    </div>
  );
}

// Main Watchlist Panel Component
export default function WatchlistPanel({
  symbols,
  quotes,
  stockNames,
  presetPortfolios,
  maxSize = 15,
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
  onAddPortfolio,
  searchContainerRef,
  searchInputRef
}: WatchlistPanelProps) {
  const atLimit = symbols.length >= maxSize;

  return (
    <section className="border-b border-border/50">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Main card with glassmorphism */}
        <div className="relative">
          {/* Subtle glow behind card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/5 via-transparent to-emerald-500/5 rounded-2xl blur-xl opacity-50" />

          <div className="relative bg-card/90 backdrop-blur-md border border-border/50 rounded-2xl p-6 md:p-8 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                {/* Animated accent bar */}
                <div className="relative w-1 h-6 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-400 to-emerald-600 animate-pulse-subtle" />
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
                    <span className="text-muted-foreground/50">/</span>
                    <span className="tabular-nums text-muted-foreground/50">{maxSize}</span>
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
                <div className="w-5 h-5 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                <span className="text-sm text-muted-foreground">加载关注列表...</span>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Search Section */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative group">
                    {/* Search glow on focus */}
                    <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />

                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                        onFocus={onSearchFocus}
                        disabled={atLimit}
                        placeholder={atLimit ? "已达上限，请先移除股票" : "搜索股票代码或公司名称..."}
                        className="w-full pl-11 pr-4 py-3 bg-background border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      {isSearching && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
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
                          onClick={() => onAddSymbol(result.symbol, result.name)}
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

                {/* Quick Add Presets */}
                <div>
                  <p className="text-xs text-muted-foreground mb-4 uppercase tracking-wider font-medium">快速添加</p>
                  <div className="flex flex-wrap gap-2">
                    {presetPortfolios.map((portfolio, idx) => {
                      const addedCount = portfolio.symbols.filter(s => symbols.includes(s)).length;
                      const allAdded = addedCount === portfolio.symbols.length;

                      return (
                        <PresetButton
                          key={portfolio.id}
                          portfolio={portfolio}
                          addedCount={addedCount}
                          totalCount={portfolio.symbols.length}
                          isDisabled={allAdded || atLimit}
                          allAdded={allAdded}
                          onClick={() => onAddPortfolio(portfolio)}
                          index={idx}
                        />
                      );
                    })}
                  </div>
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
      </div>
    </section>
  );
}
