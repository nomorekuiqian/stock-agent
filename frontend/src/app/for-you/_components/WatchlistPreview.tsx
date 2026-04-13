'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StockCard from '@/components/StockCard';
import { useStockQuotes } from '@/hooks/queries/use-stock-data';
import { STOCK_NAMES } from '@/lib/stock-names';

interface WatchlistPreviewProps {
  symbols: string[];
}

export default function WatchlistPreview({ symbols }: WatchlistPreviewProps) {
  const router = useRouter();
  const { data: quotesResponse, isLoading: loadingQuotes } = useStockQuotes(symbols);

  const quotes = useMemo(() => {
    const map: Record<string, { symbol: string; price?: number; daily_change?: number; name?: string }> = {};
    if (quotesResponse?.quotes) {
      for (const q of quotesResponse.quotes) {
        map[q.symbol] = q;
      }
    }
    return map;
  }, [quotesResponse]);

  const getDisplayName = (symbol: string) => {
    const names = STOCK_NAMES[symbol];
    // Fall back to API-provided name, then symbol itself
    return names?.zh || names?.en || quotes[symbol]?.name || symbol;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
      {/* Digest pending notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 px-5 py-4 mb-8">
        <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm text-foreground">
            你的专属日报将在今天美股收盘后自动生成
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            在此之前，可以先查看
            <Link href="/today" className="text-primary hover:text-primary/80 transition-colors mx-0.5">今日市场报告</Link>
            了解大盘走势
          </p>
        </div>
      </div>

      {/* Watchlist stocks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">我的持仓</h2>
            <span className="text-xs text-muted-foreground">{symbols.length} 只</span>
          </div>
          <Link
            href="/for-you/watchlist"
            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1 group"
          >
            编辑
            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {symbols.map((symbol, idx) => (
            <StockCard
              key={symbol}
              symbol={symbol}
              quote={quotes[symbol]}
              displayName={getDisplayName(symbol)}
              index={idx}
              isLoading={loadingQuotes}
              onClick={() => router.push(`/stock/${symbol}`)}
            />
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/30">
        <Link
          href="/today"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          今日市场报告
        </Link>
        <Link
          href="/research"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          AI 研究助手
        </Link>
      </div>
    </div>
  );
}
