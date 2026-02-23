'use client';

import { StockQuote } from '@/lib/api';

interface PortfolioSnapshotBarProps {
  symbols: string[];
  quotes: Record<string, StockQuote>;
  isLoading: boolean;
}

export default function PortfolioSnapshotBar({
  symbols,
  quotes,
  isLoading,
}: PortfolioSnapshotBarProps) {
  if (symbols.length === 0) return null;

  return (
    <div className="bg-card/50 border-y border-border/50">
      <div className="max-w-5xl mx-auto">
        <div className="flex overflow-x-auto scrollbar-hide gap-0 px-4 py-3">
          {symbols.map((symbol, idx) => {
            const quote = quotes[symbol];
            const hasData = quote && !isLoading;

            return (
              <div
                key={symbol}
                className={`flex items-center gap-3 px-4 py-1 shrink-0 ${
                  idx < symbols.length - 1 ? 'border-r border-border/30' : ''
                }`}
              >
                <span className="font-data text-xs font-semibold text-foreground tracking-wide">
                  {symbol}
                </span>
                {isLoading ? (
                  <div className="flex gap-2">
                    <div className="w-12 h-3.5 bg-muted rounded animate-pulse" />
                    <div className="w-10 h-3.5 bg-muted rounded animate-pulse" />
                  </div>
                ) : hasData ? (
                  <>
                    <span className="font-data text-xs text-muted-foreground tabular-nums">
                      ${quote.price.toFixed(2)}
                    </span>
                    <span
                      className={`font-data text-xs font-medium tabular-nums ${
                        quote.daily_change >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {quote.daily_change >= 0 ? '+' : ''}
                      {quote.daily_change.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span className="font-data text-xs text-muted-foreground/50">--</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
