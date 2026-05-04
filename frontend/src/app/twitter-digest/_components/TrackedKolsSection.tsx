'use client';

import { useState } from 'react';

interface Props {
  kols: string[];
  inputTweetCount: number;
}

export function TrackedKolsSection({ kols, inputTweetCount }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-xl border border-border/60 bg-card/30 overflow-hidden animate-fade-in-up">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer w-full flex items-center justify-between gap-3 px-5 md:px-6 py-4 hover:bg-card/50 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="block w-1 h-4 rounded-sm bg-muted-foreground/40" aria-hidden />
          <span className="text-sm font-medium text-foreground">
            本日报追踪 <span className="font-data tabular-nums">{kols.length}</span> 位博主
          </span>
          <span className="text-xs text-muted-foreground">
            · 输入 <span className="font-data tabular-nums">{inputTweetCount}</span> 条推文
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 md:px-6 pb-5 md:pb-6 pt-1 border-t border-border/40">
          <div className="flex flex-wrap gap-2 mt-4">
            {kols.map((u) => (
              <a
                key={u}
                href={`https://x.com/${u}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2 py-1 rounded-md bg-muted/40 border border-border/40 text-xs text-foreground/80 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
              >
                @{u}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
