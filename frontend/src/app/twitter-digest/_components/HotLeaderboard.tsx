/**
 * Hot Leaderboard — V4 ticker-only ranking, 1:1 with TickerSections below.
 *
 * Drives directly off the digest's ticker_theses list (which is what's
 * actually rendered in the body). This guarantees: every chip in the
 * leaderboard has a corresponding section below. No more "MSFT in the bar
 * but not in the body" mismatches.
 *
 * V3 used enrichment-tag mention counts which double-counted multi-ticker
 * tweets and produced different rankings than the LLM-clustered theses.
 * V4 leaderboard is now the table of contents for the body.
 */

import type { TickerThesis } from './types';

interface Props {
  theses: TickerThesis[];
}

export function HotLeaderboard({ theses }: Props) {
  if (theses.length === 0) return null;

  // Sort by KOL count then tweet count, matching the body order.
  const sorted = [...theses].sort((a, b) => {
    if (b.primary_kols.length !== a.primary_kols.length) {
      return b.primary_kols.length - a.primary_kols.length;
    }
    return b.tweet_count - a.tweet_count;
  });

  const maxKols = Math.max(...sorted.map((t) => t.primary_kols.length), 1);

  return (
    <section
      id="hot-leaderboard"
      className="rounded-xl border border-border/60 bg-card/40 p-5 md:p-6 animate-fade-in-up scroll-mt-24"
      aria-label="今日 KOL 关注度"
    >
      <header className="mb-5 flex items-baseline justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block w-1 h-4 bg-sky-400 rounded-full" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-[0.18em]">
            今日 KOL 关注度
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground/75 uppercase tracking-wider font-data tabular-nums">
          TOP {sorted.length}
        </span>
      </header>

      <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {sorted.map((t, i) => (
          <Row key={t.ticker} rank={i + 1} thesis={t} maxKols={maxKols} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  rank, thesis, maxKols,
}: { rank: number; thesis: TickerThesis; maxKols: number }) {
  const kols = thesis.primary_kols.length;
  const widthPct = Math.max(8, Math.round((kols / maxKols) * 100));
  return (
    <li>
      <a
        href={`#ticker-${thesis.ticker}`}
        className="group flex items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-sky-400/5"
        aria-label={`跳转到 ${thesis.ticker} 综合讨论`}
      >
        <span
          aria-hidden
          className="font-data text-[10px] tabular-nums text-muted-foreground/50 w-5 text-right"
        >
          {String(rank).padStart(2, '0')}
        </span>
        <span className="inline-flex items-baseline gap-0.5 font-data shrink-0 w-20">
          <span className="text-sky-400/65">$</span>
          <span className="text-foreground/95 group-hover:text-sky-400 transition-colors">
            {thesis.ticker}
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full bg-sky-400/45 rounded-full transition-all group-hover:bg-sky-400/65"
              style={{ width: `${widthPct}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 font-data tabular-nums text-[11px] text-muted-foreground/75 w-20 text-right">
          <span className="text-foreground/80">{kols}</span>{' '}
          <span className="text-muted-foreground/60">KOL</span>
          <span className="mx-1 text-muted-foreground/35">·</span>
          <span className="text-foreground/70">{thesis.tweet_count}</span>{' '}
          <span className="text-muted-foreground/60">推</span>
        </span>
      </a>
    </li>
  );
}
