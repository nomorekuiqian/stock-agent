'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageCircle, FileText } from 'lucide-react';

import type { KolCockpitTweet } from '@/lib/api';
import { relativeTimeCN } from './relativeTime';

interface Props {
  /** The rule body — the plain text the user sees as the primary content. */
  text: string;
  /** Up to N relevant tweets pulled by keyword overlap, may be empty. */
  evidence?: KolCockpitTweet[];
  /** Question template for the chat CTA. The rule text is appended. */
  askPrefix: string;
  /** Persona username for chat deep-link. */
  username: string;
  /** Visual variant — controls colors only. */
  variant?: 'default' | 'destructive' | 'primary';
  /** Optional decoration on the left (number badge, icon, etc). */
  leftAdorn?: ReactNode;
}

/**
 * A framework rule that can be expanded inline to show supporting tweets,
 * plus a "问问他" action that jumps to /research with prefilled context.
 *
 * Used by every list section of the sector detail panel (questions,
 * signals, decision card items, misreadings).
 */
export default function ExpandableRule({
  text,
  evidence = [],
  askPrefix,
  username,
  variant = 'default',
  leftAdorn,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasEvidence = evidence.length > 0;
  const chatHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&q=${encodeURIComponent(`${askPrefix}「${text}」`)}`;

  const tone = {
    default: 'hover:bg-muted/40',
    destructive: '',
    primary: '',
  }[variant];

  return (
    <div className={`group/rule rounded-md transition ${tone}`}>
      <div className="flex items-start gap-2 px-1 py-1.5">
        {leftAdorn ? <span className="mt-0.5 shrink-0">{leftAdorn}</span> : null}

        {/* Rule body — clickable when there's evidence to expand */}
        {hasEvidence ? (
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            className="flex flex-1 items-start gap-2 text-left"
            aria-expanded={open}
          >
            <span className="flex-1 text-[13px] leading-relaxed text-foreground/90">
              {text}
            </span>
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm border border-border/60 px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wider text-muted-foreground transition group-hover/rule:border-primary/40 group-hover/rule:text-primary">
              <FileText className="h-3 w-3" />
              {evidence.length} 条证据
              <ChevronDown
                className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </span>
          </button>
        ) : (
          <span className="flex-1 text-[13px] leading-relaxed text-foreground/90">
            {text}
          </span>
        )}

        {/* Discuss CTA — always present */}
        <Link
          href={chatHref}
          title="跟他追问这一条"
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm border border-border/60 px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition group-hover/rule:opacity-100 hover:border-primary/40 hover:text-primary"
        >
          <MessageCircle className="h-3 w-3" />
          问问他
        </Link>
      </div>

      {/* Inline evidence reveal */}
      {open && hasEvidence ? (
        <div className="mt-1 ml-6 space-y-2 border-l border-border/40 pl-3 pb-2">
          {evidence.map((tweet) => (
            <EvidenceTweet key={tweet.id} tweet={tweet} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceTweet({ tweet }: { tweet: KolCockpitTweet }) {
  const [more, setMore] = useState(false);
  const long = tweet.text.length > 180;
  const visible = more || !long ? tweet.text : tweet.text.slice(0, 180).trimEnd();
  return (
    <article className="rounded-md bg-card/40 px-3 py-2.5">
      <div className="flex items-center gap-2 font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <time dateTime={tweet.created_at ?? undefined}>
          {relativeTimeCN(tweet.created_at)}
        </time>
        <span>♥ {tweet.like_count}</span>
        {tweet.url ? (
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-0.5 text-muted-foreground transition hover:text-primary"
          >
            原文 ↗
          </a>
        ) : null}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
        {visible}
        {long && !more ? (
          <>
            {'… '}
            <button
              type="button"
              onClick={() => setMore(true)}
              className="font-data text-[11px] uppercase tracking-wider text-primary hover:underline"
            >
              展开
            </button>
          </>
        ) : null}
      </p>
    </article>
  );
}
