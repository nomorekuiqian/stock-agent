'use client';

import { useState } from 'react';

import type { CuratedTweet } from './types';

type GroupBy = 'none' | 'sector' | 'ticker';

interface Props {
  tweet: CuratedTweet;
  /** When the parent section dropped sub-headers (all singletons),
   *  the card surfaces its sector/ticker inline so context is not lost. */
  groupBy?: GroupBy;
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const mins = Math.floor((now - then) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  } catch {
    return iso;
  }
}

function formatCompactNumber(n: number | undefined): string {
  if (!n || n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Only label tweet types that carry real signal (multi-tweet thread, long-form article).
// "quote" is too common and untranslated → noise.
const TYPE_LABEL: Record<string, string> = {
  thread: 'Thread',
  article: 'Article',
};

export function CuratedTweetCard({ tweet, groupBy }: Props) {
  const typeBadge = TYPE_LABEL[tweet.tweet_type];
  const hasEnglish = tweet.text_en && tweet.text_en.trim() !== '';
  const totalLen = (tweet.text_zh?.length ?? 0) + (hasEnglish ? tweet.text_en.length : 0);
  const hasOriginal = totalLen > 0;
  const [expanded, setExpanded] = useState(false);

  const tldr = (tweet.tldr_zh ?? '').trim();
  // Treat depth='flash' (or absent TLDR on older digests) as the compact form.
  const isFlash = tweet.depth === 'flash' || (!tweet.depth && !tldr);

  // Surface group label inline when the parent section dropped sub-headers.
  const inlineTicker = groupBy === 'ticker' ? (tweet.primary_ticker ?? '').trim() : '';
  const inlineSector = groupBy === 'sector' ? (tweet.sector ?? '').trim() : '';

  if (isFlash) {
    return <FlashCard tweet={tweet} inlineTicker={inlineTicker} inlineSector={inlineSector} />;
  }

  const hasChips = !!(inlineTicker || inlineSector || typeBadge);

  return (
    <article className="space-y-3">
      {/* Headline — chips render only when at least one carries signal */}
      <div className="space-y-2">
        {hasChips && (
          <div className="flex items-center gap-2 flex-wrap">
            {inlineTicker && (
              <a
                href={`/stock/${inlineTicker}`}
                className="inline-flex items-baseline gap-0.5 px-1.5 py-0.5 rounded text-xs font-data font-medium text-foreground/85 bg-muted/40 border border-border/50 hover:text-primary hover:border-primary/40 transition-colors"
              >
                <span className="text-primary/65">$</span>
                <span>{inlineTicker}</span>
              </a>
            )}
            {inlineSector && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-foreground/75 bg-muted/40 border border-border/50">
                #{inlineSector}
              </span>
            )}
            {typeBadge && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tracking-wider uppercase bg-muted/50 text-muted-foreground border border-border/40">
                {typeBadge}
              </span>
            )}
          </div>
        )}
        <p className="text-base md:text-lg leading-snug text-foreground font-medium">
          {tweet.interpretation_zh}
        </p>
      </div>

      {/* TLDR */}
      {tldr && (
        <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
          {tldr}
        </p>
      )}

      {/* Original — collapsed by default; user opts in */}
      {hasOriginal && (
        <div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="cursor-pointer text-xs text-muted-foreground/80 hover:text-primary transition-colors"
            >
              ▸ 原文 · <span className="font-data tabular-nums">{totalLen}</span> 字
            </button>
          )}
          {expanded && (
            <div className="space-y-2 pl-3 border-l-2 border-border/50">
              {hasEnglish && (
                <blockquote className="text-sm leading-relaxed italic text-foreground/65">
                  {tweet.text_en}
                </blockquote>
              )}
              <blockquote className="text-sm leading-relaxed text-foreground/75 whitespace-pre-line">
                {tweet.text_zh}
              </blockquote>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="cursor-pointer text-xs text-muted-foreground/80 hover:text-primary transition-colors"
              >
                ▴ 收起原文
              </button>
            </div>
          )}
        </div>
      )}

      {/* Byline — stable two-cluster layout */}
      <footer className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 text-xs text-muted-foreground pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
          <span className="text-foreground/85 font-medium">{tweet.display_name}</span>
          <a
            href={`https://x.com/${tweet.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/80 hover:text-primary transition-colors"
          >
            @{tweet.username}
          </a>
          <span className="text-muted-foreground/70" aria-hidden>·</span>
          <span className="font-data tabular-nums whitespace-nowrap">
            {formatRelativeTime(tweet.created_at)}
          </span>
          <span className="text-muted-foreground/70" aria-hidden>·</span>
          <span className="font-data tabular-nums text-muted-foreground/80 whitespace-nowrap">
            ♥ {formatCompactNumber(tweet.like_count)}
            <span className="mx-1.5 text-muted-foreground/70">·</span>
            ↻ {formatCompactNumber(tweet.retweet_count)}
          </span>
        </div>

        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-primary transition-colors whitespace-nowrap"
        >
          原推
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// FlashCard — compact one-line form for depth='flash' picks.
// Headline + tight byline, no TLDR / no original-text expander. Reader can
// always click through to the source tweet. Visual density is intentionally
// lighter than deep cards so a section can mix many flashes with a few deeps.
// ---------------------------------------------------------------------------

function FlashCard({
  tweet, inlineTicker, inlineSector,
}: {
  tweet: CuratedTweet;
  inlineTicker: string;
  inlineSector: string;
}) {
  return (
    <article className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
        {inlineTicker && (
          <a
            href={`/stock/${inlineTicker}`}
            className="inline-flex items-baseline gap-0.5 text-xs font-data font-medium text-foreground/85 hover:text-primary transition-colors whitespace-nowrap"
          >
            <span className="text-primary/65">$</span>
            <span>{inlineTicker}</span>
          </a>
        )}
        {inlineSector && (
          <span className="text-xs font-medium text-foreground/75 whitespace-nowrap">
            #{inlineSector}
          </span>
        )}
        <p className="text-sm md:text-[0.95rem] leading-snug text-foreground/95">
          {tweet.interpretation_zh}
        </p>
      </div>
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
        <a
          href={`https://x.com/${tweet.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          @{tweet.username}
        </a>
        <span aria-hidden className="text-muted-foreground/60">·</span>
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
          title="查看原推"
        >
          原推 ↗
        </a>
      </div>
    </article>
  );
}
