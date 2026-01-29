'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

export interface StockQuoteData {
  symbol: string;
  price?: number;
  daily_change?: number;
  name?: string;
}

// Company Logo - uses FMP image-stock CDN, fallback to initials
const LOGO_BASE = 'https://financialmodelingprep.com/image-stock';

function CompanyLogo({ symbol }: { symbol: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-9 h-9 rounded-xl bg-muted/80 border border-border/50 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-muted-foreground">{symbol.slice(0, 2)}</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`${LOGO_BASE}/${symbol}.png`}
      alt={symbol}
      width={36}
      height={36}
      className="w-9 h-9 rounded-xl bg-muted/50 object-contain shrink-0"
      onError={() => setError(true)}
    />
  );
}

export interface StockCardProps {
  symbol: string;
  quote?: StockQuoteData;
  displayName: string;
  index: number;
  isLoading?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function StockCard({
  symbol,
  quote,
  displayName,
  onRemove,
  onClick,
  isLoading,
  index
}: StockCardProps) {
  const price = quote?.price;
  const dailyChange = quote?.daily_change;
  const isPositive = dailyChange !== undefined && dailyChange >= 0;

  return (
    <div
      className={`group relative animate-fade-in-up ${onClick ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={onClick}
    >
      <div className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-4 transition-all duration-300 group-hover:border-emerald-500/30 group-hover:translate-y-[-1px] group-hover:shadow-md group-hover:shadow-black/5 dark:group-hover:shadow-black/15">
        {/* Remove button - visible on mobile, hover-controlled on desktop */}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 sm:bg-muted/50 border border-border/50 text-muted-foreground sm:text-muted-foreground/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-200 z-10"
            aria-label={`Remove ${symbol}`}
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* Logo + Ticker + Name */}
        <div className="flex items-center gap-3 mb-3">
          <CompanyLogo symbol={symbol} />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-sm text-foreground tracking-tight">{symbol}</div>
            <div className="text-xs text-muted-foreground truncate">{displayName || '-'}</div>
          </div>
        </div>

        {/* Price + Change */}
        <div className="flex items-baseline gap-2">
          {price !== undefined ? (
            <>
              <span className="font-mono text-sm font-medium text-foreground tabular-nums">
                ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {dailyChange !== undefined && (
                <span className={`font-mono text-xs tabular-nums ${
                  isPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground/40">--</span>
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
