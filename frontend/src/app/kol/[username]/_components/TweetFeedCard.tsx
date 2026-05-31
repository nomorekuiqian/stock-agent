'use client';

import { useState } from 'react';
import { Heart, Repeat2, MessageSquare, ArrowUpRight, GitBranch } from 'lucide-react';

import type { KolCockpitFeedItem } from '@/lib/api';
import { relativeTimeCN, absoluteTimeCN } from './relativeTime';

interface Props {
  item: KolCockpitFeedItem;
  /** Optional sequential delay for stagger animation on initial render. */
  staggerMs?: number;
}

/** X (formerly Twitter) brand glyph. Lucide has no official X logo. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2H21.5l-7.5 8.572L23 22h-6.828l-5.348-6.99L4.7 22H1.44l8.02-9.17L1 2h6.984l4.836 6.4L18.244 2zm-1.196 18h1.886L7.04 4h-2.02l12.028 16z" />
    </svg>
  );
}

const LONG_TEXT_THRESHOLD = 280;

/**
 * Feed item — hairline left rule (turns emerald on hover), generous whitespace,
 * raw tweet text preserved with linkified @mentions / URLs / cashtags.
 * No card chrome — feels like a feed, not a card grid.
 */
export default function TweetFeedCard({ item, staggerMs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > LONG_TEXT_THRESHOLD;
  const visibleText = expanded || !long ? item.text : item.text.slice(0, LONG_TEXT_THRESHOLD).trimEnd();
  const relative = relativeTimeCN(item.created_at);
  const absolute = absoluteTimeCN(item.created_at);
  // After the default reply-to-others filter, the only replies that reach the UI
  // are self-thread continuations (reply_kind === 'self'). Label them as 「线程」.
  const isThread = item.reply_kind === 'self';
  const isQuote = item.tweet_type === 'quote';

  const style = staggerMs != null ? { animationDelay: `${staggerMs}ms` } : undefined;

  return (
    <article
      className="editorial-item animate-fade-in-up py-5 md:py-6"
      style={style}
    >
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <time
          className="font-data text-muted-foreground tabular-nums"
          dateTime={item.created_at ?? undefined}
          title={absolute}
        >
          {relative || '时间未知'}
        </time>
        {isThread ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            线程
          </span>
        ) : null}
        {isQuote ? (
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            引用
          </span>
        ) : null}
        {item.sectors.slice(0, 2).map((s) => (
          <span
            key={s}
            className="rounded-sm border border-border/60 px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            {s}
          </span>
        ))}
        {item.tickers.slice(0, 4).map((tk) => (
          <span
            key={tk}
            className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-data text-xs font-medium tracking-wider text-primary"
          >
            ${tk}
          </span>
        ))}
        {item.tickers.length > 4 ? (
          <span className="font-data text-xs text-muted-foreground">
            +{item.tickers.length - 4}
          </span>
        ) : null}
      </div>

      {/* Raw text — verbatim, whitespace preserved */}
      <div className="mt-2.5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground md:text-base">
          <LinkifiedText text={visibleText} />
          {long && !expanded ? (
            <>
              {'… '}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="ml-1 inline-flex min-h-7 items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                展开
              </button>
            </>
          ) : null}
        </p>
      </div>

      {/* Footer: engagement + actions */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-data text-xs text-muted-foreground">
        <Counter icon={<Heart className="h-3.5 w-3.5" />} value={item.like_count} />
        <Counter icon={<Repeat2 className="h-3.5 w-3.5" />} value={item.retweet_count} />
        <Counter icon={<MessageSquare className="h-3.5 w-3.5" />} value={item.reply_count} />
        <span className="ml-auto inline-flex items-center gap-3">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <XLogo className="h-3 w-3" />
              原文
              <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function Counter({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {icon}
      {formatCount(value)}
    </span>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n / 1000)}k`;
}

/**
 * Plain-text linkifier — extracts URLs, @mentions, $TICKER cashtags.
 * No markdown processing. Order matters: URLs first (greedy), then mentions.
 */
function LinkifiedText({ text }: { text: string }) {
  const parts: Array<{ kind: 'text' | 'link' | 'mention' | 'cashtag'; value: string; href?: string }> = [];
  // Combined regex; alternation order matches detection priority.
  const re = /(https?:\/\/[^\s]+)|(@[A-Za-z0-9_]+)|(\$[A-Z]{1,5}\b)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ kind: 'text', value: text.slice(lastIdx, match.index) });
    }
    if (match[1]) {
      parts.push({ kind: 'link', value: match[1], href: match[1] });
    } else if (match[2]) {
      parts.push({
        kind: 'mention',
        value: match[2],
        href: `https://x.com/${match[2].slice(1)}`,
      });
    } else if (match[3]) {
      parts.push({ kind: 'cashtag', value: match[3] });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIdx) });
  }
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>;
        if (p.kind === 'cashtag') {
          return (
            <span key={i} className="font-medium text-primary">
              {p.value}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary/85 underline-offset-2 hover:text-primary hover:underline"
          >
            {p.value}
          </a>
        );
      })}
    </>
  );
}
