'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';

// Columns to show per strategy (beyond the base columns)
const STRATEGY_COLUMNS: Record<string, { key: string; label: string; format?: 'pct' | 'number' | 'ratio' | 'bool' | 'rating' }[]> = {
  hot_sectors: [
    { key: 'weekly_change', label: '周涨幅', format: 'pct' },
    { key: 'monthly_change', label: '月涨幅', format: 'pct' },
  ],
  volume_surge: [
    { key: 'relative_volume', label: '相对成交量', format: 'ratio' },
    { key: 'avg_volume_30d', label: '30日均量', format: 'number' },
  ],
  value_discovery: [
    { key: 'pe_ttm', label: 'PE', format: 'ratio' },
    { key: 'roe', label: 'ROE', format: 'pct' },
    { key: 'position_52w', label: '52周位置', format: 'pct' },
  ],
  high_dividend: [
    { key: 'dividend_yield', label: '股息率', format: 'pct' },
    { key: 'payout_ratio', label: '派息率', format: 'pct' },
    { key: 'dividend_payout_years', label: '连续派息(年)', format: 'number' },
  ],
  momentum: [
    { key: 'change_3m', label: '3月涨幅', format: 'pct' },
    { key: 'rsi', label: 'RSI', format: 'ratio' },
    { key: 'above_sma50', label: '>SMA50', format: 'bool' },
  ],
  oversold_quality: [
    { key: 'rsi', label: 'RSI', format: 'ratio' },
    { key: 'roe', label: 'ROE', format: 'pct' },
    { key: 'analyst_rating', label: '分析师', format: 'rating' },
    { key: 'analyst_upside', label: '上行空间', format: 'pct' },
  ],
  by_sector: [
    { key: 'pe_ttm', label: 'PE', format: 'ratio' },
    { key: 'market_cap', label: '市值', format: 'number' },
  ],
  custom: [
    { key: 'pe_ttm', label: 'PE', format: 'ratio' },
    { key: 'roe', label: 'ROE', format: 'pct' },
  ],
};

const SECTOR_ZH: Record<string, string> = {
  'Commercial Services': '商业服务',
  'Communications': '通信',
  'Consumer Durables': '耐用消费品',
  'Consumer Non-Durables': '非耐用消费品',
  'Consumer Services': '消费服务',
  'Distribution Services': '分销服务',
  'Electronic Technology': '电子技术',
  'Energy Minerals': '能源矿产',
  'Finance': '金融',
  'Health Services': '医疗服务',
  'Health Technology': '医疗技术',
  'Industrial Services': '工业服务',
  'Miscellaneous': '其他',
  'Non-Energy Minerals': '非能源矿产',
  'Process Industries': '加工工业',
  'Producer Manufacturing': '生产制造',
  'Retail Trade': '零售',
  'Technology Services': '科技服务',
  'Transportation': '运输',
  'Utilities': '公用事业',
};

function formatValue(
  val: unknown,
  format?: 'pct' | 'number' | 'ratio' | 'bool' | 'rating',
): string {
  if (val === null || val === undefined) return '-';

  switch (format) {
    case 'pct': {
      const n = Number(val);
      if (isNaN(n)) return '-';
      return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
    }
    case 'ratio': {
      const n = Number(val);
      if (isNaN(n)) return '-';
      return n.toFixed(2);
    }
    case 'number': {
      const n = Number(val);
      if (isNaN(n)) return '-';
      if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
      if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
      return n.toFixed(0);
    }
    case 'bool':
      return val === true ? 'Yes' : val === false ? 'No' : '-';
    case 'rating': {
      const n = Number(val);
      if (isNaN(n)) return '-';
      if (n < 1.5) return 'Strong Buy';
      if (n < 2.5) return 'Buy';
      if (n < 3.5) return 'Hold';
      if (n < 4.5) return 'Sell';
      return 'Strong Sell';
    }
    default:
      return String(val);
  }
}

function formatPrice(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return '-';
  return `$${n.toFixed(2)}`;
}

