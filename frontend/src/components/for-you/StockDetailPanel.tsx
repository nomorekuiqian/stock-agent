'use client';

import Link from 'next/link';
import { StockAnalysis } from '@/lib/api';

interface StockDetailPanelProps {
  stock: StockAnalysis;
}

export default function StockDetailPanel({ stock }: StockDetailPanelProps) {
  const isPositiveDaily = stock.daily_change.startsWith('+');
  const isPositiveWeek = stock.week_change.startsWith('+');

  return (
    <div key={stock.symbol} className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-lg font-semibold text-foreground">{stock.name}</span>
        <Link
          href={`/stock/${stock.symbol}`}
          className="font-data text-sm text-primary hover:text-primary/80 transition-colors"
        >
          {stock.symbol}
        </Link>
      </div>

      {/* Price + Changes */}
      <div className="flex items-center gap-4 text-sm mb-3">
        <span className="text-foreground font-medium font-data text-base">
          ${stock.price.toFixed(2)}
        </span>
        <span
          className={`font-data ${isPositiveDaily ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {stock.daily_change}
        </span>
        <span className="text-muted-foreground/50">|</span>
        <span
          className={`font-data ${isPositiveWeek ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {stock.week_change} (周)
        </span>
      </div>

      {/* Status — one-line summary, highlighted */}
      <p className="text-base font-medium text-foreground leading-relaxed mb-3">
        {stock.status}
      </p>

      {/* Quick take — detailed analysis */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {stock.quick_take}
      </p>

      {/* Link to full analysis */}
      <Link
        href={`/stock/${stock.symbol}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        查看 {stock.symbol} 完整分析
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </Link>
    </div>
  );
}
