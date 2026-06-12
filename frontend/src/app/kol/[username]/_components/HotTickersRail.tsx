'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import type { KolCockpitTickerSummary } from '@/lib/api';
import { formatStockPrice } from '@/lib/currency';

interface Props {
  tickers: KolCockpitTickerSummary[];
  activeTicker?: string | null;
  onSelectTicker?: (ticker: string) => void;
}

/**
 * Right rail — top mentioned tickers. Shows price + daily change + a tiny
 * mention-count bar. Clicking a row sets the feed filter.
 */
const RAIL_LIMIT = 15;

export default function HotTickersRail({ tickers, activeTicker, onSelectTicker }: Props) {
  if (!tickers.length) return null;
  const top = tickers.slice(0, RAIL_LIMIT);
  const maxCount = Math.max(...top.map((t) => t.count));

  return (
    <aside className="sticky top-24 hidden h-fit w-[280px] shrink-0 self-start xl:block">
      <div className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            高频标的
          </h2>
          <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            TOP {top.length}
          </span>
        </div>
        <ul className="mt-3.5 max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-1">
          {top.map((t) => {
            const active = activeTicker === t.ticker;
            const widthPct = Math.max(8, Math.round((t.count / maxCount) * 100));
            return (
              <li key={t.ticker}>
                <button
                  onClick={() => onSelectTicker?.(t.ticker)}
                  className={`group block w-full text-left transition ${
                    active ? 'opacity-100' : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`font-data text-sm font-medium tabular-nums ${
                        active ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      ${t.ticker}
                    </span>
                    <PriceMeta
                      ticker={t.ticker}
                      price={t.price}
                      change={t.daily_change}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={`h-full transition-all ${active ? 'bg-primary' : 'bg-primary/60 group-hover:bg-primary/80'}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-data text-[11px] tabular-nums text-muted-foreground">
                      {t.count}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 font-data text-[10px] leading-relaxed text-muted-foreground/70">
          点击筛选他对该标的所有发言
        </p>
      </div>
    </aside>
  );
}

function PriceMeta({ ticker, price, change }: { ticker: string; price: number | null; change: number | null }) {
  if (price == null) {
    return (
      <span className="font-data text-[11px] text-muted-foreground/70">无报价</span>
    );
  }
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const flat = (change ?? 0) === 0;
  const ChangeIcon = !hasChange || flat ? Minus : up ? TrendingUp : TrendingDown;
  const colorCls = !hasChange
    ? 'text-muted-foreground'
    : flat
      ? 'text-muted-foreground'
      : up
        ? 'text-primary'
        : 'text-destructive';
  return (
    <span className={`flex items-center gap-1 font-data text-[11px] tabular-nums ${colorCls}`}>
      {formatStockPrice(price, ticker, undefined, { compactPrice: true })}
      {hasChange ? (
        <span className="inline-flex items-center gap-0.5">
          <ChangeIcon className="h-3 w-3" />
          {Math.abs(change!).toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}
