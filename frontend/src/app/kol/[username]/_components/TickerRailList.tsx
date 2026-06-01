'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import type { KolCockpitTickerSummary } from '@/lib/api';

interface Props {
  tickers: KolCockpitTickerSummary[];
  value: string | null;
  onChange: (ticker: string | null) => void;
}

/**
 * Compact ticker filter for the left rail (under the topic tree). Matches
 * `TopicTree` row visuals: h-8 buttons, label-only, active = primary tint.
 * No price, no mention count — pure filter list.
 */
export default function TickerRailList({ tickers, value, onChange }: Props) {
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

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜 NVDA / 英伟达"
          className="h-8 w-full rounded border border-border/50 bg-input/30 py-1.5 pl-7 pr-7 text-sm text-foreground placeholder:text-muted-foreground/70 transition focus:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空搜索"
            className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground transition hover:bg-card/40 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div
        role="listbox"
        className="-mr-1 max-h-[60vh] space-y-0.5 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
            无命中
          </p>
        ) : (
          filtered.map((t) => {
            const active = value === t.ticker;
            return (
              <button
                key={t.ticker}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(active ? null : t.ticker)}
                className={`flex h-8 w-full items-center gap-2 rounded px-2 text-sm transition ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card/40 hover:text-foreground'
                }`}
              >
                <span
                  className={`font-data tabular-nums ${
                    active ? 'font-medium' : 'font-medium'
                  }`}
                >
                  ${t.ticker}
                </span>
                {t.aliases[0] && t.aliases[0] !== t.ticker ? (
                  <span className="truncate text-xs text-muted-foreground/70">
                    {t.aliases[0]}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
