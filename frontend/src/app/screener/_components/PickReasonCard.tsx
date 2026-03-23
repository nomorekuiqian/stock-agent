'use client';

import Link from 'next/link';

interface PickReasonCardProps {
  symbol: string;
  name?: string;
  price?: number;
  dailyChange?: number;
  reason: string;
  index: number;
  /** When provided, clicking opens the stock in the right panel instead of navigating. */
  onStockClick?: (symbol: string) => void;
}

/**
 * PickReasonCard - Stock recommendation card with personalized reason.
 *
 * Shows stock info + AI-generated reason that echoes user preferences.
 * Staggered entry animation for premium feel.
 */
export default function PickReasonCard({
  symbol,
  name,
  price,
  dailyChange,
  reason,
  index,
  onStockClick,
}: PickReasonCardProps) {
  // Strip exchange prefix (e.g., "NASDAQ:AAPL" -> "AAPL")
  const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;

  const changeColor = dailyChange && dailyChange > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : dailyChange && dailyChange < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground';

  const wrapperClass = "block animate-fade-in-up group text-left w-full";
  const wrapperStyle = { animationDelay: `${index * 80}ms` };

  const cardContent = (
    <div className="p-4 rounded-xl border border-border/50 bg-card/80 hover:border-primary/30 hover:bg-card transition-all duration-200">
      {/* Header: symbol + price */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-data text-sm font-medium text-primary group-hover:text-primary/80">
            {cleanSymbol}
          </span>
          {name && (
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {name}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          {price != null && (
            <span className="font-data text-sm text-foreground">
              ${price.toFixed(2)}
            </span>
          )}
          {dailyChange != null && (
            <span className={`font-data text-xs ${changeColor}`}>
              {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {reason}
      </p>

      {/* Subtle link indicator */}
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-primary/60 transition-colors">
        <span>查看详情</span>
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );

  if (onStockClick) {
    return (
      <button onClick={() => onStockClick(cleanSymbol)} className={wrapperClass} style={wrapperStyle}>
        {cardContent}
      </button>
    );
  }

  return (
    <Link href={`/stock/${cleanSymbol}`} className={wrapperClass} style={wrapperStyle}>
      {cardContent}
    </Link>
  );
}
