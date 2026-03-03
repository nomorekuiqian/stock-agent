'use client';

import Link from 'next/link';

interface PickReasonCardProps {
  symbol: string;
  name?: string;
  price?: number;
  dailyChange?: number;
  reason: string;
  index: number;
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
}: PickReasonCardProps) {
  // Strip exchange prefix (e.g., "NASDAQ:AAPL" -> "AAPL")
  const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;

  const changeColor = dailyChange && dailyChange > 0
    ? 'text-emerald-400'
    : dailyChange && dailyChange < 0
      ? 'text-red-400'
      : 'text-zinc-400';

  return (
    <Link
      href={`/stock/${cleanSymbol}`}
      className="block animate-fade-in-up group"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="p-4 rounded-xl border border-border/30 bg-zinc-800/30 hover:border-emerald-500/20 hover:bg-zinc-800/50 transition-all duration-200">
        {/* Header: symbol + price */}
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-data text-sm font-medium text-emerald-400 group-hover:text-emerald-300">
              {cleanSymbol}
            </span>
            {name && (
              <span className="text-xs text-zinc-500 truncate max-w-[120px]">
                {name}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            {price != null && (
              <span className="font-data text-sm text-zinc-300">
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
        <p className="text-sm text-zinc-400 leading-relaxed">
          {reason}
        </p>

        {/* Subtle link indicator */}
        <div className="mt-2 flex items-center gap-1 text-xs text-zinc-600 group-hover:text-emerald-500/50 transition-colors">
          <span>查看详情</span>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
