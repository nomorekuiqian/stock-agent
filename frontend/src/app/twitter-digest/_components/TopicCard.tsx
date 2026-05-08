'use client';

import { useState } from 'react';

import { safeTweetUrl, safeUserUrl } from './safeUrl';
import type { ArgStance, KeyArgument, Topic } from './types';

interface Props {
  topic: Topic;
  index: number;     // anchor target #topic-N
}

const STANCE_LABEL: Record<ArgStance, string> = {
  bullish: '看多',
  bearish: '看空',
  neutral: '谨慎',
};

const STANCE_COLOR: Record<ArgStance, string> = {
  bullish: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-800/40',
  bearish: 'text-rose-700 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-900/20 border-rose-200/60 dark:border-rose-800/40',
  neutral: 'text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-800/40',
};

export function TopicCard({ topic, index }: Props) {
  const [argsExpanded, setArgsExpanded] = useState(false);
  const visibleArgs = argsExpanded ? topic.key_arguments : topic.key_arguments.slice(0, 2);
  const hiddenCount = Math.max(topic.key_arguments.length - 2, 0);

  return (
    <article
      id={`topic-${index}`}
      className="scroll-mt-20 rounded-lg border border-border/60 bg-card/40 p-5 md:p-6 space-y-4"
    >
      {/* Title row */}
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="font-editorial text-lg md:text-xl text-foreground tracking-tight">
            {topic.title}
          </h3>
          {topic.stance_distribution && (
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {topic.stance_distribution}
            </span>
          )}
        </div>
        {(topic.primary_ticker || topic.sector || topic.event) && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {topic.primary_ticker && (
              <a
                href={`/stock/${topic.primary_ticker}`}
                className="inline-flex items-baseline gap-0.5 px-1.5 py-0.5 rounded font-data font-medium text-foreground/80 bg-muted/40 border border-border/50 hover:text-primary hover:border-primary/40 transition-colors"
              >
                <span className="text-primary/65">$</span>
                <span>{topic.primary_ticker}</span>
              </a>
            )}
            {topic.sector && (
              <span className="px-1.5 py-0.5 rounded text-foreground/70 bg-muted/40 border border-border/50">
                #{topic.sector}
              </span>
            )}
            {topic.event && (
              <span className="px-1.5 py-0.5 rounded italic text-muted-foreground/85 border border-border/50">
                {topic.event}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Synthesis */}
      <p className="text-sm md:text-[0.95rem] leading-relaxed text-foreground/90 whitespace-pre-line">
        {topic.synthesis_zh}
      </p>

      {/* Key arguments */}
      {topic.key_arguments.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
            关键论据
          </div>
          <ul className="space-y-2.5">
            {visibleArgs.map((arg) => (
              <ArgumentRow key={arg.tweet_id} arg={arg} />
            ))}
          </ul>
          {!argsExpanded && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setArgsExpanded(true)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              展开 {hiddenCount} 条论据
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ArgumentRow({ arg }: { arg: KeyArgument }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap shrink-0 mt-0.5 ' +
          STANCE_COLOR[arg.stance]
        }
      >
        {STANCE_LABEL[arg.stance]}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm leading-snug text-foreground/85">{arg.tldr_zh}</p>
        <p className="text-xs text-muted-foreground flex items-baseline gap-2 flex-wrap">
          <a
            href={safeUserUrl(arg.username)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            @{arg.username}
          </a>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <a
            href={safeTweetUrl(arg.tweet_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors whitespace-nowrap"
          >
            原推 ↗
          </a>
        </p>
      </div>
    </li>
  );
}
