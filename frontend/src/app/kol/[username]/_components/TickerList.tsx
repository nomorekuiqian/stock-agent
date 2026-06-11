'use client';

import { useMemo, useState } from 'react';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';

import type { KolCockpitTickerSummary } from '@/lib/api';
import { formatStockPrice } from '@/lib/currency';

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors" />
        <input
          id="kol-ticker-search"
          name="kol-ticker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜 NVDA / 英伟达"
          className="h-11 w-full rounded-md border border-border/60 bg-input/30 py-2 pl-9 pr-8 text-sm font-medium text-foreground placeholder:text-muted-foreground transition duration-200 ease-out focus:border-primary/45 focus:bg-primary/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空搜索"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition duration-200 ease-out hover:bg-muted/70 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* Meta line */}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-sm font-medium leading-snug text-muted-foreground">
          <span className="font-data tabular-nums text-foreground">{filtered.length}</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="font-data tabular-nums">{tickers.length}</span> 标的
        </span>
        <span className="text-sm font-medium leading-snug text-muted-foreground">
          按提及频次
        </span>
      </div>

      {/* List */}
      <ul
        role="listbox"
        className="-mr-1 mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <li className="rounded-md border border-dashed border-border/50 px-3 py-6 text-center text-sm text-muted-foreground">
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
                  className={`group/row relative block w-full overflow-hidden rounded-md border px-3 py-3 text-left transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                    active
                      ? 'border-primary/40 bg-primary/[0.075] shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                      : 'border-border/30 bg-transparent hover:border-border/60 hover:bg-muted/40'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-full transition-opacity ${
                      active ? 'bg-primary opacity-100' : 'bg-primary opacity-0 group-hover/row:opacity-30'
                    }`}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span
                        className={`font-data text-sm font-semibold tabular-nums ${
                          active ? 'text-primary' : 'text-foreground'
                        }`}
                      >
                        ${t.ticker}
                      </span>
                      {t.region && t.region !== 'US' ? (
                        <span className="font-data rounded-sm border border-border/50 px-1 py-0 text-micro tracking-wide text-muted-foreground">
                          {t.region}
                        </span>
                      ) : null}
                      {active ? (
                        <span className="rounded-sm border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          当前
                        </span>
                      ) : null}
                    </span>
                    <PriceMini ticker={t.ticker} price={t.price} change={t.daily_change} />
                  </div>
                  {/* Thesis 1-line — matches chain mini card for visual consistency */}
                  {t.summary?.thesis ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {t.summary.thesis}
                    </p>
                  ) : null}
                  {/* Mention bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${
                          active ? 'bg-primary' : 'bg-primary/50 group-hover/row:bg-primary/70'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-data text-xs font-medium tabular-nums text-muted-foreground">
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

function PriceMini({ ticker, price, change }: { ticker: string; price: number | null; change: number | null }) {
  if (price == null) {
    return (
      <span className="text-sm font-medium text-muted-foreground">
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
    <span className={`flex items-center gap-1 font-data text-xs font-medium tabular-nums ${color}`}>
      {formatStockPrice(price, ticker, undefined, { compactPrice: true })}
      {hasChange && ChangeIcon ? (
        <span className="inline-flex items-center gap-0.5 transition-transform duration-200 group-hover/row:-translate-y-px">
          <ChangeIcon className="h-2.5 w-2.5" />
          {Math.abs(change!).toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}
