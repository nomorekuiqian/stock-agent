'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

export interface StockQuoteData {
  symbol: string;
  price?: number;
  daily_change?: number;
  name?: string;
}

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
    <Image
      src={`${LOGO_BASE}/${symbol}.png`}
      alt={symbol}
      width={36}
      height={36}
      unoptimized
      className="w-9 h-9 rounded-xl bg-muted/50 object-contain shrink-0"
      loading="lazy"
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

  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingRemove) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingRemove(false);
      onRemove?.();
    } else {
      setConfirmingRemove(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingRemove(false);
      }, 3000);
    }
  };

  return (
    <div
      className={`group relative animate-fade-in-up ${onClick ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={onClick}
    >
      <div className="relative bg-card border border-border/50 rounded-xl p-4 group-hover:translate-y-[-1px] hover-glow">
        {onRemove && (
          <button
            onClick={handleRemoveClick}
            className={`absolute top-2 right-2 rounded-lg border transition-all duration-200 z-10 ${
              confirmingRemove
                ? 'px-2 py-1 bg-red-500/10 border-red-500/30 text-red-500 opacity-100'
                : 'p-1.5 bg-muted/80 sm:bg-muted/50 border-border/50 text-muted-foreground sm:text-muted-foreground/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30'
            }`}
            aria-label={confirmingRemove ? `Confirm remove ${symbol}` : `Remove ${symbol}`}
          >
            {confirmingRemove ? (
              <span className="text-[11px] font-medium leading-none">确认?</span>
            ) : (
              <X className="w-3 h-3" />
            )}
          </button>
        )}

        <div className="flex items-center gap-3 mb-3">
          <CompanyLogo symbol={symbol} />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-sm text-foreground tracking-tight">{symbol}</div>
            <div className="text-xs text-muted-foreground truncate">{displayName || '-'}</div>
          </div>
        </div>

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

        {isLoading && !quote && (
          <div className="absolute inset-0 bg-background/95 rounded-xl flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
