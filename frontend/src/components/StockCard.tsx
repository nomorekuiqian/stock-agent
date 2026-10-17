'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';
import { formatStockPrice } from '@/lib/currency';

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
  href?: string;
}

export default function StockCard({
  symbol,
  quote,
  displayName,
  onRemove,
  onClick,
  href,
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
      onClick={href ? undefined : onClick}
    >
      {href && <Link prefetch={false} href={href} onClick={onClick} aria-label={`${symbol} ${displayName} 个股分析`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-primary" />}
      <div className="relative bg-card border border-border/50 rounded-xl p-4 group-hover:translate-y-[-1px]">
        {onRemove && (
          // Hover-capable pointers reveal the X on group-hover only.
          // [@media(hover:none)] forces it visible on touch devices where there
          // is no hover state — was the source of the "can't delete on iPad" bug.
          <button
            type="button"
            onClick={handleRemoveClick}
            className={`absolute top-1.5 right-1.5 z-10 rounded-full border shadow-sm transition-all duration-200 active:scale-90 ${
              confirmingRemove
                ? 'px-2.5 py-1 bg-red-500 border-red-500 text-white opacity-100'
                : 'p-1.5 bg-card/95 backdrop-blur-sm border-border/60 text-muted-foreground/80 hover:text-white hover:bg-red-500 hover:border-red-500 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:p-2'
            }`}
            aria-label={confirmingRemove ? `确认移除 ${symbol}` : `移除 ${symbol}`}
          >
            {confirmingRemove ? (
              <span className="text-xs font-medium leading-tight whitespace-nowrap">确认?</span>
            ) : (
              <X className="w-3.5 h-3.5" />
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
                {formatStockPrice(price, quote?.symbol || symbol, undefined, { compactPrice: true })}
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
            <span className="text-xs text-muted-foreground/70">--</span>
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
