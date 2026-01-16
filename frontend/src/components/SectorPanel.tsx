'use client';

import { useState } from 'react';
import { Search, Bell, BellOff, TrendingUp, Sparkles, BarChart3 } from 'lucide-react';

// Types
interface SectorInfo {
  id: string;
  name_en: string;
  name_zh: string;
  description: string;
  symbols: string[];
  symbol_count: number;
}

interface StockQuote {
  symbol: string;
  price?: number;
  daily_change?: number;
  name?: string;
}

interface SectorPanelProps {
  sectors: SectorInfo[];
  selectedSectorId: string | null;
  subscribedSectorIds: string[];
  quotes: Record<string, StockQuote>;
  stockNames: Record<string, { zh?: string; en?: string }>;
  isLoading?: boolean;
  onSelectSector: (sectorId: string) => void;
  onToggleSubscription: (sectorId: string) => void;
  subscribingTo?: string | null;
}

// Mini Sparkline Component
function MiniSparkline({
  data,
  isPositive,
  width = 48,
  height = 20
}: {
  data?: number[];
  isPositive: boolean;
  width?: number;
  height?: number;
}) {
  const chartData = data || Array.from({ length: 10 }, (_, i) =>
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
      <defs>
        <linearGradient id={`sector-sparkline-${isPositive ? 'up' : 'down'}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathD} L ${width},${height} L 0,${height} Z`}
        fill={`url(#sector-sparkline-${isPositive ? 'up' : 'down'})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={isPositive ? '#10B981' : '#EF4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={height - ((chartData[chartData.length - 1] - min) / range) * height}
        r="2"
        fill={isPositive ? '#10B981' : '#EF4444'}
      />
    </svg>
  );
}

// Sector Card Component
function SectorCard({
  sector,
  isSelected,
  isSubscribed,
  avgChange,
  onSelect,
  onToggleSubscription,
  isSubscribing,
  index
}: {
  sector: SectorInfo;
  isSelected: boolean;
  isSubscribed: boolean;
  avgChange?: number;
  onSelect: () => void;
  onToggleSubscription: () => void;
  isSubscribing: boolean;
  index: number;
}) {
  const isPositive = avgChange !== undefined && avgChange >= 0;

  return (
    <div
      className="group relative animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Glow effect on hover/selected */}
      <div className={`absolute -inset-0.5 rounded-xl transition-opacity duration-500 blur-sm ${
        isSelected
          ? 'opacity-100 bg-emerald-500/30'
          : 'opacity-0 group-hover:opacity-100 bg-emerald-500/20'
      }`} />

      {/* Card */}
      <div
        onClick={onSelect}
        className={`relative cursor-pointer bg-card/80 backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 ${
          isSelected
            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
            : 'border-border/50 group-hover:border-emerald-500/30 group-hover:translate-y-[-2px] group-hover:shadow-lg group-hover:shadow-black/10'
        }`}
      >
        {/* Subscribe button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSubscription();
          }}
          disabled={isSubscribing}
          className={`absolute top-2 right-2 p-1.5 rounded-lg border transition-all duration-200 z-10 ${
            isSubscribed
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
              : 'bg-muted/50 border-border/50 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30'
          } disabled:opacity-50`}
          aria-label={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        >
          {isSubscribing ? (
            <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ) : isSubscribed ? (
            <Bell className="w-3 h-3" />
          ) : (
            <BellOff className="w-3 h-3" />
          )}
        </button>

        {/* Header row */}
        <div className="flex items-start justify-between mb-2 pr-8">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{sector.name_zh}</span>
            {isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Sector name in English */}
        <div className="text-xs text-muted-foreground mb-3 group-hover:text-foreground/70 transition-colors">
          {sector.name_en}
        </div>

        {/* Stock count and change */}
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-data">
              {sector.symbol_count} 只股票
            </span>
          </div>

          {avgChange !== undefined && (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              <TrendingUp className={`w-3 h-3 ${!isPositive && 'rotate-180'}`} />
              <span className="font-mono text-xs font-medium tabular-nums">
                {isPositive ? '+' : ''}{avgChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stock Card Component (same style as WatchlistPanel)
function StockCard({
  symbol,
  quote,
  displayName,
  index
}: {
  symbol: string;
  quote?: StockQuote;
  displayName: string;
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
      <div className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-4 transition-all duration-300 group-hover:border-emerald-500/30 group-hover:translate-y-[-2px] group-hover:shadow-lg group-hover:shadow-black/10">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold font-mono text-sm text-foreground tracking-tight">{symbol}</span>
          </div>

          {/* Sparkline */}
          <div className="opacity-60 group-hover:opacity-100 transition-opacity">
            <MiniSparkline isPositive={isPositive} width={60} height={24} />
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
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              <TrendingUp className={`w-3 h-3 ${!isPositive && 'rotate-180'}`} />
              <span className="font-mono text-xs font-medium tabular-nums">
                {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center">
          <BarChart3 className="w-7 h-7 text-emerald-400" />
        </div>
      </div>
      <h4 className="text-sm font-medium text-foreground/80 mb-2">选择一个板块</h4>
      <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
        点击任意板块卡片查看详细分析和板块内股票表现
      </p>
      <div className="flex items-center gap-2 mt-6">
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        <Sparkles className="w-3 h-3 text-emerald-500/50" />
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      </div>
    </div>
  );
}

// Main Sector Panel Component
export default function SectorPanel({
  sectors,
  selectedSectorId,
  subscribedSectorIds,
  quotes,
  stockNames,
  isLoading = false,
  onSelectSector,
  onToggleSubscription,
  subscribingTo
}: SectorPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sectors based on search
  const filteredSectors = sectors.filter((s) =>
    s.name_zh.includes(searchQuery) ||
    s.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.symbols.some((sym) => sym.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Get selected sector
  const selectedSector = sectors.find((s) => s.id === selectedSectorId);

  // Calculate average change for each sector based on quotes
  const getSectorAvgChange = (sector: SectorInfo): number | undefined => {
    const changes: number[] = [];
    sector.symbols.forEach((sym) => {
      const quote = quotes[sym];
      if (quote?.daily_change !== undefined) {
        changes.push(quote.daily_change);
      }
    });
    if (changes.length === 0) return undefined;
    return changes.reduce((a, b) => a + b, 0) / changes.length;
  };

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
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-400 to-emerald-600 animate-pulse" />
                </div>

                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    板块列表
                  </h3>

                  {/* Count badge */}
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-muted text-muted-foreground border border-border/50">
                    <span className="tabular-nums">{sectors.length}</span>
                    <span className="text-muted-foreground/50">个板块</span>
                  </div>
                </div>
              </div>

              {/* Subscribed count */}
              {subscribedSectorIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Bell className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">
                    已订阅 {subscribedSectorIds.length} 个
                  </span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                <span className="text-sm text-muted-foreground">加载板块列表...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Search Section */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索板块名称或股票代码..."
                      className="w-full pl-11 pr-4 py-3 bg-background border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Sector Cards Grid */}
                {filteredSectors.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredSectors.map((sector, idx) => (
                      <SectorCard
                        key={sector.id}
                        sector={sector}
                        isSelected={sector.id === selectedSectorId}
                        isSubscribed={subscribedSectorIds.includes(sector.id)}
                        avgChange={getSectorAvgChange(sector)}
                        onSelect={() => onSelectSector(sector.id)}
                        onToggleSubscription={() => onToggleSubscription(sector.id)}
                        isSubscribing={subscribingTo === sector.id}
                        index={idx}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState />
                )}

                {/* Selected Sector Stock Preview */}
                {selectedSector && (
                  <div className="pt-6 border-t border-border/30">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                        {selectedSector.name_zh}
                      </h4>
                      <span className="text-xs text-muted-foreground font-data">
                        {selectedSector.symbol_count} 只股票
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                      {selectedSector.description}
                    </p>

                    {/* Stock Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {selectedSector.symbols.map((symbol, idx) => {
                        const quote = quotes[symbol];
                        const stockInfo = stockNames[symbol];
                        const displayName = stockInfo?.zh || stockInfo?.en || quote?.name || symbol;

                        return (
                          <StockCard
                            key={symbol}
                            symbol={symbol}
                            quote={quote}
                            displayName={displayName}
                            index={idx}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
