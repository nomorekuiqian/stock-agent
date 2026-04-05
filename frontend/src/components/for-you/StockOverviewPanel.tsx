'use client';

import { useState } from 'react';
import { StockAnalysis } from '@/lib/api';
import { sortByVolatility, isNotableMove, parseChangePercent } from '@/lib/digest-utils';
import StockListItem from './StockListItem';
import StockDetailPanel from './StockDetailPanel';
import Link from 'next/link';

interface StockOverviewPanelProps {
  stocks: StockAnalysis[];
}

/* ------------------------------------------------------------------ */
/* Mobile accordion item                                               */
/* ------------------------------------------------------------------ */

function MobileStockItem({
  stock,
  isOpen,
  isHighlighted,
  onToggle,
}: {
  stock: StockAnalysis;
  isOpen: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
}) {
  const changeValue = parseChangePercent(stock.daily_change);
  const isPositive = changeValue >= 0;
  const isPositiveWeek = stock.week_change.startsWith('+');

  let bgClass = '';
  if (isHighlighted && !isOpen) {
    bgClass = isPositive ? 'bg-emerald-500/5' : 'bg-red-500/5';
  }

  return (
    <div className={bgClass}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${
              isPositive ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          <span className="font-semibold font-data text-sm text-foreground">
            {stock.symbol}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {stock.name}
          </span>
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
          <svg
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expandable detail */}
      {isOpen && (
        <div className="pb-4 px-1 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`font-data text-xs ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {stock.daily_change}
            </span>
            <span className="text-muted-foreground/50 text-xs">|</span>
            <span
              className={`font-data text-xs ${
                isPositiveWeek ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {stock.week_change} (周)
            </span>
          </div>

          <p className="text-base font-medium text-foreground leading-relaxed mb-2">
            {stock.status}
          </p>

          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {stock.quick_take}
          </p>

          <Link
            href={`/stock/${stock.symbol}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            查看 {stock.symbol} 完整分析
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function StockOverviewPanel({ stocks }: StockOverviewPanelProps) {
  const sorted = sortByVolatility(stocks);
  const [selectedSymbol, setSelectedSymbol] = useState(sorted[0]?.symbol ?? '');
  const selectedStock = sorted.find((s) => s.symbol === selectedSymbol) || sorted[0];

  if (sorted.length === 0) return null;

  return (
    <>
      {/* Desktop: dual-column layout */}
      <div className="hidden md:grid md:grid-cols-[260px_1fr] gap-4">
        {/* Left column — stock list */}
        <div className="divide-y divide-border/30 rounded-lg border border-border/30">
          {sorted.map((stock) => (
            <StockListItem
              key={stock.symbol}
              stock={stock}
              isSelected={stock.symbol === selectedSymbol}
              isHighlighted={isNotableMove(stock.daily_change)}
              onClick={() => setSelectedSymbol(stock.symbol)}
            />
          ))}
        </div>

        {/* Right column — detail panel */}
        <div className="md:sticky md:top-4 self-start pl-2">
          {selectedStock && <StockDetailPanel stock={selectedStock} />}
        </div>
      </div>

      {/* Mobile: accordion layout */}
      <div className="md:hidden divide-y divide-border/30">
        {sorted.map((stock) => (
          <MobileStockItem
            key={stock.symbol}
            stock={stock}
            isOpen={stock.symbol === selectedSymbol}
            isHighlighted={isNotableMove(stock.daily_change)}
            onToggle={() =>
              setSelectedSymbol(
                stock.symbol === selectedSymbol ? '' : stock.symbol
              )
            }
          />
        ))}
      </div>
    </>
  );
}
