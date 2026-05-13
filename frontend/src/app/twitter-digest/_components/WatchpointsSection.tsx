/**
 * V4.2 短期未来注意点 — replaces "明日观察".
 *
 * Each watchpoint is a mini-card aggregating multi-KOL signal:
 *   - Title (concrete event with subject)
 *   - Date hint (when it lands — chip on the right)
 *   - Why it matters (60-150 字 explaining stakes + key debate)
 *   - Related ticker chips
 *   - KOL count (transparency)
 *
 * Designed to be the editorial "what to watch this week" — denser than
 * a one-liner list, more skimmable than a deep thesis.
 */

import { safeUserUrl, safeTweetUrl } from './safeUrl';
import type { Argument, WatchpointItem } from './types';

interface Props {
  watchpoints: WatchpointItem[];
}

export function WatchpointsSection({ watchpoints }: Props) {
  if (watchpoints.length === 0) return null;

  return (
    <section
      className="space-y-4"
      id="watchpoints"
      aria-label="短期未来的注意点"
    >
      <div className="flex items-baseline gap-3 px-2">
        <h2 className="text-base md:text-lg font-medium text-foreground tracking-tight flex items-center gap-2">
          <span aria-hidden>🗓️</span>
          <span>短期关注事件</span>
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-data text-foreground/70">{watchpoints.length}</span> 个事件
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground/65 italic hidden md:inline">
          KOL 圈在等什么
        </span>
      </div>

      <div className="space-y-4">
        {watchpoints.map((w, i) => (
          <Card key={`${w.title}-${i}`} item={w} index={i} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Card({ item, index }: { item: WatchpointItem; index: number }) {
  return (
    <article
      className="rounded-xl border border-border/55 bg-card/30 p-5 md:p-6 animate-fade-in-up"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-baseline gap-3 min-w-0 flex-1">
          <span
            aria-hidden
            className="font-data text-[10px] tabular-nums text-muted-foreground/55 mt-1"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className="font-editorial text-base md:text-lg text-foreground/95 leading-snug">
            {item.title}
          </h3>
        </div>
        {item.date_hint && (
          <DateChip text={item.date_hint} />
        )}
      </header>

      <p className="mt-4 text-[14.5px] leading-[1.85] text-foreground/85 font-editorial">
        {item.why_it_matters_zh}
      </p>

      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground/80">
        {item.related_tickers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/60 uppercase tracking-[0.2em] mr-1">
              涉及
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {item.related_tickers.slice(0, 6).map((tk) => (
                <li key={tk}>
                  <a
                    href={`#ticker-${tk}`}
                    className="inline-flex items-baseline gap-0.5 font-data text-[12px] hover:text-primary transition-colors"
                  >
                    <span className="text-primary/65">$</span>
                    <span className="text-foreground/90">{tk}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {item.kols_watching.length > 0 && (
          <span className="ml-auto font-data tabular-nums">
            <span className="text-foreground/80">{item.kols_watching.length}</span>{' '}
            <span className="text-muted-foreground/60">KOL 在关注</span>
          </span>
        )}
      </footer>

      {item.evidence && item.evidence.length > 0 && (
        <details className="mt-4 group">
          <summary className="list-none cursor-pointer flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground/75 hover:text-primary transition-colors py-1.5 select-none border-t border-border/40 pt-4">
            <svg
              aria-hidden
              className="w-3 h-3 transition-transform duration-200 group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="group-open:hidden">展开 KOL 原推</span>
            <span className="hidden group-open:inline">收起</span>
            <span className="font-data tabular-nums text-muted-foreground/55 normal-case">
              ({item.evidence.length})
            </span>
          </summary>
          <ul className="mt-4 space-y-2.5">
            {item.evidence.map((arg, i) => (
              <EvidenceRow key={i} arg={arg} />
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function EvidenceRow({ arg }: { arg: Argument }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed group/row">
      <span aria-hidden className="shrink-0 mt-2 text-muted-foreground/45">·</span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground/85 font-editorial">{arg.point_zh}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/75">
          <a
            href={safeUserUrl(arg.kol)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-data text-muted-foreground/85 hover:text-primary transition-colors"
          >
            @{arg.kol}
          </a>
          <span aria-hidden className="text-muted-foreground/35">·</span>
          <a
            href={safeTweetUrl(arg.tweet_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/65 hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            原推
            <svg
              aria-hidden
              className="w-3 h-3 opacity-70 group-hover/row:opacity-100 transition-opacity"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>
    </li>
  );
}

function DateChip({ text }: { text: string }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-[11px] font-data tabular-nums">
      <svg
        aria-hidden
        className="w-3 h-3 text-primary/75"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="text-primary/95">{text}</span>
    </span>
  );
}
