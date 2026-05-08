/**
 * V3 Brief — single-tweet one-liner row.
 *
 * Used inside a Section panel to show "what else is being discussed" without
 * the depth of a full topic card. one_liner_zh comes from the enrichment
 * stage's content_summary_zh, not from the digest LLM.
 */

import { safeTweetUrl, safeUserUrl } from './safeUrl';
import type { Brief } from './types';

interface Props {
  brief: Brief;
}

export function BriefRow({ brief }: Props) {
  const isTicker = brief.label.startsWith('$');
  const tickerSymbol = isTicker ? brief.label.slice(1) : '';

  const whyItMatters = brief.why_it_matters_zh?.trim();

  return (
    <article className="flex items-baseline gap-3 py-2 group">
      {/* Label */}
      {isTicker ? (
        <a
          href={`/stock/${tickerSymbol}`}
          className="inline-flex items-baseline gap-0.5 text-xs font-data font-medium text-foreground/80 hover:text-primary transition-colors whitespace-nowrap shrink-0 w-20"
        >
          <span className="text-primary/65">$</span>
          <span>{tickerSymbol}</span>
        </a>
      ) : (
        <span className="text-xs font-medium text-foreground/75 whitespace-nowrap shrink-0 w-20 truncate" title={brief.label}>
          {brief.label}
        </span>
      )}

      {/* One-liner + (optional) why-it-matters */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-foreground/90">
          {brief.one_liner_zh || '(无梗概)'}
        </p>
        {whyItMatters && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground/85">
            <span aria-hidden className="text-primary/60">↳</span> {whyItMatters}
          </p>
        )}
      </div>

      {/* Source + link */}
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
        <a
          href={safeUserUrl(brief.username)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          @{brief.username}
        </a>
        <span aria-hidden className="text-muted-foreground/50">·</span>
        <a
          href={safeTweetUrl(brief.tweet_url)}
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
