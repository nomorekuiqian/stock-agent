'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

export interface FeedFilterValue {
  sector: string | null;
  ticker: string | null;
}

interface Props {
  value: FeedFilterValue;
  onChange: (v: FeedFilterValue) => void;
  hotTickers?: string[];
  resultCount?: number | null;
}

const SECTOR_CHIPS: Array<{ label: string; value: string | null }> = [
  { label: '全部', value: null },
  { label: 'AI 算力', value: 'ai' },
  { label: '加密', value: 'crypto' },
  { label: '宏观', value: 'macro' },
];

/**
 * Horizontal filter bar — sector chips on left, ticker search on right,
 * optional hot-ticker chips below. Sticky-aware via parent.
 */
export default function FeedFilterBar({ value, onChange, hotTickers, resultCount }: Props) {
  const [tickerInput, setTickerInput] = useState(value.ticker ?? '');

  function applyTicker(raw: string) {
    const cleaned = raw.trim().replace(/^\$/, '').toUpperCase();
    onChange({ ...value, ticker: cleaned || null });
  }

  function reset() {
    setTickerInput('');
    onChange({ sector: null, ticker: null });
  }

  const hasFilter = value.sector !== null || value.ticker !== null;

  return (
    <div className="border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:gap-4 md:py-4">
        {/* Sector chips */}
        <div
          role="tablist"
          aria-label="板块筛选"
          className="-mx-1 flex shrink-0 items-center gap-1 overflow-x-auto px-1 md:overflow-visible"
        >
          {SECTOR_CHIPS.map((c) => {
            const active = value.sector === c.value;
            return (
              <button
                key={c.label}
                role="tab"
                aria-selected={active}
                onClick={() => onChange({ ...value, sector: c.value })}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium tracking-tight transition ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Hot ticker chips */}
        {hotTickers && hotTickers.length > 0 ? (
          <div className="hidden items-center gap-1 lg:flex">
            <span className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
              热门
            </span>
            {hotTickers.slice(0, 6).map((tk) => {
              const active = value.ticker === tk;
              return (
                <button
                  key={tk}
                  onClick={() => {
                    setTickerInput(tk);
                    onChange({ sector: null, ticker: tk });
                  }}
                  className={`rounded-sm px-2 py-1 font-data text-[11px] font-medium tracking-wider transition ${
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  ${tk}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Spacer + search */}
        <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
          <label className="flex flex-1 items-center gap-2 rounded-md border border-border/60 bg-input/30 px-2.5 py-1.5 transition focus-within:border-primary/40 md:w-56 md:flex-none">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyTicker(tickerInput);
                if (e.key === 'Escape') {
                  setTickerInput('');
                  applyTicker('');
                }
              }}
              onBlur={() => applyTicker(tickerInput)}
              placeholder="搜 $TICKER"
              className="w-full bg-transparent font-data text-xs uppercase tracking-wider text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </label>
          {hasFilter ? (
            <button
              onClick={reset}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
              title="清除筛选"
            >
              <X className="h-3 w-3" />
              清除
            </button>
          ) : null}
        </div>

        {/* Result count chip */}
        {typeof resultCount === 'number' ? (
          <div className="hidden shrink-0 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground md:block">
            {resultCount.toLocaleString()} 条
          </div>
        ) : null}
      </div>
    </div>
  );
}
