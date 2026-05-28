'use client';

import { useMemo, useState } from 'react';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';

import type { KolCockpitTickerSummary } from '@/lib/api';

interface Props {
  tickers: KolCockpitTickerSummary[];
  selected: string | null;
  onSelect: (ticker: string) => void;
}

/**
 * Left rail — searchable ticker list, sorted by mention count (per backend).
 * Item rows show ticker + mention count + price + daily change.
 */
export default function TickerList({ tickers, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return tickers;
    return tickers.filter(
      (t) =>
        t.ticker.includes(q) ||
        t.aliases.some((a) => a.toUpperCase().includes(q)),
    );
  }, [tickers, query]);

  const maxCount = useMemo(
    () => Math.max(1, ...tickers.map((t) => t.count)),
    [tickers],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜 NVDA / 英伟达"
          className="w-full rounded-md border border-border/60 bg-input/30 py-2 pl-9 pr-8 font-data text-xs uppercase tracking-wider text-foreground placeholder:text-muted-foreground/70 transition focus:border-primary/40 focus:outline-none"
        />
        {query ? (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* Meta line */}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {filtered.length} / {tickers.length} 标的
        </span>
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          按提及频次
        </span>
      </div>

      {/* List */}
      <ul
        role="listbox"
        className="-mr-1 mt-2 flex-1 space-y-0 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            无命中
          </li>
        ) : (
          filtered.map((t) => {
            const active = selected === t.ticker;
            const widthPct = Math.max(4, Math.round((t.count / maxCount) * 100));
            return (
              <li key={t.ticker} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => onSelect(t.ticker)}
                  className={`group/row relative block w-full border-b border-border/30 px-3 py-3 text-left transition ${
                    active ? 'bg-accent' : 'hover:bg-muted/40'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute left-0 top-0 h-full w-[2px] transition-opacity ${
                      active ? 'bg-primary opacity-100' : 'bg-primary opacity-0 group-hover/row:opacity-30'
                    }`}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`font-data text-sm font-medium tabular-nums ${
                        active ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      ${t.ticker}
                    </span>
                    <PriceMini price={t.price} change={t.daily_change} />
                  </div>
                  {/* Thesis 1-line — matches chain mini card for visual consistency */}
                  {t.summary?.thesis ? (
                    <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
                      {t.summary.thesis}
                    </p>
                  ) : null}
                  {/* Mention bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={`h-full transition-all ${
                          active ? 'bg-primary' : 'bg-primary/50 group-hover/row:bg-primary/70'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-data text-[10px] tabular-nums text-muted-foreground">
                      {t.count}
                    </span>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function PriceMini({ price, change }: { price: number | null; change: number | null }) {
  if (price == null) {
    return (
      <span className="font-data text-[10px] tracking-wider text-muted-foreground/70">
        无报价
      </span>
    );
  }
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const flat = (change ?? 0) === 0;
  const ChangeIcon = !hasChange || flat ? null : up ? TrendingUp : TrendingDown;
  const color = !hasChange || flat
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : 'text-destructive';
  return (
    <span className={`flex items-center gap-1 font-data text-[11px] tabular-nums ${color}`}>
      {price.toFixed(2)}
      {hasChange && ChangeIcon ? (
        <span className="inline-flex items-center gap-0.5">
          <ChangeIcon className="h-2.5 w-2.5" />
          {Math.abs(change!).toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}
