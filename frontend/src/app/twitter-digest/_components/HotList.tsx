/**
 * V3.1 Hot List — frequency tally of sectors / tickers / events across the
 * day's kept (high+medium quality) candidate tweets.
 *
 * Backend computes the counts (see `service._compute_hot_lists`). This is the
 * "what is being discussed most" navigation strip — placed near the top so
 * readers can scan attention flow before diving into topic cards.
 */

import type { HotItem } from './types';

interface Props {
  sectors: HotItem[];
  tickers: HotItem[];
  events: HotItem[];
}

interface ColumnProps {
  title: string;
  items: HotItem[];
  renderLabel: (label: string) => React.ReactNode;
}

function Column({ title, items, renderLabel }: ColumnProps) {
  if (items.length === 0) return null;
  // Scale bars relative to the max count in THIS column. Min 2px so even a
  // single mention shows a hint of length; max 56px so long bars do not push
  // the count off-screen on narrow viewports.
  const maxCount = Math.max(...items.map((it) => it.count), 1);

  return (
    <div className="space-y-2 min-w-0">
      <h3 className="text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const widthPx = Math.max(2, Math.round((it.count / maxCount) * 56));
          return (
            <li
              key={it.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="truncate text-foreground/90">{renderLabel(it.label)}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span
                  aria-hidden
                  className="inline-block h-1.5 rounded-sm bg-primary/30"
                  style={{ width: `${widthPx}px` }}
                />
                <span
                  className="font-data tabular-nums text-xs text-muted-foreground/85 w-6 text-right"
                  aria-label={`${it.count} 次提及`}
                >
                  {it.count}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HotList({ sectors, tickers, events: _events }: Props) {
  // V3.3: events column dropped — near-duplicate labels ("Q1 财报" / "Q1财报"
  // / "财报") made it noisy. Prop kept for backward compat with the data
  // model; the column is just not rendered.
  if (sectors.length === 0 && tickers.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-border/60 bg-card/30 p-5 md:p-6 animate-fade-in-up"
      aria-label="今日热议"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground/95">今日热议</h2>
        <span className="text-xs text-muted-foreground/80">
          按 high+medium 推文 ticker / sector 标签计数
        </span>
      </div>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Column
          title="赛道"
          items={sectors}
          renderLabel={(label) => label}
        />
        <Column
          title="个股"
          items={tickers}
          renderLabel={(label) => (
            <a
              href={`/stock/${label.replace(/^\$/, '')}`}
              className="inline-flex items-baseline gap-0.5 font-data text-foreground/90 hover:text-primary transition-colors"
            >
              <span className="text-primary/65">$</span>
              <span>{label.replace(/^\$/, '')}</span>
            </a>
          )}
        />
      </div>
    </section>
  );
}
