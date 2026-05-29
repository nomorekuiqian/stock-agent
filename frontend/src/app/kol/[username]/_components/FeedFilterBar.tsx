'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

import type { KolSectorV3Summary } from '@/lib/api';

export interface FeedFilterValue {
  sector: string | null;
  ticker: string | null;
}

interface Props {
  value: FeedFilterValue;
  onChange: (v: FeedFilterValue) => void;
  /** v3 sectors driving the chip list (4 sector + 1 macro). */
  sectors?: KolSectorV3Summary[];
  resultCount?: number | null;
}

/**
 * Horizontal filter bar — "全部" + one chip per v3 sector on the left,
 * ticker search on the right.
 */
export default function FeedFilterBar({ value, onChange, sectors, resultCount }: Props) {
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
          <SectorChip
            label="全部"
            active={value.sector === null}
            onClick={() => onChange({ ...value, sector: null })}
          />
          {(sectors ?? []).map((s) => (
            <SectorChip
              key={s.key}
              label={s.label}
              active={value.sector === s.key}
              onClick={() => onChange({ ...value, sector: s.key })}
            />
          ))}
        </div>

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

function SectorChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium tracking-tight transition ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
