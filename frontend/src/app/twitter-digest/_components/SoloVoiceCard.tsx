/**
 * V3 SoloVoice — single-KOL deep dive.
 *
 * Triggered when one KOL writes a quality="high" thread or article that
 * nobody else discusses today. Reader-facing: this is "set aside time
 * to read" content, distinct from the topic + brief layers.
 */

import { safeTweetUrl, safeUserUrl } from './safeUrl';
import type { SoloVoice } from './types';

interface Props {
  voice: SoloVoice;
}

const TYPE_LABEL: Record<string, string> = {
  thread: 'Thread',
  article: 'Article',
};

export function SoloVoiceCard({ voice }: Props) {
  const typeBadge = TYPE_LABEL[voice.tweet_type] || voice.tweet_type;

  return (
    <article className="rounded-lg border border-border/60 bg-card/40 p-5 md:p-6 space-y-3">
      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {typeBadge && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium tracking-wider uppercase bg-muted/50 text-muted-foreground border border-border/40">
              {typeBadge}
            </span>
          )}
          {voice.primary_ticker && (
            <a
              href={`/stock/${voice.primary_ticker}`}
              className="inline-flex items-baseline gap-0.5 px-1.5 py-0.5 rounded font-data font-medium text-foreground/80 bg-muted/40 border border-border/50 hover:text-primary hover:border-primary/40 transition-colors"
            >
              <span className="text-primary/65">$</span>
              <span>{voice.primary_ticker}</span>
            </a>
          )}
        </div>
        <h3 className="font-editorial text-lg md:text-xl text-foreground tracking-tight leading-tight">
          {voice.title}
        </h3>
      </header>

      <p className="text-sm md:text-[0.95rem] leading-relaxed text-foreground/90 whitespace-pre-line">
        {voice.tldr_zh}
      </p>

      {voice.interpretation_zh && (
        <p className="text-sm leading-relaxed text-muted-foreground/90 italic border-l-2 border-primary/30 pl-3">
          {voice.interpretation_zh}
        </p>
      )}

      <footer className="flex items-baseline justify-between gap-3 pt-1 text-xs text-muted-foreground flex-wrap">
        <span>
          <span className="text-foreground/85 font-medium">{voice.display_name}</span>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          <a
            href={safeUserUrl(voice.username)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            @{voice.username}
          </a>
        </span>
        <a
          href={safeTweetUrl(voice.tweet_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        >
          查看完整 {typeBadge} ↗
        </a>
      </footer>
    </article>
  );
}
