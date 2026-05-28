'use client';

import type { KolSectorV3Summary } from '@/lib/api';

interface Props {
  sectors: KolSectorV3Summary[];
  selected: string | null;
  onSelect: (key: string) => void;
}

/**
 * Left rail — list of v3 sectors with mention counts + ticker counts.
 * Macro is rendered separately below a divider since it's not a "sector"
 * in the traditional sense (different framework layer in v3).
 */
export default function SectorListV3({ sectors, selected, onSelect }: Props) {
  const sectorOnly = sectors.filter((s) => s.layer === 'sector');
  const macro = sectors.filter((s) => s.layer === 'macro');
  const maxCount = Math.max(1, ...sectorOnly.map((s) => s.tweet_count));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {sectorOnly.length} 个板块
        </span>
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          按推文量
        </span>
      </div>

      <ul role="listbox" className="-mr-1 mt-3 flex-1 overflow-y-auto pr-1">
        {sectorOnly.map((s) => (
          <SectorRow
            key={s.key}
            sector={s}
            active={selected === s.key}
            maxCount={maxCount}
            onSelect={() => onSelect(s.key)}
          />
        ))}

        {macro.length > 0 ? (
          <>
            <li aria-hidden className="my-3 px-3">
              <hr className="editorial-rule" />
              <p className="mt-2 font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                单独一层 · 不属于板块
              </p>
            </li>
            {macro.map((s) => (
              <SectorRow
                key={s.key}
                sector={s}
                active={selected === s.key}
                maxCount={1}
                onSelect={() => onSelect(s.key)}
                hideBar
              />
            ))}
          </>
        ) : null}
      </ul>
    </div>
  );
}

interface RowProps {
  sector: KolSectorV3Summary;
  active: boolean;
  maxCount: number;
  onSelect: () => void;
  hideBar?: boolean;
}

function SectorRow({ sector, active, maxCount, onSelect, hideBar }: RowProps) {
  const widthPct = hideBar ? 0 : Math.max(4, Math.round((sector.tweet_count / maxCount) * 100));
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onSelect}
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
            className={`truncate text-sm font-medium tracking-tight ${
              active ? 'text-primary' : 'text-foreground'
            }`}
          >
            {sector.label}
          </span>
          <span className="shrink-0 font-data text-[11px] tabular-nums text-muted-foreground">
            {sector.tweet_count > 0 ? sector.tweet_count : '——'}
          </span>
        </div>
        {!hideBar ? (
          <div className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full transition-all ${
                active ? 'bg-primary' : 'bg-primary/50 group-hover/row:bg-primary/70'
              }`}
              style={{ width: `${widthPct}%` }}
            />
          </div>
        ) : null}
        <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">
          {sector.short || ''}
        </p>
        {sector.ticker_count > 0 ? (
          <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {sector.ticker_count} 个标的
          </p>
        ) : null}
      </button>
    </li>
  );
}
