'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';
import {
  useStockDetail,
  useEarningsData,
  useAnalystActivity,
  useNewsFeed,
} from '@/hooks/queries/use-stock-data';
import { useTechnicalData } from '@/hooks/queries/use-technical-data';
import type { StockTab } from '../../_lib/contentTypes';
import PanelOverviewTab from './PanelOverviewTab';
import PanelEarningsTab from './PanelEarningsTab';
import PanelTechnicalTab from './PanelTechnicalTab';
import PanelMarketTab from './PanelMarketTab';

export interface StockPanelContextPayload {
  type: 'stock';
  symbol: string;
  quote: Record<string, unknown> | null;
  fundamentals: Record<string, unknown> | null;
  // Earnings data
  earnings_history?: unknown[] | null;
  financial_growth?: unknown[] | null;
  income_statements?: unknown[] | null;
  // Technical data
  technical_derived?: Record<string, unknown> | null;
  support_resistance?: Record<string, unknown> | null;
  // Market data
  analyst_summary?: Record<string, unknown> | null;
  recent_news?: unknown[] | null;
}

interface StockPanelViewProps {
  symbol: string;
  defaultTab?: StockTab;
  onContextReady?: (payload: StockPanelContextPayload) => void;
}

const TABS: { key: StockTab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'earnings', label: '财报' },
  { key: 'technical', label: '技术面' },
  { key: 'market', label: '市场面' },
];

function formatPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  return `$${val.toFixed(2)}`;
}

function formatMarketCap(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

export default function StockPanelView({
  symbol,
  defaultTab,
  onContextReady,
}: StockPanelViewProps) {
  const [activeTab, setActiveTab] = useState<StockTab>(defaultTab || 'overview');
  const { user } = useAuth();
  const { data: watchlistData } = useWatchlist(user?.id);
  const saveWatchlist = useSaveWatchlist();
  const [justAdded, setJustAdded] = useState(false);
  const isInWatchlist = watchlistData?.symbols?.includes(symbol) ?? false;

  // StockPanelView is re-mounted (via key={symbol-tab}) when Agent changes tab,
  // so we rely on useState initial value for tab sync — no effect needed.

  const handleAddToWatchlist = useCallback(() => {
    if (!user || isInWatchlist) return;
    const current = watchlistData?.symbols ?? [];
    saveWatchlist.mutate({
      userId: user.id,
      symbols: [...current, symbol],
      email: user.email,
      baseUpdatedAt: watchlistData?.updated_at,
    });
    setJustAdded(true);
  }, [user, isInWatchlist, watchlistData, saveWatchlist, symbol]);

  const { data: stockData, isLoading, error } = useStockDetail(symbol);
  const { data: earningsData } = useEarningsData(symbol);
  const { data: techData } = useTechnicalData(symbol, 'daily');
  const { data: analystData } = useAnalystActivity(symbol);
  const { data: newsData } = useNewsFeed(symbol);

  const profile = stockData?.profile;
  const quote = stockData?.quote;
  const fundamentals = stockData?.fundamentals;

  // Context payload for Agent — includes data from all tabs
  useEffect(() => {
    if (!onContextReady || !stockData) return;
    onContextReady({
      type: 'stock',
      symbol,
      quote: quote || null,
      fundamentals: fundamentals || null,
      // Earnings: top-4 history + growth trends + latest income statements
      earnings_history: earningsData?.earnings_history?.slice(0, 4) ?? null,
      financial_growth: earningsData?.financial_growth?.slice(0, 4) ?? null,
      income_statements: earningsData?.income_statements?.slice(0, 1) ?? null,
      // Technical: derived signals + support/resistance
      technical_derived: techData?.derived ?? null,
      support_resistance: techData?.support_resistance ?? null,
      // Market: analyst consensus + recent news headlines
      analyst_summary: analystData?.success ? {
        ...analystData.summary,
        price_target_avg: analystData.price_target.average,
        price_target_high: analystData.price_target.high,
        price_target_low: analystData.price_target.low,
      } : null,
      recent_news: newsData?.news?.slice(0, 5).map((n: Record<string, string>) => ({
        title: n.title,
        source: n.source,
        date: n.publishedDate,
      })) ?? null,
    });
  }, [symbol, stockData, earningsData, techData, analystData, newsData, onContextReady, quote, fundamentals]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center font-data text-xs text-primary">
            {symbol.slice(0, 3)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">加载研究数据</span>
      </div>
    );
  }

  if (error || !stockData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">无法加载 {symbol} 数据</p>
      </div>
    );
  }

  const companyName = profile?.company_name_zh || profile?.company_name || symbol;
  const changePercent = quote?.change_percent ?? 0;
  const changeColor = Math.abs(changePercent) < 0.01
    ? 'text-muted-foreground'
    : changePercent > 0
      ? 'text-emerald-400'
      : 'text-red-400';

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-data text-2xl font-semibold text-foreground tracking-tight">{symbol}</h2>
              <span className={`font-data text-sm ${changeColor} tabular-nums`}>
                {changePercent > 0 ? '+' : ''}{changePercent?.toFixed(2)}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{companyName}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-data text-2xl font-semibold text-foreground tabular-nums tracking-tight">
              {formatPrice(quote?.price)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatMarketCap(quote?.market_cap)}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          <Link
            href={`/stock/${symbol}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-card/80 border border-border/50 text-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
          >
            查看详情页
          </Link>
          <button
            onClick={handleAddToWatchlist}
            disabled={isInWatchlist || saveWatchlist.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              isInWatchlist || justAdded
                ? 'bg-primary/10 border border-primary/30 text-primary'
                : 'bg-card/80 border border-border/50 text-foreground hover:border-primary/40 hover:text-primary'
            }`}
          >
            {isInWatchlist || justAdded ? '已在持仓' : '加入持仓'}
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center border-b border-border/30 px-5 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0
                focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none
                ${active ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {active && (
                <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-emerald-400 rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={activeTab} className="animate-in fade-in-0 duration-200">
        {activeTab === 'overview' && (
          <PanelOverviewTab symbol={symbol} stockData={stockData} />
        )}
        {activeTab === 'earnings' && (
          <PanelEarningsTab symbol={symbol} stockData={stockData} />
        )}
        {activeTab === 'technical' && (
          <PanelTechnicalTab symbol={symbol} />
        )}
        {activeTab === 'market' && (
          <PanelMarketTab symbol={symbol} />
        )}
      </div>
    </div>
  );
}
