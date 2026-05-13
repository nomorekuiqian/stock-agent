'use client';

import { StockAnalysis } from '@/lib/api';
import { parseChangePercent } from '@/lib/digest-utils';

interface StockListItemProps {
  stock: StockAnalysis;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  weightPct?: number;
}

export default function StockListItem({
  stock,
  isSelected,
  isHighlighted,
  onClick,
  weightPct,
}: StockListItemProps) {
  const changeValue = parseChangePercent(stock.daily_change);
  const isPositive = changeValue >= 0;

  let bgClass = '';
  if (isSelected) {
    bgClass = 'bg-card/80';
  } else if (isHighlighted) {
    bgClass = isPositive ? 'bg-emerald-500/5' : 'bg-red-500/5';
  }

  return (
    <button
      id={`stock-${stock.symbol}`}
      type="button"
      onClick={onClick}
      className={`
        relative w-full flex items-center justify-between px-3 py-2.5
        text-left transition-colors cursor-pointer
        hover:bg-card/60
        ${bgClass}
      `}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}

      <div className="flex items-center gap-2 min-w-0">
        {/* Color dot */}
        <span
          className={`shrink-0 w-1.5 h-1.5 rounded-full ${
            isPositive ? 'bg-emerald-400' : 'bg-red-400'
          }`}
        />
        <span className="font-semibold font-data text-sm text-foreground truncate">
          {stock.symbol}
        </span>
        {weightPct != null && (
          <span className="text-[11px] text-muted-foreground/70 font-data ml-1">
            {weightPct.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-xs font-data text-muted-foreground">
          ${stock.price.toFixed(2)}
        </span>
        <span
          className={`text-xs font-data font-medium ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {stock.daily_change}
        </span>
      </div>
    </button>
  );
}