function formatMarketCap(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return '-';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

interface CandidateListProps {
  candidates: Record<string, unknown>[];
  strategy: string;
  expanded?: boolean; // Show more fields when < 5 candidates
}

const MAX_WATCHLIST_SIZE = 25;

export default function CandidateList({ candidates, strategy, expanded = false }: CandidateListProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  // Watchlist integration
  const { user } = useAuth();
  const { data: watchlistData } = useWatchlist(!!user?.id);
  const saveWatchlist = useSaveWatchlist();
  const watchlistSymbols = watchlistData?.symbols || [];
  const atLimit = watchlistSymbols.length >= MAX_WATCHLIST_SIZE;

  const handleAddToWatchlist = (cleanSymbol: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id || watchlistSymbols.includes(cleanSymbol) || atLimit) return;
    const updated = [...watchlistSymbols, cleanSymbol];
    saveWatchlist.mutate({ userId: user.id, symbols: updated });
  };

  const extraCols = STRATEGY_COLUMNS[strategy] || STRATEGY_COLUMNS['custom'];

  const sorted = useMemo(() => {
    if (!sortKey) return candidates;
    return [...candidates].sort((a, b) => {
      const va = Number(a[sortKey]) || 0;
      const vb = Number(b[sortKey]) || 0;
      return sortDesc ? vb - va : va - vb;
    });
  }, [candidates, sortKey, sortDesc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl border border-dashed border-border/50">
        <svg className="w-10 h-10 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">无匹配结果</p>
          <p className="text-xs text-muted-foreground mt-1">尝试调整筛选条件或删除部分条件</p>
        </div>
      </div>
    );
  }

  // Mobile: Card view
  // Desktop: Table view
  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <ThCol label="代码" sortKey="symbol" currentSort={sortKey} desc={sortDesc} onSort={handleSort} />
              <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">名称</th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">板块</th>
              <ThCol label="价格" sortKey="price" currentSort={sortKey} desc={sortDesc} onSort={handleSort} align="right" />
              <ThCol label="日涨跌" sortKey="daily_change" currentSort={sortKey} desc={sortDesc} onSort={handleSort} align="right" />
              <ThCol label="市值" sortKey="market_cap" currentSort={sortKey} desc={sortDesc} onSort={handleSort} align="right" />
              {extraCols.map((col) => (
                <ThCol
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={sortKey}
                  desc={sortDesc}
                  onSort={handleSort}
                  align="right"
                />
              ))}
              <th className="w-10 py-2.5 px-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const symbol = String(c.symbol || '');
              const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
              const dailyChange = Number(c.daily_change) || 0;
              const changeColor = dailyChange > 0
                ? 'text-emerald-500'
                : dailyChange < 0
                  ? 'text-red-400'
                  : 'text-muted-foreground';
              const sectorEn = String(c.sector || '');
              const sectorZh = SECTOR_ZH[sectorEn] || sectorEn;

              return (
                <tr
                  key={cleanSymbol}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/stock/${cleanSymbol}`}
                      className="font-semibold font-data text-foreground hover:text-emerald-500 transition-colors"
                    >
                      {cleanSymbol}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground max-w-[160px] truncate">
                    {String(c.name || '')}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">
                    {sectorZh}
                  </td>
                  <td className="py-2.5 px-3 text-right font-data tabular-nums text-foreground">
                    {formatPrice(c.price)}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-data tabular-nums ${changeColor}`}>
                    {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-data tabular-nums text-muted-foreground">
                    {formatMarketCap(c.market_cap)}
                  </td>
                  {extraCols.map((col) => (
                    <td key={col.key} className="py-2.5 px-3 text-right font-data tabular-nums text-muted-foreground">
                      {formatValue(c[col.key], col.format)}
                    </td>
                  ))}
                  <td className="py-2.5 px-2 text-center">
                    <WatchlistBtn
                      cleanSymbol={cleanSymbol}
                      inWatchlist={watchlistSymbols.includes(cleanSymbol)}
                      atLimit={atLimit}
                      onClick={handleAddToWatchlist}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {sorted.map((c) => {
          const symbol = String(c.symbol || '');
          const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
          const dailyChange = Number(c.daily_change) || 0;
          const changeColor = dailyChange > 0
            ? 'text-emerald-500'
            : dailyChange < 0
              ? 'text-red-400'
              : 'text-muted-foreground';
          const sectorEn = String(c.sector || '');
          const sectorZh = SECTOR_ZH[sectorEn] || sectorEn;

          return (
            <div
              key={cleanSymbol}
              className="relative p-3 rounded-lg border border-border/50 bg-card hover:border-emerald-500/30 transition-colors"
            >
              <Link href={`/stock/${cleanSymbol}`} className="block">
                {/* Row 1: Symbol + Name + Sector */}
                <div className="flex items-baseline justify-between gap-2 pr-8">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-semibold font-data text-foreground">{cleanSymbol}</span>
                    <span className="text-xs text-muted-foreground truncate">{String(c.name || '')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{sectorZh}</span>
                </div>

                {/* Row 2: Price + Change + MarketCap */}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="font-data tabular-nums text-foreground">{formatPrice(c.price)}</span>
                  <span className={`font-data tabular-nums text-sm ${changeColor}`}>
                    {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(2)}%
                  </span>
                  <span className="text-xs text-muted-foreground font-data tabular-nums">
                    {formatMarketCap(c.market_cap)}
                  </span>
                </div>

                {/* Row 3: Strategy-specific metrics */}
                {(expanded || extraCols.length > 0) && (
                  <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/30">
                    {extraCols.slice(0, expanded ? 4 : 3).map((col) => (
                      <div key={col.key} className="text-xs">
                        <span className="text-muted-foreground">{col.label}: </span>
                        <span className="text-foreground font-data tabular-nums">
                          {formatValue(c[col.key], col.format)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Link>
              {/* Watchlist button - positioned top-right */}
              <div className="absolute top-2.5 right-2.5">
                <WatchlistBtn
                  cleanSymbol={cleanSymbol}
                  inWatchlist={watchlistSymbols.includes(cleanSymbol)}
                  atLimit={atLimit}
                  onClick={handleAddToWatchlist}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Result count */}
      <div className="mt-3 text-xs text-muted-foreground text-center">
        共 {candidates.length} 只候选股
        {candidates.length <= 5 && (
          <span className="ml-2 text-emerald-500">点击查看个股深研</span>
        )}
      </div>
    </div>
  );
}

// Watchlist add/check button
function WatchlistBtn({
  cleanSymbol,
  inWatchlist,
  atLimit,
  onClick,
}: {
  cleanSymbol: string;
  inWatchlist: boolean;
  atLimit: boolean;
  onClick: (symbol: string, e: React.MouseEvent) => void;
}) {
  if (inWatchlist) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-emerald-500" title="已在持仓中">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => onClick(cleanSymbol, e)}
      disabled={atLimit}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/50 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      title={atLimit ? '持仓已满 (25)' : '加入持仓'}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

// Sortable table header cell
function ThCol({
  label,
  sortKey,
  currentSort,
  desc,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: string;
  currentSort: string | null;
  desc: boolean;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === sortKey;

  return (
    <th
      className={`py-2.5 px-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <svg
            className={`w-3 h-3 transition-transform ${desc ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </span>
    </th>
  );
}
