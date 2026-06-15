/**
 * V4 Macro Section — non-ticker discussion (Fed / CPI / geopolitics / regulation /
 * sector-wide trends). Lighter visual weight than TickerSection because most
 * macro is `observation`-direction; the value is in synthesis + evidence.
 */

import { LockedBlur, SectionUnlockCta } from './LockedBlur';
import { safeUserUrl, safeTweetUrl } from './safeUrl';
import type { Argument, MacroThread } from './types';

interface Props {
  thread: MacroThread;
  index: number;
  /** When true, render blurred locked skeletons in place of paid content. */
  locked?: boolean;
}

export function MacroSection({ thread, index, locked = false }: Props) {
  // Array length wins when present (Max mode); count field fills in when the
  // array has been stripped (locked mode). Avoid `??` here — pydantic default
  // for `key_points_count` is 0, which would falsely override real array
  // counts on unlocked digests.
  const keyPointCount = thread.key_points.length || thread.key_points_count || 0;
  // Hide a macro thread only when it would render as a true empty card.
  // Locked mode keeps the section visible to show the title + locked content.
  if (!thread.title || (!locked && thread.key_points.length === 0 && !thread.synthesis_zh)) {
    return null;
  }

  const kolCount = thread.primary_kols.length;
  const kolSample = thread.primary_kols.slice(0, 2);

  return (
    <section
      id={`macro-${index}`}
      className="rounded-xl border border-border/50 bg-card/30 p-5 md:p-6 animate-fade-in-up scroll-mt-24"
      aria-label={thread.title}
    >
      <header className="flex items-baseline justify-between gap-3 pb-3 border-b border-border/40">
        <h3 className="font-editorial text-lg md:text-xl text-foreground/95 tracking-tight">
          <span className="mr-2 font-data text-xs tabular-nums text-muted-foreground/70">
            {String(index + 1).padStart(2, '0')}
          </span>
          {thread.title}
        </h3>
        <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-muted-foreground font-data">
          {thread.layer === 'macro' ? '宏观' : '行业'}
          {keyPointCount > 0 && (
            <>
              {' '}·{' '}
              <span className="text-foreground/80 tabular-nums">{keyPointCount}</span>{' '}
              推
            </>
          )}
          {' '}·{' '}
          <span className="text-foreground/80 tabular-nums">{kolCount}</span>{' '}
          KOL
        </span>
      </header>

      {locked ? (
        <div className="mt-4">
          <LockedBlur
            lines={3}
            label="多方观点综合"
            variant="paragraph"
            kolSample={kolSample}
          />
        </div>
      ) : (
        thread.synthesis_zh && (
          <p className="font-reading mt-4 text-sm leading-7 text-foreground/85 md:text-base md:leading-8">
            {thread.synthesis_zh}
          </p>
        )
      )}

      {locked
        ? (
            <>
              {keyPointCount > 0 && (
                <div className="mt-5">
                  <LockedBlur
                    lines={Math.min(keyPointCount, 4)}
                    label={`KOL 观点 · ${keyPointCount} 条`}
                    variant="bullets"
                    kolSample={kolSample}
                  />
                </div>
              )}
              <SectionUnlockCta />
            </>
          )
        : thread.key_points.length > 0 && (
            <details className="mt-5 group">
              <summary className="list-none cursor-pointer flex items-center gap-2 border-t border-border/40 pt-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-sky-400 select-none">
                <svg
                  aria-hidden
                  className="w-3 h-3 transition-transform duration-200 group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="group-open:hidden">展开观点</span>
                <span className="hidden group-open:inline">收起观点</span>
                <span className="font-data tabular-nums text-muted-foreground/70 normal-case">
                  ({thread.key_points.length})
                </span>
              </summary>
              <ul className="mt-4 space-y-2.5">
                {thread.key_points.map((p, i) => (
                  <KeyPointRow key={i} arg={p} />
                ))}
              </ul>
            </details>
          )}
    </section>
  );
}

function KeyPointRow({ arg }: { arg: Argument }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed group">
      <span aria-hidden className="shrink-0 mt-2 text-muted-foreground/70">·</span>
      <div className="min-w-0 flex-1">
        <p className="font-reading text-foreground/85">{arg.point_zh}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <a
            href={safeUserUrl(arg.kol)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-data text-muted-foreground/85 hover:text-sky-400 transition-colors"
          >
            @{arg.kol}
          </a>
          <span aria-hidden className="text-muted-foreground/70">·</span>
          <a
            href={safeTweetUrl(arg.tweet_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-sky-400"
          >
            原推
            <svg
              aria-hidden
              className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity"
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
